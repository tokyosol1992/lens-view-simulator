// Direct-entry and in-view scene-selector regressions. Needs no GPU.
//   node tools/controls-check.mjs
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
const state = () => page.evaluate(() => window.__lvs.state);
const entry = async (id, value) => { await page.locator('#' + id).fill(value); await page.locator('#' + id).press('Enter'); await page.waitForTimeout(100); };
await page.goto(base + '?lang=en&q=draft&lens=z2470', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.state === 'error');
await entry('focal-input', '36.5');
check('fractional focal length updates the shot and slider', Math.abs((await state()).focal - 36.5) < 0.001 && Math.abs(Number(await page.locator('#focal').inputValue()) - 36.5) < 0.001);
await entry('aperture-input', '4.333');
check('typed aperture is applied without snapping', Math.abs((await state()).N - 4.333) < 0.0001);
check('auto shutter is not directly editable', await page.locator('#shutter-input').isDisabled());
await page.click('#mode-m');
await entry('shutter-input', '1/333');
await entry('iso-input', '640');
check('fractional shutter and typed ISO are applied', Math.abs((await state()).shutter - 1 / 333) < 1e-8 && (await state()).iso === 640);
await entry('distance-input', '5');
await entry('focus-input', '3.75');
check('typed focus switches to manual focus', Math.abs((await state()).focusM - 3.75) < 0.01 && !(await state()).afTracksSubject);
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.state === 'error');
let restored = await state();
check('typed focal, aperture, shutter, ISO and focus survive reload', Math.abs(restored.focal - 36.5) < 0.001 && Math.abs(restored.N - 4.333) < 0.0001 && Math.abs(restored.shutter - 1 / 333) < 1e-8 && restored.iso === 640 && Math.abs(restored.focusM - 3.75) < 0.01);
await entry('shutter-input', '1/0');
check('invalid shutter text is rejected with feedback', Math.abs((await state()).shutter - 1 / 333) < 1e-8 && await page.locator('#shutter-input-feedback').isVisible());
await entry('focal-input', '999');
check('out-of-range focal length is clamped with feedback', (await state()).focal === 70 && await page.locator('#focal-input-feedback').isVisible());
await page.click('#mode-a');
await entry('ec-input', '-0.753');
check('typed exposure compensation updates the slider', Math.abs((await state()).ec + 0.753) < 0.0001 && Math.abs(Number(await page.locator('#ec').inputValue()) + 0.753) < 0.0001);
await page.click('#mode-ma');
await page.waitForFunction(() => document.getElementById('iso-input').disabled);
check('auto ISO is not directly editable', await page.locator('#iso-input').isDisabled());
await page.click('#mode-a');
await page.selectOption('#scene-select', 'camp');
await page.waitForFunction(() => window.__lvs.state.sceneId === 'camp' && window.__lvs.state.iso === 3200);
check('scene selector on the picture applies scene defaults', await page.locator('#viewfinder #scene-select').count() === 1 && (await state()).support === 'tripod');
check('no page errors', errors.length === 0, errors.join(' | '));
await context.close(); await browser.close(); server.close();
process.exit(ok ? 0 : 1);
