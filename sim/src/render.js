// Рендер (three.js). Вход — ТОЛЬКО результат конвейера (слои + префикс пути). Рендер ничего не возвращает в модель.
// Отображение: нить — трубка круглого сечения диаметра w, лежащая на поверхности (ось на R + w/2);
// скрытые участки — пунктирные трубки (display.js: скрытый старт по умолчанию схемой у поверхности, режим «хорда» — как в модели);
// видимое → скрытое: короткий «нырок» в отверстие.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { point, eEast, unit, mul, add, sub, norm, dist } from './geom.js';
import { tubeMesh } from './tube.js';
import { displayGeometry } from './display.js';

const COLORS = { leg: 0x2f6bd6, pickup: 0xd6336c, 'hidden-start': 0x7a7a7a, current: 0xff8c00 };
// диагностическая палитра по длине нити u (viridis, 6 опорных цветов)
const VIRIDIS = [[68, 1, 84], [65, 68, 135], [42, 120, 142], [34, 168, 132], [122, 209, 81], [253, 231, 37]];
export function viridis(t) {
  t = Math.max(0, Math.min(1, t));
  const x = t * (VIRIDIS.length - 1), i = Math.min(VIRIDIS.length - 2, Math.floor(x)), f = x - i;
  const c = VIRIDIS[i].map((v, k) => (v + f * (VIRIDIS[i + 1][k] - v)) / 255);
  return new THREE.Color(c[0], c[1], c[2]);
}

