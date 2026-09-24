// Валидаторы — чистые функции над результатом конвейера (или его префиксом до операции k).
// Каждый: id, название (рус.), критерий criteria.md / основание, статус pass|fail|warn|info|n/a, числа.
// Работа может содержать несколько обходов и нитей (A1, B1, A2 …): проверки идут по префиксу, по нитям и по обходам.
import { dist, norm, toSPhi, dot, unit, sub, ePole, eEast, haversineLen, point, cross, segSegDist } from './geom.js';
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
    add({ id: 'V1', name: 'Каждая нить непрерывна', crit: 'K13; prior #112 (одна нить на цвет — один путь); GT14 «Return to Color A»',
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
    for (const s of segs.filter((s) => s.type === 'leg')) {
      const a = toSPhi(R, s.from), b = toSPhi(R, s.to);
      hvMax = Math.max(hvMax, Math.abs(haversineLen(R, a.s, a.phi, b.s, b.phi) - s.length));
    }
    ok = ok && hvMax < 1e-9;
    add({ id: 'V2', name: 'Баланс длины по каждой нити: u = Σ сегментов', crit: 'K13; model/spec.md §5; одна нить — один баланс (#112)',
      status: ok ? 'pass' : 'fail',
      value: threadIds.map((t) => { const p = per[t]; return `нить ${t}: Σ = ${f(p.sum)} мм = u ${f(p.du)} (${Object.entries(p.rounds).map(([r, L]) => `${r} ${f(L)}`).join(', ')}; старт ${f(p.by['hidden-start'] || 0)}, плечи ${f(p.by.leg || 0)}, захваты ${f(p.by.pickup || 0)})`; }).join('; ') +
        `; гаверсинус vs вектор: ${f(hvMax, 12)} мм`,
      numbers: { per } });
  }
  // V3 — согласие обхода A1 с calc.py (независимая реализация, numpy)
  {
    const A1 = path.rounds[0];
    const a1Segs = segs.filter((s) => s.round === A1.id);
    const a1St = stitchesDone.filter((st) => st.round === A1.id);
    const e = ref && ref.entries ? ref.entries.find((x) => x.key === refKey(A)) : null;
    if (!e) add({ id: 'V3', name: 'Согласие A1 с calc.py', crit: 'кросс-проверка двух реализаций', status: 'info',
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
      add({ id: 'V3', name: 'Согласие A1 с calc.py', crit: 'кросс-проверка двух реализаций одной геометрии',
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
    add({ id: 'V4', name: 'Захват ⟂ линии, против хода, под поверхностью', crit: 'OLY-BASIC «垂直に», «逆方向»; TK-LITTLE «right angle»',
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
    add({ id: 'V5', name: 'Стежки на своих линиях и уровнях', crit: 'K1 (набор A: верх на чётных; B — на нечётных), K2 (разброс низа ряда ≤ 1 мм [A]), K3 (разброс верха ≤ 0,5 мм [A])',
      status: stitchesDone.length ? (ok ? 'pass' : 'fail') : 'n/a',
      value: `ошибок линии/уровня ${wrongLine}; разброс s по обходам: ${spreads.map((x) => `${x.r} низ ${f(x.b)}, верх ${f(x.t)}`).join('; ')} мм; захват задевает соседнюю линию: ${reach}` });
  }
  // V6 — симметрия лепестков внутри обхода: поворот на 2·(2π/N) переводит плечо i в плечо i+2
  {
    const done = roundsIn.filter(roundDone);
    if (!done.length) add({ id: 'V6', name: 'Симметрия лепестков в обходе', crit: 'K1', status: 'n/a', value: 'только для полного обхода' });
    else {
      const rot = rotZ(2 * (2 * Math.PI / N));
      const parts = [];
      let ok = true;
      for (const r of done) {
        const sts = r.stitchIdx.map((i) => path.stitches[i]);
        let dLeg = 0, dPk = 0, nCmp = 0;
        for (let i = 0; i < N; i++) {
          const j = (i + 2) % N;
          const special = (q) => (r.begin === 'resume' && q === 0);   // первое плечо продолженной нити идёт от X парковки
          if (special(i) || special(j)) continue;
          const a = segById.get(sts[i].legId).pts.map(rot), b = segById.get(sts[j].legId).pts;
          for (let q = 0; q < a.length; q++) dLeg = Math.max(dLeg, dist(a[q], b[q]));
          if (!sts[i].closing && !sts[j].closing) dPk = Math.max(dPk, dist(rot(sts[i].E), sts[j].E), dist(rot(sts[i].X), sts[j].X));
          nCmp++;
        }
        const reg = sts.find((st) => st.level === 'top' && !st.closing), cl = sts.find((st) => st.closing);
        const extra = reg.xOff - cl.xOff;
        if (!(dLeg < TOL_SYM && dPk < TOL_SYM && extra > 0)) ok = false;
        parts.push(`${r.id}: плечи ${f(dLeg, 12)} мм (${nCmp} пар${r.begin === 'resume' ? ', без первого плеча от парковки' : ''}), E/X ${f(dPk, 12)} мм; замыкающий захват шире на ${f(extra, 4)} мм (охватывает начало обхода)`);
      }
      add({ id: 'V6', name: 'Симметрия лепестков в обходе', crit: 'K1; TK-KIKU', status: ok ? 'pass' : 'fail', value: parts.join('; ') });
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
    add({ id: 'V7', name: 'Плечи на поверхности, скрытые участки внутри', crit: 'геометрия: плечо лежит на опоре (K10), канал иглы в обмотке',
      status: ok ? 'pass' : 'fail',
      value: `мин. радиус плеч − R = ${f(minR - R, 9)} мм; макс. радиус скрытых − R = ${f(maxHidden - R, 9)} мм; глубина: старт до ${f(depthStart, 2)} мм, захват до ${f(depthPk, 4)} мм (хорда — нижняя оценка)` });
  }
  // V8 — нет взаимопроникновения уложенных нитей, кроме разрешённого правилами (перекрест, клин uwagake, захват, стык)
  {
    const pairKey = (a, b) => [a, b].sort().join('|');
    const expected = new Map();
    for (const t of threadIds) { const ts = segs.filter((s) => s.thread === t); for (let i = 1; i < ts.length; i++) expected.set(pairKey(ts[i - 1].id, ts[i].id), 'стык'); }
    for (const c of path.crossings) if (ids.has(c.a) && ids.has(c.b) && c.allowed) expected.set(pairKey(c.a, c.b), c.kind === 'wedge' ? 'клин uwagake (поверх прежнего ряда)' : 'перекрест (над/под по правилу)');
    for (const st of stitchesDone) {
      for (const c of st.sides.cluster) {
        if (c.seg === 'marking') continue;
        expected.set(pairKey(st.pickupId, c.seg), 'захват охватывает уложенную нить');
        const cs = segById.get(c.seg);
        const prevOfThread = path.segs.filter((x) => x.thread === cs.thread && x.u1 <= cs.u0 + 1e-12).pop();
        if (c.kind === 'hole-exit' && prevOfThread) expected.set(pairKey(st.pickupId, prevOfThread.id), 'захват охватывает нить у её выхода');
      }
    }
    // оси: видимое плечо — нить диаметра w на поверхности (ось на R + w/2); скрытые — по каналу
    const lift = (R + w / 2) / R;
    const axis = segs.map((s) => (s.type === 'leg' ? s.pts.map((p) => [p[0] * lift, p[1] * lift, p[2] * lift]) : s.pts));
    const boxes = axis.map(bbox);
    const found = [], bad = [], warnList = [];
    const order = new Map(path.segs.map((x, i) => [x.id, i]));
    const nextOf = (h) => path.segs.find((x) => x.thread === h.thread && Math.abs(x.u0 - h.u1) < 1e-12);
    const classify = (P, Q, md) => {
      const k = pairKey(P.id, Q.id);
      if (expected.has(k)) return expected.get(k);
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
    add({ id: 'V8', name: 'Нет взаимопроникновения, кроме разрешённого правилами', crit: 'K14: расстояние осей ≥ w (трубка Ø w); разрешено: перекрест с записанным над/под, клин uwagake у верхней точки, захват, стык',
      status: bad.length || notAllowed.length ? 'fail' : warnList.length ? 'warn' : 'pass',
      value: `зон сближения < w: ${Object.entries(cnt).map(([k2, v]) => `${k2} — ${v}`).join('; ')}; неожиданных ${bad.length + notAllowed.length}` + wedgeTxt +
        (bad.length ? ': ' + bad.slice(0, 6).map((b) => `${b.a}×${b.b} s=${f(b.s, 1)} d=${f(b.d, 3)}`).join('; ') : '') +
        (warnList.length ? `; предупреждения (скрытые нити в обмотке ближе w, радиальное сжатие не моделируется): ${warnList.join('; ')}` : ''),
      details: { found, bad, notAllowed, warnList } });
  }
  // V9 — выведенная ширина захвата ряда 1 против источников (проверка, не навязывание)
  {
    const reg = stitchesDone.filter((st) => st.row === 1 && !st.closing).map((st) => st.eOff - st.xOff);
    if (!reg.length) add({ id: 'V9', name: 'Выведенный захват ряда 1 vs источники', crit: 'TK-LITTLE «about 1-2 mm», TK-KAGARI «about 2mm»', status: 'n/a', value: '—' });
    else {
      const lo = Math.min(...reg), hi = Math.max(...reg), inRange = lo >= 1 - 1e-9 && hi <= 2 + 1e-9;
      add({ id: 'V9', name: 'Выведенный захват ряда 1 vs источники', crit: 'TK-LITTLE «about 1-2 mm», TK-KAGARI «about 2mm» (проверка следствия)',
        status: inRange ? 'pass' : 'warn',
        value: `обычный захват = m + w = ${f(lo)}…${f(hi)} мм (m = ${f(m, 2)}, w = ${f(w, 3)}); ${inRange ? 'в диапазоне 1–2 мм' : 'ВНЕ «about 1–2 mm» — проверьте m, w'}` });
    }
  }
  // V10 — замыкание каждого обхода: последнее плечо ПОД первым плечом обхода, стежок охватывает начало обхода
  {
    const done = roundsIn.filter(roundDone);
    if (!done.length) add({ id: 'V10', name: 'Замыкание обходов', crit: 'TK-LITTLE; TK-GT14', status: 'n/a', value: 'нет завершённых обходов' });
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
      add({ id: 'V10', name: 'Замыкание обходов', crit: 'TK-LITTLE «Carry the working thread under the starting thread … then complete the stitch» (ряд 1, a); ряд n — тот же приём (b); TK-GT14 «Complete the stitch … park»',
        status: ok ? 'pass' : 'fail', value: parts.join('; ') });
    }
  }
  // V11 — происхождение: слои посчитаны из текущих родителей (нет утечки старой геометрии)
  {
    const okChain = A.marking.parents[0] === A.base.stamp && A.layout.parents[1] === A.marking.stamp &&
      A.rowPlan.parents[2] === A.layout.stamp && A.path.parents[3] === A.rowPlan.stamp && A.path.parents[0] === A.base.stamp;
    const Rchk = segs.every((s) => s.type !== 'leg' || Math.abs(norm(s.from) - R) < 1e-9);
    add({ id: 'V11', name: 'Цепочка слоёв свежая', crit: 'требование параметричности: base → marking → layout → rowPlan → path',
      status: okChain && Rchk ? 'pass' : 'fail',
      value: `штампы: base ${A.base.stamp} → marking ${A.marking.stamp} → layout ${A.layout.stamp} → rowPlan ${A.rowPlan.stamp} → path ${A.path.stamp}; все плечи на текущем R: ${Rchk ? 'да' : 'нет'}` });
  }
  // V12 — план рядов (формула замысла) против выведенных уровней ряда 2
  {
    const rp = A.rowPlan, last = rp.rows[rp.rows.length - 1];
    const r2 = roundsIn.find((r) => r.row === 2 && roundDone(r));
    let cmp = '';
    if (r2 && rp.rows[1]) {
      const sts = r2.stitchIdx.map((i) => path.stitches[i]);
      const b = sts.find((st) => st.level === 'bottom'), t = sts.find((st) => st.level === 'top');
      cmp = `; ряд 2 выведен: верх ${f(t.s, 3)} (план ${f(rp.rows[1].sTop, 3)}), низ ${f(b.s, 3)} (план ${f(rp.rows[1].sBot, 3)}; формула w/sin α у кончика — приближение)`;
    }
    const beyond = rp.rows.some((r) => r.beyondLimit);
    add({ id: 'V12', name: 'План рядов (замысел) vs выведенные уровни', crit: 'K12; TK-GT14 «Work to the equator»',
      status: beyond ? 'warn' : 'info',
      value: `по плану рядов: ${rp.nRows}; последний кончик s = ${f(last.sBot, 2)} мм, предел ${f(rp.limit, 2)} мм${beyond ? ' — кончики ЗА пределом' : ''}` + cmp });
  }
  // V13 — «каждый следующий верх примерно на нить ниже и шире» — СЛЕДСТВИЕ занятости, сверяется с источником
  {
    const rows = [];
    for (const r of roundsIn.filter((q) => q.row >= 2 && roundDone(q))) {
      const prev = path.rounds.find((q) => q.set === r.set && q.row === r.row - 1);
      const sts = r.stitchIdx.map((i) => path.stitches[i]).filter((st) => st.level === 'top');
      const pst = prev.stitchIdx.map((i) => path.stitches[i]).filter((st) => st.level === 'top');
      for (const st of sts) {
        const p = pst.find((q) => q.line === st.line);
        rows.push({ r: r.id, line: st.line, closing: st.closing, dS: st.s - p.s, dE: st.eOff - p.eOff, dX: p.xOff - st.xOff, W: st.eOff - st.xOff, Wp: p.eOff - p.xOff });
      }
    }
    if (!rows.length) add({ id: 'V13', name: 'Верх ряда n+1 «на нить ниже и шире» как следствие', crit: 'TK-GT14, TK-UWA (проверять, не задавать)', status: 'n/a', value: 'нужен завершённый ряд 2' });
    else {
      const reg = rows.filter((x) => !x.closing), cl = rows.filter((x) => x.closing);
      const dW = reg.map((x) => x.W - x.Wp), dS = reg.map((x) => x.dS);
      const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      const lo = 0.5 * w, hi = 2.5 * w;   // «about 1 thread width»: прочтения +w в сумме (#100) и +w с каждой стороны (+2w); допуск ±w/2 [A]
      const inside = dW.every((v) => v >= lo && v <= hi);
      add({ id: 'V13', name: 'Верх ряда n+1 «на нить ниже и шире» как следствие', crit: 'TK-GT14 «about 1 thread width wider and below»; TK-UWA «about 1 thread-width wider and lower»; prior #100 («+w в сумме») — проверка, не вход',
        status: inside ? 'pass' : 'warn',
        value: `ниже на ${f(mean(dS), 3)} мм (= w: адъюнктность каналов, вывод); шире на ${f(mean(dW), 3)} мм в сумме (${f(mean(dW) / w, 2)} w): справа +${f(mean(reg.map((x) => x.dE)), 3)}, слева +${f(mean(reg.map((x) => x.dX)), 3)} мм; ширина ${f(reg[0].Wp, 3)} → ${f(reg[0].W, 3)} мм` +
          (cl.length ? `; замыкающий верх: ${f(cl[0].Wp, 3)} → ${f(cl[0].W, 3)} мм` : '') +
          `. Прочтения источника: +w в сумме = ${f(w, 3)}, +w с каждой стороны = ${f(2 * w, 3)} мм. ${inside ? 'В пределах прочтений.' : 'Меньше обоих прочтений: ряды 1 перекрещиваются почти на оси линии на уровне нового верха (см. A8, U3).'}`,
        numbers: { rows } });
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
    add({ id: 'V14', name: 'Нить не парит над шаром (модель и меш)', crit: 'K1–K3; D22 (трубка Ø w на поверхности); условный подъём в перекрестах — только изображение',
      status: ok ? 'pass' : 'fail',
      value: `модель: плечи |r − R| ≤ ${legDev.toExponential(1)} мм; скрытые не выше поверхности (max ${hidOut.toExponential(1)}), хорда старта до ${f(hidDepth, 2)} мм вглубь. `
        + `Меш: ось ≤ R + ${f(axisMax, 3)} мм, внешняя поверхность ≤ R + ${f(meshMax, 3)} мм (норма w = ${f(w, 3)} + условный подъём стопки ≤ ${f(liftMax, 3)} мм = ${DISPLAY_STACK_LIFT_W}·w·уровень). `
        + `Схема скрытого старта: глубина ${f(hidDispDepth, 3)} мм`,
      numbers: { legDev, legMax, hidOut, hidDepth, axisMax, meshMax, liftMax, hidDispAxisMax, hidDispDepth } });
  }
  // V15 — B1 = A1, повёрнутый на 2π/N (лепестки B на соседних линиях)
  {
    const a1 = path.rounds.find((r) => r.id === 'A1'), b1 = path.rounds.find((r) => r.id === 'B1');
    if (!b1 || !roundDone(b1)) add({ id: 'V15', name: 'B1 = A1, повёрнутый на 360°/N', crit: 'TK-GT14 «Enter … Color B on a marking line that has a bottom stitch of Color A … same 5mm»; TK-KIKU (2 набора)', status: 'n/a', value: 'нужен завершённый B1' });
    else {
      const rot = rotZ((b1.startLine - a1.startLine) * 2 * Math.PI / N);
      const sa = a1.stitchIdx.map((i) => path.stitches[i]), sb = b1.stitchIdx.map((i) => path.stitches[i]);
      let dP = 0, dL = 0, dLen = 0;
      for (let i = 0; i < N; i++) {
        dP = Math.max(dP, dist(rot(sa[i].E), sb[i].E), dist(rot(sa[i].X), sb[i].X));
        const la = segById.get(sa[i].legId), lb = segById.get(sb[i].legId);
        for (let q = 0; q < la.pts.length; q++) dL = Math.max(dL, dist(rot(la.pts[q]), lb.pts[q]));
      }
      dLen = Math.abs(a1.length - b1.length);
      const hA = segs.filter((s) => s.round === 'A1' && s.type === 'hidden-start'), hB = segs.filter((s) => s.round === 'B1' && s.type === 'hidden-start');
      let dH = 0; hA.forEach((s, q) => { dH = Math.max(dH, dist(rot(s.from), hB[q].from), dist(rot(s.to), hB[q].to)); });
      const ok = dP < TOL_SYM && dL < TOL_SYM && dLen < TOL_LEN && dH < TOL_SYM;
      add({ id: 'V15', name: `B1 = A1, повёрнутый на ${f(360 / N, 1)}°`, crit: 'TK-GT14 «Enter … Color B on a marking line that has a bottom stitch of Color A … same 5mm»; TK-KIKU (2 набора); нить A у линий B не лежит в окне иглы — занятость не меняет B1',
        status: ok ? 'pass' : 'fail',
        value: `E/X Δmax ${f(dP, 12)} мм; плечи Δmax ${f(dL, 12)} мм; скрытый старт Δ ${f(dH, 12)} мм; длина обхода A1 ${f(a1.length)} vs B1 ${f(b1.length)} мм (Δ ${f(dLen, 12)})` });
    }
  }
  // V16 — игла не прокалывает нить: каждый прокол (E, X, отверстия старта) не ближе w/2 к оси любой уже лежащей нити
  {
    let minMargin = Infinity, worst = null, nHoles = 0, bad = 0;
    const legsBefore = (uIdxSeg) => segs.filter((s) => s.type === 'leg' && path.segs.indexOf(s) < uIdxSeg);
    const check = (p, idxSeg, exclude, what) => {
      nHoles++;
      for (const L of legsBefore(idxSeg)) {
        if (exclude.includes(L.id)) continue;
        const d = ptPolyDist(p, L.pts);
        const margin = d - w / 2;
        if (margin < minMargin) { minMargin = margin; worst = `${what} — ${L.id}/${L.round}: ${f(d, 3)} мм`; }
        if (margin < -1e-9) bad++;
      }
    };
    for (const st of stitchesDone) {
      const iPk = path.segs.findIndex((s) => s.id === st.pickupId);
      check(st.E, iPk, [st.legId], `E ${st.round}/${st.i}`);
      check(st.X, iPk, [st.legId], `X ${st.round}/${st.i}`);
    }
    for (const s of segs.filter((q) => q.type === 'hidden-start')) {
      const iS = path.segs.indexOf(s);
      check(s.from, iS, [], `старт ${s.round} вход`); check(s.to, iS, [], `старт ${s.round} выход`);
    }
    add({ id: 'V16', name: 'Игла не прокалывает нить', crit: 'prior #105 (между нитями, не сквозь); TK-LITTLE «jiwari should not be split»; радиус иглы не моделируется (0) [A]',
      status: bad ? 'fail' : 'pass',
      value: `проколов ${nHoles}; мин. запас до края чужой нити ${f(minMargin, 3)} мм (${worst || '—'}); нарушений ${bad}` });
  }
  // V17 — uwagake: у верхних точек ряда n ≥ 2 игла проходит ПОД ВСЕМИ нитями прежних рядов этой точки
  {
    const tops = stitchesDone.filter((st) => st.row >= 2 && st.level === 'top');
    if (!tops.length) add({ id: 'V17', name: 'Игла под всеми прежними рядами у верха (uwagake)', crit: 'TK-UWA «take a stitch around all of them»; SUESS «under and around all previous stitches»; prior #105', status: 'n/a', value: 'нет верхних стежков ряда ≥ 2' });
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
      add({ id: 'V17', name: 'Игла под всеми прежними рядами у верха (uwagake)', crit: 'TK-UWA «take a stitch around all of them»; SUESS «under and around all previous stitches»; prior #105 (дефект «третий подхват не охватывает»)',
        status: missing ? 'fail' : 'pass', value: `охвачено ${total - missing} из ${total} плеч прежних рядов; ${lines.join('; ')}` });
    }
  }
  // V18 — порядок над/под выведен из хронологии и правил; переплетение наборов (kousa) — следствие
  {
    const cs = path.crossings.filter((c) => ids.has(c.a) && ids.has(c.b));
    if (!cs.length) add({ id: 'V18', name: 'Над/под по правилу; переплетение наборов', crit: 'G8; prior #102, #104; TK-GT14 «over», «kousa»', status: 'n/a', value: 'перекрестов нет' });
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
      // переплетение: для каждого плеча B1 — пересекающие его плечи A1 снизу, A2 сверху
      let weaveLegs = 0, weaveOk = 0;
      for (const b of segs.filter((s) => s.round === 'B1' && s.type === 'leg')) {
        const withA = cs.filter((c) => (c.a === b.id || c.b === b.id) && c.kind === 'crossing').map((c) => ({ other: segById.get(c.a === b.id ? c.b : c.a), over: c.over }));
        const a1 = withA.filter((x) => x.other.round === 'A1'), a2 = withA.filter((x) => x.other.round === 'A2');
        if (a1.length && a2.length) { weaveLegs++; if (a1.every((x) => x.over === b.id) && a2.every((x) => x.over !== b.id)) weaveOk++; }
      }
      add({ id: 'V18', name: 'Над/под по правилу; переплетение наборов', crit: 'G8, prior #102 (позже — сверху, если рецепт не велит под); #104/TK-UWA (поверх прежних рядов); TK-LITTLE (замыкание под); TK-GT14 «interweave … kousa style» — как следствие',
        status: viol ? 'fail' : 'pass',
        value: `перекрестов и клиньев ${cs.length}: ${Object.entries(tally).map(([k2, v]) => `${k2} — ${v}`).join('; ')}; нарушений правила ${viol}` +
          (weaveLegs ? `; переплетение: плеч B1, у которых A1 снизу и A2 сверху: ${weaveOk}/${weaveLegs}` : '') });
    }
  }
  return out;
}

export function summary(vals) {
  const c = { pass: 0, fail: 0, warn: 0, info: 0, 'n/a': 0 };
  for (const v of vals) c[v.status]++;
  return c;
}
