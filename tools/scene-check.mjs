// Scene checks. Needs no GPU: scenes are built in Node, and the starting-exposure behaviour is checked
// in headless Chromium with WebGPU switched off.
//   node tools/scene-check.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { SCENE_LIST, getScene } from '../src/scenes.js';

let ok = true;
const check = (label, cond, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`); if (!cond) ok = false; };

for (const entry of SCENE_LIST) {
  const sc = getScene(entry.id);
  const finite = (v) => v.every((x) => Number.isFinite(x));
  check(`${entry.id}: builds with instances and finite data`, sc.built.count > 0 && sc.built.data.every(Number.isFinite));
  check(`${entry.id}: at most 48 lights (the shader's limit)`, sc.lights.length <= 48, `${sc.lights.length}`);
  check(`${entry.id}: English and Korean name and blurb`, !!(sc.name && sc.blurb && sc.ko?.name && sc.ko?.blurb && entry.ko?.name));
  check(`${entry.id}: camera, sun and sky are complete`, finite(sc.camera.subject) && finite(sc.camera.dir) && finite(sc.camera.frame) && finite(sc.sun.dir) && finite(sc.sky.zenith) && Number.isFinite(sc.ev100));
  check(`${entry.id}: default distance sits inside its range`, sc.camera.distance >= sc.camera.min && sc.camera.distance <= sc.camera.max);
}
check('scene ids are unique', new Set(SCENE_LIST.map((s) => s.id)).size === SCENE_LIST.length);

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
const open = async (query) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + query);
  await page.waitForFunction(() => document.body.dataset.state === 'error');
  return { page, ctx, errors };
};
const exposure = (page) => page.evaluate(() => ({ iso: window.__lvs.state.iso, support: window.__lvs.state.support, t: window.__lvs.state.shutter, scene: window.__lvs.state.sceneId }));

{
  const { page, ctx, errors } = await open('?q=draft');
  const chips = await page.evaluate(() => [...document.querySelectorAll('[data-scene]')].map((b) => b.dataset.scene));
  check('a button for every scene', JSON.stringify(chips) === JSON.stringify(SCENE_LIST.map((s) => s.id)), chips.join(','));
  let e = await exposure(page);
  check('daylight scene starts at ISO 100 and stabilised handheld', e.iso === 100 && e.support === 'stabilized', JSON.stringify(e));
  await page.click('#scene-camp');
  e = await exposure(page);
  check('the night scene suggests ISO 3200 on a tripod', e.iso === 3200 && e.support === 'tripod', JSON.stringify(e));
  check('and the auto shutter is a long exposure but within the 30 s limit', e.t > 0.5 && e.t <= 30, `${e.t.toFixed(2)} s`);
  await page.click('#scene-lake');
  e = await exposure(page);
  check('going back to daylight restores ISO and support', e.iso === 100 && e.support === 'stabilized', JSON.stringify(e));
  await page.click('#scene-street'); await page.click('#scene-garden');
  e = await exposure(page);
  check('scenes without a suggestion leave the settings alone', e.iso === 100 && e.support === 'stabilized');
  check('no page errors while switching', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  const { page, ctx, errors } = await open('?scene=camp&q=draft');
  const e = await exposure(page);
  check('a link to the night scene starts with its suggestion', e.scene === 'camp' && e.iso === 3200 && e.support === 'tripod', JSON.stringify(e));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  const { page, ctx } = await open('?scene=camp&iso=800&support=handheld&q=draft');
  const e = await exposure(page);
  check('settings in the link win over the suggestion', e.iso === 800 && e.support === 'handheld', JSON.stringify(e));
  await ctx.close();
}
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
