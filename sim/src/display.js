// Отображаемая геометрия нити — чистая функция от результата конвейера (рендер и валидатор V14 берут её отсюда).
// Модель (path) не меняется: здесь только условности изображения, каждая помечена.
//  • видимое плечо: модель — геодезическая на R (нить лежит на поверхности); ось трубки на R + w/2,
//    трубка круглая диаметра w [D22] ⇒ внешняя точка на R + w. На концах — «нырок» в отверстие до R − w/2.
//  • захват E→X: модель — хорда под поверхностью (глубина ≤ 0,02 мм); показан пунктиром с осью на R − w/2.
//  • скрытый старт: модель — прямая хорда иглы (35 мм ⇒ до 4,24 мм вглубь). По умолчанию показан СХЕМАТИЧНО
//    дугой чуть под поверхностью (R − HID_DEPTH_W·w), чтобы не проходить сквозь шар; режим 'chord' — как в модели.
import { unit, mul, dist, angle } from './geom.js';

export const HID_DEPTH_W = 1.0;      // глубина схематичной дуги скрытого старта, в ширинах нити (условность изображения, не модель)

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
      out.push({ seg: s, pts: [lift(s.from, R - w / 2), ...s.pts.map((p) => lift(p, R + w / 2)), lift(s.to, R - w / 2)],
        radius: w / 2, hidden: false, schematic: false });
    } else if (s.type === 'pickup') {
      out.push({ seg: s, pts: densifyLine(lift(s.from, R - w / 2), lift(s.to, R - w / 2), 0.05), radius: w * 0.35, hidden: true, schematic: false });
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
