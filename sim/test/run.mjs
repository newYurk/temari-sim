// Безбраузерные тесты: генератор пути + валидаторы. Запуск: node sim/test/run.mjs  (код выхода 0 = всё прошло)
import { loadRecipe, loadJSON } from '../src/recipe.js';
import { computeAll, G, finish, validatorStatuses } from './harness.mjs'; // memoized computeAll + group gates / parallel runner (#34)
import { runValidators, summary, refKey, k16bCoverageWindow, clairautAvgTan, geodesicAlphaAt, tipLevelMm } from '../src/validators.js';
import { PARAM_SCHEMA, defaults } from '../src/params.js';
import { stageLastOp, setLegSamples, getLegSamples, tangencyOk, TANGENCY_SIN_MAX, TANGENCY_RES_W } from '../src/path.js';
import { displayGeometry, stackProfile, STACK_LIFT_SKIP_KINDS, liftFromDist, DISPLAY_STACK_LIFT_W, DISPLAY_STACK_LIFT_MAX_W, LIFT_DIST_EPS, DIVE_W } from '../src/display.js';
import { tubeMesh } from '../src/tube.js';
import { norm, unit, mul, sub, add, dot, angle, cross } from '../src/geom.js';
// #22: signed turn (deg) at vertex i of a sphere polyline (tangent-plane projection), and the degenerate-entry check
// (coordinator, option 2): onRail legs start at X_n and join the rail at M, ℓ_m = max(w, 3|d_n|); spliceMm = |X_n M|
// within 1e−6 mm and the turn at M ≤ atan(|d_n|/ℓ_m) + 0.2°.
const turnAtVtx = (P, i) => {
  const n = unit(P[i]); const pr = (v) => unit(sub(v, mul(n, dot(v, n))));
  const a = pr(sub(P[i], P[i - 1])), b = pr(sub(P[i + 1], P[i]));
  return Math.atan2(dot(cross(a, b), n), dot(a, b)) * 180 / Math.PI;
};
// #46 (9б′): at λ > 0 there is no d_n band any more. Round-off (|d_n| ≤ 1e−9·w, entryKind 'onRail'): the rail from X_n —
// spliceMm 0 and the first piece is the rail (rail / ext / corner), no angle-at-M check. Degenerate (entryKind 'degenerate',
// no tangency, chord X_n → E⁰ cuts, |d_n| ≤ 0.1·w): chord X_n → M, ℓ_m = max(w, 3|d_n|), spliceMm = |X_n M| ±1e−6 mm, turn
// at M ≤ mTurnBoundDeg (atan(|d|/ℓ_m) + the rail's own turn foot → M) + 0.2°.
const degenEntryBad = (s, R, w) => {
  if (s.lam0) return null;
  if (s.entryKind === 'onRail') {
    if ((s.spliceMm ?? 0) > 1e-9) return `${s.id} round-off with splice ${s.spliceMm}`;
    const a0 = s.arcs?.[0];
    if (!a0 || !['rail', 'ext', 'corner'].includes(a0.cls)) return `${s.id} round-off first piece ${a0?.cls}`;
    return null;
  }
  if (s.entryKind !== 'degenerate') return null;
  const i = s.mIdx;
  if (!(i > 0 && i < s.pts.length - 1)) return `${s.id} no M vertex`;
  const XM = R * angle(s.pts[0], s.pts[i]);
  const t = Math.abs(turnAtVtx(s.pts, i));
  const tMax = (s.mTurnBoundDeg ?? Math.atan2(Math.abs(s.lateralMm), Math.max(w, 3 * Math.abs(s.lateralMm))) * 180 / Math.PI) + 0.2;
  if (Math.abs(s.spliceMm - XM) > 1e-6) return `${s.id} splice ${s.spliceMm} vs |XM| ${XM}`;
  if (t > tMax) return `${s.id} turn ${t.toFixed(3)}° > ${tMax.toFixed(3)}°`;
  return null;
};

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
  // #28: interiorXn is decided by a fraction of w (λ > 0: d_n < −1e−9·w, path.railLeg onRailEps; λ = 0: d_n < −0.02·w,
  // freeLegLambda0) — no flips under ×k at λ = 0.32 and λ = 0; the nearest station to its threshold is printed in w.
  {
    // λ = 0 at m = 1.0 (the default m has no interior X_n at λ = 0).
    const A1g = computeAll(recipe, { ...base, m_mm: 1.0, rowsMode: 'untilEquator', shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32 });
    const A2g = computeAll(recipe, { ...base, C_mm: 240 * k, w_mm: 0.714 * k, m_mm: 1.0 * k, startRun_mm: 35 * k,
      rowsMode: 'untilEquator', shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32 });
    const flips = (P1, P2) => {
      const a = P1.path.segs.filter((s) => s.type === 'leg'), b = P2.path.segs.filter((s) => s.type === 'leg');
      let n = 0, nIn = 0, margin = Infinity;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (!!a[i].interiorXn !== !!b[i].interiorXn) n++;
        if (a[i].interiorXn) nIn++;
        if (a[i].row < 2 || a[i].layMode !== 'rail') continue;
        const thr = a[i].lam0 ? 0.02 : 1e-9, dW = (a[i].lateralMm ?? 0) / P1.params.w_mm;
        if (Math.abs(dW) > 1e-12) margin = Math.min(margin, Math.abs(dW + thr));
      }
      return { n, nIn, margin, same: a.length === b.length };
    };
    const fb = flips(A1f, A2f), fg = flips(A1g, A2g);
    console.log(`  #28 interiorXn under ×${k}: λ0.32 ${fb.nIn} interior, flips ${fb.n}, nearest |d/w − thr| ${fmt(fb.margin, 4)}; λ0 ${fg.nIn} interior, flips ${fg.n}, nearest ${fmt(fg.margin, 4)}`);
    check(fb.same && fg.same && fb.n === 0 && fg.n === 0 && fb.nIn > 0 && fg.nIn > 0,
      `#28 similarity: interiorXn (threshold in w) does not flip under ×${k} at λ 0.32 (${fb.nIn} interior) and λ 0 (${fg.nIn} interior)`);
  }
}

