// Генератор пути: чистая функция (рецепт + параметры + предыдущие слои) → упорядоченный список операций и
// сегментов рабочих нитей (по одной на цвет) для обходов в порядке, выведенном из замысла (roundSequence: по ряду
// A1, B1, A2 … — GT14; блоками A1…A5, B1…B5 — Suess 2014; явная последовательность).
// Шитьё последовательное: всё — E/X, уровни рядов n ≥ 2, над/под в перекрестах — выводится из того, что уже
// лежит на шаре после предыдущих операций (причинный префикс). Никаких сохранённых координат и сдвигов.
import { resolveBowLambda,  parseSequence } from './params.js';
import { t, fmtNum } from './i18n.js';
import {
  point, offsetPt, slerp, lineSeg, geodLen, dist, rotateToward, toSPhi, wrapPi, tangentTo, ePole, dot,
  closeZones, angle, unit, add, sub, mul, cross, eEast, perpPt, segSegDist, polyLen,
} from './geom.js';

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
 */
export function needleSides({ R, s, phi, m, w, N, laid, uwagakeSet = null, uwagakeRow = 0 }) {
  const C = point(R, s, phi);
  const uC = unit(C), eL = eEast(C), n = ePole(C);        // n — нормаль плоскости линии иглы
  const r = R * Math.sin(s / R);
  const spacing = r * 2 * Math.PI / N;                     // расстояние до соседней линии (по параллели)
  const occ = [];
  const coord = (p) => { const q = unit(p); return { f: R * Math.asin(Math.max(-1, Math.min(1, dot(q, n)))), y: R * Math.atan2(dot(q, eL), dot(q, uC)) }; };
  // пересечение меридиана φ' с линией иглы: координата y и синус угла между ними
  const meet = (ph) => {
    const nMer = [-Math.sin(ph), Math.cos(ph), 0];
    let d = unit(cross(nMer, n));
    if (dot(d, uC) < 0) d = d.map((v) => -v);
    const y = R * Math.atan2(dot(d, eL), dot(d, uC));
    const sn = Math.max(1e-6, Math.sqrt(Math.max(0, 1 - dot(unit(cross(n, d)), unit(cross(nMer, d))) ** 2)));
    return { y, sn };
  };
  // соседние нити разметки L(k±1)
  let win = spacing;
  for (const sg of [1, -1]) {
    const { y, sn } = meet(phi + sg * 2 * Math.PI / N);
    const wid = m / sn;
    occ.push({ lo: y - wid / 2, hi: y + wid / 2, y, seg: 'marking', kind: 'marking-neighbour', line: sg });
    win = Math.max(win, Math.abs(y) + wid / 2);
  }
  win += w;
  // «своя точка»: сектор линии k между биссектрисами (φ ± π/N). Обход uwagake — вокруг нитей ЭТОЙ точки
  // (TK-UWA «take a stitch around all of them»); занятость с центром за биссектрисой принадлежит соседней точке.
  const yBis = { right: meet(phi + Math.PI / N).y, left: meet(phi - Math.PI / N).y };
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
    const c = pts.map(coord);
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
    for (let i = 1; i < pts.length; i++) {
      const P = c[i - 1], Qp = c[i];
      const iv = capsuleOnLine(P.y, P.f, Qp.y, Qp.f, h);
      if (!iv || iv[1] < -win || iv[0] > win) { flush(); continue; }
      if (!run) run = { lo: iv[0], hi: iv[1], cross: false, touchStart: false, touchEnd: false };
      else { run.lo = Math.min(run.lo, iv[0]); run.hi = Math.max(run.hi, iv[1]); }
      if (seg.type === 'leg' && i === 1 && Math.abs(P.f) <= h) run.touchStart = true;
      if (seg.type === 'leg' && i === pts.length - 1 && Math.abs(Qp.f) <= h) run.touchEnd = true;
      if (P.f * Qp.f < 0 || (P.f === 0) !== (Qp.f === 0)) { run.cross = true; run.yCross = P.f === Qp.f ? P.y : P.y + (P.f / (P.f - Qp.f)) * (Qp.y - P.y); }
    }
    flush();
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
  return { eOff: R_.off, xOff: L_.off, cluster: used, ignored: rest, spacing, window: win, bisector: yBis, squeeze };
}

const endsAt = (seg, H) => dist(seg.from, H) < 1e-9 || dist(seg.to, H) < 1e-9;

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
  const poleSign = Math.sign(dot([0, 0, 1], xe)) || 1;
  // Fable v2: production = pole side; equator side is the direction negative-test mutation.
  const wantSign = side === 'equator' ? -poleSign : poleSign;
  const match = cands.filter((p) => (Math.sign(dot(p, xe)) || 1) === wantSign);
  if (match.length) return match.sort((p, q) => q[2] - p[2])[0];
  return cands.sort((p, q) => (side === 'equator' ? p[2] - q[2] : q[2] - p[2]))[0];
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
      bowCenter: null, phi3Warn: false, layMode: 'geodesic',
    };
  }
  const rho = Math.atan(1 / lambda); // arccot(λ)
  const Pc = smallCircleCenter(from, to, rho, bowSide === 'equator' ? 'equator' : 'pole');
  if (!Pc) {
    return {
      pts: slerp(R, from, to, n), length: geoLen,
      shoulderForm: 'geodesic', bowLateralMm: 0, phi3CapMm: 0, lambda: 0, rho: Math.PI / 2,
      bowCenter: null, phi3Warn: false, layMode: 'geodesic',
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
  };
}


/**
 * Point on the small circle ∠(P,·)=ρ in the radial direction of `toward`.
 * Used to place the rail start on the concentric circle near X_n (short splice).
 */
function onSmallCircle(Pc, rho, toward) {
  const k = unit(Pc), t = unit(toward);
  const radial = unit(sub(t, mul(k, dot(t, k))));
  return unit(add(mul(k, Math.cos(rho)), mul(radial, Math.sin(rho))));
}

/**
 * Row n≥2 rail = parallel curve of the ACTUALLY laid polyline of row n−1, offset w
 * outward (Errata 6a.7(1)). Concentric-about-P is only the special case when that
 * polyline is a small-circle arc. Measure signed d_n against THIS rail, then join:
 *   exterior (d>0): geodesic tangent at T (kink at T ≤1°);
 *   interior (δ>0): climb/merge to M at ℓ_m=max(w,3δ) forward (kinks ≤20°).
 */

/** Unit tangent at sample i of polyline (toward increasing index). */
function polyTangent(pts, i) {
  if (i <= 0) return tangentTo(pts[0], pts[1]);
  if (i >= pts.length - 1) return tangentTo(pts[pts.length - 2], pts[pts.length - 1]);
  return unit(add(tangentTo(pts[i - 1], pts[i]), tangentTo(pts[i], pts[i + 1])));
}

