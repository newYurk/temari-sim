// @ts-check
// Display thread geometry — pure function of the pipeline result (render and validator V14 take it from here).
// The path model is unchanged: only display conventions live here, each called out.
//  • visible leg: model is a geodesic on R (thread on the surface); tube axis at R + w/2,
//    round tube of diameter w [D22] ⇒ outer point at R + w.
//  • dive into the hole (6a.18): descent starts PAST the near outer edge of the last underlying thread
//    (edge = d_hole − w/2); length min(DIVE_W·w, that distance); edge closer than w/4 → vertical.
//    lift(d) is carried until that short final dive. 90° kink at the hole is allowed.
//  • pickup E→X: model is a sub-surface chord (depth ≤ 0.02 mm); drawn dashed with axis at R − w/2.
//  • hidden start: model is a straight needle chord (35 mm ⇒ up to 4.24 mm deep). Default display is SCHEMATIC —
//    an arc just under the surface (R − HID_DEPTH_W·w) so it does not cut through the ball; mode 'chord' = model.
import { unit, mul, dist, angle, segSegDist } from './geom.js';

export const HID_DEPTH_W = 1.0;      // depth of schematic hidden-start arc, in thread widths (display convention, not model)
//  • stack (6a.17): lift(d) = DISPLAY_STACK_LIFT_W·√(w²−d²) when d < w·(1−ε), else 0 (ε = LIFT_DIST_EPS = 0.01).
//    rail-parallel (d≈w) → 0, never ×c.stack; climb → √(2wδ−δ²); transversal — tent on ±w/sinψ; wedge — c.stack.
//    Later-laid thread rises (c.over), except under-passes per recipe. Hook: A.mechanics.liftAt.
export const DISPLAY_STACK_LIFT_W = 0.6;
export const DIVE_W = 1.5;           // leg dive length into the hole, in thread widths (display convention)
/** ε for lift(d)=0 when d ≥ w·(1−ε); same 0.01 as free-leg contact (6a.17). */
export const LIFT_DIST_EPS = 0.01;
/** @deprecated 6a.17 general lift(d) supersedes kind skip; kept for tests that assert rail-parallel → 0. */
export const STACK_LIFT_SKIP_KINDS = new Set(['rail-parallel']);
const smooth = (e) => { e = Math.max(0, Math.min(1, e)); return e * e * (3 - 2 * e); };

/** Peak lift (mm) from lateral axis distance d (6a.17). Zero when d ≥ w·(1−ε). */
export function liftFromDist(d, w, k = DISPLAY_STACK_LIFT_W) {
  if (!(w > 0) || !(d < w * (1 - LIFT_DIST_EPS))) return 0;
  return k * Math.sqrt(Math.max(0, w * w - d * d));
}

/** Densify the leg polyline near both ends (step h over length zone from each end); interpolate prof. */
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
 * Stack lift profile along the leg (mm, 6a.17), sampled at the leg vertices.
 * lift(d)=0.6·√(w²−d²) for d<w; tent at a crossing; climb from δ; wedge — c.stack·0.6·w.
 */
export function stackProfile(A, seg) {
  const n = seg.pts.length, step = seg.length / Math.max(1, n - 1);
  const f = stackProfileFn(A, seg);
  const prof = new Float64Array(n);
  for (let i = 0; i < n; i++) prof[i] = f(i * step);
  return prof;
}

/**
 * Along-leg position (mm, in seg.length units) of a crossing centre: projection of c.at onto the
 * leg polyline when available (not the nearest vertex — vertices are ≈ 0.4 mm apart, a tent is
 * ±w/sinψ, so snapping the centre to a vertex under-lifts samples near holes; #31), else the vertex index.
 */
function crossingPosMm(seg, c, ic, step) {
  const pts = seg.pts;
  if (!c.at || !pts || pts.length < 2) return ic * step;
  let best = Infinity, pos = ic * step;
  const cumArr = [0];
  for (let j = 1; j < pts.length; j++) cumArr.push(cumArr[j - 1] + dist(pts[j - 1], pts[j]));
  const Lc = cumArr[cumArr.length - 1] || 1, scale = seg.length / Lc;
  for (let j = 1; j < pts.length; j++) {
    const a = pts[j - 1], b = pts[j];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [c.at[0] - a[0], c.at[1] - a[1], c.at[2] - a[2]];
    const ll = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / ll));
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    const d = dist(q, c.at);
    if (d < best) { best = d; pos = (cumArr[j - 1] + t * (cumArr[j] - cumArr[j - 1])) * scale; }
  }
  return pos;
}

