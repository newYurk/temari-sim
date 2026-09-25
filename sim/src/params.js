// Simulator input parameters. All are user controls (owner requirement: fully parametric model).
// Each has: group, default, basis, and status.
// Statuses: 'source' — from a craft source; 'default' — default, NOT measured;
// 'stored' — kept but unused by this stage's geometry; 'intent' — design intent.
// Pickup/catch width is intentionally absent (decision D16): E/X are derived from what is already on the ball.
// Canonical labels/groups/status/optionLabels are English (repo language). Russian UI via i18n keys.

import { t } from './i18n.js';

export const GROUPS = {
  base: 'a) Ball / base',
  marking: 'b) Marking',
  thread: 'c) Thread / material',
  process: 'd) Process',
  intent: 'e) Intent (layer “kiku, set A”)',
};

export const PARAM_SCHEMA = [
  { key: 'C_mm', group: 'base', label: 'Mari circumference C, mm', type: 'number', def: 240, min: 120, max: 450, step: 1,
    basis: 'TK-GT14 “23–25 cm circum mari” → mid 240 mm', status: 'source', used: 'geometry' },
  { key: 'baseWrap', group: 'base', label: 'Base wrap', type: 'text', def: 'white, stiffness not measured',
    basis: 'TK-GT14 “wrapped in white”; compliance — uncertainties P6', status: 'stored', used: 'unused' },

  { key: 'N', group: 'marking', label: 'Division count (Simple N)', type: 'select', def: 8, options: [4, 6, 8, 10, 12, 16],
    basis: 'TK-GT14 “Simple 8 division”; kiku of 2 sets needs even N', status: 'source', used: 'geometry' },
  { key: 'm_mm', group: 'marking', label: 'Marking thread width m, mm', type: 'number', def: 1.0, min: 0.1, max: 2, step: 0.05,
    basis: 'TK-GAUGE “Rainbow Gallery Nordic Gold – 1 strand = 1mm” (only gold-metallic gauge in sources; marking often thinner → upper estimate)',
    status: 'default', used: 'geometry: E/X position' },

  { key: 'w_mm', group: 'thread', label: 'Laid thread width w, mm', type: 'number', def: 0.714, min: 0.2, max: 2, step: 0.001,
    basis: 'TK-GAUGE “DMC Perle 5 – 7 threads = 0.5cm” (same page: 10 rows ≈ 7.5 mm → 0.75)',
    status: 'default', used: 'geometry: E/X, row plan; render (tube diameter)' },
  { key: 'hw', group: 'thread', label: 'Cross-section h/w', type: 'number', def: 0.65, min: 0.2, max: 1, step: 0.01,
    basis: 'prior analogue 0.71×0.46 mm (not Perle #5, docs_thread-over-thread)', status: 'stored',
    used: 'diagnostics only (“length along thread axis”)' },
  { key: 'tex', group: 'thread', label: 'Linear density, tex', type: 'number', def: 200, min: 20, max: 1000, step: 1,
    basis: 'PRIOR-THREAD: 25 m / 5 g (DMC/Olympus/Cosmo #5)', status: 'default', used: 'thread mass (diagnostics)' },
  { key: 'mu', group: 'thread', label: 'μ thread–thread', type: 'number', def: 0.32, min: 0, max: 1.5, step: 0.01,
    basis: 'PHYS-COTTON-MU 0.32–0.52 — cotton yarn, NOT #5 (order of magnitude only)', status: 'stored', used: 'unused (no mechanics)' },
  { key: 'compress', group: 'thread', label: 'Cross-section compressibility', type: 'text', def: 'unknown',
    basis: 'model/spec.md T3/T4 — analogue laws only, no #5 numbers', status: 'stored', used: 'unused' },

  { key: 'tension_N', group: 'process', label: 'Tension T, N', type: 'number', def: '', min: 0, max: 20, step: 0.1, optional: true,
    basis: 'not measured (uncertainties P3); Olympus: «糸を少し緩ませて»', status: 'stored', used: 'not used by geometry yet' },
  { key: 'startRule', group: 'process', label: 'Start anchor', type: 'select', def: 'TK-ANCHOR', options: ['TK-ANCHOR', 'OLY-BASIC'],
    optionLabels: { 'TK-ANCHOR': 'TK-ANCHOR: 2 passes into the same hole', 'OLY-BASIC': 'OLY-BASIC: 1 pass, no knot' },
    basis: 'TK-ANCHOR (same-hole re-entry); OLY-BASIC «２～３㎝ほど離れた所から…玉とめなどはしません»', status: 'source', used: 'hidden start' },
  { key: 'startRun_mm', group: 'process', label: 'Hidden run length, mm', type: 'number', def: 35, min: 5, max: 70, step: 1,
    basis: 'TK-ANCHOR “For a 23cm mari … 1–1 1/2" (3–4cm)”; OLY-BASIC 2–3 cm', status: 'source', used: 'hidden start, balance' },

  { key: 'topMode', group: 'intent', label: 'Row-1 top points given as', type: 'select', def: 'mm', options: ['mm', 'fracQ'],
    optionLabels: { mm: 'mm from pole (GT14)', fracQ: 'fraction of pole–equator arc' },
    basis: 'TK-GT14 “5 mm down from the NP” — given in mm', status: 'intent', used: 'geometry' },
  { key: 'sTop_mm', group: 'intent', label: 'Top: mm from NP', type: 'number', def: 5, min: 1, max: 30, step: 0.1,
    basis: 'TK-GT14', status: 'source', used: 'if “mm”' },
  { key: 'sTopFrac', group: 'intent', label: 'Top: fraction of Q', type: 'number', def: 0.0833, min: 0.01, max: 0.5, step: 0.001,
    basis: '5/60 — GT14 rescale for C = 240 (intent variant)', status: 'intent', used: 'if “fraction”' },
  { key: 'bottomFromEq', group: 'intent', label: 'Bottom: fraction of Q from equator', type: 'number', def: 1 / 3, min: 0.05, max: 0.9, step: 0.0001,
    basis: 'TK-GT14 “1/3 of this distance up from the equator”', status: 'source', used: 'geometry (pins)' },
  { key: 'rowsMode', group: 'intent', label: 'How many rows per set', type: 'select', def: 'untilEquator', options: ['untilEquator', 'untilOly7', 'count'],
    optionLabels: { untilEquator: 'to the equator (GT14)', untilOly7: 'to 7 mm above equator (Olympus TM-7, other technique)', count: 'exactly N rows per set' },
    basis: 'TK-GT14 “Work to the equator”; SUESS-2014 practice ball — 5 rows per set; OLY-TM7-L 水色ピン', status: 'intent',
    used: 'path: “to equator” — row not sewn if derived tip below limit; “exactly N” — N rows, tips past limit → V12 warn (thickness not reduced)' },
  { key: 'rowsCount', group: 'intent', label: 'N rows per set (if “exactly N”)', type: 'number', def: 5, min: 1, max: 30, step: 1,
    basis: 'user intent; SUESS-2014: 5 rows A and 5 rows B', status: 'intent', used: 'path and row plan' },
  { key: 'order', group: 'intent', label: 'Row order', type: 'select', def: 'alternate', options: ['alternate', 'blocks', 'sequence'],
    optionLabels: { alternate: 'by row: A1, B1, A2, B2 … (GT14)', blocks: 'in blocks: k rows A, then k rows B (Suess 2014)', sequence: 'explicit sequence' },
    basis: 'TK-GT14 “Continue to alternate rounds”; SUESS-2014 (S8 practice ball: 5 rows A, then 5 rows B)', status: 'intent', used: 'path: round chronology ⇒ over/under, occupancy' },
  { key: 'blockSize', group: 'intent', label: 'k rows per block (if “blocks”)', type: 'number', def: 5, min: 1, max: 30, step: 1,
    basis: 'SUESS-2014: 5', status: 'intent', used: 'if “blocks”' },
  { key: 'sequence', group: 'intent', label: 'Sequence (if “explicit”)', type: 'text', def: 'AAAAABBBBB',
    basis: 'intent: letter = next row of that set (A or B); letter count per set = its row count', status: 'intent', used: 'if “explicit”' },
  { key: 'spacingMode', group: 'intent', label: 'Bottom spacing between rows', type: 'select', def: 'laidClose', options: ['laidClose', 'fixedPitch'],
    optionLabels: { laidClose: 'lay close → stitch at intersection', fixedPitch: 'fixed pitch' },
    basis: 'TK-STRETCH, OLY-TM7-V «自然に交わる所» / TK-UWA “about 2mm”', status: 'intent', used: 'row plan' },
  { key: 'pitch_mm', group: 'intent', label: 'Fixed bottom pitch, mm', type: 'number', def: 2, min: 0.5, max: 10, step: 0.1,
    basis: 'TK-UWA “about 2mm … not a constant”', status: 'source', used: 'if “fixed”' },
];

