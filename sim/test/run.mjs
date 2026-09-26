// Безбраузерные тесты: генератор пути + валидаторы. Запуск: node sim/test/run.mjs  (код выхода 0 = всё прошло)
import { loadRecipe, loadJSON } from '../src/recipe.js';
import { computeAll, G, finish, validatorStatuses } from './harness.mjs'; // memoized computeAll + group gates / parallel runner (#34)
import { runValidators, summary, refKey, k16bCoverageWindow, clairautAvgTan, geodesicAlphaAt, tipLevelMm } from '../src/validators.js';
import { PARAM_SCHEMA, defaults } from '../src/params.js';
import { stageLastOp, setLegSamples, getLegSamples, tangencyOk, TANGENCY_SIN_MAX, TANGENCY_RES_W } from '../src/path.js';
import { displayGeometry, stackProfile, STACK_LIFT_SKIP_KINDS, liftFromDist, DISPLAY_STACK_LIFT_W, LIFT_DIST_EPS, DIVE_W } from '../src/display.js';
import { tubeMesh } from '../src/tube.js';
import { norm, unit, mul, sub, add, dot, angle, cross } from '../src/geom.js';

const recipe = await loadRecipe();
const recipePreset = await loadJSON('../data/recipes/kiku-s8.json');
const materialPreset = await loadJSON('../data/materials/dmc-perle-5.json');
const ref = await loadJSON('../data/calc_reference.json');
// 6a.22: acceptance numbers that depend on (m+w) come from the CURRENT defaults (params.js) or from the
// independent theory reference sim/data/bow_reference.json (python3 sim/tools/bow_theory.py --json),
// never from hand-written literals. Changing the default m = one line in params.js + regenerating references.
const bowRef = await loadJSON('../data/bow_reference.json');
const DEF = defaults();
const bowTheory = (m = DEF.m_mm, w = DEF.w_mm, C = DEF.C_mm) => {
  const e = bowRef.entries.find((x) => Math.abs(x.m - m) < 1e-9 && Math.abs(x.w - w) < 1e-9 && Math.abs(x.C - C) < 1e-9);
  if (!e) throw new Error(`bow_reference.json has no entry for C=${C} w=${w} m=${m}; run python3 sim/tools/bow_theory.py --json`);
  return e;
};
const theoryAt = (lam, e = bowTheory()) => {
  const r = e.rows.find((x) => Math.abs(x.lam - lam) < 1e-9);
  if (!r) throw new Error(`bow_reference.json has no λ=${lam} row for m=${e.m}`);
  return r;
};
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ok ' : '  FAIL'} ${msg}`); if (!cond) failures++; };
const fmt = (x, d = 4) => x.toFixed(d);

function report(title, raw, stage = '2b') {
  const A = computeAll(recipe, raw);
  const V = runValidators(A, stage, ref);
  const s = summary(V);
  console.log(`\n## ${title} [${stage}]  ${JSON.stringify(raw)}`);
  for (const v of V) console.log(`  ${v.id.padEnd(4)} ${v.status.padEnd(5)} ${v.name}: ${v.value}`);
  check(s.fail === 0, `нет fail (pass ${s.pass}, warn ${s.warn}, info ${s.info}, n/a ${s['n/a']})`);
  return { A, V };
}

// 1. Stages 2a and 2b at default parameters (C = 240, w = 0.714, m = default from params.js, S8)
const a = report('По умолчанию', {}, '2a');
check(a.V.find((v) => v.id === 'V3').status === 'pass', '2a: префикс совпадает с calc.py (длина и E/X)');
const b = report('По умолчанию', {}, '2b');
check(b.V.find((v) => v.id === 'V3').status === 'pass', '2b: ряд 1 совпадает с calc.py');
const len0 = b.V.find((v) => v.id === 'V3').numbers.rowLen;
console.log(`  длина ряда 1 = ${fmt(len0)} мм (stage-1 calc до правки D16: 316,063 мм при захвате ±1 мм)`);

// 2. Набор параметров (требование параметричности): C = 240/300, w = 0.714/1.0 и др.
const sets = [
  { C_mm: 240, w_mm: 0.714 }, { C_mm: 300, w_mm: 0.714 }, { C_mm: 240, w_mm: 1.0 }, { C_mm: 300, w_mm: 1.0 },
  { startRule: 'OLY-BASIC', startRun_mm: 25 }, { C_mm: 300, topMode: 'fracQ' },
];
const res = {};
for (const p of sets) {
  const r = report('Набор', p, '2b');
  res[JSON.stringify(p)] = r;
  check(r.V.find((v) => v.id === 'V3').status === 'pass', `совпадение с calc.py (${refKey(r.A)})`);
}
const L = (p) => res[JSON.stringify(p)].V.find((v) => v.id === 'V3').numbers.rowLen;
// 2a. Масштаб по C: при фиксированных в мм верхней точке (5 мм, замысел GT14) и ширинах длина растёт почти как C
const ratio = L({ C_mm: 300, w_mm: 0.714 }) / L({ C_mm: 240, w_mm: 0.714 });
console.log(`\n  L(300)/L(240) = ${fmt(ratio, 5)} (чистое подобие дало бы 1,25; отличие — верх 5 мм и ширины нитей в мм не масштабируются)`);
check(ratio > 1.2 && ratio < 1.3, 'длина ряда 1 растёт с C как предсказывает геометрия');
// 2b. Подобие: если масштабировать ВСЕ длины входа (C, w, m, скрытый проход) и задать верх долей Q,
//     длина ряда должна вырасти ровно в C'/C — чистая математика, без подгонки.
if (G('2b'))
{
  const k = 1.25;
  const base = { C_mm: 240, topMode: 'fracQ', sTopFrac: 5 / 60 };
  const A1 = computeAll(recipe, { ...base });
  const A2 = computeAll(recipe, { ...base, C_mm: 240 * k, w_mm: 0.714 * k, m_mm: DEF.m_mm * k, startRun_mm: 35 * k });
  // 6a.11(3)/6a.12: similarity on FULL path (untilEquator), lengths in fractions of w or R — no absolute mm.
  const A1f = computeAll(recipe, { ...base, rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32 });
  const A2f = computeAll(recipe, { ...base, C_mm: 240 * k, w_mm: 0.714 * k, m_mm: DEF.m_mm * k, startRun_mm: 35 * k,
    rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32 });
  const threadLen = (path, thread) => path.segs.filter((s) => s.thread === thread).reduce((a, s) => a + s.length, 0);
  const r1 = threadLen(A1f.path, 'A'), r2 = threadLen(A2f.path, 'A');
  const b1 = threadLen(A1f.path, 'B'), b2 = threadLen(A2f.path, 'B');
  console.log(`  similarity ×1.25 full path: thread A ${fmt(r1)} → ${fmt(r2)}, ratio ${fmt(r2 / r1, 12)}; thread B ${fmt(b2 / b1, 12)}`);
  check(Math.abs(r2 / r1 - k) < 1e-5 && Math.abs(b2 / b1 - k) < 1e-5, 'similarity: full-path thread lengths scale by k (rel < 1e-5; discrete rail/pack)');
  // Segment-wise length ratios and first-drift xOff in units of w (not absolute mm).
  const segs1 = A1f.path.segs.filter((s) => s.type === 'leg');
  const segs2 = A2f.path.segs.filter((s) => s.type === 'leg');
  check(segs1.length === segs2.length, `similarity: same leg count (${segs1.length} vs ${segs2.length})`);
  let maxSegRel = 0, maxXOffW = 0;
  for (let i = 0; i < Math.min(segs1.length, segs2.length); i++) {
    const rel = Math.abs(segs2[i].length / segs1[i].length - k);
    if (rel > maxSegRel) maxSegRel = rel;
  }
  const st1 = A1f.path.stitches, st2 = A2f.path.stitches;
  for (let i = 0; i < Math.min(st1.length, st2.length); i++) {
    const dw = Math.abs(st2[i].xOff - k * st1[i].xOff) / (0.714 * k);
    if (dw > maxXOffW) maxXOffW = dw;
  }
  console.log(`  similarity segment |ratio−k| max ${fmt(maxSegRel, 8)}; xOff drift max ${fmt(maxXOffW, 6)} w`);
  check(maxSegRel < 1e-4, `similarity: every leg length scales by k (|Δratio| max ${fmt(maxSegRel, 12)})`);
  check(maxXOffW < 1e-4, `similarity: xOff scales by k (drift max ${fmt(maxXOffW, 12)} w)`);
  // Join class must not flip under scale (onRail↔climb was an absolute-mm artifact).
  let classFlip = 0;
  for (let i = 0; i < Math.min(segs1.length, segs2.length); i++) {
    if ((segs1[i].joinMode || null) !== (segs2[i].joinMode || null)) classFlip++;
  }
  check(classFlip === 0, `similarity: no joinMode class flips under ×k (flips ${classFlip})`);
}

// 2c. S16: dense marking — V5 catches neighbour-line reach; closing X squeeze in both JS and calc_reference (D37)
// 6a.22: at the default (thin) m the 5 mm top no longer reaches the neighbour line → S16 uses a 4 mm top;
// m = 1.0 with the 5 mm top is kept as the stress set.
if (G('2c'))
for (const s16 of [{ N: 16, sTop_mm: 4 }, { N: 16, m_mm: 1.0 }]) {
  const A = computeAll(recipe, s16);
  const V = runValidators(A, '2b', ref);
  const v5 = V.find((v) => v.id === 'V5');
  const lab = `S16 m=${A.params.m_mm} top ${A.layout.sTop} mm`;
  console.log(`\n  ${lab}: V5 ${v5.status}: ${v5.value}`);
  check(v5.status === 'fail', `${lab}: V5 = fail (catch reaches the neighbour marking line), as expected`);
  // calc.py stage-1 closed form unchanged; calc_reference.py applies G3/D36 neighbour-gap squeeze so V3=pass (D37).
  const m = A.params.m_mm, w = A.params.w_mm;
  const a1 = A.path.stitches.filter((st) => st.round === 'A1');
  const closing = a1.find((st) => st.closing);
  check(!!closing, 'S16 finds A1 closing stitch');
  const nonsq = a1.filter((st) => !(st.sides.squeeze || []).length);
  check(nonsq.length > 0, `S16 has non-squeezed A1 stitches (got ${nonsq.length}; refuse vacuous check)`);
  const sqList = closing.sides?.squeeze || [];
  const sq = sqList.find((q) => q.side === 'X');
  if (!sq) {
    check(false, 'S16 closing stitch missing X-side squeeze (no TypeError path)');
  } else {
    check(sq.gap < w, `S16 closing X-side squeeze has gap < w (gap=${sq.gap.toFixed(6)}, w=${w})`);
    const loOwn = -(m / 2 + w);
    check(Math.abs(closing.xOff - (loOwn - sq.gap / 2)) < 1e-9,
      `S16 closing xOff is mid-gap (got ${closing.xOff.toFixed(6)}, mid=${(loOwn - sq.gap / 2).toFixed(6)})`);
  }
  check(nonsq.every((st) => Math.abs(st.eOff - (m + w) / 2) < 1e-9 && Math.abs(st.xOff + (m + w) / 2) < 1e-9),
    'S16 non-squeezed A1 stitches keep E/X = ±(m+w)/2 (calc.py / calc_reference contract)');
  const v3 = V.find((v) => v.id === 'V3');
  console.log(`  S16 V3 ${v3.status} (expect pass after calc_reference squeeze): dXY=${v3.numbers?.dXY?.toFixed?.(9) ?? v3.numbers?.dXY}`);
  check(v3.status === 'pass' && (v3.numbers?.dXY ?? 1) < 1e-6,
    `S16 V3 pass (JS ↔ calc_reference); dXY=${v3.numbers?.dXY}`);
  const B = computeAll(recipe, { ...s16, sTop_mm: 8 });
  check(summary(runValidators(B, '2b', null)).fail === 0, 'S16 с верхом 8 мм: без fail');
}

// 3. Смена ширины нити сдвигает E/X автоматически (нет параметра «ширина захвата»)
if (G('3'))
{
  const A1 = res[JSON.stringify({ C_mm: 240, w_mm: 0.714 })].A, A2 = res[JSON.stringify({ C_mm: 240, w_mm: 1.0 })].A;
  const s1 = A1.path.stitches, s2 = A2.path.stitches;
  const dE = s2[0].eOff - s1[0].eOff, dX = s2[0].xOff - s1[0].xOff;
  const dXc = s2[7].xOff - s1[7].xOff;
  console.log(`\n  w 0,714 → 1,0: E сдвиг ${fmt(dE, 6)} мм, X ${fmt(dX, 6)} мм (ожидание ±Δw/2 = ±0,143), X замыкающего ${fmt(dXc, 6)} (ожидание −1,5Δw = −0,429)`);
  check(Math.abs(dE - 0.143) < 1e-9 && Math.abs(dX + 0.143) < 1e-9, 'E/X обычного стежка смещаются на ±Δw/2');
  check(Math.abs(dXc + 1.5 * 0.286) < 1e-9, 'X замыкающего стежка смещается на −1,5Δw (стартовая нить тоже шире)');
  const n1 = A1.rowPlan.nRows, n2 = A2.rowPlan.nRows;
  console.log(`  план рядов «до экватора, вплотную»: w=0,714 → ${n1} рядов, w=1,0 → ${n2} рядов`);
  check(n2 <= n1, 'более толстая нить даёт не больше рядов до экватора');
  const c4 = computeAll(recipe, { w_mm: 1.0, rowsMode: 'count', rowsCount: 4 });
  check(c4.rowPlan.nRows === 4, 'замысел «ровно 4 ряда» сохраняет число рядов при смене w');
  const mAlt = DEF.m_mm === 1.0 ? 0.5 : 1.0; // any m other than the default
  const m2 = computeAll(recipe, { m_mm: mAlt });
  check(Math.abs(m2.path.stitches[0].eOff - (mAlt + m2.params.w_mm) / 2) < 1e-12, `E = (m + w)/2 at m = ${mAlt} (catch follows the marking)`);
}

// 4. Чистота конвейера: пересчёт не зависит от предыдущего набора параметров
if (G('4'))
{
  const x1 = computeAll(recipe, { C_mm: 240 });
  const y = computeAll(recipe, { C_mm: 300, w_mm: 1.0, N: 16 });
  const x2 = computeAll(recipe, { C_mm: 240 });
  const lens = (A) => A.path.segs.map((s) => s.length);
  check(JSON.stringify(lens(x1)) === JSON.stringify(lens(x2)) && x1.path.stamp === x2.path.stamp, 'A(240) → A(300) → A(240): результат идентичен');
  check(x1.path.segs[0].pts !== x2.path.segs[0].pts && y.path.segs.length !== x1.path.segs.length, 'нет общих объектов между пересчётами');
  check(x1.base.stamp !== y.base.stamp && x1.path.stamp !== y.path.stamp, 'штампы слоёв меняются при смене входов');
  // #41: mari wrap parameters — exposed with basis, type sets only the μWrap default, geometry unchanged.
  const { normalizeParams, WRAP_THREADS, WRAP_THREAD_DEFAULT, MU_WRAP_RANGE, wrapMuDefault } = await import('../src/params.js');
  const wk = ['wrapColor', 'wrapThread', 'wrapCompliance'].map((k) => PARAM_SCHEMA.find((p) => p.key === k));
  check(wk.every((p) => p && p.basis && p.status && p.used), '#41: wrapColor / wrapThread / wrapCompliance in PARAM_SCHEMA with basis, status, use');
  check(defaults().wrapColor === '#fbf8f1' && defaults().wrapThread === WRAP_THREAD_DEFAULT && defaults().muWrap === 0.32,
    '#41: defaults — current ball colour, default type, μWrap 0.32 unchanged');
  check(Object.values(WRAP_THREADS).every((v) => v.source && v.width_mm === 0.3 && v.mu >= v.muBand[0] && v.mu <= v.muBand[1]
    && v.muBand[0] >= MU_WRAP_RANGE[0] && v.muBand[1] <= MU_WRAP_RANGE[1]), '#41: every wrap type has a source, width 0.3 mm, μ default inside its band ⊂ [0.2, 0.6]');
  check(Object.entries(WRAP_THREADS).every(([, v]) => (v.surface === 'smooth' ? v.mu === 0.32 : v.surface !== 'hairy spun' || (v.mu >= 0.35 && v.mu <= 0.40))),
    '#41: μ default 0.32 for smooth types, 0.35–0.40 for hairy spun types');
  check(normalizeParams({}).muWrap === 0.32 && normalizeParams({ wrapThread: 'spun-poly-60-90' }).muWrap === wrapMuDefault('spun-poly-60-90')
    && normalizeParams({ wrapThread: 'spun-poly-60-90', muWrap: 0.5 }).muWrap === 0.5, '#41: type sets the μWrap default only; an explicit μWrap wins');
  check(normalizeParams({ wrapColor: 'red' })._errors.length === 1 && normalizeParams({ wrapColor: '#AABBCC' }).wrapColor === '#aabbcc', '#41: wrapColor must be #rrggbb (loud input error)');
  check(normalizeParams({ wrapCompliance: 'x' }).wrapCompliance === defaults().wrapCompliance, '#41: wrapCompliance is a display-only estimate');
  const xw = computeAll(recipe, { C_mm: 240, wrapColor: '#336699', wrapThread: WRAP_THREAD_DEFAULT });
  check(JSON.stringify(lens(x1)) === JSON.stringify(lens(xw)) && JSON.stringify(x1.path.stitches.map((st) => [st.eOff, st.xOff, st.s]))
    === JSON.stringify(xw.path.stitches.map((st) => [st.eOff, st.xOff, st.s])), '#41: wrap colour / default type do not change the geometry');
}

