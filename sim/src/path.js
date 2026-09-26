// Генератор пути: чистая функция (рецепт + параметры + предыдущие слои) → упорядоченный список операций и
// сегментов рабочих нитей (по одной на цвет) для обходов в порядке, выведенном из замысла (roundSequence: по ряду
// A1, B1, A2 … — GT14; блоками A1…A5, B1…B5 — Suess 2014; явная последовательность).
// Шитьё последовательное: всё — E/X, уровни рядов n ≥ 2, над/под в перекрестах — выводится из того, что уже
// лежит на шаре после предыдущих операций (причинный префикс). Никаких сохранённых координат и сдвигов.
import { resolveBowLambda,  parseSequence } from './params.js';
import { t, fmtNum } from './i18n.js';
import {
  slerp, lineSeg, geodLen, dist, rotateToward, wrapPi, tangentTo, dot,
  closeZones, angle, unit, add, sub, mul, cross, segSegDist, polyLen,
  pointOnLine, offsetOnLine, alongLine, acrossLine, rotateHalfLine,
  FRAME_N, fPoint, fPerp, fSAz, fToward, fEast, fZ,
} from './geom.js';
import { resolve } from './marking.js';
import { roundBites } from './program.js';
import { Chain, arcGC, arcSmall, offsetChain, ang, arcPoint, arcEnd, arcTangent, arcLen } from './arcs.js';

/** #53 case 1: the kiku frame of the build in progress (polar coordinates about the kiku centre; geom.js frameAt).
 *  buildWork sets it from the program for the duration of the build; exported helpers called on their own see P.N. */
let FR = FRAME_N;

/** Default polyline samples per visible leg. Tools may override via setLegSamples — default layout unchanged. */
const LEG_SAMPLES_DEFAULT = 96;
let _legSamples = LEG_SAMPLES_DEFAULT;

/** Override leg sample count for diagnostics (null resets to 96). Does not change default layout. */
export function setLegSamples(n) {
  if (n == null || n === '' || (typeof n === 'number' && Number.isNaN(n))) {
    _legSamples = LEG_SAMPLES_DEFAULT;
    return _legSamples;
  }
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 2) throw new Error(`legSamples must be >= 2, got ${n}`);
  _legSamples = v;
  return _legSamples;
}
export function getLegSamples() { return _legSamples; }

/** Scale absolute-mm constants with w so ×k similarity holds (Errata 6a.11(3)). Calibrated at w0=0.714. */
const W0_MM = 0.714;
function mmAtW(mm, w) { return mm * ((w || W0_MM) / W0_MM); }


/**
 * Занятость на линии иглы у линии разметки k на уровне s. Линия иглы — большой круг через точку линии,
 * перпендикулярный ей; координата y — вдоль него (мм, + = по ходу). Занятость: своя нить разметки [−m/2, m/2],
 * соседние нити разметки (L(k±1), там, где они пересекают линию иглы), уже уложенные нити — пересечения плечами,
 * отверстия (концы плеч и скрытого старта) и каналы прежних стежков (скрытые участки тоже нить). Кластер от своей
 * нити разметки растёт, пока зазор до соседней занятости меньше w (рабочая нить туда не войдёт; prior #105 —
 * игла между нитями, не сквозь). E = правый край кластера + w/2, X = левый край − w/2. Свободных чисел нет:
 * только ширины m и w и геометрия уже уложенного. Окно — до соседних линий разметки (дальше кластер расти
 * не может, не охватив соседнюю разметку — это ловит V5).
 * #52 commit 2 (spec stage3-arch §1.4): by line, not by longitude. `line` is a half-line from the kiku centre in the
 * geom.js form (resolve(marking, 'L(P, azimuth=k)'): from, z0, az, dir, n and the anchor valence v). The needle line is
 * the great circle ⟂ the line at its point at arc s; the neighbouring marking lines are the half-lines at azimuth ±2π/v,
 * the bisectors at ±π/v (for S_N: φ ± 2π/N and φ ± π/N, bit for bit as before).
 */
export function needleSides({ R, line, s, m, w, laid, uwagakeSet = null, uwagakeRow = 0, topSet = null }) {
  const v = line?.v;
  if (!Number.isInteger(v) || !line.dir) throw new Error('needleSides: line must be a resolved half-line with the anchor valence v');
  const C = pointOnLine(R, line, s);
  const uC = unit(C), eL = acrossLine(C, line), n = alongLine(C, line);   // n — нормаль плоскости линии иглы
  const r = R * Math.sin(s / R);
  const spacing = r * 2 * Math.PI / v;                     // расстояние до соседней линии (по окружности радиуса s вокруг центра)
  const occ = [];
  const coord = (p) => { const q = unit(p); return { f: R * Math.asin(Math.max(-1, Math.min(1, dot(q, n)))), y: R * Math.atan2(dot(q, eL), dot(q, uC)) }; };
  // пересечение меридиана φ' с линией иглы: координата y и синус угла между ними
  const meet = (delta) => {
    const nMer = rotateHalfLine(line, delta).n;
    let d = unit(cross(nMer, n));
    if (dot(d, uC) < 0) d = d.map((v) => -v);
    const y = R * Math.atan2(dot(d, eL), dot(d, uC));
    const sn = Math.max(1e-6, Math.sqrt(Math.max(0, 1 - dot(unit(cross(n, d)), unit(cross(nMer, d))) ** 2)));
    return { y, sn };
  };
  // соседние нити разметки L(k±1)
  let win = spacing;
  for (const sg of [1, -1]) {
    const { y, sn } = meet(sg * 2 * Math.PI / v);
    const wid = m / sn;
    occ.push({ lo: y - wid / 2, hi: y + wid / 2, y, seg: 'marking', kind: 'marking-neighbour', line: sg });
    win = Math.max(win, Math.abs(y) + wid / 2);
  }
  win += w;
  // «своя точка»: сектор линии k между биссектрисами (φ ± π/N). Обход uwagake — вокруг нитей ЭТОЙ точки
  // (TK-UWA «take a stitch around all of them»); занятость с центром за биссектрисой принадлежит соседней точке.
  const yBis = { right: meet(Math.PI / v).y, left: meet(-(Math.PI / v)).y };
  for (const seg of laid) {
    // отбор по габариту: точки линии иглы в окне лежат не дальше win + w от C (только ускорение, результат тот же)
    const b = bb(seg);
    if (Math.max(b.lo[0] - C[0], C[0] - b.hi[0], b.lo[1] - C[1], C[1] - b.hi[1], b.lo[2] - C[2], C[2] - b.hi[2]) > win + w) continue;
    const pts = seg.pts;
    if (seg.type === 'hidden-start') {     // отверстия скрытого старта на поверхности (игла не колет в них)
      for (const [p, role] of [[seg.from, 'hole-start'], [seg.to, 'hole-start']]) {
        const q = coord(p);
        if (Math.abs(q.f) <= w / 2 && Math.abs(q.y) < win) occ.push({ lo: q.y - w / 2, hi: q.y + w / 2, y: q.y, seg: seg.id, kind: role });
      }
      continue;
    }
    // #37: coordinates are computed lazily, per chunk of NS_CHUNK edges. A chunk whose bounding sphere lies wholly on one
    // side of the needle plane beyond the half-width band (f > w/2 at every vertex, or f < −w/2 at every vertex) gives no capsule
    // interval on any of its edges (the chart segment keeps |f| > w/2, both end disks are empty), so skipping it is
    // exactly one flush() — identical output, verified by the snapshot and the suite.
    const c = new Array(pts.length);
    const cAt = (i) => c[i] || (c[i] = coord(pts[i]));
    const sph = needleChunks(seg);
    const sinBand = Math.sin(w / 2 / R) * (1 + 1e-9) + 1e-12;   // f > w/2 ⇔ p·n > sin(w/2R)·|p| (vertices may sit off the sphere)
    // след нити на линии иглы — ТОЧНО: множество y, где точка линии иглы ближе w/2 к оси нити (капсула отрезка ∩ линия),
    // по отрезкам полилинии; непрерывные группы — одна занятость. Касательный проход даёт свой настоящий след
    // (формула w/sin θ для почти параллельной нити дала бы ложные 10 мм).
    const h = w / 2;
    let run = null;
    const flush = () => {
      if (!run) return;
      if (Math.abs((run.lo + run.hi) / 2) < win || (run.lo < win && run.hi > -win)) {
        const kind = seg.type === 'pickup' ? 'channel' : run.touchStart ? 'hole-exit' : run.touchEnd ? 'hole-entry' : run.cross ? 'crossing' : 'graze';
        const y = run.cross ? run.yCross : (run.lo + run.hi) / 2;
        occ.push({ lo: run.lo, hi: run.hi, y, seg: seg.id, kind });
      }
      run = null;
    };
    for (const ch of sph) {
      const dn = ch.c[0] * n[0] + ch.c[1] * n[1] + ch.c[2] * n[2];
      const bandMax = sinBand * (ch.cn + ch.r);   // ≥ sin(w/2R)·|p| for every p in the chunk's ball
      if (dn - ch.r > bandMax || dn + ch.r < -bandMax) { flush(); continue; }
      for (let i = ch.j0; i <= ch.j1; i++) {
      const P = cAt(i - 1), Qp = cAt(i);
      const iv = capsuleOnLine(P.y, P.f, Qp.y, Qp.f, h);
      if (!iv || iv[1] < -win || iv[0] > win) { flush(); continue; }
      if (!run) run = { lo: iv[0], hi: iv[1], cross: false, touchStart: false, touchEnd: false };
      else { run.lo = Math.min(run.lo, iv[0]); run.hi = Math.max(run.hi, iv[1]); }
      if (seg.type === 'leg' && i === 1 && Math.abs(P.f) <= h) run.touchStart = true;
      if (seg.type === 'leg' && i === pts.length - 1 && Math.abs(Qp.f) <= h) run.touchEnd = true;
      if (P.f * Qp.f < 0 || (P.f === 0) !== (Qp.f === 0)) { run.cross = true; run.yCross = P.f === Qp.f ? P.y : P.y + (P.f / (P.f - Qp.f)) * (Qp.y - P.y); }
      }
    }
    flush();
  }
  // Top hole cluster (spec v3.2 §5.3, #38): the top bite is a small stitch under the bundle of its OWN set; the needle
  // enters the mari and passes UNDER a foreign surface thread. Foreign segments of any class (legs, hole-entry /
  // hole-exit, channels, hidden starts) never enter the cluster or the gap logic and never move the hole; a bite
  // under a foreign thread is recorded by the caller as U14 «set collision».
  const foreignUnder = [];
  if (topSet) {
    const segOf = new Map((laid || []).map((seg) => [seg.id, seg]));
    for (let i = occ.length - 1; i >= 0; i--) {
      const seg = occ[i].seg === 'marking' ? null : segOf.get(occ[i].seg);
      if (seg && seg.set !== topSet) { foreignUnder.push({ seg: seg.id, kind: occ[i].kind, lo: occ[i].lo, hi: occ[i].hi }); occ.splice(i, 1); }
    }
  }
  let lo = -m / 2, hi = m / 2;
  const used = [{ lo, hi, seg: 'marking', kind: 'marking' }];
  // 6a.11(2)(B): keep shoulders whose interval overlaps the cluster (not centre-only).
  // Bisector gate still marks "primary" own; overlap with the growing cluster reclaims edge cases
  // (e.g. A1/s16 at cluster edge). For upper uwagake, force-include ALL prior set-row legs
  // regardless of gaps (cluster must cover every prior row on this point).
  const laidById = new Map((laid || []).map((seg) => [seg.id, seg]));
  for (const o of occ) {
    const inSector = o.kind !== 'marking-neighbour' && o.y > yBis.left && o.y < yBis.right;
    o.own = inSector;
    o.forceUwagake = false;
    if (uwagakeSet && uwagakeRow >= 2) {
      const seg = laidById.get(o.seg);
      // 6a.11(2)(B): upper uwagake cluster includes ALL prior rows of this set, regardless of gaps.
      // Also same-row bottoms already laid (bottom before top in the round): their crossings sit
      // just outside the point sector but are the rail the next lower leg climbs onto — omitting
      // them left X inside the prev tube (δ>w/2 on B13/s404, A12/s356; candidate B).
      if (seg && seg.type === 'leg' && seg.set === uwagakeSet
          && (seg.row < uwagakeRow || (seg.row === uwagakeRow && seg.level === 'bottom'))) {
        o.forceUwagake = true;
      }
    }
  }
  const rest = occ.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      const o = rest[i];
      const overlaps = o.lo < hi + w && o.hi > lo - w;
      // Reclaim edge occupancy whose INTERVAL reaches the point sector (centre may sit
      // just outside the bisector — e.g. A1/s16). Do NOT reclaim intervals that lie
      // entirely outside the sector: that cascades into neighbour-petal B-set threads
      // (A9 closing xOff ≈ −12, then δ≫w/2 on A11/s324).
      if (!o.own && o.kind !== 'marking-neighbour' && overlaps) {
        const reachesSector = o.hi > yBis.left && o.lo < yBis.right;
        if (reachesSector) o.own = true;
      }
      if (!o.own && !o.forceUwagake) continue;
      if (overlaps || o.forceUwagake) {
        lo = Math.min(lo, o.lo); hi = Math.max(hi, o.hi); used.push(o); rest.splice(i, 1); changed = true;
      }
    }
  }
  // место для рабочей нити снаружи кластера: зазор до ближайшей чужой занятости (соседняя точка, соседняя разметка).
  // Зазор ≥ w — нить ложится вплотную к кластеру (ось на w/2). Зазор < w — игла идёт МЕЖДУ нитями посередине зазора
  // (#105), нити с обеих сторон должны сжаться на (w − зазор)/2 — сжатие не моделируется (U14), записывается (V19).
  const side = (sgn) => {
    const edge = sgn > 0 ? hi : lo;
    let best = null;
    for (const o of rest) {
      const g = sgn > 0 ? o.lo - edge : edge - o.hi;
      const beyond = sgn > 0 ? o.hi > edge : o.lo < edge;
      if (!beyond) continue;
      if (!best || g < best.gap) best = { gap: g, seg: o.seg, kind: o.kind, y: o.y };
    }
    // G3 / 6a.11(2): hole outside cluster. gap≥w → edge±w/2 (flush).
    // 0<gap<w → mid-gap (needle between threads, #105 / S16).
    // gap≤0 (noRoom): MUST stay at edge±w/2 — mid-overlap put X inside own cluster → δ>w/2
    // (B13/s408, A12/s356). Compression not modelled; record squeeze for V19 (6a.18).
    if (!best || best.gap >= w) return { off: edge + sgn * w / 2, squeeze: null };
    const squeeze = { ...best, comp: (w - Math.max(0, best.gap)) / 2, noRoom: best.gap <= 0 };
    const off = best.gap <= 0 ? edge + sgn * w / 2 : edge + sgn * best.gap / 2;
    return { off, squeeze };
  };
  const R_ = side(1), L_ = side(-1);
  const squeeze = [R_.squeeze && { side: 'E', ...R_.squeeze }, L_.squeeze && { side: 'X', ...L_.squeeze }].filter(Boolean);
  return { eOff: R_.off, xOff: L_.off, cluster: used, ignored: rest, spacing, window: win, bisector: yBis, squeeze, foreignUnder };
}

const endsAt = (seg, H) => dist(seg.from, H) < 1e-9 || dist(seg.to, H) < 1e-9;

/** §5.3 (2) (#38): U14 «set collision» records for a top hole under a foreign (other-set) surface thread.
 *  One construction with the cluster (spec v3.2 §5.3 item 1): the records are exactly the foreign occupancies that
 *  needleSides excluded from the cluster (`foreignUnder`, any class — legs, hole-entry / hole-exit, channels,
 *  hidden-start holes) whose interval on the needle line covers the hole, i.e. |x_hole − x_trace| < w/2 in the
 *  needle-line chart. One record per (side, segment): d = chart distance from the hole to that segment's axis
 *  (channels projected to the surface; hidden start: its hole). inSpan per item 2: the hole lies in the span
 *  [x_X(k); x_E(k)] of an already laid foreign top stitch of the same schedule level s_T(k) (layout s), measured
 *  one-dimensionally along the latitude circle (φ of the hole between φ of that stitch's X and E). */
export function setCollisions({ R, s, phi, holes, foreignUnder, laid, stitches, set }) {
  const out = [];
  if (!foreignUnder || !foreignUnder.length) return out;
  const C = fPoint(R, FR, s, phi);
  const uC = unit(C), eL = fEast(FR, C), n = fToward(FR, C);
  const coord = (p) => { const q = unit(p); return { f: R * Math.asin(Math.max(-1, Math.min(1, dot(q, n)))), y: R * Math.atan2(dot(q, eL), dot(q, uC)) }; };
  const segById = new Map(laid.map((x) => [x.id, x]));
  const laidIds = new Set(laid.map((x) => x.id));
  const spans = stitches.filter((st) => st.level === 'top' && st.set !== set && Math.abs(st.s - s) < 1e-6 && laidIds.has(st.pickupId))
    .map((st) => ({ st, a: fSAz(R, FR, st.X).phi, b: fSAz(R, FR, st.E).phi }));
  const chartDist = (yh, seg) => {
    if (seg.type === 'hidden-start') return Math.min(...[seg.from, seg.to].map((p) => { const q = coord(p); return Math.hypot(q.y - yh, q.f); }));
    let best = Infinity;
    for (let i = 1; i < seg.pts.length; i++) {
      const P = coord(seg.pts[i - 1]), Q = coord(seg.pts[i]);
      const dy = Q.y - P.y, df = Q.f - P.f, L2 = dy * dy + df * df;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((yh - P.y) * dy + (0 - P.f) * df) / L2)) : 0;
      best = Math.min(best, Math.hypot(P.y + t * dy - yh, P.f + t * df));
    }
    return best;
  };
  for (const [side, { y, H }] of Object.entries(holes)) {
    const segIds = [...new Set(foreignUnder.filter((o) => o.lo < y && y < o.hi).map((o) => o.seg))];
    if (!segIds.length) continue;
    const ph = fSAz(R, FR, H).phi;
    const span = spans.find(({ a, b }) => { const lo = wrapPi(a - ph), hi = wrapPi(b - ph); return Math.min(lo, hi) <= 0 && Math.max(lo, hi) >= 0 && Math.abs(hi - lo) < Math.PI; });
    for (const id of segIds) {
      const L = segById.get(id);
      const kinds = [...new Set(foreignUnder.filter((o) => o.seg === id && o.lo < y && y < o.hi).map((o) => o.kind))];
      out.push({ side, seg: id, segRound: L.round, segType: L.type, kind: kinds.join('+'), d: chartDist(y, L), inSpan: !!span, spanOf: span ? span.st.pickupId : null });
    }
  }
  return out;
}

