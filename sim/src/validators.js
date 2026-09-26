// @ts-check
// Validators — pure functions over the pipeline result (or its prefix up to operation k).
// Each: id, name (English canonical; UI translates via i18n), criterion from criteria.md / basis,
// status pass|fail|warn|info|n/a, numbers. Work may span several rounds and threads (A1, B1, A2 …).
import { dist, norm, dot, unit, sub, mul, haversineLen, cross, segSegDist, angle, add as vadd, clamp, wrapPi, halfLineAt, FRAME_N, fPoint, fSAz, fS, fToward, fEast, offsetOnLine } from './geom.js';
import { prefix } from './layers.js';
import { displayGeometry, DISPLAY_STACK_LIFT_W } from './display.js';
import { tubeMesh } from './tube.js';
import { resolveBowLambda } from './params.js';
import { widthDecomposition, u14Onset } from './diag-width.js';
import { EPS_C, DEG_MAX_W, graphDistances, halfLineGraph, holeClearances, getLegSamples } from './path.js';
import { arcEnd, arcTangent, arcPoint, Chain } from './arcs.js';
import { liftFnFor, dentFnFor, capRise, stackRise, bridgeMin, extraLengthApex, extraLength1, extraLength } from './mechanics.js';
import { rotAbout } from './program.js';

/** #53 case 1: the kiku frame of the build under validation (polar coordinates about the kiku centre, geom.js frameAt).
 *  runValidators sets it from A.layout.program for its duration; helpers called on their own see P.N. */
let VF = FRAME_N;

/** Test hook (#26 mutation): V16 fan onset over ALL threads (future ones included) instead of the causal prefix. */
let V16_ACAUSAL = false;
export function setV16AcausalForTest(on) { V16_ACAUSAL = !!on; }

/**
 * #23 (6a.11 packing): a contact is `rail-parallel` only for line neighbours of one set — legs of rows n−1 and n of the
 * same stitch and marking line, the later one laid on the rail of the earlier — at axis distance d ∈ [w(1 − εc), w].
 * Anything else (a foreign pair, a non-neighbour, or a neighbour pressed deeper than the band) is a crossing, tipCross,
 * climb, separate or unexpected, never rail-parallel. (Was: any same-set Δrow = 1 pair with d ≥ 0.5·w.)
 */
export function railParallelPair(P, Q, d, w) {
  if (!P || !Q || P.type !== 'leg' || Q.type !== 'leg' || P.set !== Q.set) return false;
  const lo = P.row <= Q.row ? P : Q, hi = lo === P ? Q : P;
  if (hi.row - lo.row !== 1 || hi.stitch !== lo.stitch || hi.line !== lo.line || hi.layMode !== 'rail') return false;
  return d != null && d >= w * (1 - EPS_C) && d <= w * (1 + 1e-9);
}

/** #23 / §5.3 (2)(3): half-length along s of the push-aside zone at a hole, w/sin ψ + w/2 (ψ = the leg's angle to the line). */
/** Spec v3.4.2 §6.4 class (ii) (Fable V20, 2026-09-26): bound on the discrete turn at a tangency point of a rail leg,
 *  3·h_T·λ_r/R in degrees — λ_r = |cot ρ| of the analytic piece CARRYING the point (a corner arc of radius w: λ_r = R/w; a
 *  great circle: 0), h_T = the output link next to the point on that piece. which = 'T1' (entry: the piece and link after
 *  T₁ = vertex mIdx) or 'T2' (exit / rail end: the piece and link before the start of the tangent tail). Returns
 *  { tolDeg, turnDeg, branch: 'piece' | 'fallback' | null } — fallback = the leg's ρ and length/legSamples (printed);
 *  null = the leg has no such point. */
export function tangentJoinTol(s, R, which = 'T1') {
  const arcs = s.arcs || [], pts = s.pts || [];
  const fb = () => ({ lr: Number.isFinite(s.rho) ? Math.abs(1 / Math.tan(s.rho)) : 0, h: s.length / getLegSamples() });
  let piece = null, iT = -1, h = null;
  if (which === 'T1') {
    if (arcs.length && arcs[0].cls !== 'splice') return { tolDeg: null, turnDeg: null, branch: null };   // no splice → no T₁ vertex
    iT = Number.isInteger(s.mIdx) && s.mIdx > 0 && s.mIdx + 1 < pts.length ? s.mIdx : -1;
    let acc = 0;
    for (const a of arcs) { acc += a.psi * R; if (acc > (s.spliceMm ?? 0) + 1e-9 * R && a.psi * R > 1e-6) { piece = a; break; } }
    if (iT > 0) h = R * angle(pts[iT], pts[iT + 1]);
  } else {
    const k = arcs.length - 1;
    if (k < 1 || arcs[k].cls !== 'tail' || arcs[k].join !== 'tangent') return { tolDeg: null, turnDeg: null, branch: null };
    for (let j = k - 1; j >= 0 && !piece; j--) if (arcs[j].psi * R > 1e-6) piece = arcs[j];   // skip round-off slivers (path liveMm)
    const J = arcs[k].a;   // the tail's start = T₂, kept as a polyline vertex (#22)
    if (J) for (let i = 1; i < pts.length - 1; i++) if (angle(pts[i], J) <= 1e-6) { iT = i; break; }   // acos floor ≈ 1e-8 rad; links ≥ 5e-4 rad
    if (iT > 0) h = R * angle(pts[iT - 1], pts[iT]);
  }
  const ok = piece && Number.isFinite(piece.rho) && iT > 0 && h != null;
  const { lr, h: hh } = ok ? { lr: Math.abs(1 / Math.tan(piece.rho)), h } : fb();
  const turnDeg = iT > 0 && iT + 1 < pts.length ? turnAngleDeg(pts[iT - 1], pts[iT], pts[iT + 1]) : null;
  return { tolDeg: 3 * hh * lr / R * 180 / Math.PI, turnDeg, branch: ok ? 'piece' : 'fallback' };
}
/** Turn (deg) of a polyline at b between the chords a→b and b→c (their tangents at b). */
function turnAngleDeg(a, b, c) {
  const bu = unit(b), t1 = unit(sub(sub(b, a), mul(bu, dot(sub(b, a), bu)))), t2 = unit(sub(sub(c, b), mul(bu, dot(sub(c, b), bu))));
  return Math.acos(Math.max(-1, Math.min(1, dot(t1, t2)))) * 180 / Math.PI;
}
export const tangentJoinTolDeg = (s, R) => tangentJoinTol(s, R, 'T1').tolDeg;
export function separateZoneMm(sinPsi, w) { return (sinPsi > 1e-12 ? w / sinPsi : Infinity) + w / 2; }

const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : String(x));

/** Discrete geodesic curvature κ_g (Fable (7)): tangent-plane turn / ds. Returns max |κ_g|.
 *  exclStartMm / exclEndMm: drop samples whose path-distance from the start/end is ≤ that
 *  (rail: exclude path-distance ≤ w from the hole only — Errata 6a.4; not a wide splice window). */
function maxAbsGeodesicKg(pts, R, exclStartMm = 0, exclEndMm = 0, pathEndMm = Infinity) {
  if (!pts || pts.length < 3 || !(R > 0)) return 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + R * angle(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  let maxAbs = 0;
  for (let i = 1; i <= pts.length - 2; i++) {
    if (cum[i] <= exclStartMm || (total - cum[i]) <= exclEndMm) continue;
    if (cum[i] > pathEndMm) continue;
    const n = unit(pts[i]);
    const proj = (t) => {
      const p = sub(t, mul(n, dot(t, n)));
      const len = Math.hypot(p[0], p[1], p[2]);
      return len < 1e-15 ? null : mul(p, 1 / len);
    };
    const tIn = proj(unit(sub(pts[i], pts[i - 1])));
    const tOut = proj(unit(sub(pts[i + 1], pts[i])));
    if (!tIn || !tOut) continue;
    const c = clamp(dot(tIn, tOut), -1, 1);
    const sn = clamp(dot(cross(tIn, tOut), n), -1, 1);
    const turn = Math.atan2(sn, c);
    const ds = (cum[i + 1] - cum[i - 1]) / 2;
    if (ds > 1e-12) maxAbs = Math.max(maxAbs, Math.abs(turn / ds));
  }
  return maxAbs;
}

/** Analytical small-circle arc length (6): L_arc = R·sinρ·|Δψ| with the SHORT signed Δψ
 *  (same convention as path.smallCircleArc). Long-arc 2π−∠ was wrong for equator-side centers. */
function smallCircleArcLen(R, from, to, Pc, rho) {
  const k = unit(Pc);
  const pa = unit(vadd(unit(from), mul(k, -dot(unit(from), k))));
  const pb = unit(vadd(unit(to), mul(k, -dot(unit(to), k))));
  let dPsi = angle(pa, pb);
  if (dot(cross(pa, pb), k) < 0) dPsi = -dPsi; // signed short ∈ (−π, π]
  return { Larc: Math.abs(R * Math.sin(rho) * dPsi), dPsi: Math.abs(dPsi) };
}

/** Rail join point T/M and expected length (Errata 6a.4 / 6a.7).
 *  Exterior (γ≥ρ): geodesic tangent to rail at T, then small-circle T→E.
 *  Interior (γ<ρ): climb/merge to M at ℓ_m = max(w, 3δ) forward along rail, then M→E. */
function railExpectLen(R, s, wMm = 0) {
  // 6a.7/6a.9 rails (concentric special-case or poly-parallel, climb or tangent):
  // laid polyline is authoritative — climb merge is not a pure small-circle formula.
  if (s.layMode === 'rail' && s.pts && s.pts.length >= 2) {
    let L = 0;
    for (let i = 1; i < s.pts.length; i++) L += R * angle(s.pts[i - 1], s.pts[i]);
    return { Lexpect: L, splice: s.spliceMm ?? 0, Larc: Math.max(0, L - (s.spliceMm ?? 0)), dPsi: 0, Tpt: null };
  }
  if (!(s.bowCenter && Number.isFinite(s.rho))) {
    let L = 0;
    if (s.pts) for (let i = 1; i < s.pts.length; i++) L += R * angle(s.pts[i - 1], s.pts[i]);
    return { Lexpect: L || (s.length ?? 0), splice: s.spliceMm ?? 0, Larc: 0, dPsi: 0, Tpt: null };
  }
  const Pc = unit(s.bowCenter), rho = s.rho;
  const X = unit(s.from), E = unit(s.to);
  const gamma = angle(Pc, X);
  let Tpt;
  if (!(gamma > 1e-12 && Math.cos(rho) > 1e-15) || Math.abs(gamma - rho) < 1e-10) {
    // Degenerate / on-rail: radial foot
    const rad = unit(sub(X, mul(Pc, dot(X, Pc))));
    Tpt = unit(vadd(mul(Pc, Math.cos(rho)), mul(rad, Math.sin(rho))));
  } else if (gamma < rho - 1e-12) {
    // Climb: M = Q0 rotated toward E by ℓ_m / (R sin ρ)
    const delta = R * (rho - gamma);
    const Lm = Math.max(wMm || 0, 3 * delta);
    const rad = unit(sub(X, mul(Pc, dot(X, Pc))));
    const Q0 = unit(vadd(mul(Pc, Math.cos(rho)), mul(rad, Math.sin(rho))));
    const pa = unit(sub(Q0, mul(Pc, dot(Q0, Pc))));
    const pb = unit(sub(E, mul(Pc, dot(E, Pc))));
    let psiQE = angle(pa, pb);
    if (dot(cross(pa, pb), Pc) < 0) psiQE = -psiQE;
    const dPsiM = (R * Math.sin(rho) > 1e-15) ? Lm / (R * Math.sin(rho)) : 0;
    const step = Math.sign(psiQE || 1) * Math.min(Math.abs(dPsiM), Math.max(Math.abs(psiQE) * 0.999, 1e-15));
    const rot = (v, ang) => {
      const c = Math.cos(ang), sn = Math.sin(ang);
      return vadd(vadd(mul(v, c), mul(cross(Pc, v), sn)), mul(Pc, dot(Pc, v) * (1 - c)));
    };
    Tpt = unit(rot(Q0, step));
  } else {
    const cosC = Math.cos(gamma) / Math.cos(rho);
    if (cosC >= 1 - 1e-14) {
      const rad = unit(sub(X, mul(Pc, dot(X, Pc))));
      Tpt = unit(vadd(mul(Pc, Math.cos(rho)), mul(rad, Math.sin(rho))));
    } else if (cosC <= -1 + 1e-14) {
      const rad = unit(sub(X, mul(Pc, dot(X, Pc))));
      Tpt = unit(vadd(mul(Pc, Math.cos(rho)), mul(rad, Math.sin(rho))));
    } else {
      const cosDpsi = Math.tan(rho) / Math.tan(gamma);
      const dPsi = Math.acos(Math.max(-1, Math.min(1, cosDpsi)));
      const radX = unit(sub(X, mul(Pc, dot(X, Pc))));
      // Rodrigues rotation about Pc
      const rot = (v, ang) => {
        const c = Math.cos(ang), sn = Math.sin(ang);
        return vadd(vadd(mul(v, c), mul(cross(Pc, v), sn)), mul(Pc, dot(Pc, v) * (1 - c)));
      };
      const T1 = unit(vadd(mul(Pc, Math.cos(rho)), mul(unit(rot(radX, dPsi)), Math.sin(rho))));
      const T2 = unit(vadd(mul(Pc, Math.cos(rho)), mul(unit(rot(radX, -dPsi)), Math.sin(rho))));
      const railLen = (T) => smallCircleArcLen(R, mul(T, R), mul(E, R), Pc, rho).Larc;
      const cost1 = R * angle(X, T1) + railLen(T1);
      const cost2 = R * angle(X, T2) + railLen(T2);
      Tpt = cost1 <= cost2 ? T1 : T2;
    }
  }
  const splice = R * angle(X, Tpt);
  const { Larc, dPsi } = smallCircleArcLen(R, mul(Tpt, R), mul(E, R), Pc, rho);
  return { Lexpect: splice + Larc, splice, Larc, dPsi, Tpt };
}


const TOL_JOIN = 1e-9;        // mm — continuity (numeric tolerance)
const TOL_LEN = 1e-9;         // mm — length balance (numeric)
const TOL_REF = 1e-6;         // mm — match calc.py (two independent implementations of the same geometry)
const TOL_PERP_DEG = 1e-6;    // ° — perpendicularity: model builds it exactly; numeric tolerance
const TOL_SYM = 1e-9;         // mm — symmetry base (V6 legs); V15 uses 0.01·w (noise vs real asymmetry, #35)
const TOL_RAD = 1e-9;         // mm — model radial position (numeric)
const TOL_MESH = 1e-6;        // mm — tube mesh (frame rotation accumulation)


/**
 * Clairaut on a sphere: sin(α)·sin(s/R) = const.
 * Returns the average of tan(α(s)) between sHole and sTip (inclusive samples).
 * Used by K16b (6a.20): mean tan α between the hole and tip-n level.
 */
export function clairautAvgTan(alphaHole, sHole, sTip, R, samples = 16) {
  if (!(R > 0) || !Number.isFinite(alphaHole)) return Math.tan(alphaHole || 0);
  const s0 = Number(sHole), s1 = Number(sTip);
  if (!Number.isFinite(s0) || !Number.isFinite(s1) || Math.abs(s1 - s0) < 1e-15) {
    return Math.tan(alphaHole);
  }
  const C = Math.sin(alphaHole) * Math.sin(s0 / R);
  const tanAt = (s) => {
    const sinTh = Math.sin(s / R);
    if (!(Math.abs(sinTh) > 1e-12)) return Math.tan(alphaHole);
    const arg = Math.max(-1, Math.min(1, C / sinTh));
    return Math.tan(Math.asin(arg));
  };
  const n = Math.max(1, samples | 0);
  let sum = 0;
  for (let i = 0; i <= n; i++) sum += tanAt(s0 + (s1 - s0) * (i / n));
  return sum / (n + 1);
}

/**
 * Meridian angle α of the great-circle through from→to, evaluated at `at` (K16b per covering leg).
 * Matches independent audit: atan2(|T·east|, |T·meridian|).
 */
export function geodesicAlphaAt(from, to, at) {
  return gcAlphaAt(cross(unit(from), unit(to)), at);
}

/** Meridian angle α at `at` of the great circle with pole N (any length, either sign) through `at`. */
export function gcAlphaAt(N, at) {
  const P = unit(at);
  const nLen = Math.hypot(N[0], N[1], N[2]);
  if (!(nLen > 1e-15)) return 0;
  const Nu = [N[0] / nLen, N[1] / nLen, N[2] / nLen];
  let T = cross(Nu, P);
  const tLen = Math.hypot(T[0], T[1], T[2]);
  if (!(tLen > 1e-15)) return 0;
  T = [T[0] / tLen, T[1] / tLen, T[2] / tLen];
  let eS, eP;
  if (VF.atN) {
    const th = Math.acos(clamp(P[2]));
    const phi = Math.atan2(P[1], P[0]);
    eS = [Math.cos(th) * Math.cos(phi), Math.cos(th) * Math.sin(phi), -Math.sin(th)];
    eP = [-Math.sin(phi), Math.cos(phi), 0];
  } else { eS = mul(fToward(VF, P), -1); eP = fEast(VF, P); }   // #53: the meridian of the kiku centre through P
  return Math.atan2(Math.abs(dot(T, eP)), Math.abs(dot(T, eS)));
}

/**
 * Spec v3.1 §3.2(15), §6.13 (#39): α of the ACTUAL leg at its hole — the great circle tangent to the leg's
 * analytic arc at that hole (a rail leg: its tangent tail / continuation great circle with known pole; a free
 * leg: its great circle through the actual holes; a splice: the geodesic from the hole). Not the geodesic
 * through the leg's two ends when the leg is not a geodesic. atEnd: the hole is the leg's end (else its start).
 */
export function legAlphaAt(L, hole, atEnd) {
  const arcs = L?.arcs;
  if (!arcs || !arcs.length) return geodesicAlphaAt(L.from, L.to, hole);
  const A = atEnd ? arcs[arcs.length - 1] : arcs[0];
  const H = unit(hole);
  const T = cross(A.k, H); // arc tangent at the hole (arcs.js: arcTangent)
  return gcAlphaAt(cross(H, T), H);
}

/** Polar tip level s = R·acos(z) (same as independent K16b audit). */
export function tipLevelMm(p, R) {
  return fS(R, VF, p);   // #53: arc from the kiku centre
}

/**
 * K16b two-sided Clairaut window (Fable 6a.20 correction of one-sided 6a.17).
 * Outgoing leg of row n+2 at tip-n level:
 *   x_leg = −(m + w)/2 + (Δ_{n+1} + Δ_{n+2}) · tanα
 * Coverage of E_n ⟺ |x_leg − x_E| ≤ w / (2 cos α).
 * Overshoot (leg past E beyond the half-width) is NOT coverage.
 *
 * @param {object} args
 * @param {number} args.m  marking gap m (mm)
 * @param {number} args.w  thread width (mm)
 * @param {number} args.alpha  angle α (rad) used for cos α (and tan α if tanAlpha omitted)
 * @param {number} args.deltaSum  Δ_{n+1}+Δ_{n+2} (mm)
 * @param {number} args.xE  signed lateral of E_n (mm), typically +(m+w)/2
 * @param {number} [args.tanAlpha]  Clairaut-average tan α; defaults to tan(alpha)
 * @param {number} [args.xX]  if set, also evaluate mirrored incoming-leg coverage of X_n
 * @returns {{ xLeg: number, xLegX: number|null, half: number, coveredE: boolean, coveredX: boolean|null, dxE: number }}
 */
export function k16bCoverageWindow({ m, w, alpha, deltaSum, xE, tanAlpha, xX }) {
  const tanA = tanAlpha != null && Number.isFinite(tanAlpha) ? tanAlpha : Math.tan(alpha);
  const cosA = Math.cos(alpha);
  const half = (cosA > 1e-12) ? w / (2 * cosA) : Infinity;
  const xLeg = -(m + w) / 2 + deltaSum * tanA;
  const dxE = xLeg - xE;
  const coveredE = Math.abs(dxE) <= half + 1e-9;
  let xLegX = null, coveredX = null;
  if (xX != null && Number.isFinite(xX)) {
    // Incoming leg of n+2 (mirror): starts at +(m+w)/2 and shifts by −Δsum·tanα
    xLegX = (m + w) / 2 - deltaSum * tanA;
    coveredX = Math.abs(xLegX - xX) <= half + 1e-9;
  }
  return { xLeg, xLegX, half, coveredE, coveredX, dxE };
}

export function refKey(A) {
  const P = A.params;
  const g = (x) => String(Number(x));
  return `C=${g(P.C_mm)}|w=${g(P.w_mm)}|m=${g(P.m_mm)}|N=${P.N}|sTop=${A.layout.sTop.toFixed(6)}|bfe=${P.bottomFromEq.toFixed(6)}|start=${P.startRule}:${g(P.startRun_mm)}`;
}

function bbox(pts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return { lo, hi };
}
const boxGap = (a, b) => Math.max(0, a.lo[0] - b.hi[0], b.lo[0] - a.hi[0], a.lo[1] - b.hi[1], b.lo[1] - a.hi[1], a.lo[2] - b.hi[2], b.lo[2] - a.hi[2]);
// #43: minDist with an exact branch-and-bound prune. Segments are grouped in chunks of MD_CHUNK with axis-aligned
// bounding boxes; a (chunk of A) × (chunk of B) block is skipped only when the box gap exceeds the current best by
// MD_EPS, where no segment pair inside can reach r.d < best.d (segment distance ≥ box gap; MD_EPS ≫ rounding).
// Pairs are still visited in the same i-then-j order with the same strict '<', so the winner (d, cp, cq, i, j) is
// identical to the plain O(n·m) scan (test 8m compares both on every validator output).
const MD_CHUNK = 16, MD_EPS = 1e-9;
const mdChunks = new WeakMap();
function chunkBoxes(P) {
  let c = mdChunks.get(P);
  if (c) return c;
  c = [];
  for (let j0 = 1; j0 < P.length; j0 += MD_CHUNK) {
    const j1 = Math.min(P.length - 1, j0 + MD_CHUNK - 1);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let j = j0 - 1; j <= j1; j++) for (let a = 0; a < 3; a++) { const x = P[j][a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; }
    c.push({ j0, j1, lo, hi });
  }
  mdChunks.set(P, c);
  return c;
}
function chunkGap(a, b) {
  let g2 = 0;
  for (let k = 0; k < 3; k++) { const d = Math.max(a.lo[k] - b.hi[k], b.lo[k] - a.hi[k], 0); g2 += d * d; }
  return Math.sqrt(g2);
}
function minDistPlain(A, B) {
  let best = { d: Infinity };
  for (let i = 1; i < A.length; i++) for (let j = 1; j < B.length; j++) {
    const r = segSegDist(A[i - 1], A[i], B[j - 1], B[j]);
    if (r.d < best.d) best = { ...r, i, j };
  }
  return best;
}
function minDist(A, B) {
  if (MIN_DIST_PLAIN) return minDistPlain(A, B);
  let best = { d: Infinity };
  const ca = chunkBoxes(A), cb = chunkBoxes(B);
  const gap = new Float64Array(cb.length);
  for (const a of ca) {
    for (let q = 0; q < cb.length; q++) gap[q] = chunkGap(a, cb[q]);
    for (let i = a.j0; i <= a.j1; i++) for (let q = 0; q < cb.length; q++) {
      if (gap[q] > best.d + MD_EPS) continue;
      const b = cb[q];
      for (let j = b.j0; j <= b.j1; j++) {
        const r = segSegDist(A[i - 1], A[i], B[j - 1], B[j]);
        if (r.d < best.d) best = { ...r, i, j };
      }
    }
  }
  return best;
}
/** Test hook (#43, group 8m): true → minDist uses the plain O(n·m) scan, for the equality check. */
let MIN_DIST_PLAIN = false;
export function setMinDistPlain(v) { MIN_DIST_PLAIN = !!v; }
function ptPolyDist(p, B) {
  let d = Infinity;
  for (let j = 1; j < B.length; j++) d = Math.min(d, segSegDist(p, p, B[j - 1], B[j]).d);
  return d;
}

/** stage: klyuch recipe.stages ('2a' | '2b' | 'B1' | 'A2') ili chislo (indeks operatsii). ref — calc_reference.json (ili null). */
/**
 * V6 by the classes of spec v3.2 §6.11 (#25) with (12′)–(12‴) (#45). Leg i runs from stitch i−1 to stitch i (i = 1…N);
 * i1 = L0→L1, iN = L(N−1)→L0 (closing leg). The closing stitch of round n on L0 IS the top stitch of row n+1 on L0, and the
 * round-1 start stitch (hidden start, holes E₀/X₀, channel) is the row-1 top on L0. So there is no affected class any more:
 *  - clean: pairs (i, i+2) of legs i3…i(N−1) and stitch points under the rotation by 2·2π/N (≤ 1.4e−6·w, class (i));
 *  - B = A rotated by 2π/N (same row);
 *  - step: s(i1) − s(i3) = 0 ± 0.1·w (no transition step);
 *  - L0 vs L2 (row n: the L0 top — closing of round n−1 / start stitch — against top i2 of round n): hole x and s within
 *    ±0.1·w; hole e within ±0.2·w — the arrival-direction residual (spiral), class (iii), printed per row; e > 0.2·w fails
 *    and prints both clusters;
 *  - shape: leg i1 against rot(i3) within 0.1·w (i2 against rot(i4) likewise).
 * The last round's closing stitch (at s_T(N+1): no outgoing leg, not in the row count) is compared with nothing.
 */
export const V6_TOL = { cleanW: 1.4e-6, affW: 0.1, eW: 0.2 };
const polyDist = (p, pts) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segSegDist(p, p, pts[i - 1], pts[i]).d); return d; };
const maxPtDev = (a, b, f) => { if (a.length !== b.length) return Infinity; let d = 0; for (let q = 0; q < a.length; q++) d = Math.max(d, dist(f(a[q]), b[q])); return d; };
/** Point at arc offset d (mm) from the marking line at (s, φ) along the needle line (the great circle through the point
 *  in the east direction) — the y coordinate of needleSides. */
function needlePt(R, s, phi, d) {
  const c = fPoint(R, VF, s, phi), u = unit(c), t = fEast(VF, c);
  return mul(vadd(mul(u, Math.cos(d / R)), mul(t, Math.sin(d / R))), R);
}
/** Own cluster edge on the X side (y < 0) of the needle line at (s, φ): marking [−m/2, m/2] grown by own threads (axis
 *  closer than w/2) while the gap is < w (§5.3 (1)). threads: [{ pts, disk }] — polylines, or points (hidden-start holes).
 *  Sampled every h mm; returns { lo, ids }. */
