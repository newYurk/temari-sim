// @ts-check
// Геометрия трубки вдоль полилинии — чистая функция без three.js (используется рендером и валидатором V14).
// Рамка: параллельный перенос нормали по касательным. Возвращает массивы вершин/нормалей/долей длины и индексы.
import { add, sub, mul, dot, cross, norm, unit, dist } from './geom.js';

function rotate(v, axis, ang) { // формула Родрига, axis — единичный
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}

export function tubeMesh(pts, radius, radial = 14, caps = false) {
  const n = pts.length;
  const T = pts.map((p, i) => unit(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let nrm = Math.abs(T[0][2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  nrm = unit(sub(nrm, mul(T[0], dot(nrm, T[0]))));
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const total = cum[n - 1] || 1;
  const pos = [], nor = [], frac = [], idx = [], ang = [], arc = [];   // #44: ang / arc — around / along (twist shading)
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
      frac.push(cum[i] / total); ang.push(a); arc.push(cum[i]);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  if (caps) {   // заглушки-полусферы на концах (иначе короткие куски выглядят плоскими «коробочками»)
    for (const [i, sgn] of [[0, -1], [n - 1, 1]]) {
      const base = i * (radial + 1), t = mul(T[i], sgn), rings = 3;
      let prev = Array.from({ length: radial + 1 }, (_, j) => base + j);
      for (let r = 1; r <= rings; r++) {
        const a = (r / rings) * Math.PI / 2, cur = [];
        for (let j = 0; j <= radial; j++) {
          const v0 = pos[base + j], d0 = sub(v0, pts[i]);
          const d = add(mul(d0, Math.cos(a)), mul(t, radius * Math.sin(a)));
          cur.push(pos.length); pos.push(add(pts[i], d)); nor.push(unit(d)); frac.push(cum[i] / total); ang.push(ang[base + j]); arc.push(cum[i]);
        }
        for (let j = 0; j < radial; j++) {
          if (sgn > 0) idx.push(prev[j], cur[j], prev[j + 1], cur[j], cur[j + 1], prev[j + 1]);
          else idx.push(prev[j], prev[j + 1], cur[j], cur[j], prev[j + 1], cur[j + 1]);
        }
        prev = cur;
      }
    }
  }
  return { pos, nor, frac, idx, ang, arc };
}

/** #44 (render only): brightness factor of the ply shading at angle a around the tube and arc length s along it —
 *  plies helical grooves of lay length pitch; depth twist ∈ [0, 1] (0 → 1 everywhere). Range [1 − 0.55·twist, 1]. */
export function twistShade(a, s, { twist = 0, pitch_mm = 1, plies = 2 } = {}) {
  if (!(twist > 0) || !(pitch_mm > 0)) return 1;
  const ph = plies * (a - 2 * Math.PI * s / pitch_mm);
  const g = 0.5 - 0.5 * Math.cos(ph), x = Math.max(0, Math.min(1, (g - 0.55) / 0.45));
  return 1 - 0.55 * twist * x * x * (3 - 2 * x);   // = GLSL smoothstep(0.55, 1, g)
}
