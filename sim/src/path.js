// Генератор пути: чистая функция (рецепт + параметры + предыдущие слои) → упорядоченный список операций и
// сегментов рабочих нитей (по одной на цвет) для обходов в порядке recipe.work.order (A1, B1, A2 …).
// Шитьё последовательное: всё — E/X, уровни рядов n ≥ 2, над/под в перекрестах — выводится из того, что уже
// лежит на шаре после предыдущих операций (причинный префикс). Никаких сохранённых координат и сдвигов.
import {
  point, offsetPt, slerp, lineSeg, geodLen, dist, rotateToward, toSPhi, wrapPi, tangentTo, ePole, dot,
  closeZones, angle, unit, sub, cross, eEast, perpPt, segSegDist,
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
  const ta = unit(sub(A[Math.max(1, i)], A[Math.max(1, i) - 1])), tb = unit(sub(B[Math.max(1, j)], B[Math.max(1, j) - 1]));
  return Math.acos(Math.min(1, Math.abs(dot(ta, tb)))) * 180 / Math.PI;
}

const fmt = (x, d = 1) => x.toFixed(d).replace('.', ',');

/** Зоны, где ось плеча A ближе w к оси плеча B: [i0, i1], минимум, признак настоящего перекреста (A переходит
 *  через большой круг B внутри зоны). Контакт без перехода — «прилегание» (параллельный заход в зону w). */
function bb(seg) {
  if (seg._bb) return seg._bb;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of seg.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  Object.defineProperty(seg, '_bb', { value: { lo, hi }, enumerable: false });
  return seg._bb;
}
function legZones(A, B, w) {
  const a = bb(A), b = bb(B);
  for (let k = 0; k < 3; k++) if (a.lo[k] - b.hi[k] >= w || b.lo[k] - a.hi[k] >= w) return [];
  const zones = [];
  let cur = null;
  for (let i = 1; i < A.pts.length; i++) {
    let m = { d: Infinity };
    for (let j = 1; j < B.pts.length; j++) {
      const r = segSegDist(A.pts[i - 1], A.pts[i], B.pts[j - 1], B.pts[j]);
      if (r.d < m.d) m = { ...r, i, j };
    }
    if (m.d < w - 1e-9) {
      if (!cur) cur = { i0: i, i1: i, min: m };
      else { cur.i1 = i; if (m.d < cur.min.d) cur.min = m; }
    } else if (cur) { zones.push(cur); cur = null; }
  }
  if (cur) zones.push(cur);
  const nB = unit(cross(B.from, B.to));
  for (const z of zones) {
    let cross0 = false;
    const a0 = Math.max(0, z.i0 - 1), a1 = Math.min(A.pts.length - 1, z.i1);
    for (let i = a0 + 1; i <= a1; i++) {
      const s0 = dot(nB, A.pts[i - 1]), s1 = dot(nB, A.pts[i]);
      if (s0 === 0 || s0 * s1 < 0) { cross0 = true; break; }
    }
    z.crossing = cross0;
    z.lenMm = A.length * (a1 - a0) / (A.pts.length - 1);
  }
  return zones;
}

/** Уровень низа ряда n ≥ 2: «уложи вплотную → коли в пересечении». Уложенная нить идёт снаружи плеча предыдущего
 *  ряда того же набора, ось на расстоянии w (малый круг, параллельный большому кругу плеча). Игла входит там, где
 *  уложенная нить проходит вплотную справа от нити разметки: точка E = perpPt(s, eOff(s)) лежит на уложенной нити,
 *  eOff(s) — из занятости на этом уровне. Свободных чисел нет: только m, w и уже уложенное плечо.
 *  sidesAt(s) → needleSides на уровне s. */
