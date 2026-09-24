// Валидаторы — чистые функции над результатом конвейера (или его префиксом до операции k).
// Каждый: id, название (рус.), критерий criteria.md / основание, статус pass|fail|warn|info|n/a, числа.
import { dist, norm, toSPhi, dot, unit, sub, ePole, eEast, closeZones, haversineLen, wrapPi, point } from './geom.js';
import { prefix } from './layers.js';

const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : String(x));
const TOL_JOIN = 1e-9;        // мм — непрерывность (численный допуск)
const TOL_LEN = 1e-9;         // мм — баланс длины (численный)
const TOL_REF = 1e-6;         // мм — совпадение с calc.py (две независимые реализации одной геометрии)
const TOL_PERP_DEG = 1e-6;    // ° — перпендикулярность: модель строит её точно, допуск численный
const TOL_SYM = 1e-9;         // мм — симметрия лепестков

export function refKey(A) {
  const P = A.params;
  const g = (x) => String(Number(x));
  return `C=${g(P.C_mm)}|w=${g(P.w_mm)}|m=${g(P.m_mm)}|N=${P.N}|sTop=${A.layout.sTop.toFixed(6)}|bfe=${P.bottomFromEq.toFixed(6)}|start=${P.startRule}:${g(P.startRun_mm)}`;
}

