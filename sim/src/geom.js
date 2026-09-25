// @ts-check
// Чистая сферическая геометрия (без three.js). Единицы — мм. Центр шара в 0, рабочий полюс NP = +z.
// p(s, φ) = R(sin(s/R)cos φ, sin(s/R)sin φ, cos(s/R))  — model/spec.md G1, geometry.md.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => mul(a, 1 / norm(a));
export const dist = (a, b) => norm(sub(a, b));
export const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
export const Z = [0, 0, 1];

export function point(R, s, phi) {
  const th = s / R;
  return [R * Math.sin(th) * Math.cos(phi), R * Math.sin(th) * Math.sin(phi), R * Math.cos(th)];
}

export function toSPhi(R, p) {
  const u = unit(p);
  return { s: R * Math.acos(clamp(u[2])), phi: Math.atan2(u[1], u[0]) };
}

/** Точка, смещённая от меридиана φ на уровне s на d мм вдоль параллели (+ = по ходу обхода, +φ). */
export function offsetPt(R, s, phi, d) {
  const th = s / R;
  return point(R, s, phi + d / (R * Math.sin(th)));
}

/** Угловое расстояние между направлениями a и b. */
export function angle(a, b) {
  return Math.acos(clamp(dot(unit(a), unit(b))));
}

/** Длина дуги большого круга (геодезической) между точками сферы. */
export function geodLen(R, a, b) { return R * angle(a, b); }

/** Дуга большого круга a→b, n+1 точек на радиусе R (slerp). */
export function slerp(R, a, b, n = 64) {
  const ua = unit(a), ub = unit(b);
  const om = angle(ua, ub);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (om < 1e-12) { out.push(mul(ua, R)); continue; }
    const k1 = Math.sin((1 - t) * om) / Math.sin(om), k2 = Math.sin(t * om) / Math.sin(om);
    out.push(mul(add(mul(ua, k1), mul(ub, k2)), R));
  }
  return out;
}

/** Точка на большом круге через a в сторону b на угловом расстоянии theta от a. */
export function rotateToward(R, a, b, theta) {
  const ua = unit(a);
  const t = unit(sub(unit(b), mul(ua, dot(ua, unit(b)))));
  return mul(add(mul(ua, Math.cos(theta)), mul(t, Math.sin(theta))), R);
}

/** Прямой отрезок (хорда) a→b, n+1 точек. */
export function lineSeg(a, b, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(add(a, mul(sub(b, a), i / n)));
  return out;
}

/** Единичная касательная в a по дуге большого круга к b. */
export function tangentTo(a, b) {
  const ua = unit(a), ub = unit(b);
  return unit(sub(ub, mul(ua, dot(ua, ub))));
}

/** Касательная вдоль меридиана к северному полюсу. */
export function ePole(p) {
  const u = unit(p);
  return unit(sub(Z, mul(u, dot(u, Z))));
}

/** Касательная вдоль параллели в сторону +φ (ход обхода). */
export function eEast(p) { return unit(cross(Z, unit(p))); }

/** Угол (рад) между дугой at→towards и меридианом в точке at (0 = вдоль меридиана). */
export function angleWithMeridian(at, towards) {
  return Math.acos(clamp(Math.abs(dot(tangentTo(at, towards), ePole(at)))));
}

/** Длина полилинии. */
export function polyLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

/** Минимальное расстояние между отрезками p1p2 и q1q2 (3D), с параметрами. */
export function segSegDist(p1, p2, q1, q2) {
  const d1 = sub(p2, p1), d2 = sub(q2, q1), r = sub(p1, q1);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-18 && e <= 1e-18) return { d: norm(r), s: 0, t: 0 };
  if (a <= 1e-18) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-18) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-18 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const cp = add(p1, mul(d1, s)), cq = add(q1, mul(d2, t));
  return { d: dist(cp, cq), s, t, cp, cq };
}

/** Все «близкие зоны» двух полилиний: интервалы, где расстояние < thr. Возвращает минимум по каждой зоне. */
export function closeZones(A, B, thr) {
  let best = null;
  const zones = [];
  // грубо: для каждого отрезка A — минимум по B
  let inZone = false;
  /** @type {any} */
  let cur = null;
  for (let i = 1; i < A.length; i++) {
    let m = { d: Infinity };
    for (let j = 1; j < B.length; j++) {
      const r = segSegDist(A[i - 1], A[i], B[j - 1], B[j]);
      if (r.d < m.d) m = { ...r, i, j };
    }
    if (m.d < thr) {
      if (!inZone) { cur = { ...m, n: 0 }; inZone = true; }
      else if (m.d < cur.d) cur = { ...m, n: cur.n };
      cur.n++;
    } else if (inZone) { zones.push(cur); inZone = false; }
    if (!best || m.d < best.d) best = m;
  }
  if (inZone) zones.push(cur);
  return { zones, min: best };
}

/** Геодезическое расстояние по гаверсинусу из (s, φ) — НЕЗАВИСИМАЯ формула для проверки длин плеч. */
export function haversineLen(R, s1, phi1, s2, phi2) {
  const lat1 = Math.PI / 2 - s1 / R, lat2 = Math.PI / 2 - s2 / R;
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((phi2 - phi1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const deg = (r) => r * 180 / Math.PI;
export const rad = (d) => d * Math.PI / 180;

/** Нормализация угла в (−π, π]. */
export function wrapPi(a) {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** Точка на расстоянии d (по поверхности) от точки линии p(s, φ) вдоль большого круга, перпендикулярного линии
 *  (+ = по ходу, +φ). Так лежат E и X прямой иглы ⟂ линии (OLY-BASIC «垂直に»). */
export function perpPt(R, s, phi, d) {
  const c = point(R, s, phi);
  const u = unit(c), t = eEast(c);
  return mul(add(mul(u, Math.cos(d / R)), mul(t, Math.sin(d / R))), R);
}
