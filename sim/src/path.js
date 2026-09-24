// Генератор пути: чистая функция (рецепт + параметры + предыдущие слои) → упорядоченный список операций и
// сегментов ОДНОЙ рабочей нити. Шитьё последовательное: положение E/X стежка k выводится из того, что уже
// лежит на шаре после стежков 1…k−1 (причинный префикс). Никаких сохранённых координат, никакой «ширины захвата».
import {
  point, offsetPt, slerp, lineSeg, geodLen, dist, rotateToward, toSPhi, wrapPi, tangentTo, ePole, dot,
  closeZones, angle, unit, sub, cross, eEast, perpPt,
} from './geom.js';

const LEG_SAMPLES = 96;

/**
 * Занятость у линии разметки на параллели s: интервалы вдоль параллели (мм, + = по ходу) — нить разметки и
 * уже уложенные нити (пересечения параллели и отверстия-концы). Кластер от нити разметки растёт, пока зазор
 * до соседней нити меньше w (рабочая нить в такой зазор не входит — prior #105: игла между нитями).
 * E = правый край кластера + w/2, X = левый край − w/2 (ось рабочей нити вплотную). Свободных чисел нет:
 * только ширины m и w и геометрия уже уложенного.
 */
export function needleSides({ R, s, phi, m, w, N, laid }) {
  // «Линия иглы» — большой круг через точку линии C, перпендикулярный линии (игла прямая и ⟂ линии).
  const C = point(R, s, phi);
  const uC = unit(C), eL = eEast(C), n = ePole(C);        // n — нормаль плоскости линии иглы
  const r = R * Math.sin(s / R);
  const spacing = r * 2 * Math.PI / N;                     // расстояние до соседней линии (по параллели)
  const win = spacing / 2;                                 // окно: половина расстояния до соседней линии
  const occ = [];
  const coord = (p) => { const q = unit(p); return { f: R * Math.asin(Math.max(-1, Math.min(1, dot(q, n)))), y: R * Math.atan2(dot(q, eL), dot(q, uC)) }; };
  for (const seg of laid) {
    if (seg.type !== 'leg') continue;
    const pts = seg.pts;
    const c = pts.map(coord);
    // отверстия (концы плеча) на линии иглы
    for (const [idx, role] of [[0, 'hole-exit'], [pts.length - 1, 'hole-entry']]) {
      const q = c[idx];
      if (Math.abs(q.f) <= w / 2 && Math.abs(q.y) < win)
        occ.push({ lo: q.y - w / 2, hi: q.y + w / 2, y: q.y, seg: seg.id, kind: role });
    }
    // пересечения линии иглы внутренними участками плеча
    for (let i = 1; i < pts.length; i++) {
      const a = c[i - 1].f, b = c[i].f;
      const eps = 1e-9;   // точки на самой линии — это концы (отверстия), учтены выше
      if (Math.abs(a) > eps && Math.abs(b) > eps && a * b < 0) {
        const t = a / (a - b);
        const y = c[i - 1].y + t * (c[i].y - c[i - 1].y);
        if (Math.abs(y) >= win) continue;
        const tan = unit(sub(pts[i], pts[i - 1]));
        const eLine = unit(cross(n, unit(pts[i])));
        const sn = Math.sqrt(Math.max(0, 1 - dot(tan, eLine) ** 2));  // синус угла нити к линии иглы
        const wid = w / Math.max(sn, 1e-6);                             // след нити вдоль линии иглы
        occ.push({ lo: y - wid / 2, hi: y + wid / 2, y, seg: seg.id, kind: 'crossing' });
      }
    }
  }
  let lo = -m / 2, hi = m / 2;
  const used = [{ lo, hi, seg: 'marking', kind: 'marking' }];
  const rest = occ.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      const o = rest[i];
      if (o.lo < hi + w && o.hi > lo - w) { lo = Math.min(lo, o.lo); hi = Math.max(hi, o.hi); used.push(o); rest.splice(i, 1); changed = true; }
    }
  }
  return { eOff: hi + w / 2, xOff: lo - w / 2, cluster: used, ignored: rest, spacing, lineHalfWindow: win };
}

function crossAngleDeg(A, i, B, j) {
  const ta = unit(sub(A[i], A[i - 1])), tb = unit(sub(B[j], B[j - 1]));
  const a = Math.acos(Math.min(1, Math.abs(dot(ta, tb))));
  return a * 180 / Math.PI;
}

