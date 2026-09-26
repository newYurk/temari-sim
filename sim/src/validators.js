// @ts-check
// Validators — pure functions over the pipeline result (or its prefix up to operation k).
// Each: id, name (English canonical; UI translates via i18n), criterion from criteria.md / basis,
// status pass|fail|warn|info|n/a, numbers. Work may span several rounds and threads (A1, B1, A2 …).
import { dist, norm, toSPhi, dot, unit, sub, mul, ePole, eEast, haversineLen, point, cross, segSegDist, angle, add as vadd, clamp } from './geom.js';
import { prefix } from './layers.js';
import { displayGeometry, DISPLAY_STACK_LIFT_W } from './display.js';
import { tubeMesh } from './tube.js';

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
  const P = unit(at), a = unit(from), b = unit(to);
  const N = cross(a, b);
  const nLen = Math.hypot(N[0], N[1], N[2]);
  if (!(nLen > 1e-15)) return 0;
  const Nu = [N[0] / nLen, N[1] / nLen, N[2] / nLen];
  let T = cross(Nu, P);
  const tLen = Math.hypot(T[0], T[1], T[2]);
  if (!(tLen > 1e-15)) return 0;
  T = [T[0] / tLen, T[1] / tLen, T[2] / tLen];
  const th = Math.acos(clamp(P[2]));
  const phi = Math.atan2(P[1], P[0]);
  const eS = [Math.cos(th) * Math.cos(phi), Math.cos(th) * Math.sin(phi), -Math.sin(th)];
  const eP = [-Math.sin(phi), Math.cos(phi), 0];
  return Math.atan2(Math.abs(dot(T, eP)), Math.abs(dot(T, eS)));
}

/** Polar tip level s = R·acos(z) (same as independent K16b audit). */
export function tipLevelMm(p, R) {
  return R * Math.acos(clamp(unit(p)[2]));
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
function minDist(A, B) {
  let best = { d: Infinity };
  for (let i = 1; i < A.length; i++) for (let j = 1; j < B.length; j++) {
    const r = segSegDist(A[i - 1], A[i], B[j - 1], B[j]);
    if (r.d < best.d) best = { ...r, i, j };
  }
  return best;
}
function ptPolyDist(p, B) {
  let d = Infinity;
  for (let j = 1; j < B.length; j++) d = Math.min(d, segSegDist(p, p, B[j - 1], B[j]).d);
  return d;
}
const rotZ = (a) => (p) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];

