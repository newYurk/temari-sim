// UI: params → computeAll (pure pipeline) → render/validators. State persists in the URL.
import { loadRecipe, loadJSON } from './recipe.js';
import { computeAll } from './layers.js';
import { runValidators, summary, refKey } from './validators.js';
import { PARAM_SCHEMA, defaults, paramsFromQuery, groupLabel, paramLabel, paramUsed, statusLabel, optionLabel } from './params.js';
import { Renderer, viridis, warm, SET_COLORS, roundColor, applySetColors } from './render.js';
import { t, fmtNum, applyDomI18n, getLocale, setLocale, onLocaleChange, validatorName } from './i18n.js';

const $ = (id) => document.getElementById(id);
const f = (x, d = 3) => fmtNum(x, d);
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
const recipePreset = await loadJSON('../data/recipes/kiku-s8.json');
const materialPreset = await loadJSON('../data/materials/dmc-perle-5.json');
const ref = await loadJSON('../data/calc_reference.json');
const DEFAULT_SET_COLORS = {
  A: recipePreset?.editable?.colors?.sets?.A?.hex || '#1f5fbf',
  B: recipePreset?.editable?.colors?.sets?.B?.hex || '#c2185b',
};
state.colors = {
  A: q.get('colorA') || DEFAULT_SET_COLORS.A,
  B: q.get('colorB') || DEFAULT_SET_COLORS.B,
};
applySetColors(state.colors);
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

