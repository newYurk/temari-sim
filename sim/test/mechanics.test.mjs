// #5 lift mechanics (model/lift-spec.md §6 step 1): pure-function numbers of lift-spec v1 §1–2 at the defaults
// (T 1 N, k 3 N/mm², B 0.01 N·mm², h 0.464 mm, C 240 mm). Called from run.mjs group '5m'.
import * as M from '../src/mechanics.js';

export function mechanicsTests(check, fmt) {
  console.log('\n## #5 lift mechanics — pure functions (lift-spec v1 §1–2)');
  const R = 240 / (2 * Math.PI), w = 0.714, h = 0.464;
  const r = M.rise1({ R });
  // B 0.0155 N·mm² (lift-spec v1.1 §2 (b), measured analogue; v1 had 0.01 → Δ₁ 0.2664, δ 0.0583, Π 2.89)
  check(Math.abs(r.delta1 - 0.268) <= 0.002 && Math.abs(r.dent - 0.0567) <= 0.001 && Math.abs(r.x0 - 3.908) <= 0.01 && Math.abs(r.sigma - 0.1174) <= 0.001
    && Math.abs(r.F - 0.2349) <= 0.001 && Math.abs(r.tc - 0.371) <= 0.001 && r.iterations < 50,
    `T8 fixed point at the defaults: Δ₁ ${fmt(r.delta1, 4)}, δ ${fmt(r.dent, 4)}, x₀ ${fmt(r.x0, 3)}, σ ${fmt(r.sigma, 4)}, F ${fmt(r.F, 4)} N, t_c ${fmt(r.tc, 4)} mm (${r.iterations} steps)`);
  check(Math.abs(r.lamT - 0.577) < 0.001 && Math.abs(r.lamB - 0.379) < 0.001 && Math.abs(r.lb - Math.sqrt(0.0155)) < 1e-9 && Math.abs(r.Pi - 2.319) < 0.001 && Math.abs(r.s0 - 0.00873) < 1e-5,
    `regime (§1.2): λ_T ${fmt(r.lamT, 3)}, λ_B ${fmt(r.lamB, 3)}, ℓ_b ${fmt(r.lb, 3)} mm, Π ${fmt(r.Pi, 3)}, s₀ ${fmt(r.s0, 5)} mm`);
  const rk = M.rise1({ R, k: Infinity });
  check(rk.dent === 0 && Math.abs(rk.delta1 - 0.315) <= 0.002 && Math.abs(rk.x0 - Math.sqrt(2 * R * rk.delta1)) < 1e-9,
    `k → ∞: δ = 0, Δ₁ ${fmt(rk.delta1, 4)} (spec 0.315), x₀ = √(2RΔ₁) = ${fmt(rk.x0, 3)} mm`);
  const rB = M.rise1({ R, B: 1e-12 });
  // lift-spec v1.1 §6 step 1: B → 0 ⇒ δ × √(1 + 2√(Bk)/T) at fixed F (identity, 1e-9); Δ₁ after the fixed point −0.004…−0.010 mm (printed)
  const dRatio = M.dentOf(r.F, 1, 0, 3) / M.dentOf(r.F, 1, 0.0155, 3), dRatioF = Math.sqrt(1 + 2 * Math.sqrt(0.0155 * 3) / 1), dD = r.delta1 - rB.delta1;
  check(Math.abs(dRatio - dRatioF) < 1e-9 && dD >= 0.004 && dD <= 0.010,
    `B → 0: δ ratio ${fmt(dRatio, 4)} = √(1 + 2√(Bk)/T) ${fmt(dRatioF, 4)}; Δ₁ ${fmt(rB.delta1, 4)} vs ${fmt(r.delta1, 4)} (−${fmt(dD, 4)} mm, band 0.004–0.010)`);
  const Ts = [0.5, 0.75, 1, 1.5, 2].map((T) => M.rise1({ R, T }).delta1);
  check(Ts.every((v, i) => i === 0 || v < Ts[i - 1]) && Math.abs(Ts[0] - 0.342) <= 0.003 && Math.abs(Ts[4] - 0.197) <= 0.003,
    `T 0.5 → 2 N: Δ₁ decreases monotonically ${Ts.map((v) => fmt(v, 3)).join(' → ')} (v1.1: 0.342 … 0.197; the §1.3 table at B 0.01: 0.341 … 0.196)`);
  const table = [[0.5, 0.3, 0.267], [0.5, 10, 0.359], [1, 0.3, 0.197], [1, 1, 0.235], [1, 10, 0.289], [2, 1, 0.169], [2, 10, 0.221]];
  const tDev = table.map(([T, k, v]) => M.rise1({ R, T, k }).delta1 - v);
  console.log(`  Δ₁(T, k) table §1.3 deviations: ${table.map(([T, k], i) => `T${T}/k${k} ${tDev[i] >= 0 ? '+' : ''}${fmt(tDev[i], 3)}`).join(', ')}`);
  // §1.3 is an illustration at B 0.01 (lift-spec v1.1 C.3: acceptance by formulas and limits, not reprinted numbers)
  check(tDev.every((d) => Math.abs(d) <= 0.003), 'Δ₁(T, k) table §1.3 (B 0.01) within ±0.003 mm at B 0.0155');
  // review of lift-spec v1.1 §1 row 4: the t_c law in the reduced form (force through the pressure) — at ×k (F ×k², w, h ×k)
  // t_c ×k exactly; with T ×k², B ×k⁴ (k_wrap ×1) every length of rise1 is ×k and σ, Π unchanged
  {
    const F0 = 0.2349, tc1 = M.tcAt(F0, h, w), rel = (a, b) => Math.abs(a / b - 1);
    const ks = [1.25, 2, 0.8], okTc = ks.every((k) => rel(M.tcAt(F0 * k * k, h * k, w * k), k * tc1) <= 1e-9);
    const rs = ks.map((k) => [k, M.rise1({ R: R * k, T: k * k, k: 3, B: 0.0155 * k ** 4, h: h * k, w: w * k })]);
    const okR = rs.every(([k, q]) => ['delta1', 'x0', 'tc', 'dent', 'a1', 'lamT', 'lamB', 'lb', 's0'].every((f) => rel(q[f], k * r[f]) <= 1e-6) && rel(q.sigma, r.sigma) <= 1e-6 && rel(q.Pi, r.Pi) <= 1e-6);
    check(okTc && okR && Math.abs(M.tcAt(F0, 0.464, 0.714) - (0.491 - 0.068 * Math.log(0.244 * F0 * M.GF_PER_N))) < 1e-15,
      `t_c at equal pressure: t_c(F·k², h·k, w·k) = k·t_c (1e-9) for k ${ks.join(' / ')}; rise1 with T ×k², B ×k⁴: Δ₁, x₀, t_c, δ, a₁, λ_T, λ_B, ℓ_b, s₀ ×k, σ, Π ×1 (1e-6); at w₅, h₅ the published law`);
  }
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
  // v1.1 §6: numeric (step 0.01) vs the full analytic (crest + flights + tails) ≤ 0.5 % (class (i)); (4/3)Δ₁σ is a lower bound (−1…1.5 %)
  const dLfull = M.extraLengthApex({ D: r.delta1, lp: 0, kc: 0, Ds: r.delta1, ss: r.sigma }, R, r.s0, r.lamT);
  check(Math.abs(dLn - 0.0425) <= 0.0005 && dLn >= dLa && dLn / dLa - 1 <= 0.015 && Math.abs(dLn / dLfull - 1) <= 0.005 && Math.abs(dLp / dLpa - 1) <= 0.005,
    `ΔL: numeric ${fmt(dLn, 5)} (spec 0.0420), (4/3)Δ₁σ ${fmt(dLa, 5)} (${fmt(100 * (dLn / dLa - 1), 2)} %: the landing tails), full analytic ${fmt(dLfull, 5)} (${fmt(100 * (dLn / dLfull - 1), 2)} %); with the ψ 90° plateau numeric ${fmt(dLp, 5)} vs analytic (crest + flights + tails) ${fmt(dLpa, 5)} (${fmt(100 * (dLp / dLpa - 1), 2)} %)`);
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

/** #5 step 3: the mechanics layer and V25–V27, K18, K19 on whole patterns in liftMode 'ideal' (group '5i').
 *  Support rule (lift-spec v1.1 §1.6, Fable Q5): the upper thread rests on the loaded lower thread, which sags between its
 *  supports under F = 2Tσ (bridges are strings, not rigid). V20 at λ 0.6 is the known λ/μ fail (A2). */
export function mechanicsIdealTests(check, fmt, { computeAll, recipe, runValidators, V_HOOKS }) {
  console.log('\n## #5 lift mechanics — ideal mode on whole patterns (V25–V27, K18, K19)');
  const cases = [
    // name, params, m_max, known fails, ψ < ψ*, [median band], [max band], [lifted − axis % band], K19 status
    ['engine defaults (braid)', {}, 1, [], 18, [0.2, 0.35], [0.3, 0.6], [0.3, 0.5], 'info'],
    // Fable Q5 §4 expectation for S8: median ≈ 0.3, max 0.5–0.8 mm, +0.4–0.6 % length (measured max 0.47: the lower thread sags)
    ['S8 site view (braid, bow λ 0.32, m 0.5)', { topRule: 'braid', m_mm: 0.5, shoulderForm: 'bow', bowLambda: 0.32 }, 2, [], 'S8', [0.2, 0.35], [0.4, 0.8], [0.4, 0.7], 'info'],
    ['fan, bow λ 0.32, m 0.5', { topRule: 'fan', m_mm: 0.5, shoulderForm: 'bow', bowLambda: 0.32 }, 3, [], 'fan', [0.2, 0.35], [0.4, 0.8], [0.4, 0.7], 'info'],
    // tall plateau stacks (m up to 13): K19 warns (> 1.2 mm)
    ['stress: braid, bow λ 0.6, m 1', { topRule: 'braid', m_mm: 1, shoulderForm: 'bow', bowLambda: 0.6 }, 13, ['V20'], 192, [0.25, 0.5], [1.2, 2], [1.5, 2.5], 'warn'],
  ];
  for (const [name, raw, mMax, knownFails, nLow, bMed, bMax, bPct, k19] of cases) {
    const A = computeAll(recipe, { ...raw, liftMode: 'ideal' }), MX = A.mechanics;
    const V = Object.fromEntries(runValidators(A, 'all', null).map((v) => [v.id, v]));
    const fails = Object.values(V).filter((v) => v.status === 'fail' && !knownFails.includes(v.id)).map((v) => v.id);
    const N19 = V.K19.numbers, inB = (x, [a, b]) => x >= a && x <= b;
    const T = MX.lengths.total, pct = 100 * (T.lifted - T.axis) / T.axis;
    let clone = true; try { structuredClone(MX); } catch { clone = false; }
    check(MX.mode === 'ideal' && !MX.displayOnly && clone && MX.parents[0] === A.path.stamp && MX.mMax === mMax && (typeof nLow === 'string' || MX.nLowPsi === nLow)
      && ['V11', 'V14', 'V25', 'V26', 'V27', 'K18'].every((id) => V[id].status === 'pass') && V.K19.status === k19 && fails.length === 0
      && inB(N19.median, bMed) && inB(N19.dMax, bMax) && T.sphere <= T.axis && T.axis < T.lifted && inB(pct, bPct),
      `${name}: m_max ${MX.mMax} (c.stack max ${MX.mOrdMax}), apices ${MX.nApex}, ψ < ψ* ${MX.nLowPsi}, Δ_c median ${fmt(N19.median, 3)} / max ${fmt(N19.dMax, 3)} mm (K19 ${V.K19.status}), lifted − axis ${fmt(pct, 3)} %; V25/V26/V27/K18 pass (V27 outside ${V.V27.numbers.out} of ${V.V27.numbers.n}), other fails ${fails.join(',') || 'none'}`);
  }
  // Review of lift-spec v1.1 §2: the isolation predicate by loads (reach ℓ_p + x₀ + 3λ_T, no load window over it) — regression
  // where the branch always runs: S8 with one row per set (A1 + B1, no later loads on B1): 4 isolated unloaded tents at λ 0.32
  // and 0.6 (B1 over A1 near the tips), 0 at λ 0 (every apex near a leg end or in a bridge); ×1.25 without scaling the mechanics
  // — the same 4 (no flip: the tail is 3λ_T, not an absolute 12λ_T)
  {
    const { setIsoTailForTest } = V_HOOKS;
    const one = (lam, k = 1, x = {}) => computeAll(recipe, { C_mm: 240 * k, w_mm: 0.714 * k, m_mm: 0.5 * k, startRun_mm: 35 * k, rowsMode: 'count', rowsCount: 1, liftMode: 'ideal',
      shoulderForm: lam ? 'bow' : 'geodesic', bowLambda: lam || undefined, muWrap: Math.max(0.32, lam), ...x });
    const V5 = (A) => Object.fromEntries(runValidators(A, 'all', null).filter((v) => ['V25', 'V26'].includes(v.id)).map((v) => [v.id, v]));
    const res = [0, 0.32, 0.6].map((lam) => [lam, V5(one(lam))]), s125 = V5(one(0.6, 1.25));
    const ok = res.every(([lam, V]) => V.V25.status === 'pass' && V.V26.status === 'pass' && V.V25.numbers.isolated === (lam ? 4 : 0) && V.V25.numbers.ownChecked === (lam ? 4 : 0)
      && (!lam || (V.V25.numbers.symMax <= 1e-9 * 0.714 && V.V25.numbers.halfDevMax <= 0.01 && V.V26.numbers.isoDev <= 0.005)))
      && s125.V25.numbers.isolated === 4 && s125.V25.status === 'pass' && s125.V26.status === 'pass';
    check(ok, `1 row per set (group 5i regression): isolated (unloaded) ${res.map(([lam, V]) => `λ${lam} ${V.V25.numbers.isolated}`).join(', ')}; ×1.25 λ0.6 ${s125.V25.numbers.isolated}; own profile: asymmetry ≤ ${res.map(([, V]) => V.V25.numbers.symMax.toExponential(0)).join('/')} mm, |d − d*| ≤ ${res.map(([, V]) => fmt(V.V25.numbers.halfDevMax, 4)).join('/')} mm (closed form ℓ_p + y*; ${res.filter(([l]) => l).map(([, V]) => `${fmt(V.V25.numbers.halfLo, 3)}…${fmt(V.V25.numbers.halfHi, 3)}`).join(', ')}·√(2RΔ)), ΔL vs analytic ${res.map(([, V]) => fmt(100 * V.V26.numbers.isoDev, 2)).join('/')} %`);
    setIsoTailForTest(12);
    let n12; try { n12 = V5(one(0.32)).V25.numbers.isolated; } finally { setIsoTailForTest(3); }
    check(n12 === 0, `negative: the isolation tail 12λ_T (absolute ≈ 6.9 mm) → isolated ${n12} instead of 4 at λ 0.32`);
  }
  // loaded profile checks (V25): ≤ own, = own outside the windows, own − loaded = sag at a load point; negative: loadedAt without the sag
  {
    const A = computeAll(recipe, { topRule: 'braid', m_mm: 0.5, shoulderForm: 'bow', bowLambda: 0.32, liftMode: 'ideal' });
    const V = runValidators(A, 'all', null).find((v) => v.id === 'V25'), n = V.numbers;
    M.setLoadedNoSagForTest(true);
    let Vm; try { Vm = runValidators(A, 'all', null).find((v) => v.id === 'V25'); } finally { M.setLoadedNoSagForTest(false); }
    check(V.status === 'pass' && n.loadedChecked > 100 && n.sagDevMax <= 1e-9 * 0.714 && n.overOwnMax <= 1e-9 * 0.714 && n.offWinMax <= 1e-9 * 0.714 && n.isolated === 0 && n.dlShort === 0
      && Vm.status === 'fail' && Vm.numbers.sagDevMax > 1e-3,
      `S8 λ0.32 uwagake: loaded profile at ${n.loadedChecked} load points on ${n.loadLegs} legs — sag dev ${n.sagDevMax.toExponential(0)} mm, above own ${n.overOwnMax}, off-window ${n.offWinMax}; isolated 0, own-checked ${n.ownChecked}; ΔL_loaded/ΔL_own ≥ ${fmt(n.dlRatioMin, 3)}; negative (loadedAt without the sag): V25 fail, sag dev ${fmt(Vm.numbers.sagDevMax, 3)} mm`);
    // V26: the lengths table (0.01 mm between the kinks) vs 0.002 mm on every leg with loads (class (i), ≤ 0.5 %); the loaded
    // profile has no step (a step would make ΔL grow as 1/step: 0.1 → 0.002 mm must move the total by < 0.5 % too)
    let worst = 0, wid = '', nL = 0, t1 = 0, t2 = 0, tc = 0;
    for (const [id, leg] of Object.entries(A.mechanics.legs)) {
      if (!leg.loads.length || !leg.apices.length) continue;
      const s = A.path.segs.find((q) => q.id === id), fn = M.liftFnFor(A.mechanics, id), K = M.kinksOf(leg);
      const e1 = A.mechanics.lengths.perSeg[id].extra, e2 = M.extraLength(fn, 0, s.length, A.base.R, 0.002, K);
      nL++; t1 += e1; t2 += e2; tc += M.extraLength(fn, 0, s.length, A.base.R, 0.1, K);
      if (Math.abs(e1 / e2 - 1) > worst) { worst = Math.abs(e1 / e2 - 1); wid = id; }
    }
    check(nL > 20 && worst <= 0.005 && Math.abs(tc / t2 - 1) <= 0.01,
      `V26 convergence on ${nL} loaded legs: table (0.01 mm) vs 0.002 mm worst ${fmt(100 * worst, 3)} % (${wid}); total ${fmt(t1, 3)} vs ${fmt(t2, 3)} mm; at 0.1 mm ${fmt(tc, 3)} mm (${fmt(100 * Math.abs(tc / t2 - 1), 2)} %)`);
  }
  // Fable Q5 §4 negative test: a rigid support (the lower thread's hull held fixed, choice 'patch') rebuilds the staircase
  const A8 = computeAll(recipe, { topRule: 'braid', m_mm: 0.5, shoulderForm: 'bow', bowLambda: 0.32, liftMode: 'ideal' });
  const Mr = M.buildMechanics(A8.params, A8.path, A8.base, { ...M.LIFT_CHOICES, stackM: 'patch' });
  const dR = Math.max(...Mr.crossings.map((c) => c.delta)), dS = Math.max(...A8.mechanics.crossings.map((c) => c.delta));
  check(dR > 1.5 && dS < 0.8, `rigid support (negative): S8 max Δ_c ${fmt(dR, 3)} mm > 1.5 (staircase) vs support rule ${fmt(dS, 3)} mm`);
  // display mode: the former tent, V25–V27 and K18/K19 n/a, the mechanics layer carries no data
  const D = computeAll(recipe, { liftMode: 'display' }), VD = Object.fromEntries(runValidators(D, 'all', null).map((v) => [v.id, v]));
  check(D.mechanics.displayOnly && ['V25', 'V26', 'V27', 'K18', 'K19'].every((id) => VD[id].status === 'n/a') && VD.V11.status === 'pass',
    'display mode: mechanics displayOnly, V25–V27 / K18 / K19 n/a, V11 chain pass');
  // measured: lift1_w sets Δ₁ = lift1_w·w
  const Mm = computeAll(recipe, { lift1_w: 0.3 }).mechanics;
  check(Mm.mode === 'measured' && Math.abs(Mm.consts.delta1 - 0.3 * Mm.consts.w) < 1e-12, `measured: lift1_w 0.3 → Δ₁ ${fmt(Mm.consts.delta1, 4)} mm`);
}
