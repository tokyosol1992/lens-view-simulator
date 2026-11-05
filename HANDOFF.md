# Handoff (2026-11-05)

For whoever continues this work (including a different AI tool). Branch: `claude/catalog-expansion-usage-flow`. It is **not merged** and **no PR exists**. Read `README.md` first.

## What this work did
1. **Bodies are sensor classes only** (user request): 1-inch, Micro Four Thirds, APS-C (24/26/40 MP, 22.3×14.9 Canon-type), full frame (12/24/33/45/61 MP), medium format 44×33 (50/102 MP) and 645 53.4×40 (100/150 MP). Phone, 1/2.3″ and cinema bodies were added earlier in the session and then removed because the user's range is 1-inch to 645.
2. **Brand mirrorless lenses** (`src/lenses-brands.js`): Sony E 13, Nikon Z 13, Canon RF 13, Fujifilm X+GF 19, Panasonic L+MFT 11, OM System 5, Sigma 13, Tamron 8, Viltrox 5. Plus 27 generic-class lenses kept so old links still open. DSLR lenses were left out on purpose (user: "mirrorless first").
3. **Interface**: lens browser (brand, view class by full-frame equivalent, "covers this camera" filter, jump to nearest equivalent view); quick starts (7); setup kept in the URL; Copy link; Reset; A/B button under the picture; pinned picture on phones; sticky settings column on wide screens.

## Checks (all passed at the last run)
`node tools/check-optics.mjs`, `node tools/i18n-check.mjs`, `node tools/flow-check.mjs`. They use headless Chromium with SwiftShader and are slow (flow-check ~2–4 min). Remote Google Fonts can hang page load in the sandbox; `flow-check` blocks them. `reload` needs `waitUntil: 'domcontentloaded'`.

## Known gaps (not done)
- **Spec accuracy.** Focal length and maximum aperture are the maker's. Closest focus and blade count are from memory; rows marked `est` (Panasonic, Tamron, Viltrox except 23mm and 85mm, Canon RF 135mm, 645 generics) are unverified. Web search found no official closest-focus or blade values for Viltrox 33/56/75. The UI shows an "estimates" note for these. Check against maker spec sheets.
- **Optical character is not measured.** Distortion, CA, softness, flare, coma, glow come from the class table in `lenses-brands.js` (`CLASSES`, tier `pro`/`std`). Two lenses of the same class look alike. Real data would be lab measurements.
- **Coverage gaps.** No Sony APS-C E lenses, no Hasselblad XCD, no Samyang, Zeiss, Voigtländer, Laowa, TTArtisan, Leica. Sigma/Tamron/Viltrox are listed under one mount string; per-mount versions are not modelled. Nikon Z 58mm f/0.95 was skipped because aperture values below f/1 are not supported by the aperture scale and the catalog check.
- **645 lenses** are generic (no mirrorless 645 line-up exists), image circle 69 mm, values are guesses.
- **Mount is information only.** Bodies are sensor classes, so any lens can be paired with any body; only image-circle coverage is checked (dark corners).
- **Not visually reviewed:** renders on the 645 bodies and many brand lenses were only checked for no errors, not inspected image by image. Only the Korean desktop screen, a phone scroll and a few new-gear shots were looked at. Real phones/tablets were not tested.
- **Shared links** do not store a manual focus point; the link reopens focused on the subject.
- Quick start texts (EN/KO) describe expected visual differences that were not each verified in the rendered image.
- Default lens is still the generic `n50p`; consider a brand lens as default.
- Old generic ids stay for link compatibility; the `phone`, `cine`, `compact12`, `ph69`, `sz`, `c35` ids no longer exist, so links using them fall back to defaults.

## Suggested next steps
1. Verify `est` rows from manufacturer data; then remove the flag.
2. Add missing brands/lenses (Sony APS-C, Samyang, Zeiss, Voigtländer, Laowa, Hasselblad XCD) as rows in `ROWS`.
3. Replace class-generated optical values with measured ones for the most-used lenses; add a per-lens override field in `build()`.
4. Review renders on every body format (especially 645, 1-inch, M4/3) and tune `QUALITY` if heavy.
5. Test on real phones; consider moving the lens browser into a dialog if the sidebar feels long.
6. Open a PR from this branch when ready (none exists).
