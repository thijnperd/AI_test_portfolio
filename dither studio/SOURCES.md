# Sources — what Dither Studio was researched from

Dither Studio is original code (there is no copied source in this project), but
its feature set, its algorithm catalogue and its numeric tables were researched
from published work and from open-source dithering tools. This file records
those sources so the provenance of every feature and constant is traceable.

Two rules were kept throughout:

1. **Read the behaviour, write our own code.** Where a project is
   GPL-licensed (dither-guy) nothing was copied; the pipeline shape and feature
   inventory were studied, and every line here was written from the algorithm's
   published description.
2. **Tables and constants come from their published form.** Error-diffusion
   kernels, palette values and the Ostromoukhov table are the numbers their
   authors published, quoted here as data, not as copied code.

## Feature research (what a premium ditherer contains)

| Source | What it informed |
|---|---|
| [Dither Boy — Studio AAA](https://studioaaa.com/product/dither-boy/) (product page) | The feature checklist this project was measured against: many classic algorithms plus palette-first modes, pixel-size chunking, adjustments (tone, colour, blur/sharpen/denoise), a stackable stack of post effects (aberration, blocks, scanlines, grain, pixel sort, CRT, glow), text/ASCII output, presets, and PNG export. |
| [dither-guy](https://github.com/manoelpiovesan/dither-guy) (Python, GPL) | The pipeline order — adjust → downscale by pixel size → dither → post effects → nearest-neighbour upscale — and the preset/recipe shape. Behaviour only; no code taken. |
| [didder](https://github.com/makew0rld/didder) (Go, MIT) | The breadth of the algorithm list: Bayer tile sizes, clustered dot and halftone screens, void-and-cluster, blue noise, IGN, R2, crosshatch, line screens and checks; palettes as named ink sets; a global "strength" knob; alpha handling. |
| [DitherPunk.jl API](https://juliaimages.org/DitherPunk.jl/v3.1/api/) | The taxonomy used for the algorithm picker: ordered / error-diffusion / stochastic / palette families, and the naming of the published kernels. |
| [ImageMagick ordered-dither threshold maps](https://usage.imagemagick.org/bugs/ordered-dither/) | The shape of the threshold-map catalogue (checks, line maps, clustered-dot maps of several sizes), which our generated `checks`, `line-*`, `clustered-dot-*` and `halftone-*` screens fill in. |

## Algorithm references (the maths)

| Source | What it informed |
|---|---|
| [Joel Yliluoma — "Arbitrary-palette positional dithering"](https://bisqwit.iki.fi/story/howto/dither/jy/) | The mixing-plan family (`yliluoma-2`, `-quick`, `-deep`): a plan is a short multiset of palette entries applied across an ordered screen, searched for by five passes over candidate colours. See the note below on why our plan metric differs from the published one. |
| Robert Ulichney, *Digital Halftoning* / "The void-and-cluster method for dither array generation" (1987–1993) | `voidAndCluster()`: the relax loop plus the two ranking passes that turn a binary pattern into an ordered dither array. Powers the void-and-cluster screen and both blue-noise masks (16×16 and the lazily built 32×32). |
| Floyd & Steinberg (1976) | `floyd-steinberg` (7/3/5/1 over 16). |
| Jarvis, Judice & Ninke (1976) | `jjn` (over 48). |
| Stucki (1981) | `stucki` (over 42). |
| Burkes (1988) | `burkes` (over 32). |
| Sierra (Sierra-3, 1989) | `sierra` (over 32), `sierra-two-row` (over 16), `sierra-lite` (over 4). |
| Atkinson (Apple, 1987) | `atkinson` (over 8, with its characteristic contrast boost). |
| Fan (1975) | `fan` (over 16). |
| Shiau & Fan (1990) | `shiau-fan` (over 18). |
| Stevenson & Arce (1985) | `stevenson-arce` (12 taps over 200). |
| Nakano | `nakano` (over 24). |
| Victor Ostromoukhov (2001), variable-coefficient diffusion | `ostromoukhov`, including the 32-band coefficient table quoted in its published form. |
| Thiadmer Riemersma | `riemersma`: the 16-entry error queue with a 1/16 decay, carried along a serpentine path. |
| Bryce Bayer (1973) | `bayer2/4/8/16` via the recursive rank construction. |
| Jorge Jimenez (2013), "Next Generation Post Processing…" | `ign` — interleaved gradient noise. |
| Martin Roberts (2018), low-discrepancy sequences | `r2` — the R2 sequence as a dither mask. |
| IEC 61966-2-1 / the sRGB standard | The sRGB ↔ linear transfer functions used by the glow and CRT bloom so light adds in linear space. |

### One deliberate divergence, stated plainly

Yliluoma's published plan metric sums the error of *every prefix* of the sorted
plan. Implemented literally, that sum is dominated by the darkest entry the plan
holds, so the search drifts towards a single colour per target and a flat patch
loses its tone — measured here at a mean of 207 for a target of 128. Weighting
the prefixes by 1/k softens it without fixing it, and a cohesion term was
measured and rejected because it costs real tone accuracy (mean error 5.8 → 10.5
over a target sweep). Our search therefore minimises the plan's **mean** error,
which is exactly the tone a plan renders, and then improves the plan slot by
slot. The result reproduces a flat target to within a few units and beats the
nearest single palette colour in 248 of 256 sampled targets; the trade is that
entries in a plan can sit far from the target on a sparse palette, so mixing on
a photo has a granular texture. That is the family's character, not a defect —
pick a dense palette or the two-colour variant for a calmer screen.

## Structure-aware screens (added with the third press)

| Source | What it informed |
|---|---|
| [Pang, Barkan & Mendlovic — "Structure-aware halftoning" (2008)](https://www.researchgate.net/publication/224303793_Structure-aware_halftoning) | The idea behind the whole group: a screen that is generated *from the image* (edge strength and direction) instead of tiled over it, so the texture follows the shading. Our implementation is our own: a two-octave value-noise field bent along the image's contours. |
| Cabral & Leedom — "Imaging vector fields using line integral convolution" (SIGGRAPH 1993) | The stretch-along-contours step: sample the noise field either side of each pixel along the gradient's tangent (a short LIC walk), which is what makes the screen flow with the shading. |
| The classic swirl / ripple / wave displacement (as documented for e.g. [ImageMagick's `-swirl` and `-wave`](https://usage.imagemagick.org/transform/)) | The `ripple` glitch (concentric displacement about a seeded centre) and `wave`'s smooth displacement. |
| Standard procedural star-field practice (seeded scattered stars, optional motion streaks and a radial glow) | The `starfield` glitch. Constructed here; a star field has no canonical published table. |

## Video, temporal dithering and recording

| Source | What it informed |
|---|---|
| [Dither Boy — Studio AAA](https://studioaaa.com/product/dither-boy/) (product page) | The last untouched item on the feature checklist this project measures itself against: video and animated output. |
| The temporal-dithering literature for frame-rate-modulated displays (a pattern that is re-generated per frame so the eye averages it) | The three rules made explicit in `temporalSettings`: **freeze**, **shimmer** (a new seed per frame, so stochastic screens boil while tone holds) and **crawl** (the ordered screen slides a pixel per frame — the demoscene / Yliluoma-style walking screen). |
| [MDN — `HTMLCanvasElement.captureStream()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream) and [`MediaRecorder`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) | WebM recording of the dithered canvas, with VP9 → VP8 → default codec fallback and a 60 s guard against runaway memory. |
| [MDN — `HTMLVideoElement`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement) and [`getUserMedia`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) | The frame sources: a user-picked video file, the webcam, or the generated clip the browser checks drive (which needs no codec, so verification stays offline and deterministic). |

## Palette data

| Source | Palette |
|---|---|
| Game Boy / Game Boy Pocket hardware palettes | `gameboy`, `gameboy-pocket` |
| Commodore 64 (VIC-II) hardware palette | `c64` |
| NES (2C02) hardware palette | `nes` |
| ZX Spectrum (ULA) hardware palette | `zx-spectrum` |
| Texas Instruments TMS9918 (MSX) palette table | `msx` |
| Apple II "artifact" colour set (6 colours) | `apple2` |
| IBM EGA / VGA 16-colour text palette | `ega` |
| CGA mode 4 / mode 5 palettes | `cga` |
| Macintosh II 16-colour palette | `macintosh` |
| Teletext (8-colour) palette | `teletext` |
| Nintendo Virtual Boy (4 reds) | `virtualboy` |
| [PICO-8](https://www.lexaloffle.com/pico-8.php) official palette | `pico8` |
| [gruvbox](https://github.com/morhetz/gruvbox) theme colours | `gruvbox` |
| Constructed inks and levels | `gray-4/8/16` (2/3/4-bit ramps), `amber`, `sepia`, `cyan-ink`, `blueprint`, `ice`, and the tone maps in `TONE_MAPS` |
| The digital rain of *The Matrix* (a two-ink green phosphor look, as reproduced across countless shader ports) | `matrix` — constructed here from the look, not copied from any implementation |

## What is not from anywhere

The press console itself — `index.html`, `style.css`, `app.js`, the demo scene,
the text mode, the preset recipes, the glitch stack's implementation, the
tone-map system, the alpha pipeline, the tests and this file — is original work
for this repository, written against the visual language in
[`DESIGN.md`](../DESIGN.md).

## Keeping this current

When a feature, algorithm, palette or numeric table is added from a source,
add a row here naming the source and what it informed, in the same session.
