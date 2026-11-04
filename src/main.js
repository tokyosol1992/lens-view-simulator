import { CAMERAS, LENSES, APERTURES, SHUTTERS, ISOS, WHITE_BALANCE, STYLES } from './catalog.js';
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

const state = {
  cameraId: params.get('camera') || 'ff24',
  lensId: params.get('lens') || 'n50p',
  sceneId: params.get('scene') || 'garden',
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

// Setups can be linked: ?camera=ff45&lens=p85&scene=street&f=1.4&t=1/60&iso=3200&mode=M
{
  const num = (k) => (params.has(k) ? parseFloat(params.get(k)) : null);
  if (num('f') != null) state.N = num('f');
  if (num('focal') != null) state.focal = num('focal');
  if (['A', 'M', 'MA'].includes(params.get('mode'))) state.mode = params.get('mode');
  if (params.has('t')) { const v = params.get('t'); state.shutter = v.includes('/') ? 1 / parseFloat(v.split('/')[1]) : parseFloat(v); }
  if (num('iso') != null) state.iso = num('iso');
  if (num('ec') != null) state.ec = num('ec');
  if (num('nd') != null) state.nd = num('nd');
  if (['tripod', 'stabilized', 'handheld'].includes(params.get('support'))) state.support = params.get('support');
  if (num('dist') != null) state.distance = num('dist');
  if (num('zoom') != null) state.loupeZoom = num('zoom');
  if (params.has('wb')) state.wb = params.get('wb');
  if (params.has('style')) state.style = params.get('style');
}

let renderer = null;
let shot = null;
let lastFEq = null;
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
function fillSelect(el, items, value) {
  el.innerHTML = items.map((it) => `<option value="${it.id}">${loc(it)}</option>`).join('');
  el.value = value;
}
function renderLabels() {
  applyStatic();
  fillSelect($('camera'), CAMERAS, state.cameraId);
  fillSelect($('lens'), LENSES, state.lensId);
  fillSelect($('wb'), WHITE_BALANCE, state.wb);
  fillSelect($('style'), STYLES, state.style);
  $('scenes').innerHTML = SCENE_LIST.map((s) => `<button type="button" class="chip" data-scene="${s.id}" id="scene-${s.id}">${loc(s)}</button>`).join('');
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
  $('camera').value = cam.id; $('lens').value = ln.id;
  document.querySelectorAll('[data-scene]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === sc.id)));
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  document.querySelectorAll('[data-support]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.support === state.support)));
  document.querySelectorAll('[data-nd]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.nd === state.nd)));
  document.querySelectorAll('[data-zoom]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.zoom === state.loupeZoom)));
  $('lens-note').textContent = loc(ln, 'note');
  $('scene-note').textContent = loc(sc, 'blurb');
  $('cam-spec').textContent = t('cam.spec', {
    w: cam.sensor[0], h: cam.sensor[1], mp: O.megapixels(cam).toFixed(0),
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

// --- Events ---------------------------------------------------------------------------------------
let queued = false;
function schedule() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } }

$('camera').addEventListener('change', (e) => { state.cameraId = e.target.value; schedule(); });
$('lens').addEventListener('change', (e) => {
  const prev = lens();
  state.lensId = e.target.value;
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
$('refocus-chip').addEventListener('click', () => { state.afTracksSubject = true; schedule(); });
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
    const t = clamp((ev.clientX - rect.left - FS_PAD) / (rect.width - FS_PAD * 2), 0, 1);
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
// The Compare group and the phone's shortcut chip over the picture show the same state.
function syncCompareUI() {
  $('hold').textContent = t(state.comparing ? 'compare.replace' : 'compare.hold');
  $('clear-hold').hidden = !state.comparing;
  $('hold-chip').textContent = t(state.comparing ? 'compare.stop' : 'chip.hold');
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
// Language: only the text changes, so the picture is not re-rendered.
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.lang === getLang()) return;
  setLang(b.dataset.lang);
  renderLabels();
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
