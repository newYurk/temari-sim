// #5 lift mechanics (model/lift-spec.md §6 step 1): pure-function numbers of lift-spec v1 §1–2 at the defaults
// (T 1 N, k 3 N/mm², B 0.01 N·mm², h 0.464 mm, C 240 mm). Called from run.mjs group '5m'.
import * as M from '../src/mechanics.js';

export function mechanicsTests(check, fmt) {
  console.log('\n## #5 lift mechanics — pure functions (lift-spec v1 §1–2)');
  const R = 240 / (2 * Math.PI), w = 0.714, h = 0.464;
  const r = M.rise1({ R });
  check(Math.abs(r.delta1 - 0.266) <= 0.002 && Math.abs(r.dent - 0.058) <= 0.001 && Math.abs(r.x0 - 3.90) <= 0.01 && Math.abs(r.sigma - 0.117) <= 0.001
    && Math.abs(r.F - 0.234) <= 0.001 && Math.abs(r.tc - 0.371) <= 0.001 && r.iterations < 50,
    `T8 fixed point at the defaults: Δ₁ ${fmt(r.delta1, 4)}, δ ${fmt(r.dent, 4)}, x₀ ${fmt(r.x0, 3)}, σ ${fmt(r.sigma, 4)}, F ${fmt(r.F, 4)} N, t_c ${fmt(r.tc, 4)} mm (${r.iterations} steps)`);
  check(Math.abs(r.lamT - 0.577) < 0.001 && Math.abs(r.lamB - 0.340) < 0.001 && Math.abs(r.lb - 0.1) < 1e-9 && Math.abs(r.Pi - 2.887) < 0.001 && Math.abs(r.s0 - 0.00873) < 1e-5,
    `regime (§1.2): λ_T ${fmt(r.lamT, 3)}, λ_B ${fmt(r.lamB, 3)}, ℓ_b ${fmt(r.lb, 3)} mm, Π ${fmt(r.Pi, 3)}, s₀ ${fmt(r.s0, 5)} mm`);
  const rk = M.rise1({ R, k: Infinity });
  check(rk.dent === 0 && Math.abs(rk.delta1 - 0.315) <= 0.002 && Math.abs(rk.x0 - Math.sqrt(2 * R * rk.delta1)) < 1e-9,
    `k → ∞: δ = 0, Δ₁ ${fmt(rk.delta1, 4)} (spec 0.315), x₀ = √(2RΔ₁) = ${fmt(rk.x0, 3)} mm`);
  const rB = M.rise1({ R, B: 1e-12 });
  // lift-spec §6 step 1 expects «Δ₁ unchanged in the 4th digit» for B → 0; with the §1.2 dent formula δ(B → 0) = F/(2√(kT)) is
  // 16 % larger (0.068 vs 0.058 mm), so Δ₁ drops by 0.007 mm — printed, bounded by 0.01 mm (open question to Fable).
  check(Math.abs(rB.delta1 - r.delta1) <= 0.01, `B → 0: Δ₁ ${fmt(rB.delta1, 4)} vs ${fmt(r.delta1, 4)} (δ ${fmt(rB.dent, 4)} vs ${fmt(r.dent, 4)}); change ≤ 0.01 mm`);
  const Ts = [0.5, 0.75, 1, 1.5, 2].map((T) => M.rise1({ R, T }).delta1);
  check(Ts.every((v, i) => i === 0 || v < Ts[i - 1]) && Math.abs(Ts[0] - 0.341) <= 0.003 && Math.abs(Ts[4] - 0.196) <= 0.003,
    `T 0.5 → 2 N: Δ₁ decreases monotonically ${Ts.map((v) => fmt(v, 3)).join(' → ')} (table §1.3: 0.341 … 0.196)`);
  const table = [[0.5, 0.3, 0.267], [0.5, 10, 0.359], [1, 0.3, 0.197], [1, 1, 0.235], [1, 10, 0.289], [2, 1, 0.169], [2, 10, 0.221]];
  const tDev = table.map(([T, k, v]) => M.rise1({ R, T, k }).delta1 - v);
  console.log(`  Δ₁(T, k) table §1.3 deviations: ${table.map(([T, k], i) => `T${T}/k${k} ${tDev[i] >= 0 ? '+' : ''}${fmt(tDev[i], 3)}`).join(', ')}`);
  check(tDev.every((d) => Math.abs(d) <= 0.002), 'Δ₁(T, k) table §1.3 within ±0.002 mm');
  // tent (§1.4): u(x₀) = s₀, slope continuous at x₀, rigid limit u = Δ(1 − |x|/a)²
  const tp = M.tentProfile({ D: r.delta1, R, s0: r.s0, lamT: r.lamT });
  const e = 1e-7, jump = Math.abs((tp(r.x0 + e) - tp(r.x0)) / e - (tp(r.x0) - tp(r.x0 - e)) / e);
  check(Math.abs(tp(r.x0) - r.s0) < 1e-12 && jump <= 1e-6 && Math.abs(tp(0) - r.delta1) < 1e-15,
    `tent (§1.4): u(0) = Δ₁, u(x₀) = s₀, slope jump at x₀ ${jump.toExponential(1)} (finite difference)`);
  const tr = M.tentProfile({ D: rk.delta1, R }), a = Math.sqrt(2 * R * rk.delta1);
  check([0.5, 1.7, 3.3].every((x) => Math.abs(tr(x) - rk.delta1 * (1 - x / a) ** 2) < 1e-12), 'rigid limit: u = Δ(1 − |x|/a)², a = √(2RΔ)');
  // lengths: numeric vs analytic
  const dLn = M.extraLength(tp, -12, 12, R, 0.01), dLa = M.extraLength1(r.delta1, r.sigma);
  const { wc, rhoC } = M.crest(w, h, r.tc);
  const apx = M.apexOf(r.delta1, Math.PI / 2, { R, s0: r.s0, rhoC, wc });
  const dLp = M.extraLength((x) => M.tentAt(apx, x, R, r.s0, r.lamT), -12, 12, R, 0.01), dLpa = M.extraLengthApex(apx, R, r.s0, r.lamT);
  check(Math.abs(dLn - 0.0420) <= 0.0005 && Math.abs(dLn / dLa - 1) <= 0.015 && Math.abs(dLp / dLpa - 1) <= 0.01,
    `ΔL: numeric ${fmt(dLn, 5)} (spec 0.0420), (4/3)Δ₁σ ${fmt(dLa, 5)} (${fmt(100 * (dLn / dLa - 1), 2)} %: the landing tails); with the ψ 90° plateau numeric ${fmt(dLp, 5)} vs analytic (crest + flights + tails) ${fmt(dLpa, 5)} (${fmt(100 * (dLp / dLpa - 1), 2)} %)`);
  // ψ table (§1.5) and ψ*
  const psiT = [[90, 0.13, 3.96], [60, 0.17, 3.98], [45, 0.25, 4.02], [30, 0.50, 4.14], [20, 1.08, 4.40], [15, 1.72, 4.74]];
  const got = psiT.map(([d]) => M.apexOf(r.delta1, d * Math.PI / 180, { R, s0: r.s0, rhoC, wc }));
  check(psiT.every(([, lp, aa], i) => Math.abs(got[i].lp - lp) <= Math.max(0.02 * lp, 0.005) && Math.abs(got[i].lp + got[i].x0s - aa) <= 0.02 * aa),
    `ψ table §1.5 ±2 %: ℓ_p ${got.map((g) => fmt(g.lp, 3)).join(' / ')}; a ${got.map((g) => fmt(g.lp + g.x0s, 2)).join(' / ')} mm (ψ 90/60/45/30/20/15°)`);
  const ps = M.psiStar(r.sigma, rhoC, wc) * 180 / Math.PI;
  check(Math.abs(ps - 16.4) <= 0.1 && Math.abs(wc - 0.893) < 0.002 && Math.abs(rhoC - 1.07) < 0.01, `ψ* ${fmt(ps, 2)}° (spec 16.4°); w_c ${fmt(wc, 3)}, ρ_c ${fmt(rhoC, 3)} mm`);
  // stack and cap (§1.6, K18)
  const Dm = [1, 2, 3, 4].map((m) => M.stackRise(r.delta1, m, 0.8)), cap = [1, 2, 3, 4].map((m) => M.capRise(m, r.tc, h));
  check(Dm.every((v, i) => Math.abs(v - [0.27, 0.48, 0.69, 0.91][i]) <= 0.01 && v <= cap[i]),
    `Δ(m) ${Dm.map((v) => fmt(v, 3)).join(' / ')} (table §1.6: 0.27/0.48/0.69/0.91) ≤ Δ_cap ${cap.map((v) => fmt(v, 3)).join(' / ')} mm (K18)`);
  // hull (§1.8): two Δ₁ apices 6 mm apart bridge (mid 0.149), 12 mm apart — two tents, ≈ 0 between
  const mk = (x) => ({ x, ...M.apexOf(r.delta1, Math.PI / 2, { R, s0: r.s0, rhoC, wc }) });
  const H6 = M.hullOf([mk(0), mk(6)], R), H12 = M.hullOf([mk(0), mk(12)], R);
  const u6 = M.envelopeAt(H6, 3, R, r.s0, r.lamT), u12 = M.envelopeAt(H12, 6, R, r.s0, r.lamT);
  check(H6.bridges === 1 && Math.abs(u6 - 0.149) <= 0.001 && H12.edges.length === 0 && u12 < 0.001,
    `hull: apices 6 mm apart → bridge, mid ${fmt(u6, 4)} mm (spec 0.149); 12 mm apart → two tents, mid ${fmt(u12, 5)} mm`);
  const H3 = M.hullOf([mk(0), { ...mk(3), D: 0.05, lp: 0 }, mk(6)], R);
  check(H3.edges.some(([i, j]) => i === 0 && j === 2) && Math.abs(M.envelopeAt(H3, 3, R, r.s0, r.lamT) - u6) < 1e-12,
    'hull: a low apex under the bridge is covered (the bridge is one chord over all apices of the leg)');
  const dn = { x: 0, d: r.dent + (h - r.tc) / 2, half: wc / 2 };
  check(Math.abs(M.dentAt(dn, 0, r.lamT) + dn.d) < 1e-15 && M.dentAt(dn, 5, r.lamT) > -1e-3 * dn.d, `dent (§1.7): d_low ${fmt(dn.d, 3)} mm on the spot, → 0 over λ_T`);
}
