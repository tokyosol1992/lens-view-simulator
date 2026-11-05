// Product catalog and dial scales.
//
// Bodies and lenses are representative of current product classes, not specific
// commercial models. Replace or extend these entries with a real catalog; every
// field is consumed by src/optics.js and the GPU pipeline.

// Each entry may carry `ko` names and notes for the Korean interface.

// Camera bodies ---------------------------------------------------------------
// sensor: active area in mm; pixels: output resolution.
// fwcDensity: full-well electrons per µm² of pixel area (sets highlight headroom
//   and shot noise); readNoise: electrons RMS at base ISO.
// cfa: 'bayer' | 'xtrans6' (6×6 non-Bayer) ; aa: optical low-pass filter present.
// stabilization: stops of shake reduction (in-body or, for fixed-lens, optical).
export const CAMERAS = [
  {
    id: 'mf102', group: 'mf', name: 'Medium format 102 MP', short: 'MF 102MP',
    ko: { name: '중형 102MP' },
    sensor: [43.8, 32.9], pixels: [11648, 8736], baseISO: 100, maxISO: 12800,
    fwcDensity: 2300, readNoise: 2.2, cfa: 'bayer', aa: false, stabilization: 5,
  },
  {
    id: 'ff61', group: 'ff', name: 'Full frame 61 MP', short: 'FF 61MP',
    ko: { name: '풀프레임 61MP' },
    sensor: [35.7, 23.8], pixels: [9504, 6336], baseISO: 100, maxISO: 32000,
    fwcDensity: 2200, readNoise: 2.6, cfa: 'bayer', aa: false, stabilization: 5.5,
  },
  {
    id: 'ff45', group: 'ff', name: 'Full frame 45 MP', short: 'FF 45MP',
    ko: { name: '풀프레임 45MP' },
    sensor: [36.0, 24.0], pixels: [8192, 5464], baseISO: 100, maxISO: 51200,
    fwcDensity: 2200, readNoise: 2.5, cfa: 'bayer', aa: false, stabilization: 6,
  },
  {
    id: 'ff24', group: 'ff', name: 'Full frame 24 MP', short: 'FF 24MP',
    ko: { name: '풀프레임 24MP' },
    sensor: [35.9, 23.9], pixels: [6000, 4000], baseISO: 100, maxISO: 51200,
    fwcDensity: 2000, readNoise: 3.0, cfa: 'bayer', aa: true, stabilization: 5,
  },
  {
    id: 'ff12', group: 'ff', name: 'Full frame 12 MP low-light', short: 'FF 12MP',
    ko: { name: '풀프레임 12MP 저조도' },
    sensor: [35.6, 23.8], pixels: [4240, 2832], baseISO: 80, maxISO: 102400,
    fwcDensity: 1900, readNoise: 3.4, cfa: 'bayer', aa: true, stabilization: 5,
  },
  {
    id: 'apsc40', group: 'apsc', name: 'APS-C 40 MP, 6×6 colour filter', short: 'APS-C 40MP',
    ko: { name: 'APS-C 40MP, 6×6 컬러 필터' },
    sensor: [23.5, 15.6], pixels: [7728, 5152], baseISO: 125, maxISO: 12800,
    fwcDensity: 2200, readNoise: 2.0, cfa: 'xtrans6', aa: false, stabilization: 7,
  },
  {
    id: 'apsc24', group: 'apsc', name: 'APS-C 24 MP', short: 'APS-C 24MP',
    ko: { name: 'APS-C 24MP' },
    sensor: [23.5, 15.6], pixels: [6000, 4000], baseISO: 100, maxISO: 51200,
    fwcDensity: 2100, readNoise: 2.4, cfa: 'bayer', aa: true, stabilization: 5,
  },
  {
    id: 'm43', group: 'm43', name: 'Micro Four Thirds 20 MP', short: 'M4/3 20MP',
    ko: { name: '마이크로 포서드 20MP' },
    sensor: [17.3, 13.0], pixels: [5184, 3888], baseISO: 200, maxISO: 25600,
    fwcDensity: 2100, readNoise: 2.4, cfa: 'bayer', aa: false, stabilization: 7,
  },
  {
    id: 'one', group: 'compact', name: '1-inch compact 20 MP', short: '1" 20MP',
    ko: { name: '1인치 컴팩트 20MP' },
    sensor: [13.2, 8.8], pixels: [5472, 3648], baseISO: 125, maxISO: 12800,
    fwcDensity: 2000, readNoise: 2.0, cfa: 'bayer', aa: false, stabilization: 3,
  },
  {
    id: 'phone', group: 'compact', name: 'Phone-size 1/1.3″ 12 MP', short: '1/1.3" 12MP',
    ko: { name: '스마트폰급 1/1.3″ 12MP' },
    sensor: [9.8, 7.35], pixels: [4000, 3000], baseISO: 50, maxISO: 6400,
    fwcDensity: 1500, readNoise: 1.6, cfa: 'bayer', aa: false, stabilization: 3,
  },
  {
    id: 'mf50', group: 'mf', name: 'Medium format 50 MP', short: 'MF 50MP',
    ko: { name: '중형 50MP' },
    sensor: [43.8, 32.9], pixels: [8256, 6192], baseISO: 100, maxISO: 12800,
    fwcDensity: 2400, readNoise: 2.4, cfa: 'bayer', aa: false, stabilization: 6,
  },
  {
    id: 'ff33', group: 'ff', name: 'Full frame 33 MP all-rounder', short: 'FF 33MP',
    ko: { name: '풀프레임 33MP 범용' },
    sensor: [35.9, 23.9], pixels: [7008, 4672], baseISO: 100, maxISO: 51200,
    fwcDensity: 2100, readNoise: 2.7, cfa: 'bayer', aa: false, stabilization: 7,
  },
  {
    id: 'apsc26', group: 'apsc', name: 'APS-C 26 MP', short: 'APS-C 26MP',
    ko: { name: 'APS-C 26MP' },
    sensor: [23.5, 15.7], pixels: [6240, 4160], baseISO: 160, maxISO: 12800,
    fwcDensity: 2200, readNoise: 2.2, cfa: 'bayer', aa: false, stabilization: 6,
  },
  {
    id: 'apsc24c', group: 'apsc', name: 'APS-C 24 MP, 1.6× crop', short: 'APS-C 1.6× 24MP',
    ko: { name: 'APS-C 24MP, 1.6배 크롭' },
    sensor: [22.3, 14.9], pixels: [6000, 4000], baseISO: 100, maxISO: 51200,
    fwcDensity: 2000, readNoise: 2.6, cfa: 'bayer', aa: true, stabilization: 4,
  },
  {
    id: 'cine', group: 'cine', name: 'Super 35 cinema 4K (1.9:1)', short: 'S35 4K',
    ko: { name: '슈퍼 35 시네마 4K (1.9:1)' },
    sensor: [24.9, 13.1], pixels: [4096, 2160], baseISO: 800, maxISO: 25600,
    fwcDensity: 2600, readNoise: 3.2, cfa: 'bayer', aa: true, stabilization: 0,
  },
  {
    id: 'compact12', group: 'compact', name: 'Small-sensor 1/2.3″ superzoom 20 MP', short: '1/2.3" 20MP',
    ko: { name: '소형 센서 1/2.3″ 슈퍼줌 20MP' },
    sensor: [6.08, 4.56], pixels: [5184, 3888], baseISO: 100, maxISO: 3200,
    fwcDensity: 1100, readNoise: 1.4, cfa: 'bayer', aa: true, stabilization: 4,
  },
];

