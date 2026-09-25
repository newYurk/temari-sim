#!/usr/bin/env node
/**
 * LEG_SAMPLES grid convergence instrument (diagnostics only).
 * Runs tipDrop + row count (+ max geodesic κ_g / max discrete turn) at several sample counts
 * via setLegSamples — does not edit path.js constants by hand and does not change
 * default layout (96).
 *
 * κ_g is geodesic curvature (tangent-plane turn / ds), not total curvature (which
 * includes sphere normal curvature 1/R). See geodesic_curvature.mjs / D39.
 *
 * Usage:
 *   node sim/tools/leg_samples_convergence.mjs
 *   node sim/tools/leg_samples_convergence.mjs --samples 48,96,192,384
 *   TEMARI_LEG_SAMPLES=192 node …   (single-shot via env is also honored below)
 *
 * Optional JSON: --json sim/out/leg-samples-convergence.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecipe } from '../src/recipe.js';
import { computeAll } from '../src/layers.js';
import { setLegSamples, getLegSamples } from '../src/path.js';
import { measureElbows } from '../src/diagnostics.js';
import { geodesicCurvatureAlong } from './geodesic_curvature.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const C_mm = Number(argVal('--C', 240));
const w_mm = Number(argVal('--w', 0.714));
const mu = Number(argVal('--mu', 0.32));
const shoulderForm = argVal('--form', 'bowToMarking');
const samplesArg = argVal('--samples', process.env.TEMARI_LEG_SAMPLES || '48,96,192,384');
const samplesList = String(samplesArg)
  .split(/[, ]+/)
  .map((s) => Math.floor(Number(s)))
  .filter((n) => Number.isFinite(n) && n >= 2);
const jsonOut = argVal('--json', '');

if (!samplesList.length) {
  console.error('no valid --samples');
  process.exit(1);
}

const recipe = await loadRecipe();

function maxKgOnLegs(A) {
  const R = A.base.R;
  let maxKg = 0;
  let worst = null;
  for (const seg of A.path.segs.filter((s) => s.type === 'leg' && s.pts?.length >= 3)) {
    const g = geodesicCurvatureAlong(seg.pts, R);
    if (g.maxAbsKg > maxKg) {
      maxKg = g.maxAbsKg;
      worst = { id: seg.id, round: seg.round, frac: g.maxFrac };
    }
  }
  return { maxKg, worst };
}

function rowCount(A) {
  // Rounds that actually produced stitches (A/B pairs → rows); count unique row indices that exist.
  const rows = new Set(A.path.rounds.map((r) => r.row));
  return rows.size;
}

const rows = [];
console.log(`LEG_SAMPLES convergence  form=${shoulderForm} μ=${mu} C=${C_mm} w=${w_mm}  (geodesic κ_g)`);
console.log(
  'samples'.padStart(8),
  'tipDrop_mm'.padStart(12),
  'rows'.padStart(6),
  'maxTurn°'.padStart(10),
  'maxκ_g'.padStart(12),
  'worst'.padStart(18),
);

try {
  for (const n of samplesList) {
    setLegSamples(n);
    if (getLegSamples() !== n) throw new Error(`setLegSamples failed: got ${getLegSamples()}`);
    const A = computeAll(recipe, { C_mm, w_mm, shoulderForm, mu });
    const td = A.path.tipDrop?.tipDrop_mm ?? NaN;
    const nRows = rowCount(A);
    const elbows = measureElbows(A.path);
    const kg = maxKgOnLegs(A);
    const line = {
      samples: n,
      tipDrop_mm: +td.toFixed(6),
      rows: nRows,
      maxTurnDeg: +elbows.maxTurnDeg.toFixed(4),
      maxKg: +kg.maxKg.toFixed(8),
      worstSeg: elbows.worstSegId,
      worstRound: elbows.worstRound,
      worstKgSeg: kg.worst?.id ?? null,
      worstKgRound: kg.worst?.round ?? null,
    };
    rows.push(line);
    console.log(
      String(n).padStart(8),
      line.tipDrop_mm.toFixed(4).padStart(12),
      String(nRows).padStart(6),
      line.maxTurnDeg.toFixed(3).padStart(10),
      line.maxKg.toFixed(6).padStart(12),
      `${elbows.worstRound}/${elbows.worstSegId}`.padStart(18),
    );
  }
} finally {
  setLegSamples(null); // restore default 96
}

if (jsonOut) {
  const path = resolve(root, jsonOut);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        params: { C_mm, w_mm, mu, shoulderForm },
        curvature: 'geodesic',
        defaultLegSamples: 96,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${path}`);
}

console.log('(default LEG_SAMPLES restored to', getLegSamples(), ')');
