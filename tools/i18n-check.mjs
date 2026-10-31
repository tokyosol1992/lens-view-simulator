// Language switch check on desktop and phone widths: every label translates, no raw
// keys leak, the choice persists across reloads and the toggle stays reachable.
//   node tools/i18n-check.mjs [outDir]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(process.env.NODE_PATH || '', 'playwright'))); }
const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = resolve(process.argv[2] || 'shots-i18n');
await mkdir(outDir, { recursive: true });
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  try { const b = await readFile(join(root, path)); res.writeHead(200, { 'content-type': extname(path) === '.js' ? 'text/javascript' : 'text/html' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
let ok = true;
const check = (label, cond, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`); if (!cond) ok = false; };

const snapshot = (page) => page.evaluate(() => ({
  lang: document.documentElement.lang,
  title: document.title,
  labels: [...document.querySelectorAll('[data-i18n]')].map((e) => e.textContent),
  dynamic: ['lens-note', 'scene-note', 'cam-spec', 'focus-src', 'ro-fov-sub', 'ro-dof-sub', 'ro-noise-sub', 'hold', 'status'].map((id) => document.getElementById(id).textContent),
  options: [...document.querySelectorAll('#camera option, #lens option, #wb option, #style option')].map((o) => o.textContent),
  chips: [...document.querySelectorAll('[data-scene]')].map((b) => b.textContent),
}));
const hangul = (s) => /[가-힣]/.test(s);

for (const [name, viewport] of [['desktop', { width: 1280, height: 1500 }], ['phone', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'en-US', hasTouch: name === 'phone', isMobile: name === 'phone' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '?lang=ko&q=draft&frames=2&skip=present');
  await page.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 600000, polling: 500 });
  const ko = await snapshot(page);
  check(`${name}: Korean from ?lang=ko`, ko.lang === 'ko' && ko.title === '렌즈 뷰 시뮬레이터');
  const missing = [...ko.labels, ...ko.dynamic, ...ko.options, ...ko.chips].filter((s) => /\b[a-z]+\.[a-zA-Z]+\b/.test(s) && !/\d/.test(s));
  check(`${name}: no raw keys`, missing.length === 0, missing.join(' | '));
  const untranslated = ko.labels.filter((s) => !hangul(s) && !/^(ISO|EN|한국어|B · .*|ND.*|A)$/.test(s.trim()) && !/^[\d:% .·]+$/.test(s));
  check(`${name}: static labels in Korean`, untranslated.length === 0, untranslated.join(' | '));
  check(`${name}: notes, readouts and lists in Korean`, ko.dynamic.slice(0, 7).every(hangul) && ko.chips.every(hangul) && ko.options.filter(hangul).length >= 20);
  const toggle = await page.locator('#lang-en').boundingBox();
  check(`${name}: toggle visible and tappable`, toggle && toggle.x >= 0 && toggle.x + toggle.width <= viewport.width && toggle.height >= 30, JSON.stringify(toggle));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${name}: no horizontal scroll (Korean)`, overflow <= 0, `overflow ${overflow}px`);
  await page.screenshot({ path: join(outDir, `${name}-ko.png`), fullPage: false });

  const framesBefore = await page.evaluate(() => window.__lvs.renderer.views.main.frame);
  await page.locator('#lang-en').click();
  await page.waitForTimeout(200);
  const en = await snapshot(page);
  check(`${name}: switches to English`, en.lang === 'en' && en.title === 'Lens View Simulator' && !en.labels.some(hangul) && !en.dynamic.some(hangul) && !en.chips.some(hangul));
  const framesAfter = await page.evaluate(() => window.__lvs.renderer.views.main.frame);
  check(`${name}: switching language does not re-render`, framesAfter === framesBefore, `${framesBefore} -> ${framesAfter}`);
  const overflowEn = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${name}: no horizontal scroll (English)`, overflowEn <= 0, `overflow ${overflowEn}px`);
  await page.screenshot({ path: join(outDir, `${name}-en.png`), fullPage: false });

  await page.goto(base + '?q=draft&frames=2&skip=present');
  await page.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 600000, polling: 500 });
  check(`${name}: choice persists after reload`, (await page.evaluate(() => document.documentElement.lang)) === 'en');
  await page.locator('#lang-ko').click();
  await page.waitForTimeout(200);
  await page.click('#hold');
  await page.waitForTimeout(300);
  const holdText = await page.evaluate(() => [document.getElementById('hold').textContent, document.getElementById('clear-hold').textContent]);
  check(`${name}: compare buttons translated`, holdText.every(hangul), holdText.join(' / '));
  check(`${name}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
