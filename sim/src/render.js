// Рендер (three.js). Вход — ТОЛЬКО результат конвейера (слои + префикс пути). Рендер ничего не возвращает в модель.
// Отображение: нить — трубка круглого сечения диаметра w, лежащая на поверхности (ось на R + w/2);
// скрытые участки — пунктирные трубки (display.js: скрытый старт по умолчанию схемой у поверхности, режим «хорда» — как в модели);
// видимое → скрытое: короткий «нырок» в отверстие.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { point, unit, mul, add, sub, norm, dist, cross, fPoint } from './geom.js';
import { tubeMesh } from './tube.js';
import { displayGeometry } from './display.js';
import { t } from './i18n.js';
import { WrapBaker } from './wrap-bake.js';
import { WRAP_THREADS, WRAP_THREAD_DEFAULT, threadLookOf, THREAD_LOOK_DEFAULT, JIWARI_LOOK_DEFAULT } from './params.js';

const COLORS = { leg: 0x2f6bd6, pickup: 0xd6336c, 'hidden-start': 0x7a7a7a, current: 0xff8c00 };
export const SET_COLORS = { A: 0x1f5fbf, B: 0xc2185b };   // set A blue, set B magenta (display defaults; recipe ribbon may override)
/** Parse #rrggbb or number → 0xRRGGBB. */
export function parseHexColor(c) {
  if (typeof c === 'number' && Number.isFinite(c)) return c >>> 0;
  const s = String(c || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return parseInt(s, 16);
}
/** Apply recipe set colors (mutable display map). Returns applied {A,B} hex strings. */
export function applySetColors(map = {}) {
  const out = {};
  for (const k of ['A', 'B']) {
    const raw = map[k]?.hex ?? map[k];
    const n = parseHexColor(raw);
    if (n != null) { SET_COLORS[k] = n; out[k] = '#' + n.toString(16).padStart(6, '0'); }
    else out[k] = '#' + SET_COLORS[k].toString(16).padStart(6, '0');
  }
  return out;
}
// окраска «по обходу» (по умолчанию): каждый обход в порядке работы — свой контрастный цвет; без жёлтого/золотого (разметка)
// и без оранжевого (подсветка текущей операции); 12 цветов, дальше по кругу
export const ROUND_COLORS = [0x1d4ed8, 0xc2185b, 0x16a34a, 0x7c3aed, 0x0891b2, 0xdc2626, 0x7c4a1e, 0x334155, 0x65a30d, 0xf472b6, 0x60a5fa, 0x115e59];
export const roundColor = (i) => ROUND_COLORS[((i % ROUND_COLORS.length) + ROUND_COLORS.length) % ROUND_COLORS.length];
// «тёплая» шкала для нити B (по длине u), 5 опорных цветов
const WARM = [[80, 10, 60], [150, 20, 80], [210, 60, 70], [240, 130, 50], [250, 210, 90]];
export function warm(t) {
  const x = Math.max(0, Math.min(1, t)) * (WARM.length - 1), i = Math.min(WARM.length - 2, Math.floor(x)), f = x - i;
  const c = WARM[i].map((v, k) => (v + f * (WARM[i + 1][k] - v)) / 255);
  return new THREE.Color(c[0], c[1], c[2]);
}
// диагностическая палитра по длине нити u (viridis, 6 опорных цветов)
const VIRIDIS = [[68, 1, 84], [65, 68, 135], [42, 120, 142], [34, 168, 132], [122, 209, 81], [253, 231, 37]];
export function viridis(t) {
  t = Math.max(0, Math.min(1, t));
  const x = t * (VIRIDIS.length - 1), i = Math.min(VIRIDIS.length - 2, Math.floor(x)), f = x - i;
  const c = VIRIDIS[i].map((v, k) => (v + f * (VIRIDIS[i + 1][k] - v)) / 255);
  return new THREE.Color(c[0], c[1], c[2]);
}

/** Трубка вдоль полилинии (геометрия — чистая tubeMesh из tube.js, её же проверяет V14), цвет по доле длины. */
function tubeGeometry(pts, radius, colorAt, radial = 14, caps = true, look = null) {
  const m = tubeMesh(pts, radius, radial, caps);
  const col = [];
  for (const t of m.frac) { const c = colorAt(t); col.push(c.r, c.g, c.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos.flat(), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor.flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // #44: tubeMesh winds its triangles clockwise seen from outside (its normals point out), so with DoubleSide three.js
  // took the outer faces as back faces and flipped their normals inward — threads were lit from inside (dark). Wind the
  // index counter-clockwise for rendering (tube.js unchanged: V14 reads positions only).
  const idx = [];
  for (let q = 0; q < m.idx.length; q += 3) idx.push(m.idx[q], m.idx[q + 2], m.idx[q + 1]);
  g.setIndex(idx);
  // #44: around / along coordinates for the per-fragment ply shading of a thread look (TWIST_GLSL = twistShade)
  if (look) { const tw = []; m.ang.forEach((a, k) => tw.push(a, m.arc[k])); g.setAttribute('aTw', new THREE.Float32BufferAttribute(tw, 2)); }
  return g;
}

/** #44: GLSL of twistShade (tube.js) — the same formula per fragment. */
export const TWIST_GLSL = '{ float g = 0.5 - 0.5 * cos(uPlies * (vTw.x - 6.28318530718 * vTw.y / uPitch)); diffuseColor.rgb *= 1.0 - 0.55 * uTwist * smoothstep(0.55, 1.0, g); }';
/** #44 (render only): thread material of a look — sheen / roughness / metalness of the type, ply twist per fragment,
 *  an environment map for metallic types (without it metal renders black). */
function lookMaterial(look, env, extra = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: look.roughness, metalness: look.metalness, sheen: look.sheen, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide, envMap: look.metalness > 0 ? env : null, envMapIntensity: 1.8, ...extra });
  const u = { uTwist: { value: look.twist || 0 }, uPitch: { value: look.pitch_mm || 1 }, uPlies: { value: look.plies || 2 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec2 aTw;\nvarying vec2 vTw;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTw = aTw;');
    sh.fragmentShader = 'uniform float uTwist;\nuniform float uPitch;\nuniform float uPlies;\nvarying vec2 vTw;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  ' + TWIST_GLSL);
  };
  mat.customProgramCacheKey = () => 'thread-twist';
  return mat;
}

/** Разбить полилинию на штрихи [dash, gap] по длине. */
function dashes(pts, dash, gap) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  const at = (l) => {
    let i = 1; while (i < cum.length - 1 && cum[i] < l) i++;
    const t = (l - cum[i - 1]) / Math.max(1e-12, cum[i] - cum[i - 1]);
    return add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), Math.max(0, Math.min(1, t))));
  };
  const out = [];
  for (let a = 0; a < total; a += dash + gap) {
    const b = Math.min(total, a + dash);
    const piece = [at(a)];
    for (let i = 0; i < cum.length; i++) if (cum[i] > a && cum[i] < b) piece.push(pts[i]);
    piece.push(at(b));
    out.push(piece);
  }
  return out;
}

