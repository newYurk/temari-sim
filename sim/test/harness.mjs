// Test harness for sim/test/run.mjs (#34): computeAll memo, group gates, parallel runner, CI shards, --quick.
//
//   node sim/test/run.mjs               full suite; groups run in parallel worker processes (this is the gate)
//   node sim/test/run.mjs --serial      full suite in one process (pre-#34 behaviour; same stdout)
//   node sim/test/run.mjs --quick       subset for iterations, NOT the gate (skips the QUICK_SKIP groups)
//   node sim/test/run.mjs --shard=2/3   shard 2 of 3 only (CI matrix)
//   options: --jobs=N (worker processes; default availableParallelism() − 1), --no-cache, --plan (print the split)
//
// Groups: run.mjs has a line `if (G('name'))` before each of its top-level blocks. The code before the first
// gate is group 'pre'; it runs in every worker because later blocks read its results, and only one worker
// reports it. A parallel run prints the same stdout as --serial (groups in file order); timing goes to stderr.
//
// computeAll memo: computeAll is a pure function of (recipe, normalized params, leg-sample grid). Every call
// returns a fresh copy of the cached result, so a test that mutates its result (the V14/V21 negatives) cannot
// leak into another test, and two calls never share objects, exactly as uncached calls. In a parallel run the
// workers also share results through a per-run temp directory (v8.serialize, one writer per key), and the
// PREWARM configs, the slow ones (untilEquator on grids 192/384), are computed first, spread over the workers.
import { spawn } from 'node:child_process';
import { availableParallelism, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { serialize, deserialize } from 'node:v8';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, openSync, writeSync, closeSync, renameSync, rmSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';
import { computeAll as computeAllUncached, canonical } from '../src/layers.js';
import { normalizeParams } from '../src/params.js';
import { getLegSamples, setLegSamples } from '../src/path.js';
import { loadRecipe } from '../src/recipe.js';
import { runValidators } from '../src/validators.js';
import { stabilityBuilds } from './stability.mjs';

const RUN = fileURLToPath(new URL('./run.mjs', import.meta.url));
const argv = process.argv.slice(2);
const opt = (name) => {
  const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  return a === undefined ? undefined : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true;
};
const list = (s) => (typeof s === 'string' && s ? s.split(',') : []);
export const QUICK = !!opt('quick');
const NO_CACHE = !!opt('no-cache');
const MODE = opt('worker') !== undefined ? 'worker' : opt('serial') ? 'serial' : 'parallel';
const CACHE_DIR = MODE === 'worker' && !NO_CACHE ? process.env.TEMARI_SIM_CACHE_DIR : undefined;

// ---- schedule data (only affects speed, never results) ---------------------------------------------------
// Measured on an M4 Max, Node 24, seconds. PREWARM: slow computeAll configs shared by several groups.
// GROUP_COST: a group's own work besides PREWARM configs; uses: PREWARM indices it reads.
// If tests change, stale entries only cost time: re-measure with the per-worker timing on stderr.
const PREWARM = [
  { cost: 93, N: 384, raw: { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, rowsMode: 'untilEquator' } }, // 0
  { cost: 62, N: 384, raw: { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'untilEquator' } }, // 1
  { cost: 54, N: 192, raw: { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, rowsMode: 'untilEquator' } }, // 2
  { cost: 38, N: 192, raw: { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'untilEquator' } }, // 3
  { cost: 28, N: 96, raw: { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.32, rowsMode: 'untilEquator' } }, // 4
  { cost: 25, N: 96, raw: { shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, rowsMode: 'untilEquator' } }, // 5
  { cost: 17, N: 96, raw: { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'untilEquator' } }, // 6
  { cost: 16, N: 384, raw: { C_mm: 240, w_mm: 0.714, shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32, rowsMode: 'untilEquator' } }, // 7
  { cost: 14, N: 96, raw: { C_mm: 240, w_mm: 0.714, m_mm: 0.5, shoulderForm: 'bow', bowLambda: 0.2, muWrap: 0.32, rowsMode: 'untilEquator' } }, // 8
  { cost: 10, N: 96, raw: { C_mm: 300, topMode: 'fracQ', sTopFrac: 5 / 60, w_mm: 0.714 * 1.25, m_mm: 1.25, startRun_mm: 35 * 1.25, rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32 } }, // 9
  { cost: 10, N: 96, raw: { C_mm: 240, topMode: 'fracQ', sTopFrac: 5 / 60, rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32 } }, // 10
  { cost: 6, N: 192, raw: { C_mm: 240, w_mm: 0.714, shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32, rowsMode: 'untilEquator' } }, // 11
  // 12: block 2c (S16 at the default m, 4 mm top; #31).
  { cost: 12, N: 96, raw: { N: 16, sTop_mm: 4 } }, // 12
  // 13…: the builds of 8d0f (stability.mjs), in stabilityBuilds() order.
  // validate: also precompute the validator statuses (validatorStatuses); cost = compute + validate.
  // Bow at 384 (#36): compute + validators ≈ 38 s (λ 0.32) and ≈ 82 s (λ 0.6), mostly V8 on 384-point legs (#37).
  ...stabilityBuilds().map((b) => ({ cost: b.raw.shoulderForm === 'geodesic' ? (b.N === 384 ? 17 : 2) : b.N === 384 ? (b.raw.bowLambda >= 0.6 ? 82 : 38) : (b.raw.bowLambda >= 0.6 ? 12 : 5), validate: true, ...b })),
];
const GROUP_COST = {
  pre: { cost: 6 }, '2b': { cost: 4, uses: [9, 10] }, '2c': { cost: 8, uses: [12] }, 3: { cost: 6 }, 4: { cost: 5 }, 5: { cost: 0 }, 6: { cost: 3 },
  7: { cost: 6 }, 8: { cost: 14 }, '8b': { cost: 18 }, '8b2': { cost: 16 },
  '8c': { cost: 45, uses: [0, 1, 2, 3, 5, 6, 7, 11] }, '8d0': { cost: 1 }, '8d0a': { cost: 4, uses: [1, 5, 6] }, '8d0c': { cost: 1, uses: [4, 6, 8] },
  '8d0f': { cost: 2, uses: [6, ...stabilityBuilds().map((_, j) => 13 + j)] },
  '8d0b': { cost: 5 }, '8d': { cost: 14, uses: [6] }, '8e': { cost: 7, uses: [7, 11] }, '8f': { cost: 4, uses: [6] }, '8g': { cost: 8 },
  '8h': { cost: 20 }, '8i': { cost: 45, uses: [5, 6] }, '8j': { cost: 25 }, '8k': { cost: 12, uses: [5, 6] }, '8l': { cost: 6 }, '8m': { cost: 40 }, '8n': { cost: 45 }, '8o': { cost: 12 }, '8p': { cost: 20 }, '8q': { cost: 10 }, '8r': { cost: 15 }, '8s': { cost: 12 }, '8t': { cost: 2 }, '8u': { cost: 2 }, '8v': { cost: 4 }, '8w': { cost: 4 }, 9: { cost: 3 },
};
// --quick skips the fine grids (192/384) and the long untilEquator λ sweeps.
const QUICK_SKIP = new Set(['8c', '8d0a', '8d0c', '8d0f', '8d', '8e', '8i']);

// ---- computeAll memo -------------------------------------------------------------------------------------
const recipeKeys = new WeakMap();
const memo = new Map();
export const cacheStats = { hits: 0, misses: 0, disk: 0, statuses: 0 };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Shared per-run disk cache: first worker to claim a key computes it; others wait for the file. */
function viaDisk(key, compute, stat = 'disk') {
  const f = join(CACHE_DIR, createHash('sha1').update(key).digest('hex'));
  for (;;) {
    if (existsSync(f + '.bin')) { cacheStats[stat]++; return deserialize(readFileSync(f + '.bin')); }
    if (existsSync(f + '.err')) throw new Error(readFileSync(f + '.err', 'utf8'));
    let fd = null;
    try { fd = openSync(f + '.claim', 'wx'); } catch { /* claimed by another worker */ }
    if (fd !== null) {
      writeSync(fd, String(process.pid)); closeSync(fd);
      let obj;
      try { obj = compute(); } catch (e) { writeFileSync(f + '.err', String(e?.message ?? e)); throw e; }
      writeFileSync(`${f}.${process.pid}.tmp`, serialize(obj));
      renameSync(`${f}.${process.pid}.tmp`, f + '.bin');
      return obj;
    }
    for (let i = 1; !existsSync(f + '.bin') && !existsSync(f + '.err'); i++) {
      sleep(i < 100 ? 10 : 50);
      if (i % 100 === 0) {   // claimant died? take the key over
        const pid = Number(readFileSync(f + '.claim', 'utf8'));
        try { if (pid) process.kill(pid, 0); } catch { rmSync(f + '.claim', { force: true }); break; }
      }
    }
  }
}
function keyFor(recipe, raw) {
  if (!recipeKeys.has(recipe)) recipeKeys.set(recipe, canonical(recipe));
  return `${getLegSamples()}|${canonical(normalizeParams(raw))}|${recipeKeys.get(recipe)}`;
}
function cached(recipe, raw, key = keyFor(recipe, raw)) {
  let hit = memo.get(key);
  if (hit) { cacheStats.hits++; return hit; }
  cacheStats.misses++;
  hit = CACHE_DIR ? viaDisk(key, () => computeAllUncached(recipe, raw)) : computeAllUncached(recipe, raw);
  memo.set(key, hit);
  return hit;
}
const keyOf = new WeakMap();   // returned copy → cache key (for validatorStatuses)
/** Drop-in for layers.js computeAll in tests: memoized, returns a private deep copy. */
export function computeAll(recipe, raw) {
  if (NO_CACHE) return computeAllUncached(recipe, raw);
  const key = keyFor(recipe, raw);
  const out = structuredClone(cached(recipe, raw, key));
  keyOf.set(out, key);
  return out;
}
const statusMemo = new Map();
const statusesNow = (A) => Object.fromEntries(runValidators(A, A.path.ops.length - 1, null).map((v) => [v.id, v.status]));
function statusesFor(key, A) {
  let hit = statusMemo.get(key);
  if (!hit) {
    hit = CACHE_DIR ? viaDisk(`${key}|validators`, () => statusesNow(A), 'statuses') : statusesNow(A);
    statusMemo.set(key, hit);
  }
  return { ...hit };
}
/** Validator statuses { id: status } of a build at its last op (all V-classes). Memoized per computeAll key
 *  when A came unmodified from computeAll above; pass only builds the test has not mutated. */
export function validatorStatuses(A) {
  const key = keyOf.get(A);
  return key === undefined ? statusesNow(A) : statusesFor(key, A);
}

// ---- worker side -----------------------------------------------------------------------------------------
let current = 'pre';
const owned = new Set(list(opt('worker')));
const send = (m) => process.send?.(m);
if (MODE === 'worker') {
  console.log = (...a) => send({ g: current, line: format(...a) });
  const idx = list(opt('prewarm')).map(Number);
  if (idx.length && !NO_CACHE) {
    send({ g: '(prewarm)', t: performance.now() });
    const recipe = await loadRecipe();
    for (const i of idx) {
      setLegSamples(PREWARM[i].N);
      const key = keyFor(recipe, PREWARM[i].raw), A = cached(recipe, PREWARM[i].raw, key);
      if (PREWARM[i].validate) statusesFor(key, A);
    }
    setLegSamples(null);
  }
  send({ g: 'pre', t: performance.now() });
}
/** Gate before a top-level block of run.mjs: true = run the block in this process. */
export function G(name) {
  current = name;
  if (MODE === 'worker') { send({ g: name, t: performance.now() }); return owned.has(name); }
  return !(QUICK && QUICK_SKIP.has(name));
}
const quickLabel = () => `\nQUICK MODE: subset only, NOT the gate (skipped groups: ${[...QUICK_SKIP].join(', ')}); run the full suite before commit.`;
/** Called by run.mjs just before its final line. Worker: report and exit. Serial --quick: label and exit. */
export async function finish(failures) {
  if (MODE === 'worker') {
    await new Promise((r) => process.send({ done: true, t: performance.now(), cache: cacheStats }, r));
    process.exit(0);
  }
  if (QUICK) {
    console.log(quickLabel());
    console.log(failures === 0 ? 'QUICK SUBSET PASSED' : `FAILURES: ${failures}`);
    process.exit(failures ? 1 : 0);
  }
}

// ---- parallel orchestrator -------------------------------------------------------------------------------
const gcost = (g) => GROUP_COST[g]?.cost ?? 5;
const guses = (g) => GROUP_COST[g]?.uses ?? [];
/** Greedy longest-first split of groups into shards of `cores` workers each. A shard's estimated wall time is
 *  max(longest item, total cost / cores); PREWARM configs a shard already needs cost nothing more. */
function shardSplit(groups, n, cores) {
  const sh = Array.from({ length: n }, () => ({ load: 0, top: 0, groups: [], uses: new Set() }));
  const standalone = (g) => gcost(g) + guses(g).reduce((a, i) => a + PREWARM[i].cost, 0);
  const sorted = [...groups].sort((a, b) => standalone(b) - standalone(a) || groups.indexOf(a) - groups.indexOf(b));
  for (const g of sorted) {
    const fresh = (s) => guses(g).filter((i) => !s.uses.has(i));
    const after = (s) => {
      const load = s.load + gcost(g) + fresh(s).reduce((a, i) => a + PREWARM[i].cost, 0);
      const top = Math.max(s.top, gcost(g), ...fresh(s).map((i) => PREWARM[i].cost));
      return { load, top, wall: Math.max(top, load / cores) };
    };
    // Pick the shard that keeps the overall makespan lowest, then the one that stays shortest, then the lightest.
    const wall = (x) => Math.max(x.top, x.load / cores);
    const score = (x) => {
      const a = after(x);
      return [Math.max(a.wall, ...sh.filter((y) => y !== x).map(wall)), a.wall, a.load];
    };
    const less = (p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2];
    const s = sh.reduce((best, x) => (less(score(x), score(best)) < 0 ? x : best));
    Object.assign(s, after(s)); s.groups.push(g); for (const i of guses(g)) s.uses.add(i);
  }
  return sh.map((s) => s.groups.sort((a, b) => groups.indexOf(a) - groups.indexOf(b)));
}
/** Split one shard's work (its PREWARM configs + its groups) over k workers, longest first. */
function workerSplit(groups, k) {
  const pre = [...new Set(groups.flatMap(guses))];
  const items = [...pre.map((i) => ({ i, cost: PREWARM[i].cost })), ...groups.map((g) => ({ g, cost: gcost(g) }))]
    .sort((a, b) => b.cost - a.cost);
  const bins = Array.from({ length: k }, () => ({ load: 0, prewarm: [], groups: [] }));
  for (const it of items) {
    const b = bins.reduce((best, x) => (x.load < best.load ? x : best));
    b.load += it.cost;
    if (it.g !== undefined) b.groups.push(it.g); else b.prewarm.push(it.i);
  }
  for (const b of bins) b.groups.sort((a, c) => groups.indexOf(a) - groups.indexOf(c));
  return bins.filter((b) => b.groups.length || b.prewarm.length);
}

async function orchestrate() {
  const t0 = performance.now();
  const order = ['pre', ...[...readFileSync(RUN, 'utf8').matchAll(/^if \(G\('([^']+)'\)\)/gm)].map((m) => m[1])];
  let groups = QUICK ? order.filter((g) => !QUICK_SKIP.has(g)) : order;
  let label = QUICK ? ' --quick' : '';
  const jobs = Math.max(1, Number(opt('jobs')) || availableParallelism() - 1);
  const shardArg = opt('shard');
  if (shardArg !== undefined) {
    const [i, n] = String(shardArg).split('/').map(Number);
    if (!(Number.isInteger(i) && Number.isInteger(n) && i >= 1 && i <= n)) throw new Error(`bad --shard=${shardArg} (want i/n, 1 ≤ i ≤ n)`);
    groups = shardSplit(groups, n, jobs)[i - 1];
    label += ` shard ${i}/${n}`;
  }
  const bins = workerSplit(groups, jobs);
  if (opt('plan')) {
    console.log(`groups${label}: ${groups.join(', ')}`);
    for (const b of bins) console.log(`  worker ~${b.load} s: prewarm [${b.prewarm.join(',')}] groups [${b.groups.join(', ')}]`);
    process.exit(0);
  }
  const dir = NO_CACHE ? undefined : mkdtempSync(join(tmpdir(), 'temari-sim-'));
  const cleanup = () => { if (dir) rmSync(dir, { recursive: true, force: true }); };
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });
  const lines = new Map(groups.map((g) => [g, []]));
  const stats = [];
  const extra = argv.filter((a) => a === '--no-cache' || a === '--quick');
  await Promise.all(bins.map((bin, wi) => new Promise((resolve) => {
    const mine = new Set(bin.groups);
    const st = { wi, bin, done: false, times: {}, start: performance.now() };
    stats.push(st);
    let last = null;
    const args = [...process.execArgv, RUN, `--worker=${bin.groups.join(',')}`, `--prewarm=${bin.prewarm.join(',')}`, ...extra];
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: { ...process.env, TEMARI_SIM_CACHE_DIR: dir ?? '' },
    });
    child.on('message', (m) => {
      if (m.t !== undefined) {
        if (last) st.times[last.g] = (st.times[last.g] || 0) + (m.t - last.t);
        last = m.g !== undefined ? m : null;
      }
      if (m.line !== undefined && mine.has(m.g)) lines.get(m.g).push(m.line);
      if (m.done) { st.done = true; st.cache = m.cache; }
    });
    child.on('exit', (code, sig) => { st.code = code ?? sig; st.wall = performance.now() - st.start; resolve(); });
  })));
  cleanup();
  let failures = 0, oks = 0;
  for (const g of groups) {
    for (const l of lines.get(g)) {
      console.log(l);
      for (const s of l.split('\n')) { if (s.startsWith('  FAIL')) failures++; else if (s.startsWith('  ok ')) oks++; }
    }
  }
  const crashed = stats.filter((s) => !s.done || s.code !== 0);
  const err = (s) => process.stderr.write(s + '\n');
  err(`\n[run.mjs parallel${label}] ${bins.length} workers, ${groups.length} groups: ok ${oks}, FAIL ${failures}` +
    `${crashed.length ? `, CRASHED workers ${crashed.length}` : ''}, wall ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const s of stats.sort((a, b) => a.wi - b.wi)) {
    const per = Object.entries(s.times).map(([g, ms]) => `${g} ${(ms / 1000).toFixed(1)}`).join(', ');
    const c = s.cache ? ` cache hit ${s.cache.hits}, disk ${s.cache.disk}, computed ${s.cache.misses - s.cache.disk};` : '';
    err(`  worker ${s.wi + 1}: ${(s.wall / 1000).toFixed(1)} s,${c} ${per}${s.done && s.code === 0 ? '' : `  CRASHED (exit ${s.code})`}`);
  }
  failures += crashed.length;
  if (QUICK) console.log(quickLabel());
  console.log(`\n${failures === 0 ? (QUICK ? 'QUICK SUBSET PASSED' : 'ALL TESTS PASSED') : `FAILURES: ${failures}`}`);
  process.exit(failures ? 1 : 0);
}
if (MODE === 'parallel') await orchestrate();