function packThenPierce(R, prevArm, phiK, sInside, w, sMax, sidesAt) {
  const n = unit(cross(prevArm.from, prevArm.to));
  const sigma = -Math.sign(dot(n, unit(point(R, sInside, phiK))));   // снаружи = с другой стороны, чем тело лепестка
  const target = sigma * Math.sin(w / R);
  const g = (s) => dot(n, unit(perpPt(R, s, phiK, sidesAt(s).eOff))) - target;
  const h = w / 10;
  let lo = sInside, glo = g(lo), hi = null;
  for (let s = sInside + h; s <= sMax; s += h) { const gs = g(s); if (glo * gs <= 0) { hi = s; break; } lo = s; glo = gs; }
  if (hi === null) return null;
  for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2, gm = g(mid); if (glo * gm <= 0) hi = mid; else { lo = mid; glo = gm; } }
  const s = (lo + hi) / 2;
  // для справки: где ось линии пересекают само плечо предыдущего ряда и уложенная нить
  const axisCross = (tg) => {
    const f = (t) => dot(n, unit(point(R, t, phiK))) - tg;
    let a = sInside, fa = f(a);
    for (let t = sInside + h; t <= sMax; t += h) {
      const ft = f(t);
      if (fa * ft <= 0) { let b = t; for (let it = 0; it < 60; it++) { const mid = (a + b) / 2, fm = f(mid); if (fa * fm <= 0) b = mid; else { a = mid; fa = fm; } } return (a + b) / 2; }
      a = t; fa = ft;
    }
    return null;
  };
  return { s, sPrevCross: axisCross(0), sLaidCross: axisCross(target), sigma };
}

/**
 * Построить все обходы recipe.work.order последовательно. Возвращает
 * { ops, segs, stitches, rounds, threads, crossings } — единый хронологический список; у каждого сегмента —
 * нить (thread), обход (round), набор (set), ряд (row) и координата длины u своей нити.
 */
