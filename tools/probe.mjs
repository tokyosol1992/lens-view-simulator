// Debug helper: loads the page and prints statistics of intermediate GPU textures.
//   node tools/probe.mjs "scene=street&q=draft"
// The read-back runs from a page <script> (GPU objects made by the app cannot be
// mapped from Playwright's evaluate context in headless Chromium).
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
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 400)); });
await page.goto(`http://localhost:${server.address().port}/?${process.argv[2] || 'q=draft'}`);
await page.waitForFunction(() => document.body.dataset.state === 'ready' || document.body.dataset.state === 'error', null, { timeout: 600000, polling: 500 });
await page.addScriptTag({ content: `(async () => {
  const r = window.__lvs.renderer;
  const d = r.device;
  const half = (u) => { const s = (u & 0x8000) ? -1 : 1, ex = (u >> 10) & 31, m = u & 1023; return ex === 0 ? s * m * 2 ** -24 : ex === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (ex - 15); };
  const stats = async (tex, label) => {
    const w = tex.width, h = tex.height, fmt = tex.format;
    const bpp = fmt === 'rgba16float' ? 8 : 4;
    const bpr = Math.ceil(w * bpp / 256) * 256;
    const buf = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const e = d.createCommandEncoder();
    e.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    d.queue.submit([e.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const raw = buf.getMappedRange();
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9], sum = [0, 0, 0], n = 0, nan = 0;
    for (let y = 0; y < h; y += Math.max(1, h >> 6)) for (let x = 0; x < w; x += Math.max(1, w >> 6)) {
      let v;
      if (fmt === 'rgba16float') { const u = new Uint16Array(raw, y * bpr + x * 8, 4); v = [half(u[0]), half(u[1]), half(u[2])]; }
      else if (fmt === 'r32float') { const f = new Float32Array(raw, y * bpr + x * 4, 1)[0]; v = [f, f, f]; }
      else { const u = new Uint8Array(raw, y * bpr + x * 4, 4); v = [u[0] / 255, u[1] / 255, u[2] / 255]; }
      if (v.some(Number.isNaN)) { nan++; continue; }
      for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], v[c]); max[c] = Math.max(max[c], v[c]); sum[c] += v[c]; }
      n++;
    }
    buf.unmap(); buf.destroy();
    const f = (a) => a.map((x) => x.toPrecision(3)).join(',');
    return label + ' ' + w + 'x' + h + ' ' + fmt + ': min ' + f(min) + ' max ' + f(max) + ' mean ' + f(sum.map((s) => s / n)) + ' nan ' + nan;
  };
  const m = r.views.main, l = r.views.loupe;
  const res = ['frames main ' + m.frame + '/' + m.target + ' loupe ' + l.frame + '/' + l.target, 'errors: ' + r.errors.join(' | ')];
  for (const [k, t] of [['color', m.color], ['depth', m.depthLin], ['dof', m.dof], ['avg', m.avg], ['lens', m.lens], ['raw', m.raw], ['frame', m.frameTex], ['lcolor', l.color], ['lavg', l.avg], ['lraw', l.raw], ['ldem', l.dem], ['lframe', l.frameTex]]) res.push(await stats(t, k));
  const s = r.shot;
  res.push(JSON.stringify({ m: s.m, iso: s.iso, t: s.t, N: s.N, focus: s.focusM, fEff: s.fEff, wb: s.wb }));
  window.__probe = res.join('\\n');
})().catch((e) => { window.__probe = 'probe error ' + e.message; });` });
await page.waitForFunction(() => window.__probe, null, { timeout: 120000 });
console.log(await page.evaluate(() => window.__probe));
await browser.close(); server.close();
