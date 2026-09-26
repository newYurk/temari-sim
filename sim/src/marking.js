// @ts-check
// Marking as data (#52, stage 3 step 1, commit 1; spec stage3-arch §1). The marking is a graph on the sphere of radius R:
// points (unit vectors), lines (great circles: unit pole n, orientation cross(n, ·)), circles (small circles: centre c,
// angular radius ρ), edges (arcs between neighbouring points) and faces. Everything is plain data referenced by id (the
// test cache clones builds with v8.serialize / structuredClone, so no functions or object cycles live in the graph);
// addresses (§1.2) are resolved by resolve(marking, address). Each generator checks its own invariants (§1.3) and
// throws — a mismatch fails the build of the marking, it is not a warning.
//
// Azimuth rule (coordinator, 26.09): at any point the half-lines are ordered counterclockwise seen from outside the ball
// (right-handed about the outward normal). Zero direction: at P.N and P.S toward longitude φ₀; at an equator point
// toward P.N; at constructed points of later generators toward the first neighbouring vertex recorded in the graph.
// At P.N azimuth k is the current phis[k]; at P.S the order is mirrored (k → φ_{−k}).

import { halfLineAt, pointOnLine, offsetOnLine } from './geom.js';

/** @typedef {[number, number, number]} V3 */
/** @typedef {{ id: string, kind: 'pole'|'division'|'intersection'|'constructed'|'onCircle', p: V3, valence: number,
 *   halfLines: { az: number, line: string, sign: 1|-1, dir: V3 }[], zeroDir: V3, lines: string[], circles: string[] }} MPoint */
/** @typedef {{ id: string, n: V3, points: { id: string, t: number }[], edges: string[] }} MLine */
/** @typedef {{ id: string, c: V3, rho: number, onLine: string|null, points: string[] }} MCircle */
/** @typedef {{ id: string, a: string, b: string, carrier: string, length: number, faces: string[] }} MEdge */
/** @typedef {{ id: string, vertices: string[], edges: string[], center: V3, angles: number[] }} MFace */
/** @typedef {{ points: Record<string, MPoint>, lines: Record<string, MLine>, circles: Record<string, MCircle>,
 *   edges: Record<string, MEdge>, faces: Record<string, MFace> }} MGraph */

