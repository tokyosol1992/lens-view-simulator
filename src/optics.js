// Camera and lens maths shared by the UI readouts and the GPU parameters.
// Units: millimetres for image-side quantities, metres for subject distances,
// seconds for time. Thin-lens model with per-lens corrections from the catalog.

export const FF_DIAG = Math.hypot(36, 24); // 43.27 mm
export const MID_GREY = 0.18;
export const RAW_HEADROOM_STOPS = 3.5; // clipping point above metered mid-grey
export const V_CLIP = MID_GREY * 2 ** RAW_HEADROOM_STOPS;
const LAMBDA_MM = 0.00055; // green light
const HANDHELD_TREMOR_HZ = [4.5, 9.0];
const HANDHELD_RAD_PER_S = 0.03; // peak angular velocity of an unstabilised grip

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function sensorDiag(cam) { return Math.hypot(cam.sensor[0], cam.sensor[1]); }
export function cropFactor(cam) { return FF_DIAG / sensorDiag(cam); }
export function pixelPitchMM(cam) { return cam.sensor[0] / cam.pixels[0]; }
export function megapixels(cam) { return cam.pixels[0] * cam.pixels[1] / 1e6; }

// Zoom position 0..1 for a focal length.
export function zoomT(lens, f) {
  const [w, t] = lens.focal;
  return t === w ? 0 : clamp((f - w) / (t - w), 0, 1);
}
export function maxApertureAt(lens, f) {
  // Variable-aperture zooms lose light roughly linearly in log focal length.
  const [w, t] = lens.focal;
  if (t === w) return lens.maxN[0];
  const u = Math.log(f / w) / Math.log(t / w);
  return lens.maxN[0] * (lens.maxN[1] / lens.maxN[0]) ** clamp(u, 0, 1);
}
export function distortionAt(lens, f) { return lerp(lens.distortion[0], lens.distortion[1], zoomT(lens, f)); }

// Image distance of the plane in focus (mm) for object distance S (m).
export function imageDistance(f, Sm) {
  const S = Math.max(Sm * 1000, f * 1.0005);
  return f * S / (S - f);
}
export function magnification(f, Sm) { const S = Sm * 1000; return f / Math.max(S - f, 1e-3); }
// Focus breathing: the focal length that sets framing at this focus distance.
export function framingFocal(lens, f, Sm) { return f * (1 + lens.breathing * magnification(f, Sm)); }
// Bellows factor: a macro lens at 1:1 behaves like it is two stops slower.
export function effectiveN(N, f, Sm) { return N * (1 + magnification(f, Sm)); }

export function fovDeg(sizeMM, fEff) { return 2 * Math.atan(sizeMM / (2 * fEff)) * 180 / Math.PI; }

export function cocLimitMM(cam) { return sensorDiag(cam) / 1500; }
export function hyperfocalMM(f, N, c) { return f * f / (N * c) + f; }
export function dofLimitsM(f, N, c, Sm) {
  const S = Sm * 1000;
  const H = hyperfocalMM(f, N, c);
  const near = S * (H - f) / (H + S - 2 * f);
  const far = S < H ? S * (H - f) / (H - S) : Infinity;
  return { near: near / 1000, far: far / 1000, hyperfocal: H / 1000 };
}
// Blur disc diameter on the sensor (mm) for an object at d (m) when focused at S (m).
export function blurDiscMM(f, N, Sm, dm) {
  const S = Sm * 1000, d = dm === Infinity ? 1e12 : dm * 1000;
  return (f / N) * f / (S - f) * Math.abs(d - S) / d;
}
export function airyDiameterMM(N) { return 2.44 * LAMBDA_MM * N; }
// Aperture where the Airy disc spans two pixels; past this, stopping down costs detail.
export function diffractionLimitN(cam) { return 2 * pixelPitchMM(cam) / (2.44 * LAMBDA_MM); }

// Exposure: multiplier applied to scene radiance (1 = metered exposure).
export function exposureMultiplier({ N, t, iso, ev100, tLoss = 0 }) {
  return t * 2 ** ev100 * (iso / 100) / (N * N) * 2 ** -tLoss;
}
export function autoShutter({ N, iso, ev100, ec, tLoss = 0 }) {
  return 2 ** ec * N * N * 100 / (2 ** ev100 * iso) * 2 ** tLoss;
}
export function autoISO({ N, t, ev100, ec, tLoss = 0 }) {
  return 2 ** ec * N * N * 100 / (2 ** ev100 * t) * 2 ** tLoss;
}
export function nearestIndex(list, value, key = (x) => x) {
  let best = 0, bd = Infinity;
  list.forEach((v, i) => { const d = Math.abs(Math.log(key(v) / value)); if (d < bd) { bd = d; best = i; } });
  return best;
}

