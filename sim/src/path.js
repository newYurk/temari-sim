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
export function needleSides({ R, s, phi, m, w, N, laid }) {
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
  for (const o of occ) o.own = o.kind !== 'marking-neighbour' && o.y > yBis.left && o.y < yBis.right;
  const rest = occ.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      const o = rest[i];
      if (!o.own) continue;
      if (o.lo < hi + w && o.hi > lo - w) { lo = Math.min(lo, o.lo); hi = Math.max(hi, o.hi); used.push(o); rest.splice(i, 1); changed = true; }
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
    if (!best || best.gap >= w) return { off: edge + sgn * w / 2, squeeze: null };
    const squeeze = { ...best, comp: (w - best.gap) / 2, noRoom: best.gap <= 0 };
    return { off: edge + sgn * best.gap / 2, squeeze };
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
    z.crossing = cross0;
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
 * Row n≥2: rail = parallel of previous laid arm (Fable v2 §4.3 / formula (8)).
 * Small-circle prev → concentric small circle about the SAME P with
 * ρ_n = ∠(P, E_n) = ρ_{n−1} + w/R; packing normal from this row's analytics.
 * Geodesic prev → geodesic chord (preserves λ=0 / 5-rows-to-equator).
 * Smooth C¹ splice from X_n onto the rail (target ≲0.3 mm): ρ-blend with smoothstep, no off-circle pin.
 */
function railLeg(R, from, to, prevArm, w = 0) {
  const n = getLegSamples();
  if (prevArm?.bowCenter && Number.isFinite(prevArm.rho)) {
    const Pc = unit(prevArm.bowCenter);
    let rho = angle(Pc, unit(to));
    if (!(rho > 1e-12 && rho < Math.PI - 1e-12)) {
      rho = prevArm.rho + (Number.isFinite(w) ? w / R : 0);
    }
    // Splice X → rail (Fable v2 §4.3): geodesic meridian X→Q0 (same ψ about P, κ_g=0),
    // then concentric rail Q0→E. Do NOT pin pts[0] off-circle onto an on-circle arc — that
    // made a long chord and a fake sharp corner. The meridian/rail join is a real ~90°
    // tangent break at Q0; V20 excludes it by path-distance ≤ w from the hole, not by a
    // fixed sample count. Early-row gap |ρ_X−ρ|·R is ≲ 0.3 mm; later rows may be larger
    // (reported in spliceMm).
    const X = unit(from), E = unit(to);
    const Q0 = onSmallCircle(Pc, rho, from);
    const splice = R * angle(X, Q0);
    // Samples on the meridian splice (include X, exclude Q0) + rail (include Q0 and E).
    const T = splice <= 1e-15 ? 0 : Math.max(2, Math.min(8, Math.round(n * splice / Math.max(splice + R * angle(Q0, E), 1e-9))));
    const pts = [];
    for (let i = 0; i < T; i++) {
      const t = T === 0 ? 0 : i / T;
      // slerp on the sphere from X to Q0
      const a = angle(X, Q0);
      if (a < 1e-15) { pts.push(mul(X, R)); continue; }
      const s = Math.sin(a);
      const p = add(mul(X, Math.sin((1 - t) * a) / s), mul(Q0, Math.sin(t * a) / s));
      pts.push(mul(unit(p), R));
    }
    const railPts = smallCircleArc(R, mul(Q0, R), to, Pc, Math.max(1, n - T));
    for (const q of railPts) pts.push(q);
    // Normalize to n+1 samples (keep ends; thin the denser side if needed).
    if (pts.length !== n + 1) {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const f = u * (pts.length - 1);
        const j = Math.min(pts.length - 2, Math.floor(f));
        const frac = f - j;
        const a = unit(pts[j]), b = unit(pts[j + 1]);
        const ang = angle(a, b);
        if (ang < 1e-15) out.push(mul(a, R));
        else {
          const s = Math.sin(ang);
          out.push(mul(unit(add(mul(a, Math.sin((1 - frac) * ang) / s), mul(b, Math.sin(frac * ang) / s))), R));
        }
      }
      pts.length = 0;
      pts.push(...out);
    }
    pts[0] = from.slice ? from.slice() : [...from];
    pts[n] = to.slice ? to.slice() : [...to];
    const pa = unit(add(Q0, mul(Pc, -dot(Q0, Pc))));
    const pb = unit(add(E, mul(Pc, -dot(E, Pc))));
    const dPsi = Math.abs(signedShortPsi(pa, pb, Pc));
    const arcLen = splice + R * Math.sin(rho) * dPsi;
    const lambda = Math.abs(Math.cos(rho) / Math.max(1e-15, Math.sin(rho)));
    return {
      pts, length: Math.abs(arcLen) > 1e-12 ? Math.abs(arcLen) : polyLen(pts),
      shoulderForm: 'bow', bowLateralMm: 0, phi3CapMm: 0, lambda, rho,
      bowCenter: Pc, phi3Warn: false, layMode: 'rail', spliceMm: splice,
    };
  }
  return {
    pts: slerp(R, from, to, n), length: geodLen(R, from, to),
    shoulderForm: 'geodesic', bowLateralMm: 0, phi3CapMm: 0, lambda: 0, rho: Math.PI / 2,
    bowCenter: null, phi3Warn: false, layMode: 'rail',
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
  // --- Fable v2 (8): angular distance from small-circle center ---
  if (prevArm.bowCenter && Number.isFinite(prevArm.rho)) {
    const Pc = unit(prevArm.bowCenter);
    const target = prevArm.rho + w / R;
    const g = (s) => angle(Pc, unit(perpPt(R, s, phiK, sidesAt(s).eOff))) - target;
    let lo = sInside, glo = g(lo), hi = null;
    for (let s = sInside + h; s <= sMax; s += h) {
      const gs = g(s);
      if (glo * gs <= 0) { hi = s; break; }
      lo = s; glo = gs;
    }
    if (hi === null) return null;
    for (let it = 0; it < 60; it++) {
      const mid = (lo + hi) / 2, gm = g(mid);
      if (glo * gm <= 0) hi = mid; else { lo = mid; glo = gm; }
    }
    const s = (lo + hi) / 2;
    return { s, sPrevCross: null, sLaidCross: s, sigma: 1, method: 'fable8' };
  }
  // --- geodesic / rail without small-circle analytics: packing-plane parallel at distance w ---
  // Orient normal toward the pole so "outward" is equatorward. Do NOT derive sigma from
  // point(R,sInside) — when sInside = s_prev that point can lie on the equator side of the
  // arm plane and flip the sign (misses the root below the previous stitch).
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
    if (!pp) return null;
    // канал нового стежка не может налезать на канал предыдущего на этой линии (игла не прокалывает нить)
    const sChan = Math.max(...W.stitches.filter((st) => st.line === k && st.level === 'bottom').map((st) => st.s)) + w;
    const s = Math.max(pp.s, sChan);
    return { s, levelInfo: { rule: 'packThenPierce', sPrev: prevSt.s, sPrevCross: pp.sPrevCross, sLaidCross: pp.sLaidCross, sPack: pp.s, sChan,
      channelBinding: sChan > pp.s, dS: s - prevSt.s, prevArm: prevArm.id, basis: LV.bottom.next.basis,
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
    if (!tip) { W.stopped[letter] = { row, reason: 'уложенная вплотную нить не пересекает линию до экватора' }; continue; }
    if (tip.s > limit + 1e-9) {
      if (stopEarly) { W.stopped[letter] = { row, sTip: tip.s, reason: `кончик ряда ${row} лёг бы на s = ${tip.s.toFixed(3)} мм > предел ${limit.toFixed(3)} мм` }; continue; }
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

    // ---------- 2. Стежки обхода ----------
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
      else ({ s, levelInfo } = bottomLevel(k, prevRound));
      // (б) где колоть: занятость у линии k на уровне s из уже уложенного (все нити, причинный префикс)
      const sides = needleSides({ R, s, phi: phiOf(k), m, w, N, laid: laid() });
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
        : (spec.row >= 2 ? 'Fable v2 rail: concentric small circle ρ+(n−1)·w/R about same P (parallel of previous laid arm)' : conv.lay.basis);
      const leg = addSeg({ type: 'leg', from: cur, to: E, pts: legPts, length: legShape.length, stitch: i, line: k, level,
        source: layBasis, tag: conv.lay.tag, crossings: [],
        shoulderForm: legShape.shoulderForm, bowLateralMm: legShape.bowLateralMm, phi3CapMm: legShape.phi3CapMm,
        lambda: legShape.lambda ?? 0, rho: legShape.rho, bowCenter: legShape.bowCenter || null,
        layMode: legShape.layMode || (spec.row === 1 ? 'row1' : 'rail'),
        spliceMm: legShape.spliceMm ?? 0 });
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
          } else { kind = 'contact'; rule = 'прилегание ближе w без перехода — не разрешено правилом'; allowed = false; }
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
