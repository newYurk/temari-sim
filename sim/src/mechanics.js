// @ts-check
// Thread lift at crossings — mechanics (#5, stage 2.4; model/lift-spec.md = Fable lift-spec v1). Pure functions, no DOM.
// The mechanics is a radial field over the construction: it never moves a hole or changes a placement rule; it gives the
// height u(x) of the thread axis above its «on-site» level (R + h/2) along the already built path, and the lengths and
// contact checks that follow. Units: mm, N, N/mm² (Winkler stiffness k per unit thread length), N·mm² (bending B).
// Labels as in model/spec.md: (a) source, (b) analogue, (c) estimate, (d) assumed, (=) computed here.
import { alongPolylineMm, dist as dist3 } from './geom.js';

/** gram-force per newton (t_c law is written in gf). */
export const GF_PER_N = 1 / 0.00980665;
/** Reference laid height h of the t_c law (pearl #5, 0.65·0.714 mm): the law is scaled by h/H_REF (equal pressure, (c)). */
export const H_REF_MM = 0.464;
/** §2 defaults — each with basis and status (the parameter schema carries the same). */
export const LIFT_DEFAULTS = Object.freeze({
  T: { value: 1, range: [0.5, 2], status: 'assumed', basis: 'lift-spec v1 §2 (d): seam/embroidery analogues; tension_N empty → 1 N' },
  k: { value: 3, range: [0.3, 10], status: 'estimate', basis: 'lift-spec v1 §2 (c): wrap modulus 2–5 MPa, spot 0.7×2 mm → k ≈ 2–5 N/mm²' },
  B: { value: 0.01, range: [0.003, 0.1], status: 'estimate', basis: 'lift-spec v1 §2 (c): Peirce bending length 15–25 mm at 200 tex' },
  kappa: { value: 0.8, range: [0.7, 1.0], status: 'analogue', basis: 'lift-spec v1 §1.6 (b): Durur t6/(3t2) 0.82–1.02, Panneerselvam 2024' },
});

/** Compressed thickness in the overlap, t_c(F) = 0.491 − 0.068·ln(0.244·F[gf]) mm (b, Durur 2000 log law ×2.03), scaled
 *  by h/H_REF for another laid height (c). */
export function tcAt(F_N, h = H_REF_MM) {
  const gf = Math.max(1e-6, F_N * GF_PER_N);
  return (0.491 - 0.068 * Math.log(0.244 * gf)) * (h / H_REF_MM);
}
/** Regime lengths (=, lift-spec §1.1–1.2): λ_T = √(T/k), λ_B = (4B/k)^¼, ℓ_b = √(B/T), Π = T/(2√(Bk)). k = ∞ → 0 lengths. */
export function regime(T, B, k) {
  const inf = !Number.isFinite(k);
  return { lamT: inf ? 0 : Math.sqrt(T / k), lamB: inf ? 0 : Math.pow(4 * B / k, 0.25), lb: Math.sqrt(B / T), Pi: inf || B <= 0 ? Infinity : T / (2 * Math.sqrt(B * k)) };
}
/** Dent of the lower thread under a point force (=, §1.2): δ = F / (2√k·√(T + 2√(Bk))); k = ∞ → 0. */
export function dentOf(F, T, B, k) {
  if (!Number.isFinite(k)) return 0;
  return F / (2 * Math.sqrt(k) * Math.sqrt(T + 2 * Math.sqrt(Math.max(0, B) * k)));
}
/** Free flight x₀ and slope σ of a tent of apex height Δ (=, §1.4): x₀ = √(R(2Δ − s₀)) − √(R s₀), σ = x₀/R + √(s₀/R). */
export function flight(D, R, s0) {
  const x0 = Math.sqrt(Math.max(0, R * (2 * D - s0))) - Math.sqrt(R * s0);
  return { x0: Math.max(0, x0), sigma: Math.max(0, x0) / R + Math.sqrt(s0 / R) };
}
/** Single-crossing rise (=, §1.3, T8): Δ₁ = 1.5·t_c(F) − h/2 − δ(F), F = 2T·σ(Δ₁) — fixed point, damping ½, ≤ 50 steps,
 *  Δ₁ ≥ 0. Returns every derived constant of §2. */
