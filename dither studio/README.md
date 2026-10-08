# Dither Studio — browser image dithering

A zero-dependency browser print shop for pixels: load an image, pick a dither
algorithm and a retro palette, stack a few glitches, and export the proof as a
PNG. A free, offline alternative to commercial dithering tools such as
Dither Boy — open `index.html` in a browser and it runs; no build step, no
server, no packages.

The dithering core (`dither.js`) is DOM-free, so the same code runs in Node and
is covered by `node test.js`.

## Run the app

Open `index.html` in a modern browser. It opens on a generated demo scene so
there is something to dither immediately. Drop an image on the stage, paste one
with `Ctrl+V`, or use **Open image…**.

### Controls

| Control | What it does |
|---|---|
| **Algorithm** | The dither method, grouped: Basic (threshold), Ordered (Bayer 2×2/4×4/8×8, clustered-dot, halftone, void-and-cluster), Stochastic (random noise, blue-noise mask), Error diffusion (11 kernels). |
| **Palette** | B&W (the 1-bit mono path) or a retro hardware palette; colour modes snap every pixel to the nearest palette colour. |
| **Pixel size** | 1–16. The image is box-averaged down to this chunk size, dithered, then upscaled without smoothing — chunky pixel-art output. |
| **Threshold** | Exposure bias for the mono path (B&W palette): higher = darker, lower = brighter. Hidden in colour modes. |
| **Seed** | Drives everything random: noise dithers, the glitch stack. The generated masks are fixed, so only seed-dependent stages move. |
| **Tone** | Brightness, contrast, saturation, hue — applied to the image before dithering. |
| **Detail** | Blur, sharpen (unsharp mask) and an optional 3×3 median denoise. |
| **Glitch stack** | Five post-dither effects that run top to bottom; reorder with ↑↓, each with its own amount. |
| **Glow** | A blurred screen-blend pass after the glitches (radius + intensity). |
| **Presets** | Nine built-in recipes (Retro Game Boy, Newsprint, Zine 1-bit, C64 Poster, Terminal Green, Spectrum Loading, Riso Poster, VHS Decay, Glitch Sort); export/import the current settings as JSON. |

### Keys

| Key | Action |
|---|---|
| Hold `C` | Compare against the original (hold the **Hold to compare** button instead, if you prefer) |
| `+` / `−` | Zoom in / out (Fit, 1×, 2×, 3×, 4×, 6×, 8×) |
| `0` | Fit to the stage |
| Drag | Pan when zoomed in |

Export writes a PNG at 1×, 2×, 4× or 8× the working resolution with
nearest-neighbour scaling, so the pixel grid stays crisp.

## The dither menu

| Group | Algorithms |
|---|---|
| Basic | Threshold (no dither) |
| Ordered | Bayer 2×2, Bayer 4×4, Bayer 8×8, Clustered-Dot 4×4, Halftone 4×4, Void-and-Cluster 8×8 |
| Stochastic | Random Noise, Blue-Noise Mask |
| Error diffusion | Floyd–Steinberg, Atkinson, Sierra, Sierra-Lite, Jarvis–Judice–Ninke, Stucki, Burkes, Nakano, Stevenson–Arce, Riemersma, Ostromoukhov |

