// @ts-check
// Конвейер слоёв: чистая функция (рецепт + параметры) → слои в порядке зависимостей
// base → marking → layout → rowPlan → path(обходы в порядке замысла: по ряду / блоками / явный) → validators. Каждый слой несёт штамп: хэш собственных входов
// и штампы слоёв-родителей. Пересчёт всегда с нуля: никаких кэшей между наборами параметров.
import { point, angleWithMeridian, rad } from './geom.js';
import { normalizeParams } from './params.js';
import { buildWork, stageLastOp } from './path.js';
import { generateSN, graphStats } from './marking.js';

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
  const sBot = base.Q * (1 - P.bottomFromEq);
  const pins = marking.phis.map((phi, k) => ({ line: k, s: sBot, p: point(base.R, sBot, phi) }));
  return { id: 'layout', inputs, parents, stamp: hash({ inputs, parents }), sTop, sBot, pins, topBasis: P.topMode === 'mm' ? 'мм от СП (GT14)' : 'доля Q' };
}

/** План уровней рядов по замыслу (только уровни s_top/s_bot; путь в 2a/2b — лишь ряд 1). Повторяет calc.py rows_geometry. */
export function layerRowPlan(recipe, P, base, marking, layout) {
  const inputs = pick(P, layerSpec(recipe, 'rowPlan').inputs);
  const parents = [base.stamp, marking.stamp, layout.stamp];
  const R = base.R, w = P.w_mm;
  const limit = P.rowsMode === 'untilOly7' ? base.Q - 7 : base.Q;
  const rows = [];
  let sT = layout.sTop, sB = layout.sBot;
  const maxRows = P.rowsMode === 'count' ? P.rowsCount : 200;
  for (let n = 1; n <= maxRows; n++) {
    const T = point(R, sT, marking.phis[0]), B = point(R, sB, marking.phis[1]);
    const aB = angleWithMeridian(B, T);
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

/** Крючок механики (этап 2.4+): слой, который по пути вычислит реальные подъёмы нить-на-нить и формы плеч.
 *  Сейчас его нет — рендер использует условное смещение по порядку стопки (display.js), помеченное как изображение. */
/**
 * Mechanics layer placeholder (not implemented yet); inputs accepted for the pipeline signature.
 * @param {any} [_recipe] @param {any} [_P] @param {any} [_path]
 * @returns {null}
 */
export function layerMechanics(_recipe, _P, _path) { return null; }

/** Полный пересчёт. raw — сырые параметры (из UI/URL/теста). */
export function computeAll(recipe, raw) {
  const P = normalizeParams(raw);
  const base = layerBase(recipe, P);
  const marking = layerMarking(recipe, P, base);
  const layout = layerLayout(recipe, P, base, marking);
  const rowPlan = layerRowPlan(recipe, P, base, marking, layout);
  const path = layerPath(recipe, P, base, marking, layout, rowPlan);
  const mechanics = layerMechanics(recipe, P, path);
  return { recipeId: recipe.id, params: P, base, marking, layout, rowPlan, path, mechanics, computedAt: Date.now() };
}

/** Префикс работы до операции k включительно (последовательное шитьё: префикс причинен). */
export function prefix(path, k) {
  const ops = path.ops.slice(0, k + 1);
  const ids = new Set(ops.flatMap((o) => o.segIds));
  return { ops, segs: path.segs.filter((s) => ids.has(s.id)), ids };
}