// 5. В рецепте и параметрах нет «ширины захвата» (D16)
if (G('5'))
{
  const txt = JSON.stringify(recipe);
  check(!/bite|pickupWidth|pickup_width/i.test(txt), 'рецепт не содержит ширины захвата');
  check(!PARAM_SCHEMA.some((p) => /bite|pickup/i.test(p.key)), 'параметры не содержат ширины захвата');
}

// 6. Нить не парит (V14) и «крючки» у полюса на скриншоте 03 — проекция, а не отрыв от шара
if (G('6'))
{
  const A = computeAll(recipe, {});
  const V = runValidators(A, '2b', ref);
  const v14 = V.find((v) => v.id === 'V14');
  check(v14.status === 'pass', `V14: плечи на R (|r − R| ≤ ${v14.numbers.legDev.toExponential(1)}), меш ≤ R + ${v14.numbers.meshMax.toFixed(3)} = R + w`);
  // отрицательный тест: подвинуть одну точку плеча на 1 мм наружу — V14 обязан упасть
  const bad = computeAll(recipe, {});
  const leg = bad.path.segs.find((s) => s.type === 'leg');
  const i = Math.floor(leg.pts.length / 2);
  leg.pts[i] = mul(unit(leg.pts[i]), bad.base.R + 1);
  check(runValidators(bad, '2b', ref).find((v) => v.id === 'V14').status === 'fail', 'V14 ловит нить, поднятую на 1 мм над шаром');
  // камера вида «Косо» как на скриншоте 03 (render.js view('oblique')): D = 7,2R, fov 28°, кадр 1000 px, zoom 1,15
  const R = A.base.R, w = A.params.w_mm, D = 7.2 * R, c = mul(unit([0.55, -0.95, 0.9]), D);
  const ang = (v) => { const a = sub(v, c), b = mul(c, -1); return Math.acos(dot(a, b) / norm(a) / norm(b)); };
  const sil = Math.asin(R / D), fpx = 500 * 1.15 / Math.tan(14 * Math.PI / 180);
  let crossing = 0, worstPx = -Infinity, liftMax = 0;
  const idsA1 = new Set(A.path.segs.filter((x) => x.round === 'A1').map((x) => x.id));
  for (const dg of displayGeometry(A, idsA1)) {
    if (dg.hidden) continue;
    liftMax = Math.max(liftMax, dg.liftMax || 0);
    const front = dg.seg.pts.map((p) => dot(p, c) > R * R);
    if (front.some((x, k) => k > 0 && x !== front[k - 1])) crossing++;
    for (const v of tubeMesh(dg.pts, dg.radius).pos) worstPx = Math.max(worstPx, (Math.tan(ang(v)) - Math.tan(sil)) * fpx);
  }
  const wPx = ((w + liftMax) / D) * fpx * 1.05;   // проекция толщины трубки + условного подъёма стопки [изображение, D28] у лимба (+5 % на перспективу)
  console.log(`  вид «Косо»: плеч, пересекающих лимб шара: ${crossing}; трубка выходит за силуэт максимум на ${worstPx.toFixed(2)} px (толщина трубки ≈ ${(w / D * fpx).toFixed(2)} px, условный подъём стопки ≤ ${liftMax.toFixed(3)} мм ≈ ${(liftMax / D * fpx).toFixed(2)} px)`);
  check(crossing > 0 && worstPx <= wPx, '«крючки» у полюса — плечи, уходящие за лимб (видны сквозь прозрачный шар); за силуэт выходит только толщина трубки и условный подъём стопки');
  // скрытый старт: схема у поверхности не проходит сквозь шар; режим «хорда» совпадает с моделью
  const surf = displayGeometry(A, null, { hidMode: 'surf' }).filter((d) => d.seg.type === 'hidden-start');
  const chord = displayGeometry(A, null, { hidMode: 'chord' }).filter((d) => d.seg.type === 'hidden-start');
  const depth = (ds) => Math.max(...ds.flatMap((d) => d.pts.map((p) => R - norm(p))));
  check(surf.every((d) => d.schematic) && depth(surf) <= w + 1e-9, `скрытый старт по умолчанию — схема на ≤ w = ${w} мм под поверхностью (глубина ${depth(surf).toFixed(3)})`);
  check(chord.every((d) => !d.schematic) && Math.abs(depth(chord) - v14.numbers.hidDepth) < 1e-2, `режим «хорда»: глубина ${depth(chord).toFixed(2)} мм = модель`);
}

// 7. Этап 2c: B1 и A2 — последовательное шитьё, выводы из занятости, над/под, симметрия, баланс по нитям
if (G('7'))
{
  const sets2c = [{ C_mm: 240, w_mm: 0.714 }, { C_mm: 300, w_mm: 1.0 }, { C_mm: 240, w_mm: 1.0 }, { C_mm: 300, w_mm: 0.714 }];
  const R2 = {};
  for (const p of sets2c) {
    const b1 = report('Этап 2c', p, 'B1');
    const r = report('Этап 2c', p, 'A2');
    R2[JSON.stringify(p)] = r;
    const V = Object.fromEntries(r.V.map((v) => [v.id, v]));
    check(V.V15.status === 'pass', `B1 = A1, повёрнутый на 45° (${JSON.stringify(p)})`);
    check(V.V17.status === 'pass', 'игла у верха A2 под всеми плечами ряда 1 (uwagake)');
    check(V.V16.status === 'pass', 'игла не прокалывает нить');
    check(V.V18.status === 'pass' && /8\/8/.test(V.V18.value), 'над/под по правилу; переплетение A1 < B1 < A2 на всех плечах B1');
    check(V.V2.status === 'pass' && V.V1.status === 'pass', 'баланс и непрерывность по каждой нити');
    check(V.V8.status !== 'fail', `нет неразрешённого взаимопроникновения (V8 ${V.V8.status})`);
    check(summary(b1.V).fail === 0, 'этап B1 без fail');
    const t = V.V13.numbers.rows.find((x) => !x.closing);
    console.log(`  V13 ${JSON.stringify(p)}: верх ниже на ${fmt(t.dS, 3)} мм, шире на ${fmt(t.W - t.Wp, 3)} мм (${fmt((t.W - t.Wp) / r.A.params.w_mm, 2)} w) → статус ${V.V13.status}`);
  }
  // пересчёт: инварианты для 240/0,714 и 300/1,0 (в любом порядке — тот же результат, до бита)
  const sig = (A) => JSON.stringify(A.path.segs.map((x) => [x.id, x.length, x.from, x.to])) + JSON.stringify(A.path.crossings.map((c) => [c.a, c.b, c.over, c.kind, c.stack]));
  const a1 = computeAll(recipe, { C_mm: 240, w_mm: 0.714 }), b1 = computeAll(recipe, { C_mm: 300, w_mm: 1.0 });
  const a2 = computeAll(recipe, { C_mm: 240, w_mm: 0.714 }), b2 = computeAll(recipe, { C_mm: 300, w_mm: 1.0 });
  check(sig(a1) === sig(a2) && sig(b1) === sig(b2) && sig(a1) !== sig(b1), 'пересчёт 240/0,714 → 300/1,0 → 240/0,714 → 300/1,0: результаты идентичны своим наборам');
  // смена w сдвигает E/X и уровни ряда 2 автоматически (сдвигов в рецепте нет)
  const st = (A, i) => A.path.stitches.find((q) => q.round === 'A2' && q.i === i);
  const aw = computeAll(recipe, { w_mm: 0.714 }), bw = computeAll(recipe, { w_mm: 0.9 });
  console.log(`  w 0,714 → 0,9: верх A2 s ${fmt(st(aw, 2).s, 3)} → ${fmt(st(bw, 2).s, 3)}, E ${fmt(st(aw, 2).eOff, 3)} → ${fmt(st(bw, 2).eOff, 3)}; низ A2 s ${fmt(st(aw, 1).s, 3)} → ${fmt(st(bw, 1).s, 3)}`);
  check(Math.abs((st(bw, 2).s - st(aw, 2).s) - (0.9 - 0.714)) < 1e-9, 'верх A2 опускается ровно на Δw (адъюнктность каналов)');
  check(st(bw, 2).eOff !== st(aw, 2).eOff && st(bw, 1).s !== st(aw, 1).s, 'E верха и уровень низа A2 следуют за w');
  const lv = JSON.stringify(recipe.levels);
  check(!/\d+(\.\d+)?\s*(mm|мм)"/.test(lv) && typeof recipe.levels.top.next.value === 'string' && typeof recipe.levels.bottom.next.value === 'string', 'в рецепте уровни ряда n ≥ 2 — правила, не числа');
}


// 8. Shoulder form (D40): tip-drop Δ derived; geodesic vs small-circle bow (Φ3)
if (G('8'))
{
  const tipOf = (A) => A.path.tipDrop;
  const G = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'geodesic' });
  const B0 = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', muWrap: 0.32, bowLambda: 0, rowsMode: 'count', rowsCount: 2 });
  const B = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', muWrap: 0.32, bowLambda: 0.32, rowsMode: 'count', rowsCount: 3 });
  const Alias = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bowToMarking', mu: 0.32, rowsMode: 'count', rowsCount: 2 });
  const tg = tipOf(G), tb0 = tipOf(B0), tb = tipOf(B);
  console.log(`\n  tipDrop geodesic: ${fmt(tg.tipDrop_mm, 3)} mm`);
  console.log(`  tipDrop bow λ=0: ${fmt(tb0.tipDrop_mm, 3)} mm (must match geodesic)`);
  console.log(`  tipDrop bow λ=0.32: ${fmt(tb.tipDrop_mm, 3)} mm (bow ${fmt(tb.bowLateralMm, 3)}, λ=${fmt(tb.lambda, 3)})`);
  check(tg.tipDrop_mm > 4.5 && tg.tipDrop_mm < 5.5, `geodesic tipDrop in 4.5–5.5 mm (got ${fmt(tg.tipDrop_mm, 3)})`);
  const th0 = theoryAt(0), th32 = theoryAt(0.32), th60 = theoryAt(0.6);
  check(Math.abs(tg.tipDrop_mm - th0.tipDrop_mm) < 0.02, `geodesic tipDrop ≈ theory ${fmt(th0.tipDrop_mm, 3)} mm at default C/w/m (got ${fmt(tg.tipDrop_mm, 3)})`);
  check(Math.abs(tb0.tipDrop_mm - tg.tipDrop_mm) < 0.02, 'bow with λ=0 matches geodesic tipDrop');
  check(tg.shoulderForm === 'geodesic' && tg.bowLateralMm === 0, 'geodesic mode stores zero bow');
  check(tb.shoulderForm === 'bow' && tb.bowLateralMm > 0, 'bow: lateral sagitta > 0');
  check(Math.abs(tb.lambda - 0.32) < 1e-9, 'bowLambda=0.32 → λ = 0.32');
  check(tb.tipDrop_mm < tg.tipDrop_mm, 'bow reduces tipDrop vs geodesic (α′ steeper)');
  // 6a.11(1) tangent Δ₂ canon (replaces concentric §3); values from bow_reference.json at the current m
  console.log(`  theory 6a.11 tangent Δ≈${fmt(th32.tipDrop_mm, 4)} δ≈${fmt(th32.sagitta_mm, 4)} at λ=0.32 (m=${DEF.m_mm}); actual Δ=${fmt(tb.tipDrop_mm, 4)} δ=${fmt(tb.bowLateralMm, 4)}`);
  check(Math.abs(tb.tipDrop_mm - th32.tipDrop_mm) / th32.tipDrop_mm < 0.005, `bow tipDrop within 0.5% of tangent theory ${fmt(th32.tipDrop_mm, 4)} (got ${fmt(tb.tipDrop_mm, 4)})`);
  check(Math.abs(tb.bowLateralMm - th32.sagitta_mm) / th32.sagitta_mm < 0.005, `bow sagitta within 0.5% of theory ${fmt(th32.sagitta_mm, 4)} (got ${fmt(tb.bowLateralMm, 4)})`);
  const B60 = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, rowsMode: 'count', rowsCount: 2 });
  check(Math.abs(B60.path.tipDrop.tipDrop_mm - th60.tipDrop_mm) / th60.tipDrop_mm < 0.005, `λ=0.6 tipDrop within 0.5% of tangent theory ${fmt(th60.tipDrop_mm, 4)} (got ${fmt(B60.path.tipDrop.tipDrop_mm, 4)})`);
  check(Math.abs(B60.path.tipDrop.bowLateralMm - th60.sagitta_mm) / th60.sagitta_mm < 0.005, `λ=0.6 sagitta within 0.5% of theory ${fmt(th60.sagitta_mm, 4)} (got ${fmt(B60.path.tipDrop.bowLateralMm, 4)})`);
  check(Alias.path.tipDrop.shoulderForm === 'bow', 'alias bowToMarking → bow');
  check(!PARAM_SCHEMA.some((p) => /tipDrop|delta_mm|dS_mm/i.test(p.key)),
    'no tipDrop/delta_mm user input in PARAM_SCHEMA (Δ is derived only)');
  check(PARAM_SCHEMA.some((p) => p.key === 'bowLambda') && PARAM_SCHEMA.some((p) => p.key === 'muWrap'),
    'schema has bowLambda and muWrap');
  const a2 = B.path.stitches.find((st) => st.round === 'A2' && st.level === 'bottom' && st.i === 1);
  check(a2 && Math.abs(a2.levelInfo.dS - tb.tipDrop_mm) < 1e-9, 'A2 levelInfo.dS equals reported tipDrop');
  check(a2.levelInfo.shoulderForm === 'bow' && a2.levelInfo.bowLateralMm > 0, 'levelInfo carries shoulderForm/bow from prev arm');
  const Vb = runValidators(B, 'A2', null);
  check(Vb.find((v) => v.id === 'V2').status === 'pass', 'V2 passes with bow (polyLen legs)');
  check(summary(runValidators(G, 'A2', ref)).fail === 0, 'geodesic A2: no validator fail');
  console.log(`  tipDrop ${fmt(tb.tipDrop_mm, 3)} vs tangent theory ${fmt(th32.tipDrop_mm, 3)} (rows-to-equator asserted in §8c)`);
}