/** stage: klyuch recipe.stages ('2a' | '2b' | 'B1' | 'A2') ili chislo (indeks operatsii). ref — calc_reference.json (ili null). */
export function runValidators(A, stage = '2b', ref = null) {
  const path = A.path;
  const kEnd = typeof stage === 'number' ? stage : path.stageEnd[stage];
  const { ops, segs, ids } = prefix(path, kEnd);
  const R = A.base.R, w = A.params.w_mm, m = A.params.m_mm, N = A.marking.N;
  const out = [];
  const add = (v) => out.push(v);
  const segById = new Map(path.segs.map((s) => [s.id, s]));
  const stitchesDone = path.stitches.filter((st) => ids.has(st.pickupId));
  const roundsIn = path.rounds.filter((r) => ops.some((o) => o.round === r.id));
  const roundDone = (r) => kEnd >= r.opLast;
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
        const a = toSPhi(R, s.from), b = toSPhi(R, s.to);
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
      let dXY = dist(A1.start.X0, e.X0);
      for (const st of a1St) { const r = e.stitches[st.i - 1]; dXY = Math.max(dXY, dist(st.E, r.E), dist(st.X, r.X)); }
      const rowSegs = a1Segs.filter((s) => s.type !== 'hidden-start');
      const rowLen = rowSegs.reduce((a, s) => a + s.length, 0);
      const full = kEnd >= A1.opLast;
      let refLen = 0;
      if (full) refLen = e.row1_total;
      else for (const s of rowSegs) refLen += s.type === 'leg' ? e.arms[s.stitch - 1] : e.bites[s.stitch - 1];
      const hid = a1Segs.filter((s) => s.type === 'hidden-start').reduce((a, s) => a + s.length, 0);
      const ok = Math.abs(rowLen - refLen) < TOL_REF && dXY < TOL_REF && Math.abs(hid - e.hidden_start) < TOL_REF;
      add({ id: 'V3', name: 'A1 agrees with calc.py', crit: 'cross-check of two implementations of one geometry',
        status: ok ? 'pass' : 'fail',
        value: `${full ? 'row 1 (legs + pickups)' : 'row-1 prefix'}: sim ${f(rowLen, 4)} mm, calc.py ${f(refLen, 4)} mm (Δ ${f(Math.abs(rowLen - refLen), 9)}); E/X Δmax ${f(dXY, 9)} mm; skrytyy start ${f(hid)} vs ${f(e.hidden_start)} mm`,
        numbers: { rowLen, refLen, dXY, hid, refHidden: e.hidden_start, refRow1: e.row1_total } });
    }
  }
  // V4 — catch ⟂ linii, protiv khoda, under potopnostyu
  {
    let maxDev = 0, wrongSide = 0, notUnder = 0;
    for (const st of stitchesDone) {
      const C = point(R, st.s, A.marking.phis[st.line]);
      const chord = unit(sub(st.X, st.E));
      maxDev = Math.max(maxDev, Math.abs(90 - Math.acos(Math.min(1, Math.abs(dot(chord, ePole(C))))) * 180 / Math.PI));
      if (!(dot(st.E, eEast(C)) > 0 && dot(st.X, eEast(C)) < 0)) wrongSide++;
      if (norm(st.E.map((v, i) => (v + st.X[i]) / 2)) >= R) notUnder++;
    }
    const ok = maxDev < TOL_PERP_DEG && wrongSide === 0 && notUnder === 0;
    add({ id: 'V4', name: 'Catch ⟂ to line, against grain, under surface', crit: 'OLY-BASIC «垂直に», «逆方向»; TK-LITTLE «right angle»',
      status: stitchesDone.length ? (ok ? 'pass' : 'fail') : 'n/a',
      value: `stitches ${stitchesDone.length}; max deviation from 90° ${f(maxDev, 9)}°; E-right/X-left violations ${wrongSide}; channel-inside-ball violations ${notUnder}` });
  }
  // V5 — stezhki na svoikh liniyakh i urovnyakh (K1–K3), catch ne tostaet sosedney linii
  {
    let wrongLine = 0, reach = 0;
    const spreads = [];
    for (const r of roundsIn) {
      const sts = stitchesDone.filter((st) => st.round === r.id);
      const sb = [], stp = [];
      for (const st of sts) {
        const expLine = (r.startLine + st.i) % N, expLevel = st.i % 2 === 1 ? 'bottom' : 'top';
        if (st.line !== expLine || st.level !== expLevel) wrongLine++;
        (st.level === 'bottom' ? sb : stp).push(st.s);
        const spacing = R * Math.sin(st.s / R) * 2 * Math.PI / N;
        if (Math.max(st.eOff, -st.xOff) + w / 2 >= spacing - m / 2) reach++;
      }
      const spread = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
      spreads.push({ r: r.id, b: spread(sb), t: spread(stp) });
    }
    const sprB = w * (1 / 0.714), sprT = w * (0.5 / 0.714); // 6a.11(3) was 1/0.5 mm at w0
    const ok = wrongLine === 0 && reach === 0 && spreads.every((x) => x.b <= sprB && x.t <= sprT);
    const worstB = spreads.reduce((a, x) => (x.b > a.b ? x : a), /** @type {any} */ ({ b: 0 }));
    add({ id: 'V5', name: 'Stitches on their lines and levels', crit: 'K1 (set A: top on even lines; B on odd), K2 (razbros bota ryada ≤ 1 mm [A]), K3 (razbros topa ≤ 0,5 mm [A])',
      status: stitchesDone.length ? (ok ? 'pass' : 'fail') : 'n/a',
      value: `line/level errors ${wrongLine}; s spread by rounds: ${spreads.map((x) => `${x.r} bot ${f(x.b)}, top ${f(x.t)}`).join('; ')} mm; catch reaches neighbour marking: ${reach}` +
        (worstB.b > 1e-9 ? `. Bot spread — “transition step”: tip on the first bottom line of the round is below the others (sm. V6); maks. ${f(worstB.b)} mm v ${worstB.r}` : '') });
  }
  // V6 — simmetriya lepestkov vnutri obkhoda: povorot na 2·(2π/N) perevodit leg i v leg i+2
  {
    const done = roundsIn.filter(roundDone);
    if (!done.length) add({ id: 'V6', name: 'Petal symmetry within a round', crit: 'K1', status: 'n/a', value: 'full round only' });
    else {
      const rot = rotZ(2 * (2 * Math.PI / N));
      const parts = [];
      let ok = true;
      for (const r of done) {
        const sts = r.stitchIdx.map((i) => path.stitches[i]);
        let dLeg = 0, dPk = 0, nCmp = 0, worstPair = '';
        for (let i = 0; i < N; i++) {
          const j = (i + 2) % N;
          const special = (q) => (r.begin === 'resume' && q === 0);   // first leg of a resumed thread starts from park Xki
          if (special(i) || special(j)) continue;
          const a = segById.get(sts[i].legId).pts.map(rot), b = segById.get(sts[j].legId).pts;
          let dd = 0;
          for (let q = 0; q < a.length; q++) dd = Math.max(dd, dist(a[q], b[q]));
          if (dd > dLeg + 1e-12) worstPair = `leg ${i + 1} → ${j + 1}`;
          dLeg = Math.max(dLeg, dd);
          if (!sts[i].closing && !sts[j].closing) dPk = Math.max(dPk, dist(rot(sts[i].E), sts[j].E), dist(rot(sts[i].X), sts[j].X));
          nCmp++;
        }
        const reg = sts.find((st) => st.level === 'top' && !st.closing), cl = sts.find((st) => st.closing);
        const extra = reg.xOff - cl.xOff;
        const tolLeg = Math.max(TOL_SYM, 5e-4); // rail/bow petal resampling
        if (!(dLeg < tolLeg && dPk < tolLeg && extra > 0)) ok = false;
        parts.push(`${r.id}: legs ${dLeg < TOL_SYM ? f(dLeg, 12) : `${f(dLeg, 3)} (worst ${worstPair})`} mm (${nCmp} pairs${r.begin === 'resume' ? ', excl. first leg from park' : ''}), E/X ${f(dPk, dPk < TOL_SYM ? 12 : 3)} mm; closing catch wider by ${f(extra, 4)} mm (covers round start)`);
      }
      add({ id: 'V6', name: 'Petal symmetry within a round', crit: 'K1; TK-KIKU', status: ok ? 'pass' : 'fail',
        value: parts.join('; ') + (ok ? '' : '. Asymmetry — transition step: first resumed leg starts at park (prev-row top, w higher/narrower); row n+1 tip on L(start+1) packs flush and drops; TK-UWA fixes with deferred last stitch (variant, not modelled)') });
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
        const sp = toSPhi(R, cpOrS);
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
    const found = [], bad = [];
    const nextOf = (h) => path.segs.find((x) => x.thread === h.thread && Math.abs(x.u0 - h.u1) < 1e-12);
    const classify = (P, Q, md) => {
      const k = pairKey(P.id, Q.id);
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
      if (squeezeOk(P, Q, md)) { warnList.push(`${P.id}×${Q.id} s=${f(toSPhi(R, md.cp).s, 1)} d=${f(md.d, 3)} (tight spot, V19)`); return 'WARN: tight spot at pierce — threads must compress (V19)'; }
      const later = order.get(P.id) > order.get(Q.id) ? P : Q, earlier = later === P ? Q : P;
      const types = [P.type, Q.type].sort().join('+');
      if (types === 'leg+pickup') {
        const K = P.type === 'pickup' ? P : Q, L = P.type === 'leg' ? P : Q;
        if (later === L) return 'leg over hidden stitch (later on top; channel under marking)';
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
      if (types === 'hidden-start+pickup') { warnList.push(`${P.id}×${Q.id} s=${f(toSPhi(R, md.cp).s, 1)} d=${f(md.d, 3)}`); return 'WARN: needle channel near hidden start (in wrap)'; }
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
        // Rail parallel of prev row at ~w (includes same-line mid-leg flush — NOT tipCross).
        if (P.set === Q.set && Math.abs(P.row - Q.row) === 1 && md.d >= w * 0.5) {
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
      const sp = toSPhi(R, md.cp);
      (why ? found : bad).push({ a: segs[i].id, b: segs[j].id, d: md.d, s: sp.s, at: md.cp, why: why || 'UNEXPECTED' });
    }
    // Seed tipCross from path.crossings at c.at (global minDist often sits mid-leg, missing the tip diamond).
    for (const hit of tipCrossHits) {
      if (!found.some((r) => r.a === hit.a && r.b === hit.b && /tipCross/.test(r.why))) found.push(hit);
    }
    const cnt = {};
    for (const r of found) cnt[r.why] = (cnt[r.why] || 0) + 1;
    const wedges = path.crossings.filter((c) => c.kind === 'wedge' && ids.has(c.a) && ids.has(c.b));
    const wedgeTxt = wedges.length ? `; wedges: max overlap ${f(Math.max(...wedges.map((c) => w - c.dmin)), 3)} mm over length up to ${f(Math.max(...wedges.map((c) => c.lenMm)), 1)} mm from tip` : '';
    const notAllowed = path.crossings.filter((c) => !c.allowed && ids.has(c.a) && ids.has(c.b));
    // 6a.13 / Codex block-B: tip contacts must be CLASSIFIED (tipCross / through-row / tip-zone),
    // not excluded from unexpected. Unclassified remainder = fail.
    // Flush rail-parallel (d∈[0.5w, w]) is a classified expected class (6a.11), not a tip dump.
    const flushOk = (d) => d != null && d >= w * 0.5 && d < w * (1 + 1e-3);
    // Re-classify residual bad / notAllowed that classify() missed but tipCrossAt / tip-zone cover.
    const promote = (a, b, cpOrS, d, atPt = null) => {
      if (flushOk(d)) return 'rail parallel of prev row at distance w (6a.11)';
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
              else if (at) h = Math.abs((bot.s ?? 0) - toSPhi(R, at).s);
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
        const sp = toSPhi(R, at);
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
      status: unexpected || deltaFails || exitFails.length ? 'fail' : warnList.length ? 'warn' : 'pass',
      value: `near-zones < w: ${Object.entries(cnt).map(([k2, v]) => `${k2} — ${v}`).join('; ')}; unexpected ${unexpected}` +
        (badPromoted.length || naPromoted.length ? `; tip-classified ${badPromoted.length + naPromoted.length}` : '') +
        (deltaFails ? `; δ>w/2 fails ${deltaFails}` : '') + exitTxt + wedgeTxt +
        (badRest.length ? ': ' + badRest.slice(0, 6).map((b) => `${b.a}×${b.b} s=${f(b.s, 1)} d=${f(b.d, 3)}`).join('; ') : '') +
        (warnList.length ? `; warnings (hidden wrap threads closer than w; radial compress not modelled): ${warnList.slice(0, 8).join('; ')}${warnList.length > 8 ? '…' : ''}` : ''),
      details: { found, bad, badRest, badPromoted, notAllowed, naRest, naPromoted, warnList, exitFails: exitFails.map((s) => s.id) } });
  }

  // K16 (6a.16 / 6a.17 / 6a.20) — tip coverage; K16b at λ=0 is two-sided Clairaut-window diagnostic
  {
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
        const nz = [-E[0] * E[2], -E[1] * E[2], 1 - E[2] * E[2]]; // toward the pole (+z) in the tangent plane
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
      return st ? (st.s ?? toSPhi(R, unit([(st.E[0] + st.X[0]) / 2, (st.E[1] + st.X[1]) / 2, (st.E[2] + st.X[2]) / 2])).s) : null;
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
    const aFails = [], aRows = [], perSet = {};
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
                const aH = geodesicAlphaAt(L.from, L.to, hole);
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
            const sTipE = tipLevelMm(st.E, R), sTipX = tipLevelMm(st.X, R);
            let promisedE = false, promisedX = false;
            if (outgoing && outgoing.from) {
              const hole = outgoing.from;
              const alphaHole = geodesicAlphaAt(outgoing.from, outgoing.to, hole);
              const tanA = clairautAvgTan(alphaHole, tipLevelMm(hole, R), sTipE, R);
              const winE = k16bCoverageWindow({ m, w, alpha: Math.atan(tanA), deltaSum, xE, tanAlpha: tanA });
              promisedE = winE.coveredE;
            } else {
              // Fallback: shared row angle (should be rare)
              const tanA = clairautAvgTan(alphaK, (later?.s ?? st.s + deltaSum), st.s, R);
              promisedE = k16bCoverageWindow({ m, w, alpha: Math.atan(tanA), deltaSum, xE, tanAlpha: tanA }).coveredE;
            }
            if (incoming && incoming.to) {
              const hole = incoming.to;
              const alphaHole = geodesicAlphaAt(incoming.from, incoming.to, hole);
              const tanA = clairautAvgTan(alphaHole, tipLevelMm(hole, R), sTipX, R);
              // coveredX uses +(m+w)/2 − Δ·tanα (incoming mirror); share call with dummy xE.
              promisedX = k16bCoverageWindow({ m, w, alpha: Math.atan(tanA), deltaSum, xE, tanAlpha: tanA, xX }).coveredX;
            } else {
              const tanA = clairautAvgTan(alphaK, (later?.s ?? st.s + deltaSum), st.s, R);
              promisedX = k16bCoverageWindow({ m, w, alpha: Math.atan(tanA), deltaSum, xE, tanAlpha: tanA, xX }).coveredX;
            }
            const dE = minDistToRow(st.E, set, n + 2);
            const dX = minDistToRow(st.X, set, n + 2);
            const covE = dE <= w / 2 * 1.1, covX = dX <= w / 2 * 1.1;
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
      numbers: { hx, alphaDeg: alpha * 180 / Math.PI, diagH, isGeo0, aFails, aRows, perSet },
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
    const done = roundsIn.filter(roundDone);
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
    add({ id: 'V11', name: 'Layer chain is fresh', crit: 'parametric requirement: base → marking → layout → rowPlan → path',
      status: okChain && Rchk ? 'pass' : 'fail',
      value: `stamps: base ${A.base.stamp} → marking ${A.marking.stamp} → layout ${A.layout.stamp} → rowPlan ${A.rowPlan.stamp} → path ${A.path.stamp}; vse legs na tekushchem R: ${Rchk ? 'da' : 'net'}` });
  }
  // V12 — row plan (design formula) vs derived levels of all rows; equator; set stop
  {
    const rp = A.rowPlan, last = rp.rows[rp.rows.length - 1];
    const tips = [];
    for (const r of roundsIn.filter(roundDone)) {
      const sts = r.stitchIdx.map((i) => path.stitches[i]);
      const b = sts.find((st) => st.level === 'bottom'), t = sts.find((st) => st.level === 'top');
      tips.push({ r: r.id, set: r.set, row: r.row, sTip: b.s, sTop: t.s, plan: rp.rows[r.row - 1] });
    }
    const lim = path.limit ?? rp.limit;
    const beyond = tips.filter((x) => x.sTip > lim + 1e-9);
    const bySet = {};
    for (const x of tips) (bySet[x.set] || (bySet[x.set] = [])).push(x);
    const setTxt = Object.entries(bySet).map(([k2, xs]) => `set ${k2}: rows ${xs.length}, tips ${xs.map((x) => `${x.r} ${f(x.sTip, 2)}`).join(', ')} mm`).join('; ');
    const stopTxt = Object.entries(path.stopped || {}).map(([k2, v]) => `set ${k2} stopped before row ${v.row}: ${v.reason}`).join('; ');
    const planTxt = tips.filter((x) => x.row >= 2 && x.plan).slice(0, 4).map((x) => `${x.r} bot ${f(x.sTip, 2)} (plan ${f(x.plan.sBot, 2)})`).join(', ');
    add({ id: 'V12', name: 'Rows to equator: derived tips vs limit and plan', crit: 'K12; TK-GT14 «Work to the equator»; next-stage §5 (tolshchinu ne umenshat)',
      status: beyond.length ? 'warn' : 'info',
      value: `limit s ≤ ${f(lim, 2)} mm (equator ${f(A.base.Q, 2)}); ${setTxt || 'no complete rounds'}` +
        (beyond.length ? `; BEYOND limit: ${beyond.map((x) => `${x.r} na ${f(x.sTip - lim, 2)} mm`).join(', ')}` : '') +
        (stopTxt ? `; ${stopTxt}` : '') +
        `; plan by w/sin α: ${rp.nRows} rows, last tip ${f(last.sBot, 2)} mm` + (planTxt ? ` (${planTxt}; formula u konchich — priblizhenie)` : ''),
      numbers: { tips, limit: lim, stopped: path.stopped, beyond } });
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
        const foreign = st.sides.cluster.filter((c) => c.seg !== 'marking' && segById.get(c.seg).set !== st.set).map((c) => segById.get(c.seg).round);
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
        value: per.map((x) => `${x.r}: lower by ${f(x.dS, 3)}, wider by ${x.dWmin === x.dWmax ? f(x.dWmean, 3) : `${f(x.dWmin, 3)}…${f(x.dWmax, 3)}`} mm (${f(x.dWmean / w, 2)} w), width ${f(x.W, 3)}${x.ok ? '' : ' ⚠'}${x.foreign.length ? ` [foreign set thread in catch: ${x.foreign.join(',')}]` : ''}`).join('; ') +
          `. Source readings: +w in total = ${f(w, 3)}, +w on each side = ${f(2 * w, 3)} mm. ${inside ? 'All rows within reading band.' : 'Rows marked ⚠ outside band: row 2 — row-1 legs cross the new top perpendicular near the line axis (small); rows ≥ 3 — legs diverge from the tip, needle must go around them outside (large); see A8, U3, U13.'}`,
        numbers: { rows, per } });
    }
  }
  // V14 — visible thread lies on the ball, does not float (model and displayed mesh)
  {
    let legDev = 0, legMax = -Infinity, hidOut = -Infinity, hidDepth = 0;
    for (const s of segs) for (const p of s.pts) {
      const r = norm(p) - R;
      if (s.type === 'leg') { legDev = Math.max(legDev, Math.abs(r)); legMax = Math.max(legMax, r); }
      else { hidOut = Math.max(hidOut, r); if (s.type === 'hidden-start') hidDepth = Math.max(hidDepth, -r); }
    }
    let meshMax = -Infinity, axisMax = -Infinity, hidDispAxisMax = -Infinity, hidDispDepth = 0, liftMax = 0;
    for (const dg of displayGeometry(A, ids, { hidMode: 'surf' })) {
      if (dg.hidden) {
        for (const p of dg.pts) { const r = norm(p) - R; hidDispAxisMax = Math.max(hidDispAxisMax, r); if (dg.seg.type === 'hidden-start') hidDispDepth = Math.max(hidDispDepth, -r); }
        continue;
      }
      liftMax = Math.max(liftMax, dg.liftMax || 0);
      for (const p of dg.pts) axisMax = Math.max(axisMax, norm(p) - R);
      for (const v of tubeMesh(dg.pts, dg.radius).pos) meshMax = Math.max(meshMax, norm(v) - R);
    }
    const ok = legDev < TOL_RAD && hidOut < TOL_RAD && meshMax <= w + liftMax + TOL_MESH && axisMax <= w / 2 + liftMax + TOL_MESH && hidDispAxisMax <= TOL_MESH;
    add({ id: 'V14', name: 'Thread does not float above the ball (model and mesh)', crit: 'K1–K3; D22 (tube Ø w on the surface); schematic lift at crossings — display only',
      status: ok ? 'pass' : 'fail',
      value: `model: legs |r − R| ≤ ${legDev.toExponential(1)} mm; hidden not above surface (max ${hidOut.toExponential(1)}), khorda starta to ${f(hidDepth, 2)} mm vglub. `
        + `Mesh: axis ≤ R + ${f(axisMax, 3)} mm, outer surface ≤ R + ${f(meshMax, 3)} mm (norm w = ${f(w, 3)} + allvnyy podem stopki ≤ ${f(liftMax, 3)} mm = ${DISPLAY_STACK_LIFT_W}·w·uroven). `
        + `Hidden-start scheme: depth ${f(hidDispDepth, 3)} mm`,
      numbers: { legDev, legMax, hidOut, hidDepth, axisMax, meshMax, liftMax, hidDispAxisMax, hidDispDepth } });
  }
  // V15 — row n of set B = row n of set A rotated by 2π/N (B petals on neighboring lines) — for all rows
  {
    const setsIn = [...new Set(path.rounds.map((r) => r.set))];
    const pairs = [];
    for (const rb of roundsIn.filter((r) => r.set === 'B' && roundDone(r))) {
      const ra = path.rounds.find((r) => r.set === 'A' && r.row === rb.row);
      if (ra && ids.has(segById.get(ra.segIds[ra.segIds.length - 1]).id)) pairs.push([ra, rb]);
    }
    if (!pairs.length || setsIn.length < 2) add({ id: 'V15', name: 'Bn = An rotated by 360°/N', crit: 'TK-GT14 «Enter … Color B on a marking line that has a bottom stitch of Color A … same 5mm»; TK-KIKU (2 seta)', status: 'n/a', value: 'needs completed An and Bn' });
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
        const rot = rotZ((rb.startLine - ra.startLine) * 2 * Math.PI / N);
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
        const foreignOf = (st) => [...st.sides.cluster.filter((c) => c.seg !== 'marking' && segById.get(c.seg).set !== st.set).map((c) => `${segById.get(c.seg).round}(${c.kind})`),
          ...(st.sides.squeeze || []).filter((q) => q.seg !== 'marking').map((q) => `${segById.get(q.seg).round}(tight, gap ${f(q.gap, 3)})`)];
        const why = [...new Set([...diffSt, ...sa.filter((_, i) => diffSt.includes(sb[i]))].flatMap(foreignOf))];
        const firstDiff = sb.findIndex((st, i) => st.i && Math.max(dist(rot(sa[i].E), st.E), dist(rot(sa[i].X), st.X)) >= tolSym);
        const upstream = firstDiff < 0 || sb.slice(0, firstDiff + 1).some((st) => foreignOf(st).length) || sa.slice(0, firstDiff + 1).some((st) => foreignOf(st).length);
        if (!same) { if (why.length || upstream) explained++; else unexplained++; }
        parts.push(`${rb.id} vs ${ra.id}: ${same ? 'matches' : `DIFFERS — E/X Δmax ${f(dP, 3)} mm na ${diffSt.length} stezhchkh (${diffSt.map((st) => `L${st.line}`).join(',')}), legs Δmax ${f(dL, 3)} mm, dlina ${f(ra.length)} vs ${f(rb.length)} mm${why.length ? `; prichina — v catche thread drugogo seta: ${why.join(', ')}` : ''}`}`);
      }
      add({ id: 'V15', name: 'Bn = An rotated by 360°/N (per row)', crit: 'TK-GT14 (B on neighboring lines, same distancie ot SP); ravenstvo ozhidaetsya, poch thread drugogo seta ne popadaet v okno igly; otlichie s takoy prichinoy — rezultat zanyatosti (warn), bez prichiny — oshibch (fail)',
        status: unexplained ? 'fail' : explained ? 'warn' : 'pass', value: parts.join('; '), numbers: { pairs: pairNums, tolSym, tolLen } });
    }
  }
  // V16 — needle does not pierce thread (6a.21 at upper holes).
  // Each pierce ≥ w/2 from any already-laid axis (channels projected to the surface).
  // Upper-hole offenders classified by WHOSE thread is under the hole (not by row number):
  //   (1) own cluster (same line + set) → fail (G3/G11 bug)
  //   (2) foreign + capture half-width W_n/2 ≥ d(s_T(n)) → warn U14 (fan), same mechanism as V19
  //   (3) foreign but W_n/2 < d → fail (check that thread's path)
  // s_T(n) = sTop + (n−1)·w; d = lateral distance to nearest other-set leg at that level.
  {
    let minMargin = Infinity, worst = null, nHoles = 0;
    let failOwn = 0, failForeign = 0, warnU14 = 0, badNoRoom = 0;
    const noRoomHoles = stitchesDone.flatMap((st) => (st.sides.squeeze || []).filter((q) => q.noRoom).map((q) => (q.side === 'E' ? st.E : st.X)));
    const order = new Map(path.segs.map((x, i) => [x.id, i]));
    const surf = new Map(segs.filter((x) => x.type === 'pickup').map((x) => [x.id, x.pts.map((q) => { const n0 = norm(q); return q.map((v) => v * R / n0); })]));
    const before = (idxSeg) => segs.filter((x) => (x.type === 'leg' || x.type === 'pickup') && order.get(x.id) < idxSeg);
    const sTop0 = A.layout?.sTop ?? A.params.sTop_mm ?? 5;
    const phis = A.marking?.phis || [];
    const foreignLatCache = new Map();
    /** Lateral |y| on the needle line at tip level to nearest other-set leg (6a.21 d(s_T)). */
    const foreignLatAt = (line, sT, ownSet) => {
      if (!(line >= 0) || line >= phis.length || !(sT > 0)) return Infinity;
      const key = `${ownSet}:${line}:${sT.toFixed(4)}`;
      if (foreignLatCache.has(key)) return foreignLatCache.get(key);
      const phi = phis[line];
      const C = point(R, sT, phi);
      const uC = unit(C), eL = eEast(C), n = ePole(C);
      const coord = (p) => {
        const q = unit(p);
        return { f: R * Math.asin(Math.max(-1, Math.min(1, dot(q, n)))), y: R * Math.atan2(dot(q, eL), dot(q, uC)) };
      };
      let dMin = Infinity;
      for (const L of segs) {
        if (L.type !== 'leg' || L.set === ownSet || !L.pts || L.pts.length < 2) continue;
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
        if (!st || st.level !== 'top' || !(st.row >= 2)) { failForeign++; hitDetails.push({ side, st, L, kind: 'fail', margin }); continue; }
        // 6a.21: classify by whose thread is under the upper hole.
        const ownCluster = L.set === st.set && L.line === st.line;
        if (ownCluster) { failOwn++; hitDetails.push({ side, st, L, kind: 'own', margin }); continue; }
        const halfW = Math.abs((st.eOff ?? 0) - (st.xOff ?? 0)) / 2;
        const sT = sTop0 + (st.row - 1) * w;
        const dFan = foreignLatAt(st.line, sT, st.set);
        if (halfW >= dFan - 1e-9) { warnU14++; hitDetails.push({ side, st, L, kind: 'U14', margin, halfW, dFan }); }
        else { failForeign++; hitDetails.push({ side, st, L, kind: 'foreignEarly', margin, halfW, dFan }); }
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
    for (const st of stitchesDone.filter((x) => x.level === 'top' && x.row >= 2)) {
      const key = `${st.set}:${st.line}`;
      const halfW = Math.abs((st.eOff ?? 0) - (st.xOff ?? 0)) / 2;
      const sT = sTop0 + (st.row - 1) * w;
      const dFan = foreignLatAt(st.line, sT, st.set);
      if (halfW >= dFan - 1e-9 && (geoFirst[key] == null || st.row < geoFirst[key])) geoFirst[key] = st.row;
    }
    for (const h of hitDetails) {
      if (h.kind !== 'U14' || !h.st) continue;
      const key = `${h.st.set}:${h.st.line}`;
      if (obsFirst[key] == null || h.st.row < obsFirst[key]) obsFirst[key] = h.st.row;
    }
    let earlyObs = 0;
    for (const key of Object.keys(obsFirst)) {
      if (geoFirst[key] != null && obsFirst[key] < geoFirst[key]) earlyObs++;
    }
    const badFail = failOwn + failForeign + earlyObs;
    const status = badFail ? 'fail' : (warnU14 ? 'warn' : 'pass');
    const geoB = Object.entries(geoFirst).filter(([k]) => k.startsWith('B:')).map(([, n]) => n);
    const geoBmin = geoB.length ? Math.min(...geoB) : null;
    add({ id: 'V16', name: 'Needle does not pierce thread (legs and channels)',
      crit: 'prior #105; TK-LITTLE «jiwari should not be split»; 6a.21 upper: own→fail, foreign+fan→U14 warn, foreign early→fail',
      status,
      value: `pierces ${nHoles}; min margin ${f(minMargin, 3)} mm (${worst || '—'}); `
        + `fail own-cluster ${failOwn}, fail foreign-early ${failForeign}, U14 fan warn ${warnU14}`
        + (earlyObs ? `; observed U14 earlier than geometric fan-start: ${earlyObs}` : '')
        + (badNoRoom ? `; noRoom∩V16 ${badNoRoom}` : '')
        + (geoBmin != null ? `; geo fan-start B min row ${geoBmin}` : ''),
      numbers: { failOwn, failForeign, warnU14, earlyObs, geoFirst, obsFirst, minMargin, badNoRoom } });
  }
  // V17 — uwagake: at top points of row n ≥ 2 the needle passes UNDER ALL threads of prior rows at that point
  {
    const tops = stitchesDone.filter((st) => st.row >= 2 && st.level === 'top');
    if (!tops.length) add({ id: 'V17', name: 'Needle under all previous rows at top (uwagake)', crit: 'TK-UWA «take a stitch around all of them»; SUESS «under and around all previous stitches»; prior #105', status: 'n/a', value: 'net topnikh stitches ryada ≥ 2' });
    else {
      let missing = 0, total = 0;
      const lines = [];
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
        const miss = incident.filter((id) => !under.has(id));
        total += incident.length; missing += miss.length;
        lines.push(`${st.round}/L${st.line}: under ${incident.length - miss.length}/${incident.length}${miss.length ? ` (me okhvacheny ${miss.join(',')})` : ''}`);
      }
      add({ id: 'V17', name: 'Needle under all previous rows at top (uwagake)', crit: 'TK-UWA «take a stitch around all of them»; SUESS «under and around all previous stitches»; prior #105 (defect «third catch does not wrap»)',
        status: missing ? 'fail' : 'pass', value: `covered ${total - missing} of ${total} prior-row shoulders; ${lines.join('; ')}` });
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
    let badKink = 0;
    const kinkRows = [];
    for (const s of legs) {
      if (s.layMode === 'rail') {
        const hole = Math.abs(s.holeTurnDeg ?? 0);
        const merge = Math.abs(s.mergeTurnDeg ?? s.turnAtTDeg ?? 0);
        kinkRows.push({ id: s.id, row: s.row, joinMode: s.joinMode, holeTurnDeg: hole, mergeTurnDeg: merge });
        // 6a.19 / Codex block-B: splice checked by ANGLE — tangent ≤1°, climb ≤20°; hole ≤20°.
        // κ_g excludes a window of width w around the splice join (discrete kink ≠ free curvature).
        if (s.joinMode === 'climb') {
          if (hole > 20 + 1e-6 || merge > 20 + 1e-6) badKink++;
          continue; // rail+climb excluded from κ_g
        }
        if (s.joinMode === 'onRail') continue;
        if (s.joinMode === 'tangent') {
          const splice = Math.max(0, s.spliceMm ?? 0);
          // Degenerate short splice (<w): hole and merge coincide — only hole ≤20° (not exterior ≤1°).
          if (splice < wMm) {
            if (hole > 20 + 1e-6) badKink++;
            continue;
          }
          if (hole > 20 + 1e-6 || merge > 1 + 1e-6) badKink++; // exterior tangent ≤1°
          // Free κ_g on exterior tangent splice only, excluding ≤w at hole AND ≤w around splice join.
          const exclHole = Math.min(Math.max(0, splice - wMm), wMm);
          const freeEnd = Math.max(exclHole, splice - wMm); // stop w before splice
          if (freeEnd - exclHole < wMm * 0.5) continue; // too short to score
          const lam = maxAbsGeodesicKg(s.pts, R, exclHole, 0, freeEnd) * R;
          if (lam > lambdaMax) { lambdaMax = lam; worst = s; }
          continue;
        }
        if (s.joinMode === 'free') {
          // 6a.15 free leg: whole geodesic excl ≤w at holes.
          const lam = maxAbsGeodesicKg(s.pts, R, wMm, wMm) * R;
          if (lam > lambdaMax) { lambdaMax = lam; worst = s; }
          continue;
        }
        continue;
      }
      // Row-1 / geodesic: free class with ≤w windows at both holes
      const lam = maxAbsGeodesicKg(s.pts, R, wMm, wMm) * R;
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
      crit: 'Errata 6a.9.1/block-B: λ_max κ_g on FREE only (row1 excl ≤w holes; n≥2 exterior tangent excl ≤w at hole and ≤w around splice); rail+climb excluded; kink angles: hole≤20°, tangent splice≤1°, climb≤20°',
      status,
      value: `λ_max=${f(lambdaMax, 6)} · μWrap=${f(muW, 4)} · λ/μ=${f(ratio, 6)}` +
        ` [warn>${WARN_RATIO}, fail≥${FAIL_RATIO}; free-class κ_g]` +
        (badKink ? `; badKink ${badKink} (hole/merge >20°)` : '') +
        (cmdMismatch ? `; CMD MISMATCH ${worstCmd.id} λ=${f(worstCmd.disc, 6)} vs cmd ${f(worstCmd.expect, 6)} (${cmdSource})` : '') +
        (worst ? ` (worst ${worst.id}/${worst.round})` : '') +
        (legs.length ? `; shoulders ${legs.length}` : ''),
      numbers: { lambdaMax, muWrap: muW, ratio, warnRatio: WARN_RATIO, failRatio: FAIL_RATIO,
        bowLambda: A.params.bowLambda ?? null, cmdLambda, cmdSource, cmdMismatch, worstCmd, badKink, kinkRows } });
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
      const phi = A.marking.phis[((s.line % N) + N) % N];
      const nMer = [-Math.sin(phi), Math.cos(phi), 0];
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
        const TmerG = unit(sub(ePole(Cgeo), mul(Cgeo, dot(ePole(Cgeo), Cgeo))));
        if (Math.hypot(...Tgeo) > 1e-12 && Math.hypot(...TmerG) > 1e-12) {
          alphaGeo = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(Tgeo), unit(TmerG))))));
        }
      }

      // α_exp from reference curve at crossing (6a.9.2)
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
          const Tmer = unit(sub(ePole(C), mul(C, dot(ePole(C), C))));
          if (Math.hypot(...Tarc) > 1e-12 && Math.hypot(...Tmer) > 1e-12) {
            alphaExp = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(Tarc), unit(Tmer))))));
          }
        } else if (s.row >= 2) {
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
              if (dot(N, ePole(p)) > 0) N = mul(N, -1);
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
          const TmerC = unit(sub(ePole(C), mul(C, dot(ePole(C), C))));
          if (Math.hypot(...Tref) > 1e-12 && Math.hypot(...TmerC) > 1e-12) {
            alphaExp = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(Tref), unit(TmerC))))));
          }
        } else {
          const C = unit(vadd(mul(unit(s.pts[Math.max(0, iRef - 1)]), 1 - tRef), mul(unit(s.pts[Math.min(iRef, nLast)]), tRef)));
          const Tpath = unit(sub(s.pts[Math.min(iRef, nLast)], s.pts[Math.max(0, iRef - 1)]));
          const TpathT = unit(sub(Tpath, mul(C, dot(Tpath, C))));
          const TmerC = unit(sub(ePole(C), mul(C, dot(ePole(C), C))));
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
      const TmerC = unit(sub(ePole(C), mul(C, dot(ePole(C), C))));
      let alpha = 0;
      if (Math.hypot(...TpathT) > 1e-12 && Math.hypot(...TmerC) > 1e-12) {
        alpha = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(TpathT), unit(TmerC))))));
      }
      const aDeg = alpha * 180 / Math.PI, gDeg = alphaGeo * 180 / Math.PI;
      // 6a.19/6a.20: free = row 1 (any λ) and joinMode/railKind=free (λ=0 free-exit).
      // Residual climb/rail at λ=0 uses α_ref = parallel of accepted n−1 (rail rule).
      const isFree = s.row === 1 || s.joinMode === 'free' || s.railKind === 'free';
      const isRail = !isFree && s.row >= 2;
      // 6a.20: free α_ref = analytic arc tangent at axis crossing (λ>0) or ref geodesic there (λ=0).
      // α_geo+θ is tables-only — not the validator reference.
      const alphaRef = isFree
        ? (lamCmd > 1e-15 ? alphaExp : alphaGeo)
        : alphaExp;
      const sinAct = Math.sin(alpha), sinRef = Math.sin(Math.max(alphaRef, 1e-12));
      const sinRatio = sinAct / sinRef;
      const deficitDeg = gDeg - aDeg; // α_geo(own) − α_act (physicality: ≈0 at row2, grows with n on rail)
      angleRows.push({
        id: s.id, row: s.row, set: s.set, angleDeg: aDeg, alphaGeoDeg: gDeg,
        alphaRefDeg: alphaRef * 180 / Math.PI, alphaExpDeg: alphaExp * 180 / Math.PI,
        sinRatio, deficitDeg, layMode: s.layMode, joinMode: s.joinMode, isRail, isFree,
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


return out;
}

export function summary(vals) {
  const c = { pass: 0, fail: 0, warn: 0, info: 0, 'n/a': 0 };
  for (const v of vals) c[v.status]++;
  return c;
}
