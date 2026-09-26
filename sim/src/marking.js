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
 *   halfLines: { az: number, line: string|null, circle?: string, sign: 1|-1, dir: V3 }[], zeroDir: V3, lines: string[], circles: string[] }} MPoint */
/** @typedef {{ id: string, n: V3, points: { id: string, t: number }[], edges: string[] }} MLine */
/** @typedef {{ id: string, c: V3, rho: number, onLine: string|null, center?: string, points: string[] }} MCircle */
/** @typedef {{ id: string, a: string, b: string, carrier: string, length: number, faces: string[] }} MEdge */
/** @typedef {{ id: string, vertices: string[], edges: string[], center: V3, angles: number[] }} MFace */
/** @typedef {{ points: Record<string, MPoint>, lines: Record<string, MLine>, circles: Record<string, MCircle>,
 *   edges: Record<string, MEdge>, faces: Record<string, MFace>, aliases?: Record<string, string> }} MGraph */

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
  const g = { points: {}, lines: {}, circles: {}, edges: {}, faces: {}, aliases: { [`L[${N / 2}]`]: 'L.eq' } };
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

// ---- combination generators C8, C10, C6 (#52 commit 3; spec §1.3) ----------------------------------------------------
// Built from the list of great circles (unit poles, oriented) of the kaleidoscope: points = all pairwise intersections
// (merged within 1e-9), lines keep their points in traversal order, edges join consecutive points, faces are traced from
// the azimuth order at every vertex (counterclockwise seen from outside), and every generator checks its §1.3 table.
// The frame is the Simple division the craft starts from: P.N = +Z with the S_N meridians L[k] (pole (−sin φ_k, cos φ_k, 0),
// φ_k = 2πk/N) — S8 for C8 (with the equator L.eq ≡ L[4]), S10 for C10 and S6 for C6 (no equator: TemariKai marks C10 and
// the 6 Combination Marking without it). Point ids: P.N, P.S, P.eq[k] (C8), the others P.v<valence>[i] ordered by z
// (descending), then longitude. Zero direction at P.v…: toward the next point along the first line through it.

