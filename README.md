# Lens View Simulator

A web page for camera and lens customers. Pick a camera body, a lens and a sample location, and the page renders the photograph that combination would produce, live, with WebGPU. Change any setting and the frame re-renders, so the differences between products show up in the picture itself. You can also hold one result as **A** and drag a divider to compare it with the live **B**; both sides are labelled with their camera, lens and exposure, and the divider also moves with the arrow keys (Shift for bigger steps, Home and End for the edges).

The interface is available in English and Korean. The **EN / 한국어** switch sits in the top bar on phones and desktops. It defaults to the browser language, remembers the choice in the browser, and can be set with `?lang=ko` or `?lang=en`. Switching language changes only the text, so the picture is not re-rendered.

On wide screens the picture stays visible while scrolling; exposure controls and the focus scale are below the picture, with camera and distance settings on the right. On phones and narrow windows the picture and tab bar stay pinned, and the tabs (**Camera, Distance, Exposure, Picture, Results**) choose which panel scrolls beneath them. The focus scale and exposure meter sit below the exposure controls. The location selector sits on the picture; a **Hold as A** chip starts a comparison without leaving the settings.

The exposure panel puts ND filters and camera support under **More exposure settings**, and **Go to focus** scrolls to the focus scale. With **Keep subject size** enabled, changing focal length also changes camera-to-subject distance.

The **Camera** panel contains the camera and lens browser. Filter lenses by brand and whether their image circle covers the sensor. Seven quick starts are available under **Picture**. Coverage does not check whether the lens mount actually fits the camera.

Focal length, subject and focus distances, aperture, shutter speed, ISO and exposure compensation can be typed as well as adjusted with their sliders. Subject-distance and focus drags move in 0.5 m increments from the starting value; typed distances are rounded to two decimal places. Shutter accepts either seconds or a fraction such as `1/250`. Values outside the available range are adjusted and explained; automatic shutter and ISO remain read-only in their automatic modes.

Under **Distance**, choose up to two comparison lenses to draw their frames over the current view. The camera position stays fixed and the picture widens to the widest selected view, with the current lens and both alternatives outlined. The outlines approximate centred framing and focus breathing; the background's blur and other optical effects still come from the current lens. Focus by clicking inside the current lens's frame. During A/B comparison the outlines appear on the live B side only. Changing comparison lenses clears a held A image so a capture made with a different preview framing is not mixed with the new one.

**Copy link** (next to **Reset settings** in the header) copies a link that reopens the setup: gear, location, exposure, focus point and picture settings. The address bar also follows those settings, so a reload restores them. A link that names something this version does not have still opens, with defaults. **Reset settings** puts exposure, focus and picture settings back to the start and keeps the gear, the location and a held A.

