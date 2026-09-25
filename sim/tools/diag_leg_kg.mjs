#!/usr/bin/env node
/**
 * Diagnostics (no form change): κ_g along worst legs of A8 / B8 / upper B3,
 * Φ3 limit μ/R as horizontal line, stick-to-axis length at lower A2.
 *
 * Usage (from repo root or sim/tools):
 *   node sim/tools/diag_leg_kg.mjs
 *   node sim/tools/diag_leg_kg.mjs --out sim/out
 *
 * Writes:
 *   <out>/diag-kg-worst-legs.png
 *   <out>/diag-kg-worst-legs.json
 *
 * Does not modify layLeg / bowToMarking / tipDrop algorithm.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadRecipe } from '../src/recipe.js';
import { computeAll } from '../src/layers.js';
import { turnDeg } from '../src/diagnostics.js';
import { angle, unit, sub, mul, dot } from '../src/geom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = resolve(root, argVal('--out', 'sim/out'));
const C_mm = Number(argVal('--C', 240));
const w_mm = Number(argVal('--w', 0.714));
const mu = Number(argVal('--mu', 0.32));
const shoulderForm = argVal('--form', 'bowToMarking');
/** Latitude (mm) below which a sample counts as glued to the marking meridian. */
const STICK_LAT_MM = Number(argVal('--stick-lat', 0.05));

mkdirSync(outDir, { recursive: true });

const recipe = await loadRecipe();
const A = computeAll(recipe, { C_mm, w_mm, shoulderForm, mu });
const R = A.base.R;
const muOverR = mu / R;

function cumArc(pts) {
  const cum = [0];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += R * angle(pts[i - 1], pts[i]);
    cum.push(s);
  }
  return cum;
}

/** Discrete geodesic curvature κ_g (1/mm) along a spherical polyline. */
function kgAlong(pts) {
  const cum = cumArc(pts);
  const rows = [];
  let maxKg = 0;
  let maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const turn = turnDeg(pts[i - 1], pts[i], pts[i + 1]) * (Math.PI / 180);
    const ds = (cum[i + 1] - cum[i - 1]) / 2;
    const kg = ds > 1e-12 ? turn / ds : 0;
    if (kg > maxKg) {
      maxKg = kg;
      maxI = i;
    }
    rows.push({
      i,
      frac: i / (pts.length - 1),
      s_mm: +cum[i].toFixed(6),
      kg: +kg.toFixed(8),
      turn_deg: +(turn * 180 / Math.PI).toFixed(4),
    });
  }
  return {
    rows,
    maxKg,
    maxI,
    maxFrac: maxI / (pts.length - 1),
    length_mm: cum[cum.length - 1],
    ratio_vs_muR: maxKg / muOverR,
  };
}

function latToMeridianMm(p, phiMark) {
  const nMer = [-Math.sin(phiMark), Math.cos(phiMark), 0];
  const u = unit(p);
  const onMer = unit(sub(u, mul(nMer, dot(u, nMer))));
  return R * angle(u, onMer);
}

/** Contiguous tip-region stick-to-axis length (mm along leg) where lat < thr. */
function stickToAxisMm(seg, phiMark, thrMm) {
  const cum = cumArc(seg.pts);
  const lats = seg.pts.map((p) => latToMeridianMm(p, phiMark));
  const n = lats.length - 1;
  const runs = [];
  let i0 = null;
  for (let i = 0; i <= n; i++) {
    const stuck = lats[i] < thrMm;
    if (stuck && i0 == null) i0 = i;
    if ((!stuck || i === n) && i0 != null) {
      const i1 = stuck && i === n ? i : i - 1;
      if (i1 >= i0) {
        runs.push({
          i0,
          i1,
          frac0: i0 / n,
          frac1: i1 / n,
          len_mm: cum[i1] - cum[i0],
          nearTip: i1 / n > 0.5,
        });
      }
      i0 = null;
    }
  }
  const tipRun = [...runs].reverse().find((r) => r.nearTip) || null;
  return {
    thr_mm: thrMm,
    minLat_mm: Math.min(...lats),
    maxLat_mm: Math.max(...lats),
    tipStick_mm: tipRun ? tipRun.len_mm : 0,
    tipRun,
    runs,
  };
}

function worstLeg(round, { level = null } = {}) {
  let legs = A.path.segs.filter((s) => s.type === 'leg' && s.round === round);
  if (level) legs = legs.filter((s) => s.level === level);
  if (!legs.length) return null;
  const ranked = legs.map((seg) => {
    const kg = kgAlong(seg.pts);
    return { seg, kg };
  });
  ranked.sort((a, b) => b.kg.maxKg - a.kg.maxKg);
  return ranked[0];
}

const series = [];
const pick = [
  { label: 'A8 worst', round: 'A8' },
  { label: 'B8 worst', round: 'B8' },
  { label: 'B3 upper worst', round: 'B3', level: 'top' },
];

for (const p of pick) {
  const w = worstLeg(p.round, { level: p.level });
  if (!w) {
    console.warn('no leg for', p);
    continue;
  }
  const { seg, kg } = w;
  series.push({
    label: p.label,
    round: seg.round,
    id: seg.id,
    level: seg.level,
    stitch: seg.stitch,
    line: seg.line,
    length_mm: +kg.length_mm.toFixed(4),
    maxKg: +kg.maxKg.toFixed(8),
    maxFrac: +kg.maxFrac.toFixed(4),
    ratio_vs_muR: +kg.ratio_vs_muR.toFixed(2),
    s_mm: kg.rows.map((r) => r.s_mm),
    frac: kg.rows.map((r) => r.frac),
    kg: kg.rows.map((r) => r.kg),
  });
  console.log(
    `${p.label}: ${seg.id} (${seg.level} stitch ${seg.stitch})  max κ_g=${kg.maxKg.toFixed(6)}  `
    + `(${kg.ratio_vs_muR.toFixed(1)}× μ/R) at frac ${kg.maxFrac.toFixed(3)}`,
  );
}