// 8b. V20 friction cone + V21 transversality (Fable v2) + direction / rail checks
if (G('8b'))
{
  console.log('\n## V20 / V21 (Fable v2)');
  const ok = computeAll(recipe, { shoulderForm: 'bow', muWrap: 0.32, bowLambda: 0.32, rowsMode: 'count', rowsCount: 2 });
  const Vok = runValidators(ok, 'A2', null);
  const v20 = Vok.find((v) => v.id === 'V20');
  const v21 = Vok.find((v) => v.id === 'V21');
  console.log(`  V20: ${v20.status} — ${v20.value}`);
  console.log(`  V21: ${v21.status} — ${v21.value}`);
  // Fable v2: warn when λ_max > μ; at λ=μ status is pass (not warn). Fail at λ ≥ 1.2μ.
  check(v20.status === 'pass' || v20.status === 'warn', 'V20 pass/warn at bowLambda=μ');
  check(Math.abs(v20.numbers.ratio - 1) < 1e-4, 'V20 λ/μ ≈ 1 at bowLambda=μ');
  check(v21.status === 'pass', 'V21 pass: transversality (one meeting, angle ≥ α_geo, stick ≤ 0.7 mm) on small-circle bow');

  // Negative V20: λ = 1.2 μ → fail (Codex §5.4)
  const over = computeAll(recipe, { shoulderForm: 'bow', muWrap: 0.32, bowLambda: 0.32 * 1.2, rowsMode: 'count', rowsCount: 2 });
  const Vover = runValidators(over, 'A2', null);
  const v20fail = Vover.find((v) => v.id === 'V20');
  console.log(`  V20 negative λ=1.2μ: ${v20fail.status} ratio=${v20fail.numbers.ratio}`);
  check(v20fail.status === 'fail' && v20fail.numbers.ratio >= 1.2 - 1e-12, 'V20 fails when λ ≥ 1.2μ');

  // Negative V21: glue a long tip run onto the destination meridian → fail (old bowToMarking spirit)
  const stuck = computeAll(recipe, { shoulderForm: 'bow', muWrap: 0.32, bowLambda: 0.32, rowsMode: 'count', rowsCount: 2 });
  const leg = stuck.path.segs.find((s) => s.type === 'leg' && s.round === 'A1' && s.level === 'bottom');
  const phi = stuck.marking.phis[leg.line];
  const nMer = [-Math.sin(phi), Math.cos(phi), 0];
  const n = leg.pts.length - 1;
  for (let i = Math.floor(n * 0.55); i <= Math.floor(n * 0.95); i++) {
    const u = leg.pts[i];
    const d = u[0]*nMer[0] + u[1]*nMer[1] + u[2]*nMer[2];
    const onMer = [u[0] - nMer[0]*d, u[1] - nMer[1]*d, u[2] - nMer[2]*d];
    const L = Math.hypot(...onMer);
    leg.pts[i] = onMer.map((x) => x / L * stuck.base.R);
  }
  const Vstuck = runValidators(stuck, 'A2', null);
  const v21fail = Vstuck.find((v) => v.id === 'V21');
  console.log(`  V21 negative stuck: ${v21fail.status} tipStick=${v21fail.numbers.tipStickMm}`);
  check(v21fail.status === 'fail', 'V21 fails when a long tip run is glued to the meridian (bowToMarking-style)');

  // Direction negative test (spec v3.1 §6.2(г), #39): equator-side center P. Below λ₀ = sin α_geo / tan(γ/2)
  // (λ = 0.16): α′ < α_geo and Δ₂ > Δ_geo. At λ ≥ λ₀ the tangent tail has no root below E — a loud fail by (12);
  // the old silent Δ = w from channelBinding is a forbidden fallback.
  const arrivalAlpha = (A) => {
    const leg = A.path.segs.find((s) => s.type === 'leg' && s.row === 1);
    const pts = leg.pts; const n = pts.length - 1;
    const E = unit(pts[n]);
    const Ttrav = unit(sub(pts[n], pts[n - 1]));
    const Tplane = unit(sub(Ttrav, mul(E, dot(Ttrav, E))));
    const up = unit(sub([0, 0, 1], mul(E, dot([0, 0, 1], E))));
    const merDown = mul(up, -1);
    return Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(Tplane), unit(merDown))))));
  };
  const geo = computeAll(recipe, { shoulderForm: 'geodesic', rowsMode: 'count', rowsCount: 2 });
  const dGeo = geo.path.tipDrop?.tipDrop_mm ?? NaN;
  const aGeo = arrivalAlpha(geo);
  const badDir = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.16, muWrap: 0.32, bowSide: 'equator', rowsMode: 'count', rowsCount: 2 });
  const aBad = arrivalAlpha(badDir);
  const dBad = badDir.path.tipDrop?.tipDrop_mm ?? NaN;
  console.log(`  direction neg λ=0.16 equator-side: α′=${fmt(aBad * 180 / Math.PI, 2)}° Δ=${fmt(dBad, 3)} vs geo α=${fmt(aGeo * 180 / Math.PI, 2)}° Δ=${fmt(dGeo, 3)}`);
  check(aBad < aGeo - 0.5 * Math.PI / 180, 'equator-side center at λ≤0.2: α′ < α_geo (wrong bulge direction)');
  const goodDir = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, bowSide: 'pole', rowsMode: 'count', rowsCount: 2 });
  check(arrivalAlpha(goodDir) > aGeo + 0.5 * Math.PI / 180, 'pole-side at λ=0.32: α′ > α_geo');
  check(goodDir.path.tipDrop && goodDir.path.tipDrop.tipDrop_mm < dGeo - 0.5, 'pole-side at λ=0.32 still improves Δ (no false fail)');

  // n≥2 = rail = concentric small circle about same P (Fable v2 §4.3 / formula (8))
  const railA = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 3 });
  const row1 = railA.path.segs.filter((s) => s.type === 'leg' && s.row === 1);
  const row2 = railA.path.segs.filter((s) => s.type === 'leg' && s.row === 2);
  console.log(`  layMode row1: ${[...new Set(row1.map((s) => s.layMode))]} row2: ${[...new Set(row2.map((s) => s.layMode))]}`);
  check(row1.length && row1.every((s) => s.layMode === 'smallCircle' || s.shoulderForm === 'bow'), 'row 1 legs are small-circle bow');
  check(row2.length && row2.every((s) => s.layMode === 'rail'), 'row n≥2 legs are rail (concentric about same P)');
  check(row2.every((s) => !!s.bowCenter), 'row n≥2 rails keep bowCenter (same P as row 1)');
  check(row2.every((s) => {
    const r1 = row1.find((r) => r.stitch === s.stitch && r.set === s.set && r.bowCenter);
    if (!r1) return false;
    const d = Math.hypot(s.bowCenter[0] - r1.bowCenter[0], s.bowCenter[1] - r1.bowCenter[1], s.bowCenter[2] - r1.bowCenter[2]);
    return d < 1e-12;
  }), 'rail bowCenter equals same-stitch row-1 P');
  check(row2.every((s) => {
    const r1 = row1.find((r) => r.stitch === s.stitch && r.set === s.set && Number.isFinite(r.rho));
    return r1 && s.rho > r1.rho + 1e-9;
  }), 'rail ρ > row-1 ρ (offset by w/R)');

  // Direction negative: must assert Δ > Δ_geo (Codex §5.7)
  check(dBad > dGeo + 0.5, `equator-side λ=0.16: Δ > Δ_geo (got ${fmt(dBad, 3)} vs ${fmt(dGeo, 3)})`);
  {
    const g1 = geo.path.segs.find((s) => s.type === 'leg' && s.row === 1);
    const lam0 = Math.sin(aGeo) / Math.tan(angle(unit(g1.from), unit(g1.to)) / 2);
    const lamHi = 0.32; // default bow λ; must lie at or above λ₀ for this branch of §6.2(г)
    const hiDir = computeAll(recipe, { shoulderForm: 'bow', bowLambda: lamHi, muWrap: 0.32, bowSide: 'equator', rowsMode: 'count', rowsCount: 2 });
    const v12 = runValidators(hiDir, hiDir.path.ops.length - 1, null).find((v) => v.id === 'V12');
    const rows2 = hiDir.path.segs.filter((q) => q.type === 'leg' && q.row === 2).length;
    const stops = Object.values(hiDir.path.stopped || {});
    const chan = hiDir.path.stitches.filter((st) => st.levelInfo?.channelBinding).length;
    console.log(`  direction neg λ=${lamHi} ≥ λ₀=${fmt(lam0, 3)} equator-side: V12 ${v12.status}; ${stops.map((q) => q.reason).join(' | ').slice(0, 140)}`);
    check(lam0 > 0.16 && lam0 <= lamHi, `λ₀ = sin α_geo / tan(γ/2) = ${fmt(lam0, 3)} separates the two §6.2(г) cases (0.16 < λ₀ ≤ ${lamHi})`);
    check(rows2 === 0 && stops.length === 2 && stops.every((q) => q.fail && /packing root missing/.test(q.reason)) && chan === 0,
      `equator-side λ=${lamHi} ≥ λ₀: no root below E — both sets stop with "packing root missing" (no Δ = w fallback; rows2 ${rows2}, channelBinding ${chan})`);
    check(v12.status === 'fail' && /packing root missing/.test(v12.value), 'missing packing root is a loud V12 fail with the message (§3.2(12))');
  }

  // bowLambda is the intent param; legacy bowFrac is empty optional
  const bl = PARAM_SCHEMA.find((p) => p.key === 'bowLambda');
  const bf = PARAM_SCHEMA.find((p) => p.key === 'bowFrac');
  check(bl && (bl.def === '' || bl.def == null), 'bowLambda default is empty (resolved to 0.32 only when form=bow and nothing else set)');
  check(bf && (bf.def === '' || bf.def == null), 'legacy bowFrac default is empty (prefer bowLambda)');

  // V21 angle emitted; 6a.20: free α_ref = analytic arc at axis (λ>0) / geodesic at axis (λ=0); bilateral 3% sine
  check(v21.numbers.minAngleDeg != null && v21.numbers.minAngleGeoDeg != null, 'V21 emits minAngleDeg / minAngleGeoDeg');
  check(v21.status === 'pass' && (v21.numbers.badAngle || 0) === 0, 'V21 lower-arm angle OK under 6a.20 (no 5° allowance)');
  // Gold (6a.20): row1 λ=0.32 → α_act≈16.777°, α_ref≈16.847°, sin ratio ≈0.996. These are the Codex-audited
  // values at m = 1.0, so they are checked on the m = 1.0 stress set (6a.22); the default m checks sinRatio below.
  {
    const okGold = computeAll(recipe, { shoulderForm: 'bow', muWrap: 0.32, bowLambda: 0.32, rowsMode: 'count', rowsCount: 2, m_mm: 1.0 });
    const v21g = runValidators(okGold, 'A2', null).find((v) => v.id === 'V21');
    const r1 = (v21g.numbers.angleRows || []).filter((r) => r.row === 1 && r.isFree !== false);
    const g = r1.find((r) => Math.abs(r.angleDeg - 16.777) < 0.05) || r1[0];
    check(!!g, '6a.20 gold: row1 angle row present');
    if (g) {
      console.log(`  6a.20 gold row1: α_act=${fmt(g.angleDeg, 3)}° α_ref=${fmt(g.alphaRefDeg, 3)}° sinRatio=${fmt(g.sinRatio, 4)}`);
      check(Math.abs(g.angleDeg - 16.777) < 0.05, `6a.20 gold α_act≈16.777° (got ${fmt(g.angleDeg, 3)})`);
      check(Math.abs(g.alphaRefDeg - 16.847) < 0.05, `6a.20 gold α_ref≈16.847° analytic-at-axis (got ${fmt(g.alphaRefDeg, 3)})`);
      check(Math.abs(g.sinRatio - 1) <= 0.03, `6a.20 gold |sinRatio−1|≤0.03 (got ${fmt(g.sinRatio, 4)})`);
    }
    const r1d = (v21.numbers.angleRows || []).filter((r) => r.row === 1 && r.isFree !== false);
    check(r1d.length > 0 && r1d.every((r) => Math.abs(r.sinRatio - 1) <= 0.03),
      `6a.20 default m=${DEF.m_mm}: row1 |sinRatio−1|≤0.03 (max ${fmt(Math.max(...r1d.map((r) => Math.abs(r.sinRatio - 1))), 4)})`);
  }

  // V20 bowSagMm: sag-invert λ still checked against discrete κ_g
  {
    const sag = computeAll(recipe, { shoulderForm: 'bow', bowSagMm: 1.632, muWrap: 0.32, rowsMode: 'count', rowsCount: 1 });
    const vs = runValidators(sag, '2b', null).find((v) => v.id === 'V20');
    console.log(`  V20 bowSagMm: ${vs.status} cmd=${vs.numbers.cmdLambda} source=${vs.numbers.cmdSource}`);
    check(vs.numbers.cmdSource === 'bowSagMm' || vs.numbers.cmdLambda != null, 'V20 bowSagMm sets a commanded λ');
    check(vs.status === 'pass' || vs.status === 'warn', 'V20 bowSagMm verifies discrete κ_g (no false skip)');
  }

}