function syncLangToggle() {
  const loc = getLocale();
  document.querySelectorAll('.lang-btn').forEach((b) => {
    const on = b.dataset.lang === loc;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}


function renderRecipeMeta() {
  const meta = $('recipe-meta');
  if (!meta) return;
  const id = recipePreset?.id || recipe.id;
  const title = recipePreset?.title || recipe.title || id;
  const mat = recipePreset?.materialPreset || state.raw.materialPreset || '—';
  const matStatus = materialPreset?.status || '—';
  meta.textContent = t('recipe.meta', { id, title, mat, matStatus });
}

function syncColorInputs() {
  if ($('colorA')) $('colorA').value = state.colors.A;
  if ($('colorB')) $('colorB').value = state.colors.B;
}

function applyRecipeColors() {
  applySetColors(state.colors);
  syncColorInputs();
}

function buildForm() {
  const form = $('params');
  form.innerHTML = '';
  let grp = null;
  for (const p of PARAM_SCHEMA) {
    if (p.group !== grp) {
      grp = p.group;
      const h = document.createElement('div');
      h.className = 'grp';
      h.textContent = groupLabel(grp);
      form.appendChild(h);
    }
    const row = document.createElement('div'); row.className = 'prm';
    const lab = document.createElement('label'); lab.textContent = paramLabel(p); lab.htmlFor = 'p_' + p.key;
    let inp;
    if (p.type === 'select') {
      inp = document.createElement('select');
      for (const o of p.options) {
        const op = document.createElement('option');
        op.value = o;
        op.textContent = optionLabel(p, o);
        inp.appendChild(op);
      }
    } else {
      inp = document.createElement('input');
      inp.type = p.type === 'number' ? 'number' : 'text';
      if (p.type === 'number') { inp.step = p.step; inp.min = p.min; inp.max = p.max; }
    }
    inp.id = 'p_' + p.key; inp.value = state.raw[p.key] ?? '';
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.innerHTML = `<span class="st-${p.status}">[${statusLabel(p.status)}]</span> ${p.basis}. <i>${t('meta.used', { used: paramUsed(p) })}</i>`;
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
  u.set('lang', getLocale());
  if (R3.opts.transparent) u.set('t', '1'); if (!R3.opts.hidden) u.set('h', '0');
  if (!R3.opts.labels) u.set('lab', '0'); if (!R3.opts.pins) u.set('pins', '0'); if (R3.opts.color !== 'round') u.set('color', R3.opts.color);
  if (R3.opts.hidMode === 'chord') u.set('hid', 'chord');
  if (state.colors.A.toLowerCase() !== DEFAULT_SET_COLORS.A.toLowerCase()) u.set('colorA', state.colors.A);
  if (state.colors.B.toLowerCase() !== DEFAULT_SET_COLORS.B.toLowerCase()) u.set('colorB', state.colors.B);
  history.replaceState(null, '', '?' + u.toString());
}

function recompute(first = false) {
  A = computeAll(recipe, state.raw);           // full recompute from scratch
  const errs = A.params._errors;
  $('perr').textContent = errs.length ? t('err.inputs', { errs: errs.join('; ') }) : '';
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
  const rows = rp.rows.map((r) => t('plan.rowItem', { n: r.n, sTop: f(r.sTop, 2), sBot: f(r.sBot, 2) })).join('; ');
  $('plan').innerHTML = t('plan.rows', { n: rp.nRows, rows });
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
  $('opinfo').innerHTML = `<b>${t('op.header', { k: state.k, kEnd: A.path.stageEnd[state.stage] })}</b> (${op.kind}): ${op.label}<div class="src">${t('op.basis', { source: op.source })}</div>`;
  renderLengths();
  renderLegend();
  renderCaption();
  syncURL();
  window.__sim.ready = true;
  window.__sim.k = state.k; window.__sim.stage = state.stage;
  window.__sim.summary = summary(V);
  window.__sim.locale = getLocale();
  window.__sim.recipePreset = recipePreset;
  window.__sim.materialPreset = materialPreset;
  window.__sim.colors = { ...state.colors };
}

function renderCaption() {
  const P = A.params, op = A.path.ops[state.k];
  const r = A.path.rounds.find((x) => x.id === op.round);
  const sts = r.stitchIdx.map((i) => A.path.stitches[i]);
  const top = sts.find((st) => st.level === 'top'), bot = sts.find((st) => st.level === 'bottom'), cl = sts[sts.length - 1];
  const uB = A.path.threads.B ? t('caption.threadB', { uB: f(A.path.threads.B.uEnd, 1) }) : '';
  const td = A.path.tipDrop;
  const tipLine = td
    ? '<br>' + t('caption.tipDrop', {
        dS: f(td.tipDrop_mm, 3), form: td.shoulderForm,
        bow: f(td.bowLateralMm, 3), cap: f(td.phi3CapMm, 3), mu: f(td.mu, 2),
        warn: td.phi3Warn ? t('caption.tipDropWarn') : '',
      })
    : '';
  $('caption').innerHTML =
    t('caption.line1', { C: f(P.C_mm, 0), R: f(A.base.R, 2), N: P.N, w: f(P.w_mm, 3), m: f(P.m_mm, 2), stage: state.stage, k: state.k }) + '<br>' +
    t('caption.line2', { round: r.id, thread: r.thread, row: r.row, sTop: f(top.s, 3), eTop: f(top.eOff, 3), xCl: f(cl.xOff, 3), sBot: f(bot.s, 3), eBot: f(bot.eOff, 3) }) + '<br>' +
    t('caption.line3', { rLen: f(r.length, 2), uA: f(A.path.threads.A.uEnd, 1), uB }) + tipLine;
}

function renderLengths() {
  const path = A.path, kEnd = path.stageEnd[state.stage];
  const ids = new Set(path.ops.slice(0, kEnd + 1).flatMap((o) => o.segIds));
  const segs = path.segs.filter((s) => ids.has(s.id));
  const ids2 = new Set(path.ops.slice(0, state.k + 1).flatMap((o) => o.segIds));
  const rows = [];
  for (const thr of Object.keys(path.threads)) {
    const ts = segs.filter((s) => s.thread === thr);
    if (!ts.length) continue;
    const byRound = {};
    for (const s of ts) { const b = byRound[s.round] || (byRound[s.round] = { hid: 0, leg: 0, pk: 0, nLeg: 0 }); if (s.type === 'hidden-start') b.hid += s.length; else if (s.type === 'leg') { b.leg += s.length; b.nLeg++; } else b.pk += s.length; }
    for (const [rid, b] of Object.entries(byRound)) {
      const ri = path.rounds.findIndex((r) => r.id === rid), sw = R3.opts.color === 'round' ? roundColor(ri) : SET_COLORS[thr];
      const hid = b.hid ? t('len.hiddenStart', { hid: f(b.hid, 1) }) : '';
      rows.push([`<span class="sw" style="background:#${sw.toString(16).padStart(6, '0')}"></span>${t('len.roundRow', { rid, hid, nLeg: b.nLeg, leg: f(b.leg, 1), pk: f(b.pk, 1) })}`, f(b.hid + b.leg + b.pk)]);
    }
    const tot = ts.reduce((a, s) => a + s.length, 0);
    const used = path.segs.filter((s) => s.thread === thr && ids2.has(s.id)).reduce((a, s) => a + s.length, 0);
    rows.push([t('len.threadTot', { t: thr, k: state.k, used: f(used, 1), mass: f(tot * A.params.tex / 1e6, 3) }), `<b>${f(tot)}</b>`]);
  }
  let html = rows.map(([a, b]) => `<tr><td>${a}</td><td class="n">${b} ${getLocale() === 'ru' ? 'мм' : 'mm'}</td></tr>`).join('');
  const v3 = V.find((v) => v.id === 'V3');
  if (v3 && v3.numbers) {
    const d = Math.abs(v3.numbers.rowLen - v3.numbers.refLen);
    html += `<tr class="${d < 1e-6 ? 'ok' : ''}"><td>${t('len.v3')}</td><td class="n">${f(v3.numbers.refLen)} ${getLocale() === 'ru' ? 'мм' : 'mm'} · Δ ${d.toExponential(1)}</td></tr>`;
  }
  const hw = A.params.hw, w = A.params.w_mm, R = A.base.R;
  const legs = segs.filter((s) => s.type === 'leg').reduce((a, s) => a + s.length, 0);
  html += `<tr><td>${t('len.diag', { hw: f(hw, 2) })}</td><td class="n">+${f(legs * hw * w / 2 / R, 2)} ${getLocale() === 'ru' ? 'мм' : 'mm'}</td></tr>`;
  if (A.path.tipDrop) {
    const td = A.path.tipDrop;
    const unit = getLocale() === 'ru' ? 'мм' : 'mm';
    html += `<tr class="${td.phi3Warn ? 'warn' : 'ok'}"><td>${t('len.tipDrop')} · ${td.shoulderForm}</td><td class="n"><b>${f(td.tipDrop_mm, 3)}</b> ${unit}</td></tr>`;
  }
  $('lengths').innerHTML = html;
}

function renderValidators() {
  const s = summary(V);
  $('vsum').innerHTML = t('vsum', { stage: state.stage, pass: s.pass, fail: s.fail, warn: s.warn, info: s.info, na: s['n/a'] });
  $('validators').innerHTML = V.map((v) => `<li><span class="badge b-${v.status === 'n/a' ? 'na' : v.status}">${v.status}</span><b>${v.id}. ${validatorName(v)}</b><div class="val">${v.value}</div><div class="crit">${v.crit}</div></li>`).join('');
}

function renderLegend() {
  const grad = (fn) => `linear-gradient(90deg,${Array.from({ length: 11 }, (_, i) => `#${fn(i / 10).getHexString()}`).join(',')})`;
  const liftNote = `<div class="note">${t('legend.lift')}</div>`;
  if (R3.opts.color === 'round') {
    const shown = new Set(A.path.ops.slice(0, state.k + 1).map((o) => o.round));
    $('legend').innerHTML = A.path.rounds.map((r, i) => {
      const pending = shown.has(r.id) ? '' : t('legend.pending');
      return `<span${shown.has(r.id) ? '' : ' style="opacity:.4"'}><span class="sw" style="background:#${roundColor(i).toString(16).padStart(6, '0')}"></span>${t('legend.round', { id: r.id, thread: r.thread, row: r.row, pending })}</span>`;
    }).join('') + liftNote;
  } else if (R3.opts.color === 'u') {
    $('legend').innerHTML = Object.values(A.path.threads).map((thr) => `${t('legend.u', { id: thr.id })}<div class="bar" style="background:${grad(thr.id === 'B' ? warm : viridis)}"></div>${f(thr.uEnd, 1)} ${getLocale() === 'ru' ? 'мм' : 'mm'}`).join('<br>');
  } else if (R3.opts.color === 'set') {
    $('legend').innerHTML = Object.entries(SET_COLORS).map(([k2, c]) => `<span><span class="sw" style="background:#${c.toString(16).padStart(6, '0')}"></span>${t('legend.set', { k: k2 })}</span>`).join('') + liftNote;
  } else {
    $('legend').innerHTML =
      `<span><span class="sw" style="background:#2f6bd6"></span>${t('legend.type.leg')}</span>` +
      `<span><span class="sw" style="background:#d6336c"></span>${t('legend.type.pickup')}</span>` +
      `<span><span class="sw" style="background:#7a7a7a"></span>${t('legend.type.hidden')}</span>` +
      `<span><span class="sw" style="background:#ff8c00"></span>${t('legend.type.current')}</span>`;
  }
}

function refreshI18nUI() {
  applyDomI18n(document);
  syncLangToggle();
  renderRecipeMeta();
  syncColorInputs();
  const keepK = state.k;
  buildForm();
  if (A) {
    // Recompute so path op labels / 3D labels pick up the new locale via t().
    recompute(false);
    if (keepK !== null) setStage(state.stage, keepK);
  }
}

// events
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
document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.lang === getLocale()) return;
  setLocale(b.dataset.lang);
}));
onLocaleChange(() => refreshI18nUI());

function onColorInput(which, hex) {
  state.colors[which] = hex;
  applySetColors(state.colors);
  if (R3.opts.color !== 'set') {
    const radio = document.querySelector('input[name=color][value=set]');
    if (radio) { radio.checked = true; R3.opts.color = 'set'; }
  }
  update();
}
$('colorA').addEventListener('input', (e) => onColorInput('A', e.target.value));
$('colorB').addEventListener('input', (e) => onColorInput('B', e.target.value));
$('colorReset').addEventListener('click', () => {
  state.colors = { A: DEFAULT_SET_COLORS.A, B: DEFAULT_SET_COLORS.B };
  applyRecipeColors();
  update();
});

applyDomI18n(document);
syncLangToggle();
renderRecipeMeta();
syncColorInputs();
buildForm();
recompute(true);