/**
 * Continuous unit tangent at an arc-length point P={q,i,t} of a polyline: vertex tangents
 * of i and i+1 blended by t and projected onto the tangent plane at q. Unlike the
 * piecewise-constant polyTangent(pts, P.i), this has no jumps at vertices, so tangency
 * residuals have only genuine roots (no facet-boundary pseudo-roots whose selection
 * would depend on float round-off, scale or sample count).
 */
function polyTangentAt(pts, P) {
  const q = unit(P.q);
  const j = Math.min(P.i + 1, pts.length - 1);
  const v = add(mul(polyTangent(pts, P.i), 1 - P.t), mul(polyTangent(pts, j), P.t));
  return unit(sub(v, mul(q, dot(v, q))));
}

/** Outward unit normal in the tangent plane at p for polyline tangent T.
 *  Always equatorward (increasing bottom-s): next packed tip lies toward the equator.
 *  Using “away from bowCenter” is wrong for equator-side bows (P equatorward ⇒ radial is poleward). */
function polyOutwardN(p, T, prevArm) {
  void prevArm;
  let N = unit(cross(p, T));
  if (dot(N, ePole(p)) > 0) N = mul(N, -1); // equatorward
  return N;
}

/** Parallel offset of spherical polyline by geodesic distance w (mm) outward. */
function parallelOffsetPoly(R, pts, w, prevArm) {
  const alpha = (w || 0) / R;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = unit(pts[i]);
    const T = polyTangent(pts, i);
    const N = polyOutwardN(p, T, prevArm);
    out.push(mul(unit(add(mul(p, Math.cos(alpha)), mul(N, Math.sin(alpha)))), R));
  }
  return out;
}

/**
 * Extend a spherical polyline past both ends so a nearby X_n / E_n whose along-track
 * position falls just outside the previous arm still has a true lateral foot on the rail
 * (Errata 6a.7: X_n sits ~w ahead along the needle, often ~1° before the prior arc start).
 */
function extendPolyEnds(R, pts, extMm, w = W0_MM) {
  if (!pts || pts.length < 2 || !(extMm > 0)) return pts;
  const ext = extMm / R; // rad
  const step = mmAtW(0.5, w);
  const nExt = Math.max(2, Math.min(32, Math.round(extMm / Math.max(step, 1e-9))));
  const T0 = tangentTo(pts[1], pts[0]); // outward at start (backward)
  const T1 = tangentTo(pts[pts.length - 2], pts[pts.length - 1]); // forward at end
  const pre = [];
  for (let i = nExt; i >= 1; i--) {
    const a = ext * (i / nExt);
    pre.push(mul(unit(add(mul(unit(pts[0]), Math.cos(a)), mul(T0, Math.sin(a)))), R));
  }
  const post = [];
  for (let i = 1; i <= nExt; i++) {
    const a = ext * (i / nExt);
    post.push(mul(unit(add(mul(unit(pts[pts.length - 1]), Math.cos(a)), mul(T1, Math.sin(a)))), R));
  }
  return [...pre, ...pts, ...post];
}

/** True iff rail-borne samples of prev arm lie on a small circle about bowCenter.
 *  Climb/tangent geodesic prefixes (spliceMm) leave the circle and must be skipped — otherwise
 *  packing for n≥3 falsely rejects the concentric special case and falls into the w-tube path. */
function isSmallCircleArm(prevArm, tolMm) {
  if (!prevArm?.bowCenter || !Number.isFinite(prevArm.rho) || !prevArm.pts || prevArm.pts.length < 3) return false;
  const Pc = unit(prevArm.bowCenter);
  const R = Math.hypot(prevArm.pts[0][0], prevArm.pts[0][1], prevArm.pts[0][2]);
  // 0.02 mm at C=240 (R=C/2π); scale with R so ×k does not flip the class.
  if (tolMm == null) tolMm = 0.02 * (R / (240 / (2 * Math.PI)));
  const skipMm = Math.max(prevArm.climbMm || 0, prevArm.spliceMm || 0);
  let cum = 0;
  const samples = [];
  for (let i = 0; i < prevArm.pts.length; i++) {
    if (i > 0) cum += R * angle(prevArm.pts[i - 1], prevArm.pts[i]);
    if (cum + 1e-9 * R >= skipMm) samples.push(prevArm.pts[i]);
  }
  if (samples.length < 3) return false;
  const step = Math.max(1, Math.floor(samples.length / 12));
  for (let i = 0; i < samples.length; i += step) {
    if (Math.abs(R * (angle(Pc, unit(samples[i])) - prevArm.rho)) > tolMm) return false;
  }
  return true;
}


function closestOnPoly(R, u, pts) {
  const U = unit(u);
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = unit(pts[i]), b = unit(pts[i + 1]);
    const om = angle(a, b);
    if (om < 1e-15) continue;
    let lo = 0, hi = 1;
    for (let it = 0; it < 36; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      const p1 = unit(add(mul(a, Math.sin((1 - m1) * om) / Math.sin(om)), mul(b, Math.sin(m1 * om) / Math.sin(om))));
      const p2 = unit(add(mul(a, Math.sin((1 - m2) * om) / Math.sin(om)), mul(b, Math.sin(m2 * om) / Math.sin(om))));
      if (angle(U, p1) <= angle(U, p2)) hi = m2; else lo = m1;
    }
    const tt = 0.5 * (lo + hi);
    const q = unit(add(mul(a, Math.sin((1 - tt) * om) / Math.sin(om)), mul(b, Math.sin(tt * om) / Math.sin(om))));
    const d = R * angle(U, q);
    const T = unit(sub(b, mul(q, dot(b, q))));
    if (!best || d < best.distMm) best = { q, i, t: tt, distMm: d, T };
  }
  if (!best) {
    const q = unit(pts[0]);
    return { q, i: 0, t: 0, distMm: R * angle(U, q), T: polyTangent(pts, 0) };
  }
  return best;
}

/** Signed lateral mm from unit X to polyline: >0 outward, <0 inward. */
function signedLateralToPoly(R, X, pts, prevArm) {
  const hit = closestOnPoly(R, X, pts);
  const N = polyOutwardN(hit.q, hit.T, prevArm);
  const towardX = unit(sub(unit(X), mul(hit.q, dot(unit(X), hit.q))));
  const signedMm = hit.distMm * (dot(towardX, N) >= 0 ? 1 : -1);
  return { ...hit, N, signedMm };
}

/** Arc length (mm) from start of polyline to sample (i,t). */
function polyArcMm(R, pts, i, t) {
  let L = 0;
  for (let k = 0; k < i; k++) L += R * angle(pts[k], pts[k + 1]);
  if (i < pts.length - 1 && t > 0) L += t * R * angle(pts[i], pts[i + 1]);
  return L;
}

