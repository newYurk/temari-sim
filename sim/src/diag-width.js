// Diagnostics for #4 (owner: "why is it crowded near the pole already from row 3?"). Read-only: nothing here feeds the
// construction or any pass/fail decision.
//
// 1. Top-width growth W_n − W_(n−1) (W = eOff − xOff of the top stitch on one line, same set) decomposed EXACTLY by the
//    cluster construction of needleSides (§5.3 (1)): hole = cluster edge ± (w/2 flush | gap/2 squeeze), cluster edge =
//    the outermost member interval (or the own marking). Per side, with S = the thread forming the cluster edge in row n:
//      Δ(side) = drift + halfTrace + clearance + merge   (telescoping, exact up to round-off)
//      drift     = y_S(n) − y_S(n−1): how far S moves outward between the needle lines of rows n−1 and n (they are w
//                  apart in s), ≈ w·tan βT, βT = S's angle to the meridian there;
//      halfTrace = edge of S's trace − y_S(n) ≈ (w/2)/cos βT (both sides together: the trace width w/sin(90° − βT));
//      clearance = hole − cluster edge: w/2 (flush) or gap/2 (needle between threads, squeeze);
//      merge     = y_S(n−1) − hole(n−1): 0 when S is the row-(n−1) leg at that hole (a new thread that starts/ends
//                  there); −(halfTrace + clearance of row n−1) when S is an OLDER thread that already bounded row n−1
//                  (the new trace and clearance merge with the old ones instead of adding); anything else = S was
//                  elsewhere on line n−1. S with no trace on line n−1 ('new'): drift = 0, merge = y_S(n) − hole(n−1).
//    remainder = Δ(side) − Σ terms is printed; it is round-off (the suite asserts ≤ 1e−6 mm).
// 2. U14 onset n₀ (top holes under the other set's threads): observed (first row with a set-collision record, split
//    by mechanism) vs causal geometric: first n with s_T(n) ≥ s_cross − (w/2)/sin ψ_cross, where the other set's legs
//    reach the line at s_cross under angle ψ_cross (topmost such point), plus the span meet of the two sets' tops.
import { unit, dot, sub, add, mul, dist, halfLineAt, FRAME_N, fPoint, fPerp, fS, fToward } from './geom.js';

/** #53 case 1: the kiku frame of the build being decomposed (set by widthDecomposition / u14Onset from A.layout.program). */
let DF = FRAME_N;

const TOL = 1e-9;

function occsOf(st) { return [...(st.sides?.cluster || []), ...(st.sides?.ignored || [])]; }

/** Cluster edge (hi for sgn +1, lo for −1) and the member forming it. */
function edgeOf(st, sgn) {
  let best = null;
  for (const o of st.sides.cluster) {
    const v = sgn > 0 ? o.hi : o.lo;
    if (!best || sgn * (v - best.v) > 0) best = { v, o };
  }
  return best;
}

/** Angle (deg, 0…90) between polyline pts near point q and direction dir (projected on the tangent plane at q). */
function angleToDir(pts, q, dir) {
  let bi = 1, bd = Infinity;
  for (let i = 1; i < pts.length; i++) { const d = dist(q, pts[i - 1]) + dist(q, pts[i]); if (d < bd) { bd = d; bi = i; } }
  const u = unit(q);
  const t = sub(pts[bi], pts[bi - 1]);
  const tt = sub(t, mul(u, dot(t, u))), dd = sub(dir, mul(u, dot(dir, u)));
  const a = Math.hypot(...tt), b = Math.hypot(...dd);
  if (a < 1e-15 || b < 1e-15) return null;
  return Math.acos(Math.min(1, Math.abs(dot(tt, dd)) / (a * b))) * 180 / Math.PI;
}

/** Angle of polyline pts to the meridian near point q (deg). */
function angleToMeridian(pts, q) {
  let bi = 1, bd = Infinity;
  for (let i = 1; i < pts.length; i++) { const d = dist(q, pts[i - 1]) + dist(q, pts[i]); if (d < bd) { bd = d; bi = i; } }
  const u = unit(q);
  const t = sub(pts[bi], pts[bi - 1]);
  const tt = sub(t, mul(u, dot(t, u)));
  const mer = DF.atN ? sub([0, 0, 1], mul(u, u[2])) : fToward(DF, u);     // toward the kiku centre along its meridian
  const a = Math.hypot(...tt), b = Math.hypot(...mer);
  if (a < 1e-15 || b < 1e-15) return null;
  const c = Math.abs(dot(tt, mer)) / (a * b);
  return Math.acos(Math.min(1, c)) * 180 / Math.PI;
}