export function rise1({ T = 1, k = 3, B = 0.01, h = H_REF_MM, R }) {
  const s0 = Number.isFinite(k) ? T / (k * R) : 0;
  let D = 0.27 * h / H_REF_MM, it = 0, F = 0, tc = 0, dent = 0;
  for (; it < 50; it++) {
    const { sigma } = flight(D, R, s0);
    F = 2 * T * sigma; tc = tcAt(F, h); dent = dentOf(F, T, B, k);
    const Dn = Math.max(0, 1.5 * tc - h / 2 - dent);
    if (Math.abs(Dn - D) < 1e-13) { D = Dn; break; }
    D = Math.max(0, 0.5 * (D + Dn));
  }
  const { x0, sigma } = flight(D, R, s0);
  F = 2 * T * sigma; tc = tcAt(F, h); dent = dentOf(F, T, B, k);
  return { delta1: D, dent, F, sigma, x0, s0, tc, a1: Math.sqrt(2 * R * D), iterations: it, ...regime(T, B, k) };
}
/** Stack of m threads under the upper one (§1.6, T9): Δ(m) = Δ₁·[1 + κ(m − 1)]. */
export const stackRise = (D1, m, kappa) => D1 * (1 + kappa * (Math.max(1, m) - 1));
/** Physical ceiling (K18): Δ_cap(m) = (m + ½)·t_c − h/2. */
export const capRise = (m, tc, h) => (Math.max(1, m) + 0.5) * tc - h / 2;
/** Local widening and crest radius (§1.4): w_c = w·h/t_c, ρ_c = (w_c/2)²/(t_c/2). */
export const crest = (w, h, tc) => { const wc = w * h / tc; return { wc, rhoC: (wc / 2) ** 2 / (tc / 2) }; };
/** Plateau on the crest (§1.5): ℓ_p(ψ) = min(σ·ρ_c/sin²ψ, w_c/(2 sin ψ)). */
export function plateau(psi, sigma, rhoC, wc) {
  const s = Math.max(1e-9, Math.abs(Math.sin(psi)));
  return Math.min(sigma * rhoC / (s * s), wc / (2 * s));
}
/** Threshold ψ* = asin(2σρ_c/w_c) (§1.5): below it the plateau spans the whole crest. */
export const psiStar = (sigma, rhoC, wc) => Math.asin(Math.min(1, 2 * sigma * rhoC / wc));

/** One apex (a tent) of height Δ at crossing angle ψ: plateau, departure height Δ_s, its free flight. Plain data. */
export function apexOf(D, psi, c) {
  const s = Math.max(1e-9, Math.abs(Math.sin(psi)));
  const kc = s * s / c.rhoC;                     // curvature of the crest along the thread
  let lp = plateau(psi, flight(D, c.R, c.s0).sigma, c.rhoC, c.wc);
  if (c.lpMax != null) lp = Math.min(lp, c.lpMax);
  const Ds = Math.max(0, D - kc * lp * lp / 2);
  const f = flight(Ds, c.R, c.s0);
  return { D, lp, kc, Ds, x0s: f.x0, ss: f.sigma };
}
/** Tent profile u(x) of one apex, x from the apex (§1.4, §1.5): crest arc on |x| ≤ ℓ_p, chord to x₀, tail s₀·e^{−…/λ_T}. */
export function tentAt(ap, x, R, s0, lamT) {
  const ax = Math.abs(x);
  if (ax <= ap.lp) return ap.D - ap.kc * ax * ax / 2;
  const y = ax - ap.lp;
  if (y <= ap.x0s) return ap.Ds - ap.ss * y + y * y / (2 * R);
  return lamT > 0 ? s0 * Math.exp(-(y - ap.x0s) / lamT) : 0;
}
/** tentProfile({Δ, R, s₀, λ_T, ℓ_p}) → x ↦ u (single apex, ψ = 90° unless given). */
export function tentProfile({ D, R, s0 = 0, lamT = 0, psi = Math.PI / 2, rhoC = Infinity, wc = 0, lpMax = null }) {
  const ap = Number.isFinite(rhoC) ? apexOf(D, psi, { R, s0, rhoC, wc, lpMax }) : { D, lp: 0, kc: 0, Ds: D, x0s: flight(D, R, s0).x0, ss: flight(D, R, s0).sigma };
  return (x) => tentAt(ap, x, R, s0, lamT);
}
/** Bridge chord between apices i (x_i, Δ_i) and j (§1.8): u = Δ_i + (Δ_j − Δ_i)·t/L − t(L − t)/(2R). */
export const bridgeAt = (xi, Di, xj, Dj, x, R) => { const L = xj - xi, t = x - xi; return Di + (Dj - Di) * t / L - t * (L - t) / (2 * R); };
/** Minimum of a bridge chord over its span (the chord minus the sphere is convex in t). */
export function bridgeMin(xi, Di, xj, Dj, R) {
  const L = xj - xi; if (!(L > 0)) return Math.min(Di, Dj);
  const t = Math.min(L, Math.max(0, L / 2 - (Dj - Di) * R / L));
  return bridgeAt(xi, Di, xj, Dj, xi + t, R);
}
/** Taut thread over several apices on one leg (§1.8): the upper envelope of the single tents and of every bridge chord that
 *  stays on or above the sphere (a chord that dips is replaced by the two landings — the tents). Returns plain data:
 *  { apices (sorted, with x), edges [[i, j]] (valid, undominated chords), bridges (edges between neighbours) }. */