export function ownClusterLo({ R, s, phi, m, w, threads, yMax, h = 0.0025 }) {
  const C = fPoint(R, VF, s, phi), rad = (yMax || 10) + 2 * w;
  // only links reaching the band |f| < w/2 around the needle plane can occupy it (speed only; the result is the same)
  const nP = unit(cross(unit(C), fEast(VF, C))), band = Math.sin(w / 2 / R) * 1.001;
  const f0 = (p) => dot(p, nP) / norm(p);
  const inBand = (a, b) => { const fa = f0(a), fb = f0(b); return !((fa > band && fb > band) || (fa < -band && fb < -band)); };
  const near = [];
  for (const T of threads) {
    if (T.disk) { if (dist(T.disk, C) < rad && inBand(T.disk, T.disk)) near.push({ id: T.id, a: T.disk, b: T.disk }); continue; }
    const P = T.pts;
    for (let i = 1; i < P.length; i++) if (inBand(P[i - 1], P[i]) && Math.min(dist(P[i - 1], C), dist(P[i], C)) < rad + dist(P[i - 1], P[i])) near.push({ id: T.id, a: P[i - 1], b: P[i] });
  }
  let lo = -m / 2;
  const ids = new Set();
  for (let y = -m / 2 - h; y > -(yMax || 10); y -= h) {
    const q = needlePt(R, s, phi, y);
    let hit = null;
    for (const g of near) if (segSegDist(q, q, g.a, g.b).d < w / 2) { hit = g.id; break; }
    if (hit != null) { lo = y; ids.add(hit); } else if (lo - y >= w) break;
  }
  return { lo, ids, near };
}
/** Free root on the E-line: the first s > s0 where the E-line point (offset eOff from line φ) lies w from the previous
 *  row's leg of this stitch, continued past its end along the great circle of its last link (§3.2 (9а), (12)). */