/** Интервал y на прямой f = 0, где расстояние до отрезка (y1,f1)–(y2,f2) ≤ h (капсула ∩ прямая), или null. */
function capsuleOnLine(y1, f1, y2, f2, h) {
  let lo = Infinity, hi = -Infinity;
  const disk = (y, f) => { if (Math.abs(f) <= h) { const r = Math.sqrt(h * h - f * f); lo = Math.min(lo, y - r); hi = Math.max(hi, y + r); } };
  disk(y1, f1); disk(y2, f2);
  const dy = y2 - y1, df = f2 - f1, L = Math.hypot(dy, df);
  if (L > 1e-12) {
    // полоса: |расстояние до прямой отрезка| ≤ h и проекция внутри [0, L]; оба условия линейны по y
    const nx = -df / L, ny = dy / L, tx = dy / L, ty = df / L;
    const lin = (a, b0, lo0, hi0) => {   // lo0 ≤ a·y + b0 ≤ hi0
      if (Math.abs(a) < 1e-15) return b0 >= lo0 && b0 <= hi0 ? [-Infinity, Infinity] : null;
      const u = (lo0 - b0) / a, v = (hi0 - b0) / a;
      return [Math.min(u, v), Math.max(u, v)];
    };
    const i1 = lin(nx, -y1 * nx - f1 * ny, -h, h), i2 = lin(tx, -y1 * tx - f1 * ty, 0, L);
    if (i1 && i2) { const a = Math.max(i1[0], i2[0]), b = Math.min(i1[1], i2[1]); if (a <= b) { lo = Math.min(lo, a); hi = Math.max(hi, b); } }
  }
  return lo <= hi ? [lo, hi] : null;
}

function crossAngleDeg(A, i, B, j) {
  const ta = unit(sub(A[Math.max(1, i)], A[Math.max(1, i) - 1])), tb = unit(sub(B[Math.max(1, j)], B[Math.max(1, j) - 1]));
  return Math.acos(Math.min(1, Math.abs(dot(ta, tb)))) * 180 / Math.PI;
}

const fmt = (x, d = 1) => fmtNum(x, d);

/** Зоны, где ось плеча A ближе w к оси плеча B: [i0, i1], минимум, признак настоящего перекреста (A переходит
 *  через большой круг B внутри зоны). Контакт без перехода — «прилегание» (параллельный заход в зону w). */
function bb(seg) {
  if (seg._bb) return seg._bb;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of seg.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  Object.defineProperty(seg, '_bb', { value: { lo, hi }, enumerable: false });
  return seg._bb;
}
/** #37: bounding spheres of NS_CHUNK-edge pieces of a laid polyline (vertices j0−1…j1) for the needle-plane prune in
 *  needleSides. Cached on the segment like bb/chunks (laid polylines are never mutated). */
const NS_CHUNK = 8;
function needleChunks(seg) {
  if (seg._ns) return seg._ns;
  const out = [], P = seg.pts;
  for (let j0 = 1; j0 < P.length; j0 += NS_CHUNK) {
    const j1 = Math.min(P.length - 1, j0 + NS_CHUNK - 1);
    const c = [0, 0, 0];
    for (let j = j0 - 1; j <= j1; j++) for (let k = 0; k < 3; k++) c[k] += P[j][k];
    for (let k = 0; k < 3; k++) c[k] /= (j1 - j0 + 2);
    let r = 0;
    for (let j = j0 - 1; j <= j1; j++) r = Math.max(r, Math.hypot(P[j][0] - c[0], P[j][1] - c[1], P[j][2] - c[2]));
    out.push({ j0, j1, c, cn: Math.hypot(c[0], c[1], c[2]), r: r * (1 + 1e-12) + 1e-12 });
  }
  Object.defineProperty(seg, '_ns', { value: out, enumerable: false });
  return out;
}
const CHUNK = 8;
function chunks(seg) {           // габариты кусков по CHUNK отрезков (только ускорение отбора пар; результат тот же)
  if (seg._ch) return seg._ch;
  const out = [];
  for (let j0 = 1; j0 < seg.pts.length; j0 += CHUNK) {
    const j1 = Math.min(seg.pts.length - 1, j0 + CHUNK - 1);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let j = j0 - 1; j <= j1; j++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], seg.pts[j][k]); hi[k] = Math.max(hi[k], seg.pts[j][k]); }
    out.push({ j0, j1, lo, hi });
  }
  Object.defineProperty(seg, '_ch', { value: out, enumerable: false });
  return out;
}
function legZones(A, B, w) {
  const a = bb(A), b = bb(B);
  for (let k = 0; k < 3; k++) if (a.lo[k] - b.hi[k] >= w || b.lo[k] - a.hi[k] >= w) return [];
  const zones = [];
  const chB = chunks(B);
  let cur = null;
  for (let i = 1; i < A.pts.length; i++) {
    const p = A.pts[i - 1], q = A.pts[i];
    let best = null, bd = Infinity, bj = 0;
    for (const c of chB) {
      let far = false;
      for (let k = 0; k < 3; k++) if (Math.min(p[k], q[k]) - c.hi[k] >= w || c.lo[k] - Math.max(p[k], q[k]) >= w) { far = true; break; }
      if (far) continue;
      for (let j = c.j0; j <= c.j1; j++) {
        const r = segSegDist(p, q, B.pts[j - 1], B.pts[j]);
        if (r.d < bd) { bd = r.d; best = r; bj = j; }
      }
    }
    if (bd < w - 1e-9) {
      const m = { ...best, i, j: bj };
      if (!cur) cur = { i0: i, i1: i, min: m };
      else { cur.i1 = i; if (m.d < cur.min.d) cur.min = m; }
    } else if (cur) { zones.push(cur); cur = null; }
  }
  if (cur) zones.push(cur);
  const nB = unit(cross(B.from, B.to));
  for (const z of zones) {
    let cross0 = false;
    const a0 = Math.max(0, z.i0 - 1), a1 = Math.min(A.pts.length - 1, z.i1);
    for (let i = a0 + 1; i <= a1; i++) {
      const s0 = dot(nB, A.pts[i - 1]), s1 = dot(nB, A.pts[i]);
      if (s0 === 0 || s0 * s1 < 0) { cross0 = true; break; }
    }
    // Chord-plane test misses bow×bow touches (curved arms can meet while staying
    // on one side of the chord plane). Axis coincidence ⇒ treat as crossing.
    z.crossing = cross0 || (z.min && z.min.d < 0.05 * (w || W0_MM)); // coincidence as fraction of w (scale-invariant; 1e-3 mm cliff invented false contacts)
    z.lenMm = A.length * (a1 - a0) / (A.pts.length - 1);
  }
  return zones;
}

/** Planar Φ3 sagitta estimate (mm): L²·λ/(8R) — diagnostic / reporting only. */
function phi3SagittaMm(R, L, lambda) {
  return (L * L * Math.max(0, lambda)) / (8 * R);
}

/** Resolve shoulder form: alias bowToMarking → bow (D40). */
function resolveShoulderForm(form) {
  if (form === 'bowToMarking') return 'bow';
  return form === 'bow' ? 'bow' : 'geodesic';
}

/**
 * Small-circle center P (unit): ∠(P,a)=∠(P,b)=ρ, on the pole side of plane Oab
 * (sign(P·(a×b)) = sign(N·(a×b)), N=(0,0,1)). Port of bow_theory.small_circle_center.
 */
function smallCircleCenter(a, b, rho, side = 'pole') {
  const ua = unit(a), ub = unit(b);
  const mid = unit(add(ua, ub));
  const n = unit(cross(ua, ub));
  const half = angle(ua, ub) / 2;
  const cosHalf = Math.cos(half);
  if (Math.abs(cosHalf) < 1e-15) return null;
  const c = Math.cos(rho) / cosHalf;
  if (Math.abs(c) > 1) return null;
  const t = Math.acos(Math.max(-1, Math.min(1, c)));
  const cands = [
    unit(add(mul(mid, Math.cos(t)), mul(n, Math.sin(t)))),
    unit(add(mul(mid, Math.cos(t)), mul(n, -Math.sin(t)))),
  ];
  const xe = cross(ua, ub);
  const poleSign = Math.sign(dot(FR.c, xe)) || 1;   // #53: «pole» = the kiku centre side
  // Fable v2: production = pole side; equator side is the direction negative-test mutation.
  const wantSign = side === 'equator' ? -poleSign : poleSign;
  const match = cands.filter((p) => (Math.sign(dot(p, xe)) || 1) === wantSign);
  if (match.length) return match.sort((p, q) => fZ(FR, q) - fZ(FR, p))[0];
  return cands.sort((p, q) => (side === 'equator' ? fZ(FR, p) - fZ(FR, q) : fZ(FR, q) - fZ(FR, p)))[0];
}

/** Rodrigues rotation of v about unit axis k by angle t. */
function rotateAbout(v, k, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

/**
 * Samples of the small circle about Pc from a to b (uniform in angle about P).
 * Endpoints pinned to from/to; all points on radius R.
 */

/** Signed short rotation about unit k from pa to pb, in (−π, π]. Matches smallCircleArc. */
function signedShortPsi(pa, pb, k) {
  let T = angle(pa, pb);
  if (dot(cross(pa, pb), k) < 0) T = -T;
  return T;
}

function smallCircleArc(R, from, to, Pc, n) {
  const a = unit(from), b = unit(to), k = unit(Pc);
  const pa = unit(add(a, mul(k, -dot(a, k))));
  const pb = unit(add(b, mul(k, -dot(b, k))));
  const T = signedShortPsi(pa, pb, k);
  const out = [];
  // Cosine end-clustering: last chord subtends O(1/n²) so θ_last matches analytic tangent
  // within 0.1° at n=96 (uniform chord is O(1/n) and overshoots at λ≳0.5).
  for (let i = 0; i <= n; i++) {
    const u = n === 0 ? 0 : i / n;
    const s = 0.5 * (1 - Math.cos(Math.PI * u));
    const p = rotateAbout(a, k, T * s);
    out.push(mul(unit(p), R));
  }
  out[0] = from.slice ? from.slice() : [...from];
  out[n] = to.slice ? to.slice() : [...to];
  return out;
}

/**
 * Visible leg polyline: geodesic (slerp) or small-circle bow (D40 / Fable v2).
 * Intent λ is set directly (bowLambda) or via δ_mm → (5); μWrap is V20 reference only.
 * ρ = arccot(λ); center P on pole side of OXE; samples uniform in angle about P.
 * If λ < 1e-9 → geodesic. Tip-drop Δ is NOT an input — only shoulder form + λ.
 */
function layLeg(R, from, to, phiMark, shoulderForm, lambdaCmd = 0, bowSide = 'pole') {
  void phiMark; // destination meridian used by V21; bow geometry uses X,E,P only
  const geoLen = geodLen(R, from, to);
  const form = resolveShoulderForm(shoulderForm);
  const lambda = form === 'bow' ? Math.max(0, lambdaCmd ?? 0) : 0;
  const phi3CapMm = phi3SagittaMm(R, geoLen, lambda);
  const n = getLegSamples();
  if (form !== 'bow' || lambda < 1e-9) {
    return {
      pts: slerp(R, from, to, n), length: geoLen,
      shoulderForm: 'geodesic', bowLateralMm: 0, phi3CapMm: 0, lambda: 0, rho: Math.PI / 2,
      bowCenter: null, phi3Warn: false, layMode: 'geodesic', arcs: [arcGC(from, to, 'free')],
    };
  }
  const rho = Math.atan(1 / lambda); // arccot(λ)
  const Pc = smallCircleCenter(from, to, rho, bowSide === 'equator' ? 'equator' : 'pole');
  if (!Pc) {
    return {
      pts: slerp(R, from, to, n), length: geoLen,
      shoulderForm: 'geodesic', bowLateralMm: 0, phi3CapMm: 0, lambda: 0, rho: Math.PI / 2,
      bowCenter: null, phi3Warn: false, layMode: 'geodesic', arcs: [arcGC(from, to, 'free')],
    };
  }
  const pts = smallCircleArc(R, from, to, Pc, n);
  // Exact sagitta (5): δ = R·(ρ − arccos(cos ρ / cos(γ/2)))
  const gamma = angle(unit(from), unit(to));
  const cosHalf = Math.cos(gamma / 2);
  const c = Math.cos(rho) / cosHalf;
  let bowLateralMm = 0;
  if (Number.isFinite(c) && c < 1 - 1e-15 && c > -1 + 1e-15) {
    bowLateralMm = R * (rho - Math.acos(Math.max(-1, Math.min(1, c))));
  } else {
    // fallback: max lateral offset from GC plane
    const nGeo = unit(cross(from, to));
    for (let i = 1; i < n; i++) {
      const off = R * Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(unit(pts[i]), nGeo)))));
      if (off > bowLateralMm) bowLateralMm = off;
    }
  }
  // Arc length (6): L_arc = R·sinρ·|Δψ| with the SAME short signed Δψ as smallCircleArc
  // (long-arc 2π−∠ was wrong for equator-side centers — V2 saw ~200 mm vs ~37 mm poly).
  const pa = unit(add(unit(from), mul(unit(Pc), -dot(unit(from), unit(Pc)))));
  const pb = unit(add(unit(to), mul(unit(Pc), -dot(unit(to), unit(Pc)))));
  const dPsi = Math.abs(signedShortPsi(pa, pb, unit(Pc)));
  const arcLen = R * Math.sin(rho) * dPsi;
  return {
    pts, length: Math.abs(arcLen) > 1e-12 ? Math.abs(arcLen) : polyLen(pts),
    shoulderForm: 'bow',
    bowLateralMm, phi3CapMm, lambda, rho, bowCenter: Pc, phi3Warn: false,
    layMode: 'smallCircle', bowSide: bowSide === 'equator' ? 'equator' : 'pole',
    arcs: [arcSmall(from, to, Pc, 'free')],
  };
}


/**
 * Row n≥2 rail = parallel curve of the ACTUALLY laid leg of row n−1, offset w outward (spec v3.1 §3.2(8)).
 * Built from the analytic arcs of that leg (arcs.js, #36): exact poles and radii, exact continuous tangent
 * field, no finite differences over sampled neighbours. Concentric-about-P is the special case when the
 * leg is the row-1 small-circle arc. Measure signed d_n against THIS rail, then join:
 *   exterior (d>0): geodesic tangent at T (kink at T ≤1°);
 *   interior (δ>0): climb/merge to M at ℓ_m=max(w,3δ) forward (kinks ≤20°).
 */

/** Outward side of a chain of arcs: +1 = left of travel, −1 = right. Outward is equatorward (the next
 *  packed tip lies toward the equator); decided once per chain at its middle, from construction. */
function outwardSide(arcs) {
  const ch = new Chain(1, arcs, 1);
  const { q, T } = ch.at(ch.len / 2);
  return dot(cross(q, T), fToward(FR, q)) > 0 ? -1 : 1;
}

/** Analytic arcs of a laid leg (every leg carries them; sampled pts are output only). */
function armArcs(arm) {
  if (!arm?.arcs?.length) throw new Error(`rail: leg ${arm?.id ?? '?'} has no analytic arcs (#36)`);
  return arm.arcs;
}

/** The laid leg itself as a chain (outward side as its rail). */
function laidChain(R, arm) {
  const arcs = armArcs(arm);
  return new Chain(R, arcs, outwardSide(arcs));
}

/**
 * Rail of row n on the laid leg prevArm of row n−1 (spec v3.2 §3.2(8), (11a), (8′), #22): { core, rail, kind, bodyS0 }.
 * core = the parallel at w of the ACTUALLY laid path of row n−1, its entry splice / drain included (actualParallel):
 * one construction for d_n (decision), for the foot, M and the rail the leg is laid on (building) and for the check.
 * bodyS0 = arc length on core where the parallel of the leg body (after the entry splice) begins.
 * rail = core continued along the great circles tangent at both ends (consumers see the continuation).
 * Geodesic-form prev (λ = 0): parallel of the great circle prev.from → prev.to, the same GC packing plane
 * as packThenPierce's analytic branch (legs on a λ = 0 row are free, (9а–в)). Cached per leg (the packing root and
 * the leg share one rail).
 */
const railCache = new WeakMap();
function railOf(R, prevArm, w) {
  const key = `${R}|${w}`;
  const hit = railCache.get(prevArm);
  if (hit && hit.key === key) return hit.val;
  const gcPack = prevArm.shoulderForm === 'geodesic' && !prevArm.bowCenter;
  const extMm = Math.max(5 * (w || 0), mmAtW(10, w || W0_MM));
  let val;
  if (gcPack) {
    const body = [arcGC(prevArm.from, prevArm.to, 'free')];
    const side = outwardSide(body);
    const core = new Chain(R, offsetChain(body, (w || 0) / R, side), side);
    val = { core, rail: core.extended(extMm), kind: 'gc-plane-parallel', bodyS0: 0 };
  } else {
    const core = actualParallel(R, prevArm, w);
    const body = armArcs(prevArm).filter((A) => A.cls !== 'splice');
    const hasSplice = body.length < armArcs(prevArm).length;
    const bodyStart = hasSplice ? new Chain(R, offsetChain(body, (w || 0) / R, core.side), core.side).start : core.start;
    val = { core, rail: core.extended(extMm), kind: 'poly-parallel', bodyS0: hasSplice ? core.closest(bodyStart).s : 0 };
  }
  railCache.set(prevArm, { key, val });
  return val;
}

/**
 * Spec v3.2 §3.2(8′): analytic parallel at w of the ACTUAL path of row n−1 (entry splice / drain included, concave
 * corner trimmed, convex corners rounded), used for d_n at a station (decision (9б) and diagnostics). Before the core
 * start it is the entry segment's parallel (a tangent entry's splice is the great circle tangent at T₁, so its parallel
 * is the core's continuation; a drain gives the drain geodesic's parallel); past either end, the continuation along
 * the great circle tangent at that end. Never the distance to the chain end.
 */
