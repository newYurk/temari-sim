// Безбраузерные тесты: генератор пути + валидаторы. Запуск: node sim/test/run.mjs  (код выхода 0 = всё прошло)
import { loadRecipe, loadJSON } from '../src/recipe.js';
import { computeAll } from '../src/layers.js';
import { runValidators, summary, refKey } from '../src/validators.js';
import { PARAM_SCHEMA } from '../src/params.js';
import { displayGeometry } from '../src/display.js';
import { tubeMesh } from '../src/tube.js';
import { norm, unit, mul, sub, dot } from '../src/geom.js';

const recipe = await loadRecipe();
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
  const r1 = A1.path.uEnd, r2 = A2.path.uEnd;
  console.log(`  подобие ×1,25 всех длин: u_end ${fmt(r1)} → ${fmt(r2)}, отношение ${fmt(r2 / r1, 12)}`);
  check(Math.abs(r2 / r1 - k) < 1e-9, 'при подобии всех входов длина растёт ровно в k раз');
  const V2 = runValidators(A2, '2b', ref);
  check(summary(V2).fail === 0, 'подобный набор проходит все валидаторы');
}

// 2c. Недопустимый дизайн ловится валидатором: S16 с верхом в 5 мм — замыкающий захват задевает соседнюю линию
{
  const A = computeAll(recipe, { N: 16 });
  const V = runValidators(A, '2b', ref);
  const v5 = V.find((v) => v.id === 'V5');
  console.log(`\n  N = 16, верх 5 мм: V5 ${v5.status}: ${v5.value}`);
  check(v5.status === 'fail', 'S16 при верхе 5 мм: V5 = fail (захват задевает соседнюю линию разметки) — ожидаемо');
  check(V.find((v) => v.id === 'V3').status === 'pass', 'S16: геометрия всё равно совпадает с calc.py');
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
  let crossing = 0, worstPx = -Infinity;
  for (const dg of displayGeometry(A, null)) {
    if (dg.hidden) continue;
    const front = dg.seg.pts.map((p) => dot(p, c) > R * R);
    if (front.some((x, k) => k > 0 && x !== front[k - 1])) crossing++;
    for (const v of tubeMesh(dg.pts, dg.radius).pos) worstPx = Math.max(worstPx, (Math.tan(ang(v)) - Math.tan(sil)) * fpx);
  }
  const wPx = (w / D) * fpx * 1.05;   // проекция толщины трубки у лимба (+5 % на перспективу)
  console.log(`  вид «Косо»: плеч, пересекающих лимб шара: ${crossing}; трубка выходит за силуэт максимум на ${worstPx.toFixed(2)} px (толщина трубки ≈ ${(w / D * fpx).toFixed(2)} px)`);
  check(crossing > 0 && worstPx <= wPx, '«крючки» у полюса — плечи, уходящие за лимб (видны сквозь прозрачный шар); за силуэт выходит только толщина трубки');
  // скрытый старт: схема у поверхности не проходит сквозь шар; режим «хорда» совпадает с моделью
  const surf = displayGeometry(A, null, { hidMode: 'surf' }).filter((d) => d.seg.type === 'hidden-start');
  const chord = displayGeometry(A, null, { hidMode: 'chord' }).filter((d) => d.seg.type === 'hidden-start');
  const depth = (ds) => Math.max(...ds.flatMap((d) => d.pts.map((p) => R - norm(p))));
  check(surf.every((d) => d.schematic) && depth(surf) <= w + 1e-9, `скрытый старт по умолчанию — схема на ≤ w = ${w} мм под поверхностью (глубина ${depth(surf).toFixed(3)})`);
  check(chord.every((d) => !d.schematic) && Math.abs(depth(chord) - v14.numbers.hidDepth) < 1e-2, `режим «хорда»: глубина ${depth(chord).toFixed(2)} мм = модель`);
}

console.log(`\n${failures === 0 ? 'ВСЕ ТЕСТЫ ПРОШЛИ' : `ПРОВАЛОВ: ${failures}`}`);
process.exit(failures ? 1 : 0);