// 2c. S16: dense marking (N = 16). 6a.22: at the default (thin) m the 5 mm top no longer reaches the neighbour line → S16
// uses a 4 mm top; m = 1.0 with the 5 mm top is kept as the stress set.
// Retired by #45 — old closing, cancelled by (12′): «S16 …: V5 = fail (catch reaches the neighbour marking line), as
// expected», «S16 closing stitch missing X-side squeeze», «S16 closing X-side squeeze has gap < w», «S16 closing xOff is
// mid-gap». The only reach was the squeezed row-1 closing at s_T(1); the closing is now the L0 top of row 2 at s_T(2),
// placed by its own cluster and checked by V6 (L0 vs L2: x, s ± 0.1·w, e ± 0.2·w; group 8n).
if (G('2c'))
for (const s16 of [{ N: 16, sTop_mm: 4 }, { N: 16, m_mm: 1.0 }]) {
  const A = computeAll(recipe, s16);
  const V = runValidators(A, '2b', ref);
  const v5 = V.find((v) => v.id === 'V5');
  const lab = `S16 m=${A.params.m_mm} top ${A.layout.sTop} mm`;
  console.log(`\n  ${lab}: V5 ${v5.status}: ${v5.value}`);
  check(v5.status === 'pass' && v5.numbers.reach === 0, `${lab}: V5 pass, no catch reaches the neighbour marking line ((12′): no squeezed closing at s_T(1))`);
  const m = A.params.m_mm, w = A.params.w_mm, N = A.marking.N;
  const a1 = A.path.stitches.filter((st) => st.round === 'A1');
  const closing = a1.find((st) => st.closing);
  check(!!closing && closing.i === N && closing.s > A.layout.sTop + w - 1e-9, `${lab}: A1 closing stitch is the L0 top of row 2 (s = ${closing?.s?.toFixed(3)} = s_T(1) + w)`);
  const reg = a1.filter((st) => st.i !== N);
  check(reg.length === N - 1 && reg.every((st) => Math.abs(st.eOff - (m + w) / 2) < 1e-9 && Math.abs(st.xOff + (m + w) / 2) < 1e-9),
    `${lab}: A1 stitches except the closing keep E/X = ±(m+w)/2 (calc.py / calc_reference contract)`);
  const v3 = V.find((v) => v.id === 'V3');
  console.log(`  S16 V3 ${v3.status} (row 1 without the closing, (12′)): dXY=${v3.numbers?.dXY?.toFixed?.(9) ?? v3.numbers?.dXY}`);
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
  console.log(`\n  w 0,714 → 1,0: E сдвиг ${fmt(dE, 6)} мм, X ${fmt(dX, 6)} мм (ожидание ±Δw/2 = ±0,143), X замыкающего ${fmt(dXc, 6)} (диагностика; (12′): L0-верх ряда 2)`);
  check(Math.abs(dE - 0.143) < 1e-9 && Math.abs(dX + 0.143) < 1e-9, 'E/X обычного стежка смещаются на ±Δw/2');
  // Retired by #45 — old closing, cancelled by (12′): «X замыкающего стежка смещается на −1,5Δw (стартовая нить тоже шире)».
  // The closing is the L0 top of row 2 (own cluster at s_T(2)); covered by V6 L0 vs L2 (group 8n).
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
  // #41 nits: out-of-schema μWrap refused (error AND not written), estimate statuses, localized surface labels.
  const muBad = normalizeParams({ wrapThread: 'jimaki-cotton', muWrap: 2.5 }), muNeg = normalizeParams({ muWrap: -0.1 });
  check(muBad._errors.length === 1 && muBad.muWrap === wrapMuDefault('jimaki-cotton') && muNeg._errors.length === 1 && muNeg.muWrap === wrapMuDefault(WRAP_THREAD_DEFAULT)
    && normalizeParams({ muWrap: 1.5 }).muWrap === 1.5 && normalizeParams({ muWrap: 1.5 })._errors.length === 0,
    `#41 nit: μWrap outside the schema [0, 1.5] is refused — loud error, the type default is kept (got ${muBad.muWrap}, ${muNeg.muWrap})`);
  check(Object.values(WRAP_THREADS).every((v) => v.widthStatus === 'estimate' && (v.mu !== 0.38 || v.muStatus === 'estimate'))
    && wk[2].status === 'estimate', '#41 nit: μ 0.38, width 0.3 mm and the 2–5 MPa compliance carry the status "estimate"');
  {
    const { setLocale, getLocale, t: tr } = await import('../src/i18n.js');
    const surf = [...new Set(Object.values(WRAP_THREADS).map((v) => v.surface))];
    const loc0 = getLocale();
    setLocale('ru');
    const ru = surf.map((x) => tr(`wrap.surface.${x}`, {}, '∅')), ruSt = tr('status.estimate', {}, '∅'), ruDef = tr('param.wrapCompliance.def', {}, '∅');
    setLocale(loc0);
    check(ru.every((x) => x !== '∅' && /[а-яё]/i.test(x)) && /[а-яё]/i.test(ruSt) && /МПа/.test(ruDef),
      `#41 nit: RU panel — surface labels, "estimate" status and the compliance text are Russian (${ru.join(', ')}; ${ruSt})`);
  }
  const xw = computeAll(recipe, { C_mm: 240, wrapColor: '#336699', wrapThread: WRAP_THREAD_DEFAULT });
  check(JSON.stringify(lens(x1)) === JSON.stringify(lens(xw)) && JSON.stringify(x1.path.stitches.map((st) => [st.eOff, st.xOff, st.s]))
    === JSON.stringify(xw.path.stitches.map((st) => [st.eOff, st.xOff, st.s])), '#41: wrap colour / default type do not change the geometry');
  // #42: wound-thread wrap texture data (great circles, seeded jitter, phone-sized bake).
  const { sewCover, wrapAxes, wrapAxis, wrapCoverage, WRAP_JITTER_DEG, WRAP_BAKE, WRAP_GPU_MAX } = await import('../src/wrap.js');
  const sc = sewCover(240, 0.3);
  check(sc.wraps === 448 && Math.abs(sc.halfWidth - 0.15 / (240 / (2 * Math.PI))) < 1e-15, `#42: 240 mm ball, 0.3 mm thread → 448 great-circle strands, half-width w/2R (got ${sc.wraps})`);
  check(sewCover(450, 0.3).wraps <= WRAP_GPU_MAX, '#42: the GPU loop covers the largest ball (C = 450 mm) at 0.3 mm');
  const ax1 = wrapAxes(sc.wraps), ax2 = wrapAxes(sc.wraps);
  check(ax1.every((v, i) => v === ax2[i]), '#42: strand axes are deterministic (fixed seed)');
  const axU = wrapAxes(sc.wraps, { shuffle: false });
  let tiltMin = 90, tiltMax = 0, lenErr = 0;
  for (let k = 0; k < sc.wraps; k++) {
    const e = wrapAxis(k, sc.wraps), a = [axU[3 * k], axU[3 * k + 1], axU[3 * k + 2]];
    const d = Math.acos(Math.min(1, e[0] * a[0] + e[1] * a[1] + e[2] * a[2])) * 180 / Math.PI;
    tiltMin = Math.min(tiltMin, d); tiltMax = Math.max(tiltMax, d); lenErr = Math.max(lenErr, Math.abs(Math.hypot(...a) - 1));
  }
  check(tiltMin >= WRAP_JITTER_DEG[0] - 1e-4 && tiltMax <= WRAP_JITTER_DEG[1] + 1e-4 && lenErr < 1e-6,
    `#42: every axis tilted ${WRAP_JITTER_DEG[0]}–${WRAP_JITTER_DEG[1]}° from the even golden-angle axis (got ${tiltMin.toFixed(2)}–${tiltMax.toFixed(2)}°), unit length`);
  const cvEven = wrapCoverage(wrapAxes(sc.wraps, { jitterDeg: [0, 0] }), sc.halfWidth, 20000), cvJit = wrapCoverage(ax1, sc.halfWidth, 20000);
  console.log(`  #42 coverage: even bare ${(cvEven.bare * 100).toFixed(1)}% clump≥4 ${(cvEven.clump * 100).toFixed(1)}%; jittered bare ${(cvJit.bare * 100).toFixed(1)}% clump≥4 ${(cvJit.clump * 100).toFixed(1)}%; mean ${cvJit.mean.toFixed(3)}`);
  check(cvJit.bare <= cvEven.bare + 0.02 && cvJit.clump <= cvEven.clump + 0.02 && Math.abs(cvJit.mean - cvEven.mean) < 0.05,
    '#42: jitter keeps coverage uniform (bare and ≥4-strand fractions within 2 points of the even spiral)');
  check(WRAP_BAKE.phone.w <= 2048 && WRAP_BAKE.phone.h <= 1024 && WRAP_BAKE.desktop.w === 2 * WRAP_BAKE.desktop.h, '#42: phone bake ≤ 2048×1024; equirectangular 2:1');
  // #42 rework (owner: "all visible winding layers must be thread"): where the top layer leaves gaps, the lower layers
  // of the same thread show (other great circles at other angles, darker); the core colour is never seen.
  const { wrapLayerAxes, wrapLayerShare, WRAP_LAYERS } = await import('../src/wrap.js');
  const topAx = wrapLayerAxes(sc.wraps, 0), l2 = wrapLayerAxes(sc.wraps, 1), l3 = wrapLayerAxes(sc.wraps, 2);
  check(topAx.every((v, i) => v === ax1[i]), '#42 rework: the top layer is the former single layer (same axes, unchanged look)');
  let minSep = 90;
  for (let k = 0; k < sc.wraps; k++) for (const L of [l2, l3]) {
    const c = Math.abs(topAx[3 * k] * L[3 * k] + topAx[3 * k + 1] * L[3 * k + 1] + topAx[3 * k + 2] * L[3 * k + 2]);
    minSep = Math.min(minSep, Math.acos(Math.min(1, c)) * 180 / Math.PI);
  }
  const cvL2 = wrapCoverage(l2, sc.halfWidth, 20000);
  check(minSep > 0.5 && Math.abs(cvL2.bare - cvJit.bare) < 0.02 && WRAP_LAYERS[1].shade < 1 && WRAP_LAYERS[2].shade < WRAP_LAYERS[1].shade,
    `#42 rework: lower layers are other great circles (strand k ≥ ${minSep.toFixed(2)}° from its top-layer twin, same coverage statistics), progressively darker`);
  const ls = wrapLayerShare(sc.wraps, sc.halfWidth, 20000);
  console.log(`  #42 rework layers seen: top ${(ls.top * 100).toFixed(1)}% second ${(ls.second * 100).toFixed(1)}% fill ${(ls.fill * 100).toFixed(1)}% core ${(ls.base * 100).toFixed(1)}% (former bare ${(cvJit.bare * 100).toFixed(1)}%)`);
  check(ls.base === 0 && Math.abs(ls.second + ls.fill - cvJit.bare) < 1e-12 && Math.abs(ls.top - (1 - cvJit.bare)) < 1e-12,
    '#42 rework: no core colour seen; the lower layers fill exactly the former bare share');
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
    // L_j (#45, (10′)): the expectation is the closed-form tangency from X_n to the small circle (k, ρ) of the actual rail
    // piece(s) — a·cosψ + b·sinψ = (X·k)·tan ρ, the co-directional root lying on a piece, first in travel order — with a
    // class (i) tolerance (1e−6·w). √(2·|d|·R·tan ρ) is only its single-arc small-d special case (printed).
    const U3 = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const d3 = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    const c3 = (x, y) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    const a3 = (x, y) => Math.atan2(Math.hypot(...c3(x, y)), d3(x, y));
    const closedLj = (sg, R) => {
      const X = U3(sg.from);
      for (const pc of sg.arcs.filter((q) => q.cls === 'rail' || q.cls === 'ext' || q.cls === 'corner')) {
        if (Math.abs(pc.rho - Math.PI / 2) < 1e-12) continue;   // a great circle has no tangency (10′)
        const k = U3(pc.k), a0 = U3(pc.a), u = U3(c3(c3(k, a0), k)), v = c3(k, u);
        const aa = d3(X, u), bb = d3(X, v), H = Math.hypot(aa, bb), cc = d3(X, k) * Math.tan(pc.rho);
        if (H < Math.abs(cc)) continue;
        for (const sgn of [1, -1]) {
          const psi = Math.atan2(bb, aa) + sgn * Math.acos(cc / H);
          const P = U3(k.map((kk, i) => Math.cos(pc.rho) * kk + Math.sin(pc.rho) * (Math.cos(psi) * u[i] + Math.sin(psi) * v[i])));
          const T = U3(c3(k, P)), arr = U3(P.map((q, i) => q * d3(X, P) - X[i]));
          let ang = (((Math.atan2(d3(P, v), d3(P, u)) - Math.atan2(d3(a0, v), d3(a0, u))) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          if (ang > 2 * Math.PI - 1e-9) ang -= 2 * Math.PI;   // T at the piece's start (round-off below zero)
          const along = R * Math.sin(pc.rho) * ang;
          if (d3(arr, T) * Math.sign(pc.psi || 1) > 0 && along >= -1e-9 && along <= R * Math.sin(pc.rho) * Math.abs(pc.psi) + 1e-9) return R * a3(X, P);
        }
      }
      return NaN;
    };
    // #29 (1): the "splice ≈ 0" tolerance of an exterior d ≈ 0 join is a fraction of w with a matching label: 0.01·w (εc).
    // A round-off station (|d| ≤ 1e−9·w) has L_j ≤ √(2·1e−9·w·R·tan ρ) ≈ 1e−3·w, so 0.01·w leaves 10× margin; the old
    // 0.07·(w/0.714) mm (= 0.098·w, labelled "≈0.05 mm") let a 0.06 mm false L_j pass.
    const SPLICE0_TOL_W = 0.01;
    const splice0Ok = (sp, wMm) => (sp ?? 0) < SPLICE0_TOL_W * wMm;
    check(!splice0Ok(0.06, 0.714) && !splice0Ok(0.01 * 0.714, 0.714) && splice0Ok(0.009 * 0.714, 0.714) && !splice0Ok(0.06 * 1.25, 0.714 * 1.25),
      `#29 splice ≈ 0 tolerance ${SPLICE0_TOL_W}·w: a 0.06 mm false L_j fails (mutation), 0.009·w passes, same under ×1.25`);
    let ljOk = 0, ljN = 0;
    for (const s of ext) {
      const d = Math.abs(s.lateralMm ?? 0);
      if (s.joinMode !== 'tangent' || !(d > 1e-9 * A.params.w_mm)) continue;
      const R = A.base.R;
      const expect = closedLj(s, R), approx = Math.sqrt(2 * d * R * Math.tan(s.rho));
      const got = s.spliceMm ?? 0;
      console.log(`  L_j d=${fmt(d, 4)} closed form ${fmt(expect, 9)} got ${fmt(got, 9)} (Δ ${Math.abs(got - expect).toExponential(1)} mm; single-arc √(2dR·tan ρ) ${fmt(approx, 2)})`);
      ljN++; if (Math.abs(got - expect) <= 1e-6 * A.params.w_mm) ljOk++;
    }
    if (ljN === 0) {
      // Exterior with d≈0: tangent join length is negligible (6a.4 — no splice threshold). #46: a round-off entry
      // (entryKind onRail) is the rail from X_n (splice 0); a degenerate entry is checked as |X_n M| and the turn at M.
      const tang = ext.filter((s) => s.entryKind !== 'onRail' && s.entryKind !== 'degenerate'), deg = ext.filter((s) => s.entryKind === 'onRail' || s.entryKind === 'degenerate');
      const bad = deg.map((s) => degenEntryBad(s, A.base.R, A.params.w_mm)).filter(Boolean);
      check(tang.every((s) => splice0Ok(s.spliceMm, A.params.w_mm)) && bad.length === 0,
        `exterior d≈0 ⇒ tangent spliceMm < ${SPLICE0_TOL_W}·w (no false L_j); ${deg.length} round-off / degenerate entries: rail from X_n (splice 0) / spliceMm = |X_n M| ±1e−6 mm, turn at M ≤ bound+0.2° (bad ${bad.join(',') || 0})`);
    } else {
      check(ljOk === ljN, `L_j = closed-form tangency on the actual rail piece(s) within 1e−6·w for all ${ljN} exterior tangent joins (10′)`);
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
    // #46 (9б′) replaces the ±0.02·w band of (9б) at λ > 0: |d_n| ≤ 1e−9·w round-off (rail from X_n, splice 0); d < 0 climb;
    // d > 0 tangent | free | degenerate | contradiction — never onRail, never a climb from outside. Every round-off and
    // degenerate entry passes degenEntryBad (rail from X_n / |X_n M| and the turn at M).
    const small = A.path.segs.filter((s) => s.type === 'leg' && s.row >= 2 && s.layMode === 'rail' && !s.lam0 && s.level === 'bottom'
      && Math.abs(s.lateralMm ?? Infinity) <= TANGENCY_RES_W * w);
    const wrongKind = small.filter((s) => {
      const d = s.lateralMm, r = 1e-9 * w;
      return d < -r ? s.joinMode !== 'climb' : d <= r ? s.entryKind !== 'onRail' : !['tangent', 'free', 'degenerate', 'contradiction'].includes(s.joinMode);
    });
    const kindsSmall = {}; for (const s of small) kindsSmall[s.entryKind ?? s.joinMode] = (kindsSmall[s.entryKind ?? s.joinMode] || 0) + 1;
    const degBad = A.path.segs.filter((s) => s.type === 'leg' && s.row >= 2).map((s) => degenEntryBad(s, A.base.R, w)).filter(Boolean);
    const onRailN = A.path.segs.filter((s) => s.type === 'leg' && s.row >= 2 && s.entryKind === 'onRail').length;
    check(wrongKind.length === 0 && degBad.length === 0,
      `λ=${lam}: lower legs with |d_n| ≤ 0.02·w by (9б′) ${JSON.stringify(kindsSmall)}; round-off ${onRailN} with rail from X_n, degenerate |X_n M| and turn at M (wrong ${wrongKind.map((s) => `${s.id} ${s.joinMode}/${s.entryKind} d ${fmt(s.lateralMm / w, 4)}`).join(',') || 0}; bad ${degBad.join(',') || 0})`);
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
    const ps = V.numbers.perSet, brAll = V.numbers.bRows.filter((b) => b.hole === 'E');
    // Spec (15) (#45): the pair on the bottom line before L0 is covered by the intermediate closing leg of row n+2 (it runs
    // down to the L0 top of row n+3) — excluded from the K16b promise test, printed with product vs window.
    const Nn = A.marking.N, startOf = (set) => recipe.work.sets.find((x) => x.set === set).startLine;
    const isClosingPair = (b) => b.line === (startOf(b.set) + Nn - 1) % Nn;
    const excl = brAll.filter(isClosingPair), br = brAll.filter((b) => !isClosingPair(b));
    console.log(`  K16b λ=${lam}: closing-leg pairs excluded (${excl.length}): ${excl.map((b) => `${b.set}${b.row} L${b.line} ${fmt(b.prod, 3)} in [${fmt(b.win[0], 3)}; ${fmt(b.win[1], 3)}]${b.promised ? '' : ' not promised'}`).join('; ')}`);
    const inWin = br.filter((b) => b.prod >= b.win[0] - 1e-9 && b.prod <= b.win[1] + 1e-9).length;
    const r1 = br.filter((b) => b.row === 1);
    console.log(`  K16b λ=${lam}: ${['A', 'B'].map((k) => `${k} promised ${ps[k].bPromised}/${ps[k].bN} covered ${ps[k].bRaw}`).join(', ')}; row-1 tips α ${fmt(Math.min(...r1.map((b) => b.alphaDeg)), 2)}–${fmt(Math.max(...r1.map((b) => b.alphaDeg)), 2)}°, Δsum·tan α ${fmt(Math.min(...r1.map((b) => b.prod)), 3)}–${fmt(Math.max(...r1.map((b) => b.prod)), 3)} in [${fmt(r1[0].win[0], 3)}; ${fmt(r1[0].win[1], 3)}]`);
    // #46: the raw coverage (≤ 0.55·w) of the closing-leg pairs is printed, not required — they are outside the (15) promise
    // (#45), and since (10′) the closing leg spans the concave stretch of its rail near X_n on a supporting chord
    // (λ 0.6: E_n → leg 0.47–0.50·w → 0.50–0.58·w, rows 9–11 past 0.55·w).
    const brAllH = V.numbers.bRows, uncov = brAllH.filter((b) => !b.covered);
    const uncovNonClosing = uncov.filter((b) => !isClosingPair(b));
    console.log(`  K16b λ=${lam}: raw-uncovered pairs ${uncov.length}: ${uncov.map((b) => `${b.set}${b.row} L${b.line} ${b.hole} ${fmt(b.distW, 3)}w${isClosingPair(b) ? ' (closing)' : ''}`).join('; ') || 'none'}`);
    check(V.status === 'pass' && uncovNonClosing.length === 0 && br.every((b) => b.promised) && inWin === br.length,
      `K16b λ=${lam}: every non-closing pair covered (raw-uncovered non-closing ${uncovNonClosing.length}, closing ${uncov.length - uncovNonClosing.length}); every pair except the ${excl.length} closing-leg pairs promised by the window with the actual-leg α (in window ${inWin}/${br.length})`);
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
  // #29: the tube rule is two-sided and covers both sets. Chord gap to row n−1 ≥ w ⇒ free body (no rail arcs), exitKind
  // free, joinMode by the d_n band (§3.2(9а–б), #39); gap < w ⇒ never joinMode 'free' (climb or onRail at X_n).
  const gapOf = (R, s, prior) => { let g = Infinity; for (let j = 0; j <= 200; j++) g = Math.min(g, pointPolyDist(R, interp(s.from, s.to, j / 200), prior.pts)); return g; };
  const tubeRule = (A, gaps = null) => {
    const R = A.base.R, w = A.params.w_mm;
    const legs = A.path.segs.filter((x) => x.type === 'leg');
    const table = new Map(legs.map((x) => [`${x.set}/${x.row}/${x.stitch}`, x]));
    const out = { freeAll: 0, near: 0, viol: 0, sets: new Set(), bad: [], gaps: gaps || new Map() };
    for (const s of legs) {
      if (s.row < 2) continue;
      const prior = table.get(`${s.set}/${s.row - 1}/${s.stitch}`);
      if (!prior) continue;
      if (!out.gaps.has(s.id)) out.gaps.set(s.id, gapOf(R, s, prior));
      const minG = out.gaps.get(s.id);
      out.sets.add(s.set);
      if (minG >= w) {
        out.freeAll++;
        const tol = 0.02 * w, d = s.lateralMm;
        const band = d < -tol ? 'climb' : d <= tol ? 'onRail' : 'free';
        if (s.arcs.some((a) => a.cls === 'rail' || a.cls === 'ext' || a.cls === 'corner') || s.joinMode !== band || s.exitKind !== 'free') { out.viol++; out.bad.push(s.id); }
      } else {
        out.near++;
        if (s.joinMode === 'free') { out.viol++; out.bad.push(s.id); }
      }
    }
    return out;
  };
  const peaks = [], freeAlls = [];
  for (const N of [96, 192, 384]) {
    setLegSamples(N);
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32, rowsMode: 'untilEquator' });
    const legs = A.path.segs.filter((x) => x.type === 'leg');
    const tr = tubeRule(A);
    const freeAll = tr.freeAll, viol = tr.viol;
    let peakOver = 0, maxPeak = 0;
    for (const s of legs) {
      if (s.row < 2) continue;
      let peak = 0;
      for (let i = 1; i < s.pts.length - 1; i++) peak = Math.max(peak, Math.abs(turnDeg(s.pts, i)));
      if (peak > 20) peakOver++;
      maxPeak = Math.max(maxPeak, peak);
    }
    peaks.push(maxPeak);
    console.log(`  N=${N}: freeAll=${freeAll} gap<w=${tr.near} viol=${viol} peakOver=${peakOver} maxPeak=${fmt(maxPeak, 2)} (sets ${[...tr.sets].join('')})`);
    // The count depends on m; the rule is two-sided (#29): gap ≥ w ⇒ free body, gap < w ⇒ not joinMode free; both sets.
    freeAlls.push(freeAll);
    check(freeAll > 0 && viol === 0 && tr.sets.size === 2, `N=${N}: sets A+B, all ${freeAll} gap ≥ w arms have a free body, exitKind free and joinMode by the d_n band (v3.2 (9а–б)); ${tr.near} gap < w arms not free (#29)`);
    // #22: gated at every grid, 384 included (M and every joint are output vertices; no resample across a corner).
    check(peakOver === 0 && maxPeak <= 20, `N=${N}: all peaks ≤20° (max ${fmt(maxPeak, 2)})`);
  }
  // #29: m = 1.0 has gap < w arms on both sets (the default m has none): two-sided rule + negative mutations.
  {
    setLegSamples(96);
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, m_mm: 1.0, shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32, rowsMode: 'untilEquator' });
    const w = A.params.w_mm, tr = tubeRule(A);
    const segOf = (id) => A.path.segs.find((x) => x.id === id);
    const near = (set) => A.path.segs.find((x) => x.type === 'leg' && x.set === set && x.row >= 2 && tr.gaps.has(x.id) && tr.gaps.get(x.id) < w);
    const far = (set) => A.path.segs.find((x) => x.type === 'leg' && x.set === set && x.row >= 2 && tr.gaps.has(x.id) && tr.gaps.get(x.id) >= w);
    const nearA = near('A'), nearB = near('B'), farB = far('B');
    console.log(`  #29 m1 N=96: gap ≥ w ${tr.freeAll}, gap < w ${tr.near} (A ${[...tr.gaps].filter(([id, g]) => g < w && segOf(id).set === 'A').length}, B ${[...tr.gaps].filter(([id, g]) => g < w && segOf(id).set === 'B').length}), viol ${tr.viol}; mutate ${nearA?.id}/${nearA?.round} (gap ${fmt(tr.gaps.get(nearA?.id), 3)} mm, ${nearA?.joinMode}), ${nearB?.id}/${nearB?.round}, ${farB?.id}/${farB?.round}`);
    check(tr.viol === 0 && tr.near > 0 && tr.freeAll > 0 && tr.sets.size === 2 && nearA && nearB && farB, `#29 m1: two-sided tube rule holds on A and B (${tr.freeAll} gap ≥ w free, ${tr.near} gap < w not free)`);
    const mut = (leg, patch) => { const keep = { joinMode: leg.joinMode, exitKind: leg.exitKind, arcs: leg.arcs }; Object.assign(leg, patch); const r = tubeRule(A, tr.gaps); Object.assign(leg, keep); return r; };
    const m1 = mut(nearA, { joinMode: 'free' });
    const m2 = mut(nearB, { joinMode: 'free' });
    const m3 = mut(farB, { arcs: [...farB.arcs, { cls: 'rail' }] });
    const m4 = mut(farB, { exitKind: 'drain' });
    check(m1.bad.includes(nearA.id) && m2.bad.includes(nearB.id) && m3.bad.includes(farB.id) && m4.bad.includes(farB.id) && tubeRule(A, tr.gaps).viol === 0,
      `#29 negative mutations caught: A gap < w → free, B gap < w → free, B gap ≥ w + rail arc, B gap ≥ w exit drain (viol ${m1.viol}/${m2.viol}/${m3.viol}/${m4.viol}); restored clean`);
  }
  setLegSamples(null);
  check(freeAlls.every((x) => x === freeAlls[0]), `B.8 freeAll count grid-invariant 96/192/384 (${freeAlls.join('/')})`);
  // #22: 384 gated too — non-increasing 96 → 192 → 384 (1e−6°) and |96 − 384| ≤ 0.5° (§6.4 grid convergence).
  check(peaks[0] >= peaks[1] - 1e-6 && peaks[1] >= peaks[2] - 1e-6 && Math.abs(peaks[0] - peaks[2]) <= 0.5,
    `B.8 peaks non-increasing 96→192→384 and |96−384| ≤ 0.5° (${peaks.map((x) => fmt(x, 3)).join('→')})`);
  // #22, option (i) (coordinator): construction unchanged (M at ℓ_m from the foot). Per-leg check at M at every λ:
  // expected turn = angle between the chord X_n → M and the rail link LEAVING M; the output polyline reproduces it
  // within 0.2° and stays ≤ 20°. Legs whose rail turns (a corner) between the foot and M are reported per λ: count, max
  // rail turn, max turn at M, min (9д) clearance from M to the axis of row n−1 (≥ 0.99·w).
  for (const lam of [0, 0.32, 0.6]) for (const N of [96, 384]) {
    setLegSamples(N);
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: lam ? 'bow' : 'geodesic', bowLambda: lam, muWrap: Math.max(0.32, lam), rowsMode: 'untilEquator' });
    const legs = A.path.segs.filter((x) => x.type === 'leg' && x.row >= 2 && x.mIdx > 0 && x.mTurnExpDeg != null);
    let err = 0, tMax = 0;
    const k = { n: 0, rail: 0, turn: 0, clr: Infinity };
    for (const s of legs) {
      const t = turnAtVtx(s.pts, s.mIdx);
      err = Math.max(err, Math.abs(t - s.mTurnExpDeg)); tMax = Math.max(tMax, Math.abs(t));
      if (s.railCornerFootToM > 0) {
        k.n++; k.rail = Math.max(k.rail, Math.abs(s.railTurnFootToMDeg ?? 0)); k.turn = Math.max(k.turn, Math.abs(t)); k.clr = Math.min(k.clr, s.clearFreeW ?? -1);
      }
    }
    console.log(`  #22 λ=${lam} N=${N}: ${legs.length} legs with M, max |turn − expected| ${fmt(err, 4)}°, max turn ${fmt(tMax, 2)}°; rail corner foot→M: ${k.n}, max rail turn ${fmt(k.rail, 2)}°, max turn at M ${fmt(k.turn, 2)}°, min clearance from M ${k.n ? fmt(k.clr, 4) : '–'} w`);
    // (12′) (#45): at λ = 0 the only legs with M were the i1 climbs of the transition step, which no longer exists.
    check((legs.length > 0 || lam === 0) && err <= 0.2 && tMax <= 20 && (k.n === 0 || k.clr >= 0.99),
      `#22 λ=${lam} N=${N}: turn at M = chord→rail-link angle ±0.2°, ≤ 20°; clearance from M ≥ 0.99·w on ${k.n} legs with a rail corner foot→M`);
  }
  setLegSamples(null);
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
    // #49: the display stack lift is bounded (≤ DISPLAY_STACK_LIFT_MAX_W·w; bow 0.32 has tent stacks up to 17 — was ≈ 10·w).
    check(Number.isFinite(maxLift) && maxLift >= 0 && maxLift <= DISPLAY_STACK_LIFT_MAX_W * w + 1e-12,
      `${cfg.label}: stackProfile finite and bounded, max ${fmt(maxLift / w, 3)}·w ≤ ${DISPLAY_STACK_LIFT_MAX_W}·w (#49)`);
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
    // #38 follow-up: the causal geometric start counts every class of already laid foreign thread (legs and channels,
    // as checkHole), so no U14 is observed earlier than it.
    check((n.earlyObs || 0) === 0, `λ=${lambda}: no U14 observed earlier than the causal geometric start (got ${n.earlyObs}${n.earlyObs ? ': ' + n.earlyList.join(', ') : ''})`);
    // Status may be warn (U14) or pass; pierced non-top / start holes would be path bugs.
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
  const w = 0.714;
  for (const [lambda, m] of [[0, 0.5], [0, 1.0], [0.32, 0.5], [0.32, 1.0], [0.6, 0.5], [0.6, 1.0]]) {
    const tag = `${lambda ? 'λ' + lambda : 'geo'} m${m}`;
    const A = computeAll(recipe, { C_mm: 240, w_mm: w, m_mm: m, shoulderForm: lambda ? 'bow' : 'geodesic', bowLambda: lambda, muWrap: Math.max(lambda, 0.32), rowsMode: 'untilEquator' });
    const segById = new Map(A.path.segs.map((x) => [x.id, x]));
    const tops = A.path.stitches.filter((q) => q.level === 'top');
    if (lambda === 0 && m === 0.5) {
      const top = (set, row) => tops.filter((q) => q.set === set && q.row === row && q.i !== A.marking.N);   // (12′): the closing stitch is the L0 top of row n+1
      for (const row of [4, 5]) {
        const wA = top('A', row).map((q) => q.eOff - q.xOff), wB = top('B', row).map((q) => q.eOff - q.xOff);
        const dev = Math.max(...wB.map((x) => Math.abs(x - wA[0])), ...wA.map((x) => Math.abs(x - wA[0])));
        check(wA.length > 0 && wB.length > 0 && dev < 1e-6, `${tag} row ${row}: B top width = A top width (A ${wA[0]?.toFixed(3)}, max dev ${dev.toExponential(1)})`);
      }
    }
    const foreignInCluster = tops.some((q) => q.sides.cluster.some((c) => c.seg !== 'marking' && segById.get(c.seg)?.set !== q.set));
    check(!foreignInCluster, `${tag}: no other-set thread in any top-hole cluster`);
    // completeness: every foreign occupancy excluded from the cluster whose interval covers a hole is recorded once
    // (side, segment, d < w/2, inSpan flag); nothing else is recorded.
    let covered = 0, missing = 0, extra = 0, badRec = 0, inSpan = 0, first = null;
    for (const st of tops) {
      const recs = st.sides.setCollision || [];
      for (const [side, y] of [['E', st.eOff], ['X', st.xOff]]) {
        const want = new Set((st.sides.foreignUnder || []).filter((o) => o.lo < y && y < o.hi).map((o) => o.seg));
        const got = recs.filter((c) => c.side === side);
        covered += want.size;
        for (const sg of want) if (!got.some((c) => c.seg === sg)) { missing++; first = first || `${st.round}/${st.i} ${side} ${sg}`; }
        extra += got.filter((c) => !want.has(c.seg)).length + (got.length - new Set(got.map((c) => c.seg)).size);
        for (const c of got) {
          const L = segById.get(c.seg);
          if (!L || L.set === st.set || !(c.d >= 0 && c.d < w / 2) || typeof c.inSpan !== 'boolean' || c.segRound !== L.round) badRec++;
          if (c.inSpan) inSpan++;
        }
      }
    }
    const v16 = runValidators(A, A.path.ops.length - 1, null).find((x) => x.id === 'V16');
    check(covered > 0 && missing === 0 && extra === 0 && badRec === 0 && A.path.setCollisions.length === covered,
      `${tag}: U14 records complete — ${covered} foreign occupancies over a hole, ${missing} unrecorded, ${extra} extra, ${badRec} malformed; ${inSpan} in a foreign top-stitch span${first ? '; first missing ' + first : ''}`);
    check(v16.numbers.warnU14 === covered, `${tag}: U14 records = V16 set-collision warns (${covered} vs ${v16.numbers.warnU14})`);
    if (lambda === 0 && m === 0.5) {
      const v15 = runValidators(A, A.path.ops.length - 1, null).find((x) => x.id === 'V15');
      check(v15.status === 'pass', `${tag}: V15 pass with set collisions explained (got ${v15.status})`);
    }
  }
}