const stationCache = new WeakMap();
function actualParallel(R, prevArm, w) {
  const key = `${R}|${w}`;
  const hit = stationCache.get(prevArm);
  if (hit && hit.key === key) return hit.val;
  const all = armArcs(prevArm);
  const body = all.filter((A) => A.cls !== 'splice');
  const side = outwardSide(body.length ? body : all);
  let val;
  try { val = new Chain(R, offsetChain(all, (w || 0) / R, side), side); }
  catch (e) { e.arm = { id: prevArm.id, join: prevArm.joinMode, exit: prevArm.exitKind, d: prevArm.lateralMm, splice: prevArm.spliceMm, side, arcs: all.map((A) => ({ cls: A.cls, psi: A.psi, rho: A.rho, join: A.join, L: R * Math.sin(A.rho) * A.psi })) }; throw e; }
  stationCache.set(prevArm, { key, val });
  return val;
}
/** Signed lateral (+ outward) of u to chain ch continued past its ends along the tangent great circles (§3.2(8′)). */
function stationLateral(ch, u) {
  const h = ch.lateral(u);
  if (!h.clamped) return h;
  const d = dot(unit(u), h.N);
  return { ...h, signedMm: ch.R * Math.asin(Math.max(-1, Math.min(1, d))) };
}

/** Largest interior turn (deg) of a polyline and the arc length where it occurs; round-off duplicates dropped (#35). */
function rawTurnMax(R, pts, w) {
  const dupMm = 1e-5 * (w || W0_MM);
  const q = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], l = q[q.length - 1];
    if (Math.hypot(p[0] - l[0], p[1] - l[1], p[2] - l[2]) >= dupMm) q.push(p);
    else if (i === pts.length - 1 && q.length > 1) q[q.length - 1] = p;
  }
  let best = 0, at = 0, cum = 0;
  for (let i = 1; i < q.length - 1; i++) {
    cum += R * angle(q[i - 1], q[i]);
    const t = Math.abs(turnDegAt(q[i - 1], q[i], q[i + 1]));
    if (t > best) { best = t; at = cum; }
  }
  return { deg: best, atMm: at };
}
/** Signed turn (deg) at b of the path a → b → c on the sphere (tangent-plane projection). */
function turnDegAt(a, b, c) {
  const nrm = unit(b);
  const pr = (v) => {
    const p = sub(v, mul(nrm, dot(v, nrm)));
    const len = Math.hypot(p[0], p[1], p[2]);
    return len < 1e-15 ? null : mul(p, 1 / len);
  };
  const tIn = pr(unit(sub(b, a))), tOut = pr(unit(sub(c, b)));
  if (!tIn || !tOut) return 0;
  return Math.atan2(dot(cross(tIn, tOut), nrm), dot(tIn, tOut)) * 180 / Math.PI;
}

/**
 * Spec v3.2 §3.2(9а–д): leg of row n ≥ 2 on a row n−1 whose curve has κ_g = 0 at its end (λ = 0, geodesic form).
 * No rail: the body is a free great circle. Lower leg (endLevel 'bottom'): E_n = E_n⁰ (the packing root), no tangent
 * tail, no contacts; the top end X_n by the sign of d_n (8′): d < −0.02 w → drain (11) X_n → M on the parallel ℓ_m =
 * max(w, 3δ_e) forward from the foot, then free M → E_n⁰; |d| ≤ 0.02 w → start on the parallel at the foot; d > 0.02 w →
 * free X_n → E_n⁰. Upper leg (E_n given, (9в)) mirrored: d(E_n) < −0.02 w → drain to the hole from the parallel point ℓ_m
 * before E_n's foot; degenerate → arrival via the foot; outside → free arrival. exitKind (9г): 'free' or 'drain'.
 * (9д) check, not decision: the free part (from M / the foot, not from X_n) keeps ≥ w(1 − ε_c) from the axis of the laid
 * leg of row n−1, ε_c = 0.01; otherwise a contradiction — exitFail (loud, V8).
 */
function freeLegLambda0(R, from, to, prevArm, w, endLevel) {
  const n = getLegSamples();
  const wE = Math.max(w || W0_MM, 1e-9);
  const tol = 0.02 * wE;
  const X = unit(from), E = unit(to);
  const par0 = actualParallel(R, prevArm, w);
  // Stations beyond the parallel's ends see its great-circle continuation (8′): extend by more than the leg length.
  const par = par0.extended(R * angle(X, E) + 20 * wE);
  const latX = stationLateral(par, X), latE = stationLateral(par, E);
  const dX = latX.signedMm, dE = latE.signedMm;
  const sXf = latX.s, sEf = latE.s;
  const dir = sEf >= sXf ? 1 : -1;
  const nodes = [{ p: X, cls: null }];
  let joinMode, splice = 0, delta = 0;
  if (dX < -tol) {
    delta = -dX;
    const M = par.at(sXf + dir * Math.max(wE, 3 * delta)).q;
    nodes.push({ p: M, cls: 'splice' });
    splice = R * angle(X, M);
    joinMode = 'climb';
  } else if (dX <= tol) {
    // Degenerate (9б): X_n is on the parallel within the band — the free body starts at X_n itself (a ≤ 0.02 w jog to the
    // foot would be a false travel direction at the hole).
    joinMode = 'onRail';
  } else joinMode = 'free';
  const iFree0 = nodes.length - 1;
  let exitKind = 'free';
  if (endLevel !== 'bottom' && dE < -tol) {
    const Md = par.at(sEf - dir * Math.max(wE, 3 * -dE)).q;
    nodes.push({ p: Md, cls: 'free' });
    exitKind = 'drain';
  }
  const iFree1 = nodes.length - 1;
  nodes.push({ p: E, cls: iFree1 > iFree0 ? 'tail' : 'free' });
  const arcs = [];
  for (let j = 1; j < nodes.length; j++) {
    const A = arcGC(nodes[j - 1].p, nodes[j].p, nodes[j].cls);
    if (A && A.psi > 0) arcs.push(A);
  }
  // (9д): gap of the free part to the axis of the laid leg of row n−1.
  const laid = laidChain(R, prevArm);
  let minGap = Infinity;
  {
    const a = nodes[iFree0].p, b = nodes[iFree1].p, om = angle(a, b);
    const nChk = Math.max(8, Math.ceil(R * om / (0.25 * wE)));
    for (let k = 0; k <= nChk; k++) {
      const tt = k / nChk;
      const g = om < 1e-15 ? a : unit(add(mul(a, Math.sin((1 - tt) * om) / Math.sin(om)), mul(b, Math.sin(tt * om) / Math.sin(om))));
      minGap = Math.min(minGap, laid.closest(g).distMm);
    }
  }
  // A degenerate end lies on the parallel by definition (|d| ≤ 0.02 w, (9б)); its offset is not a gap deficit.
  const degIn = joinMode === 'onRail' ? Math.max(0, -dX) : 0;
  const degOut = endLevel !== 'bottom' && exitKind === 'free' && Math.abs(dE) <= tol ? Math.max(0, -dE) : 0;
  const gapFail = minGap < wE * (1 - 0.01) - Math.max(degIn, degOut) - 1e-9 * wE;
  // Output polyline: exactly n segments distributed by arc length over the pieces (largest remainder), corners kept as
  // vertices — no resampling across a corner (it would cut the corner). The analytic arcs are kept on the leg.
  const lens = [];
  for (let j = 1; j < nodes.length; j++) lens.push(R * angle(nodes[j - 1].p, nodes[j].p));
  const total = lens.reduce((x, y) => x + y, 0) || 1e-15;
  const live = lens.map((L) => L > 1e-12);
  const nLive = live.filter(Boolean).length;
  const quota = lens.map((L, j) => (live[j] ? 1 + (n - nLive) * L / total : 0));
  const kSeg = quota.map((q) => Math.floor(q));
  let left = n - kSeg.reduce((x, y) => x + y, 0);
  const order = quota.map((q, j) => [q - Math.floor(q), j]).filter(([, j]) => live[j]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let t = 0; left > 0 && order.length; t = (t + 1) % order.length, left--) kSeg[order[t][1]]++;
  const out = [mul(X, R)];
  for (let j = 1; j < nodes.length; j++) {
    if (!live[j - 1]) continue;
    const seg = slerp(R, nodes[j - 1].p, nodes[j].p, kSeg[j - 1]);
    for (let k = 1; k < seg.length; k++) out.push(seg[k]);
  }
  out[0] = from.slice ? from.slice() : [...from];
  out[out.length - 1] = to.slice ? to.slice() : [...to];
  const raw = rawTurnMax(R, out, w);
  const turnAtM = nodes.length >= 3 && joinMode === 'climb' ? turnDegAt(nodes[0].p, nodes[1].p, nodes[2].p) : 0;
  const turnAtDrain = exitKind === 'drain' ? turnDegAt(nodes[nodes.length - 3].p, nodes[nodes.length - 2].p, E) : 0;
  const holeTurnDeg = out.length >= 3 ? turnDegAt(out[0], out[1], out[2]) : 0;
  // #22 per-leg check at M (as railLeg): M is output vertex kSeg[0]; expected turn = chord X_n → M against the link
  // leaving M (here the free great circle, so the analytic turn at the node); corners of the parallel between the foot
  // of X_n and M are counted for the report.
  let mIdx = -1, railCornerFootToM = 0;
  if (joinMode === 'climb' && live[0] && nodes.length >= 3) {
    mIdx = kSeg[0];
    const sM = sXf + dir * Math.max(wE, 3 * delta), sA = Math.min(sXf, sM), sB = Math.max(sXf, sM), ra = par.arcs;
    for (let j = 1; j < ra.length; j++) {
      const sj = par.cum[j];
      if (sj <= sA || sj >= sB) continue;
      const v = ra[j].a, t1 = arcTangent(ra[j - 1], arcEnd(ra[j - 1])), t2 = arcTangent(ra[j], v);
      if (ra[j].cls === 'corner' || Math.abs(Math.atan2(dot(cross(t1, t2), v), dot(t1, t2))) > 1e-9) railCornerFootToM++;
    }
  }
  return {
    mIdx, mTurnExpDeg: mIdx > 0 ? turnAtM : null, railCornerFootToM, clearFreeW: minGap / wE, clearChordW: null,
    railTurnFootToMDeg: mIdx > 0 ? (() => { const a = par.at(sXf), b = par.at(sXf + dir * Math.max(wE, 3 * delta)); const tb = sub(a.T, mul(b.q, dot(a.T, b.q))); const l = Math.hypot(...tb); return l < 1e-15 ? 0 : Math.atan2(dot(cross(mul(tb, 1 / l), b.T), b.q), dot(mul(tb, 1 / l), b.T)) * 180 / Math.PI; })() : null,
    pts: out, length: total,
    shoulderForm: 'geodesic', bowLateralMm: 0, phi3CapMm: 0, lambda: 0, rho: Math.PI / 2,
    bowCenter: null, phi3Warn: false, layMode: 'rail', lam0: true,
    spliceMm: splice, lateralMm: dX, turnAtTDeg: turnAtM, interiorXn: dX < -tol,
    joinMode, climbMm: joinMode === 'climb' ? splice : 0, deltaMm: delta, deltaFail: delta > wE / 2,
    railKind: 'free', holeTurnDeg, mergeTurnDeg: turnAtM, exitTurnDeg: turnAtDrain,
    exitKind, exitFail: gapFail, exitSin: null, exitResMm: null, exitAlongMm: 0,
    rawTurnMaxDeg: raw.deg, rawTurnAtMm: raw.atMm, exitDeMm: dE, minGapMm: minGap, arcs,
  };
}

/** Spherical distance (mm) from point to a short geodesic segment (incl. endpoints). */
function pointSegDistMm(R, p, a, b) {
  const A = unit(a), B = unit(b), P = unit(p);
  const normal = unit(cross(A, B));
  let Q = unit(sub(P, mul(normal, dot(P, normal))));
  const ab = angle(A, B), aq = angle(A, Q), qb = angle(Q, B);
  if (aq + qb <= ab + 1e-7) return R * angle(P, Q);
  Q = mul(Q, -1);
  if (angle(A, Q) + angle(Q, B) <= ab + 1e-7) return R * angle(P, Q);
  return R * Math.min(angle(P, A), angle(P, B));
}
function pointPolyDistMm(R, p, pts) {
  let d = Infinity;
  for (let j = 1; j < pts.length; j++) d = Math.min(d, pointSegDistMm(R, p, pts[j - 1], pts[j]));
  return d;
}

/** Exit tangency candidates over the window [sLo, sHi] (spec v3 §3.2(13в)), sampled at nScan + 1
 *  points by exitRes(s) → { s, res, score, … }: sign changes of res (bisected), local minima of |res|
 *  (touching roots) and both window ends. Exported for the T₁-boundary regression test (#35). */
export function exitCandidates(exitRes, sLo, sHi, nScan) {
  const samples = [];
  for (let k = 0; k <= nScan; k++) samples.push(exitRes(sLo + (sHi - sLo) * (k / nScan)));
  const cands = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    if (!(a.score > 0 && b.score > 0) || a.res * b.res > 0) continue; // never across reverse
    let lo = a.s, hi = b.s, flo = a.res;
    for (let it = 0; it < 48; it++) {
      const mid = 0.5 * (lo + hi), fm = exitRes(mid);
      if (flo * fm.res <= 0) hi = mid; else { lo = mid; flo = fm.res; }
    }
    cands.push(exitRes(0.5 * (lo + hi)));
  }
  // Double (touching) roots have no sign change: refine local minima of |res| too.
  for (let i = 1; i < samples.length - 1; i++) {
    const a = samples[i - 1], b = samples[i], c = samples[i + 1];
    if (!(b.score > 0) || Math.abs(b.res) > Math.abs(a.res) || Math.abs(b.res) > Math.abs(c.res)) continue;
    let lo = a.s, hi = c.s;
    for (let it = 0; it < 48; it++) {
      const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
      if (Math.abs(exitRes(m1).res) < Math.abs(exitRes(m2).res)) hi = m2; else lo = m1;
    }
    cands.push(exitRes(0.5 * (lo + hi)));
  }
  // Both window ends are inside the window (§3.2(13в)): a tangency exactly at T₁ or at the rail end
  // has no sign change or interior minimum to find, so each end sample is a candidate itself (#35:
  // only the far sample used to be added; with forward travel that left a root at T₁ to drain/free).
  for (const end of [samples[0], samples[samples.length - 1]]) if (end.score > 0) cands.push(end);
  return { samples, cands };
}

/** Spec v3.1 §3.2(13б) (#39): a tangency root needs BOTH sin∠(rail tangent, direction) ≤ 0.01 AND position
 *  residual ≤ 0.02·w (class (ii): ≥ 50 link sagittas at 96). The direction alone is blind to a parallel but
 *  offset chord (sin 0.0047 at residual 0.21·w is not a tangency). Used by the entry (10) and the exit (13). */
export const TANGENCY_SIN_MAX = 0.01;
export const TANGENCY_RES_W = 0.02;
/** εc of (9д)/(10′): clearance ≥ w(1 − εc) (the same 1 % as the free-exit re-entry check). */
export const EPS_C = 0.01;
/** (9б′) largest |d_n| of a legal degenerate entry, in w. */
export const DEG_MAX_W = 0.1;   // §2 class (iii): axis position budget 0.1·w (coordinator, #46)
/** Test hook (#46): overrides DEG_MAX_W (null → the rule value) to drive the contradiction branch on real geometry. */
let DEG_MAX_OVR = null;
export function setDegMaxW(v) { DEG_MAX_OVR = v == null ? null : +v; }
export function tangencyOk(sin, resMm, w) {
  return sin <= TANGENCY_SIN_MAX && resMm <= TANGENCY_RES_W * w;
}

/** Spec (10′) (#46): closed-form tangency from X to a piecewise-analytic rail, piece by piece in travel order from the
 *  foot s0 toward sE. A point T on a small circle (pole k, radius ρ) is a tangency iff X lies in the plane of T and the
 *  circle's tangent at T: X·(k − T cos ρ) = 0, i.e. X·T = X·k / cos ρ (the right spherical triangle X–T–k, ∠ at T).
 *  A great circle (cos ρ = 0) has no tangency from a point off it. Corner arcs (radius w) are small circles too.
 *  Returns every root inside the window, ordered along travel: { s, j, cls }. */
export function entryTangencyRoots(R, rail, X, s0, sE) {
  const fwd = sE >= s0, lo = Math.min(s0, sE), hi = Math.max(s0, sE);
  const out = [];
  for (let j = 0; j < rail.arcs.length; j++) {
    const a0 = rail.cum[j], a1 = rail.cum[j + 1];
    if (a1 < lo || a0 > hi) continue;
    const A = rail.arcs[j], cr = Math.cos(A.rho), sr = Math.sin(A.rho);
    if (Math.abs(cr) < 1e-12) continue;                       // point – great circle: no tangency
    const k = A.k, xk = dot(X, k);
    const e1 = unit(sub(A.a, mul(k, cr))), e2 = cross(k, e1);
    const Aa = sr * dot(X, e1), Bb = sr * dot(X, e2), C = xk / cr - cr * xk;
    const H = Math.hypot(Aa, Bb);
    if (!(H > 0) || Math.abs(C) > H) continue;
    const base = Math.atan2(Bb, Aa), dl = Math.acos(Math.max(-1, Math.min(1, C / H)));
    for (const c of [base - dl, base + dl]) {
      let psi = c % (2 * Math.PI); if (psi < 0) psi += 2 * Math.PI;
      if (psi > A.psi + 1e-12) continue;
      const sr0 = a0 + R * sr * Math.min(psi, A.psi);
      if (sr0 < lo - 1e-12 || sr0 > hi + 1e-12) continue;
      out.push({ s: sr0, j, cls: A.cls });
    }
  }
  out.sort((p, q) => (fwd ? p.s - q.s : q.s - p.s));
  return out;
}

/** #50 (Fable 26.09) braid joint: the first rail parameter u ∈ [u0, uEnd] (u0 = the ℓ_m minimum) where the full joint
 *  angle turn(u) ≤ BRAID_JOINT_MAX_DEG. Scan in steps of w/20, then bisect the crossing to 1e-9·w. ok = false (and
 *  u = uEnd) if the angle never gets ≤ 20° before the rail ends. shift = u − u0 (mm along the rail). */
export const BRAID_JOINT_MAX_DEG = 20;
export function braidJointMove(turn, u0, uEnd, w) {
  if (turn(u0) <= BRAID_JOINT_MAX_DEG) return { s: u0, shift: 0, ok: true };
  const step = Math.max(w, 1e-6) / 20;
  let a = u0;
  for (let u = Math.min(uEnd, u0 + step); ; u = Math.min(uEnd, u + step)) {
    if (turn(u) <= BRAID_JOINT_MAX_DEG) {
      let lo = a, hi = u;
      for (let it = 0; it < 60 && hi - lo > 1e-9 * w; it++) { const m = 0.5 * (lo + hi); if (turn(m) <= BRAID_JOINT_MAX_DEG) hi = m; else lo = m; }
      return { s: hi, shift: hi - u0, ok: true };
    }
    if (u >= uEnd) return { s: uEnd, shift: uEnd - u0, ok: false };
    a = u;
  }
}

