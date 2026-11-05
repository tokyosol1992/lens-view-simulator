// Responsive layout check. Needs no GPU: the page builds its controls before it asks for a
// WebGPU device, so the layout can be measured with WebGPU switched off.
//   node tools/layout-check.mjs
// The page loads Pretendard from jsDelivr. To measure with the real font while offline, point
// FONT_DIR at a folder holding pretendardvariable-dynamic-subset.css and woff2-dynamic-subset/ from
// the `pretendard` npm package; requests for those files are then answered from disk.
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

const sizes = [['phone', 390, 844], ['short phone', 360, 640], ['narrow phone', 320, 568], ['tablet', 820, 1100], ['laptop', 1440, 900], ['wide', 1920, 1080]];
const TABS = ['gear', 'location', 'exposure', 'picture', 'results'];
for (const lang of ['en', 'ko']) {
  for (const [name, width, height] of sizes) {
    const phone = width < 600;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone, colorScheme: 'dark' });
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
    if (process.env.FONT_DIR) {
      await ctx.route(/cdn\.jsdelivr\.net\/npm\/pretendard@[^/]+\/dist\/web\/variable\/(.+)$/, async (route) => {
        const file = route.request().url().split('/variable/')[1];
        try { await route.fulfill({ body: await readFile(join(process.env.FONT_DIR, file)), contentType: file.endsWith('.css') ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' } }); }
        catch { await route.abort(); }
      });
    }
    const page = await ctx.newPage();
    const tag = `${name} ${width}px ${lang}`;
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}?lang=${lang}&q=draft`);
    await page.waitForFunction(() => document.body.dataset.state === 'error');
    await page.evaluate(() => document.fonts.ready);
    const wide = width > 980;

    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const over = [...document.querySelectorAll('body *')].filter((e) => !e.closest('.tabs') && e.getBoundingClientRect().right > vw + 0.5 && getComputedStyle(e).position !== 'fixed').map((e) => e.id || e.className).slice(0, 5);
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const bt = r('.brand > span'), te = r('.top-end');
      return {
        vw, sw: document.documentElement.scrollWidth, over,
        collide: bt.right > te.left + 1 && bt.top < te.bottom && bt.bottom > te.top,
        lang: r('#lang-en'), vf: r('#viewfinder'), ctl: r('.controls'), stage: r('.stage'),
        tabsShown: getComputedStyle(document.querySelector('.tabs')).display !== 'none',
        chipShown: getComputedStyle(document.getElementById('hold-chip')).display !== 'none',
        pinned: getComputedStyle(document.querySelector('.dock')).position === 'sticky',
        font: document.fonts.check('600 15px "Pretendard Variable"'),
      };
    });
    check(`${tag}: no horizontal overflow`, m.sw <= m.vw && m.over.length === 0, m.over.join(', ') || `${m.sw} > ${m.vw}`);
    check(`${tag}: name does not run under the status or language switch`, !m.collide);
    check(`${tag}: language switch on screen and tappable`, m.lang.right <= m.vw && m.lang.height >= 28, `right ${m.lang.right.toFixed(0)}, height ${m.lang.height.toFixed(0)}`);
    check(`${tag}: viewfinder is 3:2`, Math.abs(m.vf.width / m.vf.height - 1.5) < 0.02, `${m.vf.width.toFixed(0)}x${m.vf.height.toFixed(0)}`);

    if (wide) {
      const visible = await page.evaluate(() => [...document.querySelectorAll('[data-panel]')].every((p) => p.getBoundingClientRect().height > 0));
      check(`${tag}: all panels show, no tab bar, no phone chip`, visible && !m.tabsShown && !m.chipShown);
      check(`${tag}: settings sit to the right of the picture`, m.ctl.left >= m.stage.right - 1, `controls ${m.ctl.left.toFixed(0)} vs stage ${m.stage.right.toFixed(0)}`);
      check(`${tag}: nothing is pinned`, !m.pinned);
    } else {
      check(`${tag}: tab bar and phone chip show`, m.tabsShown && m.chipShown);
      check(`${tag}: picture, focus scale and tabs are pinned`, m.pinned);
      const tabsFit = await page.evaluate(() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll('.tabs button')].map((b) => b.getBoundingClientRect().right).every((x) => x <= vw + 0.5); });
      if (width >= 360) check(`${tag}: all five tabs are visible without scrolling the tab bar`, tabsFit);
      for (const tab of TABS) {
        await page.click(`#tab-${tab}`);
        const vis = await page.evaluate(() => [...document.querySelectorAll('[data-panel]')].filter((p) => { const r = p.getBoundingClientRect(); return r.height > 4 && getComputedStyle(p).visibility === 'visible'; }).map((p) => p.dataset.panel));
        const expected = tab === 'results' ? ['results'] : [tab];
        check(`${tag}: tab ${tab} shows only its panel`, vis.length === expected.length && vis[0] === expected[0], vis.join(','));
      }
      const loupeW = await page.evaluate(() => document.querySelector('.loupe-frame').clientWidth);
      await page.click('#tab-exposure');
      const loupeHidden = await page.evaluate(() => document.querySelector('.loupe-frame').clientWidth);
      check(`${tag}: loupe keeps its size while its tab is closed`, loupeHidden > 150 && Math.abs(loupeHidden - loupeW) < 2, `${loupeHidden}px (open: ${loupeW}px)`);
      // Scroll the exposure panel (tall) and check that the picture stays put.
      const before = await page.evaluate(() => document.getElementById('viewfinder').getBoundingClientRect().top);
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => ({ top: document.getElementById('viewfinder').getBoundingClientRect().top, dock: document.querySelector('.dock').getBoundingClientRect().height, sy: scrollY, vh: innerHeight }));
      check(`${tag}: picture stays at the top while the panel scrolls`, after.sy > 50 ? Math.abs(after.top) < 1 : true, `scrolled ${after.sy.toFixed(0)}px, picture top ${after.top.toFixed(1)}px (was ${before.toFixed(0)})`);
      check(`${tag}: pinned area leaves room for the settings`, after.dock <= after.vh * (height < 700 ? 0.64 : 0.56), `${after.dock.toFixed(0)} of ${after.vh}px (${(after.dock / after.vh * 100).toFixed(0)}%)`);
    }
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