function sideTerms({ st, p, sgn, segById, R, phi, m }) {
  const holeN = sgn > 0 ? st.eOff : st.xOff, holeP = sgn > 0 ? p.eOff : p.xOff;
  const delta = sgn * (holeN - holeP);
  const ed = edgeOf(st, sgn);
  const o = ed.o;
  const clearance = sgn * (holeN - ed.v);
  const squeeze = (st.sides.squeeze || []).find((q) => q.side === (sgn > 0 ? 'E' : 'X')) || null;
  let S = o.seg, yN, half, yP = null, kind;
  if (o.kind === 'marking') { yN = 0; half = m / 2; yP = 0; kind = 'marking'; }
  else {
    yN = o.y; half = sgn * (ed.v - yN);
    const g = segById.get(S);
    const Hp = sgn > 0 ? p.E : p.X;
    if (g && g.type === 'leg' && (dist(g.to, Hp) < TOL || dist(g.from, Hp) < TOL)) { yP = holeP; kind = 'row n−1 leg at the hole'; }
    else if (g && g.type === 'leg' && (dist(g.to, p.E) < TOL || dist(g.from, p.X) < TOL || dist(g.to, p.X) < TOL || dist(g.from, p.E) < TOL)) {
      yP = dist(g.to, p.E) < TOL || dist(g.from, p.E) < TOL ? p.eOff : p.xOff; kind = 'row n−1 leg at the other hole';
    } else {
      const cands = occsOf(p).filter((q) => q.seg === S);
      if (cands.length) { yP = cands.reduce((a, q) => (Math.abs(q.y - yN) < Math.abs(a.y - yN) ? q : a)).y; kind = `older thread (row ${g?.row ?? '?'})`; }
      else kind = 'new (no trace on line n−1)';
    }
  }
  const drift = yP == null ? 0 : sgn * (yN - yP);
  const merge = yP == null ? sgn * (yN - holeP) : sgn * (yP - holeP);
  const sum = drift + half + clearance + merge;
  // βT in the needle-line frame: angle between S and the normal of the needle line (line k's meridian at the line point C),
  // the frame in which drift ≈ w·tan βT (the local meridian at the offset point is rotated by their convergence near the pole).
  let betaDeg = null;
  const g = segById.get(S);
  if (g?.pts && o.kind !== 'marking') betaDeg = angleToDir(g.pts, fPerp(R, DF, st.s, phi, yN), fToward(DF, fPoint(R, DF, st.s, phi)));
  return { delta, drift, halfTrace: half, clearance, merge, remainder: delta - sum, edgeSeg: S, edgeKind: o.kind, edgeRound: g?.round ?? null,
    edgeStitch: g?.stitch ?? null, edgeRow: g?.row ?? null, source: kind, betaDeg, squeeze: squeeze ? { gap: squeeze.gap, noRoom: !!squeeze.noRoom } : null };
}

/** Per set, per row n ≥ 2 (top stitch on the line of stitch 2 of each round, not the closing one): exact decomposition. */
export function widthDecomposition(A) {
  const P = A.path, R = A.base.R, w = A.params.w_mm, m = A.params.m_mm;
  const segById = new Map(P.segs.map((s) => [s.id, s]));
  const PG = A.layout.program, phiOf = (k) => PG.az[((k % PG.v) + PG.v) % PG.v];   // #53: half-line azimuths about the kiku centre
  DF = PG.frame;
  const out = [];
  for (const set of [...new Set(P.rounds.map((r) => r.set))]) {
    const rounds = P.rounds.filter((r) => r.set === set).sort((a, b) => a.row - b.row);
    const topOf = (r) => r.stitchIdx.map((i) => P.stitches[i]).find((q) => q.level === 'top' && q.i === 2);
    for (let j = 1; j < rounds.length; j++) {
      const st = topOf(rounds[j]), p = topOf(rounds[j - 1]);
      if (!st || !p || st.line !== p.line) continue;
      const phi = phiOf(st.line);
      const E = sideTerms({ st, p, sgn: 1, segById, R, phi, m }), X = sideTerms({ st, p, sgn: -1, segById, R, phi, m });
      const W = st.eOff - st.xOff, Wp = p.eOff - p.xOff;
      const tot = (k) => E[k] + X[k];
      out.push({ set, row: rounds[j].row, line: st.line, s: st.s, W, Wp, dW: W - Wp, E, X,
        drift: tot('drift'), halfTrace: tot('halfTrace'), clearance: tot('clearance'), merge: tot('merge'), remainder: (W - Wp) - (tot('drift') + tot('halfTrace') + tot('clearance') + tot('merge')),
        w });
    }
  }
  return out;
}

