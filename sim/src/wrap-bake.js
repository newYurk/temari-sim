// GPU bake of the mari wrap texture (#42). Ported from the main Temari project (read-only source):
//   src/components/temari/shader.ts:276-410 — wrapAlbedo, bake shaders, createWrapBaker.
// Changes against the source: axes come from wrap.js (seeded jitter + shuffle, uploaded as a float texture,
// so the pattern does not depend on GPU trig precision); the bake maps the UV layout of three's
// SphereGeometry directly; thread-type look (hair = fine fibre noise and fuzzy edges); the baked texture is
// the albedo map of the scene's lit MeshStandardMaterial (sheen → lower roughness) instead of the source's
// custom cover shader. Bake once per (colour, type, C, size), never per frame.
import * as THREE from 'three';
import { sewCover, wrapAxes, mulberry32, WRAP_GPU_MAX, WRAP_BAKE, WRAP_SEED } from './wrap.js';

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
uniform sampler2D uAxes;
varying vec2 vUv;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main() {
  // three.js SphereGeometry: u → azimuth, v → polar angle θ = (1 − v)·π; x = −cos(2πu) sin θ, y = cos θ, z = sin(2πu) sin θ
  float az = vUv.x * 6.28318530718;
  float th = (1.0 - vUv.y) * 3.14159265359;
  vec3 p = vec3(-cos(az) * sin(th), cos(th), sin(az) * sin(th));
  vec3 col = uColor * 0.92;
  float n = float(uWraps);
  for (int i = 0; i < ${WRAP_GPU_MAX}; i++) {
    if (i >= uWraps) break;
    vec4 axd = texture2D(uAxes, vec2((float(i) + 0.5) / n, 0.5));
    vec3 ax = axd.xyz;
    float t = abs(dot(p, ax)) / max(uSewW, 0.0004);
    if (t > 1.0 + uHair) continue;
    float mask = 1.0 - smoothstep(0.96 - 0.25 * uHair, 1.0 + 0.2 * uHair, t);
    float rnd = sqrt(max(0.0, 1.0 - min(t * t, 1.0)));
    float dye = axd.w;   // per-strand dye variation 0.86…1.06 (seeded in JS; source: fract(sin(k·419.2)…))
    // hair: fine fibre noise along the strand (position along the circle), fixed by the strand index
    float along = atan(dot(p, normalize(cross(ax, vec3(0.31, 0.83, 0.47)))), dot(p, normalize(cross(ax, cross(ax, vec3(0.31, 0.83, 0.47))))));
    float fib = hash13(vec3(floor(along * 2400.0), floor(t * 6.0), float(i)));
    vec3 thread = uColor * dye * mix(0.88, 1.06, rnd) * (1.0 + uHair * 0.22 * (fib - 0.5));
    col = mix(col, thread, mask * 0.62);
  }
  gl_FragColor = vec4(col, 1.0);
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
      uniforms: { uColor: { value: new THREE.Color() }, uSewW: { value: 0 }, uWraps: { value: 0 }, uHair: { value: 0 }, uAxes: { value: null } },
      vertexShader: bakeVert, fragmentShader: bakeFrag, toneMapped: false, depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
  }

  /** Bake (only if colour / type / size changed). Returns the texture. */
  bake(gl, { C_mm, color, type }) {
    const size = bakeSizeFor(gl);
    const cover = sewCover(C_mm, type.width_mm);
    const wraps = Math.min(cover.wraps, WRAP_GPU_MAX);
    const key = `${color}:${type.id}:${type.width_mm}:${type.hair}:${C_mm}:${size.w}`;
    if (key === this.key && this.rt) return this.rt.texture;
    this.key = key;
    if (!this.rt || this.rt.width !== size.w) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(size.w, size.h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      this.rt.texture.wrapS = THREE.RepeatWrapping;
      this.rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    }
    const ax = wrapAxes(wraps);
    const data = new Float32Array(4 * wraps);
    const dyeRnd = mulberry32(WRAP_SEED ^ 0x5bd1e995);
    for (let i = 0; i < wraps; i++) data.set([ax[3 * i], ax[3 * i + 1], ax[3 * i + 2], 0.86 + 0.2 * dyeRnd()], 4 * i);
    const axTex = new THREE.DataTexture(data, wraps, 1, THREE.RGBAFormat, THREE.FloatType);
    axTex.minFilter = axTex.magFilter = THREE.NearestFilter; axTex.needsUpdate = true;
    const u = this.mat.uniforms;
    u.uColor.value.set(color); u.uSewW.value = cover.halfWidth; u.uWraps.value = wraps; u.uHair.value = type.hair; u.uAxes.value = axTex;
    const t0 = performance.now();
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.rt);
    gl.render(this.scene, this.cam);
    const px = new Uint8Array(4);
    gl.readRenderTargetPixels(this.rt, 0, 0, 1, 1, px);   // waits for the GPU → honest bake time
    gl.setRenderTarget(prev);
    axTex.dispose();
    this.info = { w: size.w, h: size.h, phone: size.phone, wraps, wrapsNeeded: cover.wraps, halfWidth: cover.halfWidth, type: type.id, ms: performance.now() - t0,
      mb: (size.w * size.h * 4) / 2 ** 20 };
    console.info(`[wrap] bake ${size.w}×${size.h} (${size.phone ? 'phone' : 'desktop'}), ${wraps} strands of ${type.width_mm} mm (${type.id}), ${this.info.ms.toFixed(0)} ms`);
    return this.rt.texture;
  }
}
