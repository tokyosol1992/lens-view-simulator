// Mirrorless lens line-ups by brand.
//
// Each row records what a customer compares first: brand, mount, native format, name, focal
// length, maximum aperture, closest focus and aperture blade count. The optical character
// (distortion, chromatic aberration, softness, flare ...) is NOT measured: it is generated
// from the lens class (ultra-wide .. long tele), its speed and a quality tier. Rows flagged
// 'est' have a closest-focus or blade value that still needs checking against the maker's data.
//
// Row: [brand, mount, format, model, focal, maxN, minFocus m, blades, tier, flags...]
//   focal / maxN: a number, or [wide, tele] for zooms.   tier: 'pro' | 'std'
//   flags: 'macro' | 'est' | 'stf:<T-stop>' (apodization filter)

export const BRANDS = [
  { id: 'sony', name: 'Sony', ko: { name: '소니' } },
  { id: 'nikon', name: 'Nikon', ko: { name: '니콘' } },
  { id: 'canon', name: 'Canon', ko: { name: '캐논' } },
  { id: 'fuji', name: 'Fujifilm', ko: { name: '후지필름' } },
  { id: 'panasonic', name: 'Panasonic', ko: { name: '파나소닉' } },
  { id: 'om', name: 'OM System', ko: { name: 'OM 시스템' } },
  { id: 'sigma', name: 'Sigma', ko: { name: '시그마' } },
  { id: 'tamron', name: 'Tamron', ko: { name: '탐론' } },
  { id: 'viltrox', name: 'Viltrox', ko: { name: '빌트록스' } },
  { id: 'generic', name: 'Generic class', ko: { name: '일반 규격 (브랜드 없음)' } },
];

// Full-frame-equivalent factor and image circle (mm) of each native format.
export const FORMATS = {
  one: { crop: 2.73, circle: 16, label: '1-inch', ko: { label: '1인치' } },
  m43: { crop: 2, circle: 21.6, label: 'Micro Four Thirds', ko: { label: '마이크로 포서드' } },
  apsc: { crop: 1.53, circle: 28.4, label: 'APS-C', ko: { label: 'APS-C' } },
  ff: { crop: 1, circle: 43.3, label: 'Full frame', ko: { label: '풀프레임' } },
  mf44: { crop: 0.79, circle: 55, label: 'Medium format 44×33', ko: { label: '중형 44×33' } },
  mf645: { crop: 0.65, circle: 69, label: 'Medium format 645', ko: { label: '중형 645' } },
};