// Lenses ----------------------------------------------------------------------
// focal: [wide, tele] mm (equal for primes); maxN: [at wide, at tele].
// imageCircle: mm diameter the lens covers (43.3 = full frame, 28.4 = APS-C).
// Optical character (all dimensionless unless noted):
//   blades, roundness (0 straight blades, 1 circular), minFocus (m),
//   breathing: framing change with focus (1 = whole-lens focusing, 0 = none),
//   distortion: [k1 wide, k1 tele], + barrel / − pincushion at image-circle edge,
//   vignetting: natural fall-off exponent scale (1 = cos⁴ law),
//   catEye: mechanical vignetting of out-of-focus highlights at the edge,
//   latCA / longCA: lateral and longitudinal chromatic aberration,
//   sa: spherical aberration bokeh character (+ smooth background, − soap-bubble),
//   apodization, onion (aspheric ring texture), fieldCurvature (mm),
//   coma (corner point smear), softCenter / softCorner (µm blur spot wide open),
//   glow (wide-open halo), flare (ghosting), veil (contrast loss),
//   transmission: light loss in stops (T-stop minus f-stop).
export const LENSES = [
  {
    id: 'uw14', group: 'wide', name: '14mm f/2.8 ultra-wide', focal: [14, 14], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '14mm f/2.8 초광각', note: '앞알이 튀어나온 설계: 주변부가 크게 어두워지고, 점광원에 코마가 생기며, 14갈래 빛갈라짐이 선명합니다.' },
    imageCircle: 43.3, blades: 7, roundness: 0.2, minFocus: 0.28, breathing: 0.2,
    distortion: [0.045, 0.045], vignetting: 0.62, catEye: 0.55, latCA: 0.0011, longCA: 0.0002,
    sa: 0.3, apodization: 0, onion: 0.05, fieldCurvature: 0.02, coma: 0.9,
    softCenter: 4, softCorner: 22, glow: 0.02, flare: 1.4, veil: 0.012, transmission: 0.2,
    note: 'Bulbous front element: strong corner fall-off, coma on point lights, sharp 14-point sun stars.',
  },
  {
    id: 'w24', group: 'wide', name: '24mm f/1.4 wide prime', focal: [24, 24], maxN: [1.4, 1.4], minN: 16,
    ko: { name: '24mm f/1.4 광각 단렌즈', note: '밝은 광각: 모서리로 갈수록 고양이 눈 보케가 나오고 개방에서 코마가 보입니다.' },
    imageCircle: 43.3, blades: 9, roundness: 0.6, minFocus: 0.25, breathing: 0.3,
    distortion: [0.022, 0.022], vignetting: 0.75, catEye: 0.65, latCA: 0.0006, longCA: 0.0007,
    sa: 0.35, apodization: 0, onion: 0.05, fieldCurvature: 0.015, coma: 0.6,
    softCenter: 3, softCorner: 16, glow: 0.035, flare: 1.0, veil: 0.01, transmission: 0.15,
    note: 'Fast wide: cat-eye bokeh toward the corners and visible coma wide open.',
  },
  {
    id: 's35', group: 'standard', name: '35mm f/1.8 compact', focal: [35, 35], maxN: [1.8, 1.8], minN: 22,
    ko: { name: '35mm f/1.8 소형', note: '7매 원형 조리개의 가벼운 일상용 단렌즈입니다.' },
    imageCircle: 43.3, blades: 7, roundness: 0.6, minFocus: 0.25, breathing: 0.4,
    distortion: [0.012, 0.012], vignetting: 0.85, catEye: 0.45, latCA: 0.0005, longCA: 0.0006,
    sa: 0.4, apodization: 0, onion: 0.1, fieldCurvature: 0.01, coma: 0.25,
    softCenter: 3.5, softCorner: 12, glow: 0.03, flare: 0.9, veil: 0.008, transmission: 0.1,
    note: 'Light everyday prime with 7 rounded blades.',
  },
  {
    id: 'n50b', group: 'standard', name: '50mm f/1.8 budget', focal: [50, 50], maxN: [1.8, 1.8], minN: 22,
    ko: { name: '50mm f/1.8 보급형', note: '직선 조리개 날 때문에 조이면 칠각형 빛망울이 생기고, 개방에서는 글로우와 색 번짐이 있습니다.' },
    imageCircle: 43.3, blades: 7, roundness: 0.0, minFocus: 0.35, breathing: 1.0,
    distortion: [0.008, 0.008], vignetting: 0.9, catEye: 0.45, latCA: 0.0006, longCA: 0.0011,
    sa: 0.6, apodization: 0, onion: 0.18, fieldCurvature: 0.01, coma: 0.2,
    softCenter: 6, softCorner: 18, glow: 0.07, flare: 1.1, veil: 0.01, transmission: 0.1,
    note: 'Straight blades give heptagon highlights once stopped down; glow and colour fringes wide open.',
  },
  {
    id: 'n50p', group: 'standard', name: '50mm f/1.2 premium', focal: [50, 50], maxN: [1.2, 1.2], minN: 16,
    ko: { name: '50mm f/1.2 고급형', note: '11매 원형 조리개와 42mm 입사동: 아주 얇은 초점면과 둥근 빛망울.' },
    imageCircle: 43.3, blades: 11, roundness: 0.9, minFocus: 0.4, breathing: 0.3,
    distortion: [0.006, 0.006], vignetting: 0.95, catEye: 0.6, latCA: 0.0003, longCA: 0.0005,
    sa: 0.35, apodization: 0, onion: 0.0, fieldCurvature: 0.006, coma: 0.15,
    softCenter: 3, softCorner: 10, glow: 0.03, flare: 0.6, veil: 0.006, transmission: 0.15,
    note: '11 rounded blades and a 42 mm entrance pupil: very thin focus, round highlights.',
  },
  {
    id: 'p85', group: 'tele', name: '85mm f/1.4 portrait', focal: [85, 85], maxN: [1.4, 1.4], minN: 16,
    ko: { name: '85mm f/1.4 인물용', note: '인물 사진다운 압축감과 부드러운 배경 흐림.' },
    imageCircle: 43.3, blades: 11, roundness: 0.85, minFocus: 0.8, breathing: 0.4,
    distortion: [-0.004, -0.004], vignetting: 1.0, catEye: 0.45, latCA: 0.0002, longCA: 0.0007,
    sa: 0.4, apodization: 0, onion: 0.0, fieldCurvature: 0.005, coma: 0.1,
    softCenter: 3, softCorner: 8, glow: 0.03, flare: 0.6, veil: 0.006, transmission: 0.1,
    note: 'Classic portrait compression with smooth background blur.',
  },
  {
    id: 't135', group: 'tele', name: '135mm f/1.8 telephoto', focal: [135, 135], maxN: [1.8, 1.8], minN: 22,
    ko: { name: '135mm f/1.8 망원', note: '길고 밝아서 이 목록에서 배경 분리가 가장 강합니다.' },
    imageCircle: 43.3, blades: 11, roundness: 0.9, minFocus: 0.7, breathing: 0.5,
    distortion: [-0.006, -0.006], vignetting: 1.0, catEye: 0.3, latCA: 0.0002, longCA: 0.0004,
    sa: 0.35, apodization: 0, onion: 0.0, fieldCurvature: 0.004, coma: 0.05,
    softCenter: 2.5, softCorner: 6, glow: 0.02, flare: 0.5, veil: 0.005, transmission: 0.1,
    note: 'Long and fast: the strongest background separation in the catalog.',
  },
  {
    id: 'z2470', group: 'zoom', name: '24–70mm f/2.8 standard zoom', focal: [24, 70], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '24–70mm f/2.8 표준 줌', note: '24mm의 술통형 왜곡이 70mm에서는 실패형 왜곡으로 바뀝니다.' },
    imageCircle: 43.3, blades: 11, roundness: 0.8, minFocus: 0.38, breathing: 0.5,
    distortion: [0.032, -0.012], vignetting: 0.85, catEye: 0.35, latCA: 0.0007, longCA: 0.0003,
    sa: 0.25, apodization: 0, onion: 0.08, fieldCurvature: 0.012, coma: 0.3,
    softCenter: 4, softCorner: 13, glow: 0.015, flare: 1.0, veil: 0.009, transmission: 0.25,
    note: 'Barrel distortion at 24mm turns into pincushion at 70mm.',
  },
  {
    id: 'z70200', group: 'zoom', name: '70–200mm f/2.8 telephoto zoom', focal: [70, 200], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '70–200mm f/2.8 망원 줌', note: '내부 초점 줌: 가까이 초점을 맞추면 화각이 눈에 띄게 좁아집니다.' },
    imageCircle: 43.3, blades: 11, roundness: 0.85, minFocus: 1.0, breathing: 0.7,
    distortion: [-0.004, -0.012], vignetting: 1.0, catEye: 0.3, latCA: 0.0003, longCA: 0.0003,
    sa: 0.3, apodization: 0, onion: 0.06, fieldCurvature: 0.006, coma: 0.1,
    softCenter: 3, softCorner: 8, glow: 0.015, flare: 0.8, veil: 0.008, transmission: 0.25,
    note: 'Internal-focus zoom: framing tightens noticeably at close focus.',
  },
  {
    id: 'm100', group: 'macro', name: '100mm f/2.8 macro', focal: [100, 100], maxN: [2.8, 2.8], minN: 32,
    ko: { name: '100mm f/2.8 매크로', note: '1:1까지 초점이 맞습니다. 가까울수록 실효 조리개가 어두워집니다.' },
    imageCircle: 43.3, blades: 9, roundness: 0.7, minFocus: 0.28, breathing: 1.0,
    distortion: [0.0, 0.0], vignetting: 1.0, catEye: 0.15, latCA: 0.0001, longCA: 0.0006,
    sa: 0.2, apodization: 0, onion: 0.0, fieldCurvature: 0.002, coma: 0.05,
    softCenter: 2.5, softCorner: 5, glow: 0.01, flare: 0.6, veil: 0.006, transmission: 0.2,
    note: 'Focuses to 1:1. Effective aperture drops as you get closer.',
  },
  {
    id: 'a90', group: 'special', name: '90mm f/2.8 apodization (T4.5)', focal: [90, 90], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '90mm f/2.8 아포다이제이션 (T4.5)', note: '내장 방사형 필터가 모든 빛망울 가장자리를 부드럽게 하지만 약 1⅓스톱 어두워집니다.' },
    imageCircle: 43.3, blades: 11, roundness: 1.0, minFocus: 0.85, breathing: 0.4,
    distortion: [0.0, 0.0], vignetting: 1.0, catEye: 0.2, latCA: 0.0002, longCA: 0.0003,
    sa: 0.1, apodization: 1.0, onion: 0.0, fieldCurvature: 0.003, coma: 0.05,
    softCenter: 3, softCorner: 6, glow: 0.01, flare: 0.5, veil: 0.006, transmission: 1.35,
    note: 'Built-in radial filter feathers every highlight; costs about 1⅓ stops of light.',
  },
  {
    id: 'v58', group: 'special', name: '58mm f/2 vintage swirl', focal: [58, 58], maxN: [2.0, 2.0], minN: 16,
    ko: { name: '58mm f/2 빈티지 스월', note: '싱글 코팅 고전 렌즈: 소용돌이 배경, 낮은 대비의 글로우, 많은 플레어.' },
    imageCircle: 43.3, blades: 8, roundness: 0.15, minFocus: 0.5, breathing: 1.0,
    distortion: [0.004, 0.004], vignetting: 1.0, catEye: 1.1, latCA: 0.0008, longCA: 0.0014,
    sa: 0.2, apodization: 0, onion: 0.0, fieldCurvature: 0.06, coma: 0.7,
    softCenter: 9, softCorner: 34, glow: 0.12, flare: 2.4, veil: 0.03, transmission: 0.3,
    note: 'Single-coated classic: swirling background, low-contrast glow and lots of flare.',
  },
  {
    id: 'b100', group: 'special', name: '100mm f/2.8 soap-bubble triplet', focal: [100, 100], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '100mm f/2.8 비눗방울 트리플릿', note: '과보정 트리플릿: 배경 빛망울이 테두리가 밝은 비눗방울처럼 보입니다.' },
    imageCircle: 43.3, blades: 15, roundness: 1.0, minFocus: 1.0, breathing: 1.0,
    distortion: [0.0, 0.0], vignetting: 1.0, catEye: 0.35, latCA: 0.0004, longCA: 0.0008,
    sa: -0.95, apodization: 0, onion: 0.0, fieldCurvature: 0.03, coma: 0.3,
    softCenter: 7, softCorner: 26, glow: 0.08, flare: 1.4, veil: 0.015, transmission: 0.2,
    note: 'Over-corrected triplet: background highlights become bright-rimmed bubbles.',
  },
  {
    id: 'k1855', group: 'apsc', name: '18–55mm f/3.5–5.6 APS-C kit', focal: [18, 55], maxN: [3.5, 5.6], minN: 22,
    ko: { name: '18–55mm f/3.5–5.6 APS-C 번들', note: 'APS-C용입니다. 더 큰 센서에서는 이미지 서클이 모자라 모서리가 어둡습니다.' },
    imageCircle: 28.4, blades: 7, roundness: 0.3, minFocus: 0.25, breathing: 0.6,
    distortion: [0.05, -0.01], vignetting: 0.8, catEye: 0.5, latCA: 0.0016, longCA: 0.0004,
    sa: 0.3, apodization: 0, onion: 0.12, fieldCurvature: 0.02, coma: 0.4,
    softCenter: 6, softCorner: 24, glow: 0.02, flare: 1.2, veil: 0.012, transmission: 0.2,
    note: 'Made for APS-C. On a larger sensor the image circle leaves dark corners.',
  },
  {
    id: 'z1635', group: 'zoom', name: '16–35mm f/4 wide zoom', focal: [16, 35], maxN: [4, 4], minN: 22,
    ko: { name: '16–35mm f/4 광각 줌', note: '16mm에서 술통형 왜곡과 모서리 어두움이 크고, 35mm로 가면 거의 사라집니다.' },
    imageCircle: 43.3, blades: 7, roundness: 0.5, minFocus: 0.28, breathing: 0.4,
    distortion: [0.04, 0.006], vignetting: 0.8, catEye: 0.5, latCA: 0.0009, longCA: 0.0003,
    sa: 0.3, apodization: 0, onion: 0.08, fieldCurvature: 0.015, coma: 0.5,
    softCenter: 4, softCorner: 16, glow: 0.015, flare: 1.1, veil: 0.01, transmission: 0.2,
    note: 'Strong barrel distortion and corner fall-off at 16mm that fade by 35mm.',
  },
  {
    id: 's40', group: 'standard', name: '40mm f/2.8 pancake', focal: [40, 40], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '40mm f/2.8 팬케이크', note: '아주 얇고 가볍지만 모서리 선예도와 빛망울 품질은 한 단계 낮습니다.' },
    imageCircle: 43.3, blades: 7, roundness: 0.3, minFocus: 0.3, breathing: 0.6,
    distortion: [0.014, 0.014], vignetting: 0.85, catEye: 0.4, latCA: 0.0007, longCA: 0.0006,
    sa: 0.4, apodization: 0, onion: 0.12, fieldCurvature: 0.015, coma: 0.3,
    softCenter: 4.5, softCorner: 16, glow: 0.025, flare: 1.0, veil: 0.01, transmission: 0.1,
    note: 'Very slim and light; corners and bokeh quality are a step down from the bigger primes.',
  },
  {
    id: 'z100400', group: 'zoom', name: '100–400mm f/4.5–5.6 super-telephoto zoom', focal: [100, 400], maxN: [4.5, 5.6], minN: 32,
    ko: { name: '100–400mm f/4.5–5.6 초망원 줌', note: '야생동물·스포츠용. 400mm에서 화각이 매우 좁고, 압축감이 강하며 f/5.6으로 어두워집니다.' },
    imageCircle: 43.3, blades: 9, roundness: 0.85, minFocus: 1.8, breathing: 0.8,
    distortion: [-0.004, -0.014], vignetting: 1.0, catEye: 0.25, latCA: 0.0003, longCA: 0.0004,
    sa: 0.3, apodization: 0, onion: 0.05, fieldCurvature: 0.006, coma: 0.08,
    softCenter: 4, softCorner: 9, glow: 0.015, flare: 0.8, veil: 0.008, transmission: 0.3,
    note: 'Wildlife and sports reach: very narrow view and strong compression at 400mm, with a slower f/5.6.',
  },
  {
    id: 'mf80', group: 'mf', name: 'MF 80mm f/1.9 standard', focal: [80, 80], maxN: [1.9, 1.9], minN: 22,
    ko: { name: '중형 80mm f/1.9 표준', note: '중형 센서를 덮는 큰 이미지 서클. 풀프레임 환산 약 63mm의 표준 화각입니다.' },
    imageCircle: 55, blades: 9, roundness: 0.8, minFocus: 0.7, breathing: 0.4,
    distortion: [0.004, 0.004], vignetting: 0.95, catEye: 0.4, latCA: 0.0003, longCA: 0.0005,
    sa: 0.35, apodization: 0, onion: 0.0, fieldCurvature: 0.006, coma: 0.12,
    softCenter: 3, softCorner: 8, glow: 0.025, flare: 0.6, veil: 0.006, transmission: 0.15,
    note: 'Large image circle for medium format; about a 63 mm full-frame equivalent view.',
  },
  {
    id: 'mf45', group: 'mf', name: 'MF 45mm f/4 wide', focal: [45, 45], maxN: [4, 4], minN: 32,
    ko: { name: '중형 45mm f/4 광각', note: '풍경용 광각. 환산 약 35mm이고 모서리까지 안정적입니다.' },
    imageCircle: 55, blades: 9, roundness: 0.7, minFocus: 0.4, breathing: 0.3,
    distortion: [0.01, 0.01], vignetting: 0.9, catEye: 0.4, latCA: 0.0004, longCA: 0.0003,
    sa: 0.3, apodization: 0, onion: 0.05, fieldCurvature: 0.008, coma: 0.2,
    softCenter: 3, softCorner: 9, glow: 0.01, flare: 0.8, veil: 0.007, transmission: 0.15,
    note: 'Landscape wide, about a 35 mm full-frame equivalent view, steady into the corners.',
  },
  {
    id: 'ac16', group: 'apsc', name: 'APS-C 16mm f/1.4 wide prime', focal: [16, 16], maxN: [1.4, 1.4], minN: 16,
    ko: { name: 'APS-C 16mm f/1.4 광각 단렌즈', note: '환산 약 24mm의 밝은 광각. 풀프레임에 달면 모서리가 어두워집니다.' },
    imageCircle: 28.4, blades: 9, roundness: 0.7, minFocus: 0.15, breathing: 0.3,
    distortion: [0.018, 0.018], vignetting: 0.8, catEye: 0.55, latCA: 0.0006, longCA: 0.0007,
    sa: 0.35, apodization: 0, onion: 0.05, fieldCurvature: 0.012, coma: 0.5,
    softCenter: 3.5, softCorner: 14, glow: 0.03, flare: 1.0, veil: 0.01, transmission: 0.15,
    note: 'Fast wide for APS-C (about 24 mm equivalent). Dark corners on a larger sensor.',
  },
  {
    id: 'ac56', group: 'apsc', name: 'APS-C 56mm f/1.2 portrait', focal: [56, 56], maxN: [1.2, 1.2], minN: 16,
    ko: { name: 'APS-C 56mm f/1.2 인물용', note: '환산 약 85mm의 인물 렌즈. 풀프레임 f/1.8급 배경 흐림에 더 작고 가볍습니다.' },
    imageCircle: 28.4, blades: 11, roundness: 0.9, minFocus: 0.5, breathing: 0.4,
    distortion: [-0.004, -0.004], vignetting: 0.95, catEye: 0.5, latCA: 0.0003, longCA: 0.0006,
    sa: 0.35, apodization: 0, onion: 0.0, fieldCurvature: 0.006, coma: 0.12,
    softCenter: 3, softCorner: 8, glow: 0.03, flare: 0.6, veil: 0.006, transmission: 0.12,
    note: 'About an 85 mm equivalent portrait lens for APS-C, with smaller bulk than full-frame glass.',
  },
  {
    id: 'mt25', group: 'm43', name: 'M4/3 25mm f/1.2 standard', focal: [25, 25], maxN: [1.2, 1.2], minN: 16,
    ko: { name: 'M4/3 25mm f/1.2 표준', note: '환산 약 50mm. 개방해도 같은 화각의 풀프레임 f/2.4급 깊이입니다.' },
    imageCircle: 21.6, blades: 9, roundness: 0.85, minFocus: 0.3, breathing: 0.3,
    distortion: [0.006, 0.006], vignetting: 0.95, catEye: 0.55, latCA: 0.0003, longCA: 0.0005,
    sa: 0.35, apodization: 0, onion: 0.0, fieldCurvature: 0.005, coma: 0.15,
    softCenter: 2.5, softCorner: 7, glow: 0.025, flare: 0.6, veil: 0.006, transmission: 0.12,
    note: 'About a 50 mm equivalent; wide open it gives the depth of full-frame f/2.4.',
  },
  {
    id: 'oi936', group: 'compact', name: '1-inch 9–36mm f/2.8–4.9 zoom', focal: [9, 36], maxN: [2.8, 4.9], minN: 11,
    ko: { name: '1인치 9–36mm f/2.8–4.9 줌', note: '환산 약 24–100mm. 센서가 작아 배경 흐림이 약하고 회절이 일찍 시작됩니다.' },
    imageCircle: 16, blades: 7, roundness: 0.9, minFocus: 0.05, breathing: 0.2,
    distortion: [0.03, 0.0], vignetting: 0.9, catEye: 0.3, latCA: 0.0007, longCA: 0.0003,
    sa: 0.25, apodization: 0, onion: 0.1, fieldCurvature: 0.004, coma: 0.2,
    softCenter: 3, softCorner: 9, glow: 0.015, flare: 0.8, veil: 0.008, transmission: 0.15,
    note: 'About a 24–100 mm equivalent zoom. The small sensor means weaker background blur and early diffraction.',
  },
  {
    id: 'ph69', group: 'compact', name: 'Phone main camera 6.9mm f/1.8', focal: [6.9, 6.9], maxN: [1.8, 1.8], minN: 1.8,
    ko: { name: '스마트폰 메인 카메라 6.9mm f/1.8', note: '환산 약 24mm, 조리개 고정. 거의 모든 것에 초점이 맞고, 흐림은 거의 없습니다.' },
    imageCircle: 12.3, blades: 9, roundness: 1.0, minFocus: 0.1, breathing: 0.1,
    distortion: [0.01, 0.01], vignetting: 0.9, catEye: 0.1, latCA: 0.0006, longCA: 0.0002,
    sa: 0.2, apodization: 0, onion: 0.0, fieldCurvature: 0.002, coma: 0.15,
    softCenter: 2, softCorner: 6, glow: 0.01, flare: 0.7, veil: 0.007, transmission: 0.1,
    note: 'About 24 mm equivalent with a fixed aperture. Nearly everything is in focus; almost no blur.',
  },
  {
    id: 'sz', group: 'compact', name: '1/2.3″ 4.3–129mm f/3.3–6.4 30× superzoom', focal: [4.3, 129], maxN: [3.3, 6.4], minN: 8,
    ko: { name: '1/2.3″ 4.3–129mm f/3.3–6.4 30배 슈퍼줌', note: '환산 약 24–720mm. 끝까지 당기면 어둡고 흐리며, 손떨림에 매우 민감합니다.' },
    imageCircle: 7.6, blades: 7, roundness: 0.9, minFocus: 0.5, breathing: 0.6,
    distortion: [0.06, -0.015], vignetting: 0.8, catEye: 0.3, latCA: 0.0014, longCA: 0.0006,
    sa: 0.3, apodization: 0, onion: 0.1, fieldCurvature: 0.003, coma: 0.3,
    softCenter: 5, softCorner: 14, glow: 0.02, flare: 1.0, veil: 0.012, transmission: 0.25,
    note: 'About a 24–720 mm equivalent. Fully zoomed it is slow, soft and very sensitive to shake.',
  },
  {
    id: 'c35', group: 'cine', name: 'Cine 35mm T1.5 prime', focal: [35, 35], maxN: [1.4, 1.4], minN: 22,
    ko: { name: '시네 35mm T1.5 단렌즈', note: '초점을 바꿔도 화각이 거의 변하지 않는 시네 렌즈. 둥근 빛망울과 부드러운 플레어.' },
    imageCircle: 31.5, blades: 11, roundness: 1.0, minFocus: 0.35, breathing: 0.0,
    distortion: [0.008, 0.008], vignetting: 0.9, catEye: 0.35, latCA: 0.0003, longCA: 0.0005,
    sa: 0.3, apodization: 0, onion: 0.0, fieldCurvature: 0.006, coma: 0.15,
    softCenter: 3, softCorner: 8, glow: 0.04, flare: 0.8, veil: 0.008, transmission: 0.1,
    note: 'Cinema prime with almost no focus breathing, round highlights and gentle flare.',
  },
];