const subv = (a, b) => /** @type {V3} */ ([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
/** Canonical sign of a computed pole: the first of (z, y, x) that is not ~0 is positive. */
function canonPole(n) { const u = unitv(n); for (const i of [2, 1, 0]) if (Math.abs(u[i]) > 1e-12) return u[i] > 0 ? u : scl(u, -1); return u; }
const lonOf = (p) => { const a = Math.atan2(p[1], p[0]); return a < -1e-12 ? a + 2 * Math.PI : Math.max(0, a); };
const meridianPole = (N, k) => /** @type {V3} */ ([-Math.sin(2 * Math.PI * k / N), Math.cos(2 * Math.PI * k / N), 0]);
/** Replace computed poles that coincide with the S_N meridians by the exact meridian poles (checked) and order the rest. */
function withMeridians(gen, N, computed) {
  const mer = Array.from({ length: N / 2 }, (_, k) => meridianPole(N, k));
  const rest = [];
  for (const n of computed) {
    const j = mer.findIndex((m) => Math.abs(Math.abs(dot(m, n)) - 1) < 1e-9);
    if (j < 0) rest.push(canonPole(n));
  }
  if (rest.length !== computed.length - N / 2) fail(gen, `the S${N} meridians are not among the kaleidoscope lines (${computed.length - rest.length} matched)`);
  rest.sort((a, b) => (Math.round(b[2] * 1e9) - Math.round(a[2] * 1e9)) || (lonOf(a) - lonOf(b)));
  return { mer, rest };
}

/** Graph from oriented great circles. @param {string} gen @param {number} R @param {{ id: string, n: V3 }[]} lines
 *  @param {{ eq?: number }} [o] eq: equator divisions when L.eq is present (ids P.eq[k]) @returns {MGraph} */
function buildFromLines(gen, R, lines, o = {}) {
  /** @type {MGraph} */
  const g = { points: {}, lines: {}, circles: {}, edges: {}, faces: {}, aliases: {} };
  const found = [];
  const addAt = (p, lid) => {
    let f = found.find((q) => nrm(subv(q.p, p)) < 1e-9);
    if (!f) { f = { p, lines: [] }; found.push(f); }
    if (!f.lines.includes(lid)) f.lines.push(lid);
  };
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const c = cross(lines[i].n, lines[j].n);
    if (nrm(c) < 1e-9) fail(gen, `${lines[i].id} and ${lines[j].id} coincide`);
    const d = unitv(c);
    for (const q of [d, scl(d, -1)]) { addAt(q, lines[i].id); addAt(q, lines[j].id); }
  }
  // ids (exact coordinates for the frame points)
  const inter = [];
  for (const f of found) {
    if (nrm(subv(f.p, [0, 0, 1])) < 1e-9) Object.assign(f, { id: 'P.N', kind: 'pole', p: [0, 0, 1], zeroDir: [1, 0, 0] });
    else if (nrm(subv(f.p, [0, 0, -1])) < 1e-9) Object.assign(f, { id: 'P.S', kind: 'pole', p: [0, 0, -1], zeroDir: [1, 0, 0] });
    else if (o.eq && Math.abs(f.p[2]) < 1e-9) {
      const k = Math.round(lonOf(f.p) * o.eq / (2 * Math.PI)) % o.eq, ph = 2 * Math.PI * k / o.eq;
      if (nrm(subv(f.p, [Math.cos(ph), Math.sin(ph), 0])) > 1e-9) fail(gen, `equator point at longitude ${lonOf(f.p)} is not a division point`);
      Object.assign(f, { id: `P.eq[${k}]`, kind: 'division', p: [Math.cos(ph), Math.sin(ph), 0], zeroDir: [0, 0, 1] });
    } else inter.push(f);
  }
  inter.sort((a, b) => (2 * b.lines.length - 2 * a.lines.length) || (Math.round(b.p[2] * 1e9) - Math.round(a.p[2] * 1e9)) || (lonOf(a.p) - lonOf(b.p)));
  const cnt = {};
  for (const f of inter) { const v = 2 * f.lines.length; cnt[v] = cnt[v] || 0; Object.assign(f, { id: `P.v${v}[${cnt[v]++}]`, kind: 'intersection', zeroDir: null }); }
  const eqK = (f) => (f.kind === 'division' ? Number(/\d+/.exec(f.id)[0]) : -1);
  const order = [...found.filter((f) => f.kind === 'pole').sort((a, b) => (a.id === 'P.N' ? -1 : 1) - (b.id === 'P.N' ? -1 : 1)),
    ...found.filter((f) => f.kind === 'division').sort((a, b) => eqK(a) - eqK(b)), ...inter];
  for (const f of order) g.points[f.id] = { id: f.id, kind: f.kind, p: f.p, valence: 0, halfLines: [], zeroDir: f.zeroDir, lines: [], circles: [] };
  // lines: points in traversal order from the start point (P.N if on the line, else P.eq[0], else the highest point)
  for (const L of lines) {
    const on = order.filter((f) => f.lines.includes(L.id));
    const start = on.find((f) => f.id === 'P.N') || on.find((f) => f.id === 'P.eq[0]') || [...on].sort((a, b) => (b.p[2] - a.p[2]) || (lonOf(a.p) - lonOf(b.p)))[0];
    const e1 = start.p, e2 = cross(L.n, e1);
    const pts = on.map((f) => { let t = Math.atan2(dot(f.p, e2), dot(f.p, e1)); if (f === start) t = 0; else if (t < 0) t += 2 * Math.PI; return { id: f.id, t }; });
    pts.sort((a, b) => a.t - b.t);
    g.lines[L.id] = { id: L.id, n: L.n, points: pts, edges: [] };
  }
  for (const L of Object.values(g.lines)) {
    const m = L.points.length;
    for (let i = 0; i < m; i++) {
      const a = L.points[i].id, b = L.points[(i + 1) % m].id, id = `E(${L.id}:${i})`;
      g.edges[id] = { id, a, b, carrier: L.id, length: R * ang(g.points[a].p, g.points[b].p), faces: [] };
      L.edges.push(id);
    }
    for (const { id } of L.points) g.points[id].lines.push(L.id);
  }
  // zero direction of the other points: toward the next point along the first line through it
  for (const P of Object.values(g.points)) if (!P.zeroDir) {
    const L = g.lines[P.lines[0]], i = L.points.findIndex((q) => q.id === P.id);
    P.zeroDir = tangentAt(P.p, g.points[L.points[(i + 1) % L.points.length].id].p);
  }
  halfLinesOf(g, gen);
  traceFaces(g, gen);
  return g;
}

/** Half-lines at every point (azimuth order, exact multiples of 2π/v at the poles, directions from the anchor frame). */
function halfLinesOf(g, gen) {
  for (const P of Object.values(g.points)) {
    P.halfLines = [];
    for (const lid of P.lines) {
      const fwd = cross(g.lines[lid].n, P.p);
      for (const sign of /** @type {(1|-1)[]} */ ([1, -1])) { const dir = scl(fwd, sign); P.halfLines.push({ az: azimuth(P.p, P.zeroDir, dir), line: lid, sign, dir }); }
    }
    for (const cid of P.circles) {
      if (g.circles[cid].onLine) continue;   // a circle on a line (C.eq) adds no directions of its own
      const C = g.circles[cid], fwd = unitv(cross(C.c, P.p));
      for (const sign of /** @type {(1|-1)[]} */ ([1, -1])) { const dir = scl(fwd, sign); P.halfLines.push({ az: azimuth(P.p, P.zeroDir, dir), line: null, circle: cid, sign, dir }); }
    }
    P.halfLines.sort((a, b) => a.az - b.az);
    P.valence = P.halfLines.length;
    if (P.kind === 'pole') for (const h of P.halfLines) {
      const v = P.valence, j = Math.round(h.az / (2 * Math.PI / v)) % v, exact = 2 * Math.PI * j / v;
      if (Math.abs(h.az - exact) > TOL) fail(gen, `${P.id} half-line azimuth ${h.az} is not a multiple of 2π/${v}`);
      h.az = exact;
    }
    for (const h of P.halfLines) if (h.line) h.dir = /** @type {V3} */ (halfLineAt(P.p, P.zeroDir, h.az).dir);
  }
}

/** Neighbour of point P along its half-line h (the adjacent point on the line in the direction of h). */
function neighbourAlong(g, P, h) {
  const L = g.lines[h.line], m = L.points.length, i = L.points.findIndex((q) => q.id === P.id);
  return L.points[(i + (h.sign > 0 ? 1 : m - 1)) % m].id;
}

/** Faces from the rotation system: walking a→b with the face on the left, the next edge at b is the half-line just
 *  before b→a in counterclockwise order. Faces must come out counterclockwise seen from outside (else fail). */
function traceFaces(g, gen) {
  const edgeOf = new Map();
  for (const e of Object.values(g.edges)) { edgeOf.set(`${e.a}>${e.b}`, e.id); edgeOf.set(`${e.b}>${e.a}`, e.id); }
  const used = new Set();
  let fi = 0;
  for (const e of Object.values(g.edges)) for (const [a0, b0] of [[e.a, e.b], [e.b, e.a]]) {
    if (used.has(`${a0}>${b0}`)) continue;
    const vs = [];
    let a = a0, b = b0;
    for (let guard = 0; !used.has(`${a}>${b}`); guard++) {
      if (guard > 64) fail(gen, `face tracing from ${a0}>${b0} does not close`);
      used.add(`${a}>${b}`); vs.push(a);
      const B = g.points[b], hl = B.halfLines.filter((h) => h.line);
      const i = hl.findIndex((h) => neighbourAlong(g, B, h) === a);
      if (i < 0) fail(gen, `${b}: no half-line back to ${a}`);
      const c = neighbourAlong(g, B, hl[(i - 1 + hl.length) % hl.length]);
      a = b; b = c;
    }
    if (a !== a0 || b !== b0) fail(gen, `face tracing from ${a0}>${b0} closed on ${a}>${b}`);
    const pts = vs.map((v) => g.points[v].p);
    const ctr = unitv(pts.reduce(addv));
    let area = 0;
    for (let i = 0; i < pts.length; i++) area += dot(cross(subv(pts[i], ctr), subv(pts[(i + 1) % pts.length], ctr)), ctr);
    if (!(area > 0)) fail(gen, `face ${vs.join(',')} is not counterclockwise seen from outside`);
    const id = `F[${fi++}]`;
    const es = vs.map((v, i) => edgeOf.get(`${v}>${vs[(i + 1) % vs.length]}`));
    const angles = pts.map((p, i) => ang(tangentAt(p, pts[(i + pts.length - 1) % pts.length]), tangentAt(p, pts[(i + 1) % pts.length])));
    g.faces[id] = { id, vertices: vs, edges: es, center: ctr, angles };
    for (const x of es) g.edges[x].faces.push(id);
  }
}

/** §1.5 invariants common to every generator (class (i)): Euler, orientation (each edge once each way), incidences,
 *  even valences, strict azimuth order, traversal order on lines. */
function checkCommon(g, gen) {
  const V = Object.keys(g.points).length, E = Object.keys(g.edges).length, F = Object.keys(g.faces).length;
  if (V - E + F !== 2) fail(gen, `Euler V − E + F = ${V - E + F} (V ${V}, E ${E}, F ${F})`);
  for (const P of Object.values(g.points)) {
    if (P.valence % 2 || P.valence !== P.halfLines.length) fail(gen, `${P.id} valence ${P.valence}`);
    for (const lid of P.lines) if (Math.abs(dot(P.p, g.lines[lid].n)) > TOL) fail(gen, `${P.id} not on ${lid}`);
    for (const cid of P.circles) if (Math.abs(ang(g.circles[cid].c, P.p) - g.circles[cid].rho) > TOL) fail(gen, `${P.id} not on ${cid}`);
    for (let i = 1; i < P.halfLines.length; i++) if (!(P.halfLines[i].az - P.halfLines[i - 1].az > TOL)) fail(gen, `${P.id} azimuth order not strict`);
  }
  for (const L of Object.values(g.lines)) for (let i = 1; i < L.points.length; i++) if (!(L.points[i].t > L.points[i - 1].t)) fail(gen, `${L.id} points not in traversal order`);
  const dirCount = new Map();
  for (const f of Object.values(g.faces)) f.vertices.forEach((v, i) => { const k = `${v}>${f.vertices[(i + 1) % f.vertices.length]}`; dirCount.set(k, (dirCount.get(k) || 0) + 1); });
  for (const e of Object.values(g.edges)) {
    if (e.faces.length !== 2) fail(gen, `${e.id} in ${e.faces.length} faces`);
    if (dirCount.get(`${e.a}>${e.b}`) !== 1 || dirCount.get(`${e.b}>${e.a}`) !== 1) fail(gen, `${e.id} not traversed once each way`);
  }
}

/** Kaleidoscope checks shared by C8 / C10 / C6: counts by valence, lines, points per line, every face a triangle whose
 *  corner at a vertex of valence v is 2π/v (C8 90°/60°/45°, C10 90°/60°/36°, C6 90°/60°/60°). */
function checkKaleido(g, gen, want) {
  checkCommon(g, gen);
  const pts = Object.values(g.points), byV = {};
  for (const P of pts) byV[P.valence] = (byV[P.valence] || 0) + 1;
  const V = pts.length, E = Object.keys(g.edges).length, F = Object.keys(g.faces).length;
  if (V !== want.V || E !== want.E || F !== want.F) fail(gen, `counts V ${V} E ${E} F ${F}, expected ${want.V}, ${want.E}, ${want.F}`);
  for (const [v, n] of Object.entries(want.byV)) if (byV[v] !== n) fail(gen, `${byV[v] || 0} points of valence ${v}, expected ${n}`);
  if (Object.keys(g.lines).length !== want.lines) fail(gen, `${Object.keys(g.lines).length} lines, expected ${want.lines}`);
  for (const L of Object.values(g.lines)) if (L.points.length !== want.perLine) fail(gen, `${L.id} has ${L.points.length} points, expected ${want.perLine}`);
  for (const f of Object.values(g.faces)) {
    if (f.vertices.length !== 3) fail(gen, `${f.id} has ${f.vertices.length} vertices`);
    f.vertices.forEach((v, i) => { const w = 2 * Math.PI / g.points[v].valence; if (Math.abs(f.angles[i] - w) > TOL) fail(gen, `${f.id} corner at ${v} ${(f.angles[i] * 180 / Math.PI).toFixed(6)}°, expected ${(w * 180 / Math.PI).toFixed(6)}°`); });
  }
}
/** Smallest arc (mm) between two distinct points of the given valence. */
function minArc(g, R, v) {
  const P = Object.values(g.points).filter((p) => p.valence === v);
  let best = Infinity;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) best = Math.min(best, R * ang(P[i].p, P[j].p));
  return best;
}

