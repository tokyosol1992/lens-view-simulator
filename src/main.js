import { CAMERAS, LENSES, CAMERA_GROUPS, LENS_GROUPS, BRANDS, FORMATS, APERTURES, SHUTTERS, ISOS, WHITE_BALANCE, STYLES } from './catalog.js';
import { PRESETS } from './presets.js';
import * as O from './optics.js';
import { getScene, SCENE_LIST } from './scenes.js';
import { Renderer, cameraBasis } from './gpu/renderer.js?v=20261109-2';
import { t, loc, getLang, setLang, applyStatic } from './i18n.js?v=20261109-2';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const QUALITY = {
  draft: { scale: 0.6, cap: 1100, samples: 40, frames: 12, loupeFrames: 20 },
  standard: { scale: 1, cap: 1800, samples: 64, frames: 24, loupeFrames: 32 },
  high: { scale: 1, cap: 2400, samples: 96, frames: 48, loupeFrames: 64 },
};

function parseShutter(text) {
  const match = String(text).trim().match(/^(\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*(\d+(?:\.\d+)?|\.\d+))?\s*(?:s|sec|초|″|")?$/i);
  if (!match) return null;
  const numerator = Number(match[1]), denominator = match[2] ? Number(match[2]) : 1;
  const seconds = numerator / denominator;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function frameSlot(params, index) {
  const selected = LENSES.find((item) => item.id === params.get('cmp' + index));
  if (!selected) return { lensId: '', focal: null };
  const requested = parseFloat(params.get('cmp' + index + 'f'));
  const focal = Number.isFinite(requested) ? requested : selected.focal[0];
  return { lensId: selected.id, focal: Math.min(selected.focal[1], Math.max(selected.focal[0], focal)) };
}

// Setups can be linked: ?camera=ff45&lens=p85&scene=street&f=1.4&t=1/60&iso=3200&mode=M
function makeState(params) {
  const num = (k) => { const v = params.has(k) ? parseFloat(params.get(k)) : NaN; return Number.isFinite(v) ? v : null; };
  const st = {
    cameraId: CAMERAS.some((c) => c.id === params.get('camera')) ? params.get('camera') : 'ff24',
    lensId: LENSES.some((l) => l.id === params.get('lens')) ? params.get('lens') : 'n50p',
    sceneId: SCENE_LIST.some((x) => x.id === params.get('scene')) ? params.get('scene') : 'garden',
    focal: 50, N: 1.2, mode: 'A', ec: 0,
    shutter: 1 / 250, iso: 100,
    support: 'stabilized', nd: 0,
    distance: null, keepFraming: true,
    focusM: 2, afTracksSubject: true, af: [0, 0],
    wb: 'auto', style: 'standard', zebra: false,
    loupeZoom: 1, grid: true,
    quality: params.get('q') || 'standard',
    split: 0.5, comparing: false, held: null,
    frameLenses: [frameSlot(params, 1), frameSlot(params, 2)],
  };
  Object.assign(st, getScene(st.sceneId).defaults || {});
  if (num('f') != null) st.N = num('f');
  if (num('focal') != null) st.focal = num('focal');
  if (['A', 'M', 'MA'].includes(params.get('mode'))) st.mode = params.get('mode');
  if (params.has('t')) st.shutter = parseShutter(params.get('t')) ?? st.shutter;
  if (num('iso') != null) st.iso = num('iso');
  if (num('ec') != null) st.ec = num('ec');
  if (num('nd') != null) st.nd = num('nd');
  if (['tripod', 'stabilized', 'handheld'].includes(params.get('support'))) st.support = params.get('support');
  if (num('dist') != null) st.distance = num('dist');
  if (params.get('keep') === '0') st.keepFraming = false;
  if (num('zoom') != null) st.loupeZoom = num('zoom');
  if (![1, 2, 4].includes(st.loupeZoom)) st.loupeZoom = 1;
  if (params.get('zebra') === '1') st.zebra = true;
  if (params.get('grid') === '0') st.grid = false;
  if (num('focus') != null) { st.focusM = num('focus'); st.afTracksSubject = false; }
  if (params.has('af')) {
    const point = params.get('af').split(',').map(parseFloat);
    if (point.length === 2 && point.every(Number.isFinite)) st.af = point;
  }
  if (WHITE_BALANCE.some((w) => w.id === params.get('wb'))) st.wb = params.get('wb');
  if (STYLES.some((x) => x.id === params.get('style'))) st.style = params.get('style');
  return st;
}
const state = makeState(params);

let renderer = null;
let shot = null;
let lastFEq = null;
let lastUI = null;
let frameGeometry = null;
let frameControlsInitialized = false;

const norm3 = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const camera = () => CAMERAS.find((c) => c.id === state.cameraId);
const lens = () => LENSES.find((l) => l.id === state.lensId);
const scene = () => getScene(state.sceneId);
const comparisonLens = (slot) => LENSES.find((item) => item.id === slot.lensId);

function compareGeometry(res) {
  const entries = state.frameLenses.map((slot) => {
    const selected = comparisonLens(slot);
    if (!selected) return null;
    const focus = Math.max(res.focusM, selected.minFocus);
    return { lens: selected, focal: slot.focal, effective: O.framingFocal(selected, slot.focal, focus) };
  });
  return { primary: res.fEff, wide: Math.min(res.fEff, ...entries.filter(Boolean).map((entry) => entry.effective)), entries };
}
const previewScale = () => frameGeometry ? frameGeometry.wide / frameGeometry.primary : 1;

// A link can name something this version does not have (a removed product, a typo): fall back rather than fail.
if (!CAMERAS.some((c) => c.id === state.cameraId)) state.cameraId = 'ff24';
if (!LENSES.some((l) => l.id === state.lensId)) state.lensId = 'n50p';
if (!SCENE_LIST.some((s) => s.id === state.sceneId)) state.sceneId = 'garden';
if (!WHITE_BALANCE.some((w) => w.id === state.wb)) state.wb = 'auto';
if (!STYLES.some((s) => s.id === state.style)) state.style = 'standard';
if (![1, 2, 4].includes(state.loupeZoom)) state.loupeZoom = 1;

// A scene can suggest a starting exposure (the night campsite needs ISO 3200 on a tripod). Leaving such a
// scene puts ISO and support back, so a daylight scene never inherits it. Link parameters win at load.
const SCENE_BASE = { iso: 100, support: 'stabilized' };
function applySceneDefaults(prev, next) {
  if (prev?.defaults || next.defaults) Object.assign(state, SCENE_BASE, next.defaults || {});
}

// --- Formatting -----------------------------------------------------------------------
const fmtN = (n) => String(+n.toFixed(3));
function fmtShutter(t) {
  if (t < 0.3) {
    const denominator = Math.round(1 / t);
    if (Math.abs(t - 1 / denominator) / t < 0.001) return '1/' + denominator;
  }
  return shutterParam(t) + '″';
}
function fmtDist(m) {
  if (!isFinite(m) || m > 5000) return '∞';
  if (m < 1) return Math.round(m * 100) + ' cm';
  if (m < 10) return m.toFixed(2) + ' m';
  return m.toFixed(m < 100 ? 1 : 0) + ' m';
}
const fmtEV = (e) => {
  const value = Math.abs(e).toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0');
  return (e >= 0 ? '+' : '−') + value;
};
const fmtInput = (n) => String(+Number(n).toFixed(3));
const fmtMetres = (n) => Number(n).toFixed(2);

// --- Populate controls (re-run when the language changes) ---------------------------------
function fillSelect(el, items, value, groups, label = loc) {
  const opt = (it) => `<option value="${it.id}">${label(it)}</option>`;
  el.innerHTML = groups
    ? groups.map((g) => {
      const members = items.filter((it) => it.group === g.id);
      return members.length ? `<optgroup label="${loc(g)}">${members.map(opt).join('')}</optgroup>` : '';
    }).join('')
    : items.map(opt).join('');
  el.value = value;
}
// --- Lens browser: brand and sensor-fit filters ----------------
const ui = { brand: 'all', fits: false };
// Equivalent field of view depends on the selected camera, not the lens's native format.
const eqRange = (l) => { const c = O.cropFactor(camera()); return [l.focal[0] * c, l.focal[1] * c]; };
function lensMatches(l) {
  return (!l.legacy || l.id === state.lensId) && (ui.brand === 'all' || l.brand === ui.brand)
    && (!ui.fits || O.lensCovers(l, camera()));
}
// Lens names carry their full-frame equivalent and a marker when the lens does not cover the sensor.
function lensLabel(l) {
  const [a, b] = eqRange(l);
  const eq = ` · ${t('lens.eq', { eq: a === b ? Math.round(a) : `${Math.round(a)}–${Math.round(b)}` })}`;
  return `${loc(l)}${eq}${O.lensCovers(l, camera()) ? '' : ` · ${t('lens.optVignette')}`}`;
}
function fillLenses() {
  const list = LENSES.filter(lensMatches);
  const shown = list.length ? list : [lens()];
  fillSelect($('lens'), shown, state.lensId, ui.brand === 'all' ? LENS_GROUPS : null, lensLabel);
  $('lens-count').textContent = list.length ? t(list.length === 1 ? 'lens.count1' : 'lens.count', { n: list.length }) : t('lens.none');
}
// Move to the lens in the filtered list whose view is closest to the current framing.
function nearestLens() {
  const list = LENSES.filter(lensMatches);
  if (!list.length || list.some((l) => l.id === state.lensId)) return null;
  const now = state.focal * O.cropFactor(camera());
  const dist = (l) => { const [a, b] = eqRange(l); const e = Math.min(b, Math.max(a, now)); return Math.abs(Math.log(e / now)); };
  return list.reduce((best, l) => (dist(l) < dist(best) ? l : best));
}
function chooseLens(id) {
  const focal = state.focal;
  state.lensId = id; activePreset = null;
  const ln = lens();
  // Keep the same equivalent view when switching between lenses.
  state.focal = ln.focal[0] === ln.focal[1] ? ln.focal[0] : clamp(focal, ln.focal[0], ln.focal[1]);
  state.N = O.maxApertureAt(ln, state.focal);
  $('lens').dataset.cam = '';
  updateLook();
  schedule();
}
function fillBrandControls() {
  const count = (id) => LENSES.filter((l) => !l.legacy && l.brand === id).length;
  const total = LENSES.filter((l) => !l.legacy).length;
  $('brand').innerHTML = `<option value="all">${t('brand.all')} (${total})</option>` + BRANDS.map((b) => `<option value="${b.id}">${loc(b)} (${count(b.id)})</option>`).join('');
  $('brand').value = ui.brand;
  $('fits').checked = ui.fits;
}

function fillFrameControls() {
  state.frameLenses.forEach((slot, index) => {
    const el = $('frame-lens-' + (index + 1));
    const options = LENSES.filter((item) => !item.legacy || item.id === slot.lensId);
    el.innerHTML = `<option value="">${t('frame.none')}</option>` + LENS_GROUPS.map((group) => {
      const members = options.filter((item) => item.group === group.id);
      return members.length ? `<optgroup label="${loc(group)}">${members.map((item) => `<option value="${item.id}">${loc(item)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    el.value = slot.lensId;
  });
  if (!frameControlsInitialized && state.frameLenses.some((slot) => slot.lensId)) $('frame-settings').open = true;
  frameControlsInitialized = true;
}

function renderLabels() {
  applyStatic();
  fillSelect($('camera'), CAMERAS.filter((c) => !c.legacy || c.id === state.cameraId), state.cameraId, CAMERA_GROUPS);
  fillBrandControls();
  fillLenses();
  fillFrameControls();
  $('presets').innerHTML = PRESETS.map((p) => `<button type="button" class="chip" data-preset="${p.id}" id="preset-${p.id}">${loc(p)}</button>`).join('');
  fillSelect($('scene-select'), SCENE_LIST, state.sceneId);
  syncCompareUI();
}
renderLabels();

// --- Scene camera ------------------------------------------------------------------------------
function aimBasis(eye, subject, frameTan) {
  // Rotate the view so the subject lands at the requested spot in the frame.
  let f = norm3(sub3(subject, eye));
  for (let i = 0; i < 6; i++) {
    const B = cameraBasis(f);
    const d = sub3(subject, eye);
    const z = dot3(d, B.f);
    const ex = frameTan[0] - dot3(d, B.r) / z;
    const ey = frameTan[1] - dot3(d, B.u) / z;
    f = norm3([f[0] - B.r[0] * ex - B.u[0] * ey, f[1] - B.r[1] * ex - B.u[1] * ey, f[2] - B.r[2] * ex - B.u[2] * ey]);
  }
  return cameraBasis(f);
}

function undistortMM(x, y, k1, icR) {
  const rd = Math.hypot(x, y) / icR;
  const s = 1 + k1 * rd * rd;
  return [x * s, y * s];
}
function distortMM(x, y, k1, icR) {
  const ru = Math.hypot(x, y);
  if (ru < 1e-9) return [x, y];
  const rd = O.distortForward(ru / icR, k1) * icR;
  return [x * rd / ru, y * rd / ru];
}
function undistortBounds(rect, k1, icR, ca) {
  const [x0, y0, x1, y1] = rect;
  let a = [Infinity, Infinity, -Infinity, -Infinity];
  for (const fx of [0, 0.25, 0.5, 0.75, 1]) for (const fy of [0, 0.25, 0.5, 0.75, 1]) {
    const [u, v] = undistortMM(x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy, k1, icR);
    a = [Math.min(a[0], u), Math.min(a[1], v), Math.max(a[2], u), Math.max(a[3], v)];
  }
  const s = 1 + Math.abs(ca);
  return [a[0] * (a[0] < 0 ? s : 1 / s), a[1] * (a[1] < 0 ? s : 1 / s), a[2] * (a[2] > 0 ? s : 1 / s), a[3] * (a[3] > 0 ? s : 1 / s)];
}

// --- Main update ------------------------------------------------------------------------------
function update() {
  const cam = camera(), ln = lens(), sc = scene();
  const W = cam.sensor[0], H = cam.sensor[1];
  state.focal = clamp(state.focal, ln.focal[0], ln.focal[1]);
  const Nmax = O.maxApertureAt(ln, state.focal);
  state.N = clamp(state.N, Nmax, ln.minN);
  const crop = O.cropFactor(cam);
  const fEq = state.focal * crop;
  // Scene distances are set for a 50mm-equivalent view; other lenses keep the same subject size.
  if (state.distance == null) state.distance = sc.camera.distance * (state.keepFraming ? fEq / 50 : 1);
  if (state.keepFraming && lastFEq && Math.abs(fEq - lastFEq) > 1e-6) state.distance *= fEq / lastFEq;
  state.distance = clamp(state.distance, sc.camera.min, sc.camera.max);
  lastFEq = fEq;

  const eye = sc.camera.subject.map((s, i) => s + sc.camera.dir[i] * state.distance);
  let basis, res;
  // Framing focal depends on focus distance (breathing), focus depends on aim: iterate.
  for (let it = 0; it < 3; it++) {
    const fEff = res ? res.fEff : state.focal;
    const frameTan = [sc.camera.frame[0] * (W / 2) / fEff, sc.camera.frame[1] * (H / 2) / fEff];
    basis = aimBasis(eye, sc.camera.subject, frameTan);
    if (state.afTracksSubject) state.focusM = dot3(sub3(sc.camera.subject, eye), basis.f);
    res = O.resolveShot(cam, ln, sc, { ...state });
  }
  state.focusM = res.focusM;
  if (state.mode === 'A') state.shutter = res.t;
  if (state.mode === 'MA') state.iso = res.iso;
  frameGeometry = compareGeometry(res);

  // Subject / AF position in the frame
  const icR = ln.imageCircle / 2;
  if (state.afTracksSubject) {
    const d = sub3(sc.camera.subject, eye);
    const z = dot3(d, basis.f);
    const [xd, yd] = distortMM(dot3(d, basis.r) / z * res.fEff, dot3(d, basis.u) / z * res.fEff, res.k1, icR);
    state.af = [clamp(xd / (W / 2), -0.98, 0.98), clamp(yd / (H / 2), -0.98, 0.98)];
  }

  // Exposure-related lens/sensor terms
  const style = STYLES.find((s) => s.id === state.style);
  const wbDef = WHITE_BALANCE.find((w) => w.id === state.wb);
  const ill = sc.illuminant;
  const wb = wbDef.gains || [ill[1] / ill[0], 1, ill[1] / ill[2]];
  const sunAngle = Math.acos(clamp(dot3(sc.sun.dir, basis.f), -1, 1));
  const halfDiag = Math.atan(res.diag / 2 / res.fEff);
  const offAxis = sc.sun.disc > 0 && sunAngle > halfDiag && sunAngle < 1.4
    ? ln.veil * 0.8 * sc.sun.irradiance * (1 - (sunAngle - halfDiag) / (1.4 - halfDiag)) : 0;
  const stopRatio = Nmax / res.N;
  shot = {
    ...res, eye, basis, fEff: frameGeometry.wide,
    imageDist: O.imageDistance(res.f, res.focusM),
    exposureTime: res.t,
    shakePhase: [0.7, 2.1, 4.0, 5.3], tremorHz: O.TREMOR_HZ,
    icR, blades: ln.blades, roundness: ln.roundness, bladeRot: 0.3, catEye: ln.catEye,
    nRatio: res.N / Nmax, fieldCurv: ln.fieldCurvature, coma: ln.coma, astig: ln.coma * 0.8,
    longCA: ln.longCA, latCA: ln.latCA, k2: 0, sa: ln.sa, apod: ln.apodization, onion: ln.onion,
    softCenter: ln.softCenter * 0.001, softCorner: ln.softCorner * 0.001, diffSigma: 0.42 * 0.00055 * res.Neff,
    glow: ln.glow * stopRatio ** 2.5, ghost: ln.flare * 1.5e-4, veil: ln.veil,
    star: 1.5e-4 * res.N * (1 - 0.85 * ln.roundness),
    vigExp: ln.vignetting, offAxisGlare: offAxis,
    vClip: O.V_CLIP, isoGain: res.iso / cam.baseISO, pitch: O.pixelPitchMM(cam), sensorW: W, sensorH: H,
    wb, zebra: state.zebra, contrast: style.contrast, saturation: style.saturation, sharpen: style.sharpen,
    fwc: O.fullWellE(cam), readNoise: cam.readNoise,
    cfa: cam.cfa === 'xtrans6' ? 2 : 1, aa: cam.aa,
  };
  updateViews();
  if (renderer) renderer.setShot(shot);
  lastUI = [cam, ln, sc, res];
  renderUI(cam, ln, sc, res);
  scheduleUrlSync();
}

function motionFrames(pxOut, base, max) {
  if (params.has('frames')) return +params.get('frames');
  const sc = scene();
  const shakePx = shot.shakeMM / pxOut;
  const objPx = sc.maxSpeed * shot.exposureTime / Math.max(state.distance, 1) * shot.fEff / pxOut;
  return Math.round(clamp(base + Math.max(shakePx, objPx) * 0.6, base, max));
}

function updateViews() {
  if (!renderer) return;
  const q = QUALITY[state.quality] || QUALITY.standard;
  const cam = camera(), W = cam.sensor[0], H = cam.sensor[1];
  const k1 = shot.k1, icR = shot.icR;
  // Main view
  const vf = $('viewfinder');
  const aspect = `${W} / ${H}`;
  if (vf.style.aspectRatio !== aspect) vf.style.aspectRatio = aspect;
  vf.style.setProperty('--ar', (W / H).toFixed(4));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = vf.clientWidth;
  const outW = Math.max(64, Math.min(q.cap, Math.round(cssW * dpr * q.scale)));
  const outH = Math.max(48, Math.round(outW * H / W));
  const canvas = $('view');
  if (canvas.width !== outW || canvas.height !== outH) { canvas.width = outW; canvas.height = outH; }
  const outRect = [-W / 2, -H / 2, W / 2, H / 2];
  const pxOut = W / outW;
  let inRect = undistortBounds(outRect, k1, icR, shot.latCA);
  const m = 0.012 * W;
  inRect = [Math.min(inRect[0], outRect[0]) - m, Math.min(inRect[1], outRect[1]) - m, Math.max(inRect[2], outRect[2]) + m, Math.max(inRect[3], outRect[3]) + m];
  const inW = Math.round((inRect[2] - inRect[0]) / pxOut), inH = Math.round((inRect[3] - inRect[1]) / pxOut);
  inRect[2] = inRect[0] + inW * pxOut; inRect[1] = inRect[3] - inH * pxOut;
  const scale = (pxOut / shot.pitch);
  const mainVP = {
    inRect, outRect, pxIn: pxOut, pxOut, filterScale: 1.0, samples: q.samples, cocCap: Math.round(clamp(outW * 0.06, 32, 120)),
    olpf: 0, cfa: 0, fwcOut: shot.fwc * scale * scale, readOut: shot.readNoise * scale,
    starLen: 0.16 * (outW / 2) * Math.sqrt(shot.N / 11), sharpen: shot.sharpen * 0.4, zoom: 1, grid: false,
    split: state.comparing ? state.split : -1, target: motionFrames(pxOut, q.frames, 160),
  };

  // Loupe at the camera's pixel pitch around the AF point
  const lc = $('loupe');
  const lcss = lc.parentElement.clientWidth;
  const lw = Math.max(64, Math.min(720, Math.round(lcss * dpr)));
  if (lc.width !== lw || lc.height !== lw) { lc.width = lw; lc.height = lw; }
  const zoom = state.loupeZoom;
  const lOutW = Math.ceil(lw / zoom), lOutH = Math.ceil(lw / zoom);
  const p = shot.pitch;
  let cx = state.af[0] * previewScale() * W / 2, cy = state.af[1] * previewScale() * H / 2;
  cx = clamp(cx, -W / 2 + lOutW * p / 2, W / 2 - lOutW * p / 2);
  cy = clamp(cy, -H / 2 + lOutH * p / 2, H / 2 - lOutH * p / 2);
  // Snap to the sensor grid so the colour filter phase is stable.
  cx = Math.round(cx / p) * p; cy = Math.round(cy / p) * p;
  const lOut = [cx - lOutW * p / 2, cy - lOutH * p / 2, cx + lOutW * p / 2, cy + lOutH * p / 2];
  let lIn = undistortBounds(lOut, k1, icR, shot.latCA);
  const lm = 10 * p;
  lIn = [lIn[0] - lm, lIn[1] - lm, lIn[2] + lm, lIn[3] + lm];
  const lInW = Math.ceil((lIn[2] - lIn[0]) / p), lInH = Math.ceil((lIn[3] - lIn[1]) / p);
  lIn[2] = lIn[0] + lInW * p; lIn[1] = lIn[3] - lInH * p;
  const loupeVP = {
    inRect: lIn, outRect: lOut, pxIn: p, pxOut: p, filterScale: 0.25, samples: 64, cocCap: 44,
    olpf: shot.aa ? 1 : 0, cfa: shot.cfa, fwcOut: shot.fwc, readOut: shot.readNoise,
    starLen: 0, sharpen: shot.sharpen, zoom, grid: state.grid,
    split: state.comparing && state.held?.loupeKey === loupeKey() ? state.split : -1,
    target: motionFrames(p, q.loupeFrames, 192),
  };
  renderer.ensureView('main', inW, inH, outW, outH, outW, outH);
  renderer.ensureView('loupe', lInW, lInH, lOutW, lOutH, lw, lw);
  renderer.setViewParams({ main: mainVP, loupe: loupeVP });
  positionOverlay();
}

const loupeKey = () => `${state.af[0].toFixed(4)},${state.af[1].toFixed(4)},${state.loupeZoom},${state.cameraId}`;

// --- UI rendering --------------------------------------------------------------------------------
function setDial(id, list, value, fmt) {
  const el = $(id);
  el.max = list.length - 1;
  const i = O.nearestIndex(list, value, (x) => (Array.isArray(x) ? x[1] : x));
  el.value = i;
  $(id + '-val').textContent = fmt(Array.isArray(list[i]) ? list[i][1] : list[i]);
}

function apertureList(ln) {
  const Nmax = O.maxApertureAt(ln, state.focal);
  const list = APERTURES.filter((n) => n >= Nmax - 0.05 && n <= ln.minN + 0.01);
  if (!list.length || Math.abs(list[0] - Nmax) > 0.05) list.unshift(+Nmax.toFixed(1));
  if (state.N >= Nmax && state.N <= ln.minN && !list.some((n) => Math.abs(n - state.N) < 1e-6)) list.push(state.N);
  list.sort((a, b) => a - b);
  return list;
}
function isoList(cam) {
  const list = ISOS.filter((i) => i >= Math.min(cam.baseISO, 100) / 2 && i <= cam.maxISO && (i >= cam.baseISO || i >= 50));
  if (state.iso >= list[0] && state.iso <= cam.maxISO && !list.includes(state.iso)) list.push(state.iso);
  return list.sort((a, b) => a - b);
}
function shutterList() {
  const list = [...SHUTTERS];
  if (state.shutter >= 1 / 8000 && state.shutter <= 30 && !list.some((entry) => Math.abs(entry[1] - state.shutter) < 1e-9)) {
    list.push([shutterParam(state.shutter), state.shutter]);
  }
  return list.sort((a, b) => b[1] - a[1]);
}
function syncInput(id, value, min, max, disabled = false) {
  const input = $(id);
  if (input.type === 'number') { input.min = min; input.max = max; }
  input.disabled = disabled;
  if (document.activeElement !== input) input.value = value;
}
function renderFrames() {
  const active = frameGeometry.entries.some(Boolean);
  const lines = $('frame-lines'), legend = $('frame-legend');
  lines.toggleAttribute('hidden', !active);
  legend.hidden = !active;
  state.frameLenses.forEach((slot, index) => {
    const selected = comparisonLens(slot);
    $('frame-lens-' + (index + 1)).value = slot.lensId;
    $('frame-coverage-' + (index + 1)).textContent = selected && !O.lensCovers(selected, camera()) ? t('frame.coverage') : '';
    syncInput('frame-focal-' + (index + 1), selected ? fmtInput(slot.focal) : '', selected?.focal[0] ?? 0, selected?.focal[1] ?? 0,
      !selected || selected.focal[0] === selected.focal[1]);
  });
  if (!active) { legend.replaceChildren(); return; }
  const draw = (id, effective) => {
    const rect = $(id), ratio = frameGeometry.wide / effective, size = 97.6 * ratio;
    rect.toggleAttribute('hidden', false);
    rect.setAttribute('x', String((100 - size) / 2)); rect.setAttribute('y', String((100 - size) / 2));
    rect.setAttribute('width', String(size)); rect.setAttribute('height', String(size));
  };
  draw('frame-primary', frameGeometry.primary);
  ['frame-one', 'frame-two'].forEach((id, index) => {
    const entry = frameGeometry.entries[index];
    if (entry) draw(id, entry.effective); else $(id).toggleAttribute('hidden', true);
  });
  const labels = [
    [state.comparing ? 'frame.previewB' : 'frame.preview', {}, ''],
    ['frame.primary', { f: fmtInput(state.focal) }, 'frame-primary'],
    ...frameGeometry.entries.map((entry, index) => entry ? ['frame.extra' + (index + 1), { f: fmtInput(entry.focal) }, index ? 'frame-two' : 'frame-one'] : null).filter(Boolean),
  ];
  legend.replaceChildren(...labels.map(([key, vars, className]) => {
    const chip = document.createElement('span'); chip.className = className; chip.textContent = t(key, vars); return chip;
  }));
}

function renderUI(cam, ln, sc, r) {
  // Selections
  $('camera').value = cam.id;
  if ($('lens').dataset.cam !== cam.id + getLang()) { fillLenses(); $('lens').dataset.cam = cam.id + getLang(); }
  const matching = LENSES.filter(lensMatches);
  if (matching.length && !matching.some((l) => l.id === ln.id) && (ui.brand !== 'all' || ui.fits)) {
    Object.assign(ui, { brand: 'all', fits: false }); fillBrandControls(); fillLenses();
  }
  $('lens').value = ln.id;
  $('scene-select').value = sc.id;
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  document.querySelectorAll('[data-support]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.support === state.support)));
  document.querySelectorAll('[data-nd]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.nd === state.nd)));
  document.querySelectorAll('[data-zoom]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.zoom === state.loupeZoom)));
  document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === activePreset)));
  $('scene-note').textContent = loc(sc, 'blurb');
  $('cam-spec').textContent = t('cam.spec', {
    w: cam.sensor[0], h: cam.sensor[1], mp: O.megapixels(cam).toFixed(0), c: O.cropFactor(cam).toFixed(2),
    p: (O.pixelPitchMM(cam) * 1000).toFixed(2), aa: t(cam.aa ? 'cam.aa' : 'cam.noAa'),
  }) + (cam.kind === 'product' ? ' ' + t('cam.estimated') : '');

  // Focal length
  const zoomRow = $('focal-row');
  zoomRow.hidden = ln.focal[0] === ln.focal[1];
  $('focal').min = ln.focal[0]; $('focal').max = ln.focal[1]; $('focal').value = r.f;
  $('focal-val').textContent = `${fmtInput(r.f)} mm`;
  syncInput('focal-input', fmtInput(r.f), ln.focal[0], ln.focal[1]);

  // Exposure dials
  const aps = apertureList(ln);
  setDial('aperture', aps, r.N, (n) => 'f/' + fmtN(n));
  setDial('shutter', shutterList(), r.t, () => fmtShutter(r.t));
  $('shutter-val').textContent = fmtShutter(r.t);
  const isos = isoList(cam);
  setDial('iso', isos, r.iso, () => Math.round(r.iso).toString());
  $('iso-val').textContent = Math.round(r.iso).toString();
  $('shutter').disabled = state.mode === 'A';
  $('iso').disabled = state.mode === 'MA';
  syncInput('aperture-input', fmtInput(r.N), O.maxApertureAt(ln, state.focal), ln.minN);
  syncInput('shutter-input', shutterParam(r.t), 1 / 8000, 30, state.mode === 'A');
  syncInput('iso-input', String(Math.round(r.iso)), isos[0], cam.maxISO, state.mode === 'MA');
  syncInput('ec-input', fmtInput(state.ec), -3, 3, state.mode === 'M');
  $('shutter-row').classList.toggle('is-auto', state.mode === 'A');
  $('iso-row').classList.toggle('is-auto', state.mode === 'MA');
  $('ec').value = state.ec; $('ec-val').textContent = fmtEV(state.ec);
  $('ec-row').hidden = state.mode === 'M';

  // Distance & focus
  $('distance').min = sc.camera.min; $('distance').max = sc.camera.max; $('distance').value = state.distance;
  $('distance-val').textContent = fmtDist(state.distance);
  syncInput('distance-input', fmtMetres(state.distance), sc.camera.min, sc.camera.max);
  $('keep').checked = state.keepFraming;
  $('focus-val').textContent = fmtDist(r.focusM);
  syncInput('focus-input', fmtMetres(r.focusM), ln.minFocus, 10000);
  $('focus-src').textContent = t(state.afTracksSubject ? 'focus.subject' : 'focus.manual');
  renderFrames();

  // Picture
  $('grid').checked = state.grid;

  // Viewfinder info line
  $('vf-mode').textContent = { A: 'A', M: 'M', MA: 'M' }[state.mode];
  $('vf-shutter').textContent = fmtShutter(r.t);
  $('vf-aperture').textContent = 'F' + fmtN(r.N);
  $('vf-iso').textContent = 'ISO ' + Math.round(r.iso) + (state.mode === 'MA' ? ' A' : '');
  $('vf-ev').textContent = fmtEV(state.mode === 'M' ? r.evOffset : state.ec);
  $('vf-focal').textContent = `${fmtInput(r.f)}mm`;

  // Readouts
  const pct = (x) => (x < 1 ? x.toFixed(2) : x.toFixed(1)) + '%';
  $('ro-fov').textContent = `${r.fovH.toFixed(1)}° × ${r.fovV.toFixed(1)}°`;
  $('ro-fov-sub').textContent = t('ro.fovSub', { d: r.fovD.toFixed(1) });
  $('ro-eq').textContent = `${Math.round(r.fEq)} mm · f/${fmtN(r.NEq)}`;
  $('ro-eq-sub').textContent = t('ro.eqSub', { c: r.crop.toFixed(2) });
  const dofTotal = r.dof.far - r.dof.near;
  $('ro-dof').textContent = `${fmtDist(r.dof.near)} – ${fmtDist(r.dof.far)}`;
  $('ro-dof-sub').textContent = isFinite(dofTotal)
    ? t('ro.dofSub', { deep: fmtDist(dofTotal), h: fmtDist(r.dof.hyperfocal) })
    : t('ro.dofSubInf', { h: fmtDist(r.dof.hyperfocal) });
  $('ro-bg').textContent = `${(r.bgBlurMM).toFixed(2)} mm`;
  $('ro-bg-sub').textContent = t('ro.bgSub', { pct: pct(r.bgBlurPct) });
  $('ro-pupil').textContent = `${r.pupilMM.toFixed(1)} mm`;
  $('ro-pupil-sub').textContent = r.mag > 0.05
    ? t('ro.pupilSubMacro', { m: (1 / r.mag).toFixed(1), n: fmtN(r.Neff) })
    : t('ro.pupilSub', { m: Math.round(1 / r.mag) });
  $('ro-airy').textContent = `${(r.airyMM * 1000).toFixed(1)} µm`;
  $('ro-airy-sub').textContent = t('ro.airySub', { p: (r.pitchMM * 1000).toFixed(2), n: fmtN(r.dlaN) });
  $('ro-shake').textContent = state.support === 'tripod' ? t('ro.shakeNone') : `${r.shakePx.toFixed(1)} px`;
  $('ro-shake-sub').textContent = state.support === 'tripod' ? t('ro.shakeTripod') : t('ro.shakeSub', { t: fmtShutter(Math.min(1, r.safeShutter)) });
  $('ro-noise').textContent = `${Math.round(r.snr8)}:1`;
  $('ro-noise-sub').textContent = t('ro.noiseSub', { dr: r.dr.toFixed(1) });

  // Warnings
  const warn = [];
  if (!r.icOk) warn.push(['bad', t('warn.ic', { ic: ln.imageCircle, d: r.diag.toFixed(1) })]);
  if (r.focusM <= ln.minFocus + 1e-6 && state.afTracksSubject && dot3(sub3(sc.camera.subject, shot.eye), shot.basis.f) < ln.minFocus) warn.push(['warn', t('warn.minFocus', { d: fmtDist(ln.minFocus) })]);
  if (state.support !== 'tripod' && r.t > r.safeShutter * 1.05) warn.push(['warn', t('warn.shake')]);
  if (r.Neff > r.dlaN * 1.25) warn.push(['info', t('warn.diffraction', { n: fmtN(r.dlaN) })]);
  if (Math.abs(r.evOffset) > 0.4 && state.mode !== 'A') warn.push(['warn', t('warn.exposure', { ev: fmtEV(r.evOffset) })]);
  $('warnings').innerHTML = warn.map(([k, text]) => `<li class="chip-${k}">${text}</li>`).join('');

  redrawScales();
  document.querySelectorAll('input[type="range"]').forEach(syncRange);
  positionOverlay();
}

// Slider track is filled up to the thumb (read by the CSS as --fill).
function syncRange(el) {
  const min = +el.min || 0, max = +el.max || 100;
  const f = max > min ? clamp((+el.value - min) / (max - min), 0, 1) : 0;
  el.style.setProperty('--fill', `${(f * 100).toFixed(1)}%`);
}
function redrawScales() {
  if (!lastUI) return;
  const r = lastUI[3];
  drawFocusScale(lastUI[1], r);
  drawMeter(state.mode === 'M' ? r.evOffset : state.ec);
}


// --- Focus scale (lens barrel style, linear in 1/distance) ----------------------------------
const FS_PAD = 22;
function focusT(d, dmin) { return d === Infinity || d > 1e4 ? 1 : clamp(1 - dmin / d, 0, 1); }
function focusFromT(t, dmin) { return t >= 0.999 ? 1e4 : dmin / (1 - t); }
function drawFocusScale(ln, r) {
  const svg = $('focus-scale');
  const W = svg.clientWidth || 600, Hh = 58;
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  const w = W - FS_PAD * 2;
  const x = (d) => FS_PAD + focusT(d, ln.minFocus) * w;
  const marks = [0.25, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3, 5, 10, 20, Infinity].filter((d) => d >= ln.minFocus - 1e-6);
  // Labels are chosen by importance so that ∞ and the round numbers survive on narrow screens.
  const order = [Infinity, 1, 2, 5, 0.5, 10, 3, 0.7, 1.5, 0.4, 0.3, 20, 0.25];
  const labelled = [];
  for (const d of order) {
    if (marks.includes(d) && labelled.every((o) => Math.abs(x(o) - x(d)) > 25)) labelled.push(d);
  }
  let s = `<rect x="${FS_PAD - 8}" y="19" width="${w + 16}" height="19" rx="6" class="fs-barrel"/>`;
  const nearX = x(r.dof.near), farX = x(r.dof.far);
  const dofW = Math.max(3, farX - nearX);
  s += `<rect x="${nearX}" y="21" width="${dofW}" height="15" rx="3" class="fs-dof"/>`;
  s += `<line x1="${nearX}" y1="21" x2="${nearX}" y2="36" class="fs-dof-edge"/><line x1="${nearX + dofW}" y1="21" x2="${nearX + dofW}" y2="36" class="fs-dof-edge"/>`;
  const hx = x(r.dof.hyperfocal);
  s += `<line x1="${hx}" y1="16" x2="${hx}" y2="40" class="fs-hyper"/><text x="${hx}" y="53" class="fs-hyper-t">H</text>`;
  for (const d of marks) {
    const mx = x(d), big = labelled.includes(d);
    s += `<line x1="${mx}" y1="${big ? 22 : 24}" x2="${mx}" y2="${big ? 34 : 32}" class="fs-tick${big ? '' : ' minor'}"/>`;
    if (big) s += `<text x="${mx}" y="12" class="fs-label">${d === Infinity ? '∞' : d}</text>`;
  }
  s += `<text x="${FS_PAD - 8}" y="53" class="fs-unit">m</text>`;
  svg.setAttribute('aria-valuetext', fmtDist(r.focusM));
  const fx = x(r.focusM);
  s += `<line x1="${fx}" y1="16" x2="${fx}" y2="40" class="fs-pointer-line"/><path d="M${fx} 39 l-6 10 h12 z" class="fs-pointer"/>`;
  svg.innerHTML = s;
}
function drawMeter(ev) {
  const svg = $('meter');
  const W = svg.clientWidth || 270, Hh = 40;
  const pad = 14, w = W - pad * 2;
  const x = (e) => pad + (clamp(e, -3, 3) + 3) / 6 * w;
  // Pointer above the scale, tick marks below it, numbers last: nothing overlaps.
  let s = `<line x1="${x(-3)}" y1="14" x2="${x(3)}" y2="14" class="m-axis"/>`;
  const ex = x(ev);
  s += `<rect x="${Math.min(x(0), ex)}" y="12" width="${Math.abs(ex - x(0)) || 1.5}" height="4" rx="1" class="m-bar"/>`;
  for (let e = -3; e <= 3.001; e += 1 / 3) {
    const major = Math.abs(e - Math.round(e)) < 1e-6;
    s += `<line x1="${x(e)}" y1="15" x2="${x(e)}" y2="${major ? 24 : 20}" class="${major ? 'm-major' : 'm-minor'}"/>`;
    if (major) {
      const n = Math.round(e);
      s += `<text x="${x(e)}" y="36" class="m-label${n === 0 ? ' zero' : ''}">${n === 0 ? '0' : (n > 0 ? '+' : '−') + Math.abs(n)}</text>`;
    }
  }
  s += `<path d="M${ex} 11 l-5 -9 h10 z" class="m-pointer"/>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  svg.innerHTML = s;
  $('meter-val').textContent = `${fmtEV(ev)} EV`;
}

// "FF 24MP · 50mm f/1.2 premium · f/1.2 1/250 ISO 100", shown on both sides of a comparison.
function describeSetup(camName, ln, N, t, iso) {
  return `${camName} · ${loc(ln)} · f/${fmtN(N)} ${fmtShutter(t)} ISO ${Math.round(iso)}`;
}

function positionOverlay() {
  const vf = $('viewfinder');
  const af = $('af-box');
  const w = vf.clientWidth, h = vf.clientHeight;
  af.style.left = `${(state.af[0] * previewScale() * 0.5 + 0.5) * w}px`;
  af.style.top = `${(0.5 - state.af[1] * previewScale() * 0.5) * h}px`;
  const cam = camera();
  if (shot) {
    const zoom = state.loupeZoom;
    const lw = $('loupe').width / zoom;
    const frac = lw / cam.pixels[0];
    const size = Math.max(6, frac * w);
    af.style.setProperty('--loupe', `${size}px`);
  }
  const split = $('split');
  vf.classList.toggle('comparing', state.comparing);
  split.hidden = !state.comparing;
  split.style.left = `${state.split * w}px`;
  // The outlines describe the live B view, so never draw them over a held A image.
  $('frame-lines').style.clipPath = state.comparing ? `inset(0 0 0 ${state.split * 100}%)` : '';
  $('ab-labels').hidden = !state.comparing;
  if (state.held) {
    const h = state.held;
    $('held-desc').textContent = describeSetup(h.cam.name, h.lens, h.N, h.t, h.iso);
  }
  if (state.comparing && shot) $('live-desc').textContent = describeSetup(camera().short, lens(), shot.N, shot.t, shot.iso);
}

// --- Shareable setup --------------------------------------------------------------------------
// The page keeps the current setup in its address, so a reload or a copied link reopens it.
let activePreset = null;
const MANAGED = ['camera', 'lens', 'scene', 'focal', 'f', 't', 'iso', 'mode', 'ec', 'nd', 'support', 'dist', 'keep', 'zoom', 'wb', 'style', 'zebra', 'grid', 'focus', 'af', 'q', 'cmp1', 'cmp1f', 'cmp2', 'cmp2f'];
function shutterParam(tm) {
  if (tm >= 0.3) return String(+tm.toFixed(6));
  const denominator = Math.round(1 / tm);
  return Math.abs(tm - 1 / denominator) < 1e-7 ? '1/' + denominator : String(+tm.toFixed(6));
}
function setupParams(keepExtras) {
  const p = new URLSearchParams(keepExtras ? location.search : '');
  MANAGED.forEach((k) => p.delete(k));
  const ln = lens();
  p.set('camera', state.cameraId); p.set('lens', state.lensId); p.set('scene', state.sceneId);
  if (ln.focal[0] !== ln.focal[1]) p.set('focal', fmtInput(state.focal));
  p.set('f', fmtInput(state.N)); p.set('mode', state.mode);
  if (state.mode !== 'A') p.set('t', shutterParam(state.shutter));
  if (state.mode !== 'MA') p.set('iso', String(Math.round(state.iso)));
  if (state.mode !== 'M') p.set('ec', fmtInput(state.ec));
  if (state.nd) p.set('nd', String(state.nd));
  p.set('support', state.support);
  if (state.distance != null) p.set('dist', fmtInput(state.distance));
  if (!state.keepFraming) p.set('keep', '0');
  if (state.loupeZoom !== 1) p.set('zoom', String(state.loupeZoom));
  if (state.wb !== 'auto') p.set('wb', state.wb);
  if (state.style !== 'standard') p.set('style', state.style);
  if (state.zebra) p.set('zebra', '1');
  if (!state.grid) p.set('grid', '0');
  if (!state.afTracksSubject) {
    p.set('focus', String(+state.focusM.toFixed(3)));
    p.set('af', state.af.map((v) => +v.toFixed(3)).join(','));
  }
  if (state.quality !== 'standard') p.set('q', state.quality);
  state.frameLenses.forEach((slot, index) => {
    if (!slot.lensId) return;
    p.set('cmp' + (index + 1), slot.lensId);
    p.set('cmp' + (index + 1) + 'f', fmtInput(slot.focal));
  });
  return p;
}
let urlTimer = 0;
function scheduleUrlSync() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    try { history.replaceState(null, '', '?' + setupParams(true).toString()); } catch { /* sandboxed frame */ }
  }, 250);
}
function updateLook() {
  const p = PRESETS.find((x) => x.id === activePreset);
  $('preset-look').textContent = p ? t('start.look', { text: loc(p, 'look') }) : t('start.note');
}
// Replace the whole setup (quick start or reset) and re-render.
function applySetup(query, presetId = null) {
  const keep = { quality: state.quality };
  const next = makeState(new URLSearchParams(query));
  clearHold();
  Object.assign(state, next, keep, { comparing: false, held: null });
  activePreset = presetId;
  lastFEq = null;
  if (renderer) renderer.setScene(scene());
  fillSelect($('camera'), CAMERAS.filter((c) => !c.legacy || c.id === state.cameraId), state.cameraId, CAMERA_GROUPS);
  $('lens').dataset.cam = '';
  schedule();
}

// --- Events ---------------------------------------------------------------------------------------
let queued = false;
function schedule() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } }

// The number fields and sliders write the same state. Values outside the available range
// are clamped and announced; an invalid entry restores the previous value.
const directInputs = [
  { id: 'focal-input', read: () => state.focal, bounds: () => lens().focal, write: (v) => { state.focal = v; } },
  { id: 'distance-input', precision: 2, format: fmtMetres, read: () => state.distance, bounds: () => [scene().camera.min, scene().camera.max], write: (v) => { state.distance = v; lastFEq = null; state.afTracksSubject = true; } },
  { id: 'focus-input', precision: 2, format: fmtMetres, read: () => state.focusM, bounds: () => [lens().minFocus, 10000], write: (v) => { state.focusM = v; state.afTracksSubject = false; } },
  { id: 'aperture-input', read: () => state.N, bounds: () => [O.maxApertureAt(lens(), state.focal), lens().minN], write: (v) => { state.N = v; } },
  { id: 'shutter-input', read: () => state.shutter, bounds: () => [1 / 8000, 30], parse: parseShutter, format: shutterParam, write: (v) => { state.shutter = v; } },
  { id: 'iso-input', read: () => state.iso, bounds: () => [isoList(camera())[0], camera().maxISO], write: (v) => { state.iso = Math.round(v); } },
  { id: 'ec-input', read: () => state.ec, bounds: () => [-3, 3], write: (v) => { state.ec = v; } },
  ...[0, 1].map((index) => ({
    id: 'frame-focal-' + (index + 1),
    read: () => state.frameLenses[index].focal,
    bounds: () => comparisonLens(state.frameLenses[index])?.focal || [0, 0],
    write: (v) => { state.frameLenses[index].focal = v; clearHold(); },
  })),
];
for (const spec of directInputs) {
  const input = $(spec.id), feedback = document.createElement('small');
  const entry = input.closest('.value-entry');
  feedback.className = 'input-feedback'; feedback.id = spec.id + '-feedback'; feedback.hidden = true;
  feedback.setAttribute('role', 'status');
  input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), feedback.id].filter(Boolean).join(' '));
  (input.closest('.field') || input.closest('.strip-col')).append(feedback);
  const format = spec.format || fmtInput;
  const clearFeedback = () => { feedback.hidden = true; entry.classList.remove('entry-error'); };
  input.addEventListener('input', clearFeedback);
  input.addEventListener('change', () => {
    const text = input.value.trim();
    const parsed = text ? (spec.parse ? spec.parse(text) : Number(text)) : null;
    if (parsed == null || !Number.isFinite(parsed)) {
      input.value = format(spec.read());
      feedback.textContent = t(spec.parse ? 'input.invalidShutter' : 'input.invalid');
      feedback.hidden = false;
      entry.classList.add('entry-error');
      return;
    }
    const [min, max] = spec.bounds();
    const bounded = clamp(parsed, min, max);
    const value = spec.parse ? bounded : +bounded.toFixed(spec.precision ?? 3);
    spec.write(value);
    input.value = format(spec.read());
    entry.classList.remove('entry-error');
    if (bounded !== parsed) {
      feedback.textContent = t('input.clamped', { min: format(min), max: format(max) });
      feedback.hidden = false;
    } else feedback.hidden = true;
    schedule();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    if (event.key === 'Escape') { input.value = format(spec.read()); clearFeedback(); input.blur(); }
  });
}

$('camera').addEventListener('change', (e) => {
  state.cameraId = e.target.value; activePreset = null;
  fillSelect($('camera'), CAMERAS.filter((c) => !c.legacy || c.id === state.cameraId), state.cameraId, CAMERA_GROUPS);
  onFilter(); updateLook();
});
$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  const p = PRESETS.find((x) => x.id === b.dataset.preset);
  applySetup(p.q, p.id);
  updateLook();
});
$('lens').addEventListener('change', (e) => chooseLens(e.target.value));
[0, 1].forEach((index) => {
  $('frame-lens-' + (index + 1)).addEventListener('change', (event) => {
    const slot = state.frameLenses[index];
    const selected = LENSES.find((item) => item.id === event.target.value);
    slot.lensId = selected?.id || '';
    slot.focal = selected ? clamp(state.focal, selected.focal[0], selected.focal[1]) : null;
    clearHold();
    schedule();
  });
});
function onFilter() {
  const next = nearestLens();
  if (next) chooseLens(next.id); else { fillLenses(); schedule(); }
  fillLenses();
}
$('brand').addEventListener('change', (e) => { ui.brand = e.target.value; onFilter(); });
$('fits').addEventListener('change', (e) => { ui.fits = e.target.checked; onFilter(); });
$('focal').addEventListener('input', (e) => { state.focal = +e.target.value; schedule(); });
$('scene-select').addEventListener('change', (e) => {
  const prevScene = scene();
  state.sceneId = e.target.value;
  applySceneDefaults(prevScene, scene());
  state.distance = null; state.afTracksSubject = true; lastFEq = null;
  clearHold();
  if (renderer) renderer.setScene(scene());
  schedule();
});
// Controls over the picture must not initiate focus or comparison dragging.
for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
  document.querySelector('.scene-control').addEventListener(type, (e) => e.stopPropagation());
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; schedule(); }));
document.querySelectorAll('[data-support]').forEach((b) => b.addEventListener('click', () => { state.support = b.dataset.support; schedule(); }));
document.querySelectorAll('[data-nd]').forEach((b) => b.addEventListener('click', () => { state.nd = +b.dataset.nd; schedule(); }));
document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => { state.loupeZoom = +b.dataset.zoom; schedule(); }));
$('aperture').addEventListener('input', (e) => { state.N = apertureList(lens())[+e.target.value]; schedule(); });
$('shutter').addEventListener('input', (e) => { state.shutter = shutterList()[+e.target.value][1]; schedule(); });
$('iso').addEventListener('input', (e) => { state.iso = isoList(camera())[+e.target.value]; schedule(); });
$('ec').addEventListener('input', (e) => { state.ec = +e.target.value; schedule(); });
let distanceAnchor = null;
$('distance').addEventListener('pointerdown', () => { distanceAnchor = state.distance; });
$('distance').addEventListener('pointerup', () => { distanceAnchor = null; });
$('distance').addEventListener('pointercancel', () => { distanceAnchor = null; });
$('distance').addEventListener('input', (e) => {
  const anchor = distanceAnchor ?? state.distance;
  state.distance = clamp(anchor + Math.round((+e.target.value - anchor) * 2) / 2, scene().camera.min, scene().camera.max);
  lastFEq = null; state.afTracksSubject = true; schedule();
});
$('distance').addEventListener('keydown', (e) => {
  const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
  if (!direction) return;
  e.preventDefault(); state.distance = clamp(state.distance + direction * 0.5, scene().camera.min, scene().camera.max);
  lastFEq = null; state.afTracksSubject = true; schedule();
});
$('keep').addEventListener('change', (e) => { state.keepFraming = e.target.checked; schedule(); });
$('refocus-chip').addEventListener('click', () => { state.afTracksSubject = true; schedule(); });
$('jump-focus').addEventListener('click', () => {
  const target = $('focus-scale');
  const dock = document.querySelector('.dock');
  const pinned = getComputedStyle(dock).position === 'sticky';
  const offset = pinned ? dock.getBoundingClientRect().height + (innerWidth > 980 ? 12 : 0) + 16 : 16;
  window.scrollTo({ top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset), behavior: 'instant' });
  target.focus({ preventScroll: true });
});
$('grid').addEventListener('change', (e) => { state.grid = e.target.checked; schedule(); });

// Focus scale: drag to focus
(() => {
  const svg = $('focus-scale');
  let dragging = false, anchorFocus = 0, anchorScale = 0;
  const set = (ev) => {
    const rect = svg.getBoundingClientRect();
    const t = clamp((ev.clientX - rect.left - FS_PAD) / (rect.width - FS_PAD * 2), 0, 1);
    state.focusM = clamp(anchorFocus + Math.round((focusFromT(t, lens().minFocus) - anchorScale) * 2) / 2, lens().minFocus, 10000);
    state.afTracksSubject = false;
    schedule();
  };
  svg.addEventListener('pointerdown', (e) => { const rect = svg.getBoundingClientRect(); const t = clamp((e.clientX - rect.left - FS_PAD) / (rect.width - FS_PAD * 2), 0, 1); anchorFocus = state.focusM; anchorScale = focusFromT(t, lens().minFocus); dragging = true; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', (e) => { if (dragging) set(e); });
  svg.addEventListener('pointerup', () => { dragging = false; });
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      state.focusM = clamp(state.focusM + (e.key === 'ArrowRight' ? 0.5 : -0.5), lens().minFocus, 10000);
      state.afTracksSubject = false; schedule();
    }
  });
})();

// Viewfinder: click to focus (and move the loupe); drag the A/B divider.
(() => {
  const vf = $('viewfinder');
  let mode = null;
  vf.addEventListener('pointerdown', (e) => {
    const r = vf.getBoundingClientRect();
    const x = e.clientX - r.left;
    mode = state.comparing && Math.abs(x - state.split * r.width) < 18 ? 'split' : 'focus';
    vf.setPointerCapture(e.pointerId);
    if (mode === 'split') { state.split = clamp(x / r.width, 0, 1); updateViews(); renderer?.present(); }
  });
  vf.addEventListener('pointermove', (e) => {
    if (mode !== 'split') return;
    const r = vf.getBoundingClientRect();
    state.split = clamp((e.clientX - r.left) / r.width, 0, 1);
    updateViews(); renderer?.present();
  });
  vf.addEventListener('pointerup', async (e) => {
    const m = mode; mode = null;
    if (m !== 'focus' || !renderer || !shot) return;
    const r = vf.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((e.clientY - r.top) / r.height) * 2;
    // In the widened framing preview, focus is defined in the current lens's frame.
    const frameScale = previewScale();
    if (Math.abs(nx) > frameScale || Math.abs(ny) > frameScale) return;
    const cam = camera();
    const W = cam.sensor[0], H = cam.sensor[1];
    const [ux, uy] = undistortMM(nx * W / 2, ny * H / 2, shot.k1, shot.icR);
    const v = renderer.views.main, vp = renderer.viewParams.main;
    const ix = Math.floor((ux - vp.inRect[0]) / vp.pxIn), iy = Math.floor((vp.inRect[3] - uy) / vp.pxIn);
    const z = await renderer.depthAt(ix, iy);
    if (z == null || !v) return;
    state.af = [clamp(nx / frameScale, -0.98, 0.98), clamp(ny / frameScale, -0.98, 0.98)];
    state.afTracksSubject = false;
    state.focusM = clamp(z > 5e4 ? 1e4 : z, lens().minFocus, 1e4);
    schedule();
  });
})();

// The divider can be moved from the keyboard too (Shift for bigger steps).
$('split').addEventListener('keydown', (e) => {
  const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (!d && e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault();
  state.split = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : clamp(state.split + d * (e.shiftKey ? 0.1 : 0.02), 0, 1);
  $('split').setAttribute('aria-valuenow', String(Math.round(state.split * 100)));
  updateViews(); renderer?.present();
});

// A/B compare
// The Compare group and the phone's shortcut chip over the picture show the same state.
function syncCompareUI() {
  $('hold').textContent = t(state.comparing ? 'compare.replace' : 'compare.hold');
  $('clear-hold').hidden = !state.comparing;
  $('hold-chip').textContent = t(state.comparing ? 'compare.stop' : 'chip.hold');
  if (frameGeometry) renderFrames();
}
function holdA() {
  if (!renderer) return;
  renderer.capture();
  const cam = camera(), ln = lens();
  state.held = { cam: { name: cam.short }, lens: ln, N: shot.N, t: shot.t, iso: shot.iso, loupeKey: loupeKey() };
  state.comparing = true;
  syncCompareUI();
  updateViews();
  renderer.present();
}
function clearHold() {
  state.comparing = false; state.held = null;
  syncCompareUI();
  renderer?.clearCapture();
  if (renderer && shot) updateViews();
}
$('hold').addEventListener('click', holdA);
$('hold-chip').addEventListener('click', () => (state.comparing ? clearHold() : holdA()));
// --- Share link and reset -------------------------------------------------------------------------
// Use the same complete picture state for the copied link and address-bar restoration.
function shareURL() {
  return `${location.origin}${location.pathname}?${setupParams(false)}`;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back to a hidden field */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
let shareTimer = 0;
$('share').addEventListener('click', async () => {
  const ok = await copyText(shareURL());
  $('share').textContent = t(ok ? 'share.copied' : 'share.failed');
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => { $('share').textContent = t('share.copy'); }, 2000);
});
// Back to the starting exposure, focus and picture settings. Camera, lens and location stay, and so does a held A.
$('reset').addEventListener('click', () => {
  Object.assign(state, SCENE_BASE, scene().defaults || {}, {
    mode: 'A', ec: 0, nd: 0, wb: 'auto', style: 'standard', zebra: false, loupeZoom: 1, grid: true,
    keepFraming: true, distance: null, afTracksSubject: true,
  });
  state.N = O.maxApertureAt(lens(), state.focal);
  lastFEq = null;
  schedule();
});

// Language: only the text changes, so the picture is not re-rendered.
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.lang === getLang()) return;
  setLang(b.dataset.lang);
  renderLabels();
  updateLook();
  if (lastUI) renderUI(...lastUI);
  if (document.body.dataset.state === 'ready') $('status').textContent = t('status.ready');
}));
$('clear-hold').addEventListener('click', clearHold);

new ResizeObserver(() => { if (shot) { if (state.comparing) clearHold(); updateViews(); renderer?.resetAll(); } }).observe($('viewfinder'));
new ResizeObserver(redrawScales).observe($('focus-scale'));
new ResizeObserver(redrawScales).observe($('meter'));

// Tabs (phones and tablets): one panel at a time scrolls beneath the pinned picture. Unselected panels
// are collapsed by CSS rather than hidden, so the loupe keeps its width. On wide screens every panel shows.
(() => {
  const app = document.querySelector('.app');
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  const dock = document.querySelector('.dock');
  const KEY = 'lvs-tab';
  const valid = (n) => tabs.some((b) => b.dataset.tab === n);
  const select = (name, { scroll = true, focus = false } = {}) => {
    app.dataset.tab = name;
    tabs.forEach((b) => { const on = b.dataset.tab === name; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    panels.forEach((p) => p.classList.toggle('is-off', p.dataset.panel !== name));
    try { localStorage.setItem(KEY, name); } catch { /* storage blocked */ }
    // Start the new panel right under the pinned area instead of wherever the last one was scrolled to.
    if (scroll && dock && getComputedStyle(dock).position === 'sticky' && window.scrollY > dock.offsetTop) window.scrollTo(0, dock.offsetTop);
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => select(b.dataset.tab));
    b.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, { focus: true }); }
    });
  });
  let first = params.get('tab');
  if (!valid(first)) { try { first = localStorage.getItem(KEY); } catch { first = null; } }
  select(valid(first) ? first : 'exposure', { scroll: false });
})();


// --- Boot ------------------------------------------------------------------------------------------
async function boot() {
  try {
    update();
    renderer = await Renderer.create($('view'), $('loupe'));
  } catch (err) {
    const box = $('gpu-error');
    box.hidden = false;
    $('status').textContent = t('status.gpuError');
    $('gpu-error-detail').textContent = String(err.message || err).startsWith('webgpu')
      ? t('gpu.noDevice')
      : String(err.message || err).slice(0, 600);
    document.body.dataset.state = 'error';
    return;
  }
  renderer.setScene(scene());
  update();
  const bar = $('progress');
  const loop = () => {
    const r = renderer.frame();
    if (r.progress) {
      const p = Math.min(...r.progress);
      bar.style.setProperty('--p', p.toFixed(3));
      bar.dataset.done = String(!r.busy);
      $('status').textContent = r.busy ? t('status.rendering', { p: Math.round(p * 100) }) : t('status.ready');
    }
    if (renderer.errors.length) { $('status').textContent = t('status.gpuError'); console.error(renderer.errors.join('\n')); renderer.errors.length = 0; }
    document.body.dataset.state = r.busy ? 'rendering' : 'ready';
    requestAnimationFrame(loop);
  };
  if (params.get('manual')) window.__lvs.step = () => renderer.frame();
  else requestAnimationFrame(loop);
}
window.__lvs = { state, update, shareURL, get renderer() { return renderer; } };
boot();
