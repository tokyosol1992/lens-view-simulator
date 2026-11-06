// Lens-frame comparison geometry, fixed position and sharing. Needs no GPU.
//   node tools/frame-check.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(process.env.NODE_PATH || '', 'playwright'))); }
const root = resolve(new URL('..', import.meta.url).pathname);
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolveServer) => server.listen(0, resolveServer));
const base = 'http://localhost:' + server.address().port + '/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
await context.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
const page = await context.newPage(), errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
let ok = true;
const check = (label, cond, detail = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + label + (detail ? ': ' + detail : '')); if (!cond) ok = false; };
await page.goto(base + '?lang=en&q=draft&camera=ff24&lens=n50p&dist=6', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.state === 'error');
const before = await page.evaluate(() => ({ focal: window.__lvs.state.focal, distance: window.__lvs.state.distance }));
check('frame lines are initially hidden', await page.locator('#frame-lines').isHidden());
await page.locator('#frame-settings summary').click();
await page.selectOption('#frame-lens-1', 'sony-fe-24mm-f-1-4-gm');
await page.selectOption('#frame-lens-2', 'sony-fe-85mm-f-1-4-gm');
await page.waitForTimeout(200);
const result = await page.evaluate(async () => {
  const state = window.__lvs.state;
  const catalog = await import('/src/catalog.js'), optics = await import('/src/optics.js');
  const selected = [catalog.LENSES.find((l) => l.id === state.lensId), ...state.frameLenses.map((s) => catalog.LENSES.find((l) => l.id === s.lensId))];
  const focal = [state.focal, ...state.frameLenses.map((s) => s.focal)];
  const effective = selected.map((l, i) => optics.framingFocal(l, focal[i], Math.max(state.focusM, l.minFocus)));
  return {
    focal: state.focal, distance: state.distance,
    width: ['frame-primary', 'frame-one', 'frame-two'].map((id) => Number(document.getElementById(id).getAttribute('width'))),
    expected: effective.map((f) => 97.6 * Math.min(...effective) / f),
  };
});
check('both comparison lenses leave camera position and current lens unchanged', result.focal === before.focal && result.distance === before.distance);
check('widest lens is the background and all three frames have the correct relative size',
  result.width.every((v, i) => Math.abs(v - result.expected[i]) < 0.001), JSON.stringify(result.width));
check('frame legend is visible', await page.locator('#frame-legend span').count() === 4);
await page.selectOption('#frame-lens-1', 'sony-fe-24-70mm-f-2-8-gm-ii');
await page.locator('#frame-focal-1').fill('30.5');
await page.locator('#frame-focal-1').press('Enter');
await page.waitForTimeout(400);
check('comparison zoom accepts a typed focal length', Math.abs((await page.evaluate(() => window.__lvs.state.frameLenses[0].focal)) - 30.5) < 0.001);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.state === 'error');
const restored = await page.evaluate(() => window.__lvs.state.frameLenses);
check('comparison lenses and zoom position survive reload',
  restored[0].lensId === 'sony-fe-24-70mm-f-2-8-gm-ii' && Math.abs(restored[0].focal - 30.5) < 0.001 && restored[1].lensId === 'sony-fe-85mm-f-1-4-gm');
await page.selectOption('#frame-lens-1', 'fuji-xf-23mm-f-1-4-r-lm-wr');
await page.waitForTimeout(100);
check('comparison warns when a lens does not cover the selected sensor', await page.locator('#frame-coverage-1').isVisible());
await page.selectOption('#frame-lens-1', '');
await page.selectOption('#frame-lens-2', '');
await page.waitForTimeout(100);
check('removing comparisons restores the regular view', await page.locator('#frame-lines').isHidden());
check('no page errors', errors.length === 0, errors.join(' | '));
await context.close();
const mobile = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
await mobile.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
await mobile.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
const phone = await mobile.newPage();
await phone.goto(base + '?lang=ko&q=draft&cmp1=sony-fe-24mm-f-1-4-gm&cmp2=sony-fe-85mm-f-1-4-gm', { waitUntil: 'domcontentloaded' });
await phone.waitForFunction(() => document.body.dataset.state === 'error');
await phone.click('#tab-location');
check('phone restores comparison settings and shows both controls', await phone.locator('#frame-settings').evaluate((el) => el.open) && await phone.locator('#frame-lens-1').isVisible() && await phone.locator('#frame-lens-2').isVisible());
check('phone comparison controls do not cause horizontal overflow', await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
await mobile.close(); await browser.close(); server.close();
process.exit(ok ? 0 : 1);