export function buildWork(recipe, P, base, marking, layout) {
  const R = base.R, N = marking.N, w = P.w_mm, m = P.m_mm, Q = base.Q;
  const T = recipe.kagari, conv = recipe.conventions, LV = recipe.levels;
  const W = { ops: [], segs: [], stitches: [], rounds: [], threads: {}, crossings: [] };
  const lineIdx = (k) => ((k % N) + N) % N;
  const phiOf = (k) => marking.phis[lineIdx(k)];
  const legs = () => W.segs.filter((s) => s.type === 'leg');

  for (const rid of recipe.work.order) {
    const spec = recipe.layers.find((l) => l.id === rid);
    const th = W.threads[spec.thread] || (W.threads[spec.thread] = { id: spec.thread, u: 0, segIds: [], rounds: [], park: null, parkStitch: null });
    const RD = { id: spec.id, set: spec.set, thread: spec.thread, row: spec.row, startLine: spec.startLine, begin: spec.begin,
      basis: spec.basis, opFirst: W.ops.length, stitchIdx: [], segIds: [], firstLegId: null, start: null, u0: th.u };
    th.rounds.push(RD.id);
    const addSeg = (seg) => {
      seg.id = `s${W.segs.length}`; seg.thread = th.id; seg.round = RD.id; seg.set = spec.set; seg.row = spec.row;
      seg.u0 = th.u; th.u += seg.length; seg.u1 = th.u;
      W.segs.push(seg); th.segIds.push(seg.id); RD.segIds.push(seg.id);
      return seg;
    };
    const pushOp = (op) => { op.round = RD.id; op.thread = th.id; W.ops.push(op); return op; };
    const L0 = spec.startLine;
    const prevRound = spec.row > 1 ? W.rounds.find((r) => r.set === spec.set && r.row === spec.row - 1) : null;

    // ---------- 1. Начало: скрытый старт новой нити или продолжение припаркованной ----------
    let cur;
    if (spec.begin === 'hiddenStart') {
      const sT = layout.sTop;
      const side0 = needleSides({ R, s: sT, phi: phiOf(L0), m, w, N, laid: legs() });
      const X0 = perpPt(R, sT, phiOf(L0), side0.xOff);
      const rule = T.start.rules[P.startRule];
      const runs = rule.runs, Lrun = P.startRun_mm;
      const theta = 2 * Math.asin(Math.min(1, Lrun / (2 * R)));
      const M = point(R, layout.sBot, phiOf(L0) - Math.PI / N);
      const holes = [];
      for (let k = runs; k >= 0; k--) holes.push(k === 0 ? X0 : rotateToward(R, X0, M, k * theta));
      for (let k = 0; k < runs; k++) {
        const a = holes[k], b = holes[k + 1];
        const seg = addSeg({ type: 'hidden-start', from: a, to: b, pts: lineSeg(a, b, 24), length: dist(a, b),
          source: `${P.startRule}; направление — [E]`, tag: rule.tag, run: k + 1, runs, depthMax: R - Math.sqrt(R * R - (dist(a, b) / 2) ** 2) });
        const last = k === runs - 1;
        pushOp({ kind: 'start-run', segIds: [seg.id], run: k + 1, runs,
          label: `${RD.id}: скрытый старт нити ${th.id}, проход ${k + 1}/${runs}: игла ${k === 0 ? 'входит в обмотку' : 'входит в то же отверстие'}, ` +
            `идёт прямо (хорда ${fmt(seg.length)} мм, глубина до ${fmt(seg.depthMax)} мм) и выходит ` +
            (last ? `у L${L0} вплотную слева от занятого у линии (${fmt(side0.xOff, 3)} мм), ${fmt(sT)} мм от СП (X₀)` : 'на поверхность'),
          source: `${rule.basis}; ${T.start.direction.basis}; ${spec.basis}` });
      }
      RD.start = { X0, holes, tail: holes[0], exitSides: side0, runs, Lrun, theta };
      cur = X0;
    } else {
      cur = th.park;
      RD.start = { resumeFrom: th.parkStitch, X0: cur };
      pushOp({ kind: 'resume', segIds: [], label: `${RD.id}: вернуться к нити ${th.id} — она припаркована у X последнего стежка ${th.rounds[th.rounds.length - 2]} (без скрытого перехода)`,
        source: `${spec.basis}; TK-UWA; prior #94` });
    }

    // ---------- 2. Стежки обхода ----------
    for (let i = 1; i <= N; i++) {
      const closing = i === N;
      const k = lineIdx(L0 + i);
      const level = T.pattern[(i - 1) % T.pattern.length];
      // (а) уровень стежка: ряд 1 — замысел; ряд n ≥ 2 — вывод из уже уложенного
      let s, levelInfo;
      if (level === 'top') {
        if (spec.row === 1) { s = layout.sTop; levelInfo = { rule: 'row1', basis: LV.top.row1.basis }; }
        else {
          const prevCh = W.stitches.filter((st) => st.line === k && st.level === 'top');
          const sPrev = Math.max(...prevCh.map((st) => st.s));
          s = sPrev + w;
          levelInfo = { rule: 'belowPrevChannel', sPrev, dS: s - sPrev, basis: LV.top.next.basis };
        }
      } else if (spec.row === 1) { s = layout.sBot; levelInfo = { rule: 'row1', basis: LV.bottom.row1.basis }; }
      else {
        const prevSt = W.stitches.find((st) => st.round === prevRound.id && st.line === k && st.level === 'bottom');
        const prevArm = W.segs.find((x) => x.id === prevSt.legId);
        const sidesAt = (t) => needleSides({ R, s: t, phi: phiOf(k), m, w, N, laid: legs() });
        const pp = packThenPierce(R, prevArm, phiOf(k), (layout.sTop + prevSt.s) / 2, w, 2 * Q - 1, sidesAt);
        // канал нового стежка не может налезать на канал предыдущего на этой линии (игла не прокалывает нить)
        const sChan = Math.max(...W.stitches.filter((st) => st.line === k && st.level === 'bottom').map((st) => st.s)) + w;
        s = Math.max(pp.s, sChan);
        levelInfo = { rule: 'packThenPierce', sPrev: prevSt.s, sPrevCross: pp.sPrevCross, sLaidCross: pp.sLaidCross, sPack: pp.s, sChan,
          channelBinding: sChan > pp.s, dS: s - prevSt.s, prevArm: prevArm.id, basis: LV.bottom.next.basis };
      }
      // (б) где колоть: занятость у линии k на уровне s из уже уложенного (все нити, причинный префикс)
      const sides = needleSides({ R, s, phi: phiOf(k), m, w, N, laid: legs() });
      const E = perpPt(R, s, phiOf(k), sides.eOff);
      const X = perpPt(R, s, phiOf(k), sides.xOff);
      // (в) уложить нить: геодезическое плечо cur → E
      const legPts = slerp(R, cur, E, LEG_SAMPLES);
      const leg = addSeg({ type: 'leg', from: cur, to: E, pts: legPts, length: geodLen(R, cur, E), stitch: i, line: k, level,
        source: conv.lay.basis, tag: conv.lay.tag, crossings: [] });
      if (i === 1) RD.firstLegId = leg.id;
      // перекресты и прилегания со ВСЕМИ ранее уложенными плечами (обе нити): правило над/под
      for (const other of legs()) {
        if (other.id === leg.id) continue;
        for (const z of legZones(leg, other, w)) {
          const passUnder = closing && T.closing.passUnder.includes('roundFirstLeg') && other.id === RD.firstLegId;
          // плечо к низу начинается у верхней точки, плечо к верху — кончается у неё (узор низ/верх чередуется)
          const topEnd = (level === 'bottom' && z.i0 <= 1) || (level === 'top' && z.i1 >= legPts.length - 1);
          let kind, rule, allowed = true;
          if (z.crossing) {
            kind = 'crossing';
            rule = passUnder ? `${spec.row === 1 ? 'TK-LITTLE' : 'TK-LITTLE (перенос на ряд n, b)'}: замыкающее плечо ПОД первым плечом обхода`
              : (other.set !== spec.set ? `позже уложенная сверху (G8, #102) ⇒ переплетение наборов (GT14 «kousa»)` : 'позже уложенная сверху (G8, #102, A14)');
          } else if (other.set === spec.set && other.row < spec.row && topEnd) {
            kind = 'wedge'; rule = 'uwagake: у верхней точки рабочая нить лежит ПОВЕРХ прежних рядов (GT14 «over the previously placed threads»)';
          } else { kind = 'contact'; rule = 'прилегание ближе w без перехода — не разрешено правилом'; allowed = false; }
          const sp = toSPhi(R, z.min.cp);
          const c = { id: `c${W.crossings.length}`, a: leg.id, b: other.id, over: passUnder ? other.id : leg.id, under: passUnder ? leg.id : other.id,
            kind, rule, allowed, at: z.min.cp, s: sp.s, phiDeg: sp.phi * 180 / Math.PI, dmin: z.min.d,
            angleDeg: crossAngleDeg(legPts, z.min.i, other.pts, z.min.j), iA: z.min.i, iB: z.min.j, lenMm: z.lenMm,
            rounds: [RD.id, other.round] };
          W.crossings.push(c); leg.crossings.push(c);
        }
      }
      const crossTxt = leg.crossings.map((c) => `${c.kind === 'wedge' ? 'клин' : 'перекрест'} с ${c.b} (${W.segs.find((x) => x.id === c.b).round}) на s=${fmt(c.s)} мм: ${c.over === leg.id ? 'НАД' : 'ПОД'}`).join('; ');
      pushOp({ kind: 'lay', segIds: [leg.id], stitch: i, line: k, level, closing,
        label: `${RD.id}: уложить нить ${th.id} к L${k} (${level === 'top' ? 'верх' : 'низ'} ряда ${spec.row}${closing ? ', замыкание' : ''}): геодезическое плечо ${fmt(leg.length)} мм` +
          (crossTxt ? `; ${crossTxt}` : '') + (closing ? '. Плечо проходит ПОД первым плечом обхода' : ''),
        source: closing ? `${T.closing.basis}; ${conv.closingUnder.basis}` : `${conv.lay.basis}; ${T.patternBasis}; ${conv.crossing.basis}` });
      // (г) стежок: прямой канал E → X под нитью разметки и всем кластером
      const pk = addSeg({ type: 'pickup', from: E, to: X, pts: lineSeg(E, X, 12), length: dist(E, X), stitch: i, line: k, level,
        eOff: sides.eOff, xOff: sides.xOff, under: sides.cluster.map((c) => c.seg), cluster: sides.cluster,
        source: `${conv.sides.basis}; ${conv.needle.basis}; ${conv.channel.basis}`, tag: conv.sides.tag,
        depthMax: R - Math.sqrt(R * R - (dist(E, X) / 2) ** 2) });
      const nameOf = (id) => { const x = W.segs.find((q) => q.id === id); return x ? `${id}/${x.round}` : id; };
      const underTxt = sides.cluster.map((c) => (c.seg === 'marking' ? `нитью разметки L${k}` : `${nameOf(c.seg)} (${c.kind === 'hole-exit' ? 'выход нити' : c.kind === 'hole-entry' ? 'вход нити' : 'перекрёсток линии иглы'})`)).join(', ');
      pushOp({ kind: 'stitch', segIds: [pk.id], stitch: i, line: k, level, closing,
        label: `${RD.id}: стежок ${i} (${level === 'top' ? 'верх' : 'низ'}, s = ${fmt(s, 3)} мм) на L${k}: игла входит E справа (+${fmt(sides.eOff, 3)} мм от оси линии), ` +
          `идёт ⟂ линии против хода под ${underTxt}, выходит X слева (${fmt(sides.xOff, 3)} мм); скрытый участок ${fmt(pk.length, 3)} мм` +
          (levelInfo.rule === 'belowPrevChannel' ? `; уровень = канал ряда ${spec.row - 1} (${fmt(levelInfo.sPrev, 3)}) + w` : '') +
          (levelInfo.rule === 'packThenPierce' ? `; уровень — где нить, уложенная вплотную к ${levelInfo.prevArm}, пересекает линию (на ${fmt(levelInfo.dS, 2)} мм ниже кончика ряда ${spec.row - 1})` : ''),
        source: `${pk.source}; ${levelInfo.basis}` });
      const st = { round: RD.id, set: spec.set, row: spec.row, thread: th.id, i, line: k, level, s, E, X, eOff: sides.eOff, xOff: sides.xOff,
        legId: leg.id, pickupId: pk.id, closing, sides, levelInfo };
      RD.stitchIdx.push(W.stitches.length);
      W.stitches.push(st);
      cur = X;
    }
    th.park = cur; th.parkStitch = `${RD.id}/${N}`;
    pushOp({ kind: 'park', segIds: [], label: `${RD.id}: парковка нити ${th.id} у X${N} (игла с нитью оставлена снаружи; следующий ряд — той же нитью)`, source: T.end.basis });
    RD.opLast = W.ops.length - 1;
    RD.u1 = th.u;
    RD.length = th.u - RD.u0;
    W.rounds.push(RD);
  }
  W.ops.forEach((o, idx) => { o.idx = idx; });
  // уровни стопки в перекрестах — топология (кто над кем), не высота; высоты — механика (этап 2.4)
  stackLevels(W, w);
  for (const t of Object.values(W.threads)) t.uEnd = t.u;
  return W;
}

