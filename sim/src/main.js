// UI: параметры → computeAll (чистый конвейер) → рендер/валидаторы. Состояние сохраняется в URL.
import { loadRecipe, loadJSON } from './recipe.js';
import { computeAll } from './layers.js';
import { runValidators, summary, refKey } from './validators.js';
import { PARAM_SCHEMA, GROUPS, STATUS_LABEL, defaults, paramsFromQuery } from './params.js';
import { Renderer, viridis } from './render.js';

const $ = (id) => document.getElementById(id);
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
window.__sim = { ready: false, errors: [] };
window.addEventListener('error', (e) => window.__sim.errors.push(String(e.message)));

const q = new URLSearchParams(location.search);
const state = {
  raw: { ...defaults(), ...paramsFromQuery(location.search) },
  stage: q.get('stage') === '2a' ? '2a' : '2b',
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
R3.opts.color = q.get('color') === 'type' ? 'type' : 'u';
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
  if (!R3.opts.labels) u.set('lab', '0'); if (!R3.opts.pins) u.set('pins', '0'); if (R3.opts.color !== 'u') u.set('color', R3.opts.color);
  if (R3.opts.hidMode === 'chord') u.set('hid', 'chord');
  history.replaceState(null, '', '?' + u.toString());
}

function recompute(first = false) {
  A = computeAll(recipe, state.raw);           // полный пересчёт с нуля
  const errs = A.params._errors;
  $('perr').textContent = errs.length ? 'Входы: ' + errs.join('; ') : '';
  R3.buildStatic(A);
  if (first) {
    R3.view(state.view, A.base.R, q.has('dist') ? Number(q.get('dist')) : null);
    const fq = q.get('focus');
    const focus = fq === 'np' ? [0, 0, A.base.R] : fq === 'tip1' ? A.path.stitches[0].E : null;
    if (state.zoom !== 1 || focus) R3.zoomTo(state.zoom, focus);
  }
  setStage(state.stage, first && state.k !== null ? state.k : null);
  const rp = A.rowPlan;
  $('plan').innerHTML = `План рядов по замыслу: <b>${rp.nRows}</b> (${rp.rows.map((r) => `n${r.n}: верх ${f(r.sTop, 2)}, низ ${f(r.sBot, 2)} мм`).join('; ')}). ${rp.note}`;
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
  const P = A.params, st = A.path.stitches[0], cl = A.path.stitches[A.path.stitches.length - 1];
  $('caption').innerHTML = `C = ${f(P.C_mm, 0)} мм (R = ${f(A.base.R, 2)}) · S${P.N} · w = ${f(P.w_mm, 3)} · m = ${f(P.m_mm, 2)} мм<br>` +
    `верх ${f(A.layout.sTop, 2)} мм, низ ${f(A.layout.sBot, 2)} мм от СП · E/X = ±${f(st.eOff, 3)} мм (замыкающий X ${f(cl.xOff, 3)})<br>` +
    `ряд 1 (весь обход): ${f(A.path.uEnd - A.path.segs.filter((x) => x.type === 'hidden-start').reduce((a, x) => a + x.length, 0), 2)} мм · план: ${A.rowPlan.nRows} ряд(а) · этап ${state.stage}, оп. ${state.k}`;
}

