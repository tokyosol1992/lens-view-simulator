// Sanity checks for src/optics.js against textbook values.  node tools/check-optics.mjs
import * as O from '../src/optics.js';
import { CAMERAS, LENSES } from '../src/catalog.js';

let failed = 0;
const near = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got.toFixed(4)} (expected ${want} ± ${tol})`);
};

const ff = CAMERAS.find((c) => c.id === 'ff24');
near('50mm horizontal FOV on full frame (°)', O.fovDeg(36, 50), 39.6, 0.05);
near('24mm diagonal FOV on full frame (°)', O.fovDeg(O.FF_DIAG, 24), 84.1, 0.1);
near('APS-C crop factor', O.cropFactor(CAMERAS.find((c) => c.id === 'apsc24')), 1.53, 0.01);
near('MFT crop factor', O.cropFactor(CAMERAS.find((c) => c.id === 'm43')), 2.0, 0.02);
near('Full-frame CoC (mm)', O.cocLimitMM(ff), 0.0288, 0.0005);
const dof = O.dofLimitsM(50, 1.8, 0.03, 3);
near('DOF near, 50mm f/1.8 @3 m (m)', dof.near, 2.82, 0.01);
near('DOF far, 50mm f/1.8 @3 m (m)', dof.far, 3.20, 0.01);
near('Hyperfocal 50mm f/8, c=0.03 (m)', O.hyperfocalMM(50, 8, 0.03) / 1000, 10.47, 0.02);
near('Background blur 50mm f/1.8 @2 m (mm)', O.blurDiscMM(50, 1.8, 2, Infinity), 0.712, 0.002);
near('Airy disc at f/8 (µm)', O.airyDiameterMM(8) * 1000, 10.7, 0.05);
near('Diffraction-limited aperture, 5.98 µm pixel', O.diffractionLimitN(ff), 8.9, 0.1);
near('Exposure multiplier at metered settings', O.exposureMultiplier({ N: 8, t: 1 / 125, iso: 100, ev100: 13 }), 1.0, 0.03);
near('Auto shutter EV15 f/16 ISO 100 (s)', O.autoShutter({ N: 16, iso: 100, ev100: 15, ec: 0 }), 1 / 128, 1e-4);
near('Bellows factor at 1:1', O.effectiveN(2.8, 100, 0.2), 5.6, 0.01);
near('Unit-focus breathing at 0.5 m (mm)', O.framingFocal({ breathing: 1 }, 50, 0.5), 55.6, 0.1);
near('Circle overlap, concentric', O.circleOverlapFraction(0, 1), 1, 1e-9);
near('Circle overlap, half offset', O.circleOverlapFraction(1, 1), 0.391, 0.001);
const k = 0.04, ru = 0.9;
near('Distortion inverse round trip', (() => { const rd = O.distortForward(ru, k); return rd * (1 + k * rd * rd); })(), ru, 1e-9);
near('Mid-grey SNR grows with ISO drop', O.midGreySNR(ff, 100) / O.midGreySNR(ff, 6400) > 5 ? 1 : 0, 1, 0);
for (const l of LENSES) {
  if (l.maxN[0] < 1 || l.minN < l.maxN[1] || l.focal[1] < l.focal[0]) { failed++; console.log('FAIL catalog entry', l.id); }
}
console.log(failed ? `${failed} check(s) failed` : 'all optics checks passed');
process.exit(failed ? 1 : 0);
