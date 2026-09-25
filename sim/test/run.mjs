// Безбраузерные тесты: генератор пути + валидаторы. Запуск: node sim/test/run.mjs  (код выхода 0 = всё прошло)
import { loadRecipe, loadJSON } from '../src/recipe.js';
import { computeAll } from '../src/layers.js';
import { runValidators, summary, refKey } from '../src/validators.js';
import { PARAM_SCHEMA, defaults } from '../src/params.js';
import { stageLastOp, setLegSamples, getLegSamples } from '../src/path.js';
import { displayGeometry } from '../src/display.js';
import { tubeMesh } from '../src/tube.js';
import { norm, unit, mul, sub, dot, angle, cross } from '../src/geom.js';

const recipe = await loadRecipe();
const recipePreset = await loadJSON('../data/recipes/kiku-s8.json');
const materialPreset = await loadJSON('../data/materials/dmc-perle-5.json');
const ref = await loadJSON('../data/calc_reference.json');
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

// 1. Этап 2a и 2b при параметрах по умолчанию (stage-1: C = 240, w = 0.714, m = 1.0, S8)
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
{
  const k = 1.25;
  const base = { C_mm: 240, topMode: 'fracQ', sTopFrac: 5 / 60 };
  const A1 = computeAll(recipe, { ...base });
  const A2 = computeAll(recipe, { ...base, C_mm: 240 * k, w_mm: 0.714 * k, m_mm: 1.0 * k, startRun_mm: 35 * k });
  const r1 = A1.path.threads.A.uEnd, r2 = A2.path.threads.A.uEnd, b1 = A1.path.threads.B.uEnd, b2 = A2.path.threads.B.uEnd;
  console.log(`  подобие ×1,25 всех длин: нить A (A1+A2) ${fmt(r1)} → ${fmt(r2)}, отношение ${fmt(r2 / r1, 12)}; нить B ${fmt(b2 / b1, 12)}`);
  check(Math.abs(r2 / r1 - k) < 1e-9 && Math.abs(b2 / b1 - k) < 1e-9, 'при подобии всех входов длины обеих нитей (вкл. выведенный ряд 2) растут ровно в k раз');
  const V2 = runValidators(A2, 'A2', ref);
  check(summary(V2).fail === 0, 'подобный набор проходит все валидаторы (до A2)');
}

// 2c. S16: dense marking — V5 catches neighbour-line reach; closing X squeeze in both JS and calc_reference (D37)
{
  const A = computeAll(recipe, { N: 16 });
  const V = runValidators(A, '2b', ref);
  const v5 = V.find((v) => v.id === 'V5');
  console.log(`\n  N = 16, верх 5 мм: V5 ${v5.status}: ${v5.value}`);
  check(v5.status === 'fail', 'S16 при верхе 5 мм: V5 = fail (захват задевает соседнюю линию разметки) — ожидаемо');
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
  const B = computeAll(recipe, { N: 16, sTop_mm: 8 });
  check(summary(runValidators(B, '2b', null)).fail === 0, 'S16 с верхом 8 мм: без fail');
}

// 3. Смена ширины нити сдвигает E/X автоматически (нет параметра «ширина захвата»)
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
  const m2 = computeAll(recipe, { m_mm: 0.5 });
  check(Math.abs(m2.path.stitches[0].eOff - (0.5 + 0.714) / 2) < 1e-12, 'E = (m + w)/2 при m = 0,5 (захват следует за разметкой)');
}

// 4. Чистота конвейера: пересчёт не зависит от предыдущего набора параметров
{
  const x1 = computeAll(recipe, { C_mm: 240 });
  const y = computeAll(recipe, { C_mm: 300, w_mm: 1.0, N: 16 });
  const x2 = computeAll(recipe, { C_mm: 240 });
  const lens = (A) => A.path.segs.map((s) => s.length);
  check(JSON.stringify(lens(x1)) === JSON.stringify(lens(x2)) && x1.path.stamp === x2.path.stamp, 'A(240) → A(300) → A(240): результат идентичен');
  check(x1.path.segs[0].pts !== x2.path.segs[0].pts && y.path.segs.length !== x1.path.segs.length, 'нет общих объектов между пересчётами');
  check(x1.base.stamp !== y.base.stamp && x1.path.stamp !== y.path.stamp, 'штампы слоёв меняются при смене входов');
}