/** Topmost point where legs of `otherSet` reach the meridian of line phi (crossing or touching it), with angle ψ. */
function reachLine(P, otherSet, phi, R) {
  const hl = DF.atN ? null : halfLineAt(DF.c, DF.z0, phi);
  const nMer = DF.atN ? [-Math.sin(phi), Math.cos(phi), 0] : hl.n, toward = DF.atN ? [Math.cos(phi), Math.sin(phi), 0] : hl.dir;
  let best = null;
  for (const g of P.segs) {
    if (g.type !== 'leg' || g.set !== otherSet || !g.pts || g.pts.length < 2) continue;
    const lat = (q) => dot(unit(q), nMer);
    for (let i = 1; i < g.pts.length; i++) {
      const a = lat(g.pts[i - 1]), b = lat(g.pts[i]);
      const onA = Math.abs(a) * R < 1e-6, onB = Math.abs(b) * R < 1e-6;
      if (!(a * b < 0 || onA || onB)) continue;
      const t = onA ? 0 : onB ? 1 : a / (a - b);
      const q = add(mul(g.pts[i - 1], 1 - t), mul(g.pts[i], t));
      if (dot(unit(q), toward) <= 0) continue;           // the other half of the great circle
      const s = fS(R, DF, q);
      const psi = angleToMeridian(g.pts, q);
      if (psi == null) continue;
      if (!best || s < best.s - 1e-9) best = { s, psiDeg: psi, seg: g.id, round: g.round, stitch: g.stitch, level: g.level };
    }
  }
  return best;
}

/** All crossings of legs of otherSet with the polyline track [{ p, s }] (hole positions row by row, plus one extrapolated
 *  piece): { s (interpolated track level), psiDeg (angle leg–track), seg, order (lay order), … }. */
