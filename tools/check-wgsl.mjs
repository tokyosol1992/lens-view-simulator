// Compiles every WGSL module in a headless browser and prints all errors.
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
const page = await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/tools/blank.html`).catch(() => {});
const out = await page.evaluate(async () => {
  const scene = await import('/src/gpu/shaders-scene.js');
  const post = await import('/src/gpu/shaders-post.js');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const mods = { scene: scene.SCENE_WGSL, ...Object.fromEntries(Object.entries(post)) };
  const res = [];
  for (const [k, code] of Object.entries(mods)) {
    const m = device.createShaderModule({ code });
    const info = await m.getCompilationInfo();
    for (const msg of info.messages) res.push(`${k}:${msg.lineNum}:${msg.linePos} [${msg.type}] ${msg.message}\n    ${code.split('\n')[msg.lineNum - 1]?.trim()}`);
  }
  return res;
});
console.log(out.length ? out.join('\n') : 'all shaders compiled');
await browser.close(); server.close();
