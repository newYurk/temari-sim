// Отображаемая геометрия нити — чистая функция от результата конвейера (рендер и валидатор V14 берут её отсюда).
// Модель (path) не меняется: здесь только условности изображения, каждая помечена.
//  • видимое плечо: модель — геодезическая на R (нить лежит на поверхности); ось трубки на R + w/2,
//    трубка круглая диаметра w [D22] ⇒ внешняя точка на R + w.
//  • нырок в отверстие (6a.18): спуск начинается ЗА краем последней нижележащей нити; длина
//    min(DIVE_W·w, расстояние до края); край ближе w/4 → отвесный спуск. Крючок 90° у отверстия допустим.
//  • захват E→X: модель — хорда под поверхностью (глубина ≤ 0,02 мм); показан пунктиром с осью на R − w/2.
//  • скрытый старт: модель — прямая хорда иглы (35 мм ⇒ до 4,24 мм вглубь). По умолчанию показан СХЕМАТИЧНО
//    дугой чуть под поверхностью (R − HID_DEPTH_W·w), чтобы не проходить сквозь шар; режим 'chord' — как в модели.
import { unit, mul, dist, angle } from './geom.js';

export const HID_DEPTH_W = 1.0;      // глубина схематичной дуги скрытого старта, в ширинах нити (условность изображения, не модель)
//  • стопка (6a.17): lift(d) = DISPLAY_STACK_LIFT_W·√(w²−d²) при d < w, иначе 0 (d = боковое расстояние осей).
//    rail-parallel (d≈w) → 0; climb → √(2wδ−δ²); перекрёст — шатёр на ±w/sinψ; клин — по c.stack.
//    Поднимается позже уложенная (c.over), кроме проходов под по рецепту. Крючок: A.mechanics.liftAt.
export const DISPLAY_STACK_LIFT_W = 0.6;
export const DIVE_W = 1.5;           // длина нырка плеча в отверстие, в ширинах нити (условность изображения)
/** @deprecated 6a.17 general lift(d) supersedes kind skip; kept for tests that assert rail-parallel → 0. */
export const STACK_LIFT_SKIP_KINDS = new Set(['rail-parallel']);
const smooth = (e) => { e = Math.max(0, Math.min(1, e)); return e * e * (3 - 2 * e); };

/** Peak lift (mm) from lateral axis distance d (6a.17). */
export function liftFromDist(d, w, k = DISPLAY_STACK_LIFT_W) {
  if (!(w > 0) || !(d < w)) return 0;
  return k * Math.sqrt(Math.max(0, w * w - d * d));
}

/** Сгустить полилинию плеча у концов (шаг h на длине zone от каждого конца), значения prof интерполируются. */
function densifyEnds(pts, prof, zone, h) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1], P = [pts[0]], V = [prof[0]], X = [0];
  for (let i = 1; i < pts.length; i++) {
    const near = Math.min(cum[i - 1], L - cum[i]) < zone + 1e-9;
    const k = near ? Math.max(1, Math.ceil((cum[i] - cum[i - 1]) / h)) : 1;
    const r = (norm3(pts[i - 1]) + norm3(pts[i])) / 2;
    for (let j = 1; j <= k; j++) {
      const t = j / k, q = pts[i - 1].map((v, c) => v + (pts[i][c] - v) * t);
      P.push(j === k ? pts[i] : mul(unit(q), r)); V.push(prof[i - 1] + (prof[i] - prof[i - 1]) * t); X.push(cum[i - 1] + (cum[i] - cum[i - 1]) * t);
    }
  }
  return { P, V, X, L };
}
const norm3 = (p) => Math.hypot(p[0], p[1], p[2]);

/**
 * Профиль подъёма стопки вдоль плеча (мм, 6a.17).
 * lift(d)=0.6·√(w²−d²) при d<w; шатёр на перекрёсте; climb по δ; клин — c.stack·0.6·w.
 */