/** Порядковый уровень «над»: в перекресте c верхняя нить на 1 выше, чем нижняя в этой точке (хронологически).
 *  Это топология (порядок), а не высота: подъём нить-на-нить — механика, этап 2.4 (крючок: A.mechanics). */
function stackLevels(W, w) {
  const byOver = new Map();
  const levelAt = (segId, i) => {
    let lv = 0;
    for (const c of byOver.get(segId) || []) {
      const seg = W.segs.find((x) => x.id === segId);
      const ic = c.over === c.a ? c.iA : c.iB;
      const half = c.halfSamples ?? 3;
      if (Math.abs(i - ic) <= half) lv = Math.max(lv, c.stack);
      void seg;
    }
    return lv;
  };
  for (const c of W.crossings) {
    const overSeg = W.segs.find((x) => x.id === c.over);
    const iUnder = c.under === c.a ? c.iA : c.iB;
    const sinA = Math.max(0.05, Math.sin(c.angleDeg * Math.PI / 180));
    const halfMm = c.kind === 'crossing' ? w / sinA : Math.max(w, c.lenMm / 2);
    c.halfMm = halfMm;
    c.halfSamples = Math.ceil(halfMm / (overSeg.length / (overSeg.pts.length - 1)));
    c.stack = 1 + levelAt(c.under, iUnder);
    if (!byOver.has(c.over)) byOver.set(c.over, []);
    byOver.get(c.over).push(c);
  }
}

/** Индекс последней операции этапа по описанию в рецепте. */
export function stageLastOp(recipe, ops, stage) {
  const spec = recipe.stages[stage].throughOp;
  const idx = ops.findIndex((o) => o.round === spec.round && o.kind === spec.kind && (spec.stitch === undefined || o.stitch === spec.stitch));
  return idx < 0 ? ops.length - 1 : idx;
}
