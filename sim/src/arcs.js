// Analytic arc chains on the sphere (spec v3.1 §2 "Сетка", §3.2(8); issue #36).
//
// A laid leg is a chain of circular arcs whose pole and angular radius are known exactly: great circles
// (free legs, splices, tails, rail continuations), small circles (row-1 bow, rails = offsets of arcs) and
// arcs of radius w about a convex corner. The class is closed under the parallel (offset) construction:
// the offset of an arc about pole k with angular radius ρ is the arc about k with radius ρ ∓ w/R, so a
// rail of any row is built from the ANALYTIC geometry of row n−1, never from finite differences over
// sampled neighbours (those amplify round-off by ≈ w/h per row, #36). The tangent field is exact on every
// arc and continuous across joints (convex corners get a w-arc; concave corners are trimmed at the
// intersection of the two offset arcs, which is the boundary of the w-tube). Sampling is for output only.
//
// Arc: { k: unit pole, rho: angular radius (cos ρ = p·k), a: unit start point, psi: sweep ≥ 0, right-handed
// (counter-clockwise seen from outside) about k, cls: segment class, join?: 'tangent' }. join = 'tangent'
// marks a start joint that is a tangency BY CONSTRUCTION (corner arcs, rail continuations, the tangent exit
// of §3.2(13)): there the turn is round-off, so whether it is convex or concave is not asked of the numbers
// (a trim of two tangent circles is ill-conditioned, ≈ √ε); the offsets of tangent arcs are tangent.
// Lengths on the unit sphere unless the name says mm. Chain lengths are in mm (× R).
import { add, sub, mul, dot, cross, norm, unit } from './geom.js';

/** Exact angle between vectors (atan2: no acos precision floor near 0 and π). */
export function ang(a, b) { return Math.atan2(norm(cross(a, b)), dot(a, b)); }