export function stackProfile(A, seg) {
  const n = seg.pts.length, prof = new Float64Array(n);
  const w = A.params.w_mm, kLift = DISPLAY_STACK_LIFT_W;
  const step = seg.length / Math.max(1, n - 1);
  for (const c of A.path.crossings) {
    if (c.over !== seg.id) continue;
    const ic = c.over === c.a ? c.iA : c.iB;
    const stack = Math.max(1, c.stack || 1);

    if (c.kind === 'wedge') {
      // Keep prior wedge extent via c.stack (6a.17).
      const half = c.halfMm ?? Math.max(w, c.lenMm / 2);
      const taper = Math.max(w, half);
      const iTop = c.iA <= 2 ? 0 : n - 1, zoneN = Math.ceil((c.lenMm || half) / step);
      for (let i = 0; i < n; i++) {
        const dz = Math.abs(i - iTop);
        const t = dz <= zoneN ? 1 : dz >= zoneN + taper / step ? 0
          : 0.5 * (1 + Math.cos(Math.PI * (dz - zoneN) * step / taper));
        prof[i] = Math.max(prof[i], stack * kLift * w * t);
      }
      continue;
    }

    if (c.kind === 'climb') {
      // δ = how far the new axis sits inside the prior tube (≈ w − dmin).
      const dLat = c.dmin != null ? c.dmin : w;
      const delta = Math.max(0, Math.min(w, w - dLat));
      const peak = kLift * Math.sqrt(Math.max(0, 2 * w * delta - delta * delta)) * stack;
      if (peak <= 0) continue;
      const half = Math.max(w, c.lenMm / 2, c.climbMm || 0, c.halfMm || w);
      for (let i = 0; i < n; i++) {
        const ds = Math.abs(i - ic) * step;
        if (ds > half) continue;
        const t = ds <= half * 0.5 ? 1 : 0.5 * (1 + Math.cos(Math.PI * (ds - half * 0.5) / (half * 0.5)));
        prof[i] = Math.max(prof[i], peak * t);
      }
      continue;
    }

    if (c.kind === 'crossing' || c.kind === 'tipCross' || (c.kind !== 'rail-parallel' && c.kind !== 'contact' && c.angleDeg != null && c.angleDeg > 5)) {
      // Tent: lift(s) = 0.6·√(w² − (s−s₀)²·sin²ψ) on ±w/sinψ (6a.17).
      const psi = (c.angleDeg != null ? c.angleDeg : 90) * Math.PI / 180;
      const sinPsi = Math.max(0.05, Math.abs(Math.sin(psi)));
      const half = w / sinPsi;
      for (let i = 0; i < n; i++) {
        const ds = Math.abs(i - ic) * step;
        if (ds > half) continue;
        const lift = kLift * Math.sqrt(Math.max(0, w * w - ds * ds * sinPsi * sinPsi)) * stack;
        prof[i] = Math.max(prof[i], lift);
      }
      continue;
    }

    // rail-parallel / flush / other: lift(d) from lateral distance (d≥w → 0).
    const d = c.dmin != null ? c.dmin : w;
    const peak = liftFromDist(d, w, kLift) * stack;
    if (peak <= 0) continue;
    const half = Math.max(w, c.lenMm / 2, c.halfMm || 0);
    for (let i = 0; i < n; i++) {
      const ds = Math.abs(i - ic) * step;
      if (ds > half) continue;
      const t = 0.5 * (1 + Math.cos(Math.PI * Math.min(1, ds / half)));
      prof[i] = Math.max(prof[i], peak * t);
    }
  }
  return prof;
}

const lift = (p, r) => mul(unit(p), r);
function densifyLine(a, b, h) {
  const n = Math.max(1, Math.ceil(dist(a, b) / h)), out = [a];
  for (let k = 1; k <= n; k++) out.push(a.map((v, i) => v + (b[i] - v) * k / n));
  return out;
}
function arcAtDepth(R, a, b, depth, h) {       // дуга большого круга a→b; радиус R − depth с плавным входом/выходом
  const th = angle(a, b), L = R * th, n = Math.max(2, Math.ceil(L / h));
  const ua = unit(a), ub = unit(b), s = Math.sin(th) || 1, taper = Math.min(1.5, L / 4);
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = t * L;
    const dir = th < 1e-9 ? ua : ua.map((v, i) => (Math.sin((1 - t) * th) * v + Math.sin(t * th) * ub[i]) / s);
    const e = Math.min(1, x / taper, (L - x) / taper), sm = e * e * (3 - 2 * e);
    out.push(mul(unit(dir), R - depth * sm));
  }
  return out;
}

