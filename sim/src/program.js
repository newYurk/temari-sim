// @ts-check
// Programs (#53, stage 3 step 2; spec stage3-arch §3). A program is the ordered sequence of bites and lays of one round
// template, produced by a family generator; the path layer executes it and does not know which family made it.
// Bites store intent only (§3.1): line, anchor, level rule, role, own cluster, wrap-around, layer order, growth direction.
// Hole sides are placed by G3 in the path layer (fan) or from the previous stitch (braid, T1). Program data is plain
// (no functions): the test cache clones builds.
import { resolve } from './marking.js';
import { frameAt } from './geom.js';

/** @typedef {{ kind: 'bite', i: number, line: string, k: number, anchor: string, role: 'top'|'bottom', s: number|null,
 *   rule: 'row1'|'belowPrevChannel'|'packing-root'|'closingIsNextRowTop', side: null, cluster: { kiku: string, set: string, line: string },
 *   around: 'own-bundle', layer: 'over'|'under', grow: 1|-1, closing: boolean, address?: string, p?: number[] }} Bite */
/** @typedef {{ kind: 'leg' } | { kind: 'hidden', rule: string } | { kind: 'resume' } | { kind: 'park' }} Lay */

/**
 * Kiku program generator kiku(P, v, sets, tiers, grow, layer) — §2.1, §3.2. Around point P of valence v: half-lines
 * h_0…h_{v−1} by the azimuth rule of the marking; set X starting on h_j: round stitches i = 1…v on h_{j+i}, bottoms on odd
 * i, tops on even i; the closing stitch (i = v) is on the start half-line and is the top of the next row (12′). v/2 petals
 * per set. Levels are arcs from P along the own half-line: row 1 at s_T, s_B; row n ≥ 2 tops s_prev + g·w (T1), bottoms
 * the packing root. Stop K12: the region boundary (layout.region). Step 2 commit 1: g = +1 and layer 'over' only.
 * @param {any} marking the marking layer (graph + resolve context)
 * sBot: one level, or one per half-line (#53 case 2: ℓ_h·(1 − bottomFromEq) on a centre with half-lines of different length).
 * @param {{ id?: string, center: string, v?: number, sets: { set: string, thread: string, startLine: number, begin1: string, beginN: string }[],
 *   sTop: number, sBot: number|number[], grow?: number, layer?: string, stop: { address: string, sMax: number, sMaxK?: number[] } }} o
 */
