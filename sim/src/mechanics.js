// @ts-check
// Thread lift at crossings — mechanics (#5, stage 2.4; model/lift-spec.md = Fable lift-spec v1). Pure functions, no DOM.
// The mechanics is a radial field over the construction: it never moves a hole or changes a placement rule; it gives the
// height u(x) of the thread axis above its «on-site» level (R + h/2) along the already built path, and the lengths and
// contact checks that follow. Units: mm, N, N/mm² (Winkler stiffness k per unit thread length), N·mm² (bending B).
// Labels as in model/spec.md: (a) source, (b) analogue, (c) estimate, (d) assumed, (=) computed here.

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