// 5. В рецепте и параметрах нет «ширины захвата» (D16)
{
  const txt = JSON.stringify(recipe);
  check(!/bite|pickupWidth|pickup_width/i.test(txt), 'рецепт не содержит ширины захвата');
  check(!PARAM_SCHEMA.some((p) => /bite|pickup/i.test(p.key)), 'параметры не содержат ширины захвата');
}

// 6. Нить не парит (V14) и «крючки» у полюса на скриншоте 03 — проекция, а не отрыв от шара
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
  check(Math.abs(tg.tipDrop_mm - 4.968) < 0.02, 'geodesic tipDrop ≈ 4.97 mm at default C/w');
  check(Math.abs(tb0.tipDrop_mm - tg.tipDrop_mm) < 0.02, 'bow with λ=0 matches geodesic tipDrop');
  check(tg.shoulderForm === 'geodesic' && tg.bowLateralMm === 0, 'geodesic mode stores zero bow');
  check(tb.shoulderForm === 'bow' && tb.bowLateralMm > 0, 'bow: lateral sagitta > 0');
  check(Math.abs(tb.lambda - 0.32) < 1e-9, 'bowLambda=0.32 → λ = 0.32');
  check(tb.tipDrop_mm < tg.tipDrop_mm, 'bow reduces tipDrop vs geodesic (α′ steeper)');
  // Theory table §3: Δ≈2.236, δ≈1.632 at λ=0.32 — Fable (8) packing must match within 0.5%
  console.log(`  theory §3 expect Δ≈2.236 δ≈1.632 at λ=0.32; actual Δ=${fmt(tb.tipDrop_mm, 4)} δ=${fmt(tb.bowLateralMm, 4)}`);
  check(Math.abs(tb.tipDrop_mm - 2.236) / 2.236 < 0.005, `bow tipDrop within 0.5% of theory 2.236 (got ${fmt(tb.tipDrop_mm, 4)})`);
  check(Math.abs(tb.bowLateralMm - 1.632) / 1.632 < 0.005, `bow sagitta within 0.5% of theory 1.632 (got ${fmt(tb.bowLateralMm, 4)})`);
  const B60 = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.32, rowsMode: 'count', rowsCount: 2 });
  check(Math.abs(B60.path.tipDrop.tipDrop_mm - 1.544) / 1.544 < 0.005, `λ=0.6 tipDrop within 0.5% of 1.544 (got ${fmt(B60.path.tipDrop.tipDrop_mm, 4)})`);
  check(Math.abs(B60.path.tipDrop.bowLateralMm - 3.118) / 3.118 < 0.005, `λ=0.6 sagitta within 0.5% of 3.118 (got ${fmt(B60.path.tipDrop.bowLateralMm, 4)})`);
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
  console.log(`  tipDrop ${fmt(tb.tipDrop_mm, 3)} vs theory 2.236 (rows-to-equator asserted in §8c)`);
}