// 8b2. V21 mutation negatives + V13 growth (Errata 6a.1)
if (G('8b2'))
{
  console.log('\n## V21 negatives + V13 growth (Errata 6a)');
  const R0 = () => computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 1 });

  // Stick exceedance ≈0.917 mm at C=240 (Errata 6a.5): must FAIL under per-leg thr ≈0.8 mm.
  // Glue a mid-crossing band onto the meridian (keeps α_geo); tip-only glue warps α_geo and thr.
  {
    const A = computeAll(recipe, { C_mm: 240, shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 1 });
    const leg = A.path.segs.find((s) => s.type === 'leg' && s.level === 'bottom');
    const R = A.base.R;
    const phi = A.marking.phis[leg.line];
    const nMer = [-Math.sin(phi), Math.cos(phi), 0];
    const signed = (i) => {
      const u = leg.pts[i];
      return R * Math.asin(Math.max(-1, Math.min(1, u[0]*nMer[0]+u[1]*nMer[1]+u[2]*nMer[2])));
    };
    let iMeet = -1;
    for (let i = 1; i < leg.pts.length; i++) if (signed(i - 1) * signed(i) < 0) { iMeet = i; break; }
    const lens = [0];
    for (let i = 1; i < leg.pts.length; i++) lens.push(lens[i - 1] + R * angle(leg.pts[i - 1], leg.pts[i]));
    const sMeet = lens[iMeet];
    const half = 0.70; // → stick ≳ 0.92 mm > thr ≈ 0.82
    for (let i = 0; i < leg.pts.length; i++) {
      if (Math.abs(lens[i] - sMeet) > half) continue;
      const u = leg.pts[i];
      const d = u[0]*nMer[0] + u[1]*nMer[1] + u[2]*nMer[2];
      const onMer = [u[0]-nMer[0]*d, u[1]-nMer[1]*d, u[2]-nMer[2]*d];
      const L = Math.hypot(...onMer) || 1;
      leg.pts[i] = onMer.map((x) => x / L * R);
    }
    const v = runValidators(A, '2b', null).find((x) => x.id === 'V21');
    const row = (v.numbers.stickRows || []).find((r) => r.id === leg.id) || {};
    const stick = row.stickMm ?? v.numbers.tipStickMm;
    const thr = row.thresholdMm ?? v.numbers.thresholdMm;
    console.log(`  V21 stick≈0.917@C240 stick=${fmt(stick, 3)} thr=${fmt(thr, 3)} status=${v.status}`);
    check(stick > 0.9 && stick > thr && v.status === 'fail', 'V21 fails on stick ≈0.917 mm at C=240 (per-leg thr ≈0.8)');
  }

  // Upper-leg stick ≈1.558 mm (segment∩band): must FAIL (angle gate does not apply; stick does)
  {
    const A = computeAll(recipe, { C_mm: 240, shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 1 });
    const leg = A.path.segs.find((s) => s.type === 'leg' && s.level === 'top');
    const R = A.base.R;
    const phi = A.marking.phis[leg.line];
    const nMer = [-Math.sin(phi), Math.cos(phi), 0];
    const signed = (i) => {
      const u = leg.pts[i];
      return R * Math.asin(Math.max(-1, Math.min(1, u[0]*nMer[0]+u[1]*nMer[1]+u[2]*nMer[2])));
    };
    let iMeet = -1;
    for (let i = 1; i < leg.pts.length; i++) if (signed(i - 1) * signed(i) < 0) { iMeet = i; break; }
    const lens = [0];
    for (let i = 1; i < leg.pts.length; i++) lens.push(lens[i - 1] + R * angle(leg.pts[i - 1], leg.pts[i]));
    const sMeet = lens[Math.max(0, iMeet)];
    const half = 0.80;
    for (let i = 0; i < leg.pts.length; i++) {
      if (Math.abs(lens[i] - sMeet) > half) continue;
      const u = leg.pts[i];
      const d = u[0]*nMer[0] + u[1]*nMer[1] + u[2]*nMer[2];
      const onMer = [u[0]-nMer[0]*d, u[1]-nMer[1]*d, u[2]-nMer[2]*d];
      const L = Math.hypot(...onMer) || 1;
      leg.pts[i] = onMer.map((x) => x / L * R);
    }
    const v = runValidators(A, '2b', null).find((x) => x.id === 'V21');
    const row = (v.numbers.stickRows || []).find((r) => r.id === leg.id) || {};
    const stick = row.stickMm ?? v.numbers.tipStickMm;
    console.log(`  V21 upper-leg stick=${fmt(stick, 3)} thr=${fmt(row.thresholdMm ?? v.numbers.thresholdMm, 3)} status=${v.status}`);
    check(stick > 1.0 && v.status === 'fail', 'V21 fails on upper-leg stick ≈1.56 mm (segment∩band counted)');
  }

  // Small angle: replace crossing neighborhood with a near-meridian path on ONE bottom leg
  {
    const A = R0();
    const leg = A.path.segs.find((s) => s.type === 'leg' && s.level === 'bottom');
    const R = A.base.R;
    const phi = A.marking.phis[leg.line];
    const nMer = [-Math.sin(phi), Math.cos(phi), 0];
    const signed = (i) => {
      const u = leg.pts[i];
      return R * Math.asin(Math.max(-1, Math.min(1, u[0]*nMer[0]+u[1]*nMer[1]+u[2]*nMer[2])));
    };
    let iMeet = -1;
    for (let i = 1; i < leg.pts.length; i++) if (signed(i - 1) * signed(i) < 0) { iMeet = i; break; }
    if (iMeet > 0) {
      const lens = [0];
      for (let i = 1; i < leg.pts.length; i++) lens.push(lens[i - 1] + R * angle(leg.pts[i - 1], leg.pts[i]));
      const sMeet = lens[iMeet];
      for (let i = 0; i < leg.pts.length; i++) {
        if (Math.abs(lens[i] - sMeet) > 3.0) continue;
        const u = unit(leg.pts[i]);
        const side = Math.sign(lens[i] - sMeet) || 1;
        const targetLat = side * 0.01; // mm
        const d = u[0]*nMer[0]+u[1]*nMer[1]+u[2]*nMer[2];
        let on = [u[0]-nMer[0]*d, u[1]-nMer[1]*d, u[2]-nMer[2]*d];
        const L = Math.hypot(...on) || 1;
        on = on.map((x) => x / L);
        const pushed = [on[0] + nMer[0]*(targetLat/R), on[1] + nMer[1]*(targetLat/R), on[2] + nMer[2]*(targetLat/R)];
        const Lp = Math.hypot(...pushed) || 1;
        leg.pts[i] = pushed.map((x) => x / Lp * R);
      }
    }
    const v = runValidators(A, '2b', null).find((x) => x.id === 'V21');
    console.log(`  V21 small-angle status=${v.status} badAngle=${v.numbers.badAngle} minAngle=${v.numbers.minAngleDeg}`);
    check(v.status === 'fail' && v.numbers.badAngle > 0, 'V21 fails when local crossing angle < α_geo (small-angle mutation)');
  }

  // Two crossings: pull mid-leg across the meridian an extra time
  {
    const A = R0();
    const leg = A.path.segs.find((s) => s.type === 'leg' && s.level === 'bottom');
    const phi = A.marking.phis[leg.line];
    const nMer = [-Math.sin(phi), Math.cos(phi), 0];
    const n = leg.pts.length - 1;
    for (let i = Math.floor(n * 0.25); i <= Math.floor(n * 0.4); i++) {
      const u = leg.pts[i];
      const d = u[0]*nMer[0]+u[1]*nMer[1]+u[2]*nMer[2];
      const flipped = [u[0]-2*nMer[0]*d, u[1]-2*nMer[1]*d, u[2]-2*nMer[2]*d];
      const L = Math.hypot(...flipped);
      leg.pts[i] = flipped.map((x) => x / L * A.base.R);
    }
    const v = runValidators(A, '2b', null).find((x) => x.id === 'V21');
    console.log(`  V21 two-crossings status=${v.status} badCrossings=${v.numbers.badCrossings}`);
    check(v.status === 'fail' && v.numbers.badCrossings > 0, 'V21 fails on two meridian crossings');
  }

  // Task 4 / 6a.11: mutating upper A2 rail shoulder must not inflate α_exp (ref = prev accepted).
  {
    const A = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 2 });
    const leg = A.path.segs.find((s) => s.type === 'leg' && s.round === 'A2' && s.level === 'top' && s.stitch === 2)
      || A.path.segs.find((s) => s.type === 'leg' && s.round === 'A2' && s.level === 'top');
    const prev = A.path.segs.find((s) => s.type === 'leg' && s.row === leg.row - 1 && s.stitch === leg.stitch && s.set === leg.set);
    const R = A.base.R;
    const phi = A.marking.phis[((leg.line % A.marking.N) + A.marking.N) % A.marking.N];
    const nMer = [-Math.sin(phi), Math.cos(phi), 0];
    // Glue a long near-meridian run (~2 mm stick). Self-referenced α_exp would raise the threshold and pass;
    // α_exp from accepted prev (≈0.18 mm thr) must fail.
    const n = leg.pts.length - 1;
    const i0 = Math.max(1, Math.floor(n * 0.15));
    const i1 = Math.min(n - 1, Math.floor(n * 0.85));
    for (let i = i0; i <= i1; i++) {
      const u = leg.pts[i];
      const d = u[0]*nMer[0] + u[1]*nMer[1] + u[2]*nMer[2];
      const on = [u[0] - nMer[0]*d, u[1] - nMer[1]*d, u[2] - nMer[2]*d];
      const L = Math.hypot(...on) || 1;
      const targetLat = 0.01; // mm signed lat inside ε strip
      const q = [on[0]/L*R + nMer[0]*(targetLat/R), on[1]/L*R + nMer[1]*(targetLat/R), on[2]/L*R + nMer[2]*(targetLat/R)];
      const Lq = Math.hypot(...q) || 1;
      leg.pts[i] = q.map((x) => x / Lq * R);
    }
    const v = runValidators(A, 'A2', null).find((x) => x.id === 'V21');
    const row = (v.numbers.stickRows || []).find((r) => r.id === leg.id) || (v.numbers.stickRows || [])[0];
    console.log(`  V21 mutated A2 upper stick=${fmt(row?.stickMm ?? v.numbers.tipStickMm, 3)} thr=${fmt(row?.thresholdMm ?? v.numbers.thresholdMm, 3)} αexp=${fmt(row?.alphaExpDeg, 2)} status=${v.status} (prev=${prev?.id})`);
    check(v.status === 'fail' && (row?.stickMm ?? 0) > (row?.thresholdMm ?? 0),
      'V21 fails when upper A2 rail is mutated (α_exp from accepted prev, not self)');
  }

  // V13 tip-width growth at A2 (Errata 6a.1 / 6a.6 / 6a.22) — lock Fable numbers; do NOT retune thresholds.
  // Acceptance = growth magnitude (+ monotonicity in λ where the spec asserts it), NOT V13 status.
  // The growth is not closed-form in m, so the spec tables are keyed by m: 6a.1/6a.6 at m = 1.0 (stress set,
  // monotonic), 6a.22(a) at m = 0.5 (thin marking: not monotonic; V13 no longer separates bow from geodesic).
  const V13_SPEC = {
    1.0: { src: '6a.1/6a.6', monotonic: true, grow: { 0: 0.21, 0.2: 0.43, 0.32: 0.59, 0.45: 0.75, 0.6: 0.92 } },
    0.5: { src: '6a.22(a)', monotonic: false, grow: { 0: 1.54, 0.2: 0.93, 0.32: 0.63, 0.45: 0.77, 0.6: 0.94 } },
  };
  check(V13_SPEC[DEF.m_mm] != null, `V13 spec table exists for the default m=${DEF.m_mm} (else ask Fable for the table)`);
  for (const mSpec of [...new Set([DEF.m_mm, 1.0])].filter((mm) => V13_SPEC[mm])) {
    const spec = V13_SPEC[mSpec];
    const expect = Object.entries(spec.grow).map(([lam, grow]) => ({ bowLambda: +lam, grow }));
    const grows = [];
    for (const e of expect) {
      const A = computeAll(recipe, {
        shoulderForm: e.bowLambda === 0 ? 'geodesic' : 'bow',
        bowLambda: e.bowLambda || undefined,
        muWrap: Math.max(0.32, e.bowLambda || 0),
        rowsMode: 'count', rowsCount: 2, m_mm: mSpec,
      });
      const V = runValidators(A, 'A2', null);
      const v13 = V.find((v) => v.id === 'V13');
      const row = (v13.numbers?.rows || []).find((x) => !x.closing) || (v13.numbers?.rows || [])[0];
      const w = A.params.w_mm;
      const grow = row ? (row.W - row.Wp) / w : NaN;
      grows.push(grow);
      console.log(`  V13 growth m=${mSpec} λ=${e.bowLambda}: ${fmt(grow, 3)} w (expect ${e.grow} ±0.1, ${spec.src}), status=${v13.status}`);
      check(Math.abs(grow - e.grow) <= 0.1, `V13 A2 tip-width growth m=${mSpec} λ=${e.bowLambda} within ±0.1 w of ${e.grow} (${spec.src})`);
    }
    if (spec.monotonic) check(grows.every((g, i) => i === 0 || g > grows[i - 1] - 1e-9), `V13 A2 tip-width growth monotonic in λ (m=${mSpec}, ${spec.src})`);
  }

  // Errata 6a.4: row-1 has no rail splice; exterior rail joins turn ≤ 1°; L_j ~ formula
  {
    const A = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 3 });
    const r1 = A.path.segs.filter((s) => s.type === 'leg' && s.row === 1);
    const r2 = A.path.segs.filter((s) => s.type === 'leg' && s.row === 2);
    check(r1.every((s) => (s.spliceMm ?? 0) < 1e-9), 'row-1 legs have no rail splice (spliceMm < 1e-9)');
    const ext = r2.filter((s) => !s.interiorXn && (s.lateralMm ?? 0) >= 0);
    const turns = ext.map((s) => Math.abs(s.turnAtTDeg ?? 99));
    // Spec v3.1 §6.4 (#39), class (ii): the turn at T₁ is grid error, ≤ 3·h·λ_r/R (h = output link of the leg,
    // λ_r = cot ρ_r of its rail); analytically 0. Was a bare 1°.
    const R2 = A.base.R, nS = getLegSamples();
    const entryTol = (s) => 3 * (s.length / nS) * Math.abs(1 / Math.tan(s.rho)) / R2 * 180 / Math.PI;
    console.log(`  rail exterior turns°: ${ext.map((s) => `${fmt(Math.abs(s.turnAtTDeg ?? 99), 3)}/${fmt(entryTol(s), 3)}`).join(', ')} (turn/tol)`);
    check(turns.length && ext.every((s) => Math.abs(s.turnAtTDeg ?? 99) <= entryTol(s)), 'exterior rail join turn at T ≤ 3·h·λ_r/R (§6.4 class (ii))');
    const diag = A.path.railDiagnostics;
    console.log(`  interiorXn: ${diag?.interiorXnCount}/${diag?.railLegs} byRow=${JSON.stringify(diag?.interiorXnByRow)}`);
    check(diag && diag.interiorXnCount > 0, 'railDiagnostics reports interior X_n count (pending Fable)');
    check(r2.some((s) => s.interiorXn) && r2.some((s) => !s.interiorXn), 'row-2 has both interiorXn (holding) and exterior (tangent) legs');
    // L_j ≈ R·√(2·|d|/R · tan ρ) = √(2·|d|·R·tan ρ)
    let ljOk = 0, ljN = 0;
    for (const s of ext) {
      const d = Math.abs(s.lateralMm ?? 0);
      if (d < 0.07 * (A.params.w_mm / 0.714)) continue; // ~0.05 mm at w0; scale with w (6a.11(3))
      const R = A.base.R, rho = s.rho;
      const expect = Math.sqrt(2 * d * R * Math.tan(rho));
      const got = s.spliceMm ?? 0;
      const rel = Math.abs(got - expect) / expect;
      console.log(`  L_j d=${fmt(d, 3)} expect≈${fmt(expect, 2)} got=${fmt(got, 2)} rel=${fmt(rel, 3)}`);
      ljN++; if (rel < 0.15) ljOk++;
    }
    if (ljN === 0) {
      // Exterior with d≈0: tangent join length is negligible (6a.4 — no splice threshold).
      check(ext.every((s) => (s.spliceMm ?? 0) < 0.07 * (A.params.w_mm / 0.714)), 'exterior d≈0 ⇒ spliceMm ≈ 0 (no false L_j)');
    } else {
      check(ljOk === ljN, 'L_j matches √(2·|d|·R·tan ρ) within 15% for exterior joins');
    }
  }

  // §5.2 last-segment θ at 96 samples ≤ 0.1°
  {
    const baseN = getLegSamples();
    setLegSamples(96);
    for (const lam of [0.32, 0.6]) {
      const A = computeAll(recipe, { shoulderForm: 'bow', bowLambda: lam, muWrap: Math.max(lam, 0.32), rowsMode: 'count', rowsCount: 1 });
      const leg = A.path.segs.find((s) => s.type === 'leg' && s.row === 1 && s.level === 'bottom');
      const pts = leg.pts, E = unit(pts[pts.length - 1]), X = unit(pts[0]);
      const gamma = angle(X, E);
      const thForm = Math.asin(lam * Math.tan(gamma / 2));
      const Ttrav = unit(sub(pts[pts.length - 1], pts[pts.length - 2]));
      const Tplane = unit(sub(Ttrav, mul(E, dot(Ttrav, E))));
      const c0 = unit(sub(X, mul(E, dot(X, E))));
      const cT = unit(sub(c0, mul(E, dot(c0, E))));
      const thLast = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(Tplane), unit(cT))))));
      const err = Math.abs(thLast - thForm) * 180 / Math.PI;
      console.log(`  §5.2 last-seg θ λ=${lam}: err=${fmt(err, 4)}°`);
      check(err <= 0.1, `§5.2 last-segment θ error ≤0.1° at 96 samples (λ=${lam})`);
    }
    setLegSamples(baseN);
  }
}

