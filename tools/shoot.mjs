// Headless render check: serves the page, renders a list of setups with WebGPU
// (SwiftShader in CI containers) and saves screenshots plus console errors.
//   node tools/shoot.mjs [outDir] [setup ...]
// A setup is a query string, e.g. "scene=street&lens=p85&q=draft".
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(process.env.NODE_PATH || '', 'playwright'))); }

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = resolve(process.argv[2] || 'shots');
const setups = process.argv.slice(3);
if (!setups.length) setups.push('q=draft');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
const report = [];
for (const [i, q] of setups.entries()) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/?${q}&skip=present`);
  try {
    await page.waitForFunction(() => document.body.dataset.state === 'ready' || document.body.dataset.state === 'error', null, { timeout: 600000, polling: 500 });
  } catch (e) { errors.push('timeout: ' + e.message); }
  // Optional follow-up actions encoded as "&do=..." are evaluated in the page.
  const act = new URLSearchParams(q).get('do');
  if (act) {
    await page.evaluate(act);
    await page.waitForTimeout(300);
    await page.waitForFunction(() => document.body.dataset.state === 'ready', null, { timeout: 600000, polling: 500 }).catch(() => {});
  }
  // Headless Chromium here cannot present WebGPU canvases, so the frames are read
  // back from the GPU and laid over the canvases as images before the screenshot.
  await page.addScriptTag({ content: `(async () => {
    try {
      const r = window.__lvs.renderer;
      for (const [kind, id] of [['main', 'view'], ['loupe', 'loupe']]) {
        const f = await r.readFrame(kind);
        const c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
        c.getContext('2d').putImageData(new ImageData(f.rgba, f.w, f.h), 0, 0);
        const img = document.createElement('img'); img.src = c.toDataURL();
        const cv = document.getElementById(id);
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated';
        cv.after(img);
        await img.decode();
      }
      window.__overlay = 'done';
    } catch (e) { window.__overlay = 'error ' + e.message; }
  })();` });
  await page.waitForFunction(() => window.__overlay, null, { timeout: 900000, polling: 1000 });
  const overlay = await page.evaluate(() => window.__overlay);
  if (overlay !== 'done') errors.push('overlay: ' + overlay);
  const ms = Date.now() - t0;
  const name = String(i).padStart(2, '0') + '-' + q.replace(/[^a-z0-9=&.]+/gi, '_').replace(/[=&]/g, '-').slice(0, 80);
  await page.screenshot({ path: join(outDir, name + '-page.png') });
  await page.locator('#viewfinder').screenshot({ path: join(outDir, name + '-view.png') });
  await page.locator('.loupe-frame').screenshot({ path: join(outDir, name + '-loupe.png') });
  const status = await page.evaluate(() => document.getElementById('status').textContent);
  report.push({ setup: q, ms, status, errors });
  console.log(`${name}: ${status} in ${ms} ms${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
  await page.close();
}
await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.close();