/** C8 — octahedral kaleidoscope from S8: 3 coordinate lines (L[0], L[2], L.eq) + 6 diagonal (L[1], L[3], L[5…8]).
 *  §1.3: 6 (v 8) + 8 (v 6) + 12 (v 4) = 26 points, 72 edges, 48 faces 90°/60°/45°; 8 points per line; coordinate lines
 *  in 8 equal arcs of C/8; neighbouring 8-valent points C/4 apart; 8–6 edges R·arctan√2 (54.74°); 8–4 edges C/8. */
export function generateC8(R) {
  const gen = 'C8', s = Math.SQRT1_2;
  const { mer, rest } = withMeridians(gen, 8, [meridianPole(8, 0), meridianPole(8, 1), meridianPole(8, 2), meridianPole(8, 3), [s, 0, -s], [s, 0, s], [0, s, -s], [0, s, s]]);
  const lines = [...mer.map((n, k) => ({ id: `L[${k}]`, n })), { id: 'L.eq', n: /** @type {V3} */ ([0, 0, 1]) }, ...rest.map((n, i) => ({ id: `L[${5 + i}]`, n }))];
  const g = buildFromLines(gen, R, lines, { eq: 8 });
  g.aliases['L[4]'] = 'L.eq';
  g.circles['C.eq'] = { id: 'C.eq', c: [0, 0, 1], rho: Math.PI / 2, onLine: 'L.eq', center: 'P.N', points: g.lines['L.eq'].points.map((q) => q.id) };
  for (const id of g.circles['C.eq'].points) g.points[id].circles.push('C.eq');
  checkKaleido(g, gen, { V: 26, E: 72, F: 48, byV: { 8: 6, 6: 8, 4: 12 }, lines: 9, perLine: 8 });
  const C = 2 * Math.PI * R;
  for (const lid of ['L[0]', 'L[2]', 'L.eq']) for (const e of g.lines[lid].edges) if (Math.abs(g.edges[e].length - C / 8) > TOL * R) fail(gen, `coordinate line ${lid}: edge ${e} ${g.edges[e].length} ≠ C/8`);
  const want = { '8-4': C / 8, '8-6': R * Math.atan(Math.SQRT2), '6-4': R * Math.acos(2 / Math.sqrt(6)) };
  for (const e of Object.values(g.edges)) {
    const k = [g.points[e.a].valence, g.points[e.b].valence].sort((a, b) => b - a).join('-');
    if (!(k in want) || Math.abs(e.length - want[k]) > TOL * R) fail(gen, `edge ${e.id} (${k}) length ${e.length}`);
  }
  if (Math.abs(minArc(g, R, 8) - C / 4) > TOL * R) fail(gen, `neighbouring 8-valent points ${minArc(g, R, 8)} ≠ C/4`);
  return g;
}

