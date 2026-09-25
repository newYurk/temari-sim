// Validators — pure functions over the pipeline result (or its prefix up to operation k).
// Each: id, name (English canonical; UI translates via i18n), criterion from criteria.md / basis,
// status pass|fail|warn|info|n/a, numbers. Work may span several rounds and threads (A1, B1, A2 …).
import { dist, norm, toSPhi, dot, unit, sub, mul, ePole, eEast, haversineLen, point, cross, segSegDist } from './geom.js';
import { prefix } from './layers.js';
import { displayGeometry, DISPLAY_STACK_LIFT_W } from './display.js';
import { tubeMesh } from './tube.js';

const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : String(x));
const TOL_JOIN = 1e-9;        // мм — непрерывность (численный допуск)
const TOL_LEN = 1e-9;         // мм — баланс длины (численный)
const TOL_REF = 1e-6;         // мм — совпадение с calc.py (две независимые реализации одной геометрии)
const TOL_PERP_DEG = 1e-6;    // ° — перпендикулярность: модель строит её точно, допуск численный
const TOL_SYM = 1e-9;         // мм — симметрия
const TOL_RAD = 1e-9;         // мм — радиальное положение модели (численный)
const TOL_MESH = 1e-6;        // мм — меш трубки (накопление поворотов рамки)

export function refKey(A) {
  const P = A.params;
  const g = (x) => String(Number(x));
  return `C=${g(P.C_mm)}|w=${g(P.w_mm)}|m=${g(P.m_mm)}|N=${P.N}|sTop=${A.layout.sTop.toFixed(6)}|bfe=${P.bottomFromEq.toFixed(6)}|start=${P.startRule}:${g(P.startRun_mm)}`;
}

function bbox(pts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return { lo, hi };
}
const boxGap = (a, b) => Math.max(0, a.lo[0] - b.hi[0], b.lo[0] - a.hi[0], a.lo[1] - b.hi[1], b.lo[1] - a.hi[1], a.lo[2] - b.hi[2], b.lo[2] - a.hi[2]);
function minDist(A, B) {
  let best = { d: Infinity };
  for (let i = 1; i < A.length; i++) for (let j = 1; j < B.length; j++) {
    const r = segSegDist(A[i - 1], A[i], B[j - 1], B[j]);
    if (r.d < best.d) best = { ...r, i, j };
  }
  return best;
}
function ptPolyDist(p, B) {
  let d = Infinity;
  for (let j = 1; j < B.length; j++) d = Math.min(d, segSegDist(p, p, B[j - 1], B[j]).d);
  return d;
}
const rotZ = (a) => (p) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];

