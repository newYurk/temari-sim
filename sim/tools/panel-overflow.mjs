#!/usr/bin/env node
// Panel overflow regression (playwright-core + Chrome), like screenshots.mjs.
// Dependencies: cd sim/tools && npm install
// Run: node sim/tools/panel-overflow.mjs [http://localhost:8765]   (server: python3 -m http.server 8765 in sim/)
/**
 * Regression: #panel must not horizontal-overflow on phone portrait (all color modes).
 */
import fs from 'node:fs';
import { chromium, devices } from 'playwright-core';

const base = process.argv[2] || 'http://127.0.0.1:8765';
const CHROME =
  process.env.CHROME_PATH ||
  (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/google-chrome');

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];
const COLORS = ['round', 'u', 'set', 'type'];

async function checkViewport(page, vp) {
  await page.setViewportSize(vp);
  const fails = [];
  for (const color of COLORS) {
    await page.goto(`${base}/index.html?stage=all&color=${color}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__sim && window.__sim.ready, null, { timeout: 120000 });
    await page.click('#last').catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document.querySelectorAll('#diagnostics .drow-btn').forEach((btn) => {
        const li = btn.closest('.drow');
        if (li && !li.classList.contains('is-open')) btn.click();
      });
    });
    const m = await page.evaluate((color) => {
      const panel = document.getElementById('panel');
      const pr = panel.getBoundingClientRect().right;
      const culprits = [];
      panel.querySelectorAll('*').forEach((el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width > 1 && r.right > pr + 0.5) {
          culprits.push({ tag: el.tagName, id: el.id, class: el.className, width: Math.round(r.width) });
        }
      });
      const cs = getComputedStyle(panel);
      const portrait = window.innerWidth <= 700;
      const insuranceOk = !portrait || (cs.overflowX === 'hidden' && cs.touchAction === 'pan-y');
      const scrollOk = panel.scrollWidth <= panel.clientWidth;
      return {
        color,
        scrollWidth: panel.scrollWidth,
        clientWidth: panel.clientWidth,
        overflowX: cs.overflowX,
        touchAction: cs.touchAction,
        scrollOk,
        insuranceOk,
        culprits,
      };
    }, color);
    if (!m.scrollOk || m.culprits.length || !m.insuranceOk) fails.push({ viewport: vp, ...m });
  }
  return fails;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  ...devices['iPhone 12'],
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
let allFails = [];
for (const vp of VIEWPORTS) {
  allFails = allFails.concat(await checkViewport(page, vp));
}
await browser.close();

if (allFails.length) {
  console.error('panel-overflow FAIL', JSON.stringify(allFails, null, 2));
  process.exit(1);
}
console.log('panel-overflow OK', VIEWPORTS.length, 'viewports ×', COLORS.length, 'colors');
process.exit(0);
