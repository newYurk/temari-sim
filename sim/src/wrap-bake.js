// GPU bake of the mari wrap texture (#42). Ported from the main Temari project (read-only source):
//   src/components/temari/shader.ts:276-410 — wrapAlbedo, bake shaders, createWrapBaker.
// Changes against the source: axes come from wrap.js (seeded jitter + shuffle, uploaded as a float texture,
// so the pattern does not depend on GPU trig precision); the bake maps the UV layout of three's
// SphereGeometry directly; thread-type look (hair = fine fibre noise and fuzzy edges); the baked texture is
// the albedo map of the scene's lit MeshStandardMaterial (sheen → lower roughness) instead of the source's
// custom cover shader. Bake once per (colour, type, C, size), never per frame.
import * as THREE from 'three';
import { sewCover, wrapLayerAxes, mulberry32, WRAP_GPU_MAX, WRAP_BAKE, WRAP_SEED, WRAP_LAYERS } from './wrap.js';

const bakeVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const bakeFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uSewW;
uniform int uWraps;
uniform float uHair;
uniform vec3 uShade;     // thread brightness of the wound layers: top, second, fill (#42 rework)
uniform int uDebug;      // 1 → rgb = seen weight of top / second / fill layer (headless coverage check)
uniform sampler2D uAxes; // row 0 = top layer, row 1 = second, row 2 = fill; xyz = axis, w = dye
varying vec2 vUv;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec4 axisAt(int i, float row) { return texture2D(uAxes, vec2((float(i) + 0.5) / float(uWraps), (row + 0.5) / 3.0)); }
// Wound-thread shading of strand i (axis + dye axd) at normalized distance t from its centre line.
vec3 threadCol(vec3 p, vec4 axd, float t, float idx) {
  vec3 ax = axd.xyz;
  float rnd = sqrt(max(0.0, 1.0 - min(t * t, 1.0)));
  // hair: fine fibre noise along the strand (position along the circle), fixed by the strand index
  float along = atan(dot(p, normalize(cross(ax, vec3(0.31, 0.83, 0.47)))), dot(p, normalize(cross(ax, cross(ax, vec3(0.31, 0.83, 0.47))))));
  float fib = hash13(vec3(floor(along * 2400.0), floor(t * 6.0), idx));
  return uColor * axd.w * mix(0.88, 1.06, rnd) * (1.0 + uHair * 0.22 * (fib - 0.5));
}
void main() {
  // three.js SphereGeometry: u → azimuth, v → polar angle θ = (1 − v)·π; x = −cos(2πu) sin θ, y = cos θ, z = sin(2πu) sin θ
  float az = vUv.x * 6.28318530718;
  float th = (1.0 - vUv.y) * 3.14159265359;
  vec3 p = vec3(-cos(az) * sin(th), cos(th), sin(az) * sin(th));
  float w = max(uSewW, 0.0004);
  // Top layer, as before (62 % strand over what lies under it), kept as col = acc + K·under so the layer under it is
  // only evaluated where it can be seen.
  float K = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${WRAP_GPU_MAX}; i++) {
    if (i >= uWraps) break;
    vec4 axd = axisAt(i, 0.0);
    float t = abs(dot(p, axd.xyz)) / w;
    if (t > 1.0 + uHair) continue;
    float a = (1.0 - smoothstep(0.96 - 0.25 * uHair, 1.0 + 0.2 * uHair, t)) * 0.62;
    acc = mix(acc, threadCol(p, axd, t, float(i)), a);
    K *= 1.0 - a;
  }
  // What lies under the top layer: the layers wound before it (never the core colour). Under a full top strand
  // (K ≤ 0.40) it is seen at ≤ 38 % through the strand: the second layer's mean tone stands in for it there.
  vec3 under = uColor * uShade.y * 0.97;
  float K2 = 1.0, seenFill = 0.0;
  if (K > 0.40) {
    vec3 acc2 = vec3(0.0);
    for (int i = 0; i < ${WRAP_GPU_MAX}; i++) {
      if (i >= uWraps) break;
      vec4 axd = axisAt(i, 1.0);
      float t = abs(dot(p, axd.xyz)) / w;
      if (t > 1.0 + uHair) continue;
      float a = 1.0 - smoothstep(0.96 - 0.25 * uHair, 1.0 + 0.2 * uHair, t);
      acc2 = mix(acc2, threadCol(p, axd, t, float(i) + 4096.0) * uShade.y, a);
      K2 *= 1.0 - a;
    }
    // Fill layer: the nearest strand of the deepest layer, darker away from its centre line (deeper in the pile).
    vec3 under2 = uColor * uShade.z * 0.9;
    if (K2 > 0.02) {
      float tmin = 1e9; float imin = 0.0;
      for (int i = 0; i < ${WRAP_GPU_MAX}; i++) {
        if (i >= uWraps) break;
        float t = abs(dot(p, axisAt(i, 2.0).xyz)) / w;
        if (t < tmin) { tmin = t; imin = float(i); }
      }
      vec4 axd = texture2D(uAxes, vec2((imin + 0.5) / float(uWraps), 2.5 / 3.0));
      under2 = threadCol(p, axd, min(tmin, 1.0), imin + 8192.0) * uShade.z * mix(1.0, 0.86, clamp(tmin - 1.0, 0.0, 1.0));
      seenFill = K2;
    }
    under = acc2 + K2 * under2;
  }
  if (uDebug == 1) { gl_FragColor = vec4(1.0 - K, K * (1.0 - seenFill), K * seenFill, 1.0); return; }
  gl_FragColor = vec4(acc + K * under, 1.0);
}
`;

/** Phone-sized bake (#33 layout or coarse pointer) → 2048×1024; desktop → 4096×2048, capped by the GPU. */
export function bakeSizeFor(gl, win = globalThis.window) {
  const phone = !!win && ((win.innerWidth || 1e9) <= 820 || !!win.matchMedia?.('(pointer: coarse)').matches);
  const s = phone ? WRAP_BAKE.phone : WRAP_BAKE.desktop;
  const maxT = gl?.capabilities?.maxTextureSize || 4096;
  const w = Math.min(s.w, maxT);
  return { w, h: w / 2, phone };
}

export class WrapBaker {
  constructor() {
    this.rt = null; this.key = ''; this.info = null;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uSewW: { value: 0 }, uWraps: { value: 0 }, uHair: { value: 0 }, uAxes: { value: null },
        uShade: { value: new THREE.Vector3(...WRAP_LAYERS.map((L) => L.shade)) }, uDebug: { value: 0 } },
      vertexShader: bakeVert, fragmentShader: bakeFrag, toneMapped: false, depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
  }

  /** Cache key of a bake job for the current renderer size class. */
  keyFor(gl, { C_mm, color, type }) {
    return `${color}:${type.id}:${type.width_mm}:${type.hair}:${C_mm}:${bakeSizeFor(gl).w}`;
  }
  /** The already baked texture for this job, or null (#43: lets the first frame reuse it without a bake). */
  cached(gl, job) {
    return this.rt && this.key === this.keyFor(gl, job) ? this.rt.texture : null;
  }

  /** Bake (only if colour / type / size changed). Returns the texture. */
  bake(gl, { C_mm, color, type }) {
    const size = bakeSizeFor(gl);
    const cover = sewCover(C_mm, type.width_mm);
    const wraps = Math.min(cover.wraps, WRAP_GPU_MAX);
    const key = this.keyFor(gl, { C_mm, color, type });
    if (key === this.key && this.rt) return this.rt.texture;
    this.key = key;
    if (!this.rt || this.rt.width !== size.w) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(size.w, size.h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      this.rt.texture.wrapS = THREE.RepeatWrapping;
      this.rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    }
    // one row of axes + dye per wound layer (#42 rework); the top row is the former single layer, same seeds
    const data = new Float32Array(4 * wraps * WRAP_LAYERS.length);
    WRAP_LAYERS.forEach((L, row) => {
      const ax = wrapLayerAxes(wraps, row);
      const dyeRnd = mulberry32(row === 0 ? WRAP_SEED ^ 0x5bd1e995 : L.seed ^ 0x5bd1e995);
      for (let i = 0; i < wraps; i++) data.set([ax[3 * i], ax[3 * i + 1], ax[3 * i + 2], 0.86 + 0.2 * dyeRnd()], 4 * (row * wraps + i));
    });
    const axTex = new THREE.DataTexture(data, wraps, WRAP_LAYERS.length, THREE.RGBAFormat, THREE.FloatType);
    axTex.minFilter = axTex.magFilter = THREE.NearestFilter; axTex.needsUpdate = true;
    const u = this.mat.uniforms;
    u.uColor.value.set(color); u.uSewW.value = cover.halfWidth; u.uWraps.value = wraps; u.uHair.value = type.hair; u.uAxes.value = axTex;
    u.uDebug.value = 0;
    const t0 = performance.now();
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.rt);
    gl.render(this.scene, this.cam);
    const px = new Uint8Array(4);
    gl.readRenderTargetPixels(this.rt, 0, 0, 1, 1, px);   // waits for the GPU → honest bake time
    gl.setRenderTarget(prev);
    this.axTex?.dispose();
    this.axTex = axTex;   // kept for stats() (#42 rework)
    this.info = { w: size.w, h: size.h, phone: size.phone, wraps, wrapsNeeded: cover.wraps, halfWidth: cover.halfWidth, type: type.id, ms: performance.now() - t0,
      mb: (size.w * size.h * 4) / 2 ** 20 };
    console.info(`[wrap] bake ${size.w}×${size.h} (${size.phone ? 'phone' : 'desktop'}), ${wraps} strands of ${type.width_mm} mm (${type.id}), ${this.info.ms.toFixed(0)} ms`);
    return this.rt.texture;
  }

  /** Headless coverage check (#42 rework): re-renders the last bake with uDebug = 1 at w×w/2 and returns the area
   *  fractions (rows weighted by sin θ) of what is seen: top layer, second layer, fill layer, core colour (= 1 − the
   *  three), and topBare = where no top strand lies (the former bare core). */
  stats(gl, w = 1024) {
    if (!this.axTex) return null;
    const rt = new THREE.WebGLRenderTarget(w, w / 2, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const prev = gl.getRenderTarget();
    this.mat.uniforms.uDebug.value = 1;
    gl.setRenderTarget(rt); gl.render(this.scene, this.cam);
    const px = new Uint8Array(4 * w * (w / 2));
    gl.readRenderTargetPixels(rt, 0, 0, w, w / 2, px);
    gl.setRenderTarget(prev); this.mat.uniforms.uDebug.value = 0; rt.dispose();
    let top = 0, second = 0, fill = 0, bare = 0, sum = 0;
    for (let y = 0; y < w / 2; y++) {
      const wt = Math.sin(Math.PI * (y + 0.5) / (w / 2));
      for (let x = 0; x < w; x++) {
        const k = 4 * (y * w + x);
        top += wt * px[k] / 255; second += wt * px[k + 1] / 255; fill += wt * px[k + 2] / 255;
        if (px[k] === 0) bare += wt;
        sum += wt;
      }
    }
    return { top: top / sum, second: second / sum, fill: fill / sum, core: 1 - (top + second + fill) / sum, topBare: bare / sum };
  }
}
