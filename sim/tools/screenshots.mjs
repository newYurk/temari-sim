// Скриншоты через headless Chrome (playwright-core + системный google-chrome).
// Запуск: node sim/tools/screenshots.mjs [http://localhost:8765]   (сервер: python3 -m http.server 8765 в sim/)
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const base = process.argv[2] || 'http://localhost:8765';

const shots = [
  { name: '01_pass2a_top', q: 'stage=2a&view=top&zoom=1.25' },
  { name: '02_round2b_top', q: 'stage=2b&view=top&zoom=1.25' },
  { name: '03_round2b_oblique_transparent', q: 'stage=2b&view=oblique&t=1&zoom=1.15' },
  { name: '03b_round2b_oblique_transparent_chord', q: 'stage=2b&view=oblique&t=1&zoom=1.15&hid=chord' },
  { name: '03c_round2b_oblique_opaque', q: 'stage=2b&view=oblique&zoom=1.15' },
  { name: '04_step_mid_highlight', q: 'stage=2b&k=10&view=top&zoom=1.6&color=type' },
  { name: '05_closing_zoom', q: 'stage=2b&k=17&view=top&zoom=9&focus=np&color=type&t=1&pins=0' },
  { name: '07_tip_zoom', q: 'stage=2b&k=4&view=top&zoom=5&focus=tip1&color=type&t=1' },
  { name: '06a_params_C240_w0714', q: 'stage=2b&view=top&dist=344' },
  { name: '06b_params_C300_w1', q: 'C_mm=300&w_mm=1&stage=2b&view=top&dist=344' },
  // этап 2c
  { name: '10_B1_top', q: 'stage=B1&view=top&zoom=1.25' },
  { name: '11_A2_top', q: 'stage=A2&view=top&zoom=1.25' },
  { name: '11s_A2_top_by_set', q: 'stage=A2&view=top&zoom=1.25&color=set' },
  { name: '11u_A2_top_gradient', q: 'stage=A2&view=top&zoom=1.25&color=u' },
  { name: '12_A2_upper_point_zoom', q: 'stage=A2&view=top&zoom=6&focus=a2top&t=1&pins=0' },
  { name: '12b_A2_upper_point_zoom_close', q: 'stage=A2&view=top&zoom=16&focus=a2top&t=1&pins=0' },
  { name: '13_A2_oblique_transparent', q: 'stage=A2&view=oblique&t=1&zoom=1.15' },
  { name: '14a_A2_C240_w0714', q: 'stage=A2&view=top&dist=344' },
  { name: '14b_A2_C300_w1', q: 'C_mm=300&w_mm=1&stage=A2&view=top&dist=344' },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const s of shots) {
  if (only && !only.test(s.name)) continue;
  await page.goto(`${base}/index.html?${s.q}`);
  await page.waitForFunction(() => window.__sim && window.__sim.ready, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  const file = path.join(out, `${s.name}.png`);
  await page.screenshot({ path: file });
  const st = await page.evaluate(() => window.__sim);
  console.log(`${s.name}.png  k=${st.k} stage=${st.stage} summary=${JSON.stringify(st.summary)} errors=${st.errors.length}`);
}
await browser.close();

// Сравнения рядом (только область 3D-вида, без панели)
function sideBySide(fa, fb, outName) {
  const a = PNG.sync.read(fs.readFileSync(path.join(out, fa)));
  const b = PNG.sync.read(fs.readFileSync(path.join(out, fb)));
  const cw = 1160, ch = 1000;
  const c = new PNG({ width: cw * 2, height: ch });
  for (const [img, ox] of [[a, 0], [b, cw]]) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = (y * img.width + x) * 4, di = (y * c.width + x + ox) * 4;
    for (let k = 0; k < 4; k++) c.data[di + k] = img.data[si + k];
  }
  fs.writeFileSync(path.join(out, outName), PNG.sync.write(c));
  console.log(outName);
}
if (!only) sideBySide('06a_params_C240_w0714.png', '06b_params_C300_w1.png', '06_compare_C240w0714_vs_C300w1.png');
if (!only || only.test('14a')) sideBySide('14a_A2_C240_w0714.png', '14b_A2_C300_w1.png', '14_A2_compare_C240w0714_vs_C300w1.png');
if (!only && fs.existsSync(path.join(out, '03_before_chords_opacity028.png')))
  sideBySide('03_before_chords_opacity028.png', '03_round2b_oblique_transparent.png', '03_compare_before_after.png');
if (logs.length) console.log('console:\n' + logs.join('\n'));