/** stage: '2a' | '2b' | число (индекс операции). ref — calc_reference.json (или null). */
export function runValidators(A, stage = '2b', ref = null) {
  const path = A.path;
  const kEnd = typeof stage === 'number' ? stage : path.stageEnd[stage];
  const full = kEnd >= path.ops.length - 1;
  const { ops, segs } = prefix(path, kEnd);
  const R = A.base.R, w = A.params.w_mm, m = A.params.m_mm, N = A.marking.N;
  const out = [];
  const add = (v) => out.push(v);
  const stitchesDone = path.stitches.filter((st) => segs.some((s) => s.id === st.pickupId));

  // V1 — непрерывность одной нити (K13)
  {
    let maxGap = 0, uGap = 0, ids = new Set();
    for (let i = 1; i < segs.length; i++) {
      maxGap = Math.max(maxGap, dist(segs[i - 1].to, segs[i].from));
      uGap = Math.max(uGap, Math.abs(segs[i].u0 - segs[i - 1].u1));
    }
    segs.forEach((s) => ids.add(s.thread));
    const ok = maxGap < TOL_JOIN && uGap < TOL_LEN && ids.size === 1;
    add({ id: 'V1', name: 'Одна непрерывная нить', crit: 'K13; prior #112 (одна нить — один путь)',
      status: ok ? 'pass' : 'fail',
      value: `сегментов ${segs.length}; макс. разрыв ${f(maxGap, 12)} мм; скачок u ${f(uGap, 12)} мм; нитей: ${[...ids].join(',')}` });
  }
  // V2 — баланс материала (spec §5): u_end − u_start = Σ длин; независимая проверка длин плеч гаверсинусом
  {
    const sum = segs.reduce((a, s) => a + s.length, 0);
    const du = segs.length ? segs[segs.length - 1].u1 - segs[0].u0 : 0;
    let hvMax = 0;
    for (const s of segs.filter((s) => s.type === 'leg')) {
      const a = toSPhi(R, s.from), b = toSPhi(R, s.to);
      hvMax = Math.max(hvMax, Math.abs(haversineLen(R, a.s, a.phi, b.s, b.phi) - s.length));
    }
    const by = {};
    for (const s of segs) by[s.type] = (by[s.type] || 0) + s.length;
    const ok = Math.abs(sum - du) < TOL_LEN && hvMax < 1e-9;
    add({ id: 'V2', name: 'Баланс длины: u = Σ сегментов', crit: 'K13; model/spec.md §5',
      status: ok ? 'pass' : 'fail',
      value: `Σ = ${f(sum)} мм = u ${f(du)} мм (скрытый старт ${f(by['hidden-start'] || 0)}, плечи ${f(by.leg || 0)}, захваты ${f(by.pickup || 0)}); гаверсинус vs вектор: ${f(hvMax, 12)} мм`,
      numbers: { sum, du, ...by } });
  }
  // V3 — согласие с calc.py (независимая реализация, numpy)
  {
    const e = ref && ref.entries ? ref.entries.find((x) => x.key === refKey(A)) : null;
    if (!e) add({ id: 'V3', name: 'Согласие с calc.py', crit: 'кросс-проверка двух реализаций', status: 'info',
      value: `эталона для этих параметров нет (${refKey(A)}); запустите python3 sim/tools/calc_reference.py` });
    else {
      let dXY = 0;
      for (const st of stitchesDone) {
        const r = e.stitches[st.i - 1];
        dXY = Math.max(dXY, dist(st.E, r.E), dist(st.X, r.X));
      }
      dXY = Math.max(dXY, dist(path.start.X0, e.X0));
      const rowSegs = segs.filter((s) => s.type !== 'hidden-start');
      const rowLen = rowSegs.reduce((a, s) => a + s.length, 0);
      let refLen, what;
      if (full) { refLen = e.row1_total; what = 'ряд 1 (плечи + захваты)'; }
      else {
        // длина до конца префикса: сумма arms/bites calc.py по тем же операциям
        refLen = 0;
        for (const s of rowSegs) refLen += s.type === 'leg' ? e.arms[s.stitch - 1] : e.bites[s.stitch - 1];
        what = 'префикс ряда 1';
      }
      const hid = segs.filter((s) => s.type === 'hidden-start').reduce((a, s) => a + s.length, 0);
      const dHid = Math.abs(hid - e.hidden_start);
      const ok = Math.abs(rowLen - refLen) < TOL_REF && dXY < TOL_REF && (dHid < TOL_REF);
      add({ id: 'V3', name: 'Согласие с calc.py', crit: 'кросс-проверка двух реализаций одной геометрии',
        status: ok ? 'pass' : 'fail',
        value: `${what}: sim ${f(rowLen, 4)} мм, calc.py ${f(refLen, 4)} мм (Δ ${f(Math.abs(rowLen - refLen), 9)}); E/X Δmax ${f(dXY, 9)} мм; скрытый старт ${f(hid)} vs ${f(e.hidden_start)} мм`,
        numbers: { rowLen, refLen, dXY, hid, refHidden: e.hidden_start, refRow1: e.row1_total } });
    }
  }
  // V4 — захват ⟂ линии, против хода, под линией
  {
    let maxDev = 0, wrongSide = 0, notUnder = 0;
    for (const st of stitchesDone) {
      const C = point(R, st.s, A.marking.phis[st.line]);
      const chord = unit(sub(st.X, st.E));
      const dev = Math.abs(90 - Math.acos(Math.min(1, Math.abs(dot(chord, ePole(C))))) * 180 / Math.PI);
      maxDev = Math.max(maxDev, dev);
      const sideE = dot(st.E, eEast(C)), sideX = dot(st.X, eEast(C));
      if (!(sideE > 0 && sideX < 0)) wrongSide++;
      const mid = st.E.map((v, i) => (v + st.X[i]) / 2);
      if (norm(mid) >= R) notUnder++;
    }
    const ok = maxDev < TOL_PERP_DEG && wrongSide === 0 && notUnder === 0;
    add({ id: 'V4', name: 'Захват ⟂ линии, против хода, под поверхностью', crit: 'OLY-BASIC «垂直に», «逆方向»; TK-LITTLE «right angle»',
      status: stitchesDone.length ? (ok ? 'pass' : 'fail') : 'n/a',
      value: `стежков ${stitchesDone.length}; макс. отклонение от 90° ${f(maxDev, 9)}°; E справа/X слева: нарушений ${wrongSide}; канал внутри шара: нарушений ${notUnder}` });
  }
  // V5 — стежки на нужных линиях и уровнях (K1–K3), захват не достаёт соседней линии
  {
    const L0 = A.path.ops.length ? 0 : 0;
    let wrongLine = 0, reach = 0;
    const sb = [], stp = [];
    for (const st of stitchesDone) {
      const expLine = (0 + st.i) % N;
      const expLevel = st.i % 2 === 1 ? 'bottom' : 'top';
      if (st.line !== expLine || st.level !== expLevel) wrongLine++;
      // уровень: s точки линии, через которую проходит канал (середина по перпендикуляру)
      const sE = toSPhi(R, st.E).s, sX = toSPhi(R, st.X).s;
      (st.level === 'bottom' ? sb : stp).push(st.s);
      const spacing = R * Math.sin(st.s / R) * 2 * Math.PI / N;
      if (Math.max(st.eOff, -st.xOff) + w / 2 >= spacing - m / 2) reach++;
      void sE; void sX; void L0;
    }
    const spread = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
    const ok = wrongLine === 0 && reach === 0 && spread(sb) <= 1 && spread(stp) <= 0.5;
    add({ id: 'V5', name: 'Стежки на своих линиях и уровнях', crit: 'K1 (верх на чётных, низ на нечётных), K2 (разброс низа ≤ 1 мм [A]), K3 (разброс верха ≤ 0,5 мм [A])',
      status: stitchesDone.length ? (ok ? 'pass' : 'fail') : 'n/a',
      value: `ошибок линии/уровня ${wrongLine}; разброс s низа ${f(spread(sb))} мм, верха ${f(spread(stp))} мм; захват задевает соседнюю линию: ${reach}` });
  }
  // V6 — симметрия лепестков (K1): поворот на 2·(2π/N) переводит плечо i в плечо i+2
  {
    if (!full) add({ id: 'V6', name: 'Симметрия лепестков', crit: 'K1', status: 'n/a', value: 'только для полного обхода (2b)' });
    else {
      const dphi = 2 * (2 * Math.PI / N);
      const rot = (p) => [p[0] * Math.cos(dphi) - p[1] * Math.sin(dphi), p[0] * Math.sin(dphi) + p[1] * Math.cos(dphi), p[2]];
      const legs = path.stitches.map((st) => segs.find((s) => s.id === st.legId));
      const pks = path.stitches.map((st) => segs.find((s) => s.id === st.pickupId));
      let dLeg = 0, dPk = 0;
      for (let i = 0; i < N; i++) {
        const j = (i + 2) % N;
        const A1 = legs[i].pts.map(rot), B1 = legs[j].pts;
        for (let q = 0; q < A1.length; q++) dLeg = Math.max(dLeg, dist(A1[q], B1[q]));
        if (!path.stitches[i].closing && !path.stitches[j].closing) {
          dPk = Math.max(dPk, dist(rot(pks[i].from), pks[j].from), dist(rot(pks[i].to), pks[j].to));
        }
      }
      const reg = path.stitches.find((st) => st.level === 'top' && !st.closing);
      const cl = path.stitches.find((st) => st.closing);
      const extra = reg.xOff - cl.xOff;
      const ok = dLeg < TOL_SYM && dPk < TOL_SYM && Math.abs(extra - w) < 1e-9;
      add({ id: 'V6', name: `Симметрия ${N / 2} лепестков`, crit: 'K1; TK-KIKU',
        status: ok ? 'pass' : 'fail',
        value: `плечи: макс. отклонение после поворота ${f(dLeg, 12)} мм; обычные захваты: ${f(dPk, 12)} мм; замыкающий захват шире обычного на ${f(extra, 6)} мм = w (выведено: слева уже выходит стартовая нить)` });
    }
  }
  // V7 — видимые плечи на поверхности (не сквозь шар), скрытые — внутри
  {
    let minR = Infinity, maxHidden = -Infinity, depthStart = 0, depthPk = 0;
    for (const s of segs) {
      if (s.type === 'leg') for (const p of s.pts) minR = Math.min(minR, norm(p));
      else {
        for (const p of s.pts) maxHidden = Math.max(maxHidden, norm(p));
        if (s.type === 'hidden-start') depthStart = Math.max(depthStart, s.depthMax);
        else depthPk = Math.max(depthPk, s.depthMax);
      }
    }
    const legsOk = !Number.isFinite(minR) || minR >= R * (1 - 1e-12);
    const hidOk = maxHidden <= R * (1 + 1e-12);
    add({ id: 'V7', name: 'Плечи на поверхности, скрытые участки внутри', crit: 'геометрия: плечо лежит на опоре (K10), канал иглы в обмотке',
      status: legsOk && hidOk ? 'pass' : 'fail',
      value: `мин. радиус плеч − R = ${f(minR - R, 9)} мм; макс. радиус скрытых − R = ${f(maxHidden - R, 9)} мм; глубина: старт до ${f(depthStart, 2)} мм, захват до ${f(depthPk, 4)} мм (хорда — нижняя оценка)` });
  }
  // V8 — нет самопересечений, кроме задуманных (перекресты у стежков, замыкание, охват старта)
  {
    const expected = new Map();
    const pairKey = (a, b) => [a, b].sort().join('|');
    for (let i = 1; i < segs.length; i++) expected.set(pairKey(segs[i - 1].id, segs[i].id), 'стык');
    for (const st of path.stitches) {
      const nextLeg = st.closing ? path.startLegId : path.stitches[st.i]?.legId;
      if (nextLeg) expected.set(pairKey(st.legId, nextLeg), st.closing ? 'замыкание: под стартовым участком (TK-LITTLE)' : `перекрест у стежка ${st.i}`);
      for (const c of st.sides.cluster) {
        if (c.seg === 'marking') continue;
        expected.set(pairKey(st.pickupId, c.seg), 'захват охватывает уложенную нить');
        const idx = path.segs.findIndex((s) => s.id === c.seg);
        if (c.kind === 'hole-exit' && idx > 0) expected.set(pairKey(st.pickupId, path.segs[idx - 1].id), 'захват охватывает стартовую нить у выхода');
      }
    }
    // Оси трубок: видимое плечо — нить диаметра w, лежащая на поверхности (ось на R + w/2); скрытые — по каналу.
    const lift = (R + w / 2) / R;
    const axis = segs.map((s) => (s.type === 'leg' ? s.pts.map((p) => [p[0] * lift, p[1] * lift, p[2] * lift]) : s.pts));
    const found = [], bad = [];
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const z = closeZones(axis[i], axis[j], w);
      if (!z.zones.length) continue;
      const k = pairKey(segs[i].id, segs[j].id);
      const why = expected.get(k);
      const sp = toSPhi(R, z.min.cp);
      const rec = { a: segs[i].id, b: segs[j].id, d: z.min.d, s: sp.s, phiDeg: sp.phi * 180 / Math.PI, why: why || 'НЕОЖИДАННО' };
      (why ? found : bad).push(rec);
    }
    const crossN = found.filter((r) => r.why !== 'стык').length;
    add({ id: 'V8', name: 'Нет самопересечений, кроме задуманных', crit: 'K14: расстояние осей ≥ w (круглое сечение диаметра w; сжатие и подъём в перекрестах — этап 2.4)',
      status: bad.length ? 'fail' : 'pass',
      value: `зон сближения < w: задуманных ${crossN} (+ стыков ${found.length - crossN}), неожиданных ${bad.length}` +
        (bad.length ? ': ' + bad.map((b) => `${b.a}×${b.b} s=${f(b.s, 1)}`).join('; ') : ''),
      details: { found, bad } });
  }
  // V9 — выведенная ширина захвата против источников (проверка, не навязывание)
  {
    const reg = stitchesDone.filter((st) => !st.closing).map((st) => st.eOff - st.xOff);
    if (!reg.length) add({ id: 'V9', name: 'Выведенный захват vs источники', crit: 'TK-LITTLE «about 1-2 mm», TK-KAGARI «about 2mm»', status: 'n/a', value: '—' });
    else {
      const lo = Math.min(...reg), hi = Math.max(...reg);
      const inRange = lo >= 1 - 1e-9 && hi <= 2 + 1e-9;
      add({ id: 'V9', name: 'Выведенный захват vs источники', crit: 'TK-LITTLE «about 1-2 mm», TK-KAGARI «about 2mm» (проверка следствия)',
        status: inRange ? 'pass' : 'warn',
        value: `обычный захват = m + w = ${f(lo)}…${f(hi)} мм (m = ${f(m, 2)}, w = ${f(w, 3)}); ${inRange ? 'в диапазоне 1–2 мм' : 'ВНЕ «about 1–2 mm» — проверьте m, w'}` });
    }
  }
  // V10 — замыкание обхода (2b): последнее плечо под стартовым участком, стежок охватывает стартовую нить
  {
    if (!full) add({ id: 'V10', name: 'Замыкание через стартовый участок', crit: 'TK-LITTLE; TK-GT14', status: 'n/a', value: 'только для 2b' });
    else {
      const cl = path.stitches.find((st) => st.closing);
      const leg = path.segs.find((s) => s.id === cl.legId);
      const cr = (leg.crossings || []).find((c) => c.other === path.startLegId);
      const captured = cl.sides.cluster.some((c) => c.seg === path.startLegId && c.kind === 'hole-exit');
      const X0off = path.start.exitSides.xOff;
      const inside = X0off - w / 2 >= cl.xOff + w / 2 - 1e-9 && X0off + w / 2 <= cl.eOff - w / 2 + 1e-9;
      const ok = !!cr && cr.over === path.startLegId && captured && inside;
      add({ id: 'V10', name: 'Замыкание через стартовый участок', crit: 'TK-LITTLE «Carry the working thread under the starting thread … then complete the stitch»; TK-GT14',
        status: ok ? 'pass' : 'fail',
        value: cr ? `последнее плечо ПОД стартовым участком на s = ${f(cr.s, 2)} мм (угол ${f(cr.angleDeg, 1)}°); стартовая нить (ось ${f(X0off)} мм) внутри захвата [${f(cl.xOff)}; ${f(cl.eOff)}] мм: ${inside ? 'да' : 'нет'}`
          : 'перекрест со стартовым участком не найден' });
    }
  }
  // V11 — происхождение: слои посчитаны из текущих родителей (нет утечки старой геометрии)
  {
    const okChain = A.marking.parents[0] === A.base.stamp && A.layout.parents[1] === A.marking.stamp &&
      A.rowPlan.parents[2] === A.layout.stamp && A.path.parents[3] === A.rowPlan.stamp && A.path.parents[0] === A.base.stamp;
    const Rchk = Math.abs(norm(path.start.X0) - R) < 1e-9;
    add({ id: 'V11', name: 'Цепочка слоёв свежая', crit: 'требование параметричности: base → marking → layout → rowPlan → path',
      status: okChain && Rchk ? 'pass' : 'fail',
      value: `штампы: base ${A.base.stamp} → marking ${A.marking.stamp} → layout ${A.layout.stamp} → rowPlan ${A.rowPlan.stamp} → path ${A.path.stamp}; |X₀| = R: ${Rchk ? 'да' : 'нет'}` });
  }
  // V12 — план рядов по замыслу (K12) — информационно
  {
    const rp = A.rowPlan, last = rp.rows[rp.rows.length - 1];
    const beyond = rp.rows.some((r) => r.beyondLimit);
    add({ id: 'V12', name: 'План рядов (замысел)', crit: 'K12; TK-GT14 «Work to the equator»',
      status: beyond ? 'warn' : 'info',
      value: `рядов: ${rp.nRows}; последний кончик s = ${f(last.sBot, 2)} мм, предел ${f(rp.limit, 2)} мм${beyond ? ' — кончики ЗА пределом' : ''}; путь построен только для ряда 1` });
  }
  // V13 — правило источника «каждый следующий верх на ~1 нить ниже и шире» — следствие, проверяется в 2c
  add({ id: 'V13', name: 'Верх ряда n+1 «на нить ниже и шире» как следствие', crit: 'TK-GT14, TK-UWA (проверять, не задавать)',
    status: 'n/a', value: 'нужен ряд 2 (этап 2c): ширина верхнего захвата должна получиться из занятости, затем сравниться с «about 1 thread width»' });
  return out;
}

export function summary(vals) {
  const c = { pass: 0, fail: 0, warn: 0, info: 0, 'n/a': 0 };
  for (const v of vals) c[v.status]++;
  return c;
}
