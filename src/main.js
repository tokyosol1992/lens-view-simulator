import { CAMERAS, LENSES, CAMERA_GROUPS, LENS_GROUPS, APERTURES, SHUTTERS, ISOS, WHITE_BALANCE, STYLES } from './catalog.js';
import { PRESETS } from './presets.js';
import * as O from './optics.js';
import { getScene, SCENE_LIST } from './scenes.js';
import { Renderer, cameraBasis } from './gpu/renderer.js';
import { t, loc, getLang, setLang, applyStatic } from './i18n.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const QUALITY = {
  draft: { scale: 0.6, cap: 1100, samples: 40, frames: 12, loupeFrames: 20 },
  standard: { scale: 1, cap: 1800, samples: 64, frames: 24, loupeFrames: 32 },
  high: { scale: 1, cap: 2400, samples: 96, frames: 48, loupeFrames: 64 },
};

// Setups can be linked: ?camera=ff45&lens=p85&scene=street&f=1.4&t=1/60&iso=3200&mode=M
function makeState(params) {
  const num = (k) => (params.has(k) ? parseFloat(params.get(k)) : null);
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
  };
  if (num('f') != null) st.N = num('f');
  if (num('focal') != null) st.focal = num('focal');
  if (['A', 'M', 'MA'].includes(params.get('mode'))) st.mode = params.get('mode');
  if (params.has('t')) { const v = params.get('t'); st.shutter = v.includes('/') ? 1 / parseFloat(v.split('/')[1]) : parseFloat(v); }
  if (num('iso') != null) st.iso = num('iso');
  if (num('ec') != null) st.ec = num('ec');
  if (num('nd') != null) st.nd = num('nd');
  if (['tripod', 'stabilized', 'handheld'].includes(params.get('support'))) st.support = params.get('support');
  if (num('dist') != null) st.distance = num('dist');
  if (params.get('keep') === '0') st.keepFraming = false;
  if (num('zoom') != null) st.loupeZoom = num('zoom');
  if (WHITE_BALANCE.some((w) => w.id === params.get('wb'))) st.wb = params.get('wb');
  if (STYLES.some((x) => x.id === params.get('style'))) st.style = params.get('style');
  return st;
}
const state = makeState(params);

let renderer = null;
let shot = null;
let lastFEq = null;
let lastCamId = null;
let lastUI = null;

const norm3 = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const camera = () => CAMERAS.find((c) => c.id === state.cameraId);
const lens = () => LENSES.find((l) => l.id === state.lensId);
const scene = () => getScene(state.sceneId);

// --- Formatting -----------------------------------------------------------------------
const fmtN = (n) => (n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n).toString());
function fmtShutter(t) {
  if (t >= 0.3) return (t >= 10 ? Math.round(t) : +t.toFixed(1)) + '″';
  return '1/' + Math.round(1 / t);
}
function fmtDist(m) {
  if (!isFinite(m) || m > 5000) return '∞';
  if (m < 1) return Math.round(m * 100) + ' cm';
  if (m < 10) return m.toFixed(2) + ' m';
  return m.toFixed(m < 100 ? 1 : 0) + ' m';
}
const fmtEV = (e) => (e >= 0 ? '+' : '−') + Math.abs(e).toFixed(1);

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
// Lens names carry a marker when the lens does not cover the chosen sensor.
const lensLabel = (l) => (O.lensCovers(l, camera()) ? loc(l) : `${loc(l)} · ${t('lens.optVignette')}`);
function fillLenses() { fillSelect($('lens'), LENSES, state.lensId, LENS_GROUPS, lensLabel); }
function renderLabels() {
  applyStatic();
  fillSelect($('camera'), CAMERAS, state.cameraId, CAMERA_GROUPS);
  fillLenses();
  $('presets').innerHTML = PRESETS.map((p) => `<button type="button" class="chip" data-preset="${p.id}" id="preset-${p.id}">${loc(p)}</button>`).join('');
  fillSelect($('wb'), WHITE_BALANCE, state.wb);
  fillSelect($('style'), STYLES, state.style);
  $('scenes').innerHTML = SCENE_LIST.map((s) => `<button type="button" class="chip" data-scene="${s.id}" id="scene-${s.id}">${loc(s)}</button>`).join('');
  $('hold').textContent = t(state.comparing ? 'compare.replace' : 'compare.hold');
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
  // A newly chosen body starts inside its own ISO range (a cinema body's base is ISO 800).
  if (lastCamId !== cam.id) { if (lastCamId != null || !params.has('iso')) state.iso = clamp(state.iso, cam.baseISO, cam.maxISO); lastCamId = cam.id; }
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
    ...res, eye, basis,
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
  let cx = state.af[0] * W / 2, cy = state.af[1] * H / 2;
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
  return list;
}
function isoList(cam) { return ISOS.filter((i) => i >= Math.min(cam.baseISO, 100) / 2 && i <= cam.maxISO && (i >= cam.baseISO || i >= 50)); }