/** Point at arc length sMm along polyline. */
function pointAtArcMm(R, pts, sMm) {
  let rem = Math.max(0, sMm);
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = R * angle(pts[i], pts[i + 1]);
    if (rem <= seg + 1e-15 || i === pts.length - 2) {
      const u = seg > 1e-15 ? Math.min(1, Math.max(0, rem / seg)) : 0;
      const a = unit(pts[i]), b = unit(pts[i + 1]);
      const om = angle(a, b);
      const q = om < 1e-15 ? a
        : unit(add(mul(a, Math.sin((1 - u) * om) / Math.sin(om)), mul(b, Math.sin(u * om) / Math.sin(om))));
      return { q, i, t: u };
    }
    rem -= seg;
  }
  return { q: unit(pts[pts.length - 1]), i: pts.length - 2, t: 1 };
}

/**
 * Resampled slice of polyline from (i0,t0) toward `to` (nSeg segments).
 * Walks along arc-length in the direction of the projection of `to` — forward OR
 * backward — so T₁…T₂ is never traversed against travel (avoids ~180° foldbacks).
 */
function polySliceToward(R, pts, i0, t0, to, nSeg) {
  const s0 = polyArcMm(R, pts, i0, t0);
  const hitTo = closestOnPoly(R, to, pts);
  const sTo = polyArcMm(R, pts, hitTo.i, hitTo.t);
  const forward = sTo >= s0 - 1e-12;
  const start = pointAtArcMm(R, pts, s0).q;
  const end = pointAtArcMm(R, pts, sTo).q;
  const chunk = [mul(unit(start), R)];
  if (forward) {
    for (let i = i0 + 1; i <= hitTo.i; i++) chunk.push(pts[i]);
    chunk.push(mul(unit(end), R));
  } else {
    for (let i = i0; i > hitTo.i; i--) chunk.push(pts[i]);
    chunk.push(mul(unit(end), R));
  }
  for (let i = chunk.length - 1; i > 0; i--) {
    if (R * angle(chunk[i], chunk[i - 1]) < 1e-12) chunk.splice(i, 1);
  }
  if (chunk.length < 2) chunk.push(mul(unit(end), R));
  const n = Math.max(1, nSeg);
  const lens = [0];
  for (let i = 1; i < chunk.length; i++) lens.push(lens[i - 1] + R * angle(chunk[i - 1], chunk[i]));
  const total = lens[lens.length - 1] || 1e-15;
  const out = [];
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * total;
    let j = 0;
    while (j < lens.length - 2 && lens[j + 1] < target) j++;
    const seg = lens[j + 1] - lens[j] || 1e-15;
    const u = (target - lens[j]) / seg;
    const a = unit(chunk[j]), b = unit(chunk[Math.min(j + 1, chunk.length - 1)]);
    const om = angle(a, b);
    if (om < 1e-15) out.push(mul(a, R));
    else out.push(mul(unit(add(mul(a, Math.sin((1 - u) * om) / Math.sin(om)), mul(b, Math.sin(u * om) / Math.sin(om)))), R));
  }
  return out;
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