/** Row n ≥ 2 leg along the rail of the previous arm. endLevel = level of the hole the leg ends at:
 *  'bottom' (E_n is the packing root on the rail, spec v3 §3.2(12)) or 'top' (E_n given, §3.2(13)). */
export function railLeg(R, from, to, prevArm, w = 0, endLevel = 'top', opts = {}) {
  const braid = !!opts.braid;   // #50 stage A: top rule braid — interior holes join the rail by a great circle (no climb, no drain)
  const n = getLegSamples();
  const prevPts = prevArm?.pts;
  if (!prevPts || prevPts.length < 2) {
    return {
      pts: slerp(R, from, to, n), length: geodLen(R, from, to),
      shoulderForm: 'geodesic', bowLateralMm: 0, phi3CapMm: 0, lambda: 0, rho: Math.PI / 2,
      bowCenter: null, phi3Warn: false, layMode: 'rail',
      spliceMm: 0, lateralMm: 0, turnAtTDeg: 0, interiorXn: false, joinMode: 'free',
      climbMm: 0, deltaMm: 0, deltaFail: false, railKind: 'free',
      holeTurnDeg: 0, mergeTurnDeg: 0, arcs: [arcGC(from, to, 'free')],
    };
  }

  // Spec v3.2 §3.2(9а–в): row n−1 with κ_g = 0 at its end (λ = 0, geodesic form) — no rail, the body is free and the
  // ends follow d_n (8′); the decision comes from the construction, not from a numeric contact gap (§2).
  if (prevArm.shoulderForm === 'geodesic' && !prevArm.bowCenter) return freeLegLambda0(R, from, to, prevArm, w, endLevel);

  // Contact: one contiguous geometric rail (tangent/climb entry → rail → tangent exit / 6a.7 splice).
  // Spec v3.2 §2, §3.2(8), (11a), (8′) (#36, #22): the rail is the parallel of the ANALYTIC arcs of the ACTUALLY laid
  // path of row n−1, its entry splice / drain included, continued along the great circles tangent at its ends. The same
  // chain gives d_n (decision), the foot, M and the rail after M (building) and the expected drain angle (check).
  // Entry, exit and the packing root use one exact, continuous tangent field (rail.at(s).T); the output polyline
  // keeps every joint (M, T₁, arc joints, exit point) as a vertex.
  const { core, kind: railKind, bodyS0 } = railOf(R, prevArm, w);
  let { rail } = railOf(R, prevArm, w);
  const X = unit(from), E = unit(to);
  // Spec v3.2 §3.2(8′), (9б): d_n is the signed distance from X_n to the analytic parallel of the ACTUAL path of row n−1
  // at this station — the entry segment's parallel before the body, the body's parallel inside, the tangent great-circle
  // continuation past the end — never the distance to a chain end.
  const dLat = stationLateral(core, X).signedMm;
  // onRail band: |d| ≤ 0.02·w (dimensionless, so ×k similarity cannot flip it).
  const onRailTol = 0.02 * Math.max(w || W0_MM, 1e-9);
  // Geometry (foot, splice target) lies on the laid rail (core + tangent great-circle continuation). A station beyond
  // the sampled extension gets a longer continuation of the same great circle (no end clamp as a foot).
  if (rail.closest(X).clamped) rail = core.extended(Math.max(5 * (w || 0), mmAtW(10, w || W0_MM)) + R * Math.max(angle(X, core.start), angle(X, core.end)));
  const lat = rail.lateral(X);
  const delta = dLat < 0 ? -dLat : 0;
  const hitE = rail.closest(E);

  let Tpt, sT, splice, joinMode;
  // (10′) entry diagnostics (#46): entryKind tangent | free | noTangency (V22 fail) | onRail | climb (interior only)
  let entryRoots = null, entrySkipped = 0, entryKind = null, entryPiece = null, entryMinGapW = null, entryGapAtMm = null, entryFail = false, entryBest = null, entryScan = null, entryBackward = false;
  let braidJoinTurnDeg = null, braidExitTurnDeg = null, braidJoinShiftMm = null, braidExitShiftMm = null;   // #50: turn at the great-circle ∩ rail joint (entry / top-hole end)
  // Scale with w so xk similarity does not flip onRail/climb (absolute 1e-6 mm thresh).
  // v3.2 §3.2(9б), §6.4 (#39, #22): |d_n| ≤ 0.02·w is the degenerate entry — X_n is on the rail within the band, no
  // tangency search. The leg starts at X_n itself (as at λ = 0): a jog X_n → foot, or X_n replacing the foot as vertex 0,
  // would be a false travel direction at the hole whose turn grows with the output grid (#22: 9.8° at 384). The
  // thread joins the rail at M, ℓ_m = max(w, 3|d_n|) along the rail from the foot toward E (the (11a) construction
  // with δ inside the band), turning there by atan(|d_n|/ℓ_m) ≤ atan(0.02) = 1.15°.
  // (9б′) (#46): the 0.02·w band is gone — a degenerate entry is defined by construction (no tangency AND the chord
  // X_n → E_n⁰ cuts the tube). Only round-off of d (|d| ≤ 1e−9·w: X_n lies on the rail, e.g. top legs) is "on the rail":
  // the tangency is the foot itself (T = X_n, no splice), so no sliver splice piece is produced.
  const onRailEps = 1e-9 * Math.max(w || W0_MM, 1e-9);
  if (Math.abs(dLat) <= onRailEps) {
    sT = lat.s;
    Tpt = rail.at(sT).q;
    splice = 0;   // X_n on the rail within round-off (|X_n − foot| ~ 1e−9·w; angle() noise ~1e−6 mm): the rail from X_n, no splice
    joinMode = 'tangent';
    entryKind = 'onRail';
  } else if (hitE.s < lat.s) {
    // #30: travel along the rail is foot → E by construction (row n runs the same way as row n−1). E_n⁰ behind the foot
    // has no tangency window or climb point in travel order: explicit contradiction (V22 fail, build invalid from this
    // row), never a collapsed or reversed search window. Measured: 0 of 2076 entries (grids 96/384, 7λ×2m, ×1.25, S16).
    entryKind = 'contradiction'; entryFail = true; entryBackward = true; sT = hitE.s; Tpt = E; splice = R * angle(X, E);
    joinMode = entryKind;
  } else if (dLat < 0 && braid) {
    // #50 stage A (braid, coordinator decision 1(b)): X_n lies inside the rail (pole side of row n−1: the braid). The leg
    // from the hole is a great circle to the rail — no climb. Joint: a tangency if one exists (closed form (10′), (13б),
    // no clearance requirement: crossing row n−1 near the top is the crossover of the braid); otherwise the great circle
    // meets the rail at the #22 point ℓ_m = max(w, 3δ) from the foot toward E (turn atan(δ/ℓ_m), printed; > 20° → V22 fail).
    const s0 = lat.s, sE = hitE.s, wE = Math.max(w || W0_MM, 1e-9), cos1 = Math.cos(Math.PI / 180);
    const info = [];
    let tb = null;
    for (const r of entryTangencyRoots(R, rail, X, s0, sE)) {
      const P = rail.at(r.s), arrive = mul(tangentTo(P.q, X), -1), score = dot(arrive, P.T);
      const sinA = Math.sqrt(Math.max(0, 1 - score * score)), resMm = R * Math.asin(Math.min(1, Math.abs(dot(X, cross(P.q, P.T)))));
      const ok = score > cos1 && tangencyOk(sinA, resMm, wE);
      info.push({ s: r.s, cls: r.cls, score, sin: sinA, resMm, ok });
      if (ok && !tb) tb = r;
    }
    entryRoots = info;
    if (tb) {
      sT = rail.at(tb.s).s; Tpt = rail.at(sT).q; splice = R * angle(X, Tpt);
      joinMode = 'tangent'; entryKind = 'braidTangent'; entryPiece = tb.cls;
    } else {
      // Fable (#50, 26.09): ℓ_m = max(w, 3δ) is the MINIMUM; M moves forward along the rail until the full angle between
      // the chord X_n → M and the rail tangent at M (so including the rail's turn up to M) is ≤ 20° — the friction cone on
      // the slope of the previous thread (atan μ ≈ 18°). Fail only if ≤ 20° is unreachable before the rail ends.
      const Lm = Math.max(w || 0, 3 * delta);
      const sEnd = Math.max(s0 + 1e-9, sE * 0.999), sMin = Math.min(s0 + Lm, sEnd);
      const turnAt = (sv) => { const P = rail.at(sv); return Math.acos(Math.max(-1, Math.min(1, dot(mul(tangentTo(P.q, X), -1), P.T)))) * 180 / Math.PI; };
      const J = braidJointMove(turnAt, sMin, sEnd, wE);
      sT = J.s; braidJoinShiftMm = J.shift;
      Tpt = rail.at(sT).q; splice = R * angle(X, Tpt);
      braidJoinTurnDeg = turnAt(sT);
      joinMode = 'braidCross'; entryKind = 'braidCross';
      if (!J.ok) entryFail = true;
    }
  } else if (dLat < 0) {
    // 6a.7(3) climb/merge: M at ℓ_m = max(w, 3δ) forward toward E
    const Lm = Math.max(w || 0, 3 * delta);
    const s0 = lat.s;
    const sE = hitE.s;
    sT = Math.min(s0 + Lm, Math.max(s0 + 1e-9, sE * 0.999));
    Tpt = rail.at(sT).q;
    splice = R * angle(X, Tpt);
    joinMode = 'climb';
    entryKind = 'climb';
  } else {
    // 6a.7(2)/6a.11: exterior geodesic tangent to rail at T (turn at T ≤ 1°).
    // Tangency: X lies in the great-circle plane spanned by q and Ta ⇒ dot(X, q×Ta)=0.
    const s0 = lat.s;
    const sE = hitE.s;
    // Search near the lateral foot at L_j ≈ √(2·d·w). Wide [s0,sE] scans found far false
    // tangents (splice ≈50 mm ≈ whole leg → near-end knees that GROW with sample count —
    // B.8 / same class as absolute 0.02 mm). Cap splice window; never use the foot as T.
    const Lj = Math.sqrt(Math.max(0, 2 * Math.abs(dLat) * Math.max(w || 0, 1e-6)));
    // Wide enough to find a true ≤1° tangent (narrow window forced climb with >20° kinks).
    // Spec v3.2 §3.2(10), (8′): the tangency lies L_j ≈ √(2·d_n·R/λ_r) along the rail from the foot, and a station X_n
    // before the core start first has to reach the core (the continuation is a great circle: no tangency on it). The
    // window must contain that point; the double tangency criterion (13б) rejects false roots.
    const lamR = Math.max(Math.abs(prevArm.lambda || 0), 1e-3);
    const LjSpec = Math.sqrt(Math.max(0, 2 * Math.abs(dLat) * R / lamR));
    const toCore = Number.isFinite(rail.coreS0) ? Math.max(0, rail.coreS0 + (bodyS0 || 0) - lat.s) : 0;
    const span = Math.max(8 * Lj, 12 * (w || 0), mmAtW(12, w || W0_MM), toCore + 2 * LjSpec);
    // sE ≥ s0 here (a backward E_n⁰ is the explicit contradiction above, #30): the window runs forward from the foot.
    const sLo = Math.max(0, s0 - 0.5 * span);
    const sHi = s0 + span;
    const spliceCap = Math.max(span, 20 * (w || 0));
    const cos1 = Math.cos(Math.PI / 180);
    const tangRes = (s) => {
      const P = rail.at(s);
      const q = P.q;
      const Ta = P.T; // v3 §3.2(8): the rail's exact, continuous tangent field (same as the exit)
      const spl = R * angle(X, q);
      // Co-directional arrival∥rail along travel toward E (no abs — abs accepted ~180° reverse).
      const Tdir = Ta;
      const arrive = mul(tangentTo(q, X), -1); // inbound at q from X
      return { q, Ta, P, res: dot(X, cross(q, Tdir)), score: dot(arrive, Tdir), spl };
    };
    // v3 §3.2(10)/(13б): the entry is a tangency found by geometry, not by a cost minimum — a
    // residual root (or a touching double root) that meets the same dimensionless criterion as
    // the exit: sin∠(rail tangent, arrival) ≤ 0.01 AND residual ≤ 0.02·w (v3.1, #39). Several numeric roots →
    // smallest residual, then nearest to the lateral foot. No tangency → the climb path below.
    const wE = Math.max(w || W0_MM, 1e-9);
    const entryOk = (t) => t.spl <= spliceCap + 1e-9 && t.score > cos1
      && tangencyOk(Math.sqrt(Math.max(0, 1 - t.score * t.score)), R * Math.asin(Math.min(1, Math.abs(t.res))), wE);
    const nScan = 160;
    const sSpan = Math.max(1e-9, sHi - sLo);
    const scan = [];
    for (let k = 0; k <= nScan; k++) { const sk = sLo + sSpan * (k / nScan); scan.push({ s: sk, ...tangRes(sk) }); }
    const cands = [];
    for (let k = 0; k < nScan; k++) {
      const a = scan[k], c = scan[k + 1];
      if (!(a.score > 0 && c.score > 0) || a.res * c.res > 0) continue;
      let lo = a.s, hi = c.s, flo = a.res;
      for (let it = 0; it < 48; it++) {
        const mid = 0.5 * (lo + hi), fm = tangRes(mid).res;
        if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
      }
      const sm = 0.5 * (lo + hi);
      cands.push({ s: sm, ...tangRes(sm), root: true });
    }
    for (let k = 1; k < nScan; k++) {
      const a = scan[k - 1], b = scan[k], c = scan[k + 1];
      if (!(b.score > 0) || Math.abs(b.res) > Math.abs(a.res) || Math.abs(b.res) > Math.abs(c.res)) continue;
      let lo = a.s, hi = c.s;
      for (let it = 0; it < 48; it++) {
        const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
        if (Math.abs(tangRes(m1).res) < Math.abs(tangRes(m2).res)) hi = m2; else lo = m1;
      }
      const sm = 0.5 * (lo + hi);
      cands.push({ s: sm, ...tangRes(sm) });
    }
    // Grid scan: a check only (10′). Its best tangency in the travel window [foot, E] is compared with the closed form.
    // Only sign-changing residual roots are tangencies; a |res| minimum without a sign change (a graze, e.g. at an inflection
    // joint between pieces curving opposite ways) is printed as a near miss, not taken.
    let scanBest = null, scanGraze = null;
    for (const c of cands) {
      if (!entryOk(c) || c.s - s0 < -1e-9 || sE - c.s < -1e-9) continue;
      if (!c.root) { if (!scanGraze || Math.abs(c.res) < Math.abs(scanGraze.res)) scanGraze = c; continue; }
      if (!scanBest || c.s < scanBest.s) scanBest = c;
    }
    // Spec (10′) (#46): the tangency is found in closed form on each piece of the rail (entry-segment parallel, corner
    // arcs, core, continuation), in travel order from the foot; the first one meeting (13б) is taken. No silent climb:
    // a climb from an exterior point is impossible (the kink at M has nothing holding it), so neither "no tangency →
    // climb" nor "> 1° → climb" exists any more. No tangency on any piece → the chord X_n → E_n⁰ is checked for
    // clearance to the laid row n−1: ≥ w(1 − εc) everywhere → a free leg (E_n = E_n⁰); otherwise a V22 fail (printed).
    const roots = entryTangencyRoots(R, rail, X, s0, sE);
    let best = null;
    const rootInfo = [];
    // (10′) with (9д), mirror of the exit rule (13а) (#45): on a rail with inflection joints more than one tangency can
    // exist; only a SUPPORTING one is a taut thread — its chord X_n → T keeps ≥ w(1 − εc) from the laid row n−1 (away
    // from both ends by w). The first root in travel order meeting (13б) and clear wins; skipped roots are counted.
    let laidEntry = null;
    const chordGapW = (Q) => {
      const om = angle(X, Q), L = R * om; if (L <= 2 * wE) return Infinity;
      laidEntry = laidEntry || laidChain(R, prevArm); let g = Infinity;
      const nC = Math.max(8, Math.ceil(L / (0.1 * wE)));
      for (let k = 1; k < nC; k++) { const tt = k / nC; if (tt * L < wE || (1 - tt) * L < wE) continue;
        const P = unit(add(mul(X, Math.sin((1 - tt) * om) / Math.sin(om)), mul(Q, Math.sin(tt * om) / Math.sin(om)))); g = Math.min(g, laidEntry.closest(P).distMm); }
      return g / wE;
    };
    for (const r of roots) {
      const c = { s: r.s, ...tangRes(r.s) };
      const sinA = Math.sqrt(Math.max(0, 1 - c.score * c.score)), resMm = R * Math.asin(Math.min(1, Math.abs(c.res)));
      const ok = entryOk(c), gap = ok && !best ? chordGapW(rail.at(r.s).q) : null;
      rootInfo.push({ s: r.s, cls: r.cls, score: c.score, sin: sinA, resMm, ok, chordGapW: gap });
      if (!best && ok) { if (gap >= 1 - EPS_C) best = { ...c, cls: r.cls, chordGapW: gap }; else entrySkipped++; }
    }
    entryRoots = rootInfo;
    entryScan = { closedS: best ? best.s : null, scanS: scanBest ? scanBest.s : null,
      grazeS: scanGraze ? scanGraze.s : null, grazeResMm: scanGraze ? R * Math.asin(Math.min(1, Math.abs(scanGraze.res))) : null,
      dsMm: best && scanBest ? Math.abs(best.s - scanBest.s) : null,
      mismatch: !!scanBest !== !!best || (best && scanBest && Math.abs(best.s - scanBest.s) > Math.max(0.02 * wE, sSpan / nScan)) };
    if (best) {
      sT = rail.at(best.s).s;
      Tpt = rail.at(sT).q;
      splice = R * angle(X, Tpt);
      joinMode = 'tangent';
      entryKind = 'tangent';
      entryPiece = best.cls;
    } else {
      // No tangency: chord X_n → E_n⁰ against the laid row n−1 (axis distance ≥ w(1 − εc) everywhere).
      const laid = laidChain(R, prevArm);
      const om = angle(X, E), L = R * om;
      const nChk = Math.max(16, Math.ceil(L / (0.1 * wE)));
      let gMin = Infinity, gAt = 0;
      for (let k = 0; k <= nChk; k++) {
        const tt = k / nChk;
        const g = om < 1e-15 ? X : unit(add(mul(X, Math.sin((1 - tt) * om) / Math.sin(om)), mul(E, Math.sin(tt * om) / Math.sin(om))));
        const d = laid.closest(g).distMm;
        if (d < gMin) { gMin = d; gAt = tt * L; }
      }
      entryMinGapW = gMin / wE;
      entryGapAtMm = gAt;
      let cand = null;
      for (const r of rootInfo) if (r.score > 0 && (!cand || r.resMm < cand.resMm)) cand = r;
      entryBest = cand;
      const cuts = gMin < wE * (1 - EPS_C);
      if (!cuts) {
        // free lower leg: E_n = E_n⁰, the whole leg is the chord
        entryKind = 'free'; sT = hitE.s; Tpt = E; splice = R * angle(X, E);
      } else if (dLat <= (DEG_MAX_OVR ?? DEG_MAX_W) * wE) {
        // (9б′) degenerate entry: chord X_n → M, ℓ_m = max(w, 3|d_n|) from the foot in travel order, then the rail (#22 rule at M).
        entryKind = 'degenerate';
        const Lm = Math.max(w || 0, 3 * Math.abs(dLat));
        sT = Math.min(s0 + Lm, Math.max(s0 + 1e-9, sE * 0.999));
        Tpt = rail.at(sT).q; splice = R * angle(X, Tpt);
      } else {
        // (9б′) |d_n| > 0.1·w: contradiction — chord X_n → E_n⁰ laid as is, V22 fail, build invalid from this row.
        entryKind = 'contradiction'; entryFail = true; sT = hitE.s; Tpt = E; splice = R * angle(X, E);
      }
      joinMode = entryKind;
    }
  }

  // Spec v3 §3.2(13) (= v2 6a.23, #21) upper end: E_n is fixed, so the exit is the tangent from a fixed point to the
  // (convex) rail. Window [T₁; rail end] in travel direction — never behind T₁ (no backward walk).
  // One continuous tangent field (rail.at(s).T, exact) for entry and exit. No cost pull toward E:
  // geometry chooses. Tangency is dimensionless: sin∠(rail tangent at T, T→E_n) ≤ 0.01 AND
  // residual ≤ 0.02·w (v3.1 §3.2(13б), #39); cos 5° is only a direction guard. Window (13в). No root → drain
  // at the hole (E inside the rail, mirror of (11)) or free geodesic from the end of contact (E
  // outside); fail only on contradiction (13г). Lower-end packing root: §3.2(12), no tangency search.
  const sT0 = sT;
  const sE0 = hitE.s;
  const forward = sE0 >= sT0;
  const railLen = rail.len;
  const sLo = forward ? sT0 : 0;
  const sHi = forward ? railLen : sT0;
  const dirS = forward ? 1 : -1;
  const cosAccept = Math.cos(5 * Math.PI / 180); // direction guard only (v3 §3.2(13б))
  const wEff = Math.max(w || W0_MM, 1e-9);
  const exitRes = (s) => {
    const P = rail.at(s);
    const q = P.q;
    const Tdir = forward ? P.T : mul(P.T, -1);
    const towardE = tangentTo(q, E);
    const res = dot(E, cross(q, Tdir));
    return {
      q, s, score: dot(towardE, Tdir), res,
      sin: Math.abs(dot(cross(Tdir, towardE), q)),
      resMm: R * Math.asin(Math.min(1, Math.abs(res))),
    };
  };
  const isTangent = (t) => t.score > cosAccept && tangencyOk(t.sin, t.resMm, wEff);
  // Scan step w/4 along the window: set by the thread, not by the output grid (#36).
  const nScan = Math.max(160, Math.ceil((sHi - sLo) / (0.25 * wEff)));
  const { samples, cands } = exitCandidates(exitRes, sLo, sHi, nScan);
  // Which end construction applies follows from the leg's role, not from a numeric band (#35):
  // a BOTTOM leg ends at E_n = the packing root on the rail (§3.2(12)), so the thread stays on the
  // rail up to the hole ('atE'; the tangent at E_n's own foot). E_n measurably off the rail there is
  // a construction contradiction: exitKind 'offRail', exitFail — a loud fail (V8), never a silent
  // continuation (§2, §5.6, #36). A TOP leg ends at a given hole: tangent from a point (13), drain
  // (13г) or free geodesic, never 'atE'.
  // E_n beyond the sampled extension: its lateral is the exact offset from the continued great circle (§3.2(8),
  // (12): the tail is continued to the root without a length limit), not the distance to the extension's end
  // signed by a near-zero dot (#40).
  const latE = rail.continuedLateral(E);
  const dE = latE.signedMm;
  const eOnRail = endLevel === 'bottom';
  const eOffRail = eOnRail && !(Math.abs(dE) < onRailTol);
  // Smallest tangency residual wins; residuals equal to 1e-9·w → first along travel.
  let best = null;
  // (13а) with (9д)/(13г) (#45 regression at λ = 0.4): on a rail with inflection joints (pieces curving opposite ways)
  // there can be more than the ≤ 2 tangency points of a convex curve. Only a SUPPORTING tangent is a taut thread: its
  // tail keeps ≥ w(1 − εc) from the laid row n−1 (checked away from both ends, within w of which the tail meets the rail
  // and the hole). Candidates in the (13а) order (smallest residual, ties first along travel); the first clear one wins;
  // none clear → the (13а) choice (V8 / (13г) report it).
  let laidX = null;
  const tailClear = (c) => {
    const om = angle(c.q, E), L = R * om;
    if (L <= 2 * wEff) return true;
    laidX = laidX || laidChain(R, prevArm);
    const nChk = Math.max(8, Math.ceil(L / (0.25 * wEff)));
    for (let k = 1; k < nChk; k++) {
      const tt = k / nChk;
      if (tt * L < wEff || (1 - tt) * L < wEff) continue;
      const g = unit(add(mul(c.q, Math.sin((1 - tt) * om) / Math.sin(om)), mul(E, Math.sin(tt * om) / Math.sin(om))));
      if (laidX.closest(g).distMm < wEff * (1 - 0.01)) return false;
    }
    return true;
  };
  let exitSkipped = 0;
  if (eOnRail) best = exitRes(sE0);
  else {
    const tang = cands.filter(isTangent).sort((a, b) => (Math.abs(a.resMm - b.resMm) <= 1e-9 * wEff ? dirS * (a.s - b.s) : a.resMm - b.resMm));
    best = tang.find(tailClear) || tang[0] || null;
    exitSkipped = best ? tang.indexOf(best) : 0;
  }
  let exitKind = eOffRail ? 'offRail' : eOnRail ? 'atE' : 'root', exitFail = eOffRail;
  if (!best) {
    if (dE <= 0) {
      // E_n inside (or on) the rail: drain at the hole, mirror of 6a.7(3): geodesic from the rail
      // point ℓ_m = max(w, 3δ) before E_n's foot to the hole.
      const deltaE = Math.max(0, -dE);
      const Lm = Math.max(w || 0, 3 * deltaE);
      const sDrain = forward ? Math.max(sT0, sE0 - Lm) : Math.min(sT0, sE0 + Lm);
      best = exitRes(sDrain);
      exitKind = 'drain';
      if (braid) {
        // #50 stage A (braid, decision 1(b)): no drain — the leg leaves the rail by a great circle to the hole, meeting the
        // rail at the (#22-mirror) point ℓ_m before E's foot (no tangency exists: the (13) search above found none).
        // Turn there printed; > 20° → V22 fail.
        // Fable (#50, 26.09), mirrored for the top-hole end: ℓ_m is the minimum; M moves along the rail away from the hole
        // (toward the entry joint) until the full angle chord M → E vs rail tangent at M is ≤ 20°; fail if unreachable.
        exitKind = 'braidCross';
        const turnE = (sv) => Math.acos(Math.max(-1, Math.min(1, exitRes(sv).score))) * 180 / Math.PI;
        const dirM = forward ? -1 : 1, u0 = 0, uEnd = Math.abs(sDrain - sT0);
        const J = braidJointMove((u) => turnE(sDrain + dirM * u), u0, uEnd, wEff);
        braidExitShiftMm = J.shift;
        if (J.shift > 0) best = exitRes(sDrain + dirM * J.s);
        braidExitTurnDeg = turnE(sDrain + dirM * J.s);
        if (!J.ok) exitFail = true;
      }
    } else {
      // E_n outside with no tangency: the rail ends where contact ends (6a.15) — the point of
      // maximum co-directionality toward E_n — and the exit is a free geodesic from there.
      let pk = samples[0];
      for (const t of samples) if (t.score > pk.score) pk = t;
      let a = Math.max(sLo, pk.s - (sHi - sLo) / nScan), b = Math.min(sHi, pk.s + (sHi - sLo) / nScan);
      for (let it = 0; it < 40; it++) {
        const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618;
        if (exitRes(m1).score < exitRes(m2).score) a = m1; else b = m2;
      }
      const pk2 = exitRes(0.5 * (a + b));
      best = pk2.score > pk.score ? pk2 : pk;
      // V6 at λ 0.1: the maximum of score = cos ψ is flat (ψ ≈ 0.02, ψ(s) ≈ ψ* + c·(s − s*)², c ≈ 1e−5/mm²), so the golden
      // section on cos ψ resolves s* only to √(ε/(sin ψ·c)) ≈ 2e−5 mm and rotation-equivalent stitches differed by up to
      // 4e−5 mm (clean class, B = rot(A)). Same point, well-conditioned: the root of the central difference of |sin ψ|
      // (slope 4·c·h) within one scan step; kept only if it is a sign change and not worse (a window end / joint kink keeps
      // the section result).
      {
        const hD = 1e-3 * wEff, stepS = (sHi - sLo) / nScan;
        const gD = (sv) => exitRes(sv + hD).sin - exitRes(sv - hD).sin;
        let ra = Math.max(sLo + hD, best.s - stepS), rb = Math.min(sHi - hD, best.s + stepS);
        if (ra < rb && gD(ra) < 0 && gD(rb) > 0) {
          for (let it = 0; it < 60; it++) { const mid = 0.5 * (ra + rb); if (gD(mid) < 0) ra = mid; else rb = mid; }
          const ref = exitRes(0.5 * (ra + rb));
          if (ref.score >= best.score - 1e-12) best = ref;
        }
      }
      exitKind = 'free';
      // Contradiction (the only fail): the free geodesic re-enters the tube of row n−1.
      const om = angle(best.q, E);
      const L = R * om;
      if (L > wEff) {
        const laid = laidChain(R, prevArm);
        const nChk = Math.max(8, Math.ceil(L / (0.25 * wEff)));
        for (let k = 1; k < nChk; k++) {
          const tt = k / nChk;
          if (tt * L < wEff) continue;
          const g = unit(add(mul(best.q, Math.sin((1 - tt) * om) / Math.sin(om)), mul(E, Math.sin(tt * om) / Math.sin(om))));
          if (laid.closest(g).distMm < wEff * (1 - 0.01)) { exitFail = true; break; }
        }
      }
      if (exitFail) exitKind = 'contradiction';
    }
  }
  // (10′): a lower leg with no tangency and a clear chord is free, E_n = E_n⁰ — the only lower free exit at λ > 0.
  if (entryKind === 'free' || entryKind === 'contradiction') { exitKind = entryFail ? 'contradiction' : 'free'; exitFail = exitFail || entryFail; }
  const exitSin = eOnRail ? 0 : best.sin, exitResMm = eOnRail ? Math.abs(dE) : best.resMm; // at E: tangent at the foot
  const exitAlongMm = Math.abs(best.s - sT0);
  const exitQ = best.q;
  // Analytic pieces of the leg: splice X_n → M (climb / degenerate) or X_n → T₁ (tangent), the rail T₁ … exit point,
  // the tail exit point → E_n (root: tangent; drain / free: a corner; bottom leg past the extension: continuation).
  const legArcs = [];
  // (10′) free lower leg: the whole leg is the chord X_n → E_n⁰ (class 'free' — the body the next rail is built on).
  if (splice > 1e-15) { const sp0 = arcGC(X, Tpt, entryKind === 'free' ? 'free' : entryKind === 'contradiction' ? 'contradiction' : 'splice'); if (sp0) legArcs.push(sp0); }
  // (10′) free / contradiction entry: the chord already ends at E_n⁰, so nothing follows it. Appending the rail from E's
  // foot to the exit search result plus the tail back to E_n made a there-and-back hairpin at E (≈0.15 mm, 180°) on
  // closing top legs at λ 0.1 / 0.2; at λ 0.2 m 1 the return point hit the previous vertex exactly under C×(1+1e−9)
  // → zero tangent in the tube mesh (NaN, V14 flip). The leg is the chord only, as the spec says.
  const chordOnly = (entryKind === 'free' || entryKind === 'contradiction') && legArcs.length > 0;
  if (!chordOnly) legArcs.push(...rail.sub(sT0, best.s));
  const Eend = unit(to);
  // Bottom leg ('atE', §3.2(12)): E_n is the packing root on the rail, so the rail itself ends at E_n
  // (|d_E| is round-off of the root on the same analytic rail; the arcs end at E_n's foot).
  // Past the sampled extension (latE clamped) the continuation to E_n is appended instead (#40).
  const gapE = R * ang(exitQ, Eend); // exact (acos has a ≈1e-6 mm floor here, #36)
  let offRailPiece = null;
  if (!chordOnly && !(exitKind === 'atE' && !latE.clamped) && gapE > Math.max(1e-9 * R, 1e-6 * ((w || W0_MM) / W0_MM))) {
    // The exit root is a tangency by construction (§3.2(13)); drain and free exits are real corners.
    // A bottom leg ('offRail') has no tail arc (a contradiction, flagged); its polyline still reaches E_n.
    // A bottom leg whose packing root lies past the sampled extension (latE clamped, #40) continues along the
    // same tangent great circle to E_n: that piece is the continuation ('ext', a tangency by construction).
    const tail = exitKind === 'offRail' ? null
      : exitKind === 'atE' ? arcGC(exitQ, Eend, 'ext')
      : arcGC(exitQ, Eend, 'tail');
    if (tail) legArcs.push(exitKind === 'root' || exitKind === 'atE' ? { ...tail, join: 'tangent' } : tail);
    else offRailPiece = arcGC(exitQ, Eend, 'tail');
  }
  // Output polyline (#22): exactly n segments distributed over the analytic pieces by arc length (largest remainder,
  // as freeLegLambda0), every joint kept as a vertex — M, T₁, the joints of the rail arcs, the exit point. No resample
  // across a corner: resampling cut the corner at M (turn 40–60 % of the constructed one, grid-dependent).
  const pieces = offRailPiece ? [...legArcs, offRailPiece] : legArcs.slice();
  const liveMm = 1e-6 * (w || W0_MM);   // shorter pieces are round-off slivers of a trim, not geometry
  const lensP = pieces.map((A) => R * arcLen(A));
  const live = lensP.map((L) => L > liveMm);
  if (!live.some(Boolean)) live[0] = true;
  const nLive = live.filter(Boolean).length;
  if (nLive > n) throw new Error(`railLeg: ${nLive} analytic pieces exceed the ${n} output segments`);
  const totalP = lensP.reduce((x, y, j) => x + (live[j] ? y : 0), 0) || 1e-15;
  const quota = lensP.map((L, j) => (live[j] ? 1 + (n - nLive) * L / totalP : 0));
  const kSeg = quota.map((q) => Math.floor(q));
  let left = n - kSeg.reduce((x, y) => x + y, 0);
  const order = quota.map((q, j) => [q - Math.floor(q), j]).filter(([, j]) => live[j]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let t = 0; left > 0 && order.length; t = (t + 1) % order.length, left--) kSeg[order[t][1]]++;
  const pts = [mul(X, R)];
  let iM = -1;   // vertex index of M / T₁ (end of the splice piece)
  for (let j = 0; j < pieces.length; j++) {
    if (!live[j]) continue;
    const A = pieces[j];
    for (let k = 1; k <= kSeg[j]; k++) pts.push(mul(arcPoint(A, A.psi * k / kSeg[j]), R));
    if (j === 0 && A.cls === 'splice') iM = pts.length - 1;
  }
  pts[0] = from.slice ? from.slice() : [...from];
  pts[n] = to.slice ? to.slice() : [...to];
  // Turn at the join (M / T₁) on the output polyline: M is a vertex, so this is the constructed turn up to the rail
  // chord's sagitta (κ_g·link/2); the constructed value is kept too.
  const turnAtTDeg = iM > 0 && iM < n ? turnDegAt(pts[iM - 1], pts[iM], pts[iM + 1]) : 0;
  const joinTurnConDeg = splice > 1e-15 && legArcs.length > 1
    ? (() => { const A = legArcs[0], B = legArcs[1], v = arcEnd(A); const T1 = arcTangent(A, v), T2 = arcTangent(B, B.a); return Math.atan2(dot(cross(T1, T2), v), dot(T1, T2)) * 180 / Math.PI; })()
    : 0;
  // #22 per-leg check at M (coordinator, option (i)): the expected turn is the angle between the chord X_n → M (its
  // tangent at M) and the direction of the rail link LEAVING M (the output link M → next vertex; M is a vertex, so on a
  // rail joint this is the outgoing arc's link). The output polyline must reproduce it within 0.2°.
  let mTurnExpDeg = null, railCornerFootToM = 0, clearFreeW = null, clearChordW = null;
  if (iM > 0 && iM < n && splice > 1e-15) {
    const sp = legArcs[0], Mv = arcEnd(sp);
    mTurnExpDeg = turnDegAt(sub(pts[iM], arcTangent(sp, Mv)), pts[iM], pts[iM + 1]);
    // rail corners (non-tangent joints or corner arcs) strictly between the foot of X_n and M
    const sA = Math.min(lat.s, sT0), sB = Math.max(lat.s, sT0), ra = rail.arcs;
    for (let j = 1; j < ra.length; j++) {
      const sj = rail.cum[j];
      if (sj <= sA || sj >= sB) continue;
      const v = ra[j].a, t1 = arcTangent(ra[j - 1], arcEnd(ra[j - 1])), t2 = arcTangent(ra[j], v);
      if (ra[j].cls === 'corner' || Math.abs(Math.atan2(dot(cross(t1, t2), v), dot(t1, t2))) > 1e-9) railCornerFootToM++;
    }
    if (railCornerFootToM > 0 && Array.isArray(prevArm.pts) && prevArm.pts.length > 1) {
      // (9д): clearance to the axis of the laid polyline of row n−1, counted from M (the start of what follows the
      // drain chord); the chord X_n → M itself is printed too (it starts inside the tube by construction).
      const P = prevArm.pts, dAx = (q) => { let d = Infinity; for (let i = 1; i < P.length; i++) d = Math.min(d, segSegDist(q, q, P[i - 1], P[i]).d); return d; };
      const wE = w || W0_MM;
      let dF = Infinity, dC = Infinity;
      for (let i = iM; i <= n; i++) dF = Math.min(dF, dAx(pts[i]));
      for (let i = 0; i <= iM; i++) dC = Math.min(dC, dAx(pts[i]));
      clearFreeW = dF / wE; clearChordW = dC / wE;
    }
  }
  // Largest interior turn on the output polyline (hole endpoints excluded; round-off duplicates dropped, #35).
  const rawT = rawTurnMax(R, pts, w);
  const rawTurnMaxDeg = rawT.deg, rawTurnAtMm = rawT.atMm;

  // 6a.9.1: kink angles (not κ_g) at hole and at climb/tangent merge — each ≤20°.
  // Hole kink ≈ discrete turn at the first interior sample (thread leaving the stitch).
  // Merge kink = turnAtTDeg already measured at the join onto the rail.
  let holeTurnDeg = 0;
  if (pts.length >= 3) {
    const nrm = unit(pts[1]);
    const proj = (v) => {
      const p = sub(v, mul(nrm, dot(v, nrm)));
      const len = Math.hypot(p[0], p[1], p[2]);
      return len < 1e-15 ? null : mul(p, 1 / len);
    };
    const tIn = proj(unit(sub(pts[1], pts[0])));
    const tOut = proj(unit(sub(pts[2], pts[1])));
    if (tIn && tOut) {
      const c = Math.max(-1, Math.min(1, dot(tIn, tOut)));
      const sn = Math.max(-1, Math.min(1, dot(cross(tIn, tOut), nrm)));
      holeTurnDeg = Math.atan2(sn, c) * 180 / Math.PI;
    }
  }
  const mergeTurnDeg = turnAtTDeg;

  let len = 0;
  for (let i = 1; i < pts.length; i++) len += R * angle(pts[i - 1], pts[i]);
  const Pc = prevArm.bowCenter ? unit(prevArm.bowCenter) : null;
  const rho = Pc ? angle(Pc, E) : Math.PI / 2;
  const lambda = (Pc && Math.sin(rho) > 1e-15) ? Math.abs(Math.cos(rho) / Math.sin(rho)) : 0;

  const railTurnFootToMDegV = (() => { const a = rail.at(lat.s), b = rail.at(sT0); const tb = sub(a.T, mul(b.q, dot(a.T, b.q))); const l = Math.hypot(...tb); return l < 1e-15 ? 0 : Math.atan2(dot(cross(mul(tb, 1 / l), b.T), b.q), dot(mul(tb, 1 / l), b.T)) * 180 / Math.PI; })();
  return {
    pts, length: len,
    shoulderForm: prevArm.shoulderForm === 'bow' ? 'bow' : 'geodesic',
    bowLateralMm: 0, phi3CapMm: 0, lambda, rho,
    bowCenter: Pc, phi3Warn: false, layMode: 'rail',
    spliceMm: splice, lateralMm: dLat, turnAtTDeg,
    // X inside the rail (the climb branch, d < −1e−9·w, (9б′) #46). On-rail X (|d| ≤ 1e−9·w, round-off, e.g. top legs) is
    // not interior: the old test d < −1e−6·w took the sign of ≈0 (#35).
    interiorXn: dLat < -onRailEps, lam0: false,
    // Diagnostic: X_n's lateral to the laying rail (core + continuation) — differs from d_n (8′) before the core start of a drain entry.
    railLateralMm: lat.signedMm ?? null, railFootClamped: lat.clamped || null,
    joinMode, braidJoinTurnDeg, braidExitTurnDeg, braidJoinShiftMm, braidExitShiftMm,
    climbMm: joinMode === 'climb' ? splice : 0,
    deltaMm: delta,
    deltaFail: delta > (w || 0) / 2,
    railKind,
    holeTurnDeg,
    mergeTurnDeg,
    exitKind, exitFail, exitSin, exitResMm, exitAlongMm, exitSkipped, rawTurnMaxDeg, rawTurnAtMm,
    exitDeMm: dE, arcs: legArcs,
    // #22 diagnostics: foot of X_n and M on the rail (arc length), the rail's own turn between them (deg) and the
    // constructed turn at M (chord → rail tangent).
    footS: lat.s, mS: sT0, railTurnFootToMDeg: railTurnFootToMDegV,
    joinTurnConDeg, mIdx: iM, mTurnExpDeg, railCornerFootToM, clearFreeW, clearChordW,
    // (9б′) degenerate entry: expected turn at M ≤ atan(|d_n|/ℓ_m) + the rail's own turn foot → M (#22 rule)
    mTurnBoundDeg: entryKind === 'degenerate' ? Math.atan(Math.abs(dLat) / Math.max(w || 0, 3 * Math.abs(dLat))) * 180 / Math.PI + Math.abs(railTurnFootToMDegV) : null,
    entryRoots, entrySkipped, entryChordGapW: entryKind === 'tangent' && entryRoots ? (entryRoots.find((r) => r.chordGapW >= 1 - EPS_C)?.chordGapW ?? null) : null, entryKind, entryPiece, entryMinGapW, entryGapAtMm, entryFail, entryBackward, entryBest, entryScan,
  };
}


