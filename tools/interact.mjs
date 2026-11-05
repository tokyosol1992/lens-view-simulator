// Interaction check: click-to-focus moves the focus plane and the A/B hold captures a frame.
//   node tools/interact.mjs
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
  try { const b = await readFile(join(root, path)); res.writeHead(200, { 'content-type': extname(path) === '.js' ? 'text/javascript' : 'text/html' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1500 } });
const errors = [];
// Font hosts can be unreachable (offline, locked-down network): the page falls back to system fonts, so that is not an app error.
const FONT_HOSTS = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
page.on('console', (m) => { if (m.type() === 'error' && !FONT_HOSTS.test(m.location().url || '')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${server.address().port}/?scene=garden&q=draft&frames=4&skip=present`);
const ready = () => page.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 600000, polling: 500 });
await ready();
let ok = true;
const check = (label, cond, detail) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`); if (!cond) ok = false; };

const before = await page.evaluate(() => window.__lvs.state.focusM);
const box = await page.locator('#viewfinder').boundingBox();
// Upper right of the frame: hedge and trees behind the bench.
await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.12);
await page.waitForFunction((b) => Math.abs(window.__lvs.state.focusM - b) > 0.5, before, { timeout: 120000 }).catch(() => {});
const after = await page.evaluate(() => ({ f: window.__lvs.state.focusM, tracks: window.__lvs.state.afTracksSubject, label: document.getElementById('focus-val').textContent, src: document.getElementById('focus-src').textContent }));
check('click on background moves focus farther', after.f > before + 1, `${before.toFixed(2)} m -> ${after.f.toFixed(2)} m (${after.label}, ${after.src})`);
check('AF stops tracking the subject', after.tracks === false);
await ready();

await page.click('#hold');
await page.waitForTimeout(500);
const held = await page.evaluate(() => ({ comparing: window.__lvs.state.comparing, snap: window.__lvs.renderer.views.main.hasSnap, split: getComputedStyle(document.getElementById('split')).display, label: document.getElementById('held-desc').textContent }));
check('hold A captures the frame', held.comparing && held.snap, JSON.stringify(held));
const live = await page.evaluate(() => document.getElementById('live-desc').textContent);
check('B label shows the live setup', /f\/\d/.test(live) && /ISO \d+/.test(live), live);
const split0 = await page.evaluate(() => window.__lvs.state.split);
await page.focus('#split');
await page.keyboard.press('ArrowLeft');
const split1 = await page.evaluate(() => window.__lvs.state.split);
check('divider moves with the arrow keys', split1 < split0 - 0.01 && split1 >= 0, `${split0} -> ${split1}`);
await page.keyboard.press('Home');
check('Home puts the divider at the left edge', (await page.evaluate(() => window.__lvs.state.split)) === 0);
// B follows the live settings while A keeps the held ones.
const heldDesc = await page.evaluate(() => document.getElementById('held-desc').textContent);
await page.$eval('#aperture', (el) => { el.value = String(Math.min(+el.max, +el.value + 4)); el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForFunction((h) => document.getElementById('live-desc').textContent !== h, heldDesc, { timeout: 60000 }).catch(() => {});
const labels = await page.evaluate(() => ({ live: document.getElementById('live-desc').textContent, held: document.getElementById('held-desc').textContent }));
check('after a change B differs from A and A keeps the held setting', labels.live !== heldDesc && labels.held === heldDesc, `A: ${labels.held} | B: ${labels.live}`);
await page.click('#refocus');
await page.waitForTimeout(300);
const re = await page.evaluate(() => ({ f: window.__lvs.state.focusM, tracks: window.__lvs.state.afTracksSubject }));
check('focus on subject restores tracking', re.tracks && re.f < 3, re.f.toFixed(2) + ' m');
await page.click('#clear-hold');
const cleared = await page.evaluate(() => window.__lvs.state.comparing);
check('stop comparing', cleared === false);
await page.click('#lens'); await page.selectOption('#lens', 'z70200');
await page.waitForTimeout(300);
const zoom = await page.evaluate(() => ({ hidden: document.getElementById('focal-row').hidden, focal: window.__lvs.state.focal, dist: window.__lvs.state.distance }));
check('zoom lens shows focal slider', zoom.hidden === false, JSON.stringify(zoom));
check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