/** #33: label declutter on narrow views (phone portrait); desktop unchanged. */
export const LABEL_NARROW_PX = 700, LABEL_GAP_PX = 3;

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setClearColor(0xeef1f5);
    container.appendChild(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.5, 3000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 1.25));
    this.key = new THREE.DirectionalLight(0xffffff, 1.6);
    this.camera.add(this.key); this.key.position.set(0.3, 0.5, 1);
    this.scene.add(this.camera);
    this.world = new THREE.Group();           // модель в координатах симулятора (z — к СП) → Y-up three.js
    this.world.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);
    this.static = null; this.dynamic = null;
    this.opts = { transparent: false, hidden: true, labels: true, pins: true, color: 'round', hidMode: 'surf' };
    window.addEventListener('resize', () => this.resize());
    // #33: also follow the container itself (orientation change, phone/desktop layout switch).
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(container);
    this.controls.addEventListener('change', () => this.draw());
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); this.labels.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.draw();
  }

  dispose(group) {
    if (!group) return;
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      if (o.isCSS2DObject && o.element.parentNode) o.element.parentNode.removeChild(o.element);
    });
    this.world.remove(group);
  }

  label(text, pos, cls = 'lbl', short = null) {
    const el = document.createElement('div');
    el.className = cls; el.textContent = text;
    if (short) { el.dataset.full = text; el.dataset.short = short; }   // #33: shorter text on narrow screens
    const o = new CSS2DObject(el);
    o.position.set(pos[0], pos[1], pos[2]);
    return o;
  }

  /** #44: a small procedural environment (sky / ground gradient with two soft highlights) for metallic thread looks. */
  envMap() {
    if (this._env) return this._env;
    const w = 128, h = 64, data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = y / (h - 1), az = (x / w) * 2 * Math.PI;
      let c = 0.55 + 0.65 * Math.min(1, Math.max(0, (v - 0.35) / 0.4));
      c += 1.6 * Math.exp(-(((v - 0.78) / 0.07) ** 2 + ((Math.cos(az - 0.6) - 1) / 0.08) ** 2)) + 0.8 * Math.exp(-(((v - 0.6) / 0.1) ** 2 + ((Math.cos(az + 2.2) - 1) / 0.15) ** 2));
      const k = 4 * (y * w + x), b = Math.min(255, Math.round(255 * c / 1.4));
      data.set([b, b, Math.min(255, b + 6), 255], k);
    }
    const tex = new THREE.DataTexture(data, w, h);
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.needsUpdate = true;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this._env = pm.fromEquirectangular(tex).texture;
    pm.dispose(); tex.dispose();
    return this._env;
  }

  /** Статическая сцена: шар, разметка, булавки — из слоёв base/marking/layout. Полная пересборка при пересчёте. */
  buildStatic(A) {
    this.dispose(this.static);
    const g = new THREE.Group();
    const R = A.base.R, Q = A.base.Q, m = A.params.m_mm;
    this.R = R;
    // #42: the mari wrap is drawn as wound thread — a baked great-circle texture (colour #41 wrapColor, look by wrapThread)
    // used as the albedo map of the lit ball material; baked once per colour / type / size, not per frame.
    // #43: the bake is NOT done here — the first frame shows the plain wrap colour and main.js calls bakeWrap() after
    // it has been painted (a cached texture of the same colour / type / size is applied at once).
    const wt = A.params.wrapThread in WRAP_THREADS ? A.params.wrapThread : WRAP_THREAD_DEFAULT;
    const type = { id: wt, ...WRAP_THREADS[wt] };
    this.wrapBaker = this.wrapBaker || new WrapBaker();
    this.wrapJob = { C_mm: A.base.C, color: A.params.wrapColor || '#fbf8f1', type };
    const wrapMap = this.wrapBaker.cached(this.renderer, this.wrapJob);
    if (wrapMap) this.wrapJob = null;
    // #44: the wrap reads as a soft, dense layer — a cloth sheen lobe on top of the rough albedo (render only)
    const ballMat = new THREE.MeshPhysicalMaterial({
      color: wrapMap ? 0xffffff : new THREE.Color(A.params.wrapColor || '#fbf8f1'), map: wrapMap,
      roughness: 0.9 - 0.35 * (type.sheen || 0), metalness: 0, sheen: 0.45, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff),
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), ballMat);
    this.ball.rotation.x = Math.PI / 2;   // полюса сферы three.js — по оси Y; в мире симулятора — по z
    g.add(this.ball);
    // #44: the marking (jiwari) is a round thread of its type — visual diameter jiwariDiameter_mm and colour jiwariColor
    // (defaults from jiwariLook), sunk 30 % into the wrap; sheen / metalness / ply twist of the type. Render only: the model
    // marking width m (geometry) is not drawn and not changed.
    const JL = threadLookOf(A.params.jiwariLook, JIWARI_LOOK_DEFAULT);
    const dJ = Number(A.params.jiwariDiameter_mm) > 0 ? Number(A.params.jiwariDiameter_mm) : JL.diameter_mm;
    const jCol = new THREE.Color(A.params.jiwariColor || JL.color);
    const gold = lookMaterial(JL, this.envMap());
    this.goldMat = gold;
    this.jiwariLook = { id: JL.id, diameter_mm: dJ, color: '#' + jCol.getHexString() };
    const ribbon = (pts) => new THREE.Mesh(tubeGeometry(pts.map((p) => mul(unit(p), R + 0.2 * dJ)), dJ / 2, () => jCol, 10, false, JL), gold);
    // #52 commit 3: the marking lines come from the graph (every line = a full great circle, ribbon across its pole)
    const G = A.marking.graph;
    for (const L of Object.values(G.lines)) {
      const e1 = G.points[L.points[0].id].p, e2 = cross(L.n, e1), pts = [];
      for (let i = 0; i <= 960; i++) { const a = (i / 960) * 2 * Math.PI; pts.push(mul(add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a))), R)); }
      g.add(ribbon(pts));
    }
    // circles that are not on a line (latitude / obi circles added to the graph)
    for (const Cc of Object.values(G.circles)) if (!Cc.onLine) {
      const c = Cc.c, u = unit(Math.abs(c[2]) < 0.9 ? cross([0, 0, 1], c) : cross([1, 0, 0], c)), v = cross(c, u), pts = [];
      for (let i = 0; i <= 720; i++) { const a = (i / 720) * 2 * Math.PI; pts.push(mul(add(mul(c, Math.cos(Cc.rho)), mul(add(mul(u, Math.cos(a)), mul(v, Math.sin(a))), Math.sin(Cc.rho))), R)); }
      g.add(ribbon(pts));
    }
    // полюса
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const np = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), poleMat); np.position.set(0, 0, R + 0.1); g.add(np);
    const sp = np.clone(); sp.position.set(0, 0, -R - 0.1); g.add(sp);
    if (A.markingOnly) this.markingFeatures(g, A, R);
    // булавки (условное изображение головки; положение — уровень низа ряда 1)
    this.pinGroup = new THREE.Group();
    // булавка — условное кольцо на поверхности (диаметр булавки не моделируется), чтобы не закрывать стежок
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x1f4fbf });
    for (const pin of A.layout ? A.layout.pins : []) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.09, 8, 32), pinMat);
      const p = mul(unit(pin.p), R + 0.05); ring.position.set(...p);
      const nrm = unit(pin.p); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(nrm[0], nrm[1], nrm[2]));
      this.pinGroup.add(ring);
    }
    g.add(this.pinGroup);
    // подписи линий и полюса
    this.staticLabels = new THREE.Group();
    if (!A.markingOnly && A.marking.phis) {
      A.marking.phis.forEach((phi, k) => this.staticLabels.add(this.label(`L${k}`, point(R + 3, Q, phi), 'lbl line')));
      this.staticLabels.add(this.label(t('label.equator'), point(R + 1.5, Q, -Math.PI / 2 + 0.25), 'lbl line'));
    } else for (const P of Object.values(G.points)) this.staticLabels.add(this.label(String(P.valence), mul(P.p, R + 1.4), 'lbl line'));
    // #53: a kiku on the south pole gets its own centre label and no NP label (it shows through the ball at the centre)
    if (A.layout?.center === 'P.S') this.staticLabels.add(this.label(t('label.SP'), [0, 0, -(R + 1.6)], 'lbl pole'));
    else this.staticLabels.add(this.label(t('label.NP'), point(R + 1.6, 1.6, -3 * Math.PI / 8), 'lbl pole'));
    g.add(this.staticLabels);
    this.static = g;
    this.world.add(g);
    this.applyOpts();
  }

  /** #52 commit 3: points coloured by valence and faces tinted in two alternating shades (a combination marking without
   *  a pattern). Faces: spherical polygons fanned from the centre, subdivided and lifted just above the ball. */
  markingFeatures(g, A, R) {
    const G = A.marking.graph;
    const VCOL = { 4: 0x6b6b6b, 6: 0x1f5fbf, 8: 0xc2185b, 10: 0x7b1fa2 };
    for (const P of Object.values(G.points)) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.28 + 0.04 * P.valence, 16, 12), new THREE.MeshStandardMaterial({ color: VCOL[P.valence] ?? 0x333333 }));
      s.position.set(...mul(P.p, R + 0.1)); g.add(s);
    }
    // two-colouring of the faces (adjacent faces across an edge get different shades when the graph allows it)
    const shade = {}, faces = Object.values(G.faces);
    const nbr = (f) => f.edges.flatMap((e) => G.edges[e].faces).filter((x) => x !== f.id);
    for (const f0 of faces) if (shade[f0.id] === undefined) {
      shade[f0.id] = 0; const q = [f0.id];
      while (q.length) { const id = q.shift(); for (const n of nbr(G.faces[id])) if (shade[n] === undefined) { shade[n] = 1 - shade[id]; q.push(n); } }
    }
    const mats = [0xf3e2b3, 0xd9e8f5].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 }));
    const lift = (p) => mul(unit(p), R + 0.01), n = 8;
    for (const f of faces) {
      const pos = [], vs = f.vertices.map((v) => G.points[v].p), c = f.center;
      for (let i = 0; i < vs.length; i++) {
        const a = vs[i], b = vs[(i + 1) % vs.length];
        for (let r = 0; r < n; r++) for (let s = 0; s < n - r; s++) {
          const P = (rr, ss) => lift(add(add(mul(c, 1 - (rr + ss) / n), mul(a, rr / n)), mul(b, ss / n)));
          pos.push(...P(r, s), ...P(r + 1, s), ...P(r, s + 1));
          if (s < n - r - 1) pos.push(...P(r + 1, s), ...P(r + 1, s + 1), ...P(r, s + 1));
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.add(new THREE.Mesh(geo, mats[shade[f.id]]));
    }
  }

  /** Remove the threads (a marking without a pattern). */
  clearThread() { this.dispose(this.dynamic); this.dynamic = null; }

  /** Нити до операции k (префикс), подсветка текущей операции. */
  buildThread(A, k) {
    this.dispose(this.dynamic);
    const g = new THREE.Group();
    const R = A.base.R, path = A.path;
    const ops = path.ops.slice(0, k + 1);
    const cur = path.ops[k];
    const ids = new Set(ops.flatMap((o) => o.segIds));
    const curIds = new Set(cur ? cur.segIds : []);
    const curRound = path.rounds.find((r) => r.id === cur.round);
    // #44: laid thread look by type (sheen, metalness, ply twist) — the tube diameter stays w (render only)
    const TL = threadLookOf(A.params.threadLook, THREAD_LOOK_DEFAULT);
    this.threadLook = TL.id;
    const matSolid = lookMaterial(TL, this.envMap());
    // скрытые участки: светлее цвета своего обхода и полупрозрачны; канал иглы — сплошная тонкая трубка, скрытый старт — штрихи с заглушками
    const matHidden = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    const matXray = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
    const w = A.params.w_mm;
    this.roundIdx = Object.fromEntries(path.rounds.map((r, i) => [r.id, i]));
    const matCur = new THREE.MeshBasicMaterial({ color: COLORS.current, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false });   // текущая операция видна всегда (даже внутри шара)
    this.hiddenGroup = new THREE.Group();
    const thr = Object.fromEntries(Object.values(path.threads).map((t) => [t.id, t]));
    for (const dg of displayGeometry(A, ids, { hidMode: this.opts.hidMode })) {
      const s = dg.seg, pts = dg.pts, radius = dg.radius;
      const colorAt = this.colorFn(s, thr[s.thread]);
      if (!dg.hidden) {
        g.add(new THREE.Mesh(tubeGeometry(pts, radius, colorAt, 14, true, TL), matSolid));
      } else {
        const light = (x) => colorAt(x).clone().lerp(new THREE.Color(0xffffff), 0.45);
        if (s.type === 'pickup') {
          this.hiddenGroup.add(new THREE.Mesh(tubeGeometry(pts, radius, light, 10), matHidden));
          // «рентген»: канал иглы проходит ПОД нитями, поэтому сверху его закрывают трубки; поверх всего рисуется
          // его штриховой контур (условное обозначение скрытой линии, depthTest выключен) — видно, под чем идёт игла
          for (const d of dashes(pts, 0.22, 0.14)) {
            if (d.length < 2) continue;
            const m = new THREE.Mesh(tubeGeometry(d, w * 0.14, colorAt, 8), matXray); m.renderOrder = 10; this.hiddenGroup.add(m);
          }
        }
        else for (const d of dashes(pts, 1.2, 0.8)) {
          if (d.length < 2) continue;
          this.hiddenGroup.add(new THREE.Mesh(tubeGeometry(d, radius, light, 10), matHidden));
        }
        if (s.type === 'hidden-start' && s.run === 1) {
          const mid = pts[Math.floor(pts.length / 2)];
          this.hiddenGroup.add(this.label(t('label.hiddenStart', { round: s.round, thread: s.thread, mode: dg.schematic ? t('label.hiddenStart.schematic') : t('label.hiddenStart.chord') }), mul(unit(mid), R + 1.5), 'lbl small',
            t('label.hiddenStart.short', { round: s.round, thread: s.thread })));
          this.hiddenGroup.add(this.label(t('label.threadEnd', { thread: s.thread }), mul(unit(s.from), R + 1.5), 'lbl small', t('label.threadEnd.short', { thread: s.thread })));
        }
      }
      if (curIds.has(s.id)) g.add(new THREE.Mesh(tubeGeometry(pts, radius * 1.9, () => new THREE.Color(COLORS.current)), matCur));
    }
    g.add(this.hiddenGroup);
    // подписи стежков — только текущего обхода (чтобы не загромождать); номер обхода у полюса
    this.threadLabels = new THREE.Group();
    for (const idx of curRound.stitchIdx) {
      const st = path.stitches[idx];
      if (!ids.has(st.pickupId)) continue;
      const PG = A.layout.program, phi = PG.az[st.line];   // #53: about the kiku centre
      const sL = st.level === 'bottom' ? st.s + 3.2 : st.s + 4.2;   // верх: снаружи «V» между плечами
      this.threadLabels.add(this.label(`${st.round}·${st.i}`, fPoint(R + 1.2, PG.frame, sL, phi), 'lbl stitch'));
    }
    if (cur && cur.segIds.length) {
      const s = path.segs.find((x) => x.id === cur.segIds[0]);
      const mid = s.pts[Math.floor(s.pts.length / 2)];
      const short = cur.kind === 'lay' ? t('label.cur.lay', { idx: cur.idx, round: cur.round, line: cur.line })
        : cur.kind === 'stitch' ? t('label.cur.stitch', { idx: cur.idx, round: cur.round, stitch: cur.stitch })
        : t('label.cur.start', { idx: cur.idx, round: cur.round, run: cur.run, runs: cur.runs });
      this.threadLabels.add(this.label(short, mul(unit(mid), R + 3), 'lbl current'));
      for (const c of (s.crossings || [])) {
        if (c.kind === 'wedge') continue;
        this.threadLabels.add(this.label(c.over === s.id ? t('label.over') : t('label.under'), mul(unit(c.at), R + 1.6), 'lbl cross'));
      }
    } else if (cur && (cur.kind === 'park' || cur.kind === 'resume')) {
      const r = cur.kind === 'park' ? curRound : path.rounds.find((q) => q.thread === curRound.thread && q.opLast < curRound.opFirst);
      const last = path.stitches[r.stitchIdx[r.stitchIdx.length - 1]];
      this.threadLabels.add(this.label(cur.kind === 'park' ? t('label.cur.park', { idx: cur.idx, thread: cur.thread }) : t('label.cur.resume', { idx: cur.idx, thread: cur.thread }), mul(unit(last.X), R + 3), 'lbl current'));
    }
    g.add(this.threadLabels);
    this.dynamic = g;
    this.world.add(g);
    this.applyOpts();
  }

  /** Окраска: 'u' — градиент по длине своей нити (A — viridis, B — «тёплая» шкала); 'set' — цвет набора, ряды светлее/темнее;
   *  'type' — по типу участка. Возвращает (t ∈ [0,1] вдоль сегмента) → THREE.Color. */
  colorFn(s, t) {
    const mode = this.opts.color;
    if (mode === 'round') { const c = new THREE.Color(roundColor(this.roundIdx ? this.roundIdx[s.round] ?? 0 : 0)); return () => c; }
    if (mode === 'type') return () => new THREE.Color(COLORS[s.type]);
    if (mode === 'set') {
      const base = new THREE.Color(SET_COLORS[s.set] || 0x888888);
      const c = base.clone().offsetHSL(0, 0, ((Math.max(1, s.row || 1) - 1) % 3) * 0.1);   // #3: rows cycle 3 shades so the set colour survives past row 4
      return () => c;
    }
    const pal = s.thread === 'B' ? warm : viridis;
    return (x) => pal((s.u0 + x * (s.u1 - s.u0)) / t.uEnd);
  }

  applyOpts() {
    if (this.ball) {
      const m = this.ball.material;
      m.transparent = this.opts.transparent; m.opacity = this.opts.transparent ? 0.4 : 1; m.depthWrite = !this.opts.transparent;
      m.needsUpdate = true;
    }
    if (this.goldMat) { this.goldMat.transparent = this.opts.transparent; this.goldMat.opacity = this.opts.transparent ? 0.45 : 1; this.goldMat.depthWrite = !this.opts.transparent; this.goldMat.needsUpdate = true; }
    if (this.hiddenGroup) this.hiddenGroup.visible = this.opts.hidden;
    if (this.pinGroup) this.pinGroup.visible = this.opts.pins;
    for (const grp of [this.staticLabels, this.threadLabels]) if (grp) grp.traverse((o) => { if (o.isCSS2DObject) o.visible = this.opts.labels; });
    if (this.hiddenGroup) this.hiddenGroup.traverse((o) => { if (o.isCSS2DObject) o.visible = this.opts.labels && this.opts.hidden; });
    this.draw();
  }

  /** Виды камеры (в координатах симулятора: СП = +z). */
  /** #53: the kiku centre (unit vector) the 'center' view looks onto. */
  setViewCenter(c) { this.viewCenter = c ? c.slice() : null; }

  view(name, R = this.R || 38.2, distMm = null, dirVec = null) {   // dirVec — произвольное направление камеры (параметр URL dir=x,y,z)
    const D = distMm || R * 7.2;          // distMm — фиксированная дистанция (сравнение размеров разных мари)
    const toThree = (v) => new THREE.Vector3(v[0], v[2], -v[1]);
    const dirs = { top: [0, -0.0008, 1], oblique: [0.55, -0.95, 0.9], bottom: [0, 0.0008, -1], side: [0, -1, 0.05] };
    // #53: 'center' looks onto the kiku centre (setViewCenter); at the poles it is the top / bottom view
    const c = this.viewCenter || [0, 0, 1];
    dirs.center = c[2] > 1 - 1e-12 ? dirs.top : c[2] < -1 + 1e-12 ? dirs.bottom : c;
    const d = unit(dirVec && dirVec.length === 3 && dirVec.every(Number.isFinite) ? dirVec : dirs[name] || dirs.top);
    this.camera.position.copy(toThree(mul(d, D)));
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
    this.draw();
  }

  /** Линзовый зум (камера остаётся на месте) и точка фокуса. */
  zoomTo(z, focus = null) {
    this.camera.zoom = z; this.camera.updateProjectionMatrix();
    if (focus) { const f = new THREE.Vector3(focus[0], focus[2], -focus[1]); this.controls.target.copy(f); this.camera.lookAt(f); }
    this.controls.update(); this.draw();
  }

  /** #43: bake the pending wrap texture (after the first frame) and put it on the current ball. Returns true when the
   *  ball carries the baked texture (or there was nothing to bake); a failed bake keeps the plain colour. */
  bakeWrap() {
    const job = this.wrapJob;
    if (!job || !this.ball) return true;
    this.wrapJob = null;
    let map = null;
    try { map = this.wrapBaker.bake(this.renderer, job); } catch (e) { console.warn('[wrap] bake failed, plain ball', e); return false; }
    const mat = this.ball.material;
    mat.map = map; mat.color.set(0xffffff); mat.needsUpdate = true;
    this.draw();
    return true;
  }

  draw() {
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.declutter();
  }

  /** #33: on narrow views (phone, ≤ 700 px) labels must not overlap or be clipped. Screen-space pass after each CSS2D
   *  render: short texts (hidden start / thread end, wrapped); line labels L0…Ln are placed first and always shown
   *  (when inside the view); then pole > current operation > equator > stitch > over/under > small, each slid
   *  horizontally into the view and tried in place or nudged up/down (stitch/over-under ±1 label height, others ±2);
   *  a label that still overlaps a placed one (min gap) or leaves the view is hidden. CSS2DRenderer owns
   *  style.display, so this uses visibility and margins only. Wide views (desktop) are untouched. */
  declutter() {
    const root = this.labels.domElement, W = root.clientWidth, H = root.clientHeight;
    const narrow = W > 0 && W <= LABEL_NARROW_PX;
    if (!narrow && !this._declutterOn) return;
    const els = /** @type {HTMLElement[]} */ ([...root.children]);
    if (!narrow) {   // back to wide: restore everything once
      for (const el of els) { el.style.visibility = ''; el.style.marginTop = ''; el.style.marginLeft = ''; if (el.dataset.full) el.textContent = el.dataset.full; }
      root.classList.remove('labels-narrow'); this._declutterOn = false; return;
    }
    this._declutterOn = true; root.classList.add('labels-narrow');
    // line labels L0…Ln first and never displaced by another label (#33 feedback: L0 was hidden by the current-op
    // label); then pole, current operation, equator, stitch, over/under, small.
    const pri = (el) => { const c = el.classList; return c.contains('line') && /^L\d+$/.test(el.textContent || '') ? 0 : c.contains('pole') ? 1 : c.contains('current') ? 2
      : c.contains('line') ? 3 : c.contains('stitch') ? 4 : c.contains('cross') ? 5 : 6; };
    const items = [];
    els.forEach((el, k) => {
      if (el.dataset.short && el.textContent !== el.dataset.short) el.textContent = el.dataset.short;
      el.style.visibility = ''; el.style.marginTop = ''; el.style.marginLeft = '';
      if (el.style.display !== 'none') items.push({ el, p: pri(el), k });
    });
    items.sort((a, b) => a.p - b.p || a.k - b.k);
    const vr = root.getBoundingClientRect(), G = LABEL_GAP_PX, placed = [];
    const hits = (b) => placed.some((q) => b.x0 < q.x1 + G && q.x0 < b.x1 + G && b.y0 < q.y1 + G && q.y0 < b.y1 + G);
    for (const it of items) {
      const r = it.el.getBoundingClientRect(), h = r.height + G;
      // horizontal clamp into the view (a label clipped at the right/left edge slides in by its overflow)
      const x0 = r.left - vr.left, x1 = r.right - vr.left;
      const dx = it.p === 0 || x1 - x0 > W ? 0 : x1 > W ? W - x1 : x0 < 0 ? -x0 : 0;
      const at = (dy) => ({ x0: x0 + dx, y0: r.top - vr.top + dy, x1: x1 + dx, y1: r.bottom - vr.top + dy });
      const inside = (b) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= W && b.y1 <= H;
      if (it.p === 0) { if (inside(at(0))) placed.push(at(0)); else it.el.style.visibility = 'hidden'; continue; }
      // then in place or nudged up/down (stitch / over-under labels by one label height so they stay at their point;
      // current operation / small labels by up to two); hide if nothing fits
      const dys = it.p === 4 || it.p === 5 ? [0, -h, h] : [0, -h, h, -2 * h, 2 * h];
      const put = (dy, b) => { if (dy) it.el.style.marginTop = `${dy}px`; if (dx) it.el.style.marginLeft = `${dx}px`; placed.push(b); };
      let done = false;
      for (const dy of dys) { const b = at(dy); if (!inside(b) || hits(b)) continue; put(dy, b); done = true; break; }
      if (!done && it.p === 2) {   // the current operation may stay partly outside the view rather than vanish (never over another label)
        for (const dy of dys) { const b = at(dy); if (hits(b)) continue; put(dy, b); done = true; break; }
      }
      if (!done) it.el.style.visibility = 'hidden';
    }
  }
}