/** C10 — icosahedral kaleidoscope from S10 (no equator): the 15 mirror circles of the icosahedron with a vertex at P.N.
 *  §1.3: 12 (v 10) + 20 (v 6) + 30 (v 4) = 62 points, 180 edges, 120 faces 90°/60°/36°; 12 points per line;
 *  neighbouring 10-valent points R·arccos(1/√5) (63.43°) apart. */
export function generateC10(R) {
  const gen = 'C10', z = 1 / Math.sqrt(5), r = 2 / Math.sqrt(5);
  const V = [[0, 0, 1], [0, 0, -1]];
  for (let j = 0; j < 5; j++) { const a = 2 * Math.PI * j / 5, b = a + Math.PI / 5; V.push([r * Math.cos(a), r * Math.sin(a), z], [r * Math.cos(b), r * Math.sin(b), -z]); }
  const normals = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) if (Math.abs(dot(V[i], V[j]) - z) < 1e-9) {
    const n = canonPole(addv(V[i], V[j]));
    if (!normals.some((q) => nrm(subv(q, n)) < 1e-9)) normals.push(n);
  }
  if (normals.length !== 15) fail(gen, `${normals.length} mirror circles, expected 15`);
  const { mer, rest } = withMeridians(gen, 10, normals);
  const lines = [...mer.map((n, k) => ({ id: `L[${k}]`, n })), ...rest.map((n, i) => ({ id: `L[${5 + i}]`, n }))];
  const g = buildFromLines(gen, R, lines);
  checkKaleido(g, gen, { V: 62, E: 180, F: 120, byV: { 10: 12, 6: 20, 4: 30 }, lines: 15, perLine: 12 });
  const a10 = R * Math.acos(1 / Math.sqrt(5));
  if (Math.abs(minArc(g, R, 10) - a10) > TOL * R) fail(gen, `neighbouring 10-valent points ${minArc(g, R, 10)} ≠ R·arccos(1/√5)`);
  return g;
}