/** English canonical status labels; UI resolves via i18n. */
export const STATUS_LABEL = {
  source: 'source', default: 'default, not measured', stored: 'stored, unused', intent: 'intent',
};

/** Localized group title. */
export function groupLabel(key) {
  return t(`group.${key}`, {}, GROUPS[key] || key);
}

/** Localized param label. */
export function paramLabel(p) {
  return t(`param.${p.key}.label`, {}, p.label);
}

/** Localized “used” blurb. */
export function paramUsed(p) {
  return t(`param.${p.key}.used`, {}, p.used);
}

/** Localized status badge text. */
export function statusLabel(status) {
  return t(`status.${status}`, {}, STATUS_LABEL[status] || status);
}

/** Localized select option label. */
export function optionLabel(p, opt) {
  return t(`param.${p.key}.option.${opt}`, {}, p.optionLabels?.[opt] || String(opt));
}

export function defaults() {
  const o = {};
  for (const p of PARAM_SCHEMA) o[p.key] = p.def;
  return o;
}

/** Normalize and validate inputs. Returns a NEW frozen object (no refs to old sets). */
export function normalizeParams(raw = {}) {
  const out = {};
  const errors = [];
  for (const p of PARAM_SCHEMA) {
    let v = raw[p.key] !== undefined ? raw[p.key] : p.def;
    if (p.type === 'number') {
      if (v === '' || v === null) { v = p.optional ? null : p.def; }
      else {
        v = Number(v);
        if (!Number.isFinite(v)) { errors.push(t('err.notNumber', { key: p.key })); v = p.def; }
        if (v < p.min || v > p.max) errors.push(t('err.outOfRange', { key: p.key, v, min: p.min, max: p.max }));
      }
    } else if (p.type === 'select') {
      const opt = p.options.find((o) => String(o) === String(v));
      if (opt === undefined) { errors.push(t('err.badSelect', { key: p.key, v })); v = p.def; } else v = opt;
    } else v = String(v);
    out[p.key] = v;
  }
  if (out.N % 2 !== 0) errors.push(t('err.NEven'));
  if (out.order === 'sequence') {
    const seq = parseSequence(out.sequence);
    if (!seq.ok) errors.push(t('err.sequenceLetters', { sequence: out.sequence }));
    if (!seq.letters.length) errors.push(t('err.sequenceEmpty'));
  }
  return Object.freeze({ ...out, _errors: Object.freeze(errors) });
}

/** Parse explicit set sequence: “AAAAABBBBB”, “A,A,B”, or “A5 B5” (letter + repeat count). */
export function parseSequence(text, sets = ['A', 'B']) {
  const letters = [];
  let ok = true;
  for (const tok of String(text || '').toUpperCase().match(/[A-Z]\d*|[^\sA-Z,;]+/g) || []) {
    const m = /^([A-Z])(\d*)$/.exec(tok);
    if (!m || !sets.includes(m[1])) { ok = false; continue; }
    const n = m[2] ? Number(m[2]) : 1;
    for (let i = 0; i < n; i++) letters.push(m[1]);
  }
  return { letters, ok };
}

/** Params from query string (?C_mm=300&w_mm=1). */
export function paramsFromQuery(search) {
  const q = new URLSearchParams(search);
  const raw = {};
  for (const p of PARAM_SCHEMA) if (q.has(p.key)) raw[p.key] = q.get(p.key);
  return raw;
}

/** Stable hash (FNV-1a 32) of an arbitrary JSON object — layer provenance stamp. */
export function hashOf(obj) {
  const s = JSON.stringify(obj, Object.keys(obj).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