// Dial scales (third stops) -------------------------------------------------------
export const APERTURES = [1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6,
  6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32];

// [label, seconds]
export const SHUTTERS = [
  ['30″', 30], ['25″', 25], ['20″', 20], ['15″', 15], ['13″', 13], ['10″', 10], ['8″', 8], ['6″', 6],
  ['5″', 5], ['4″', 4], ['3.2″', 3.2], ['2.5″', 2.5], ['2″', 2], ['1.6″', 1.6], ['1.3″', 1.3], ['1″', 1],
  ['0.8″', 0.8], ['0.6″', 0.6], ['0.5″', 0.5], ['0.4″', 0.4], ['0.3″', 0.3], ['1/4', 1 / 4], ['1/5', 1 / 5],
  ['1/6', 1 / 6], ['1/8', 1 / 8], ['1/10', 1 / 10], ['1/13', 1 / 13], ['1/15', 1 / 15], ['1/20', 1 / 20],
  ['1/25', 1 / 25], ['1/30', 1 / 30], ['1/40', 1 / 40], ['1/50', 1 / 50], ['1/60', 1 / 60], ['1/80', 1 / 80],
  ['1/100', 1 / 100], ['1/125', 1 / 125], ['1/160', 1 / 160], ['1/200', 1 / 200], ['1/250', 1 / 250],
  ['1/320', 1 / 320], ['1/400', 1 / 400], ['1/500', 1 / 500], ['1/640', 1 / 640], ['1/800', 1 / 800],
  ['1/1000', 1 / 1000], ['1/1250', 1 / 1250], ['1/1600', 1 / 1600], ['1/2000', 1 / 2000],
  ['1/2500', 1 / 2500], ['1/3200', 1 / 3200], ['1/4000', 1 / 4000], ['1/5000', 1 / 5000],
  ['1/6400', 1 / 6400], ['1/8000', 1 / 8000],
];