function crossTrack(P, otherSet, track) {
  const out = [];
  const order = new Map(P.segs.map((g, i) => [g.id, i]));
  const legs = P.segs.filter((g) => g.type === 'leg' && g.set === otherSet && g.pts && g.pts.length > 1);
  for (let j = 1; j < track.length; j++) {
    const a = unit(track[j - 1].p), b = unit(track[j].p);
    const nrm = cross3(a, b), ln = Math.hypot(...nrm);
    if (ln < 1e-15) continue;
    const nn = mul(nrm, 1 / ln);
    const ab = Math.acos(Math.min(1, dot(a, b)));
    for (const g of legs) {
      for (let i = 1; i < g.pts.length; i++) {
        const p0 = unit(g.pts[i - 1]), p1 = unit(g.pts[i]);
        const d0 = dot(p0, nn), d1 = dot(p1, nn);
        if (d0 * d1 > 0 || (d0 === 0 && d1 === 0)) continue;
        const t = d0 / (d0 - d1);
        const q = unit(add(mul(p0, 1 - t), mul(p1, t)));
        const aq = Math.acos(Math.min(1, dot(a, q))), qb = Math.acos(Math.min(1, dot(q, b)));
        if (Math.abs(aq + qb - ab) > 1e-9) continue;
        const psi = angleToDir(g.pts, q, sub(b, a));
        if (psi == null || psi < 1e-6) continue;
        out.push({ s: track[j - 1].s + (ab > 0 ? aq / ab : 0) * (track[j].s - track[j - 1].s), psiDeg: psi, seg: g.id, round: g.round, stitch: g.stitch, level: g.level, order: order.get(g.id) });
      }
    }
  }
  return out;
}
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** U14 onset per set: observed (first row with a set-collision record at a top hole, by mechanism) vs causal. */
export function u14Onset(A) {
  const P = A.path, R = A.base.R, w = A.params.w_mm;
  const sets = [...new Set(P.rounds.map((r) => r.set))];
  const PG = A.layout.program, phiOf = (k) => PG.az[((k % PG.v) + PG.v) % PG.v];   // #53: half-line azimuths about the kiku centre
  DF = PG.frame;
  const out = [];
  for (const set of sets) {
    const other = sets.find((x) => x !== set);
    const rounds = P.rounds.filter((r) => r.set === set).sort((a, b) => a.row - b.row);
    const tops = rounds.map((r) => r.stitchIdx.map((i) => P.stitches[i]).filter((q) => q.level === 'top'));
    let obsAny = null, obsLeg = null, obsSpan = null;
    for (let j = 0; j < rounds.length; j++) {
      const recs = tops[j].flatMap((q) => q.sides.setCollision || []);
      if (!recs.length) continue;
      obsAny ??= rounds[j].row;
      const kinds = recs.map((c) => c.kind);
      if (obsLeg == null && kinds.some((k) => k === 'crossing' || k === 'graze')) obsLeg = rounds[j].row;
      if (obsSpan == null && kinds.some((k) => k === 'channel' || k === 'hole-entry' || k === 'hole-exit' || k === 'hole-start')) obsSpan = rounds[j].row;
    }
    const st2 = tops[0]?.find((q) => q.i === 2);
    const line = st2 ? st2.line : null;
    const sT = rounds.map((r, j) => tops[j].find((q) => q.i === 2)?.s ?? null);
    // Causal (legs): the "line" is the track of this set's top holes on line k (E holes row by row, and X holes) — the
    // places a top hole can be. The other set's legs cross that track at s_cross under angle ψ; a hole at s_T(n) lies under
    // the foreign trace from s_cross − (w/2)/sin ψ on. The marking meridian itself is reached by the other set's legs only at
    // their bottoms (printed as meridianReach) — far below the tops, not a cause.
    let causal = null, meridianReach = null;
    if (other && line != null) {
      meridianReach = reachLine(P, other, phiOf(line), R);
      const order = new Map(P.segs.map((g, i) => [g.id, i]));
      const tr = rounds.map((r, j) => ({ q: tops[j].find((x) => x.i === 2), first: order.get(r.segIds[0]), row: r.row })).filter((x) => x.q);
      const hits = [];
      for (const [side, key, offKey] of [['E', 'E', 'eOff'], ['X', 'X', 'xOff']]) {
        const track = tr.map(({ q }) => ({ p: q[key], s: q.s }));
        // one extrapolated piece past the last row (level s_T + w, offset continued linearly): a crossing just beyond the
        // last row can already cover its hole within (w/2)/sin ψ.
        if (tr.length >= 2) {
          const a = tr[tr.length - 2].q, b = tr[tr.length - 1].q;
          track.push({ p: fPerp(R, DF, 2 * b.s - a.s, phiOf(b.line), 2 * b[offKey] - a[offKey]), s: 2 * b.s - a.s });
        }
        for (const h of crossTrack(P, other, track)) hits.push({ ...h, side, sThr: h.s - (w / 2) / Math.sin(h.psiDeg * Math.PI / 180) });
      }
      // causality: the hole of row n can only lie under threads laid before round n
      for (const { q, first, row } of tr) {
        const c = hits.filter((h) => h.order < first && q.s >= h.sThr - 1e-9).sort((x, y) => x.sThr - y.sThr)[0];
        if (c) { causal = { ...c, n0: row }; break; }
      }
      if (!causal && hits.length) causal = { ...hits.sort((x, y) => x.sThr - y.sThr)[0], n0: null };
    }
    // span meet: own top span and the other set's same-row top span on the neighbouring line touch on the needle line
    let spanMeet = null;
    if (other) {
      const oRounds = P.rounds.filter((r) => r.set === other);
      for (let j = 0; j < rounds.length && spanMeet == null; j++) {
        const a = tops[j].find((q) => q.i === 2), ro = oRounds.find((r) => r.row === rounds[j].row);
        if (!a || !ro) continue;
        const b = ro.stitchIdx.map((i) => P.stitches[i]).find((q) => q.level === 'top' && q.i === 2);
        if (!b) continue;
        const gap = a.sides.spacing - (a.eOff - b.xOff);   // lines one apart: own E edge vs other X edge on the needle line
        if (gap < w / 2) spanMeet = { n0: rounds[j].row, gapMm: gap };
      }
    }
    out.push({ set, line, observed: { any: obsAny, legCrossing: obsLeg, sameLevelSpan: obsSpan }, causal, meridianReach, spanMeet, rows: rounds.length });
  }
  return out;
}
