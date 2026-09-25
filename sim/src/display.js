// Отображаемая геометрия нити — чистая функция от результата конвейера (рендер и валидатор V14 берут её отсюда).
// Модель (path) не меняется: здесь только условности изображения, каждая помечена.
//  • видимое плечо: модель — геодезическая на R (нить лежит на поверхности); ось трубки на R + w/2,
//    трубка круглая диаметра w [D22] ⇒ внешняя точка на R + w. На концах — плавный «нырок» в отверстие до R − w/2
//    на длине DIVE_W·w вдоль плеча (smoothstep; раньше был радиальный скачок на w — трубка с поворотом 90° давала «крючки»).
//  • захват E→X: модель — хорда под поверхностью (глубина ≤ 0,02 мм); показан пунктиром с осью на R − w/2.
//  • скрытый старт: модель — прямая хорда иглы (35 мм ⇒ до 4,24 мм вглубь). По умолчанию показан СХЕМАТИЧНО
//    дугой чуть под поверхностью (R − HID_DEPTH_W·w), чтобы не проходить сквозь шар; режим 'chord' — как в модели.
import { unit, mul, dist, angle } from './geom.js';

export const HID_DEPTH_W = 1.0;      // глубина схематичной дуги скрытого старта, в ширинах нити (условность изображения, не модель)
//  • перекрест/клин: верхняя (по правилу над/под) нить приподнята на DISPLAY_STACK_LIFT_W·w на каждый уровень стопки
//    с плавным спадом — ТОЛЬКО чтобы на экране была видна верхняя нить. Это не высота стопки: подъём нить-на-нить,
//    сжатие и изгиб — механика (этап 2.4). rail-parallel (flush beside prev at ≈w) does not lift.
//    Крючок: если A.mechanics.liftAt(segId, i) есть — берётся он.
export const DISPLAY_STACK_LIFT_W = 0.6;
export const DIVE_W = 1.5;           // длина нырка плеча в отверстие, в ширинах нити (условность изображения)
// Flush parallel of prev row at distance ≈w — not a stack crossing; lifting it makes top-view ladder waves.
export const STACK_LIFT_SKIP_KINDS = new Set(['rail-parallel']);
const smooth = (e) => { e = Math.max(0, Math.min(1, e)); return e * e * (3 - 2 * e); };

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

/** Профиль уровня стопки вдоль плеча (в уровнях, не в мм): из перекрестов, где плечо сверху. */
export function stackProfile(A, seg) {
  const n = seg.pts.length, prof = new Float64Array(n);
  const step = seg.length / (n - 1);
  for (const c of A.path.crossings) {
    if (c.over !== seg.id) continue;
    if (c.kind && STACK_LIFT_SKIP_KINDS.has(c.kind)) continue;
    const ic = c.over === c.a ? c.iA : c.iB;
    const half = c.halfMm, taper = Math.max(A.params.w_mm, half);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i - ic) * step;
      let t = d <= half ? 1 : d >= half + taper ? 0 : 0.5 * (1 + Math.cos(Math.PI * (d - half) / taper));
      if (c.kind === 'wedge') {   // клин тянется от верхней точки на длину зоны налегания
        const iTop = c.iA <= 2 ? 0 : n - 1, zoneN = Math.ceil(c.lenMm / step);
        const dz = Math.abs(i - iTop);
        t = dz <= zoneN ? 1 : dz >= zoneN + taper / step ? 0 : 0.5 * (1 + Math.cos(Math.PI * (dz - zoneN) * step / taper));
      }
      prof[i] = Math.max(prof[i], c.stack * t);
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
export function displayGeometry(A, segIds = null, opts = {}) {
  const R = A.base.R, w = A.params.w_mm, hidMode = opts.hidMode || 'surf';
  const out = [];
  for (const s of A.path.segs) {
    if (segIds && !segIds.has(s.id)) continue;
    if (s.type === 'leg') {
      const mech = A.mechanics && A.mechanics.liftAt ? (i) => A.mechanics.liftAt(s.id, i) : null;
      const prof0 = mech ? s.pts.map((_, i) => mech(i)) : Array.from(stackProfile(A, s), (v) => DISPLAY_STACK_LIFT_W * w * v);
      const Ld = DIVE_W * w, { P, V, X, L } = densifyEnds(s.pts, prof0, Ld + 0.5, 0.08);
      let liftMax = 0;
      const pts = P.map((p, i) => {
        liftMax = Math.max(liftMax, V[i]);
        const e = smooth(Math.min(X[i], L - X[i]) / Ld);            // 0 в отверстии, 1 на поверхности
        return lift(p, R - w / 2 + (w + V[i]) * e);
      });
      out.push({ seg: s, pts, radius: w / 2, hidden: false, schematic: false, liftMax, liftSource: mech ? 'mechanics' : 'display' });
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