const fmt = (x, d = 1) => x.toFixed(d).replace('.', ',');

/**
 * Построить обход (round) рецепта. Возвращает { ops, segs, meta }.
 * ops: операции иглы по порядку; segs: сегменты нити с длиной, типом, источником, u0/u1.
 */
export function buildRoundPath(recipe, P, base, marking, layout) {
  const R = base.R, N = marking.N, w = P.w_mm, m = P.m_mm;
  const round = recipe.layers.find((l) => l.type === 'round' && l.id === 'A1');
  const conv = recipe.conventions;
  const L0 = round.startLine;
  const lineIdx = (k) => ((k % N) + N) % N;
  const phiOf = (k) => marking.phis[lineIdx(k)];
  const levelS = (lvl) => (lvl === 'top' ? layout.sTop : layout.sBot);
  const ops = [], segs = [];
  let u = 0;
  const thread = round.thread;

  const addSeg = (seg) => {
    seg.id = `s${segs.length}`;
    seg.thread = thread;
    seg.u0 = u; u += seg.length; seg.u1 = u;
    segs.push(seg);
    return seg;
  };
  const laid = () => segs.filter((s) => s.type === 'leg');

  // ---------- 1. Скрытый старт ----------
  const sT = levelS(round.startLevel);
  const side0 = needleSides({ R, s: sT, phi: phiOf(L0), m, w, N, laid: [] });
  const X0 = perpPt(R, sT, phiOf(L0), side0.xOff);
  const rule = round.start.rules[P.startRule];
  const runs = rule.runs;
  const Lrun = P.startRun_mm;
  const theta = 2 * Math.asin(Math.min(1, Lrun / (2 * R)));   // хорда длины Lrun (прямая игла)
  const M = point(R, layout.sBot, phiOf(L0) - Math.PI / N);    // направление [E] (recipe.start.direction)
  const holes = [];
  for (let k = runs; k >= 0; k--) holes.push(k === 0 ? X0 : rotateToward(R, X0, M, k * theta));
  for (let k = 0; k < runs; k++) {
    const a = holes[k], b = holes[k + 1];
    const seg = addSeg({
      type: 'hidden-start', from: a, to: b, pts: lineSeg(a, b, 24), length: dist(a, b),
      source: `${P.startRule}; направление — [E]`, tag: rule.tag, run: k + 1, runs,
      depthMax: R - Math.sqrt(R * R - (dist(a, b) / 2) ** 2),
    });
    const last = k === runs - 1;
    ops.push({
      kind: 'start-run', segIds: [seg.id], run: k + 1, runs,
      label: `Скрытый старт, проход ${k + 1}/${runs}: игла ${k === 0 ? 'входит в обмотку' : 'входит в то же отверстие'}, ` +
        `идёт прямо (хорда ${fmt(seg.length)} мм, глубина до ${fmt(seg.depthMax)} мм) и выходит ` +
        (last ? `у L${L0} вплотную слева от нити разметки, ${fmt(sT)} мм от СП (X₀)` : 'на поверхность'),
      source: `${rule.basis}; ${round.start.direction.basis}`,
    });
  }
  const startInfo = { X0, holes, tail: holes[0], exitSides: side0, runs, Lrun, theta };

  // ---------- 2. Стежки обхода ----------
  let cur = X0;
  let startLegId = null;
  const stitches = [];
  for (let i = 1; i <= N; i++) {
    const closing = i === N;
    const k = lineIdx(L0 + i);
    const level = round.pattern[(i - 1) % round.pattern.length];
    const s = levelS(level);
    // (а) где колоть: занятость у линии k на уровне s из уже уложенного (причинный префикс)
    const sides = needleSides({ R, s, phi: phiOf(k), m, w, N, laid: laid() });
    const E = perpPt(R, s, phiOf(k), sides.eOff);
    const X = perpPt(R, s, phiOf(k), sides.xOff);
    // (б) уложить нить: геодезическое плечо cur → E
    const legPts = slerp(R, cur, E, LEG_SAMPLES);
    const leg = addSeg({
      type: 'leg', from: cur, to: E, pts: legPts, length: geodLen(R, cur, E), stitch: i, line: k, level,
      source: conv.lay.basis, tag: conv.lay.tag,
    });
    if (i === 1) startLegId = leg.id;
    // перекресты с ранее уложенными плечами: правило над/под
    const crossings = [];
    for (const other of segs) {
      if (other.type !== 'leg' || other.id === leg.id) continue;
      const z = closeZones(legPts, other.pts, w);
      for (const zone of z.zones) {
        const atJoint = dist(zone.cp, cur) < 1e-9 && dist(zone.cq, other.to) < 1e-9;
        if (atJoint) continue;
        const passUnder = closing && round.closing.passUnder.includes('startLeg') && other.id === startLegId;
        const sp = toSPhi(R, zone.cp);
        crossings.push({
          other: other.id, over: passUnder ? other.id : leg.id, under: passUnder ? leg.id : other.id,
          rule: passUnder ? 'TK-LITTLE: под стартовым участком' : 'позже уложенная сверху (G8, A14)',
          at: zone.cp, s: sp.s, phiDeg: sp.phi * 180 / Math.PI, dmin: zone.d,
          angleDeg: crossAngleDeg(legPts, zone.i, other.pts, zone.j),
        });
      }
    }
    leg.crossings = crossings;
    const crossTxt = crossings.map((c) => `перекрест с ${c.other} на s=${fmt(c.s)} мм: ${c.over === leg.id ? 'эта нить НАД' : 'эта нить ПОД'}`).join('; ');
    ops.push({
      kind: 'lay', segIds: [leg.id], stitch: i, line: k, level, closing,
      label: `Уложить нить к L${k} (${level === 'top' ? 'верх' : 'низ'}${closing ? ', замыкание' : ''}): геодезическое плечо ${fmt(leg.length)} мм` +
        (crossTxt ? `; ${crossTxt}` : '') + (closing ? '. Плечо проходит ПОД стартовым участком (TK-LITTLE)' : ''),
      source: closing ? round.closing.basis : `${conv.lay.basis}; ${round.patternBasis}`,
    });
    // (в) стежок: прямой канал E → X под нитью разметки и всем кластером
    const pk = addSeg({
      type: 'pickup', from: E, to: X, pts: lineSeg(E, X, 12), length: dist(E, X), stitch: i, line: k, level,
      eOff: sides.eOff, xOff: sides.xOff, under: sides.cluster.map((c) => c.seg), cluster: sides.cluster,
      source: `${conv.sides.basis}; ${conv.needle.basis}; ${conv.channel.basis}`, tag: conv.sides.tag,
      depthMax: R - Math.sqrt(R * R - (dist(E, X) / 2) ** 2),
    });
    const underTxt = sides.cluster.map((c) => (c.seg === 'marking' ? `нитью разметки L${k}` : `нитью ${c.seg} (${c.kind === 'hole-exit' ? 'выход стартовой нити' : c.kind})`)).join(', ');
    ops.push({
      kind: 'stitch', segIds: [pk.id], stitch: i, line: k, level, closing,
      label: `Стежок ${i} (${level === 'top' ? 'верх' : 'низ'}) на L${k}: игла входит E справа (+${fmt(sides.eOff, 3)} мм от оси линии), ` +
        `идёт ⟂ линии против хода под ${underTxt}, выходит X слева (${fmt(sides.xOff, 3)} мм); скрытый участок ${fmt(pk.length, 3)} мм` +
        (closing ? ' — замыкающий стежок охватывает стартовую нить' : ''),
      source: pk.source,
    });
    stitches.push({ i, line: k, level, s, E, X, eOff: sides.eOff, xOff: sides.xOff, legId: leg.id, pickupId: pk.id, closing, sides });
    cur = X;
  }
  ops.push({ kind: 'park', segIds: [], label: `Парковка нити ${thread} у X${N} (игла с нитью оставлена снаружи; следующий ряд — той же нитью)`, source: round.end.basis });
  ops.forEach((o, idx) => { o.idx = idx; });
  return { ops, segs, stitches, start: startInfo, startLegId, thread, uEnd: u };
}

/** Индекс последней операции этапа (2a/2b) по описанию в рецепте. */
export function stageLastOp(recipe, ops, stage) {
  const spec = recipe.stages[stage].throughOp;
  const idx = ops.findIndex((o) => o.kind === spec.kind && (spec.stitch === undefined || o.stitch === spec.stitch));
  return idx < 0 ? ops.length - 1 : idx;
}
