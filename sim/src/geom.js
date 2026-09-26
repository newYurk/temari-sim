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

/** Point of meridian φ at arc s from NP. #52 commit 2: thin wrapper over pointOnLine (meridian φ = half-line from P.N
 *  at azimuth φ; bit-exact, see halfLineAt). */
export function point(R, s, phi) {
  return pointOnLine(R, meridian(phi), s);
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

/** Угол (рад) между дугой at→towards и меридианом в точке at (0 = вдоль меридиана). #52 commit 2: wrapper over
 *  angleWithLine (the meridian through at). */
export function angleWithMeridian(at, towards) {
  return angleWithLine(at, meridian(Math.atan2(at[1], at[0])), towards);
}

// ---- #52 commit 2 (spec stage3-arch §1.4): geometry by line, not by longitude ----
// A half-line is { from, z0, az, dir, n }: anchor point `from` (unit vector), the anchor's zero direction z0 (unit,
// ⟂ from), azimuth az (counterclockwise about the outward normal, the marking's azimuth rule), direction at the anchor
// dir = cos az·z0 + sin az·(from × z0) and pole n = from × dir (the left normal; the great circle is oriented by
// cross(n, ·), which is dir at the anchor). Meridian φ of S_N = the half-line from P.N (z0 toward φ₀) at az = φ:
// dir = (cos φ, sin φ, 0), n = (−sin φ, cos φ, 0) exactly (every product with a zero component is ±0), so point,
// perpPt, ePole, eEast and angleWithMeridian are reproduced bit for bit by the line functions below.

/** Zero direction of P.N / P.S in S_N (toward φ₀). */
export const X0 = [1, 0, 0];

/** Half-line from the anchor `from` at azimuth az (zero direction z0). */
export function halfLineAt(from, z0, az) {
  const e = cross(from, z0);
  const dir = add(mul(z0, Math.cos(az)), mul(e, Math.sin(az)));
  return { from, z0, az, dir, n: cross(from, dir) };
}

/** The same anchor, azimuth rotated by δ (neighbouring half-lines, bisectors). */
export function rotateHalfLine(hl, delta) {
  return { ...halfLineAt(hl.from, hl.z0, hl.az + delta), v: hl.v };
}

/** Meridian φ as a half-line from P.N (wrapper support). */
export function meridian(phi) { return halfLineAt(Z, X0, phi); }

/** Anchor and direction of a line argument: a half-line (from = its anchor) or a full line {n} with a point `from` on it. */
function lineStart(line, from) {
  if (line.dir) {
    if (from !== undefined && from !== line.from && dist(from, line.from) > 1e-12) throw new Error('pointOnLine: from must be the half-line anchor');
    return { p0: line.from, dir: line.dir };
  }
  if (from === undefined) throw new Error('pointOnLine: a full line needs from');
  if (Math.abs(dot(from, line.n)) > 1e-9) throw new Error('pointOnLine: from is not on the line');
  return { p0: from, dir: cross(line.n, from) };
}

/** Point at arc s (mm) along the line from its anchor (R·(sin(s/R)·dir + cos(s/R)·from)). */
export function pointOnLine(R, line, s, from) {
  const { p0, dir } = lineStart(line, from);
  const th = s / R;
  return add(mul(dir, R * Math.sin(th)), mul(p0, R * Math.cos(th)));
}

/** Unit tangent at the point `at` of the line, toward its anchor (for a meridian: ePole). */
export function alongLine(at, line, from = line.from) {
  const u = unit(at);
  return unit(sub(from, mul(u, dot(u, from))));
}

/** Unit tangent at `at` perpendicular to the line, to its left (from × at; for a meridian: eEast, +φ). */
export function acrossLine(at, line, from = line.from) { return unit(cross(from, unit(at))); }

/** Point at d mm (surface) from the line point at arc s, along the great circle perpendicular to the line (+ = left of
 *  the line direction; for a meridian: +φ). The needle line ⟂ the line (OLY-BASIC «垂直に»). */
export function offsetOnLine(R, line, s, d, from) {
  const c = pointOnLine(R, line, s, from);
  const u = unit(c), t = unit(cross(from ?? line.from, u));
  return mul(add(mul(u, Math.cos(d / R)), mul(t, Math.sin(d / R))), R);
}

/** Angle (rad) between the arc at→towards and the line at its point at (0 = along the line). */
export function angleWithLine(at, line, towards) {
  return Math.acos(clamp(Math.abs(dot(tangentTo(at, towards), alongLine(at, line)))));
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
  return offsetOnLine(R, meridian(phi), s, d);
}

// #53 case 1: the kiku frame — polar coordinates about the kiku centre c with zero direction z0 (s = arc from c, az
// counterclockwise about the outward normal at c, the marking's azimuth rule). Everything that used the fixed pole
// (point, perpPt, toSPhi, ePole, eEast, R·acos(z)) goes through a frame. At P.N (c = Z, z0 = X0) each function is the
// old one, bit for bit; any other centre uses the same expressions with c in place of Z.
/** @param {number[]} c unit centre @param {number[]} z0 unit zero direction (tangent at c) */
export function frameAt(c, z0) {
  const atN = c[0] === 0 && c[1] === 0 && c[2] === 1 && z0[0] === 1 && z0[1] === 0 && z0[2] === 0;
  return { c: c.slice(), z0: z0.slice(), e2: cross(c, z0), atN };
}
export const FRAME_N = frameAt(Z, X0);
/** Point at arc s from the centre on the half-line of azimuth az. */
export function fPoint(R, F, s, az) { return F.atN ? point(R, s, az) : pointOnLine(R, halfLineAt(F.c, F.z0, az), s); }
/** Point d mm across the half-line az at arc s (+ = toward increasing az). */
export function fPerp(R, F, s, az, d) { return F.atN ? perpPt(R, s, az, d) : offsetOnLine(R, halfLineAt(F.c, F.z0, az), s, d); }
/** Frame coordinates { s, phi } of p (phi = azimuth about the centre). */
export function fSAz(R, F, p) {
  if (F.atN) return toSPhi(R, p);
  const u = unit(p);
  return { s: R * Math.acos(clamp(dot(u, F.c))), phi: Math.atan2(dot(u, F.e2), dot(u, F.z0)) };
}
/** Arc from the centre to p (mm). */
export function fS(R, F, p) { return F.atN ? R * Math.acos(clamp(unit(p)[2])) : R * Math.acos(clamp(dot(unit(p), F.c))); }
/** Unit tangent at p toward the centre (at P.N: ePole). */
export function fToward(F, p) {
  if (F.atN) return ePole(p);
  const u = unit(p);
  return unit(sub(F.c, mul(u, dot(u, F.c))));
}
/** Unit tangent at p toward increasing azimuth (at P.N: eEast). */
export function fEast(F, p) { return F.atN ? eEast(p) : unit(cross(F.c, unit(p))); }
/** Height of p along the centre axis (at P.N: p[2]). */
export function fZ(F, p) { return F.atN ? p[2] : dot(p, F.c); }