function railLeg(R, from, to, prevArm, w = 0) {
  const n = getLegSamples();
  const prevPts = prevArm?.pts;
  if (!prevPts || prevPts.length < 2) {
    return {
      pts: slerp(R, from, to, n), length: geodLen(R, from, to),
      shoulderForm: 'geodesic', bowLateralMm: 0, phi3CapMm: 0, lambda: 0, rho: Math.PI / 2,
      bowCenter: null, phi3Warn: false, layMode: 'rail',
      spliceMm: 0, lateralMm: 0, turnAtTDeg: 0, interiorXn: false, joinMode: 'free',
      climbMm: 0, deltaMm: 0, deltaFail: false, railKind: 'free',
      holeTurnDeg: 0, mergeTurnDeg: 0,
    };
  }

  // 6a.17(2) / 6a.15: free geodesic X→E is ONLY the contact boolean.
  // Contact iff min gap to laid axis of row n−1 < w·(1−ε), ε=0.01; else free leg.
  // Path when contact: geometric T₁ (tangent/climb from X) → rail → T₂ → E (one contiguous segment).
  // No hysteresis / min-gap break; dual incursions ⇒ non-convex rail anomaly.
  // Bow / small-circle prev: rail almost full length (6a.15) — skip free-exit; always geometric rail.
  if (prevArm.shoulderForm === 'geodesic' && !prevArm.bowCenter) {
    const X0 = unit(from), E0 = unit(to);
    const omFree = angle(X0, E0) || 1e-15;
    const nGap = Math.max(48, n);
    const epsTube = 0.01;
    const wContact = Math.max(w || 0, 1e-15) * (1 - epsTube);
    let minGap = Infinity;
    let inTube = null, transitions = 0, segments = 0, segStart = -1;
    for (let i = 0; i <= nGap; i++) {
      const t = i / nGap;
      const g = unit(add(
        mul(X0, Math.sin((1 - t) * omFree) / Math.sin(omFree)),
        mul(E0, Math.sin(t * omFree) / Math.sin(omFree)),
      ));
      const d = pointPolyDistMm(R, g, prevPts);
      if (d < minGap) minGap = d;
      const inside = d < wContact;
      if (inTube === null) { inTube = inside; if (inside) { segments = 1; segStart = i; } }
      else if (inside !== inTube) {
        transitions++;
        inTube = inside;
        if (inside) { segments++; segStart = i; }
      }
    }
    const dualIncursion = segments > 1; // non-convex rail anomaly (6a.17); one geometric rail still built
    if (minGap >= wContact) {
      // Free leg — no rail.
      const pts = slerp(R, from, to, n);
      const latHit = signedLateralToPoly(R, X0, prevPts, prevArm);
      const dLat = Math.max(0, latHit.distMm - (w || 0)) * (latHit.signedMm >= 0 ? 1 : -1);
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
      const Pc = prevArm.bowCenter ? unit(prevArm.bowCenter) : null;
      const rho = Pc ? angle(Pc, E0) : Math.PI / 2;
      const lambda = (Pc && Math.sin(rho) > 1e-15) ? Math.abs(Math.cos(rho) / Math.sin(rho)) : 0;
      return {
        pts, length: geodLen(R, from, to),
        shoulderForm: prevArm.shoulderForm === 'bow' ? 'bow' : 'geodesic',
        bowLateralMm: 0, phi3CapMm: 0, lambda, rho,
        bowCenter: Pc, phi3Warn: false, layMode: 'rail',
        spliceMm: 0, lateralMm: dLat, turnAtTDeg: 0, interiorXn: false,
        joinMode: 'free', climbMm: 0, deltaMm: 0, deltaFail: false,
        railKind: 'free', holeTurnDeg, mergeTurnDeg: 0,
        tubeTransitions: transitions, tubeSegments: segments, minGapMm: minGap, dualIncursion,
      };
    }
  } // end geodesic-form free-exit (6a.17 ε=0.01)

  // Contact: one contiguous geometric rail (tangent/climb entry → rail → tangent exit / 6a.7 splice).
  // 6a.11(1)/(2)(C): parallel of laid curve. When packing used the GC plane (geodesic-form prev),
  // build the same GC-plane parallel here so E lands on the rail (no tip-snap knees).
  // Bow / small-circle: poly-parallel of laid polyline. Extend ends by GC tangent.
  const extMm = Math.max(5 * (w || 0), mmAtW(10, w || W0_MM));
  let railPts, railKind;
  // Match packThenPierce: any geodesic-form prev (row-1 layMode 'geodesic', rails, …)
  // uses the GC packing plane. Excluding 'geodesic' forced poly-parallel → false
  // near-on-rail lat≈0 and tip-snap knees that grow with N (B.8 / 6a.15).
  const gcPack = prevArm.shoulderForm === 'geodesic' && !prevArm.bowCenter;
  let corePts;
  if (gcPack) {
    // Same construction as packThenPierce GC branch: parallel of the great circle
    // through prev.from → prev.to (not the climb-kinked polyline).
    let nrm = armPackNormal(prevArm);
    if (dot(nrm, [0, 0, 1]) > 0) nrm = mul(nrm, -1); // equatorward
    const alpha = (w || 0) / R;
    const A0 = unit(prevArm.from), B0 = unit(prevArm.to);
    const om = angle(A0, B0) || 1e-15;
    const nCore = Math.max(16, getLegSamples());
    corePts = [];
    for (let i = 0; i <= nCore; i++) {
      const t = i / nCore;
      const g = unit(add(mul(A0, Math.sin((1 - t) * om) / Math.sin(om)), mul(B0, Math.sin(t * om) / Math.sin(om))));
      corePts.push(mul(unit(add(mul(g, Math.cos(alpha)), mul(nrm, Math.sin(alpha)))), R));
    }
    railPts = extendPolyEnds(R, corePts, extMm, w || W0_MM);
    railKind = 'gc-plane-parallel';
  } else {
    // Match packThenPierce tangentParallel: offset the rail BODY only (strip climb/tangent prefix).
    const skipMm = Math.max(prevArm.climbMm || 0, prevArm.spliceMm || 0, 0);
    let body = prevPts;
    if (skipMm > 1e-9) {
      let cum = 0, i0 = 0;
      for (let i = 1; i < prevPts.length; i++) {
        cum += R * angle(prevPts[i - 1], prevPts[i]);
        if (cum + 1e-9 >= skipMm) { i0 = i; break; }
      }
      body = prevPts.slice(Math.max(0, i0));
      if (body.length < 2) body = prevPts;
    }
    corePts = parallelOffsetPoly(R, body, w || 0, prevArm);
    railPts = extendPolyEnds(R, corePts, extMm, w || W0_MM);
    railKind = 'poly-parallel';
  }
  const X = unit(from), E = unit(to);
  // Lateral: prefer extended rail (bow tips need the GC extension). But if the extension
  // creates a false near-zero foot while the CORE says X is far outside (λ=0 geodesic
  // arms), use the core lateral — otherwise tiny splices + tip knees ∝ N (B.8).
  const latExt = signedLateralToPoly(R, X, railPts, prevArm);
  const latCore = signedLateralToPoly(R, X, corePts, prevArm);
  let lat, dLat;
  // onRail band: |d| < 0.02·w (dimensionless, so ×k similarity cannot flip it).
  const onRailTol = 0.02 * Math.max(w || W0_MM, 1e-9);
  // When the core foot is clamped at a core END (X lies beyond the core along-track), the core
  // distance is along-track, not lateral, and sign(dot(towardX, N)) is the sign of a near-zero
  // quantity (towardX ∥ T): round-off, not geometry — it flipped joinMode across CPUs (x86 vs
  // arm64). There the lateral side is read from the extended rail, which is the true lateral
  // measure: X counts as outside only if it is off the extension by more than the onRail band.
  const nCore = corePts.length;
  const coreFootAtEnd = (latCore.i === 0 && latCore.t < 1e-3)
    || (latCore.i >= nCore - 2 && latCore.t > 1 - 1e-3);
  const coreOutside = coreFootAtEnd ? latExt.signedMm > onRailTol : latCore.signedMm > (w || 0);
  // Only when CORE says clearly OUTSIDE (not a bow tip/climb interior) yet extension
  // claims nearly on-rail — the λ=0 geodesic false-foot pattern.
  const falseExtFoot = coreOutside
    && latCore.distMm > 2 * (w || 0)
    && Math.abs(latExt.signedMm) < 0.5 * (w || 0);
  if (falseExtFoot) {
    dLat = latCore.distMm; // outside ⇒ positive; magnitude only (sign may be round-off at an end)
    lat = closestOnPoly(R, latCore.q, railPts);
    lat.signedMm = dLat;
  } else {
    lat = latExt;
    dLat = latExt.signedMm;
  }
  const delta = dLat < 0 ? -dLat : 0;
  const hitE = closestOnPoly(R, E, railPts);

  let Tpt, splice, joinMode;
  // Scale with w so xk similarity does not flip onRail/climb (absolute 1e-6 mm thresh).
  if (Math.abs(dLat) < onRailTol) {
    Tpt = lat.q; splice = 0; joinMode = 'onRail';
  } else if (dLat < 0) {
    // 6a.7(3) climb/merge: M at ℓ_m = max(w, 3δ) forward toward E
    const Lm = Math.max(w || 0, 3 * delta);
    const s0 = polyArcMm(R, railPts, lat.i, lat.t);
    const sE = polyArcMm(R, railPts, hitE.i, hitE.t);
    const sM = Math.min(s0 + Lm, Math.max(s0 + 1e-9, sE * 0.999));
    Tpt = pointAtArcMm(R, railPts, sM).q;
    splice = R * angle(X, Tpt);
    joinMode = 'climb';
  } else {
    // 6a.7(2)/6a.11: exterior geodesic tangent to rail at T (turn at T ≤ 1°).
    // Tangency: X lies in the great-circle plane spanned by q and Ta ⇒ dot(X, q×Ta)=0.
    const s0 = polyArcMm(R, railPts, lat.i, lat.t);
    const sE = polyArcMm(R, railPts, hitE.i, hitE.t);
    // Search near the lateral foot at L_j ≈ √(2·d·w). Wide [s0,sE] scans found far false
    // tangents (splice ≈50 mm ≈ whole leg → near-end knees that GROW with sample count —
    // B.8 / same class as absolute 0.02 mm). Cap splice window; never use the foot as T.
    const Lj = Math.sqrt(Math.max(0, 2 * Math.abs(dLat) * Math.max(w || 0, 1e-6)));
    // Wide enough to find a true ≤1° tangent (narrow window forced climb with >20° kinks).
    const span = Math.max(8 * Lj, 12 * (w || 0), mmAtW(12, w || W0_MM));
    const towardE = sE >= s0 ? 1 : -1;
    const sLo = Math.max(0, s0 - 0.5 * span);
    const sHi = Math.max(sLo + 1e-9, s0 + towardE * span);
    const spliceCap = Math.max(span, 20 * (w || 0));
    const cos1 = Math.cos(Math.PI / 180);
    const tangRes = (s) => {
      const P = pointAtArcMm(R, railPts, s);
      const q = unit(P.q);
      const Ta = polyTangent(railPts, P.i);
      const spl = R * angle(X, q);
      // Co-directional arrival∥rail along travel toward E (no abs — abs accepted ~180° reverse).
      const Tdir = towardE > 0 ? Ta : mul(Ta, -1);
      const arrive = mul(tangentTo(q, X), -1); // inbound at q from X
      return { q, Ta, P, res: dot(X, cross(q, Tdir)), score: dot(arrive, Tdir), spl };
    };
    let best = null;
    const nScan = 160;
    const sSpan = Math.max(1e-9, sHi - sLo);
    for (let k = 0; k <= nScan; k++) {
      const s = sLo + sSpan * (k / nScan);
      const t = tangRes(s);
      if (t.spl > spliceCap + 1e-9) continue;
      if (!(t.score > cos1)) continue; // co-directional within 1°
      // residual≈0 + mild pull toward predicted L_j.
      const cost = Math.abs(t.res) * R + (1 - t.score) * 2 * (w || 1) + Math.abs(t.spl - Lj) * 0.05;
      if (!best || cost < best.cost) best = { s, score: t.score, cost, res: t.res };
    }
    if (!best) {
      // No co-directional entrance in window — climb/merge path below (not a reverse tangent).
      best = { s: s0, score: 0, cost: Infinity, res: 0 };
    }
    // Bracket a sign-change of residual near the best score and bisect
    let sL = best.s, sR = best.s, rL = best.res;
    const ds = (sHi - sLo) / nScan;
    for (const dir of [-1, 1]) {
      for (let step = 1; step <= 6; step++) {
        const s2 = Math.min(sHi, Math.max(sLo, best.s + dir * step * ds));
        const r2 = tangRes(s2).res;
        if (rL * r2 <= 0) { sL = best.s; sR = s2; rL = best.res; break; }
      }
    }
    if (rL * tangRes(sR).res <= 0) {
      let a = sL, b = sR, fa = tangRes(a).res;
      for (let it = 0; it < 48; it++) {
        const mid = 0.5 * (a + b), fm = tangRes(mid).res;
        if (fa * fm <= 0) b = mid; else { a = mid; fa = fm; }
      }
      best.s = 0.5 * (a + b);
    } else {
      // Golden refine on |res|
      let a = Math.max(sLo, best.s - 2 * ds), b = Math.min(sHi, best.s + 2 * ds);
      for (let it = 0; it < 40; it++) {
        const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618;
        if (Math.abs(tangRes(m1).res) < Math.abs(tangRes(m2).res)) b = m2; else a = m1;
      }
      best.s = 0.5 * (a + b);
    }
    Tpt = tangRes(best.s).q;
    splice = R * angle(X, Tpt);
    // 6a.17 / block-B: exterior tangent ≤1°. If search landed >1° from parallel, use climb/merge instead.
    {
      const hitJ = closestOnPoly(R, Tpt, railPts);
      const Trail = polyTangent(railPts, hitJ.i);
      const Tarrive = mul(tangentTo(unit(Tpt), unit(X)), -1);
      const nrm = unit(Tpt);
      const proj = (v) => {
        const p = sub(v, mul(nrm, dot(v, nrm)));
        const len = Math.hypot(p[0], p[1], p[2]);
        return len < 1e-15 ? null : mul(p, 1 / len);
      };
      const tIn = proj(Tarrive), tOut = proj(Trail);
      let angDeg = 0;
      if (tIn && tOut) {
        const c = Math.max(-1, Math.min(1, dot(tIn, tOut)));
        angDeg = Math.acos(c) * 180 / Math.PI;
      }
      if (angDeg > 1 + 1e-6) {
        // Fall back to climb/merge (≤20°). Grow ℓ_m until merge angle ≤20° (6a.7 / block-B).
        const deltaHere = Math.max(0, -dLat);
        let Lm = Math.max(w || 0, 3 * deltaHere, mmAtW(2, w || W0_MM));
        const sFoot = polyArcMm(R, railPts, lat.i, lat.t);
        const sE2 = polyArcMm(R, railPts, hitE.i, hitE.t);
        const dir = sE2 >= sFoot ? 1 : -1;
        const angAt = (sM) => {
          const q = unit(pointAtArcMm(R, railPts, sM).q);
          const hitJ2 = closestOnPoly(R, q, railPts);
          const Trail2 = polyTangent(railPts, hitJ2.i);
          const Tarr = mul(tangentTo(q, unit(X)), -1);
          const n2 = q;
          const pr = (v) => {
            const p = sub(v, mul(n2, dot(v, n2)));
            const len = Math.hypot(p[0], p[1], p[2]);
            return len < 1e-15 ? null : mul(p, 1 / len);
          };
          const a = pr(Tarr), b = pr(Trail2);
          if (!a || !b) return 180;
          // Co-directional merge angle (no abs — reverse would read as ~0°).
          return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180 / Math.PI;
        };
        let sM = Math.max(0, sFoot + dir * Lm);
        let aM = angAt(sM);
        for (let k = 0; k < 10 && aM > 20 + 1e-6; k++) {
          Lm *= 1.6;
          sM = Math.max(0, sFoot + dir * Lm);
          // stay before E
          if (dir > 0 && sM > sE2) { sM = sE2; aM = angAt(sM); break; }
          if (dir < 0 && sM < Math.min(sFoot, sE2)) { sM = Math.min(sFoot, sE2); aM = angAt(sM); break; }
          aM = angAt(sM);
        }
        Tpt = unit(pointAtArcMm(R, railPts, sM).q);
        splice = R * angle(X, Tpt);
        joinMode = 'climb';
      } else {
        joinMode = 'tangent';
      }
    }
  }

  const Tcount = splice <= 1e-15 ? 0
    : Math.max(2, Math.min(24, Math.round(n * splice / Math.max(splice + R * angle(Tpt, E), 1e-9))));
  const pts = [];
  for (let i = 0; i < Tcount; i++) {
    const tt = i / Tcount;
    const a = angle(X, Tpt);
    if (a < 1e-15) { pts.push(mul(X, R)); continue; }
    const s = Math.sin(a);
    pts.push(mul(unit(add(mul(X, Math.sin((1 - tt) * a) / s), mul(Tpt, Math.sin(tt * a) / s))), R));
  }
  const hitT = closestOnPoly(R, Tpt, railPts);
  // 6a.15 tangent exit: leave rail at Tex where geodesic Tex→E is co-directional with
  // the rail tangent along travel T→E. Require dot > cos(1°) — NEVER abs(dot), which
  // accepted near-backward exits (dot≈−1 → ~180° reversal at leg end).
  const sT0 = polyArcMm(R, railPts, hitT.i, hitT.t);
  const sE0 = polyArcMm(R, railPts, hitE.i, hitE.t);
  const forward = sE0 >= sT0;
  const span = Math.max(Math.abs(sE0 - sT0), mmAtW(2, w || W0_MM));
  // Directed T→E window (small pads for discrete rail); still require co-directionality.
  const sLo = Math.max(0, (forward ? sT0 : sE0) - 0.05 * span);
  const sHi = Math.max(sLo + 1e-9, (forward ? sE0 : sT0) + 0.05 * span);
  // Ideal co-directionality: dot > cos(1°). Faceted rails often peak near ~2°; accept
  // up to cos(5°) as co-directional (faceted rail; still rejects reverse). NEVER abs(dot) — that accepted ~180° reverse exits.
  const cos1 = Math.cos(Math.PI / 180);
  const cosAccept = Math.cos(5 * Math.PI / 180); // faceted-rail slack; ideal remains cos1
  const exitRes = (s) => {
    const P = pointAtArcMm(R, railPts, s);
    const q = unit(P.q);
    const Ta = polyTangentAt(railPts, P);
    const Tdir = forward ? Ta : mul(Ta, -1);
    const towardE = tangentTo(q, E);
    return { q, score: dot(towardE, Tdir), res: dot(E, cross(q, Tdir)), s };
  };
  // One cost for every candidate kind (scan sample, score peak, tangency root): residual,
  // co-directionality, and a pull toward E along the rail. All terms are lengths (mm) built
  // from R, w and rail arc length, so the choice is invariant under uniform scaling. The
  // pull also breaks ties between several genuine tangency roots deterministically
  // (keep the thread on the rail as long as possible), instead of by float round-off.
  const exitCost = (t) => Math.abs(t.res) * R + (1 - t.score) * 2 * (w || 1)
    + 0.02 * Math.abs(t.s - sE0) + (t.score > cos1 ? 0 : 0.01 * (w || 1));
  // Scan for co-directional candidates; prefer a true tangency root (res sign change).
  let best = null;
  let bestAny = null; // max directed score (for refine)
  const nScan = 120;
  const samples = [];
  for (let k = 0; k <= nScan; k++) {
    const s = sLo + (sHi - sLo) * (k / nScan);
    const t = exitRes(s);
    samples.push(t);
    if (!bestAny || t.score > bestAny.score) bestAny = t;
    if (!(t.score > cosAccept)) continue;
    const cost = exitCost(t); // prefers ≤1° when available
    if (!best || cost < best.cost) best = { ...t, cost };
  }
  // Golden-section polish on directed score around the peak.
  if (bestAny) {
    let a = Math.max(sLo, bestAny.s - (sHi - sLo) / nScan * 4);
    let b = Math.min(sHi, bestAny.s + (sHi - sLo) / nScan * 4);
    for (let it = 0; it < 28; it++) {
      const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618;
      if (exitRes(m1).score < exitRes(m2).score) a = m1; else b = m2;
    }
    const peak = exitRes(0.5 * (a + b));
    if (!bestAny || peak.score > bestAny.score) bestAny = peak;
    if (peak.score > cosAccept) {
      const cost = exitCost(peak);
      if (!best || cost < best.cost) best = { ...peak, cost };
    }
  }
  // Bisect a residual sign-change among co-directional samples (true tangency root).
  {
    let root = null;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      if (!(a.score > 0 && b.score > 0)) continue; // never across reverse
      if (a.res * b.res > 0) continue;
      let lo = a.s, hi = b.s, flo = a.res;
      for (let it = 0; it < 40; it++) {
        const mid = 0.5 * (lo + hi), fm = exitRes(mid);
        if (!(fm.score > 0)) break;
        if (flo * fm.res <= 0) hi = mid; else { lo = mid; flo = fm.res; }
      }
      const mid = exitRes(0.5 * (lo + hi));
      if (mid.score > cosAccept) {
        const cost = exitCost(mid);
        if (!root || cost < root.cost) root = { ...mid, cost };
      }
    }
    if (root) best = root;
  }
  // hitE.q only if co-directional within accept gate — never silent reverse/orthogonal fallback.
  if (!best) {
    const atE = exitRes(sE0);
    if (atE.score > cosAccept) best = { ...atE, cost: Math.abs(atE.res) * R };
  }
  if (!best && bestAny && bestAny.score > cosAccept) {
    best = { ...bestAny, cost: Math.abs(bestAny.res) * R };
  }
  if (!best || !(best.score > cosAccept)) {
    const sc = bestAny ? bestAny.score : NaN;
    throw new Error(
      `rail exit: no co-directional tangency (dot>cos5°, target cos1°) on T→E `
      + `(sT=${sT0.toFixed(3)}, sE=${sE0.toFixed(3)}, forward=${forward}, peakScore=${Number.isFinite(sc) ? sc.toFixed(6) : 'na'}); `
      + `refusing reverse/silent hitE fallback`,
    );
  }
  const exitQ = best.q;
  const railSlice = polySliceToward(R, railPts, hitT.i, hitT.t, exitQ, Math.max(1, n - Tcount));
  for (let i = 0; i < railSlice.length; i++) {
    if (Tcount > 0 && i === 0) continue;
    pts.push(railSlice[i]);
  }
  if (!pts.length) pts.push(...railSlice);
  // Geodesic Tex → E (tangent when exit score is high).
  {
    const last = unit(pts[pts.length - 1]);
    const Eend = unit(to);
    const gap = R * angle(last, Eend);
    if (gap > Math.max(1e-9 * R, 1e-6 * ((w || W0_MM) / W0_MM))) {
      const nTail = Math.max(2, Math.min(12, Math.round(gap / Math.max(mmAtW(0.25, w || W0_MM), 1e-6))));
      for (let k = 1; k <= nTail; k++) {
        const tt = k / nTail;
        const om = angle(last, Eend) || 1e-15;
        const s = Math.sin(om) || 1e-15;
        pts.push(mul(unit(add(mul(last, Math.sin((1 - tt) * om) / s), mul(Eend, Math.sin(tt * om) / s))), R));
      }
    }
  }

  let turnAtTDeg = 0;
  // Merge kink on the constructed path BEFORE uniform resample (resample invents false turns).
  {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + R * angle(pts[i - 1], pts[i]));
    const target = Math.max(0, splice);
    let iT = 1;
    for (let i = 1; i < pts.length - 1; i++) {
      if (Math.abs(cum[i] - target) < Math.abs(cum[iT] - target)) iT = i;
    }
    if (iT > 0 && iT < pts.length - 1) {
      const nrm = unit(pts[iT]);
      const proj = (v) => {
        const p = sub(v, mul(nrm, dot(v, nrm)));
        const len = Math.hypot(p[0], p[1], p[2]);
        return len < 1e-15 ? null : mul(p, 1 / len);
      };
      const tIn = proj(unit(sub(pts[iT], pts[iT - 1])));
      const tOut = proj(unit(sub(pts[iT + 1], pts[iT])));
      if (tIn && tOut) {
        const c = Math.max(-1, Math.min(1, dot(tIn, tOut)));
        const sn = Math.max(-1, Math.min(1, dot(cross(tIn, tOut), nrm)));
        turnAtTDeg = Math.atan2(sn, c) * 180 / Math.PI;
      }
    }
  }

  if (pts.length !== n + 1) {
    const out = [];
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + R * angle(pts[i - 1], pts[i]));
    const total = lens[lens.length - 1] || 1e-15;
    for (let i = 0; i <= n; i++) {
      const target = (i / n) * total;
      let j = 0;
      while (j < lens.length - 2 && lens[j + 1] < target) j++;
      const seg = lens[j + 1] - lens[j] || 1e-15;
      const u = (target - lens[j]) / seg;
      const a = unit(pts[Math.min(j, pts.length - 1)]);
      const b = unit(pts[Math.min(j + 1, pts.length - 1)]);
      const om = angle(a, b);
      if (om < 1e-15) out.push(mul(a, R));
      else out.push(mul(unit(add(mul(a, Math.sin((1 - u) * om) / Math.sin(om)), mul(b, Math.sin(u * om) / Math.sin(om)))), R));
    }
    pts.length = 0;
    pts.push(...out);
  }
  pts[0] = from.slice ? from.slice() : [...from];
  pts[n] = to.slice ? to.slice() : [...to];




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

  return {
    pts, length: len,
    shoulderForm: prevArm.shoulderForm === 'bow' ? 'bow' : 'geodesic',
    bowLateralMm: 0, phi3CapMm: 0, lambda, rho,
    bowCenter: Pc, phi3Warn: false, layMode: 'rail',
    spliceMm: splice, lateralMm: dLat, turnAtTDeg,
    interiorXn: dLat < -1e-6 * (w || W0_MM), // dimensionless: inside by >1e-6·w (not absolute 1e-6 mm)
    joinMode,
    climbMm: joinMode === 'climb' ? splice : 0,
    deltaMm: delta,
    deltaFail: delta > (w || 0) / 2,
    railKind,
    holeTurnDeg,
    mergeTurnDeg,
  };
}