The classic coefficient tables are used (Floyd–Steinberg 1976, Atkinson,
Jarvis–Judice–Ninke, Stucki, Burkes, Sierra, Nakano, Stevenson–Arce, and
Ostromoukhov's variable-coefficient table from his 2001 paper). Riemersma
travels a serpentine path carrying sixteen errors; void-and-cluster is
generated at load with Ulichney's algorithm, not copied from a table.

## Palettes

| Palette | Colours |
|---|---|
| B&W (1-bit) | 2 |
| Game Boy / Game Boy Pocket | 4 / 4 |
| CGA Mode 4 / Teletext | 4 / 8 |
| ZX Spectrum | 15 |
| Commodore 64 / NES / Macintosh II / PICO-8 / Gruvbox | 16 each |

## The glitch stack

| Effect | What it does |
|---|---|
| Chromatic aberration | Slides the red and blue channels apart by up to 8 px |
| JPEG blocks | Shifts or crushes seeded 8×8 blocks |
| Scanlines | Darkens every second row (CRT-ish) |
| Grain | Seeded monochrome noise |
| Pixel sort | Sorts bright runs in each row by luminance |

## How it works

```
RGBA source ──▶ adjustments ──▶ pixel-size downscale ──▶ dither
     ──▶ glitch stack ──▶ glow ──▶ NEAREST upscale ──▶ RGBA result
```

- **Adjustments** run on the full working image: brightness → contrast →
  saturation → hue → blur → sharpen → denoise, clamped at the end.
- **Pixel-size chunking** box-averages each `pixelSize × pixelSize` block before
  dithering, then the result is upscaled with nearest-neighbour. Dithering the
  reduced image is both faster and truer to pixel-art tools.
- **Mono path** (B&W palette): luma is biased by the threshold control, then
  ordered/stochastic algorithms compare it against a mask (`white when
  luma > mask`), while error-diffusion kernels quantise to 0/255 and scatter
  the error. Mask values are normalised with half-step midpoints, so pure black
  and pure white dither without stray speckles at either end.
- **Colour path**: each pixel snaps to the nearest palette colour by squared
  RGB distance (a 32³ lookup table keeps slider drags fast), then either the
  mask jitters the pixel before snapping (ordered/stochastic) or the RGB error
  is diffused (error-diffusion kernels). The distance metric deliberately
  matches the space the error travels in — that consistency is what makes a
  flat patch dither between two palette colours instead of collapsing to one.
  Error is accumulated without clamping, so tone is preserved.
- **Glitches and glow** run at the chunk resolution (before the upscale), then
  the result is scaled up. The **Colors** readout counts the dither stage
  before glitches and glow, so it is the number the palette promises.

Determinism is a contract: every random decision flows through a seeded
mulberry32 generator, and the generated masks use fixed internal seeds. The
same recipe always produces the same proof. Blue-noise thresholds come from a
generated 16×16 void-and-cluster mask, tiled with per-tile rotations and
offsets derived from the seed so the tiling is not obvious.

## Performance

The budget from `DESIGN.md` is respected by capping work and caching:

- The working image is capped at **1600 px** on its longest side (larger images
  are scaled down on load and the status bar says so).
- Dragging a slider renders a **half-resolution preview** on the next animation
  frame; the full-quality pass runs when the control is released.
- Palettes are pre-quantised into a 32³ lookup table (built once per palette),
  and glows/blows use separable box blur.
- Pixel size is capped at 16, and the glitch stack is applied at the reduced
  resolution, not the source resolution.

Measured on this machine (`node test.js` prints them for 1024×1024, pixel size
1 — the worst case): B&W Floyd–Steinberg ≈ 124 ms, 16-colour palette
Floyd–Steinberg ≈ 209 ms, ordered dithering plus glitches ≈ 170 ms. The default
view (960×640 at pixel size 2) renders in roughly 40–90 ms, and a preview render
is typically under 35 ms.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure, controls, script loading order |
| `style.css` | Layout and the dark "print shop" instrument-panel theme |
| `dither.js` | DOM-free core: RNG, matrices, masks, algorithms, palettes, adjustments, glitch stack, glow, the `process()` pipeline |
| `app.js` | Canvas rendering, controls, load/drop/paste, zoom/pan/compare, presets, export |
| `test.js` | Node tests for the core |
| `README.md` | This file |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## Tests

From this folder, run:

```bash
node test.js
```

Tests use Node's built-in `assert`; nothing needs installing. They cover matrix
generation and endpoint-safety, void-and-cluster permutations and determinism,
blue-noise bounds, palette lookup vs. nearest-by-definition, ordered and
error-diffusion tone reproduction, palette membership of every output pixel,
seeded determinism across all 20 algorithms, pixel chunking, settings
clamping, the adjustments, each glitch, glow, colour counting, and the
performance budget.

## Browser verification

The repository ships a shared Playwright harness:

```bash
bash tools/check.sh "dither studio/index.html" --expect canvas \
  --eval "window.__dither.stats()" --screenshot /tmp/dither.png
```

The page exposes `window.__dither` for checks and experimentation:
`stats()`, `applyPreset(id)`, `setSetting(path, value)` and
`canvasColors()` (unique colours actually drawn on the canvas, useful for
asserting palette membership).

## Credits

Inspired by **Dither Boy** (Studio AAA, commercial) and by
[**dither-guy**](https://github.com/manoelpiovesan/dither-guy), an open-source
Python alternative whose pipeline shape (adjust → downscale → dither →
post-process) informed this one. No code was copied from either project: the
algorithms are the published classics, the palettes are hardware facts, and
this implementation is original JavaScript. Not affiliated with either project.
