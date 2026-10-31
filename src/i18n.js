// Interface text in English and Korean. Static markup uses data-i18n (text) and
// data-i18n-aria (aria-label) attributes; scripts call t(key, vars).
// Catalog and scene entries carry their own `ko` names and notes, read with loc().

const STRINGS = {
  en: {
    'meta.title': 'Lens View Simulator',
    'meta.description': 'Pick a camera, a lens and a location and see the photograph it would make: framing, focus, bokeh, flare, distortion, diffraction and sensor noise, rendered live with WebGPU.',
    'brand.a': 'Lens View',
    'brand.b': 'Simulator',
    'tagline': 'Choose a body, a lens and a location. The frame renders through the lens and onto the sensor you picked, so differences in focus, blur, flare, sharpness and noise show up as they would in the photo.',
    'status.starting': 'Starting WebGPU…',
    'status.rendering': 'Rendering {p}%',
    'status.ready': 'Ready',
    'status.gpuError': 'GPU error',
    'aria.lang': 'Language',
    'aria.stage': 'Viewfinder and results',
    'aria.view': 'Rendered photograph. Click to focus there.',
    'aria.controls': 'Camera settings',
    'aria.focusScale': 'Focus distance',
    'aria.meter': 'Exposure meter',
    'aria.loupe': 'Pixel-level crop at the focus point',
    'aria.zoom': 'Loupe magnification',
    'aria.mode': 'Exposure mode',
    'aria.nd': 'ND filter',
    'aria.support': 'Support',
    'ab.live': 'B · live',
    'gpu.title': 'WebGPU is not available here',
    'gpu.help': 'Open this page in a current Chrome, Edge or Safari with WebGPU turned on. The readouts below still update.',
    'gpu.noDevice': 'This browser did not provide a WebGPU device.',
    'strip.focus': 'Focus',
    'strip.hint': '· drag the scale or click the picture',
    'strip.exposure': 'Exposure',
    'focus.subject': 'Subject',
    'focus.manual': 'Manual',
    'loupe.title': '100% at AF point',
    'loupe.grid': 'Pixel grid at 4:1',
    'loupe.hint': "Rendered at this camera's own pixel pitch, through its colour filter and low-pass filter, with its noise.",
    'results.title': 'What this combination gives you',
    'ro.fov': 'Field of view',
    'ro.eq': 'Full-frame equivalent',
    'ro.dof': 'Depth of field',
    'ro.bg': 'Background blur',
    'ro.pupil': 'Entrance pupil',
    'ro.airy': 'Diffraction spot',
    'ro.shake': 'Shake blur',
    'ro.noise': 'Noise',
    'ro.fovSub': '{d}° diagonal',
    'ro.eqSub': 'crop ×{c} vs full frame',
    'ro.dofSub': '{deep} deep · hyperfocal {h}',
    'ro.dofSubInf': 'to infinity · hyperfocal {h}',
    'ro.bgSub': '{pct} of frame width at ∞',
    'ro.pupilSub': 'magnification 1:{m}',
    'ro.pupilSubMacro': 'magnification 1:{m} · effective f/{n}',
    'ro.airySub': 'pixel {p} µm · softens past f/{n}',
    'ro.shakeNone': 'none',
    'ro.shakeTripod': 'on a tripod',
    'ro.shakeSub': 'safe handheld ≤ {t}',
    'ro.noiseSub': 'mid-grey SNR at 8 MP · DR {dr} EV',
    'warn.ic': 'Image circle {ic} mm is smaller than this {d} mm sensor diagonal: dark corners.',
    'warn.minFocus': 'Subject is closer than the {d} minimum focus distance.',
    'warn.shake': 'Shutter is slower than the safe handheld speed; expect shake blur.',
    'warn.diffraction': "Past f/{n} diffraction softens this sensor's pixels.",
    'warn.exposure': 'Exposure is {ev} EV from the meter.',
    'cam.spec': '{w} × {h} mm · {mp} MP · {p} µm pixels · {aa}',
    'cam.aa': 'low-pass filter',
    'cam.noAa': 'no low-pass filter',
    'group.gear': 'Gear',
    'field.camera': 'Camera body',
    'field.lens': 'Lens',
    'field.focal': 'Focal length',
    'group.location': 'Location',
    'field.distance': 'Distance to subject',
    'field.keep': 'Keep subject size when changing focal length',
    'group.exposure': 'Exposure',
    'mode.A': 'Aperture priority',
    'mode.M': 'Manual',
    'mode.MA': 'M + auto ISO',
    'field.aperture': 'Aperture',
    'field.shutter': 'Shutter',
    'field.iso': 'ISO',
    'field.ec': 'Exposure compensation',
    'field.nd': 'ND filter',
    'nd.0': 'None',
    'nd.3': 'ND8 · 3 stops',
    'nd.6': 'ND64 · 6',
    'nd.10': 'ND1000 · 10',
    'support.tripod': 'Tripod',
    'support.stabilized': 'Handheld + IS',
    'support.handheld': 'Handheld',
    'group.focus': 'Focus',
    'focus.note': 'Click anywhere in the picture to focus there.',
    'focus.refocus': 'Focus on subject',
    'group.picture': 'Picture',
    'field.wb': 'White balance',
    'field.style': 'Style',
    'field.zebra': 'Show clipped highlights',
    'group.compare': 'Compare',
    'compare.note': 'Hold the current picture as A, then change anything. Drag the divider on the picture to compare A with the live B.',
    'compare.hold': 'Hold this view as A',
    'compare.replace': 'Replace A with this view',
    'compare.stop': 'Stop comparing',
  },
  ko: {
    'meta.title': '렌즈 뷰 시뮬레이터',
    'meta.description': '카메라, 렌즈, 장소를 고르면 그 조합으로 찍힐 사진을 WebGPU로 바로 렌더링합니다. 화각, 초점, 보케, 플레어, 왜곡, 회절, 센서 노이즈까지 보여 줍니다.',
    'brand.a': '렌즈 뷰',
    'brand.b': '시뮬레이터',
    'tagline': '바디, 렌즈, 장소를 고르세요. 장면이 고른 렌즈를 지나 고른 센서에 맺히도록 렌더링되므로, 초점·흐림·플레어·선예도·노이즈의 차이가 실제 사진처럼 보입니다.',
    'status.starting': 'WebGPU 시작 중…',
    'status.rendering': '렌더링 {p}%',
    'status.ready': '완료',
    'status.gpuError': 'GPU 오류',
    'aria.lang': '언어',
    'aria.stage': '뷰파인더와 결과',
    'aria.view': '렌더링된 사진. 클릭한 곳에 초점을 맞춥니다.',
    'aria.controls': '카메라 설정',
    'aria.focusScale': '포커스 거리',
    'aria.meter': '노출계',
    'aria.loupe': '초점 위치의 픽셀 단위 확대 화면',
    'aria.zoom': '확대 배율',
    'aria.mode': '촬영 모드',
    'aria.nd': 'ND 필터',
    'aria.support': '촬영 방식',
    'ab.live': 'B · 실시간',
    'gpu.title': '이 브라우저에서는 WebGPU를 쓸 수 없습니다',
    'gpu.help': 'WebGPU를 켠 최신 Chrome, Edge, Safari에서 열어 주세요. 아래 수치는 계속 갱신됩니다.',
    'gpu.noDevice': '이 브라우저가 WebGPU 장치를 제공하지 않았습니다.',
    'strip.focus': '초점',
    'strip.hint': '· 눈금을 끌거나 사진을 클릭',
    'strip.exposure': '노출',
    'focus.subject': '피사체',
    'focus.manual': '수동',
    'loupe.title': 'AF 지점 100%',
    'loupe.grid': '4:1에서 픽셀 격자 표시',
    'loupe.hint': '이 카메라의 실제 화소 크기로, 컬러 필터와 로우패스 필터를 거쳐 노이즈까지 포함해 렌더링합니다.',
    'results.title': '이 조합으로 얻는 결과',
    'ro.fov': '화각',
    'ro.eq': '풀프레임 환산',
    'ro.dof': '피사계 심도',
    'ro.bg': '배경 흐림',
    'ro.pupil': '입사동',
    'ro.airy': '회절 원반',
    'ro.shake': '손떨림 흐림',
    'ro.noise': '노이즈',
    'ro.fovSub': '대각선 {d}°',
    'ro.eqSub': '풀프레임 대비 크롭 ×{c}',
    'ro.dofSub': '심도 {deep} · 과초점 거리 {h}',
    'ro.dofSubInf': '무한대까지 · 과초점 거리 {h}',
    'ro.bgSub': '무한대 배경 흐림이 화면 폭의 {pct}',
    'ro.pupilSub': '배율 1:{m}',
    'ro.pupilSubMacro': '배율 1:{m} · 실효 f/{n}',
    'ro.airySub': '화소 {p} µm · f/{n}부터 흐려짐',
    'ro.shakeNone': '없음',
    'ro.shakeTripod': '삼각대 사용',
    'ro.shakeSub': '안전 셔터 ≤ {t}',
    'ro.noiseSub': '8MP 기준 중간 회색 SNR · DR {dr} EV',
    'warn.ic': '이미지 서클 {ic} mm가 센서 대각선 {d} mm보다 작아 모서리가 어둡게 나옵니다.',
    'warn.minFocus': '피사체가 최소 초점 거리 {d}보다 가깝습니다.',
    'warn.shake': '셔터가 손으로 들고 찍기 안전한 속도보다 느려 흔들림이 생깁니다.',
    'warn.diffraction': 'f/{n}보다 조이면 회절 때문에 이 센서의 화소가 흐려집니다.',
    'warn.exposure': '노출계 기준보다 {ev} EV 차이가 납니다.',
    'cam.spec': '{w} × {h} mm · {mp}MP · 화소 {p} µm · {aa}',
    'cam.aa': '로우패스 필터 있음',
    'cam.noAa': '로우패스 필터 없음',
    'group.gear': '장비',
    'field.camera': '카메라 바디',
    'field.lens': '렌즈',
    'field.focal': '초점 거리',
    'group.location': '장소',
    'field.distance': '피사체까지 거리',
    'field.keep': '초점 거리를 바꿔도 피사체 크기 유지',
    'group.exposure': '노출',
    'mode.A': '조리개 우선',
    'mode.M': '수동',
    'mode.MA': 'M + 자동 ISO',
    'field.aperture': '조리개',
    'field.shutter': '셔터',
    'field.iso': 'ISO',
    'field.ec': '노출 보정',
    'field.nd': 'ND 필터',
    'nd.0': '없음',
    'nd.3': 'ND8 · 3스톱',
    'nd.6': 'ND64 · 6',
    'nd.10': 'ND1000 · 10',
    'support.tripod': '삼각대',
    'support.stabilized': '핸드헬드 + 보정',
    'support.handheld': '핸드헬드',
    'group.focus': '초점',
    'focus.note': '사진의 아무 곳이나 클릭하면 그곳에 초점을 맞춥니다.',
    'focus.refocus': '피사체에 초점',
    'group.picture': '사진',
    'field.wb': '화이트 밸런스',
    'field.style': '스타일',
    'field.zebra': '하이라이트가 날아간 부분 표시',
    'group.compare': '비교',
    'compare.note': '지금 화면을 A로 고정한 뒤 아무 설정이나 바꾸세요. 사진 위 구분선을 끌어 A와 실시간 B를 비교합니다.',
    'compare.hold': '이 화면을 A로 고정',
    'compare.replace': '이 화면으로 A 교체',
    'compare.stop': '비교 끝내기',
  },
};

export const LANGS = ['en', 'ko'];
const STORAGE_KEY = 'lvs-lang';

function detect() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage blocked */ }
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return prefs.some((l) => String(l).toLowerCase().startsWith('ko')) ? 'ko' : 'en';
}

let lang = detect();
document.documentElement.lang = lang;

export const getLang = () => lang;
export function setLang(next) {
  if (!LANGS.includes(next)) return;
  lang = next;
  document.documentElement.lang = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage blocked */ }
}

export function t(key, vars = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

// Localised field of a catalog or scene entry, falling back to English.
export function loc(item, field = 'name') {
  return (lang !== 'en' && item[lang]?.[field]) || item[field];
}

export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}