export function hullOf(apices, R) {
  const A = [...apices].sort((p, q) => p.x - q.x);
  const edges = [];
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const a = A[i], b = A[j];
    if (b.x - a.x < 1e-9) continue;
    if (bridgeMin(a.x, a.D, b.x, b.D, R) < 0) continue;
    let dominated = false;
    for (let k = i + 1; k < j && !dominated; k++) if (A[k].x > a.x && A[k].x < b.x && A[k].D >= bridgeAt(a.x, a.D, b.x, b.D, A[k].x, R) - 1e-12) dominated = true;
    if (!dominated) edges.push([i, j]);
  }
  const bridges = edges.filter(([i, j]) => j === i + 1 && A[j].x - A[i].x > A[i].lp + A[j].lp + 1e-9).length;
  return { apices: A, edges, bridges };
}
/** hullProfile(apices, R, s₀, λ_T) → x ↦ u (upper envelope, §1.8). apices: [{ x, D, lp, kc, Ds, x0s, ss }]. */
export function hullProfile(apices, R, s0 = 0, lamT = 0) {
  const H = hullOf(apices, R);
  return (x) => envelopeAt(H, x, R, s0, lamT);
}
export function envelopeAt(H, x, R, s0, lamT) {
  let u = 0;
  for (const ap of H.apices) { const d = x - ap.x; if (Math.abs(d) > ap.lp + ap.x0s + 12 * lamT + 1e-9 && u > 0) continue; u = Math.max(u, tentAt(ap, d, R, s0, lamT)); }
  for (const [i, j] of H.edges) { const a = H.apices[i], b = H.apices[j]; if (x >= a.x && x <= b.x) u = Math.max(u, bridgeAt(a.x, a.D, b.x, b.D, x, R)); }
  return u;
}
/** ΔL₁ = (4/3)·Δ·σ — extra length of one tent (=, §1.4, rigid crest). */
export const extraLength1 = (D, sigma) => (4 / 3) * D * sigma;
/** Analytic extra length of one apex with its plateau (=): the crest arc ∫(u'²/2 + u/R) over ±ℓ_p, (4/3)·Δ_s·σ_s for the
 *  two flights, and the two landing tails 2·(s₀²/(4λ_T) + s₀·λ_T/R) (≈ 0.8 % of ΔL at the defaults). */
