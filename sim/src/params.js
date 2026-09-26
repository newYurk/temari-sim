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
  look: 'f) Look (render only)',
};

/** #44: thread look by thread type — RENDER ONLY. Nominal diameter, colour, sheen, twist per type. Geometry never reads
 *  these: the laid thread keeps its width w (tube diameter = w), the marking its model width m; the jiwari look has its own
 *  visual diameter (jiwariDiameter_mm) and colour (jiwariColor), defaulting to the chosen type. Diameters are estimates.
 *  roughness / metalness / sheen → three.js MeshPhysicalMaterial; twist = depth of the ply shading (0…1), pitch_mm = lay
 *  length of one ply turn, plies = number of plies. */
export const THREAD_LOOKS = {
  sewing: { label: 'sewing thread (thin, matte)', diameter_mm: 0.25, color: '#f4f0e6', roughness: 0.8, metalness: 0, sheen: 0.2, sheenRoughness: 0.5, specular: 0.3, edge: 0.25, twist: 0.15, pitch_mm: 0.6, plies: 3,
    status: 'estimate', source: 'Suess (book photo): thin marking close to the wrap; sewing thread #50–60 ≈ 0.2–0.3 mm (estimate)' },
  'perle-8': { label: 'pearl cotton #8', diameter_mm: 0.5, color: '#ede3c8', roughness: 0.55, metalness: 0, sheen: 0.7, sheenRoughness: 0.35, specular: 0.3, edge: 0.3, twist: 0.55, pitch_mm: 1.1, plies: 2,
    status: 'estimate', source: 'DMC Pearl Cotton #8 ≈ 0.5 mm (estimate); Temari Bunko 二色重ね菊: cream jiwari 0.6–0.8 mm, 4–5× the wrap strand' },
  'perle-5': { label: 'pearl cotton #5', diameter_mm: 0.714, color: '#ede3c8', roughness: 0.5, metalness: 0, sheen: 0.7, sheenRoughness: 0.35, specular: 0.3, edge: 0.3, twist: 0.6, pitch_mm: 1.6, plies: 2,
    status: 'default', source: 'DMC Pearl Cotton #5: materials/dmc-perle-5.json (w 0.714 mm, TK-GAUGE); twist visible at close range (Suess photo)' },
  'metallic-gold': { label: 'metallic gold', diameter_mm: 0.5, color: '#c9a55a', roughness: 0.3, metalness: 1, sheen: 0, sheenRoughness: 0.5, specular: 1, edge: 0, twist: 0.3, pitch_mm: 0.8, plies: 3,
    status: 'estimate', source: 'Kreinik Fine #8 braid “approximately .50 mm” (spec 6a.22 — the m default); metallic gold marking in TemariKai patterns' },
  'metallic-silver': { label: 'metallic silver', diameter_mm: 0.5, color: '#c9cdd3', roughness: 0.3, metalness: 1, sheen: 0, sheenRoughness: 0.5, specular: 1, edge: 0, twist: 0.3, pitch_mm: 0.8, plies: 3,
    status: 'estimate', source: 'Kreinik Fine #8 braid ≈ 0.5 mm; silver marking in Barb Suess 42-centre posts' },
};
// #44 (owner/coordinator 2026-09-26): default jiwari = pearl #8 in cream, 0.5 mm (Temari Bunko 二色重ね菊 / 菊 9.6 cm);
// gold metallic stays a preset (obi lattice). sheen / sheenRoughness / specular / edge (edge darkening): Perplexity review, render only.
export const JIWARI_LOOK_DEFAULT = 'perle-8';
export const THREAD_LOOK_DEFAULT = 'perle-5';
/** The look of a thread type (unknown → fallback type). */
export function threadLookOf(type, fallback = THREAD_LOOK_DEFAULT) {
  return THREAD_LOOKS[type] ? { id: type, ...THREAD_LOOKS[type] } : { id: fallback, ...THREAD_LOOKS[fallback] };
}