function armPackNormal(arm) {
  // Spec v3.2 §3.2(9а), (12): E_n⁰ is the root with the parallel of the CONTINUED curve of row n−1 — at λ = 0 the great
  // circle of its last (free) arc; for a leg without a drain that is the great circle from → to.
  const last = !arm.bowCenter && arm.arcs?.length ? arm.arcs[arm.arcs.length - 1] : null;
  let nRef = unit(cross(arm.from, arm.to));
  if (last && Math.abs(last.rho - Math.PI / 2) < 1e-12) {
    const k = unit(last.k);
    nRef = dot(k, nRef) < 0 ? k.map((v) => -v) : k;
  }
  if (arm.bowCenter) {
    const E = unit(arm.to);
    const T = cross(arm.bowCenter, E); // arc tangent at E
    let n = unit(cross(E, T));         // local GC plane normal
    if (dot(n, nRef) < 0) n = n.map((v) => -v);
    return n;
  }
  return nRef;
}

/** Bottom level of row n≥2: lay flush → pierce at intersection.
 *  Fable v2 formula (8) for small-circle / concentric-rail prev arm: first root of
 *    ∠(P, E(s)) = ρ + w/R for s > s_prev only (never above the previous stitch).
 *  E(s) = perpPt on destination meridian with lateral eOff(s).
 *  (Do NOT use P×E packing plane — that is a different construction, ~2–3% off on Δ.)
 *  Geodesic prev arm: GC-plane parallel at distance w (from×to normal).
 *  Derived tip Δ only — no free Δ tip input.
 *  sidesAt(s) → needleSides at level s. */