export function extraLengthApex(ap, R, s0 = 0, lamT = 0) {
  const { lp, kc, D } = ap;
  const tails = lamT > 0 ? 2 * (s0 * s0 / (4 * lamT) + s0 * lamT / R) : 0;
  return (kc * kc * lp ** 3) / 3 + (2 * lp * D - kc * lp ** 3 / 3) / R + extraLength1(ap.Ds, ap.ss) + tails;
}
/** Numeric extra length ∫(u'²/2 + u/R) dx of a profile over [x0, x1], step ≤ h (default 0.05 mm). */
export function extraLength(fn, x0, x1, R, h = 0.05) {
  const n = Math.max(2, Math.ceil((x1 - x0) / h)), dx = (x1 - x0) / n;
  let sum = 0, prev = fn(x0);
  for (let i = 1; i <= n; i++) { const u = fn(x0 + i * dx), du = (u - prev) / dx, um = (u + prev) / 2; sum += (du * du / 2 + um / R) * dx; prev = u; }
  return sum;
}
/** Dent profile of the lower thread (§1.7): −d_low on the spot (half-width w_c/(2 sin ψ)), e^{−…/λ} beyond. */
export function dentAt(dn, x, lamT) {
  const ax = Math.abs(x - dn.x);
  if (ax <= dn.half) return -dn.d;
  const lam = Math.max(lamT, 1e-6);
  return ax - dn.half > 12 * lam ? 0 : -dn.d * Math.exp(-(ax - dn.half) / lam);
}
export const dentProfile = (dents, lamT) => (x) => dents.reduce((v, dn) => Math.min(v, dentAt(dn, x, lamT)), 0);

// ---- the mechanics layer (lift-spec v1 §3) — plain data (structured-clone safe: tests copy A, the worker gets it by
// postMessage), so the profile functions are rebuilt from it by liftFnFor / dentFnFor below (#5 Q4).

/** Crossing kinds that carry an apex (§3.2); rail-parallel → 0, contact → not allowed (V8), no lift. */
export const APEX_KINDS = new Set(['crossing', 'tipCross', 'squeeze', 'climb', 'wedge']);
/** #5 Q1 (provisional, answer (b)): the local stack under the upper thread — 1 + the local stack of an earlier crossing where
 *  the lower thread lies over a third thread within this distance (× w) of the point; c.stack (the chronological level of
 *  path.stackLevels, window ±w/sin ψ) is printed alongside. */
export const LOCAL_STACK_WINDOW_W = 0.5;
/** #5 Q1/Q2 switches (one place; pending Fable): which m the stack rise uses — 'local' (Q1 b, provisional), 'ordinal'
 *  (Q1 a: c.stack as is), 'one' (Q1 c: m = 1 everywhere); and the plateau cap for ψ < ψ* and wedges — 'contact' (Q2,
 *  provisional: ℓ_p ≤ max(w_c/2, the path contact length / 2)) or 'none' (ℓ_p(ψ) of §1.5 as is). */
/** @type {{ stackM: string, plateauCap: string }} */
export const LIFT_CHOICES = Object.freeze({ stackM: 'local', plateauCap: 'contact' });

/** Resolved mode: display | ideal | measured (lift1_w given → measured, §5.2). */
export function liftModeOf(P) {
  if (P.liftMode === 'display') return 'display';
  if (P.liftMode === 'measured' || P.lift1_w != null) return 'measured';
  return 'ideal';
}

