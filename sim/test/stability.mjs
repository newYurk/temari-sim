// Round-off / perturbation stability (#35; the check defined in #34 item 5).
//
// A build must not change any discrete decision when its inputs move by round-off, and must be
// similar to itself under a pure change of scale. For each case the base build is compared with
//   eps: C, w, m, startRun × (1 + 1e−9) and λ + 1e−9   (round-off in every input)
//   sim: C, w, m, startRun × 1.25 (top level as a fraction of Q, so the pattern is similar)
// Discrete decisions must be identical: rows per set, number of legs, per leg joinMode / exitKind /
// exitFail / interiorXn / railKind / layMode / level, and every validator status (V-classes).
// Continuous outputs (leg points, stitch E/X, levels s, leg lengths) must agree to TOL_CONT = 1e−6
// (dimensionless: positions / R, lengths relative; the ×1.25 build is compared after scaling; #36 acceptance).
// A flipped branch moves points by ≥ 2e−4·R in every case seen in #35. Since #36 the rails are built
// from the analytic arcs of row n−1 (no finite differences), so the round-off floor is ≲ 1e−7·R for
// bow and geodesic alike, on grid 96 and 384 (it was ≤ 6e−6·R for bow at 96 and ≈ 3e−2·R at 384).
// Raw-polyline turns: every rail leg reports the largest interior turn of its constructed
// polyline before the uniform resample (rawTurnMaxDeg); it must stay ≤ 20° (6a.18 kink limit),
// so a hook on a sub-sample tail (the top-leg 'atE' hook of #35: ≈90° raw, ≈1.4° at grid 96)
// cannot hide behind the resample.

export const TOL_CONT = 1e-6;
export const RAW_TURN_MAX_DEG = 20;

/** Cases of test 8d0f: grid N, perturbations, and pattern params on top of STABILITY_BASE. */
export const STABILITY_BASE = { C_mm: 240, w_mm: 0.714, startRun_mm: 35, rowsMode: 'untilEquator', topMode: 'fracQ', sTopFrac: 5 / 60 };
export const STABILITY_CASES = [
  { label: 'geo m0.5@96', N: 96, modes: ['eps', 'sim'], raw: { shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32, m_mm: 0.5 } },
  { label: 'bow0.32 m0.5@96', N: 96, modes: ['eps', 'sim'], raw: { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, m_mm: 0.5 } },
  { label: 'bow0.6 m1@96', N: 96, modes: ['eps'], raw: { shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, m_mm: 1 } },
  { label: 'geo m0.5@384', N: 384, modes: ['eps'], raw: { shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32, m_mm: 0.5 } },
  // #36: rails from the analytic arcs of row n−1 — grid 384 must be as stable as 96 for bow legs too.
  { label: 'bow0.32 m0.5@384', N: 384, modes: ['eps'], raw: { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, m_mm: 0.5 } },
  { label: 'bow0.6 m0.5@384', N: 384, modes: ['eps'], raw: { shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, m_mm: 0.5 } },
];
/** Every computeAll input of 8d0f as { N, raw } (the parallel runner precomputes them). */
export function stabilityBuilds() {
  const out = [];
  for (const c of STABILITY_CASES) {
    const raw = { ...STABILITY_BASE, ...c.raw };
    out.push({ N: c.N, raw });
    for (const mode of c.modes) out.push({ N: c.N, raw: perturb(raw, mode).v });
  }
  return out;
}

const LEG_FIELDS = ['joinMode', 'exitKind', 'exitFail', 'interiorXn', 'railKind', 'layMode', 'level'];

export function perturb(raw, mode) {
  const v = { ...raw };
  if (mode === 'eps') {
    for (const k of ['C_mm', 'w_mm', 'm_mm', 'startRun_mm']) v[k] *= 1 + 1e-9;
    v.bowLambda = (raw.bowLambda ?? 0) + 1e-9;
    return { v, k: 1 };
  }
  if (mode === 'sim') {
    for (const k of ['C_mm', 'w_mm', 'm_mm', 'startRun_mm']) v[k] *= 1.25;
    return { v, k: 1.25 };
  }
  throw new Error(`perturb: unknown mode ${mode}`);
}