function packThenPierce(R, prevArm, phiK, sInside, w, sMax, sidesAt) {
  const h = w / 10;
  const skipped = [];
  const prevPts = prevArm?.pts;
  // Pure geodesic row-1 (no bow): analytic GC-plane parallel — λ=0 Δ₂ = 4.968.
  // Bow / rail / climb: 6a.11(1) tangent continuation of the laid parallel (NOT concentric ρ+w/R).
  // 6a.11(1): tangent continuation of parallel of laid rail for ALL rows n≥2 (incl. row 2 bow).
  // Row-1 geodesic → row 2 keeps analytic GC plane (λ=0 Δ₂=4.968).
  // Strip climb/tangent geodesic PREFIX of prev before offsetting — that prefix is not the rail.
  // Bow / small-circle prev: tangent-parallel packing (6a.11(1) Δ₂ table).
  // Geodesic prev (incl. geodesic-derived rails): analytic GC plane (λ=0 → Δ₂=4.968, 5 rows).
  // 6a.12: bow / small-circle → tangent parallel; pure geodesic row-1 → analytic GC plane.
  // Geodesic-derived rails stay on the GC packing plane (λ=0: 5 rows, Δ₂=4.968).
  const useTangent = (prevArm?.shoulderForm === 'bow')
    || (prevArm?.layMode === 'smallCircle')
    || ((prevArm?.climbMm || 0) > 1e-9 && prevArm?.shoulderForm === 'bow');
  if (useTangent && prevPts && prevPts.length >= 2) {
    // Same analytic rail as railLeg (§3.2(8), #36): parallel of the laid arcs of row n−1, continued along
    // the great circle tangent at its end; g(s) = signed distance of E(s) to it is exact and smooth, so
    // the first transversal root is found by bisection without polyline-tip artefacts.
    const { rail } = railOf(R, prevArm, w);
    // §3.2(12): the tail great circle is continued to the first root with the E-line, without a length limit. Past
    // the sampled extension g is the exact offset from that great circle (continuedLateral), not the distance to
    // the extension's end signed by a near-zero dot (#40; the root is the same point, now of a continuous g).
    const gHit = (s) => rail.continuedLateral(unit(fPerp(R, FR, s, phiK, sidesAt(s).eOff)));
    const g = (s) => gHit(s).signedMm;
    // First transversal root with s > sInside. Skip spurious early roots (dense-grid chatter)
    // that would shrink Δ below ~0.7·expected (6a.12 / 6a.17 packing stability on 96/192/384).
    const minDs = Math.max(0.7 * (w || 0), mmAtW(1.0, w || W0_MM)); // ≥ ~0.7w
    let lo = sInside, glo = g(lo), hi = null, s = null, hit = null;
    let scan = sInside + h;
    while (scan <= sMax) {
      lo = scan - h; glo = g(lo); hi = null;
      for (let s1 = scan; s1 <= sMax; s1 += h) {
        const gs = g(s1);
        if (glo * gs <= 0 && Math.abs(glo) + Math.abs(gs) > 1e-12) { hi = s1; break; }
        lo = s1; glo = gs;
      }
      if (hi === null) break;
      let a = lo, fa = glo, b = hi;
      for (let it = 0; it < 60; it++) {
        const mid = (a + b) / 2, gm = g(mid);
        if (fa * gm <= 0) b = mid; else { a = mid; fa = gm; }
      }
      const sCand = (a + b) / 2;
      const hitCand = gHit(sCand);
      if ((sCand - sInside) >= minDs - 1e-9) { s = sCand; hit = hitCand; break; }
      skipped.push(sCand - sInside);
      scan = hi + h; // try next sign change
    }
    if (s == null || hit == null) return null; // no root — caller hard-fails (no silent sChan fallback)
    // Conditioning of the root: sin of the angle between the E-line (meridian direction) and the rail.
    const Es = unit(fPerp(R, FR, s, phiK, sidesAt(s).eOff));
    const crossSin = Math.abs(dot(fToward(FR, Es), hit.N));
    return { s, sPrevCross: null, sLaidCross: s, sigma: 1, method: 'tangentParallel', crossSin, onExt: hit.s < rail.coreS0 || hit.s > rail.coreS1, skipped };
  }
  // --- geodesic / GC packing-plane parallel at distance w ---
  let n = armPackNormal(prevArm);
  if (dot(n, FR.c) < 0) n = n.map((v) => -v);   // toward the kiku centre
  const sigma = -1;
  const target = sigma * Math.sin(w / R);
  const g = (s) => dot(n, unit(fPerp(R, FR, s, phiK, sidesAt(s).eOff))) - target;
  let lo = sInside, glo = g(lo), hi = null;
  for (let s = sInside + h; s <= sMax; s += h) { const gs = g(s); if (glo * gs <= 0) { hi = s; break; } lo = s; glo = gs; }
  if (hi === null) return null;
  for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2, gm = g(mid); if (glo * gm <= 0) hi = mid; else { lo = mid; glo = gm; } }
  const s = (lo + hi) / 2;
  const axisCross = (tg) => {
    const f = (t) => dot(n, unit(fPoint(R, FR, t, phiK))) - tg;
    let a = sInside, fa = f(a);
    for (let t = sInside + h; t <= sMax; t += h) {
      const ft = f(t);
      if (fa * ft <= 0) { let b = t; for (let it = 0; it < 60; it++) { const mid = (a + b) / 2, fm = f(mid); if (fa * fm <= 0) b = mid; else { a = mid; fa = fm; } } return (a + b) / 2; }
      a = t; fa = ft;
    }
    return null;
  };
  return { s, sPrevCross: axisCross(0), sLaidCross: axisCross(target), sigma, method: 'gcPlane' };
}

const MAX_ROWS_PER_SET = 40;   // предохранитель для «до экватора» (не замысел)

/** Последовательность наборов (буква = следующий ряд набора) из замысла порядка и числа рядов.
 *  alternate — A, B, A, B … (GT14); blocks — k×A, k×B, k×A … (Suess 2014: k = 5); sequence — явный список.
 *  При «до экватора» список длиннее нужного: генератор пути сам останавливает набор, когда кончик следующего ряда
 *  ушёл бы за предел (по фактическому уложенному, не по формуле). */
export function roundSequence(recipe, P) {
  const sets = recipe.work.sets.map((x) => x.set);
  if (P.order === 'sequence') return { letters: parseSequence(P.sequence, sets).letters, perSet: null, source: 'sequence' };
  const cap = P.rowsMode === 'count' ? P.rowsCount : MAX_ROWS_PER_SET;
  const letters = [];
  if (P.order === 'blocks') {
    const k = Math.max(1, Math.round(P.blockSize));
    for (let b = 0; b * k < cap; b++) for (const x of sets) for (let j = 0; j < k && b * k + j < cap; j++) letters.push(x);
  } else for (let n = 0; n < cap; n++) for (const x of sets) letters.push(x);
  return { letters, perSet: P.rowsMode === 'count' ? P.rowsCount : null, source: P.order };
}

/**
 * Построить все обходы последовательно в порядке roundSequence. Возвращает
 * { ops, segs, stitches, rounds, threads, crossings, sequence, stopped } — единый хронологический список; у каждого
 * сегмента — нить (thread), обход (round), набор (set), ряд (row) и координата длины u своей нити.
 */