export function eLineRoot({ R, phi, eOff, prevPts, s0, w, ds = 0.05, sMax = 12 }) {
  const P = prevPts.slice(-24), a = unit(P[P.length - 2]), b = unit(P[P.length - 1]);   // the end of the leg is enough: the root lies within Δ of it
  const ax = unit(cross(a, b));
  const ext = [P[P.length - 1]];
  const Lext = sMax / R;
  for (let k = 1; k <= 120; k++) { const th = Lext * k / 120; const t = unit(cross(ax, b)); ext.push(mul(vadd(mul(b, Math.cos(th)), mul(t, Math.sin(th))), R)); }
  const d = (sv) => Math.min(polyDist(needlePt(R, sv, phi, eOff), P), polyDist(needlePt(R, sv, phi, eOff), ext)) - w;
  let lo = s0, flo = d(lo);
  for (let sv = s0 + ds; sv < s0 + sMax; sv += ds) {
    const fv = d(sv);
    if (flo < 0 && fv >= 0) { let hi = sv; for (let it = 0; it < 60; it++) { const mid = 0.5 * (lo + hi); if (d(mid) < 0) lo = mid; else hi = mid; } return 0.5 * (lo + hi); }
    lo = sv; flo = fv;
  }
  return NaN;
}
export function v6Metrics(A, rounds) {
  // #53 commit 1: the symmetry classes come from the program — petals of a set repeat under the rotation about the kiku
  // centre by petalShift·2π/v; set B = set A rotated by its start-line shift (S8: the z-rotations by 2·2π/8 and 2π/8).
  const path = A.path, w = A.params.w_mm, SY = A.layout.program.symmetry, N = SY.v;
  const segById = new Map(path.segs.map((s) => [s.id, s]));
  const r2 = rotAbout(SY.axis, SY.petalShift * (2 * Math.PI / N));
  const stOf = (r) => { const o = {}; for (const k of r.stitchIdx) o[path.stitches[k].i] = path.stitches[k]; return o; };
  const legOf = (st) => segById.get(st.legId);
  const cluOf = (pk) => (pk?.cluster || []).map((c) => c.seg).join(',') + (pk?.virtualCluster?.length ? ` +virtual ${pk.virtualCluster.map((c) => c.seg).join(',')}` : '');
  const out = [];
  for (const r of rounds) {
    const st = stOf(r);
    if (Object.keys(st).length < N) continue;
    let clean = 0, cleanAt = '';
    for (let i = 3; i + 2 <= N - 1; i++) {
      const d = maxPtDev(legOf(st[i]).pts, legOf(st[i + 2]).pts, r2);
      if (d > clean) { clean = d; cleanAt = `leg ${i}→${i + 2}`; }
    }
    for (let i = 2; i + 2 <= N - 1; i++) {
      const d = Math.max(dist(r2(st[i].E), st[i + 2].E), dist(r2(st[i].X), st[i + 2].X));
      if (d > clean) { clean = d; cleanAt = `stitch ${i}→${i + 2}`; }
    }
    let bVsA = null;
    const shB = SY.sets[r.set];
    if (shB && shB.shift) {
      const ra = rounds.find((q) => q.set === shB.from && q.row === r.row);
      const r1 = rotAbout(SY.axis, shB.shift * (2 * Math.PI / N));
      if (ra) {
        const sa = stOf(ra);
        bVsA = 0;
        for (let i = 1; i <= N; i++) bVsA = Math.max(bVsA, maxPtDev(legOf(sa[i]).pts, legOf(st[i]).pts, r1), dist(r1(sa[i].E), st[i].E), dist(r1(sa[i].X), st[i].X));
      }
    }
    // step (12′): no transition step — bottoms i1 and i3 at one level
    const step = { actual: st[1].s - st[3].s, expected: 0, dev: Math.abs(st[1].s - st[3].s) };
    // L0 top of this row: the closing stitch of the previous round, or (row 1) the start stitch channel E₀ → X₀
    let l0 = null;
    const prev = r.row > 1 ? path.rounds.find((q) => q.set === r.set && q.row === r.row - 1) : null;
    const pk2 = segById.get(st[2].pickupId);
    if (prev) {
      const sp = stOf(prev)[N];
      if (sp) l0 = { src: `${prev.id}.i${N}`, s: sp.s, eOff: sp.eOff, xOff: sp.xOff, clu: cluOf(segById.get(sp.pickupId)) };
    } else {
      const pk0 = path.segs.find((sg) => sg.startStitch && sg.round === r.id);
      if (pk0) l0 = { src: `${r.id} start`, s: A.layout.sTop, eOff: pk0.eOff, xOff: pk0.xOff, clu: cluOf(pk0) };
    }
    const L0 = l0 ? { src: l0.src, dx: l0.xOff - st[2].xOff, de: l0.eOff - st[2].eOff, ds: l0.s - st[2].s, cluL0: l0.clu, cluL2: cluOf(pk2) } : null;
    const shape = maxPtDev(legOf(st[1]).pts, legOf(st[3]).pts, r2);
    const i2 = maxPtDev(legOf(st[2]).pts, legOf(st[4]).pts, r2);
    out.push({ id: r.id, set: r.set, row: r.row, begin: r.begin, clean, cleanAt, bVsA, step, L0, shape, i2 });
  }
  return { rounds: out };
}
/** Status of V6 from its metrics (pure; the tests feed mutated metrics to every branch). */
export function v6Judge(M6, w) {
  const T = V6_TOL, fails = [];
  for (const q of M6.rounds) {
    if (!(q.clean <= T.cleanW * w)) fails.push(`${q.id} clean class ${q.cleanAt} ${f(q.clean, 9)} mm > ${T.cleanW}·w`);
    if (q.bVsA != null && !(q.bVsA <= T.cleanW * w)) fails.push(`${q.id} B ≠ rot(A) by ${f(q.bVsA, 9)} mm`);
    if (!(q.step.dev <= T.affW * w)) fails.push(`${q.id} step ${f(q.step.actual / w, 3)}w ≠ 0 ± ${T.affW}w`);
    if (!(q.shape <= T.affW * w)) fails.push(`${q.id} i1 vs rot(i3) ${f(q.shape / w, 3)}w > ${T.affW}w`);
    if (!(q.i2 <= T.affW * w)) fails.push(`${q.id} i2 vs rot(i4) ${f(q.i2 / w, 3)}w > ${T.affW}w`);
    const c = q.L0;
    if (c) {
      if (!(Math.abs(c.dx) <= T.affW * w)) fails.push(`${q.id} L0 (${c.src}) vs L2 hole x ${f(c.dx / w, 3)}w > ${T.affW}w`);
      if (!(Math.abs(c.ds) <= T.affW * w)) fails.push(`${q.id} L0 (${c.src}) vs L2 level ${f(c.ds / w, 3)}w > ${T.affW}w`);
      if (!(Math.abs(c.de) <= T.eW * w)) fails.push(`${q.id} L0 (${c.src}) vs L2 hole e ${f(c.de / w, 3)}w > ${T.eW}w (arrival-direction residual); clusters L0 [${c.cluL0}] L2 [${c.cluL2}]`);
    }
  }
  return { status: fails.length ? 'fail' : 'pass', reasons: fails };
}
export function runValidators(A, stage = '2b', ref = null) {
  if (!A.layout?.program?.frame) throw new Error('validators: the layout carries no program frame');
  VF = A.layout.program.frame;
  try { return runValidatorsIn(A, stage, ref); } finally { VF = FRAME_N; }
}
function runValidatorsIn(A, stage, ref) {
  const path = A.path;
  const kEnd = typeof stage === 'number' ? stage : path.stageEnd[stage];
  const { ops, segs, ids } = prefix(path, kEnd);
  const R = A.base.R, w = A.params.w_mm, m = A.params.m_mm, N = A.layout.program.v;
  const out = [];
  // (9б′) (#46): V5, V6, V8, K16 of an invalid build print the exclusion (invTxt, defined below, read at call time).
  const add = (v) => { if (invTxt && ['V5', 'V6', 'V8', 'K16'].includes(v.id) && typeof v.value === 'string' && !v.value.includes('build invalid')) v.value += invTxt; out.push(v); };
  const segById = new Map(path.segs.map((s) => [s.id, s]));
  const stitchesDone = path.stitches.filter((st) => ids.has(st.pickupId));
  const roundsIn = path.rounds.filter((r) => ops.some((o) => o.round === r.id));
  const roundDone = (r) => kEnd >= r.opLast;
  // (9б′) (#46): a contradiction entry marks the build invalid from its row — rows ≥ n are left out of V5, V6, V8, K16
  // (and of the row count, path.rowsValid); V22 fails and prints the leg, d_n and the chord clearance.
  const invRow = path.invalidFrom ? path.invalidFrom.row : Infinity;
  const rowOk = (x) => !((x?.row ?? 0) >= invRow);
  const segsOk = segs.filter(rowOk), stOk = stitchesDone.filter(rowOk), roundsOk = roundsIn.filter(rowOk);
  const idsOk = Number.isFinite(invRow) ? new Set([...ids].filter((id) => { const x = segById.get(id); return !x || rowOk(x); })) : ids;
  const invTxt = Number.isFinite(invRow) ? ` [build invalid from row ${invRow} (V22): rows ≥ ${invRow} left out]` : '';
  const threadIds = [...new Set(segs.map((s) => s.thread))];

  // V1 — each thread is continuous (K13); resume from park point
  {
    let maxGap = 0, uGap = 0, resumes = 0, resumeGap = 0;
    for (const t of threadIds) {
      const ts = segs.filter((s) => s.thread === t);
      for (let i = 1; i < ts.length; i++) {
        maxGap = Math.max(maxGap, dist(ts[i - 1].to, ts[i].from));
        uGap = Math.max(uGap, Math.abs(ts[i].u0 - ts[i - 1].u1));
      }
    }
    for (const r of roundsIn.filter((r) => r.begin === 'resume')) {
      const prev = path.rounds.find((q) => q.thread === r.thread && q.opLast < r.opFirst && q.set === r.set && q.row === r.row - 1);
      const first = segById.get(r.firstLegId);
      if (prev && first && ids.has(first.id)) { resumes++; resumeGap = Math.max(resumeGap, dist(first.from, path.stitches[prev.stitchIdx[prev.stitchIdx.length - 1]].X)); }
    }
    const ok = maxGap < TOL_JOIN && uGap < TOL_LEN && resumeGap < TOL_JOIN;
    add({ id: 'V1', name: 'Each thread is continuous', crit: 'K13; prior #112 (one thread per colour — one path); GT14 «Return to Color A»',
      status: ok ? 'pass' : 'fail',
      value: `threads ${threadIds.length} (${threadIds.join(', ')}); segments ${segs.length}; max gap ${f(maxGap, 12)} mm; u jump ${f(uGap, 12)} mm; post-park resumes ${resumes} (gap ${f(resumeGap, 12)} mm)` });
  }
  // V2 — length balance + independent length checks: haversine (geodesic) / formula (6) (small-circle)
  {
    let ok = true, hvMax = 0, arcMax = 0, polyMax = 0;
    // Tolerances relative to R (dimensionless, #35). The absolute arcMax < 1e−6 mm sat on the noise:
    // formula (6) vs seg.length residual 5.7e−7 mm (1.5e−8·R) became 1.006e−6 mm under ×1.25. Numeric
    // noise on grids 96–384: arc ≤ 2.1e−8·R, poly ≤ 1e−12·R, haversine ≤ 1e−15·R; a real length error
    // is ≥ 1e−3 mm (≈ 3e−5·R). Tolerances sit ~50× above the noise and ~30× below a real error.
    const tolArc = 1e-6 * R, tolPoly = 1e-6 * R, tolHv = 1e-10 * R, tolBal = 1e-10 * R;
    const per = {};
    for (const t of threadIds) {
      const ts = segs.filter((s) => s.thread === t);
      const sum = ts.reduce((a, s) => a + s.length, 0);
      const du = ts[ts.length - 1].u1 - ts[0].u0;
      if (Math.abs(sum - du) >= tolBal) ok = false;
      const by = {};
      for (const s of ts) by[s.type] = (by[s.type] || 0) + s.length;
      const rounds = {};
      for (const s of ts) rounds[s.round] = (rounds[s.round] || 0) + s.length;
      per[t] = { sum, du, by, rounds };
    }
    let nGeo = 0, nArc = 0;
    for (const s of segs.filter((s) => s.type === 'leg')) {
      if (s.layMode === 'rail') {
        // Rail path length = polyline sum (not X–E geodesic / haversine).
        nArc++;
        let sph = 0;
        if (s.pts) for (let i = 1; i < s.pts.length; i++) sph += R * angle(s.pts[i - 1], s.pts[i]);
        polyMax = Math.max(polyMax, Math.abs(sph - s.length));
      } else if (s.bowCenter && Number.isFinite(s.rho)) {
        nArc++;
        const { Lexpect, splice, Larc, dPsi } = railExpectLen(R, s, w);
        arcMax = Math.max(arcMax, Math.abs(Lexpect - s.length));
        const nSamp = Math.max(1, (s.pts?.length || 1) - 1);
        let sph = 0;
        if (s.pts) for (let i = 1; i < s.pts.length; i++) sph += R * angle(s.pts[i - 1], s.pts[i]);
        const tolChord = Math.max(tolPoly, Math.abs(Larc) * (dPsi / nSamp) ** 2 / 12 + splice);
        polyMax = Math.max(polyMax, Math.abs(sph - Lexpect) - tolChord);
      } else {
        nGeo++;
        const a = fSAz(R, VF, s.from), b = fSAz(R, VF, s.to);
        hvMax = Math.max(hvMax, Math.abs(haversineLen(R, a.s, a.phi, b.s, b.phi) - s.length));
      }
    }
    ok = ok && hvMax < tolHv && arcMax < tolArc && polyMax < tolPoly;
    add({ id: 'V2', name: 'Length balance per thread: u = Σ segments', crit: 'K13; model/spec.md §5; Fable v2 §5.8 formula (6) for small-circle arcs',
      status: ok ? 'pass' : 'fail',
      value: threadIds.map((t) => { const p = per[t]; return `thread ${t}: Σ = ${f(p.sum)} mm = u ${f(p.du)} (${Object.entries(p.rounds).map(([r, L]) => `${r} ${f(L)}`).join(', ')}; start ${f(p.by['hidden-start'] || 0)}, legs ${f(p.by.leg || 0)}, pickups ${f(p.by.pickup || 0)})`; }).join('; ') +
        `; haversine (geodesic ${nGeo}): ${f(hvMax, 12)} mm` +
        (nArc ? `; arc (6) vs seg.length (n=${nArc}): ${f(arcMax, 12)} mm; poly vs (6) excess ${f(Math.max(0, polyMax), 9)}` : ''),
      numbers: { per, hvMax, arcMax, polyMax, nGeo, nArc, tolArc, tolPoly, tolHv, tolBal } });
  }
  // V3 — soglasie obkhoda A1 s calc.py (mezavisimaya realofatsiya, numpy)
  {
    const A1 = path.rounds[0];
    const a1Segs = segs.filter((s) => s.round === A1.id);
    const a1St = stitchesDone.filter((st) => st.round === A1.id);
    const e = ref && ref.entries ? ref.entries.find((x) => x.key === refKey(A)) : null;
    if (!e) add({ id: 'V3', name: 'A1 agrees with calc.py', crit: 'cross-check of two implementations', status: 'info',
      value: `no reference for these params (${refKey(A)}); run python3 sim/tools/calc_reference.py` });
    else {
      // (12′)–(12″) (#45): the round-1 closing stitch is the L0 top of row 2 (placed by the own cluster) — it and its leg
      // are left out; the start stitch (hidden start ending at E₀, channel E₀ → X₀) is part of row 1.
      const Nn = A.layout.program.v;
      // #53: calc.py computes the kiku about P.N; its points are mapped into the kiku frame (identity at P.N)
      const toF = VF.atN ? (p) => p : (p) => [0, 1, 2].map((i) => p[0] * VF.z0[i] + p[1] * VF.e2[i] + p[2] * VF.c[i]);
      let dXY = dist(A1.start.X0, toF(e.X0));
      if (A1.start.E0 && e.E0) dXY = Math.max(dXY, dist(A1.start.E0, toF(e.E0)));
      for (const st of a1St) { if (st.i === Nn) continue; const r = e.stitches[st.i - 1]; dXY = Math.max(dXY, dist(st.E, toF(r.E)), dist(st.X, toF(r.X))); }
      const rowSegs = a1Segs.filter((s) => s.type !== 'hidden-start' && s.stitch !== Nn);
      const rowLen = rowSegs.reduce((a, s) => a + s.length, 0);
      const full = kEnd >= A1.opLast;
      // #48: a bow build (λ > 0, the site default since #47) is compared with the bow reference of calc_reference.py —
      // the small-circle arc (ρ = atan(1/λ)) through calc.py's own holes, in closed form (arms_bow / row1_open_bow, keyed by
      // String(λ)); class (i) tolerance (the sim's row-1 leg length is the analytic arc). A λ outside the reference set
      // (or a sag-commanded bow) has no reference: the length is printed, not compared (E/X, E₀/X₀, hidden start still are).
      const form = A.params.shoulderForm;
      const bowLam = form === 'bow' || form === 'bowToMarking' ? (resolveBowLambda(A.params, { R: A.base.R })?.lambda ?? NaN) : 0;
      const bowRow1 = (form === 'bow' || form === 'bowToMarking') && (!(bowLam === 0) || +A.params.bowSagMm > 0);
      const sagCmd = A.params.bowSagMm !== '' && A.params.bowSagMm != null && Number.isFinite(+A.params.bowSagMm) && +A.params.bowSagMm > 0;
      const bowKey = bowRow1 && !sagCmd && Number.isFinite(bowLam) ? String(Number(bowLam)) : null;
      const bowArms = bowKey ? e.arms_bow?.[bowKey] : null;
      const bowRef = bowRow1 && Array.isArray(bowArms) && Number.isFinite(e.row1_open_bow?.[bowKey]);
      const arms = bowRef ? bowArms : e.arms;
      let refLen = 0;
      if (full) refLen = bowRef ? e.row1_open_bow[bowKey] : e.row1_open;
      else for (const s of rowSegs) refLen += s.stitch === 0 ? e.start_channel : s.type === 'leg' ? arms[s.stitch - 1] : e.bites[s.stitch - 1];
      const hid = a1Segs.filter((s) => s.type === 'hidden-start').reduce((a, s) => a + s.length, 0);
      const lenCompared = !bowRow1 || bowRef;
      const ok = (!lenCompared || Math.abs(rowLen - refLen) < TOL_REF) && dXY < TOL_REF && Math.abs(hid - e.hidden_start) < TOL_REF;
      add({ id: 'V3', name: 'A1 agrees with calc.py', crit: 'cross-check of two implementations of one geometry',
        status: ok ? 'pass' : 'fail',
        value: `${full ? 'row 1 without the closing (legs + pickups + start channel; (12′))' : 'row-1 prefix'}: sim ${f(rowLen, 4)} mm, calc.py ${f(refLen, 4)} mm (Δ ${f(Math.abs(rowLen - refLen), 9)}${bowRef ? `; bow λ ${f(bowLam, 3)}: calc.py small-circle arms (#48)` : bowRow1 ? `; bow λ ${f(bowLam, 3)}: no bow reference for this λ — length printed, not compared` : ''}); E/X Δmax ${f(dXY, 9)} mm; skrytyy start ${f(hid)} vs ${f(e.hidden_start)} mm`,
        numbers: { rowLen, refLen, dXY, hid, refHidden: e.hidden_start, refRow1: e.row1_open, bowRef: !!bowRef, lenCompared } });
    }
  }
  // V4 — catch ⟂ linii, protiv khoda, under potopnostyu
  {
    let maxDev = 0, wrongSide = 0, notUnder = 0;
    for (const st of stitchesDone) {
      const C = fPoint(R, VF, st.s, A.layout.program.az[st.line]);
      const chord = unit(sub(st.X, st.E));
      maxDev = Math.max(maxDev, Math.abs(90 - Math.acos(Math.min(1, Math.abs(dot(chord, fToward(VF, C))))) * 180 / Math.PI));
      if (!(dot(st.E, fEast(VF, C)) > 0 && dot(st.X, fEast(VF, C)) < 0)) wrongSide++;
      if (norm(st.E.map((v, i) => (v + st.X[i]) / 2)) >= R) notUnder++;
    }
    const ok = maxDev < TOL_PERP_DEG && wrongSide === 0 && notUnder === 0;
    add({ id: 'V4', name: 'Catch ⟂ to line, against grain, under surface', crit: 'OLY-BASIC «垂直に», «逆方向»; TK-LITTLE «right angle»',
      status: stitchesDone.length ? (ok ? 'pass' : 'fail') : 'n/a',
      value: `stitches ${stitchesDone.length}; max deviation from 90° ${f(maxDev, 9)}°; E-right/X-left violations ${wrongSide}; channel-inside-ball violations ${notUnder}` });
  }
  // V5 — stitches on their lines and levels (K1–K3), catch does not reach the neighbour line. (12′) (#45): no transition
  // step, so the bottoms of a row lie at one level on every line (spread ≤ 0.1·w, class (iii)); the tops are grouped by
  // ROW — the closing stitch of round n is the L0 top of row n+1, the start stitch (s_T(1)) the L0 top of row 1; the last
  // round's closing (s_T(N+1), no outgoing leg, not in the row count) is left out.
  {
    const stitchesDone = stOk, roundsIn = roundsOk;
    let wrongLine = 0, reach = 0;
    const tol = 0.1 * w;
    // #54 (Fable 54b §1, spec 3.3.2 §6.11): every hole keeps c(φ) = m/2 + (w/2)·cos φ from every foreign marking line /
    // circle (φ = angle between the own line and that one); the line crossing the own half-line at 90° at its end (the
    // region boundary) may carry the last row's hole on its thread up to its far edge (overshoot ≤ m/2). A violation fails
    // with the line address. K12 is the same formula in advance.
    const clearNeed = (m + w) / 2, reachList = [];
    const ellOf = (k) => (A.layout.region.sMaxK ? A.layout.region.sMaxK[k] : A.layout.region.sMax);
    const hlG = new Map();
    const skipOf = (k) => {
      if (!hlG.has(k)) { const g = halfLineGraph(A.marking.graph, R, VF, A.layout.program.az[k], ellOf(k)); hlG.set(k, { g }); }
      return hlG.get(k);
    };
    let minClear = Infinity, minClearAt = '—', minMarg = Infinity;
    const botBy = new Map(), topBy = new Map();
    const push = (M, key, v) => { if (!M.has(key)) M.set(key, []); M.get(key).push(v); };
    const lastRow = {};
    for (const r of roundsIn) lastRow[r.set] = Math.max(lastRow[r.set] || 0, r.row);
    for (const r of roundsIn) {
      const sts = stitchesDone.filter((st) => st.round === r.id);
      if (r.row === 1 && sts.length) {
        const pk0 = path.segs.find((sg) => sg.startStitch && sg.round === r.id);
        if (pk0) push(topBy, `${r.set}${r.row}`, A.layout.sTop);
      }
      for (const st of sts) {
        const expLine = (r.startLine + st.i) % N, expLevel = st.i % 2 === 1 ? 'bottom' : 'top';
        if (st.line !== expLine || st.level !== expLevel) wrongLine++;
        if (st.level === 'bottom') push(botBy, `${r.set}${r.row}`, st.s);
        else if (st.i === N) { if (r.row < lastRow[r.set]) push(topBy, `${r.set}${r.row + 1}`, st.s); }
        else push(topBy, `${r.set}${r.row}`, st.s);
        const { g } = skipOf(st.line);
        for (const [side, H] of [['E', st.E], ['X', st.X]]) {
          for (const c of holeClearances(A.marking.graph, R, H, g, m, w)) {
            if (c.d - c.need < minMarg) { minMarg = c.d - c.need; minClear = c.d; minClearAt = `${st.round}.i${st.i} ${side} → ${c.id}, need ${f(c.need, 3)} mm (φ ${f(Math.acos(c.cos) * 180 / Math.PI, 1)}°${c.boundary ? ', boundary thread' : ''})`; }
            if (!c.ok) { reach++; if (reachList.length < 6) reachList.push(`${st.round}.i${st.i}/L${st.line} ${side} → ${c.id} ${f(c.d, 3)} < ${f(c.need, 3)} mm (φ ${f(Math.acos(c.cos) * 180 / Math.PI, 1)}°)`); }
          }
        }
      }
    }
    const spread = (a) => (a && a.length ? Math.max(...a) - Math.min(...a) : 0);
    const keys = [...new Set([...botBy.keys(), ...topBy.keys()])];
    const spreads = keys.map((k) => ({ r: k, b: spread(botBy.get(k)), t: spread(topBy.get(k)) }));
    const ok = wrongLine === 0 && reach === 0 && spreads.every((x) => x.b <= tol && x.t <= tol);
    const worst = spreads.reduce((acc, x) => (Math.max(x.b, x.t) > Math.max(acc.b, acc.t) ? x : acc), /** @type {any} */ ({ r: '—', b: 0, t: 0 }));
    add({ id: 'V5', name: 'Stitches on their lines and levels', crit: 'K1 (set A: top on even lines; B on odd); spec (12′) (#45): bottoms of a row and tops of a row (closing of round n = L0 top of row n+1) spread ≤ 0.1·w',
      status: stitchesDone.length ? (ok ? 'pass' : 'fail') : 'n/a',
      value: `line/level errors ${wrongLine}; spread by rows (w): ${spreads.map((x) => `${x.r} bot ${f(x.b / w, 3)}, top ${f(x.t / w, 3)}`).join('; ')}; max ${f(Math.max(worst.b, worst.t) / w, 3)}w (${worst.r}); holes nearer than c(φ) = m/2 + (w/2)·cos φ to a foreign marking line (boundary thread at 90°: overshoot ≤ m/2): ${reach}${reachList.length ? ` (${reachList.join('; ')})` : ''}; least margin ${f(minMarg, 3)} mm: clearance ${f(minClear, 3)} mm (${minClearAt})` + invTxt,
      numbers: { spreads, wrongLine, reach, reachList, minClear, minMarg, clearNeed0: clearNeed, tolW: 0.1 } });
  }
  // V6 — petal symmetry by the classes of spec v3.2 §6.11 (#25): clean classes exact, affected legs against expectations.
  {
    const done = roundsOk.filter(roundDone);
    if (!done.length) add({ id: 'V6', name: 'Petal symmetry within a round', crit: 'K1', status: 'n/a', value: 'full round only' });
    else {
      const M6 = v6Metrics(A, done);
      const J = v6Judge(M6, w);
      const rows = M6.rounds.map((q) => `${q.id}: clean ${f(q.clean, q.clean < 1e-3 ? 12 : 4)} mm` +
        (q.bVsA != null ? `, B−rot(A) ${f(q.bVsA, 12)} mm` : '') +
        `; step ${f(q.step.actual / w, 3)}w; i1−rot(i3) ${f(q.shape / w, 3)}w; i2−rot(i4) ${f(q.i2 / w, 3)}w` +
        (q.L0 ? `; L0 (${q.L0.src}) vs L2: x ${f(q.L0.dx / w, 3)}w, s ${f(q.L0.ds / w, 3)}w, e ${f(q.L0.de / w, 3)}w (arrival-direction residual (spiral), class (iii), ≤ ${V6_TOL.eW}w)` : ''));
      add({ id: 'V6', name: 'Petal symmetry within a round', crit: 'K1; TK-KIKU; spec v3.2 §6.11 (#25), (12′)–(12‴) (#45): step 0 ± 0.1w, L0-vs-L2 x/s ± 0.1w, e ± 0.2w, i1 vs rot(i3) ≤ 0.1w', status: J.status,
        value: rows.join('; ') + (J.reasons.length ? `. ${J.reasons.join('; ')}` : '') + invTxt,
        numbers: { rounds: M6.rounds, l0: M6.rounds.map((q) => ({ round: q.id, row: q.row, ...(q.L0 ? { dxW: q.L0.dx / w, dsW: q.L0.ds / w, deW: q.L0.de / w } : {}) })), reasons: J.reasons } });
    }
  }
  // V7 — visible legs on the surface (not through the ball); hidden inside
  {
    let minR = Infinity, maxHidden = -Infinity, depthStart = 0, depthPk = 0;
    for (const s of segs) {
      if (s.type === 'leg') for (const p of s.pts) minR = Math.min(minR, norm(p));
      else {
        for (const p of s.pts) maxHidden = Math.max(maxHidden, norm(p));
        if (s.type === 'hidden-start') depthStart = Math.max(depthStart, s.depthMax); else depthPk = Math.max(depthPk, s.depthMax);
      }
    }
    const ok = (!Number.isFinite(minR) || minR >= R * (1 - 1e-12)) && maxHidden <= R * (1 + 1e-12);
    add({ id: 'V7', name: 'Legs on surface, hidden segments inside', crit: 'geometry: leg on support (K10), needle channel in wrap',
      status: ok ? 'pass' : 'fail',
      value: `min leg radius − R = ${f(minR - R, 9)} mm; max hidden radius − R = ${f(maxHidden - R, 9)} mm; depth: start to ${f(depthStart, 2)} mm, catch to ${f(depthPk, 4)} mm (chord — lower bound)` });
  }
  // V8 — no interpenetration of laid threads except where rules allow (crossing, uwagake wedge, catch, join)
  {
    const segs = segsOk, stitchesDone = stOk, ids = idsOk;
    const pairKey = (a, b) => [a, b].sort().join('|');
    const expected = new Map();
    for (const t of threadIds) { const ts = segs.filter((s) => s.thread === t); for (let i = 1; i < ts.length; i++) expected.set(pairKey(ts[i - 1].id, ts[i].id), 'join'); }
    const warnList = [];
    const order = new Map(path.segs.map((x, i) => [x.id, i]));
    // Δ₂ for 6a.13 h_k = h_x − k·Δ/2 (tipDrop of first bottoms; path unchanged).
    const deltaTip = path.tipDrop?.tipDrop_mm ?? w;
    // h_x from own tip cross of row 1 (meridional |Δs|), else bite formula at α=18°.
    const ownHxSamples = [];
    for (const c of path.crossings) {
      if (c.kind !== 'crossing' || c.s == null || !ids.has(c.a) || !ids.has(c.b)) continue;
      const A = segById.get(c.a), B = segById.get(c.b);
      if (!A || !B || A.type !== 'leg' || B.type !== 'leg' || A.set !== B.set || A.row !== 1 || B.row !== 1) continue;
      if (A.level === B.level) continue;
      const dLine = Math.min((A.line - B.line + N) % N, (B.line - A.line + N) % N);
      if (dLine !== 1) continue;
      const st = stitchesDone.find((s) => s.set === A.set && s.row === 1 && s.level === 'bottom' && !s.closing
        && (s.line === A.line || s.line === B.line));
      if (!st) continue;
      const h = Math.abs((st.s ?? 0) - c.s);
      if (h > 0 && h < 10) ownHxSamples.push(h);
    }
    ownHxSamples.sort((a, b) => a - b);
    const hxTip = ownHxSamples.length
      ? ownHxSamples[Math.floor(ownHxSamples.length / 2)]
      : (m + w) / (2 * Math.tan(Math.PI / 10));
    // 6a.13 tipCross: same set, adjacent lines, opposite levels (in×out / mirror), k∈{1,2},
    // later on top, 0<h<h_x, |h−(h_x−k·Δ/2)|≤0.3·(w/w0). Same-line mid-leg (~35 mm) is NOT tipCross.
    const W0_V = 0.714;
    const mmW = (mm) => mm * ((w || W0_V) / W0_V); // absolute-mm → fraction of w (similarity)
    const tipTol = mmW(0.3);   // 6a.13 window was ±0.3 mm at w0
    const tipBand = mmW(0.5);  // tip-zone / near-tip band was +0.5 mm at w0
    const tipNear = mmW(1.0);  // nearTipPair endpoint band was +1 mm at w0
    const tipCrossAt = (P, Q, cpOrS) => {
      if (!P || !Q || P.type !== 'leg' || Q.type !== 'leg') return null;
      if (P.set !== Q.set || P.row === Q.row || P.level === Q.level) return null;
      const dLine = Math.min((P.line - Q.line + N) % N, (Q.line - P.line + N) % N);
      if (dLine !== 1) return null;
      const lo = P.row < Q.row ? P : Q, hi = lo === P ? Q : P;
      const later = order.get(P.id) > order.get(Q.id) ? P : Q;
      if (later !== hi) return null;
      const k = hi.row - lo.row;
      if (k < 1 || k > 2) return null;
      const hExp = hxTip - k * deltaTip / 2;
      if (!(hExp > 0)) return null;
      const st = stitchesDone.find((s) => s.set === lo.set && s.row === lo.row && s.level === 'bottom' && !s.closing
        && (s.line === lo.line || s.line === hi.line));
      if (!st) return null;
      let h;
      if (typeof cpOrS === 'number') h = Math.abs((st.s ?? 0) - cpOrS);
      else if (cpOrS && Array.isArray(cpOrS)) {
        const sp = fSAz(R, VF, cpOrS);
        h = Math.abs((st.s ?? 0) - sp.s);
      } else return null;
      if (!(h > 0 && h < hxTip)) return null;
      if (Math.abs(h - hExp) > tipTol) return null;
      return 'tipCross (6a.13): later row over earlier tip';
    };
    const tipCrossHits = [];
    for (const c of path.crossings) if (ids.has(c.a) && ids.has(c.b) && c.allowed) {
      if (c.kind === 'squeeze') warnList.push(`${c.a}×${c.b} s=${f(c.s, 1)} d=${f(c.dmin, 3)} (tight spot, V19)`);
      // tipCross is location-specific (height window); do not stamp the whole pair from identity.
      const tipAt = tipCrossAt(segById.get(c.a), segById.get(c.b), c.s ?? c.at);
      if (tipAt) tipCrossHits.push({ a: c.a, b: c.b, d: c.dmin, s: c.s, why: tipAt });
      expected.set(pairKey(c.a, c.b),
        c.kind === 'wedge' ? 'uwagake wedge (over prior row)'
        : c.kind === 'squeeze' ? 'WARN: tight spot at pierce — threads must compress (V19)'
        : c.kind === 'climb' ? 'climb/merge (Errata 6a.7): thread climbs onto previous row at the hole'
        : c.kind === 'rail-parallel' ? 'rail parallel of prev row at distance w (6a.11)'
        : 'crossing (over/under by rule)');
    }
    // §5.3 (#38): at a top hole the channel passes UNDER foreign threads on the needle line (not part of the catch)
    for (const st of stitchesDone) for (const c of [...(st.sides.foreignUnder || []), ...(st.sides.setCollision || [])]) {
      expected.set(pairKey(st.pickupId, c.seg), 'channel under foreign thread at top hole (U14 set collision, §5.3)');
    }
    for (const st of stitchesDone) {
      for (const c of st.sides.cluster) {
        if (c.seg === 'marking') continue;
        expected.set(pairKey(st.pickupId, c.seg), 'catch wraps laid thread');
        const cs = segById.get(c.seg);
        const prevOfThread = path.segs.filter((x) => x.thread === cs.thread && x.u1 <= cs.u0 + 1e-12).pop();
        if (c.kind === 'hole-exit' && prevOfThread) expected.set(pairKey(st.pickupId, prevOfThread.id), 'catch wrapst thread u ee vykhoda');
      }
    }
    // tight spots (V19): at a compressed pierce the working thread and neighbor-point thread are closer than w — recorded; compression not modeleruetsya
    const squeezeNear = [];
    for (const st of stitchesDone) for (const q of (st.sides.squeeze || [])) {
      if (q.seg === 'marking' || !segById.get(q.seg)) continue;
      const hole = q.side === 'E' ? st.E : st.X;
      const nb = (id) => { const x = segById.get(id); return path.segs.filter((y) => y.thread === x.thread && (y.id === id || Math.abs(y.u1 - x.u0) < 1e-9 || Math.abs(y.u0 - x.u1) < 1e-9)).map((y) => y.id); };
      squeezeNear.push({ mine: new Set(nb(st.pickupId)), set: st.set, hole });
    }
    // pairsa “working thread at compressed pierce (channel, incoming/outgoing leg) × other-set thread” at this pierca
    const squeezeOk = (P, Q, md) => squeezeNear.some((x) => ((x.mine.has(P.id) && Q.set !== x.set) || (x.mine.has(Q.id) && P.set !== x.set)) && Math.min(dist(md.cp, x.hole), dist(md.cq, x.hole)) < 2 * w);
    // axes: visible leg — thread of diameter w on the surface (axis at R + w/2); hidden — along channel
    const lift = (R + w / 2) / R;
    const axis = segs.map((s) => (s.type === 'leg' ? s.pts.map((p) => [p[0] * lift, p[1] * lift, p[2] * lift]) : s.pts));
    const boxes = axis.map(bbox);
    const found = [], bad = [], separateList = [];
    // #50 stage A (braid): crossover — consecutive own rows overlap under a small angle near the top (the stack of the braid,
    // new thread on top). Accepted only between rows n−1 and n of one set and only from the top down to s_T(n) + ℓ_braid,max
    // (s_T(n) = the later leg's top-hole level; ℓ_braid,max = 20·w TEMPORARY until the #51 coordinates). Fan mode: never.
    const braid8 = A.params?.topRule === 'braid';
    const lBraidW = Number.isFinite(Number(A.params?.lBraidMaxW)) && A.params?.lBraidMaxW !== '' ? Number(A.params.lBraidMaxW) : 20;
    const crossoverList = [];
    const crossoverOk = (P, Q, cp) => {
      if (!braid8 || !cp || P?.type !== 'leg' || Q?.type !== 'leg' || P.set !== Q.set || Math.abs(P.row - Q.row) !== 1) return false;
      const hi = P.row > Q.row ? P : Q;
      const sT = Math.min(fSAz(R, VF, hi.from).s, fSAz(R, VF, hi.to).s), sc = fSAz(R, VF, cp).s;
      if (sc > sT + lBraidW * w) return false;
      crossoverList.push({ a: P.id, b: Q.id, s: sc, belowTopMm: sc - sT });
      return true;
    };
    const CROSSOVER = 'crossover (braid, #50: consecutive own rows, new thread on top, within ℓ_braid,max of the top)';
    const nextOf = (h) => path.segs.find((x) => x.thread === h.thread && Math.abs(x.u0 - h.u1) < 1e-12);
    const classify = (P, Q, md) => {
      const k = pairKey(P.id, Q.id);
      // #50 decision 2(a): in braid, crossover is checked FIRST (before uwagake wedge / tipCross / pair-level expected), so
      // ℓ_braid,max is actually enforced; outside it the previous rules apply.
      if (crossoverOk(P, Q, md.cp)) return CROSSOVER;
      // Same-line k=1,2: location-specific 6a.13 — do not return pair-level expected early.
      const sameLineK12Early = P.type === 'leg' && Q.type === 'leg' && P.set === Q.set && P.line === Q.line
        && P.row !== Q.row && Math.abs(P.row - Q.row) <= 2;
      if (sameLineK12Early) {
        const tipLab = tipCrossAt(P, Q, md.cp);
        if (tipLab) return tipLab;
        // fall through; may still match rail-parallel / hole / unexpected
      } else if (expected.has(k)) {
        return expected.get(k);
      }
      if (squeezeOk(P, Q, md)) { warnList.push(`${P.id}×${Q.id} s=${f(fSAz(R, VF, md.cp).s, 1)} d=${f(md.d, 3)} (tight spot, V19)`); return 'WARN: tight spot at pierce — threads must compress (V19)'; }
      const later = order.get(P.id) > order.get(Q.id) ? P : Q, earlier = later === P ? Q : P;
      const types = [P.type, Q.type].sort().join('+');
      if (types === 'leg+pickup') {
        const K = P.type === 'pickup' ? P : Q, L = P.type === 'leg' ? P : Q;
        if (later === L) return 'leg over hidden stitch (later on top; channel under marking)';
        // #23 / §5.3 (2)(3) (Fable delta, #50): at a bite the craftsman pushes the thread aside (≤ w/2 locally, over a length
        // w/sin ψ); the flat model does not move it and records class `separate`. A later FOREIGN channel within the
        // push-aside zone at its hole, |s − s_hole| ≤ w/sin ψ + w/2 (ψ = the leg's angle to the marking line at the
        // contact), is U14 «set collision» (warn, printed, with inSpan); outside the zone it stays unexpected (fail).
        const st = K.set !== L.set ? stitchesDone.find((x) => x.pickupId === K.id) : null;
        if (st) {
          const cpL = unit(L === P ? md.cp : md.cq);
          let iN = 0, dN = Infinity;
          for (let i = 0; i < L.pts.length; i++) { const dd = dist(unit(L.pts[i]), cpL); if (dd < dN) { dN = dd; iN = i; } }
          const T = unit(sub(L.pts[Math.min(L.pts.length - 1, iN + 1)], L.pts[Math.max(0, iN - 1)]));
          const sinPsi = Math.abs(dot(T, fEast(VF, cpL)));
          const H = dist(cpL, unit(st.E)) <= dist(cpL, unit(st.X)) ? st.E : st.X;   // the channel's hole nearest the contact
          const dS = Math.abs(fSAz(R, VF, cpL).s - fSAz(R, VF, H).s);
          const zone = separateZoneMm(sinPsi, w);
          if (dS <= zone) {
            const ph = fSAz(R, VF, H).phi;
            const span = stitchesDone.find((x) => x.level === 'top' && x.set !== K.set && Math.abs(x.s - st.s) < 1e-6 && order.get(x.pickupId) < order.get(K.id)
              && (() => { const lo = wrapPi(fSAz(R, VF, x.X).phi - ph), hi = wrapPi(fSAz(R, VF, x.E).phi - ph); return Math.min(lo, hi) <= 0 && Math.max(lo, hi) >= 0 && Math.abs(hi - lo) < Math.PI; })());
            separateList.push({ leg: L.id, legRound: L.round, channel: K.id, channelRound: st.round, d: md.d, dW: md.d / w, dS, zone, psiDeg: Math.asin(Math.min(1, sinPsi)) * 180 / Math.PI,
              dHoleMm: R * angle(cpL, unit(H)), inSpan: !!span, spanOf: span ? span.pickupId : null });
            return 'separate: foreign channel pushes the leg aside at its hole (U14 set collision, §5.3 (2)(3))';
          }
        }
        return null;                                   // channel passed under a leg not counted in occupancy — error
      }
      if (types === 'pickup+pickup') {
        // Top catches: same-set uwagake stack, or A×B meet at the top — both expected.
        if (P.level === 'top' && Q.level === 'top') {
          return P.set === Q.set
            ? 'uwagake stacked top channels (same set)'
            : 'top catch proximity (set meet)';
        }
        const tol = Math.abs(P.depthMax - Q.depthMax) + 1e-6;   // different chord sag of neighboring channels
        return md.d >= w - tol ? 'adjacent stitch channels flush (w)' : null;
      }
      if (types === 'hidden-start+leg') {
        const H = P.type === 'hidden-start' ? P : Q, L = P.type === 'leg' ? P : Q;
        const cpH = H === P ? md.cp : md.cq;
        const nearHole = Math.min(dist(cpH, H.from), dist(cpH, H.to)) < w;
        const nx = nextOf(H);
        if (nearHole && later === L && nx && (expected.has(pairKey(L.id, nx.id)) || nx.type !== 'leg'))
          return 'leg over hole where thread exits (link recorded)';
        if (nearHole && later === L) return 'leg over hidden-start hole';
        return null;
      }
      if (types === 'hidden-start+pickup') { warnList.push(`${P.id}×${Q.id} s=${f(fSAz(R, VF, md.cp).s, 1)} d=${f(md.d, 3)}`); return 'WARN: needle channel near hidden start (in wrap)'; }
      if (types === 'leg+leg') {
        // 6a.13 tipCross first (height window); pair-level expected must not stamp mid-leg contacts.
        const tipLab = tipCrossAt(P, Q, md.cp);
        if (tipLab) return tipLab;
        const lo = P.row <= Q.row ? P : Q, hi = lo === P ? Q : P;
        const tipOf = (set, row, line) => {
          const bot = stitchesDone.filter((st) => st.set === set && st.row === row && st.level === 'bottom' && !st.closing);
          return (line != null ? bot.find((s) => s.line === line) : null) || bot[0] || null;
        };
        const heightAboveTip = (st) => {
          if (!st) return Infinity;
          const T = unit([(st.E[0] + st.X[0]) / 2, (st.E[1] + st.X[1]) / 2, (st.E[2] + st.X[2]) / 2]);
          return R * angle(T, unit(md.cp));
        };
        const sameLineK12 = P.set === Q.set && P.line === Q.line && hi.row > lo.row && (hi.row - lo.row) <= 2;
        if (later === hi && hi.row > lo.row) {
          // Over bite zone / tip diamond (adj. marking lines) and through-row over hole.
          // Same-line k=1,2 is NOT tipCross (needs adjacent lines in×out); do not blanket tip-zone.
          if (!sameLineK12) {
            const stLo = tipOf(lo.set, lo.row, lo.line);
            const hLo = heightAboveTip(stLo);
            if (hLo > 0 && hLo < hxTip + tipBand) {
              return 'tip zone / over bite (6a.13)';
            }
          }
          const holes = stitchesDone.filter((st) => st.set === earlier.set && st.row === earlier.row);
          for (const st of holes) {
            if (Math.min(dist(md.cp, st.X), dist(md.cq, st.X), dist(md.cp, st.E), dist(md.cq, st.E)) < w) {
              return 'leg over prior-row hole (through-row / tip zone)';
            }
          }
        }
        // Rail parallel of prev row at ~w (same-line neighbours in the band only, #23 — NOT tipCross).
        if (railParallelPair(P, Q, md.d, w)) {
          return 'rail parallel of prev row at distance w (6a.11)';
        }
        // Same-line neighbor outside rail-parallel band → unexpected (not tipCross).
        if (sameLineK12) return null;
      }
      return null;
    };
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (boxGap(boxes[i], boxes[j]) >= w) continue;
      const md = minDist(axis[i], axis[j]);
      if (md.d >= w - 1e-9) continue;
      const why = classify(segs[i], segs[j], md);
      const sp = fSAz(R, VF, md.cp);
      (why ? found : bad).push({ a: segs[i].id, b: segs[j].id, d: md.d, s: sp.s, at: md.cp, why: why || 'UNEXPECTED' });
    }
    // Seed tipCross from path.crossings at c.at (global minDist often sits mid-leg, missing the tip diamond).
    for (const hit of tipCrossHits) {
      if (braid8 && found.some((r) => r.a === hit.a && r.b === hit.b && r.why === CROSSOVER)) continue;   // #50: crossover first
      if (!found.some((r) => r.a === hit.a && r.b === hit.b && /tipCross/.test(r.why))) found.push(hit);
    }
    const cnt = {};
    for (const r of found) cnt[r.why] = (cnt[r.why] || 0) + 1;
    const wedges = path.crossings.filter((c) => c.kind === 'wedge' && ids.has(c.a) && ids.has(c.b));
    const wedgeTxt = wedges.length ? `; wedges: max overlap ${f(Math.max(...wedges.map((c) => w - c.dmin)), 3)} mm over length up to ${f(Math.max(...wedges.map((c) => c.lenMm)), 1)} mm from tip` : '';
    const notAllowed = path.crossings.filter((c) => !c.allowed && ids.has(c.a) && ids.has(c.b));
    // 6a.13 / Codex block-B: tip contacts must be CLASSIFIED (tipCross / through-row / tip-zone),
    // not excluded from unexpected. Unclassified remainder = fail.
    // Flush rail-parallel is a classified expected class (6a.11), not a tip dump — only line neighbours in the band
    // [w(1−εc), w] (#23: was any pair with d ≥ 0.5·w, which hid foreign and deep contacts).
    // Re-classify residual bad / notAllowed that classify() missed but tipCrossAt / tip-zone cover.
    const promote = (a, b, cpOrS, d, atPt = null) => {
      if (railParallelPair(segById.get(a), segById.get(b), d, w)) return 'rail parallel of prev row at distance w (6a.11)';
      if (crossoverOk(segById.get(a), segById.get(b), Array.isArray(atPt) ? atPt : Array.isArray(cpOrS) ? cpOrS : null)) return CROSSOVER;
      // Axis coincidence (same as path.legZones): treat as crossing.
      if (d != null && d < 0.05 * w) return 'crossing (over/under by rule)';
      const P = segById.get(a), Q = segById.get(b);
      const tip = tipCrossAt(P, Q, cpOrS);
      if (tip) return tip;
      const at = (atPt && Array.isArray(atPt)) ? atPt
        : (cpOrS && Array.isArray(cpOrS)) ? cpOrS
        : null;
      if (P?.type === 'leg' && Q?.type === 'leg' && P.row !== Q.row) {
        const lo = P.row < Q.row ? P : Q, hi = lo === P ? Q : P;
        const later = order.get(P.id) > order.get(Q.id) ? P : Q;
        if (later === hi) {
          if (P.set === Q.set) {
            const bot = stitchesDone.find((st) => st.set === lo.set && st.row === lo.row && st.level === 'bottom' && !st.closing
              && (st.line === lo.line || st.line === hi.line));
            if (bot) {
              let h;
              if (typeof cpOrS === 'number') h = Math.abs((bot.s ?? 0) - cpOrS);
              else if (at) h = Math.abs((bot.s ?? 0) - fSAz(R, VF, at).s);
              if (h != null && h > 0 && h < hxTip + tipBand) return 'tip zone / over bite (6a.13)';
            }
          }
          // Through-row / tip-zone over prior holes (same or other set).
          const holes = stitchesDone.filter((st) => st.set === lo.set && st.row === lo.row);
          if (at) {
            for (const st of holes) {
              if (Math.min(dist(at, st.X), dist(at, st.E)) < w) return 'leg over prior-row hole (through-row / tip zone)';
            }
          }
        }
      }
      // Near bottom tip (bite diamond) or upper tip (uwagake / set meet) → tip-zone class (6a.13 / 6a.18).
      if (P?.type === 'leg' && Q?.type === 'leg' && at) {
        const sp = fSAz(R, VF, at);
        const nearSt = stitchesDone.filter((s) => !s.closing
          && (s.set === P.set || s.set === Q.set)
          && (s.row === P.row || s.row === Q.row || s.row === Math.min(P.row, Q.row)));
        const upperBand = Math.max(hxTip + tipNear, mmW(6)); // legs meet a few mm below top hole
        for (const st of nearSt) {
          const band = st.level === 'top' ? upperBand : (hxTip + tipNear);
          if (Math.abs((st.s ?? 0) - sp.s) < band) {
            return st.level === 'top'
              ? 'uwagake / top meet (6a.18)'
              : 'tip zone / over bite (6a.13)';
          }
        }
      }
      return null;
    };
    const badRest = [], badPromoted = [];
    for (const b of bad) {
      const why = promote(b.a, b.b, b.s, b.d, b.at);
      if (why) { badPromoted.push({ ...b, why }); found.push({ ...b, why }); cnt[why] = (cnt[why] || 0) + 1; }
      else badRest.push(b);
    }
    const naRest = [], naPromoted = [];
    for (const c of notAllowed) {
      const why = promote(c.a, c.b, c.s ?? c.at, c.dmin, c.at);
      if (why) { naPromoted.push({ a: c.a, b: c.b, d: c.dmin, s: c.s, why }); found.push({ a: c.a, b: c.b, d: c.dmin, s: c.s, why }); cnt[why] = (cnt[why] || 0) + 1; }
      else naRest.push(c);
    }
    // δ>w/2 = G3 miss (6a.7 / 6a.11(2) / 6a.12): always a bug on legs IN THIS PREFIX.
    const deltaFails = segs.filter((s) => s.deltaFail).length;
    // Rail construction contradictions (spec v3.1 §2, §5.6, #36): a bottom leg whose packing root E_n is off
    // its own rail ('offRail') or a free exit that re-enters the tube ('contradiction') — loud, never silent.
    const exitFails = segs.filter((s) => s.type === 'leg' && s.exitFail);
    const exitTxt = exitFails.length ? `; rail contradictions ${exitFails.length}: ` + exitFails.slice(0, 6).map((s) => `${s.id}/${s.round} ${s.exitKind}`
      + (s.exitKind === 'offRail' ? ` d_E=${f(s.exitDeMm, 4)} mm` : '')).join('; ') : '';
    const unexpected = badRest.length + naRest.length;
    add({ id: 'V8', name: 'No interpenetration except rule-allowed', crit: 'K14: axis distance ≥ w (tube Ø w); allowed: crossing, tipCross (6a.13), tip-zone/over-bite, through-row, uwagake wedge, climb/merge (6a.7), catch, join; tip contacts CLASSIFIED not excluded; δ>w/2 fail; rail contradiction (offRail / free exit into the tube, #36) fail',
      status: unexpected || deltaFails || exitFails.length ? 'fail' : warnList.length || separateList.length ? 'warn' : 'pass',
      value: `near-zones < w: ${Object.entries(cnt).map(([k2, v]) => `${k2} — ${v}`).join('; ')}; unexpected ${unexpected}` +
        (badPromoted.length || naPromoted.length ? `; tip-classified ${badPromoted.length + naPromoted.length}` : '') +
        (deltaFails ? `; δ>w/2 fails ${deltaFails}` : '') + exitTxt + wedgeTxt +
        (badRest.length ? ': ' + badRest.slice(0, 6).map((b) => `${b.a}×${b.b} s=${f(b.s, 1)} d=${f(b.d, 3)}`).join('; ') : '') +
        (braid8 ? `; braid (#50 stage A, ℓ_braid,max = ${lBraidW}·w TEMPORARY): crossover ${crossoverList.length}${crossoverList.length ? `, deepest ${f(Math.max(...crossoverList.map((x) => x.belowTopMm)), 2)} mm below s_T(n)` : ''}` : '') +
        (separateList.length ? `; separate (U14 set collision, foreign channel pushes the leg aside at its hole, §5.3 (2)(3)) ${separateList.length}: max ${f(Math.max(...separateList.map((x) => x.dHoleMm)), 2)} mm from the hole, d ${f(Math.min(...separateList.map((x) => x.dW)), 2)}…${f(Math.max(...separateList.map((x) => x.dW)), 2)} w, in span ${separateList.filter((x) => x.inSpan).length}; `
          + separateList.slice(0, 4).map((x) => `${x.legRound}/${x.leg}×${x.channelRound} ${f(x.dHoleMm, 2)} mm`).join(', ') + (separateList.length > 4 ? '…' : '') : '') +
        (warnList.length ? `; warnings (hidden wrap threads closer than w; radial compress not modelled): ${warnList.slice(0, 8).join('; ')}${warnList.length > 8 ? '…' : ''}` : ''),
      details: { found, bad, badRest, badPromoted, notAllowed, naRest, naPromoted, warnList, separate: separateList, crossover: crossoverList, exitFails: exitFails.map((s) => s.id) } });
  }

  // K16 (6a.16 / 6a.17 / 6a.20) — tip coverage; K16b at λ=0 is two-sided Clairaut-window diagnostic
  {
    const stitchesDone = stOk, segs = segsOk, ids = idsOk;
    const bottoms = stitchesDone.filter((st) => st.level === 'bottom' && !st.closing);
    const order = new Map(path.segs.map((x, i) => [x.id, i]));
    const bySet = {};
    for (const st of bottoms) (bySet[st.set] || (bySet[st.set] = [])).push(st);
    const parts = [];
    let fail = false;
    const diagH = [];
    const lambdaTip = path.tipDrop?.lambda ?? path.tipDrop?.bowLambda ?? 0;
    const isGeo0 = !(lambdaTip > 1e-9) && (path.tipDrop?.shoulderForm !== 'bow');
    // #31: α for the h_x diagnostic is measured on the model (row-1 incoming bottom legs, angle to the
    // meridian at E), not a constant from m = 1.0 (8.5° geodesic / 18° bow); fallback to those constants.
    const alphaMeasured = (() => {
      const vals = [];
      for (const st of bottoms) {
        if (st.row !== 1) continue;
        const L = segById.get(st.legId);
        if (!L || !L.pts || L.pts.length < 2) continue;
        const E = unit(L.pts[L.pts.length - 1]), Q = unit(L.pts[L.pts.length - 2]);
        const t = [Q[0] - E[0], Q[1] - E[1], Q[2] - E[2]];
        const k = t[0] * E[0] + t[1] * E[1] + t[2] * E[2];
        const tt = [t[0] - k * E[0], t[1] - k * E[1], t[2] - k * E[2]];
        const nz = VF.atN ? [-E[0] * E[2], -E[1] * E[2], 1 - E[2] * E[2]] : fToward(VF, E); // toward the kiku centre in the tangent plane
        const a = Math.hypot(...tt), b = Math.hypot(...nz);
        if (!(a > 1e-15 && b > 1e-15)) continue;
        vals.push(Math.acos(clamp((tt[0] * nz[0] + tt[1] * nz[1] + tt[2] * nz[2]) / (a * b))));
      }
      return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
    })();
    // 6a.20: exclude first lower circuit line after resume (transition step; e.g. B → L2)
    const resumeFirstBot = new Set();
    for (const r of path.rounds.filter((q) => q.begin === 'resume')) {
      const firstBot = r.stitchIdx.map((i) => path.stitches[i])
        .find((s) => s && s.level === 'bottom' && !s.closing);
      if (firstBot) resumeFirstBot.add(`${firstBot.set}:${firstBot.row}:${firstBot.line}`);
    }
    // Per-set row bottom s for Δ_n
    const rowS = (set, row) => {
      const st = bottoms.find((s) => s.set === set && s.row === row && !s.closing);
      return st ? (st.s ?? fSAz(R, VF, unit([(st.E[0] + st.X[0]) / 2, (st.E[1] + st.X[1]) / 2, (st.E[2] + st.X[2]) / 2])).s) : null;
    };
    // Measure fix: subsample along leg edges — discrete pts alone miss the true closest approach
    // (e.g. B7/L6 dE 0.40 on verts vs 0.24 dense; threshold w/2·1.1 unchanged).
    const minDistToRow = (P, set, row) => {
      const legs = segs.filter((s) => s.type === 'leg' && s.set === set && s.row === row);
      const Pu = unit(P);
      let best = Infinity;
      for (const leg of legs) {
        const pts = leg.pts;
        for (let i = 0; i < pts.length; i++) {
          best = Math.min(best, R * angle(Pu, unit(pts[i])));
          if (i + 1 >= pts.length) continue;
          const a = unit(pts[i]), b = unit(pts[i + 1]);
          const edge = R * angle(a, b);
          const steps = Math.max(1, Math.ceil(edge / Math.max(1e-9, w * 0.25)));
          for (let k = 1; k < steps; k++) {
            const t = k / steps;
            const q = unit([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
            best = Math.min(best, R * angle(Pu, q));
          }
        }
      }
      return best;
    };
    const aFails = [], aRows = [], bRows = [], perSet = {};
    for (const [set, sts] of Object.entries(bySet)) {
      const rows = [...new Set(sts.map((s) => s.row))].sort((a, b) => a - b);
      const Nrow = rows.length ? rows[rows.length - 1] : 0;
      let aN = 0, aProm = 0, aOk = 0, aMiss = 0, aCov = 0, bOk = 0, bN = 0, bPromised = 0, bMiss = 0, bRaw = 0, cBad = 0;
      const alphaK = alphaMeasured ?? (isGeo0 ? (8.5 * Math.PI / 180) : Math.PI / 10);
      for (const n of rows) {
        const mine = sts.filter((s) => s.row === n);
        for (const st of mine) {
          // 6a.17/6a.20: exclude closing X=−(c0+w) and first lower line after resume from K16b
          const closingWide = !!st.closing || (st.xOff != null && st.xOff <= -(w + 0.5 * (w / 0.714)));
          const firstLowerResume = resumeFirstBot.has(`${st.set}:${st.row}:${st.line}`);
          const T = unit([(st.E[0] + st.X[0]) / 2, (st.E[1] + st.X[1]) / 2, (st.E[2] + st.X[2]) / 2]);
          // K16a (§3.2 (15), #31): T_n is PROMISED coverage by leg n+1 where |(m+w)/2 − Δ_{n+1}·tan ᾱ| ≤ w/2,
          // ᾱ = Clairaut mean of that actual leg between its bottom hole (E_{n+1} / X_{n+1}) and level T_n.
          // Fail only where promised and the model does not cover (≤ w/2·1.1); unpromised & uncovered is not a fail.
          if (n < Nrow) {
            aN++;
            const d = minDistToRow(T, set, n + 1);
            const cov = d <= w / 2 * 1.1;
            if (cov) aCov++;
            const nx = bottoms.find((s) => s.set === set && s.row === n + 1 && s.line === st.line && !s.closing);
            let prom = false; const xs = [];
            if (nx && nx.s != null && st.s != null) {
              const d1 = Math.abs(nx.s - st.s), sT = tipLevelMm(T, R);
              const inc = segById.get(nx.legId);
              let out = null;
              const iPk = order.get(nx.pickupId);
              if (iPk != null) for (let i = iPk + 1; i < path.segs.length; i++) {
                const q = path.segs[i];
                if (q.type === 'leg' && q.set === set && q.row === n + 1) { out = q; break; }
              }
              for (const [L, hole, sign] of [[inc, nx.E, 1], [out, nx.X, -1]]) {
                if (!L || !L.from || !L.to) continue;
                const aH = legAlphaAt(L, hole, sign > 0);
                const tA = clairautAvgTan(aH, tipLevelMm(hole, R), sT, R);
                const x = sign * ((m + w) / 2 - d1 * tA);
                xs.push(x);
                if (Math.abs(x) <= w / 2 + 1e-9) prom = true;
              }
            }
            aRows.push({ set, row: n, line: st.line, i: st.i, x: xs, promised: prom, dMm: d, covered: cov });
            if (prom) {
              aProm++;
              if (cov) aOk++;
              else { aMiss++; aFails.push({ set, row: n, line: st.line, i: st.i, dMm: d, x: xs }); }
            }
          }
          // K16b: E_n, X_n covered by n+2 — at λ=0 diagnostic via two-sided Clairaut window (6a.20).
          // Inputs are per covering leg / line (not row-wide α or Δ): α from that leg's own hole,
          // Clairaut-averaged to the E_n/X_n tip level; Δ_{n+1}, Δ_{n+2} on that line.
          if (n < Nrow - 1 && !closingWide && !firstLowerResume) {
            const mid = bottoms.find((s) => s.set === set && s.row === n + 1 && s.line === st.line && !s.closing);
            const later = bottoms.find((s) => s.set === set && s.row === n + 2 && s.line === st.line && !s.closing);
            const d1 = (mid && st.s != null && mid.s != null) ? Math.abs(mid.s - st.s) : (path.tipDrop?.tipDrop_mm ?? w);
            const d2 = (later && mid && later.s != null && mid.s != null) ? Math.abs(later.s - mid.s) : d1;
            const deltaSum = d1 + d2;
            const xE = st.eOff != null ? st.eOff : (m + w) / 2;
            const xX = st.xOff != null ? st.xOff : -(m + w) / 2;
            // Covering legs on this line: incoming ends at later.E; outgoing starts at later.X.
            let incoming = later ? segById.get(later.legId) : null;
            let outgoing = null;
            if (later) {
              const iPk = order.get(later.pickupId);
              if (iPk != null) {
                for (let i = iPk + 1; i < path.segs.length; i++) {
                  const s = path.segs[i];
                  if (s.type === 'leg' && s.set === set && s.row === n + 2) { outgoing = s; break; }
                }
              }
            }
            const dE = minDistToRow(st.E, set, n + 2);
            const dX = minDistToRow(st.X, set, n + 2);
            const covE = dE <= w / 2 * 1.1, covX = dX <= w / 2 * 1.1;
            const sTipE = tipLevelMm(st.E, R), sTipX = tipLevelMm(st.X, R);
            let promisedE = false, promisedX = false;
            if (outgoing && outgoing.from) {
              const hole = outgoing.from;
              const alphaHole = legAlphaAt(outgoing, hole, false);
              const tanA = clairautAvgTan(alphaHole, tipLevelMm(hole, R), sTipE, R);
              const winE = k16bCoverageWindow({ m, w, alpha: Math.atan(tanA), deltaSum, xE, tanAlpha: tanA });
              promisedE = winE.coveredE;
              bRows.push({ set, row: n, line: st.line, hole: 'E', alphaDeg: Math.atan(tanA) * 180 / Math.PI,
                prod: deltaSum * tanA, win: [(m + w) - winE.half, (m + w) + winE.half], xLeg: winE.xLeg, dxE: winE.dxE, promised: promisedE, covered: covE, distW: dE / w });
            } else {
              // Fallback: shared row angle (should be rare)
              const tanA = clairautAvgTan(alphaK, (later?.s ?? st.s + deltaSum), st.s, R);
              promisedE = k16bCoverageWindow({ m, w, alpha: Math.atan(tanA), deltaSum, xE, tanAlpha: tanA }).coveredE;
            }
            if (incoming && incoming.to) {
              const hole = incoming.to;
              const alphaHole = legAlphaAt(incoming, hole, true);
              const tanA = clairautAvgTan(alphaHole, tipLevelMm(hole, R), sTipX, R);
              // coveredX uses +(m+w)/2 − Δ·tanα (incoming mirror); share call with dummy xE.
              promisedX = k16bCoverageWindow({ m, w, alpha: Math.atan(tanA), deltaSum, xE, tanAlpha: tanA, xX }).coveredX;
              bRows.push({ set, row: n, line: st.line, hole: 'X', alphaDeg: Math.atan(tanA) * 180 / Math.PI,
                prod: deltaSum * tanA, promised: promisedX, covered: covX, distW: dX / w });
            } else {
              const tanA = clairautAvgTan(alphaK, (later?.s ?? st.s + deltaSum), st.s, R);
              promisedX = k16bCoverageWindow({ m, w, alpha: Math.atan(tanA), deltaSum, xE, tanAlpha: tanA, xX }).coveredX;
            }
            // #31: promise per pair at every λ (no λ=0 switch): fail only where the window promises and the model does not cover.
            if (promisedE) { bPromised++; if (covE) bOk++; else bMiss++; }
            if (promisedX) { bPromised++; if (covX) bOk++; else bMiss++; }
            bRaw += (covE ? 1 : 0) + (covX ? 1 : 0);
            bN += 2;
          }
          if (n < Nrow) {
            const hx = (m + w) / (2 * Math.tan(alphaK));
            const d = minDistToRow(T, set, n + 1);
            diagH.push(hx - d);
          }
        }
        // K16c: own tip crossing C_n uncovered — within w/2 of C only own two legs
        // Approximate C_n as intersection zone of the two bottom legs of row n on each line
        const legsN = segs.filter((s) => s.type === 'leg' && s.set === set && s.row === n && s.level === 'bottom');
        for (let i = 0; i < legsN.length; i++) for (let j = i + 1; j < legsN.length; j++) {
          if (legsN[i].line !== legsN[j].line) continue;
          // skip — same line doesn't cross; opposite sides on same stitch pair
        }
        const legsAll = segs.filter((s) => s.type === 'leg' && s.set === set && s.row === n);
        // For each pair of opposite-side legs on same stitch index, find mid of closest approach as C
        for (const L of legsAll) {
          const opp = legsAll.find((o) => o.stitch === L.stitch && o.id !== L.id && o.side !== L.side);
          if (!opp || L.id > opp.id) continue;
          let best = Infinity, cp = null;
          for (const p of L.pts) for (const q of opp.pts) {
            const d = R * angle(unit(p), unit(q));
            if (d < best) { best = d; cp = p; }
          }
          if (!cp || best > w) continue;
          // Foreign legs within w/2 of C?
          for (const o of segs.filter((s) => s.type === 'leg' && !(s.set === set && s.row === n))) {
            for (const q of o.pts) {
              if (R * angle(unit(cp), unit(q)) < w / 2) { cBad++; fail = true; break; }
            }
          }
        }
      }
      if (aMiss || bMiss || cBad) fail = true;
      perSet[set] = { aN, aProm, aOk, aMiss, aCov, bN, bPromised, bOk, bMiss, bRaw, cBad };
      parts.push(`set ${set}: K16a promised ${aProm}/${aN}, covered ${aOk}/${aProm} (miss ${aMiss}; raw covered ${aCov}/${aN}); ` +
        `K16b promised ${bPromised}/${bN}, covered ${bOk}/${bPromised} (miss ${bMiss}; raw covered ${bRaw}/${bN}); K16c foreign-near-C ${cBad}`);
    }
    const alpha = alphaMeasured ?? (isGeo0 ? (8.5 * Math.PI / 180) : Math.PI / 10);
    const hx = (m + w) / (2 * Math.tan(alpha));
    const enough = Object.values(bySet).some((sts) => new Set(sts.map((s) => s.row)).size >= 2);
    add({
      id: 'K16', name: 'Tip coverage (T by n+1, E/X by n+2, C open)', crit: '§3.2 (15) K16a–c: promise by formula with the Clairaut mean ᾱ of the actual leg (per T / per E,X pair); fail = promised but uncovered',
      status: !enough ? 'n/a' : (fail ? 'fail' : 'pass'),
      value: parts.join('; ') + `; α(E)=${f(alpha * 180 / Math.PI, 2)}°, h_x=${f(hx, 2)} mm; diag mean (h_x − d_T→n+1)=${diagH.length ? f(diagH.reduce((a, b) => a + b, 0) / diagH.length, 2) : '—'} mm`,
      numbers: { hx, alphaDeg: alpha * 180 / Math.PI, diagH, isGeo0, aFails, aRows, bRows, perSet },
    });
  }

  // V9 — derived row-1 catch width vs sources (check, not prescribe)
  {
    const reg = stitchesDone.filter((st) => st.row === 1 && !st.closing).map((st) => st.eOff - st.xOff);
    if (!reg.length) add({ id: 'V9', name: 'Derived row-1 catch vs sources', crit: 'TK-LITTLE «about 1-2 mm», TK-KAGARI «about 2mm»', status: 'n/a', value: '—' });
    else {
      const lo = Math.min(...reg), hi = Math.max(...reg);
      const loB = w * (1 / 0.714), hiB = w * (2 / 0.714); // 6a.11(3) was 1–2 mm at w0
      const inRange = lo >= loB - 1e-9 && hi <= hiB + 1e-9;
      add({ id: 'V9', name: 'Derived row-1 catch vs sources', crit: 'TK-LITTLE «about 1-2 mm», TK-KAGARI «about 2mm» (consequence check)',
        status: inRange ? 'pass' : 'warn',
        value: `regular catch = m + w = ${f(lo)}…${f(hi)} mm (m = ${f(m, 2)}, w = ${f(w, 3)}); ${inRange ? 'in range 1–2 mm' : 'OUTSIDE scaled 1–2 mm band — check m, w'}` });
    }
  }
  // V10 — each round closes: last leg UNDER the round’s first leg; stitch covers round start
  {
    const done = roundsOk.filter(roundDone);
    if (!done.length) add({ id: 'V10', name: 'Round closure', crit: 'TK-LITTLE; TK-GT14', status: 'n/a', value: 'no completed rounds' });
    else {
      let ok = true;
      const parts = done.map((r) => {
        const cl = path.stitches[r.stitchIdx[r.stitchIdx.length - 1]];
        const leg = segById.get(cl.legId);
        const cr = leg.crossings.find((c) => c.b === r.firstLegId);
        const captured = cl.sides.cluster.some((c) => c.seg === r.firstLegId);
        const good = !!cr && cr.over === r.firstLegId && captured;
        if (!good) ok = false;
        return `${r.id}: ${cr ? `leg ${cl.legId} UNDER ${r.firstLegId} at s = ${f(cr.s, 2)} mm (${f(cr.angleDeg, 1)}°)` : 'crossing with first leg not found'}; catch [${f(cl.xOff)}; ${f(cl.eOff)}] wraps ${r.firstLegId}: ${captured ? 'yes' : 'no'}`;
      });
      add({ id: 'V10', name: 'Round closure', crit: 'TK-LITTLE «Carry the working thread under the starting thread … then complete the stitch» (row 1, a); row n — same move (b); TK-GT14 «Complete the stitch … park»',
        status: ok ? 'pass' : 'fail', value: parts.join('; ') });
    }
  }
  // V11 — provenance: layers computed from current parents (no stale geometry leak)
  {
    const okChain = A.marking.parents[0] === A.base.stamp && A.layout.parents[1] === A.marking.stamp &&
      A.rowPlan.parents[2] === A.layout.stamp && A.path.parents[3] === A.rowPlan.stamp && A.path.parents[0] === A.base.stamp;
    const Rchk = segs.every((s) => s.type !== 'leg' || Math.abs(norm(s.from) - R) < 1e-9);
    const mOk = !A.mechanics || A.mechanics.parents?.[0] === A.path.stamp;   // #5: base → … → path → mechanics
    add({ id: 'V11', name: 'Layer chain is fresh', crit: 'parametric requirement: base → marking → layout → rowPlan → path → mechanics',
      status: okChain && Rchk && mOk ? 'pass' : 'fail',
      value: `stamps: base ${A.base.stamp} → marking ${A.marking.stamp} → layout ${A.layout.stamp} → rowPlan ${A.rowPlan.stamp} → path ${A.path.stamp}${A.mechanics ? ` → mechanics ${A.mechanics.stamp} (${A.mechanics.mode}${mOk ? '' : ', STALE'})` : ''}; vse legs na tekushchem R: ${Rchk ? 'da' : 'net'}` });
  }
  // V12 — row plan (design formula) vs derived levels of all rows; equator; set stop
  {
    const rp = A.rowPlan, last = rp.rows[rp.rows.length - 1];
    const tips = [];
    for (const r of roundsIn.filter(roundDone)) {
      const sts = r.stitchIdx.map((i) => path.stitches[i]);
      const b = sts.find((st) => st.level === 'bottom'), t = sts.find((st) => st.level === 'top');
      tips.push({ r: r.id, set: r.set, row: r.row, sTip: b.s, sTop: t.s, plan: rp.rows[r.row - 1], line: b.line });
    }
    const lim = path.limit ?? rp.limit;
    // per-half-line K12 (#53 case 2 region, #54 Fable 54b §1 vertex cap) when the path carries one
    const limOf = (x) => (path.limitK ? path.limitK[x.line] : lim);
    const beyond = tips.filter((x) => x.sTip > limOf(x) + 1e-9);
    const bySet = {};
    for (const x of tips) (bySet[x.set] || (bySet[x.set] = [])).push(x);
    const setTxt = Object.entries(bySet).map(([k2, xs]) => `set ${k2}: rows ${xs.length}, tips ${xs.map((x) => `${x.r} ${f(x.sTip, 2)}`).join(', ')} mm`).join('; ');
    const stopTxt = Object.entries(path.stopped || {}).map(([k2, v]) => `set ${k2} stopped before row ${v.row}: ${v.reason}`).join('; ');
    const planTxt = tips.filter((x) => x.row >= 2 && x.plan).slice(0, 4).map((x) => `${x.r} bot ${f(x.sTip, 2)} (plan ${f(x.plan.sBot, 2)})`).join(', ');
    // Spec v3.1 §3.2(12), §6.2(г) (#39): a set stopped because the packing root is missing is a loud fail with the
    // message (no fallback); the K12 stop at the limit is not.
    const rootFails = Object.entries(path.stopped || {}).filter(([, v]) => v.fail);
    add({ id: 'V12', name: 'Rows to equator: derived tips vs limit and plan', crit: 'K12; TK-GT14 «Work to the equator»; next-stage §5 (tolshchinu ne umenshat); §3.2(12): no packing root = fail',
      status: rootFails.length ? 'fail' : beyond.length ? 'warn' : 'info',
      value: `limit s ≤ ${path.limitK ? `per half-line ${[...new Set(path.limitK.map((x) => f(x, 3)))].join(' / ')}` : f(lim, 2)} mm (equator ${f(A.base.Q, 2)}); ${setTxt || 'no complete rounds'}` +
        (beyond.length ? `; BEYOND limit: ${beyond.map((x) => `${x.r} na ${f(x.sTip - limOf(x), 2)} mm`).join(', ')}` : '') +
        (stopTxt ? `; ${stopTxt}` : '') +
        `; plan by w/sin α: ${rp.nRows} rows, last tip ${f(last.sBot, 2)} mm` + (planTxt ? ` (${planTxt}; formula u konchich — priblizhenie)` : ''),
      numbers: { tips, limit: lim, stopped: path.stopped, beyond, rootFails: rootFails.map(([k2]) => k2) } });
  }
  // V13 — “each next top about one thread lower and wider” — CONSEQUENCE of occupancy, checked against source PERU RYaDU
  {
    const rows = [];
    for (const r of roundsIn.filter((q) => q.row >= 2 && roundDone(q))) {
      const prev = path.rounds.find((q) => q.set === r.set && q.row === r.row - 1);
      const sts = r.stitchIdx.map((i) => path.stitches[i]).filter((st) => st.level === 'top');
      const pst = prev.stitchIdx.map((i) => path.stitches[i]).filter((st) => st.level === 'top');
      for (const st of sts) {
        const p = pst.find((q) => q.line === st.line);
        const foreign = (st.sides.setCollision || []).map((c) => c.segRound);   // #38: U14 records (no foreign in cluster)
        rows.push({ r: r.id, set: r.set, row: r.row, line: st.line, closing: st.closing, dS: st.s - p.s, dE: st.eOff - p.eOff, dX: p.xOff - st.xOff, W: st.eOff - st.xOff, Wp: p.eOff - p.xOff, foreign });
      }
    }
    if (!rows.length) add({ id: 'V13', name: 'Row n+1 top “one thread lower and wider” as consequence (per row)', crit: 'TK-GT14, TK-UWA (check, do not prescribe)', status: 'n/a', value: 'needs completed row 2' });
    else {
      const lo = 0.5 * w, hi = 2.5 * w;   // “about 1 thread width”: readings +w in total (#100) and +w on each side (+2w); tolerance band ±w/2 [A]
      const mean = (a) => a.reduce((s2, v) => s2 + v, 0) / a.length;
      const per = [];
      for (const rid of [...new Set(rows.map((x) => x.r))]) {
        const xs = rows.filter((x) => x.r === rid && !x.closing);
        const dW = xs.map((x) => x.W - x.Wp), dS = xs.map((x) => x.dS);
        const minW = Math.min(...dW), maxW = Math.max(...dW);
        const foreign = [...new Set(rows.filter((x) => x.r === rid).flatMap((x) => x.foreign))];
        per.push({ r: rid, dS: mean(dS), dWmin: minW, dWmax: maxW, dWmean: mean(dW), W: Math.max(...xs.map((x) => x.W)), ok: minW >= lo - 1e-9 && maxW <= hi + 1e-9, foreign });
      }
      const inside = per.every((x) => x.ok);
      add({ id: 'V13', name: 'Row n+1 top “one thread lower and wider” as consequence (per row)', crit: 'TK-GT14 «about 1 thread width wider and below»; TK-UWA «about 1 thread-width wider and lower»; prior #100 («+w v summe») — check, not an input; tolerance band [0,5 w; 2,5 w] [A]',
        status: inside ? 'pass' : 'warn',
        value: per.map((x) => `${x.r}: lower by ${f(x.dS, 3)}, wider by ${x.dWmin === x.dWmax ? f(x.dWmean, 3) : `${f(x.dWmin, 3)}…${f(x.dWmax, 3)}`} mm (${f(x.dWmean / w, 2)} w), width ${f(x.W, 3)}${x.ok ? '' : ' ⚠'}${x.foreign.length ? ` [U14 set collision, bite under: ${[...new Set(x.foreign)].join(',')}]` : ''}`).join('; ') +
          `. Source readings: +w in total = ${f(w, 3)}, +w on each side = ${f(2 * w, 3)} mm. ${inside ? 'All rows within reading band.' : 'Rows marked ⚠ outside band: row 2 — row-1 legs cross the new top perpendicular near the line axis (small); rows ≥ 3 — legs diverge from the tip, needle must go around them outside (large); see A8, U3, U13.'}`,
        numbers: { rows, per } });
    }
  }
  // D4 — diagnostic for #4 (not a pass/fail): top-width growth W_n − W_(n−1) decomposed exactly by the cluster construction
  // (drift of the edge thread ≈ w·tan βT, half trace ≈ (w/2)/cos βT, clearance w/2 | gap/2, merge with the previous edge),
  // and the U14 onset row n₀ observed vs causal (the other set's legs crossing the top-hole track). See diag-width.js.
  {
    const dec = widthDecomposition(A), u14 = u14Onset(A);
    const byRow = (set) => dec.filter((x) => x.set === set && x.row <= 4)
      .map((x) => `n${x.row}: ΔW ${f(x.dW / w, 2)}w = drift ${f(x.drift / w, 2)} + trace ${f(x.halfTrace / w, 2)} + clear ${f(x.clearance / w, 2)} + merge ${f(x.merge / w, 2)} (edge ${x.E.edgeKind === 'marking' ? 'marking' : `${x.E.edgeRound}.i${x.E.edgeStitch}`}, βT ${x.E.betaDeg == null ? '—' : f(x.E.betaDeg, 1)}°)`).join('; ');
    const onset = u14.map((u) => `${u.set}: U14 from row ${u.observed.any ?? '—'} (legs ${u.observed.legCrossing ?? '—'}, same-level span ${u.observed.sameLevelSpan ?? '—'}); causal legs ${u.causal?.n0 ?? '—'}`).join('; ');
    add({ id: 'D4', name: 'Top-width growth decomposition and U14 onset (diagnostic, #4)',
      crit: 'diagnostic only — no pass/fail; terms sum exactly to the actual increment',
      status: 'info', value: [...new Set(dec.map((x) => x.set))].map((set) => `${set} ${byRow(set)}`).join(' | ') + (onset ? ` | ${onset}` : ''),
      numbers: { decomposition: dec, u14 } });
  }
  // K17 (#50 stage A, braid only): the chevron of row n+1 covers the holes of row n — |h_{n+1} − h_n| ≤ w/2 with level step w,
  // per set and line (by construction from T1: h_{n+1} − h_n = k_top·w). Diagnostic, info. Also V13 by T4: 2h_n = (m+w) + 2k_top·w(n−1).
  if (A.params?.topRule === 'braid') {
    const tops = stitchesDone.filter((x) => x.level === 'top');
    const byLine = {};
    for (const st of tops) (byLine[`${st.set}:${st.line}`] ||= []).push(st);
    let dhMax = 0, dsDev = 0, pairs = 0, over = 0, t4Dev = 0;
    const kTop = Number(A.params?.kTop ?? 0.5), mMm = A.params.m_mm;
    for (const arr of Object.values(byLine)) {
      arr.sort((a, b) => a.s - b.s);
      for (let i = 1; i < arr.length; i++) {
        const h0 = Math.abs(arr[i - 1].eOff - arr[i - 1].xOff) / 2, h1 = Math.abs(arr[i].eOff - arr[i].xOff) / 2;
        const dh = Math.abs(h1 - h0); dhMax = Math.max(dhMax, dh); dsDev = Math.max(dsDev, Math.abs(arr[i].s - arr[i - 1].s - w)); pairs++;
        if (dh > w / 2 + 1e-9 * w) over++;
      }
    }
    for (const st of tops.filter((x) => !x.closing && x.row >= 1)) {
      const h = Math.abs(st.eOff - st.xOff) / 2;
      t4Dev = Math.max(t4Dev, Math.abs(2 * h - ((mMm + w) + 2 * kTop * w * (st.row - 1))));
    }
    add({ id: 'K17', name: 'Braid: chevron n+1 covers the holes of row n (#50 stage A, diagnostic)',
      crit: '#50 T4: |h_{n+1} − h_n| ≤ w/2, level step w (by construction); V13 = 2h_n = (m+w) + 2k_top·w(n−1); k_top TEMPORARY until #51',
      status: 'info',
      value: `${pairs} consecutive top stitches per line: max |Δh| ${f(dhMax, 3)} mm (w/2 = ${f(w / 2, 3)}), over w/2: ${over}; max |Δs − w| ${dsDev.toExponential(1)} mm; `
        + `T4 width 2h_n vs (m+w) + 2k_top·w(n−1): max dev ${dhMax > 0 ? t4Dev.toExponential(1) : '—'} mm (k_top ${f(kTop, 2)}, TEMPORARY)`,
      numbers: { pairs, dhMax, over, dsDev, t4Dev, kTop } });
  }
  // V14 — visible thread lies on the ball, does not float (model and displayed mesh)
  {
    let legDev = 0, legMax = -Infinity, hidOut = -Infinity, hidDepth = 0;
    for (const s of segs) for (const p of s.pts) {
      const r = norm(p) - R;
      if (s.type === 'leg') { legDev = Math.max(legDev, Math.abs(r)); legMax = Math.max(legMax, r); }
      else { hidOut = Math.max(hidOut, r); if (s.type === 'hidden-start') hidDepth = Math.max(hidDepth, -r); }
    }
    let nonFinite = null, meshMax = -Infinity, axisMax = -Infinity, hidDispAxisMax = -Infinity, hidDispDepth = 0, liftMax = 0;
    for (const dg of displayGeometry(A, ids, { hidMode: 'surf' })) {
      if (dg.hidden) {
        for (const p of dg.pts) { const r = norm(p) - R; hidDispAxisMax = Math.max(hidDispAxisMax, r); if (dg.seg.type === 'hidden-start') hidDispDepth = Math.max(hidDispDepth, -r); }
        continue;
      }
      liftMax = Math.max(liftMax, dg.liftMax || 0);
      for (const p of dg.pts) axisMax = Math.max(axisMax, norm(p) - R);
      for (const v of tubeMesh(dg.pts, dg.radius).pos) {
        const r = norm(v) - R;
        // A non-finite vertex (zero tangent: a 180° there-and-back in the polyline) is a defect, named, not a NaN comparison.
        if (!Number.isFinite(r)) { if (!nonFinite) nonFinite = `${dg.seg.round ?? ''} ${dg.seg.type} i${dg.seg.stitch ?? ''}`; continue; }
        meshMax = Math.max(meshMax, r);
      }
    }
    // #5: ideal / measured — the lift bound is Δ(m_max) of the mechanics (lift-spec §3.5), not DISPLAY_STACK_LIFT_W
    const MX14 = A.mechanics && !A.mechanics.displayOnly ? A.mechanics : null;
    const liftBound = MX14 ? Math.max(0, ...MX14.crossings.map((c) => c.delta || 0)) : liftMax;
    const ok = !nonFinite && legDev < TOL_RAD && hidOut < TOL_RAD && meshMax <= w + liftBound + TOL_MESH && axisMax <= w / 2 + liftBound + TOL_MESH && hidDispAxisMax <= TOL_MESH;
    add({ id: 'V14', name: 'Thread does not float above the ball (model and mesh)', crit: 'K1–K3; D22 (tube Ø w on the surface); schematic lift at crossings — display only',
      status: ok ? 'pass' : 'fail',
      value: `model: legs |r − R| ≤ ${legDev.toExponential(1)} mm; hidden not above surface (max ${hidOut.toExponential(1)}), khorda starta to ${f(hidDepth, 2)} mm vglub. `
        + (MX14 ? `Mesh: axis ≤ R + ${f(axisMax, 3)} mm, outer surface ≤ R + ${f(meshMax, 3)} mm (w = ${f(w, 3)} + lift ≤ ${f(liftMax, 3)} mm; bound max Δ_c = ${f(liftBound, 3)} mm — lift is mechanics, mode ${MX14.mode}). `
          : `Mesh: axis ≤ R + ${f(axisMax, 3)} mm, outer surface ≤ R + ${f(meshMax, 3)} mm (norm w = ${f(w, 3)} + allvnyy podem stopki ≤ ${f(liftMax, 3)} mm = ${DISPLAY_STACK_LIFT_W}·w·uroven). `)
        + `Hidden-start scheme: depth ${f(hidDispDepth, 3)} mm`
        + (nonFinite ? `. Non-finite tube mesh (zero tangent, 180° reversal) at ${nonFinite}` : ''),
      numbers: { nonFinite, legDev, legMax, hidOut, hidDepth, axisMax, meshMax, liftMax, liftBound, liftMode: MX14 ? MX14.mode : 'display', hidDispAxisMax, hidDispDepth } });
  }
  // V15 — row n of set B = row n of set A rotated by 2π/N (B petals on neighboring lines) — for all rows
  {
    const setsIn = [...new Set(path.rounds.map((r) => r.set))];
    const pairs = [];
    for (const rb of roundsIn.filter((r) => r.set === 'B' && roundDone(r))) {
      const ra = path.rounds.find((r) => r.set === 'A' && r.row === rb.row);
      if (ra && ids.has(segById.get(ra.segIds[ra.segIds.length - 1]).id)) pairs.push([ra, rb]);
    }
    // #53 case 2: sets that are not congruent (the program's set shift is null — the start-line rotation is no marking
    // symmetry, e.g. C8 face centre: A tops toward edge midpoints, B tops toward vertices) have no Bn = rot(An) to check
    const shNull = A.layout.program.symmetry.sets.B && A.layout.program.symmetry.sets.B.shift == null;
    if (shNull) add({ id: 'V15', name: 'Bn = An rotated by 360°/N', crit: 'TK-GT14; #53 case 2 (non-congruent sets)', status: 'n/a',
      value: `sets A and B are not congruent at ${A.layout.program.center} (the rotation between their start lines is no marking symmetry) — nothing to compare` });
    else if (!pairs.length || setsIn.length < 2) add({ id: 'V15', name: 'Bn = An rotated by 360°/N', crit: 'TK-GT14 «Enter … Color B on a marking line that has a bottom stitch of Color A … same 5mm»; TK-KIKU (2 seta)', status: 'n/a', value: 'needs completed An and Bn' });
    else {
      const parts = [], pairNums = [];
      let unexplained = 0, explained = 0;
      // "Same" = equal to 1 % of the thread width (dimensionless, #35). Rows that are equal by
      // construction differ only by solver noise that grows with the row (≤ 6e−5 mm on E/X/legs,
      // ≤ 1.5e−4 mm on the row length, grids 96–384); a real asymmetry (occupancy) is ≥ 1 mm. The old
      // 1e−9·R tolerance sat inside the noise, so a noise-level stitch flipped fail ↔ warn under 1e−9.
      const tolSym = 0.01 * w;
      const tolLen = 0.01 * w;
      for (const [ra, rb] of pairs) {
        const rot = rotAbout(A.layout.program.symmetry.axis, (rb.startLine - ra.startLine) * 2 * Math.PI / N);   // #53: about the kiku centre
        const sa = ra.stitchIdx.map((i) => path.stitches[i]), sb = rb.stitchIdx.map((i) => path.stitches[i]);
        let dP = 0, dL = 0;
        const diffSt = [];
        for (let i = 0; i < N; i++) {
          const dpi = Math.max(dist(rot(sa[i].E), sb[i].E), dist(rot(sa[i].X), sb[i].X));
          dP = Math.max(dP, dpi);
          if (dpi >= tolSym) diffSt.push(sb[i]);
          const la = segById.get(sa[i].legId), lb = segById.get(sb[i].legId);
          for (let q = 0; q < la.pts.length; q++) dL = Math.max(dL, dist(rot(la.pts[q]), lb.pts[q]));
        }
        const dLen = Math.abs(ra.length - rb.length);
        let dH = 0;
        if (ra.row === 1) {
          const hA = segs.filter((s2) => s2.round === ra.id && s2.type === 'hidden-start'), hB = segs.filter((s2) => s2.round === rb.id && s2.type === 'hidden-start');
          hA.forEach((s2, q) => { dH = Math.max(dH, dist(rot(s2.from), hB[q].from), dist(rot(s2.to), hB[q].to)); });
        }
        const same = dP < tolSym && dL < tolSym && dLen < tolLen && dH < tolSym;
        pairNums.push({ a: ra.id, b: rb.id, dP, dL, dLen, dH, same });
        // asymmetry explanation: stitch catch contains OTHER-set thread (occupancy, not an error)
        // spec v3.2 §6.10 (#38): V15 reads the U14 set-collision records, not the cluster (no foreign threads in it).
        const foreignOf = (st) => [...(st.sides.setCollision || []).map((c) => `${c.segRound}(U14 ${c.side} d ${f(c.d, 3)}${c.inSpan ? ', in span' : ''})`),
          ...(st.sides.squeeze || []).filter((q) => q.seg !== 'marking').map((q) => `${segById.get(q.seg).round}(tight, gap ${f(q.gap, 3)})`)];
        const why = [...new Set([...diffSt, ...sa.filter((_, i) => diffSt.includes(sb[i]))].flatMap(foreignOf))];
        const firstDiff = sb.findIndex((st, i) => st.i && Math.max(dist(rot(sa[i].E), st.E), dist(rot(sa[i].X), st.X)) >= tolSym);
        const upstream = firstDiff < 0 || sb.slice(0, firstDiff + 1).some((st) => foreignOf(st).length) || sa.slice(0, firstDiff + 1).some((st) => foreignOf(st).length);
        // §6.10: an unexplained residual > 0.1 w is a fail; below that it is reported (warn).
        const big = Math.max(dP, dL, dH) > 0.1 * w;
        if (!same) { if (why.length || upstream || !big) explained++; else unexplained++; }
        parts.push(`${rb.id} vs ${ra.id}: ${same ? 'matches' : `DIFFERS — E/X Δmax ${f(dP, 3)} mm na ${diffSt.length} stezhchkh (${diffSt.map((st) => `L${st.line}`).join(',')}), legs Δmax ${f(dL, 3)} mm, dlina ${f(ra.length)} vs ${f(rb.length)} mm${why.length ? `; prichina — U14 set collision / tight: ${why.join(', ')}` : ''}`}`);
      }
      add({ id: 'V15', name: 'Bn = An rotated by 360°/N (per row)', crit: 'TK-GT14 (B on neighboring lines, same distancie ot SP); ravenstvo ozhidaetsya, poch thread drugogo seta ne popadaet v okno igly; otlichie s takoy prichinoy — rezultat zanyatosti (warn), bez prichiny — oshibch (fail)',
        status: unexplained ? 'fail' : explained ? 'warn' : 'pass', value: parts.join('; '), numbers: { pairs: pairNums, tolSym, tolLen } });
    }
  }
  // V16 — needle does not pierce thread; upper holes per spec v3.2 §6.9 (#38).
  // Each pierce ≥ w/2 from any already-laid axis (channels projected to the surface).
  // Upper-hole offenders classified by WHOSE thread is under the hole:
  //   (1) own set (own cluster: same line + set; own set on another line likewise) → fail (G3/G11 bug)
  //   (2) other set, any class → warn U14 «set collision»: the needle passes UNDER it (§5.3); never a fail.
  // Causal diagnostics: geometric collision-start row on a line = first n with W_n/2 + w/2 ≥ d(s_T(n)), d = distance
  // to the nearest other-set thread at that level over the ALREADY LAID polylines (#26) — every class checkHole sees
  // (legs and channels projected to the surface; #38 follow-up, §5.3 items 1–2: foreign thread of any class);
  // observed earlier → printed.
  {
    let minMargin = Infinity, worst = null, nHoles = 0;
    let failOwn = 0, failForeign = 0, warnU14 = 0, badNoRoom = 0, sepOwn = 0;
    const braid16 = A.params?.topRule === 'braid';
    const noRoomHoles = stitchesDone.flatMap((st) => (st.sides.squeeze || []).filter((q) => q.noRoom).map((q) => (q.side === 'E' ? st.E : st.X)));
    const order = new Map(path.segs.map((x, i) => [x.id, i]));
    const surf = new Map(segs.filter((x) => x.type === 'pickup').map((x) => [x.id, x.pts.map((q) => { const n0 = norm(q); return q.map((v) => v * R / n0); })]));
    const before = (idxSeg) => segs.filter((x) => (x.type === 'leg' || x.type === 'pickup') && order.get(x.id) < idxSeg);
    const sTop0 = A.layout?.sTop ?? A.params.sTop_mm ?? 5;
    const phis = A.layout?.program?.az || [];
    const foreignLatCache = new Map();
    /** Lateral |y| on the needle line at tip level to the nearest already laid other-set thread, legs and channels
     *  (6a.21 d(s_T); the same classes as checkHole — #38 follow-up). */
    const foreignLatAt = (line, sT, ownSet, idxSeg = Infinity) => {
      if (!(line >= 0) || line >= phis.length || !(sT > 0)) return Infinity;
      const key = `${ownSet}:${line}:${sT.toFixed(4)}:${idxSeg}`;
      if (foreignLatCache.has(key)) return foreignLatCache.get(key);
      const phi = phis[line];
      const C = fPoint(R, VF, sT, phi);
      const uC = unit(C), eL = fEast(VF, C), n = fToward(VF, C);
      const coord = (p) => {
        const q = unit(p);
        return { f: R * Math.asin(Math.max(-1, Math.min(1, dot(q, n)))), y: R * Math.atan2(dot(q, eL), dot(q, uC)) };
      };
      let dMin = Infinity;
      for (const L of segs) {
        if ((L.type !== 'leg' && L.type !== 'pickup') || L.set === ownSet || !L.pts || L.pts.length < 2 || !(order.get(L.id) < idxSeg)) continue;
        for (let i = 1; i < L.pts.length; i++) {
          const a = coord(L.pts[i - 1]), b = coord(L.pts[i]);
          if (!(a.f * b.f <= 0 || Math.min(Math.abs(a.f), Math.abs(b.f)) < w)) continue;
          const t = Math.abs(a.f - b.f) < 1e-15 ? 0 : a.f / (a.f - b.f);
          const tt = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
          dMin = Math.min(dMin, Math.abs(a.y + (b.y - a.y) * tt));
        }
      }
      foreignLatCache.set(key, dMin);
      return dMin;
    };
    const hitDetails = [];
    const checkHole = (p, idxSeg, exclude, st, side) => {
      nHoles++;
      const what = `${side} ${st ? `${st.round}/${st.i}` : '?'}`;
      for (const L of before(idxSeg)) {
        if (exclude.includes(L.id)) continue;
        const d = ptPolyDist(p, L.type === 'pickup' ? surf.get(L.id) : L.pts);
        const margin = d - w / 2;
        if (margin < minMargin) { minMargin = margin; worst = `${what} — ${L.id}/${L.round} (${L.type === 'pickup' ? 'chnal' : 'leg'}): ${f(d, 3)} mm`; }
        if (!(margin < -1e-9)) continue;
        if (noRoomHoles.some((h) => dist(h, p) < 1e-9)) badNoRoom++;
        // Non-upper / start holes: any pierce is a fail (unchanged).
        if (!st || st.level !== 'top') { failForeign++; hitDetails.push({ side, st, L, kind: 'fail', margin }); continue; }
        // §6.9: classify by whose thread is under the upper hole; other set → U14 warn, own set → fail.
        // #50 stage A (braid): the needle goes into the mari between the own threads, pushing them aside (GT16) — class
        // separate «thread pushed aside», diagnostics only (§5.3 (2)(3)); in fan mode an own-set pierce stays a fail.
        if (L.set === st.set && braid16) { sepOwn++; hitDetails.push({ side, st, L, kind: 'separate-own', margin }); continue; }
        if (L.set === st.set) { failOwn++; hitDetails.push({ side, st, L, kind: 'own', margin }); continue; }
        warnU14++; hitDetails.push({ side, st, L, kind: 'U14', margin });
      }
    };
    for (const st of stitchesDone) {
      const iPk = order.get(st.pickupId);
      const own = path.segs.filter((x) => x.thread === st.thread && (dist(x.from, st.E) < 1e-9 || dist(x.to, st.E) < 1e-9 || dist(x.from, st.X) < 1e-9 || dist(x.to, st.X) < 1e-9)).map((x) => x.id);
      checkHole(st.E, iPk, [st.legId, ...own], st, 'E');
      checkHole(st.X, iPk, [st.legId, ...own], st, 'X');
    }
    for (const s2 of segs.filter((q) => q.type === 'hidden-start')) {
      const iS = order.get(s2.id);
      checkHole(s2.from, iS, [], null, `start ${s2.round} enter`);
      checkHole(s2.to, iS, [], null, `start ${s2.round} exit`);
    }
    // Geometric fan-start row per set/line: first n with W_n/2 ≥ d(s_T(n)); observed U14 must not be earlier.
    const geoFirst = {};
    const obsFirst = {};
    for (const st of stitchesDone.filter((x) => x.level === 'top')) {
      const key = `${st.set}:${st.line}`;
      const halfW = Math.abs((st.eOff ?? 0) - (st.xOff ?? 0)) / 2;
      // #26: causal — only threads laid before this top pickup (idxSeg); the acausal variant is a test mutation only.
      const dFan = foreignLatAt(st.line, st.s, st.set, V16_ACAUSAL ? Infinity : order.get(st.pickupId));
      if (halfW + w / 2 >= dFan && (geoFirst[key] == null || st.row < geoFirst[key])) geoFirst[key] = st.row;
    }
    for (const h of hitDetails) {
      if (h.kind !== 'U14' || !h.st) continue;
      const key = `${h.st.set}:${h.st.line}`;
      if (obsFirst[key] == null || h.st.row < obsFirst[key]) obsFirst[key] = h.st.row;
    }
    const earlyList = [];
    for (const key of Object.keys(obsFirst)) {
      if (geoFirst[key] == null || obsFirst[key] < geoFirst[key]) earlyList.push(`${key} obs ${obsFirst[key]} < geo ${geoFirst[key] ?? '—'}`);
    }
    const earlyObs = earlyList.length;   // §6.9: printed for analysis (a transition leg is a legal cause), not a fail
    const badFail = failOwn + failForeign;
    const status = badFail ? 'fail' : (warnU14 ? 'warn' : 'pass');
    const geoB = Object.entries(geoFirst).filter(([k]) => k.startsWith('B:')).map(([, n]) => n);
    const geoBmin = geoB.length ? Math.min(...geoB) : null;
    add({ id: 'V16', name: 'Needle does not pierce thread (legs and channels)',
      crit: 'prior #105; TK-LITTLE «jiwari should not be split»; spec v3.2 §6.9 upper holes: own set → fail, other set → U14 «set collision» warn (needle passes under)',
      status,
      value: `pierces ${nHoles}; min margin ${f(minMargin, 3)} mm (${worst || '—'}); `
        + `fail own set ${failOwn}, fail other holes ${failForeign}, U14 set collision warn ${warnU14}`
        + (braid16 ? `; braid (#50 stage A): own thread pushed aside (separate, diagnostic) ${sepOwn}` : '')
        + (earlyObs ? `; observed collision earlier than causal geometric start: ${earlyList.join(', ')}` : '')
        + (badNoRoom ? `; noRoom∩V16 ${badNoRoom}` : '')
        + (geoBmin != null ? `; geo fan-start B min row ${geoBmin}` : ''),
      numbers: { failOwn, failForeign, warnU14, sepOwn, earlyObs, earlyList, geoFirst, obsFirst, minMargin, badNoRoom } });
  }
  // V17 — uwagake: at top points of row n ≥ 2 the needle passes UNDER ALL threads of prior rows at that point
  {
    const tops = stitchesDone.filter((st) => st.row >= 2 && st.level === 'top');
    if (!tops.length) add({ id: 'V17', name: 'Needle under all previous rows at top (uwagake)', crit: 'TK-UWA «take a stitch around all of them»; SUESS «under and around all previous stitches»; prior #105', status: 'n/a', value: 'net topnikh stitches ryada ≥ 2' });
    else {
      // #54 (Fable §6.11, coordinator 4a): the row-1 legs at the set's start line without an arriving leg (the first leg out of
      // the start stitch and the row-1 closing leg) and the closing stitch of the set's last round are legitimate
      // asymmetries — printed as diagnostics, not a fail.
      // #54 (Fable 54b §2, spec 3.3.2 §6.10, §5.3 T2): the expectation is geometric — the own threads of rows < n that cross
      // the level s_T(n) within the span |x| ≤ h_n + w/2 (between X − w/2 and E + w/2 on the needle line) must lie under the
      // channel; threads that left the span before that level are «out of span» — counted with β_T, diagnostic (expected when
      // w·tan β_T > k_top·w + w/2: none on S8, every row of the C8 face-centre set B).
      let missing = 0, total = 0, diag = 0, outSpan = 0;
      const lines = [], diagList = [], outList = [];
      const az17 = A.layout.program.az;
      const inSpan17 = (st, leg) => {
        const C = fPoint(R, VF, st.s, az17[st.line]), uC = unit(C), eL = fEast(VF, C), nn = fToward(VF, C);
        const co = (p) => { const q = unit(p); return { f: dot(q, nn), y: R * Math.atan2(dot(q, eL), dot(q, uC)) }; };
        const yE = co(st.E).y, yX = co(st.X).y, lo = Math.min(yE, yX) - w / 2, hi = Math.max(yE, yX) + w / 2;
        let best = Infinity;
        for (let i = 1; i < leg.pts.length; i++) {
          const a = co(leg.pts[i - 1]), b = co(leg.pts[i]);
          if (a.f * b.f > 0) continue;
          const y = a.f === b.f ? a.y : a.y + (b.y - a.y) * (a.f / (a.f - b.f));
          if (y >= lo && y <= hi) return { in: true };
          best = Math.min(best, y < lo ? lo - y : y - hi);
        }
        return { in: false, outBy: best };
      };
      const beta17 = {};
      const betaOf17 = (set) => {
        if (set in beta17) return beta17[set];
        const s1 = stOk.find((q) => q.set === set && q.row === 1 && q.level === 'top' && !q.closing);
        const rd1 = s1 ? path.rounds.find((q) => q.id === s1.round) : null;
        const nx = rd1 ? rd1.stitchIdx.map((i) => path.stitches[i]).find((q) => q.i === s1.i + 1) : null;
        const a0 = nx ? segById.get(nx.legId)?.arcs?.find((q) => q.psi > 0) : null;
        beta17[set] = a0 ? Math.acos(clamp(dot(arcTangent(a0, a0.a), fToward(VF, a0.a).map((x) => -x)))) * 180 / Math.PI : null;
        return beta17[set];
      };
      const lastRow17 = {};
      for (const r of path.rounds) lastRow17[r.set] = Math.max(lastRow17[r.set] || 0, r.row);
      for (const st of tops) {
        const under = new Set(st.sides.cluster.map((c) => c.seg));
        const incident = [];
        for (const r of path.rounds.filter((q) => q.set === st.set && q.row < st.row)) {
          const sts = r.stitchIdx.map((i) => path.stitches[i]);
          const p = sts.find((q) => q.line === st.line && q.level === 'top');
          incident.push(p.legId);                                           // incoming leg of row r
          const nxt = sts.find((q) => q.i === p.i + 1);
          incident.push(nxt ? nxt.legId : r.firstLegId);                    // outgoing leg (at close — first leg)
        }
        const rd = path.rounds.find((q) => q.id === st.round);
        const lastClosing = st.closing && rd && rd.row === lastRow17[st.set];
        const startLine = rd && st.line === rd.startLine;
        const r1 = path.rounds.find((q) => q.set === st.set && q.row === 1);
        const r1Close = r1 ? path.stitches[r1.stitchIdx[r1.stitchIdx.length - 1]]?.legId : null;
        const isDiag = (id) => lastClosing || (startLine && r1 && (id === r1.firstLegId || id === r1Close));
        const outs = incident.filter((id) => { const lg = segById.get(id); return lg && !inSpan17(st, lg).in; });
        if (outs.length) { outSpan += outs.length; if (outList.length < 6) outList.push(`${st.round}/L${st.line} ${outs.join(',')}`); }
        const miss = incident.filter((id) => !under.has(id) && !outs.includes(id));
        const missFail = miss.filter((id) => !isDiag(id)), missDiag = miss.filter((id) => isDiag(id));
        total += incident.length - outs.length; missing += missFail.length; diag += missDiag.length;
        if (missDiag.length) diagList.push(`${st.round}/L${st.line} ${missDiag.join(',')} (${[lastClosing ? 'closing of the last round' : '', startLine && missDiag.some((id) => r1 && (id === r1.firstLegId || id === r1Close)) ? 'start line, row 1 without an arriving leg' : ''].filter(Boolean).join('; ')})`);
        lines.push(`${st.round}/L${st.line}: under ${incident.length - outs.length - miss.length}/${incident.length - outs.length}${outs.length ? ` (+${outs.length} out of span)` : ''}${missFail.length ? ` (not wrapped ${missFail.join(',')})` : ''}`);
      }
      add({ id: 'V17', name: 'Needle under all previous rows at top (uwagake)', crit: 'TK-UWA «take a stitch around all of them»; SUESS «under and around all previous stitches»; prior #105 (defect «third catch does not wrap»)',
        status: missing ? 'fail' : 'pass', value: `covered ${total - missing - diag} of ${total} prior-row shoulders crossing the stitch level within its span |x| ≤ h_n + w/2${outSpan ? `; out of span (left it before s_T(n), not expected, Fable 54b §2) ${outSpan}, β_T ${[...new Set(tops.map((q) => q.set))].sort().map((s) => `${s} ${betaOf17(s) == null ? '—' : f(betaOf17(s), 1) + '°'}`).join(', ')}: ${outList.join('; ')}${outSpan > outList.length ? '…' : ''}` : ''}${diag ? `; diagnostic (§6.11 legitimate asymmetries, not a fail) ${diag}: ${diagList.join('; ')}` : ''}; ${lines.join('; ')}`,
        numbers: { missing, diag, diagList, outSpan } });
    }
  }
  // V18 — over/under order derived from chronology and rules; set interweave (kousa) is a consequence
  {
    const cs = path.crossings.filter((c) => ids.has(c.a) && ids.has(c.b));
    if (!cs.length) add({ id: 'V18', name: 'Over/under by rule; set interweave', crit: 'G8; prior #102, #104; TK-GT14 «over», «kousa»', status: 'n/a', value: 'no crossings' });
    else {
      let viol = 0;
      const tally = {};
      for (const c of cs) {
        const a = segById.get(c.a), b = segById.get(c.b);   // a — laid later
        const r = path.rounds.find((q) => q.id === a.round);
        const exception = r.stitchIdx.some((i) => path.stitches[i].closing && path.stitches[i].legId === a.id) && b.id === r.firstLegId;
        const expOver = exception ? b.id : a.id;
        if (c.over !== expOver) viol++;
        const key = `${segById.get(c.over).round} over ${segById.get(c.under).round}`;
        tally[key] = (tally[key] || 0) + 1;
      }
      // interweave: for each Bn shoulder — which A rows under it, which over it (chronology consequence)
      let weaveLegs = 0, weaveOk = 0;
      for (const b of segs.filter((s2) => s2.round === 'B1' && s2.type === 'leg')) {
        const withA = cs.filter((c) => (c.a === b.id || c.b === b.id) && c.kind === 'crossing').map((c) => ({ other: segById.get(c.a === b.id ? c.b : c.a), over: c.over }));
        const a1 = withA.filter((x) => x.other.round === 'A1'), a2 = withA.filter((x) => x.other.round === 'A2');
        if (a1.length && a2.length) { weaveLegs++; if (a1.every((x) => x.over === b.id) && a2.every((x) => x.over !== b.id)) weaveOk++; }
      }
      const orderIdx = new Map(path.rounds.map((r, i) => [r.id, i]));
      const matrix = {};
      for (const c of cs.filter((c2) => c2.kind === 'crossing')) {
        const ra = segById.get(c.a).round, rb = segById.get(c.b).round;
        if (segById.get(c.a).set === segById.get(c.b).set) continue;
        const [rA, rB] = segById.get(c.a).set === 'A' ? [ra, rb] : [rb, ra];
        const key = `${rA}×${rB}`;
        const m = matrix[key] || (matrix[key] = { aOver: 0, bOver: 0, n: 0, expect: orderIdx.get(rA) > orderIdx.get(rB) ? 'A' : 'B' });
        m.n++; if (segById.get(c.over).set === 'A') m.aOver++; else m.bOver++;
      }
      const bRows = [...new Set(Object.keys(matrix).map((k2) => k2.split('×')[1]))].sort((x, y) => orderIdx.get(x) - orderIdx.get(y));
      const weaveTxt = bRows.map((rb) => {
        const under = Object.entries(matrix).filter(([k2, m]) => k2.endsWith('×' + rb) && m.aOver === 0).map(([k2]) => k2.split('×')[0]);
        const over = Object.entries(matrix).filter(([k2, m]) => k2.endsWith('×' + rb) && m.bOver === 0).map(([k2]) => k2.split('×')[0]);
        return `${rb} over ${under.join(',') || '—'}${over.length ? `, under ${over.join(',')}` : ''}`;
      }).join('; ');
      add({ id: 'V18', name: 'Over/under by rule; set interweave', crit: 'G8, prior #102 (later — above, unless recipe does not velit pod); #104/TK-UWA (potop prezhnikh rows); TK-LITTLE (zamychnie pod); TK-GT14 «interweave … kousa style» — chk sledstvie',
        status: viol ? 'fail' : 'pass',
        value: `crossings and wedges ${cs.length}: ${Object.entries(tally).map(([k2, v]) => `${k2} — ${v}`).join('; ')}; violations pravila ${viol}` +
          (weaveLegs ? `; interweave: B1 shoulders with A1 below and A2 above: ${weaveOk}/${weaveLegs}` : '') +
          (weaveTxt ? `; sets in crossings (free legs): ${weaveTxt}` : ''),
        numbers: { matrix, tally } });
    }
  }
  // V19 — room for working thread at each pierce (6a.18 upper-tip rule).
  // Upper tips: clearance needed only OUTSIDE the bundle; puncture condition is V16 (hole > w/2 from axes).
  // Row 2 upper squeeze is NOT a fail (rule bug). Rows ≥4 upper fan → U14 flat-model limit (document, no fail).
  {
    const sq = stitchesDone.flatMap((st) => (st.sides.squeeze || []).map((q) => ({ st, q })));
    const isUpper = (x) => x.st.level === 'top';
    const noRoomRaw = sq.filter((x) => x.q.noRoom);
    const noRoomFail = noRoomRaw.filter((x) => {
      if (!isUpper(x)) return true; // bottom: keep prior fail
      if (x.st.row === 2) return false; // 6a.18: row-2 upper is rule bug, not fail
      if (x.st.row >= 4) return false; // 6a.18: U14 fan — document only
      return true; // row 3 upper: still report
    });
    const u14Upper = noRoomRaw.filter((x) => isUpper(x) && x.st.row >= 4);
    const row2Upper = noRoomRaw.filter((x) => isUpper(x) && x.st.row === 2);
    const nameOf = (id) => (id === 'marking' ? 'neighbor marking' : `${id}/${segById.get(id)?.round}`);
    const byRound = {};
    for (const x of sq) (byRound[x.st.round] || (byRound[x.st.round] = [])).push(x);
    const status = noRoomFail.length ? 'fail' : (sq.length || u14Upper.length || row2Upper.length) ? 'warn' : 'pass';
    add({ id: 'V19', name: 'Room for needle between threads (compression in tight spots)', crit: 'prior #105; 6a.18: upper row2 ≠ fail (V16); rows≥4 upper = U14',
      status,
      value: sq.length ? `tight pierces ${sq.length}: ` + Object.entries(byRound).map(([r, xs]) => `${r}: ${xs.length} (${[...new Set(xs.map((x) => `${x.q.side} on L${x.st.line}`))].slice(0, 4).join(', ')}…), gap ${f(Math.min(...xs.map((x) => x.q.gap)), 3)}…${f(Math.max(...xs.map((x) => x.q.gap)), 3)} mm to ${[...new Set(xs.map((x) => nameOf(x.q.seg)))].slice(0, 3).join(', ')}, compression to ${f(Math.max(...xs.map((x) => x.q.comp)), 3)} mm from the other side`).join('; ') +
        (noRoomFail.length ? `; NO ROOM: ${noRoomFail.map((x) => `${x.st.round}/L${x.st.line}`).join(', ')}` : '') +
        (row2Upper.length ? `; row2 upper listed not fail (6a.18/V16): ${row2Upper.length}` : '') +
        (u14Upper.length ? `; U14 upper fan rows≥4: ${u14Upper.length}` : '')
        : 'all pierces have gap to neighbor point ≥ w (thread lays flush to its own cluster)',
      numbers: { squeezes: sq.map((x) => ({ round: x.st.round, line: x.st.line, i: x.st.i, ...x.q })), u14Upper: u14Upper.length, row2UpperExempt: row2Upper.length } });
  }

  // V20 — friction cone Φ3 (Errata 6a.9.1): FREE-CLASS segments only.
  //   Row 1: whole arc except ≤w windows at holes.
  //   Rows n≥2: exterior tangent splice only (path-distance ∈ (exclHole, spliceMm]).
  //   Rail body and climb are EXCLUDED — prior-thread contact holds them.
  //   Kinks at hole and climb merge: ANGLE ≤20° each (not discrete κ_g).
  {
    const muW = A.params.muWrap ?? A.params.mu ?? 0;
    const wMm = A.params.w_mm ?? A.params.w ?? 0;
    const legs = segs.filter((s) => s.type === 'leg' && s.pts && s.pts.length >= 3);
    let lambdaMax = 0;
    let worst = null;
    let badKink = 0, tolWorst = 0, nT2 = 0;
    const tolBranch = {}, badTan = [], graze = [];
    const kinkRows = [];
    for (const s of legs) {
      if (s.layMode === 'rail') {
        // Spec v3.2 §3.2(9в): a λ = 0 upper leg's drain at the hole is a kink ≤ 20° (mirror of (11б)); its free body is a
        // great circle (κ_g = 0 by construction).
        if (s.lam0 && Math.abs(s.exitTurnDeg ?? 0) > 20 + 1e-6) badKink++;
        const hole = Math.abs(s.holeTurnDeg ?? 0);
        const merge = Math.abs(s.mergeTurnDeg ?? s.turnAtTDeg ?? 0);
        kinkRows.push({ id: s.id, row: s.row, joinMode: s.joinMode, holeTurnDeg: hole, mergeTurnDeg: merge });
        // v3.4.2 §6.4: the exit tangency T₂ (rail end → tangent tail), the same class (ii) bound read on the piece before it
        {
          const j2 = tangentJoinTol(s, R, 'T2');
          if (j2.branch) {
            tolBranch[j2.branch] = (tolBranch[j2.branch] || 0) + 1; nT2++;
            if (j2.turnDeg != null) tolWorst = Math.max(tolWorst, j2.tolDeg > 0 ? j2.turnDeg / j2.tolDeg : j2.turnDeg > 1e-9 ? Infinity : 0);
            if (j2.turnDeg != null && j2.turnDeg > j2.tolDeg + 1e-6) { badKink++; badTan.push(`${s.id} T₂ ${f(j2.turnDeg, 3)}° > ${f(j2.tolDeg, 3)}° (${j2.branch})`); }
          }
        }
        if (s.entryKind === 'free-graze') graze.push(s);
        // 6a.19 / Codex block-B: splice checked by ANGLE — tangent ≤ 3·h·λ_r/R (§6.4 class (ii)), climb ≤20°; hole ≤20°.
        // κ_g excludes a window of width w around the splice join (discrete kink ≠ free curvature).
        if (s.joinMode === 'climb') {
          if (hole > 20 + 1e-6 || merge > 20 + 1e-6) badKink++;
          continue; // rail+climb excluded from κ_g
        }
        if (s.joinMode === 'onRail') continue;
        // (9б′): a degenerate entry turns at M like a climb (≤ 20°, expected ≤ atan(|d|/ℓ_m) + rail turn); a contradiction is V22's.
        if (s.joinMode === 'degenerate') { if (hole > 20 + 1e-6 || merge > 20 + 1e-6) badKink++; continue; }
        if (s.joinMode === 'contradiction') continue;
        if (s.joinMode === 'tangent') {
          const splice = Math.max(0, s.spliceMm ?? 0);
          // Degenerate short splice (<w): hole and merge coincide — only hole ≤20° (not exterior ≤1°). The whole splice lies
          // in the pierce neighbourhood (≤ w from the hole), so there is no free span to score (#27).
          if (splice < wMm) {
            if (hole > 20 + 1e-6) badKink++;
            continue;
          }
          // spec v3.3 §6.4 class (ii): the turn at T₁ is grid error ≤ 3·h·λ_r/R — was a bare 1°. Read locally: λ_r = |cot ρ| of
          // the rail piece that carries T (the piece after the splice; a corner arc of radius w has λ_r ≈ R/w) and h = the
          // output link after T on it (the splice before T is a great circle, κ_g = 0); the discrete turn is ≈ h·λ_r/(2R).
          const j1 = tangentJoinTol(s, R, 'T1');
          if (j1.branch) {
            tolBranch[j1.branch] = (tolBranch[j1.branch] || 0) + 1;
            tolWorst = Math.max(tolWorst, j1.tolDeg > 0 ? merge / j1.tolDeg : merge > 1e-9 ? Infinity : 0);
          }
          if (hole > 20 + 1e-6) badKink++;
          else if (j1.branch && merge > j1.tolDeg + 1e-6) { badKink++; badTan.push(`${s.id} T₁ ${f(merge, 3)}° > ${f(j1.tolDeg, 3)}° (${j1.branch})`); }
          // #27: free κ_g on the whole exterior splice X_n → T except the pierce neighbourhood (≤ w at the hole, where the
          // thread bends into the ball) and the vertex T itself (its turn is the join, checked by angle ≤ 3·h·λ_r/R above, (13б)).
          // No window around the join and no minimum span: every splice vertex beyond w from the hole is scored.
          const iT = Number.isInteger(s.mIdx) && s.mIdx > 0 ? s.mIdx : -1;
          const lam = iT >= 2 ? maxAbsGeodesicKg(s.pts.slice(0, iT + 1), R, wMm, 0) * R : 0;
          if (lam > lambdaMax) { lambdaMax = lam; worst = s; }
          continue;
        }
        if (s.joinMode === 'free') {
          if (s.lam0 && s.exitKind === 'drain') continue;
          // 6a.15 free leg: whole geodesic excl ≤w at holes.
          const lam = maxAbsGeodesicKg(s.pts, R, wMm, wMm) * R;
          if (lam > lambdaMax) { lambdaMax = lam; worst = s; }
          continue;
        }
        continue;
      }
      // Row-1 / geodesic: free class with ≤w windows at both holes. Spec v3.2 §6.6: row 1 is built at the commanded λ,
      // so its measured λ counts against μ within ±1e−4 (class (ii) round-off of κ_g on the sampled arc).
      const lamRaw = maxAbsGeodesicKg(s.pts, R, wMm, wMm) * R;
      const lam = s.row === 1 && lamRaw <= muW + 1e-4 ? Math.min(lamRaw, muW) : lamRaw;
      if (lam > lambdaMax) { lambdaMax = lam; worst = s; }
    }
    const ratio = muW > 1e-15 ? lambdaMax / muW : (lambdaMax > 1e-15 ? Infinity : 0);
    const WARN_RATIO = 1.0;
    const FAIL_RATIO = 1.2;
    const bowLegs = legs.filter((s) => s.layMode === 'smallCircle' || (s.row === 1 && s.shoulderForm === 'bow'));
    let cmdMismatch = false;
    let cmdLambda = null;
    let cmdSource = null;
    let worstCmd = null;
    const sagSet = A.params.bowSagMm !== '' && A.params.bowSagMm != null && Number.isFinite(+A.params.bowSagMm);
    const lamSet = A.params.bowLambda !== '' && A.params.bowLambda != null && Number.isFinite(+A.params.bowLambda)
      && (A.params.shoulderForm === 'bow' || A.path?.shoulderForm === 'bow');
    const fracSet = A.params.bowFrac !== '' && A.params.bowFrac != null && Number.isFinite(+A.params.bowFrac);
    if (bowLegs.length && A.params && (sagSet || lamSet || fracSet)) {
      if (lamSet) { cmdLambda = Math.max(0, +A.params.bowLambda); cmdSource = 'bowLambda'; }
      else if (fracSet) { cmdLambda = Math.max(0, +A.params.bowFrac * Math.max(0, muW)); cmdSource = 'bowFrac'; }
      else if (sagSet) { cmdSource = 'bowSagMm'; }
      for (const s of bowLegs) {
        const disc = maxAbsGeodesicKg(s.pts, R, wMm, wMm) * R;
        const expect = sagSet ? (Number.isFinite(s.lambda) ? s.lambda : disc) : cmdLambda;
        if (sagSet && cmdLambda == null) cmdLambda = expect;
        if (expect != null && Math.abs(disc - expect) > 1e-4) {
          cmdMismatch = true;
          if (!worstCmd || Math.abs(disc - expect) > Math.abs(worstCmd.disc - worstCmd.expect)) {
            worstCmd = { id: s.id, disc, expect };
          }
        }
      }
    }
    let status = 'pass';
    if (ratio > FAIL_RATIO - 1e-12 || cmdMismatch || badKink > 0) status = 'fail';
    else if (ratio > WARN_RATIO + 1e-9) status = 'warn';
    add({ id: 'V20', name: 'Friction cone Φ3 (λ ≤ μWrap)',
      crit: 'Errata 6a.9.1/block-B: λ_max κ_g on FREE only (row1 excl ≤w holes; n≥2 exterior tangent splice excl ≤w at hole and the join vertex T, #27; (10″) free-graze chords as free); rail+climb excluded; kink angles: hole≤20°, climb≤20°, tangency points T₁, T₂ ≤ 3·h_T·λ_r/R (v3.4.2 §6.4 class (ii): λ_r of the piece carrying the point, h_T the link next to it)',
      status,
      value: `λ_max=${f(lambdaMax, 6)} · μWrap=${f(muW, 4)} · λ/μ=${f(ratio, 6)}` +
        ` [warn>${WARN_RATIO}, fail≥${FAIL_RATIO}; free-class κ_g]` +
        (badKink ? `; badKink ${badKink} (hole/climb > 20° or tangency > 3·h_T·λ_r/R${badTan.length ? ': ' + badTan.slice(0, 4).join(', ') : ''})` : '') +
        `; tangency turns (T₁, T₂ ${nT2}) ≤ 3·h_T·λ_r/R: worst ${Number.isFinite(tolWorst) ? f(tolWorst, 3) : '∞'} of the bound, tolerance branch ${Object.entries(tolBranch).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}` +
        (graze.length ? `; (10″) free-graze ${graze.length}: ${graze.slice(0, 3).map((s) => `${s.id} Δs ${f(s.grazeDsMm, 3)} mm, rail gap ${f(s.grazeGapMm, 4)} mm, d to row n−1 ${f(s.grazeMinGapW, 3)} w`).join('; ')}` : '') +
        (cmdMismatch ? `; CMD MISMATCH ${worstCmd.id} λ=${f(worstCmd.disc, 6)} vs cmd ${f(worstCmd.expect, 6)} (${cmdSource})` : '') +
        (worst ? ` (worst ${worst.id}/${worst.round})` : '') +
        (legs.length ? `; shoulders ${legs.length}` : ''),
      numbers: { lambdaMax, muWrap: muW, ratio, warnRatio: WARN_RATIO, failRatio: FAIL_RATIO,
        bowLambda: A.params.bowLambda ?? null, cmdLambda, cmdSource, cmdMismatch, worstCmd, badKink, kinkRows, tolBranch, tolWorst, badTan,
        graze: graze.map((s) => ({ id: s.id, dsMm: s.grazeDsMm, gapMm: s.grazeGapMm, gapW: s.grazeMinGapW })) } });
  }

  // V22 — exitKind by construction (spec v3.2 §3.2(9г)). Lower legs (end at the packing root): λ > 0 only root (code
  // 'atE': the rail runs to E_n's foot), λ = 0 only free (E_n = E_n⁰). Upper legs (E_n given): λ > 0 tangent (code
  // 'root'), drain or free; λ = 0 drain or free. Any other combination — fail with the leg's role, λ and d_n.
  {
    const SPEC = { atE: 'root', root: 'tangent', drain: 'drain', free: 'free' };
    const wMm = A.params.w_mm ?? A.params.w ?? 0.714;
    const legs = segs.filter((s) => s.type === 'leg' && s.row >= 2 && s.layMode === 'rail');
    const bad = [];
    const counts = {};
    const joinDiag = [];
    const entryBad = [];
    const entryKinds = {};
    let freeGapMin = Infinity, degDMax = 0;
    // #50 stage A (braid): V22 and the drain (11) toward the top do not apply — the top end (upper legs' exit at the top
    // hole, lower legs' entry from X_n) is printed as a diagnostic, not a fail. The bottom end (9а), (12) is unchanged.
    const braid22 = A.params?.topRule === 'braid';
    const braidTop = [], braidJoints = [], braidShifts = [];
    let braidTangents = 0;
    for (const s of legs) {
      const role = s.level === 'bottom' ? 'lower' : 'upper';
      const lam0 = !!s.lam0;
      const entryBad0 = entryBad.length;
      // (10′) (#46): a lower λ > 0 leg with no tangency on any rail piece is free when its chord X_n → E_n⁰ clears row n−1
      // (≥ w(1 − εc)): the only lawful lower free at λ > 0. No tangency and a chord closer than that — fail (printed below).
      const lowerFree = role === 'lower' && !lam0 && s.entryKind === 'free' && (s.entryMinGapW ?? 0) >= 1 - EPS_C;
      const ok = role === 'lower' ? (lam0 ? ['free'] : lowerFree ? ['free'] : ['atE']) : (lam0 ? ['drain', 'free'] : ['root', 'drain', 'free', 'free-graze']);
      const key = `${role} λ${lam0 ? '=0' : '>0'} ${SPEC[s.exitKind] ?? s.exitKind}`;
      counts[key] = (counts[key] || 0) + 1;
      // (9б) diagnostic, not a fail: joinMode against the band of d_n (8′). At λ > 0 a station outside by d > 0.1 w with no
      // tangency on the finite rail (L_j beyond the rail, or outside the entry parallel but inside the core's continuation)
      // falls back to climb — printed for Fable (#39 item 3), rule (9б) does not cover it.
      if (role === 'lower' || lam0) {
        const d = s.lateralMm ?? 0;
        // (9а) at λ = 0: the d_n band ±DEG_MAX_W·w = ±0.1·w (spec v3.3: unified with (9б′), the construction's band). (9б′) at λ > 0 (#46): no band — |d| ≤ 1e−9·w is round-off (X on the rail,
        // tangency at the foot), d < 0 climb, d > 0 by construction: tangent | free | degenerate (|d| ≤ 0.1·w) | contradiction.
        const tolD = lam0 ? DEG_MAX_W * wMm : 1e-9 * wMm;
        const band = d < -tolD ? 'climb' : d <= tolD ? (lam0 ? 'onRail' : 'tangent') : (lam0 ? 'free' : 'tangent');
        const byConstruction = !lam0 && d > tolD && ['free', 'degenerate', 'contradiction'].includes(s.joinMode);
        if (role === 'lower' && !lam0 && d > tolD && s.joinMode === 'climb') entryBad.push(`${s.id}/${s.round} climb from exterior d=${f(d / wMm, 3)} w`);
        if (!lam0 && s.entryKind === 'degenerate' && !(d <= DEG_MAX_W * wMm + 1e-12)) entryBad.push(`${s.id}/${s.round} degenerate with d=${f(d / wMm, 3)} w > ${DEG_MAX_W} w`);
        if (!lam0 && s.entryFail && s.entryBackward) entryBad.push(`${s.id}/${s.round} contradiction: E⁰ behind the foot along the rail (travel reversed, #30)`);
        else if (!lam0 && s.entryFail) entryBad.push(`${s.id}/${s.round} contradiction: no tangency, chord X→E⁰ min clearance ${f(s.entryMinGapW, 3)} w at ${f(s.entryGapAtMm, 2)} mm; d_n=${f(d / wMm, 3)} w > ${DEG_MAX_W} w; λr=${f(s.lambda ?? 0, 3)}`
          + (s.entryBest ? `; best cand sin ${f(s.entryBest.sin, 4)} res ${f(s.entryBest.resMm, 4)} mm on ${s.entryBest.cls}` : '; no root on any piece'));
        if (s.entryScan?.mismatch) entryBad.push(`${s.id}/${s.round} closed-form tangency ${s.entryScan.closedS ?? '—'} vs grid scan ${s.entryScan.scanS ?? '—'}`);
        if (s.joinMode !== band && !byConstruction && !(band === 'tangent' && s.joinMode === 'free')) joinDiag.push(`${s.id}/${s.round} ${s.joinMode}≠${band} d=${f(d / wMm, 3)} w`);
        if (!lam0 && s.entryKind) entryKinds[s.entryKind] = (entryKinds[s.entryKind] || 0) + 1;
        if (!lam0 && s.entryKind === 'free') freeGapMin = Math.min(freeGapMin, s.entryMinGapW ?? Infinity);
        if (!lam0 && s.entryKind === 'degenerate') degDMax = Math.max(degDMax, d / wMm);
      }
      if (braid22) braidTop.push(...entryBad.splice(entryBad0));
      // #50 decision 1(b): the braid joint (great circle ∩ rail, no tangency) turns ≤ 20° — exceeding it is a V22 fail.
      if (braid22 && s.braidJoinShiftMm != null) braidShifts.push(s.braidJoinShiftMm);
      if (braid22 && s.braidExitShiftMm != null) braidShifts.push(s.braidExitShiftMm);
      if (braid22 && s.braidJoinTurnDeg != null) { braidJoints.push(s.braidJoinTurnDeg); if (!(s.braidJoinTurnDeg <= 20)) entryBad.push(`${s.id}/${s.round} braid entry joint turn ${f(s.braidJoinTurnDeg, 2)}° > 20°`); }
      if (braid22 && s.braidExitTurnDeg != null) { braidJoints.push(s.braidExitTurnDeg); if (!(s.braidExitTurnDeg <= 20)) entryBad.push(`${s.id}/${s.round} braid top-hole joint turn ${f(s.braidExitTurnDeg, 2)}° > 20°`); }
      if (braid22 && s.entryKind === 'braidTangent') braidTangents++;
      if (!ok.includes(s.exitKind)) {
        const b = { id: s.id, round: s.round, role, lam0, lambda: s.lambda ?? 0, exitKind: s.exitKind, joinMode: s.joinMode, dW: (s.lateralMm ?? 0) / wMm };
        if (braid22 && role === 'upper') braidTop.push(`${b.id}/${b.round} upper exitKind ${b.exitKind}`); else bad.push(b);
      }
    }
    add({ id: 'V22', name: 'Leg end kind by construction (9г)',
      crit: 'spec v3.2 §3.2(9г): lower λ>0 root (code atE), lower λ=0 free; upper tangent (code root, λ>0) / drain / free / free-graze ((10″) tangents crossed, v3.4.2); anything else fail',
      status: bad.length || entryBad.length ? 'fail' : 'pass',
      value: (entryBad.length ? `(10′) entry fail ${entryBad.length}: ${entryBad.slice(0, 6).join('; ')}; ` : '') + (bad.length ? `fail ${bad.length}: ` + bad.slice(0, 8).map((b) => `${b.id}/${b.round} ${b.role} λ${b.lam0 ? '=0' : '>0'} (${f(b.lambda, 3)}) exitKind ${b.exitKind} join ${b.joinMode} d=${f(b.dW, 3)} w`).join('; ') + '; ' : '')
        + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')
        + (Object.keys(entryKinds).length ? `; (10′)/(9б′) entries λ>0: ${Object.entries(entryKinds).map(([k, v]) => `${k} ${v}`).join(', ')}` : '')
        + (Number.isFinite(freeGapMin) ? `; free legs min chord clearance ${f(freeGapMin, 3)} w` : '')
        + (degDMax > 0 ? `; degenerate max |d| ${f(degDMax, 3)} w` : '')
        + (path.invalidFrom ? `; BUILD INVALID from row ${path.invalidFrom.row} (${path.invalidFrom.leg}/${path.invalidFrom.round}.i${path.invalidFrom.stitch}, d ${f(path.invalidFrom.dW, 3)} w, min clearance ${f(path.invalidFrom.gapW, 3)} w)` : '')
        + (joinDiag.length ? `; (9б) join vs d_n band, diagnostic ${joinDiag.length}: ${joinDiag.slice(0, 4).join('; ')}` : '')
        + (braid22 ? `; braid joints (great circle ∩ rail, M from ℓ_m forward until ≤ 20°): ${braidJoints.length}${braidJoints.length ? `, max turn ${f(Math.max(...braidJoints), 2)}°, M moved ${braidShifts.filter((x) => x > 0).length}, max shift ${f(Math.max(0, ...braidShifts), 3)} mm` : ''}; braid tangency entries ${braidTangents}` : '')
        + (braid22 ? `; braid (#50 stage A): top end not checked (V22/(11) at the top off), diagnostic ${braidTop.length}${braidTop.length ? ': ' + braidTop.slice(0, 4).join('; ') : ''}` : ''),
      numbers: { bad, counts, joinDiag, entryBad, entryKinds, braidJoints, braidShifts, braidTangents, braidTop, freeGapMinW: Number.isFinite(freeGapMin) ? freeGapMin : null, degDMaxW: degDMax, invalidFrom: path.invalidFrom || null } });
  }

  // V21 — transversality (Fable v2 / Errata §6a / 6a.9.2 / 6a.19 / 6a.20). Criteria:
  //  (1) destination meridian crossed exactly once — ALL legs
  //  (2) stick = length(segment ∩ {|lat|<ε}) ≤ 1.2·2ε/sin(α_exp) — ALL legs
  //  (3) lower-arm angle: |sin α_act/sin α_ref−1|≤0.03 for rail AND free (6a.19/6a.20)
  // α_ref at the AXIS CROSSING POINT:
  //   Free λ>0: tangent of analytical small-circle arc (6a.20; "+θ" is tables-only)
  //   Free λ=0: reference-geodesic angle at the same point
  //   Rail n≥2: parallel of accepted row n−1
  // 1.2 factor = discretization margin only (6a.9.2).
  {
    const legs = segs.filter((s) => s.type === 'leg' && s.pts && s.pts.length >= 3);
    const glueThr = w * (0.05 / 0.714); // 6a.11(3) ε ∝ w (0.05 mm at w0=0.714)
    // Commanded λ for row-1 analytic reference; rail legs store cotρ in s.lambda — do NOT use that.
    let lamCmd = 0;
    {
      const form = A.params.shoulderForm || A.path?.shoulderForm;
      if (form === 'bow' || form === 'bowToMarking') {
        if (A.params.bowLambda !== '' && A.params.bowLambda != null && Number.isFinite(+A.params.bowLambda))
          lamCmd = Math.max(0, +A.params.bowLambda);
        else if (A.params.bowFrac !== '' && A.params.bowFrac != null && Number.isFinite(+A.params.bowFrac))
          lamCmd = Math.max(0, +A.params.bowFrac * (A.params.muWrap ?? A.params.mu ?? 0));
      }
    }
    let worstStick = 0;
    let worstThr = 0;
    let worst = null;
    let badCrossings = 0;
    let badAngle = 0;
    let badStick = 0;
    let minLat = Infinity;
    let minAngleDeg = null;
    let minAngleGeoDeg = null;
    const angleRows = [];
    const stickRows = [];
    for (const s of legs) {
      const phi = A.layout.program.az[((s.line % N) + N) % N];
      const nMer = VF.atN ? [-Math.sin(phi), Math.cos(phi), 0] : halfLineAt(VF.c, VF.z0, phi).n;   // #53: the half-line's great circle
      const nLast = s.pts.length - 1;
      const signedLat = (i) => {
        const u = unit(s.pts[i]);
        return R * Math.asin(Math.max(-1, Math.min(1, dot(u, nMer))));
      };
      // (1) crossings
      let nInter = 0;
      let firstMeet = -1;
      let meetT = 0;
      for (let i = 1; i <= nLast; i++) {
        const a = signedLat(i - 1), b = signedLat(i);
        if (a * b < 0 || (Math.abs(b) < 1e-9 && Math.abs(a) >= 1e-9)) {
          nInter++;
          if (firstMeet < 0) {
            firstMeet = i;
            meetT = Math.abs(a - b) < 1e-15 ? 1 : Math.abs(a) / Math.abs(a - b);
          }
        }
        const lat = Math.abs(b);
        if (lat < minLat) minLat = lat;
      }
      if (nInter === 0 && Math.abs(signedLat(nLast)) < 1e-6) { nInter = 1; firstMeet = nLast; meetT = 1; }
      if (nInter !== 1) badCrossings++;

      // α_geo(own) at local axis crossing (geodesic through same X,E)
      const X = unit(s.pts[0]), E = unit(s.pts[nLast]);
      let alphaGeo = 0;
      {
        let uGeo = 0.5;
        const latAt = (u) => {
          const ang = angle(X, E) || 1e-15;
          const g = unit(vadd(mul(X, Math.sin((1 - u) * ang) / Math.sin(ang)), mul(E, Math.sin(u * ang) / Math.sin(ang))));
          return R * Math.asin(Math.max(-1, Math.min(1, dot(g, nMer))));
        };
        let lo = 0, hi = 1, llo = latAt(0);
        for (let it = 0; it < 40; it++) {
          const mid = (lo + hi) / 2, lm = latAt(mid);
          if (llo * lm <= 0) hi = mid; else { lo = mid; llo = lm; }
        }
        uGeo = (lo + hi) / 2;
        const angXE = angle(X, E) || 1e-15;
        const Cgeo = unit(vadd(mul(X, Math.sin((1 - uGeo) * angXE) / Math.sin(angXE)), mul(E, Math.sin(uGeo * angXE) / Math.sin(angXE))));
        const u2 = Math.min(1, uGeo + 1e-5);
        const Cgeo2 = unit(vadd(mul(X, Math.sin((1 - u2) * angXE) / Math.sin(angXE)), mul(E, Math.sin(u2 * angXE) / Math.sin(angXE))));
        const Tgeo = unit(sub(Cgeo2, mul(Cgeo, dot(Cgeo2, Cgeo))));
        const TmerG = unit(sub(fToward(VF, Cgeo), mul(Cgeo, dot(fToward(VF, Cgeo), Cgeo))));
        if (Math.hypot(...Tgeo) > 1e-12 && Math.hypot(...TmerG) > 1e-12) {
          alphaGeo = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(Tgeo), unit(TmerG))))));
        }
      }

      // α_exp from reference curve at crossing (6a.9.2). Each leg against its own construction class (#46, coordinator):
      // a (10′) free chord (λ > 0, entryKind free: the whole leg is the geodesic X_n → E_n⁰, exitKind free) is compared with
      // the geodesic angle, like the free legs at λ = 0; the rail angle (parallel of row n−1) applies only to legs on the rail.
      const freeChord = s.row >= 2 && !s.lam0 && ((s.entryKind === 'free' && s.exitKind === 'free') || s.entryKind === 'free-graze');
      let alphaExp = alphaGeo;
      {
        const splice = (s.layMode === 'rail') ? Math.max(0, s.spliceMm ?? 0) : 0;
        const cum = [0];
        for (let i = 1; i <= nLast; i++) cum.push(cum[i - 1] + R * angle(s.pts[i - 1], s.pts[i]));
        let iRef = firstMeet > 0 ? firstMeet : nLast;
        let tRef = meetT;
        if (splice > 1e-9 && cum[Math.max(0, iRef)] < splice - 1e-9) {
          for (let i = 1; i <= nLast; i++) {
            if (cum[i] < splice) continue;
            const a = signedLat(i - 1), b = signedLat(i);
            if (a * b < 0 || (Math.abs(b) < 1e-9 && Math.abs(a) >= 1e-9)) {
              iRef = i;
              tRef = Math.abs(a - b) < 1e-15 ? 1 : Math.abs(a) / Math.abs(a - b);
              break;
            }
          }
        }
        if (s.row === 1 && s.bowCenter && Number.isFinite(s.rho) && s.layMode === 'smallCircle') {
          const Pc = unit(s.bowCenter);
          const rho = s.rho;
          const pa = unit(sub(X, mul(Pc, dot(X, Pc))));
          const pb = unit(sub(E, mul(Pc, dot(E, Pc))));
          let psi = angle(pa, pb);
          if (dot(cross(pa, pb), Pc) < 0) psi = -psi;
          const pt = (u) => {
            const c = Math.cos(u * psi), sn = Math.sin(u * psi);
            const rad2 = unit(vadd(vadd(mul(pa, c), mul(cross(Pc, pa), sn)), mul(Pc, dot(Pc, pa) * (1 - c))));
            return unit(vadd(mul(Pc, Math.cos(rho)), mul(rad2, Math.sin(rho))));
          };
          const latSC = (u) => R * Math.asin(Math.max(-1, Math.min(1, dot(pt(u), nMer))));
          let lo = 0, hi = 1, llo = latSC(0);
          for (let it = 0; it < 40; it++) {
            const mid = (lo + hi) / 2, lm = latSC(mid);
            if (llo * lm <= 0) hi = mid; else { lo = mid; llo = lm; }
          }
          const uHit = (lo + hi) / 2;
          const C = pt(uHit);
          const C2 = pt(Math.min(1, uHit + 1e-5));
          const Tarc = unit(sub(C2, mul(C, dot(C2, C))));
          const Tmer = unit(sub(fToward(VF, C), mul(C, dot(fToward(VF, C), C))));
          if (Math.hypot(...Tarc) > 1e-12 && Math.hypot(...Tmer) > 1e-12) {
            alphaExp = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(Tarc), unit(Tmer))))));
          }
        } else if (s.row >= 2 && !freeChord) {
          // 6a.9.2 / 6a.12: support = axis ∩ independent offset of ACCEPTED row n−1 (not under-test).
          const prev = segs.find((x) => x.type === 'leg' && x.set === s.set && x.row === s.row - 1 && x.stitch === s.stitch);
          let C = null, Tref = null;
          if (prev?.pts?.length >= 2) {
            const skipMm = Math.max(prev.climbMm || 0, prev.spliceMm || 0, 0);
            let body = prev.pts;
            if (skipMm > 1e-9) {
              let cum = 0, i0 = 0;
              for (let i = 1; i < prev.pts.length; i++) {
                cum += R * angle(prev.pts[i - 1], prev.pts[i]);
                if (cum + 1e-9 >= skipMm) { i0 = i; break; }
              }
              body = prev.pts.slice(Math.max(0, i0));
              if (body.length < 2) body = prev.pts;
            }
            const alphaOff = w / R;
            const off = [];
            for (let i = 0; i < body.length; i++) {
              const p = unit(body[i]);
              const i1 = Math.min(body.length - 1, i + 1), i0p = Math.max(0, i - 1);
              let T = unit(sub(unit(body[i1]), unit(body[i0p])));
              T = unit(sub(T, mul(p, dot(T, p))));
              if (Math.hypot(...T) < 1e-12) {
                T = unit(cross(p, nMer));
              }
              let N = unit(cross(p, T));
              if (dot(N, fToward(VF, p)) > 0) N = mul(N, -1);
              off.push(unit(vadd(mul(p, Math.cos(alphaOff)), mul(N, Math.sin(alphaOff)))));
            }
            if (off.length >= 2) {
              const pend = off[off.length - 1];
              const T1 = unit(sub(pend, mul(off[off.length - 2], dot(pend, off[off.length - 2]))));
              const extRad = Math.max(5 * w, w * (10 / 0.714)) / R;
              for (let k = 1; k <= 8; k++) {
                const a = extRad * (k / 8);
                off.push(unit(vadd(mul(pend, Math.cos(a)), mul(T1, Math.sin(a)))));
              }
            }
            const latOf = (p) => R * Math.asin(Math.max(-1, Math.min(1, dot(unit(p), nMer))));
            for (let i = 1; i < off.length; i++) {
              const la = latOf(off[i - 1]), lb = latOf(off[i]);
              if (la * lb > 0 && Math.abs(la) >= 1e-12 && Math.abs(lb) >= 1e-12) continue;
              const t = Math.abs(la - lb) < 1e-15 ? 1 : Math.abs(la) / Math.max(1e-15, Math.abs(la - lb));
              const A = unit(off[i - 1]), B = unit(off[i]);
              const om = angle(A, B);
              C = om < 1e-15 ? A
                : unit(vadd(mul(A, Math.sin((1 - t) * om) / Math.sin(om)), mul(B, Math.sin(t * om) / Math.sin(om))));
              const Traw = unit(sub(B, mul(C, dot(B, C))));
              Tref = unit(sub(Traw, mul(C, dot(Traw, C))));
              break;
            }
          }
          if (!C || !Tref) {
            C = unit(vadd(mul(unit(s.pts[Math.max(0, iRef - 1)]), 1 - tRef), mul(unit(s.pts[Math.min(iRef, nLast)]), tRef)));
            const Tpath = unit(sub(s.pts[Math.min(iRef, nLast)], s.pts[Math.max(0, iRef - 1)]));
            Tref = unit(sub(Tpath, mul(C, dot(Tpath, C))));
          }
          const TmerC = unit(sub(fToward(VF, C), mul(C, dot(fToward(VF, C), C))));
          if (Math.hypot(...Tref) > 1e-12 && Math.hypot(...TmerC) > 1e-12) {
            alphaExp = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(Tref), unit(TmerC))))));
          }
        } else {
          const C = unit(vadd(mul(unit(s.pts[Math.max(0, iRef - 1)]), 1 - tRef), mul(unit(s.pts[Math.min(iRef, nLast)]), tRef)));
          const Tpath = unit(sub(s.pts[Math.min(iRef, nLast)], s.pts[Math.max(0, iRef - 1)]));
          const TpathT = unit(sub(Tpath, mul(C, dot(Tpath, C))));
          const TmerC = unit(sub(fToward(VF, C), mul(C, dot(fToward(VF, C), C))));
          if (Math.hypot(...TpathT) > 1e-12 && Math.hypot(...TmerC) > 1e-12) {
            alphaExp = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(TpathT), unit(TmerC))))));
          }
        }
      }
      if (!(alphaExp > 1e-9)) alphaExp = 1e-9;
      if (alphaExp > Math.PI / 2) alphaExp = Math.PI / 2;
      const sinA = Math.sin(alphaExp);
      const legThr = 1.2 * (2 * glueThr) / sinA;

      // (2) continuous stick: path length of segment ∩ {|lat|<ε} (signed lat)
      let bestLen = 0, runLen = 0;
      for (let i = 1; i <= nLast; i++) {
        const sa = signedLat(i - 1), sb = signedLat(i);
        const segMm = R * angle(s.pts[i - 1], s.pts[i]);
        let frac = 0;
        {
          const d = sb - sa;
          if (Math.abs(d) < 1e-15) frac = Math.abs(sa) <= glueThr ? 1 : 0;
          else {
            let tLo = (-glueThr - sa) / d, tHi = (glueThr - sa) / d;
            if (tLo > tHi) { const tmp = tLo; tLo = tHi; tHi = tmp; }
            const lo = Math.max(0, tLo), hi = Math.min(1, tHi);
            frac = hi > lo ? hi - lo : 0;
          }
        }
        if (frac > 0) runLen += frac * segMm;
        else { if (runLen > bestLen) bestLen = runLen; runLen = 0; }
      }
      if (runLen > bestLen) bestLen = runLen;
      const stickMm = bestLen;
      stickRows.push({ id: s.id, stickMm, thresholdMm: legThr, alphaGeoDeg: alphaGeo * 180 / Math.PI,
        alphaExpDeg: alphaExp * 180 / Math.PI, level: s.level, lambda: lamCmd });
      if (stickMm > worstStick) { worstStick = stickMm; worstThr = legThr; }
      if (stickMm > legThr + 1e-12 || nInter !== 1) {
        if (stickMm > legThr + 1e-12) badStick++;
        if (!worst || stickMm > (worst.stickMm || 0)) worst = { id: s.id, round: s.round, stickMm, thresholdMm: legThr, nInter, level: s.level };
      }

      // (3) angle — lower legs only (Errata 6a.3)
      if (s.level !== 'bottom') continue;
      const iMeet = firstMeet > 0 ? firstMeet : nLast;
      const tMeet = Math.max(0, Math.min(1, meetT));
      const C = unit(vadd(mul(unit(s.pts[Math.max(0, iMeet - 1)]), 1 - tMeet), mul(unit(s.pts[Math.min(iMeet, nLast)]), tMeet)));
      const Tpath = unit(sub(s.pts[Math.min(iMeet, nLast)], s.pts[Math.max(0, iMeet - 1)]));
      const TpathT = unit(sub(Tpath, mul(C, dot(Tpath, C))));
      const TmerC = unit(sub(fToward(VF, C), mul(C, dot(fToward(VF, C), C))));
      let alpha = 0;
      if (Math.hypot(...TpathT) > 1e-12 && Math.hypot(...TmerC) > 1e-12) {
        alpha = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(TpathT), unit(TmerC))))));
      }
      const aDeg = alpha * 180 / Math.PI, gDeg = alphaGeo * 180 / Math.PI;
      // 6a.19/6a.20: free = row 1 (any λ) and joinMode/railKind=free (λ=0 free-exit).
      // Residual climb/rail at λ=0 uses α_ref = parallel of accepted n−1 (rail rule).
      const isFree = s.row === 1 || s.joinMode === 'free' || s.railKind === 'free' || freeChord;
      const isRail = !isFree && s.row >= 2;
      // 6a.20: free α_ref = analytic arc tangent at axis crossing (λ>0) or ref geodesic there (λ=0).
      // α_geo+θ is tables-only — not the validator reference.
      const alphaRef = isFree
        ? (lamCmd > 1e-15 && !freeChord ? alphaExp : alphaGeo)
        : alphaExp;
      const sinAct = Math.sin(alpha), sinRef = Math.sin(Math.max(alphaRef, 1e-12));
      const sinRatio = sinAct / sinRef;
      const deficitDeg = gDeg - aDeg; // α_geo(own) − α_act (physicality: ≈0 at row2, grows with n on rail)
      angleRows.push({
        id: s.id, row: s.row, set: s.set, angleDeg: aDeg, alphaGeoDeg: gDeg,
        alphaRefDeg: alphaRef * 180 / Math.PI, alphaExpDeg: alphaExp * 180 / Math.PI,
        sinRatio, deficitDeg, layMode: s.layMode, joinMode: s.joinMode, isRail, isFree, freeChord,
      });
      if (minAngleDeg == null || aDeg < minAngleDeg) { minAngleDeg = aDeg; minAngleGeoDeg = gDeg; }
      // 6a.19/6a.20: |sin α_act / sin α_ref − 1| ≤ 0.03 for rail and free (bilateral).
      // Climb: meridian may sit inside the climb splice — α vs rail α_ref not applicable; V20 owns ≤20° kink.
      // 5° allowance removed.
      if (s.level === 'bottom' && s.joinMode !== 'climb') {
        if (!(Math.abs(sinRatio - 1) <= 0.03 + 1e-12)) badAngle++;
      }
    }
    if (!Number.isFinite(minLat)) minLat = Infinity;
    const ok = badStick === 0 && badCrossings === 0 && badAngle === 0;
    add({ id: 'V21', name: 'Transversality at destination meridian',
      crit: 'Fable v2 Errata §6a/6a.9.2/6a.19/6a.20: one crossing + stick ≤ 1.2·2ε/sin(α_exp); lower |sinα_act/sinα_ref−1|≤0.03 (rail: parallel n−1; free λ>0: analytic arc at axis; free λ=0: geodesic at axis); +θ tables-only; no 5° allowance',
      status: ok ? 'pass' : 'fail',
      value: legs.length
        ? `stick max ${f(worstStick, 3)} mm (threshold ${f(worstThr || (worst && worst.thresholdMm) || 0, 3)} mm ≤ 1.2·2ε/sin α_exp); meetings≠1: ${badCrossings}; badAngle: ${badAngle}; badStick: ${badStick}` +
          (minAngleDeg != null ? `; angle min ${f(minAngleDeg, 3)}° (α_geo ${f(minAngleGeoDeg, 3)}°)` : '') +
          `; min lat ${f(minLat, 3)}` +
          (worst ? `; worst ${worst.id}/${worst.round}` : '')
        : 'no shoulders',
      numbers: { tipStickMm: worstStick, thresholdMm: worstThr, glueThrMm: glueThr, minLatMm: minLat,
        badCrossings, badAngle, badStick, minAngleDeg, minAngleGeoDeg, angleRows, stickRows, worst } });
  }

  // V23 — shoulder coverage (#54, Fable §6, coordinator 4a): every leg of row n+1 against the leg of the same stitch (petal,
  // side) of row n of the SAME set (the one its rail was built on): on the packed part (arc classes rail and tail) the
  // perpendicular axis distance ≤ w(1 + εc). Excluded: the braid / crossover zone at the top (s < s_T(n+1) + ℓ_braid,max;
  // in fan mode the same top zone; fan (regression / stress mode) checks the rail class only — its tail leaves the rail for
  // the G3 fan hole by construction, printed as a diagnostic), feet beyond the end of the row-n leg, the last row (nothing above it). Sets are compared only within
  // themselves (different half-line lengths). The start-line side without an arriving row-1 leg (closing legs, the row-1
  // first leg) and the last round's closing leg are legitimate asymmetries (§6.11): diagnostic, not a fail.
  {
    const braid23 = A.params?.topRule === 'braid';
    const lBraid23 = (Number.isFinite(Number(A.params?.lBraidMaxW)) && A.params?.lBraidMaxW !== '' ? Number(A.params.lBraidMaxW) : 20) * w;
    // #54 (Fable 54b §3, spec 3.3.2 §6.10): rail — |d − w| ≤ εc·w; free parts (tail, free) — only d ≥ w(1 − εc), the drift
    // d − w printed (a free tail cannot follow a row that bends away from it: U «thread pressed by the crafter», §7 No. 17).
    const lim = w * (1 + EPS_C), limLo = w * (1 - EPS_C);
    const drifts = [];
    const done = roundsOk.filter(roundDone);
    const lastRow = {};
    for (const r of done) lastRow[r.set] = Math.max(lastRow[r.set] || 0, r.row);
    let pairs = 0, pts = 0, dMax = 0, dMaxAt = '—', tailFanMax = 0;
    const bad = [], diag = [];
    for (const rb of done) {
      if (rb.row < 2) continue;
      const ra = done.find((q) => q.set === rb.set && q.row === rb.row - 1);
      if (!ra) continue;
      const tops = stOk.filter((st) => st.round === rb.id && st.level === 'top').map((st) => st.s);
      const sTop = tops.length ? Math.min(...tops) : 0;
      const lastClosingLeg = rb.row === lastRow[rb.set] ? path.stitches[rb.stitchIdx[rb.stitchIdx.length - 1]]?.legId : null;
      for (const b of segsOk.filter((s) => s.type === 'leg' && s.round === rb.id)) {
        const a = segsOk.find((s) => s.type === 'leg' && s.round === ra.id && s.stitch === b.stitch);
        if (!a || !a.arcs?.length || !b.arcs?.length) continue;
        const ch = new Chain(R, a.arcs, 1);
        let worst = 0, lowest = Infinity, free = null;
        for (const Ab of b.arcs) {
          const isFree = Ab.cls === 'tail' || Ab.cls === 'free';
          if (!(Ab.psi > 0) || (Ab.cls !== 'rail' && !isFree)) continue;
          const fanTail = !braid23 && Ab.cls === 'tail';
          if (isFree && !fanTail && !free) free = { M: Ab.a, len: 0, prof: /** @type {number[]} */ ([]), exitKind: b.exitKind || null, kind: Ab.cls };
          if (isFree && free) free.len += R * Math.sin(Ab.rho) * Ab.psi;
          for (let j = 0; j <= 8; j++) {
            const q = arcPoint(Ab, (Ab.psi * j) / 8);
            if (fS(R, VF, q) < sTop + lBraid23) continue;
            const c = ch.closest(q);
            if (c.clamped) continue;
            if (fanTail) { tailFanMax = Math.max(tailFanMax, c.distMm); continue; }
            pts++;
            if (isFree) { free.prof.push(c.distMm); lowest = Math.min(lowest, c.distMm); }
            else { worst = Math.max(worst, c.distMm); lowest = Math.min(lowest, c.distMm); }
          }
        }
        pairs++;
        if (free && free.prof.length) {
          // construction check for free tails (Fable 54b §3, no code change): exitKind, M → hole, hole δ to the rail (d_E − w),
          // clearance profile from M to the hole — must grow monotonically from w (a minimum below w = a false tangency root)
          const hole = b.to, dE = ch.closest(hole);
          const prof = free.prof, mono = prof.every((x, i) => i === 0 || x >= prof[i - 1] - 1e-3 * w);
          drifts.push({ kind: free.kind, leg: b.id, round: rb.id, row: rb.row, i: b.stitch, driftMaxMm: Math.max(...free.prof) - w, minMm: Math.min(...free.prof), tailMm: free.len,
            exitKind: free.exitKind, mHoleMm: R * angle(unit(free.M), unit(hole)), holeDeltaMm: dE.clamped ? null : dE.distMm - w, monotonic: mono });
        }
        if (worst > dMax) { dMax = worst; dMaxAt = `${b.id}/${rb.id}.i${b.stitch} vs ${a.id}`; }
        if (lowest < limLo - 1e-12) {
          const isDiag = b.stitch === N || (ra.row === 1 && b.stitch === 1) || b.id === lastClosingLeg;
          (isDiag ? diag : bad).push(`${b.id}/${rb.id}.i${b.stitch} vs ${a.id} min ${f(lowest / w, 3)} w`);
        }
        if (worst > lim + 1e-12) {
          const isDiag = b.stitch === N || (ra.row === 1 && b.stitch === 1) || b.id === lastClosingLeg;
          (isDiag ? diag : bad).push(`${b.id}/${rb.id}.i${b.stitch} vs ${a.id} ${f(worst / w, 3)} w`);
        }
      }
    }
    // drift printed for both free classes; the construction check (exit, M → hole, δ, monotonic profile) for top-leg tails
    const dr = drifts.filter((x) => x.driftMaxMm > EPS_C * w).sort((p, q) => q.driftMaxMm - p.driftMaxMm);
    const drT = dr.filter((x) => x.kind === 'tail'), drF = dr.filter((x) => x.kind !== 'tail');
    const nonMono = drifts.filter((x) => x.kind === 'tail' && !x.monotonic);
    add({ id: 'V23', name: 'Shoulder coverage within the set', crit: '#54 Fable §6, 54b §3: rail part of leg n+1 at |d − w| ≤ εc·w from the leg n it lies on, free parts (tail, free) only d ≥ w(1 − εc) with the drift printed; same set; braid zone, last row excluded; start-line / last-closing asymmetries diagnostic (§6.11)',
      status: pairs ? (bad.length ? 'fail' : 'pass') : 'n/a',
      value: pairs ? `pairs ${pairs}, packed points ${pts}; max axis distance ${f(dMax / w, 3)} w (${dMaxAt}), limit ${f(1 + EPS_C, 2)} w${!braid23 && tailFanMax > 0 ? `; fan: tails not checked (diagnostic, max ${f(tailFanMax / w, 3)} w)` : ''}; ${braid23 ? 'braid' : 'top'} zone s < s_T(n+1) + ${f(lBraid23 / w, 0)}·w excluded`
        + (drT.length ? `; tails drifting d − w > εc·w ${drT.length} (max ${f(drT[0].driftMaxMm / w, 3)} w, ${drT[0].leg}/${drT[0].round}.i${drT[0].i} row ${drT[0].row}, tail ${f(drT[0].tailMm, 1)} mm; U «thread pressed by the crafter», §7 No. 17); construction: ${drT.slice(0, 4).map((x) => `${x.leg}/${x.round} ${x.exitKind || '—'}, M→hole ${f(x.mHoleMm, 2)} mm, hole δ ${x.holeDeltaMm == null ? '—' : f(x.holeDeltaMm / w, 3) + ' w'}, profile min ${f(x.minMm / w, 3)} w ${x.monotonic ? 'monotonic' : 'NOT monotonic'}`).join('; ')}; non-monotonic tail profiles ${nonMono.length}` : '')
        + (drF.length ? `; free legs drifting d − w > εc·w ${drF.length} (max ${f(drF[0].driftMaxMm / w, 3)} w, ${drF[0].leg}/${drF[0].round}.i${drF[0].i} row ${drF[0].row}, free ${f(drF[0].tailMm, 1)} mm)` : '')
        + (bad.length ? `; fail ${bad.length}: ${bad.slice(0, 6).join('; ')}` : '') + (diag.length ? `; diagnostic (§6.11) ${diag.length}: ${diag.slice(0, 6).join('; ')}` : '')
        : 'needs rows n and n+1 of one set',
      numbers: { pairs, pts, dMaxW: dMax / w, bad, diag, drifts, nonMono: nonMono.length } });
  }
  // V24 — fan a priori overrun onto the neighbouring marking (#54; spec v3.3 §5.3, 3.3.1). β_T = the angle of the analytic
  // row-1 leg to the meridian at its top hole X₁ (arc (1) / great circle, grid-free); ρ_top = tan β_T / k_top — printed, no
  // status. Configuration fail of fan (checked from row 1 only, before the rows it predicts): the fan edge of row n lies on
  // the row-1 leg's trace, H_n = h₁ + Σ lateral drifts of the analytic row-1 leg over w along the half-line = its exact
  // lateral offset y at s_T(n) = s_T(1) + (n−1)·w; the hole at ±H_n must keep (m+w)/2 from every foreign marking line (V5 in
  // advance) for every planned row n. Braid: printed only.
  {
    const kTop = Number.isFinite(Number(A.params?.kTop)) && A.params?.kTop !== '' ? Number(A.params.kTop) : 0.5;
    const fan = A.params?.topRule !== 'braid';
    const need = (m + w) / 2;
    const az = A.layout.program.az;
    const ellOf = (k) => (A.layout.region.sMaxK ? A.layout.region.sMaxK[k] : A.layout.region.sMax);
    const Cc = unit(fPoint(R, VF, 0, 0));
    const rowsOf = {};
    for (const r of path.rounds) rowsOf[r.set] = Math.max(rowsOf[r.set] || 0, r.row);
    const beta = {}, over = {}, worst = {}, last = {};
    const r1Tops = stOk.filter((st) => st.row === 1 && st.level === 'top' && !st.closing);
    for (const st of r1Tops) {
      const k = st.line, t0 = unit(sub(unit(fPoint(R, VF, 1e-3 * R, az[k])), Cc)), nL = unit(cross(Cc, t0));
      const g = halfLineGraph(A.marking.graph, R, VF, az[k], ellOf(k));
      const rd = path.rounds.find((q) => q.id === st.round);
      const nx = rd ? rd.stitchIdx.map((i) => path.stitches[i]).find((q) => q.i === st.i + 1) : null;
      for (const [role, id] of [['in', st.legId], ['out', nx?.legId]]) {
        const leg = id ? segById.get(id) : null;
        const arcs = leg?.arcs?.filter((q) => q.psi > 0);
        if (!arcs?.length) continue;
        // β_T at the hole: tangent of the analytic leg against the meridian (outward) there
        const Aend = role === 'out' ? arcs[0] : arcs.at(-1), H0 = role === 'out' ? Aend.a : arcEnd(Aend);
        const T = arcTangent(Aend, H0).map((x) => (role === 'out' ? x : -x));
        const bt = Math.acos(clamp(dot(T, fToward(VF, H0).map((x) => -x))));
        if (role === 'out' || !beta[st.set]) if (!beta[st.set] || bt > beta[st.set].beta || role === 'out' && beta[st.set].role !== 'out') beta[st.set] = { beta: bt, leg: leg.id, role };
        // exact lateral offset y(s') of the analytic leg along the half-line (s' = along the line, y ⟂ it)
        const smp = [];
        for (const Ar of arcs) for (let j = 0; j <= 400; j++) { const u = arcPoint(Ar, (Ar.psi * j) / 400); smp.push([R * Math.atan2(dot(u, t0), dot(u, Cc)), R * Math.asin(clamp(dot(u, nL)))]); }
        smp.sort((p, q) => p[0] - q[0]);
        const yAt = (sq) => { for (let j = 1; j < smp.length; j++) if (smp[j][0] >= sq) { const [s0, y0] = smp[j - 1], [s1, y1] = smp[j]; return s1 > s0 ? y0 + (y1 - y0) * (sq - s0) / (s1 - s0) : y1; } return smp.at(-1)[1]; };
        const nRows = rowsOf[st.set] || 1;
        for (let n = 1; n <= nRows; n++) {
          const sT = st.s + (n - 1) * w, y = yAt(sT);
          const P = offsetOnLine(R, halfLineAt(VF.c, VF.z0, az[k]), sT, y);
          // the same clearance as V5 / K12 (Fable 54b §1): c(φ) from every foreign line, the least margin binds
          const dd = holeClearances(A.marking.graph, R, P, g, m, w).reduce((acc, x) => (x.d - x.need < acc.d - acc.need ? x : acc), { d: Infinity, need: 0, id: '—' });
          const rec = { set: st.set, st: `${st.round}.i${st.i}/L${k}`, role, n, nRows, H: Math.abs(y), clear: dd.d, need: dd.need, line: dd.id };
          if (!worst[st.set] || rec.clear - rec.need < worst[st.set].clear - worst[st.set].need) worst[st.set] = rec;
          if (n === nRows && (!last[st.set] || rec.H > last[st.set].H)) last[st.set] = rec;
          if (dd.d < dd.need - 1e-9) { if (!over[st.set] || n < over[st.set].n) over[st.set] = rec; break; }
        }
      }
    }
    const sets = Object.keys(beta).sort();
    const overs = Object.values(over);
    const status = !sets.length ? 'n/a' : fan && overs.length ? 'fail' : 'pass';
    const rhoOf = (k) => (beta[k].beta >= Math.PI / 2 ? Infinity : Math.tan(beta[k].beta) / kTop);   // β_T ≥ 90°: the leg leaves backwards
    add({ id: 'V24', name: 'Fan a priori overrun onto the neighbouring marking; β_T, ρ_top', crit: '#54, spec v3.3 §5.3 (3.3.1): fan fails before laying if the row-1 leg trace H_n = h₁ + Σ drifts puts a hole of a planned row within c(φ) = m/2 + (w/2)·cos φ of a foreign marking line (V5 in advance, Fable 54b §1); β_T at the hole, ρ_top = tan β_T / k_top printed without status; braid: printed',
      status,
      value: !sets.length ? 'needs a row-1 top stitch'
        : `${fan ? 'fan' : 'braid (printed only)'}; ${sets.map((k) => { const o = over[k], q = worst[k]; return `set ${k}: β_T ${f(beta[k].beta * 180 / Math.PI, 1)}° (${beta[k].leg} at ${beta[k].role === 'out' ? 'X₁' : 'E₁'}), ρ_top ${Number.isFinite(rhoOf(k)) ? f(rhoOf(k), 2) : '∞ (β_T ≥ 90°)'} (k_top ${f(kTop, 2)}); `
          + (o ? `overrun at row ${o.n} of ${o.nRows}: ${o.st} ${o.role}-leg H ${f(o.H, 3)} mm, clearance ${f(o.clear, 3)} < c(φ) ${f(o.need, 3)} mm to ${o.line}`
            : `no overrun in ${q?.nRows ?? '—'} rows (H_N ${f(last[k]?.H ?? NaN, 3)} mm, clearance ${f(last[k]?.clear ?? NaN, 3)} mm at row N; least margin: clearance ${f(q?.clear ?? NaN, 3)} mm vs c(φ) ${f(q?.need ?? NaN, 3)} mm at row ${q?.n ?? '—'}, ${q?.st ?? ''} → ${q?.line ?? '—'})`); }).join('; ')}`
          + (fan && overs.length ? '; configuration fail — fan runs onto a neighbouring marking line, use topRule braid' : ''),
      numbers: { kTop, need, sets: Object.fromEntries(sets.map((k) => [k, { betaDeg: beta[k].beta * 180 / Math.PI, rho: rhoOf(k), leg: beta[k].leg, overrun: over[k] || null, worst: worst[k] || null, last: last[k] || null }])) } });
  }
  // #5 V25–V27, K18, K19 (model/lift-spec.md §3.5) — the lift mechanics over the path; liftMode display → n/a.
  {
    const MX = A.mechanics;
    const naTxt = 'liftMode display: the former tent, display only; lengths are the lower bound';
    const ids5 = new Set(segs.filter((s) => s.type === 'leg').map((s) => s.id));
    if (!MX || MX.displayOnly) {
      for (const [id, name] of [['V25', 'Tent is physical (lift mechanics)'], ['V26', 'Lengths with lift'], ['V27', 'Axis distance at a crossing = t_c'], ['K18', 'Stack rise ≤ physical ceiling'], ['K19', 'Low-angle crossings and tall stacks (diagnostic)']])
        add({ id, name, crit: '#5 lift-spec v1 §3.5', status: 'n/a', value: naTxt });
    } else {
      const C5 = MX.consts, R5 = C5.R, s05 = C5.s0, lam5 = C5.lamT;
      const reach5 = (ap) => ap.lp + ap.x0s + 12 * lam5;
      const isolated5 = (leg, s) => { const inE = new Set(leg.edges.flat()); return leg.apices.filter((ap, i) => !inE.has(i) && ap.x - reach5(ap) > 0 && ap.x + reach5(ap) < s.length
        && leg.apices.every((b, j) => j === i || Math.abs(b.x - ap.x) > reach5(ap) + reach5(b))); };
      const cx5 = MX.crossings.filter((c) => c.delta > 0 && ids5.has(c.over) && ids5.has(c.under));
      // V25
      const bad25 = [];
      let nSym = 0, symMax = 0, nHalf = 0, halfLo = Infinity, halfHi = -Infinity, nCovered = 0, nBr = 0, brMin = Infinity;
      for (const id of ids5) {
        const leg = MX.legs[id]; if (!leg || !leg.apices.length) continue;
        const s = segById.get(id), fn = liftFnFor(MX, id), capMax = Math.max(...leg.apices.map((ap) => ap.D));   // the loaded profile never exceeds its highest apex
        for (let x = 0; x <= s.length; x += 0.1) { const u = fn(x); if (!(u >= -1e-12) || u > capMax + 1e-9) { bad25.push(`${id} lift ${f(u, 3)} at x ${f(x, 1)} outside [0, max Δ_c ${f(capMax, 3)}]`); break; } }
        for (const ap of leg.apices) { const u = fn(ap.x); if (u < ap.D - 1e-9) bad25.push(`${id}/${ap.cid} apex lift ${f(u, 4)} < Δ(m) ${f(ap.D, 4)}`); else if (u > ap.D + 1e-9) nCovered++; }
        for (const [i, j] of leg.edges) { nBr++; const a = leg.apices[i], b = leg.apices[j], mn = bridgeMin(a.x, a.D, b.x, b.D, R5); brMin = Math.min(brMin, mn); if (mn < -1e-12) bad25.push(`${id} bridge ${a.cid}–${b.cid} dips to ${f(mn, 4)}`); }
        // an isolated tent (no bridge, no other apex within 2·reach, fully inside the leg): symmetry and the half-length to 0.05·Δ₁
        for (const ap of isolated5(leg, s)) {
          const reach = ap.lp + ap.x0s + 6 * lam5;
          {
            nSym++;
            for (let d = 0; d <= reach; d += 0.05) symMax = Math.max(symMax, Math.abs(fn(ap.x + d) - fn(ap.x - d)));
            let d = 0; while (d < reach && fn(ap.x + d) > 0.05 * C5.delta1) d += 0.01;
            const ratio = d / Math.sqrt(2 * R5 * ap.D); nHalf++; halfLo = Math.min(halfLo, ratio); halfHi = Math.max(halfHi, ratio);
            if (ratio < 0.8 || ratio > 1.2) bad25.push(`${id} half-length ${f(d, 2)} mm = ${f(ratio, 3)}·√(2RΔ)`);
          }
        }
      }
      if (symMax > 1e-9) bad25.push(`isolated tent asymmetry ${symMax.toExponential(1)} mm`);
      const nLow = cx5.filter((c) => c.lowPsi).length, mMax5 = Math.max(0, ...cx5.map((c) => c.m)), mOrd5 = Math.max(0, ...cx5.map((c) => c.mOrd));
      const psiMin5 = cx5.length ? Math.min(...cx5.map((c) => c.psiDeg)) : null;
      add({ id: 'V25', name: 'Tent is physical (lift mechanics)', crit: '#5 lift-spec v1.1 §1.6, §1.8, §3.5 (Fable Q5): 0 ≤ loaded lift ≤ the leg\'s highest apex; lift at an apex ≥ Δ_c = z_sup + Δ₁(F_c)·(m > 1 ? κ : 1) (equal unless a bridge passes over it); bridges on or above the sphere; isolated tent symmetric (1e-9) with the half-length to 0.05·Δ₁ in [0.8, 1.2]·√(2RΔ) (class (ii))',
        status: bad25.length ? 'fail' : 'pass',
        value: `mode ${MX.mode}: Δ₁ ${f(C5.delta1, 3)} mm = ${f(C5.delta1 / w, 2)} w (${C5.status.delta1}), a₁ = √(2RΔ₁) ${f(C5.a1, 2)} mm; apices ${cx5.length} (under a bridge ${nCovered}), bridges ${nBr} (lowest ${Number.isFinite(brMin) ? f(brMin, 3) : '—'} mm); `
          + `m_max ${mMax5} (${C5.stackM}; c.stack max ${mOrd5}); ψ_min ${psiMin5 == null ? '—' : f(psiMin5, 1)}°, below ψ* ${f(C5.psiStarDeg, 1)}°: ${nLow} (${cx5.length ? f(100 * nLow / cx5.length, 1) : '0'} %); `
          + `isolated tents ${nSym}: asymmetry ${symMax.toExponential(1)} mm, half-length ${nHalf ? `${f(halfLo, 3)}…${f(halfHi, 3)}` : '—'}·√(2RΔ)`
          + (bad25.length ? `; fail ${bad25.length}: ${bad25.slice(0, 5).join('; ')}` : ''),
        numbers: { apices: cx5.length, bridges: nBr, covered: nCovered, mMax: mMax5, mOrdMax: mOrd5, psiMinDeg: psiMin5, lowPsi: nLow, symMax, halfLo, halfHi, bad: bad25.length } });
      // V26 — lengths: sphere ≤ axis ≤ lifted; an isolated interior tent: numeric ΔL vs the analytic (crest + flights + tails), 3 %
      const bad26 = []; let tot = { sphere: 0, axis: 0, lifted: 0 }, nIso = 0, isoDev = 0;
      for (const id of ids5) {
        const L = MX.lengths.perSeg[id]; if (!L) continue;
        if (!(L.sphere <= L.axis + 1e-12 && L.axis <= L.lifted + 1e-12)) bad26.push(`${id} sphere ${f(L.sphere, 3)} / axis ${f(L.axis, 3)} / lifted ${f(L.lifted, 3)}`);
        for (const k of ['sphere', 'axis', 'lifted']) tot[k] += L[k];
        const leg = MX.legs[id], s = segById.get(id);
        if (leg) for (const ap of isolated5(leg, s)) {
          const fn = liftFnFor(MX, id), num = extraLength(fn, ap.x - reach5(ap), ap.x + reach5(ap), R5, 0.01);
          const an = extraLengthApex(ap, R5, s05, lam5), dev = Math.abs(num / an - 1); nIso++; isoDev = Math.max(isoDev, dev);
          if (dev > 0.005) bad26.push(`${id}/${ap.cid} ΔL ${f(num, 5)} vs analytic ${f(an, 5)} (${f(100 * dev, 2)} %)`);
        }
      }
      const nCx = cx5.length;
      add({ id: 'V26', name: 'Lengths with lift', crit: '#5 lift-spec v1.1 §3.3, §3.5: sphere ≤ axis ≤ lifted per segment; an isolated tent ΔL numeric (step 0.01) vs the full analytic (crest + flights + landing tails) within 0.5 % (class (i)); bridges numeric; the lengths table integrates at 0.1 mm (class (ii), 3 %)',
        status: bad26.length ? 'fail' : 'pass',
        value: `legs in stage: sphere ${f(tot.sphere, 1)} mm (lower bound, V3), axis (R + h/2) ${f(tot.axis, 1)}, lifted ${f(tot.lifted, 1)} mm (+${f(tot.lifted - tot.axis, 2)} mm = ${f(100 * (tot.lifted - tot.axis) / tot.axis, 3)} % over the axis; ${nCx} apices × ΔL₁ ${f(extraLength1(C5.delta1, C5.sigma), 4)} = ${f(nCx * extraLength1(C5.delta1, C5.sigma), 1)} mm without bridges); isolated interior tents ${nIso}, max deviation from analytic ${f(100 * isoDev, 2)} %`
          + (bad26.length ? `; fail ${bad26.length}: ${bad26.slice(0, 5).join('; ')}` : ''),
        numbers: { ...tot, nIso, isoDev, nApex: nCx } });
      // V27 — axis distance at a crossing on the LOADED profiles (Fable Q5 §3 (c)): z_U(apex) − (z_L,loaded + dent_L) = gap₂₇ ± 0.1·w,
      // gap₂₇ = t_c(F_c) on the sphere (lower drops by d_low) and t_c(F_c) − δ(F_c) off it (bridge / flight / own crest: the lower
      // drops by its compression, the sag is in its loaded profile). An upper leg bridged over its own apex floats above the lower
      // (no contact): a positive gap is printed, not a fail. Self-check: Δ_c − z_sup − Δ₁(F_c)·(m > 1 ? κ : 1) = 0 (class (i)).
      const dd27 = []; let selfMax = 0, nCov = 0, covMax = 0, nPressed = 0, pressedMax = 0;
      for (const c of cx5) {
        const up = liftFnFor(MX, c.over)(c.xApex), low = liftFnFor(MX, c.under)(c.xUnder) + dentFnFor(MX, c.under)(c.xUnder);
        const tgt = c.gap27 ?? C5.tc, d = up - low - tgt, covered = up > c.delta + 1e-9;
        // the lower leg pressed down at y by a LATER load (lay order: the upper is not re-seated) — a gap, printed
        const pressed = c.zSup != null && c.support !== 'ground' && liftFnFor(MX, c.under)(c.xUnder) < c.zSup - 1e-6;
        if (pressed && d > 0.1 * w) { nPressed++; pressedMax = Math.max(pressedMax, d); }
        if (c.zSup != null && c.d1F != null) selfMax = Math.max(selfMax, Math.abs(c.delta - c.zSup - c.d1F * (c.m > 1 && c.support !== 'ground' ? C5.kappa : 1)));
        if (covered && d > 0.1 * w) { nCov++; covMax = Math.max(covMax, d); }
        dd27.push({ c, d, up, low, covered: covered || pressed });
      }
      const nExc27 = dd27.filter((x) => x.c.orderExc).length;   // the lower leg laid later (hidden / top-hole order): its final profile is not the support read
      const out27 = dd27.filter((x) => !x.c.orderExc && (x.d < -0.1 * w - 1e-12 || (x.d > 0.1 * w + 1e-12 && !x.covered)));
      const mx27 = out27.reduce((q, x) => (Math.abs(x.d) > Math.abs(q?.d ?? 0) ? x : q), null);
      const byKind27 = {}; for (const x of out27) byKind27[x.c.support ?? '—'] = (byKind27[x.c.support ?? '—'] || 0) + 1;
      add({ id: 'V27', name: 'Axis distance at a crossing = t_c', crit: '#5 lift-spec v1.1 §3.5 (Fable Q5): on the loaded profiles |z_U − z_L,loaded| = t_c(F_c) ± 0.1·w (class (iii), twist scatter §1.9); z_L,loaded − d_low on the sphere, − compression off it (target t_c − δ(F_c), printed); upper bridged over its own apex — a gap, no contact, printed; self-check of the height rule 1e-9',
        status: out27.length || selfMax > 1e-9 ? 'fail' : 'pass',
        value: `apices ${dd27.length}, outside ±0.1 w: ${out27.length}${out27.length ? ` (${Object.entries(byKind27).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}${mx27 ? `; largest |Δ| ${f(Math.abs(mx27.d) / w, 3)} w at ${mx27.c.id} (${mx27.c.over} over ${mx27.c.under}, ${mx27.c.support}, m ${mx27.c.m}: upper ${f(mx27.up, 3)}, lower ${f(mx27.low, 3)} mm)` : ''}; `
          + `lower laid later (not checked) ${nExc27}; bridged over (upper floats, no contact) ${nCov}${nCov ? `, gap up to ${f(covMax / w, 2)} w` : ''}; lower pressed down later (upper not re-seated) ${nPressed}${nPressed ? `, gap up to ${f(pressedMax / w, 2)} w` : ''}; self-check ${selfMax.toExponential(1)} mm`,
        numbers: { n: dd27.length, out: out27.length, byKind: byKind27, covered: nCov, pressed: nPressed, orderExc: nExc27, covMaxW: covMax / w, selfMax, maxAbsW: mx27 ? Math.abs(mx27.d) / w : 0 } });
      // K18 — one level over the actual support (Fable Q5 §3 (b)): Δ_c − z_sup ≤ 1.5·t_c(F_c) − h/2 (class (i) by construction)
      const bad18 = cx5.filter((c) => c.zSup != null && c.delta - c.zSup > c.capRel + 1e-9);
      const rel18 = cx5.reduce((q, c) => (c.zSup != null ? Math.max(q, (c.delta - c.zSup) / c.capRel) : q), 0);
      add({ id: 'K18', name: 'Rise over the support ≤ one-level ceiling', crit: '#5 lift-spec v1.1 §3.5 (Fable Q5): Δ_c − z_sup ≤ 1.5·t_c(F_c) − h/2 (the crown of one level over the actual support: sphere, own crest, loaded bridge or flight); the absolute height is K19',
        status: bad18.length ? 'fail' : 'pass',
        value: `κ ${f(C5.kappa, 2)}; max (Δ_c − z_sup)/ceiling ${f(rel18, 3)}${bad18.length ? `; fail ${bad18.length}: ${bad18.slice(0, 4).map((c) => `${c.id} m ${c.m}`).join(', ')}` : ''}`,
        numbers: { mMax: mMax5, bad: bad18.length, rel: rel18 } });
      // K19 — the absolute height (Fable Q5 §3 (b), (d)): max Δ_c and m_eff = Δ_max/Δ₁ printed with its place; warn > 1.2 mm;
      // ψ < ψ* and m ≥ 4 printed
      const n4 = cx5.filter((c) => c.m >= 4).length;
      const top19 = cx5.reduce((q, c) => (c.delta > (q?.delta ?? -1) ? c : q), null);
      const D19 = cx5.map((c) => c.delta).sort((p, q) => p - q), p19 = (t) => (D19.length ? D19[Math.min(D19.length - 1, Math.floor(t * D19.length))] : 0);
      const sup19 = C5.supportCounts ? Object.entries(C5.supportCounts).map(([k, v]) => `${k} ${v}`).join(', ') : '—';
      add({ id: 'K19', name: 'Lift height, low-angle crossings, tall stacks (diagnostic)', crit: '#5 lift-spec v1.1 §1.5, §1.9, §3.5 (Fable Q5): max Δ_c and m_eff = Δ_max/Δ₁ with its place (S8 expectation ≤ 0.8 mm; warn > 1.2 mm — two staircase generations over it, an order, not a golden number); ψ < ψ* (apex position ±w/tan ψ) and m ≥ 4 printed',
        status: top19 && top19.delta > 1.2 ? 'warn' : 'info',
        value: `Δ_c median ${f(p19(0.5), 3)}, p95 ${f(p19(0.95), 3)}, max ${top19 ? f(top19.delta, 3) : '—'} mm (m_eff ${top19 ? f(top19.delta / C5.delta1, 2) : '—'}${top19 ? ` at ${top19.id}: ${top19.over} over ${top19.under}, support ${top19.support}` : ''}); supports: ${sup19}; `
          + `ψ* ${f(C5.psiStarDeg, 1)}°: ${nLow} of ${nCx} apices below (${nCx ? f(100 * nLow / nCx, 1) : '0'} %); m ≥ 4: ${n4}; patch m max ${mMax5}, c.stack max ${mOrd5}`,
        numbers: { lowPsi: nLow, n: nCx, m4: n4, dMax: top19 ? top19.delta : 0, median: p19(0.5), p95: p19(0.95), at: top19 ? top19.id : null } });
    }
  }


return out;
}

export function summary(vals) {
  const c = { pass: 0, fail: 0, warn: 0, info: 0, 'n/a': 0 };
  for (const v of vals) c[v.status]++;
  return c;
}
