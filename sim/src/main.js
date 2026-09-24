// UI: параметры → computeAll (чистый конвейер) → рендер/валидаторы. Состояние сохраняется в URL.
import { loadRecipe, loadJSON } from './recipe.js';
import { computeAll } from './layers.js';
import { runValidators, summary, refKey } from './validators.js';
import { PARAM_SCHEMA, GROUPS, STATUS_LABEL, defaults, paramsFromQuery } from './params.js';
import { Renderer, viridis, warm, SET_COLORS, roundColor } from './render.js';

const $ = (id) => document.getElementById(id);
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
window.__sim = { ready: false, errors: [] };
window.addEventListener('error', (e) => window.__sim.errors.push(String(e.message)));

const q = new URLSearchParams(location.search);
const state = {
  raw: { ...defaults(), ...paramsFromQuery(location.search) },
  stage: ['2a', '2b', 'B1', 'A2'].includes(q.get('stage')) ? q.get('stage') : 'A2',
  k: q.has('k') ? Number(q.get('k')) : null,
  view: q.get('view') || 'top',
  zoom: q.has('zoom') ? Number(q.get('zoom')) : 1,
};
const recipe = await loadRecipe();
const ref = await loadJSON('../data/calc_reference.json');
const R3 = new Renderer($('view'));
R3.opts.transparent = q.get('t') === '1';
R3.opts.hidden = q.get('h') !== '0';
R3.opts.labels = q.get('lab') !== '0';
R3.opts.pins = q.get('pins') !== '0';
R3.opts.color = ['type', 'set', 'u'].includes(q.get('color')) ? q.get('color') : 'round';
R3.opts.hidMode = q.get('hid') === 'chord' ? 'chord' : 'surf';
$('optChord').checked = R3.opts.hidMode === 'chord';
$('optTransparent').checked = R3.opts.transparent; $('optHidden').checked = R3.opts.hidden;
$('optLabels').checked = R3.opts.labels; $('optPins').checked = R3.opts.pins;
document.querySelector(`input[name=color][value=${R3.opts.color}]`).checked = true;

let A = null, V = null;

function buildForm() {
  const form = $('params');
  form.innerHTML = '';
  let grp = null;
  for (const p of PARAM_SCHEMA) {
    if (p.group !== grp) { grp = p.group; const h = document.createElement('div'); h.className = 'grp'; h.textContent = GROUPS[grp]; form.appendChild(h); }
    const row = document.createElement('div'); row.className = 'prm';
    const lab = document.createElement('label'); lab.textContent = p.label; lab.htmlFor = 'p_' + p.key;
    let inp;
    if (p.type === 'select') {
      inp = document.createElement('select');
      for (const o of p.options) { const op = document.createElement('option'); op.value = o; op.textContent = p.optionLabels?.[o] || o; inp.appendChild(op); }
    } else { inp = document.createElement('input'); inp.type = p.type === 'number' ? 'number' : 'text'; if (p.type === 'number') { inp.step = p.step; inp.min = p.min; inp.max = p.max; } }
    inp.id = 'p_' + p.key; inp.value = state.raw[p.key] ?? '';
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.innerHTML = `<span class="st-${p.status}">[${STATUS_LABEL[p.status]}]</span> ${p.basis}. <i>Используется: ${p.used}</i>`;
    row.append(lab, inp, meta); form.appendChild(row);
  }
}
function readForm() {
  const raw = {};
  for (const p of PARAM_SCHEMA) raw[p.key] = $('p_' + p.key).value;
  return raw;
}

function syncURL() {
  const d = defaults(), u = new URLSearchParams();
  for (const p of PARAM_SCHEMA) if (String(state.raw[p.key]) !== String(d[p.key])) u.set(p.key, state.raw[p.key]);
  u.set('stage', state.stage); u.set('k', state.k); u.set('view', state.view);
  if (R3.opts.transparent) u.set('t', '1'); if (!R3.opts.hidden) u.set('h', '0');
  if (!R3.opts.labels) u.set('lab', '0'); if (!R3.opts.pins) u.set('pins', '0'); if (R3.opts.color !== 'round') u.set('color', R3.opts.color);
  if (R3.opts.hidMode === 'chord') u.set('hid', 'chord');
  history.replaceState(null, '', '?' + u.toString());
}

function recompute(first = false) {
  A = computeAll(recipe, state.raw);           // полный пересчёт с нуля
  const errs = A.params._errors;
  $('perr').textContent = errs.length ? 'Входы: ' + errs.join('; ') : '';
  R3.buildStatic(A);
  if (first) {
    R3.view(state.view, A.base.R, q.has('dist') ? Number(q.get('dist')) : null, q.has('dir') ? q.get('dir').split(',').map(Number) : null);
    const fq = q.get('focus');
    const stOf = (round, i) => A.path.stitches.find((st) => st.round === round && st.i === i);
    const focus = fq === 'np' ? [0, 0, A.base.R] : fq === 'tip1' ? stOf('A1', 1).E : fq === 'a2top' ? stOf('A2', 2).E : fq === 'a2tip' ? stOf('A2', 1).E : null;
    if (state.zoom !== 1 || focus) R3.zoomTo(state.zoom, focus);
  }
  setStage(state.stage, first && state.k !== null ? state.k : null);
  const rp = A.rowPlan;
  $('plan').innerHTML = `План рядов по формуле замысла: <b>${rp.nRows}</b> (${rp.rows.map((r) => `n${r.n}: верх ${f(r.sTop, 2)}, низ ${f(r.sBot, 2)} мм`).join('; ')}). Фактические уровни ряда 2 выводит генератор пути (см. V12, V13).`;
}