/** Pin distance of the TemariKai 6 Combination Marking: C/6 + 3C/100 from the pole (the source's rounding of the exact
 *  arc arccos(1/3)·R between neighbouring 6-point centres, «just as in a C10 the couple of 100ths is required»). */
export const C6_SOURCE_PIN_FRAC = 1 / 6 + 3 / 100;
/** C6 — TemariKai «6 Combination Marking» (S6, not a division): S6 without the equator + 3 full circles through the pins
 *  on alternate lines. Construction = the 6 diagonal circles of the cube frame with a cube vertex at P.N. Counted against
 *  the source: 6 lines; 8 six-point centres (v 6); the other 6 intersections have 2 lines (v 4; the source's «8-point»
 *  counts the face around them, not lines); E 36, F 24 (triangles 90°/60°/60°); 6 points per line. */
export function generateC6(R) {
  const gen = 'C6';
  const r1 = unitv([-1, -1, 2]), r2 = unitv([1, -1, 0]), r3 = unitv([1, 1, 1]);   // rotation: cube vertex (1,1,1) → P.N
  const rot = (v) => /** @type {V3} */ ([dot(r1, v), dot(r2, v), dot(r3, v)]);
  const cube = [[1, -1, 0], [0, 1, -1], [1, 0, -1], [1, 1, 0], [0, 1, 1], [1, 0, 1]].map((v) => rot(unitv(/** @type {V3} */ (v))));
  const { mer, rest } = withMeridians(gen, 6, cube);
  const lines = [...mer.map((n, k) => ({ id: `L[${k}]`, n })), ...rest.map((n, i) => ({ id: `L[${3 + i}]`, n }))];
  const g = buildFromLines(gen, R, lines);
  checkKaleido(g, gen, { V: 14, E: 36, F: 24, byV: { 6: 8, 4: 6 }, lines: 6, perLine: 6 });
  const a66 = minArc(g, R, 6), exact = R * Math.acos(1 / 3), src = 2 * Math.PI * R * C6_SOURCE_PIN_FRAC;
  if (Math.abs(a66 - exact) > TOL * R) fail(gen, `neighbouring 6-point centres ${a66} ≠ R·arccos(1/3)`);
  if (Math.abs(src - exact) / R > 0.5 * Math.PI / 180) fail(gen, `source pin distance C/6 + 3C/100 differs from the construction by more than 0.5°`);
  return g;
}