/** Build the mechanics data over a finished path. Returns the fields of the layer (layers.js adds id, inputs, stamp). */
export function buildMechanics(P, path, base) {
  const mode = liftModeOf(P);
  if (mode === 'display') return { mode, displayOnly: true, notes: ['display: the former tent 0.6·w (DISPLAY_STACK_LIFT_W), display only; lengths are the lower bound'] };
  const R = base.R, w = P.w_mm, h = (P.hw ?? 0.65) * w;
  const T = P.tension_N != null && P.tension_N > 0 ? P.tension_N : LIFT_DEFAULTS.T.value;
  const k = P.wrapK_Nmm2 ?? LIFT_DEFAULTS.k.value, B = P.bendB_Nmm2 ?? LIFT_DEFAULTS.B.value, kappa = P.stackKappa ?? LIFT_DEFAULTS.kappa.value;
  const notes = [];
  if (!(P.tension_N > 0)) notes.push('T = 1 N assumed (tension_N empty, lift-spec §2 (d))');
  const r = rise1({ T, k, B, h, R });
  let delta1 = r.delta1, F = r.F, tc = r.tc, dent = r.dent, sigma = r.sigma, x0 = r.x0;
  if (mode === 'measured') {
    if (P.lift1_w != null) {
      delta1 = P.lift1_w * w;
      ({ x0, sigma } = flight(delta1, R, r.s0)); F = 2 * T * sigma; tc = tcAt(F, h); dent = 1.5 * tc - h / 2 - delta1;
      if (dent < 0.02 || dent > 0.2) notes.push(`measured Δ₁ implies δ = ${dent.toFixed(3)} mm outside 0.02–0.2: t_c or h out of range, check the cross-section (#44)`);
    } else notes.push('measured without lift1_w: the model Δ₁ (ideal) is used');
  }
  const { wc, rhoC } = crest(w, h, tc);
  const pStar = psiStar(sigma, rhoC, wc);
  const consts = { mode, R, w, h, T, k, B, kappa, tc, wc, rhoC, delta1, a1: Math.sqrt(2 * R * delta1), x0, sigma, s0: r.s0, lamT: r.lamT, lamB: r.lamB, lb: r.lb, Pi: r.Pi,
    F1: F, dent1: dent, psiStarDeg: pStar * 180 / Math.PI, localStackWindowW: LOCAL_STACK_WINDOW_W, stackM: LIFT_CHOICES.stackM, plateauCap: LIFT_CHOICES.plateauCap,
    status: { T: P.tension_N > 0 ? 'given' : 'assumed', k: 'estimate', B: 'estimate', kappa: 'analogue', delta1: mode === 'measured' && P.lift1_w != null ? 'photo' : 'model (=)', h: 'analogue' } };
  const segById = new Map(path.segs.map((s) => [s.id, s]));
  const stepOf = (s) => s.length / Math.max(1, s.pts.length - 1);
  // local stack m (Q1 b), in the chronological order of path.crossings (the order stackLevels uses)
  const byOver = new Map(), mLoc = new Map();
  for (const c of path.crossings) {
    if (!byOver.has(c.over)) byOver.set(c.over, []);
    let lv = 0;
    if (c.kind !== 'rail-parallel' && c.kind !== 'contact') {
      for (const q of byOver.get(c.under) || []) if (mLoc.has(q) && q.kind !== 'rail-parallel' && q.kind !== 'contact' && q.at && c.at && dist3(q.at, c.at) <= LOCAL_STACK_WINDOW_W * w) lv = Math.max(lv, mLoc.get(q));
    }
    mLoc.set(c, 1 + lv);
    byOver.get(c.over).push(c);
  }
  const cfg = { R, s0: r.s0, rhoC, wc };
  const crossings = [], apicesBy = new Map(), dentsBy = new Map();
  const dLowOf = (m) => { let s = 0; for (let i = 1; i <= m; i++) s += Math.sqrt(stackRise(delta1, i, kappa) / delta1); return dent * s + (h - tc) / 2; };
  let nLowPsi = 0, nApex = 0, mMax = 0, mOrdMax = 0, psiMin = 180;
  for (const c of path.crossings) {
    const psiDeg = c.angleDeg != null ? c.angleDeg : 90;
    const apexKind = APEX_KINDS.has(c.kind) || (c.kind !== 'rail-parallel' && c.kind !== 'contact' && psiDeg >= consts.psiStarDeg);
    const over = segById.get(c.over), under = segById.get(c.under);
    if (!apexKind || !over || !under || over.type !== 'leg') { crossings.push({ id: c.id, kind: c.kind, over: c.over, under: c.under, psiDeg, m: mLoc.get(c), mOrd: c.stack ?? 1, delta: 0, cls: c.kind === 'rail-parallel' ? 'rail-parallel (0)' : c.kind === 'contact' ? 'contact (no lift, V8)' : 'no apex' }); continue; }
    const m = LIFT_CHOICES.stackM === 'ordinal' ? Math.max(1, c.stack ?? 1) : LIFT_CHOICES.stackM === 'one' ? 1 : mLoc.get(c), psi = psiDeg * Math.PI / 180;
    const lpMax = LIFT_CHOICES.plateauCap === 'contact' ? Math.max(wc / 2, (c.lenMm ?? 0) / 2) : Infinity;   // #5 Q2
    const D = stackRise(delta1, m, kappa);
    const ap = apexOf(D, psi, { ...cfg, lpMax: psiDeg < consts.psiStarDeg || c.kind === 'wedge' ? lpMax : null });
    const ic = c.over === c.a ? c.iA : c.iB, iu = c.under === c.a ? c.iA : c.iB;
    const x = alongPolylineMm(over.pts, c.at, over.length, ic * stepOf(over));
    const xu = alongPolylineMm(under.pts, c.at, under.length, iu * stepOf(under));
    if (!apicesBy.has(c.over)) apicesBy.set(c.over, []);
    apicesBy.get(c.over).push({ x, ...ap, cid: c.id, m, psiDeg });
    const dLow = dLowOf(m), half = Math.min(wc / (2 * Math.max(1e-6, Math.sin(psi))), Math.max(lpMax, wc / 2));
    if (under.type === 'leg') { if (!dentsBy.has(c.under)) dentsBy.set(c.under, []); dentsBy.get(c.under).push({ x: xu, d: dLow, half, cid: c.id }); }
    const lowPsi = psiDeg < consts.psiStarDeg;
    if (lowPsi) nLowPsi++;
    nApex++; mMax = Math.max(mMax, m); mOrdMax = Math.max(mOrdMax, c.stack ?? 1); psiMin = Math.min(psiMin, psiDeg);
    crossings.push({ id: c.id, kind: c.kind, over: c.over, under: c.under, psiDeg, m, mLocal: mLoc.get(c), mOrd: c.stack ?? 1, delta: D, cap: capRise(m, tc, h), xApex: x, xUnder: xu, plateau: ap.lp,
      aFree: ap.lp + ap.x0s, F: 2 * T * ap.ss, dent: -dLow, extraLen: extraLengthApex(ap, R, r.s0, r.lamT), lowPsi, cls: lowPsi ? `ψ < ψ* (position ±w/tan ψ)` : 'tent' });
  }
  const legs = {};
  const perSeg = {}, perThread = {};
  let total = { sphere: 0, axis: 0, lifted: 0 }, liftMax = 0, bridges = 0;
  for (const s of path.segs) {
    if (s.type !== 'leg') continue;
    const Hs = hullOf(apicesBy.get(s.id) || [], R);
    const leg = { apices: Hs.apices, edges: Hs.edges, bridges: Hs.bridges, dents: dentsBy.get(s.id) || [] };
    legs[s.id] = leg;
    bridges += Hs.bridges;
    const fn = (x) => envelopeAt(leg, x, R, r.s0, r.lamT);
    const sphere = s.length, axis = sphere * (1 + h / (2 * R));
    const extra = leg.apices.length ? extraLength(fn, 0, s.length, R, 0.1) : 0;
    let lm = 0; for (const ap of leg.apices) lm = Math.max(lm, fn(Math.min(s.length, Math.max(0, ap.x))));
    liftMax = Math.max(liftMax, lm);
    perSeg[s.id] = { sphere, axis, lifted: axis + extra, extra, liftMax: lm };
    const th = s.thread ?? '—';
    perThread[th] = perThread[th] || { sphere: 0, axis: 0, lifted: 0 };
    for (const key of ['sphere', 'axis', 'lifted']) { perThread[th][key] += perSeg[s.id][key]; total[key] += perSeg[s.id][key]; }
  }
  if (nLowPsi) notes.push(`${nLowPsi} crossings below ψ* = ${consts.psiStarDeg.toFixed(1)}°: plateau on the whole crest, apex position ±w/tan ψ (printed, not a fail; §1.5)`);
  if (mMax >= 4) notes.push(`local stacks m ≥ 4 (max ${mMax}): position unreliable (K19, printed)`);
  return { mode, displayOnly: false, consts, crossings, legs, lengths: { perSeg, perThread, total }, liftMax, mMax, mOrdMax, psiMinDeg: nApex ? psiMin : null, nApex, nLowPsi, bridges, notes };
}
/** x ↦ lift (mm above the on-site axis level R + h/2) of leg segId; 0 for a leg without apices or in display mode. */
export function liftFnFor(mech, segId) {
  const leg = mech?.legs?.[segId];
  if (!leg || !leg.apices.length) return () => 0;
  const { R, s0, lamT } = mech.consts;
  return (x) => envelopeAt(leg, x, R, s0, lamT);
}
/** Lift at vertex i of seg (compat with display.js: liftAt(segId, i)). */
export const liftAt = (mech, seg, i) => liftFnFor(mech, seg.id)(i * seg.length / Math.max(1, seg.pts.length - 1));
/** x ↦ dent (≤ 0) of leg segId under foreign crossings (§1.7). */
export function dentFnFor(mech, segId) {
  const leg = mech?.legs?.[segId];
  if (!leg || !leg.dents.length) return () => 0;
  return dentProfile(leg.dents, mech.consts.lamT);
}
