// Share link, reset and link-robustness checks. Needs no GPU: the setup is state, not pixels.
//   node tools/share-check.mjs
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
  try { const b = await readFile(join(root, path)); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[extname(path)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let ok = true;
const check = (label, cond, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`); if (!cond) ok = false; };

const open = async (url, { clipboard = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: clipboard ? ['clipboard-read', 'clipboard-write'] : [] });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.state === 'error');
  return { page, ctx, errors };
};
const FIELDS = ['cameraId', 'lensId', 'sceneId', 'mode', 'N', 'nd', 'support', 'keepFraming', 'loupeZoom', 'wb', 'style', 'zebra', 'grid', 'afTracksSubject'];
const read = (page) => page.evaluate((fields) => Object.fromEntries([...fields, 'iso', 'shutter', 'ec', 'distance', 'focusM', 'af', 'focal'].map((k) => [k, window.__lvs.state[k]])), FIELDS);
const near = (a, b, tol) => (Array.isArray(a) ? a.every((v, i) => Math.abs(v - b[i]) <= tol) : Math.abs(a - b) <= tol);

// 1. Round trip: set a setup, copy its link, open it in a fresh page, compare.
const setups = [
  { name: 'manual exposure, manual focus, medium format', set: { cameraId: 'gfx2', lensId: 'gf1102', sceneId: 'street', mode: 'M', N: 4, iso: 1600, shutter: 1 / 60, nd: 3, support: 'handheld', wb: 'tungsten', style: 'vivid', zebra: true, loupeZoom: 4, keepFraming: false, grid: false, afTracksSubject: false, focusM: 12.5, af: [0.31, -0.42], distance: 6 }, compare: ['mode', 'N', 'iso', 'shutter', 'nd', 'support', 'wb', 'style', 'zebra', 'loupeZoom', 'keepFraming', 'grid', 'afTracksSubject', 'focusM', 'af', 'distance'] },
  { name: 'aperture priority with compensation, zoom lens', set: { cameraId: 'a7m4', lensId: 'z2470', sceneId: 'lake', mode: 'A', N: 5.6, iso: 200, ec: -0.667, focal: 50, support: 'tripod' }, compare: ['mode', 'N', 'iso', 'ec', 'focal', 'support'] },
  { name: 'manual with auto ISO', set: { cameraId: 'xt5', lensId: 'xf2314', sceneId: 'garden', mode: 'MA', N: 2, shutter: 1 / 500, ec: 0.333 }, compare: ['mode', 'N', 'shutter', 'ec'] },
  // Opened on the night scene itself so its suggested exposure (ISO 3200, tripod) is what gets shared.
  { name: 'the night scene with its suggested exposure', start: '?scene=camp&camera=z8&lens=sel14gm&q=draft', set: { N: 1.8 }, expect: { iso: 3200, support: 'tripod' }, compare: ['mode', 'N', 'iso', 'support'] },
];
for (const s of setups) {
  const { page, ctx, errors } = await open(base + (s.start || '?q=draft'));
  await page.evaluate((set) => { Object.assign(window.__lvs.state, set); window.__lvs.update(); }, s.set);
  const before = await read(page);
  if (s.expect) check(`round trip: starting point is what the scene suggests (${s.name})`, Object.entries(s.expect).every(([k, v]) => before[k] === v), JSON.stringify([before.iso, before.support]));
  const url = await page.evaluate(() => window.__lvs.shareURL());
  const second = await open(url);
  const after = await read(second.page);
  const diffs = [...FIELDS.filter((k) => ['cameraId', 'lensId', 'sceneId'].includes(k)), ...s.compare].filter((k) => !(typeof before[k] === 'number' || Array.isArray(before[k]) ? near(before[k], after[k], 0.02 * Math.max(1, Math.abs(Array.isArray(before[k]) ? 1 : before[k]))) : before[k] === after[k]));
  check(`round trip: ${s.name}`, diffs.length === 0, diffs.length ? diffs.map((k) => `${k} ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`).join('; ') : url.split('?')[1].slice(0, 90));
  check(`round trip: no page errors (${s.name})`, errors.length === 0 && second.errors.length === 0, [...errors, ...second.errors].join(' | '));
  await ctx.close(); await second.ctx.close();
}

// 2. A link that names things this version does not have still opens, with defaults.
{
  const { page, ctx, errors } = await open(base + '?camera=nope&lens=gone&scene=missing&wb=x&style=y&zoom=3&q=draft');
  const s = await read(page);
  check('unknown ids and values fall back to defaults', s.cameraId === 'ff24' && s.lensId === 'n50p' && s.sceneId === 'garden' && s.wb === 'auto' && s.style === 'standard' && s.loupeZoom === 1, JSON.stringify([s.cameraId, s.lensId, s.sceneId, s.wb, s.style, s.loupeZoom]));
  check('and the page does not fail', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 3. The button copies the link and says so; it works when the clipboard API is refused too.
{
  const { page, ctx, errors } = await open(base + '?scene=lake&q=draft', { clipboard: true });
  await page.click('#share');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const expected = await page.evaluate(() => window.__lvs.shareURL());
  check('Copy link puts the link on the clipboard', copied === expected, copied.slice(0, 80));
  check('and the button confirms it', /copied|복사했어요/i.test(await page.textContent('#share')), await page.textContent('#share'));
  await ctx.close();
  const b = await open(base + '?lang=ko&q=draft');
  await b.page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('refused')) }, configurable: true }));
  await b.page.click('#share');
  const label = await b.page.textContent('#share');
  check('with the clipboard API refused it still answers, in Korean', /복사/.test(label), label);
  check('no page errors', errors.length === 0 && b.errors.length === 0, [...errors, ...b.errors].join(' | '));
  await b.ctx.close();
}

// 4. Reset goes back to the starting settings and keeps the gear, the location and the night scene's suggestion.
{
  const { page, ctx, errors } = await open(base + '?camera=r5&lens=sig3514&scene=camp&q=draft');
  await page.evaluate(() => { Object.assign(window.__lvs.state, { mode: 'M', ec: 1, iso: 800, nd: 6, support: 'handheld', wb: 'led', style: 'mono', zebra: true, loupeZoom: 4, grid: false, keepFraming: false, afTracksSubject: false, focusM: 9, N: 8 }); window.__lvs.update(); });
  await page.click('#reset');
  await page.waitForTimeout(150);
  const s = await read(page);
  check('reset restores exposure, focus and picture settings', s.mode === 'A' && s.ec === 0 && s.nd === 0 && s.wb === 'auto' && s.style === 'standard' && !s.zebra && s.loupeZoom === 1 && s.grid && s.keepFraming && s.afTracksSubject, JSON.stringify(s));
  check('reset keeps camera, lens and location, and the night scene suggestion', s.cameraId === 'r5' && s.lensId === 'sig3514' && s.sceneId === 'camp' && s.iso === 3200 && s.support === 'tripod' && s.N === 1.4, JSON.stringify([s.cameraId, s.lensId, s.sceneId, s.iso, s.support, s.N]));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