export function buildWork(recipe, P, base, marking, layout, rowPlan = null) {
  if (!layout.program?.frame) throw new Error('path: the layout carries no program frame');
  FR = layout.program.frame;
  try { return buildWorkIn(recipe, P, base, marking, layout, rowPlan); } finally { FR = FRAME_N; }
}
function buildWorkIn(recipe, P, base, marking, layout, rowPlan) {
  // #53 commit 1 (spec §3.2): the round templates come from the layout's program (kiku(P, v, …)); N = stitches per round = v.
  const PG = layout.program;
  if (!PG) throw new Error('path: the layout carries no program');
  const R = base.R, N = PG.v, w = P.w_mm, m = P.m_mm, Q = base.Q;
  const T = recipe.kagari, conv = recipe.conventions, LV = recipe.levels;
  // Shoulder form: param overrides recipe convention; tip-drop Δ is always derived (never a free input).
  const shoulderForm = resolveShoulderForm(P.shoulderForm || conv.shoulderForm?.value || conv.lay?.value || 'geodesic');
  const muWrap = P.muWrap ?? P.mu ?? 0;
  const bowSide = P.bowSide === 'equator' ? 'equator' : 'pole';
  // #50 stage A: top rule flag (default fan = G3). k_top, ℓ_braid,max TEMPORARY until the §7a coordinates (#51).
  const BRAID = P.topRule === 'braid';
  const K_TOP = Number.isFinite(Number(P.kTop)) && P.kTop !== '' ? Number(P.kTop) : 0.5;
  // Commanded λ resolved per-leg once γ known; keep a preview using pin chord for tipDrop report.
  const mu = muWrap; // tipDrop report field (compat); Φ3 uses muWrap
  // Spec v3.2 §3.2(12) stop K12: at the equator the last row is allowed while its bottom ≤ s_eq + m/2 (the hole no farther
  // than the equator thread's half-width past its axis; class (iii), from m).
  // #52 commit 2: the region boundary comes from the layout's region address (S8: region(P.N, until=C.eq) → sMax = Q).
  const sMax = layout.region.sMax;
  const limit = (rowPlan ? rowPlan.limit : (P.rowsMode === 'untilOly7' ? sMax - 7 : sMax)) + (P.rowsMode === 'untilEquator' ? m / 2 : 0);
  const W = { ops: [], segs: [], stitches: [], rounds: [], threads: {}, crossings: [], stopped: {}, beyond: [], limit, squeezes: [], setCollisions: [], virtualArrive: {}, startTop: {},
    shoulderForm, tipDrop: null };
  // #53 case 2: region(P, until=graph) — the K12 limit of a bottom on half-line k is that half-line's length to the nearest
  // marking point (+ the same rowsMode rule); a uniform region keeps the single limit (S8: W unchanged).
  const sMaxK = layout.region.sMaxK || null;
  const limitOf = (k) => (sMaxK ? (P.rowsMode === 'untilOly7' ? sMaxK[k] - 7 : sMaxK[k]) + (P.rowsMode === 'untilEquator' ? m / 2 : 0) : limit);
  if (sMaxK) W.limitK = sMaxK.map((_, k) => limitOf(k));
  const lineIdx = (k) => ((k % N) + N) % N;
  // #52 commit 2: lines by address — half-line k of the kiku centre (layout.center), resolved once. #53 case 1: the (s, φ)
  // helpers work in the kiku frame (s from the centre, φ = the half-line azimuth phiOf; = phis[k] at P.N exactly).
  const hlCache = new Map();
  const hlOf = (k) => {
    const j = lineIdx(k);
    if (!hlCache.has(j)) hlCache.set(j, resolve(marking, `L(${layout.center},azimuth=${j})`));
    return hlCache.get(j);
  };
  const phiOf = (k) => hlOf(k).az;
  /** Row-1 bite of the layout (address + resolved point); a missing bite is a construction error. */
  const biteOf = (set, role, k) => {
    const b = layout.bites.find((x) => x.set === set && x.role === role && x.k === lineIdx(k));
    if (!b) throw new Error(`layout: no row-1 ${role} bite of set ${set} on half-line ${lineIdx(k)}`);
    return b;
  };
  const legList = [], laidList = [];          // уложенные плечи; всё уложенное (плечи, каналы, скрытый старт)
  const legs = () => legList;
  const laid = () => laidList;

  /** Уровень низа ряда n ≥ 2 на линии k — вывод из уже уложенного (packThenPierce + канал не налезает на прежний). */
  const bottomLevel = (k, prevRound) => {
    const prevSt = W.stitches.find((st) => st.round === prevRound.id && st.line === k && st.level === 'bottom');
    const prevArm = W.segs.find((x) => x.id === prevSt.legId);
    const sidesAt = (t) => needleSides({ R, line: hlOf(k), s: t, m, w, laid: laid() });
    const pp = packThenPierce(R, prevArm, phiOf(k), prevSt.s, w, 2 * Q - 1, sidesAt);
    // 6a.10/6a.11(1): no root → hard fail with message; NEVER silent max(…, sChan).
    if (!pp) return { fail: true, reason: `packing root missing: parallel of ${prevArm.id} + GC tangent does not meet E-line L${k} below s=${prevSt.s.toFixed(3)}` };
    const sChan = Math.max(...W.stitches.filter((st) => st.line === k && st.level === 'bottom').map((st) => st.s)) + w;
    // Channel clearance is informational only; packing root is authoritative.
    const s = pp.s;
    return { s, levelInfo: { rule: 'packThenPierce', method: pp.method, sPrev: prevSt.s, sPrevCross: pp.sPrevCross, sLaidCross: pp.sLaidCross, sPack: pp.s, sChan,
      crossSin: pp.crossSin ?? null, packSkipped: pp.skipped?.length ?? 0, packOnExt: pp.onExt ?? null,
      channelBinding: false, dS: s - prevSt.s, prevArm: prevArm.id, basis: LV.bottom.next.basis,
      shoulderForm: prevArm.shoulderForm || 'geodesic',
      bowLateralMm: prevArm.bowLateralMm || 0, phi3CapMm: prevArm.phi3CapMm || 0,
      lambda: prevArm.lambda || 0 } };
  };

  const seq = roundSequence(recipe, P);
  W.sequence = { ...seq, planned: [] };
  const rowsDone = {};
  const stopEarly = P.rowsMode !== 'count';
  for (const letter of seq.letters) {
    const setSpec = recipe.work.sets.find((x) => x.set === letter);
    if (!setSpec || W.stopped[letter]) continue;
    const row = (rowsDone[letter] || 0) + 1;
    const tmpl = row === 1 ? setSpec.row1 : setSpec.next;
    const bites = roundBites(PG, letter, row);
    const begin0 = (row === 1 ? PG.sets.find((x) => x.set === letter).row1 : PG.sets.find((x) => x.set === letter).next)[0];
    if ((begin0.kind === 'hidden' ? 'hiddenStart' : begin0.kind) !== tmpl.begin) throw new Error(`path: program ${PG.id} round ${letter}${row} begins with «${begin0.kind}», recipe «${tmpl.begin}»`);
    const spec = { id: `${letter}${row}`, set: letter, thread: setSpec.thread, row, startLine: setSpec.startLine, begin: tmpl.begin, basis: tmpl.basis };
    const prevRound = row > 1 ? W.rounds.find((r) => r.set === spec.set && r.row === row - 1) : null;
    // кончик этого ряда до шитья: первый стежок обхода — нижний, его уровень зависит только от уже уложенного
    const firstK = bites[0].k;
    const tip = row === 1 ? { s: biteOf(letter, 'bottom', firstK).s } : bottomLevel(firstK, prevRound);
    // §3.2(12), §6.2(г): no packing root is a construction failure (fail: true → V12 fail), never a silent stop.
    if (!tip || tip.fail) { W.stopped[letter] = { row, fail: true, reason: tip?.reason || 'laid parallel + GC tangent does not meet the E-line (packing root missing)' }; continue; }
    const limT = limitOf(firstK);
    if (tip.s > limT + 1e-9) {
      if (stopEarly) { W.stopped[letter] = { row, sTip: tip.s, reason: `row ${row} tip would land at s = ${tip.s.toFixed(3)} mm > limit ${limT.toFixed(3)} mm` }; continue; }
      W.beyond.push({ round: spec.id, sTip: tip.s, over: tip.s - limT });
    }
    rowsDone[letter] = row;
    W.sequence.planned.push(spec.id);
    const th = W.threads[spec.thread] || (W.threads[spec.thread] = { id: spec.thread, u: 0, segIds: [], rounds: [], park: null, parkStitch: null });
    const RD = { id: spec.id, set: spec.set, thread: spec.thread, row: spec.row, startLine: spec.startLine, begin: spec.begin,
      basis: spec.basis, opFirst: W.ops.length, stitchIdx: [], segIds: [], firstLegId: null, start: null, u0: th.u };
    th.rounds.push(RD.id);
    const addSeg = (seg) => {
      seg.id = `s${W.segs.length}`; seg.thread = th.id; seg.round = RD.id; seg.set = spec.set; seg.row = spec.row;
      seg.u0 = th.u; th.u += seg.length; seg.u1 = th.u;
      W.segs.push(seg); th.segIds.push(seg.id); RD.segIds.push(seg.id);
      laidList.push(seg);
      if (seg.type === 'leg') legList.push(seg);
      return seg;
    };
    const pushOp = (op) => { op.round = RD.id; op.thread = th.id; W.ops.push(op); return op; };
    const L0 = spec.startLine;

    // ---------- 1. Начало: скрытый старт новой нити или продолжение припаркованной ----------
    let cur;
    if (spec.begin === 'hiddenStart') {
      const sT = biteOf(spec.set, 'top', L0).s;
      const side0 = needleSides({ R, line: hlOf(L0), s: sT, m, w, laid: laid(), topSet: spec.set });
      const X0 = offsetOnLine(R, hlOf(L0), sT, side0.xOff);
      // Spec (12″) (#45): the hidden start of round 1 on its start line is an ordinary row-1 top stitch for placement and
      // occupancy — holes E₀, X₀ at ±(m+w)/2 on the needle line at s_T(1) (sides of the own cluster) and the channel E₀ → X₀
      // under the marking. Its only difference: no arriving leg — the start chord comes from inside, under the winding, and
      // surfaces at E₀. So the L0 cluster of later rows sees the same hole-entry / channel / hole-exit as on L2.
      const E0 = offsetOnLine(R, hlOf(L0), sT, side0.eOff);
      const rule = T.start.rules[P.startRule];
      const runs = rule.runs, Lrun = P.startRun_mm;
      const theta = 2 * Math.asin(Math.min(1, Lrun / (2 * R)));
      // start direction: the bisector of the sector before L0 at the row-1 bottom level (azimuth −π/v from L0)
      const M = pointOnLine(R, rotateHalfLine(hlOf(L0), -Math.PI / hlOf(L0).v), biteOf(spec.set, 'bottom', L0 + 1).s);
      const holes = [];
      for (let k = runs; k >= 0; k--) holes.push(k === 0 ? E0 : rotateToward(R, E0, M, k * theta));
      for (let k = 0; k < runs; k++) {
        const a = holes[k], b = holes[k + 1];
        const seg = addSeg({ type: 'hidden-start', from: a, to: b, pts: lineSeg(a, b, 24), length: dist(a, b),
          source: `${P.startRule}; направление — [E]`, tag: rule.tag, run: k + 1, runs, depthMax: R - Math.sqrt(R * R - (dist(a, b) / 2) ** 2) });
        const last = k === runs - 1;
        pushOp({ kind: 'start-run', segIds: [seg.id], run: k + 1, runs,
          label: t('path.start', {
            round: RD.id, thread: th.id, run: k + 1, runs,
            enter: k === 0 ? t('path.start.enter0') : t('path.start.enterN'),
            len: fmt(seg.length), depth: fmt(seg.depthMax),
            exit: last ? t('path.start.exitLast', { L0, xOff: fmt(side0.xOff, 3), sT: fmt(sT) }) : t('path.start.exitMid'),
          }),
          source: `${rule.basis}; ${T.start.direction.basis}; ${spec.basis}` });
      }
      // (12″): the start stitch's channel E₀ → X₀ (a pickup of row 1 at s_T(1), stitch 0, no arriving leg).
      const pk0 = addSeg({ type: 'pickup', from: E0, to: X0, pts: lineSeg(E0, X0, 12), length: dist(E0, X0), stitch: 0, line: L0, level: 'top',
        eOff: side0.eOff, xOff: side0.xOff, under: side0.cluster.map((c) => c.seg), cluster: side0.cluster, startStitch: true,
        source: `spec (12″) #45: hidden start = row-1 top stitch (holes ±(m+w)/2, channel), no arriving leg; ${conv.channel.basis}`, tag: conv.sides.tag,
        depthMax: R - Math.sqrt(R * R - (dist(E0, X0) / 2) ** 2) });
      RD.start = { X0, E0, holes, tail: holes[0], exitSides: side0, runs, Lrun, theta, channelId: pk0.id };
      // #50 T1: the start stitch is the previous stitch of L0 for the first braid placement on L0 (L0 ≡ L2 by construction).
      if (!W.startTop[spec.set]) W.startTop[spec.set] = { set: spec.set, line: L0, s: sT, eOff: side0.eOff, xOff: side0.xOff, startStitch: true };
      // the channel belongs to the last start op (surfacing at E₀, then E₀ → X₀): stage prefixes keep u continuous
      W.ops[W.ops.length - 1].segIds.push(pk0.id);
      cur = X0;
    } else {
      cur = th.park;
      RD.start = { resumeFrom: th.parkStitch, X0: cur };
      pushOp({ kind: 'resume', segIds: [], label: t('path.resume', { round: RD.id, thread: th.id, prev: th.rounds[th.rounds.length - 2] }),
        source: `${spec.basis}; TK-UWA; prior #94` });
    }

    // ---------- 2. Round stitches ----------
    let roundAbort = false;
    for (const bite of bites) {
      // the program's bite: half-line, role, level rule, closing (12′); the recipe pattern must agree (loud, never silent)
      const i = bite.i, closing = bite.closing, k = bite.k, level = bite.role;
      if (level !== T.pattern[(i - 1) % T.pattern.length] || k !== lineIdx(L0 + i)) throw new Error(`path: program ${PG.id} bite ${spec.id}.i${i} (${level} on h${k}) disagrees with the recipe pattern`);
      // (а) уровень стежка: ряд 1 — замысел; ряд n ≥ 2 — вывод из уже уложенного
      let s, levelInfo;
      if (level === 'top') {
        if (bite.rule === 'closingIsNextRowTop') {
          // Spec (12′) (#45): the closing stitch of round n on L0 IS the top stitch of row n+1 on L0 — one thread width
          // lower (and wider, by its own cluster) than the previous stitch on L0: the round-1 start hole X₀ at s_T(1), then
          // the closing stitches of earlier rounds. No separate round-start stitch on L0, no parking, no transition step.
          const prevCh = W.stitches.filter((st) => st.line === k && st.level === 'top').map((st) => st.s);
          const sPrev = Math.max(biteOf(spec.set, 'top', k).s, ...prevCh);
          s = sPrev + w;
          levelInfo = { rule: 'closingIsNextRowTop', sPrev, dS: w, rowTop: spec.row + 1, basis: `${LV.top.next.basis}; spec (12′) #45` };
        } else if (bite.rule === 'row1') { s = biteOf(spec.set, 'top', k).s; levelInfo = { rule: 'row1', basis: LV.top.row1.basis }; }
        else if (bite.rule === 'belowPrevChannel') {
          const prevCh = W.stitches.filter((st) => st.line === k && st.level === 'top');
          const sPrev = Math.max(...prevCh.map((st) => st.s));
          s = sPrev + w;
          levelInfo = { rule: 'belowPrevChannel', sPrev, dS: s - sPrev, basis: LV.top.next.basis };
        } else throw new Error(`path: top bite rule «${bite.rule}»`);
      } else if (bite.rule === 'row1') { s = biteOf(spec.set, 'bottom', k).s; levelInfo = { rule: 'row1', basis: LV.bottom.row1.basis }; }
      else {
        if (bite.rule !== 'packing-root') throw new Error(`path: bottom bite rule «${bite.rule}»`);
        const bl = bottomLevel(k, prevRound);
        if (!bl || bl.fail) {
          W.stopped[letter] = { row: spec.row, fail: true, reason: bl?.reason || 'packing root missing' };
          roundAbort = true; break;
        }
        ({ s, levelInfo } = bl);
      }
      // (б) needle placement from occupancy on line k at level s (causal prefix)
      // (12‴) (#45): on the set's start line the clusters also see the VIRTUAL arriving leg of the row-1 start stitch (G3
      // modelling device, not a thread: hole placement only — not in W.segs, length, rendering, V8, V16, K16, clearance).
      // #50 (12‴) in braid mode: removed (the L0 ≡ L2 symmetry follows from T1); in fan mode it stays.
      const virt = !BRAID && lineIdx(k) === lineIdx(spec.startLine) ? W.virtualArrive[spec.set] : null;
      const sides = needleSides({
        R, line: hlOf(k), s, m, w, laid: virt ? laid().concat([virt]) : laid(),
        // (12′): the closing stitch is a row-(n+1) top — its cluster covers every earlier row of the set (all of round n)
        uwagakeSet: level === 'top' && (spec.row >= 2 || closing) ? spec.set : null,
        uwagakeRow: level === 'top' ? (closing ? spec.row + 1 : spec.row >= 2 ? spec.row : 0) : 0,
        topSet: level === 'top' ? spec.set : null,
      });
      if (virt) {
        // the virtual leg placed the holes; it is not a thread, so it leaves the recorded cluster (printed separately)
        sides.virtualCluster = sides.cluster.filter((c) => c.seg === virt.id);
        sides.cluster = sides.cluster.filter((c) => c.seg !== virt.id);
        sides.ignored = (sides.ignored || []).filter((c) => c.seg !== virt.id);
        sides.squeeze = sides.squeeze.map((q) => (q.seg === virt.id ? { ...q, virtual: true } : q));
      }
      // #50 stage A, T1 (braid): a top stitch of row n ≥ 2 (and the closing = row n+1 top on L0) is placed from the previous
      // top stitch of its own line: s_T(n) = s_T(n−1) + w (above), each hole k_top·w further out than the previous one's
      // (h_n = h_{n−1} + k_top·w). k_top = 0.5 is TEMPORARY (TemariKai «about 1 thread-width wider»), calibrated by #51.
      // The G3 holes from the cluster stay recorded (sides.braid.g3) for comparison; the cluster/under records are kept.
      if (BRAID && level === 'top' && (spec.row >= 2 || closing)) {
        const own = W.stitches.filter((st) => st.set === spec.set && st.level === 'top' && lineIdx(st.line) === lineIdx(k));
        const prevTop = own.length ? own.reduce((a, b) => (b.s > a.s ? b : a))
          : (W.startTop[spec.set] && lineIdx(W.startTop[spec.set].line) === lineIdx(k) ? W.startTop[spec.set] : null);
        if (prevTop) {
          const sg = Math.sign(prevTop.eOff - prevTop.xOff) || 1, step = K_TOP * w;
          sides.braid = { g3: { eOff: sides.eOff, xOff: sides.xOff }, prev: { s: prevTop.s, eOff: prevTop.eOff, xOff: prevTop.xOff, start: !!prevTop.startStitch, round: prevTop.round ?? null },
            kTop: K_TOP, temporary: true, hPrev: Math.abs(prevTop.eOff - prevTop.xOff) / 2 };
          sides.eOff = prevTop.eOff + sg * step;
          sides.xOff = prevTop.xOff - sg * step;
          sides.braid.h = Math.abs(sides.eOff - sides.xOff) / 2;
        }
      }
      const E = offsetOnLine(R, hlOf(k), s, sides.eOff);
      const X = offsetOnLine(R, hlOf(k), s, sides.xOff);
      for (const q of sides.squeeze) W.squeezes.push({ hole: q.side === 'E' ? E : X, set: spec.set, round: RD.id, line: k, i, ...q });
      // §5.3 (2) (#38): a top bite under a foreign surface thread (axis closer than w/2) is a legal crossing «under» —
      // U14 «set collision» (warn) with row, segment, distance and whether the bite lies inside the span
      // [x_X(k); x_E(k)] of a foreign top stitch along the latitude circle s_T(k) (same schedule for both sets).
      sides.setCollision = level === 'top'
        ? setCollisions({ R, s, phi: phiOf(k), holes: { E: { y: sides.eOff, H: E }, X: { y: sides.xOff, H: X } }, foreignUnder: sides.foreignUnder, laid: laid(), stitches: W.stitches, set: spec.set })
        : [];
      for (const q of sides.setCollision) W.setCollisions.push({ round: RD.id, set: spec.set, row: spec.row, line: k, i, s, ...q });
      // (в) lay thread: row 1 = geodesic/small-circle bow; row n≥2 = rail along previous arm (Fable v2)
      let legShape;
      if (spec.row === 1) {
        const gamma = angle(cur, E);
        const { lambda: lamCmd } = resolveBowLambda(P, { R, gamma });
        legShape = layLeg(R, cur, E, phiOf(k), shoulderForm, lamCmd, bowSide);
      } else {
        const prevLeg = prevRound
          ? W.segs.find((x) => x.round === prevRound.id && x.type === 'leg' && x.stitch === i)
          : null;
        legShape = prevLeg
          ? railLeg(R, cur, E, prevLeg, w, level, { braid: BRAID })
          : layLeg(R, cur, E, phiOf(k), 'geodesic', 0, 'pole');
      }
      const legPts = legShape.pts;
      const layBasis = (spec.row === 1 && shoulderForm === 'bow')
        ? (conv.shoulderForm?.basis || conv.lay.basis)
        : (spec.row >= 2 ? 'Fable v2 Errata 6a.11: parallel of laid prev arm + GC tangent continuation' : conv.lay.basis);
      const leg = addSeg({ type: 'leg', from: cur, to: E, pts: legPts, length: legShape.length, stitch: i, line: k, level,
        source: layBasis, tag: conv.lay.tag, crossings: [],
        shoulderForm: legShape.shoulderForm, bowLateralMm: legShape.bowLateralMm, phi3CapMm: legShape.phi3CapMm,
        bowSide: legShape.bowSide || null,
        lambda: legShape.lambda ?? 0, rho: legShape.rho, bowCenter: legShape.bowCenter || null,
        layMode: legShape.layMode || (spec.row === 1 ? 'row1' : 'rail'),
        spliceMm: legShape.spliceMm ?? 0, lateralMm: legShape.lateralMm ?? 0, turnAtTDeg: legShape.turnAtTDeg ?? 0, interiorXn: !!legShape.interiorXn,
        joinMode: legShape.joinMode || null, climbMm: legShape.climbMm ?? 0, deltaMm: legShape.deltaMm ?? 0, deltaFail: !!legShape.deltaFail,
        railKind: legShape.railKind || null, holeTurnDeg: legShape.holeTurnDeg ?? 0, mergeTurnDeg: legShape.mergeTurnDeg ?? 0,
        exitKind: legShape.exitKind || null, exitFail: !!legShape.exitFail, exitSin: legShape.exitSin ?? null, exitResMm: legShape.exitResMm ?? null, exitAlongMm: legShape.exitAlongMm ?? null, exitSkipped: legShape.exitSkipped ?? 0,
        rawTurnMaxDeg: legShape.rawTurnMaxDeg ?? null, rawTurnAtMm: legShape.rawTurnAtMm ?? null,
        exitDeMm: legShape.exitDeMm ?? null, arcs: legShape.arcs,
        joinTurnConDeg: legShape.joinTurnConDeg ?? null, railTurnFootToMDeg: legShape.railTurnFootToMDeg ?? null,
        mIdx: legShape.mIdx ?? null, mTurnExpDeg: legShape.mTurnExpDeg ?? null, mTurnBoundDeg: legShape.mTurnBoundDeg ?? null, railCornerFootToM: legShape.railCornerFootToM ?? 0,
        clearFreeW: legShape.clearFreeW ?? null, clearChordW: legShape.clearChordW ?? null, footS: legShape.footS ?? null, mS: legShape.mS ?? null,
        entrySkipped: legShape.entrySkipped ?? 0, entryChordGapW: legShape.entryChordGapW ?? null, entryKind: legShape.entryKind ?? null, entryPiece: legShape.entryPiece ?? null, entryMinGapW: legShape.entryMinGapW ?? null, entryGapAtMm: legShape.entryGapAtMm ?? null,
        entryFail: !!legShape.entryFail, entryBackward: !!legShape.entryBackward, entryBest: legShape.entryBest ?? null, entryScan: legShape.entryScan ?? null,
        braidJoinTurnDeg: legShape.braidJoinTurnDeg ?? null, braidExitTurnDeg: legShape.braidExitTurnDeg ?? null,
        braidJoinShiftMm: legShape.braidJoinShiftMm ?? null, braidExitShiftMm: legShape.braidExitShiftMm ?? null,
        lam0: legShape.lam0 ?? null, railLateralMm: legShape.railLateralMm ?? null, exitTurnDeg: legShape.exitTurnDeg ?? null, minGapMm: legShape.minGapMm ?? null });
      if (i === 1) RD.firstLegId = leg.id;
      if (!BRAID && i === 1 && spec.begin === 'hiddenStart' && !W.virtualArrive[spec.set]) {
        // (12‴): the virtual arriving leg of the start stitch = the mirror of this first leg about the start line's meridian,
        // traversed toward the start stitch (for the geodesic row 1 the same as leg i2 rotated back two lines).
        const nM = hlOf(spec.startLine).n;   // pole of the start half-line (S_N: (−sin φ, cos φ, 0))
        const refl = (q) => { const d = 2 * dot(q, nM); return [q[0] - d * nM[0], q[1] - d * nM[1], q[2] - d * nM[2]]; };
        const vpts = leg.pts.map(refl).reverse();
        W.virtualArrive[spec.set] = { id: `virt-${spec.set}`, type: 'leg', virtual: true, set: spec.set, row: 1, level: 'top', stitch: 0,
          round: RD.id, thread: th.id, line: spec.startLine, from: vpts[0], to: vpts[vpts.length - 1], pts: vpts, length: leg.length,
          source: 'spec (12‴) #45: virtual arriving leg of the row-1 start stitch (G3 modelling device, hole placement only)' };
      }
      // перекресты и прилегания со ВСЕМИ ранее уложенными плечами (обе нити): правило над/под
      for (const other of legs()) {
        if (other.id === leg.id) continue;
        for (const z of legZones(leg, other, w)) {
          const passUnder = closing && T.closing.passUnder.includes('roundFirstLeg') && other.id === RD.firstLegId;
          // плечо к низу начинается у верхней точки, плечо к верху — кончается у неё (узор низ/верх чередуется)
          const topEnd = (level === 'bottom' && z.i0 <= 1) || (level === 'top' && z.i1 >= legPts.length - 1);
          let kind, rule, allowed = true;
          if (z.crossing) {
            kind = 'crossing';
            rule = passUnder ? `${spec.row === 1 ? 'TK-LITTLE' : 'TK-LITTLE (перенос на ряд n, b)'}: замыкающее плечо ПОД первым плечом обхода`
              : (other.set !== spec.set ? `позже уложенная сверху (G8, #102) ⇒ переплетение наборов (GT14 «kousa»)` : 'позже уложенная сверху (G8, #102, A14)');
          } else if (other.set === spec.set && other.row < spec.row && topEnd) {
            kind = 'wedge'; rule = 'uwagake: у верхней точки рабочая нить лежит ПОВЕРХ прежних рядов (GT14 «over the previously placed threads»)';
          } else if (W.squeezes.some((q) => dist(q.hole, z.min.cp) < 2 * w &&
              ((endsAt(leg, q.hole) && other.set !== q.set) || (endsAt(other, q.hole) && leg.set !== q.set)))) {
            kind = 'squeeze'; rule = 'тесное место: прокол посередине зазора < w до нити соседней точки (#105); нити должны сжаться — не моделируется (U14, V19); позже уложенная сверху';
          } else if (leg.interiorXn && other.set === spec.set && other.row === spec.row - 1
              && (leg.climbMm > 0 ? (z.min.i / Math.max(1, legPts.length - 1)) * (leg.length || 1) <= (leg.climbMm + w) : z.min.i <= 4)) {
            // Errata 6a.7: climb/merge onto previous rail — mark V8 class «climb» next to «squeeze»
            kind = 'climb'; rule = 'climb/merge (Errata 6a.7): new thread climbs onto previous within ℓ_m of the hole (uwagake wedge start); kinks ≤20°';
          } else if (leg.layMode === 'rail' && other.set === spec.set && other.row === spec.row - 1 && z.min.d >= w * (1 - 1e-3)) {
            kind = 'rail-parallel'; rule = 'rail parallel of prev row at distance w (Errata 6a.11 packing); flush contact expected';
            allowed = true;
          } else { kind = 'contact'; rule = 'contact closer than w without crossing — not allowed by rule'; allowed = false; }
          const sp = fSAz(R, FR, z.min.cp);
          const c = { id: `c${W.crossings.length}`, a: leg.id, b: other.id, over: passUnder ? other.id : leg.id, under: passUnder ? leg.id : other.id,
            kind, rule, allowed, at: z.min.cp, s: sp.s, phiDeg: sp.phi * 180 / Math.PI, dmin: z.min.d,
            angleDeg: crossAngleDeg(legPts, z.min.i, other.pts, z.min.j), iA: z.min.i, iB: z.min.j, lenMm: z.lenMm,
            rounds: [RD.id, other.round] };
          W.crossings.push(c); leg.crossings.push(c);
        }
      }
      const crossTxt = leg.crossings.map((c) => t('path.cross.item', {
        kind: c.kind === 'wedge' ? t('path.cross.wedge') : t('path.cross.crossing'),
        b: c.b, round: W.segs.find((x) => x.id === c.b).round, s: fmt(c.s),
        over: c.over === leg.id ? t('path.over') : t('path.under'),
      })).join('; ');
      pushOp({ kind: 'lay', segIds: [leg.id], stitch: i, line: k, level, closing,
        label: t('path.lay', {
          round: RD.id, thread: th.id, line: k,
          level: level === 'top' ? t('path.level.top') : t('path.level.bottom'),
          row: spec.row, closing: closing ? t('path.closing') : '',
          form: t('path.form.' + legShape.shoulderForm, {}, legShape.shoulderForm),
          len: fmt(leg.length),
          cross: (crossTxt ? `; ${crossTxt}` : '') + (closing ? t('path.lay.closingUnder') : ''),
        }),
        source: closing ? `${T.closing.basis}; ${conv.closingUnder.basis}` : `${layBasis}; ${T.patternBasis}; ${conv.crossing.basis}` });
      // (г) стежок: прямой канал E → X под нитью разметки и всем кластером
      const pk = addSeg({ type: 'pickup', from: E, to: X, pts: lineSeg(E, X, 12), length: dist(E, X), stitch: i, line: k, level,
        eOff: sides.eOff, xOff: sides.xOff, under: sides.cluster.map((c) => c.seg), cluster: sides.cluster,
        source: `${conv.sides.basis}; ${conv.needle.basis}; ${conv.channel.basis}`, tag: conv.sides.tag,
        depthMax: R - Math.sqrt(R * R - (dist(E, X) / 2) ** 2) });
      const nameOf = (id) => { const x = W.segs.find((q) => q.id === id); return x ? `${id}/${x.round}` : id; };
      const underTxt = sides.cluster.map((c) => (c.kind === 'marking' ? t('path.under.marking', { line: k })
        : c.kind === 'marking-neighbour' ? t('path.under.markingNeighbour', { line: lineIdx(k + c.line) })
        : `${nameOf(c.seg)} (${t('path.kind.' + c.kind, {}, c.kind)})`)).join(', ');
      const levelExtra = levelInfo.rule === 'belowPrevChannel'
        ? t('path.level.belowPrev', { prev: spec.row - 1, sPrev: fmt(levelInfo.sPrev, 3) })
        : levelInfo.rule === 'packThenPierce'
          ? t('path.level.packThenPierce', { prevArm: levelInfo.prevArm, dS: fmt(levelInfo.dS, 2), prev: spec.row - 1 })
          : '';
      pushOp({ kind: 'stitch', segIds: [pk.id], stitch: i, line: k, level, closing,
        label: t('path.stitch', {
          round: RD.id, i, line: k,
          level: level === 'top' ? t('path.level.top') : t('path.level.bottom'),
          s: fmt(s, 3), eOff: fmt(sides.eOff, 3), xOff: fmt(sides.xOff, 3),
          under: underTxt, len: fmt(pk.length, 3),
        }) + levelExtra,
        source: `${pk.source}; ${levelInfo.basis}` });
      const st = { round: RD.id, set: spec.set, row: spec.row, thread: th.id, i, line: k, level, s, E, X, eOff: sides.eOff, xOff: sides.xOff,
        legId: leg.id, pickupId: pk.id, closing, sides, levelInfo };
      RD.stitchIdx.push(W.stitches.length);
      W.stitches.push(st);
      cur = X;
    }
    if (roundAbort) {
      // Drop partial round artifacts; stop this set (hard fail already recorded).
      continue;
    }
    th.park = cur; th.parkStitch = `${RD.id}/${N}`;
    pushOp({ kind: 'park', segIds: [], label: t('path.park', { round: RD.id, thread: th.id, N }), source: T.end.basis });
    RD.opLast = W.ops.length - 1;
    RD.u1 = th.u;
    RD.length = th.u - RD.u0;
    W.rounds.push(RD);
  }
  W.ops.forEach((o, idx) => { o.idx = idx; });
  // уровни стопки в перекрестах — топология (кто над кем), не высота; высоты — механика (этап 2.4)
  stackLevels(W, w);
  for (const t of Object.values(W.threads)) t.uEnd = t.u;
  // Derived tip drop Δ = s_bottom(A2) − s_bottom(A1) for set A (first bottoms). Result only — never a free input.
  {
    const a1 = W.stitches.find((st) => st.round === 'A1' && st.level === 'bottom' && st.i === 1);
    const a2 = W.stitches.find((st) => st.round === 'A2' && st.level === 'bottom' && st.i === 1);
    if (a1 && a2) {
      const prevLeg = W.segs.find((x) => x.id === a1.legId);
      const tipDrop_mm = a2.s - a1.s;
      const phi3CapMm = prevLeg?.phi3CapMm ?? 0;
      const bowLateralMm = prevLeg?.bowLateralMm ?? 0;
      const lambda = prevLeg?.lambda ?? 0;
      // Craft band ~1.5–2.5 mm may be *reported* in diagnostics; do not assert or fail on it (D40).
      W.tipDrop = {
        set: 'A', rowFrom: 1, rowTo: 2,
        sBottom1: a1.s, sBottom2: a2.s, tipDrop_mm,
        shoulderForm, bowLateralMm, phi3CapMm, mu: muWrap, muWrap, bowLambda: P.bowLambda ?? null, bowSagMm: P.bowSagMm ?? null, bowSide, lambda,
        phi3Warn: false, warn: null,
      };
      {
        const rails = W.segs.filter((s) => s.type === 'leg' && s.layMode === 'rail');
        const interior = rails.filter((s) => s.interiorXn);
        const byRow = {};
        for (const s of interior) {
          const k = `r${s.row}/${s.level}`;
          byRow[k] = (byRow[k] || 0) + 1;
        }
                const climbs = interior.filter((s) => s.joinMode === 'climb');
        const turns = climbs.map((s) => Math.abs(s.mergeTurnDeg ?? s.turnAtTDeg ?? 0));
        const holeTurns = rails.map((s) => Math.abs(s.holeTurnDeg ?? 0));
        const deltas = rails.map((s) => ({
          id: s.id, row: s.row, level: s.level, d: s.deltaMm ?? Math.max(0, -(s.lateralMm ?? 0)),
          join: s.joinMode, kind: s.railKind,
        }));
        const dVals = deltas.map((x) => x.d);
        const wHalf = w / 2;
        const dOk = mmAtW(0.15, w);
        const bandOk = dVals.filter((d) => d > 0 && d <= dOk).length;
        const bandDiag = dVals.filter((d) => d > dOk && d <= wHalf).length;
        const bandFail = dVals.filter((d) => d > wHalf).length;
        const byRowDelta = {};
        for (const x of deltas) {
          if (!(x.d > 0)) continue;
          const k = `r${x.row}`;
          if (!byRowDelta[k]) byRowDelta[k] = { n: 0, max: 0, fail: 0, diag: 0, ok: 0 };
          byRowDelta[k].n++;
          byRowDelta[k].max = Math.max(byRowDelta[k].max, x.d);
          if (x.d > wHalf) byRowDelta[k].fail++;
          else if (x.d > dOk) byRowDelta[k].diag++;
          else byRowDelta[k].ok++;
        }
        W.railDiagnostics = {
          railLegs: rails.length,
          interiorXnCount: interior.length,
          interiorXnByRow: byRow,
          interiorXnIds: interior.map((s) => s.id),
          climbCount: climbs.length,
          climbTurnMaxDeg: turns.length ? Math.max(...turns) : 0,
          climbTurnMedDeg: turns.length ? turns.slice().sort((a, b) => a - b)[turns.length >> 1] : 0,
          holeTurnMaxDeg: holeTurns.length ? Math.max(...holeTurns) : 0,
          deltaMmMax: dVals.length ? Math.max(0, ...dVals) : 0,
          deltaBandOk: bandOk,       // δ ≤ 0.15 — consistent (6a.9.3)
          deltaBandDiag: bandDiag,   // 0.15 < δ ≤ w/2 — diagnostics
          deltaBandFail: bandFail,   // δ > w/2 — G3 occupancy bug
          deltaByRow: byRowDelta,
          note: 'Errata 6a.11: rail=parallel of laid polyline + GC tangent; δ to actual prev (incl. climb); δ≤0.15·(w/w0) ok, ≤w/2 diag, >w/2 G3 bug; kink ≤20°',
        };
      }
    }
  }
  // (9б′) (#46): a contradiction entry (no tangency, chord X_n → E_n⁰ cuts the tube, |d_n| > 0.1·w) marks the build invalid
  // from its row: rows ≥ n are left out of the row count and of V5, V6, V8, K16 (no cascade acceptance); V22 prints it.
  {
    const bad = W.segs.filter((x) => x.type === 'leg' && x.entryKind === 'contradiction');
    const first = bad.reduce((a, x) => (!a || x.row < a.row ? x : a), null);
    W.invalidFrom = first ? { row: first.row, leg: first.id, round: first.round, stitch: first.stitch, dW: first.lateralMm / (w || W0_MM), gapW: first.entryMinGapW, legs: bad.map((x) => x.id) } : null;
    W.rowsValid = {};
    for (const r of W.rounds) if (!(first && r.row >= first.row)) W.rowsValid[r.set] = Math.max(W.rowsValid[r.set] || 0, r.row);
  }
  return W;
}

