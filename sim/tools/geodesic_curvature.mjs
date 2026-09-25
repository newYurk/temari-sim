/**
 * Geodesic curvature κ_g along a spherical polyline (diagnostics only).
 *
 * Discrete turn of *3D* chord directions / ds is total curvature κ and includes
 * the sphere's normal curvature κ_n = 1/R. Φ3 needs geodesic curvature:
 * project successive tangents into the tangent plane at each sample, then
 * κ_g = signed turn rate of those projected tangents along arc length ds.
 * Great circles / geodesic legs → κ_g ≈ 0 (numerical noise only).
 */
import { angle, unit, sub, mul, dot, cross, clamp } from '../src/geom.js';

/** Project vector t into the tangent plane of unit normal n; return unit or null. */
export function projectToTangent(t, n) {
  const p = sub(t, mul(n, dot(t, n)));
  const len = Math.hypot(p[0], p[1], p[2]);
  if (len < 1e-15) return null;
  return mul(p, 1 / len);
}

/**
 * Cumulative arc length (mm) along pts on a sphere of radius R.
 * @returns {number[]}
 */
export function cumArcMm(pts, R) {
  const cum = [0];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += R * angle(pts[i - 1], pts[i]);
    cum.push(s);
  }
  return cum;
}

/**
 * Geodesic curvature samples along a spherical polyline.
 * @param {number[][]} pts points on (or near) the sphere
 * @param {number} R sphere radius (mm)
 * @returns {{
 *   rows: Array<{i,frac,s_mm,kg,absKg,turn_deg}>,
 *   maxAbsKg: number, maxI: number, maxFrac: number, length_mm: number
 * }}
 */
export function geodesicCurvatureAlong(pts, R) {
  const cum = cumArcMm(pts, R);
  const rows = [];
  let maxAbsKg = 0;
  let maxI = 0;
  const nLast = Math.max(1, pts.length - 1);
  for (let i = 1; i < pts.length - 1; i++) {
    const n = unit(pts[i]);
    const tIn = projectToTangent(unit(sub(pts[i], pts[i - 1])), n);
    const tOut = projectToTangent(unit(sub(pts[i + 1], pts[i])), n);
    if (!tIn || !tOut) {
      rows.push({ i, frac: i / nLast, s_mm: cum[i], kg: 0, absKg: 0, turn_deg: 0 });
      continue;
    }
    const c = clamp(dot(tIn, tOut), -1, 1);
    const sn = clamp(dot(cross(tIn, tOut), n), -1, 1);
    const turn = Math.atan2(sn, c); // signed radians in the tangent plane
    const ds = (cum[i + 1] - cum[i - 1]) / 2;
    const kg = ds > 1e-12 ? turn / ds : 0;
    const absKg = Math.abs(kg);
    if (absKg > maxAbsKg) {
      maxAbsKg = absKg;
      maxI = i;
    }
    rows.push({
      i,
      frac: i / nLast,
      s_mm: cum[i],
      kg,
      absKg,
      turn_deg: turn * (180 / Math.PI),
    });
  }
  return {
    rows,
    maxAbsKg,
    maxI,
    maxFrac: maxI / nLast,
    length_mm: cum[cum.length - 1] ?? 0,
  };
}

/**
 * Synthetic great-circle polyline on the equator (control: κ_g must be ≈ 0;
 * total curvature of the same points would be ≈ 1/R).
 */
export function syntheticGreatCircle(R, nSamples = 96, arcFrac = 0.25) {
  const pts = [];
  const thetaMax = 2 * Math.PI * arcFrac;
  for (let i = 0; i <= nSamples; i++) {
    const th = (i / nSamples) * thetaMax;
    pts.push([R * Math.cos(th), R * Math.sin(th), 0]);
  }
  return pts;
}