// [model rows] ------------------------------------------------------------------------
const ROWS = [
  // Sony E (full frame)
  ['sony', 'E', 'ff', 'FE 14mm f/1.8 GM', 14, 1.8, 0.25, 11, 'pro'],
  ['sony', 'E', 'ff', 'FE 24mm f/1.4 GM', 24, 1.4, 0.24, 11, 'pro'],
  ['sony', 'E', 'ff', 'FE 35mm f/1.4 GM', 35, 1.4, 0.27, 11, 'pro'],
  ['sony', 'E', 'ff', 'FE 50mm f/1.2 GM', 50, 1.2, 0.40, 11, 'pro'],
  ['sony', 'E', 'ff', 'FE 50mm f/1.8', 50, 1.8, 0.45, 7, 'std'],
  ['sony', 'E', 'ff', 'FE 85mm f/1.4 GM', 85, 1.4, 0.85, 11, 'pro'],
  ['sony', 'E', 'ff', 'FE 100mm f/2.8 STF GM OSS', 100, 2.8, 0.57, 11, 'pro', 'stf:5.7'],
  ['sony', 'E', 'ff', 'FE 90mm f/2.8 Macro G OSS', 90, 2.8, 0.28, 9, 'pro', 'macro'],
  ['sony', 'E', 'ff', 'FE 135mm f/1.8 GM', 135, 1.8, 0.70, 11, 'pro'],
  ['sony', 'E', 'ff', 'FE 16-35mm f/2.8 GM II', [16, 35], 2.8, 0.22, 11, 'pro'],
  ['sony', 'E', 'ff', 'FE 24-70mm f/2.8 GM II', [24, 70], 2.8, 0.21, 11, 'pro'],
  ['sony', 'E', 'ff', 'FE 70-200mm f/2.8 GM OSS II', [70, 200], 2.8, 0.40, 11, 'pro'],
  ['sony', 'E', 'ff', 'FE 200-600mm f/5.6-6.3 G OSS', [200, 600], [5.6, 6.3], 2.4, 11, 'pro'],

  // Nikon Z
  ['nikon', 'Z', 'ff', 'Z 14-24mm f/2.8 S', [14, 24], 2.8, 0.28, 9, 'pro'],
  ['nikon', 'Z', 'ff', 'Z 26mm f/2.8', 26, 2.8, 0.20, 7, 'std'],
  ['nikon', 'Z', 'ff', 'Z 35mm f/1.8 S', 35, 1.8, 0.25, 9, 'pro'],
  ['nikon', 'Z', 'ff', 'Z 40mm f/2', 40, 2, 0.29, 7, 'std'],
  ['nikon', 'Z', 'ff', 'Z 50mm f/1.2 S', 50, 1.2, 0.45, 11, 'pro'],
  ['nikon', 'Z', 'ff', 'Z 50mm f/1.8 S', 50, 1.8, 0.40, 9, 'pro'],
  ['nikon', 'Z', 'ff', 'Z 85mm f/1.8 S', 85, 1.8, 0.80, 9, 'pro'],
  ['nikon', 'Z', 'ff', 'Z MC 105mm f/2.8 VR S', 105, 2.8, 0.29, 9, 'pro', 'macro'],
  ['nikon', 'Z', 'ff', 'Z 24-70mm f/2.8 S', [24, 70], 2.8, 0.38, 9, 'pro'],
  ['nikon', 'Z', 'ff', 'Z 24-120mm f/4 S', [24, 120], 4, 0.35, 7, 'pro'],
  ['nikon', 'Z', 'ff', 'Z 70-200mm f/2.8 VR S', [70, 200], 2.8, 0.50, 9, 'pro'],
  ['nikon', 'Z', 'ff', 'Z 100-400mm f/4.5-5.6 VR S', [100, 400], [4.5, 5.6], 0.75, 9, 'pro'],
  ['nikon', 'Z', 'apsc', 'Z DX 16-50mm f/3.5-6.3 VR', [16, 50], [3.5, 6.3], 0.25, 7, 'std'],

  // Canon RF
  ['canon', 'RF', 'ff', 'RF 16mm f/2.8 STM', 16, 2.8, 0.13, 7, 'std'],
  ['canon', 'RF', 'ff', 'RF 35mm f/1.8 Macro IS STM', 35, 1.8, 0.17, 7, 'std'],
  ['canon', 'RF', 'ff', 'RF 50mm f/1.2L USM', 50, 1.2, 0.40, 10, 'pro'],
  ['canon', 'RF', 'ff', 'RF 50mm f/1.8 STM', 50, 1.8, 0.30, 7, 'std'],
  ['canon', 'RF', 'ff', 'RF 85mm f/1.2L USM', 85, 1.2, 0.85, 9, 'pro'],
  ['canon', 'RF', 'ff', 'RF 100mm f/2.8L Macro IS USM', 100, 2.8, 0.26, 9, 'pro', 'macro'],
  ['canon', 'RF', 'ff', 'RF 135mm f/1.8L IS USM', 135, 1.8, 0.90, 9, 'pro', 'est'],
  ['canon', 'RF', 'ff', 'RF 15-35mm f/2.8L IS USM', [15, 35], 2.8, 0.28, 9, 'pro'],
  ['canon', 'RF', 'ff', 'RF 24-70mm f/2.8L IS USM', [24, 70], 2.8, 0.21, 9, 'pro'],
  ['canon', 'RF', 'ff', 'RF 28-70mm f/2L USM', [28, 70], 2, 0.39, 9, 'pro'],
  ['canon', 'RF', 'ff', 'RF 70-200mm f/2.8L IS USM', [70, 200], 2.8, 0.70, 9, 'pro'],
  ['canon', 'RF', 'ff', 'RF 100-500mm f/4.5-7.1L IS USM', [100, 500], [4.5, 7.1], 0.90, 9, 'pro'],
  ['canon', 'RF', 'apsc', 'RF-S 18-45mm f/4.5-6.3 IS STM', [18, 45], [4.5, 6.3], 0.25, 7, 'std'],

  // Fujifilm X (APS-C)
  ['fuji', 'X', 'apsc', 'XF 16mm f/1.4 R WR', 16, 1.4, 0.15, 9, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 18mm f/1.4 R LM WR', 18, 1.4, 0.20, 9, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 23mm f/1.4 R LM WR', 23, 1.4, 0.19, 9, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 33mm f/1.4 R LM WR', 33, 1.4, 0.30, 9, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 35mm f/1.4 R', 35, 1.4, 0.28, 7, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 56mm f/1.2 R', 56, 1.2, 0.70, 7, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 90mm f/2 R LM WR', 90, 2, 0.60, 9, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 8-16mm f/2.8 R LM WR', [8, 16], 2.8, 0.25, 9, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 16-55mm f/2.8 R LM WR', [16, 55], 2.8, 0.40, 9, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 18-55mm f/2.8-4 R LM OIS', [18, 55], [2.8, 4], 0.30, 7, 'std'],
  ['fuji', 'X', 'apsc', 'XF 50-140mm f/2.8 R LM OIS WR', [50, 140], 2.8, 1.0, 9, 'pro'],
  ['fuji', 'X', 'apsc', 'XF 100-400mm f/4.5-5.6 R LM OIS WR', [100, 400], [4.5, 5.6], 1.75, 9, 'pro'],
  // Fujifilm GF (medium format 44×33)
  ['fuji', 'GF', 'mf44', 'GF 23mm f/4 R LM WR', 23, 4, 0.45, 9, 'pro'],
  ['fuji', 'GF', 'mf44', 'GF 45mm f/2.8 R WR', 45, 2.8, 0.45, 9, 'pro'],
  ['fuji', 'GF', 'mf44', 'GF 63mm f/2.8 R WR', 63, 2.8, 0.50, 9, 'pro'],
  ['fuji', 'GF', 'mf44', 'GF 80mm f/1.7 R WR', 80, 1.7, 0.70, 9, 'pro'],
  ['fuji', 'GF', 'mf44', 'GF 110mm f/2 R LM WR', 110, 2, 0.90, 9, 'pro'],
  ['fuji', 'GF', 'mf44', 'GF 120mm f/4 R LM OIS WR Macro', 120, 4, 0.40, 9, 'pro', 'macro'],
  ['fuji', 'GF', 'mf44', 'GF 32-64mm f/4 R LM WR', [32, 64], 4, 0.50, 9, 'pro'],

  // Panasonic Lumix S (L-mount, full frame)
  ['panasonic', 'L', 'ff', 'Lumix S 35mm f/1.8', 35, 1.8, 0.24, 9, 'pro', 'est'],
  ['panasonic', 'L', 'ff', 'Lumix S 50mm f/1.8', 50, 1.8, 0.45, 9, 'pro', 'est'],
  ['panasonic', 'L', 'ff', 'Lumix S PRO 50mm f/1.4', 50, 1.4, 0.45, 11, 'pro', 'est'],
  ['panasonic', 'L', 'ff', 'Lumix S 85mm f/1.8', 85, 1.8, 0.80, 9, 'pro', 'est'],
  ['panasonic', 'L', 'ff', 'Lumix S PRO 24-70mm f/2.8', [24, 70], 2.8, 0.37, 9, 'pro', 'est'],
  ['panasonic', 'L', 'ff', 'Lumix S 24-105mm f/4 Macro O.I.S.', [24, 105], 4, 0.38, 9, 'pro', 'est'],
  ['panasonic', 'L', 'ff', 'Lumix S PRO 70-200mm f/2.8 O.I.S.', [70, 200], 2.8, 0.65, 9, 'pro', 'est'],
  // Panasonic Micro Four Thirds
  ['panasonic', 'MFT', 'm43', 'Lumix G 20mm f/1.7 II', 20, 1.7, 0.20, 7, 'std', 'est'],
  ['panasonic', 'MFT', 'm43', 'Leica DG Summilux 25mm f/1.4 II', 25, 1.4, 0.25, 9, 'pro', 'est'],
  ['panasonic', 'MFT', 'm43', 'Lumix G 42.5mm f/1.7', 42.5, 1.7, 0.31, 7, 'std', 'est'],
  ['panasonic', 'MFT', 'm43', 'Leica DG Vario-Elmarit 12-60mm f/2.8-4', [12, 60], [2.8, 4], 0.20, 7, 'pro', 'est'],

  // OM System / Olympus Micro Four Thirds
  ['om', 'MFT', 'm43', 'M.Zuiko 17mm f/1.2 PRO', 17, 1.2, 0.20, 9, 'pro'],
  ['om', 'MFT', 'm43', 'M.Zuiko 25mm f/1.2 PRO', 25, 1.2, 0.30, 9, 'pro'],
  ['om', 'MFT', 'm43', 'M.Zuiko 45mm f/1.2 PRO', 45, 1.2, 0.50, 9, 'pro'],
  ['om', 'MFT', 'm43', 'M.Zuiko 12-40mm f/2.8 PRO II', [12, 40], 2.8, 0.20, 7, 'pro'],
  ['om', 'MFT', 'm43', 'M.Zuiko 40-150mm f/2.8 PRO', [40, 150], 2.8, 0.70, 9, 'pro'],

  // Sigma (E · L, full frame DG DN; APS-C DC DN)
  ['sigma', 'E · L', 'ff', '14mm f/1.4 DG DN Art', 14, 1.4, 0.28, 11, 'pro'],
  ['sigma', 'E · L', 'ff', '24mm f/1.4 DG DN Art', 24, 1.4, 0.25, 11, 'pro'],
  ['sigma', 'E · L', 'ff', '35mm f/1.4 DG DN Art', 35, 1.4, 0.30, 11, 'pro'],
  ['sigma', 'E · L', 'ff', '50mm f/1.4 DG DN Art', 50, 1.4, 0.40, 11, 'pro'],
  ['sigma', 'E · L', 'ff', '85mm f/1.4 DG DN Art', 85, 1.4, 0.85, 11, 'pro'],
  ['sigma', 'E · L', 'ff', '105mm f/2.8 DG DN Macro Art', 105, 2.8, 0.295, 9, 'pro', 'macro'],
  ['sigma', 'E · L', 'ff', '16-28mm f/2.8 DG DN Contemporary', [16, 28], 2.8, 0.25, 9, 'std'],
  ['sigma', 'E · L', 'ff', '24-70mm f/2.8 DG DN Art', [24, 70], 2.8, 0.18, 11, 'pro'],
  ['sigma', 'E · L', 'ff', '28-70mm f/2.8 DG DN Contemporary', [28, 70], 2.8, 0.19, 9, 'std'],
  ['sigma', 'E · L', 'ff', '150-600mm f/5-6.3 DG DN OS Sports', [150, 600], [5, 6.3], 0.58, 11, 'pro'],
  ['sigma', 'E · X · L', 'apsc', '16mm f/1.4 DC DN Contemporary', 16, 1.4, 0.25, 9, 'std'],
  ['sigma', 'E · X · L', 'apsc', '30mm f/1.4 DC DN Contemporary', 30, 1.4, 0.30, 9, 'std'],
  ['sigma', 'E · X · L', 'apsc', '56mm f/1.4 DC DN Contemporary', 56, 1.4, 0.50, 9, 'std'],

  // Tamron (Sony E)
  ['tamron', 'E', 'ff', '17-28mm f/2.8 Di III RXD', [17, 28], 2.8, 0.19, 7, 'std'],
  ['tamron', 'E', 'ff', '28-75mm f/2.8 Di III VXD G2', [28, 75], 2.8, 0.18, 9, 'pro', 'est'],
  ['tamron', 'E', 'ff', '35-150mm f/2-2.8 Di III VXD', [35, 150], [2, 2.8], 0.33, 9, 'pro', 'est'],
  ['tamron', 'E', 'ff', '70-180mm f/2.8 Di III VXD G2', [70, 180], 2.8, 0.85, 9, 'pro', 'est'],
  ['tamron', 'E', 'ff', '150-500mm f/5-6.7 Di III VC VXD', [150, 500], [5, 6.7], 0.60, 9, 'pro', 'est'],
  ['tamron', 'E', 'ff', '20mm f/2.8 Di III OSD M1:2', 20, 2.8, 0.11, 7, 'std', 'est'],
  ['tamron', 'E', 'ff', '24mm f/2.8 Di III OSD M1:2', 24, 2.8, 0.11, 7, 'std', 'est'],
  ['tamron', 'E', 'ff', '35mm f/2.8 Di III OSD M1:2', 35, 2.8, 0.15, 7, 'std', 'est'],

  // Viltrox (E · Z · X versions)
  ['viltrox', 'E · Z · X', 'apsc', 'AF 23mm f/1.4', 23, 1.4, 0.30, 9, 'std'],
  ['viltrox', 'E · Z · X', 'apsc', 'AF 33mm f/1.4', 33, 1.4, 0.30, 9, 'std', 'est'],
  ['viltrox', 'E · Z · X', 'apsc', 'AF 56mm f/1.4', 56, 1.4, 0.60, 9, 'std', 'est'],
  ['viltrox', 'X · Z', 'apsc', 'AF 75mm f/1.2', 75, 1.2, 0.70, 9, 'std', 'est'],
  ['viltrox', 'E', 'ff', 'AF 85mm f/1.8 II', 85, 1.8, 0.80, 9, 'std'],

  // Medium format 645 class: no mirrorless line-up exists, so these are generic classes.
  ['generic', '—', 'mf645', '645 80mm f/2.8', 80, 2.8, 0.70, 9, 'pro', 'est'],
  ['generic', '—', 'mf645', '645 50mm f/3.5 wide', 50, 3.5, 0.50, 9, 'pro', 'est'],
  ['generic', '—', 'mf645', '645 120mm f/4 macro', 120, 4, 0.40, 9, 'pro', 'macro', 'est'],
  ['generic', '—', 'mf645', '645 150mm f/3.2 portrait', 150, 3.2, 1.0, 9, 'pro', 'est'],
];

// Lens classes by full-frame-equivalent focal length (centre of the zoom range) --------
const CLASSES = {
  uw: { dist: 0.03, vig: 0.65, cat: 0.55, lat: 0.0007, lon: 0.0003, coma: 0.5, sc: 3.5, sk: 13, flare: 1.2, glow: 0.02, onion: 0.05, fc: 0.015, sa: 0.3, veil: 0.011 },
  wide: { dist: 0.015, vig: 0.8, cat: 0.55, lat: 0.0004, lon: 0.0005, coma: 0.3, sc: 3, sk: 10, flare: 1.0, glow: 0.03, onion: 0.05, fc: 0.01, sa: 0.35, veil: 0.009 },
  std: { dist: 0.006, vig: 0.95, cat: 0.5, lat: 0.0003, lon: 0.0005, coma: 0.15, sc: 3, sk: 9, flare: 0.7, glow: 0.03, onion: 0.03, fc: 0.007, sa: 0.35, veil: 0.007 },
  tele: { dist: -0.004, vig: 1.0, cat: 0.4, lat: 0.0002, lon: 0.0006, coma: 0.08, sc: 3, sk: 7, flare: 0.6, glow: 0.025, onion: 0, fc: 0.005, sa: 0.4, veil: 0.006 },
  long: { dist: -0.008, vig: 1.0, cat: 0.3, lat: 0.0002, lon: 0.0004, coma: 0.05, sc: 3, sk: 7, flare: 0.5, glow: 0.015, onion: 0, fc: 0.004, sa: 0.3, veil: 0.006 },
};
export const classOfEq = (eq) => (eq <= 21 ? 'uw' : eq <= 38 ? 'wide' : eq <= 75 ? 'std' : eq <= 150 ? 'tele' : 'long');

const NOTE = {
  uw: ['Ultra-wide: stretched perspective, corner fall-off and coma on point lights.', '초광각: 원근이 과장되고 모서리가 어두워지며 점광원에 코마가 생깁니다.'],
  wide: ['Wide: generous field of view with some corner softness and cat-eye bokeh at the edges.', '광각: 넓은 화각, 모서리가 약간 흐리고 가장자리 빛망울이 고양이 눈 모양이 됩니다.'],
  std: ['Standard view: natural perspective and a well-corrected image.', '표준 화각: 자연스러운 원근과 수차가 잘 잡힌 화질입니다.'],
  tele: ['Portrait to short tele: compressed perspective and strong background separation.', '인물·중망원: 압축된 원근과 강한 배경 분리가 특징입니다.'],
  long: ['Long telephoto: very narrow view and heavy compression; slow lenses need fast shutters.', '초망원: 화각이 매우 좁고 압축이 강합니다. 어두운 렌즈는 빠른 셔터가 필요합니다.'],
  fast: ['Very fast: thin focus plane and some glow wide open.', '아주 밝음: 초점면이 얇고 개방에서 약간의 글로우가 있습니다.'],
  stf: ['Apodization filter: feathered, smooth bokeh edges at the cost of about two stops of light.', '아포다이제이션 필터: 빛망울 가장자리가 부드럽지만 약 2스톱 어두워집니다.'],
  macro: ['Macro: close focusing; effective aperture drops as you get closer.', '매크로: 근접 촬영이 가능하며 가까울수록 실효 조리개가 어두워집니다.'],
  zoom: ['Zoom: distortion changes across the range.', '줌: 초점 거리에 따라 왜곡이 달라집니다.'],
  std_tier: ['Compact or budget build: more colour fringing and softer corners than the premium class.', '소형·보급형: 고급형보다 색 번짐이 많고 모서리가 더 흐립니다.'],
};

const BLADE_ROUND = { 7: 0.5, 9: 0.75, 10: 0.8, 11: 0.9 };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lerp = (a, b, t) => a + (b - a) * t;

function build([brandId, mount, fmt, model, focal, maxN, minFocus, blades, tier, ...flags]) {
  const brand = BRANDS.find((b) => b.id === brandId);
  const F = FORMATS[fmt];
  const fw = Array.isArray(focal) ? focal[0] : focal, ft = Array.isArray(focal) ? focal[1] : focal;
  const isZoom = fw !== ft;
  const nW = Array.isArray(maxN) ? maxN[0] : maxN, nT = Array.isArray(maxN) ? maxN[1] : maxN;
  const eqW = fw * F.crop, eqT = ft * F.crop;
  const cls = CLASSES[classOfEq(Math.sqrt(eqW * eqT))];
  const kW = CLASSES[classOfEq(eqW)].dist, kT = CLASSES[classOfEq(eqT)].dist;
  const macro = flags.includes('macro');
  const stf = flags.find((f) => f.startsWith('stf:'));
  const budget = tier === 'std';
  const fast = nW <= 1.4, vfast = nW <= 1.2;
  const q = budget ? 1.7 : 1;
  const T = stf ? 2 * Math.log2(parseFloat(stf.slice(4)) / nW) : (isZoom ? 0.25 : 0.1) + (fast ? 0.05 : 0);
  const roundness = Math.max(0.1, (BLADE_ROUND[blades] ?? 0.85) - (budget ? 0.2 : 0));
  const kinds = [classOfEq(Math.sqrt(eqW * eqT))];
  const notes = [NOTE[kinds[0]]];
  if (fast) notes.push(NOTE.fast);
  if (stf) notes.push(NOTE.stf);
  if (macro) notes.push(NOTE.macro);
  if (isZoom) notes.push(NOTE.zoom);
  if (budget) notes.push(NOTE.std_tier);
  const id = `${brandId}-${slug(model)}`;
  const fullName = (lang) => `${lang === 'ko' ? brand.ko.name : brand.name} ${model}`;
  return {
    id, group: brandId, brand: brandId, mount, format: fmt,
    name: fullName('en'), focal: [fw, ft], maxN: [nW, nT],
    minN: fast ? 16 : (eqT > 150 || macro || F.crop < 1 ? 32 : 22),
    ko: { name: fullName('ko'), note: notes.map((n) => n[1]).join(' ') },
    note: notes.map((n) => n[0]).join(' '),
    imageCircle: F.circle, blades, roundness, minFocus,
    breathing: macro ? 1.0 : isZoom ? 0.6 : 0.4,
    distortion: [isZoom ? kW : cls.dist, isZoom ? kT : cls.dist],
    vignetting: cls.vig - (fast ? 0.05 : 0),
    catEye: Math.min(1.1, cls.cat + (vfast ? 0.1 : 0)),
    latCA: cls.lat * q, longCA: cls.lon * q,
    sa: cls.sa, apodization: stf ? 1 : 0, onion: cls.onion * (budget ? 2 : 1),
    fieldCurvature: cls.fc * (budget ? 1.6 : 1), coma: cls.coma * (budget ? 1.6 : 1) * (vfast ? 1.2 : 1),
    softCenter: cls.sc * (budget ? 1.4 : 1) * (fast ? 1.15 : 1), softCorner: cls.sk * (budget ? 1.6 : 1) * (fast ? 1.2 : 1),
    glow: cls.glow * (vfast ? 1.6 : fast ? 1.3 : 1) * (budget ? 1.2 : 1), flare: cls.flare * (budget ? 1.3 : 1), veil: cls.veil,
    transmission: T,
    est: flags.includes('est'),
  };
}

export const BRAND_LENSES = ROWS.map(build);