/** Порядковый уровень «над»: в перекресте c верхняя нить на 1 выше, чем нижняя в этой точке (хронологически).
 *  Это топология (порядок), а не высота: подъём нить-на-нить — механика, этап 2.4 (крючок: A.mechanics). */
function stackLevels(W, w) {
  const byOver = new Map();
  const levelAt = (segId, i) => {
    let lv = 0;
    for (const c of byOver.get(segId) || []) {
      const seg = W.segs.find((x) => x.id === segId);
      const ic = c.over === c.a ? c.iA : c.iB;
      const half = c.halfSamples ?? 3;
      if (Math.abs(i - ic) <= half) lv = Math.max(lv, c.stack);
      void seg;
    }
    return lv;
  };
  for (const c of W.crossings) {
    const overSeg = W.segs.find((x) => x.id === c.over);
    const iUnder = c.under === c.a ? c.iA : c.iB;
    const sinA = Math.max(0.05, Math.sin(c.angleDeg * Math.PI / 180));
    const halfMm = c.kind === 'crossing' ? w / sinA : Math.max(w, c.lenMm / 2);
    c.halfMm = halfMm;
    c.halfSamples = Math.ceil(halfMm / (overSeg.length / (overSeg.pts.length - 1)));
    c.stack = 1 + levelAt(c.under, iUnder);
    if (!byOver.has(c.over)) byOver.set(c.over, []);
    byOver.get(c.over).push(c);
  }
}

/** Last op index for a stage — prefix into the SAME path.ops array (step slider and stage buttons share ops; full run only uses a later index).
 *  Stages from recipe.stages ('2a'|'2b'|'B1'|'A2'|'all') use throughOp; bare round ids (A3, B5 …) end at that round's park. */
export function stageLastOp(recipe, ops, stage) {
  const st = recipe.stages[stage];
  if (!st) {                                   // id обхода: до его парковки включительно
    const idx = ops.findIndex((o) => o.round === stage && o.kind === 'park');
    return idx < 0 ? ops.length - 1 : idx;
  }
  const spec = st.throughOp;
  if (spec.round === '*') return ops.length - 1;
  const idx = ops.findIndex((o) => o.round === spec.round && o.kind === spec.kind && (spec.stitch === undefined || o.stitch === spec.stitch));
  return idx < 0 ? ops.length - 1 : idx;
}