export const ISOS = [50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600,
  2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600, 32000, 40000, 51200,
  64000, 80000, 102400];

// White balance: multipliers applied to linear camera RGB (relative to daylight).
export const WHITE_BALANCE = [
  { id: 'auto', name: 'Auto', ko: { name: '자동' } },
  { id: 'daylight', name: 'Daylight 5500K', ko: { name: '주광 5500K' }, gains: [1, 1, 1] },
  { id: 'shade', name: 'Shade 7000K', ko: { name: '그늘 7000K' }, gains: [1.12, 1, 0.86] },
  { id: 'tungsten', name: 'Tungsten 3200K', ko: { name: '백열등 3200K' }, gains: [0.66, 1, 1.6] },
  { id: 'led', name: 'Warm LED 4000K', ko: { name: '따뜻한 LED 4000K' }, gains: [0.82, 1, 1.25] },
];

export const STYLES = [
  { id: 'standard', name: 'Standard', ko: { name: '스탠다드' }, contrast: 1.08, saturation: 1.08, sharpen: 0.35 },
  { id: 'vivid', name: 'Vivid', ko: { name: '비비드' }, contrast: 1.2, saturation: 1.3, sharpen: 0.45 },
  { id: 'neutral', name: 'Neutral', ko: { name: '뉴트럴' }, contrast: 0.92, saturation: 0.92, sharpen: 0.2 },
  { id: 'mono', name: 'Monochrome', ko: { name: '모노크롬' }, contrast: 1.12, saturation: 0, sharpen: 0.35 },
];