The look follows a flat, one-accent style: surfaces step in lightness instead of using borders, blue is the only accent, controls are large, and the font is [Pretendard](https://github.com/orioncactus/pretendard) (SIL OFL), loaded from jsDelivr with Noto Sans KR and the system Korean font as fallbacks. Dark and light follow the system setting.

The page is static: no build step and no dependencies.

```sh
python3 -m http.server 8000   # or any static server
# open http://localhost:8000
```

WebGPU needs a secure context (`https://` or `localhost`) and a browser that ships it: current Chrome or Edge, or Safari 26 and later.

## What the page shows

| Setting | Where the difference shows up |
| --- | --- |
| Focal length, sensor size | Field of view, crop factor, focus breathing. With *Keep subject size* on, changing focal length also changes perspective. |
| Aperture | Depth of field, bokeh size and shape (blade count, rounded vs straight blades), cat-eye bokeh toward the corners, sun stars, diffraction softening, vignetting |
| Focus distance | Plane of focus, depth-of-field band on the focus scale, bellows factor at macro distances, field curvature |
| Lens character | Distortion, lateral and longitudinal chromatic aberration (purple/green fringes), spherical-aberration bokeh (smooth vs soap-bubble), apodization, onion rings, swirl, coma, wide-open glow, ghosts, veiling flare, corner softness |
| Lens image circle | APS-C lenses on larger sensors leave dark corners |
| Shutter speed, support, ND filter | Hand-shake blur, reduced by stabilisation. Moving cars leave light trails, the fan blurs and water smooths out; ND filters make long daylight exposures possible |
| ISO + sensor | Photon (shot) noise and read noise from each sensor's pixel size and full-well capacity, dynamic range, highlight clipping |
| Pixel count, low-pass filter, colour filter | Shown in the **100% loupe**. It is rendered at the camera's own pixel pitch through a Bayer or 6×6 colour filter and the optional low-pass filter, then demosaiced. This is where resolution, moiré, false colour and per-pixel noise become visible. |
| White balance, picture style | Camera-JPEG style development with a highlight shoulder |

The five locations are designed to expose these differences:

- **Garden bench, golden hour.** A backlit teddy bear in front of string lights, leaf gaps and a low sun.
- **City street at night.** Lamps, neon, wet asphalt and moving cars. Use it for ISO noise, light trails and point-light bokeh.
- **Mountain lake, afternoon.** A pier leading to snowy peaks. Use it for distortion, haze, hyperfocal focusing and diffraction at f/16.
- **Studio test bench.** A Siemens star, a zone plate, fine fabric, a colour chart, a ruler running through focus and a spinning fan.
- **Starlit campsite.** A glowing tent, a small fire, a lantern and a starry sky over low hills. Use it for coma and astigmatism in the corners of fast wide lenses, noise at high ISO, long exposures, and focusing: the tent is 8 m away and the stars are at infinity, so click a star to focus there. It is the only location that suggests a starting exposure (ISO 3200 on a tripod); switching to another location puts ISO and support back.

## How it is rendered

```
scene pass ──► DOF gather ──► aberrations + diffraction ──► accumulate ──► distortion / lateral CA / vignetting
(HDR radiance,  (per-pixel     (spatially varying PSF,       (progressive                     │
 linear depth)   blur from      coma, astigmatism)            samples)                         ▼
                 lens geometry)                                              glow, ghosts, sun stars, veiling glare
                                                                                                │
                                         display ◄── develop ◄── demosaic (loupe) ◄── sensor: exposure, electrons,
                                                     (WB, tone)                       shot + read noise, clipping, CFA
```

- **Scene** (`src/gpu/shaders-scene.js`). Instanced primitives with procedural materials: brick, grass, see-through foliage, wood, woven fabric, fur, water ripples, terrain, asphalt, building façades, charts and pseudo-text. Pattern detail is filtered against the pixel footprint. Lighting comes from the sun with a shadow map, a sky hemisphere, up to 48 point lights and an analytic sky with clouds and stars. Radiance stays in physical ratios, so the sun is about 10⁵ × mid-grey.
- **Progressive sampling.** Each frame renders a new sample with sub-pixel jitter and its own instant within the exposure, including hand tremor and moving objects. Samples accumulate until the picture converges, which gives antialiasing, motion blur and shake.
- **Depth of field** (`DOF_WGSL`). The blur radius of every pixel comes from the thin-lens equation (`b = D·(s′_focus − s′)/s′`) for each colour channel, so longitudinal CA appears in the bokeh. A scatter-as-gather pass then tests every sample against the real aperture: blade polygon, roundness, a cat-eye clip that depends on image position and f-stop, and the spherical-aberration, apodization and onion-ring profiles.
- **Sensor** (`SENSOR_WGSL`). The exposure multiplier is `t · 2^EV · ISO/100 / N²` (T-stop loss included). It converts light to electrons using each body's full-well capacity per µm² and pixel area. The pass adds Poisson (shot) and read noise, then clips. In the main view, noise is computed per *output* pixel, so a larger sensor really is cleaner at the same viewing size.
- **Loupe.** It re-renders a small window at the sensor's real pixel pitch and samples it through the colour filter array. Blur wider than its gather radius comes from the full view.

## Files

| Path | Contents |
| --- | --- |
| `index.html` | Page, layout and styles |
| `src/catalog.js` | Camera bodies, generic lenses and legacy product links, dial scales, white balance, picture styles |
| `src/lenses-brands.js` | Brand lens data, formats and class-based optical estimates |
| `src/presets.js` | Quick starts and what to look for, in English and Korean |
| `src/optics.js` | Camera maths: FOV, DOF, hyperfocal, exposure, diffraction, noise, shake |
| `src/scenes.js` | The five locations |
| `src/main.js` | UI state, per-view camera parameters, readouts, focus scale, A/B |
| `src/i18n.js` | English and Korean interface text, language detection and switching |
| `src/gpu/renderer.js` | WebGPU resources and pass orchestration |
| `src/gpu/shaders-*.js` | WGSL |
| `tools/check-optics.mjs` | `node tools/check-optics.mjs`: optics maths against textbook values |
| `tools/check-wgsl.mjs` | Compiles every shader in headless Chromium and lists errors |
| `tools/i18n-check.mjs` | Checks the language switch on desktop and phone widths: every label translated, no overflow, choice persists |
| `tools/scene-check.mjs` | Checks every location builds with complete data, has English and Korean text and at most 48 lights, and that the night scene's suggested exposure is applied and undone |
| `tools/share-check.mjs` | Checks that a copied link reopens the same setup (four setups, round trip), that unknown ids fall back to defaults, that Copy link reaches the clipboard, and that Reset restores the starting settings |
| `tools/catalog-check.mjs` | Checks the catalog: every field present, unique ids, pixel counts match the sensor shape, real products marked and translated |
| `tools/layout-check.mjs` | Checks the responsive layout without a GPU, at phone, tablet and desktop widths in both languages: no overflow, header not overlapping, picture and tabs pinned on narrow screens, one panel per tab, loupe keeps its size. `FONT_DIR=<pretendard folder>` measures with the real font offline |
| `tools/flow-check.mjs` | Checks catalog filters, camera-dependent equivalent view, quick starts, older links, manual-focus restoration and the phone gear tab without a GPU |
| `tools/controls-check.mjs` | Checks typed values, automatic modes, invalid input, shared settings and the location selector without a GPU |
| `tools/frame-check.mjs` | Checks frame geometry, fixed position, comparison lenses and link restoration without a GPU |
| `tools/frame-gpu-check.mjs` | Checks the widened WebGPU preview, focus boundary and A/B interaction |
| `tools/interact.mjs` | Clicks to focus, holds A, refocuses and switches lens in headless Chromium |
| `tools/shoot.mjs` | Renders setups headlessly and saves screenshots, e.g. `node tools/shoot.mjs out "scene=street&lens=p85&q=draft"` |

A setup can be shared as a link. URL parameters: `camera`, `lens`, `scene` (ids from the catalog), `focal`, `f` (f-number), `t` (shutter, e.g. `1/250` or `2`), `iso`, `mode` (`A`, `M`, `MA`), `ec`, `nd` (stops), `support` (`tripod`, `stabilized`, `handheld`), `dist` (m), `keep` (`0` to let the subject size change with focal length), `focus` (m) and `af` (`x,y` from -1 to 1) for a manual focus point, `zoom` (loupe 1, 2 or 4), `grid` (`0` hides the loupe grid), `zebra` (`1` shows clipped highlights), `wb`, `style`, `lang` (`en`, `ko`), `tab` (`gear`, `location`, `exposure`, `picture`, `results`: the panel shown on narrow screens), `cmp1` / `cmp2` (comparison lens ids), `cmp1f` / `cmp2f` (their focal lengths), and `q` (`draft`, `standard`, `high`).

## Products

The camera picker offers 15 sensor classes from 1-inch to 645. The lens picker offers 100 mirrorless brand models from Sony, Nikon, Canon, Fujifilm, Panasonic, OM System, Sigma, Tamron and Viltrox, plus 27 generic lens classes. Old links to the six previously available real camera models, the phone sensor and nine original real-lens IDs still open; those entries are hidden from the normal pickers unless selected by a link.

For the original real camera and lens entries, published figures were checked against maker or retailer listings on 2026-11-04; the GFX100 II ISO range and stabilisation, several low-pass filters and OM-1 image size still need the checks described in the prior catalog notes. The expanded brand rows include focal length and maximum aperture; some closest-focus distances and blade counts remain unverified. Minimum aperture, transmission and optical character may be class-derived estimates. Distortion, aberrations, softness, flare, coma and sensor noise are **not measurements of each product**. Check the manufacturer's specifications before relying on them. The Sony STF's f/2.8 is T5.6.

Brand rows are in `src/lenses-brands.js`; sensor classes and compatibility entries are in `src/catalog.js`. When adding or correcting a product, record the source and date, distinguish estimates from measured values, and run `node tools/catalog-check.mjs` and `node tools/check-optics.mjs`. A lens that does not cover the selected sensor shows dark corners. Mount names are informational and do not restrict combinations.

## Limits

- Thin-lens depth of field with per-lens corrections, not a ray trace through real lens prescriptions.
- Defocus is post-processed from one viewpoint, so a blurred foreground cannot reveal what is hidden behind it.
- Ghosts are generic reflections mirrored through the centre, not lens-specific ghost shapes.
- Headless Chromium in some containers cannot present a WebGPU canvas. `tools/shoot.mjs` therefore reads the frames back from the GPU and overlays them for screenshots.

## Cloud development and handoff

Use this repository for both Codex and Claude Code. Read [AGENTS.md](AGENTS.md), [STATUS.md](STATUS.md), [DECISIONS.md](DECISIONS.md), [HISTORY.md](HISTORY.md), and [CLOUD_HANDOFF.md](CLOUD_HANDOFF.md) when starting or switching AI platforms. Node 24 and Python 3 are used for development checks; the deployed page remains static with no application dependency or build step.

Run `bash scripts/cloud-setup.sh` for optics and catalog checks. Browser/WebGPU checks are separate. Claude has a repository-bound **렌즈 시뮬레이터** environment; account configuration and a successful runtime test are reported separately.