// 8c. Rows to equator, Δ_n trend, analytic θ (§5.2), convergence (§5.3)
if (G('8c'))
{
  console.log('\n## Rows to equator / Δ_n / θ / convergence (Fable §5.2–5.6)');
  const countA = (A) => A.path.rounds.filter((r) => r.set === 'A').length;
  const bottomsA = (A) => A.path.stitches.filter((st) => st.set === 'A' && st.level === 'bottom' && st.i === 1);
  const dSseries = (A) => {
    const b = bottomsA(A);
    const out = [];
    for (let i = 1; i < b.length; i++) out.push(b[i].s - b[i - 1].s);
    return out;
  };

  const Geq = computeAll(recipe, { shoulderForm: 'geodesic', rowsMode: 'untilEquator' });
  const B0eq = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0, muWrap: 0.32, rowsMode: 'untilEquator' });
  const B32 = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'untilEquator' });
  const B60 = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, rowsMode: 'untilEquator' });
  const n0 = countA(Geq), n00 = countA(B0eq), n32 = countA(B32), n60 = countA(B60);
  const lastTip = (A) => {
    const b = bottomsA(A);
    return b.length ? b[b.length - 1].s : NaN;
  };
  const d20 = dSseries(Geq)[0], d200 = dSseries(B0eq)[0];
  const tip0 = lastTip(Geq), tip00 = lastTip(B0eq);
  console.log(`  rows to equator: λ=0 geo ${n0}, bowλ=0 ${n00}, λ=0.32 ${n32}, λ=0.6 ${n60}`);
  console.log(`  Δ₂: geo ${fmt(d20, 5)}, bowλ=0 ${fmt(d200, 5)}; last tip (K12): geo ${fmt(tip0, 3)}, bowλ=0 ${fmt(tip00, 3)}`);
  console.log(`  tip next: geo ${fmt(Geq.path.stopped?.A?.sTip ?? NaN, 3)}, λ0.32 ${fmt(B32.path.stopped?.A?.sTip ?? NaN, 3)}, λ0.6 ${fmt(B60.path.stopped?.A?.sTip ?? NaN, 3)}`);
  // Full-path packing regression (§5.1 / Errata 6a.7): must reach equator with correct Δ₂ —
  // a w-tube packThenPierce false-positive stops early (~49 mm) with ~26–28 channel-like rows.
  // Δ₂ and rows from the independent theory at the current m (bow_reference.json); rows = tangent canon 1+floor(20/Δ₂).
  const t0 = theoryAt(0);
  // Spec v3.1 §6.3 (#39): Δ₂ agrees with the construction (12) to TOL_D2_REL — class (ii), 5× the measured 96/384
  // Δ₂ difference (≤ 0.012 % on bd0fc12; the spec rounds to 0.1 %). The premise (grid difference ≤ TOL/5) is checked
  // in the pack-grid block below. At λ = 0 the root is the free E₂⁰ (9а). Was ±0.02 mm (λ = 0) and 0.5 % (λ > 0).
  const TOL_D2_REL = 0.001;
  check(Math.abs(d20 - t0.tipDrop_mm) / t0.tipDrop_mm <= TOL_D2_REL, `λ=0 geo Δ₂ = free root E₂⁰ ${fmt(t0.tipDrop_mm, 4)} within ${TOL_D2_REL * 100}% (got ${fmt(d20, 5)})`);
  check(Math.abs(d200 - t0.tipDrop_mm) / t0.tipDrop_mm <= TOL_D2_REL, `λ=0 bow Δ₂ = free root E₂⁰ ${fmt(t0.tipDrop_mm, 4)} within ${TOL_D2_REL * 100}% (got ${fmt(d200, 5)})`);
  // λ=0: the canon 1+floor(20/Δ₂) is an estimate — Δ_n is not constant for free geodesics (6a.12: formula ±1).
  check(Math.abs(n0 - t0.rows_canon) <= 1 && n00 === n0,
    `λ=0: rows to equator = 1+floor(20/Δ₂) ±1 = ${t0.rows_canon}±1 (geo and bowλ=0 equal; m=${DEF.m_mm}) got ${n0}/${n00}`);
  // K12 stop as a formula (#39: was a bare 58–60 mm): the last tip is within the limit and the next would pass it.
  const lim0 = Geq.path.limit;
  check(tip0 <= lim0 && tip00 <= lim0 && Geq.path.stopped?.A?.sTip > lim0 && B0eq.path.stopped?.A?.sTip > lim0,
    `λ=0 last tip ≤ limit ${fmt(lim0, 2)} < next tip (K12; got geo ${fmt(tip0, 3)} / next ${fmt(Geq.path.stopped?.A?.sTip ?? NaN, 3)}, bow ${fmt(tip00, 3)})`);
  // Spec v3.1 §4.1, §6.1, §3.2(12) (#39): at λ = 0 the bottom legs are free, the arrival angle grows by Clairaut and
  // with the widening top, so Δ_n decreases; five rows at untilEquator with the default parameters.
  const d0s = dSseries(Geq);
  console.log(`  Δ_n λ=0: ${d0s.map((x) => fmt(x, 3)).join(', ')}`);
  check(d0s.every((x, i) => i === 0 || x < d0s[i - 1]), `λ=0 Δ_n strictly decreasing (${d0s.map((x) => fmt(x, 3)).join(' > ')})`);
  if (DEF.m_mm === 0.5 && DEF.C_mm === 240 && DEF.w_mm === 0.714) check(n0 === 5 && n00 === 5, `λ=0: 5 rows to the equator at the defaults (§6.1; got ${n0}/${n00})`);
  // 6a.12 / 6a.14: rows = 1+floor(20/Δ₂) ±1; Δ₂ ±0.5% vs table.
  // Δ_n (n≥3) ±3% of Δ₂ and non-decreasing — ONLY for λ > 0 (at λ=0 free geodesics may drift ≈5%/row).
  const table = bowTheory().rows.map((r) => ({ lam: r.lam, d2: r.tipDrop_mm, rows: r.rows_canon }));
  const tRow = (lam) => table.find((r) => Math.abs(r.lam - lam) < 1e-9);
  console.log(`  theory (m=${DEF.m_mm}) Δ₂: ${table.map((r) => `${r.lam}:${fmt(r.d2, 3)}`).join(' ')}; rows: ${table.map((r) => r.rows).join('/')}`);
  check(n32 === tRow(0.32).rows, `λ=0.32 rows = 1+floor(20/Δ₂) = ${tRow(0.32).rows} (got ${n32})`);
  check(n60 === tRow(0.6).rows, `λ=0.6 rows = 1+floor(20/Δ₂) = ${tRow(0.6).rows} (got ${n60})`);
  check(n0 < n32 && n32 < n60, 'row count monotonic in λ');

  const d32 = dSseries(B32), d60 = dSseries(B60);
  console.log(`  Δ_n λ=0.32: ${d32.map((x) => fmt(x, 3)).join(', ')}`);
  console.log(`  Δ_n λ=0.6: ${d60.slice(0, 8).map((x) => fmt(x, 3)).join(', ')}…`);
  check(Math.abs(d32[0] - tRow(0.32).d2) / tRow(0.32).d2 <= TOL_D2_REL, `λ=0.32 Δ₂ within ${TOL_D2_REL * 100}% of the construction (12) ${fmt(tRow(0.32).d2, 4)} (got ${fmt(d32[0], 5)})`);
  check(Math.abs(d60[0] - tRow(0.6).d2) / tRow(0.6).d2 <= TOL_D2_REL, `λ=0.6 Δ₂ within ${TOL_D2_REL * 100}% of the construction (12) ${fmt(tRow(0.6).d2, 4)} (got ${fmt(d60[0], 5)})`);
  const laterOk = (ds) => ds.slice(1).every((x, i) => Math.abs(x - ds[0]) / ds[0] <= 0.03 + 1e-12 && x + 1e-12 >= ds[i]);
  check(laterOk(d32), 'λ=0.32 Δ_n (n≥3) within ±3% of Δ₂ and monotonically non-decreasing');
  check(laterOk(d60), 'λ=0.6 Δ_n (n≥3) within ±3% of Δ₂ and monotonically non-decreasing');
  // Spec v3.1 §6.14 (#39): bottom tails at λ > 0, rows n ≥ 2 — the angle to the local meridian of the last 1.4·w before
  // E spreads over the rows by ≤ 0.03·tan α (class (iii), from the 3 % budget on Δ_n). Top legs: not applied.
  for (const [lam, B] of [[0.32, B32], [0.6, B60]]) {
    const R = B.base.R, w = B.params.w_mm;
    for (const set of ['A', 'B']) {
      const angs = [];
      for (const s of B.path.segs.filter((q) => q.type === 'leg' && q.set === set && q.row >= 2 && q.level === 'bottom')) {
        const pts = s.pts.map(unit), E = pts[pts.length - 1];
        let acc = 0, P = null;
        for (let i = pts.length - 1; i > 0 && !P; i--) {
          const d = R * angle(pts[i - 1], pts[i]);
          if (acc + d >= 1.4 * w) { const t = (1.4 * w - acc) / d; P = unit(add(pts[i], mul(sub(pts[i - 1], pts[i]), t))); }
          acc += d;
        }
        if (!P) continue;
        const c = unit(sub(P, mul(E, dot(P, E)))), up = unit(sub([0, 0, 1], mul(E, dot([0, 0, 1], E))));
        angs.push(Math.acos(Math.min(1, Math.abs(dot(c, up)))));
      }
      const spread = Math.max(...angs) - Math.min(...angs);
      const tol = 0.03 * Math.tan(angs.reduce((a, b) => a + b, 0) / angs.length);
      console.log(`  bottom tail spread λ=${lam} set ${set}: ${fmt(spread * 180 / Math.PI, 3)}° over ${angs.length} legs (tol 0.03·tan α = ${fmt(tol * 180 / Math.PI, 3)}°)`);
      check(angs.length > 0 && spread <= tol, `λ=${lam} set ${set}: bottom tail angle spread ≤ 0.03·tan α (§6.14 class (iii))`);
    }
  }

  // 6a.19 physicality: (α_geo−α_act) grows with n on lower arms (~0.6–0.7°/row at λ=0.32).
  // Row2 α_act≈α_ref is enforced by V21 sin-ratio (climb excluded from angle there).
  {
    const A32 = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'untilEquator' });
    const v = runValidators(A32, A32.path.ops.length - 1, null).find((x) => x.id === 'V21');
    const arms = (v.numbers.angleRows || []).filter((r) => r.set === 'A' && r.row >= 2);
    const byRow = new Map();
    for (const r of arms) {
      if (!byRow.has(r.row) || r.deficitDeg > byRow.get(r.row)) byRow.set(r.row, r.deficitDeg);
    }
    const rows = [...byRow.keys()].sort((a, b) => a - b);
    const defs = rows.map((r) => byRow.get(r));
    console.log(`  6a.19 deficit λ=0.32 A rows ${rows.join(',')}: ${defs.map((d) => fmt(d, 2)).join('° → ')}°`);
    check(rows.includes(2) && defs.length >= 3, '6a.19 deficit series covers row2..n');
    let mono = true;
    for (let i = 1; i < defs.length; i++) if (!(defs[i] > defs[i - 1] - 0.2)) mono = false;
    check(mono, '6a.19 deficit α_geo−α_act grows monotonically with row (λ=0.32)');
    check((v.numbers.badAngle || 0) === 0, '6a.20 V21 badAngle=0 (α_act vs α_ref bilateral 3% sine)');
  }

  // Packing-grid acceptance: rows and Δ_n identical on 96/192/384 for A,B at λ=0/0.32/0.6
  {
    const baseN = getLegSamples();
    for (const lam of [0, 0.32, 0.6]) {
      const form = lam ? 'bow' : 'geodesic';
      const snaps = {};
      for (const N of [96, 192, 384]) {
        setLegSamples(N);
        const A = computeAll(recipe, {
          C_mm: 240, w_mm: 0.714, shoulderForm: form, bowLambda: lam,
          muWrap: Math.max(lam, 0.32), rowsMode: 'untilEquator',
        });
        const rows = (set) => Math.max(0, ...A.path.segs.filter((s) => s.type === 'leg' && s.set === set).map((s) => s.row));
        const dS = (set) => {
          const b = A.path.stitches.filter((st) => st.set === set && st.level === 'bottom' && st.i === 1 && !st.closing);
          return b.slice(1).map((st, i) => +(st.s - b[i].s).toFixed(4));
        };
        const b1 = A.path.stitches.filter((st) => st.set === 'A' && st.level === 'bottom' && st.i === 1 && !st.closing);
        snaps[N] = { a: rows('A'), b: rows('B'), dA: dS('A'), dB: dS('B'), d2: b1[1].s - b1[0].s };
      }
      setLegSamples(baseN);
      const rowsSame = snaps[96].a === snaps[192].a && snaps[192].a === snaps[384].a
        && snaps[96].b === snaps[192].b && snaps[192].b === snaps[384].b;
      // Rows must match exactly. Δ_n within 0.5% across grids (dense-grid chatter ≤~0.003 mm on Δ≈2.3).
      const close = (a, b) => a.length === b.length && a.every((x, i) => {
        const tol = Math.max(0.005, 0.005 * Math.abs(b[i] || a[i] || 1));
        return Math.abs(x - b[i]) <= tol;
      });
      const dSame = close(snaps[96].dA, snaps[192].dA) && close(snaps[192].dA, snaps[384].dA)
        && close(snaps[96].dB, snaps[192].dB) && close(snaps[192].dB, snaps[384].dB);
      console.log(`  pack-grid λ=${lam}: 96=${snaps[96].a}/${snaps[96].b} rowsSame=${rowsSame} dSame=${dSame}`);
      check(rowsSame && dSame, `packing rows+Δ_n stable on 96/192/384 at λ=${lam} (A/B)`);
      // Premise of the class-(ii) Δ₂ tolerance (§6.3): the 96/384 difference of Δ₂ is ≤ TOL_D2_REL / 5.
      const g2 = Math.abs(snaps[96].d2 - snaps[384].d2) / snaps[384].d2;
      check(g2 <= TOL_D2_REL / 5, `λ=${lam}: |Δ₂(96) − Δ₂(384)|/Δ₂ = ${g2.toExponential(1)} ≤ TOL_D2_REL/5 (class (ii) premise)`);
    }
  }
  // Spot-check remaining table λ via tipDrop on two-row bow (Δ₂ only).
  for (const row of table.filter((r) => r.lam > 0 && r.lam !== 0.32 && r.lam !== 0.6)) {
    const A = computeAll(recipe, { shoulderForm: 'bow', bowLambda: row.lam, muWrap: Math.max(row.lam, 0.32), rowsMode: 'count', rowsCount: 2 });
    const d2 = A.path.tipDrop.tipDrop_mm;
    check(Math.abs(d2 - row.d2) / row.d2 <= TOL_D2_REL, `λ=${row.lam} Δ₂ within ${TOL_D2_REL * 100}% of the construction (12) ${fmt(row.d2, 4)} (got ${fmt(d2, 5)})`);
  }

  // §5.2: analytic tangent unit(±P×E) vs arcsin(λ·tan(γ/2))
  const Brow = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 1 });
  const leg1 = Brow.path.segs.find((s) => s.type === 'leg' && s.row === 1 && s.level === 'bottom');
  const Pc = unit(leg1.bowCenter), E = unit(leg1.to), X = unit(leg1.from);
  const T = unit(cross(Pc, E));
  const chord = unit(sub(X, mul(E, dot(X, E))));
  const chordT = unit(sub(chord, mul(E, dot(chord, E))));
  const TT = unit(sub(T, mul(E, dot(T, E))));
  const th = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(TT, chordT)))));
  const gamma = angle(X, E);
  const thForm = Math.asin(0.32 * Math.tan(gamma / 2));
  console.log(`  θ analytic ${fmt(th * 180 / Math.PI, 6)}° vs formula ${fmt(thForm * 180 / Math.PI, 6)}°`);
  check(Math.abs(th - thForm) * 180 / Math.PI < 1e-6, '§5.2 θ via P×E matches arcsin(λ·tan γ/2) to 1e-6°');

  // §5.3 convergence at 48/96/192/384
  const baseN = getLegSamples();
  const conv = [];
  for (const n of [48, 96, 192, 384]) {
    setLegSamples(n);
    const A = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 2 });
    conv.push({ n, d: A.path.tipDrop.tipDrop_mm, sag: A.path.tipDrop.bowLateralMm });
  }
  setLegSamples(baseN);
  console.log(`  convergence Δ: ${conv.map((c) => `${c.n}:${fmt(c.d, 6)}`).join(' ')}`);
  const ref = conv.find((c) => c.n === 96);
  check(conv.every((c) => Math.abs(c.d - ref.d) / ref.d < 0.005 && Math.abs(c.sag - ref.sag) / ref.sag < 0.005),
    '§5.3 Δ and δ at 48/96/192/384 within 0.5%');
}




// 8d0. K16b two-sided Clairaut window (6a.20) — pure formula
if (G('8d0'))
{
  console.log('\n## K16b two-sided Clairaut window (6a.20)');
  // Formula unit test on the Codex fef6b4e audit case, which was taken at m = 1.0 (stress set, 6a.22):
  // x_leg = +1.666 and α = 8.5° are that audit's measured inputs; everything else follows from m and w.
  const m = 1.0, w = 0.714;
  const alpha = 8.5 * Math.PI / 180;
  const half = w / (2 * Math.cos(alpha));
  const xE = (m + w) / 2;
  // Overshoot: E=+(m+w)/2, leg=+1.666 → |dx| > half → NOT coverage
  {
    const xLeg = 1.666;
    const deltaSum = (xLeg + (m + w) / 2) / Math.tan(alpha);
    const win = k16bCoverageWindow({ m, w, alpha, deltaSum, xE });
    console.log(`  overshoot: xE=${fmt(xE, 3)} xLeg=${fmt(win.xLeg, 3)} |dx|=${fmt(Math.abs(win.dxE), 3)} half=${fmt(win.half, 3)} covered=${win.coveredE}`);
    check(Math.abs(win.xLeg - 1.666) < 1e-9, `overshoot x_leg≈1.666 (got ${fmt(win.xLeg, 6)})`);
    check(Math.abs(win.xLeg - (-(m + w) / 2 + deltaSum * Math.tan(alpha))) < 1e-12, 'x_leg = −(m+w)/2 + Δsum·tan α');
    check(win.coveredE === false, `B2-style overshoot (leg=+1.666, E=+${fmt(xE, 3)}) is NOT coverage`);
    check(Math.abs(win.dxE) > win.half, 'overshoot |x_leg−x_E| > w/(2 cos α)');
  }
  // In-window: place x_leg at xE (perfect center) → covered
  {
    const deltaSum = ((m + w) / 2 + xE) / Math.tan(alpha); // x_leg = -(m+w)/2 + Δtan = xE
    const win = k16bCoverageWindow({ m, w, alpha, deltaSum, xE });
    console.log(`  centered: xLeg=${fmt(win.xLeg, 3)} |dx|=${fmt(Math.abs(win.dxE), 6)} half=${fmt(half, 3)} covered=${win.coveredE}`);
    check(win.coveredE === true, 'centered x_leg=x_E is coverage');
    check(Math.abs(win.xLeg - xE) < 1e-9, 'centered x_leg equals x_E');
  }
  // Edge of window: |x_leg−x_E| = half → covered; just outside → not
  {
    const xLegIn = xE + half;
    const dIn = (xLegIn + (m + w) / 2) / Math.tan(alpha);
    const winIn = k16bCoverageWindow({ m, w, alpha, deltaSum: dIn, xE });
    const xLegOut = xE + half + 1e-6;
    const dOut = (xLegOut + (m + w) / 2) / Math.tan(alpha);
    const winOut = k16bCoverageWindow({ m, w, alpha, deltaSum: dOut, xE });
    check(winIn.coveredE === true, `|x_leg−x_E|=half (${fmt(half, 4)}) is coverage`);
    check(winOut.coveredE === false, 'just outside half-width is NOT coverage');
  }
  // 6a.22(c): K16b window in Δsum·tan α at the default m: [(m+w) − w/(2 cos α), (m+w) + w/(2 cos α)]
  {
    const md = DEF.m_mm, wd = DEF.w_mm, aE = theoryAt(0.32).alpha_deg * Math.PI / 180;
    const lo = (md + wd) - wd / (2 * Math.cos(aE)), hi = (md + wd) + wd / (2 * Math.cos(aE));
    console.log(`  K16b window at m=${md} (α′(E)=${fmt(aE * 180 / Math.PI, 2)}° at λ=0.32): [${fmt(lo, 3)}; ${fmt(hi, 3)}]`);
    const winLo = k16bCoverageWindow({ m: md, w: wd, alpha: aE, deltaSum: lo / Math.tan(aE), xE: (md + wd) / 2 });
    const winHi = k16bCoverageWindow({ m: md, w: wd, alpha: aE, deltaSum: hi / Math.tan(aE), xE: (md + wd) / 2 });
    check(winLo.coveredE && winHi.coveredE, 'K16b window endpoints at the default m are coverage (validator = formula)');
  }
  // Clairaut average tan α rises when moving toward pole (smaller s) from hole
  {
    const R = 240 / (2 * Math.PI);
    const sHole = 50, sTip = 40;
    const tanAvg = clairautAvgTan(alpha, sHole, sTip, R);
    const tan0 = Math.tan(alpha);
    console.log(`  Clairaut tanAvg ${fmt(tanAvg, 5)} vs tan(α0)=${fmt(tan0, 5)} (s ${sHole}→${sTip})`);
    check(tanAvg > tan0, 'Clairaut avg tan α between hole and tip-n exceeds tan(α_hole)');
  }
  // One-sided would accept overshoot; two-sided rejects — document the correction
  {
    const xLeg = 1.666;
    const deltaSum = (xLeg + (m + w) / 2) / Math.tan(alpha);
    const rhs = (m + w) - w / (2 * Math.cos(alpha));
    const oneSided = deltaSum * Math.tan(alpha) >= rhs - 1e-9;
    const win = k16bCoverageWindow({ m, w, alpha, deltaSum, xE });
    check(oneSided === true && win.coveredE === false,
      'correction: one-sided promised overshoot, two-sided window rejects it');
  }
}