/** Add a small circle (centre = a point of the graph, angular radius rho) to a copy of the graph (§1.3 «latitude /
 *  circle»): its intersections with the lines become points (kind onCircle, valence 4 = 2 line + 2 circle directions)
 *  that split the line edges; the circle adds no faces (V and E grow by the same number, F unchanged; the faces get the
 *  split points in their boundary). An intersection within 1e-9 of an existing point joins that point. */
export function addCircle(g0, R, { id, center, rho }) {
  const gen = `circle ${id}`;
  if (g0.circles[id]) fail(gen, 'id exists');
  const g = structuredClone(g0);
  const c = g.points[center]?.p;
  if (!c) fail(gen, `centre ${center} is not a point`);
  if (!(rho > 0 && rho < Math.PI)) fail(gen, `ρ ${rho} out of (0, π)`);
  // a circle that is a line of the graph (ρ = 90° about the line's pole) lies on that line: no directions of its own
  const onL = Math.abs(rho - Math.PI / 2) < TOL ? Object.values(g.lines).find((L) => Math.abs(Math.abs(dot(L.n, c)) - 1) < TOL) : null;
  const C = { id, c, rho, onLine: onL ? onL.id : null, center, points: [] };
  g.circles[id] = C;
  const F0 = Object.keys(g.faces).length;
  let added = 0;
  for (const L of Object.values(g0.lines)) {
    for (const p of circleLineRoots(L.n, c, rho)) {
      const hit = Object.values(g.points).find((q) => nrm(subv(q.p, p)) < 1e-9);
      if (hit) { if (!hit.circles.includes(id)) { hit.circles.push(id); C.points.push(hit.id); } continue; }
      const pid = `${id}.p[${added++}]`;
      const Lg = g.lines[L.id], e1 = g.points[Lg.points[0].id].p, e2 = cross(Lg.n, e1);
      let t = Math.atan2(dot(p, e2), dot(p, e1)); if (t < 0) t += 2 * Math.PI;
      const m = Lg.points.length;
      const i = Lg.points.findIndex((q, j) => { const t1 = j + 1 < m ? Lg.points[j + 1].t : 2 * Math.PI; return q.t < t && t < t1; });
      const a = Lg.points[i].id, b = Lg.points[(i + 1) % m].id;
      const eid = Lg.edges.find((x) => { const e = g.edges[x]; return (e.a === a && e.b === b) || (e.a === b && e.b === a); });
      const e = g.edges[eid];
      g.points[pid] = { id: pid, kind: 'onCircle', p, valence: 0, halfLines: [], zeroDir: tangentAt(p, g.points[b].p), lines: [L.id], circles: [id] };
      C.points.push(pid);
      Lg.points.splice(i + 1, 0, { id: pid, t });
      const e0 = { id: `${eid}/0`, a: e.a, b: pid, carrier: L.id, length: R * ang(g.points[e.a].p, p), faces: [...e.faces] };
      const e1b = { id: `${eid}/1`, a: pid, b: e.b, carrier: L.id, length: R * ang(p, g.points[e.b].p), faces: [...e.faces] };
      delete g.edges[eid];
      g.edges[e0.id] = e0; g.edges[e1b.id] = e1b;
      Lg.edges.splice(Lg.edges.indexOf(eid), 1, e0.id, e1b.id);
      for (const fid of e.faces) {
        const f = g.faces[fid], n = f.vertices.length;
        const j = f.vertices.findIndex((v, k) => (v === e.a && f.vertices[(k + 1) % n] === e.b) || (v === e.b && f.vertices[(k + 1) % n] === e.a));
        const fwd = f.vertices[j] === e.a;
        f.vertices.splice(j + 1, 0, pid);
        f.edges.splice(j, 1, ...(fwd ? [e0.id, e1b.id] : [e1b.id, e0.id]));
        const pts = f.vertices.map((v) => g.points[v].p);
        f.angles = pts.map((q, k) => ang(tangentAt(q, pts[(k + pts.length - 1) % pts.length]), tangentAt(q, pts[(k + 1) % pts.length])));
      }
    }
  }
  C.points.sort((a, b) => lonAbout(c, g.points[a].p) - lonAbout(c, g.points[b].p));
  halfLinesOf(g, gen);
  checkCommon(g, gen);
  if (Object.keys(g.faces).length !== F0) fail(gen, 'faces changed');
  if (Object.keys(g.points).length - Object.keys(g0.points).length !== Object.keys(g.edges).length - Object.keys(g0.edges).length) fail(gen, 'V and E did not grow together');
  return g;
}
/** Angle of p about the axis c (for ordering circle points). */
function lonAbout(c, p) { const u = Math.abs(c[2]) < 0.9 ? unitv(cross([0, 0, 1], c)) : unitv(cross([1, 0, 0], c)), w = cross(c, u); const a = Math.atan2(dot(p, w), dot(p, u)); return a < 0 ? a + 2 * Math.PI : a; }
/** Intersections of the great circle with pole n and the small circle (centre c, angular radius rho): 0, 1 or 2 points. */
function circleLineRoots(n, c, rho) {
  const cp = subv(c, scl(n, dot(c, n))), k = nrm(cp);
  if (k < 1e-12) return [];
  const u = scl(cp, 1 / k), w = cross(n, u), a = Math.cos(rho) / k;
  if (Math.abs(a) > 1 + 1e-12) return [];
  const b = Math.sqrt(Math.max(0, 1 - a * a));
  const r1 = unitv(addv(scl(u, a), scl(w, b))), r2 = unitv(addv(scl(u, a), scl(w, -b)));
  return b < 1e-9 ? [r1] : [r1, r2];
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
const positional = (args) => args.filter((x) => !/^[\p{L}_][\p{L}\w]*=/u.test(x));

/**
 * Resolve an address of the marking (§1.2) into an object. Supported in commit 1 (S_N): P.N, P.S, P.eq[k]; L[k], L.eq;
 * L(P, azimuth=k) (also L(P, k)) → half-line; on(<half-line | line>, s, from=P) with s in mm or as a fraction of Q
 * ("0.25Q") → point; offset(<half-line>, d) → offset curve (side +1 = left of the half-line direction, d in mm; .at(s)
 * via offsetAt); C.eq; region(P, until=<circle>). Unknown or ambiguous addresses throw.
 * #52 commit 3 (any generator): graph ids and aliases (L[4] ≡ L.eq on S8 / C8); F[i] and face ids → face; P.center[F]
 * → face centre (constructed); X(L_a, L_b, near=P) and X(L_a, C, near=P) → intersection (two roots without near, or
 * none, throw; a root on a graph point returns that point); mid(E) → edge midpoint; L(P, Q) → great circle through two
 * points (oriented P → Q; `of` = the graph line if it is one); C(P, s) (mm or xQ) and C(P, ρ=…°) → circle about P;
 * region(P, until=<any circle about P>).
 * @param {{ graph: MGraph, R: number, Q: number }} mk  (the marking layer)
 * @param {string} address
 * @returns {any}
 */
export function resolve(mk, address) {
  const g = mk.graph, R = mk.R, a = address.trim();
  if (g.points[a]) return { type: 'point', id: a, p: g.points[a].p, xyz: scl(g.points[a].p, R) };
  if (g.lines[a]) return { type: 'line', id: a, n: g.lines[a].n };
  if (g.aliases && g.aliases[a]) return resolve(mk, g.aliases[a]);
  if (g.circles[a]) { const C = g.circles[a]; return { type: 'circle', id: a, c: C.c, rho: C.rho, onLine: C.onLine }; }
  const mF = /^F\[(\d+)\]$/.exec(a), fid = g.faces[a] ? a : mF ? Object.keys(g.faces)[Number(mF[1])] : undefined;
  if (fid !== undefined) { const f = g.faces[fid]; return { type: 'face', id: fid, vertices: f.vertices, edges: f.edges, center: f.center }; }
  if (mF) throw new Error(`marking: «${address}»: no face ${mF[1]}`);
  const mC = /^P\.center\[(.+)\]$/.exec(a);
  if (mC) {
    const f = resolve(mk, mC[1]);
    if (f.type !== 'face') throw new Error(`marking: «${address}»: ${mC[1]} is not a face`);
    return { type: 'point', id: a, kind: 'constructed', p: f.center, xyz: scl(f.center, R), of: f.id };
  }
  const call = /^(\w+)\((.*)\)$/.exec(a);
  if (!call) throw new Error(`marking: cannot resolve address «${address}»`);
  const [, fn, body] = call, args = splitArgs(body), pos = positional(args);
  if (fn === 'L' && pos.length === 2 && kw(args, 'azimuth') === undefined && !/^\d+$/.test(pos[1])) {
    const P = resolve(mk, pos[0]), Qp = resolve(mk, pos[1]);
    if (P.type !== 'point' || Qp.type !== 'point') throw new Error(`marking: «${address}»: L(P, Q) needs two points`);
    const c = cross(P.p, Qp.p);
    if (nrm(c) < 1e-9) throw new Error(`marking: «${address}»: the points coincide or are antipodal (no unique great circle)`);
    const n = unitv(c), of = Object.values(g.lines).find((L) => Math.abs(Math.abs(dot(L.n, n)) - 1) < TOL);
    return { type: 'line', id: a, n, of: of ? of.id : null };
  }
  if (fn === 'L') {
    const P = resolve(mk, pos[0]);
    if (P.type !== 'point') throw new Error(`marking: «${address}»: first argument is not a point`);
    const k = Number(kw(args, 'azimuth') ?? pos[1]);
    const hl = g.points[P.id].halfLines;
    if (!Number.isInteger(k) || k < 0 || k >= hl.length) throw new Error(`marking: «${address}»: azimuth ${k} not in 0…${hl.length - 1}`);
    if (!hl[k].line) throw new Error(`marking: «${address}»: azimuth ${k} is a circle direction, not a half-line`);
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
  if (fn === 'X') {
    const A = resolve(mk, pos[0]), B = resolve(mk, pos[1]), nearA = kw(args, 'near');
    const near = nearA === undefined ? null : resolve(mk, nearA);
    if (near && near.type !== 'point') throw new Error(`marking: «${address}»: near= must be a point`);
    const nOf = (x) => (x.type === 'line' || x.type === 'halfLine' ? x.n : null);
    if (!nOf(A)) throw new Error(`marking: «${address}»: first argument must be a line`);
    let roots;
    if (nOf(B)) {
      const c = cross(nOf(A), nOf(B));
      if (nrm(c) < 1e-9) throw new Error(`marking: «${address}»: the lines coincide`);
      roots = [unitv(c), scl(unitv(c), -1)];
    } else if (B.type === 'circle') roots = circleLineRoots(nOf(A), B.c, B.rho);
    else throw new Error(`marking: «${address}»: second argument must be a line or a circle`);
    if (!roots.length) throw new Error(`marking: «${address}»: no intersection`);
    if (roots.length === 2 && !near) throw new Error(`marking: «${address}»: two roots — add near=<point>`);
    const p = roots.length === 1 ? roots[0] : roots.reduce((best, q) => (ang(q, near.p) < ang(best, near.p) ? q : best));
    const hit = Object.values(g.points).find((q) => nrm(subv(q.p, p)) < TOL);
    return hit ? { type: 'point', id: hit.id, p: hit.p, xyz: scl(hit.p, R), address: a }
      : { type: 'point', id: a, kind: 'intersection', p, xyz: scl(p, R) };
  }
  if (fn === 'mid') {
    const e = g.edges[pos[0]];
    if (!e) throw new Error(`marking: «${address}»: no edge ${pos[0]}`);
    const p = unitv(addv(g.points[e.a].p, g.points[e.b].p));
    return { type: 'point', id: a, kind: 'constructed', p, xyz: scl(p, R), of: e.id };
  }
  if (fn === 'C') {
    const P = resolve(mk, pos[0]);
    if (P.type !== 'point') throw new Error(`marking: «${address}»: C(P, s | ρ=…°) needs a point`);
    const rA = kw(args, 'ρ') ?? kw(args, 'rho');
    let rho;
    if (rA !== undefined) rho = Number(rA.replace(/°$/, '')) * Math.PI / 180;
    else { const sA = kw(args, 's') ?? pos[1]; const s = sA !== undefined && /Q$/.test(sA) ? Number(sA.slice(0, -1)) * mk.Q : Number(sA); rho = s / R; }
    if (!(rho > 0 && rho < Math.PI)) throw new Error(`marking: «${address}»: radius out of (0, 180°)`);
    return { type: 'circle', id: a, c: P.p, rho, onLine: null, center: P.id };
  }
  if (fn === 'region') {
    const P = resolve(mk, pos[0]), until = resolve(mk, kw(args, 'until') ?? pos[1]);
    if (P.type !== 'point' || until.type !== 'circle') throw new Error(`marking: «${address}»: region(P, until=<circle>)`);
    if (Math.abs(dot(P.p, until.c) - 1) > TOL) throw new Error(`marking: «${address}»: ${P.id} is not the centre of ${until.id}`);
    // sMax = arc from the centre to the boundary = Q·ρ/(π/2) (Q = R·π/2; for C.eq exactly Q — the K12 stop, #52 commit 2)
    return { type: 'region', id: a, center: P.id, until: until.id, sMax: mk.Q * (until.rho / (Math.PI / 2)) };
  }
  throw new Error(`marking: address function «${fn}» not supported (P.*, L[k], L(P, azimuth), L(P, Q), on, offset, X, mid, C, P.center[F], F[i], region)`);
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