function setStage(stage, k = null) {
  state.stage = stage;
  document.querySelectorAll('button.stage').forEach((b) => b.classList.toggle('active', b.dataset.stage === stage));
  const kEnd = A.path.stageEnd[stage];
  $('step').max = kEnd;
  state.k = k === null ? kEnd : Math.max(0, Math.min(kEnd, k));
  V = runValidators(A, stage, ref);
  renderValidators();
  update();
}

function update() {
  $('step').value = state.k;
  R3.buildThread(A, state.k);
  const op = A.path.ops[state.k];
  $('opinfo').innerHTML = `<b>Операция ${state.k} / ${A.path.stageEnd[state.stage]}</b> (${op.kind}): ${op.label}<div class="src">Основание: ${op.source}</div>`;
  renderLengths();
  renderLegend();
  renderCaption();
  syncURL();
  window.__sim.ready = true;
  window.__sim.k = state.k; window.__sim.stage = state.stage;
  window.__sim.summary = summary(V);
}

function renderCaption() {
  const P = A.params, op = A.path.ops[state.k];
  const r = A.path.rounds.find((x) => x.id === op.round);
  const sts = r.stitchIdx.map((i) => A.path.stitches[i]);
  const top = sts.find((st) => st.level === 'top'), bot = sts.find((st) => st.level === 'bottom'), cl = sts[sts.length - 1];
  $('caption').innerHTML = `C = ${f(P.C_mm, 0)} мм (R = ${f(A.base.R, 2)}) · S${P.N} · w = ${f(P.w_mm, 3)} · m = ${f(P.m_mm, 2)} мм · этап ${state.stage}, оп. ${state.k}<br>` +
    `обход <b>${r.id}</b> (нить ${r.thread}, ряд ${r.row}): верх s = ${f(top.s, 3)} мм, E/X ±${f(top.eOff, 3)} (замыкающий X ${f(cl.xOff, 3)}); низ s = ${f(bot.s, 3)} мм, E/X ±${f(bot.eOff, 3)}<br>` +
    `длина обхода ${f(r.length, 2)} мм · нить A ${f(A.path.threads.A.uEnd, 1)} мм${A.path.threads.B ? ` · нить B ${f(A.path.threads.B.uEnd, 1)} мм` : ''} (весь рецепт)`;
}

function renderLengths() {
  const path = A.path, kEnd = path.stageEnd[state.stage];
  const ids = new Set(path.ops.slice(0, kEnd + 1).flatMap((o) => o.segIds));
  const segs = path.segs.filter((s) => ids.has(s.id));
  const ids2 = new Set(path.ops.slice(0, state.k + 1).flatMap((o) => o.segIds));
  const rows = [];
  for (const t of Object.keys(path.threads)) {
    const ts = segs.filter((s) => s.thread === t);
    if (!ts.length) continue;
    const byRound = {};
    for (const s of ts) { const b = byRound[s.round] || (byRound[s.round] = { hid: 0, leg: 0, pk: 0, nLeg: 0 }); if (s.type === 'hidden-start') b.hid += s.length; else if (s.type === 'leg') { b.leg += s.length; b.nLeg++; } else b.pk += s.length; }
    for (const [rid, b] of Object.entries(byRound)) {
      const ri = path.rounds.findIndex((r) => r.id === rid), sw = R3.opts.color === 'round' ? roundColor(ri) : SET_COLORS[t];
      rows.push([`<span class="sw" style="background:#${sw.toString(16).padStart(6, '0')}"></span>${rid}: ${b.hid ? `скрытый старт ${f(b.hid, 1)} + ` : ''}плечи (${b.nLeg}) ${f(b.leg, 1)} + захваты ${f(b.pk, 1)}`, f(b.hid + b.leg + b.pk)]);
    }
    const tot = ts.reduce((a, s) => a + s.length, 0);
    const used = path.segs.filter((s) => s.thread === t && ids2.has(s.id)).reduce((a, s) => a + s.length, 0);
    rows.push([`<b>Нить ${t} (цвет ${t}) — всего по этапу</b>; израсходовано до операции ${state.k}: ${f(used, 1)} мм; масса ${f(tot * A.params.tex / 1e6, 3)} г`, `<b>${f(tot)}</b>`]);
  }
  let html = rows.map(([a, b]) => `<tr><td>${a}</td><td class="n">${b} мм</td></tr>`).join('');
  const v3 = V.find((v) => v.id === 'V3');
  if (v3 && v3.numbers) {
    const d = Math.abs(v3.numbers.rowLen - v3.numbers.refLen);
    html += `<tr class="${d < 1e-6 ? 'ok' : ''}"><td>A1 (плечи + захваты) vs calc.py — Δ</td><td class="n">${f(v3.numbers.refLen)} мм · Δ ${d.toExponential(1)}</td></tr>`;
  }
  const hw = A.params.hw, w = A.params.w_mm, R = A.base.R;
  const legs = segs.filter((s) => s.type === 'leg').reduce((a, s) => a + s.length, 0);
  html += `<tr><td>Диагностика: все плечи по оси нити на R + h/2 (h = ${f(hw, 2)}·w — не измерено; подъём в стопке не учтён)</td><td class="n">+${f(legs * hw * w / 2 / R, 2)} мм</td></tr>`;
  $('lengths').innerHTML = html;
}