/** Для каждого сегмента из segIds (Set или null = все): { seg, pts, radius, hidden, schematic, note }. */
/** Distance along leg from end to where axis clears outer edge of underlying threads (d≥w). */
function clearDistFromEnd(A, seg, fromStart) {
  const w = A.params.w_mm, R = A.base.R, pts = seg.pts;
  if (!pts || pts.length < 2) return DIVE_W * w;
  const others = A.path.segs.filter((o) => o.type === 'leg' && o.id !== seg.id
    && (o.u1 == null || seg.u0 == null || o.u1 <= seg.u0 + 1e-12)); // laid earlier
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + R * angle(pts[i - 1], pts[i]));
  const total = cum[n - 1];
  // Walk from the hole end inward; find first sample with min d to earlier axes ≥ w.
  let clearAlong = 0;
  const order = fromStart
    ? [...Array(n).keys()]
    : [...Array(n).keys()].reverse();
  for (const i of order) {
    const p = unit(pts[i]);
    let dMin = Infinity;
    for (const o of others) {
      for (const q of o.pts) dMin = Math.min(dMin, R * angle(p, unit(q)));
    }
    const along = fromStart ? cum[i] : total - cum[i];
    if (dMin >= w - 1e-9) { clearAlong = along; break; }
    clearAlong = along;
  }
  return clearAlong;
}

export function displayGeometry(A, segIds = null, opts = {}) {
  const R = A.base.R, w = A.params.w_mm, hidMode = opts.hidMode || 'surf';
  const out = [];
  for (const s of A.path.segs) {
    if (segIds && !segIds.has(s.id)) continue;
    if (s.type === 'leg') {
      const mech = A.mechanics && A.mechanics.liftAt ? (i) => A.mechanics.liftAt(s.id, i) : null;
      // stackProfile returns mm lift (6a.17); includes upper-tip wedge / flush lift(d).
      const prof0 = mech ? s.pts.map((_, i) => mech(i)) : Array.from(stackProfile(A, s));
      // 6a.18: dive only after clearing outer edge of last underlying thread.
      const clear0 = clearDistFromEnd(A, s, true);
      const clear1 = clearDistFromEnd(A, s, false);
      const dive0 = clear0 < w / 4 ? 0 : Math.min(DIVE_W * w, clear0); // 0 ⇒ vertical drop
      const dive1 = clear1 < w / 4 ? 0 : Math.min(DIVE_W * w, clear1);
      const zone = Math.max(dive0, dive1, DIVE_W * w) + 0.5;
      const { P, V, X, L } = densifyEnds(s.pts, prof0, zone, 0.08);
      let liftMax = 0;
      const pts = P.map((p, i) => {
        liftMax = Math.max(liftMax, V[i]);
        // Surface fraction: 0 in hole, 1 after dive length from that end.
        // When dive=0 (edge < w/4): vertical — e=0 only at exact end sample, else 1.
        const e0 = dive0 < 1e-12 ? (X[i] < 1e-9 ? 0 : 1) : smooth(Math.min(1, X[i] / Math.max(dive0, 1e-12)));
        const e1 = dive1 < 1e-12 ? ((L - X[i]) < 1e-9 ? 0 : 1) : smooth(Math.min(1, (L - X[i]) / Math.max(dive1, 1e-12)));
        const ee = Math.min(e0, e1);
        return lift(p, R - w / 2 + (w + V[i]) * ee);
      });
      out.push({ seg: s, pts, radius: w / 2, hidden: false, schematic: false, liftMax, liftSource: mech ? 'mechanics' : 'display', diveMm: [dive0, dive1] });
    } else if (s.type === 'pickup') {
      out.push({ seg: s, pts: densifyLine(lift(s.from, R - w / 2), lift(s.to, R - w / 2), 0.05), radius: w * 0.3, hidden: true, schematic: false, note: 'канал иглы E→X под всеми нитями (ось на R − w/2)' });
    } else if (hidMode === 'chord') {
      const pts = []; for (let i = 1; i < s.pts.length; i++) pts.push(...densifyLine(s.pts[i - 1], s.pts[i], 0.2).slice(i > 1 ? 1 : 0));
      out.push({ seg: s, pts, radius: w * 0.35, hidden: true, schematic: false, note: 'хорда иглы (модель)' });
    } else {
      out.push({ seg: s, pts: arcAtDepth(R, s.from, s.to, HID_DEPTH_W * w, 0.2), radius: w * 0.35, hidden: true, schematic: true,
        note: `схема: дуга на ${(HID_DEPTH_W * w).toFixed(2)} мм под поверхностью; в модели — хорда` });
    }
  }
  return out;
}