// 8k. #39 item 3 / spec v3.2 §3.2(9а–д), (8′), (12) K12, §6.6: λ = 0 legs are free by construction, exitKind by (9г),
// d_n to the parallel of the actual path, stop K12, V20 row-1 tolerance.
if (G('8k'))
{
  console.log('\n## #39 (9а–д) λ = 0 free legs, (9г) V22, K12, V20 row 1');
  for (const m of [0.5, 1.0]) {
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, m_mm: m, shoulderForm: 'geodesic', bowLambda: 0, muWrap: 0.32, rowsMode: 'untilEquator' });
    const w = A.params.w_mm;
    const legs = A.path.segs.filter((x) => x.type === 'leg' && x.row >= 2);
    const railArcs = legs.filter((x) => x.arcs.some((a) => a.cls === 'rail' || a.cls === 'ext' || a.cls === 'corner'));
    check(legs.every((x) => x.lam0) && railArcs.length === 0, `geo m${m}: every row ≥ 2 leg is a λ = 0 free body, no rail arcs (got ${railArcs.length})`);
    const lower = legs.filter((x) => x.level === 'bottom'), upper = legs.filter((x) => x.level === 'top');
    check(lower.every((x) => x.exitKind === 'free') && upper.every((x) => x.exitKind === 'free' || x.exitKind === 'drain'),
      `geo m${m}: exitKind lower free ${lower.length}/${lower.length}, upper free/drain`);
    const minGapW = Math.min(...legs.map((x) => x.minGapMm)) / w;
    check(legs.every((x) => !x.exitFail) && minGapW >= 1 - 0.01 - 0.02, `geo m${m}: (9д) free part gap from M ≥ w(1 − ε_c) (min ${minGapW.toFixed(3)} w, no contradiction)`);
    const drains = lower.filter((x) => x.joinMode === 'climb');
    check(drains.every((x) => x.lateralMm < -0.02 * w && Math.abs(x.mergeTurnDeg) <= 20), `geo m${m}: drained lower legs have d < −0.02 w and kink at M ≤ 20° (${drains.map((x) => `${x.id} ${(x.lateralMm / w).toFixed(3)} w ${Math.abs(x.mergeTurnDeg).toFixed(1)}°`).join(', ')})`);
    const V = runValidators(A, A.path.ops.length - 1, null);
    const v22 = V.find((x) => x.id === 'V22');
    check(v22.status === 'pass', `geo m${m}: V22 (9г) pass (${v22.value.slice(0, 120)})`);
    const lim = 60 + m / 2;
    check(/limit 60\.[0-9]+ mm/.test(A.path.stopped.A?.reason || '') && Math.abs(parseFloat(A.path.stopped.A.reason.match(/limit ([0-9.]+)/)[1]) - lim) < 1e-9,
      `geo m${m}: stop K12 limit s_eq + m/2 = ${lim} (${A.path.stopped.A?.reason})`);
    const rows = Math.max(...A.path.rounds.filter((r) => r.set === 'A').map((r) => r.row));
    check(rows === 5, `geo m${m}: five rows at λ = 0 (got ${rows})`);
    // Negative: a λ = 0 lower leg that ends on a rail ('atE', the 85eeef6 s36/s52/s68/s84 pattern) — loud fail with role, λ, d.
    const bad = lower[0];
    bad.exitKind = 'atE';
    const v22n = runValidators(A, A.path.ops.length - 1, null).find((x) => x.id === 'V22');
    check(v22n.status === 'fail' && v22n.value.includes(`${bad.id}/`) && /lower λ=0/.test(v22n.value) && /d=-?[0-9]/.test(v22n.value),
      `geo m${m}: V22 fails on a λ = 0 lower leg with exitKind atE (${v22n.value.slice(0, 100)})`);
  }
  for (const lam of [0.32, 0.6]) {
    const A = computeAll(recipe, { shoulderForm: 'bow', bowLambda: lam, muWrap: lam, rowsMode: 'untilEquator' });
    const V = runValidators(A, A.path.ops.length - 1, null);
    const v22 = V.find((x) => x.id === 'V22'), v20 = V.find((x) => x.id === 'V20');
    check(v22.status === 'pass', `λ=${lam}: V22 (9г) pass — lower root (code atE) only (${v22.value.slice(0, 120)})`);
    check(v20.status === 'pass', `λ=${lam}: V20 pass — row 1 counted within λ ± 1e−4 (§6.6) (${v20.value.slice(0, 60)})`);
  }
}

// 9. Material preset (D34) + recipe scaffold (D35): provenance data + same path.ops for step/full
if (G('8l'))
{
  console.log('\n## #37 needleSides needle-plane prune: identical to the unpruned scan');
  const { needleSides } = await import('../src/path.js');
  const { resolve: resolveM } = await import('../src/marking.js');
  for (const raw of [{ shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6 }, { shoulderForm: 'geodesic' }]) {
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, m_mm: 0.5, rowsMode: 'untilEquator', ...raw });
    const R = A.base.R, N = A.marking.N, w = A.params.w_mm, m = A.params.m_mm, Q = A.base.Q;
    const laid = A.path.segs;
    // unpruned twins: one chunk with an infinite bounding sphere → every edge is scanned, as before #37
    const full = laid.map((sg) => { const c = { ...sg }; Object.defineProperty(c, '_ns', { value: [{ j0: 1, j1: sg.pts.length - 1, c: [0, 0, 0], cn: 0, r: Infinity }], enumerable: false }); return c; });
    let calls = 0, diff = 0, first = null;
    for (let k = 0; k < N; k++) for (let i = 0; i <= 40; i++) {
      const s0 = 2 + (Q - 2) * i / 40;
      for (const topSet of [null, 'A']) {
        const line = resolveM(A.marking, `L(P.N,azimuth=${k})`);
        const a = needleSides({ R, line, s: s0, m, w, laid, topSet });
        const b = needleSides({ R, line, s: s0, m, w, laid: full, topSet });
        calls++;
        if (JSON.stringify(a) !== JSON.stringify(b)) { diff++; first = first || `L${k} s=${s0.toFixed(3)} topSet=${topSet}`; }
      }
    }
    check(diff === 0 && calls === N * 41 * 2, `#37 ${raw.shoulderForm}${raw.bowLambda ? ' λ' + raw.bowLambda : ''}: pruned needleSides === unpruned on ${calls} needle lines (${laid.length} laid segments)${first ? '; first diff ' + first : ''}`);
  }
}

if (G('8m'))
{
  console.log('\n## #43 deferred validator summary: worker job === synchronous runValidators');
  const { computeAll: computeFresh } = await import('../src/layers.js');
  const { validateJob } = await import('../src/validate-job.js');
  const { getLocale, setLocale, t: tr } = await import('../src/i18n.js');
  const loc0 = getLocale();
  const cases = [['default', {}], ['λ0.32', { shoulderForm: 'bow', bowLambda: 0.32 }], ['λ0.6', { shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6 }]];
  for (const [name, raw] of cases) {
    const A = computeFresh(recipe, raw);   // what main.js builds before the first frame
    for (const stage of ['all', 'A2']) {
      const Vsync = runValidators(A, stage, ref);   // the pre-#43 synchronous call
      const job = structuredClone({ recipe, ref, raw, stage, locale: getLocale() });   // what postMessage carries
      const out = structuredClone(validateJob(job));   // and what comes back
      const a = JSON.stringify(Vsync), b = JSON.stringify(out.V);
      const s = summary(out.V);
      check(a === b, `#43 ${name} stage ${stage}: job V === sync V (${Vsync.length} validators, pass ${s.pass} / fail ${s.fail} / warn ${s.warn} / info ${s.info}; ${a.length} B JSON)`);
    }
  }
  // the exact minDist prune (V8 / K-checks): same validator output as the plain O(n·m) scan
  {
    const { setMinDistPlain } = await import('../src/validators.js');
    for (const [name, raw] of [cases[0], cases[1]]) {
      const A = computeFresh(recipe, raw);
      const pr = JSON.stringify(runValidators(A, 'all', ref));
      setMinDistPlain(true);
      const pl = JSON.stringify(runValidators(A, 'all', ref));
      setMinDistPlain(false);
      check(pr === pl, `#43 ${name} stage all: pruned minDist === plain scan (every validator value)`);
    }
  }
  // the worker module itself: the message round trip with a stub self
  {
    let got = null;
    globalThis.self = { postMessage: (m) => { got = structuredClone(m); } };
    await import('../src/validate-worker.js');
    const raw = { shoulderForm: 'bow', bowLambda: 0.32 };
    globalThis.self.onmessage({ data: structuredClone({ id: 7, recipe, ref, raw, stage: 'all', locale: 'en' }) });
    delete globalThis.self;
    setLocale('en');
    const Vsync = runValidators(computeFresh(recipe, raw), 'all', ref);
    check(got && got.id === 7 && !got.error && JSON.stringify(got.V) === JSON.stringify(Vsync) && got.computeMs >= 0 && got.validateMs >= 0,
      `#43 validate-worker.js message round trip (id, EN texts) === sync V${got && got.error ? ': ' + got.error : ''}`);
  }
  setLocale('ru'); const ru = tr('vsum.running', { stage: 'A2' }, '∅');
  setLocale('en'); const en = tr('vsum.running', { stage: 'A2' }, '∅');
  setLocale(loc0);
  check(ru === 'этап A2: проверки считаются…' && en === 'stage A2: checks are running…', `#43 running note RU «${ru}» / EN «${en}»`);
}

