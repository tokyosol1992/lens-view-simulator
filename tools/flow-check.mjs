// Integrated catalog, filtering and link regression checks. No GPU is required.
//   node tools/flow-check.mjs
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
let ok = true;
const check = (label, cond, detail = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + label + (detail ? ': ' + detail : '')); if (!cond) ok = false; };
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
await context.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '?lang=en&q=draft', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.state === 'error');
check('the expanded catalog is available', await page.locator('#lens option').count() === 127);
check('the ordinary camera picker has 15 sensor classes', await page.locator('#camera option').count() === 15);
check('old phone and real camera models are hidden from the ordinary picker',
  await page.locator('#camera option[value="phone"]').count() === 0 && await page.locator('#camera option[value="a7m4"]').count() === 0);

await page.selectOption('#brand', 'sony');
await page.selectOption('#lens', 'sony-fe-50mm-f-1-8');
await page.selectOption('#camera', 'apsc24');
await page.waitForTimeout(100);
const fifty = page.locator('#lens option[value="sony-fe-50mm-f-1-8"]');
check('APS-C 50mm displays its equivalent', await fifty.count() === 1 && /≈7[67]/.test(await fifty.textContent()));
check('view categories and detailed lens copy are absent', await page.locator('#views, #lens-spec, #lens-note, #lens-est').count() === 0);

await page.selectOption('#camera', 'mf645a');
await page.check('#fits');
await page.waitForTimeout(100);
check('an empty coverage filter stays selected and explains the result',
  await page.locator('#brand').inputValue() === 'sony' && await page.locator('#fits').isChecked() && /No lens matches/.test(await page.locator('#lens-count').textContent()));
await page.selectOption('#brand', 'all');
await page.waitForTimeout(100);
const compatible = await page.locator('#lens option').allTextContents();
check('coverage filter finds lenses for the selected sensor', compatible.length > 0 && compatible.every((text) => !/dark corners/.test(text)));
check('coverage filter does not promise mount compatibility', /mount compatibility is not checked/.test(await page.locator('[data-i18n="lens.mountNote"]').textContent()));

await page.locator('#quick-starts summary').click();
await page.click('#preset-bokeh');
await page.waitForTimeout(400);
let state = await page.evaluate(() => window.__lvs.state);
check('quick start applies the intended camera, lens and scene',
  state.cameraId === 'ff24' && state.lensId === 'sony-fe-85mm-f-1-4-gm' && state.sceneId === 'garden');
check('quick start describes the comparison', /^Look for:/.test(await page.locator('#preset-look').textContent()));
await page.evaluate(() => {
  Object.assign(window.__lvs.state, { afTracksSubject: false, focusM: 8.25, af: [0.2, -0.3], zebra: true, grid: false });
  window.__lvs.update();
});
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.state === 'error');
state = await page.evaluate(() => window.__lvs.state);
check('address-bar reload preserves manual focus and picture flags',
  !state.afTracksSubject && Math.abs(state.focusM - 8.25) < 0.01 && Math.abs(state.af[0] - 0.2) < 0.01 && state.zebra && !state.grid);
check('no desktop page errors', errors.length === 0, errors.join(' | '));

await page.goto(base + '?camera=a7m4&lens=sel14gm&scene=camp&q=draft', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.state === 'error');
state = await page.evaluate(() => window.__lvs.state);
check('older links retain camera, lens and campsite defaults',
  state.cameraId === 'a7m4' && state.lensId === 'sel14gm' && state.sceneId === 'camp' && state.iso === 3200 && state.support === 'tripod');
await page.goto(base + '?camera=phone&lens=n50p&q=draft', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.state === 'error');
check('an existing phone-sensor link remains usable', await page.locator('#camera').inputValue() === 'phone');
await context.close();

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await mobile.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
await mobile.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
const phone = await mobile.newPage();
const phoneErrors = [];
phone.on('pageerror', (e) => phoneErrors.push(String(e)));
await phone.goto(base + '?lang=ko&q=draft', { waitUntil: 'domcontentloaded' });
await phone.waitForFunction(() => document.body.dataset.state === 'error');
await phone.click('#tab-gear');
check('phone camera and lens tab includes the catalog', await phone.locator('#brand').isVisible() && !await phone.locator('#quick-starts summary').isVisible());
await phone.click('#tab-picture');
await phone.locator('#quick-starts summary').click();
check('phone quick starts expand on request', await phone.locator('#presets').isVisible());
check('phone: mount and coverage explanation is translated', /마운트/.test(await phone.locator('[data-i18n="lens.mountNote"]').textContent()));
check('phone: no horizontal overflow', await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
check('no phone page errors', phoneErrors.length === 0, phoneErrors.join(' | '));
await mobile.close();
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