function renderValidators() {
  const s = summary(V);
  $('vsum').innerHTML = `этап ${state.stage}: <span style="color:#1f7a3a">pass ${s.pass}</span> · <span style="color:#c0392b">fail ${s.fail}</span> · <span style="color:#d68910">warn ${s.warn}</span> · info ${s.info} · n/a ${s['n/a']}`;
  $('validators').innerHTML = V.map((v) => `<li><span class="badge b-${v.status === 'n/a' ? 'na' : v.status}">${v.status}</span><b>${v.id}. ${v.name}</b><div class="val">${v.value}</div><div class="crit">${v.crit}</div></li>`).join('');
}

function renderLegend() {
  const grad = (fn) => `linear-gradient(90deg,${Array.from({ length: 11 }, (_, i) => `#${fn(i / 10).getHexString()}`).join(',')})`;
  const liftNote = '<div class="note">Верхняя нить в перекрёстке приподнята на 0,6·w на уровень стопки — только изображение (высоты — механика, позже). Скрытые участки — светлее цвета своего обхода; канал иглы E→X — тонкая бледная трубка под всеми нитями.</div>';
  if (R3.opts.color === 'round') {
    const shown = new Set(A.path.ops.slice(0, state.k + 1).map((o) => o.round));
    $('legend').innerHTML = A.path.rounds.map((r, i) => `<span${shown.has(r.id) ? '' : ' style="opacity:.4"'}><span class="sw" style="background:#${roundColor(i).toString(16).padStart(6, '0')}"></span>${r.id} — нить ${r.thread}, ряд ${r.row}${shown.has(r.id) ? '' : ' (ещё не шит)'}</span>`).join('') + liftNote;
  } else if (R3.opts.color === 'u') {
    $('legend').innerHTML = Object.values(A.path.threads).map((t) => `нить ${t.id}: u = 0 (конец)<div class="bar" style="background:${grad(t.id === 'B' ? warm : viridis)}"></div>${f(t.uEnd, 1)} мм`).join('<br>');
  } else if (R3.opts.color === 'set') {
    $('legend').innerHTML = Object.entries(SET_COLORS).map(([k2, c]) => `<span><span class="sw" style="background:#${c.toString(16).padStart(6, '0')}"></span>набор ${k2} (нить ${k2}); ряд 2 светлее</span>`).join('') + liftNote;
  } else {
    $('legend').innerHTML = `<span><span class="sw" style="background:#2f6bd6"></span>плечо</span><span><span class="sw" style="background:#d6336c"></span>захват (скрыт)</span><span><span class="sw" style="background:#7a7a7a"></span>скрытый старт</span><span><span class="sw" style="background:#ff8c00"></span>текущая операция</span>`;
  }
}

// события
document.querySelectorAll('button.stage').forEach((b) => b.addEventListener('click', () => setStage(b.dataset.stage)));
document.querySelectorAll('button[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; R3.view(state.view, A.base.R); syncURL(); }));
$('step').addEventListener('input', (e) => { state.k = Number(e.target.value); update(); });
$('prev').addEventListener('click', () => { state.k = Math.max(0, state.k - 1); update(); });
$('next').addEventListener('click', () => { state.k = Math.min(A.path.stageEnd[state.stage], state.k + 1); update(); });
$('first').addEventListener('click', () => { state.k = 0; update(); });
$('last').addEventListener('click', () => { state.k = A.path.stageEnd[state.stage]; update(); });
for (const [id, key] of [['optTransparent', 'transparent'], ['optHidden', 'hidden'], ['optLabels', 'labels'], ['optPins', 'pins']])
  $(id).addEventListener('change', (e) => { R3.opts[key] = e.target.checked; R3.applyOpts(); syncURL(); });
$('optChord').addEventListener('change', (e) => { R3.opts.hidMode = e.target.checked ? 'chord' : 'surf'; update(); });
document.querySelectorAll('input[name=color]').forEach((r) => r.addEventListener('change', (e) => { R3.opts.color = e.target.value; update(); }));
$('recompute').addEventListener('click', (e) => { e.preventDefault(); state.raw = readForm(); recompute(); });
$('reset').addEventListener('click', (e) => { e.preventDefault(); state.raw = defaults(); buildForm(); recompute(); });

buildForm();
recompute(true);
