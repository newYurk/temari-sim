import { loadRecipe } from '../src/recipe.js';
import { computeAll } from '../src/layers.js';
import { sub, unit, dot, norm, angle } from '../src/geom.js';

const recipe = await loadRecipe();
const B = computeAll(recipe, { C_mm: 240, w_mm: 0.714, shoulderForm: 'bowToMarking', mu: 0.32 });
const R = B.base?.R ?? (240 / (2 * Math.PI));
console.log('R', R, 'base keys', B.base && Object.keys(B.base));

const TIP_ENV_NORM = 0.5792303272991085;
const tipEnv = (t) => (t * Math.sin(Math.PI * t)) / TIP_ENV_NORM;

const seg = B.path.segs.find(s => s.round === 'A2' && s.pts?.length > 50 && s.shoulderForm === 'bowToMarking');
console.log('seg', seg.id, 'n', seg.pts.length, 'bowLateral', seg.bowLateralMm, 'phi3', seg.phi3CapMm);

// Infer phiMark from endpoint (to should be near a marking)
const to = unit(seg.to);
const phiMark = Math.atan2(to[1], to[0]); // approx if tip on meridian
const nMer = [-Math.sin(phiMark), Math.cos(phiMark), 0];
const cap = seg.phi3CapMm;

const rows = [];
for (let i = 0; i < seg.pts.length; i++) {
  const t = i / (seg.pts.length - 1);
  const u = unit(seg.pts[i]);
  // For geodesic sample we'd need original geo; approximate lat of CURRENT point to meridian
  // Better: reconstruct desired vs lat on the GEO slerp from from→to
}
// Reconstruct clamp along geodesic parameter using from/to
function slerp(a, b, t) {
  const A = unit(a), B = unit(b);
  const o = Math.acos(Math.max(-1, Math.min(1, dot(A, B))));
  if (o < 1e-12) return A;
  const s = Math.sin(o);
  return unit([
    (Math.sin((1 - t) * o) * A[0] + Math.sin(t * o) * B[0]) / s,
    (Math.sin((1 - t) * o) * A[1] + Math.sin(t * o) * B[1]) / s,
    (Math.sin((1 - t) * o) * A[2] + Math.sin(t * o) * B[2]) / s,
  ]);
}
function turnDeg(a, b, c) {
  const u = unit(sub(b, a)), v = unit(sub(c, b));
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180 / Math.PI;
}

let firstClamp = null;
for (let i = 0; i < seg.pts.length; i++) {
  const t = i / (seg.pts.length - 1);
  const g = slerp(seg.from, seg.to, t);
  const onMer = unit(sub(g, nMer.map(x => x * dot(g, nMer))));
  const lat = R * angle(g, onMer);
  const desired = tipEnv(t) * cap;
  const clamped = desired > lat + 1e-9;
  if (clamped && firstClamp == null && i > 0) firstClamp = { i, t, desired, lat };
  const turn = (i > 0 && i < seg.pts.length - 1) ? turnDeg(seg.pts[i - 1], seg.pts[i], seg.pts[i + 1]) : 0;
  if (turn >= 4 || (clamped && i % 5 === 0) || i < 3 || i > seg.pts.length - 4) {
    rows.push({ i, t: +t.toFixed(3), desired: +desired.toFixed(3), lat: +lat.toFixed(3), move: +Math.min(desired, lat).toFixed(3), clamped, turn: +turn.toFixed(2) });
  }
}
console.log('firstClamp', firstClamp);
console.log('rows', rows);