// 8b. V20 friction cone + V21 transversality (Fable v2) + direction / rail checks
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

  // Direction negative test (Fable v2 §5.7): equator-side center at λ≤0.2 → α′ < α_geo.
  // Packing (8) may also hit channelBinding (Δ≈w) rather than Δ>Δ_geo; assert angle + pole control.
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
  const dGeo = geo.path.tipDrop.tipDrop_mm;
  const aGeo = arrivalAlpha(geo);
  const badDir = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.16, muWrap: 0.32, bowSide: 'equator', rowsMode: 'count', rowsCount: 2 });
  const aBad = arrivalAlpha(badDir);
  const dBad = badDir.path.tipDrop.tipDrop_mm;
  console.log(`  direction neg λ=0.16 equator-side: α′=${fmt(aBad * 180 / Math.PI, 2)}° Δ=${fmt(dBad, 3)} vs geo α=${fmt(aGeo * 180 / Math.PI, 2)}° Δ=${fmt(dGeo, 3)}`);
  check(aBad < aGeo - 0.5 * Math.PI / 180, 'equator-side center at λ≤0.2: α′ < α_geo (wrong bulge direction)');
  const goodDir = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, bowSide: 'pole', rowsMode: 'count', rowsCount: 2 });
  check(arrivalAlpha(goodDir) > aGeo + 0.5 * Math.PI / 180, 'pole-side at λ=0.32: α′ > α_geo');
  check(goodDir.path.tipDrop.tipDrop_mm < dGeo - 0.5, 'pole-side at λ=0.32 still improves Δ (no false fail)');

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

  // bowLambda is the intent param; legacy bowFrac is empty optional
  const bl = PARAM_SCHEMA.find((p) => p.key === 'bowLambda');
  const bf = PARAM_SCHEMA.find((p) => p.key === 'bowFrac');
  check(bl && (bl.def === '' || bl.def == null), 'bowLambda default is empty (resolved to 0.32 only when form=bow and nothing else set)');
  check(bf && (bf.def === '' || bf.def == null), 'legacy bowFrac default is empty (prefer bowLambda)');

  // V21 angle emitted; lower-leg local angle ≥ α_geo (Errata 6a)
  check(v21.numbers.minAngleDeg != null && v21.numbers.minAngleGeoDeg != null, 'V21 emits minAngleDeg / minAngleGeoDeg');
  check(v21.numbers.minAngleDeg + 1e-3 >= v21.numbers.minAngleGeoDeg, 'V21 lower-leg local angle ≥ α_geo');

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

  // V13 tip-width growth at A2 (Errata 6a.1 / 6a.6) — lock Fable numbers; do NOT retune thresholds.
  // Acceptance = growth magnitude + monotonicity in λ, NOT V13 status (warn at λ=0.2 stays honest).
  {
    const expect = [
      { bowLambda: 0, grow: 0.21 },
      { bowLambda: 0.2, grow: 0.43 },
      { bowLambda: 0.32, grow: 0.59 },
      { bowLambda: 0.45, grow: 0.75 },
      { bowLambda: 0.6, grow: 0.92 },
    ];
    const grows = [];
    for (const e of expect) {
      const A = computeAll(recipe, {
        shoulderForm: e.bowLambda === 0 ? 'geodesic' : 'bow',
        bowLambda: e.bowLambda || undefined,
        muWrap: Math.max(0.32, e.bowLambda || 0),
        rowsMode: 'count', rowsCount: 2,
      });
      const V = runValidators(A, 'A2', null);
      const v13 = V.find((v) => v.id === 'V13');
      const row = (v13.numbers?.rows || []).find((x) => !x.closing) || (v13.numbers?.rows || [])[0];
      const w = A.params.w_mm;
      const grow = row ? (row.W - row.Wp) / w : NaN;
      grows.push(grow);
      console.log(`  V13 growth λ=${e.bowLambda}: ${fmt(grow, 3)} w (expect ${e.grow} ±0.1), status=${v13.status}`);
      check(Math.abs(grow - e.grow) <= 0.1, `V13 A2 tip-width growth at λ=${e.bowLambda} within ±0.1 w of ${e.grow}`);
    }
    check(grows.every((g, i) => i === 0 || g > grows[i - 1] - 1e-9), 'V13 A2 tip-width growth monotonic in λ');
  }

  // Errata 6a.4: row-1 has no rail splice; exterior rail joins turn ≤ 1°; L_j ~ formula
  {
    const A = computeAll(recipe, { shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, rowsMode: 'count', rowsCount: 3 });
    const r1 = A.path.segs.filter((s) => s.type === 'leg' && s.row === 1);
    const r2 = A.path.segs.filter((s) => s.type === 'leg' && s.row === 2);
    check(r1.every((s) => (s.spliceMm ?? 0) < 1e-9), 'row-1 legs have no rail splice (spliceMm < 1e-9)');
    const ext = r2.filter((s) => !s.interiorXn && (s.lateralMm ?? 0) >= 0);
    const turns = ext.map((s) => Math.abs(s.turnAtTDeg ?? 99));
    console.log(`  rail exterior turns°: ${turns.map((t) => fmt(t, 3)).join(', ')}`);
    check(turns.length && turns.every((t) => t <= 1.0), 'exterior rail join turn at T ≤ 1°');
    const diag = A.path.railDiagnostics;
    console.log(`  interiorXn: ${diag?.interiorXnCount}/${diag?.railLegs} byRow=${JSON.stringify(diag?.interiorXnByRow)}`);
    check(diag && diag.interiorXnCount > 0, 'railDiagnostics reports interior X_n count (pending Fable)');
    check(r2.some((s) => s.interiorXn) && r2.some((s) => !s.interiorXn), 'row-2 has both interiorXn (holding) and exterior (tangent) legs');
    // L_j ≈ R·√(2·|d|/R · tan ρ) = √(2·|d|·R·tan ρ)
    let ljOk = 0, ljN = 0;
    for (const s of ext) {
      const d = Math.abs(s.lateralMm ?? 0);
      if (d < 0.05) continue;
      const R = A.base.R, rho = s.rho;
      const expect = Math.sqrt(2 * d * R * Math.tan(rho));
      const got = s.spliceMm ?? 0;
      const rel = Math.abs(got - expect) / expect;
      console.log(`  L_j d=${fmt(d, 3)} expect≈${fmt(expect, 2)} got=${fmt(got, 2)} rel=${fmt(rel, 3)}`);
      ljN++; if (rel < 0.15) ljOk++;
    }
    check(ljN > 0 && ljOk === ljN, 'L_j matches √(2·|d|·R·tan ρ) within 15% for exterior joins');
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
  check(Math.abs(d20 - 4.968) < 0.02, `λ=0 geo Δ₂ ≈ 4.968 (±0.02) got ${fmt(d20, 5)}`);
  check(Math.abs(d200 - 4.968) < 0.02, `λ=0 bow Δ₂ ≈ 4.968 (±0.02) got ${fmt(d200, 5)}`);
  check(n0 === 5 && n00 === 5, 'λ=0: 5 rows to equator (geo and bowλ=0)');
  check(tip0 >= 58 && tip0 <= 60 && tip00 >= 58 && tip00 <= 60,
    `λ=0 last tip (K12) in 58–60 mm (got geo ${fmt(tip0, 3)}, bow ${fmt(tip00, 3)})`);
  check(n32 >= 11 && n32 <= 12, `λ=0.32: 11–12 rows (got ${n32})`);
  check(n60 >= 16 && n60 <= 17, `λ=0.6: 16–17 rows (got ${n60})`);
  check(n0 < n32 && n32 < n60, 'row count monotonic in λ');

  const d32 = dSseries(B32), d60 = dSseries(B60);
  console.log(`  Δ_n λ=0.32: ${d32.map((x) => fmt(x, 3)).join(', ')}`);
  console.log(`  Δ_n λ=0.6: ${d60.slice(0, 8).map((x) => fmt(x, 3)).join(', ')}…`);
  const dec = (arr) => arr.every((x, i) => i === 0 || x < arr[i - 1] - 1e-9);
  check(dec(d32), 'Δ_n decreases with row index at λ=0.32');
  check(dec(d60), 'Δ_n decreases with row index at λ=0.6');
  // ~20% over ten rows (§3): compare Δ_2 vs Δ_11 if present
  if (d32.length >= 10) {
    const drop = (d32[0] - d32[9]) / d32[0];
    console.log(`  Δ drop over 10 rows λ=0.32: ${(100 * drop).toFixed(1)}%`);
    check(drop > 0.1 && drop < 0.35, 'Δ drops roughly ~20% over ten rows at λ=0.32');
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



// 9. Material preset (D34) + recipe scaffold (D35): provenance data + same path.ops for step/full
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

console.log(`\n${failures === 0 ? 'ВСЕ ТЕСТЫ ПРОШЛИ' : `ПРОВАЛОВ: ${failures}`}`);
process.exit(failures ? 1 : 0);