/**
 * Stack lift as a function of the along-leg position x (mm, 0 … seg.length), 6a.17.
 * Evaluated directly at densified display samples (no linear interpolation of vertex values).
 * @returns {(x: number) => number}
 */
export function stackProfileFn(A, seg) {
  const n = seg.pts.length;
  const w = A.params.w_mm, kLift = DISPLAY_STACK_LIFT_W;
  const step = seg.length / Math.max(1, n - 1);
  const L = step * Math.max(1, n - 1);
  /** @type {((x: number) => number)[]} */
  const parts = [];
  for (const c of A.path.crossings) {
    if (c.over !== seg.id) continue;
    const ic = c.over === c.a ? c.iA : c.iB;
    const stack = Math.max(1, c.stack || 1);

    if (c.kind === 'wedge') {
      // Keep prior wedge extent via c.stack (6a.17).
      const half = c.halfMm ?? Math.max(w, c.lenMm / 2);
      const taper = Math.max(w, half);
      const xTop = c.iA <= 2 ? 0 : L, zone = Math.ceil((c.lenMm || half) / step) * step;
      parts.push((x) => {
        const dz = Math.abs(x - xTop);
        const t = dz <= zone ? 1 : dz >= zone + taper ? 0 : 0.5 * (1 + Math.cos(Math.PI * (dz - zone) / taper));
        return stack * kLift * w * t;
      });
      continue;
    }
    const xc = crossingPosMm(seg, c, ic, step);

    if (c.kind === 'climb') {
      // δ = how far the new axis sits inside the prior tube (≈ w − dmin).
      const dLat = c.dmin != null ? c.dmin : w;
      const delta = Math.max(0, Math.min(w, w - dLat));
      const peak = kLift * Math.sqrt(Math.max(0, 2 * w * delta - delta * delta)) * stack;
      if (peak <= 0) continue;
      const half = Math.max(w, c.lenMm / 2, c.climbMm || 0, c.halfMm || w);
      parts.push((x) => {
        const ds = Math.abs(x - xc);
        if (ds > half) return 0;
        return peak * (ds <= half * 0.5 ? 1 : 0.5 * (1 + Math.cos(Math.PI * (ds - half * 0.5) / (half * 0.5))));
      });
      continue;
    }

    if (c.kind === 'crossing' || c.kind === 'tipCross' || (c.kind !== 'rail-parallel' && c.kind !== 'contact' && c.angleDeg != null && c.angleDeg > 5)) {
      // Tent: lift(s) = 0.6·√(w² − (s−s₀)²·sin²ψ) on ±w/sinψ (6a.17).
      const psi = (c.angleDeg != null ? c.angleDeg : 90) * Math.PI / 180;
      const sinPsi = Math.max(0.05, Math.abs(Math.sin(psi)));
      const half = w / sinPsi;
      parts.push((x) => {
        const ds = Math.abs(x - xc);
        if (ds > half) return 0;
        return kLift * Math.sqrt(Math.max(0, w * w - ds * ds * sinPsi * sinPsi)) * stack;
      });
      continue;
    }

    // rail-parallel / flush / other: lift(d); d ≥ w·(1−ε) → 0. Rail-parallel never ×c.stack (6a.17 chatter).
    const d = c.dmin != null ? c.dmin : w;
    if (c.kind === 'rail-parallel') {
      // Flush packing at d ≈ w: ε floor → 0; do not amplify residual by stack level.
      continue;
    }
    const peak = liftFromDist(d, w, kLift) * stack;
    if (peak <= 0) continue;
    const half = Math.max(w, c.lenMm / 2, c.halfMm || 0);
    parts.push((x) => {
      const ds = Math.abs(x - xc);
      if (ds > half) return 0;
      return peak * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, ds / half)));
    });
  }
  return (x) => { let v = 0; for (const f of parts) v = Math.max(v, f(x)); return v; };
}