const TOL = 1e-9;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => /** @type {V3} */ ([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
const scl = (a, k) => /** @type {V3} */ ([a[0] * k, a[1] * k, a[2] * k]);
const addv = (a, b) => /** @type {V3} */ ([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
const nrm = (a) => Math.hypot(a[0], a[1], a[2]);
const unitv = (a) => scl(a, 1 / nrm(a));
const ang = (a, b) => Math.atan2(nrm(cross(a, b)), dot(a, b));
/** Unit tangent at p along the great circle toward q. */
const tangentAt = (p, q) => unitv(addv(q, scl(p, -dot(p, q))));
/** Azimuth of tangent t at p from zero direction z, counterclockwise about the outward normal p, in [0, 2π). */
const azimuth = (p, z, t) => { const a = Math.atan2(dot(cross(z, t), p), dot(z, t)); return a < -1e-15 ? a + 2 * Math.PI : Math.max(0, a); };

/** Fail the marking build (§1.3: class (i), exact). */
function fail(gen, msg) { throw new Error(`marking ${gen}: invariant failed — ${msg}`); }

/**
 * S_N generator (§1.3): N/2 meridian great circles through the poles + the equator; 2 poles (valence N) + N equator
 * points (valence 4); 3N edges; 2N triangular faces with angles 90°, 90°, 360°/N; pole–equator arcs = Q.
 * Ids: P.N, P.S, P.eq[k] (at φ_k = 2πk/N), L[k] (k < N/2: meridian through φ_k and φ_{k+N/2}, pole
 * (−sin φ_k, cos φ_k, 0), oriented from P.N toward φ_k), L.eq ≡ L[N/2] (pole +Z, oriented toward increasing φ), C.eq
 * (circle on the equator line: centre P.N, ρ = 90°, no new points or edges).
 * @param {number} N @param {number} R
 * @returns {MGraph}
 */
export function generateSN(N, R) {
  const gen = `S_${N}`;
  if (!Number.isInteger(N) || N % 2 || N < 4 || N > 32) fail(gen, `N must be even, 4…32 (got ${N})`);
  const phi = (k) => 2 * Math.PI * k / N;
  /** @type {MGraph} */
  const g = { points: {}, lines: {}, circles: {}, edges: {}, faces: {} };
  const Z = /** @type {V3} */ ([0, 0, 1]);
  const addPoint = (id, kind, p, zeroDir) => { g.points[id] = { id, kind, p, valence: 0, halfLines: [], zeroDir, lines: [], circles: [] }; };
  addPoint('P.N', 'pole', /** @type {V3} */ ([0, 0, 1]), /** @type {V3} */ ([Math.cos(phi(0)), Math.sin(phi(0)), 0]));
  addPoint('P.S', 'pole', /** @type {V3} */ ([0, 0, -1]), /** @type {V3} */ ([Math.cos(phi(0)), Math.sin(phi(0)), 0]));
  for (let k = 0; k < N; k++) addPoint(`P.eq[${k}]`, 'division', /** @type {V3} */ ([Math.cos(phi(k)), Math.sin(phi(k)), 0]), Z);
  // lines with their points in traversal order (parameter t = angle along the orientation from the first point)
  for (let k = 0; k < N / 2; k++) {
    const n = /** @type {V3} */ ([-Math.sin(phi(k)), Math.cos(phi(k)), 0]);
    g.lines[`L[${k}]`] = { id: `L[${k}]`, n, points: [{ id: 'P.N', t: 0 }, { id: `P.eq[${k}]`, t: Math.PI / 2 }, { id: 'P.S', t: Math.PI }, { id: `P.eq[${k + N / 2}]`, t: 3 * Math.PI / 2 }], edges: [] };
  }
  g.lines['L.eq'] = { id: 'L.eq', n: Z, points: Array.from({ length: N }, (_, k) => ({ id: `P.eq[${k}]`, t: phi(k) })), edges: [] };
  g.circles['C.eq'] = { id: 'C.eq', c: [0, 0, 1], rho: Math.PI / 2, onLine: 'L.eq', points: Array.from({ length: N }, (_, k) => `P.eq[${k}]`) };
  // edges: consecutive points on every closed line
  for (const L of Object.values(g.lines)) {
    const m = L.points.length;
    for (let i = 0; i < m; i++) {
      const a = L.points[i].id, b = L.points[(i + 1) % m].id, id = `E(${L.id}:${i})`;
      g.edges[id] = { id, a, b, carrier: L.id, length: R * ang(g.points[a].p, g.points[b].p), faces: [] };
      L.edges.push(id);
    }
    for (const { id } of L.points) g.points[id].lines.push(L.id);
  }
  for (const id of g.circles['C.eq'].points) g.points[id].circles.push('C.eq');
  // half-lines at every point: each line through the point leaves it in two directions (orientation sign ±1)
  for (const P of Object.values(g.points)) {
    for (const lid of P.lines) {
      const L = g.lines[lid];
      const fwd = cross(L.n, P.p);   // orientation of the line at P
      for (const sign of /** @type {(1|-1)[]} */ ([1, -1])) { const dir = scl(fwd, sign); P.halfLines.push({ az: azimuth(P.p, P.zeroDir, dir), line: lid, sign, dir }); }
    }
    P.halfLines.sort((a, b) => a.az - b.az);
    P.valence = P.halfLines.length;
    // #52 commit 2: at a pole of S_N the half-lines are 2π/N apart by construction — the azimuth is set to the exact
    // j·2π/N (the same expression as phis) after checking the measured one (class (i)); then every half-line direction
    // comes from the anchor frame (halfLineAt), so the geometry by line reproduces point(R, s, φ) bit for bit.
    if (P.kind === 'pole') for (const h of P.halfLines) {
      const j = Math.round(h.az / (2 * Math.PI / N)) % N, exact = phi(j);
      if (Math.abs(h.az - exact) > TOL) fail(gen, `${P.id} half-line azimuth ${h.az} is not a multiple of 2π/N`);
      h.az = exact;
    }
    for (const h of P.halfLines) h.dir = /** @type {V3} */ (halfLineAt(P.p, P.zeroDir, h.az).dir);
  }
  // faces: triangles pole – P.eq[k] – P.eq[k+1], vertices counterclockwise seen from outside
  const edgeBetween = (a, b) => Object.values(g.edges).find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  for (const pole of ['P.N', 'P.S']) for (let k = 0; k < N; k++) {
    let vs = [pole, `P.eq[${k}]`, `P.eq[${(k + 1) % N}]`];
    const [A, B, C] = vs.map((v) => g.points[v].p);
    if (dot(cross(addv(B, scl(A, -1)), addv(C, scl(A, -1))), addv(addv(A, B), C)) < 0) vs = [vs[0], vs[2], vs[1]];
    const id = `F(${pole}:${k})`;
    const es = vs.map((v, i) => edgeBetween(v, vs[(i + 1) % 3]));
    if (es.some((e) => !e)) fail(gen, `face ${id} misses an edge`);
    const pts = vs.map((v) => g.points[v].p);
    const angles = pts.map((p, i) => ang(tangentAt(p, pts[(i + 1) % 3]), tangentAt(p, pts[(i + 2) % 3])));
    g.faces[id] = { id, vertices: vs, edges: es.map((e) => e.id), center: unitv(pts.reduce(addv)), angles };
    for (const e of es) e.faces.push(id);
  }
  checkSN(g, N, R);
  return g;
}

/** §1.3 / §1.5 invariants of S_N (exact counts; angles and incidences to 1e-9). */
function checkSN(g, N, R) {
  const gen = `S_${N}`;
  const V = Object.keys(g.points).length, E = Object.keys(g.edges).length, F = Object.keys(g.faces).length;
  if (V !== N + 2 || E !== 3 * N || F !== 2 * N) fail(gen, `counts V ${V} E ${E} F ${F}, expected ${N + 2}, ${3 * N}, ${2 * N}`);
  if (V - E + F !== 2) fail(gen, `Euler V − E + F = ${V - E + F}`);
  if (Object.keys(g.lines).length !== N / 2 + 1) fail(gen, `lines ${Object.keys(g.lines).length}, expected ${N / 2 + 1}`);
  for (const P of Object.values(g.points)) {
    const want = P.kind === 'pole' ? N : 4;
    if (P.valence !== want) fail(gen, `${P.id} valence ${P.valence}, expected ${want}`);
    if (P.valence % 2) fail(gen, `${P.id} odd valence`);
    for (const lid of P.lines) if (Math.abs(dot(P.p, g.lines[lid].n)) > TOL) fail(gen, `${P.id} not on ${lid}`);
    for (let i = 1; i < P.halfLines.length; i++) if (!(P.halfLines[i].az - P.halfLines[i - 1].az > TOL)) fail(gen, `${P.id} azimuth order not strict`);
  }
  for (const C of Object.values(g.circles)) for (const id of C.points) if (Math.abs(ang(C.c, g.points[id].p) - C.rho) > TOL) fail(gen, `${id} not on ${C.id}`);
  for (const L of Object.values(g.lines)) {
    if (Math.abs(nrm(L.n) - 1) > TOL) fail(gen, `${L.id} pole not unit`);
    for (let i = 1; i < L.points.length; i++) if (!(L.points[i].t > L.points[i - 1].t)) fail(gen, `${L.id} points not in traversal order`);
  }
  const Q = R * Math.PI / 2;
  for (const e of Object.values(g.edges)) {
    const pole = e.a.startsWith('P.N') || e.a.startsWith('P.S') || e.b.startsWith('P.N') || e.b.startsWith('P.S');
    const want = pole ? Q : 2 * Math.PI * R / N;
    if (Math.abs(e.length - want) > TOL * R) fail(gen, `${e.id} length ${e.length}, expected ${want}`);
    if (e.faces.length !== 2) fail(gen, `${e.id} in ${e.faces.length} faces`);
  }
  // orientation consistency: every edge traversed once in each direction by the faces' boundaries
  const dirCount = new Map();
  for (const f of Object.values(g.faces)) f.vertices.forEach((v, i) => { const k = `${v}>${f.vertices[(i + 1) % 3]}`; dirCount.set(k, (dirCount.get(k) || 0) + 1); });
  for (const e of Object.values(g.edges)) if (dirCount.get(`${e.a}>${e.b}`) !== 1 || dirCount.get(`${e.b}>${e.a}`) !== 1) fail(gen, `${e.id} not traversed once each way`);
  for (const f of Object.values(g.faces)) {
    const deg = f.angles.map((a) => a * 180 / Math.PI).sort((a, b) => a - b);
    const want = [360 / N, 90, 90].sort((a, b) => a - b);
    if (deg.some((d, i) => Math.abs(d - want[i]) > 1e-9)) fail(gen, `${f.id} angles ${deg.map((d) => d.toFixed(6)).join('/')}`);
  }
}

// ---- addresses (§1.2) ---------------------------------------------------------------------------------------------

/** Split "a, b, key=c" at top-level commas. */
function splitArgs(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const kw = (args, key) => { const a = args.find((x) => x.startsWith(`${key}=`)); return a === undefined ? undefined : a.slice(key.length + 1).trim(); };
const positional = (args) => args.filter((x) => !/^[a-zA-Z_]\w*=/.test(x));

/**
 * Resolve an address of the marking (§1.2) into an object. Supported in commit 1 (S_N): P.N, P.S, P.eq[k]; L[k], L.eq;
 * L(P, azimuth=k) (also L(P, k)) → half-line; on(<half-line | line>, s, from=P) with s in mm or as a fraction of Q
 * ("0.25Q") → point; offset(<half-line>, d) → offset curve (side +1 = left of the half-line direction, d in mm; .at(s)
 * via offsetAt); C.eq; region(P, until=<circle>). Unknown or ambiguous addresses throw.
 * @param {{ graph: MGraph, R: number, Q: number }} mk  (the marking layer)
 * @param {string} address
 * @returns {any}
 */
export function resolve(mk, address) {
  const g = mk.graph, R = mk.R, a = address.trim();
  if (g.points[a]) return { type: 'point', id: a, p: g.points[a].p, xyz: scl(g.points[a].p, R) };
  if (g.lines[a]) return { type: 'line', id: a, n: g.lines[a].n };
  const mL = /^L\[(\d+)\]$/.exec(a);
  if (mL && Number(mL[1]) === Object.keys(g.lines).length - 1) return { type: 'line', id: 'L.eq', n: g.lines['L.eq'].n };
  if (g.circles[a]) { const C = g.circles[a]; return { type: 'circle', id: a, c: C.c, rho: C.rho, onLine: C.onLine }; }
  const call = /^(\w+)\((.*)\)$/.exec(a);
  if (!call) throw new Error(`marking: cannot resolve address «${address}»`);
  const [, fn, body] = call, args = splitArgs(body), pos = positional(args);
  if (fn === 'L') {
    const P = resolve(mk, pos[0]);
    if (P.type !== 'point') throw new Error(`marking: «${address}»: first argument is not a point`);
    const k = Number(kw(args, 'azimuth') ?? pos[1]);
    const hl = g.points[P.id].halfLines;
    if (!Number.isInteger(k) || k < 0 || k >= hl.length) throw new Error(`marking: «${address}»: azimuth ${k} not in 0…${hl.length - 1}`);
    const h = hl[k], P0 = g.points[P.id], fr = halfLineAt(P0.p, P0.zeroDir, h.az);
    // geometry fields in the geom.js half-line form { from, z0, az, dir, n } (+ valence v of the anchor)
    return { type: 'halfLine', id: `L(${P.id},azimuth=${k})`, anchor: P.id, from: P0.p, z0: P0.zeroDir, az: h.az, v: P0.valence,
      dir: fr.dir, n: fr.n, left: fr.n, p0: P0.p, line: h.line, sign: h.sign };
  }
  if (fn === 'on') {
    const base = resolve(mk, pos[0]);
    const sRaw = pos[1];
    const s = /Q$/.test(sRaw) ? Number(sRaw.slice(0, -1)) * mk.Q : Number(sRaw);
    if (!Number.isFinite(s)) throw new Error(`marking: «${address}»: bad arc length ${sRaw}`);
    let p0, dir;
    if (base.type === 'halfLine') {
      const fromA = kw(args, 'from');
      if (fromA !== undefined && resolve(mk, fromA).id !== base.anchor) throw new Error(`marking: «${address}»: from= must be the half-line's anchor`);
      p0 = base.p0; dir = base.dir;
    } else if (base.type === 'line') {
      const fromA = kw(args, 'from');
      if (fromA === undefined) throw new Error(`marking: «${address}»: on(line, s) needs from=`);
      const P = resolve(mk, fromA);
      if (Math.abs(dot(P.p, base.n)) > TOL) throw new Error(`marking: «${address}»: ${P.id} is not on ${base.id}`);
      p0 = P.p; dir = cross(base.n, P.p);
    } else throw new Error(`marking: «${address}»: on() needs a line or half-line`);
    const xyz = pointOnLine(R, { from: p0, dir }, s);
    return { type: 'point', id: a, kind: 'constructed', p: scl(xyz, 1 / R), xyz, on: base.id, s };
  }
  if (fn === 'offset') {
    const base = resolve(mk, pos[0]), d = Number(pos[1]);
    if (base.type !== 'halfLine' || !Number.isFinite(d)) throw new Error(`marking: «${address}»: offset(<half-line>, d mm)`);
    return { type: 'offset', id: a, base, d, c: base.left, rho: Math.PI / 2 - d / R };
  }
  if (fn === 'region') {
    const P = resolve(mk, pos[0]), until = resolve(mk, kw(args, 'until') ?? pos[1]);
    if (P.type !== 'point' || until.type !== 'circle') throw new Error(`marking: «${address}»: region(P, until=<circle>)`);
    if (Math.abs(dot(P.p, until.c) - 1) > TOL) throw new Error(`marking: «${address}»: ${P.id} is not the centre of ${until.id}`);
    // sMax = arc from the centre to the boundary = Q·ρ/(π/2) (Q = R·π/2; for C.eq exactly Q — the K12 stop, #52 commit 2)
    return { type: 'region', id: a, center: P.id, until: until.id, sMax: mk.Q * (until.rho / (Math.PI / 2)) };
  }
  throw new Error(`marking: address function «${fn}» not supported (commit 1: P.*, L[k], L(P, azimuth), on, offset, C.eq, region)`);
}

/** Point of an offset curve at arc s along its base half-line: foot on the half-line, then d along the left normal
 *  (the perpPt construction). @param {{ R: number }} mk @param {any} off @param {number} s @returns {V3} (mm) */
export function offsetAt(mk, off, s) {
  return /** @type {V3} */ (offsetOnLine(mk.R, off.base, s, off.d));
}

/** Summary numbers of a graph (for UI / diagnostics). @param {MGraph} g */
export function graphStats(g) {
  return { V: Object.keys(g.points).length, E: Object.keys(g.edges).length, F: Object.keys(g.faces).length, lines: Object.keys(g.lines).length, circles: Object.keys(g.circles).length };
}