/** Mari outer-wrap (地巻き / jimaki) thread types (#41). The type sets the DEFAULT of μWrap (Φ3 reference mark,
 * not a law) and a nominal thread width; the user may override μWrap. Sources collected in #5 (2026-09-25):
 * TemariKai, Suess, Fujix, Sanuki 地巻き用木綿糸. Top layer = thin sewing / overlock thread, not yarn; matte, slightly
 * hairy thread is preferred for grip; polished polyester, rayon, quilting thread are discouraged (too slippery).
 * muStatus / widthStatus (#41 nit): μ 0.38 (midpoint of the hairy-spun band) and the nominal width 0.3 mm are estimates,
 * not measurements; the panel shows them with the 'estimate' status. sheen / hair: render look only (#42). */
export const WRAP_THREADS = {
  'cotton-sewing': { sheen: 0, hair: 0.15, label: 'cotton sewing thread (smooth)', surface: 'smooth', mu: 0.32, muBand: [0.32, 0.32], muStatus: 'default', width_mm: 0.3, widthStatus: 'estimate', look: 'matte',
    source: 'TemariKai, Suess: top wrap of sewing thread; μ 0.32 = PHYS-COTTON-MU lower bound (cotton yarn vs wrap, order of magnitude)' },
  'spun-poly-60-90': { sheen: 0.5, hair: 0.35, label: 'spun polyester #60–90', surface: 'hairy spun', mu: 0.38, muBand: [0.35, 0.40], muStatus: 'estimate', width_mm: 0.3, widthStatus: 'estimate', look: 'slight sheen, fine hair',
    source: 'Fujix: Japanese norm for the mari wrap is spun polyester #60–90; hairy spun types μ 0.35–0.40 (#41, estimate, midpoint)' },
  overlock: { sheen: 0, hair: 0.4, label: 'overlock thread (King Spun Lock / Fujix)', surface: 'hairy spun', mu: 0.38, muBand: [0.35, 0.40], muStatus: 'estimate', width_mm: 0.3, widthStatus: 'estimate', look: 'matte, fine hair',
    source: 'Fujix / King Spun Lock overlock thread as the very top layer; hairy spun types μ 0.35–0.40 (#41, estimate, midpoint)' },
  'jimaki-cotton': { sheen: 0, hair: 0.6, label: 'jimaki cotton (地巻き用木綿糸)', surface: 'hairy spun', mu: 0.38, muBand: [0.35, 0.40], muStatus: 'estimate', width_mm: 0.3, widthStatus: 'estimate', look: 'matte, hairy',
    source: 'Sanuki 地巻き用木綿糸 / Fujix Cotton: matte cotton wrap thread; hairy spun types μ 0.35–0.40 (#41, estimate, midpoint)' },
  custom: { sheen: 0, hair: 0.15, label: 'custom', surface: 'user', mu: 0.32, muBand: [0.2, 0.6], muStatus: 'default', width_mm: 0.3, widthStatus: 'estimate', look: 'matte',
    source: 'user-defined: μWrap and colour set by hand; μ default = current 0.32' },
};
export const WRAP_THREAD_DEFAULT = 'cotton-sewing';
/** μWrap user range recommended by #41 (UI bounds; the schema keeps 0…1.5 so V20 stress tests still run). */
export const MU_WRAP_RANGE = [0.2, 0.6];
/** Default μWrap for a wrap-thread type (#41); unknown type → the default type. */
export function wrapMuDefault(type) {
  return (WRAP_THREADS[type] || WRAP_THREADS[WRAP_THREAD_DEFAULT]).mu;
}