const lift = (p, r) => mul(unit(p), r);
function densifyLine(a, b, h) {
  const n = Math.max(1, Math.ceil(dist(a, b) / h)), out = [a];
  for (let k = 1; k <= n; k++) out.push(a.map((v, i) => v + (b[i] - v) * k / n));
  return out;
}
function arcAtDepth(R, a, b, depth, h) {       // great-circle arc a→b; radius R − depth with smooth in/out
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

/** For each segment in segIds (Set, or null = all): { seg, pts, radius, hidden, schematic, note }. */
/**
 * Distance from hole to the near outer edge of the nearest earlier thread tube (6a.18).
 * Edge = axis distance at hole minus w/2 (tube surface toward the hole). Dive length is
 * min(DIVE_W·w, this); edge closer than w/4 → vertical. Path samples unchanged.
 */
function clearDistFromEnd(A, seg, fromStart) {
  const w = A.params.w_mm, R = A.base.R, pts = seg.pts;
  if (!pts || pts.length < 2) return DIVE_W * w;
  const hole = fromStart ? pts[0] : pts[pts.length - 1];
  const others = A.path.segs.filter((o) => o.type === 'leg' && o.id !== seg.id
    && (o.u1 == null || seg.u0 == null || o.u1 <= seg.u0 + 1e-12)); // laid earlier
  if (!others.length) return DIVE_W * w;
  // Chord distance hole→polyline (same metric as V16 / upper-hole audit).
  let d0 = Infinity;
  for (const o of others) {
    const pts = o.pts;
    for (let j = 1; j < pts.length; j++) {
      d0 = Math.min(d0, segSegDist(hole, hole, pts[j - 1], pts[j]).d);
    }
  }
  if (!(d0 < Infinity)) return DIVE_W * w;
  // Near outer edge of underlying tube; negative ⇒ hole already inside tube → vertical dive.
  return Math.max(0, d0 - w / 2);
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
      const { P, V: V0, X, L } = densifyEnds(s.pts, prof0, zone, 0.08);
      // #31: evaluate the display lift at the densified samples (tent centre at the true crossing point),
      // not a linear interpolation of vertex values.
      const fProf = mech ? null : stackProfileFn(A, s);
      const V = fProf ? X.map((x) => fProf(x * (s.length / (L || 1)))) : V0;
      let liftMax = 0;
      const pts = P.map((p, i) => {
        liftMax = Math.max(liftMax, V[i]);
        // Surface fraction: 0 in hole, 1 after short dive past underlying-tube edge (6a.18).
        // When dive=0 (edge < w/4): vertical — e=0 only at exact end sample, else 1.
        // Short dive (= hole→near-edge) means lift(d) is full for all samples past the edge.
        const e0 = dive0 < 1e-12 ? (X[i] < 1e-9 ? 0 : 1) : smooth(Math.min(1, X[i] / Math.max(dive0, 1e-12)));
        const e1 = dive1 < 1e-12 ? ((L - X[i]) < 1e-9 ? 0 : 1) : smooth(Math.min(1, (L - X[i]) / Math.max(dive1, 1e-12)));
        const ee = Math.min(e0, e1);
        return lift(p, R - w / 2 + (w + V[i]) * ee);
      });
      out.push({ seg: s, pts, radius: w / 2, hidden: false, schematic: false, liftMax, liftSource: mech ? 'mechanics' : 'display', diveMm: [dive0, dive1] });
    } else if (s.type === 'pickup') {
      out.push({ seg: s, pts: densifyLine(lift(s.from, R - w / 2), lift(s.to, R - w / 2), 0.05), radius: w * 0.3, hidden: true, schematic: false, note: 'needle channel E→X under all threads (axis at R − w/2)' });
    } else if (hidMode === 'chord') {
      const pts = []; for (let i = 1; i < s.pts.length; i++) pts.push(...densifyLine(s.pts[i - 1], s.pts[i], 0.2).slice(i > 1 ? 1 : 0));
      out.push({ seg: s, pts, radius: w * 0.35, hidden: true, schematic: false, note: 'needle chord (model)' });
    } else {
      out.push({ seg: s, pts: arcAtDepth(R, s.from, s.to, HID_DEPTH_W * w, 0.2), radius: w * 0.35, hidden: true, schematic: true,
        note: `schematic: arc ${(HID_DEPTH_W * w).toFixed(2)} mm under the surface; model uses a chord` });
    }
  }
  return out;
}