// 8d0a. Path link turns ≤20° over entire leg (excl. exact hole endpoint; 6a.18 allows hole kink)
if (G('8d0a'))
{
  console.log('\n## Path max link turn ≤20° (rail T→E direction)');
  const linkTurnsOk = (A, label) => {
    const R = A.base.R;
    let bad = 0, worst = 0, where = null;
    for (const s of A.path.segs.filter((x) => x.type === 'leg')) {
      const pts = s.pts;
      if (!pts || pts.length < 3) continue;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + R * angle(pts[i - 1], pts[i]));
      const total = cum[cum.length - 1];
      for (let i = 1; i < pts.length - 1; i++) {
        const fromEnd = Math.min(cum[i], total - cum[i]);
        if (fromEnd < 1e-6) continue; // allowed kink at hole itself
        const nrm = unit(pts[i]);
        const proj = (v) => {
          const p = sub(v, mul(nrm, dot(v, nrm)));
          const len = Math.hypot(p[0], p[1], p[2]);
          return len < 1e-15 ? null : mul(p, 1 / len);
        };
        const tIn = proj(unit(sub(pts[i], pts[i - 1])));
        const tOut = proj(unit(sub(pts[i + 1], pts[i])));
        if (!tIn || !tOut) continue;
        const c = Math.max(-1, Math.min(1, dot(tIn, tOut)));
        const sn = Math.max(-1, Math.min(1, dot(cross(tIn, tOut), nrm)));
        const turnDeg = Math.abs(Math.atan2(sn, c) * 180 / Math.PI);
        if (turnDeg > worst) { worst = turnDeg; where = `${s.id}/${s.round} ${turnDeg.toFixed(1)}° @${fromEnd.toFixed(2)}mm`; }
        if (turnDeg > 20 + 1e-6) bad++;
      }
    }
    check(bad === 0, `${label}: no link turn >20° excl hole (bad=${bad}, worst ${where || '—'})`);
    console.log(`  ${label}: bad=${bad} worst=${where || 'none'}`);
  };
  for (const cfg of [
    { label: 'geo0@96', shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0, rowsMode: 'untilEquator' },
    { label: 'bow0.32@96', shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'untilEquator' },
    { label: 'bow0.6@96', shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, rowsMode: 'untilEquator' },
  ]) {
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, ...cfg });
    linkTurnsOk(A, cfg.label);
  }
  // Spot-check denser grid (384) on bow 0.32 — former A3/s70 foldback site
  {
    const prev = getLegSamples();
    setLegSamples(384);
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'untilEquator' });
    linkTurnsOk(A, 'bow0.32@384');
    setLegSamples(prev);
  }
}

// 8d0c. Spec v3 §3.2(13) (v2 6a.23, #21) rail exit: tangent root / on-rail E / drain / free geodesic; no throw, no cost pull.
if (G('8d0c'))
{
  console.log('\n## v3 §3.2(13) rail exit classes (root / atE / drain / free; fail only on contradiction)');
  for (const lam of [0.32, 0.6]) {
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: lam, muWrap: 0.32, rowsMode: 'untilEquator' });
    const w = A.params.w_mm;
    const rail = A.path.segs.filter((s) => s.type === 'leg' && s.exitKind);
    const by = {};
    for (const s of rail) by[s.exitKind] = (by[s.exitKind] || 0) + 1;
    console.log(`  λ=${lam}: rail legs ${rail.length} ${JSON.stringify(by)}`);
    check(rail.length > 0 && rail.every((s) => ['root', 'atE', 'drain', 'free'].includes(s.exitKind)),
      `λ=${lam}: every rail exit is root/atE/drain/free (no contradiction; got ${JSON.stringify(by)})`);
    // v3.1 §3.2(13б) (#39): an accepted tangency needs BOTH sin ≤ 0.01 AND residual ≤ 0.02·w (was OR); print both.
    const roots = rail.filter((s) => s.exitKind === 'root');
    const badRoot = roots.filter((s) => !(s.exitSin <= TANGENCY_SIN_MAX && s.exitResMm <= TANGENCY_RES_W * w));
    console.log(`  λ=${lam}: root exits ${roots.length}, max sin ${fmt(Math.max(0, ...roots.map((s) => s.exitSin)), 4)}, max res ${fmt(Math.max(0, ...roots.map((s) => s.exitResMm)) / w, 4)}·w`);
    check(badRoot.length === 0, `λ=${lam}: every root exit meets sin≤0.01 AND res≤0.02w (bad ${badRoot.map((s) => `${s.id} sin ${fmt(s.exitSin, 4)} res ${fmt(s.exitResMm / w, 3)}w`).join(',') || 0})`);
    // v3.1 §3.2(9б), §6.4 (#39): |d_n| ≤ 0.02·w is the degenerate entry — on the rail at the foot, no tangency search.
    const degen = A.path.segs.filter((s) => s.type === 'leg' && s.row >= 2 && s.joinMode && s.joinMode !== 'free'
      && Math.abs(s.lateralMm ?? Infinity) <= TANGENCY_RES_W * w);
    check(degen.length > 0 && degen.every((s) => s.joinMode === 'onRail' && s.spliceMm === 0),
      `λ=${lam}: every |d_n| ≤ 0.02·w entry is degenerate on-rail (${degen.length}; bad ${degen.filter((s) => s.joinMode !== 'onRail').map((s) => `${s.id} ${s.joinMode}`).join(',') || 0})`);
    // Lower end (bottom legs, v3 §3.2(12)): E_n is the packing root on the rail — the thread stays on the rail to E_n.
    const botOff = rail.filter((s) => s.level === 'bottom' && s.exitKind !== 'atE');
    check(botOff.length === 0, `λ=${lam}: bottom legs end on the rail at E_n (atE; off ${botOff.map((s) => s.id).join(',') || 0})`);
    // Upper end (top legs, v3 §3.2(13)): tangent / drain / free — never 'atE' (#35: the |d_E| band gave a hook).
    const topAtE = rail.filter((s) => s.level === 'top' && s.exitKind === 'atE');
    check(topAtE.length === 0, `λ=${lam}: no top leg ends 'atE' (by leg role, #35; got ${topAtE.map((s) => s.id).join(',') || 0})`);
  }
  // (13б) is a double criterion: the direction alone is blind to a parallel, offset chord (Codex on 595846f).
  check(tangencyOk(0.0047, 0.21 * 0.714, 0.714) === false && tangencyOk(0.0047, 0.01 * 0.714, 0.714) === true
    && tangencyOk(0.02, 0.001, 0.714) === false,
    '(13б): sin 0.0047 at residual 0.21·w is not a tangency; both sin ≤ 0.01 and residual ≤ 0.02·w are required');
  // No tangent root is not a throw (v3 §3.2(13г)): m=0.5, λ=0.2 used to throw "no co-directional tangency".
  let thrown = null;
  try { computeAll(recipe, { C_mm: 240, w_mm: 0.714, m_mm: 0.5, shoulderForm: 'bow', bowLambda: 0.2, muWrap: 0.32, rowsMode: 'untilEquator' }); }
  catch (e) { thrown = e.message; }
  check(thrown === null, `m=0.5 λ=0.2 builds without a rail-exit throw (${thrown ? thrown.slice(0, 80) : 'ok'})`);
}