/** Трубка вдоль полилинии (геометрия — чистая tubeMesh из tube.js, её же проверяет V14), цвет по доле длины. */
function tubeGeometry(pts, radius, colorAt, radial = 14) {
  const m = tubeMesh(pts, radius, radial);
  const col = [];
  for (const t of m.frac) { const c = colorAt(t); col.push(c.r, c.g, c.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos.flat(), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor.flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(m.idx);
  return g;
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
    this.opts = { transparent: false, hidden: true, labels: true, pins: true, color: 'u', hidMode: 'surf' };
    window.addEventListener('resize', () => this.resize());
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

  label(text, pos, cls = 'lbl') {
    const el = document.createElement('div');
    el.className = cls; el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.set(pos[0], pos[1], pos[2]);
    return o;
  }

  /** Статическая сцена: шар, разметка, булавки — из слоёв base/marking/layout. Полная пересборка при пересчёте. */
  buildStatic(A) {
    this.dispose(this.static);
    const g = new THREE.Group();
    const R = A.base.R, Q = A.base.Q, m = A.params.m_mm;
    this.R = R;
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xfbf8f1, roughness: 0.9, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), ballMat);
    this.ball.rotation.x = Math.PI / 2;   // полюса сферы three.js — по оси Y; в мире симулятора — по z
    g.add(this.ball);
    // разметка: лента ширины m на поверхности
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b43a, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.goldMat = gold;
    const ribbon = (pts, sideVec) => {
      const pos = [], idx = [];
      pts.forEach((p, i) => {
        const e = sideVec(p, i);
        const a = mul(unit(add(p, mul(e, m / 2))), R + 0.02), b = mul(unit(add(p, mul(e, -m / 2))), R + 0.02);
        pos.push(...a, ...b);
        if (i > 0) { const k = 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      return new THREE.Mesh(geo, gold);
    };
    for (const phi of A.marking.phis) {
      const pts = [];
      for (let s = 0.02; s <= 2 * Q - 0.02; s += 0.25) pts.push(point(R, s, phi));
      g.add(ribbon(pts, (p) => eEast(p)));
    }
    const eq = [];
    for (let i = 0; i <= 720; i++) eq.push(point(R, Q, (i / 720) * 2 * Math.PI));
    g.add(ribbon(eq, () => [0, 0, 1]));
    // полюса
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const np = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), poleMat); np.position.set(0, 0, R + 0.1); g.add(np);
    const sp = np.clone(); sp.position.set(0, 0, -R - 0.1); g.add(sp);
    // булавки (условное изображение головки; положение — уровень низа ряда 1)
    this.pinGroup = new THREE.Group();
    // булавка — условное кольцо на поверхности (диаметр булавки не моделируется), чтобы не закрывать стежок
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x1f4fbf });
    for (const pin of A.layout.pins) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.09, 8, 32), pinMat);
      const p = mul(unit(pin.p), R + 0.05); ring.position.set(...p);
      const nrm = unit(pin.p); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(nrm[0], nrm[1], nrm[2]));
      this.pinGroup.add(ring);
    }
    g.add(this.pinGroup);
    // подписи линий и полюса
    this.staticLabels = new THREE.Group();
    A.marking.phis.forEach((phi, k) => this.staticLabels.add(this.label(`L${k}`, point(R + 1.5, A.layout.sBot + 7, phi), 'lbl line')));
    this.staticLabels.add(this.label('СП', point(R + 1.6, 1.6, -3 * Math.PI / 8), 'lbl pole'));
    this.staticLabels.add(this.label('экватор', point(R + 1.5, Q, -Math.PI / 2 + 0.25), 'lbl line'));
    g.add(this.staticLabels);
    this.static = g;
    this.world.add(g);
    this.applyOpts();
  }

  /** Нить до операции k (префикс), подсветка текущей операции. */
  buildThread(A, k) {
    this.dispose(this.dynamic);
    const g = new THREE.Group();
    const R = A.base.R, w = A.params.w_mm, path = A.path;
    const uMax = path.uEnd, uStart = path.segs[0].u0;
    const ops = path.ops.slice(0, k + 1);
    const cur = path.ops[k];
    const ids = new Set(ops.flatMap((o) => o.segIds));
    const curIds = new Set(cur ? cur.segIds : []);
    const matSolid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const matHidden = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, transparent: true, opacity: 0.85 });
    const matCur = new THREE.MeshBasicMaterial({ color: COLORS.current, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false });   // текущая операция видна всегда (даже внутри шара)
    this.hiddenGroup = new THREE.Group();
    for (const dg of displayGeometry(A, ids, { hidMode: this.opts.hidMode })) {
      const s = dg.seg, pts = dg.pts, radius = dg.radius;
      const colorAt = this.opts.color === 'u'
        ? (t) => viridis((s.u0 + t * (s.u1 - s.u0) - uStart) / (uMax - uStart))
        : () => new THREE.Color(COLORS[s.type]);
      if (!dg.hidden) {
        g.add(new THREE.Mesh(tubeGeometry(pts, radius, colorAt), matSolid));
      } else {
        for (const d of dashes(pts, s.type === 'pickup' ? 0.28 : 1.2, s.type === 'pickup' ? 0.18 : 0.8)) {
          if (d.length < 2) continue;
          this.hiddenGroup.add(new THREE.Mesh(tubeGeometry(d, radius, colorAt, 10), matHidden));
        }
        if (s.type === 'hidden-start' && s.id === path.segs[0].id) {
          const mid = pts[Math.floor(pts.length / 2)];
          this.hiddenGroup.add(this.label(dg.schematic ? 'скрытый старт — схема у поверхности (модель: прямая хорда)' : 'скрытый старт — хорда иглы (модель)', mul(unit(mid), R + 1.5), 'lbl small'));
        }
      }
      if (curIds.has(s.id)) g.add(new THREE.Mesh(tubeGeometry(pts, radius * 1.9, () => new THREE.Color(COLORS.current)), matCur));
    }
    g.add(this.hiddenGroup);
    // подписи стежков
    this.threadLabels = new THREE.Group();
    for (const st of path.stitches) {
      if (!ids.has(st.pickupId)) continue;
      const phi = A.marking.phis[st.line];
      const s = st.level === 'bottom' ? st.s + 3.2 : st.s + 4.2;   // верх: снаружи «V» между плечами
      this.threadLabels.add(this.label(String(st.i), point(R + 1.2, s, phi), 'lbl stitch'));
    }
    if (cur && cur.segIds.length) {
      const s = path.segs.find((x) => x.id === cur.segIds[0]);
      const mid = s.pts[Math.floor(s.pts.length / 2)];
      const short = cur.kind === 'lay' ? `▶ ${cur.idx}: плечо к L${cur.line}` : cur.kind === 'stitch' ? `▶ ${cur.idx}: стежок ${cur.stitch}, игла E→X` : `▶ ${cur.idx}: скрытый старт ${cur.run}/${cur.runs}`;
      this.threadLabels.add(this.label(short, mul(unit(mid), R + 3), 'lbl current'));
      // перекресты текущего плеча
      for (const c of (s.crossings || [])) {
        this.threadLabels.add(this.label(c.over === s.id ? '× над' : '× под', mul(unit(c.at), R + 1.6), 'lbl cross'));
      }
    } else if (cur && cur.kind === 'park') {
      const last = path.stitches[path.stitches.length - 1];
      this.threadLabels.add(this.label(`▶ ${cur.idx}: парковка`, mul(unit(last.X), R + 3), 'lbl current'));
    }
    if (ids.has(path.segs[0].id)) this.threadLabels.add(this.label('конец нити (скрыт)', mul(unit(path.start.tail), R + 1.5), 'lbl small'));
    g.add(this.threadLabels);
    this.dynamic = g;
    this.world.add(g);
    this.applyOpts();
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
  view(name, R = this.R || 38.2, distMm = null) {
    const D = distMm || R * 7.2;          // distMm — фиксированная дистанция (сравнение размеров разных мари)
    const toThree = (v) => new THREE.Vector3(v[0], v[2], -v[1]);
    const dirs = { top: [0, -0.0008, 1], oblique: [0.55, -0.95, 0.9], bottom: [0, 0.0008, -1], side: [0, -1, 0.05] };
    const d = unit(dirs[name] || dirs.top);
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

  draw() {
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
