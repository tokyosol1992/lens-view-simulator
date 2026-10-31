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
    id: 'mf102', name: 'Medium format 102 MP', short: 'MF 102MP',
    ko: { name: '중형 102MP' },
    sensor: [43.8, 32.9], pixels: [11648, 8736], baseISO: 100, maxISO: 12800,
    fwcDensity: 2300, readNoise: 2.2, cfa: 'bayer', aa: false, stabilization: 5,
  },
  {
    id: 'ff61', name: 'Full frame 61 MP', short: 'FF 61MP',
    ko: { name: '풀프레임 61MP' },
    sensor: [35.7, 23.8], pixels: [9504, 6336], baseISO: 100, maxISO: 32000,
    fwcDensity: 2200, readNoise: 2.6, cfa: 'bayer', aa: false, stabilization: 5.5,
  },
  {
    id: 'ff45', name: 'Full frame 45 MP', short: 'FF 45MP',
    ko: { name: '풀프레임 45MP' },
    sensor: [36.0, 24.0], pixels: [8192, 5464], baseISO: 100, maxISO: 51200,
    fwcDensity: 2200, readNoise: 2.5, cfa: 'bayer', aa: false, stabilization: 6,
  },
  {
    id: 'ff24', name: 'Full frame 24 MP', short: 'FF 24MP',
    ko: { name: '풀프레임 24MP' },
    sensor: [35.9, 23.9], pixels: [6000, 4000], baseISO: 100, maxISO: 51200,
    fwcDensity: 2000, readNoise: 3.0, cfa: 'bayer', aa: true, stabilization: 5,
  },
  {
    id: 'ff12', name: 'Full frame 12 MP low-light', short: 'FF 12MP',
    ko: { name: '풀프레임 12MP 저조도' },
    sensor: [35.6, 23.8], pixels: [4240, 2832], baseISO: 80, maxISO: 102400,
    fwcDensity: 1900, readNoise: 3.4, cfa: 'bayer', aa: true, stabilization: 5,
  },
  {
    id: 'apsc40', name: 'APS-C 40 MP, 6×6 colour filter', short: 'APS-C 40MP',
    ko: { name: 'APS-C 40MP, 6×6 컬러 필터' },
    sensor: [23.5, 15.6], pixels: [7728, 5152], baseISO: 125, maxISO: 12800,
    fwcDensity: 2200, readNoise: 2.0, cfa: 'xtrans6', aa: false, stabilization: 7,
  },
  {
    id: 'apsc24', name: 'APS-C 24 MP', short: 'APS-C 24MP',
    ko: { name: 'APS-C 24MP' },
    sensor: [23.5, 15.6], pixels: [6000, 4000], baseISO: 100, maxISO: 51200,
    fwcDensity: 2100, readNoise: 2.4, cfa: 'bayer', aa: true, stabilization: 5,
  },
  {
    id: 'm43', name: 'Micro Four Thirds 20 MP', short: 'M4/3 20MP',
    ko: { name: '마이크로 포서드 20MP' },
    sensor: [17.3, 13.0], pixels: [5184, 3888], baseISO: 200, maxISO: 25600,
    fwcDensity: 2100, readNoise: 2.4, cfa: 'bayer', aa: false, stabilization: 7,
  },
  {
    id: 'one', name: '1-inch compact 20 MP', short: '1" 20MP',
    ko: { name: '1인치 컴팩트 20MP' },
    sensor: [13.2, 8.8], pixels: [5472, 3648], baseISO: 125, maxISO: 12800,
    fwcDensity: 2000, readNoise: 2.0, cfa: 'bayer', aa: false, stabilization: 3,
  },
  {
    id: 'phone', name: 'Phone-size 1/1.3″ 12 MP', short: '1/1.3" 12MP',
    ko: { name: '스마트폰급 1/1.3″ 12MP' },
    sensor: [9.8, 7.35], pixels: [4000, 3000], baseISO: 50, maxISO: 6400,
    fwcDensity: 1500, readNoise: 1.6, cfa: 'bayer', aa: false, stabilization: 3,
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
    id: 'uw14', name: '14mm f/2.8 ultra-wide', focal: [14, 14], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '14mm f/2.8 초광각', note: '앞알이 튀어나온 설계: 주변부가 크게 어두워지고, 점광원에 코마가 생기며, 14갈래 빛갈라짐이 선명합니다.' },
    imageCircle: 43.3, blades: 7, roundness: 0.2, minFocus: 0.28, breathing: 0.2,
    distortion: [0.045, 0.045], vignetting: 0.62, catEye: 0.55, latCA: 0.0011, longCA: 0.0002,
    sa: 0.3, apodization: 0, onion: 0.05, fieldCurvature: 0.02, coma: 0.9,
    softCenter: 4, softCorner: 22, glow: 0.02, flare: 1.4, veil: 0.012, transmission: 0.2,
    note: 'Bulbous front element: strong corner fall-off, coma on point lights, sharp 14-point sun stars.',
  },
  {
    id: 'w24', name: '24mm f/1.4 wide prime', focal: [24, 24], maxN: [1.4, 1.4], minN: 16,
    ko: { name: '24mm f/1.4 광각 단렌즈', note: '밝은 광각: 모서리로 갈수록 고양이 눈 보케가 나오고 개방에서 코마가 보입니다.' },
    imageCircle: 43.3, blades: 9, roundness: 0.6, minFocus: 0.25, breathing: 0.3,
    distortion: [0.022, 0.022], vignetting: 0.75, catEye: 0.65, latCA: 0.0006, longCA: 0.0007,
    sa: 0.35, apodization: 0, onion: 0.05, fieldCurvature: 0.015, coma: 0.6,
    softCenter: 3, softCorner: 16, glow: 0.035, flare: 1.0, veil: 0.01, transmission: 0.15,
    note: 'Fast wide: cat-eye bokeh toward the corners and visible coma wide open.',
  },
  {
    id: 's35', name: '35mm f/1.8 compact', focal: [35, 35], maxN: [1.8, 1.8], minN: 22,
    ko: { name: '35mm f/1.8 소형', note: '7매 원형 조리개의 가벼운 일상용 단렌즈입니다.' },
    imageCircle: 43.3, blades: 7, roundness: 0.6, minFocus: 0.25, breathing: 0.4,
    distortion: [0.012, 0.012], vignetting: 0.85, catEye: 0.45, latCA: 0.0005, longCA: 0.0006,
    sa: 0.4, apodization: 0, onion: 0.1, fieldCurvature: 0.01, coma: 0.25,
    softCenter: 3.5, softCorner: 12, glow: 0.03, flare: 0.9, veil: 0.008, transmission: 0.1,
    note: 'Light everyday prime with 7 rounded blades.',
  },
  {
    id: 'n50b', name: '50mm f/1.8 budget', focal: [50, 50], maxN: [1.8, 1.8], minN: 22,
    ko: { name: '50mm f/1.8 보급형', note: '직선 조리개 날 때문에 조이면 칠각형 빛망울이 생기고, 개방에서는 글로우와 색 번짐이 있습니다.' },
    imageCircle: 43.3, blades: 7, roundness: 0.0, minFocus: 0.35, breathing: 1.0,
    distortion: [0.008, 0.008], vignetting: 0.9, catEye: 0.45, latCA: 0.0006, longCA: 0.0011,
    sa: 0.6, apodization: 0, onion: 0.18, fieldCurvature: 0.01, coma: 0.2,
    softCenter: 6, softCorner: 18, glow: 0.07, flare: 1.1, veil: 0.01, transmission: 0.1,
    note: 'Straight blades give heptagon highlights once stopped down; glow and colour fringes wide open.',
  },
  {
    id: 'n50p', name: '50mm f/1.2 premium', focal: [50, 50], maxN: [1.2, 1.2], minN: 16,
    ko: { name: '50mm f/1.2 고급형', note: '11매 원형 조리개와 42mm 입사동: 아주 얇은 초점면과 둥근 빛망울.' },
    imageCircle: 43.3, blades: 11, roundness: 0.9, minFocus: 0.4, breathing: 0.3,
    distortion: [0.006, 0.006], vignetting: 0.95, catEye: 0.6, latCA: 0.0003, longCA: 0.0005,
    sa: 0.35, apodization: 0, onion: 0.0, fieldCurvature: 0.006, coma: 0.15,
    softCenter: 3, softCorner: 10, glow: 0.03, flare: 0.6, veil: 0.006, transmission: 0.15,
    note: '11 rounded blades and a 42 mm entrance pupil: very thin focus, round highlights.',
  },
  {
    id: 'p85', name: '85mm f/1.4 portrait', focal: [85, 85], maxN: [1.4, 1.4], minN: 16,
    ko: { name: '85mm f/1.4 인물용', note: '인물 사진다운 압축감과 부드러운 배경 흐림.' },
    imageCircle: 43.3, blades: 11, roundness: 0.85, minFocus: 0.8, breathing: 0.4,
    distortion: [-0.004, -0.004], vignetting: 1.0, catEye: 0.45, latCA: 0.0002, longCA: 0.0007,
    sa: 0.4, apodization: 0, onion: 0.0, fieldCurvature: 0.005, coma: 0.1,
    softCenter: 3, softCorner: 8, glow: 0.03, flare: 0.6, veil: 0.006, transmission: 0.1,
    note: 'Classic portrait compression with smooth background blur.',
  },
  {
    id: 't135', name: '135mm f/1.8 telephoto', focal: [135, 135], maxN: [1.8, 1.8], minN: 22,
    ko: { name: '135mm f/1.8 망원', note: '길고 밝아서 이 목록에서 배경 분리가 가장 강합니다.' },
    imageCircle: 43.3, blades: 11, roundness: 0.9, minFocus: 0.7, breathing: 0.5,
    distortion: [-0.006, -0.006], vignetting: 1.0, catEye: 0.3, latCA: 0.0002, longCA: 0.0004,
    sa: 0.35, apodization: 0, onion: 0.0, fieldCurvature: 0.004, coma: 0.05,
    softCenter: 2.5, softCorner: 6, glow: 0.02, flare: 0.5, veil: 0.005, transmission: 0.1,
    note: 'Long and fast: the strongest background separation in the catalog.',
  },
  {
    id: 'z2470', name: '24–70mm f/2.8 standard zoom', focal: [24, 70], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '24–70mm f/2.8 표준 줌', note: '24mm의 술통형 왜곡이 70mm에서는 실패형 왜곡으로 바뀝니다.' },
    imageCircle: 43.3, blades: 11, roundness: 0.8, minFocus: 0.38, breathing: 0.5,
    distortion: [0.032, -0.012], vignetting: 0.85, catEye: 0.35, latCA: 0.0007, longCA: 0.0003,
    sa: 0.25, apodization: 0, onion: 0.08, fieldCurvature: 0.012, coma: 0.3,
    softCenter: 4, softCorner: 13, glow: 0.015, flare: 1.0, veil: 0.009, transmission: 0.25,
    note: 'Barrel distortion at 24mm turns into pincushion at 70mm.',
  },
  {
    id: 'z70200', name: '70–200mm f/2.8 telephoto zoom', focal: [70, 200], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '70–200mm f/2.8 망원 줌', note: '내부 초점 줌: 가까이 초점을 맞추면 화각이 눈에 띄게 좁아집니다.' },
    imageCircle: 43.3, blades: 11, roundness: 0.85, minFocus: 1.0, breathing: 0.7,
    distortion: [-0.004, -0.012], vignetting: 1.0, catEye: 0.3, latCA: 0.0003, longCA: 0.0003,
    sa: 0.3, apodization: 0, onion: 0.06, fieldCurvature: 0.006, coma: 0.1,
    softCenter: 3, softCorner: 8, glow: 0.015, flare: 0.8, veil: 0.008, transmission: 0.25,
    note: 'Internal-focus zoom: framing tightens noticeably at close focus.',
  },
  {
    id: 'm100', name: '100mm f/2.8 macro', focal: [100, 100], maxN: [2.8, 2.8], minN: 32,
    ko: { name: '100mm f/2.8 매크로', note: '1:1까지 초점이 맞습니다. 가까울수록 실효 조리개가 어두워집니다.' },
    imageCircle: 43.3, blades: 9, roundness: 0.7, minFocus: 0.28, breathing: 1.0,
    distortion: [0.0, 0.0], vignetting: 1.0, catEye: 0.15, latCA: 0.0001, longCA: 0.0006,
    sa: 0.2, apodization: 0, onion: 0.0, fieldCurvature: 0.002, coma: 0.05,
    softCenter: 2.5, softCorner: 5, glow: 0.01, flare: 0.6, veil: 0.006, transmission: 0.2,
    note: 'Focuses to 1:1. Effective aperture drops as you get closer.',
  },
  {
    id: 'a90', name: '90mm f/2.8 apodization (T4.5)', focal: [90, 90], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '90mm f/2.8 아포다이제이션 (T4.5)', note: '내장 방사형 필터가 모든 빛망울 가장자리를 부드럽게 하지만 약 1⅓스톱 어두워집니다.' },
    imageCircle: 43.3, blades: 11, roundness: 1.0, minFocus: 0.85, breathing: 0.4,
    distortion: [0.0, 0.0], vignetting: 1.0, catEye: 0.2, latCA: 0.0002, longCA: 0.0003,
    sa: 0.1, apodization: 1.0, onion: 0.0, fieldCurvature: 0.003, coma: 0.05,
    softCenter: 3, softCorner: 6, glow: 0.01, flare: 0.5, veil: 0.006, transmission: 1.35,
    note: 'Built-in radial filter feathers every highlight; costs about 1⅓ stops of light.',
  },
  {
    id: 'v58', name: '58mm f/2 vintage swirl', focal: [58, 58], maxN: [2.0, 2.0], minN: 16,
    ko: { name: '58mm f/2 빈티지 스월', note: '싱글 코팅 고전 렌즈: 소용돌이 배경, 낮은 대비의 글로우, 많은 플레어.' },
    imageCircle: 43.3, blades: 8, roundness: 0.15, minFocus: 0.5, breathing: 1.0,
    distortion: [0.004, 0.004], vignetting: 1.0, catEye: 1.1, latCA: 0.0008, longCA: 0.0014,
    sa: 0.2, apodization: 0, onion: 0.0, fieldCurvature: 0.06, coma: 0.7,
    softCenter: 9, softCorner: 34, glow: 0.12, flare: 2.4, veil: 0.03, transmission: 0.3,
    note: 'Single-coated classic: swirling background, low-contrast glow and lots of flare.',
  },
  {
    id: 'b100', name: '100mm f/2.8 soap-bubble triplet', focal: [100, 100], maxN: [2.8, 2.8], minN: 22,
    ko: { name: '100mm f/2.8 비눗방울 트리플릿', note: '과보정 트리플릿: 배경 빛망울이 테두리가 밝은 비눗방울처럼 보입니다.' },
    imageCircle: 43.3, blades: 15, roundness: 1.0, minFocus: 1.0, breathing: 1.0,
    distortion: [0.0, 0.0], vignetting: 1.0, catEye: 0.35, latCA: 0.0004, longCA: 0.0008,
    sa: -0.95, apodization: 0, onion: 0.0, fieldCurvature: 0.03, coma: 0.3,
    softCenter: 7, softCorner: 26, glow: 0.08, flare: 1.4, veil: 0.015, transmission: 0.2,
    note: 'Over-corrected triplet: background highlights become bright-rimmed bubbles.',
  },
  {
    id: 'k1855', name: '18–55mm f/3.5–5.6 APS-C kit', focal: [18, 55], maxN: [3.5, 5.6], minN: 22,
    ko: { name: '18–55mm f/3.5–5.6 APS-C 번들', note: 'APS-C용입니다. 더 큰 센서에서는 이미지 서클이 모자라 모서리가 어둡습니다.' },
    imageCircle: 28.4, blades: 7, roundness: 0.3, minFocus: 0.25, breathing: 0.6,
    distortion: [0.05, -0.01], vignetting: 0.8, catEye: 0.5, latCA: 0.0016, longCA: 0.0004,
    sa: 0.3, apodization: 0, onion: 0.12, fieldCurvature: 0.02, coma: 0.4,
    softCenter: 6, softCorner: 24, glow: 0.02, flare: 1.2, veil: 0.012, transmission: 0.2,
    note: 'Made for APS-C. On a larger sensor the image circle leaves dark corners.',
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
