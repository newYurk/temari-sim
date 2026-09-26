// Mari outer wrap (地巻き / jimaki) drawn as wound thread (#42): pure data part, no three.js.
// Ported from the main Temari project (read-only source):
//   src/components/temari/measure.ts:10-76  — wrapsToCover, unitFromMm, wrapHalfWidth, sewCover;
//   src/components/temari/shader.ts:276-300 — wrapAxis (golden-angle spiral of great-circle axes).
// Every strand is a GREAT CIRCLE (a band of half-width w around a plane through the centre): a ball can
// only be wound along its largest diameter, otherwise the thread slips off. Changes against the source:
// the axes are jittered by a small seeded random tilt (owner, #42) and the draw order is a seeded shuffle,
// so the same ball looks identical on every load and device; R, strand count and width follow the params.

/** Extra length of a random great-circle wrap over a packed cover (source: WRAP_OVERLAP). */
export const WRAP_OVERLAP = 1.12;
/** Owner's natural irregularity (#42): each axis is tilted by an angle in [min, max] degrees. */
export const WRAP_JITTER_DEG = [5, 10];
/** Fixed seed: identical ball on every load and device. */
export const WRAP_SEED = 0x7e3a1;
/** GPU loop ceiling (source: WRAP_GPU_MAX = 512; raised to cover C ≤ 450 mm at 0.3 mm = 842 strands). */
export const WRAP_GPU_MAX = 1024;
/** Bake sizes: desktop as in the source; phones ≤ 2048×1024 (#33 / #42: 4096×2048 ≈ 32 MB of GPU memory). */
export const WRAP_BAKE = { desktop: { w: 4096, h: 2048 }, phone: { w: 2048, h: 1024 } };

/** Strands needed to cover a ball of circumference C (mm) with thread of width d (mm) (source: wrapsToCover). */
export function wrapsToCover(C_mm, d_mm, overlap = WRAP_OVERLAP) {
  const R = C_mm / (2 * Math.PI);
  const raw = (Math.PI * R * overlap) / d_mm;
  const nearest = Math.round(raw);
  const wraps = Math.abs(raw - nearest) < 1e-9 ? nearest : Math.ceil(raw);
  return Math.max(1, wraps);
}

/** Visible wrap layer for the ball (source: sewCover): strand count and half-width on the unit sphere. */
export function sewCover(C_mm, width_mm) {
  const R = C_mm / (2 * Math.PI);
  return { mm: width_mm, R, wraps: wrapsToCover(C_mm, width_mm), halfWidth: (width_mm / R) * 0.5 };
}

/** Deterministic PRNG (mulberry32): same sequence on every JS engine. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Even golden-angle axis k of n (source: wrapAxis; y is the spiral axis). */
export function wrapAxis(k, n) {
  const z = 1 - (k + 0.5) / n;
  const rr = Math.sqrt(Math.max(0, 1 - z * z));
  const th = k * 2.399963229728653;
  return [Math.cos(th) * rr, z, Math.sin(th) * rr];
}

/**
 * Strand axes in draw order: even golden-angle spiral, each axis tilted by a seeded random angle in
 * [jitter[0], jitter[1]] degrees toward a random direction, then a seeded shuffle of the draw order
 * (source: order k = 277·i mod n). Returns a Float32Array of 3n unit vectors.
 */
export function wrapAxes(n, { seed = WRAP_SEED, jitterDeg = WRAP_JITTER_DEG, shuffle = true } = {}) {
  const rnd = mulberry32(seed);
  const axes = [];
  for (let k = 0; k < n; k++) {
    const a = wrapAxis(k, n);
    const d = ((jitterDeg[0] + (jitterDeg[1] - jitterDeg[0]) * rnd()) * Math.PI) / 180;
    const psi = 2 * Math.PI * rnd();
    // tangent basis at a
    const h = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let e1 = [a[1] * h[2] - a[2] * h[1], a[2] * h[0] - a[0] * h[2], a[0] * h[1] - a[1] * h[0]];
    const l1 = Math.hypot(...e1); e1 = e1.map((v) => v / l1);
    const e2 = [a[1] * e1[2] - a[2] * e1[1], a[2] * e1[0] - a[0] * e1[2], a[0] * e1[1] - a[1] * e1[0]];
    const c = Math.cos(d), s = Math.sin(d), cp = Math.cos(psi), sp = Math.sin(psi);
    const v = [0, 1, 2].map((i) => c * a[i] + s * (cp * e1[i] + sp * e2[i]));
    const l = Math.hypot(...v);
    axes.push(v.map((x) => x / l));
  }
  if (shuffle) for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [axes[i], axes[j]] = [axes[j], axes[i]]; }
  const out = new Float32Array(3 * n);
  axes.forEach((v, i) => out.set(v, 3 * i));
  return out;
}

/**
 * Coverage of the sphere by the strand bands |p·a| < halfWidth, sampled at m even points:
 * bare fraction (no strand), mean and max strand count, fraction with ≥ 4 strands (clumps).
 */
export function wrapCoverage(axes, halfWidth, m = 20000) {
  const n = axes.length / 3;
  let bare = 0, sum = 0, max = 0, clump = 0;
  for (let j = 0; j < m; j++) {
    const p = wrapAxis(j, m);
    let c = 0;
    for (let i = 0; i < n; i++) if (Math.abs(p[0] * axes[3 * i] + p[1] * axes[3 * i + 1] + p[2] * axes[3 * i + 2]) < halfWidth) c++;
    if (c === 0) bare++;
    if (c >= 4) clump++;
    sum += c; max = Math.max(max, c);
  }
  return { bare: bare / m, mean: sum / m, max, clump: clump / m };
}
