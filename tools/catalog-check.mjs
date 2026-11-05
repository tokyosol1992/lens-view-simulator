// Catalog sanity checks: every entry has the fields the optics and GPU code read, ids are unique,
// pixel counts match the sensor's shape, and real products are marked as such and carry Korean text.
//   node tools/catalog-check.mjs
import { CAMERAS, LENSES } from '../src/catalog.js';
import * as O from '../src/optics.js';

let failed = 0;
const check = (label, cond, detail = '') => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`); };

const camFields = ['id', 'name', 'short', 'sensor', 'pixels', 'baseISO', 'maxISO', 'fwcDensity', 'readNoise', 'cfa', 'aa', 'stabilization'];
const lensFields = ['id', 'name', 'focal', 'maxN', 'minN', 'imageCircle', 'blades', 'roundness', 'minFocus', 'breathing', 'distortion', 'vignetting',
  'catEye', 'latCA', 'longCA', 'sa', 'apodization', 'onion', 'fieldCurvature', 'coma', 'softCenter', 'softCorner', 'glow', 'flare', 'veil', 'transmission', 'note'];

const ids = [...CAMERAS, ...LENSES].map((e) => e.id);
check('ids are unique', new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i).join(', '));

for (const c of CAMERAS) {
  const missing = camFields.filter((k) => c[k] === undefined);
  check(`camera ${c.id}: all fields present`, missing.length === 0, missing.join(', '));
  const shape = (c.pixels[0] / c.pixels[1]) / (c.sensor[0] / c.sensor[1]);
  check(`camera ${c.id}: pixel counts match the sensor shape`, Math.abs(shape - 1) < 0.02, `ratio ${shape.toFixed(3)}`);
  const pitch = O.pixelPitchMM(c) * 1000;
  check(`camera ${c.id}: pixel pitch is plausible`, pitch > 1 && pitch < 10, `${pitch.toFixed(2)} µm`);
  check(`camera ${c.id}: ISO range is ordered`, c.baseISO <= c.maxISO);
  if (c.kind === 'product') check(`camera ${c.id}: product has basedOn and Korean name`, CAMERAS.some((b) => b.id === c.basedOn && b.kind !== 'product') && !!c.ko?.name);
}
for (const l of LENSES) {
  const missing = lensFields.filter((k) => l[k] === undefined);
  check(`lens ${l.id}: all fields present`, missing.length === 0, missing.join(', '));
  check(`lens ${l.id}: apertures are ordered`, l.maxN[0] <= l.minN && l.maxN[1] <= l.minN && l.focal[0] <= l.focal[1]);
  check(`lens ${l.id}: blades and roundness are in range`, l.blades >= 5 && l.blades <= 20 && l.roundness >= 0 && l.roundness <= 1);
  if (l.kind === 'product') check(`lens ${l.id}: product has basedOn, Korean name and note`, LENSES.some((b) => b.id === l.basedOn && b.kind !== 'product') && !!l.ko?.name && !!l.ko?.note);
}
// Each real lens must cover at least one real or class body, otherwise it can never be used without dark corners.
for (const l of LENSES.filter((x) => x.kind === 'product')) {
  const fits = CAMERAS.filter((c) => l.imageCircle >= O.sensorDiag(c) * 0.995);
  check(`lens ${l.id}: covers at least one body`, fits.length > 0, `${fits.length} bodies`);
}
process.exit(failed ? 1 : 0);