// 8n. #25 / #45: V6 by the classes of spec v3.2 §6.11 with (12′)–(12‴): clean classes, B = rot(A), no transition step,
// the L0 top of row n (closing of round n−1 / start stitch) against top i2 (x, s ±0.1·w; e ±0.2·w — arrival-direction
// residual), i1 vs rot(i3) and i2 vs rot(i4) ≤ 0.1·w; every branch of v6Judge on mutated metrics.
if (G('8n'))
{
  console.log('\n## #25/#45 V6 by §6.11 classes, (12‴)');
  const { v6Metrics, v6Judge, V6_TOL } = await import('../src/validators.js');
  let keep = null;
  for (const m of [0.5, 1]) for (const lam of [0, 0.32, 0.6]) {
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, m_mm: m, rowsMode: 'untilEquator', shoulderForm: lam ? 'bow' : 'geodesic', bowLambda: lam, muWrap: Math.max(0.32, lam) });
    const w = A.params.w_mm;
    const V = runValidators(A, 'all', null), v6 = V.find((v) => v.id === 'V6'), v5 = V.find((v) => v.id === 'V5');
    const Q = v6.numbers.rounds, mx = (g) => Math.max(0, ...Q.map(g));
    const QA = Q.filter((q) => q.set === 'A');
    console.log(`  λ${lam} m${m}: V6 ${v6.status}, V5 ${v5.status}; L0−L2 e (A) ${QA.filter((q) => q.L0).map((q) => fmt(q.L0.de / w, 3)).join(' → ')} w`);
    check(v6.status === 'pass' && v5.status === 'pass', `#45 λ${lam} m${m}: V6 and V5 pass (${v6.numbers.reasons.join('; ') || 'no reasons'}; V5 ${v5.status})`);
    check(mx((q) => q.clean) <= V6_TOL.cleanW * w && Q.filter((q) => q.set === 'B').every((q) => q.bVsA != null && q.bVsA <= V6_TOL.cleanW * w),
      `#25 λ${lam} m${m}: clean classes ≤ 1.4e−6·w (max ${mx((q) => q.clean).toExponential(2)} mm), B = rot(A, 2π/N) on every B round (max ${mx((q) => q.bVsA ?? 0).toExponential(2)} mm)`);
    const rowsN = QA.length;
    check(Q.every((q) => q.L0) && QA.length === A.path.rounds.filter((r) => r.set === 'A').length,
      `#45 λ${lam} m${m}: every round has its L0 top (row 1: start stitch; row n: closing of round n−1), ${rowsN} rows`);
    check(mx((q) => q.step.dev) <= V6_TOL.affW * w && mx((q) => Math.abs(q.L0.dx)) <= V6_TOL.affW * w && mx((q) => Math.abs(q.L0.ds)) <= V6_TOL.affW * w
      && mx((q) => q.shape) <= V6_TOL.affW * w && mx((q) => q.i2) <= V6_TOL.affW * w && mx((q) => Math.abs(q.L0.de)) <= V6_TOL.eW * w,
      `#45 λ${lam} m${m}: step ${fmt(mx((q) => q.step.dev) / w, 3)}w, L0−L2 x ${fmt(mx((q) => Math.abs(q.L0.dx)) / w, 3)}w, s ${fmt(mx((q) => Math.abs(q.L0.ds)) / w, 3)}w, i1−rot(i3) ${fmt(mx((q) => q.shape) / w, 3)}w, i2−rot(i4) ${fmt(mx((q) => q.i2) / w, 3)}w (≤ 0.1w); e ${fmt(mx((q) => Math.abs(q.L0.de)) / w, 3)}w (≤ 0.2w)`);
    if (lam === 0 && m === 0.5) keep = { A, w, M: v6Metrics(A, A.path.rounds) };
  }
  // #45 regression (10320e1, λ = 0.4, m 0.5, grid 96): the closing leg A10.i8 took a tangency root just after an inflection
  // joint of its rail; that tangent is not supporting — its tail cut A9.i8 at 0.40·w (V8 unexpected ×4). (13а) with
  // (9д)/(13г): the first tangency root whose tail keeps ≥ w(1 − εc) from row n−1 wins.
  {
    setLegSamples(96);
    for (const [lam, m] of [[0.4, 0.5], [0.32, 1.0]]) {
      const A4 = computeAll(recipe, { C_mm: 240, w_mm: 0.714, m_mm: m, rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: lam, muWrap: Math.max(0.32, lam) });
      const v8 = runValidators(A4, 'all', null).find((v) => v.id === 'V8');
      const unexp = v8.details.badRest.length + v8.details.naRest.length;
      const cl = A4.path.segs.filter((x) => x.type === 'leg' && x.stitch === A4.marking.N && x.row >= 2 && x.exitKind === 'root');
      const skipped = cl.filter((x) => x.exitSkipped > 0).map((x) => `${x.round}.i${x.stitch} (${x.exitSkipped})`);
      // #46: exitAlongMm runs from the entry point, which (10′) moved from the foot to the closed-form tangency; the exit
      // itself is measured from the foot (unchanged within 3 µm by #46: A10.i8 at λ 0.4 exits 29.15 mm past the foot).
      const along = cl.filter((x) => x.set === 'A').map((x) => Math.abs((x.mS ?? 0) - (x.footS ?? 0)) + x.exitAlongMm);
      const a10 = cl.find((x) => x.round === 'A10');
      console.log(`  #45 exit λ${lam} m${m}: V8 ${v8.status}, unexpected ${unexp}; closing legs with a non-supporting root skipped: ${skipped.join(', ') || 'none'}; A exit from the foot ${along.map((x) => fmt(x, 2)).join(' → ')} mm`);
      const a10Exit = a10 ? Math.abs(a10.mS - a10.footS) + a10.exitAlongMm : NaN;
      check(v8.status !== 'fail' && unexp === 0 && along.every((x) => x > 20) && (lam !== 0.4 || (Math.abs(a10Exit - 29.15) < 0.02 && (skipped.some((x) => x.startsWith('A10.i8')) || a10.mS - a10.footS > 20))),
        `#45 λ${lam} m${m}: closing legs exit at a supporting tangent (V8 ${v8.status}, unexpected ${unexp}, exit ≥ 20 mm past the foot${lam === 0.4 ? `; A10.i8 exits at the supporting root 29.15 mm (got ${fmt(a10Exit, 3)}), its non-supporting root skipped or behind the entry` : ''})`);
    }
    setLegSamples(null);
  }
  const { A, w, M } = keep;
  const J = (mut) => { const c = structuredClone(M); mut(c.rounds); return v6Judge(c, w); };
  const r = (id) => (q) => q.find((x) => x.id === id);
  const cases = [
    ['base', () => {}, 'pass'],
    ['clean class +2e−6·w', (q) => { r('A3')(q).clean = 2e-6 * w; }, 'fail'],
    ['B ≠ rot(A) +2e−6·w', (q) => { r('B3')(q).bVsA = 2e-6 * w; }, 'fail'],
    ['step 0.11w', (q) => { const s = r('A4')(q).step; s.actual = s.dev = 0.11 * w; }, 'fail'],
    ['step 0.09w', (q) => { const s = r('A4')(q).step; s.actual = s.dev = 0.09 * w; }, 'pass'],
    ['L0 x 0.11w', (q) => { r('A3')(q).L0.dx = 0.11 * w; }, 'fail'],
    ['L0 s 0.11w', (q) => { r('A3')(q).L0.ds = -0.11 * w; }, 'fail'],
    ['L0 e 0.19w (residual)', (q) => { r('A3')(q).L0.de = -0.19 * w; }, 'pass'],
    ['L0 e 0.21w', (q) => { r('A3')(q).L0.de = -0.21 * w; }, 'fail'],
    ['i1 vs rot(i3) 0.11w', (q) => { r('A2')(q).shape = 0.11 * w; }, 'fail'],
    ['i2 vs rot(i4) 0.11w', (q) => { r('A2')(q).i2 = 0.11 * w; }, 'fail'],
  ];
  const got = cases.map(([name, mut, exp]) => [name, J(mut).status, exp]);
  console.log(`  v6Judge: ${got.map(([n, g]) => `${n} → ${g}`).join('; ')}`);
  check(got.every(([, g, e]) => g === e), `#45 v6Judge: every branch (${got.filter(([, g, e]) => g !== e).map(([n, g, e]) => `${n}: ${g} ≠ ${e}`).join(', ') || 'all as expected'})`);
  const eFail = J((q) => { r('A3')(q).L0.de = -0.3 * w; }).reasons.join(' ');
  check(/arrival-direction residual/.test(eFail) && /clusters L0 \[[^\]]+\] L2 \[[^\]]+\]/.test(eFail), `#45 e > 0.2w prints both clusters (${eFail.slice(0, 160)})`);
  // Mutations of the geometry reach v6Metrics (restored after): a clean leg vertex 1e−5 mm, the i1 bottom 0.2w along the
  // line, the closing of A2 (= L0 top of A3) xOff −0.2w.
  const P = A.path, seg = new Map(P.segs.map((s) => [s.id, s])), rd = P.rounds.find((x) => x.id === 'A3'), rd2 = P.rounds.find((x) => x.id === 'A2');
  const stOf = (R0, i) => P.stitches[R0.stitchIdx.find((k) => P.stitches[k].i === i)];
  const leg5 = seg.get(stOf(rd, 5).legId), v0 = leg5.pts[40].slice();
  leg5.pts[40] = [v0[0] + 1e-5, v0[1], v0[2]];
  const g1 = v6Judge(v6Metrics(A, [rd]), w).status; leg5.pts[40] = v0;
  const st1 = stOf(rd, 1), s0 = st1.s; st1.s = s0 + 0.2 * w;
  const g2 = v6Judge(v6Metrics(A, [rd]), w).status; st1.s = s0;
  const st8 = stOf(rd2, 8), x0 = st8.xOff; st8.xOff = x0 - 0.2 * w;
  const g3 = v6Metrics(A, [rd]).rounds[0].L0; st8.xOff = x0;
  const g4 = v6Judge(v6Metrics(A, [rd]), w).status;
  check(g1 === 'fail' && g2 === 'fail' && Math.abs(Math.abs(g3.dx) - 0.2 * w) < 0.01 * w && g4 === 'pass',
    `#45 v6Metrics on mutated geometry: clean vertex 1e−5 mm → ${g1}; i1 bottom +0.2w → ${g2}; A2 closing xOff −0.2w → L0 x ${fmt(g3.dx / w, 3)}w; restored → ${g4}`);
}

// 8p. #46 (spec (10′), (9б′)): entry of a λ > 0 rail leg by construction — closed-form tangency (supporting chord),
// free (no tangency, chord X_n → E_n⁰ clear of row n−1), degenerate (chord cuts, |d_n| ≤ 0.1·w: chord to M), contradiction
// (|d_n| > 0.1·w: V22 fail, build invalid from that row; rows ≥ n out of V5/V6/V8/K16).
if (G('8p'))
{
  console.log('\n## #46 (10′)/(9б′) rail entry: tangent / free / degenerate / contradiction');
  const { EPS_C, DEG_MAX_W, setDegMaxW } = await import('../src/path.js');
  const { computeAll: computeRaw } = await import('../src/layers.js');
  setLegSamples(96);
  const cfg = (lam, m) => ({ C_mm: 240, w_mm: 0.714, m_mm: m, rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: lam, muWrap: Math.max(0.32, lam) });
  for (const m of [0.5, 1.0]) for (const lam of [0.1, 0.4, 0.6]) {
    const A = computeAll(recipe, cfg(lam, m)), w = A.params.w_mm;
    const legs = A.path.segs.filter((s) => s.type === 'leg' && s.row >= 2 && s.layMode === 'rail' && !s.lam0);
    const kinds = {};
    for (const s of legs) if (s.entryKind) kinds[s.entryKind] = (kinds[s.entryKind] || 0) + 1;
    const mism = legs.filter((s) => s.entryScan?.mismatch);
    const climbOut = legs.filter((s) => s.level === 'bottom' && s.joinMode === 'climb' && s.lateralMm > 1e-9 * w);
    const onRailBad = legs.filter((s) => s.joinMode === 'onRail' || (s.entryKind === 'onRail' && Math.abs(s.lateralMm) > 1e-9 * w));
    const tang = legs.filter((s) => s.entryKind === 'tangent');
    const nonSup = tang.filter((s) => s.entryChordGapW != null && !(s.entryChordGapW >= 1 - EPS_C));
    const free = legs.filter((s) => s.entryKind === 'free');
    const freeBad = free.filter((s) => !(s.entryMinGapW >= 1 - EPS_C) || s.exitKind !== 'free' || s.arcs?.[0]?.cls !== 'free');
    const gaps = free.map((s) => s.entryMinGapW), cg = tang.map((s) => s.entryChordGapW).filter((g) => g != null && Number.isFinite(g));
    const V22 = runValidators(A, 'all', null).find((v) => v.id === 'V22');
    console.log(`  λ${lam} m${m}: entries ${JSON.stringify(kinds)}; closed form vs scan mismatch ${mism.length}; tangent chord clearance min ${cg.length ? fmt(Math.min(...cg), 3) : '—'} w (skipped roots ${tang.reduce((a, s) => a + (s.entrySkipped || 0), 0)}); free chord clearance ${gaps.length ? `${fmt(Math.min(...gaps), 3)}–${fmt(Math.max(...gaps), 3)}` : '—'} w; V22 ${V22.status}`);
    check(mism.length === 0 && climbOut.length === 0 && onRailBad.length === 0 && nonSup.length === 0 && freeBad.length === 0 && !A.path.invalidFrom && V22.status === 'pass',
      `#46 λ${lam} m${m}: closed-form tangency = grid scan, supporting chords ≥ w(1−εc), no climb from outside, no onRail band, free legs clear with class/exit free, V22 pass (mismatch ${mism.length}, climb-out ${climbOut.length}, onRail ${onRailBad.length}, non-supporting ${nonSup.length}, free bad ${freeBad.map((s) => s.id).join(',') || 0})`);
    if (lam === 0.1) {
      // V21 by construction class (#46): free chords against the geodesic angle, rail legs against the parallel of row n−1.
      const V21 = runValidators(A, 'all', null).find((v) => v.id === 'V21');
      const fc = V21.numbers.angleRows.filter((r) => r.freeChord);
      check(V21.status === 'pass' && fc.length > 0 && fc.every((r) => Math.abs(r.sinRatio - 1) <= 0.03 && Math.abs(r.alphaRefDeg - r.alphaGeoDeg) < 1e-9),
        `#46 λ0.1 m${m}: V21 ${V21.status}; ${fc.length} free chords checked against the geodesic angle (max |sin ratio − 1| ${fmt(Math.max(0, ...fc.map((r) => Math.abs(r.sinRatio - 1))), 4)})`);
    }
    if (lam === 0.1) check(free.length > 0 && Math.min(...gaps) >= 1.0, `#46 λ0.1 m${m}: ${free.length} free lower legs (was climb), chord X_n → E_n⁰ clearance ≥ w (${fmt(Math.min(...gaps), 3)} w)`);
  }
  // Degenerate entries (m 0.5, λ 0.6): |d_n| ≤ 0.1·w (0.028·w), chord X_n → M (class splice), spliceMm = |X_n M|, turn at M ≤ bound + 0.2°.
  {
    const A = computeAll(recipe, cfg(0.6, 0.5)), w = A.params.w_mm;
    const deg = A.path.segs.filter((s) => s.type === 'leg' && s.entryKind === 'degenerate');
    const bad = deg.map((s) => degenEntryBad(s, A.base.R, w) || (s.arcs?.[0]?.cls !== 'splice' ? `${s.id} first piece ${s.arcs?.[0]?.cls}` : null)).filter(Boolean);
    const dMax = Math.max(0, ...deg.map((s) => Math.abs(s.lateralMm) / w));
    const turns = deg.map((s) => Math.abs(turnAtVtx(s.pts, s.mIdx)));
    console.log(`  degenerate λ0.6 m0.5: ${deg.map((s) => `${s.round}.i${s.stitch} d ${fmt(s.lateralMm / w, 4)} w |XM| ${fmt(s.spliceMm, 3)} turn ${fmt(Math.abs(turnAtVtx(s.pts, s.mIdx)), 3)}° ≤ ${fmt(s.mTurnBoundDeg + 0.2, 3)}°`).join('; ')}`);
    check(deg.length > 0 && bad.length === 0 && dMax <= DEG_MAX_W && dMax > 0.02,
      `#46 λ0.6 m0.5: ${deg.length} degenerate entries, max |d| ${fmt(dMax, 4)} w ≤ ${DEG_MAX_W} w, chord to M, spliceMm = |X_n M| ±1e−6 mm, turn at M ≤ bound + 0.2° (max ${fmt(Math.max(...turns), 3)}°; bad ${bad.join(',') || 0})`);
  }
  // 0.05–0.1·w band (§2 class (iii), degenerate bound 0.1·w): m 1, λ 0.2 row 3 lower legs, d = 0.0618·w, no tangency, chord cuts
  // → degenerate via M (was a contradiction with the 0.05·w bound), the build stays valid.
  {
    const A = computeAll(recipe, cfg(0.2, 1.0)), w = A.params.w_mm;
    const band = A.path.segs.filter((s) => s.type === 'leg' && !s.lam0 && s.entryKind === 'degenerate' && s.lateralMm > 0.05 * w);
    const bad = band.map((s) => degenEntryBad(s, A.base.R, w)).filter(Boolean);
    const V22 = runValidators(A, 'all', null).find((v) => v.id === 'V22');
    console.log(`  0.05–0.1·w band λ0.2 m1: ${band.map((s) => `${s.round}.i${s.stitch} d ${fmt(s.lateralMm / w, 4)} w`).join('; ')}; V22 ${V22.status}`);
    check(band.length > 0 && bad.length === 0 && !A.path.invalidFrom && V22.status === 'pass' && band.every((s) => s.lateralMm <= DEG_MAX_W * w),
      `#46 λ0.2 m1: ${band.length} degenerate entries in the 0.05–0.1·w band via M (|X_n M|, turn at M), build valid, V22 ${V22.status} (bad ${bad.join(',') || 0})`);
  }
  // Contradiction (test hook: degenerate bound 0.01·w on m 0.5, λ 0.6): the 0.028·w entries of row 6 are contradictions.
  {
    setDegMaxW(0.01);
    let A;
    try { A = computeRaw(recipe, cfg(0.6, 0.5)); } finally { setDegMaxW(null); }
    const V = Object.fromEntries(runValidators(A, 'all', null).map((v) => [v.id, v]));
    const inv = A.path.invalidFrom;
    const excl = ['V5', 'V6', 'V8', 'K16'].filter((id) => V[id].value.includes(`build invalid from row ${inv?.row}`));
    console.log(`  contradiction (hook 0.01·w): invalidFrom ${JSON.stringify(inv)}; rowsValid ${JSON.stringify(A.path.rowsValid)}; V22 ${V.V22.status}: ${V.V22.value.slice(0, 260)}`);
    check(inv && inv.row === 6 && V.V22.status === 'fail' && V.V22.value.includes('BUILD INVALID from row 6') && V.V22.value.includes('contradiction')
      && A.path.rowsValid.A === 5 && A.path.rowsValid.B === 5 && excl.length === 4,
      `#46 contradiction: V22 fail with leg, d_n and clearance; build invalid from row ${inv?.row}; rows ≥ 6 left out of ${excl.join('/')}; rowsValid A ${A.path.rowsValid?.A} B ${A.path.rowsValid?.B}`);
    const B0 = computeRaw(recipe, cfg(0.6, 0.5));
    check(!B0.path.invalidFrom, '#46 hook reset: the default build is valid again');
  }
}

