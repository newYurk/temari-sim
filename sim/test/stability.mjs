// Round-off / perturbation stability (#35; the check defined in #34 item 5).
//
// A build must not change any discrete decision when its inputs move by round-off, and must be
// similar to itself under a pure change of scale. For each case the base build is compared with
//   eps: C, w, m, startRun × (1 + 1e−9) and λ + 1e−9   (round-off in every input)
//   sim: C, w, m, startRun × 1.25 (top level as a fraction of Q, so the pattern is similar)
// Discrete decisions must be identical: rows per set, number of legs, per leg joinMode / exitKind /
// exitFail / interiorXn / railKind / layMode / level, and every validator status (V-classes).
// Continuous outputs (leg points, stitch E/X, levels s, leg lengths) must agree to TOL_CONT
// (dimensionless: positions / R, lengths relative; the ×1.25 build is compared after scaling).
// A flipped branch moves points by ≥ 2e−4·R in every case seen in #35; the round-off floor of
// the recursive rail construction is ≤ 6e−6·R (bow) and ≈ 1e−9·R (geodesic).
// Raw-polyline turns: every rail leg reports the largest interior turn of its constructed
// polyline before the uniform resample (rawTurnMaxDeg); it must stay ≤ 20° (6a.18 kink limit),
// so a hook on a sub-sample tail (the top-leg 'atE' hook of #35: ≈90° raw, ≈1.4° at grid 96)
// cannot hide behind the resample.

export const TOL_CONT = 5e-5;
export const RAW_TURN_MAX_DEG = 20;

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

/** Compare builds A (base) and B (perturbed, lengths × k). Returns { discrete: [...], cont: {...} }. */
export function compareBuilds(A, B, k, runValidators) {
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
  const va = runValidators(A, A.path.ops.length - 1, null), vb = runValidators(B, B.path.ops.length - 1, null);
  const vbById = Object.fromEntries(vb.map((x) => [x.id, x.status]));
  for (const x of va) if (x.status !== vbById[x.id]) discrete.push(`${x.id}:${x.status}→${vbById[x.id]}`);
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
