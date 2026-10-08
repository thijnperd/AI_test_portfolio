# Dither Studio — browser image dithering

A zero-dependency browser print shop for pixels: load an image, pick a dither
algorithm and a palette, grade it, stack a few glitches, and export the proof as
a PNG or as characters. A free, offline alternative to commercial dithering
tools such as Dither Boy — open `index.html` in a browser and it runs; no build
step, no server, no packages.

The dithering core (`dither.js`) is DOM-free, so the same code runs in Node and
is covered by `node test.js`. Where each algorithm, table and palette came from
is recorded in [`SOURCES.md`](SOURCES.md).

## Run the app

Open `index.html` in a modern browser. It opens on a generated demo scene so
there is something to dither immediately. Drop an image on the stage, paste one
with `Ctrl+V`, or use **Open image…**.

### Controls

| Control | What it does |
|---|---|
| **Algorithm** | 43 methods in five families — see [the dither menu](#the-dither-menu). |
| **Palette** | B&W (the 1-bit mono path) or one of 21 ink sets: hardware palettes, greyscale ramps and two-colour inks. Colour modes snap every pixel to a palette colour. |
| **Pixel size** | 1–16. The image is box-averaged down to this chunk size, dithered, then upscaled without smoothing — chunky pixel-art output. |
| **Threshold** | Exposure bias for the mono path (B&W palette): higher = darker, lower = brighter. Hidden in colour modes. |
| **Strength** | 0–200%. Scales every screen away from mid-grey: 0 collapses any algorithm to a plain threshold, 100 is the published screen, above that pushes it. For error diffusion it scales the kernel weights, for masks the mask contrast, and for mixing plans the rank curve. |
| **Serpentine sweep** | Error diffusion only: alternate rows run right-to-left with a mirrored kernel, which is what stops Floyd–Steinberg's diagonal worms. |
| **Seed** | Drives everything random: noise dithers, the glitch stack. The generated masks are fixed, so only seed-dependent stages move. |
| **Tone** | Black/white points and gamma (levels), then brightness, contrast, saturation and hue — all applied before dithering. |
| **Detail** | Blur, sharpen (unsharp mask) and an optional 3×3 median denoise. |
| **Ink** | A tone map that re-inks the *finished* dither (grayscale, sepia, blueprint, cyanotype, amber CRT, rose, forest, thermal, gold leaf, or your own ink → paper pair). Because it maps black and white to two inks, 1-bit output stays exactly two inks. |
| **Transparency** | `Flatten onto paper` (default), `Dither the matte` (the alpha edge is dithered against a Bayer screen, so it stays hard) or `Keep as PNG alpha` (the chunk average is written back out as a real alpha channel). |
| **Text mode** | Prints the dithered grid as characters — ASCII, Unicode blocks, shades, hex or binary ramps, 6–24 px cells — with `.txt` export. The ramp is stretched over the proof's own luminance range so a dark image still uses the whole character set, and the panel's ink colours become the paper and the type. |
| **Glitch stack** | Eleven post-dither effects that run top to bottom; reorder with ↑↓, each with its own amount (some with a mode). |
| **Glow** | A blurred, linear-light bloom after the glitches (radius + intensity). |
| **Presets** | Seventeen built-in recipes; export/import the current settings as JSON. |
| **Random** | Rolls a complete fresh recipe — algorithm, palette, tones, glitches and seed. |

### Keys

| Key | Action |
|---|---|
| Hold `C` | Compare against the original (hold the **Hold to compare** button instead, if you prefer) |
| `R` | Roll a random recipe |
| `+` / `−` | Zoom in / out (Fit, 1×, 2×, 3×, 4×, 6×, 8×) |
| `0` | Fit to the stage |
| Drag | Pan when zoomed in |

**Export** writes a PNG at 1×, 2×, 4× or 8× the working resolution with
nearest-neighbour scaling (in text mode it exports the character proof), and
**Copy PNG** puts the same image on the clipboard.

## The dither menu

| Group | Algorithms |
|---|---|
| Basic | Threshold (no dither) |
| Ordered (18) | Bayer 2×2, 4×4, 8×8, 16×16 · Clustered-Dot 4×4, 8×8 · Halftone 4×4, 8×8 (round), 16×16 (fine) · Spiral 8×8 · Line 2×2 and 4×4, horizontal and vertical · Diagonal 4×4, 8×8 · Checkerboard · Void-and-Cluster 8×8 |
| Stochastic (7) | Random Noise · Blue-Noise Mask 16 · Blue-Noise Mask 32 (large, built lazily) · Clustered Noise · Interleaved Gradient Noise · R2 Low-Discrepancy · Crosshatch |
| Mixing (3) | Yliluoma mix: 2 colours · quick · deep |
| Error diffusion (14) | Floyd–Steinberg, Atkinson, Sierra, Sierra (two-row), Sierra-Lite, Jarvis–Judice–Ninke, Stucki, Burkes, Nakano, Fan, Shiau–Fan, Stevenson–Arce, Riemersma, Ostromoukhov |

The classic coefficient tables are used as published (Floyd–Steinberg 1976,
Atkinson, Jarvis–Judice–Ninke 1976, Stucki 1981, Burkes 1988, Sierra 1989, Fan
1975, Shiau–Fan 1990, Nakano, Stevenson–Arce 1985, and Ostromoukhov's
variable-coefficient table from 2001). Riemersma travels a serpentine path
carrying sixteen errors. Void-and-cluster and the blue-noise masks are generated
with Ulichney's algorithm, not copied from tables; the line, diagonal, checks,
spiral and clustered-dot screens are generated from their definitions.

## Palettes

| Palette | Colours |
|---|---|
| B&W (1-bit), Amber CRT, Sepia, Cyan ink, Blueprint | 2 |
| CGA Mode 4, Virtual Boy (4 reds), Grayscale 4 (2-bit), Game Boy, Game Boy Pocket | 4 |
| Apple II, Grayscale 8 (3-bit) | 6 / 8 |
| ZX Spectrum, MSX (TMS9918) | 15 |
| Commodore 64, NES, EGA/VGA 16, Macintosh II, Grayscale 16 (4-bit), PICO-8, Gruvbox | 16 |

## The glitch stack

| Effect | What it does | Modes |
|---|---|---|
| Chromatic aberration | Slides the red and blue channels apart by up to 8 px | |
| JPEG blocks | Shifts or crushes seeded 8×8 blocks | |
| Scanlines | Darkens every second row | |
| Grain | Seeded noise over the frame | monochrome / colour |
| Pixel sort | Sorts bright runs by luminance | rows / columns |
| Wave ripple | Sine-displaces every row sideways with wrap | |
| Drip | Slides column strips down and smears the gap | |
| Kaleidoscope | Mirrors the frame into wedges | 2-way / 4-way / 8-way |
| Dead pixels | Scatters stuck black and white pixels | |
| Vignette | Darkens the corners | |
| CRT bloom & warp | Barrel warp plus a linear-light bloom of the bright parts | |

## How it works

```
RGBA source ──▶ adjustments ──▶ pixel-size downscale ──▶ dither
     ──▶ tone map ──▶ glitch stack ──▶ glow ──▶ alpha ──▶ NEAREST upscale ──▶ RGBA
```

- **Adjustments** run on the full working image: levels (black/white point) →
  gamma → brightness → contrast → saturation → hue → blur → sharpen → denoise,
  clamped at the end.
- **Pixel-size chunking** box-averages each `pixelSize × pixelSize` block before
  dithering, then the result is upscaled with nearest-neighbour.
- **Mono path** (B&W palette): luma is biased by the threshold control, then
  ordered/stochastic algorithms compare it against a mask (`white when
  luma > mask`) while error diffusion quantises to 0/255 and scatters the error.
  Mask values use half-step midpoints, so pure black and pure white dither
  without stray speckles at either end.
- **Colour path**: each pixel snaps to the nearest palette colour by squared RGB
  distance (a 32³ lookup table keeps slider drags fast), then either the mask
  jitters the pixel before snapping or the RGB error is diffused. The distance
  metric deliberately matches the space the error travels in — that consistency
  is what makes a flat patch dither between two palette colours instead of
  collapsing to one. Error is accumulated without clamping, so tone survives.
- **Mixing** builds a *plan* per target colour bin: a short multiset of palette
  entries whose mean is the tone the tile will render, applied across an 8×8
  Bayer screen. The plan is searched slot by slot (the deep variant sweeps the
  whole palette three times), so it always beats the nearest single colour.
  See `SOURCES.md` for why the plan metric minimises the mean rather than
  Yliluoma's published prefix sum.
- **Tone map** re-inks the dithered chunk grid before the post effects, which
  is why a 1-bit dither maps to exactly two inks.
- **Alpha** is averaged per chunk and never mixed into the colour: the hidden
  RGB under a transparent pixel must not tint its neighbours. `Dither the matte`
  resolves it against a Bayer screen; `Keep as PNG alpha` writes the average.
- **Glitches and glow** run at chunk resolution before the upscale. Glow adds
  light in linear space, so a glow keeps its hue instead of washing to white.
  The **Colors** readout counts the dither stage, so it is the number the
  palette promises.

Determinism is a contract: every random decision flows through a seeded
mulberry32 generator, and generated masks use fixed internal seeds. The same
recipe always produces the same proof.

## Performance

The budget from `DESIGN.md` is respected by capping work and caching:

- The working image is capped at **1600 px** on its longest side (larger images
  are scaled down on load and the status bar says so).
- Dragging a slider renders a **half-resolution preview** on the next animation
  frame; the full-quality pass runs when the control is released.
- Palettes are pre-quantised into a 32³ lookup table (once per palette), mixing
  plans are cached per palette and target bin, the blue-noise masks are built
  once, blurs are separable, and glitches run at chunk resolution.
- Pixel size is capped at 16; text mode is capped at 30 000 cells per frame and
  falls back to pixels above that.

Measured on this machine at 1024×1024, pixel size 1 (`node test.js` prints the
numbers): B&W Floyd–Steinberg ≈ 110–440 ms, 16-colour palette Floyd–Steinberg
≈ 140–210 ms, Bayer 4×4 with the glitch stack ≈ 180–220 ms, the polished mixing
plan ≈ 490–670 ms, the full eleven-effect glitch stack ≈ 1.1 s. The default view
(960×640 at pixel size 2) renders in roughly 40–90 ms and a preview render is
under 35 ms. The 32×32 blue-noise mask is built once, lazily, when that
algorithm is first chosen: ≈ 0.44 s in Node, ≈ 0.57 s in the browser.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure, controls, script loading order |
| `style.css` | Layout and the dark "print shop" instrument-panel theme |
| `dither.js` | DOM-free core: RNG, matrices, masks, algorithms, mixing plans, palettes, tone maps, adjustments, alpha, glitch stack, glow, the `process()` pipeline |
| `app.js` | Canvas rendering, controls, text mode, load/drop/paste, zoom/pan/compare, presets, export |
| `test.js` | Node tests for the core |
| `SOURCES.md` | Where the features, algorithm tables and palettes came from |
| `README.md` | This file |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## Tests

From this folder, run:

```bash
node test.js
```

Tests use Node's built-in `assert`; nothing needs installing. They cover matrix
and screen generation (including that a clustered-dot screen grows outward from
the tile centre and a checkerboard screen fills one parity first), void-and-
cluster permutations and determinism, blue-noise bounds, palette lookup vs.
nearest-by-definition, ordered and error-diffusion tone reproduction, the
strength and serpentine controls, palette membership of every output pixel,
mixing plans (sorted multiset, error hierarchy, and that a flat patch under a
plan averages to its target and beats the nearest single colour), mono mixing
staying black and white, tone maps, the three alpha modes, every glitch and its
modes, glow, colour counting, seeded determinism across all 43 algorithms, pixel
chunking, settings clamping, and the performance budget.

## Browser verification

The repository ships a shared Playwright harness:

```bash
bash tools/check.sh "dither studio/index.html" --expect canvas \
  --eval "window.__dither.stats()" --screenshot /tmp/dither.png
```

The page exposes `window.__dither` for checks and experimentation: `stats()`,
`applyPreset(id)`, `setSetting(path, value)`, `randomize()`, `exportTxt()`,
`setText(on, ramp, size)`, `textGrid()`, `alphaStats()`, `canvasColors()`
(unique colours actually drawn on the canvas — useful for asserting palette
membership) and `loadDataURL(url, name)` for loading a synthetic source.

## Credits

Inspired by **Dither Boy** (Studio AAA, commercial) and by the open-source
dithering scene — [dither-guy](https://github.com/manoelpiovesan/dither-guy),
[didder](https://github.com/makew0rld/didder),
[DitherPunk.jl](https://juliaimages.org/DitherPunk.jl/v3.1/api/) and
[Joel Yliluoma's articles](https://bisqwit.iki.fi/story/howto/dither/jy/). No
code was copied from any of them: the algorithms are the published classics, the
palettes are hardware facts, and this implementation is original JavaScript.
[`SOURCES.md`](SOURCES.md) lists every source against what it informed. Not
affiliated with any of these projects.
