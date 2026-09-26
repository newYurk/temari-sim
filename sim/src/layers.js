// @ts-check
// Конвейер слоёв: чистая функция (рецепт + параметры) → слои в порядке зависимостей
// base → marking → layout → rowPlan → path(обходы в порядке замысла: по ряду / блоками / явный) → validators. Каждый слой несёт штамп: хэш собственных входов
// и штампы слоёв-родителей. Пересчёт всегда с нуля: никаких кэшей между наборами параметров.
import { pointOnLine, angleWithLine, rad } from './geom.js';
import { normalizeParams } from './params.js';
import { buildWork, stageLastOp } from './path.js';
import { generateSN, generateC8, generateC10, generateC6, graphStats, resolve } from './marking.js';
import { normalizeRecipe } from './recipe.js';
import { kiku } from './program.js';
import { buildMechanics } from './mechanics.js';

/** Marking generators (#52 commit 3). S_N builds the full pipeline; the combination markings are drawn without a pattern. */
export const GENERATORS = { S_N: null, C8: generateC8, C10: generateC10, C6: generateC6 };

export function canonical(x) {
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
export function hash(x) {
  const s = canonical(x);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const pick = (P, keys) => Object.fromEntries(keys.map((k) => [k, P[k]]));
const layerSpec = (recipe, id) => recipe.layers.find((l) => l.id === id);

export function layerBase(recipe, P) {
  const inputs = pick(P, layerSpec(recipe, 'base').inputs);
  const R = P.C_mm / (2 * Math.PI), Q = P.C_mm / 4;
  return { id: 'base', inputs, parents: [], stamp: hash({ inputs }), R, Q, C: P.C_mm };
}

export function layerMarking(recipe, P, base) {
  const inputs = pick(P, layerSpec(recipe, 'marking').inputs);
  const recipeGen = layerSpec(recipe, 'marking').generator || 'S_N';
  if (!(recipeGen in GENERATORS)) throw new Error(`recipe ${recipe.id}: unknown marking generator «${recipeGen}» (S_N, C8, C10, C6)`);
  // #53 case 2: the recipe names its marking generator (kiku-c8-face: C8). The generator param shows another marking without
  // a pattern (#52 commit 3); its default S_N means «the recipe's own».
  const gen = P.generator && P.generator !== 'S_N' ? P.generator : recipeGen;
  if (!(gen in GENERATORS)) throw new Error(`marking: unknown generator «${gen}» (S_N, C8, C10, C6)`);
  if (gen !== 'S_N') {
    // #52 commit 3: combination marking (the generator joins the marking inputs; S_N stamps unchanged)
    const inp = { ...inputs, generator: gen };
    const graph = GENERATORS[gen](base.R);
    return { id: 'marking', inputs: inp, parents: [base.stamp], stamp: hash({ inputs: inp, parents: [base.stamp] }), N: null, phis: null, m: P.m_mm,
      generator: gen, markingOnly: gen !== recipeGen, graph, stats: graphStats(graph), R: base.R, Q: base.Q };
  }
  const N = P.N;
  const phis = Array.from({ length: N }, (_, k) => 2 * Math.PI * k / N);
  // #52 commit 1: the marking graph (S_N generator, invariants checked — a mismatch throws). Addresses resolve through
  // marking.js resolve(marking, address). N, phis, m stay as before (nothing above the marking changes in commit 1).
  const graph = generateSN(N, base.R);
  return { id: 'marking', inputs, parents: [base.stamp], stamp: hash({ inputs, parents: [base.stamp] }), N, phis, m: P.m_mm,
    generator: 'S_N', graph, stats: graphStats(graph), R: base.R, Q: base.Q };
}

export function layerLayout(recipe, P, base, marking) {
  const inputs = pick(P, layerSpec(recipe, 'layout').inputs);
  const parents = [base.stamp, marking.stamp];
  const sTop = P.topMode === 'mm' ? P.sTop_mm : P.sTopFrac * base.Q;
  // #54: row-1 bottom by the recipe's kiku.bottom (default fraction — the S8 level, bit for bit)
  const bm = recipe.kiku.bottom || { mode: 'fraction' };
  const botOf = (l) => (bm.mode === 'fraction' ? l * (1 - P.bottomFromEq) : bm.mode === 'mmFromCenter' ? bm.mm : l - bm.mm);
  let sBot = botOf(base.Q);
  // #52 commit 2 (spec stage3-arch §1.4): row-1 tops and bottoms as marking addresses plus resolved points. Kiku centre
  // P.N; set A — tops on even half-lines, bottoms on odd; set B — shifted by one half-line (startLine); levels are arcs
  // from the centre along the own half-line. side: null — the bite is the stitch centre on the line; its hole sides ±1 are
  // placed by G3 in path (needleSides depends on w, which is not a layout input). Stop region: region(P.N, until=C.eq).
  // #52 commit 3: centre and stop from the recipe addresses (schema v2; v1 implies P.N and region(P.N, until=C.eq)).
  // #53 commit 1 (spec §3.2): the kiku is a program — kiku(P, v, sets, grow, layer) produces the round templates (bites and
  // lays) and the row-1 bites; the path layer executes the program. S8 = kiku(P.N, 8). The program depends only on the
  // layout inputs and the recipe, so it rides in the layout layer (stamps unchanged).
  const center = recipe.kiku.center;
  const regionAddr = recipe.kiku.stop;
  const reg = resolve(marking, regionAddr);
  if (reg.type !== 'region') throw new Error(`recipe: kiku.stop «${regionAddr}» is not a region(...) address`);
  const region = { address: regionAddr, sMax: reg.sMax };
  // #53 case 2: region(P, until=graph) — half-lines of different length to the boundary: row-1 bottoms at ℓ_h·(1 − bottomFromEq)
  // (petals proportional to their half-lines; S8: ℓ = Q on every half-line, the same level as before).
  let sBotK = null;
  if (reg.sMaxK) { region.sMaxK = reg.sMaxK; sBotK = reg.sMaxK.map(botOf); sBot = null; }
  if (bm.mode !== 'fraction') for (const [k, l] of (reg.sMaxK || [reg.sMax]).entries()) {   // mm modes are checked; fraction keeps its old behaviour
    const b = botOf(l);
    if (!(b > sTop && b < l)) throw new Error(`recipe: kiku.bottom ${JSON.stringify(bm)} puts the row-1 bottom of half-line ${k} at ${b} mm — outside (sTop ${sTop}, ℓ ${l}) mm`);
  }
  const program = kiku(marking, { center, v: recipe.kiku.v, grow: recipe.kiku.grow, layer: recipe.kiku.layer, sTop, sBot: sBotK || sBot, stop: region,
    sets: recipe.work.sets.map((st) => ({ set: st.set, thread: st.thread, startLine: st.startLine, begin1: st.row1.begin, beginN: st.next.begin })) });
  const v = program.v, bites = program.bites;
  const at = (k, s) => resolve(marking, `on(L(${center},azimuth=${k}), ${s}, from=${center})`);
  const sBotAt = (k) => (sBotK ? sBotK[k] : sBot);
  const pins = Array.from({ length: v }, (_, k) => ({ line: k, s: sBotAt(k), p: at(k, sBotAt(k)).xyz }));
  // a non-default bottom mode joins the stamp (the default keeps the S8 stamp)
  const stamp = bm.mode === 'fraction' ? hash({ inputs, parents }) : hash({ inputs, parents, bottom: bm });
  return { id: 'layout', inputs, parents, stamp, sTop, sBot, ...(sBotK ? { sBotK } : {}), pins, topBasis: P.topMode === 'mm' ? 'mm from the north pole (GT14)' : 'fraction of Q',
    center, bites, region, program };
}

/** План уровней рядов по замыслу (только уровни s_top/s_bot; путь в 2a/2b — лишь ряд 1). Повторяет calc.py rows_geometry. */
export function layerRowPlan(recipe, P, base, marking, layout) {
  const inputs = pick(P, layerSpec(recipe, 'rowPlan').inputs);
  const parents = [base.stamp, marking.stamp, layout.stamp];
  const R = base.R, w = P.w_mm;
  // set A's first top and bottom half-lines (S8: L(P.N,0), L(P.N,1))
  const setA = recipe.work.sets[0].set;
  const bT = layout.bites.find((b) => b.set === setA && b.role === 'top'), bB = layout.bites.find((b) => b.set === setA && b.role === 'bottom');
  const hlTop = resolve(marking, bT.line);
  const hlBot = resolve(marking, bB.line);
  // K12 region boundary (#52 commit 2); #53 case 2: per half-line (region until=graph) — the plan follows set A's bottoms
  const sMaxA = layout.region.sMaxK ? layout.region.sMaxK[bB.k] : layout.region.sMax;
  const limit = P.rowsMode === 'untilOly7' ? sMaxA - 7 : sMaxA;
  const rows = [];
  let sT = layout.sTop, sB = layout.sBotK ? layout.sBotK[bB.k] : layout.sBot;
  const maxRows = P.rowsMode === 'count' ? P.rowsCount : 200;
  for (let n = 1; n <= maxRows; n++) {
    const T = pointOnLine(R, hlTop, sT), B = pointOnLine(R, hlBot, sB);
    const aB = angleWithLine(B, hlBot, T);
    const dB = P.spacingMode === 'laidClose' ? w / Math.sin(aB) : P.pitch_mm;
    rows.push({ n, sTop: sT, sBot: sB, alphaBdeg: aB * 180 / Math.PI, nextDBot: dB, beyondLimit: sB > limit + 1e-9 });
    if (P.rowsMode !== 'count' && sB + dB > limit + 1e-9) break;
    sT += w; sB += dB;
  }
  return { id: 'rowPlan', inputs, parents, stamp: hash({ inputs, parents }), rows, limit, nRows: rows.length,
    note: 'Верх ряда n+1 = верх n + w (GT14 «one thread width below»); низ — по замыслу шага. Реализован только путь ряда 1.' };
}

export function layerPath(recipe, P, base, marking, layout, rowPlan) {
  const inputs = pick(P, ['w_mm', 'm_mm', 'startRule', 'startRun_mm', 'order', 'blockSize', 'sequence', 'rowsMode', 'rowsCount', 'shoulderForm', 'mu']);
  const parents = [base.stamp, marking.stamp, layout.stamp, rowPlan.stamp];
  const res = buildWork(recipe, P, base, marking, layout, rowPlan);
  const order = res.rounds.map((r) => r.id);
  const stageEnd = Object.fromEntries([...Object.keys(recipe.stages), ...order].map((k) => [k, stageLastOp(recipe, res.ops, k)]));
  const A1 = res.rounds[0];
  return { id: `path:${order.join('+')}`, inputs, parents, stamp: hash({ inputs, parents, order }), ...res, order, stageEnd,
    // первый обход — для совместимости диагностики этапов 2a/2b
    start: A1.start, startLegId: A1.firstLegId };
}

/**
 * #5 mechanics layer (model/lift-spec.md §3.1): the lift of the thread axis over the finished path — a radial field over the
 * construction (it moves no hole and changes no placement rule). Plain data (mechanics.js buildMechanics); the profile
 * functions are rebuilt from it (liftFnFor, dentFnFor). liftMode display → { displayOnly: true } (the former tent).
 * @param {any} _recipe @param {any} P @param {any} path @param {any} base
 */
export function layerMechanics(_recipe, P, path, base) {
  if (!path || !base) return null;
  const inputs = pick(P, ['w_mm', 'hw', 'tension_N', 'wrapK_Nmm2', 'bendB_Nmm2', 'stackKappa', 'liftMode', 'lift1_w']);
  const parents = [path.stamp];
  return { id: 'mechanics', inputs, parents, stamp: hash({ inputs, parents }), ...buildMechanics(P, path, base) };
}

/** Полный пересчёт. raw — сырые параметры (из UI/URL/теста). */
export function computeAll(recipe0, raw) {
  const recipe = normalizeRecipe(recipe0);   // #52 commit 3: schema v2 (v1 accepted, deprecated)
  const P = normalizeParams(raw);
  const base = layerBase(recipe, P);
  const marking = layerMarking(recipe, P, base);
  if (marking.markingOnly) {
    // another marking than the recipe's (generator param): drawn without a pattern (no layout / rowPlan / path)
    return { recipeId: recipe.id, params: P, base, marking, layout: null, rowPlan: null, path: null, mechanics: null, markingOnly: true, computedAt: Date.now() };
  }
  const layout = layerLayout(recipe, P, base, marking);
  const rowPlan = layerRowPlan(recipe, P, base, marking, layout);
  const path = layerPath(recipe, P, base, marking, layout, rowPlan);
  const mechanics = layerMechanics(recipe, P, path, base);
  return { recipeId: recipe.id, params: P, base, marking, layout, rowPlan, path, mechanics, computedAt: Date.now() };
}

/** Префикс работы до операции k включительно (последовательное шитьё: префикс причинен). */
export function prefix(path, k) {
  const ops = path.ops.slice(0, k + 1);
  const ids = new Set(ops.flatMap((o) => o.segIds));
  return { ops, segs: path.segs.filter((s) => ids.has(s.id)), ids };
}