// Groups shown in the pickers (order matters). `ko` is the Korean heading.
export const CAMERA_GROUPS = [
  { id: 'mf', name: 'Medium format', ko: { name: '중형' } },
  { id: 'ff', name: 'Full frame', ko: { name: '풀프레임' } },
  { id: 'apsc', name: 'APS-C', ko: { name: 'APS-C' } },
  { id: 'm43', name: 'Micro Four Thirds', ko: { name: '마이크로 포서드' } },
  { id: 'cine', name: 'Cinema', ko: { name: '시네마' } },
  { id: 'compact', name: 'Compact and phone', ko: { name: '컴팩트·스마트폰' } },
];
export const LENS_GROUPS = [
  { id: 'wide', name: 'Wide primes', ko: { name: '광각 단렌즈' } },
  { id: 'standard', name: 'Standard primes', ko: { name: '표준 단렌즈' } },
  { id: 'tele', name: 'Portrait and telephoto primes', ko: { name: '인물·망원 단렌즈' } },
  { id: 'zoom', name: 'Full-frame zooms', ko: { name: '풀프레임 줌' } },
  { id: 'macro', name: 'Macro', ko: { name: '매크로' } },
  { id: 'special', name: 'Character lenses', ko: { name: '개성 렌즈' } },
  { id: 'mf', name: 'Medium format lenses', ko: { name: '중형 렌즈' } },
  { id: 'apsc', name: 'APS-C lenses', ko: { name: 'APS-C 렌즈' } },
  { id: 'm43', name: 'Micro Four Thirds lenses', ko: { name: '마이크로 포서드 렌즈' } },
  { id: 'cine', name: 'Cinema lenses', ko: { name: '시네마 렌즈' } },
  { id: 'compact', name: 'Compact and phone lenses', ko: { name: '컴팩트·스마트폰 렌즈' } },
];