function renderLengths() {
  const path = A.path, kEnd = A.path.stageEnd[state.stage];
  const ids = new Set(path.ops.slice(0, kEnd + 1).flatMap((o) => o.segIds));
  const segs = path.segs.filter((s) => ids.has(s.id));
  const sum = (t) => segs.filter((s) => s.type === t).reduce((a, s) => a + s.length, 0);
  const hid = sum('hidden-start'), legs = sum('leg'), pk = sum('pickup');
  const v3 = V.find((v) => v.id === 'V3');
  const ids2 = new Set(path.ops.slice(0, state.k + 1).flatMap((o) => o.segIds));
  const uk = path.segs.filter((s) => ids2.has(s.id)).reduce((a, s) => a + s.length, 0);
  const hw = A.params.hw, w = A.params.w_mm, R = A.base.R;
  const axis = legs * (R + hw * w / 2) / R;
  const nLeg = segs.filter((s) => s.type === 'leg').length, nPk = segs.filter((s) => s.type === 'pickup').length;
  const rows = [
    ['Скрытый старт (' + (A.params.startRule === 'TK-ANCHOR' ? '2' : '1') + ' × ' + f(A.params.startRun_mm, 1) + ' мм, хорды)', f(hid)],
    [`Видимые плечи (${nLeg}, геодезические)`, f(legs)],
    [`Скрытые захваты (${nPk}, хорды E→X, выведены)`, f(pk)],
    [state.stage === '2b' ? 'Ряд 1 = плечи + захваты (sim)' : 'Префикс ряда 1 (sim)', f(legs + pk)],
  ];
  let html = rows.map(([a, b]) => `<tr><td>${a}</td><td class="n">${b} мм</td></tr>`).join('');
  if (v3 && v3.numbers) {
    const d = Math.abs(v3.numbers.rowLen - v3.numbers.refLen);
    html += `<tr class="${d < 1e-6 ? 'ok' : ''}"><td>calc.py (эталон, numpy) — Δ</td><td class="n">${f(v3.numbers.refLen)} мм · Δ ${d.toExponential(1)}</td></tr>`;
  } else html += `<tr><td>calc.py</td><td class="n">нет эталона для этих входов</td></tr>`;
  html += `<tr class="tot"><td>Всего нити этапа (старт + ряд)</td><td class="n">${f(hid + legs + pk)} мм</td></tr>`;
  html += `<tr><td>Израсходовано до операции ${state.k}</td><td class="n">${f(uk)} мм</td></tr>`;
  html += `<tr><td>Диагностика: плечи по оси нити на R + h/2 (h = ${f(hw, 2)}·w — не измерено)</td><td class="n">${f(axis)} мм (+${f(axis - legs, 2)})</td></tr>`;
  html += `<tr><td>Масса нити этапа (текс ${A.params.tex})</td><td class="n">${f((hid + legs + pk) * A.params.tex / 1e6, 4)} г</td></tr>`;
  const defaultsNow = refKey(A) === 'C=240|w=0.714|m=1|N=8|sTop=5.000000|bfe=0.333333|start=TK-ANCHOR:35';
  if (defaultsNow && state.stage === '2b')
    html += `<tr><td colspan="2" class="note">Stage-1 calc.py давал 316,063 мм при заданном захвате ±1 мм (2 мм). После D16 захват выведен: m + w = 1,714 мм, замыкающий 2,428 мм → 313,088 мм. Разница −2,975 мм = захваты (−1,520) + сдвиг E/X, укорачивающий плечи (−1,455).</td></tr>`;
  $('lengths').innerHTML = html;
}

function renderValidators() {
  const s = summary(V);
  $('vsum').innerHTML = `этап ${state.stage}: <span style="color:#1f7a3a">pass ${s.pass}</span> · <span style="color:#c0392b">fail ${s.fail}</span> · <span style="color:#d68910">warn ${s.warn}</span> · info ${s.info} · n/a ${s['n/a']}`;
  $('validators').innerHTML = V.map((v) => `<li><span class="badge b-${v.status === 'n/a' ? 'na' : v.status}">${v.status}</span><b>${v.id}. ${v.name}</b><div class="val">${v.value}</div><div class="crit">${v.crit}</div></li>`).join('');
}

function renderLegend() {
  if (R3.opts.color === 'u') {
    const stops = Array.from({ length: 11 }, (_, i) => `#${viridis(i / 10).getHexString()}`).join(',');
    $('legend').innerHTML = `u = 0 (конец нити)<div class="bar" style="background:linear-gradient(90deg,${stops})"></div>${f(A.path.uEnd, 1)} мм`;
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