// 8d0f. Round-off / perturbation stability + raw-polyline turns + T₁ boundary root (#35, #34 item 5)
if (G('8d0f'))
{
  console.log('\n## Stability: inputs ×(1+1e−9), λ+1e−9, ×1.25 similarity → same decisions (#35)');
  const { perturb, compareBuilds, rawTurns, TOL_CONT, RAW_TURN_MAX_DEG, STABILITY_CASES: cases, STABILITY_BASE } = await import('./stability.mjs');
  const { exitCandidates } = await import('../src/path.js');
  // (13в) window ends are candidates: a tangency at T₁ (no sign change, no interior minimum) must be found.
  const mk = (f) => (sv) => ({ s: sv, res: f(sv), score: 1 });
  const fwd = exitCandidates(mk((sv) => 1e-4 + 1e-3 * (sv - 2)), 2, 10, 160).cands;
  check(fwd.some((c) => c.s === 2), `exit window start T₁ is a tangency candidate (forward; cands at ${fwd.map((c) => c.s.toFixed(3)).join(',')})`);
  const bwd = exitCandidates(mk((sv) => 1e-4 + 1e-3 * (2 - sv)), 0, 2, 160).cands;
  check(bwd.some((c) => c.s === 2), `exit window end T₁ is a tangency candidate (backward; cands at ${bwd.map((c) => c.s.toFixed(3)).join(',')})`);
  // #40: arcs.js degenerate cases are loud, and no side is read from a near-zero number.
  {
    const { offsetChain, trimConcave, arcSmall, arcGC, Chain, TRIM_MARGIN } = await import('../src/arcs.js');
    const sph = (th, ph) => [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
    const z = [0, 0, 1];
    const P = arcSmall(sph(0.1, 0), sph(0.1, 1), z, 'rail');
    const Qfar = arcSmall(sph(Math.PI / 2 - 0.1, 0), sph(Math.PI / 2 + 0.1, 0), [1, 0, 0], 'rail'); // circle of radius 0.1 about x: disjoint
    const kT = sph(0.2, 0.5);
    const Qtan = arcSmall(rot3(kT, 0.1, 0), rot3(kT, 0.1, 1), kT, 'rail'); // radius 0.1 about a pole 0.2 away: externally tangent
    function rot3(k, rho, t) { // point at angular radius rho about k, azimuth t
      const e1 = unit(cross(k, Math.abs(k[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(k, e1);
      return unit(add(mul(k, Math.cos(rho)), mul(add(mul(e1, Math.cos(t)), mul(e2, Math.sin(t))), Math.sin(rho))));
    }
    check(throws(() => trimConcave(P, Qfar), /do not meet/), 'trimConcave: offset arcs that do not meet → loud fail (no acos clamp)');
    check(throws(() => trimConcave(P, Qtan), /tangent|do not meet/), `trimConcave: (near) double intersection, 1 − |C/H| < ${TRIM_MARGIN} → loud fail`);
    check(throws(() => trimConcave(P, arcSmall(sph(0.2, 0), sph(0.2, 1), z, 'rail')), /coaxial/), 'trimConcave: coaxial offset arcs (H = 0) → loud fail');
    check(throws(() => offsetChain([{ ...P, rho: 0.001 }], 0.002, 1), /outside \(0, π\)/), 'offsetChain: offset radius ρ′ ≤ 0 → loud fail');
    // A convex corner arc is a tangency by construction at both joints; its re-offset asks no sign of ≈ 0.
    const a0 = sph(1.0, 0), a1 = sph(1.0, 0.3), a2 = sph(1.2, 0.5);
    const off = offsetChain([arcGC(a0, a1, 'free'), arcGC(a1, a2, 'free')], 0.01, 1);
    const off2 = offsetChain([arcGC(a0, a1, 'free'), arcGC(a1, a2, 'free')], 0.01, -1);
    const corner = [...off, ...off2].find((A) => A.cls === 'corner');
    check(!!corner && corner.join === 'tangent', 'offsetChain: corner arcs carry join "tangent" at their start (and the next arc at its start)');
    const re = offsetChain(corner === off.find((A) => A.cls === 'corner') ? off : off2, 0.01, off.includes(corner) ? 1 : -1);
    check(re.filter((A) => A.cls === 'corner').length === 0, 're-offset of a chain with a corner arc adds no micro-corner at its tangent joints');
    // lateral() at a clamped end gives no side (the caller decides from the construction).
    const ch = new Chain(1, [arcGC(a0, a1, 'free')], 1);
    const beyond = ch.lateral(unit(add(a1, mul(sub(a1, a0), 0.5))));
    const inside = ch.lateral(sph(0.99, 0.15));
    check(beyond.clamped === 'end' && beyond.signedMm === null && inside.clamped === null && Number.isFinite(inside.signedMm),
      'Chain.lateral: foot clamped at an end → signedMm null (no sign from a near-zero dot); interior foot → signed');
    // §3.2(12): the continued great circle gives a continuous signed offset past the end (packing root).
    const k0 = unit(cross(a0, a1)), off3 = unit(add(mul(unit(add(a1, mul(sub(a1, a0), 0.5))), Math.cos(0.003)), mul(k0, -Math.sin(0.003))));
    const cl = ch.continuedLateral(off3);
    check(cl.clamped === 'end' && Math.abs(Math.abs(cl.signedMm) - 0.003) < 1e-12,
      `Chain.continuedLateral past a great-circle end = exact offset from the continued circle (got ${cl.signedMm})`);
  }
  const prevN = getLegSamples();
  for (const c of cases) {
    setLegSamples(c.N);
    const raw = { ...STABILITY_BASE, ...c.raw };
    const A = computeAll(recipe, raw);
    const rt = rawTurns(A);
    console.log(`  ${c.label}: raw-polyline max turn ${rt.worst.toFixed(2)}° (${rt.at})`);
    check(rt.bad.length === 0, `${c.label}: raw-polyline turns ≤${RAW_TURN_MAX_DEG}° before resample (bad ${rt.bad.join(',') || 0})`);
    for (const mode of c.modes) {
      const { v, k } = perturb(raw, mode);
      const { discrete, cont } = compareBuilds(A, computeAll(recipe, v), k, validatorStatuses);
      const worst = Math.max(cont.pts, cont.st, cont.lev, cont.len);
      console.log(`  ${c.label} ${mode}: discrete ${discrete.length}; pts ${cont.pts.toExponential(1)}·R @${cont.ptsAt}, `
        + `E/X ${cont.st.toExponential(1)}·R @${cont.stAt}, s ${cont.lev.toExponential(1)}·R, len ${cont.len.toExponential(1)} @${cont.lenAt}`);
      check(discrete.length === 0, `${c.label} ${mode}: identical discrete decisions (${discrete.slice(0, 4).join('; ') || 'rows, legs, joinMode, exitKind, V-classes'})`);
      check(worst <= TOL_CONT, `${c.label} ${mode}: continuous outputs agree to ${TOL_CONT} (worst ${worst.toExponential(2)})`);
    }
  }
  setLegSamples(prevN);
  // #36 / spec v3.1 §2, §5.6: a rail contradiction is a loud fail, never a silent continuation. Every bottom
  // leg ends on its own analytic rail (|d_E| at round-off), and a forced offRail must fail V8 with its d_E.
  {
    const B = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'untilEquator' });
    const bottoms = B.path.segs.filter((q) => q.type === 'leg' && q.level === 'bottom' && q.exitKind);
    const maxDe = Math.max(...bottoms.map((q) => Math.abs(q.exitDeMm)));
    check(bottoms.length > 0 && bottoms.every((q) => q.exitKind === 'atE') && maxDe <= 1e-9 * B.base.R,
      `bow0.32@96: every bottom leg ends on its analytic rail (${bottoms.length} atE, max |d_E| ${maxDe.toExponential(1)} mm ≤ 1e−9·R)`);
    const v8Before = runValidators(B, B.path.ops.length - 1, null).find((x) => x.id === 'V8');
    const leg = bottoms[bottoms.length - 1];
    Object.assign(leg, { exitKind: 'offRail', exitFail: true, exitDeMm: 0.05 });
    const v8 = runValidators(B, B.path.ops.length - 1, null).find((x) => x.id === 'V8');
    console.log(`  forced offRail on ${leg.id}: V8 ${v8Before.status} → ${v8.status}; ${(v8.value.match(/rail contradictions[^;]*/) || ['—'])[0]}`);
    check(v8.status === 'fail' && /rail contradictions 1: .*offRail d_E=0[.,]05/.test(v8.value) && v8.details.exitFails.includes(leg.id),
      `forced offRail on ${leg.id} → V8 fail naming the leg and d_E (loud, #36)`);
  }
}

// 8d0b. K16 at λ=0 (#31, §3.2 (15)): promise by formula with the Clairaut mean ᾱ of the actual leg, per T (K16a)
// and per E/X pair (K16b), no λ=0 switch; fail = promised but uncovered. Unpromised & uncovered T's are printed, not failed
// (at m=0.5 set B row 3 on L4/L0: row-4 legs start at B4 top holes fanned by A4 threads, issue #38).
if (G('8d0b'))
{
  console.log('\n## K16 λ=0: formula (15) with Clairaut ᾱ per leg → promised ⇒ covered');
  const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0, rowsMode: 'untilEquator' });
  const v = runValidators(A, A.path.ops.length - 1, null).find((x) => x.id === 'K16');
  console.log(`  K16: ${v.status} — ${v.value}`);
  check(v.status === 'pass', 'K16 pass at λ=0 (promised ⇒ covered, K16a and K16b)');
  const ps = v.numbers.perSet || {};
  for (const set of ['A', 'B']) {
    const q = ps[set];
    check(!!q && q.aMiss === 0 && q.bMiss === 0,
      `K16 λ=0 set ${set}: 0 promised-but-uncovered (K16a ${q?.aOk}/${q?.aProm} of ${q?.aN}, K16b ${q?.bOk}/${q?.bPromised} of ${q?.bN})`);
  }
  check((ps.A?.aProm ?? 0) === (ps.A?.aN ?? -1), `K16a λ=0 set A: every T promised by the formula (${ps.A?.aProm}/${ps.A?.aN})`);
  for (const r of (v.numbers.aRows || []).filter((q) => !q.promised))
    console.log(`  K16a not promised: ${r.set}${r.row} L${r.line} x=${r.x.map((x) => fmt(x, 3)).join('/')} d=${fmt(r.dMm, 3)} ${r.covered ? 'covered' : 'open'}`);
  // Sanity: geodesicAlphaAt on a known leg is acute and finite
  const leg = A.path.segs.find((s) => s.type === 'leg' && s.row === 1);
  const a0 = geodesicAlphaAt(leg.from, leg.to, leg.from);
  check(Number.isFinite(a0) && a0 > 0 && a0 < Math.PI / 2, `geodesicAlphaAt finite acute (got ${(a0 * 180 / Math.PI).toFixed(2)}°)`);
  check(Math.abs(tipLevelMm(leg.from, A.base.R) - (A.path.stitches.find((s) => s.legId === leg.id)?.s ?? tipLevelMm(leg.from, A.base.R))) < 1
    || tipLevelMm(leg.from, A.base.R) > 0, 'tipLevelMm positive');
}

// 8d. K16 tip coverage + V8 tipCross (6a.13 / 6a.16)
if (G('8d'))
{
  console.log('\n## K16 tip coverage / V8 tipCross (6a.13–6a.16)');
  const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'untilEquator' });
  const vals = Object.fromEntries(runValidators(A, A.path.ops.length - 1, null).map((v) => [v.id, v]));
  console.log(`  K16: ${vals.K16?.status} — ${vals.K16?.value}`);
  check(vals.K16?.status === 'pass', `K16a–c pass (got ${vals.K16?.status})`);
  // Spec v3.1 §3.2(15), §6.13 (#39): α is the Clairaut mean of the ACTUAL leg of row n+2 (its tangent tail), not the
  // geodesic through the leg's ends. At λ > 0 the window then promises every pair the model covers (was "promised
  // 0/12, covered 12/12" at λ ≥ 0.4 for row 2) and Δsum·tan α sits inside [(m+w) − w/(2cos α); (m+w) + w/(2cos α)].
  const A60 = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, rowsMode: 'untilEquator' });
  for (const [lam, V] of [[0.32, vals.K16], [0.6, runValidators(A60, A60.path.ops.length - 1, null).find((v) => v.id === 'K16')]]) {
    const ps = V.numbers.perSet, br = V.numbers.bRows.filter((b) => b.hole === 'E');
    const inWin = br.filter((b) => b.prod >= b.win[0] - 1e-9 && b.prod <= b.win[1] + 1e-9).length;
    const r1 = br.filter((b) => b.row === 1);
    console.log(`  K16b λ=${lam}: ${['A', 'B'].map((k) => `${k} promised ${ps[k].bPromised}/${ps[k].bN} covered ${ps[k].bRaw}`).join(', ')}; row-1 tips α ${fmt(Math.min(...r1.map((b) => b.alphaDeg)), 2)}–${fmt(Math.max(...r1.map((b) => b.alphaDeg)), 2)}°, Δsum·tan α ${fmt(Math.min(...r1.map((b) => b.prod)), 3)}–${fmt(Math.max(...r1.map((b) => b.prod)), 3)} in [${fmt(r1[0].win[0], 3)}; ${fmt(r1[0].win[1], 3)}]`);
    check(V.status === 'pass' && ['A', 'B'].every((k) => ps[k].bPromised === ps[k].bN && ps[k].bRaw === ps[k].bN) && inWin === br.length,
      `K16b λ=${lam}: every pair promised by the window with the actual-leg α and covered (A ${ps.A.bPromised}/${ps.A.bN}, B ${ps.B.bPromised}/${ps.B.bN}; in window ${inWin}/${br.length})`);
  }
  const v8 = vals.V8;
  const tipN = (v8?.details?.found || []).filter((r) => /tipCross/.test(r.why)).length;
  console.log(`  V8: ${v8?.status} — tipCross=${tipN}; ${(v8?.value || '').slice(0, 160)}`);
  check(tipN > 0 || /tipCross/.test(v8?.value || ''), 'V8 reports tipCross class (6a.13)');
  // Height band: every tipCross is within h_x of a bottom tip (not mid-leg ~35 mm).
  const hx = (A.params.m_mm + A.params.w_mm) / (2 * Math.tan(Math.PI / 10));
  const byId = new Map(A.path.segs.map((s) => [s.id, s]));
  let farTip = 0;
  for (const r of (v8?.details?.found || []).filter((x) => /tipCross/.test(x.why))) {
    const P = byId.get(r.a), Q = byId.get(r.b);
    if (!P || !Q) continue;
    const lo = P.row <= Q.row ? P : Q;
    const st = A.path.stitches.find((s) => s.set === lo.set && s.row === lo.row && s.level === 'bottom' && !s.closing
      && (s.line === P.line || s.line === Q.line));
    if (st && Math.abs((st.s ?? 0) - r.s) > hx + 1) farTip++;
  }
  check(farTip === 0, `tipCross contacts all within ~h_x of tip (far=${farTip})`);
  // Mid-leg same-line ~35 mm from tip must NOT be tipCross (6a.13); flush → rail-parallel.
  const midCand = [...(v8?.details?.found || []), ...(v8?.details?.bad || [])].find((b) => {
    const P = byId.get(b.a), Q = byId.get(b.b);
    if (!P || !Q || P.type !== 'leg' || Q.type !== 'leg' || P.set !== Q.set || P.line !== Q.line) return false;
    const lo = P.row <= Q.row ? P : Q;
    const st = A.path.stitches.find((s) => s.set === lo.set && s.row === lo.row && s.level === 'bottom' && s.line === lo.line && !s.closing);
    return st && Math.abs((st.s ?? 0) - b.s) > 20;
  });
  console.log(`  mid-leg same-line: ${midCand ? `${midCand.a}×${midCand.b} s=${fmt(midCand.s, 1)} ${midCand.why}` : 'none'}`);
  check(!!midCand && !/tipCross/.test(midCand.why || ''), 'same-line intersection ~35 mm from tip is NOT tipCross');
  // V8 classifies mid-leg same-line as through-row / tip-zone / rail-parallel / unexpected — any non-tipCross.
  check(!!midCand && /rail parallel|through-row|tip.?zone|UNEXPECTED/i.test(midCand.why || ''),
    'same-line ~35 mm classified (through-row/tip-zone/rail-parallel/unexpected), never tipCross');
}


// 8e. B.8 / 6a.15: λ=0 free when min gap ≥ w; kinks ≤20° and converge 96/192/384
if (G('8e'))
{
  console.log('\n## B.8 / 6a.15 tube rule (λ=0)');
  const interp = (a, b, t) => {
    const A = unit(a), B = unit(b), om = angle(A, B);
    if (om < 1e-12) return A;
    return unit(add(mul(A, Math.sin((1 - t) * om) / Math.sin(om)), mul(B, Math.sin(t * om) / Math.sin(om))));
  };
  const pointSegDist = (R, p, a, b) => {
    const A = unit(a), B = unit(b), P = unit(p), normal = unit(cross(A, B));
    let Q = unit(sub(P, mul(normal, dot(P, normal))));
    const ab = angle(A, B), aq = angle(A, Q), qb = angle(Q, B);
    if (aq + qb <= ab + 1e-7) return R * angle(P, Q);
    Q = mul(Q, -1);
    if (angle(A, Q) + angle(Q, B) <= ab + 1e-7) return R * angle(P, Q);
    return R * Math.min(angle(P, A), angle(P, B));
  };
  const pointPolyDist = (R, p, pts) => { let d = Infinity; for (let j = 1; j < pts.length; j++) d = Math.min(d, pointSegDist(R, p, pts[j - 1], pts[j])); return d; };
  const turnDeg = (p, i) => {
    const n = unit(p[i]);
    const proj = (v) => unit(sub(v, mul(n, dot(v, n))));
    const a = proj(sub(p[i], p[i - 1])), b = proj(sub(p[i + 1], p[i]));
    return Math.atan2(dot(cross(a, b), n), dot(a, b)) * 180 / Math.PI;
  };
  const peaks = [], freeAlls = [];
  for (const N of [96, 192, 384]) {
    setLegSamples(N);
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32, rowsMode: 'untilEquator' });
    const R = A.base.R, w = A.params.w_mm;
    const legs = A.path.segs.filter((x) => x.type === 'leg');
    const table = new Map(legs.map((x) => [`${x.set}/${x.row}/${x.stitch}`, x]));
    let freeAll = 0, viol = 0, peakOver = 0, maxPeak = 0;
    for (const s of legs) {
      if (s.set !== 'A' || s.row < 2) continue;
      const prior = table.get(`${s.set}/${s.row - 1}/${s.stitch}`);
      if (!prior) continue;
      let minG = Infinity;
      for (let j = 0; j <= 200; j++) minG = Math.min(minG, pointPolyDist(R, interp(s.from, s.to, j / 200), prior.pts));
      if (minG >= w) { freeAll++; if (s.joinMode !== 'free') viol++; }
      let peak = 0;
      for (let i = 1; i < s.pts.length - 1; i++) peak = Math.max(peak, Math.abs(turnDeg(s.pts, i)));
      if (peak > 20) peakOver++;
      maxPeak = Math.max(maxPeak, peak);
    }
    peaks.push(maxPeak);
    console.log(`  N=${N}: freeAll=${freeAll} viol=${viol} peakOver=${peakOver} maxPeak=${fmt(maxPeak, 2)}`);
    // The count depends on m (22 at m = 1.0, Codex 6a.15); the rule is: every arm with min gap ≥ w is free.
    freeAlls.push(freeAll);
    check(freeAll > 0 && viol === 0, `N=${N}: all ${freeAll} freeAll arms are joinMode=free (Codex 6a.15)`);
    if (N <= 192) check(peakOver === 0 && maxPeak <= 20, `N=${N}: all peaks ≤20° (max ${fmt(maxPeak, 2)})`);
    else console.log(`  N=${N}: peak ${fmt(maxPeak, 2)}° printed, not gated (#22: the output grid resolves the climb kinks differently; rails are analytic since #36)`);
  }
  setLegSamples(null);
  check(freeAlls.every((x) => x === freeAlls[0]), `B.8 freeAll count grid-invariant 96/192/384 (${freeAlls.join('/')})`);
  // Coordinator (#31): gate 96→192 non-increase only; 384 is printed (see #22 / #36).
  check(peaks[0] >= peaks[1] - 1e-6, `B.8 peaks non-increasing 96→192 (${fmt(peaks[0], 2)}→${fmt(peaks[1], 2)}; 384: ${fmt(peaks[2], 2)} not gated, #22)`);
}

// 8f. Display 6a.17 lift(d): by distance d, all rows / both sets (review of 51eddd6)
if (G('8f'))
{
  console.log('\n## Display stackProfile: lift(d) for all rows / sets (6a.17)');
  const w0 = 0.714;
  check(Math.abs(liftFromDist(w0, w0)) < 1e-12, 'lift(d=w) = 0');
  check(Math.abs(liftFromDist(w0 + 0.01, w0)) < 1e-12, 'lift(d>w) = 0');
  check(Math.abs(liftFromDist(w0 * (1 - LIFT_DIST_EPS), w0)) < 1e-12, 'lift(d=w·(1−ε)) = 0 (6a.17 ε floor)');
  check(Math.abs(liftFromDist(0, w0) - DISPLAY_STACK_LIFT_W * w0) < 1e-9, 'lift(d=0) = 0.6·w');
  check(liftFromDist(w0 * 0.5, w0) > 1e-9, 'lift(d<w·(1−ε)) > 0');
  check(LIFT_DIST_EPS === 0.01, 'LIFT_DIST_EPS = 0.01 (same as free-leg contact)');
  // Deprecated kind-skip list kept only as alias; acceptance is by d, not kind.
  check(STACK_LIFT_SKIP_KINDS.has('rail-parallel'), 'STACK_LIFT_SKIP_KINDS still lists rail-parallel (compat)');

  for (const cfg of [
    { label: 'geo0', shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0 },
    { label: 'bow0.32', shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32 },
  ]) {
    const A = computeAll(recipe, { C_mm: 240, w_mm: w0, rowsMode: 'untilEquator', ...cfg });
    const w = A.params.w_mm;
    const legs = A.path.segs.filter((s) => s.type === 'leg');
    // All rows, both sets
    const bySet = { A: legs.filter((s) => s.set === 'A'), B: legs.filter((s) => s.set === 'B') };
    check(bySet.A.length > 0 && bySet.B.length > 0, `${cfg.label}: legs in both sets A and B`);
    const rowsA = new Set(bySet.A.map((s) => s.row));
    const rowsB = new Set(bySet.B.map((s) => s.row));
    check(rowsA.size >= 2 && rowsB.size >= 2, `${cfg.label}: multiple rows each set (A=${rowsA.size}, B=${rowsB.size})`);

    // Assert by d (6a.17), not kind: lift only when d < w; d ≥ w → lift 0.
    // Rail-parallel packing sits at d ≈ w − ε (never exact ≥ w); count those separately for bow.
    let realOnTop = 0;       // d < w (true crossings / tipCross / wedge / climb / squeeze)
    let flushGeW = 0;        // d ≥ w → lift must be 0
    let railParOnTop = 0;    // kind rail-parallel (d ≈ w)
    let maxLiftFromGeW = 0;  // max liftFromDist among d ≥ w — must be 0
    let maxLiftRailParClamped = 0; // liftFromDist(max(d,w)) for rail-parallel ≡ 0
    let maxLift = 0;
    let anyLiftFromClose = 0;

    for (const L of legs) {
      const onTop = A.path.crossings.filter((c) => c.over === L.id);
      for (const c of onTop) {
        const d = c.dmin != null ? c.dmin : w;
        const liftD = liftFromDist(d, w);
        if (c.kind === 'rail-parallel') {
          railParOnTop++;
          maxLiftRailParClamped = Math.max(maxLiftRailParClamped, liftFromDist(Math.max(d, w), w));
        }
        if (d >= w - 1e-9) {
          flushGeW++;
          maxLiftFromGeW = Math.max(maxLiftFromGeW, liftD);
        } else {
          realOnTop++;
          anyLiftFromClose = Math.max(anyLiftFromClose, liftD);
        }
      }
      const p = stackProfile(A, L);
      maxLift = Math.max(maxLift, ...p);
    }

    console.log(`  ${cfg.label}: legs=${legs.length} rowsA=${rowsA.size} rowsB=${rowsB.size} ` +
      `realOnTop=${realOnTop} flushGeW=${flushGeW} railPar=${railParOnTop} ` +
      `maxLiftGeW=${fmt(maxLiftFromGeW, 6)} maxLiftRailParClamped=${fmt(maxLiftRailParClamped, 6)} ` +
      `maxLiftClose=${fmt(anyLiftFromClose, 4)} maxLift=${fmt(maxLift, 3)} mm`);

    // (2) Direct: max lift from d ≥ w contacts === 0; rail-parallel treated as d ≥ w → 0
    check(maxLiftFromGeW < 1e-12, `${cfg.label}: max liftFromDist for d≥w contacts === 0 (got ${maxLiftFromGeW})`);
    check(maxLiftRailParClamped < 1e-12, `${cfg.label}: rail-parallel liftFromDist(max(d,w)) === 0`);
    // (3) True crossings on top exist — else test would pass if crossings vanished
    check(realOnTop > 0, `${cfg.label}: realOnTop > 0 (contacts with d<w on top)`);
    // Bow packs rails: rail-parallel contacts must exist (d≈w; exact d≥w may be empty numerically)
    if (cfg.label.startsWith('bow')) {
      check(railParOnTop > 0, `${cfg.label}: rail-parallel on-top contacts > 0`);
    }
    // (4) By d: close contacts produce lift; far do not
    check(anyLiftFromClose > 1e-9, `${cfg.label}: liftFromDist(d<w) > 0 on some on-top contact`);
    check(Number.isFinite(maxLift) && maxLift >= 0, `${cfg.label}: stackProfile finite`);
  }
}