export const PARAM_SCHEMA = [
  { key: 'C_mm', group: 'base', label: 'Mari circumference C, mm', type: 'number', def: 240, min: 120, max: 450, step: 1,
    basis: 'TK-GT14 “23–25 cm circum mari” → mid 240 mm', status: 'source', used: 'geometry' },
  { key: 'baseWrap', group: 'base', label: 'Base wrap', type: 'text', def: 'white, stiffness not measured',
    basis: 'TK-GT14 “wrapped in white”; compliance — uncertainties P6', status: 'stored', used: 'unused' },
  { key: 'wrapColor', group: 'base', label: 'Wrap colour', type: 'color', def: '#fbf8f1',
    basis: 'current ball colour (#fbf8f1); TK-GT14 “wrapped in white”; sources in #5', status: 'intent', used: 'render: ball colour' },
  { key: 'wrapThread', group: 'base', label: 'Wrap thread type', type: 'select', def: WRAP_THREAD_DEFAULT, options: Object.keys(WRAP_THREADS),
    optionLabels: Object.fromEntries(Object.entries(WRAP_THREADS).map(([k, v]) => [k, v.label])),
    basis: 'sources in #5 (TemariKai, Suess, Fujix, Sanuki 地巻き用木綿糸): thin sewing / overlock thread, not yarn; matte, slightly hairy preferred for grip', status: 'source',
    used: 'sets the default of μWrap and the nominal wrap-thread width (0.3 mm); geometry reads μWrap only as the V20 mark' },
  { key: 'wrapCompliance', group: 'base', label: 'Wrap compliance (estimate)', type: 'text', readonly: true,
    def: 'package density 0.35–0.45 g/cm³, modulus 2–5 MPa, dent δ ≈ 0.05 mm',
    basis: 'estimate, uncertainties P6; sources in #5', status: 'estimate', used: 'display only; used by stage 2.4 (#5), not now' },

  { key: 'N', group: 'marking', label: 'Division count (Simple N)', type: 'select', def: 8, options: [4, 6, 8, 10, 12, 16],
    basis: 'TK-GT14 “Simple 8 division”; kiku of 2 sets needs even N', status: 'source', used: 'geometry' },
  { key: 'generator', group: 'marking', label: 'Marking generator', type: 'select', def: 'S_N', options: ['S_N', 'C8', 'C10', 'C6'],
    optionLabels: { S_N: 'Simple N (the kiku pattern)', C8: 'C8 — 8-combination (marking only)', C10: 'C10 — 10-combination (marking only)', C6: 'C6 — 6 Combination Marking (marking only)' },
    basis: 'TemariKai Standard Divisions (Simple, C8, C10) and «6 Combination Marking (S6)»; spec stage3-arch §1.3 (#52)', status: 'source',
    used: 'marking graph; C8 / C10 / C6 are drawn without a pattern (step 1)' },
  { key: 'm_mm', group: 'marking', label: 'Marking thread width m, mm', type: 'number', def: 0.5, min: 0.1, max: 2, step: 0.05,
    basis: 'Spec 6a.22 (U10/A18): Kreinik Fine #8 “approximately .50 mm”, marking “a bit finer” than the design thread; estimate (b), range 0.35–0.78; 1.0 = stress value only (S16)',
    status: 'default', used: 'geometry: E/X position' },

  // Thread defaults match sim/data/materials/dmc-perle-5.json (estimate/analogue provenance; not measured-on-#5).
  { key: 'materialPreset', group: 'thread', label: 'Material preset id', type: 'text', def: 'dmc-perle-5',
    basis: 'sim/data/materials/dmc-perle-5.json — documents provenance of w/hw/tex/μ; geometry still reads numeric params',
    status: 'stored', used: 'provenance only (UI / export); does not override numbers yet' },
  { key: 'w_mm', group: 'thread', label: 'Laid thread width w, mm', type: 'number', def: 0.714, min: 0.2, max: 2, step: 0.001,
    basis: 'TK-GAUGE “DMC Perle 5 – 7 threads = 0.5cm” (same page: 10 rows ≈ 7.5 mm → 0.75); see materials/dmc-perle-5.json',
    status: 'default', used: 'geometry: E/X, row plan; render (tube diameter)' },
  { key: 'hw', group: 'thread', label: 'Cross-section h/w', type: 'number', def: 0.65, min: 0.2, max: 1, step: 0.01,
    basis: 'prior analogue 0.71×0.46 mm (not Perle #5, docs_thread-over-thread)', status: 'stored',
    used: 'diagnostics only (“length along thread axis”)' },
  { key: 'tex', group: 'thread', label: 'Linear density, tex', type: 'number', def: 200, min: 20, max: 1000, step: 1,
    basis: 'PRIOR-THREAD: 25 m / 5 g (DMC/Olympus/Cosmo #5)', status: 'default', used: 'thread mass (diagnostics)' },
  { key: 'muWrap', group: 'thread', label: 'μ thread–wrap (Φ3)', type: 'number', def: 0.32, min: 0, max: 1.5, step: 0.01,
    rec: MU_WRAP_RANGE, refuseOutOfRange: true,
    basis: 'PHYS-COTTON-MU 0.32–0.52 — cotton yarn vs wrap, NOT #5 (order of magnitude only); Φ3 / P2. Default from wrapThread: 0.32 smooth, 0.35–0.40 hairy spun (#41); user range 0.2–0.6', status: 'default',
    used: 'V20 reference mark (warn λ>μ, fail λ>1.2μ); NOT the default λ source' },
  { key: 'muThread', group: 'thread', label: 'μ thread–thread (P1)', type: 'number', def: 0.32, min: 0, max: 1.5, step: 0.01,
    basis: 'PHYS-COTTON-MU 0.32–0.52 — cotton yarn–yarn, NOT #5 (order of magnitude only); P1', status: 'default',
    used: 'diagnostics / future contact; not used by shoulder lay yet' },
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
  { key: 'topRule', group: 'intent', label: 'Top stitch rule', type: 'select', def: 'braid', options: ['fan', 'braid'],
    optionLabels: { fan: 'fan (G3: hole beyond the trace edge of the outermost own thread + w/2; S8 regression / stress mode, only for ρ_top ≤ 2)', braid: 'braid (default, #54; from the previous stitch of the line, k_top·w wider; TEMPORARY k_top, ℓ_braid,max)' },
    basis: '#50 Fable delta §5.3 (4) T1–T4; TemariKai «about 1 thread-width wider»; #54 Fable §1a: braid is the top rule of every kiku, fan the S8 regression / stress mode (valid for ρ_top = tan β_T / k_top ≤ 2, V24)', status: 'intent',
    used: 'path: top-hole placement (T1); V8 crossover, V16 separate, V22/(11) at the top off in braid' },
  { key: 'kTop', group: 'intent', label: 'Braid k_top (half-width step per row, × w)', type: 'number', def: 0.5, min: 0, max: 2, step: 0.05,
    basis: 'TEMPORARY until #51 coordinates: TemariKai «about 1 thread-width wider» per stitch → 0.5·w per side', status: 'intent', used: 'if topRule = braid' },
  { key: 'lBraidMaxW', group: 'intent', label: 'Braid ℓ_braid,max (× w)', type: 'number', def: 20, min: 0, max: 200, step: 1,
    basis: 'TEMPORARY until #51 coordinates: crossover accepted from the top to s_T(n) + ℓ_braid,max', status: 'intent', used: 'if topRule = braid (V8)' },
  { key: 'shoulderForm', group: 'intent', label: 'Arm tip / shoulder form', type: 'select', def: 'geodesic',
    options: ['geodesic', 'bow'],
    optionLabels: {
      geodesic: 'geodesic (idealization, λ = 0; GT14; engine/test default)',
      bow: 'small-circle bow (λ = bowLambda or from δ_mm via (5); pole-side center; site default λ = 0.32, #47)',
    },
    basis: 'samples/kiku-s8/leg-shape-spec.md Fable v2 §4; model/spec.md Φ3 — intent is λ (or δ); tip Δ is derived. Alias bowToMarking→bow. Recipe: GT14→geodesic; Olympus→bow with λ from measure.',
    status: 'intent', used: 'path: small-circle or geodesic leg; packThenPierce uses Fable (8) for bowed arms' },
  { key: 'bowLambda', group: 'intent', label: 'Bow λ (friction-cone fraction)', type: 'number', def: '', min: 0, max: 2, step: 0.01, optional: true,
    basis: 'Fable v2 §4: intent set by λ∈[0,1] directly (not bowFrac·μ). μWrap is V20 reference only. Default 0.32 ≈ cotton yarn μ order-of-magnitude when form=bow; craft [0,1], max 2 so V20 can catch overshoot.',
    status: 'intent', used: 'path: λ when shoulderForm=bow and bowSagMm empty; unused for geodesic' },
  { key: 'bowSagMm', group: 'intent', label: 'Bow sagitta δ, mm (optional → λ via (5))', type: 'number', def: '', min: 0, max: 20, step: 0.01, optional: true,
    basis: 'Fable v2 formula (5): δ = R·(ρ − arccos(cos ρ / cos(γ/2))), ρ=arccot(λ). If set, overrides bowLambda.',
    status: 'intent', used: 'path: invert (5) for λ when shoulderForm=bow; unused for geodesic' },
  { key: 'bowFrac', group: 'intent', label: 'Legacy λ/μWrap (alias → bowLambda)', type: 'number', def: '', min: 0, max: 2, step: 0.01, optional: true,
    basis: 'DEPRECATED alias: if bowLambda unset and bowFrac set, λ = bowFrac·μWrap. Prefer bowLambda.',
    status: 'stored', used: 'compat only when bowLambda not provided' },
  { key: 'bowSide', group: 'intent', label: 'Bow center side', type: 'select', def: 'pole', options: ['pole', 'equator'],
    optionLabels: { pole: 'pole side (production)', equator: 'equator side (direction negative test)' },
    basis: 'Fable v2 direction negative test; production always pole', status: 'stored',
    used: 'path: small-circle center side when shoulderForm=bow; unused for geodesic' },
  { key: 'spacingMode', group: 'intent', label: 'Bottom spacing between rows', type: 'select', def: 'laidClose', options: ['laidClose', 'fixedPitch'],
    optionLabels: { laidClose: 'lay close → stitch at intersection', fixedPitch: 'fixed pitch' },
    basis: 'TK-STRETCH, OLY-TM7-V «自然に交わる所» / TK-UWA “about 2mm”', status: 'intent', used: 'row plan' },
  { key: 'pitch_mm', group: 'intent', label: 'Fixed bottom pitch, mm', type: 'number', def: 2, min: 0.5, max: 10, step: 0.1,
    basis: 'TK-UWA “about 2mm … not a constant”', status: 'source', used: 'if “fixed”' },

  // #44: look — render only (no layer reads these; stamps and the path are unchanged)
  { key: 'threadLook', group: 'look', label: 'Laid thread look (type)', type: 'select', def: THREAD_LOOK_DEFAULT, options: Object.keys(THREAD_LOOKS),
    optionLabels: Object.fromEntries(Object.entries(THREAD_LOOKS).map(([k, v]) => [k, v.label])),
    basis: '#44: sheen and twist of the embroidery thread by type; the tube diameter stays the geometric w (one source of truth)', status: 'intent',
    used: 'render only: sheen, twist shading of the laid thread' },
  { key: 'jiwariLook', group: 'look', label: 'Marking (jiwari) look (type)', type: 'select', def: JIWARI_LOOK_DEFAULT, options: Object.keys(THREAD_LOOKS),
    optionLabels: Object.fromEntries(Object.entries(THREAD_LOOKS).map(([k, v]) => [k, v.label])),
    basis: '#44: default pearl #8 cream 0.5 mm (Temari Bunko: cream jiwari 4–5× thicker than the wrap); also metallic gold / silver, pearl #5, thin sewing thread (Suess)', status: 'intent',
    used: 'render only: sets the default jiwari diameter and colour, sheen and twist' },
  { key: 'jiwariDiameter_mm', group: 'look', label: 'Marking (jiwari) visual diameter, mm', type: 'number', def: THREAD_LOOKS[JIWARI_LOOK_DEFAULT].diameter_mm, min: 0.1, max: 1.5, step: 0.05,
    basis: '#44: default from the jiwari type (estimate); the model marking width m (geometry) is a separate input', status: 'estimate',
    used: 'render only: jiwari thread diameter' },
  { key: 'jiwariColor', group: 'look', label: 'Marking (jiwari) colour', type: 'color', def: THREAD_LOOKS[JIWARI_LOOK_DEFAULT].color,
    basis: '#44: default from the jiwari type', status: 'intent', used: 'render only: jiwari colour' },
];