/** Compare builds A (base) and B (perturbed, lengths × k). statusesOf(X) → { V-id: status } at the last op.
 *  Returns { discrete: [...], cont: {...} }. */
export function compareBuilds(A, B, k, statusesOf) {
  const discrete = [];
  const rows = (X) => {
    const o = {};
    for (const r of X.path.rounds) o[r.set] = Math.max(o[r.set] || 0, r.row);
    return JSON.stringify(o);
  };
  if (rows(A) !== rows(B)) discrete.push(`rows ${rows(A)}→${rows(B)}`);
  const la = A.path.segs.filter((s) => s.type === 'leg'), lb = B.path.segs.filter((s) => s.type === 'leg');
  if (la.length !== lb.length) discrete.push(`legs ${la.length}→${lb.length}`);
  const R = A.base.R;
  let pts = 0, ptsAt = '', len = 0, lenAt = '';
  for (let i = 0; i < Math.min(la.length, lb.length); i++) {
    const a = la[i], b = lb[i];
    for (const f of LEG_FIELDS) {
      if ((a[f] ?? null) !== (b[f] ?? null)) discrete.push(`${a.id} ${a.round}/${a.stitch} ${f}:${a[f]}→${b[f]}`);
    }
    if (a.pts.length !== b.pts.length) { discrete.push(`${a.id} npts ${a.pts.length}→${b.pts.length}`); continue; }
    for (let j = 0; j < a.pts.length; j++) {
      const d = Math.hypot(b.pts[j][0] - k * a.pts[j][0], b.pts[j][1] - k * a.pts[j][1], b.pts[j][2] - k * a.pts[j][2]) / (k * R);
      if (d > pts) { pts = d; ptsAt = `${a.id} ${a.round}/${a.stitch}`; }
    }
    const r = Math.abs(b.length / (k * a.length) - 1);
    if (r > len) { len = r; lenAt = `${a.id} ${a.round}/${a.stitch}`; }
  }
  let st = 0, stAt = '', lev = 0;
  const sa = A.path.stitches, sb = B.path.stitches;
  if (sa.length !== sb.length) discrete.push(`stitches ${sa.length}→${sb.length}`);
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    for (const key of ['E', 'X']) {
      if (!sa[i][key] || !sb[i][key]) continue;
      const d = Math.hypot(...sb[i][key].map((x, j) => x - k * sa[i][key][j])) / (k * R);
      if (d > st) { st = d; stAt = `${sa[i].round}/${sa[i].i}${key}`; }
    }
    if (Number.isFinite(sa[i].s) && Number.isFinite(sb[i].s)) lev = Math.max(lev, Math.abs(sb[i].s - k * sa[i].s) / (k * R));
  }
  const va = statusesOf(A), vb = statusesOf(B);
  for (const id of new Set([...Object.keys(va), ...Object.keys(vb)])) if (va[id] !== vb[id]) discrete.push(`${id}:${va[id]}→${vb[id]}`);
  return { discrete, cont: { pts, ptsAt, len, lenAt, st, stAt, lev } };
}

/** Largest raw-polyline interior turn over rail legs (see header). */
export function rawTurns(A) {
  let worst = 0, at = '—', bad = [];
  for (const s of A.path.segs) {
    if (s.type !== 'leg' || s.rawTurnMaxDeg == null) continue;
    if (s.rawTurnMaxDeg > worst) { worst = s.rawTurnMaxDeg; at = `${s.id} ${s.round}/${s.stitch} ${s.level} ${s.joinMode}/${s.exitKind} @${s.rawTurnAtMm.toFixed(3)}mm`; }
    if (s.rawTurnMaxDeg > RAW_TURN_MAX_DEG + 1e-9) bad.push(s.id);
  }
  return { worst, at, bad };
}
