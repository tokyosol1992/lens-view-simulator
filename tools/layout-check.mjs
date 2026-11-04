// Responsive layout check. Needs no GPU: the page builds its controls before it asks for a
// WebGPU device, so the layout can be measured with WebGPU switched off.
//   node tools/layout-check.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(join(process.env.NODE_PATH || '', 'playwright'))); }
const root = resolve(new URL('..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  try { const b = await readFile(join(root, path)); res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let ok = true;
const check = (label, cond, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`); if (!cond) ok = false; };

const sizes = [['phone', 390, 844], ['phone small', 320, 640], ['tablet', 820, 1100], ['laptop', 1440, 900], ['wide', 1920, 1080]];
for (const lang of ['en', 'ko']) {
  for (const [name, width, height] of sizes) {
    const phone = width < 600;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
    const page = await ctx.newPage();
    const tag = `${name} ${width}px ${lang}`;
    await page.goto(`${base}?lang=${lang}&q=draft`);
    await page.waitForFunction(() => document.body.dataset.state === 'error');
    await page.evaluate(() => document.fonts.ready);

    const wide = width > 980;
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const over = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > vw + 0.5 && getComputedStyle(e).position !== 'fixed').map((e) => e.id || e.className).slice(0, 5);
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const bt = document.querySelector('.brand > span').getBoundingClientRect(), te = document.querySelector('.top-end').getBoundingClientRect();
      const collide = bt.right > te.left + 1 && bt.top < te.bottom && bt.bottom > te.top;
      return { collide, vw, sw: document.documentElement.scrollWidth, over, vf: box('#viewfinder'), ctl: box('.controls'), hold: box('#hold'), lang: box('#lang-en'), status: box('#status') };
    });
    check(`${tag}: no horizontal overflow`, m.sw <= m.vw && m.over.length === 0, m.over.join(', ') || `${m.sw} > ${m.vw}`);
    check(`${tag}: name does not run under the status or language switch`, !m.collide);
    check(`${tag}: header controls on screen`, m.lang.right <= m.vw && m.hold.right <= m.vw && m.lang.height >= 30, `lang right ${m.lang.right.toFixed(0)}, hold right ${m.hold.right.toFixed(0)}`);
    check(`${tag}: viewfinder is 3:2 and at least 280px wide`, Math.abs(m.vf.width / m.vf.height - 1.5) < 0.02 && m.vf.width >= 280, `${m.vf.width.toFixed(0)}x${m.vf.height.toFixed(0)}`);

    await page.evaluate((y) => window.scrollTo(0, y), wide ? 150 : 700);
    await page.waitForTimeout(100);
    const s = await page.evaluate(() => {
      const vf = document.querySelector('#viewfinder').getBoundingClientRect();
      const c = document.querySelector('.controls');
      const r = c.getBoundingClientRect();
      return { vfTop: vf.top, vfH: vf.height, ctlTop: r.top, ctlBottom: r.bottom, ctlScrolls: c.scrollHeight > c.clientHeight + 4, vh: innerHeight, vfBelowCtl: vf.bottom <= r.top + 1 };
    });
    if (wide) {
      check(`${tag}: settings column stays in view while the page scrolls`, s.ctlTop >= 0 && s.ctlTop <= 20 && s.ctlBottom <= s.vh, `top ${s.ctlTop.toFixed(0)}, bottom ${s.ctlBottom.toFixed(0)} of ${s.vh}`);
      if (height <= 900) check(`${tag}: settings column scrolls on its own when taller than the window`, s.ctlScrolls);
    } else {
      check(`${tag}: viewfinder stays pinned to the top while scrolling`, Math.abs(s.vfTop) < 1, `top ${s.vfTop.toFixed(1)}`);
      check(`${tag}: pinned viewfinder leaves most of the screen to the dials`, s.vfH <= s.vh * 0.5, `${s.vfH.toFixed(0)} of ${s.vh}px`);
    }
    await ctx.close();
  }
}
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
