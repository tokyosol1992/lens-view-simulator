// Usage-flow check: setup survives reload through the address, quick starts and reset work,
// the lens list flags lenses that do not cover the body, Copy link produces a clean link, and
// on a phone the picture stays pinned while the settings scroll.   node tools/flow-check.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(process.env.NODE_PATH || '', 'playwright'))); }
const root = resolve(new URL('..', import.meta.url).pathname);
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (path.endsWith('/')) path += 'index.html';
  try { const b = await readFile(join(root, path)); res.writeHead(200, { 'content-type': extname(path) === '.js' ? 'text/javascript' : 'text/html' }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
let ok = true;
const check = (label, cond, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`); if (!cond) ok = false; };
const ready = (page) => page.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 600000, polling: 300 });
const q = 'q=draft&frames=2&skip=present&lang=en';

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}?${q}&camera=apsc26&lens=ac56&scene=street&f=2&mode=M&t=1/60&iso=1600&support=handheld`, { waitUntil: 'domcontentloaded' });
await ready(page);
let s = await page.evaluate(() => ({ ...window.__lvs.state, held: null }));
check('link opens the shared setup', s.cameraId === 'apsc26' && s.lensId === 'ac56' && s.sceneId === 'street' && s.mode === 'M' && s.iso === 1600 && s.support === 'handheld' && Math.abs(s.shutter - 1 / 60) < 1e-9);
await page.selectOption('#camera', 'cine');
await page.waitForTimeout(500);
const lensOpts = await page.evaluate(() => [...document.querySelectorAll('#lens option')].map((o) => [o.value, /dark corners/.test(o.textContent)]));
check('lens list flags lenses that do not cover the body', lensOpts.find((o) => o[0] === 'mt25')[1] === true && lensOpts.find((o) => o[0] === 'c35')[1] === false);
check('lens list is grouped', (await page.locator('#lens optgroup').count()) >= 6 && (await page.locator('#camera optgroup').count()) >= 5);
check('cinema body starts at its base ISO', (await page.evaluate(() => window.__lvs.state.iso)) >= 800);
await page.selectOption('#lens', 'c35');
await page.waitForTimeout(600);
const search = await page.evaluate(() => location.search);
check('setup is kept in the address', /camera=cine/.test(search) && /lens=c35/.test(search) && /scene=street/.test(search), search);
await page.reload(); await ready(page);
s = await page.evaluate(() => window.__lvs.state);
check('reload restores the setup', s.cameraId === 'cine' && s.lensId === 'c35' && s.sceneId === 'street');

await page.click('#copy-link');
await page.waitForTimeout(300);
const link = await page.evaluate(() => navigator.clipboard.readText());
check('Copy link gives a clean shareable link', /camera=cine/.test(link) && !/skip=|frames=|lang=/.test(link), link);
check('Copy link confirms', /copied/i.test(await page.textContent('#copy-link')));

await page.click('#preset-bokeh'); await ready(page);
s = await page.evaluate(() => window.__lvs.state);
check('quick start applies the whole setup', s.cameraId === 'ff24' && s.lensId === 'p85' && s.sceneId === 'garden' && Math.abs(s.N - 1.4) < 0.05);
check('quick start explains what to look at', /^Look for:/.test(await page.textContent('#preset-look')));
await page.click('#hold'); await page.waitForTimeout(300);
await page.click('#preset-phone'); await ready(page);
check('quick start clears a held comparison', !(await page.evaluate(() => window.__lvs.state.comparing)));
await page.click('#reset'); await ready(page);
s = await page.evaluate(() => window.__lvs.state);
check('reset returns to the default setup', s.cameraId === 'ff24' && s.lensId === 'n50p' && s.sceneId === 'garden' && s.mode === 'A');
check('no page errors (desktop)', errors.length === 0, errors.join(' | '));

const side = await page.evaluate(() => { const c = document.querySelector('.controls'); return getComputedStyle(c).position; });
check('settings column stays in view on wide screens', side === 'sticky', side);
await ctx.close();

await browser.close();
// A fresh browser for the phone run: SwiftShader stalls when a second page follows a busy one.
const browser2 = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
const mctx = await browser2.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await mctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const mp = await mctx.newPage();
await mp.goto(`${base}?${q}`, { waitUntil: 'domcontentloaded' }); await ready(mp);
await mp.evaluate(() => window.scrollTo(0, 1200)); await mp.waitForTimeout(300);
const vf = await mp.locator('#viewfinder').boundingBox();
check('phone: picture stays pinned while settings scroll', vf.y >= -1 && vf.y < 4 && vf.height <= 844 * 0.4, JSON.stringify(vf));
const order = await mp.evaluate(() => ['viewfinder', 'hold', 'camera', 'loupe'].map((id) => document.getElementById(id).getBoundingClientRect().top + scrollY));
check('phone: gear comes before loupe and results', order[2] < order[3], order.map(Math.round).join(' < '));
check('phone: no horizontal scroll', (await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
await browser2.close(); server.close();
process.exit(ok ? 0 : 1);