// 8g. Display 6a.18 upper dive: short dive after near-edge; lift(d) on samples past dive room
if (G('8g'))
{
  console.log('\n## Display 6a.18 upper E/X: dive after clear + lift(d)');
  for (const cfg of [
    { label: 'geo0', shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32 },
    { label: 'bow0.32', shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32 },
    { label: 'bow0.6', shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6 },
  ]) {
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, rowsMode: 'count', rowsCount: 2, ...cfg });
    const R = A.base.R, w = A.params.w_mm;
    const legs = A.path.segs.filter((s) => s.type === 'leg');
    const byId = new Map(A.path.segs.map((s) => [s.id, s]));
    const order = new Map(A.path.segs.map((s, i) => [s.id, i]));
    const tops = A.path.stitches.filter((s) => s.set === 'A' && s.row === 2 && s.level === 'top');
    const ids = new Set();
    const pairs = [];
    for (const st of tops) {
      const incoming = byId.get(st.legId);
      const outgoing = A.path.segs.slice(order.get(st.pickupId) + 1).find((x) => x.type === 'leg' && x.set === st.set && x.row === st.row);
      if (incoming && outgoing) { ids.add(incoming.id); ids.add(outgoing.id); pairs.push({ st, incoming, outgoing }); }
    }
    const dgBy = new Map(displayGeometry(A, ids).map((x) => [x.seg.id, x]));
    let tested = 0, bad = 0, minRes = Infinity, maxDive = 0;
    for (const { st, incoming, outgoing } of pairs) {
      const old = legs.filter((s) => s.set === 'A' && s.row === 1 && order.get(s.id) < order.get(st.pickupId));
      if (!old.length) continue;
      for (const [side, leg, hole] of [['E', incoming, st.E], ['X', outgoing, st.X]]) {
        const dg = dgBy.get(leg.id);
        if (!dg) continue;
        maxDive = Math.max(maxDive, ...(dg.diveMm || [0]));
        const d0 = Math.min(...old.map((s) => {
          let best = Infinity;
          for (let j = 1; j < s.pts.length; j++) {
            const a = s.pts[j - 1], b = s.pts[j];
            const ab = sub(b, a), ap = sub(hole, a);
            const t = Math.max(0, Math.min(1, dot(ap, ab) / (dot(ab, ab) || 1)));
            best = Math.min(best, norm(sub(hole, add(a, mul(ab, t)))));
          }
          return best;
        }));
        const diveRoom = Math.max(0, d0 - w / 2);
        // Dive must be the short hole→near-edge length (not full axis clearance walk).
        const diveEnd = side === 'E' ? dg.diveMm[1] : dg.diveMm[0];
        check(diveEnd <= diveRoom + 0.02 || diveEnd < w / 4 + 1e-9,
          `${cfg.label} ${st.round}/${st.i} ${side}: dive ${fmt(diveEnd, 4)} ≤ hole→edge ${fmt(diveRoom, 4)}+0.02 (or vertical)`);
        for (const p of dg.pts) {
          const sAlong = R * angle(p, hole);
          if (sAlong > 1.5 * w || sAlong < Math.max(0.4 * w, diveRoom + 0.05 * w)) continue;
          const q = mul(unit(p), R);
          let d = Infinity;
          for (const s of old) {
            for (let j = 1; j < s.pts.length; j++) {
              const a = s.pts[j - 1], b = s.pts[j];
              const ab = sub(b, a), ap = sub(q, a);
              const t = Math.max(0, Math.min(1, dot(ap, ab) / (dot(ab, ab) || 1)));
              d = Math.min(d, norm(sub(q, add(a, mul(ab, t)))));
            }
          }
          if (d >= 0.98 * w) continue;
          tested++;
          const expected = DISPLAY_STACK_LIFT_W * Math.sqrt(Math.max(0, w * w - d * d));
          const actual = norm(p) - (R + w / 2);
          const residual = actual - expected;
          minRes = Math.min(minRes, residual);
          if (residual < -0.05 * w) bad++;
        }
      }
    }
    check(tested > 0, `${cfg.label}: upper E/X lift samples > 0`);
    check(bad === 0, `${cfg.label}: no sample with d<0.98w under-lifted (bad=${bad}, minRes=${fmt(minRes, 4)} mm)`);
    check(maxDive <= DIVE_W * A.params.w_mm + 1e-9, `${cfg.label}: dive ≤ 1.5·w`);
    console.log(`  ${cfg.label}: tested=${tested} bad=${bad} minRes=${fmt(minRes, 4)} maxDive=${fmt(maxDive, 4)}`);
  }
}

// 8h. Rail-parallel ε floor: d ≥ w·(1−ε) → lift 0; no stack×rail; zero rail-attributable height switches
if (G('8h'))
{
  console.log('\n## Display 6a.17 rail-parallel ε floor (no chatter)');
  for (const cfg of [
    { label: 'geo0', shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32, rowsMode: 'count', rowsCount: 2 },
    { label: 'bow0.32', shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 4 },
    { label: 'bow0.6', shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, rowsMode: 'count', rowsCount: 4 },
  ]) {
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, ...cfg });
    const w = A.params.w_mm, R = A.base.R;
    let maxLiftGeEps = 0, maxRailProfile = 0, railN = 0;
    const legs = A.path.segs.filter((s) => s.type === 'leg');
    for (const c of A.path.crossings) {
      const d = c.dmin != null ? c.dmin : w;
      if (d >= w * (1 - LIFT_DIST_EPS)) maxLiftGeEps = Math.max(maxLiftGeEps, liftFromDist(d, w) * Math.max(1, c.stack || 1));
      if (c.kind === 'rail-parallel') {
        railN++;
        maxLiftGeEps = Math.max(maxLiftGeEps, liftFromDist(d, w) * Math.max(1, c.stack || 1));
      }
    }
    // Rail-only profile on A2 must be identically 0 (no stack amplification chatter).
    let railSwitches = 0;
    for (const s of legs.filter((x) => x.round === 'A2')) {
      const rails = A.path.crossings.filter((c) => c.over === s.id && c.kind === 'rail-parallel');
      const profRail = stackProfile({ ...A, path: { ...A.path, crossings: rails } }, s);
      maxRailProfile = Math.max(maxRailProfile, ...profRail);
      // Switches attributable to rail-only profile
      for (let i = 1; i < profRail.length; i++) {
        const a = profRail[i - 1] > 1e-9, b = profRail[i] > 1e-9;
        if (a !== b) railSwitches++;
      }
    }
    check(maxLiftGeEps < 1e-12, `${cfg.label}: lift from d≥w·(1−ε) (and rail-parallel) === 0 (got ${maxLiftGeEps})`);
    check(maxRailProfile < 1e-12, `${cfg.label}: rail-only stackProfile max === 0 (got ${maxRailProfile})`);
    check(railSwitches === 0, `${cfg.label}: zero height switches attributable to rail-parallel (got ${railSwitches})`);
    if (cfg.label.startsWith('bow')) check(railN > 0, `${cfg.label}: rail-parallel contacts exist`);
    console.log(`  ${cfg.label}: rails=${railN} maxLiftGeEps=${maxLiftGeEps} maxRailProf=${maxRailProfile} railSwitches=${railSwitches}`);
  }
}

// 8i. V16 6a.21: upper-hole offenders by whose thread; geo fan-start B4/B6/B8
if (G('8i'))
{
  console.log('\n## V16 §6.9 upper holes: own set fail / other set U14 set collision (warn)');
  // Early stage A2 must still pass (no late fan yet).
  {
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714 });
    const v = runValidators(A, 'A2', null).find((x) => x.id === 'V16');
    check(v.status === 'pass', `A2 stage V16 pass (got ${v.status})`);
  }
  const expectB = { 0: 4, 0.32: 6, 0.6: 8 };
  for (const lambda of [0, 0.32, 0.6]) {
    const A = computeAll(recipe, {
      C_mm: 240, w_mm: 0.714,
      shoulderForm: lambda ? 'bow' : 'geodesic', bowLambda: lambda,
      muWrap: Math.max(lambda, 0.32), rowsMode: 'untilEquator',
    });
    const v = runValidators(A, A.path.ops.length - 1, null).find((x) => x.id === 'V16');
    const n = v.numbers || {};
    check((n.failOwn || 0) === 0, `λ=${lambda}: no own-cluster V16 fails (G3/G11)`);
    // spec v3.2 §6.9 (#38): an observed collision earlier than the causal geometric start is printed for analysis
    // (transition / closing legs are legal causes), not a fail.
    if (n.earlyObs) console.log(`  λ=${lambda}: observed earlier than causal geo start (diagnostic): ${n.earlyList.join(', ')}`);
    // Foreign-early fails would be path bugs; allow 0. Status may be warn (U14) or pass.
    check(v.status === 'pass' || v.status === 'warn', `λ=${lambda}: V16 pass/warn not fail (got ${v.status}: ${v.value.slice(0, 120)})`);
    check((n.failForeign || 0) === 0, `λ=${lambda}: no foreign-early V16 fails (got ${n.failForeign})`);
    const geoB = Object.entries(n.geoFirst || {}).filter(([k]) => k.startsWith('B:')).map(([, r]) => r);
    const geoBmin = geoB.length ? Math.min(...geoB) : null;
    const exp = expectB[lambda];
    // Geometric first for set B within ±2 of expected B4/B6/B8 (measurement tolerance on d(s_T)).
    check(geoBmin != null && Math.abs(geoBmin - exp) <= 2,
      `λ=${lambda}: geo fan-start B min row ≈ ${exp} (got ${geoBmin})`);
    console.log(`  λ=${lambda}: status=${v.status} failOwn=${n.failOwn} failForeign=${n.failForeign} U14=${n.warnU14} geoBmin=${geoBmin} (expect~${exp})`);
  }
}

// 8j. #38 / spec v3.2 §5.3: other-set threads at a top hole are not in the cluster (U14 set collision),
// so the top width of a B stitch equals its A twin and V15 has no unexplained residual.
if (G('8j'))
{
  console.log('\n## #38 §5.3 top-hole set collision: other set out of cluster');
  const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0, rowsMode: 'untilEquator' });
  const top = (set, row) => A.path.stitches.filter((q) => q.level === 'top' && q.set === set && A.path.rounds.find((r) => r.id === q.round).row === row);
  for (const row of [4, 5]) {
    const wA = top('A', row).map((q) => q.eOff - q.xOff), wB = top('B', row).map((q) => q.eOff - q.xOff);
    const dev = Math.max(...wB.map((x) => Math.abs(x - wA[0])), ...wA.map((x) => Math.abs(x - wA[0])));
    check(wA.length > 0 && wB.length > 0 && dev < 1e-6, `geo m0.5 row ${row}: B top width = A top width (A ${wA[0]?.toFixed(3)}, max dev ${dev.toExponential(1)})`);
  }
  const segById = new Map(A.path.segs.map((x) => [x.id, x]));
  const foreignInCluster = A.path.stitches.filter((q) => q.level === 'top').some((q) => q.sides.cluster.some((c) => c.seg !== 'marking' && segById.get(c.seg)?.set !== q.set));
  check(!foreignInCluster, 'no other-set thread in any top-hole cluster');
  check(Array.isArray(A.path.setCollisions) && A.path.setCollisions.length > 0, `setCollision records present (${A.path.setCollisions?.length})`);
  const V = runValidators(A, A.path.ops.length - 1, null);
  const v15 = V.find((x) => x.id === 'V15');
  check(v15.status === 'pass', `V15 pass with set collisions explained (got ${v15.status})`);
}

// 9. Material preset (D34) + recipe scaffold (D35): provenance data + same path.ops for step/full
if (G('9'))
{
  console.log('\n## Material preset + recipe scaffold');
  check(!!materialPreset && materialPreset.id === 'dmc-perle-5', 'material preset loads (dmc-perle-5)');
  check(materialPreset.status === 'estimate', 'material preset status = estimate');
  const d = defaults();
  for (const [k, v] of Object.entries(materialPreset.paramDefaults || {})) {
    check(String(d[k]) === String(v), `param default ${k}=${v} matches material preset`);
  }
  check(d.materialPreset === 'dmc-perle-5', 'materialPreset param defaults to dmc-perle-5');
  check(materialPreset.fields?.muWrap?.status === 'analogue' && materialPreset.fields?.muThread?.status === 'analogue' && materialPreset.fields?.hw?.status === 'analogue',
    'μWrap/μThread and hw marked analogue (not measured on #5)');
  check(materialPreset.fields?.compress?.status === 'unknown', 'compress status unknown');
  check(materialPreset.provisionalLift?.status === 'estimate', 'provisional lift marked estimate (not a law)');

  check(!!recipePreset && recipePreset.id === 'kiku-s8', 'recipe preset loads (kiku-s8)');
  check(recipePreset.materialPreset === 'dmc-perle-5', 'recipe preset references material');
  check(recipePreset.editable?.colors?.sets?.A?.hex && recipePreset.editable?.colors?.sets?.B?.hex,
    'editable color ribbon has set A/B hex');
  check(Array.isArray(recipePreset.editable?.sizes?.paramKeys) && recipePreset.editable.sizes.paramKeys.includes('C_mm'),
    'editable sizes list reuses param keys (no duplicate stores)');

  const A = computeAll(recipe, {});
  const ops = A.path.ops;
  const stages = ['2a', '2b', 'B1', 'A2', 'all'];
  const ends = stages.map((s) => A.path.stageEnd[s]);
  console.log(`  stageEnd: ${stages.map((s, i) => `${s}=${ends[i]}`).join(', ')} (ops.length=${ops.length})`);
  check(ends.every((e) => Number.isInteger(e) && e >= 0 && e < ops.length), 'every stageEnd is a valid ops index');
  check(ends[0] < ends[1] && ends[1] < ends[2] && ends[2] <= ends[3] && ends[3] <= ends[4],
    'stageEnds are nested prefixes of the same ops array');
  check(ends[4] === ops.length - 1, 'stage "all" ends at last op');
  // stageLastOp must agree with path.stageEnd (same helper)
  for (const s of stages) {
    check(stageLastOp(recipe, ops, s) === A.path.stageEnd[s], `stageLastOp(${s}) === path.stageEnd`);
  }
  // Prefix property: ops[0..stageEnd[2b]] is a prefix of ops[0..stageEnd[A2]] — same array identity
  check(ops === A.path.ops && A.path.stageEnd['2b'] < A.path.stageEnd['A2'],
    'step (2b) and fuller stage (A2) share one ops array; fuller is a longer prefix');
  // Recompute does not invent a second builder for "full"
  const B = computeAll(recipe, {});
  check(B.path.ops.length === ops.length && B.path.stageEnd.all === A.path.stageEnd.all,
    'recompute yields the same ops length / all index (single builder)');
}

await finish(failures); // parallel worker: report to the orchestrator and exit; --quick: label as not the gate
console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `FAILURES: ${failures}`}`);
process.exit(failures ? 1 : 0);