/** English canonical status labels; UI resolves via i18n. */
export const STATUS_LABEL = {
  source: 'source', default: 'default, not measured', stored: 'stored, unused', intent: 'intent', estimate: 'estimate',
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


/** Resolve commanded λ for shoulderForm=bow (Fable v2 §4).
 * Priority: bowSagMm → invert (5); else bowLambda; else legacy bowFrac·μWrap; else schema def 0.32.
 * gamma = central angle of chord (from/to); R in mm. Returns { lambda, source }.
 */
export function lambdaFromSagitta(R, gamma, deltaMm) {
  // (5) δ = R·(ρ − arccos(cos ρ / cos(γ/2))), ρ = arccot(λ) = atan(1/λ)
  // Domain: ρ ≥ γ/2 ⇒ λ ≤ cot(γ/2). δ increases with λ.
  const half = gamma / 2;
  const cosHalf = Math.cos(half);
  if (!(deltaMm > 0) || !(R > 0) || !(cosHalf > 1e-15) || !(half > 1e-15)) return 0;
  const lamMax = 1 / Math.tan(half) - 1e-9; // cot(γ/2)
  if (!(lamMax > 0)) return 0;
  const deltaOf = (lam) => {
    if (lam < 1e-15) return 0;
    const rho = Math.atan(1 / lam);
    const c = Math.cos(rho) / cosHalf;
    if (c >= 1 - 1e-15) return R * (rho); // near domain edge — large
    if (c <= -1 + 1e-15) return R * (rho - Math.PI);
    return R * (rho - Math.acos(Math.max(-1, Math.min(1, c))));
  };
  let lo = 0, hi = lamMax, dHi = deltaOf(hi);
  if (deltaMm >= dHi - 1e-12) return hi;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (deltaOf(mid) < deltaMm) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function resolveBowLambda(P, { R, gamma } = {}) {
  const sag = P.bowSagMm;
  if (sag !== '' && sag != null && Number.isFinite(+sag) && +sag > 0 && R > 0 && gamma > 0) {
    return { lambda: lambdaFromSagitta(R, gamma, +sag), source: 'bowSagMm' };
  }
  if (P.bowLambda !== '' && P.bowLambda != null && Number.isFinite(+P.bowLambda)) {
    return { lambda: Math.max(0, +P.bowLambda), source: 'bowLambda' };
  }
  // Legacy: bowFrac · μWrap
  if (P.bowFrac !== '' && P.bowFrac != null && Number.isFinite(+P.bowFrac)) {
    const mu = P.muWrap ?? P.mu ?? 0;
    return { lambda: Math.max(0, +P.bowFrac * Math.max(0, mu)), source: 'bowFrac·μWrap' };
  }
  // Default when form=bow and nothing else set (Fable: μ is V20 mark only; λ defaults to 0.32 as craft starting guess)
  return { lambda: 0.32, source: 'default' };
}


/** Schema defaults. μWrap follows the wrap-thread type of `raw` (#41) unless `raw` sets μWrap itself. */
export function defaults(raw = {}) {
  const o = {};
  for (const p of PARAM_SCHEMA) o[p.key] = p.def;
  if (raw.wrapThread !== undefined) o.muWrap = wrapMuDefault(raw.wrapThread);
  if (raw.jiwariLook !== undefined) { const L = threadLookOf(raw.jiwariLook, JIWARI_LOOK_DEFAULT); o.jiwariDiameter_mm = L.diameter_mm; o.jiwariColor = L.color; }
  return o;
}

/** Normalize and validate inputs. Returns a NEW frozen object (no refs to old sets). */
export function normalizeParams(raw = {}) {
  const src = { ...raw };
  // Temporary aliases so old recipes / URLs keep working (D40).
  if (src.shoulderForm === 'bowToMarking') src.shoulderForm = 'bow';
  if (src.mu !== undefined && src.muWrap === undefined) src.muWrap = src.mu;
  if (src.mu !== undefined && src.muThread === undefined) src.muThread = src.mu;
  // #41: μWrap not given → the default of the wrap-thread type (0.32 for the default type, unchanged).
  if ((src.muWrap === undefined || src.muWrap === '') && src.wrapThread !== undefined) src.muWrap = wrapMuDefault(src.wrapThread);
  // #44: jiwari diameter / colour not given → the jiwari type's (render only)
  if (src.jiwariLook !== undefined) {
    const L = threadLookOf(src.jiwariLook, JIWARI_LOOK_DEFAULT);
    if (src.jiwariDiameter_mm === undefined || src.jiwariDiameter_mm === '') src.jiwariDiameter_mm = L.diameter_mm;
    if (src.jiwariColor === undefined || src.jiwariColor === '') src.jiwariColor = L.color;
  }
  const out = {};
  const errors = [];
  for (const p of PARAM_SCHEMA) {
    let v = src[p.key] !== undefined ? src[p.key] : p.def;
    if (p.type === 'number') {
      if (v === '' || v === null) { v = p.optional ? null : p.def; }
      else {
        v = Number(v);
        if (!Number.isFinite(v)) { errors.push(t('err.notNumber', { key: p.key })); v = p.def; }
        if (v < p.min || v > p.max) {
          errors.push(t('err.outOfRange', { key: p.key, v, min: p.min, max: p.max }));
          // #41 nit: a value outside the schema (e.g. μWrap from a recipe / URL) is refused, not written despite the
          // error — μWrap falls back to the default of the wrap-thread type.
          if (p.refuseOutOfRange) v = p.key === 'muWrap' ? wrapMuDefault(src.wrapThread ?? WRAP_THREAD_DEFAULT) : p.def;
        }
      }
    } else if (p.type === 'select') {
      const opt = p.options.find((o) => String(o) === String(v));
      if (opt === undefined) { errors.push(t('err.badSelect', { key: p.key, v })); v = p.def; } else v = opt;
    } else if (p.type === 'color') {
      v = String(v);
      if (!/^#[0-9a-f]{6}$/i.test(v)) { errors.push(t('err.badColor', { key: p.key, v })); v = p.def; }
      v = v.toLowerCase();
    } else v = p.readonly ? p.def : String(v);
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

/** #47: site (UI/URL) defaults on top of the schema defaults — the page opens with the realistic bowed legs, bow λ = 0.32
 *  (= default μWrap, the largest bow friction holds, tan β ≤ μ). The schema (engine) defaults stay geodesic, so tests,
 *  reference data and tools pinned to defaults() keep their meaning. Geodesic: ?shoulderForm=geodesic or the panel. */
export const UI_DEFAULTS = Object.freeze({ shoulderForm: 'bow', bowLambda: 0.32 });
export function uiDefaults(raw = {}) {
  return { ...defaults(raw), ...UI_DEFAULTS };
}

/** Params from query string (?C_mm=300&w_mm=1). */
export function paramsFromQuery(search) {
  const q = new URLSearchParams(search);
  const raw = {};
  for (const p of PARAM_SCHEMA) if (q.has(p.key)) raw[p.key] = q.get(p.key);
  // Legacy query keys (normalized in normalizeParams).
  if (q.has('mu') && raw.muWrap === undefined) raw.muWrap = q.get('mu');
  if (q.get('shoulderForm') === 'bowToMarking') raw.shoulderForm = 'bow';
  return raw;
}

/** Stable hash (FNV-1a 32) of an arbitrary JSON object — layer provenance stamp. */
export function hashOf(obj) {
  const s = JSON.stringify(obj, Object.keys(obj).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