function armPackNormal(arm) {
  const nRef = unit(cross(arm.from, arm.to));
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
    const extMm = Math.max(5 * (w || 0), mmAtW(10, w || W0_MM));
    const skipMm = Math.max(prevArm.climbMm || 0, prevArm.spliceMm || 0, 0);
    let body = prevPts;
    if (skipMm > 1e-9) {
      let cum = 0;
      let i0 = 0;
      for (let i = 1; i < prevPts.length; i++) {
        cum += R * angle(prevPts[i - 1], prevPts[i]);
        if (cum + 1e-9 >= skipMm) { i0 = i; break; }
      }
      body = prevPts.slice(Math.max(0, i0));
      if (body.length < 2) body = prevPts;
    }
    const railCore = parallelOffsetPoly(R, body, w || 0, prevArm);
    const coreLen = railCore.length;
    // Extend PAST THE END only (pre-extend still via extendPolyEnds for lateral foot near start)
    const railPts = extendPolyEnds(R, railCore, extMm, w || W0_MM);
    const nExt = Math.max(2, Math.min(32, Math.round(extMm / Math.max(mmAtW(0.5, w), 1e-9))));
    const coreEnd = nExt + coreLen - 1;
    const gHit = (s) => {
      const E = unit(perpPt(R, s, phiK, sidesAt(s).eOff));
      return signedLateralToPoly(R, E, railPts, prevArm);
    };
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
      // Require real crossing of the rail (not grazed tip) and Δ large enough.
      if ((sCand - sInside) >= minDs - 1e-9) { s = sCand; hit = hitCand; break; }
      scan = hi + h; // try next sign change
    }
    if (s == null || hit == null) return null; // no root — caller hard-fails (no silent sChan fallback)
    // Forbid false root on the unrextended polyline tip (foot at last core vertex).
    if (hit.i >= coreEnd - 1 && hit.i <= coreEnd && hit.t > 0.98 && hit.distMm < w * 0.25) {
      // Prefer a root on the GC extension past the tip, if any
      let lo2 = s, glo2 = g(s), hi2 = null;
      for (let t = s + h; t <= sMax; t += h) {
        const gt = g(t);
        if (glo2 * gt <= 0) { hi2 = t; break; }
        lo2 = t; glo2 = gt;
      }
      if (hi2 != null) {
        for (let it = 0; it < 60; it++) {
          const mid = (lo2 + hi2) / 2, gm = g(mid);
          if (glo2 * gm <= 0) hi2 = mid; else { lo2 = mid; glo2 = gm; }
        }
        const s2 = (lo2 + hi2) / 2;
        const hit2 = gHit(s2);
        if (hit2.i > coreEnd) return { s: s2, sPrevCross: null, sLaidCross: s2, sigma: 1, method: 'tangentParallel' };
      }
      // Tip false root with no extension root → reject
      return null;
    }
    return { s, sPrevCross: null, sLaidCross: s, sigma: 1, method: 'tangentParallel' };
  }
  // --- geodesic / GC packing-plane parallel at distance w ---
  let n = armPackNormal(prevArm);
  if (dot(n, [0, 0, 1]) < 0) n = n.map((v) => -v);
  const sigma = -1;
  const target = sigma * Math.sin(w / R);
  const g = (s) => dot(n, unit(perpPt(R, s, phiK, sidesAt(s).eOff))) - target;
  let lo = sInside, glo = g(lo), hi = null;
  for (let s = sInside + h; s <= sMax; s += h) { const gs = g(s); if (glo * gs <= 0) { hi = s; break; } lo = s; glo = gs; }
  if (hi === null) return null;
  for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2, gm = g(mid); if (glo * gm <= 0) hi = mid; else { lo = mid; glo = gm; } }
  const s = (lo + hi) / 2;
  const axisCross = (tg) => {
    const f = (t) => dot(n, unit(point(R, t, phiK))) - tg;
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
  const R = base.R, N = marking.N, w = P.w_mm, m = P.m_mm, Q = base.Q;
  const T = recipe.kagari, conv = recipe.conventions, LV = recipe.levels;
  // Shoulder form: param overrides recipe convention; tip-drop Δ is always derived (never a free input).
  const shoulderForm = resolveShoulderForm(P.shoulderForm || conv.shoulderForm?.value || conv.lay?.value || 'geodesic');
  const muWrap = P.muWrap ?? P.mu ?? 0;
  const bowSide = P.bowSide === 'equator' ? 'equator' : 'pole';
  // Commanded λ resolved per-leg once γ known; keep a preview using pin chord for tipDrop report.
  const mu = muWrap; // tipDrop report field (compat); Φ3 uses muWrap
  const limit = rowPlan ? rowPlan.limit : (P.rowsMode === 'untilOly7' ? Q - 7 : Q);
  const W = { ops: [], segs: [], stitches: [], rounds: [], threads: {}, crossings: [], stopped: {}, beyond: [], limit, squeezes: [],
    shoulderForm, tipDrop: null };
  const lineIdx = (k) => ((k % N) + N) % N;
  const phiOf = (k) => marking.phis[lineIdx(k)];
  const legList = [], laidList = [];          // уложенные плечи; всё уложенное (плечи, каналы, скрытый старт)
  const legs = () => legList;
  const laid = () => laidList;

  /** Уровень низа ряда n ≥ 2 на линии k — вывод из уже уложенного (packThenPierce + канал не налезает на прежний). */
  const bottomLevel = (k, prevRound) => {
    const prevSt = W.stitches.find((st) => st.round === prevRound.id && st.line === k && st.level === 'bottom');
    const prevArm = W.segs.find((x) => x.id === prevSt.legId);
    const sidesAt = (t) => needleSides({ R, s: t, phi: phiOf(k), m, w, N, laid: laid() });
    const pp = packThenPierce(R, prevArm, phiOf(k), prevSt.s, w, 2 * Q - 1, sidesAt);
    // 6a.10/6a.11(1): no root → hard fail with message; NEVER silent max(…, sChan).
    if (!pp) return { fail: true, reason: `packing root missing: parallel of ${prevArm.id} + GC tangent does not meet E-line L${k} below s=${prevSt.s.toFixed(3)}` };
    const sChan = Math.max(...W.stitches.filter((st) => st.line === k && st.level === 'bottom').map((st) => st.s)) + w;
    // Channel clearance is informational only; packing root is authoritative.
    const s = pp.s;
    return { s, levelInfo: { rule: 'packThenPierce', method: pp.method, sPrev: prevSt.s, sPrevCross: pp.sPrevCross, sLaidCross: pp.sLaidCross, sPack: pp.s, sChan,
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
    const spec = { id: `${letter}${row}`, set: letter, thread: setSpec.thread, row, startLine: setSpec.startLine, begin: tmpl.begin, basis: tmpl.basis };
    const prevRound = row > 1 ? W.rounds.find((r) => r.set === spec.set && r.row === row - 1) : null;
    // кончик этого ряда до шитья: первый стежок обхода — нижний, его уровень зависит только от уже уложенного
    const firstK = lineIdx(spec.startLine + 1);
    const tip = row === 1 ? { s: layout.sBot } : bottomLevel(firstK, prevRound);
    if (!tip || tip.fail) { W.stopped[letter] = { row, reason: tip?.reason || 'laid parallel + GC tangent does not meet the E-line (packing root missing)' }; continue; }
    if (tip.s > limit + 1e-9) {
      if (stopEarly) { W.stopped[letter] = { row, sTip: tip.s, reason: `row ${row} tip would land at s = ${tip.s.toFixed(3)} mm > limit ${limit.toFixed(3)} mm` }; continue; }
      W.beyond.push({ round: spec.id, sTip: tip.s, over: tip.s - limit });
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
      const sT = layout.sTop;
      const side0 = needleSides({ R, s: sT, phi: phiOf(L0), m, w, N, laid: laid() });
      const X0 = perpPt(R, sT, phiOf(L0), side0.xOff);
      const rule = T.start.rules[P.startRule];
      const runs = rule.runs, Lrun = P.startRun_mm;
      const theta = 2 * Math.asin(Math.min(1, Lrun / (2 * R)));
      const M = point(R, layout.sBot, phiOf(L0) - Math.PI / N);
      const holes = [];
      for (let k = runs; k >= 0; k--) holes.push(k === 0 ? X0 : rotateToward(R, X0, M, k * theta));
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
      RD.start = { X0, holes, tail: holes[0], exitSides: side0, runs, Lrun, theta };
      cur = X0;
    } else {
      cur = th.park;
      RD.start = { resumeFrom: th.parkStitch, X0: cur };
      pushOp({ kind: 'resume', segIds: [], label: t('path.resume', { round: RD.id, thread: th.id, prev: th.rounds[th.rounds.length - 2] }),
        source: `${spec.basis}; TK-UWA; prior #94` });
    }

    // ---------- 2. Round stitches ----------
    let roundAbort = false;
    for (let i = 1; i <= N; i++) {
      const closing = i === N;
      const k = lineIdx(L0 + i);
      const level = T.pattern[(i - 1) % T.pattern.length];
      // (а) уровень стежка: ряд 1 — замысел; ряд n ≥ 2 — вывод из уже уложенного
      let s, levelInfo;
      if (level === 'top') {
        if (spec.row === 1) { s = layout.sTop; levelInfo = { rule: 'row1', basis: LV.top.row1.basis }; }
        else {
          const prevCh = W.stitches.filter((st) => st.line === k && st.level === 'top');
          const sPrev = Math.max(...prevCh.map((st) => st.s));
          s = sPrev + w;
          levelInfo = { rule: 'belowPrevChannel', sPrev, dS: s - sPrev, basis: LV.top.next.basis };
        }
      } else if (spec.row === 1) { s = layout.sBot; levelInfo = { rule: 'row1', basis: LV.bottom.row1.basis }; }
      else {
        const bl = bottomLevel(k, prevRound);
        if (!bl || bl.fail) {
          W.stopped[letter] = { row: spec.row, reason: bl?.reason || 'packing root missing' };
          roundAbort = true; break;
        }
        ({ s, levelInfo } = bl);
      }
      // (б) needle placement from occupancy on line k at level s (causal prefix)
      const sides = needleSides({
        R, s, phi: phiOf(k), m, w, N, laid: laid(),
        uwagakeSet: level === 'top' && spec.row >= 2 ? spec.set : null,
        uwagakeRow: level === 'top' && spec.row >= 2 ? spec.row : 0,
      });
      const E = perpPt(R, s, phiOf(k), sides.eOff);
      const X = perpPt(R, s, phiOf(k), sides.xOff);
      for (const q of sides.squeeze) W.squeezes.push({ hole: q.side === 'E' ? E : X, set: spec.set, round: RD.id, line: k, i, ...q });
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
          ? railLeg(R, cur, E, prevLeg, w)
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
        railKind: legShape.railKind || null, holeTurnDeg: legShape.holeTurnDeg ?? 0, mergeTurnDeg: legShape.mergeTurnDeg ?? 0 });
      if (i === 1) RD.firstLegId = leg.id;
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
          const sp = toSPhi(R, z.min.cp);
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