// Stick-to-axis at lower A2 (canonical first bottom stitch i===1, plus report mean over all bottoms)
const a2Bottoms = A.path.segs.filter((s) => s.type === 'leg' && s.round === 'A2' && s.level === 'bottom');
const stickRows = [];
for (const seg of a2Bottoms) {
  const st = A.path.stitches.find((x) => x.legId === seg.id);
  const phiMark = A.marking.phis[st.line];
  const stick = stickToAxisMm(seg, phiMark, STICK_LAT_MM);
  stickRows.push({
    id: seg.id,
    stitch: seg.stitch,
    line: st.line,
    i: st.i,
    length_mm: +cumArc(seg.pts).at(-1).toFixed(4),
    tipStick_mm: +stick.tipStick_mm.toFixed(4),
    thr_mm: stick.thr_mm,
    tipRun: stick.tipRun
      ? {
        frac0: +stick.tipRun.frac0.toFixed(4),
        frac1: +stick.tipRun.frac1.toFixed(4),
        len_mm: +stick.tipRun.len_mm.toFixed(4),
      }
      : null,
  });
}
stickRows.sort((a, b) => a.i - b.i);
const lowerA2 = stickRows.find((r) => r.i === 1) || stickRows[0];
const stickMean = stickRows.reduce((a, r) => a + r.tipStick_mm, 0) / stickRows.length;

console.log(
  `\nStick-to-axis (lat < ${STICK_LAT_MM} mm) at lower A2:`
  + `\n  canonical A2 bottom i=1 (${lowerA2.id}): ${lowerA2.tipStick_mm.toFixed(2)} mm`
  + `\n  mean over ${stickRows.length} A2 bottom legs: ${stickMean.toFixed(2)} mm`,
);
for (const r of stickRows) {
  console.log(`  ${r.id} stitch ${r.stitch}: tipStick ${r.tipStick_mm.toFixed(2)} mm  frac ${r.tipRun?.frac0}–${r.tipRun?.frac1}`);
}

const tipDrop = A.path.tipDrop;
const report = {
  generated: new Date().toISOString(),
  params: { C_mm, w_mm, mu, shoulderForm, R_mm: R, mu_over_R: muOverR, stick_lat_mm: STICK_LAT_MM },
  tipDrop_mm: tipDrop?.tipDrop_mm ?? null,
  phi3CapMm: tipDrop?.phi3CapMm ?? null,
  series: series.map(({ s_mm, frac, kg, ...meta }) => ({
    ...meta,
    // keep full series in JSON for replot
    profile: { s_mm, frac, kg },
  })),
  stickLowerA2: {
    canonical_i1_mm: lowerA2.tipStick_mm,
    mean_bottom_mm: +stickMean.toFixed(4),
    legs: stickRows,
  },
};

const jsonPath = join(outDir, 'diag-kg-worst-legs.json');
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
console.log(`\nwrote ${jsonPath}`);

// Plot via matplotlib (available on this Mac)
const plotScript = `
import json, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

data = json.load(open(sys.argv[1]))
out_png = sys.argv[2]
muR = data["params"]["mu_over_R"]
fig, ax = plt.subplots(figsize=(10, 5.5), dpi=140)
colors = ["#c0392b", "#2980b9", "#27ae60"]
for i, s in enumerate(data["series"]):
    prof = s["profile"]
    ax.plot(
        prof["frac"],
        prof["kg"],
        color=colors[i % len(colors)],
        lw=1.6,
        label=f'{s["label"]} ({s["id"]})  peak={s["maxKg"]:.3f} ({s["ratio_vs_muR"]:.0f}×)',
    )
ax.axhline(muR, color="#222", ls="--", lw=1.2, label=f'Φ3 limit μ/R = {muR:.5f} mm⁻¹')
ax.set_xlabel("fraction along leg (0=from → 1=to/tip)")
ax.set_ylabel("discrete κ_g (mm⁻¹)")
ax.set_title(
    f'κ_g along worst legs  ·  bowToMarking μ={data["params"]["mu"]}  C={data["params"]["C_mm"]}  '
    f'w={data["params"]["w_mm"]}\\n'
    f'lower A2 stick-to-axis (lat<{data["params"]["stick_lat_mm"]} mm): '
    f'{data["stickLowerA2"]["canonical_i1_mm"]:.2f} mm  ·  tipDrop={data["tipDrop_mm"]:.3f} mm'
)
ax.legend(loc="upper left", fontsize=8)
ax.grid(True, alpha=0.3)
ax.set_xlim(0, 1)
fig.tight_layout()
fig.savefig(out_png)
print("wrote", out_png)
`;

const pngPath = join(outDir, 'diag-kg-worst-legs.png');
const py = spawnSync('python3', ['-c', plotScript, jsonPath, pngPath], {
  encoding: 'utf8',
  cwd: root,
});
if (py.status !== 0) {
  console.error(py.stderr || py.stdout);
  process.exit(py.status || 1);
}
process.stdout.write(py.stdout);

console.log('\nSummary');
console.log(`  μ/R = ${muOverR.toFixed(6)} mm⁻¹`);
for (const s of series) {
  console.log(`  ${s.label}: peak κ_g ${s.maxKg.toFixed(6)} = ${s.ratio_vs_muR.toFixed(1)}× μ/R`);
}
console.log(`  lower A2 stick length: ${lowerA2.tipStick_mm.toFixed(2)} mm`);