function renderUI(cam, ln, sc, r) {
  // Selections
  $('camera').value = cam.id;
  if ($('lens').dataset.cam !== cam.id + getLang()) { fillLenses(); $('lens').dataset.cam = cam.id + getLang(); }
  $('lens').value = ln.id;
  document.querySelectorAll('[data-scene]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === sc.id)));
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  document.querySelectorAll('[data-support]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.support === state.support)));
  document.querySelectorAll('[data-nd]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.nd === state.nd)));
  document.querySelectorAll('[data-zoom]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.zoom === state.loupeZoom)));
  $('lens-note').textContent = loc(ln, 'note');
  {
    const covers = O.lensCovers(ln, cam);
    const m = fmtDist(ln.minFocus);
    const spec = ln.focal[0] === ln.focal[1]
      ? t('lens.specFixed', { f: ln.focal[0], n: fmtN(ln.maxN[0]), m })
      : t('lens.specZoom', { f1: ln.focal[0], f2: ln.focal[1], n1: fmtN(ln.maxN[0]), n2: fmtN(ln.maxN[1]), m });
    const el = $('lens-spec');
    el.textContent = `${spec} · ${t('lens.blades', { b: ln.blades })} · ${t(covers ? 'lens.covers' : 'lens.vignettes')}`;
    el.classList.toggle('bad', !covers);
  }
  document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === activePreset)));
  $('scene-note').textContent = loc(sc, 'blurb');
  $('cam-spec').textContent = t('cam.spec', {
    w: cam.sensor[0], h: cam.sensor[1], mp: O.megapixels(cam).toFixed(0), c: O.cropFactor(cam).toFixed(2),
    p: (O.pixelPitchMM(cam) * 1000).toFixed(2), aa: t(cam.aa ? 'cam.aa' : 'cam.noAa'),
  });

  // Focal length
  const zoomRow = $('focal-row');
  zoomRow.hidden = ln.focal[0] === ln.focal[1];
  $('focal').min = ln.focal[0]; $('focal').max = ln.focal[1]; $('focal').value = r.f;
  $('focal-val').textContent = `${Math.round(r.f)} mm`;

  // Exposure dials
  const aps = apertureList(ln);
  setDial('aperture', aps, r.N, (n) => 'f/' + fmtN(n));
  setDial('shutter', SHUTTERS, r.t, () => fmtShutter(r.t));
  $('shutter-val').textContent = fmtShutter(r.t);
  const isos = isoList(cam);
  setDial('iso', isos, r.iso, () => Math.round(r.iso).toString());
  $('iso-val').textContent = Math.round(r.iso).toString();
  $('shutter').disabled = state.mode === 'A';
  $('iso').disabled = state.mode === 'MA';
  $('shutter-row').classList.toggle('is-auto', state.mode === 'A');
  $('iso-row').classList.toggle('is-auto', state.mode === 'MA');
  $('ec').value = state.ec; $('ec-val').textContent = fmtEV(state.ec);
  $('ec-row').hidden = state.mode === 'M';

  // Distance & focus
  $('distance').min = sc.camera.min; $('distance').max = sc.camera.max; $('distance').value = state.distance;
  $('distance-val').textContent = fmtDist(state.distance);
  $('keep').checked = state.keepFraming;
  $('focus-val').textContent = fmtDist(r.focusM);
  $('focus-src').textContent = t(state.afTracksSubject ? 'focus.subject' : 'focus.manual');

  // Picture
  $('wb').value = state.wb; $('style').value = state.style; $('zebra').checked = state.zebra;
  $('grid').checked = state.grid;

  // Viewfinder info line
  $('vf-mode').textContent = { A: 'A', M: 'M', MA: 'M' }[state.mode];
  $('vf-shutter').textContent = fmtShutter(r.t);
  $('vf-aperture').textContent = 'F' + fmtN(r.N);
  $('vf-iso').textContent = 'ISO ' + Math.round(r.iso) + (state.mode === 'MA' ? ' A' : '');
  $('vf-ev').textContent = fmtEV(state.mode === 'M' ? r.evOffset : state.ec);
  $('vf-focal').textContent = `${Math.round(r.f)}mm`;

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

  drawFocusScale(ln, r);
  drawMeter(state.mode === 'M' ? r.evOffset : state.ec);
  positionOverlay();
}

// --- Focus scale (lens barrel style, linear in 1/distance) ----------------------------------
function focusT(d, dmin) { return d === Infinity || d > 1e4 ? 1 : clamp(1 - dmin / d, 0, 1); }
function focusFromT(t, dmin) { return t >= 0.999 ? 1e4 : dmin / (1 - t); }
function drawFocusScale(ln, r) {
  const svg = $('focus-scale');
  const W = svg.clientWidth || 600, Hh = 56;
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  const pad = 14, w = W - pad * 2;
  const x = (d) => pad + focusT(d, ln.minFocus) * w;
  const marks = [0.25, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3, 5, 10, 20, Infinity].filter((d) => d >= ln.minFocus - 1e-6);
  let s = `<line x1="${pad}" y1="30" x2="${pad + w}" y2="30" class="fs-axis"/>`;
  const nearX = x(r.dof.near), farX = x(r.dof.far);
  s += `<rect x="${nearX}" y="22" width="${Math.max(2, farX - nearX)}" height="16" rx="2" class="fs-dof"/>`;
  const hx = x(r.dof.hyperfocal);
  s += `<line x1="${hx}" y1="18" x2="${hx}" y2="42" class="fs-hyper"/><text x="${hx}" y="54" class="fs-hyper-t">H</text>`;
  let lastX = -99;
  for (const d of marks) {
    const mx = x(d);
    s += `<line x1="${mx}" y1="26" x2="${mx}" y2="34" class="fs-tick"/>`;
    if (mx - lastX > 22) { s += `<text x="${mx}" y="14" class="fs-label">${d === Infinity ? '∞' : d < 1 ? d.toFixed(d < 0.5 ? 2 : 1).replace(/^0/, '') : d}</text>`; lastX = mx; }
  }
  svg.setAttribute('aria-valuetext', fmtDist(r.focusM));
  const fx = x(r.focusM);
  s += `<path d="M${fx} 20 l-6 -9 h12 z" class="fs-pointer"/><line x1="${fx}" y1="20" x2="${fx}" y2="40" class="fs-pointer-line"/>`;
  svg.innerHTML = s;
}
function drawMeter(ev) {
  const svg = $('meter');
  const W = 220, Hh = 34;
  const pad = 10, w = W - pad * 2;
  const x = (e) => pad + (clamp(e, -3, 3) + 3) / 6 * w;
  let s = '';
  for (let e = -3; e <= 3.001; e += 1 / 3) {
    const major = Math.abs(e - Math.round(e)) < 1e-6;
    s += `<line x1="${x(e)}" y1="${major ? 6 : 10}" x2="${x(e)}" y2="16" class="${major ? 'm-major' : 'm-minor'}"/>`;
    if (major) s += `<text x="${x(e)}" y="30" class="m-label">${e === 0 ? '0' : (e > 0 ? '+' : '−') + Math.abs(Math.round(e))}</text>`;
  }
  const ex = x(ev);
  s += `<rect x="${Math.min(x(0), ex)}" y="17" width="${Math.abs(ex - x(0)) || 1.5}" height="3" class="m-bar"/>`;
  s += `<path d="M${ex} 21 l-4 6 h8 z" class="m-pointer"/>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  svg.innerHTML = s;
}

function positionOverlay() {
  const vf = $('viewfinder');
  const af = $('af-box');
  const w = vf.clientWidth, h = vf.clientHeight;
  af.style.left = `${(state.af[0] * 0.5 + 0.5) * w}px`;
  af.style.top = `${(0.5 - state.af[1] * 0.5) * h}px`;
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
  $('ab-labels').hidden = !state.comparing;
  if (state.held) {
    const h = state.held;
    $('held-desc').textContent = `${loc(h.cam)} · ${loc(h.lens)} · f/${fmtN(h.N)} ${fmtShutter(h.t)} ISO ${Math.round(h.iso)}`;
  }
}

// --- Shareable setup --------------------------------------------------------------------------
// The page keeps the current setup in its address, so a reload or a copied link reopens it.
let activePreset = null;
const MANAGED = ['camera', 'lens', 'scene', 'focal', 'f', 't', 'iso', 'mode', 'ec', 'nd', 'support', 'dist', 'keep', 'zoom', 'wb', 'style'];
function shutterParam(tm) { return tm < 0.3 ? '1/' + Math.round(1 / tm) : String(+tm.toFixed(2)); }
function setupParams(keepExtras) {
  const p = new URLSearchParams(keepExtras ? location.search : '');
  MANAGED.forEach((k) => p.delete(k));
  if (!keepExtras) for (const k of ['q']) if (params.has(k) && params.get(k) !== 'standard') p.set(k, params.get(k));
  const ln = lens();
  p.set('camera', state.cameraId); p.set('lens', state.lensId); p.set('scene', state.sceneId);
  if (ln.focal[0] !== ln.focal[1]) p.set('focal', String(Math.round(state.focal)));
  p.set('f', fmtN(state.N)); p.set('mode', state.mode);
  if (state.mode !== 'A') p.set('t', shutterParam(state.shutter));
  if (state.mode === 'M') p.set('iso', String(Math.round(state.iso)));
  if (state.mode !== 'M' && state.ec) p.set('ec', state.ec.toFixed(2));
  if (state.nd) p.set('nd', String(state.nd));
  p.set('support', state.support);
  if (state.distance != null) p.set('dist', state.distance.toFixed(2));
  if (!state.keepFraming) p.set('keep', '0');
  if (state.loupeZoom !== 1) p.set('zoom', String(state.loupeZoom));
  if (state.wb !== 'auto') p.set('wb', state.wb);
  if (state.style !== 'standard') p.set('style', state.style);
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
async function copyLink() {
  const url = new URL(location.href);
  url.search = setupParams(false).toString();
  const btn = $('copy-link');
  let ok = false;
  try { await navigator.clipboard.writeText(url.href); ok = true; } catch {
    try {
      const ta = document.createElement('textarea'); ta.value = url.href; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
    } catch { /* no clipboard */ }
  }
  btn.textContent = t(ok ? 'actions.copied' : 'actions.copyFail');
  clearTimeout(copyLink.timer);
  copyLink.timer = setTimeout(() => { btn.textContent = t('actions.copy'); }, 2200);
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
  $('lens').dataset.cam = '';
  schedule();
}

// --- Events ---------------------------------------------------------------------------------------
let queued = false;
function schedule() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } }

$('camera').addEventListener('change', (e) => { state.cameraId = e.target.value; activePreset = null; schedule(); });
$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  const p = PRESETS.find((x) => x.id === b.dataset.preset);
  applySetup(p.q, p.id);
  updateLook();
});
$('copy-link').addEventListener('click', copyLink);
$('reset').addEventListener('click', () => { applySetup(''); updateLook(); });
$('lens').addEventListener('change', (e) => {
  const prev = lens();
  state.lensId = e.target.value;
  activePreset = null;
  const ln = lens();
  if (ln.focal[0] !== prev.focal[0] || ln.focal[1] !== prev.focal[1]) state.focal = ln.focal[0] === ln.focal[1] ? ln.focal[0] : clamp(state.focal, ln.focal[0], ln.focal[1]);
  state.N = O.maxApertureAt(ln, state.focal);
  schedule();
});
$('focal').addEventListener('input', (e) => { state.focal = +e.target.value; schedule(); });
$('scenes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-scene]');
  if (!b) return;
  state.sceneId = b.dataset.scene;
  state.distance = null; state.afTracksSubject = true; lastFEq = null;
  clearHold();
  if (renderer) renderer.setScene(scene());
  schedule();
});
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; schedule(); }));
document.querySelectorAll('[data-support]').forEach((b) => b.addEventListener('click', () => { state.support = b.dataset.support; schedule(); }));
document.querySelectorAll('[data-nd]').forEach((b) => b.addEventListener('click', () => { state.nd = +b.dataset.nd; schedule(); }));
document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => { state.loupeZoom = +b.dataset.zoom; schedule(); }));
$('aperture').addEventListener('input', (e) => { state.N = apertureList(lens())[+e.target.value]; schedule(); });
$('shutter').addEventListener('input', (e) => { state.shutter = SHUTTERS[+e.target.value][1]; schedule(); });
$('iso').addEventListener('input', (e) => { state.iso = isoList(camera())[+e.target.value]; schedule(); });
$('ec').addEventListener('input', (e) => { state.ec = +e.target.value; schedule(); });
$('distance').addEventListener('input', (e) => { state.distance = +e.target.value; lastFEq = null; state.afTracksSubject = true; schedule(); });
$('keep').addEventListener('change', (e) => { state.keepFraming = e.target.checked; schedule(); });
$('refocus').addEventListener('click', () => { state.afTracksSubject = true; schedule(); });
$('wb').addEventListener('change', (e) => { state.wb = e.target.value; schedule(); });
$('style').addEventListener('change', (e) => { state.style = e.target.value; schedule(); });
$('zebra').addEventListener('change', (e) => { state.zebra = e.target.checked; schedule(); });
$('grid').addEventListener('change', (e) => { state.grid = e.target.checked; schedule(); });

// Focus scale: drag to focus
(() => {
  const svg = $('focus-scale');
  let dragging = false;
  const set = (ev) => {
    const rect = svg.getBoundingClientRect();
    const t = clamp((ev.clientX - rect.left - 14) / (rect.width - 28), 0, 1);
    state.focusM = focusFromT(t, lens().minFocus);
    state.afTracksSubject = false;
    schedule();
  };
  svg.addEventListener('pointerdown', (e) => { dragging = true; svg.setPointerCapture(e.pointerId); set(e); });
  svg.addEventListener('pointermove', (e) => { if (dragging) set(e); });
  svg.addEventListener('pointerup', () => { dragging = false; });
  svg.addEventListener('keydown', (e) => {
    const t = focusT(state.focusM, lens().minFocus);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      state.focusM = focusFromT(clamp(t + (e.key === 'ArrowRight' ? 0.01 : -0.01), 0, 1), lens().minFocus);
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
    const cam = camera();
    const W = cam.sensor[0], H = cam.sensor[1];
    const [ux, uy] = undistortMM(nx * W / 2, ny * H / 2, shot.k1, shot.icR);
    const v = renderer.views.main, vp = renderer.viewParams.main;
    const ix = Math.floor((ux - vp.inRect[0]) / vp.pxIn), iy = Math.floor((vp.inRect[3] - uy) / vp.pxIn);
    const z = await renderer.depthAt(ix, iy);
    if (z == null || !v) return;
    state.af = [clamp(nx, -0.98, 0.98), clamp(ny, -0.98, 0.98)];
    state.afTracksSubject = false;
    state.focusM = clamp(z > 5e4 ? 1e4 : z, lens().minFocus, 1e4);
    schedule();
  });
})();

// A/B compare
function holdA() {
  if (!renderer) return;
  renderer.capture();
  const cam = camera(), ln = lens();
  state.held = { cam: { name: cam.short }, lens: ln, N: shot.N, t: shot.t, iso: shot.iso, loupeKey: loupeKey() };
  state.comparing = true;
  $('hold').textContent = t('compare.replace');
  $('clear-hold').hidden = false;
  updateViews();
  renderer.present();
}
function clearHold() {
  state.comparing = false; state.held = null;
  $('hold').textContent = t('compare.hold');
  $('clear-hold').hidden = true;
  renderer?.clearCapture();
  if (renderer && shot) updateViews();
}
$('hold').addEventListener('click', holdA);
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

// --- Boot ------------------------------------------------------------------------------------------
async function boot() {
  update();
  try {
    renderer = await Renderer.create($('view'), $('loupe'));
  } catch (err) {
    const box = $('gpu-error');
    box.hidden = false;
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
window.__lvs = { state, update, get renderer() { return renderer; } };
boot();