export function kiku(marking, o) {
  const id = o.id || 'kiku';
  const P = marking.graph.points[o.center];
  if (!P) throw new Error(`kiku: centre «${o.center}» is not a point of the marking`);
  const v = P.valence;
  if (o.v !== undefined && o.v !== v) throw new Error(`kiku(${o.center}, ${o.v}): the centre has valence ${v}`);
  if (v % 2) throw new Error(`kiku: valence ${v} of ${o.center} is odd`);
  for (let k = 0; k < v; k++) if (!P.halfLines[k].line) throw new Error(`kiku: ${o.center} azimuth ${k} is a circle direction, not a half-line`);
  const grow = o.grow ?? 1, layer = o.layer ?? 'over';
  if (grow !== 1) throw new Error(`kiku: grow ${grow} — sakasa (g = −1) is not implemented yet (#53 case 3)`);
  if (layer !== 'over') throw new Error(`kiku: layer «${layer}» — shitagake is not implemented yet`);
  const mod = (k) => ((k % v) + v) % v;
  const line = (k) => `L(${o.center},azimuth=${mod(k)})`;
  if (Array.isArray(o.sBot) && o.sBot.length !== v) throw new Error(`kiku: ${o.sBot.length} bottom levels for ${v} half-lines`);
  const sBotOf = (k) => (Array.isArray(o.sBot) ? o.sBot[mod(k)] : o.sBot);
  const sets = o.sets.map((st) => {
    const round = (row) => {
      /** @type {(Bite|Lay)[]} */
      const items = [row === 1 ? { kind: 'hidden', rule: st.begin1 } : { kind: 'resume' }];
      if (row === 1 && st.begin1 !== 'hiddenStart') throw new Error(`kiku: set ${st.set} row 1 begin «${st.begin1}» (hiddenStart only)`);
      if (row > 1 && st.beginN !== 'resume') throw new Error(`kiku: set ${st.set} row ≥ 2 begin «${st.beginN}» (resume only)`);
      for (let i = 1; i <= v; i++) {
        const k = mod(st.startLine + i), role = i % 2 ? 'bottom' : 'top', closing = i === v;
        const rule = role === 'top' ? (closing ? 'closingIsNextRowTop' : row === 1 ? 'row1' : 'belowPrevChannel') : (row === 1 ? 'row1' : 'packing-root');
        const s = rule === 'row1' ? (role === 'top' ? o.sTop : sBotOf(k)) : null;
        items.push({ kind: 'leg' });
        items.push({ kind: 'bite', i, line: line(k), k, anchor: o.center, role, s, rule, side: null,
          cluster: { kiku: id, set: st.set, line: line(k) }, around: 'own-bundle', layer, grow, closing });
      }
      items.push({ kind: 'park' });
      return items;
    };
    return { set: st.set, thread: st.thread, startLine: mod(st.startLine), row1: round(1), next: round(2) };
  });
  // row-1 bites (layout): set A tops on even half-lines, bottoms on odd; B shifted by its start line (resolved once)
  const at = (k, s) => resolve(marking, `on(L(${o.center},azimuth=${k}), ${s}, from=${o.center})`);
  const bites = [];
  for (const st of sets) for (let j = 0; j < v / 2; j++) for (const [role, off] of /** @type {const} */ ([['top', 0], ['bottom', 1]])) {
    const k = mod(st.startLine + 2 * j + off), s = role === 'top' ? o.sTop : sBotOf(k), q = at(k, s);
    bites.push({ set: st.set, role, row: 1, anchor: o.center, line: line(k), k, s, side: null, address: q.id, p: q.xyz });
  }
  // symmetry classes generated by the program (V6): petals of one set repeat under the rotation about P by 2·2π/v
  // (two half-lines); set X is set A rotated by (startLine_X − startLine_A)·2π/v.
  // #53 case 2: a class exists only where the rotation is a symmetry of the marking (and of the levels): the petal class
  // (2·2π/v) is required — its absence throws; a set whose shift is not a symmetry (C8 face centre: half-lines alternate
  // between vertices and edge midpoints) is not congruent to the first set (shift null: V6 B-vs-A and V15 do not apply).
  const isSym = (sh) => markingSymmetric(marking.graph, P.p, sh * 2 * Math.PI / v)
    && (!Array.isArray(o.sBot) || o.sBot.every((x, k) => Math.abs(x - o.sBot[mod(k + sh)]) <= 1e-9 * (marking.R || 1)));
  if (!isSym(2)) throw new Error(`kiku(${o.center}, ${v}): the rotation by 2·360°/${v} about the centre is not a symmetry of the marking (no petal class)`);
  const symmetry = { axis: P.p.slice(), v, petalShift: 2, sets: Object.fromEntries(sets.map((st) => { const sh = mod(st.startLine - sets[0].startLine);
    return [st.set, { from: sets[0].set, shift: sh === 0 || isSym(sh) ? sh : null }]; })) };
  // the kiku frame (#53 case 1): polar coordinates about P (s from P, azimuth by the marking's rule) for every construction
  // and check that used the fixed pole; az[k] = azimuth of half-line k (exact multiples of 2π/v at the poles).
  const frame = frameAt(P.p, P.zeroDir), az = P.halfLines.slice(0, v).map((h) => h.az);
  return { family: 'kiku', id, call: `kiku(${o.center}, ${v})`, center: o.center, v, grow, layer, stop: o.stop, sets, bites, symmetry, frame, az };
}

/** True when the rotation about unit axis c by angle a maps every marking point onto a marking point of the same valence. */
export function markingSymmetric(g, c, a) {
  const rot = rotAbout(c, a), pts = Object.values(g.points);
  return pts.every((p) => { const q = rot(p.p); return pts.some((r) => r.valence === p.valence && Math.hypot(q[0] - r.p[0], q[1] - r.p[1], q[2] - r.p[2]) < 1e-9); });
}

/** Bites of one round of a set in program order (row 1 or the row ≥ 2 template). */
export function roundBites(program, set, row) {
  const S = program.sets.find((x) => x.set === set);
  if (!S) throw new Error(`program ${program.id}: no set ${set}`);
  return /** @type {Bite[]} */ ((row === 1 ? S.row1 : S.next).filter((x) => x.kind === 'bite'));
}

/** Rotation about a unit axis by angle a (right-handed). About ±ẑ it is the exact z-rotation (bit-identical to rotZ). */
export function rotAbout(axis, a) {
  if (axis[0] === 0 && axis[1] === 0) {
    const t = axis[2] > 0 ? a : -a, c = Math.cos(t), s = Math.sin(t);
    return (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
  }
  const [x, y, z] = axis, c = Math.cos(a), s = Math.sin(a), C = 1 - c;
  const M = [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
  return (p) => [M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2], M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2], M[2][0] * p[0] + M[2][1] * p[1] + M[2][2] * p[2]];
}