// 8o. #4 diagnostics (refs #4): the top-width growth decomposition sums to the actual increment W_n − W_(n−1) within
// 1e−6 mm, for all 6 configs, both sets, both sides; the D4 entry is info-only.
if (G('8o'))
{
  console.log('\n## #4 top-width growth decomposition (D4)');
  const { widthDecomposition, u14Onset } = await import('../src/diag-width.js');
  for (const m of [0.5, 1]) for (const lam of [0, 0.32, 0.6]) {
    const A = computeAll(recipe, { C_mm: 240, w_mm: 0.714, m_mm: m, rowsMode: 'untilEquator', shoulderForm: lam ? 'bow' : 'geodesic', bowLambda: lam, muWrap: Math.max(0.32, lam) });
    const D = widthDecomposition(A), U = u14Onset(A);
    const sets = [...new Set(D.map((x) => x.set))];
    let worst = 0, n = 0;
    for (const x of D) {
      const sum = x.drift + x.halfTrace + x.clearance + x.merge;
      worst = Math.max(worst, Math.abs(x.dW - sum), Math.abs(x.W - x.Wp - x.dW),
        ...[x.E, x.X].map((t) => Math.abs(t.delta - (t.drift + t.halfTrace + t.clearance + t.merge))));
      n++;
    }
    const V = runValidators(A, 'all', null), d4 = V.find((v) => v.id === 'D4');
    console.log(`  m${m} λ${lam}: ${n} rows (${sets.join('/')}), max |ΔW − Σ terms| ${worst.toExponential(1)} mm; U14 n₀ ${U.map((u) => `${u.set} obs ${u.observed.any ?? '—'} causal ${u.causal?.n0 ?? '—'}`).join(', ')}`);
    check(n > 0 && sets.length === 2 && worst <= 1e-6 && d4 && d4.status === 'info',
      `#4 D4 m${m} λ${lam}: decomposition sums to W_n − W_(n−1) within 1e−6 mm (both sets, ${n} rows; worst ${worst.toExponential(1)} mm), info-only`);
  }
}

