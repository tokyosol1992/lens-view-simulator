// Quick starts: a one-click setup plus what to look at. `q` uses the same parameters as
// the shareable link (camera, lens, scene, focal, f, t, iso, mode, support, zoom, ...).
// Each preset is tuned to the scene that exposes the effect, so the difference is visible
// without any other settings.
export const PRESETS = [
  {
    id: 'bokeh', q: 'scene=garden&camera=ff24&lens=sony-fe-85mm-f-1-4-gm&f=1.4&mode=A&support=stabilized',
    name: 'Portrait blur', ko: { name: '인물 배경 흐림', look: '조리개를 열면 줄 조명이 부드러운 원이 되고 곰만 또렷합니다. 50mm f/1.8 보급형을 f/4로 조이면 직선 조리개 날 모양이 보입니다.' },
    look: 'Open the aperture and watch the string lights turn into soft discs while the bear stays sharp. Try 50mm f/1.8 budget at f/4 to see straight blades.',
  },
  {
    id: 'lowlight', q: 'scene=street&camera=ff12&lens=sony-fe-24mm-f-1-4-gm&f=1.4&mode=MA&t=1/60&support=stabilized',
    name: 'Night street noise', ko: { name: '밤거리 노이즈', look: '어두워지면 자동 ISO가 올라갑니다. 이 화면을 A로 고정하고 바디를 1인치로 바꿔 100% 화면의 노이즈를 비교해 보세요.' },
    look: 'Auto ISO climbs in the dark. Hold this as A, then switch the body to the 1-inch and compare the noise in the 100% view.',
  },
  {
    id: 'landscape', q: 'scene=lake&camera=ff45&lens=nikon-z-24-70mm-f-2-8-s&focal=24&f=8&mode=A&support=tripod',
    name: 'Landscape sharpness', ko: { name: '풍경 선예도', look: '모서리와 부두를 보세요. f/22까지 조이면 회절로 미세한 디테일이 흐려지고, 16–35mm로 바꾸면 왜곡이 더 강해집니다.' },
    look: 'Look at the corners and the pier. Close down to f/22 to see diffraction soften the fine detail, or go to 16–35mm for stronger distortion.',
  },
  {
    id: 'reach', q: 'scene=garden&camera=ff24&lens=canon-rf-100-500mm-f-4-5-7-1l-is-usm&focal=400&f=7.1&mode=A&support=stabilized',
    name: 'Telephoto compression', ko: { name: '망원 압축감', look: '400mm에서는 화각이 좁고 배경이 납작해집니다. 초점 거리를 100mm로 내려 같은 크기의 피사체로 비교해 보세요.' },
    look: 'At 400mm the view is narrow and the background is flattened. Change the focal length down to 100mm and compare the same subject size.',
  },
  {
    id: 'pixels', q: 'scene=bench&camera=ff61&lens=sigma-105mm-f-2-8-dg-dn-macro-art&f=5.6&mode=A&support=tripod&zoom=4',
    name: 'Resolution and moiré', ko: { name: '해상력과 모아레', look: '100% 화면에서 직물과 별 차트를 화소 단위로 볼 수 있습니다. 로우패스 필터가 있는 24MP 바디로 바꿔 모아레와 디테일을 비교하세요.' },
    look: 'The 100% view shows the fabric and star chart at pixel level. Switch to the 24 MP body with its low-pass filter to compare moiré and detail.',
  },
  {
    id: 'small', q: 'scene=garden&camera=one&lens=oi936&focal=9&f=2.8&mode=A&support=stabilized',
    name: '1-inch vs. big sensor', ko: { name: '1인치 vs 대형 센서', look: '1인치 센서는 거의 모든 것에 초점이 맞습니다. A로 고정한 뒤 풀프레임 24MP와 소니 FE 50mm f/1.2 GM을 고르면 큰 센서의 배경 흐림 차이를 볼 수 있습니다.' },
    look: 'Almost everything is in focus on the 1-inch sensor. Hold this as A, then pick Full frame 24 MP with the Sony 50mm f/1.2 GM to see how much more blur a large sensor gives.',
  },
  {
    id: 'medium', q: 'scene=garden&camera=mf102&lens=fuji-gf-80mm-f-1-7-r-wr&f=1.7&mode=A&support=tripod&zoom=2',
    name: 'Medium format look',
    look: 'The GF 80mm f/1.7 gives a view like a 63 mm lens on full frame, with the blur of a much faster one. Zoom the loupe to see the 102 MP detail in the fur.',
    ko: { name: '중형 포맷의 느낌', look: 'GF 80mm f/1.7은 풀프레임의 약 63mm 화각에 훨씬 더 밝은 렌즈 같은 흐림을 줍니다. 100% 화면을 확대해 털의 102MP 디테일을 보세요.' },
  },
];
