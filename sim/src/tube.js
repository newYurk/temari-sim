// Геометрия трубки вдоль полилинии — чистая функция без three.js (используется рендером и валидатором V14).
// Рамка: параллельный перенос нормали по касательным. Возвращает массивы вершин/нормалей/долей длины и индексы.
import { add, sub, mul, dot, cross, norm, unit, dist } from './geom.js';

function rotate(v, axis, ang) { // формула Родрига, axis — единичный
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}

export function tubeMesh(pts, radius, radial = 14) {
  const n = pts.length;
  const T = pts.map((p, i) => unit(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let nrm = Math.abs(T[0][2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  nrm = unit(sub(nrm, mul(T[0], dot(nrm, T[0]))));
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const total = cum[n - 1] || 1;
  const pos = [], nor = [], frac = [], idx = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const ax = cross(T[i - 1], T[i]), sn = norm(ax), cs = dot(T[i - 1], T[i]);
      if (sn > 1e-12) nrm = rotate(nrm, mul(ax, 1 / sn), Math.atan2(sn, cs));
      nrm = unit(sub(nrm, mul(T[i], dot(nrm, T[i]))));
    }
    const bin = cross(T[i], nrm);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const d = add(mul(nrm, Math.cos(a)), mul(bin, Math.sin(a)));
      pos.push(add(pts[i], mul(d, radius)));
      nor.push(d);
      frac.push(cum[i] / total);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { pos, nor, frac, idx };
}
