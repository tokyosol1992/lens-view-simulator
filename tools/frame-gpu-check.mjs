// WebGPU projection and focus interaction with a wider comparison lens.
//   node tools/frame-gpu-check.mjs
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
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.route(/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
const page = await context.newPage(), errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
let ok = true;
const check = (label, cond, detail = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + label + (detail ? ': ' + detail : '')); if (!cond) ok = false; };
const url = 'http://localhost:' + server.address().port + '/?lang=en&q=draft&frames=2&skip=present&dist=6&lens=n50p&cmp1=sony-fe-24mm-f-1-4-gm&cmp2=sony-fe-85mm-f-1-4-gm';
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 600000, polling: 500 });
const shot = await page.evaluate(async () => {
  const state = window.__lvs.state, catalog = await import('/src/catalog.js'), optics = await import('/src/optics.js');
  const candidate = catalog.LENSES.find((item) => item.id === state.frameLenses[0].lensId);
  const effective = optics.framingFocal(candidate, state.frameLenses[0].focal, Math.max(state.focusM, candidate.minFocus));
  return { actual: window.__lvs.renderer.shot.fEff, expected: effective, distance: state.distance };
});
check('WebGPU renders the widest comparison view', Math.abs(shot.actual - shot.expected) < 1e-6, JSON.stringify(shot));
const box = await page.locator('#viewfinder').boundingBox();
await page.mouse.click(box.x + box.width * 0.05, box.y + box.height * 0.5);
await page.waitForTimeout(300);
check('click outside the current lens frame does not move focus', await page.evaluate(() => window.__lvs.state.afTracksSubject));
await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
await page.waitForFunction(() => !window.__lvs.state.afTracksSubject, null, { timeout: 120000 });
check('click inside the current lens frame can set focus', !(await page.evaluate(() => window.__lvs.state.afTracksSubject)));
await page.click('#hold');
await page.waitForTimeout(200);
check('A/B comparison identifies frame lines as belonging to B', await page.evaluate(() => window.__lvs.state.comparing) && /frames for B/.test(await page.locator('#frame-legend').textContent()));
check('frame lines are clipped to the live B side', await page.locator('#frame-lines').evaluate((el) => el.style.clipPath === 'inset(0px 0px 0px 50%)'));
await page.selectOption('#frame-lens-1', 'sony-fe-35mm-f-1-4-gm');
await page.waitForTimeout(200);
check('changing a comparison lens clears the previous A capture', !(await page.evaluate(() => window.__lvs.state.comparing)));
check('leaving A/B restores the full frame outlines', await page.locator('#frame-lines').evaluate((el) => el.style.clipPath === ''));
check('no page errors', errors.length === 0, errors.join(' | '));
await context.close(); await browser.close(); server.close();
process.exit(ok ? 0 : 1);