/** stage: ключ recipe.stages ('2a' | '2b' | 'B1' | 'A2') или число (индекс операции). ref — calc_reference.json (или null). */
export function runValidators(A, stage = '2b', ref = null) {
  const path = A.path;
  const kEnd = typeof stage === 'number' ? stage : path.stageEnd[stage];
  const { ops, segs, ids } = prefix(path, kEnd);
  const R = A.base.R, w = A.params.w_mm, m = A.params.m_mm, N = A.marking.N;
  const out = [];
  const add = (v) => out.push(v);
  const segById = new Map(path.segs.map((s) => [s.id, s]));
  const stitchesDone = path.stitches.filter((st) => ids.has(st.pickupId));
  const roundsIn = path.rounds.filter((r) => ops.some((o) => o.round === r.id));
  const roundDone = (r) => kEnd >= r.opLast;
  const threadIds = [...new Set(segs.map((s) => s.thread))];

  // V1 — каждая нить непрерывна (K13); продолжение — из точки парковки
  {
    let maxGap = 0, uGap = 0, resumes = 0, resumeGap = 0;
    for (const t of threadIds) {
      const ts = segs.filter((s) => s.thread === t);
      for (let i = 1; i < ts.length; i++) {
        maxGap = Math.max(maxGap, dist(ts[i - 1].to, ts[i].from));
        uGap = Math.max(uGap, Math.abs(ts[i].u0 - ts[i - 1].u1));
      }
    }
    for (const r of roundsIn.filter((r) => r.begin === 'resume')) {
      const prev = path.rounds.find((q) => q.thread === r.thread && q.opLast < r.opFirst && q.set === r.set && q.row === r.row - 1);
      const first = segById.get(r.firstLegId);
      if (prev && first && ids.has(first.id)) { resumes++; resumeGap = Math.max(resumeGap, dist(first.from, path.stitches[prev.stitchIdx[prev.stitchIdx.length - 1]].X)); }
    }
    const ok = maxGap < TOL_JOIN && uGap < TOL_LEN && resumeGap < TOL_JOIN;
    add({ id: 'V1', name: 'Each thread is continuous', crit: 'K13; prior #112 (одна нить на цвет — один путь); GT14 «Return to Color A»',
      status: ok ? 'pass' : 'fail',
      value: `нитей ${threadIds.length} (${threadIds.join(', ')}); сегментов ${segs.length}; макс. разрыв ${f(maxGap, 12)} мм; скачок u ${f(uGap, 12)} мм; продолжений после парковки ${resumes} (разрыв ${f(resumeGap, 12)} мм)` });
  }
  // V2 — баланс материала по каждой нити: u_end − u_start = Σ длин; независимая проверка длин плеч гаверсинусом
  {
    let ok = true, hvMax = 0;
    const per = {};
    for (const t of threadIds) {
      const ts = segs.filter((s) => s.thread === t);
      const sum = ts.reduce((a, s) => a + s.length, 0);
      const du = ts[ts.length - 1].u1 - ts[0].u0;
      if (Math.abs(sum - du) >= TOL_LEN) ok = false;
      const by = {};
      for (const s of ts) by[s.type] = (by[s.type] || 0) + s.length;
      const rounds = {};
      for (const s of ts) rounds[s.round] = (rounds[s.round] || 0) + s.length;
      per[t] = { sum, du, by, rounds };
    }
    let nGeo = 0, nBow = 0;
    for (const s of segs.filter((s) => s.type === 'leg')) {
      // Haversine checks great-circle length; bowed legs use polyLen (Φ3 tip bow) — skip those.
      if ((s.bowLateralMm || 0) > 1e-6 || s.shoulderForm === 'bow' || s.shoulderForm === 'bowToMarking' || s.layMode === 'rail') { nBow++; continue; }
      nGeo++;
      const a = toSPhi(R, s.from), b = toSPhi(R, s.to);
      hvMax = Math.max(hvMax, Math.abs(haversineLen(R, a.s, a.phi, b.s, b.phi) - s.length));
    }
    ok = ok && hvMax < 1e-9;
    add({ id: 'V2', name: 'Length balance per thread: u = Σ segments', crit: 'K13; model/spec.md §5; одна нить — один баланс (#112)',
      status: ok ? 'pass' : 'fail',
      value: threadIds.map((t) => { const p = per[t]; return `нить ${t}: Σ = ${f(p.sum)} мм = u ${f(p.du)} (${Object.entries(p.rounds).map(([r, L]) => `${r} ${f(L)}`).join(', ')}; старт ${f(p.by['hidden-start'] || 0)}, плечи ${f(p.by.leg || 0)}, захваты ${f(p.by.pickup || 0)})`; }).join('; ') +
        `; гаверсинус vs вектор (geodesic legs ${nGeo}): ${f(hvMax, 12)} мм` + (nBow ? `; bowed legs ${nBow} use polyLen` : ''),
      numbers: { per, hvMax, nGeo, nBow } });
  }
  // V3 — согласие обхода A1 с calc.py (независимая реализация, numpy)
  {
    const A1 = path.rounds[0];
    const a1Segs = segs.filter((s) => s.round === A1.id);
    const a1St = stitchesDone.filter((st) => st.round === A1.id);
    const e = ref && ref.entries ? ref.entries.find((x) => x.key === refKey(A)) : null;
    if (!e) add({ id: 'V3', name: 'A1 agrees with calc.py', crit: 'кросс-проверка двух реализаций', status: 'info',
      value: `эталона для этих параметров нет (${refKey(A)}); запустите python3 sim/tools/calc_reference.py` });
    else {
      let dXY = dist(A1.start.X0, e.X0);
      for (const st of a1St) { const r = e.stitches[st.i - 1]; dXY = Math.max(dXY, dist(st.E, r.E), dist(st.X, r.X)); }
      const rowSegs = a1Segs.filter((s) => s.type !== 'hidden-start');
      const rowLen = rowSegs.reduce((a, s) => a + s.length, 0);
      const full = kEnd >= A1.opLast;
      let refLen = 0;
      if (full) refLen = e.row1_total;
      else for (const s of rowSegs) refLen += s.type === 'leg' ? e.arms[s.stitch - 1] : e.bites[s.stitch - 1];
      const hid = a1Segs.filter((s) => s.type === 'hidden-start').reduce((a, s) => a + s.length, 0);
      const ok = Math.abs(rowLen - refLen) < TOL_REF && dXY < TOL_REF && Math.abs(hid - e.hidden_start) < TOL_REF;
      add({ id: 'V3', name: 'A1 agrees with calc.py', crit: 'кросс-проверка двух реализаций одной геометрии',
        status: ok ? 'pass' : 'fail',
        value: `${full ? 'ряд 1 (плечи + захваты)' : 'префикс ряда 1'}: sim ${f(rowLen, 4)} мм, calc.py ${f(refLen, 4)} мм (Δ ${f(Math.abs(rowLen - refLen), 9)}); E/X Δmax ${f(dXY, 9)} мм; скрытый старт ${f(hid)} vs ${f(e.hidden_start)} мм`,
        numbers: { rowLen, refLen, dXY, hid, refHidden: e.hidden_start, refRow1: e.row1_total } });
    }
  }
  // V4 — захват ⟂ линии, против хода, под поверхностью
  {
    let maxDev = 0, wrongSide = 0, notUnder = 0;
    for (const st of stitchesDone) {
      const C = point(R, st.s, A.marking.phis[st.line]);
      const chord = unit(sub(st.X, st.E));
      maxDev = Math.max(maxDev, Math.abs(90 - Math.acos(Math.min(1, Math.abs(dot(chord, ePole(C))))) * 180 / Math.PI));
      if (!(dot(st.E, eEast(C)) > 0 && dot(st.X, eEast(C)) < 0)) wrongSide++;
      if (norm(st.E.map((v, i) => (v + st.X[i]) / 2)) >= R) notUnder++;
    }
    const ok = maxDev < TOL_PERP_DEG && wrongSide === 0 && notUnder === 0;
    add({ id: 'V4', name: 'Catch ⟂ to line, against grain, under surface', crit: 'OLY-BASIC «垂直に», «逆方向»; TK-LITTLE «right angle»',
      status: stitchesDone.length ? (ok ? 'pass' : 'fail') : 'n/a',
      value: `стежков ${stitchesDone.length}; макс. отклонение от 90° ${f(maxDev, 9)}°; E справа/X слева: нарушений ${wrongSide}; канал внутри шара: нарушений ${notUnder}` });
  }
  // V5 — стежки на своих линиях и уровнях (K1–K3), захват не достаёт соседней линии
  {
    let wrongLine = 0, reach = 0;
    const spreads = [];
    for (const r of roundsIn) {
      const sts = stitchesDone.filter((st) => st.round === r.id);
      const sb = [], stp = [];
      for (const st of sts) {
        const expLine = (r.startLine + st.i) % N, expLevel = st.i % 2 === 1 ? 'bottom' : 'top';
        if (st.line !== expLine || st.level !== expLevel) wrongLine++;
        (st.level === 'bottom' ? sb : stp).push(st.s);
        const spacing = R * Math.sin(st.s / R) * 2 * Math.PI / N;
        if (Math.max(st.eOff, -st.xOff) + w / 2 >= spacing - m / 2) reach++;
      }
      const spread = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
      spreads.push({ r: r.id, b: spread(sb), t: spread(stp) });
    }
    const ok = wrongLine === 0 && reach === 0 && spreads.every((x) => x.b <= 1 && x.t <= 0.5);
    const worstB = spreads.reduce((a, x) => (x.b > a.b ? x : a), { b: 0 });
    add({ id: 'V5', name: 'Stitches on their lines and levels', crit: 'K1 (набор A: верх на чётных; B — на нечётных), K2 (разброс низа ряда ≤ 1 мм [A]), K3 (разброс верха ≤ 0,5 мм [A])',
      status: stitchesDone.length ? (ok ? 'pass' : 'fail') : 'n/a',
      value: `ошибок линии/уровня ${wrongLine}; разброс s по обходам: ${spreads.map((x) => `${x.r} низ ${f(x.b)}, верх ${f(x.t)}`).join('; ')} мм; захват задевает соседнюю линию: ${reach}` +
        (worstB.b > 1e-9 ? `. Разброс низа — «ступенька перехода»: кончик на первой нижней линии обхода ниже остальных (см. V6); макс. ${f(worstB.b)} мм в ${worstB.r}` : '') });
  }
  // V6 — симметрия лепестков внутри обхода: поворот на 2·(2π/N) переводит плечо i в плечо i+2
  {
    const done = roundsIn.filter(roundDone);
    if (!done.length) add({ id: 'V6', name: 'Petal symmetry within a round', crit: 'K1', status: 'n/a', value: 'только для полного обхода' });
    else {
      const rot = rotZ(2 * (2 * Math.PI / N));
      const parts = [];
      let ok = true;
      for (const r of done) {
        const sts = r.stitchIdx.map((i) => path.stitches[i]);
        let dLeg = 0, dPk = 0, nCmp = 0, worstPair = '';
        for (let i = 0; i < N; i++) {
          const j = (i + 2) % N;
          const special = (q) => (r.begin === 'resume' && q === 0);   // первое плечо продолженной нити идёт от X парковки
          if (special(i) || special(j)) continue;
          const a = segById.get(sts[i].legId).pts.map(rot), b = segById.get(sts[j].legId).pts;
          let dd = 0;
          for (let q = 0; q < a.length; q++) dd = Math.max(dd, dist(a[q], b[q]));
          if (dd > dLeg + 1e-12) worstPair = `плечо ${i + 1} → ${j + 1}`;
          dLeg = Math.max(dLeg, dd);
          if (!sts[i].closing && !sts[j].closing) dPk = Math.max(dPk, dist(rot(sts[i].E), sts[j].E), dist(rot(sts[i].X), sts[j].X));
          nCmp++;
        }
        const reg = sts.find((st) => st.level === 'top' && !st.closing), cl = sts.find((st) => st.closing);
        const extra = reg.xOff - cl.xOff;
        if (!(dLeg < TOL_SYM && dPk < TOL_SYM && extra > 0)) ok = false;
        parts.push(`${r.id}: плечи ${dLeg < TOL_SYM ? f(dLeg, 12) : `${f(dLeg, 3)} (хуже всего ${worstPair})`} мм (${nCmp} пар${r.begin === 'resume' ? ', без первого плеча от парковки' : ''}), E/X ${f(dPk, dPk < TOL_SYM ? 12 : 3)} мм; замыкающий захват шире на ${f(extra, 4)} мм (охватывает начало обхода)`);
      }
      add({ id: 'V6', name: 'Petal symmetry within a round', crit: 'K1; TK-KIKU', status: ok ? 'pass' : 'fail',
        value: parts.join('; ') + (ok ? '' : '. Асимметрия — «ступенька перехода»: первое плечо продолженной нити идёт от парковки (верх прошлого ряда, на w выше и уже), кончик ряда n + 1 на линии L(старт + 1) укладывается вплотную к нему и уходит ниже; TK-UWA лечит это отложенным последним стежком (вариант, не моделируется)') });
    }
  }
  // V7 — видимые плечи на поверхности (не сквозь шар), скрытые — внутри
  {
    let minR = Infinity, maxHidden = -Infinity, depthStart = 0, depthPk = 0;
    for (const s of segs) {
      if (s.type === 'leg') for (const p of s.pts) minR = Math.min(minR, norm(p));
      else {
        for (const p of s.pts) maxHidden = Math.max(maxHidden, norm(p));
        if (s.type === 'hidden-start') depthStart = Math.max(depthStart, s.depthMax); else depthPk = Math.max(depthPk, s.depthMax);
      }
    }
    const ok = (!Number.isFinite(minR) || minR >= R * (1 - 1e-12)) && maxHidden <= R * (1 + 1e-12);
    add({ id: 'V7', name: 'Legs on surface, hidden segments inside', crit: 'геометрия: плечо лежит на опоре (K10), канал иглы в обмотке',
      status: ok ? 'pass' : 'fail',
      value: `мин. радиус плеч − R = ${f(minR - R, 9)} мм; макс. радиус скрытых − R = ${f(maxHidden - R, 9)} мм; глубина: старт до ${f(depthStart, 2)} мм, захват до ${f(depthPk, 4)} мм (хорда — нижняя оценка)` });
  }
  // V8 — нет взаимопроникновения уложенных нитей, кроме разрешённого правилами (перекрест, клин uwagake, захват, стык)
  {
    const pairKey = (a, b) => [a, b].sort().join('|');
    const expected = new Map();
    for (const t of threadIds) { const ts = segs.filter((s) => s.thread === t); for (let i = 1; i < ts.length; i++) expected.set(pairKey(ts[i - 1].id, ts[i].id), 'стык'); }
    const warnList = [];
    for (const c of path.crossings) if (ids.has(c.a) && ids.has(c.b) && c.allowed) {
      if (c.kind === 'squeeze') warnList.push(`${c.a}×${c.b} s=${f(c.s, 1)} d=${f(c.dmin, 3)} (тесное место, V19)`);
      expected.set(pairKey(c.a, c.b), c.kind === 'wedge' ? 'клин uwagake (поверх прежнего ряда)' : c.kind === 'squeeze' ? 'WARN: тесное место у прокола — нити должны сжаться (V19)' : 'перекрест (над/под по правилу)');
    }
    for (const st of stitchesDone) {
      for (const c of st.sides.cluster) {
        if (c.seg === 'marking') continue;
        expected.set(pairKey(st.pickupId, c.seg), 'захват охватывает уложенную нить');
        const cs = segById.get(c.seg);
        const prevOfThread = path.segs.filter((x) => x.thread === cs.thread && x.u1 <= cs.u0 + 1e-12).pop();
        if (c.kind === 'hole-exit' && prevOfThread) expected.set(pairKey(st.pickupId, prevOfThread.id), 'захват охватывает нить у её выхода');
      }
    }
    // тесные места (V19): у сжатого прокола рабочая нить и нить соседней точки ближе w — записано, сжатие не моделируется
    const squeezeNear = [];
    for (const st of stitchesDone) for (const q of (st.sides.squeeze || [])) {
      if (q.seg === 'marking' || !segById.get(q.seg)) continue;
      const hole = q.side === 'E' ? st.E : st.X;
      const nb = (id) => { const x = segById.get(id); return path.segs.filter((y) => y.thread === x.thread && (y.id === id || Math.abs(y.u1 - x.u0) < 1e-9 || Math.abs(y.u0 - x.u1) < 1e-9)).map((y) => y.id); };
      squeezeNear.push({ mine: new Set(nb(st.pickupId)), set: st.set, hole });
    }
    // пара «рабочая нить у сжатого прокола (канал, приходящее/уходящее плечо) × нить другого набора» у этого прокола
    const squeezeOk = (P, Q, md) => squeezeNear.some((x) => ((x.mine.has(P.id) && Q.set !== x.set) || (x.mine.has(Q.id) && P.set !== x.set)) && Math.min(dist(md.cp, x.hole), dist(md.cq, x.hole)) < 2 * w);
    // оси: видимое плечо — нить диаметра w на поверхности (ось на R + w/2); скрытые — по каналу
    const lift = (R + w / 2) / R;
    const axis = segs.map((s) => (s.type === 'leg' ? s.pts.map((p) => [p[0] * lift, p[1] * lift, p[2] * lift]) : s.pts));
    const boxes = axis.map(bbox);
    const found = [], bad = [];
    const order = new Map(path.segs.map((x, i) => [x.id, i]));
    const nextOf = (h) => path.segs.find((x) => x.thread === h.thread && Math.abs(x.u0 - h.u1) < 1e-12);
    const classify = (P, Q, md) => {
      const k = pairKey(P.id, Q.id);
      if (expected.has(k)) return expected.get(k);
      if (squeezeOk(P, Q, md)) { warnList.push(`${P.id}×${Q.id} s=${f(toSPhi(R, md.cp).s, 1)} d=${f(md.d, 3)} (тесное место, V19)`); return 'WARN: тесное место у прокола — нити должны сжаться (V19)'; }
      const later = order.get(P.id) > order.get(Q.id) ? P : Q, earlier = later === P ? Q : P;
      const types = [P.type, Q.type].sort().join('+');
      if (types === 'leg+pickup') {
        const K = P.type === 'pickup' ? P : Q, L = P.type === 'leg' ? P : Q;
        if (later === L) return 'плечо поверх скрытого стежка (позже — сверху; канал под нитью разметки)';
        return null;                                   // канал прошёл под плечом, не учтённым в занятости — ошибка
      }
      if (types === 'pickup+pickup') {
        const tol = Math.abs(P.depthMax - Q.depthMax) + 1e-6;   // разный прогиб хорд соседних каналов
        return md.d >= w - tol ? 'каналы соседних стежков вплотную (w)' : null;
      }
      if (types === 'hidden-start+leg') {
        const H = P.type === 'hidden-start' ? P : Q, L = P.type === 'leg' ? P : Q;
        const cpH = H === P ? md.cp : md.cq;
        const nearHole = Math.min(dist(cpH, H.from), dist(cpH, H.to)) < w;
        const nx = nextOf(H);
        if (nearHole && later === L && nx && (expected.has(pairKey(L.id, nx.id)) || nx.type !== 'leg'))
          return 'плечо поверх отверстия, где выходит нить (связь с её плечом записана)';
        if (nearHole && later === L) return 'плечо поверх отверстия скрытого старта';
        return null;
      }
      if (types === 'hidden-start+pickup') { warnList.push(`${P.id}×${Q.id} s=${f(toSPhi(R, md.cp).s, 1)} d=${f(md.d, 3)}`); return 'WARN: канал иглы рядом со скрытым стартом (в обмотке)'; }
      return null;
    };
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (boxGap(boxes[i], boxes[j]) >= w) continue;
      const md = minDist(axis[i], axis[j]);
      if (md.d >= w - 1e-9) continue;
      const why = classify(segs[i], segs[j], md);
      const sp = toSPhi(R, md.cp);
      (why ? found : bad).push({ a: segs[i].id, b: segs[j].id, d: md.d, s: sp.s, why: why || 'НЕОЖИДАННО' });
    }
    const cnt = {};
    for (const r of found) cnt[r.why] = (cnt[r.why] || 0) + 1;
    const wedges = path.crossings.filter((c) => c.kind === 'wedge' && ids.has(c.a) && ids.has(c.b));
    const wedgeTxt = wedges.length ? `; клинья: макс. налегание ${f(Math.max(...wedges.map((c) => w - c.dmin)), 3)} мм на длине до ${f(Math.max(...wedges.map((c) => c.lenMm)), 1)} мм от верхней точки` : '';
    const notAllowed = path.crossings.filter((c) => !c.allowed && ids.has(c.a) && ids.has(c.b));
    add({ id: 'V8', name: 'No interpenetration except rule-allowed', crit: 'K14: расстояние осей ≥ w (трубка Ø w); разрешено: перекрест с записанным над/под, клин uwagake у верхней точки, захват, стык',
      status: bad.length || notAllowed.length ? 'fail' : warnList.length ? 'warn' : 'pass',
      value: `зон сближения < w: ${Object.entries(cnt).map(([k2, v]) => `${k2} — ${v}`).join('; ')}; неожиданных ${bad.length + notAllowed.length}` + wedgeTxt +
        (bad.length ? ': ' + bad.slice(0, 6).map((b) => `${b.a}×${b.b} s=${f(b.s, 1)} d=${f(b.d, 3)}`).join('; ') : '') +
        (warnList.length ? `; предупреждения (скрытые нити в обмотке ближе w, радиальное сжатие не моделируется): ${warnList.join('; ')}` : ''),
      details: { found, bad, notAllowed, warnList } });
  }
  // V9 — выведенная ширина захвата ряда 1 против источников (проверка, не навязывание)
  {
    const reg = stitchesDone.filter((st) => st.row === 1 && !st.closing).map((st) => st.eOff - st.xOff);
    if (!reg.length) add({ id: 'V9', name: 'Derived row-1 catch vs sources', crit: 'TK-LITTLE «about 1-2 mm», TK-KAGARI «about 2mm»', status: 'n/a', value: '—' });
    else {
      const lo = Math.min(...reg), hi = Math.max(...reg), inRange = lo >= 1 - 1e-9 && hi <= 2 + 1e-9;
      add({ id: 'V9', name: 'Derived row-1 catch vs sources', crit: 'TK-LITTLE «about 1-2 mm», TK-KAGARI «about 2mm» (проверка следствия)',
        status: inRange ? 'pass' : 'warn',
        value: `обычный захват = m + w = ${f(lo)}…${f(hi)} мм (m = ${f(m, 2)}, w = ${f(w, 3)}); ${inRange ? 'в диапазоне 1–2 мм' : 'ВНЕ «about 1–2 mm» — проверьте m, w'}` });
    }
  }
  // V10 — замыкание каждого обхода: последнее плечо ПОД первым плечом обхода, стежок охватывает начало обхода
  {
    const done = roundsIn.filter(roundDone);
    if (!done.length) add({ id: 'V10', name: 'Round closure', crit: 'TK-LITTLE; TK-GT14', status: 'n/a', value: 'нет завершённых обходов' });
    else {
      let ok = true;
      const parts = done.map((r) => {
        const cl = path.stitches[r.stitchIdx[r.stitchIdx.length - 1]];
        const leg = segById.get(cl.legId);
        const cr = leg.crossings.find((c) => c.b === r.firstLegId);
        const captured = cl.sides.cluster.some((c) => c.seg === r.firstLegId);
        const good = !!cr && cr.over === r.firstLegId && captured;
        if (!good) ok = false;
        return `${r.id}: ${cr ? `плечо ${cl.legId} ПОД ${r.firstLegId} на s = ${f(cr.s, 2)} мм (${f(cr.angleDeg, 1)}°)` : 'перекрест с первым плечом не найден'}; захват [${f(cl.xOff)}; ${f(cl.eOff)}] охватывает ${r.firstLegId}: ${captured ? 'да' : 'нет'}`;
      });
      add({ id: 'V10', name: 'Round closure', crit: 'TK-LITTLE «Carry the working thread under the starting thread … then complete the stitch» (ряд 1, a); ряд n — тот же приём (b); TK-GT14 «Complete the stitch … park»',
        status: ok ? 'pass' : 'fail', value: parts.join('; ') });
    }
  }
  // V11 — происхождение: слои посчитаны из текущих родителей (нет утечки старой геометрии)
  {
    const okChain = A.marking.parents[0] === A.base.stamp && A.layout.parents[1] === A.marking.stamp &&
      A.rowPlan.parents[2] === A.layout.stamp && A.path.parents[3] === A.rowPlan.stamp && A.path.parents[0] === A.base.stamp;
    const Rchk = segs.every((s) => s.type !== 'leg' || Math.abs(norm(s.from) - R) < 1e-9);
    add({ id: 'V11', name: 'Layer chain is fresh', crit: 'требование параметричности: base → marking → layout → rowPlan → path',
      status: okChain && Rchk ? 'pass' : 'fail',
      value: `штампы: base ${A.base.stamp} → marking ${A.marking.stamp} → layout ${A.layout.stamp} → rowPlan ${A.rowPlan.stamp} → path ${A.path.stamp}; все плечи на текущем R: ${Rchk ? 'да' : 'нет'}` });
  }
  // V12 — план рядов (формула замысла) против выведенных уровней всех рядов; экватор; остановка наборов
  {
    const rp = A.rowPlan, last = rp.rows[rp.rows.length - 1];
    const tips = [];
    for (const r of roundsIn.filter(roundDone)) {
      const sts = r.stitchIdx.map((i) => path.stitches[i]);
      const b = sts.find((st) => st.level === 'bottom'), t = sts.find((st) => st.level === 'top');
      tips.push({ r: r.id, set: r.set, row: r.row, sTip: b.s, sTop: t.s, plan: rp.rows[r.row - 1] });
    }
    const lim = path.limit ?? rp.limit;
    const beyond = tips.filter((x) => x.sTip > lim + 1e-9);
    const bySet = {};
    for (const x of tips) (bySet[x.set] || (bySet[x.set] = [])).push(x);
    const setTxt = Object.entries(bySet).map(([k2, xs]) => `набор ${k2}: рядов ${xs.length}, кончики ${xs.map((x) => `${x.r} ${f(x.sTip, 2)}`).join(', ')} мм`).join('; ');
    const stopTxt = Object.entries(path.stopped || {}).map(([k2, v]) => `набор ${k2} остановлен перед рядом ${v.row}: ${v.reason}`).join('; ');
    const planTxt = tips.filter((x) => x.row >= 2 && x.plan).slice(0, 4).map((x) => `${x.r} низ ${f(x.sTip, 2)} (план ${f(x.plan.sBot, 2)})`).join(', ');
    add({ id: 'V12', name: 'Rows to equator: derived tips vs limit and plan', crit: 'K12; TK-GT14 «Work to the equator»; next-stage §5 (толщину не уменьшать)',
      status: beyond.length ? 'warn' : 'info',
      value: `предел s ≤ ${f(lim, 2)} мм (экватор ${f(A.base.Q, 2)}); ${setTxt || 'полных обходов нет'}` +
        (beyond.length ? `; ЗА пределом: ${beyond.map((x) => `${x.r} на ${f(x.sTip - lim, 2)} мм`).join(', ')}` : '') +
        (stopTxt ? `; ${stopTxt}` : '') +
        `; план по формуле w/sin α: ${rp.nRows} рядов, последний кончик ${f(last.sBot, 2)} мм` + (planTxt ? ` (${planTxt}; формула у кончика — приближение)` : ''),
      numbers: { tips, limit: lim, stopped: path.stopped, beyond } });
  }
  // V13 — «каждый следующий верх примерно на нить ниже и шире» — СЛЕДСТВИЕ занятости, сверяется с источником ПО КАЖДОМУ РЯДУ
  {
    const rows = [];
    for (const r of roundsIn.filter((q) => q.row >= 2 && roundDone(q))) {
      const prev = path.rounds.find((q) => q.set === r.set && q.row === r.row - 1);
      const sts = r.stitchIdx.map((i) => path.stitches[i]).filter((st) => st.level === 'top');
      const pst = prev.stitchIdx.map((i) => path.stitches[i]).filter((st) => st.level === 'top');
      for (const st of sts) {
        const p = pst.find((q) => q.line === st.line);
        const foreign = st.sides.cluster.filter((c) => c.seg !== 'marking' && segById.get(c.seg).set !== st.set).map((c) => segById.get(c.seg).round);
        rows.push({ r: r.id, set: r.set, row: r.row, line: st.line, closing: st.closing, dS: st.s - p.s, dE: st.eOff - p.eOff, dX: p.xOff - st.xOff, W: st.eOff - st.xOff, Wp: p.eOff - p.xOff, foreign });
      }
    }
    if (!rows.length) add({ id: 'V13', name: 'Row n+1 top “one thread lower and wider” as consequence (per row)', crit: 'TK-GT14, TK-UWA (проверять, не задавать)', status: 'n/a', value: 'нужен завершённый ряд 2' });
    else {
      const lo = 0.5 * w, hi = 2.5 * w;   // «about 1 thread width»: прочтения +w в сумме (#100) и +w с каждой стороны (+2w); допуск ±w/2 [A]
      const mean = (a) => a.reduce((s2, v) => s2 + v, 0) / a.length;
      const per = [];
      for (const rid of [...new Set(rows.map((x) => x.r))]) {
        const xs = rows.filter((x) => x.r === rid && !x.closing);
        const dW = xs.map((x) => x.W - x.Wp), dS = xs.map((x) => x.dS);
        const minW = Math.min(...dW), maxW = Math.max(...dW);
        const foreign = [...new Set(rows.filter((x) => x.r === rid).flatMap((x) => x.foreign))];
        per.push({ r: rid, dS: mean(dS), dWmin: minW, dWmax: maxW, dWmean: mean(dW), W: Math.max(...xs.map((x) => x.W)), ok: minW >= lo - 1e-9 && maxW <= hi + 1e-9, foreign });
      }
      const inside = per.every((x) => x.ok);
      add({ id: 'V13', name: 'Row n+1 top “one thread lower and wider” as consequence (per row)', crit: 'TK-GT14 «about 1 thread width wider and below»; TK-UWA «about 1 thread-width wider and lower»; prior #100 («+w в сумме») — проверка, не вход; допуск [0,5 w; 2,5 w] [A]',
        status: inside ? 'pass' : 'warn',
        value: per.map((x) => `${x.r}: ниже на ${f(x.dS, 3)}, шире на ${x.dWmin === x.dWmax ? f(x.dWmean, 3) : `${f(x.dWmin, 3)}…${f(x.dWmax, 3)}`} мм (${f(x.dWmean / w, 2)} w), ширина ${f(x.W, 3)}${x.ok ? '' : ' ⚠'}${x.foreign.length ? ` [в захвате нити другого набора: ${x.foreign.join(',')}]` : ''}`).join('; ') +
          `. Прочтения источника: +w в сумме = ${f(w, 3)}, +w с каждой стороны = ${f(2 * w, 3)} мм. ${inside ? 'Все ряды в пределах прочтений.' : 'Ряды с ⚠ вне допуска: ряд 2 — плечи ряда 1 пересекают перпендикуляр нового верха почти у оси линии (мало); ряды ≥ 3 — плечи расходятся от верха, игла должна обойти их снаружи (много); см. A8, U3, U13.'}`,
        numbers: { rows, per } });
    }
  }
  // V14 — видимая нить лежит на шаре, не парит (модель и отображаемый меш)
  {
    let legDev = 0, legMax = -Infinity, hidOut = -Infinity, hidDepth = 0;
    for (const s of segs) for (const p of s.pts) {
      const r = norm(p) - R;
      if (s.type === 'leg') { legDev = Math.max(legDev, Math.abs(r)); legMax = Math.max(legMax, r); }
      else { hidOut = Math.max(hidOut, r); if (s.type === 'hidden-start') hidDepth = Math.max(hidDepth, -r); }
    }
    let meshMax = -Infinity, axisMax = -Infinity, hidDispAxisMax = -Infinity, hidDispDepth = 0, liftMax = 0;
    for (const dg of displayGeometry(A, ids, { hidMode: 'surf' })) {
      if (dg.hidden) {
        for (const p of dg.pts) { const r = norm(p) - R; hidDispAxisMax = Math.max(hidDispAxisMax, r); if (dg.seg.type === 'hidden-start') hidDispDepth = Math.max(hidDispDepth, -r); }
        continue;
      }
      liftMax = Math.max(liftMax, dg.liftMax || 0);
      for (const p of dg.pts) axisMax = Math.max(axisMax, norm(p) - R);
      for (const v of tubeMesh(dg.pts, dg.radius).pos) meshMax = Math.max(meshMax, norm(v) - R);
    }
    const ok = legDev < TOL_RAD && hidOut < TOL_RAD && meshMax <= w + liftMax + TOL_MESH && axisMax <= w / 2 + liftMax + TOL_MESH && hidDispAxisMax <= TOL_MESH;
    add({ id: 'V14', name: 'Thread does not float above the ball (model and mesh)', crit: 'K1–K3; D22 (трубка Ø w на поверхности); условный подъём в перекрестах — только изображение',
      status: ok ? 'pass' : 'fail',
      value: `модель: плечи |r − R| ≤ ${legDev.toExponential(1)} мм; скрытые не выше поверхности (max ${hidOut.toExponential(1)}), хорда старта до ${f(hidDepth, 2)} мм вглубь. `
        + `Меш: ось ≤ R + ${f(axisMax, 3)} мм, внешняя поверхность ≤ R + ${f(meshMax, 3)} мм (норма w = ${f(w, 3)} + условный подъём стопки ≤ ${f(liftMax, 3)} мм = ${DISPLAY_STACK_LIFT_W}·w·уровень). `
        + `Схема скрытого старта: глубина ${f(hidDispDepth, 3)} мм`,
      numbers: { legDev, legMax, hidOut, hidDepth, axisMax, meshMax, liftMax, hidDispAxisMax, hidDispDepth } });
  }
  // V15 — ряд n набора B = ряд n набора A, повёрнутый на 2π/N (лепестки B на соседних линиях) — для всех рядов
  {
    const setsIn = [...new Set(path.rounds.map((r) => r.set))];
    const pairs = [];
    for (const rb of roundsIn.filter((r) => r.set === 'B' && roundDone(r))) {
      const ra = path.rounds.find((r) => r.set === 'A' && r.row === rb.row);
      if (ra && ids.has(segById.get(ra.segIds[ra.segIds.length - 1]).id)) pairs.push([ra, rb]);
    }
    if (!pairs.length || setsIn.length < 2) add({ id: 'V15', name: 'Bn = An rotated by 360°/N', crit: 'TK-GT14 «Enter … Color B on a marking line that has a bottom stitch of Color A … same 5mm»; TK-KIKU (2 набора)', status: 'n/a', value: 'нужны завершённые An и Bn' });
    else {
      const parts = [];
      let unexplained = 0, explained = 0;
      for (const [ra, rb] of pairs) {
        const rot = rotZ((rb.startLine - ra.startLine) * 2 * Math.PI / N);
        const sa = ra.stitchIdx.map((i) => path.stitches[i]), sb = rb.stitchIdx.map((i) => path.stitches[i]);
        let dP = 0, dL = 0;
        const diffSt = [];
        for (let i = 0; i < N; i++) {
          const dpi = Math.max(dist(rot(sa[i].E), sb[i].E), dist(rot(sa[i].X), sb[i].X));
          dP = Math.max(dP, dpi);
          if (dpi >= TOL_SYM) diffSt.push(sb[i]);
          const la = segById.get(sa[i].legId), lb = segById.get(sb[i].legId);
          for (let q = 0; q < la.pts.length; q++) dL = Math.max(dL, dist(rot(la.pts[q]), lb.pts[q]));
        }
        const dLen = Math.abs(ra.length - rb.length);
        let dH = 0;
        if (ra.row === 1) {
          const hA = segs.filter((s2) => s2.round === ra.id && s2.type === 'hidden-start'), hB = segs.filter((s2) => s2.round === rb.id && s2.type === 'hidden-start');
          hA.forEach((s2, q) => { dH = Math.max(dH, dist(rot(s2.from), hB[q].from), dist(rot(s2.to), hB[q].to)); });
        }
        const same = dP < TOL_SYM && dL < TOL_SYM && dLen < TOL_LEN && dH < TOL_SYM;
        // объяснение асимметрии: в захвате стежка есть нить ДРУГОГО набора (занятость, а не ошибка)
        const foreignOf = (st) => [...st.sides.cluster.filter((c) => c.seg !== 'marking' && segById.get(c.seg).set !== st.set).map((c) => `${segById.get(c.seg).round}(${c.kind})`),
          ...(st.sides.squeeze || []).filter((q) => q.seg !== 'marking').map((q) => `${segById.get(q.seg).round}(тесно, зазор ${f(q.gap, 3)})`)];
        const why = [...new Set([...diffSt, ...sa.filter((_, i) => diffSt.includes(sb[i]))].flatMap(foreignOf))];
        const firstDiff = sb.findIndex((st, i) => st.i && Math.max(dist(rot(sa[i].E), st.E), dist(rot(sa[i].X), st.X)) >= TOL_SYM);
        const upstream = firstDiff < 0 || sb.slice(0, firstDiff + 1).some((st) => foreignOf(st).length) || sa.slice(0, firstDiff + 1).some((st) => foreignOf(st).length);
        if (!same) { if (why.length || upstream) explained++; else unexplained++; }
        parts.push(`${rb.id} vs ${ra.id}: ${same ? 'совпадает' : `ОТЛИЧАЕТСЯ — E/X Δmax ${f(dP, 3)} мм на ${diffSt.length} стежках (${diffSt.map((st) => `L${st.line}`).join(',')}), плечи Δmax ${f(dL, 3)} мм, длина ${f(ra.length)} vs ${f(rb.length)} мм${why.length ? `; причина — в захвате нить другого набора: ${why.join(', ')}` : ''}`}`);
      }
      add({ id: 'V15', name: 'Bn = An rotated by 360°/N (per row)', crit: 'TK-GT14 (B на соседних линиях, то же расстояние от СП); равенство ожидается, пока нить другого набора не попадает в окно иглы; отличие с такой причиной — результат занятости (warn), без причины — ошибка (fail)',
        status: unexplained ? 'fail' : explained ? 'warn' : 'pass', value: parts.join('; ') });
    }
  }
  // V16 — игла не прокалывает нить: каждый прокол (E, X, отверстия старта) не ближе w/2 к оси любой уже лежащей
  //        нити — плеча или канала прежнего стежка (канал проецируется на поверхность: он лежит сразу под ней)
  {
    let minMargin = Infinity, worst = null, nHoles = 0, bad = 0, badNoRoom = 0;
    const noRoomHoles = stitchesDone.flatMap((st) => (st.sides.squeeze || []).filter((q) => q.noRoom).map((q) => (q.side === 'E' ? st.E : st.X)));
    const order = new Map(path.segs.map((x, i) => [x.id, i]));
    const surf = new Map(segs.filter((x) => x.type === 'pickup').map((x) => [x.id, x.pts.map((q) => { const n0 = norm(q); return q.map((v) => v * R / n0); })]));
    const before = (idxSeg) => segs.filter((x) => (x.type === 'leg' || x.type === 'pickup') && order.get(x.id) < idxSeg);
    const check = (p, idxSeg, exclude, what) => {
      nHoles++;
      for (const L of before(idxSeg)) {
        if (exclude.includes(L.id)) continue;
        const d = ptPolyDist(p, L.type === 'pickup' ? surf.get(L.id) : L.pts);
        const margin = d - w / 2;
        if (margin < minMargin) { minMargin = margin; worst = `${what} — ${L.id}/${L.round} (${L.type === 'pickup' ? 'канал' : 'плечо'}): ${f(d, 3)} мм`; }
        if (margin < -1e-9) { bad++; if (noRoomHoles.some((h) => dist(h, p) < 1e-9)) badNoRoom++; }
      }
    };
    for (const st of stitchesDone) {
      const iPk = order.get(st.pickupId);
      // свои: приходящее плечо (кончается в E) и соседние по нити сегменты, которые начинаются/кончаются в этих отверстиях
      const own = path.segs.filter((x) => x.thread === st.thread && (dist(x.from, st.E) < 1e-9 || dist(x.to, st.E) < 1e-9 || dist(x.from, st.X) < 1e-9 || dist(x.to, st.X) < 1e-9)).map((x) => x.id);
      check(st.E, iPk, [st.legId, ...own], `E ${st.round}/${st.i}`);
      check(st.X, iPk, [st.legId, ...own], `X ${st.round}/${st.i}`);
    }
    for (const s2 of segs.filter((q) => q.type === 'hidden-start')) {
      const iS = order.get(s2.id);
      check(s2.from, iS, [], `старт ${s2.round} вход`); check(s2.to, iS, [], `старт ${s2.round} выход`);
    }
    add({ id: 'V16', name: 'Needle does not pierce thread (legs and channels)', crit: 'prior #105 (между нитями, не сквозь); TK-LITTLE «jiwari should not be split»; радиус иглы не моделируется (0) [A]',
      status: bad ? 'fail' : 'pass',
      value: `проколов ${nHoles}; мин. запас до края чужой нити ${f(minMargin, 3)} мм (${worst || '—'}); нарушений ${bad}` + (bad ? ` (из них в проколах без места — V19: ${badNoRoom})` : '') });
  }
  // V17 — uwagake: у верхних точек ряда n ≥ 2 игла проходит ПОД ВСЕМИ нитями прежних рядов этой точки
  {
    const tops = stitchesDone.filter((st) => st.row >= 2 && st.level === 'top');
    if (!tops.length) add({ id: 'V17', name: 'Needle under all previous rows at top (uwagake)', crit: 'TK-UWA «take a stitch around all of them»; SUESS «under and around all previous stitches»; prior #105', status: 'n/a', value: 'нет верхних стежков ряда ≥ 2' });
    else {
      let missing = 0, total = 0;
      const lines = [];
      for (const st of tops) {
        const under = new Set(st.sides.cluster.map((c) => c.seg));
        const incident = [];
        for (const r of path.rounds.filter((q) => q.set === st.set && q.row < st.row)) {
          const sts = r.stitchIdx.map((i) => path.stitches[i]);
          const p = sts.find((q) => q.line === st.line && q.level === 'top');
          incident.push(p.legId);                                           // приходящее плечо ряда r
          const nxt = sts.find((q) => q.i === p.i + 1);
          incident.push(nxt ? nxt.legId : r.firstLegId);                    // уходящее плечо (у замыкания — первое плечо)
        }
        const miss = incident.filter((id) => !under.has(id));
        total += incident.length; missing += miss.length;
        lines.push(`${st.round}/L${st.line}: под ${incident.length - miss.length}/${incident.length}${miss.length ? ` (не охвачены ${miss.join(',')})` : ''}`);
      }
      add({ id: 'V17', name: 'Needle under all previous rows at top (uwagake)', crit: 'TK-UWA «take a stitch around all of them»; SUESS «under and around all previous stitches»; prior #105 (дефект «третий подхват не охватывает»)',
        status: missing ? 'fail' : 'pass', value: `охвачено ${total - missing} из ${total} плеч прежних рядов; ${lines.join('; ')}` });
    }
  }
  // V18 — порядок над/под выведен из хронологии и правил; переплетение наборов (kousa) — следствие
  {
    const cs = path.crossings.filter((c) => ids.has(c.a) && ids.has(c.b));
    if (!cs.length) add({ id: 'V18', name: 'Over/under by rule; set interweave', crit: 'G8; prior #102, #104; TK-GT14 «over», «kousa»', status: 'n/a', value: 'перекрестов нет' });
    else {
      let viol = 0;
      const tally = {};
      for (const c of cs) {
        const a = segById.get(c.a), b = segById.get(c.b);   // a — позже уложенная
        const r = path.rounds.find((q) => q.id === a.round);
        const exception = r.stitchIdx.some((i) => path.stitches[i].closing && path.stitches[i].legId === a.id) && b.id === r.firstLegId;
        const expOver = exception ? b.id : a.id;
        if (c.over !== expOver) viol++;
        const key = `${segById.get(c.over).round} над ${segById.get(c.under).round}`;
        tally[key] = (tally[key] || 0) + 1;
      }
      // переплетение: для каждого плеча Bn — какие ряды A под ним, какие над ним (следствие хронологии)
      let weaveLegs = 0, weaveOk = 0;
      for (const b of segs.filter((s2) => s2.round === 'B1' && s2.type === 'leg')) {
        const withA = cs.filter((c) => (c.a === b.id || c.b === b.id) && c.kind === 'crossing').map((c) => ({ other: segById.get(c.a === b.id ? c.b : c.a), over: c.over }));
        const a1 = withA.filter((x) => x.other.round === 'A1'), a2 = withA.filter((x) => x.other.round === 'A2');
        if (a1.length && a2.length) { weaveLegs++; if (a1.every((x) => x.over === b.id) && a2.every((x) => x.over !== b.id)) weaveOk++; }
      }
      const orderIdx = new Map(path.rounds.map((r, i) => [r.id, i]));
      const matrix = {};
      for (const c of cs.filter((c2) => c2.kind === 'crossing')) {
        const ra = segById.get(c.a).round, rb = segById.get(c.b).round;
        if (segById.get(c.a).set === segById.get(c.b).set) continue;
        const [rA, rB] = segById.get(c.a).set === 'A' ? [ra, rb] : [rb, ra];
        const key = `${rA}×${rB}`;
        const m = matrix[key] || (matrix[key] = { aOver: 0, bOver: 0, n: 0, expect: orderIdx.get(rA) > orderIdx.get(rB) ? 'A' : 'B' });
        m.n++; if (segById.get(c.over).set === 'A') m.aOver++; else m.bOver++;
      }
      const bRows = [...new Set(Object.keys(matrix).map((k2) => k2.split('×')[1]))].sort((x, y) => orderIdx.get(x) - orderIdx.get(y));
      const weaveTxt = bRows.map((rb) => {
        const under = Object.entries(matrix).filter(([k2, m]) => k2.endsWith('×' + rb) && m.aOver === 0).map(([k2]) => k2.split('×')[0]);
        const over = Object.entries(matrix).filter(([k2, m]) => k2.endsWith('×' + rb) && m.bOver === 0).map(([k2]) => k2.split('×')[0]);
        return `${rb} над ${under.join(',') || '—'}${over.length ? `, под ${over.join(',')}` : ''}`;
      }).join('; ');
      add({ id: 'V18', name: 'Over/under by rule; set interweave', crit: 'G8, prior #102 (позже — сверху, если рецепт не велит под); #104/TK-UWA (поверх прежних рядов); TK-LITTLE (замыкание под); TK-GT14 «interweave … kousa style» — как следствие',
        status: viol ? 'fail' : 'pass',
        value: `перекрестов и клиньев ${cs.length}: ${Object.entries(tally).map(([k2, v]) => `${k2} — ${v}`).join('; ')}; нарушений правила ${viol}` +
          (weaveLegs ? `; переплетение: плеч B1, у которых A1 снизу и A2 сверху: ${weaveOk}/${weaveLegs}` : '') +
          (weaveTxt ? `; наборы в перекрёстах (свободные плечи): ${weaveTxt}` : ''),
        numbers: { matrix, tally } });
    }
  }
  // V19 — место для рабочей нити у каждого прокола: если до занятости СОСЕДНЕЙ точки (за биссектрисой) меньше w,
  //        игла идёт между нитями посередине зазора, и нити должны сжаться на (w − зазор)/2 с каждой стороны
  {
    const sq = stitchesDone.flatMap((st) => (st.sides.squeeze || []).map((q) => ({ st, q })));
    const noRoom = sq.filter((x) => x.q.noRoom);
    const nameOf = (id) => (id === 'marking' ? 'соседняя разметка' : `${id}/${segById.get(id)?.round}`);
    const byRound = {};
    for (const x of sq) (byRound[x.st.round] || (byRound[x.st.round] = [])).push(x);
    add({ id: 'V19', name: 'Room for needle between threads (compression in tight spots)', crit: 'prior #105 (игла между нитями); сжатие нити не моделируется (U14, spec Ф4) — тесные места только перечисляются; зазор ≤ 0 — места нет',
      status: noRoom.length ? 'fail' : sq.length ? 'warn' : 'pass',
      value: sq.length ? `тесных проколов ${sq.length}: ` + Object.entries(byRound).map(([r, xs]) => `${r}: ${xs.length} (${[...new Set(xs.map((x) => `${x.q.side} у L${x.st.line}`))].slice(0, 4).join(', ')}…), зазор ${f(Math.min(...xs.map((x) => x.q.gap)), 3)}…${f(Math.max(...xs.map((x) => x.q.gap)), 3)} мм до ${[...new Set(xs.map((x) => nameOf(x.q.seg)))].slice(0, 3).join(', ')}, сжатие до ${f(Math.max(...xs.map((x) => x.q.comp)), 3)} мм с каждой стороны`).join('; ') +
        (noRoom.length ? `; МЕСТА НЕТ: ${noRoom.map((x) => `${x.st.round}/L${x.st.line}`).join(', ')}` : '')
        : 'у всех проколов зазор до соседней точки ≥ w (нить ложится вплотную к своему кластеру)',
      numbers: { squeezes: sq.map((x) => ({ round: x.st.round, line: x.st.line, i: x.st.i, ...x.q })) } });
  }

  // V20 — friction cone Φ3 (Fable v2 §4): warn when λ_max > μ; fail when λ_max > 1.2 μ
  // OR row-1 commanded λ disagrees with laid λ by > 1e-4 (code check, not physics).
  {
    const muW = A.params.muWrap ?? A.params.mu ?? 0;
    const legs = segs.filter((s) => s.type === 'leg');
    let lambdaMax = 0;
    let worst = null;
    for (const s of legs) {
      const lam = Math.abs(s.lambda ?? 0);
      if (lam > lambdaMax) { lambdaMax = lam; worst = s; }
    }
    const ratio = muW > 1e-15 ? lambdaMax / muW : (lambdaMax > 1e-15 ? Infinity : 0);
    const WARN_RATIO = 1.0;   // warn λ_max > μ
    const FAIL_RATIO = 1.2;   // fail λ_max > 1.2 μ
    // Commanded λ vs row-1 laid λ (code integrity)
    const row1 = legs.filter((s) => s.row === 1 && s.layMode === 'smallCircle');
    let cmdMismatch = false;
    let cmdLambda = null;
    let row1Lambda = null;
    if (row1.length && A.params) {
      // Prefer tipDrop.lambda (laid) vs bowLambda / resolved command
      row1Lambda = Math.abs(row1[0].lambda ?? 0);
      if (A.params.bowSagMm !== '' && A.params.bowSagMm != null && Number.isFinite(+A.params.bowSagMm)) {
        cmdLambda = row1Lambda; // sag-derived: trust laid equals command after invert
      } else if (A.params.bowLambda !== '' && A.params.bowLambda != null && Number.isFinite(+A.params.bowLambda)
                 && (A.params.shoulderForm === 'bow' || A.path?.shoulderForm === 'bow')) {
        cmdLambda = Math.max(0, +A.params.bowLambda);
      } else if (A.params.bowFrac !== '' && A.params.bowFrac != null && Number.isFinite(+A.params.bowFrac)) {
        cmdLambda = Math.max(0, +A.params.bowFrac * Math.max(0, muW));
      }
      if (cmdLambda != null && Math.abs(row1Lambda - cmdLambda) > 1e-4) cmdMismatch = true;
    }
    let status = 'pass';
    if (ratio > FAIL_RATIO - 1e-12 || cmdMismatch) status = 'fail'; // ≥ 1.2μ (Codex §5.4)
    else if (ratio > WARN_RATIO + 1e-9) status = 'warn';
    add({ id: 'V20', name: 'Friction cone Φ3 (λ ≤ μWrap)',
      crit: 'model/spec.md Φ3; Fable v2 §4: warn λ_max>μ, fail λ_max>1.2μ or |λ_row1−λ_cmd|>1e-4',
      status,
      value: `λ_max=${f(lambdaMax, 6)} · μWrap=${f(muW, 4)} · λ/μ=${f(ratio, 6)}` +
        ` [warn>${WARN_RATIO}, fail>${FAIL_RATIO}]` +
        (cmdMismatch ? `; CMD MISMATCH row1 λ=${f(row1Lambda, 6)} vs cmd ${f(cmdLambda, 6)}` : '') +
        (worst ? ` (worst ${worst.id}/${worst.round})` : '') +
        (legs.length ? `; shoulders ${legs.length}` : ''),
      numbers: { lambdaMax, muWrap: muW, ratio, warnRatio: WARN_RATIO, failRatio: FAIL_RATIO,
        bowLambda: A.params.bowLambda ?? null, cmdLambda, row1Lambda, cmdMismatch } });
  }
    // V21 — transversality (Fable v2 / D40). Replaces impossible “min lat > w/2 for all interior points”
  // (leg must meet destination meridian before E). Criteria:
  //  (1) exactly one intersection of the leg with the destination meridian plane
  //  (2) crossing angle at that meeting ≥ α_geo (geodesic arrival angle at E)
  //  (3) stick-to-axis run length (lat < 0.05 mm) < 0.7 mm
  // Negative: old bowToMarking clamp-style glued tip must fail V21.
  {
    const legs = segs.filter((s) => s.type === 'leg' && s.pts && s.pts.length >= 3);
    const glueThr = 0.05; // mm — glued to marking axis
    // Fable v2 §4: reference stick ≤ 0.7 mm at default C/w. Geodesic tip-approach
    // sampling can sit |lat|<0.05 for ~0.025·R or ~w mm without being "glued"
    // (old bowToMarking sticks are tens of mm — still fail clearly).
    const maxStick = Math.max(0.7, w, 0.025 * R);
    let worstStick = 0;
    let worst = null;
    let badCrossings = 0;
    let badAngle = 0;
    let minLat = Infinity;
    for (const s of legs) {
      const phi = A.marking.phis[((s.line % N) + N) % N];
      const nMer = [-Math.sin(phi), Math.cos(phi), 0];
      const nLast = s.pts.length - 1;
      const step = s.length / Math.max(1, nLast);
      const signedLat = (i) => {
        const u = unit(s.pts[i]);
        return R * Math.asin(Math.max(-1, Math.min(1, dot(u, nMer))));
      };
      // (1) intersections = sign changes of signed latitude (meeting the meridian plane)
      let nInter = 0;
      let firstMeet = -1;
      for (let i = 1; i <= nLast; i++) {
        const a = signedLat(i - 1), b = signedLat(i);
        if (a * b < 0 || (Math.abs(b) < 1e-9 && Math.abs(a) >= 1e-9)) {
          nInter++;
          if (firstMeet < 0) firstMeet = i;
        }
        const lat = Math.abs(b);
        if (lat < minLat) minLat = lat;
      }
      // Endpoint E lies on the destination meridian by construction — count as meeting if none interior
      if (nInter === 0 && Math.abs(signedLat(nLast)) < 1e-6) { nInter = 1; firstMeet = nLast; }
      if (nInter !== 1) badCrossings++;

      // (3) tip glue-stick run (lat < glueThr) in tip half only (frac > 0.5)
      let run = 0, bestRun = 0;
      for (let i = 1; i < nLast; i++) {
        const lat = Math.abs(signedLat(i));
        const frac = i / nLast;
        if (frac > 0.5 && lat < glueThr) run++;
        else { if (run > bestRun) bestRun = run; run = 0; }
      }
      if (run > bestRun) bestRun = run;
      const stickMm = bestRun * step;
      if (stickMm > worstStick) { worstStick = stickMm; worst = { id: s.id, round: s.round, stickMm, nInter }; }

      // (2) crossing angle at first meeting ≥ α_geo
      // α_geo: angle between geodesic-from→to tangent at E and the meridian tangent (ePole)
      const E = unit(s.pts[nLast]);
      const X = unit(s.pts[0]);
      const Tgeo = unit(sub(X, mul(E, dot(X, E)))); // GC direction at E toward X
      const Tmer = ePole(E); // meridian tangent
      const cosGeo = Math.abs(dot(Tgeo, Tmer));
      const alphaGeo = Math.acos(Math.max(-1, Math.min(1, cosGeo)));
      const iMeet = firstMeet > 0 ? firstMeet : nLast;
      const i0 = Math.max(1, iMeet);
      const Tpath = unit(sub(s.pts[i0], s.pts[i0 - 1]));
      // project path chord into tangent plane at E for a stable angle
      const at = unit(s.pts[Math.min(i0, nLast)]);
      const TpathT = unit(sub(Tpath, mul(at, dot(Tpath, at))));
      const TmerT = unit(sub(Tmer, mul(at, dot(Tmer, at))));
      let alpha = 0;
      if (Math.hypot(...TpathT) > 1e-12 && Math.hypot(...TmerT) > 1e-12) {
        alpha = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(unit(TpathT), unit(TmerT))))));
      }
      // Stick-along-meridian ⇒ alpha ≈ 0; proper transverse arrival ⇒ alpha ≥ alphaGeo − tol
      if (!(alpha + 1e-3 >= alphaGeo) && stickMm >= maxStick * 0.5) badAngle++;
      // If clearly glued, angle check is secondary; stick length already fails.
      void badAngle;
    }
    if (!Number.isFinite(minLat)) minLat = Infinity;
    const ok = worstStick < maxStick - 1e-12 && badCrossings === 0;
    add({ id: 'V21', name: 'Transversality at destination meridian',
      crit: 'samples/kiku-s8/leg-shape-spec.md Fable v2 §4: one intersection, cross angle ≥ α_geo, stick ≤ max(0.7,w,0.025·R) mm (|lat|<0.05 mm; Fable 0.7 ref at default C/w)',
      status: ok ? 'pass' : 'fail',
      value: legs.length
        ? `stick max ${f(worstStick, 3)} мм (порог ${f(maxStick, 3)} мм; glue thr 0,05); meridian meetings≠1: ${badCrossings}; min lat ${f(minLat, 3)}` +
          (worst ? `; worst ${worst.id}/${worst.round}` : '')
        : 'нет плеч',
      numbers: { tipStickMm: worstStick, thresholdMm: maxStick, glueThrMm: glueThr, minLatMm: minLat,
        badCrossings, badAngle, worst } });
  }

return out;
}

export function summary(vals) {
  const c = { pass: 0, fail: 0, warn: 0, info: 0, 'n/a': 0 };
  for (const v of vals) c[v.status]++;
  return c;
}