// 8q. Cleanup batch: #30 backward rail entry is an explicit contradiction (railLeg, reached by a reversed setup); #26 V16
// fan onset is causal (A/L0, B/L7 at λ 0.6; acausal mutation moves A/L0 earlier); #27 V20 scores every exterior splice
// vertex beyond the pierce neighbourhood (a mutated 1.7·w span fails, a bend within w of the hole is the pierce window).
if (G('8q'))
{
  console.log('\n## #30 / #26 / #27 cleanup');
  const { railLeg } = await import('../src/path.js');
  const { setV16AcausalForTest } = await import('../src/validators.js');
  setLegSamples(96);
  const cfg = (lam, m) => ({ C_mm: 240, w_mm: 0.714, m_mm: m, rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: lam, muWrap: Math.max(0.32, lam) });
  // #30: towardE = −1 never occurs in a build (0 of 2076 entries, grids 96/384, 7λ×2m, ×1.25, S16); the reversed case is an
  // explicit contradiction (V22 fail), not a collapsed scan window. Reached by calling railLeg with E_n⁰ behind the foot.
  {
    const A = computeAll(recipe, cfg(0.32, 1.0)), w = A.params.w_mm, R = A.base.R;
    const rows = [];
    for (const s of A.path.segs.filter((q) => q.type === 'leg' && q.row >= 2 && q.layMode === 'rail' && q.level === 'bottom' && q.entryKind === 'tangent')) {
      const prevR = A.path.rounds.find((r) => r.set === s.set && r.row === s.row - 1);
      const prev = A.path.segs.find((x) => x.round === prevR?.id && x.type === 'leg' && x.stitch === s.stitch);
      if (!prev) continue;
      const fwd = railLeg(R, s.pts[0], s.pts[s.pts.length - 1], prev, w, s.level);
      const p0 = unit(prev.pts[0]), pB = unit(prev.pts[Math.min(10, prev.pts.length - 1)]);
      const behind = unit(sub(mul(p0, 2), pB));   // ~10 output links behind the start of row n−1, i.e. against the travel
      const back = railLeg(R, s.pts[0], behind, prev, w, s.level);
      rows.push({ id: s.id, fwd: fwd.entryKind === s.entryKind && !fwd.entryBackward && Math.abs(fwd.spliceMm - s.spliceMm) < 1e-9 * w,
        back: back.entryKind === 'contradiction' && back.entryFail && back.entryBackward && back.joinMode === 'contradiction' });
    }
    const all = A.path.segs.filter((q) => q.type === 'leg' && q.entryBackward).length;
    console.log(`  #30 λ0.32 m1: ${rows.length} bottom tangent legs re-laid forward (same entry) and reversed (E⁰ ~10 links behind the start of row n−1): back → contradiction ${rows.filter((r) => r.back).length}/${rows.length}; entryBackward in the build ${all}`);
    check(rows.length > 0 && rows.every((r) => r.fwd && r.back) && all === 0,
      `#30 railLeg: E⁰ behind the foot → explicit contradiction (entryBackward, V22), forward call reproduces the build; 0 backward entries in the build`);
    const leg = A.path.segs.find((q) => q.id === rows[0].id);
    Object.assign(leg, { entryKind: 'contradiction', joinMode: 'contradiction', entryFail: true, entryBackward: true });
    const v22 = runValidators(A, 'all', null).find((v) => v.id === 'V22');
    check(v22.status === 'fail' && /travel reversed, #30/.test(v22.value), `#30 V22 fails loudly on a backward entry (${String(v22.value).match(/[^;]*#30[^;]*/)?.[0] ?? v22.status})`);
  }
  // #26: V16 fan onset counts only threads laid before the current top pickup (since f48c05b, #38).
  {
    const A = computeAll(recipe, cfg(0.6, 1.0));
    const g = runValidators(A, 'all', null).find((v) => v.id === 'V16').numbers.geoFirst;
    let gA;
    try { setV16AcausalForTest(true); gA = runValidators(A, 'all', null).find((v) => v.id === 'V16').numbers.geoFirst; } finally { setV16AcausalForTest(false); }
    console.log(`  #26 λ0.6 m1 fan onset causal A/L0 ${g['A:0']}, B/L7 ${g['B:7']}; acausal (mutation) A/L0 ${gA['A:0']}, B/L7 ${gA['B:7']}`);
    check(g['A:0'] === 10 && g['B:7'] === 10 && gA['A:0'] < g['A:0'],
      `#26 V16 causal fan onset at λ0.6: A/L0 row ${g['A:0']}, B/L7 row ${g['B:7']}; counting future threads moves A/L0 to ${gA['A:0']} (caught)`);
  }
  // #27: V20 κ_g on the exterior splice X_n → T excludes only ≤ w at the hole and the join vertex T.
  {
    const mk = (pick) => {
      const A = computeAll(recipe, cfg(0.32, 1.0)), w = A.params.w_mm, R = A.base.R;
      const leg = A.path.segs.find((s) => s.type === 'leg' && s.layMode === 'rail' && s.joinMode === 'tangent' && s.spliceMm >= 2 * w && s.mIdx >= 4);
      const cum = [0]; for (let i = 1; i < leg.pts.length; i++) cum.push(cum[i - 1] + R * angle(leg.pts[i - 1], leg.pts[i]));
      const j = pick(cum, w, leg.mIdx);
      const n = unit(cross(leg.pts[0], leg.pts[leg.mIdx]));
      leg.pts[j] = mul(unit(add(unit(leg.pts[j]), mul(n, 0.02 / R))), R);   // 0.02 mm lateral kink at vertex j
      return { A, leg, j, cumJ: cum[j] / w, cum, w };
    };
    const short = mk((cum, w, iT) => { for (let i = 1; i + 1 < iT; i++) if (cum[i] > w && cum[i + 1] < 2.5 * w) return i; return -1; });
    Object.assign(short.leg, { mIdx: short.j + 1, spliceMm: short.cum[short.j + 1] });   // a splice of < 2.5·w ending right after the kink
    const vS = runValidators(short.A, 'all', null).find((v) => v.id === 'V20');
    const clean = runValidators(computeAll(recipe, cfg(0.32, 1.0)), 'all', null).find((v) => v.id === 'V20');
    console.log(`  #27 V20: clean λ/μ ${fmt(clean.numbers.ratio, 6)}; kink at ${fmt(short.cumJ, 3)} w on a ${fmt(short.leg.spliceMm / short.w, 3)} w splice → ${vS.status} λ/μ ${fmt(vS.numbers.ratio, 2)}`);
    check(short.j > 0 && short.leg.spliceMm < 2.5 * short.w && vS.status === 'fail' && vS.numbers.ratio >= 1.2,
      `#27 V20 fails on a mutated short exterior splice (${fmt(short.leg.spliceMm / short.w, 2)} w < 2.5 w, no blind window)`);
    check(clean.status === 'pass' && Math.abs(clean.numbers.lambdaMax - 0.32) < 1e-4,
      `#27 clean build: V20 pass with the minimal window, λ_max ${fmt(clean.numbers.lambdaMax, 6)} (unchanged: the splice is a great-circle arc)`);
  }
  // #48: V3 compares a bow row 1 with the independent bow reference (calc_reference.py: small-circle arcs through calc.py's
  // holes, closed form); class (i) tolerance 1e−6 mm. A leg 2e−6 mm longer fails; a λ outside the reference set is printed.
  {
    const rows = [];
    for (const m of [0.5, 1.0]) for (const lam of [0.1, 0.32, 0.6]) {
      const A = computeAll(recipe, { ...cfg(lam, m), rowsMode: 'count', rowsCount: 1 });
      const v = runValidators(A, 'all', ref).find((x) => x.id === 'V3');
      rows.push({ m, lam, ok: v.status === 'pass' && v.numbers.lenCompared && v.numbers.bowRef, d: Math.abs(v.numbers.rowLen - v.numbers.refLen) });
    }
    const Am = computeAll(recipe, { ...cfg(0.32, 1.0), rowsMode: 'count', rowsCount: 1 });
    const leg = Am.path.segs.find((q) => q.round === 'A1' && q.type === 'leg' && q.stitch === 3);
    leg.length += 2e-6;
    const vm = runValidators(Am, 'all', ref).find((x) => x.id === 'V3');
    const Ao = computeAll(recipe, { ...cfg(0.25, 1.0), rowsMode: 'count', rowsCount: 1 });
    const vo = runValidators(Ao, 'all', ref).find((x) => x.id === 'V3');
    console.log(`  #48 V3 bow: ${rows.map((r) => `m${r.m} λ${r.lam} Δ ${r.d.toExponential(1)} mm`).join('; ')}; +2e−6 mm on A1.i3 → ${vm.status}; λ0.25 → compared ${vo.numbers.lenCompared} (${vo.status})`);
    check(rows.every((r) => r.ok && r.d < 1e-6), `#48 V3 bow row-1 length = calc_reference small-circle arms within 1e−6 mm (λ 0.1/0.32/0.6 × m 0.5/1; max Δ ${Math.max(...rows.map((r) => r.d)).toExponential(1)} mm)`);
    check(vm.status === 'fail' && vo.numbers.lenCompared === false && vo.status === 'pass',
      `#48 V3 bow: a 2e−6 mm longer leg fails; a λ without a reference (0.25) prints the length (E/X still compared)`);
  }
  // V6 at λ 0.1: the free exit (E_n outside, no tangency) is the maximum of co-directionality, refined as the root of the
  // central difference of |sin ψ| (the golden section on cos ψ scattered 4e−5 mm between rotation-equivalent stitches).
  for (const m of [0.5, 1.0]) {
    const A = computeAll(recipe, cfg(0.1, m)), w = A.params.w_mm;
    const by = {};
    for (const s of A.path.segs.filter((q) => q.type === 'leg' && q.exitKind === 'free' && q.entryKind !== 'free' && !q.lam0)) (by[`${s.round}:${s.level}`] ||= []).push(s.exitAlongMm);
    let spread = 0;
    for (const v of Object.values(by)) spread = Math.max(spread, Math.max(...v) - Math.min(...v));
    const v6 = runValidators(A, 'all', null).find((v) => v.id === 'V6');
    console.log(`  V6 λ0.1 m${m}: ${Object.keys(by).length} rounds with free exits, max spread of the exit point ${spread.toExponential(1)} mm; V6 ${v6.status}`);
    check(v6.status === 'pass' && spread <= 1e-6 * w && Object.keys(by).length > 0,
      `V6 λ0.1 m${m}: pass (clean class and B = rot(A) ≤ 1.4e−6·w); free-exit point equal on rotation-equivalent stitches within 1e−6·w (${spread.toExponential(1)} mm)`);
  }
  // #23: rail-parallel only for same-set line neighbours (Δrow 1, same stitch and line, later on a rail) at d ∈ [w(1−εc), w];
  // a leg × later FOREIGN top channel inside the push-aside zone at the channel's hole (|s − s_hole| ≤ w/sin ψ + w/2) is
  // class separate (U14 set collision, warn, printed, §5.3 (2)(3)); outside the zone it is unexpected (fail).
  {
    const { railParallelPair, separateZoneMm } = await import('../src/validators.js');
    const w = 0.714, L = (o) => ({ type: 'leg', set: 'A', row: 3, stitch: 2, line: 2, layMode: 'rail', ...o });
    const lo = L({ row: 2 }), hi = L({});
    check(railParallelPair(lo, hi, 0.995 * w, w) && !railParallelPair(lo, L({ set: 'B' }), w, w) && !railParallelPair(lo, L({ row: 4 }), w, w)
      && !railParallelPair(lo, L({ stitch: 3 }), w, w) && !railParallelPair(lo, L({ line: 3 }), w, w) && !railParallelPair(lo, L({ layMode: 'free' }), w, w)
      && !railParallelPair(lo, hi, 0.6 * w, w) && !railParallelPair(lo, { ...hi, type: 'pickup' }, w, w),
      '#23 railParallelPair: same-set line neighbour in the band only (foreign, Δrow 2, other stitch/line, not on rail, d = 0.6·w, pickup → false)');
    check(Math.abs(separateZoneMm(1, w) - 1.5 * w) < 1e-12 && Math.abs(separateZoneMm(0.5, w) - 2.5 * w) < 1e-12, '#23 push-aside zone half-length w/sin ψ + w/2');
    for (const [lam, m, nSep] of [[0.32, 1.0, 20], [0.4, 0.5, 10], [0, 1.0, 2]]) {
      const A = computeAll(recipe, lam ? cfg(lam, m) : { ...cfg(0.32, m), shoulderForm: 'geodesic', bowLambda: undefined });
      const v8 = runValidators(A, 'all', null).find((v) => v.id === 'V8'), d = v8.details, sep = d.separate;
      const by = new Map(A.path.segs.map((x) => [x.id, x]));
      const railBad = d.found.filter((r) => /rail parallel/.test(r.why) && !railParallelPair(by.get(r.a), by.get(r.b), r.d, A.params.w_mm)).length;
      const zoneOk = sep.every((x) => x.dS <= x.zone && by.get(x.leg).set !== by.get(x.channel).set && by.get(x.channel).type === 'pickup');
      const maxH = Math.max(...sep.map((x) => x.dHoleMm)), maxR = Math.max(...sep.map((x) => x.dS / x.zone));
      console.log(`  #23 λ${lam} m${m}: V8 ${v8.status}, separate ${sep.length} (in span ${sep.filter((x) => x.inSpan).length}), max ${maxH.toFixed(3)} mm from the hole, max |s − s_hole|/zone ${maxR.toFixed(2)}, d ${Math.min(...sep.map((x) => x.dW)).toFixed(2)}…${Math.max(...sep.map((x) => x.dW)).toFixed(2)} w`);
      check(v8.status === 'warn' && d.badRest.length + d.naRest.length === 0 && sep.length === nSep && zoneOk && railBad === 0 && /separate \(U14 set collision/.test(v8.value),
        `#23 λ${lam} m${m}: V8 warn, 0 unexpected, ${sep.length} separate (expected ${nSep}) all foreign channel × leg inside the zone, printed; 0 rail-parallel labels outside the neighbour band`);
    }
  }
  // (10′) chord-only free entry (ec5be64 acceptance, stability matrix): a free / contradiction lower entry is the chord X_n → E_n⁰
  // and nothing else. Before, the rail from E's foot plus the tail back to E were appended (a 180° hairpin at E on closing top
  // legs at λ 0.1 / 0.2); at λ 0.2 m 1 (sTop 5 mm, pitch 2) under C×(1+1e−9) the return point equalled the previous vertex →
  // zero tangent in the tube mesh → NaN → V14 pass → fail. Statuses must be identical under that perturbation.
  {
    const raw0 = { C_mm: 240, w_mm: 0.714, m_mm: 1, startRun_mm: 35, sTop_mm: 5, pitch_mm: 2, topMode: 'mm', rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: 0.2, muWrap: 0.32 };
    const st = (raw) => { const A = computeAll(recipe, raw); return [A, Object.fromEntries(runValidators(A, A.path.ops.length - 1, null).map((v) => [v.id, v.status]))]; };
    const [A0, s0] = st(raw0), [A1, s1] = st({ ...raw0, C_mm: 240 * (1 + 1e-9) });
    const flips = Object.keys(s0).filter((k) => s0[k] !== s1[k]);
    const v14 = runValidators(A1, A1.path.ops.length - 1, null).find((v) => v.id === 'V14');
    check(flips.length === 0 && s0.V14 === 'pass' && Number.isFinite(v14.numbers.meshMax),
      `λ0.2 m1 (sTop 5, pitch 2) C×(1+1e−9): 0 validator flips (${flips.join(', ') || 'none'}); V14 ${s0.V14}/${s1.V14}, mesh finite (${v14.numbers.meshMax})`);
    for (const [lam, m] of [[0.1, 1.0], [0.2, 1.0], [0.2, 0.5]]) {
      const A = computeAll(recipe, cfg(lam, m));
      const free = A.path.segs.filter((q) => q.type === 'leg' && (q.entryKind === 'free' || q.entryKind === 'contradiction'));
      const turn = A.path.segs.filter((q) => q.type === 'leg').reduce((x, q) => Math.max(x, q.rawTurnMaxDeg ?? 0), 0);
      const R = A.base.R;
      const chord = free.every((q) => { const E = q.pts[q.pts.length - 1], X = q.pts[0]; return Math.abs(q.length - R * angle(X, E)) <= 1e-9 * R; });
      check(free.length > 0 && chord && turn <= 20, `λ${lam} m${m}: ${free.length} free-entry legs are the chord X→E only (length = R·∠XE), max raw turn ${turn.toFixed(1)}° ≤ 20° (no hairpin)`);
    }
  }
}

// 8r. #50 stage A (topRule braid, flag; default fan): fan identity, T1/K17, V16 pushed aside, V22 top end off, n₀, braid joint
// (tangency vs great circle ∩ rail with ≤ 20° turn, loud V22 fail above), crossover-first labelling within ℓ_braid,max.
if (G('8r'))
{
  console.log('\n## #50 stage A (braid)');
  setLegSamples(96);
  const cfg = (lam, m, x = {}) => ({ C_mm: 240, w_mm: 0.714, m_mm: m, rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: lam, muWrap: Math.max(0.32, lam), ...x });
  const st = (A) => Object.fromEntries(runValidators(A, 'all', null).map((v) => [v.id, v]));
  const w = 0.714;
  // fan identity: explicit topRule=fan is the default, bit for bit, with no braid records
  {
    const A0 = computeAll(recipe, cfg(0.32, 1.0)), A1 = computeAll(recipe, cfg(0.32, 1.0, { topRule: 'fan' }));
    const legs = (A) => A.path.segs.filter((q) => q.type === 'leg');
    const same = legs(A0).length === legs(A1).length && legs(A0).every((q, i) => q.pts.length === legs(A1)[i].pts.length && q.pts.every((p, k) => p.every((c, j) => c === legs(A1)[i].pts[k][j])));
    const s0 = st(A0), s1 = st(A1), flips = Object.keys(s0).filter((k) => s0[k].status !== s1[k]?.status);
    check(same && flips.length === 0 && !('K17' in s1) && A1.path.stitches.every((x) => !x.sides.braid),
      `fan: topRule=fan ≡ default bit for bit (legs, statuses, no K17, no braid records); flips ${flips.join(',') || 'none'}`);
  }
  const B = computeAll(recipe, cfg(0.32, 1.0, { topRule: 'braid' })), VB = st(B), F = st(computeAll(recipe, cfg(0.32, 1.0)));
  // T1 / K17 / T4
  {
    const tops = B.path.stitches.filter((x) => x.level === 'top' && (x.row >= 2 || x.closing));
    const ok = tops.every((x) => x.sides.braid && Math.abs(x.sides.braid.h - x.sides.braid.hPrev - 0.5 * w) < 1e-12 && Math.abs(x.s - x.sides.braid.prev.s - w) < 1e-9 && x.sides.braid.temporary);
    const fromStart = tops.filter((x) => x.sides.braid?.prev.start).length;
    const k = VB.K17.numbers;
    console.log(`  T1: ${tops.length} braid top stitches, ${fromStart} placed from the start stitch (L0); K17 max |Δh| ${k.dhMax.toFixed(3)} mm, T4 dev ${k.t4Dev.toExponential(1)} mm`);
    check(ok && fromStart === 2 && k.over === 0 && Math.abs(k.dhMax - 0.5 * w) < 1e-12 && k.t4Dev < 1e-9 && VB.K17.status === 'info' && VB.V13.status === 'pass',
      'T1: h_n = h_{n−1} + k_top·w, s_T(n) = s_T(n−1) + w, L0 from the start stitch; K17 |Δh| = w/2, 0 over; T4 2h_n = (m+w) + 2k_top·w(n−1); marked temporary');
  }
  // V16 pushed aside, V22 top end off, n₀
  {
    const n0 = (V) => (V.D4.numbers.u14 || []).map((u) => u.observed?.any ?? null);
    console.log(`  V16 braid: own pushed aside ${VB.V16.numbers.sepOwn}, fail own ${VB.V16.numbers.failOwn}; n₀ fan ${n0(F).join('/')} → braid ${n0(VB).join('/')}`);
    check(VB.V16.status !== 'fail' && VB.V16.numbers.failOwn === 0 && VB.V16.numbers.sepOwn > 0 && /pushed aside/.test(VB.V16.value) && F.V16.numbers.sepOwn === 0,
      'V16 braid: own-set pierce = «thread pushed aside» (separate, diagnostic), not a fail; fan unchanged');
    check(VB.V22.status === 'pass' && /top end not checked/.test(VB.V22.value) && !/top end not checked/.test(F.V22.value), 'V22 braid: top end not checked (printed); fan unchanged');
    check(n0(VB).every((x) => x === 9) && n0(F).every((x) => x != null && x < 9), `n₀ from the braid: 9/9 at λ0.32 m1 (fan ${n0(F).join('/')})`);
  }
  // crossover first, within ℓ_braid,max
  {
    const cr = VB.V8.details.crossover, by = new Map(B.path.segs.map((q) => [q.id, q]));
    const okPairs = cr.every((c) => { const a = by.get(c.a), b = by.get(c.b); return a.set === b.set && Math.abs(a.row - b.row) === 1 && c.belowTopMm <= 20 * w; });
    const labelled = VB.V8.details.found.filter((r) => /^crossover/.test(r.why)).length;
    const B1 = computeAll(recipe, cfg(0.32, 1.0, { topRule: 'braid', lBraidMaxW: 1 })), cr1 = st(B1).V8.details.crossover;
    console.log(`  crossover: ${cr.length} (max ${Math.max(...cr.map((c) => c.belowTopMm)).toFixed(2)} mm below s_T(n)); ℓ_braid,max = 1·w → ${cr1.length}`);
    check(cr.length > 0 && labelled > 0 && okPairs && F.V8.details.crossover.length === 0 && cr1.length < cr.length && cr1.every((c) => c.belowTopMm <= w),
      'V8 braid: crossover checked first (consecutive own rows, ≤ s_T(n) + ℓ_braid,max); ℓ_braid,max = w shrinks it; fan none');
  }
  // braid joint: interior holes (m1 λ0.52): great circle ∩ rail (no tangency exists), turn ≤ 20°, V22 pass; m0.5 λ0.6: > 20° → loud V22 fail
  {
    const J = computeAll(recipe, cfg(0.52, 1.0, { topRule: 'braid' })), VJ = st(J);
    const ent = J.path.segs.filter((q) => q.entryKind === 'braidCross'), ex = J.path.segs.filter((q) => q.exitKind === 'braidCross');
    const noTan = ent.every((q) => (q.entryRoots || []).every((r) => !r.ok));
    const turns = [...ent.map((q) => q.braidJoinTurnDeg), ...ex.map((q) => q.braidExitTurnDeg)];
    const noClimb = J.path.segs.every((q) => q.joinMode !== 'climb' && q.exitKind !== 'drain');
    console.log(`  braid joints m1 λ0.52: entries ${ent.length}, top-hole ${ex.length}, max turn ${Math.max(...turns).toFixed(2)}°; tangency roots accepted 0`);
    check(ent.length > 0 && ex.length > 0 && noTan && noClimb && turns.every((t) => t <= 20) && VJ.V22.status === 'pass' && /braid joints/.test(VJ.V22.value),
      'braid joint (decision 1b): no climb / drain; no tangency → great circle ∩ rail, turn ≤ 20° printed; V22 pass');
    // Fable (#50, 26.09): ℓ_m is the minimum; M moves along the rail until the full angle ≤ 20° (m0.5 λ0.6: the 18 joints
    // that exceeded it at ℓ_m by the rail's turn move a little and pass); fail only if unreachable before the rail ends.
    const K = computeAll(recipe, cfg(0.6, 0.5, { topRule: 'braid' })), VK = st(K);
    const moved = K.path.segs.filter((q) => (q.braidExitShiftMm ?? 0) > 0 || (q.braidJoinShiftMm ?? 0) > 0);
    const allJ = K.path.segs.flatMap((q) => [q.braidJoinTurnDeg, q.braidExitTurnDeg]).filter((x) => x != null);
    const shiftMax = Math.max(...moved.map((q) => Math.max(q.braidExitShiftMm ?? 0, q.braidJoinShiftMm ?? 0)));
    console.log(`  m0.5 λ0.6 braid: ${moved.length} joints moved from ℓ_m (max ${shiftMax.toFixed(3)} mm), max turn ${Math.max(...allJ).toFixed(4)}°`);
    check(moved.length === 18 && allJ.every((t) => t <= 20 + 1e-9) && moved.every((q) => !q.exitFail && !q.entryFail) && VK.V22.status === 'pass' && VK.V8.status !== 'fail'
      && /M moved 18/.test(VK.V22.value), 'braid joint: M moves forward from ℓ_m until ≤ 20° (m0.5 λ0.6: 18 joints, V22 pass, no rail contradictions)');
    const { braidJointMove } = await import('../src/path.js');
    const lin = braidJointMove((u) => 25 - u, 0, 10, 0.714), never = braidJointMove(() => 25, 0, 3, 0.714), at0 = braidJointMove(() => 12, 0, 3, 0.714);
    check(lin.ok && Math.abs(lin.s - 5) < 1e-6 && lin.shift === lin.s && !never.ok && never.s === 3 && at0.ok && at0.shift === 0,
      'braidJointMove: first point with angle ≤ 20° (bisected), 0 shift if ℓ_m already fits, not ok (fail) when unreachable before the rail end');
    const Fk = st(computeAll(recipe, cfg(0.6, 0.5)));
    check(Fk.V22.status === 'pass', 'fan at m0.5 λ0.6 unchanged (drain, V22 pass)');
  }
}

// 8s. #3 row order (recipe intent): alternate (default, classic A1 B1 A2 …) vs blocks of blockSize per set (Suess 5A/5B, kousa).
// Holes from occupancy, no fixed width: leg geometry must not depend on the order (A and B on different lines); only
// which thread lies on top changes. Both orders pass the same checks in fan and braid; A and B never meet at the lower tips.
if (G('8s'))
{
  console.log('\n## #3 row order alternate / blocks');
  const { roundSequence } = await import('../src/path.js');
  setLegSamples(96);
  const cfg = (x = {}) => ({ C_mm: 240, w_mm: 0.714, m_mm: 1.0, rowsMode: 'untilEquator', shoulderForm: 'bow', bowLambda: 0.32, muWrap: 0.32, ...x });
  const P0 = { ...defaults(), rowsMode: 'count', rowsCount: 7 };
  const seq = (x) => roundSequence(recipe, { ...P0, ...x }).letters.join('');
  check(defaults().order === 'alternate' && seq({}) === 'AB'.repeat(7) && seq({ order: 'blocks', blockSize: 5 }) === 'AAAAABBBBBAABB' && seq({ order: 'blocks', blockSize: 3 }) === 'AAABBBAAABBBAB',
    'row order: default alternate (A1 B1 A2 …); blocks k×A, k×B, … (k = blockSize, last block short)');
  for (const tr of ['fan', 'braid']) {
    const Aa = computeAll(recipe, cfg({ topRule: tr })), Ab = computeAll(recipe, cfg({ topRule: tr, order: 'blocks', blockSize: 5 }));
    const ids = Ab.path.rounds.map((r) => r.id).join(',');
    // per round, segments in laying order (legs + pickups; several pickups share round/line/i, so no key map)
    const perRound = (A) => { const m = new Map(); for (const q of A.path.segs) if (q.type === 'leg' || q.type === 'pickup') (m.get(q.round) || m.set(q.round, []).get(q.round)).push(q); return m; };
    const ra = perRound(Aa), rb = perRound(Ab);
    let n = 0, dmax = 0, miss = 0;
    for (const [rid, qa] of ra) for (let t = 0; t < qa.length; t++) {
      const q = qa[t], r = rb.get(rid)?.[t];
      if (!r || r.type !== q.type || r.line !== q.line || r.pts.length !== q.pts.length) { miss++; continue; } n++;
      for (let k = 0; k < q.pts.length; k++) dmax = Math.max(dmax, Math.hypot(...q.pts[k].map((c, j) => c - r.pts[k][j])));
    }
    const holes = (A) => A.path.stitches.map((x) => `${x.round}.${x.i}:${x.eOff.toFixed(9)}/${x.xOff.toFixed(9)}/${x.s.toFixed(9)}`).sort().join(';');
    check(ids.startsWith('A1,A2,A3,A4,A5,B1,B2,B3,B4,B5,A6') && miss === 0 && dmax < 1e-9 && holes(Aa) === holes(Ab),
      `${tr}: blocks changes only the order (${Ab.path.rounds.length} rounds): holes from occupancy and ${n} legs/pickups identical (max ${dmax.toExponential(1)} mm)`);
    const sa = validatorStatuses(Aa), sb = validatorStatuses(Ab), flips = Object.keys(sa).filter((k) => sa[k] !== sb[k]);
    check(flips.length === 0 && !Object.values(sb).includes('fail'), `${tr}: both orders pass the same checks (0 fail, 0 status flips${flips.length ? ': ' + flips.join(',') : ''})`);
    // who is above whom: at a crossing of A × B the later-laid thread is over (at the pole: the later row on top)
    const idx = (A) => new Map(A.path.segs.map((q, i) => [q.id, i]));
    for (const [name, A] of [['alternate', Aa], ['blocks', Ab]]) {
      const ix = idx(A), set = new Map(A.path.segs.map((q) => [q.id, q.set]));
      const ab = A.path.crossings.filter((c) => c.over && set.get(c.a) !== set.get(c.b));
      const laterOver = ab.filter((c) => c.over === (ix.get(c.a) > ix.get(c.b) ? c.a : c.b)).length;
      const bOver = ab.filter((c) => set.get(c.over) === 'B').length;
      console.log(`  ${tr} ${name}: A×B crossings ${ab.length}, later thread over ${laterOver}, B over ${bOver} (${(100 * bOver / Math.max(1, ab.length)).toFixed(0)}%)`);
      check(ab.length > 0 && laterOver === ab.length, `${tr} ${name}: at every A×B crossing the later-laid thread is on top`);
    }
    // lower tips: A and B on different lines, no contact
    const bot = (A, s) => A.path.stitches.filter((x) => x.level === 'bottom' && x.set === s);
    const dmin = Math.min(...bot(Ab, 'A').flatMap((a) => bot(Ab, 'B').map((b) => Math.hypot(...a.E.map((c, j) => c - b.E[j])))));
    const smax = Math.max(...Ab.path.stitches.map((x) => x.s)), by = new Map(Ab.path.segs.map((q) => [q.id, q]));
    const tipAB = Ab.path.crossings.filter((c) => by.get(c.a)?.set !== by.get(c.b)?.set && Number.isFinite(c.s) && c.s > 0.75 * smax).length;
    check(dmin > 10 && tipAB === 0 && new Set(bot(Ab, 'A').map((x) => x.line)).size > 0 && [...new Set(bot(Ab, 'A').map((x) => x.line))].every((l) => !bot(Ab, 'B').some((b) => b.line === l)),
      `${tr}: lower tips — A and B on different lines, nearest A/B tip holes ${dmin.toFixed(1)} mm apart, 0 A×B crossings in the tip zone`);
  }
}


// 8t. #52 commit 1: marking as data — S_N graph (counts, Euler, valences, face angles, incidences; the generator throws on
// a mismatch), address resolver (azimuth rule: counterclockwise from outside; zero toward φ₀ at the poles, toward P.N
// at equator points) against point() / perpPt() to 1e-12·R. The layers above the marking are unchanged.
if (G('8t'))
{
  console.log('\n## #52 marking graph and addresses');
  const { generateSN, resolve, offsetAt, graphStats } = await import('../src/marking.js');
  const { point, perpPt } = await import('../src/geom.js');
  const R0 = 38.197186342054884;
  let okAll = true; const bad = [];
  for (let N = 4; N <= 32; N += 2) {
    const g = generateSN(N, R0), st = graphStats(g);
    const val = Object.values(g.points).map((p) => p.valence);
    const faceOk = Object.values(g.faces).every((f) => { const d = f.angles.map((a) => a * 180 / Math.PI).sort((a, b) => a - b); return Math.abs(d[0] - 360 / N) < 1e-9 && Math.abs(d[1] - 90) < 1e-9 && Math.abs(d[2] - 90) < 1e-9; });
    const inc = Object.values(g.points).every((p) => p.lines.every((l) => Math.abs(p.p[0] * g.lines[l].n[0] + p.p[1] * g.lines[l].n[1] + p.p[2] * g.lines[l].n[2]) <= 1e-9));
    const arcs = Object.values(g.edges).filter((e) => e.carrier !== 'L.eq').every((e) => Math.abs(e.length - R0 * Math.PI / 2) < 1e-9 * R0);
    const ok = st.V === N + 2 && st.E === 3 * N && st.F === 2 * N && st.V - st.E + st.F === 2 && st.lines === N / 2 + 1
      && (N === 4 ? val.every((v) => v === 4) : val.filter((v) => v === N).length === 2 && val.filter((v) => v === 4).length === N) && faceOk && inc && arcs
      && Object.values(g.edges).every((e) => e.faces.length === 2);
    if (!ok) { okAll = false; bad.push(N); }
  }
  check(okAll, `S_N, N = 4…32 even: V = N+2, E = 3N, F = 2N, Euler 2, N/2+1 lines, poles v = N, equator v = 4, faces 90°/90°/360°/N, incidences ≤ 1e-9, pole–equator arcs = Q${bad.length ? ' — bad N ' + bad.join(',') : ''}`);
  const throwsOn = (f) => { try { f(); return false; } catch (e) { return /marking/.test(String(e.message)); } };
  check(throwsOn(() => generateSN(5, R0)) && throwsOn(() => generateSN(2, R0)) && throwsOn(() => generateSN(34, R0)), 'S_N generator: odd / out-of-range N fails the build (throws)');
  const A = computeAll(recipe, {}), mk = A.marking, R = mk.R;
  let dp = 0, doff = 0, daz = 0;
  for (let k = 0; k < mk.N; k++) {
    daz = Math.max(daz, Math.abs(resolve(mk, `L(P.N, azimuth=${k})`).az - mk.phis[k]));
    for (const s of [0, 0.9, 5, 17.3, 40, mk.Q]) {
      const q = resolve(mk, `on(L(P.N,${k}), ${s}, from=P.N)`).xyz, r = point(R, s, mk.phis[k]);
      dp = Math.max(dp, ...q.map((c, j) => Math.abs(c - r[j])));
      if (s > 0) for (const d of [-(mk.m + 0.714) / 2, (mk.m + 0.714) / 2]) {
        const o = offsetAt(mk, resolve(mk, `offset(L(P.N,azimuth=${k}), ${d})`), s), r2 = perpPt(R, s, mk.phis[k], d);
        doff = Math.max(doff, ...o.map((c, j) => Math.abs(c - r2[j])));
      }
    }
  }
  console.log(`  S8 resolver: on(L(P.N,k), s) vs point(R, s, φ_k) max ${(dp / R).toExponential(1)}·R; offset vs perpPt ${(doff / R).toExponential(1)}·R; azimuth vs phis ${daz.toExponential(1)}`);
  check(mk.generator === 'S_N' && mk.stats.V === 10 && dp <= 1e-12 * R && doff <= 1e-12 * R && daz <= 1e-12,
    'S8: resolver returns the same φ_k (azimuths at P.N) and points as point(R, s, φ) / perpPt to 1e-12·R');
  const hS = [0, 1, 2].map((k) => resolve(mk, `L(P.S, azimuth=${k})`).dir), hE = resolve(mk, 'L(P.eq[3], 0)').dir, hE1 = resolve(mk, 'L(P.eq[3], 1)').dir;
  const near = (a, b) => a.every((c, j) => Math.abs(c - b[j]) < 1e-12);
  const phiDir = (k) => [Math.cos(mk.phis[(k + mk.N) % mk.N]), Math.sin(mk.phis[(k + mk.N) % mk.N]), 0];
  // at P.eq[3] (outward normal p = e3): azimuth 1 = zero direction +Z turned by +90° about p = cross(p, Z); azimuth 2 = P.S
  const e3 = [Math.cos(mk.phis[3]), Math.sin(mk.phis[3]), 0], ccw = [e3[1], -e3[0], 0];
  check(near(hS[0], phiDir(0)) && near(hS[1], phiDir(-1)) && near(hS[2], phiDir(-2)) && near(hE, [0, 0, 1]) && near(hE1, ccw)
    && resolve(mk, 'L(P.eq[3], 2)').dir[2] < -1 + 1e-12,
    'azimuth rule: P.S order mirrored vs P.N (φ₀, φ₋₁, φ₋₂ …); equator point: zero toward P.N, counterclockwise from outside, opposite = P.S');
  const reg = resolve(mk, 'region(P.N, until=C.eq)'), ceq = resolve(mk, 'C.eq'), leq = resolve(mk, `L[${mk.N / 2}]`);
  check(Math.abs(reg.sMax - mk.Q) < 1e-12 * R && ceq.onLine === 'L.eq' && leq.id === 'L.eq' && Math.abs(resolve(mk, 'on(L[2], 0.25Q, from=P.N)').xyz[1] - point(R, mk.Q / 4, mk.phis[2])[1]) < 1e-12 * R
    && ['P.X', 'L(P.N, azimuth=8)', 'X(L[0], L[1])', 'on(L[0], 3)', 'region(P.S, until=C.eq)'].every((ad) => { try { resolve(mk, ad); return false; } catch { return true; } }),
    'addresses: C.eq on the equator line, L[N/2] = L.eq, region(P.N, until=C.eq) reaches Q, s as a fraction of Q; unknown / ambiguous addresses throw');
}


// 8u. #52 commit 2: addressed layout and geometry by line. The line functions reproduce the old (s, φ) formulas bit for
// bit on S_N meridians (the old functions are thin wrappers); layout row-1 tops/bottoms are addresses + resolved points;
// the K12 boundary is the region address; needleSides takes a half-line (works from any anchor, e.g. P.S).
if (G('8u'))
{
  console.log('\n## #52 addressed layout, geometry by line');
  const { generateSN, resolve } = await import('../src/marking.js');
  const { pointOnLine, offsetOnLine, angleWithLine, unit: U, cross: X, dot: D, sub: S, mul: Mu, add: Ad, clamp: Cl, tangentTo } = await import('../src/geom.js');
  const { needleSides } = await import('../src/path.js');
  // literal pre-#52 formulas (geom.js at 9d439e6)
  const oldPoint = (R, s, phi) => { const th = s / R; return [R * Math.sin(th) * Math.cos(phi), R * Math.sin(th) * Math.sin(phi), R * Math.cos(th)]; };
  const oldEast = (p) => U(X([0, 0, 1], U(p)));
  const oldPole = (p) => { const u = U(p); return U(S([0, 0, 1], Mu(u, D(u, [0, 0, 1])))); };
  const oldPerp = (R, s, phi, d) => { const c = oldPoint(R, s, phi); const u = U(c), t = oldEast(c); return Mu(Ad(Mu(u, Math.cos(d / R)), Mu(t, Math.sin(d / R))), R); };
  const oldAng = (at, to) => Math.acos(Cl(Math.abs(D(tangentTo(at, to), oldPole(at)))));
  const R0 = 38.197186342054884;
  let n = 0, bad = 0;
  const neq = (a, b) => a.some((x, i) => x !== b[i]);
  for (let N = 4; N <= 32; N += 2) {
    const mk = { graph: generateSN(N, R0), R: R0, Q: R0 * Math.PI / 2 };
    for (let k = 0; k < N; k++) {
      const hl = resolve(mk, `L(P.N,azimuth=${k})`), phi = 2 * Math.PI * k / N;
      for (let i = 1; i <= 24; i++) {
        const s = 2 * mk.Q * i / 25, T = oldPoint(R0, s * 0.7, phi + 0.3);
        n++;
        if (neq(pointOnLine(R0, hl, s), oldPoint(R0, s, phi))) bad++;
        for (const d of [-2, -0.357, 0.357, 2]) if (neq(offsetOnLine(R0, hl, s, d), oldPerp(R0, s, phi, d))) bad++;
        if (angleWithLine(oldPoint(R0, s, phi), hl, T) !== oldAng(oldPoint(R0, s, phi), T)) bad++;
      }
    }
  }
  check(bad === 0, `line geometry on S_N meridians (N = 4…32, ${n} points × point/4 offsets/angle) === the old point / perpPt / angleWithMeridian bit for bit (mismatches ${bad})`);
  const A = computeAll(recipe, {}), L = A.layout, mk = A.marking, N = mk.N;
  const bitesOk = L.bites.length === 2 * N && L.center === 'P.N'
    && L.bites.every((b) => { const q = resolve(mk, b.address); return b.anchor === 'P.N' && b.line === `L(P.N,azimuth=${b.k})` && b.side === null
      && !neq(q.xyz, b.p) && !neq(b.p, oldPoint(A.base.R, b.s, mk.phis[b.k]))
      && (b.role === 'top' ? b.s === L.sTop : b.s === L.sBot) && ((b.k - (b.set === 'A' ? 0 : 1) + (b.role === 'top' ? 0 : 1)) % 2 + 2) % 2 === 0; })
    && L.pins.every((p, k) => !neq(p.p, oldPoint(A.base.R, L.sBot, mk.phis[k])));
  check(bitesOk, `layout: ${L.bites.length} row-1 bites as addresses on(L(P.N,azimuth=k), s, from=P.N) + resolved points (A tops even / bottoms odd, B shifted by one), points === point(R, s, φ_k) bit for bit; pins unchanged`);
  const B7 = computeAll(recipe, { rowsMode: 'untilOly7' });
  check(L.region.address === 'region(P.N, until=C.eq)' && L.region.sMax === A.base.Q && A.rowPlan.limit === L.region.sMax && B7.rowPlan.limit === B7.layout.region.sMax - 7
    && A.path.limit === L.region.sMax + A.params.m_mm / 2,
    `K12 stop from the region address: sMax = ${L.region.sMax} = Q exactly; rowPlan limit = sMax (untilOly7: sMax − 7); path limit = sMax + m/2`);
  // needleSides by half-line from another anchor: P.S mirrors P.N (empty ball: only the neighbouring marking lines)
  const R = A.base.R, w = A.params.w_mm, m = A.params.m_mm;
  let dm = 0;
  for (let k = 0; k < N; k++) for (const s of [5, 20, 45]) {
    const a = needleSides({ R, line: resolve(mk, `L(P.N,azimuth=${k})`), s, m, w, laid: [] });
    const b = needleSides({ R, line: resolve(mk, `L(P.S,azimuth=${k})`), s, m, w, laid: [] });
    dm = Math.max(dm, Math.abs(Math.abs(a.eOff) - Math.abs(b.eOff)), Math.abs(Math.abs(a.xOff) - Math.abs(b.xOff)), Math.abs(a.eOff - a.xOff) - Math.abs(b.eOff - b.xOff));
  }
  let threw = false; try { needleSides({ R, s: 5, phi: 0, m, w, N, laid: [] }); } catch { threw = true; }
  check(dm < 1e-12 && threw, `needleSides({line}): half-lines from P.S give the mirrored holes of P.N (max diff ${dm.toExponential(1)} mm); the old ({s, phi}) call throws`);
}


// 8v. #52 commit 3: combination markings C8 / C10 (§1.3 tables), C6 counted against the TemariKai source, circles and
// constructed points in the resolver, addCircle, recipe schema v2 (v1 accepted, deprecated) — same path bit for bit.
if (G('8v'))
{
  console.log('\n## #52 C8 / C10 / C6, circles, recipe schema v2');
  const M = await import('../src/marking.js');
  const { computeAll: fresh, hash } = await import('../src/layers.js');
  const { normalizeRecipe } = await import('../src/recipe.js');
  const R = 38.197186342054884, C = 2 * Math.PI * R, deg = 180 / Math.PI;
  const byV = (g) => { const o = {}; for (const p of Object.values(g.points)) o[p.valence] = (o[p.valence] || 0) + 1; return o; };
  const corners = (g) => [...new Set(Object.values(g.faces).flatMap((f) => f.angles.map((a) => (a * deg).toFixed(6))))].sort().join('/');
  const arcsOn = (g, lid) => g.lines[lid].edges.map((e) => g.edges[e].length);
  const angP = (a, b) => Math.atan2(Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
  const minArc = (g, v) => { const P = Object.values(g.points).filter((p) => p.valence === v); let m = Infinity; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) m = Math.min(m, R * angP(P[i].p, P[j].p)); return m; };
  const c8 = M.generateC8(R), s8 = M.graphStats(c8), b8 = byV(c8);
  const coordOk = ['L[0]', 'L[2]', 'L.eq'].every((l) => arcsOn(c8, l).length === 8 && arcsOn(c8, l).every((x) => Math.abs(x - C / 8) < 1e-9 * R));
  const e86 = Object.values(c8.edges).filter((e) => c8.points[e.a].valence + c8.points[e.b].valence === 14);
  check(s8.V === 26 && s8.E === 72 && s8.F === 48 && s8.V - s8.E + s8.F === 2 && b8[8] === 6 && b8[6] === 8 && b8[4] === 12 && s8.lines === 9
    && Object.values(c8.lines).every((L) => L.points.length === 8) && coordOk && corners(c8) === '45.000000/60.000000/90.000000'
    && Math.abs(minArc(c8, 8) - C / 4) < 1e-9 * R && e86.length > 0 && e86.every((e) => Math.abs(e.length - R * Math.atan(Math.SQRT2)) < 1e-9 * R),
    `C8: V 26 (6×v8, 8×v6, 12×v4), E 72, F 48, Euler 2, 9 lines × 8 points; coordinate lines L[0], L[2], L.eq in 8 arcs of C/8; faces ${corners(c8)}°; 8–8 C/4, 8–6 R·arctan√2 = ${(Math.atan(Math.SQRT2) * deg).toFixed(2)}°`);
  const c10 = M.generateC10(R), s10 = M.graphStats(c10), b10 = byV(c10);
  check(s10.V === 62 && s10.E === 180 && s10.F === 120 && b10[10] === 12 && b10[6] === 20 && b10[4] === 30 && s10.lines === 15
    && Object.values(c10.lines).every((L) => L.points.length === 12) && corners(c10) === '36.000000/60.000000/90.000000'
    && Math.abs(minArc(c10, 10) - R * Math.acos(1 / Math.sqrt(5))) < 1e-9 * R && !c10.lines['L.eq'],
    `C10: V 62 (12×v10, 20×v6, 30×v4), E 180, F 120, 15 lines × 12 points (no equator); faces ${corners(c10)}°; neighbouring 10-valent points ${(minArc(c10, 10) / R * deg).toFixed(2)}° = arccos(1/√5)`);
  // C6 against TemariKai «6 Combination Marking (S6)»: S6 without the equator; pins on alternate lines at C/6 + 3C/100 from
  // the pole (zigzag); 3 more full lines; «8 6-point centers»; E / F / the other valences from the construction.
  const c6 = M.generateC6(R), s6 = M.graphStats(c6), b6 = byV(c6), pin = C * M.C6_SOURCE_PIN_FRAC, exact = R * Math.acos(1 / 3);
  const mk6 = { graph: c6, R, Q: C / 4 };
  const near6 = Object.values(c6.points).filter((p) => p.valence === 6 && p.id !== 'P.N' && Math.abs(R * angP(p.p, [0, 0, 1]) - exact) < 1e-9 * R);
  const pinOn = (k) => near6.some((p) => angP(M.resolve(mk6, `on(L(P.N, azimuth=${k}), ${exact}, from=P.N)`).p, p.p) < 1e-9);
  const zig = ([0, 2, 4].every(pinOn) && ![1, 3, 5].some(pinOn)) || ([1, 3, 5].every(pinOn) && ![0, 2, 4].some(pinOn));
  check(s6.lines === 6 && c6.points['P.N'].valence === 6 && ['L[0]', 'L[1]', 'L[2]'].every((l) => Math.abs(c6.lines[l].n[2]) < 1e-15) && !c6.lines['L.eq']
    && b6[6] === 8 && b6[4] === 6 && s6.V === 14 && s6.E === 36 && s6.F === 24 && near6.length === 3 && zig && Math.abs(pin - exact) / R * deg < 0.5
    && corners(c6) === '60.000000/90.000000',
    `C6 vs source: S6 (3 lines, no equator) + 3 lines = 6; 8 six-point centres; the other 6 intersections v4; E 36, F 24 (90°/60°/60°); pins on alternate half-lines at arccos(1/3) = ${(exact / R * deg).toFixed(2)}° (source C/6 + 3C/100 = ${(pin / R * deg).toFixed(2)}°, its rounding)`);
  // resolver: constructed points, intersections, circles, regions
  const mk8 = { graph: c8, R, Q: C / 4 };
  const r = (a) => M.resolve(mk8, a);
  const throws = (a) => { try { r(a); return false; } catch { return true; } };
  const on20 = r('on(L(P.N, azimuth=0), 20, from=P.N)').p, xc = r('X(L[0], C(P.N, 20), near=P.eq[0])');
  const f0 = c8.faces['F[0]'];
  const okRes = r('L[4]').id === 'L.eq' && r('X(L[1], L[5], near=P.N)').id.startsWith('P.v6[') && r('X(L[0], L.eq, near=P.eq[0])').id === 'P.eq[0]'
    && angP(r('mid(E(L.eq:0))').p, [Math.cos(Math.PI / 8), Math.sin(Math.PI / 8), 0]) < 1e-12 && r('L(P.N, P.eq[2])').of === 'L[2]'
    && angP(r('P.center[F[0]]').p, f0.center) === 0 && r('F[0]').vertices.length === 3 && angP(xc.p, on20) < 1e-12
    && Math.abs(r('region(P.N, until=C(P.N, 30))').sMax - 30) < 1e-12 * R && Math.abs(r('C(P.N, ρ=45°)').rho - Math.PI / 4) < 1e-15
    && Math.abs(r('C(P.N, 0.5Q)').rho - Math.PI / 4) < 1e-12
    && ['X(L[0], C(P.N, 20))', 'X(L[0], L[1])', 'X(L[0], L[0], near=P.N)', 'X(L.eq, C(P.N, 20), near=P.N)', 'mid(E(L[0]:99))', 'L(P.N, P.S)', 'F[99]', 'P.center[P.N]', 'C(P.N, 0)'].every(throws);
  check(okRes, 'resolver (any generator): L[4] ≡ L.eq, X(L_a, L_b, near) and X(L, C, near) (two roots without near throw; a root on a graph point returns it), mid(E), L(P, Q) (+ graph line), P.center[F], F[i], C(P, s | xQ | ρ=°), region(P, until=C(P, s))');
  // addCircle: splits edges, no new faces, points onCircle v4; the source graph is untouched
  let circOk = true; const circMsg = [];
  for (const [nm, g] of [['S8', M.generateSN(8, R)], ['C8', c8], ['C10', c10]]) {
    const s0 = M.graphStats(g), g2 = M.addCircle(g, R, { id: 'C.obi', center: 'P.N', rho: 0.9 }), s1 = M.graphStats(g2);
    const pts = g2.circles['C.obi'].points.map((id) => g2.points[id]);
    const ok = s1.F === s0.F && s1.V - s0.V === s1.E - s0.E && s1.V > s0.V && s1.V - s1.E + s1.F === 2 && pts.every((p) => p.kind === 'onCircle' && p.valence === 4 && Math.abs(angP(p.p, [0, 0, 1]) - 0.9) < 1e-9)
      && M.graphStats(g).V === s0.V && !g.circles['C.obi'];
    circMsg.push(`${nm} +${s1.V - s0.V}`); if (!ok) circOk = false;
  }
  const g90 = M.addCircle(c8, R, { id: 'C.q', center: 'P.N', rho: Math.PI / 2 });
  check(circOk && M.graphStats(g90).V === 26 && g90.circles['C.q'].points.length === 8,
    `addCircle: intersections become onCircle points (v4) that split line edges, V and E grow together, F unchanged, source graph untouched (${circMsg.join(', ')}); a circle through existing points (C8 ρ 90° = equator) adds none`);
  // recipe schema v2 (the file) vs v1 (the same recipe written with startLine): identical layers and path
  const rawV2 = JSON.parse(JSON.stringify(recipe));
  const v1 = JSON.parse(JSON.stringify(recipe)); delete v1.schema; delete v1.kiku; delete v1.schemaIn; delete v1.deprecated;
  for (const s of v1.work.sets) delete s.start;
  const n1 = normalizeRecipe(v1);
  let same = true;
  for (const raw of [{}, { m_mm: 0.5, shoulderForm: 'bow', bowLambda: 0.6, muWrap: 0.6, topRule: 'braid', rowsMode: 'untilEquator' }]) {
    const a = fresh(recipe, raw), b = fresh(v1, raw);
    for (const k of ['layout', 'rowPlan', 'path']) if (hash(a[k]) !== hash(b[k])) same = false;
    if (a.marking.stamp !== b.marking.stamp) same = false;
  }
  const bad = (mut) => { const x = JSON.parse(JSON.stringify(rawV2)); mut(x); try { normalizeRecipe(x); return false; } catch { return true; } };
  check(rawV2.schema === 2 && recipe.kiku.center === 'P.N' && recipe.kiku.stop === 'region(P.N, until=C.eq)' && recipe.work.sets.map((s) => s.start).join('|') === 'L(P.N, azimuth=0)|L(P.N, azimuth=1)'
    && !recipe.deprecated && n1.deprecated && n1.schemaIn === 1 && same
    && bad((x) => { x.work.sets[1].start = 'L(P.S, azimuth=1)'; }) && bad((x) => { x.kiku.halfLines = 'L[k]'; }) && bad((x) => { x.schema = 3; }),
    'recipe schema v2 (kiku.center P.N, half-lines L(P.N, azimuth=k), stop region(P.N, until=C.eq), set starts as addresses); v1 accepted and marked deprecated; v1 and v2 give the same layout / rowPlan / path hashes (fan default, braid λ0.6); malformed v2 throws');
  const A8 = fresh(recipe, { generator: 'C8' }), A0 = fresh(recipe, {});
  check(A8.markingOnly && A8.marking.generator === 'C8' && A8.path === null && A8.marking.stats.V === 26 && A8.marking.stamp !== A0.marking.stamp && A0.marking.generator === 'S_N' && !('generator' in A0.marking.inputs),
    'generator param: C8 / C10 / C6 build the marking only (no pattern; the generator joins the marking inputs); S_N inputs and stamps unchanged');
}


// 8w. #53 commit 1: kiku(P, v, …) as a program generator (spec stage3-arch §3.2); S8 = kiku(P.N, 8) executed by the path
// layer (bit-identity vs 5ab64fe is checked outside the suite on 96 builds; here the structure, execution and symmetry).
if (G('8w'))
{
  console.log('\n## #53 kiku program generator');
  const M = await import('../src/marking.js');
  const { kiku, roundBites, rotAbout } = await import('../src/program.js');
  const { computeAll: fresh } = await import('../src/layers.js');
  const { normalizeRecipe } = await import('../src/recipe.js');
  const A = computeAll(recipe, {}), PG = A.layout.program, v = PG.v;
  const seqOk = PG.sets.every((S) => [S.row1, S.next].every((items, r) => items.length === 2 * v + 2 && items[0].kind === (r ? 'resume' : 'hidden') && items[items.length - 1].kind === 'park'
    && items.slice(1, -1).every((x, q) => x.kind === (q % 2 ? 'bite' : 'leg'))
    && items.filter((x) => x.kind === 'bite').every((b, q) => b.i === q + 1 && b.k === (S.startLine + q + 1) % v && b.role === (b.i % 2 ? 'bottom' : 'top') && b.closing === (b.i === v)
      && b.line === `L(P.N,azimuth=${b.k})` && b.anchor === 'P.N' && b.cluster.kiku === PG.id && b.cluster.set === S.set && b.cluster.line === b.line && b.around === 'own-bundle' && b.layer === 'over' && b.grow === 1 && b.side === null
      && b.rule === (b.closing ? 'closingIsNextRowTop' : r === 0 ? 'row1' : b.role === 'top' ? 'belowPrevChannel' : 'packing-root')
      && (b.rule === 'row1' ? b.s === (b.role === 'top' ? A.layout.sTop : A.layout.sBot) : b.s === null))));
  check(PG.family === 'kiku' && PG.call === 'kiku(P.N, 8)' && v === 8 && PG.sets.map((S) => `${S.set}${S.startLine}`).join() === 'A0,B1' && seqOk
    && PG.symmetry.axis.join() === '0,0,1' && PG.symmetry.petalShift === 2 && PG.symmetry.sets.A.shift === 0 && PG.symmetry.sets.B.shift === 1 && A.layout.bites === PG.bites,
    'S8 = kiku(P.N, 8): per set a round template [hidden|resume, (leg, bite) × 8, park]; bite i on h_(start+i), bottoms odd / tops even, closing on the start half-line = next-row top (12′); levels row1 → s_T/s_B, then T1 / packing root; own cluster (kiku, set, line), around own-bundle, layer over, g = +1; symmetry about P.N by 2·2π/8, B = A shifted by 1');
  // the path executes the program: every round's stitches follow its bites (half-line, level, closing)
  const execOk = A.path.rounds.every((r) => { const bs = roundBites(PG, r.set, r.row), st = r.stitchIdx.map((q) => A.path.stitches[q]);
    return st.length === bs.length && st.every((x, q) => x.line === bs[q].k && x.level === bs[q].role && x.closing === bs[q].closing && x.i === bs[q].i); });
  check(execOk && A.path.rounds.length >= 8, `path executes the program: ${A.path.rounds.length} rounds, every stitch on its bite's half-line with its role and closing flag`);
  // the generator is not tied to the pole or to v = 8: programs on P.S (S8) and on a 6-valent face centre of C8 are
  // built and symmetric under their own rotation (bite points of petal j → petal j+1); the S8 rotation is exactly rotZ.
  const R = A.base.R;
  const mkOf = (g) => ({ graph: g, R, Q: A.base.Q });
  const sets = recipe.work.sets.map((st) => ({ set: st.set, thread: st.thread, startLine: st.startLine, begin1: 'hiddenStart', beginN: 'resume' }));
  const progSym = (mk, center) => { const pg = kiku(mk, { center, sets, sTop: 5, sBot: 12, stop: { address: 'n/a', sMax: 20 } });
    const rot = rotAbout(pg.symmetry.axis, pg.symmetry.petalShift * 2 * Math.PI / pg.v);
    const d = Math.max(...pg.bites.map((b) => { const t = pg.bites.find((c) => c.set === b.set && c.role === b.role && c.k === (b.k + 2) % pg.v); return Math.hypot(...rot(b.p).map((x, i) => x - t.p[i])); }));
    return { pg, d }; };
  const s8 = M.generateSN(8, R), c8 = M.generateC8(R);
  const pS = progSym(mkOf(s8), 'P.S'), pF = progSym(mkOf(c8), 'P.v6[0]'), pN = progSym(mkOf(s8), 'P.N');
  const a = 2 * (2 * Math.PI / 8), q = [1.25, -0.5, 3], rz = rotAbout([0, 0, 1], a)(q);
  check(pS.pg.v === 8 && pF.pg.v === 6 && roundBites(pF.pg, 'A', 1).length === 6 && pF.pg.bites.filter((b) => b.set === 'A' && b.role === 'top').length === 3
    && pS.d < 1e-12 * R && pF.d < 1e-12 * R && pN.d < 1e-12 * R && rz[0] === q[0] * Math.cos(a) - q[1] * Math.sin(a) && rz[1] === q[0] * Math.sin(a) + q[1] * Math.cos(a) && rz[2] === q[2],
    `generator on other centres: kiku(P.S, 8) and kiku(P.v6[0], 6) on C8 (3 petals per set) build; row-1 bites map petal → next petal under the program rotation (max ${Math.max(pS.d, pF.d, pN.d).toExponential(1)} mm); about ±ẑ the rotation is the exact z-rotation`);
  const throws = (f) => { try { f(); return false; } catch { return true; } };
  const mk8 = mkOf(s8);
  const base = { center: 'P.N', sets, sTop: 5, sBot: 12, stop: { address: 'n/a', sMax: 20 } };
  const bad = (mut) => { const x = JSON.parse(JSON.stringify(recipe)); delete x.schemaIn; mut(x); try { normalizeRecipe(x); return false; } catch { return true; } };
  check(throws(() => kiku(mk8, { ...base, v: 6 })) && throws(() => kiku(mk8, { ...base, grow: -1 })) && throws(() => kiku(mk8, { ...base, layer: 'under' })) && throws(() => kiku(mk8, { ...base, center: 'P.v6[0]' }))
    && throws(() => kiku(mk8, { ...base, sets: [{ ...sets[0], begin1: 'resume' }] }))
    && recipe.kiku.program === 'kiku(P.N, v)' && recipe.kiku.grow === 1 && recipe.kiku.layer === 'over'
    && bad((x) => { x.kiku.program = 'kiku(P.S, v)'; }) && bad((x) => { x.kiku.grow = 2; }) && bad((x) => { x.kiku.layer = 'side'; })
    && throws(() => fresh({ ...recipe, kiku: { ...recipe.kiku, grow: -1 } }, {})),
    'loud refusals: v ≠ valence of the centre, sakasa g = −1 (not yet, #53 case 3), shitagake, a centre not in the marking, a begin rule the program does not know; recipe kiku.program «kiku(P.N, v)», grow ±1, layer over|under checked');
}


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
  // Stage "all" in the UI (refs #42, #33): URL whitelist, stage button, RU/EN labels, validators run at the last op.
  {
    const fs = await import('node:fs');
    const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const { setLocale, getLocale, t: tr } = await import('../src/i18n.js');
    const loc0 = getLocale();
    setLocale('ru'); const ru = [tr('stage.all', {}, '∅'), tr('stage.all.title', {}, '∅')];
    setLocale('en'); const en = [tr('stage.all', {}, '∅'), tr('stage.all.title', {}, '∅')];
    setLocale(loc0);
    check(/\['2a', '2b', 'B1', 'A2', 'all'\]\.includes\(q\.get\('stage'\)\)/.test(mainSrc) && /data-stage="all"/.test(html)
      && ru[0] === 'весь узор' && en[0] === 'all' && !ru.concat(en).includes('∅'), 'stage "all": ?stage=all accepted, stage button present, RU/EN label + title');
    const Va = runValidators(A, 'all', null);
    check(Array.isArray(Va) && Va.length > 0 && Va.every((v) => v.id && v.status), `stage "all": runValidators runs at the last op (${Va.length} validators)`);
  }
}

await finish(failures); // parallel worker: report to the orchestrator and exit; --quick: label as not the gate
console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `FAILURES: ${failures}`}`);
process.exit(failures ? 1 : 0);
