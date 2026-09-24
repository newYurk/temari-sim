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
  { name: '04_step_mid_highlight', q: 'stage=2b&k=10&view=top&zoom=1.6&color=type' },
  { name: '05_closing_zoom', q: 'stage=2b&k=17&view=top&zoom=9&focus=np&color=type&t=1&pins=0' },
  { name: '07_tip_zoom', q: 'stage=2b&k=4&view=top&zoom=5&focus=tip1&color=type&t=1' },
  { name: '06a_params_C240_w0714', q: 'stage=2b&view=top&dist=344' },
  { name: '06b_params_C300_w1', q: 'C_mm=300&w_mm=1&stage=2b&view=top&dist=344' },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
for (const s of shots) {
  await page.goto(`${base}/index.html?${s.q}`);
  await page.waitForFunction(() => window.__sim && window.__sim.ready, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  const file = path.join(out, `${s.name}.png`);
  await page.screenshot({ path: file });
  const st = await page.evaluate(() => window.__sim);
  console.log(`${s.name}.png  k=${st.k} stage=${st.stage} summary=${JSON.stringify(st.summary)} errors=${st.errors.length}`);
}
await browser.close();

// Сравнение двух наборов параметров рядом (только область 3D-вида, без панели)
const a = PNG.sync.read(fs.readFileSync(path.join(out, '06a_params_C240_w0714.png')));
const b = PNG.sync.read(fs.readFileSync(path.join(out, '06b_params_C300_w1.png')));
const cw = 1160, ch = 1000;
const c = new PNG({ width: cw * 2, height: ch });
for (const [img, ox] of [[a, 0], [b, cw]]) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
  const si = (y * img.width + x) * 4, di = (y * c.width + x + ox) * 4;
  for (let k = 0; k < 4; k++) c.data[di + k] = img.data[si + k];
}
fs.writeFileSync(path.join(out, '06_compare_C240w0714_vs_C300w1.png'), PNG.sync.write(c));
console.log('06_compare_C240w0714_vs_C300w1.png');
if (logs.length) console.log('console:\n' + logs.join('\n'));
