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
  T: { value: 1, range: [0.5, 3], status: 'assumed', basis: 'lift-spec v1.1 §2 (d): seam/embroidery analogues (Peirce 1.1–1.5 N at 150–200 tex, machine seam 1 N static); tension_N empty → 1 N' },
  k: { value: 3, range: [0.3, 10], status: 'estimate', basis: 'lift-spec v1 §2 (c): wrap modulus 2–5 MPa, spot 0.7×2 mm → k ≈ 2–5 N/mm²' },
  B: { value: 0.0155, range: [0.01, 0.03], status: 'measured (analogue thread)', basis: 'lift-spec v1.1 §2 (b): Alshukur & Macintyre 2020, combed cotton 3-ply 126 tex, beam method, 1.55e−8 N·m² (CV 49 %); HGB 1969 0.55–1.5e−8 at 30–83 tex' },
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
export function rise1({ T = 1, k = 3, B = 0.0155, h = H_REF_MM, R }) {
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
/** Single-crossing rise at a given crossing force F (lift-spec v1.1 §1.8, Fable Q5 §2): Δ₁(F) = 1.5·t_c(F) − h/2 − δ(F) ≥ 0. */
export const rise1At = (F, { T, k, B, h }) => Math.max(0, 1.5 * tcAt(F, h) - h / 2 - dentOf(F, T, B, k));
/** Where y lies on a leg's own profile (hull H, §1.8, Fable Q5 §2): 'plateau' (on its own crest — rigid, a = b = 0), 'bridge'
 *  between apices i < j (a, b to their plateau edges), 'flight' of the dominant apex (a back to its plateau edge, b ahead to
 *  its landing, dir = +1 / −1 along x toward the landing) or 'ground' (on the sphere). */
export function regionOf(H, y, R, s0, lamT) {
  const A = H.apices;
  for (const ap of A) if (Math.abs(y - ap.x) <= ap.lp + 1e-12) return { kind: 'plateau', a: 0, b: 0, dir: 0 };
  let best = null, uBest = -1;
  for (const ap of A) { const u = tentAt(ap, y - ap.x, R, s0, lamT); if (u > uBest) { uBest = u; best = ap; } }
  for (const [i, j] of H.edges) {
    const p = A[i], q = A[j];
    if (y > p.x + p.lp && y < q.x - q.lp && bridgeAt(p.x, p.D, q.x, q.D, y, R) >= uBest - 1e-12)
      return { kind: 'bridge', a: y - (p.x + p.lp), b: (q.x - q.lp) - y, dir: 0 };
  }
  if (!best) return { kind: 'ground', a: 0, b: 0, dir: 0 };
  const d = Math.abs(y - best.x), land = best.lp + best.x0s;
  if (d >= land) return { kind: 'ground', a: 0, b: 0, dir: 0 };
  return { kind: 'flight', a: d - best.lp, b: land - d, dir: y >= best.x ? 1 : -1 };
}
/** Loaded profile (Fable Q5 §2, lift-spec v1.1 §3.1): the own envelope minus the loads of later threads, in lay order. A load
 *  { y, sag, s, a, b, dir, bridge }: on a bridge a triangle of depth sag at y to both plateau edges (a behind, b ahead);
 *  on a flight the triangle back to the plateau edge and ahead the kink u − sag − s·t (s = 2σ_U, t from y toward the
 *  landing) up to the landing b; each step clamped at 0 (the thread lies on the sphere). */
export function loadedAt(H, loads, x, R, s0, lamT) {
  let u = envelopeAt(H, x, R, s0, lamT);
  if (!loads || !loads.length) return u;
  for (const L of loads) {
    const t = L.bridge ? x - L.y : L.dir * (x - L.y);
    if (t < 0 && -t <= L.a) u -= L.sag * (1 + t / Math.max(1e-12, L.a));
    else if (t >= 0 && t <= L.b) u -= L.bridge ? L.sag * (1 - t / Math.max(1e-12, L.b)) : L.sag + L.s * t;
    if (u < 0) u = 0;
  }
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
/** #5 Q1 (Fable 2026-09-26, C.1): the stack m under the upper thread — 1 + m of an earlier apex of the lower thread whose
 *  contact patch |Δy| ≤ max(this × w, w_c/(2 sin ψ′)) covers the point; c.stack (the chronological level of path.stackLevels,
 *  window ±w/sin ψ) is the display mode only and printed alongside. */
export const LOCAL_STACK_WINDOW_W = 0.5;   // the contact-patch window's lower bound (ψ′ = 90°: w/2 … w_c/2)
/** #5 Q1/Q2 switches (one place): the stack rule — 'patch' (Fable C.1: m by the contact patch, Δ_c = u_under + Δ₁·(m > 1 ? κ : 1)),
 *  'ordinal' (Q1 a, rejected: Δ(c.stack)), 'one' (Q1 c, rejected: Δ₁ everywhere); the plateau cap — 'contact' (Fable C.2:
 *  ℓ_p ≤ max(w_c/2, c.lenMm/2), every apex) or 'none' (ℓ_p(ψ) of §1.5 as is). The alternatives stay for sweeps and tests. */
/** @type {{ stackM: string, plateauCap: string }} */
export const LIFT_CHOICES = Object.freeze({ stackM: 'support', plateauCap: 'contact' });

/** Resolved mode: display | ideal | measured (lift1_w given → measured, §5.2). */
export function liftModeOf(P) {
  if (P.liftMode === 'display') return 'display';
  if (P.liftMode === 'measured' || P.lift1_w != null) return 'measured';
  return 'ideal';
}

/** Build the mechanics data over a finished path. Returns the fields of the layer (layers.js adds id, inputs, stamp). */
export function buildMechanics(P, path, base, choices = LIFT_CHOICES) {   // choices: tests and sweeps only; the app uses LIFT_CHOICES
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
    F1: F, dent1: dent, psiStarDeg: pStar * 180 / Math.PI, localStackWindowW: LOCAL_STACK_WINDOW_W, orderExceptions: 0, stackM: choices.stackM, plateauCap: choices.plateauCap,
    status: { T: P.tension_N > 0 ? 'given' : 'assumed', k: 'estimate', B: 'measured (analogue thread)', kappa: 'analogue', delta1: mode === 'measured' && P.lift1_w != null ? 'photo' : 'model (=)', h: 'analogue' } };
  const segById = new Map(path.segs.map((s) => [s.id, s]));
  const stepOf = (s) => s.length / Math.max(1, s.pts.length - 1);
  // #5 Q1 (Fable 2026-09-26, C.1): apices in lay order of the upper leg (a thread lies over earlier ones: DAG). m(c) = 1 + m(c′),
  // c′ = an apex of the lower thread whose contact patch |y_c − y_c′| ≤ max(w/2, w_c/(2 sin ψ′)) covers the point; the apex
  // height Δ_c = u_under(y_c) + Δ₁·(m > 1 ? κ : 1), u_under = the lower thread's own lift there (0 on the sphere, a bridge, an apex).
  const idxOf = new Map(path.segs.map((q, i) => [q.id, i]));
  const cfg = { R, s0: r.s0, rhoC, wc };
  const crossings = [], apicesBy = new Map(), dentsBy = new Map(), hullBy = new Map();
  const dLowOf = (m) => { let q = 0; for (let i = 1; i <= m; i++) q += Math.sqrt(stackRise(delta1, i, kappa) / delta1); return dent * q + (h - tc) / 2; };
  const hullOfSeg = (segId) => { const aps = apicesBy.get(segId) || []; let H = hullBy.get(segId); if (!H) { H = hullOf(aps, R); hullBy.set(segId, H); } return H; };
  const liftOf = (segId, x) => {   // the lower thread's own lift at x: final hull once the leg is complete (every apex of it is laid)
    const aps = apicesBy.get(segId); if (!aps || !aps.length) return 0;
    return envelopeAt(hullOfSeg(segId), x, R, r.s0, r.lamT);
  };
  const loadsBy = new Map();   // #5 Q5: loads of later threads on each leg, in lay order
  const loadedOf = (segId, x) => { const aps = apicesBy.get(segId); if (!aps || !aps.length) return 0; return loadedAt(hullOfSeg(segId), loadsBy.get(segId), x, R, r.s0, r.lamT); };
  const mat = { T, k, B, h };
  let nSup = { plateau: 0, bridge: 0, flight: 0, ground: 0 };
  let nLowPsi = 0, nApex = 0, mMax = 0, mOrdMax = 0, psiMin = 180, nOrderExc = 0;
  const order = path.crossings.map((c, i) => [c, i]).sort((p, q) => (idxOf.get(p[0].over) ?? 0) - (idxOf.get(q[0].over) ?? 0) || p[1] - q[1]);
  const recOf = new Map();
  for (const [c] of order) {
    const psiDeg = c.angleDeg != null ? c.angleDeg : 90;
    const apexKind = APEX_KINDS.has(c.kind) || (c.kind !== 'rail-parallel' && c.kind !== 'contact' && psiDeg >= consts.psiStarDeg);
    const over = segById.get(c.over), under = segById.get(c.under);
    if (!apexKind || !over || !under || over.type !== 'leg') { recOf.set(c, { id: c.id, kind: c.kind, over: c.over, under: c.under, psiDeg, m: 0, mOrd: c.stack ?? 1, delta: 0, cls: c.kind === 'rail-parallel' ? 'rail-parallel (0)' : c.kind === 'contact' ? 'contact (no lift, V8)' : 'no apex' }); continue; }
    const psi = psiDeg * Math.PI / 180;
    const ic = c.over === c.a ? c.iA : c.iB, iu = c.under === c.a ? c.iA : c.iB;
    const x = alongPolylineMm(over.pts, c.at, over.length, ic * stepOf(over));
    const xu = alongPolylineMm(under.pts, c.at, under.length, iu * stepOf(under));
    const orderExc = (idxOf.get(c.under) ?? -1) > (idxOf.get(c.over) ?? -1);
    if (orderExc) nOrderExc++;   // the lower thread laid later (18 on S8): its lift so far
    if (hullBy.has(c.under) && (idxOf.get(c.under) ?? -1) > (idxOf.get(c.over) ?? -1)) hullBy.delete(c.under);
    let mPatch = 1;
    for (const q of apicesBy.get(c.under) || []) if (Math.abs(xu - q.x) <= Math.max(LOCAL_STACK_WINDOW_W * w, wc / (2 * Math.max(1e-6, Math.sin(q.psiDeg * Math.PI / 180))))) mPatch = Math.max(mPatch, 1 + q.m);
    const m = choices.stackM === 'ordinal' ? Math.max(1, c.stack ?? 1) : choices.stackM === 'one' ? 1 : mPatch;
    // 'patchStack' (sweep only): the lower thread's lift counts only inside a contact patch (a real stack), not over its bridges
    // 'patch' (rigid support, rejected by Fable Q5; sweeps and the negative test), 'patchStack' (sweep only)
    const uUnder = under.type === 'leg' && (choices.stackM === 'patch' || (choices.stackM === 'patchStack' && mPatch > 1)) ? liftOf(c.under, xu) : 0;
    let D = choices.stackM === 'patch' || choices.stackM === 'patchStack' ? uUnder + delta1 * (m > 1 ? kappa : 1) : stackRise(delta1, m, kappa);
    // 'support' (Fable Q5 §2): the lower leg after its last apex is a string — z_sup = u_L,loaded(y) − sag, sag = 2σ_U·ab/(a+b)
    // (a, b to the nearest rigid points: its plateau edges, a landing); Δ_c = z_sup + Δ₁(F_c)·(m > 1 ? κ : 1), F_c = 2T·σ_U, two
    // iterations of σ_U from Δ_c. The load then kinks L's flight (loadedAt). Ground support: the dent d_low (§1.7).
    let zSup = 0, sag = 0, reg = { kind: 'ground', a: 0, b: 0, dir: 0 }, Fc = F, tcF = tc, d1F = delta1;
    if (choices.stackM === 'support') {
      if (under.type === 'leg' && (apicesBy.get(c.under) || []).length) {
        const HL = hullOfSeg(c.under);
        reg = regionOf(HL, xu, R, r.s0, r.lamT);
        // a load acts only up to the nearest rigid point on either side: the plateau edge of ANY own apex of L (not only the dominant one)
        if (reg.kind === 'flight' || reg.kind === 'bridge') {
          for (const q of HL.apices) {
            const lo = q.x - q.lp, hi = q.x + q.lp;
            const fwd = reg.kind === 'bridge' ? 1 : reg.dir;
            if (fwd * (lo - xu) > 0 || fwd * (hi - xu) > 0) reg.b = Math.min(reg.b, Math.max(0, Math.min(fwd > 0 ? lo - xu : xu - hi, Infinity)));
            if (fwd * (xu - hi) > 0 || fwd * (xu - lo) > 0) reg.a = Math.min(reg.a, Math.max(0, fwd > 0 ? xu - hi : lo - xu));
          }
        }
        if (reg.kind !== 'ground' && loadedOf(c.under, xu) <= r.s0 * (1 + 1e-9)) reg = { kind: 'ground', a: 0, b: 0, dir: 0 };
      }
      const u0 = reg.kind === 'ground' ? 0 : loadedOf(c.under, xu), le = reg.a + reg.b > 1e-12 ? reg.a * reg.b / (reg.a + reg.b) : 0;
      let sig = flight(delta1, R, r.s0).sigma;
      for (let it = 0; it < 3; it++) {
        sag = reg.kind === 'bridge' || reg.kind === 'flight' ? Math.min(u0, 2 * sig * le) : 0;
        zSup = Math.max(0, u0 - sag); Fc = 2 * T * sig; tcF = tcAt(Fc, h); d1F = rise1At(Fc, mat);
        D = zSup + d1F * (m > 1 && reg.kind !== 'ground' ? kappa : 1);   // on the sphere there is no stack under the point
        sig = flight(D, R, r.s0).sigma;
      }
      nSup[reg.kind]++;
    }
    // #5 Q2 (C.2): ℓ_p = min(σρ_c/sin²ψ, w_c/(2 sin ψ), max(w_c/2, c.lenMm/2)) — no longer than half the contact zone of the build
    const lpMax = choices.plateauCap === 'contact' ? Math.max(wc / 2, (c.lenMm ?? 0) / 2) : null;
    const ap = apexOf(D, psi, { ...cfg, lpMax });
    if (!apicesBy.has(c.over)) apicesBy.set(c.over, []);
    apicesBy.get(c.over).push({ x, ...ap, cid: c.id, m, psiDeg });
    hullBy.delete(c.over);
    const dLow = dLowOf(choices.stackM === 'support' && reg.kind === 'ground' ? 1 : m), half = Math.min(wc / (2 * Math.max(1e-6, Math.sin(psi))), Math.max(lpMax ?? 0, wc / 2));
    const onGround = choices.stackM !== 'support' || reg.kind === 'ground';
    // on the sphere the lower axis drops by d_low = δ + (h − t_c)/2 (§1.7); off the sphere (bridge, flight) only by its own section
    // compression (h − t_c(F_c))/2 — the sag is in the loaded profile (Fable Q5 §3 (c)), the wrap dent δ does not exist there
    // on its own crest (a stack, m > 1) the lower thread also settles by (1 − κ)·Δ₁(F) — the definition of κ (§1.6)
    const dUnder = onGround ? dLow : Math.max(0, (h - tcF) / 2) + (reg.kind === 'plateau' && m > 1 ? (1 - kappa) * d1F : 0);
    if (under.type === 'leg') { if (!dentsBy.has(c.under)) dentsBy.set(c.under, []); dentsBy.get(c.under).push({ x: xu, d: dUnder, half, cid: c.id }); }
    if (under.type === 'leg' && choices.stackM === 'support' && (reg.kind === 'bridge' || reg.kind === 'flight')) {
      if (!loadsBy.has(c.under)) loadsBy.set(c.under, []);
      loadsBy.get(c.under).push({ y: xu, sag, s: 2 * flight(D, R, r.s0).sigma, a: reg.a, b: reg.b, dir: reg.dir, bridge: reg.kind === 'bridge', cid: c.id });
    }
    const lowPsi = psiDeg < consts.psiStarDeg;
    if (lowPsi) nLowPsi++;
    nApex++; mMax = Math.max(mMax, m); mOrdMax = Math.max(mOrdMax, c.stack ?? 1); psiMin = Math.min(psiMin, psiDeg);
    recOf.set(c, { id: c.id, kind: c.kind, over: c.over, under: c.under, psiDeg, m, mPatch, mOrd: c.stack ?? 1, uUnder, support: reg.kind, zSup, sag, Fc, tcF, d1F, capRel: 1.5 * tcF - h / 2, onGround, orderExc,
      // V27 target: on the sphere t_c(F_c) (Δ₁ + d_low = t_c); off it Δ_c = z_sup + Δ₁(F) keeps the wrap dent δ(F) inside Δ₁(F) while the
      // lower axis drops only by its compression, so the identity is t_c(F_c) − δ(F_c) (printed; a question to Fable)
      gap27: onGround ? tcF : tcF - dentOf(Fc, T, B, k), delta: D, cap: capRise(m, tc, h), xApex: x, xUnder: xu, plateau: ap.lp,
      aFree: ap.lp + ap.x0s, F: 2 * T * ap.ss, dent: -dUnder, extraLen: extraLengthApex(ap, R, r.s0, r.lamT), lowPsi, cls: lowPsi ? `ψ < ψ* (position ±w/tan ψ)` : 'tent' });
  }
  for (const c of path.crossings) crossings.push(recOf.get(c));   // printed in the path order
  consts.orderExceptions = nOrderExc;
  consts.supportCounts = nSup;
  if (nOrderExc) notes.push(`${nOrderExc} crossings over a lower thread laid later (hidden / top-hole order): its lift so far is used`);
  const legs = {};
  const perSeg = {}, perThread = {};
  let total = { sphere: 0, axis: 0, lifted: 0 }, liftMax = 0, bridges = 0;
  for (const s of path.segs) {
    if (s.type !== 'leg') continue;
    const Hs = hullOf(apicesBy.get(s.id) || [], R);   // final (the lay-order cache may hold a partial hull of a later-laid lower thread)
    const leg = { apices: Hs.apices, edges: Hs.edges, bridges: Hs.bridges, dents: dentsBy.get(s.id) || [], loads: loadsBy.get(s.id) || [] };
    legs[s.id] = leg;
    bridges += Hs.bridges;
    const fn = (x) => loadedAt(leg, leg.loads, x, R, r.s0, r.lamT);
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
  return (x) => loadedAt(leg, leg.loads, x, R, s0, lamT);   // #5 Q5: the loaded profile (own envelope + later loads)
}
/** x ↦ own lift (the envelope before the loads of later threads) of leg segId — printed alongside the loaded profile. */
export function ownLiftFnFor(mech, segId) {
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
