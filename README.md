# Lens View Simulator

A web page for camera and lens customers. Pick a camera body, a lens and a sample location, and the page renders the photograph that combination would produce, live, with WebGPU. Change any setting and the frame re-renders, so the differences between products show up in the picture itself. You can also hold one result as **A** and drag a divider to compare it with the live **B**.

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

The four locations are designed to expose these differences:

- **Garden bench, golden hour.** A backlit teddy bear in front of string lights, leaf gaps and a low sun.
- **City street at night.** Lamps, neon, wet asphalt and moving cars. Use it for ISO noise, light trails and point-light bokeh.
- **Mountain lake, afternoon.** A pier leading to snowy peaks. Use it for distortion, haze, hyperfocal focusing and diffraction at f/16.
- **Studio test bench.** A Siemens star, a zone plate, fine fabric, a colour chart, a ruler running through focus and a spinning fan.

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
| `src/catalog.js` | Camera bodies, lenses, dial scales, white balance, picture styles |
| `src/optics.js` | Camera maths: FOV, DOF, hyperfocal, exposure, diffraction, noise, shake |
| `src/scenes.js` | The four locations |
| `src/main.js` | UI state, per-view camera parameters, readouts, focus scale, A/B |
| `src/gpu/renderer.js` | WebGPU resources and pass orchestration |
| `src/gpu/shaders-*.js` | WGSL |
| `tools/check-optics.mjs` | `node tools/check-optics.mjs`: optics maths against textbook values |
| `tools/check-wgsl.mjs` | Compiles every shader in headless Chromium and lists errors |
| `tools/interact.mjs` | Clicks to focus, holds A, refocuses and switches lens in headless Chromium |
| `tools/shoot.mjs` | Renders setups headlessly and saves screenshots, e.g. `node tools/shoot.mjs out "scene=street&lens=p85&q=draft"` |

A setup can be shared as a link. URL parameters: `camera`, `lens`, `scene` (ids from the catalog), `focal`, `f` (f-number), `t` (shutter, e.g. `1/250` or `2`), `iso`, `mode` (`A`, `M`, `MA`), `ec`, `nd` (stops), `support` (`tripod`, `stabilized`, `handheld`), `dist` (m), `zoom` (loupe 1, 2 or 4), `wb`, `style` and `q` (`draft`, `standard`, `high`).

## Adding products

Add an entry to `CAMERAS` or `LENSES` in `src/catalog.js`; the comments there describe each field. The current entries describe product *classes* (for example "Full frame 24 MP" or "85mm f/1.4 portrait") with representative values. They are not measurements of specific commercial models. For a real catalogue, fill in the manufacturer's sensor size, pixel count, base ISO and blade count. Optical character values (distortion, CA, softness, flare) are best taken from lab measurements.

## Limits

- Thin-lens depth of field with per-lens corrections, not a ray trace through real lens prescriptions.
- Defocus is post-processed from one viewpoint, so a blurred foreground cannot reveal what is hidden behind it.
- Ghosts are generic reflections mirrored through the centre, not lens-specific ghost shapes.
- Headless Chromium in some containers cannot present a WebGPU canvas. `tools/shoot.mjs` therefore reads the frames back from the GPU and overlays them for screenshots.