/** Rodrigues rotation of v about unit axis k by angle t (right-handed). */
export function rot(v, k, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

/** Great-circle arc a → b (short way). Null if a ≈ b. */
export function arcGC(a, b, cls) {
  const ua = unit(a), ub = unit(b);
  const n = cross(ua, ub);
  if (norm(n) < 1e-15) return null;
  return { k: unit(n), rho: Math.PI / 2, a: ua, psi: ang(ua, ub), cls };
}

/** Great-circle arc from p along unit tangent T for angle e (e ≥ 0). */
export function arcAlong(p, T, e, cls) {
  const u = unit(p);
  return { k: unit(cross(u, T)), rho: Math.PI / 2, a: u, psi: e, cls };
}

/** Small-circle arc about Pc from a to b, the short way about Pc (same Δψ as smallCircleArc). */
export function arcSmall(a, b, Pc, cls) {
  let k = unit(Pc);
  const ua = unit(a), ub = unit(b);
  const pa = sub(ua, mul(k, dot(ua, k))), pb = sub(ub, mul(k, dot(ub, k)));
  let T = Math.atan2(dot(cross(pa, pb), k), dot(pa, pb));
  if (T < 0) { k = mul(k, -1); T = -T; }
  return { k, rho: ang(k, ua), a: ua, psi: T, cls };
}

export const arcPoint = (A, psi) => rot(A.a, A.k, psi);
export const arcEnd = (A) => rot(A.a, A.k, A.psi);
/** Unit tangent of arc A at a point p on it (direction of travel). */
export const arcTangent = (A, p) => unit(cross(A.k, p));
/** Arc length on the unit sphere. */
export const arcLen = (A) => Math.sin(A.rho) * A.psi;
/** Same arc traversed backwards. */
export function arcReverse(A) {
  return { k: mul(A.k, -1), rho: Math.PI - A.rho, a: arcEnd(A), psi: A.psi, cls: A.cls };
}
/** Sub-arc [psi0, psi1] (psi0 ≤ psi1). */
export function arcSub(A, psi0, psi1) {
  return { ...A, a: arcPoint(A, psi0), psi: Math.max(0, psi1 - psi0) };
}

/** Closest point of arc A to unit u: { psi, q, d } (d = angle). Foot on the full circle if it lies
 *  within the sweep, else the nearer end. */
function arcClosest(A, u) {
  const k = A.k;
  const r = sub(u, mul(k, dot(u, k)));
  const a0 = sub(A.a, mul(k, dot(A.a, k)));
  let psi;
  if (norm(r) < 1e-300) psi = 0;
  else {
    psi = Math.atan2(dot(cross(a0, r), k), dot(a0, r));
    if (psi < 0) psi += 2 * Math.PI;
  }
  if (psi > A.psi) {
    const qs = A.a, qe = arcEnd(A);
    const ds = ang(u, qs), de = ang(u, qe);
    return de <= ds ? { psi: A.psi, q: qe, d: de } : { psi: 0, q: qs, d: ds };
  }
  const q = arcPoint(A, psi);
  return { psi, q, d: ang(u, q) };
}

/** Offset of one arc by angle al on side (+1 = left of travel, −1 = right). Left of travel on an arc
 *  about k is toward k, so the radius becomes ρ − side·al. */
function arcOffset(A, al, side) {
  const rho = A.rho - side * al;
  // #40: an offset radius outside (0, π) means the offset passes through the pole of the arc — the parallel
  // is not an arc of this class there (a construction contradiction, loud).
  if (!(rho > 0 && rho < Math.PI)) throw new Error(`offsetChain: offset radius ρ′ = ${rho} rad outside (0, π) (ρ = ${A.rho}, offset ${side * al})`);
  const toK = unit(sub(A.k, mul(A.a, Math.cos(A.rho))));
  const a = add(mul(A.a, Math.cos(al)), mul(toK, side * Math.sin(al)));
  return { k: A.k, rho, a: unit(a), psi: A.psi, cls: 'rail' };
}

/** Signed turn at joint vertex v from tangent T1 to T2 (+ = left, counter-clockwise about v). */
function turnAt(v, T1, T2) { return Math.atan2(dot(cross(T1, T2), v), dot(T1, T2)); }

/** Margin of the concave trim (#40), class (i): the circle intersection angle is dl = acos(C/H); a round-off
 *  error ε_m ≈ 1e−16 in C/H moves it by ε_m / √(1 − (C/H)²) ≈ ε_m / √(2·(1 − |C/H|)). With 1 − |C/H| ≥ 1e−8
 *  that is ≤ 1e−12 rad; closer to 1 the two offset circles are (nearly) tangent — a double root, which a concave
 *  corner (a real turn, not a tangency by construction) cannot give. Real trims have 1 − |C/H| ≥ 2.6e−2. */
export const TRIM_MARGIN = 1e-8;

/** Intersection of offset arcs P (ending near the corner) and Q (starting near it): the solution on the
 *  circle of P nearest P's end. Returns { psiP, psiQ } (psiQ measured on Q from its start). psiP < 0 means
 *  the intersection lies before P's start (P is consumed; the caller drops it). No intersection, a (near)
 *  double intersection or an intersection beyond P's end is a construction contradiction: throws (#40). */
export function trimConcave(P, Q) {
  const c = mul(P.k, Math.cos(P.rho));
  const e1 = sub(P.a, c), e2 = cross(P.k, P.a);
  const A = dot(e1, Q.k), B = dot(e2, Q.k), C = Math.cos(Q.rho) - dot(c, Q.k);
  const H = Math.hypot(A, B);
  // H = 0: the circles are coaxial (same or opposite pole) — equal or disjoint, never a transversal corner.
  if (!(H > 0)) throw new Error('offsetChain: concave trim of coaxial offset arcs (no transversal intersection)');
  const r = C / H;
  if (!(1 - Math.abs(r) >= TRIM_MARGIN)) {
    throw new Error(`offsetChain: concave trim without a transversal intersection (|C/H| = 1 − ${(1 - Math.abs(r)).toExponential(2)}; `
      + (Math.abs(r) > 1 ? 'offset arcs do not meet' : 'offset arcs are tangent') + ')');
  }
  const base = Math.atan2(B, A), dl = Math.acos(r);
  let best = null;
  for (const cand of [base + dl, base - dl]) {
    let x = cand - P.psi;
    x -= 2 * Math.PI * Math.round(x / (2 * Math.PI));
    if (!best || Math.abs(x) < Math.abs(best)) best = x;
  }
  const psiP = P.psi + best;
  if (psiP > P.psi) throw new Error(`offsetChain: concave trim point lies beyond the end of the arc before the corner (Δψ = ${best.toExponential(2)})`);
  const pt = arcPoint(P, psiP);
  const psiQ = arcClosest(Q, pt).psi;
  return { psiP, psiQ, pt };
}

/**
 * Parallel of a chain of arcs at angular distance al on side (+1 left / −1 right of travel). Convex
 * corners (the chain turns away from the offset side) get an arc of radius al about the corner; concave
 * corners are trimmed at the intersection of the neighbouring offset arcs. A trim that would consume a
 * whole arc is a construction contradiction and throws (loud fail, §2).
 */
export function offsetChain(arcs, al, side) {
  const out = [];
  for (let i = 0; i < arcs.length; i++) {
    const B = arcs[i];
    const Bo = arcOffset(B, al, side);
    if (out.length && B.join === 'tangent') Bo.join = 'tangent';
    else if (out.length) {
      const A = arcs[i - 1];
      const v = B.a;
      const T1 = arcTangent(A, arcEnd(A)), T2 = arcTangent(B, v);
      const th = turnAt(v, T1, T2);
      if (th * side < 0) {
        // convex corner: arc of radius al about v from N1 to N2 (turning with the chain)
        const N1 = mul(cross(v, T1), side);
        const a = unit(add(mul(v, Math.cos(al)), mul(N1, Math.sin(al))));
        const k = th > 0 ? v : mul(v, -1);
        // Both joints of the corner arc are tangencies by construction (#40): the next row's offsetChain must not
        // ask the numbers whether a round-off turn of ≈ 1e−16 there is convex or concave.
        out.push({ k, rho: th > 0 ? al : Math.PI - al, a, psi: Math.abs(th), cls: 'corner', join: 'tangent' });
        Bo.join = 'tangent';
      } else if (th * side > 0) {
        // concave corner: the tube boundary is the intersection of the offset arcs; an offset arc shorter
        // than the overlap lies inside the tube and drops out (trim against the arc before it)
        for (;;) {
          const P = out[out.length - 1];
          const { psiP, psiQ, pt } = trimConcave(P, Bo);
          if (!(psiQ <= Bo.psi)) throw new Error(`offsetChain: concave trim consumes the arc after joint ${i} (turn ${(th * 180 / Math.PI).toFixed(4)}°)`);
          if (psiP >= 0) { P.psi = psiP; Bo.a = pt; Bo.psi -= psiQ; break; }
          out.pop();
          // the whole start lies inside the tube of the next arc: the parallel starts on the next arc
          if (!out.length) break;
        }
      }
    }
    out.push(Bo);
  }
  return out;
}

/**
 * Chain of arcs with arc-length parameter s (mm, R-scaled) and an exact, continuous tangent field.
 * side: +1 / −1, which side of travel is "outward" (signed lateral distances are + on that side).
 */
export class Chain {
  constructor(R, arcs, side) {
    this.R = R;
    this.arcs = arcs.filter((A) => A && A.psi > 0);
    this.side = side;
    this.cum = [0];
    for (const A of this.arcs) this.cum.push(this.cum[this.cum.length - 1] + R * arcLen(A));
    this.len = this.cum[this.cum.length - 1];
  }
  /** Index of the arc holding arc length s (clamped to the chain). */
  idx(s) {
    let lo = 0, hi = this.arcs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.cum[m] <= s) lo = m; else hi = m - 1; }
    return lo;
  }
  /** Point and tangent at arc length s (clamped): { q, T, s, j }. */
  at(sMm) {
    const s = Math.min(this.len, Math.max(0, sMm));
    const j = this.idx(s), A = this.arcs[j];
    const sr = Math.sin(A.rho);
    const psi = Math.min(A.psi, Math.max(0, (s - this.cum[j]) / (this.R * sr)));
    const q = arcPoint(A, psi);
    return { q, T: arcTangent(A, q), s, j };
  }
  get start() { return this.arcs[0].a; }
  get end() { const A = this.arcs[this.arcs.length - 1]; return arcEnd(A); }
  /** Closest point to u: { q, s, T, distMm, j, clamped: 'start' | 'end' | null }. */
  closest(u) {
    const U = unit(u);
    let best = null;
    for (let j = 0; j < this.arcs.length; j++) {
      const A = this.arcs[j];
      const c = arcClosest(A, U);
      if (!best || c.d < best.d) best = { ...c, j };
    }
    const A = this.arcs[best.j];
    const s = this.cum[best.j] + this.R * Math.sin(A.rho) * best.psi;
    const last = this.arcs.length - 1;
    const clamped = (best.j === 0 && best.psi === 0) ? 'start' : (best.j === last && best.psi === A.psi) ? 'end' : null;
    return { q: best.q, s, T: arcTangent(A, best.q), distMm: this.R * best.d, j: best.j, clamped };
  }
  /** Closest point with signed lateral distance (+ on the outward side) and outward normal N. When the foot is
   *  clamped at an end of the chain (u lies beyond it along the track), distMm is the distance to that end and
   *  the lateral side is NOT read from dot(toward, N): that dot is the offset from the end's tangent circle,
   *  ≈ 0 when u lies on the continuation, so its sign is the sign of a near-zero number (#40). signedMm is then
   *  null and the caller takes the side from the construction (v3.1 §3.2(8), (12)). */
  lateral(u) {
    const c = this.closest(u);
    const N = mul(unit(cross(c.q, c.T)), this.side);
    if (c.clamped) return { ...c, N, signedMm: null };
    const U = unit(u);
    const toward = sub(U, mul(c.q, dot(U, c.q)));
    return { ...c, N, signedMm: c.distMm * (dot(toward, N) >= 0 ? 1 : -1) };
  }
  /** Signed lateral distance (+ outward) to the chain continued without end along the great circles at its
   *  ends (spec v3.1 §3.2(12): the tail is continued to the first root with the E-line; no length limit). Inside
   *  the chain it is lateral(); beyond an end whose arc is a great circle it is the exact, continuous offset
   *  R·asin(u·N) from that great circle — a value, not a sign read off an along-track distance (#40). Beyond an
   *  end that is not a great circle there is no continuation: throws (loud). */
  continuedLateral(u) {
    const h = this.lateral(u);
    if (!h.clamped) return h;
    const A = h.clamped === 'start' ? this.arcs[0] : this.arcs[this.arcs.length - 1];
    if (Math.abs(A.rho - Math.PI / 2) > 1e-12) throw new Error(`Chain.continuedLateral: the ${h.clamped} arc is not a great circle`);
    const d = dot(unit(u), h.N);
    return { ...h, signedMm: this.R * Math.asin(Math.max(-1, Math.min(1, d))) };
  }
  /** Arcs between arc lengths s0 and s1 (reversed when s1 < s0), classes kept. */
  sub(s0, s1) {
    const fwd = s1 >= s0;
    const lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(this.len, Math.max(s0, s1));
    const out = [];
    for (let j = 0; j < this.arcs.length; j++) {
      const a0 = this.cum[j], a1 = this.cum[j + 1];
      if (a1 <= lo || a0 >= hi) continue;
      const A = this.arcs[j], k = this.R * Math.sin(A.rho);
      const piece = arcSub(A, Math.max(0, (lo - a0) / k), Math.min(A.psi, (hi - a0) / k));
      if (piece.psi > 0) out.push(piece);
    }
    if (!fwd) {
      // reversed: the joint before reversed arc i is the original joint before arc m − i + 1
      const m = out.length - 1;
      return out.map((_, i) => ({ ...arcReverse(out[m - i]), join: i > 0 ? out[m - i + 1].join : undefined }));
    }
    return out;
  }
  /** Output samples (R-scaled) uniform in arc length from s0 to s1, n segments. */
  sample(s0, s1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(mul(this.at(s0 + (s1 - s0) * (i / n)).q, this.R));
    return out;
  }
  /** The chain continued past both ends along the great circles tangent at the ends (spec §3.2(8), (12)). */
  extended(extMm) {
    const e = extMm / this.R;
    const A0 = this.arcs[0], An = this.arcs[this.arcs.length - 1];
    const p0 = A0.a, T0 = arcTangent(A0, p0);
    const pre = arcAlong(p0, T0, e, 'ext');
    pre.a = rot(p0, pre.k, -e);
    const pn = arcEnd(An);
    const post = arcAlong(pn, arcTangent(An, pn), e, 'ext');
    post.join = 'tangent';
    const ch = new Chain(this.R, [pre, { ...this.arcs[0], join: 'tangent' }, ...this.arcs.slice(1), post], this.side);
    ch.coreS0 = this.R * e; ch.coreS1 = this.R * e + this.len;
    return ch;
  }
}