// Sensor noise model --------------------------------------------------------------
// Electrons that fill a pixel at base ISO; at higher ISO the same output level
// is reached with fewer electrons (fwc · base / iso), which is what makes noise.
export function fullWellE(cam) { const p = pixelPitchMM(cam) * 1000; return cam.fwcDensity * p * p; }
export function dynamicRangeStops(cam, iso) {
  const signalAtClip = fullWellE(cam) * cam.baseISO / Math.max(iso, cam.baseISO);
  return Math.log2(signalAtClip / cam.readNoise);
}
// SNR of a mid-grey patch, per pixel and normalised to an 8 MP view (print/screen).
export function midGreySNR(cam, iso, areaScale = 1) {
  const e = (MID_GREY / V_CLIP) * fullWellE(cam) * areaScale * cam.baseISO / Math.max(iso, cam.baseISO);
  const rn = cam.readNoise * Math.sqrt(areaScale);
  return e / Math.sqrt(e + rn * rn);
}
export function snrAt8MP(cam, iso) { return midGreySNR(cam, iso, cam.pixels[0] * cam.pixels[1] / 8e6); }

// Camera shake -----------------------------------------------------------------------
export function shakeAmplitudeRad(support, stops) {
  if (support === 'tripod') return 0;
  const reduction = support === 'stabilized' ? 2 ** stops : 1;
  // Tremor amplitude (rad) such that peak angular velocity matches the grip.
  return HANDHELD_RAD_PER_S / (2 * Math.PI * HANDHELD_TREMOR_HZ[0]) / reduction;
}
export const TREMOR_HZ = HANDHELD_TREMOR_HZ;
export function shakeBlurMM(f, t, ampRad) {
  // Peak-to-peak excursion over the exposure, bounded by the tremor amplitude.
  const w = 2 * Math.PI * HANDHELD_TREMOR_HZ[0];
  const swing = 2 * ampRad * Math.abs(Math.sin(Math.min(w * t / 2, Math.PI / 2)));
  return f * swing;
}
export function safeHandheldShutter(fEq, stops) { return 2 ** stops / fEq; }

// Mechanical vignetting: fraction of the aperture left after a clipping rim.
export function circleOverlapFraction(d, r2) {
  const r1 = 1;
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.min(r1, r2) ** 2;
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return (a + b - c) / Math.PI;
}

// Inverse of the radial distortion model used on the GPU (r_u = r_d (1 + k r_d²)).
export function distortForward(rUndist, k) {
  let r = rUndist;
  for (let i = 0; i < 8; i++) {
    const g = r * (1 + k * r * r) - rUndist;
    const dg = 1 + 3 * k * r * r;
    r -= g / dg;
  }
  return r;
}

// Everything the renderer and the readouts need, in one place.
export function resolveShot(cam, lens, scene, s) {
  const f = clamp(s.focal, lens.focal[0], lens.focal[1]);
  const Nmax = maxApertureAt(lens, f);
  const N = Math.max(s.N, Nmax);
  const crop = cropFactor(cam);
  const focusM = clamp(s.focusM, lens.minFocus, 1e4);
  const fEff = framingFocal(lens, f, focusM);
  const Neff = effectiveN(N, f, focusM);
  const c = cocLimitMM(cam);
  const dof = dofLimitsM(f, N, c, focusM);
  const tLoss = lens.transmission + (s.nd || 0);
  const ev100 = scene.ev100;

  let t = s.shutter, iso = s.iso;
  // Effective aperture (bellows) also darkens the image at macro distances.
  const nExpo = Neff;
  if (s.mode === 'A') t = clamp(autoShutter({ N: nExpo, iso, ev100, ec: s.ec, tLoss }), 1 / 8000, 30);
  if (s.mode === 'MA') iso = clamp(autoISO({ N: nExpo, t, ev100, ec: s.ec, tLoss }), cam.baseISO, cam.maxISO);
  iso = clamp(iso, Math.min(cam.baseISO, 50), cam.maxISO);
  const m = exposureMultiplier({ N: nExpo, t, iso, ev100, tLoss });
  const evOffset = Math.log2(m);

  const sensorW = cam.sensor[0], sensorH = cam.sensor[1];
  const diag = sensorDiag(cam);
  const shakeAmp = shakeAmplitudeRad(s.support, cam.stabilization);
  const shakeMM = shakeBlurMM(f, t, shakeAmp);
  const pitch = pixelPitchMM(cam);

  return {
    f, N, Nmax, Neff, crop, focusM, fEff, c, dof, t, iso, m, evOffset, tLoss,
    fEq: f * crop, NEq: N * crop,
    fovH: fovDeg(sensorW, fEff), fovV: fovDeg(sensorH, fEff), fovD: fovDeg(diag, fEff),
    pupilMM: f / N,
    mag: magnification(f, focusM),
    bgBlurMM: blurDiscMM(f, N, focusM, Infinity),
    bgBlurPct: blurDiscMM(f, N, focusM, Infinity) / sensorW * 100,
    airyMM: airyDiameterMM(Neff), dlaN: diffractionLimitN(cam), pitchMM: pitch,
    dr: dynamicRangeStops(cam, iso), snrPx: midGreySNR(cam, iso), snr8: snrAt8MP(cam, iso),
    shakeAmp, shakeMM, shakePx: shakeMM / pitch,
    safeShutter: safeHandheldShutter(f * crop, s.support === 'stabilized' ? cam.stabilization : 0),
    k1: distortionAt(lens, f),
    icOk: lens.imageCircle >= diag * 0.995,
    diag,
  };
}
