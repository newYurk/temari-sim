import { loadRecipe } from '../src/recipe.js';
import { computeAll } from '../src/layers.js';
import { sub, unit, dot, norm } from '../src/geom.js';

const recipe = await loadRecipe();
const B = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bowToMarking', mu: 0.32 });
const G = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'geodesic' });

function turnDeg(a, b, c) {
  const u = unit(sub(b, a)), v = unit(sub(c, b));
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180 / Math.PI;
}
function profile(pts) {
  let max = 0, maxI = 0;
  const spikes = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const t = turnDeg(pts[i - 1], pts[i], pts[i + 1]);
    if (t > max) { max = t; maxI = i; }
    if (t >= 3) spikes.push({ i, frac: +(i / (pts.length - 1)).toFixed(3), turn: +t.toFixed(2) });
  }
  return { n: pts.length, max: +max.toFixed(3), frac: +(maxI / (pts.length - 1)).toFixed(3), spikes: spikes.slice(0, 10) };
}

console.log('segs', B.path.segs?.length, 'sample keys', B.path.segs?.[0] && Object.keys(B.path.segs[0]));
const s0 = B.path.segs?.[0];
if (s0) console.log('seg0', JSON.stringify(s0, (k, v) => Array.isArray(v) && Array.isArray(v[0]) ? `pts[${v.length}]` : v).slice(0, 600));

// Find segs used by A2 bottom stitches
const a2 = (B.path.stitches || []).filter(s => s.round === 'A2');
const legIds = [...new Set(a2.map(s => s.legId))];
console.log('A2 legIds', legIds);

function segPts(A, id) {
  const seg = (A.path.segs || []).find(s => s.id === id);
  return seg?.pts || seg?.poly || seg?.samples || null;
}

for (const id of legIds.slice(0, 4)) {
  const pb = segPts(B, id), pg = segPts(G, id);
  console.log('seg', id, 'bow', pb && profile(pb), 'geo', pg && profile(pg));
}

// Also: any seg with shoulderForm bow
const bowed = (B.path.segs || []).filter(s => s.shoulderForm === 'bowToMarking' || s.form === 'bowToMarking' || s.kind === 'leg');
console.log('bowed/leg segs count', bowed.length, 'kinds', [...new Set((B.path.segs||[]).map(s => s.kind))]);

// Dump unique seg field shapes
const kinds = {};
for (const s of B.path.segs || []) {
  kinds[s.kind] = (kinds[s.kind] || 0) + 1;
}
console.log('seg kinds', kinds);

// Find a visible surface leg with many pts
const longOnes = (B.path.segs || []).filter(s => (s.pts?.length || 0) > 20);
console.log('segs with pts>20', longOnes.length);
if (longOnes[0]) {
  console.log('long0 keys', Object.keys(longOnes[0]), 'kind', longOnes[0].kind, 'round', longOnes[0].round);
  const byRound = {};
  for (const s of longOnes) {
    const r = s.round || s.set || '?';
    byRound[r] = (byRound[r] || 0) + 1;
  }
  console.log('long by round', byRound);
  // Compare A1 vs A2 long segs max turns
  for (const round of ['A1', 'B1', 'A2']) {
    const segs = longOnes.filter(s => s.round === round).slice(0, 3);
    for (const s of segs) {
      const pb = profile(s.pts);
      const sg = (G.path.segs || []).find(x => x.id === s.id);
      const pg = sg?.pts ? profile(sg.pts) : null;
      console.log(round, s.id, s.kind, 'bow', pb, 'geo', pg);
    }
  }
}

// Reconstruct clamp engagement on one bowed polyline using same formula as layLeg
// Need from,to,phiMark from a seg if available
const sample = longOnes.find(s => s.round === 'A2') || longOnes[0];
if (sample) {
  console.log('sample fields', Object.keys(sample));
  console.log('sample meta', {
    from: sample.from, to: sample.to, phiMark: sample.phiMark, phi: sample.phi,
    shoulderForm: sample.shoulderForm, bowLateralMm: sample.bowLateralMm,
  });
}
