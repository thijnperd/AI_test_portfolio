# Dither Studio — browser image dithering

A zero-dependency browser print shop for pixels: load an image (or a video),
pick an ink set, choose a press, stack a few effects, and export the proof as a
PNG (or the video as WebM). A free, offline alternative to commercial dithering
tools such as Dither Boy — open `index.html` in a browser and it runs; no build
step, no server, no packages.

The dithering core (`dither.js`) is DOM-free, so the same code runs in Node and
is covered by `node test.js`. Video mode lives in `video.js` (browser only):
the core never sees a `<video>` element, only frames.

## Three builds, one engine

This project is also published as its own repository,
[**thijnperd/dither-studio**](https://github.com/thijnperd/dither-studio), which
ships it three ways. All three share exactly one thing: `dither.js`, the
DOM-free engine.

| Build | Where | State | How you get it |
|---|---|---|---|
| **Web demo** | `demo/` in the app repository | frozen | <https://thijnperd.github.io/dither-studio/> |
| **Launcher app** | the repository root | frozen | the launchers: this page in an app-mode window with a profile of its own |
| **Desktop app** | `desktop/` | **active** | `Dither-Studio-Setup-<version>.exe` from [the latest release](https://github.com/thijnperd/dither-studio/releases/latest) |

The desktop build is the one being developed: an Electron application with a
frameless window that draws its own Photoshop-shaped chrome — a caption bar,
eight menus holding the whole catalogue, an options bar, a tool rail, a tabbed
document, a dock of ten collapsible panels and status lines — over the operating
system's own open and save dialogs, with a startup screen of its own — two hands
reach across the dark, and the left one is dithered and glows as the window
opens — and its own guide.
Its
[README](https://github.com/thijnperd/dither-studio/blob/main/desktop/README.md)
covers running and building it.

This folder is the portfolio copy of the web build: same source, same tests, no
launchers and no desktop code. When the engine changes here, mirror the change
there, and keep the two `README.md` files honest about which copy is which.

## Run the app

Open `index.html` in a modern browser. It opens on a generated demo scene so
there is something to dither immediately. Drop an image on the stage, paste one
with `Ctrl+V`, or use **Open image…**.

### Controls

| Control | What it does |
|---|---|
| **Algorithm** | The dither method in six groups: Basic (threshold), Ordered (18 screens), Stochastic (7 noise families), **Structure-aware** (3 screens that read the image's own contours), Mixing (3 Yliluoma variants), Error diffusion (14 kernels). Step through the list with the **◀ ▶** arrows beside the picker. |
| **Palette** | B&W (the 1-bit mono path) or one of 23 retro/constructed ink sets; colour modes snap every pixel to the nearest palette colour. The **swatch strip** under the picker shows the actual inks, and ◀ ▶ steps the palette list. |
| **Pixel size** | 1–16. The image is box-averaged down to this chunk size, dithered, then upscaled without smoothing — chunky pixel-art output. |
| **Threshold** | Exposure bias for the mono path (B&W palette): higher = darker, lower = brighter. Hidden in colour modes. |
| **Strength** | 0 % collapses any screen to a plain threshold, 100 % is the published screen, above that pushes it. |
| **Serpentine** | Reverses every other row's sweep for the error-diffusion kernels (removes the worming artifact). |
| **Smoothness / Flow / Streak** | Shown only for the structure-aware screens: the screen's feature size, how far it stretches along the image's contours, and how far it runs vertically (rain). |
| **Seed** | Drives everything random: noise dithers, the glitch stack. The generated masks are fixed, so only seed-dependent stages move. |
| **Tone** | Black point, white point, gamma, brightness, contrast, saturation, hue — applied before dithering (linear-light where it matters). |
| **Detail** | Blur, sharpen (unsharp mask) and an optional 3×3 median denoise. |
| **Ink** | Eleven tone maps that re-ink the finished dither, so 1-bit stays exactly two inks; the custom entry takes your own ink and paper. |
| **Transparency** | How the source's alpha is handled: flatten onto paper, dither the matte to hard 0/255 edges, or keep a real PNG alpha channel. |
| **Text mode** | Prints the proof as characters (ASCII, blocks, shades, hex, binary), with `.txt` export. |
| **Effects** | Thirteen post-dither effects, added one at a time to a stack that runs top to bottom. Each row carries its amount, its mode where it has one, and ▲ ▼ ✕ to reorder or remove it. Nothing reaches the press until you add it. |
| **Glow** | A blurred screen-blend pass after the effects (radius + intensity), added in linear light. |
| **Motion** | Play a video file or the webcam through the whole press, with a frame rate, a temporal dither rule and WebM recording. Playback is driven from the transport under the viewport. |
| **Update** | Under the viewport: **Full** renders working resolution on every move, **Live** (default) renders a half-resolution frame while you drag, and **Still** waits until the control settles — the option for slow machines and heavy recipes. |
| **Presets** | Twenty-one built-in recipes, including the three structure-aware looks; export/import the current settings as JSON. |

### The console

The rail is a stack of **stations** — Source, Press, Tone, Ink, Detail, Effects, Glow,
Motion, Type, Presets — and every station collapses. A closed station keeps a
one-line summary on its header (`Press · Bayer 8×8 · C64 · 16c`, `Tone · ct 1.20`,
`Effects · 3 in stack`), so what is set stays readable without opening anything.
The chip strip above the rail jumps to a station and opens it; the chip for the
station at the top of the rail is highlighted while you scroll, so the strip
doubles as a position readout. Which stations are open is remembered in
`localStorage`.

Under the viewport sits the **update mode** (Full / Live / Still) with the
playback transport beside it once a video source is loaded. The status bar above
the canvas stays the instrument readout: file, size, algorithm, palette, colour
count, render time, status.

### Phones and tablets

It is the same console, contracted — there is no second interface to learn:

| Screen | What changes |
|---|---|
| Any touch device | Every control grows to a finger (38px targets, an 18px slider thumb, thicker tracks), the keyboard hint line goes away, and the proof takes over its own gestures: one finger pans, two pinch to zoom. |
| iPad, both ways up | The rail takes 272px so touch labels and controls have room, and the bars breathe. |
| Phones (and any short landscape window) | The rail collapses into one **console bar** at the top: the brand, a Console button, and a live summary of the station in view (`Press · Floyd–Steinberg · B&W · 2c`). Tap it and the rail opens in place — the proof keeps the lead, nothing is covered by a modal. The chip strip becomes one sideways-scrolling row, the status bar one scrollable line, and the toolbar wraps to two. |

A collapsed console remembers whether you left it open, and the safe-area insets are honoured when the app is installed to a home screen.

### Keys

| Key | Action |
|---|---|
| Hold `C` | Compare against the original (hold the **Hold to compare** button instead, if you prefer) |
| `+` / `−` | Zoom in / out (Fit, 1×, 2×, 3×, 4×, 6×, 8×) |
| `0` | Fit to the stage |
| `R` | Roll a random recipe |
| Drag | Pan when zoomed in |

Export writes a PNG at 1×, 2×, 4× or 8× the working resolution with
nearest-neighbour scaling, so the pixel grid stays crisp. **Copy PNG** puts the
proof on the clipboard.

## The dither menu (46)

| Group | Algorithms |
|---|---|
| Basic | Threshold (no dither) |
| Ordered | Bayer 2×2 / 4×4 / 8×8 / 16×16, Clustered-Dot 4×4 / 8×8, Halftone 4×4 / 8×8 / 16×16, Void-and-Cluster 8×8, Blue-Noise 16×16, Line (horizontal / vertical / diagonal), Diagonal, Checks, Spiral |
| Stochastic | Random Noise, Blue-Noise Mask, Clustered Noise, IGN, R2 Low-Discrepancy, Crosshatch |
| Structure-aware | Smooth Diffusion, Rain Streaks, Dot Field (edge dots) |
| Mixing | Yliluoma mix: 2 colours / quick / deep |
| Error diffusion | Floyd–Steinberg, Atkinson, Sierra, Sierra-Lite, Sierra Two-Row, Jarvis–Judice–Ninke, Stucki, Burkes, Nakano, Fan, Shiau–Fan, Stevenson–Arce, Riemersma, Ostromoukhov |

The classic coefficient tables are used (Floyd–Steinberg 1976, Atkinson,
Jarvis–Judice–Ninke, Stucki, Burkes, Sierra, Fan, Shiau–Fan, Nakano,
Stevenson–Arce, and Ostromoukhov's variable-coefficient table from his 2001
paper). Riemersma travels a serpentine path carrying sixteen errors;
void-and-cluster is generated at load with Ulichney's algorithm, not copied from
a table.

### The structure-aware screens

These three read the picture instead of tiling over it. A two-octave noise
field is stretched along the image's own iso-luma contours (a short
line-integral convolution along the gradient's tangent), then given an edge
bias. The result is a screen that follows shading rather than fighting it:

- **Smooth Diffusion** — a calm, wavy screen; the darkest and busiest screens
  over a photo.
- **Rain Streaks** — stretches the screen vertically, so midtones print as dot
  strings that run down the frame.
- **Dot Field** — flats collapse toward a plain threshold while edges open up,
  so a subject prints as dots on clean paper.

Three sliders push them around: **Smoothness** (feature size), **Flow** (how far
the screen stretches along contours) and **Streak** (how far it runs
vertically). Both reaches are bounded by a **sample budget** (six million
neighbour samples per screen), so a 1600 px working image cannot make the
screen loop unbounded; the two reaches shrink together, so the look keeps its
proportions.

## Palettes (24)

| Palette | Colours |
|---|---|
| B&W (1-bit) | 2 |
| Game Boy / Game Boy Pocket | 4 / 4 |
| CGA Mode 4 / Teletext | 4 / 8 |
| ZX Spectrum | 15 |
| Commodore 64 / NES / Macintosh II / PICO-8 / Gruvbox / EGA | 16 each |
| Apple II | 6 |
| MSX | 15 |
| Virtual Boy | 4 |
| Grey ramps | 2-bit (4), 3-bit (8), 4-bit (16) |
| Single-ink sets | Amber, Sepia, Cyan, Blueprint, Matrix green, Ice |

## The effects stack (13)

The Effects station starts empty: pick an effect from **Add to the stack** and it
lands at the end of the pipeline, where you can reorder it with the row arrows or
take it out with ✕. The rail only ever shows what is actually running, which is
why a photo can look untouched while still offering thirteen effects.

| Effect | What it does |
|---|---|
| Chromatic aberration | Slides the red and blue channels apart by up to 8 px |
| JPEG blocks | Shifts or crushes seeded 8×8 blocks |
| Scanlines | Darkens every second row (CRT-ish) |
| Grain | Seeded noise — mono or per-channel |
| Pixel sort | Sorts bright runs by luminance (rows or columns) |
| Wave | Displaces rows/columns by a sine (horizon or vertical) |
| Drip | Smears pixels downward (streaks or melt) |
| Kaleidoscope | Mirrors a quadrant back over the frame (2/4/8-fold) |
| Dead pixels | Scatters stuck-on and stuck-off pixels |
| Vignette | Darkens or blooms the corners |
| CRT bloom | Channel-scaled bloom with a slight mask offset |
| Ripple | Concentric displacement from a seeded centre |
| Starfield | Seeded stars with optional streaks and glow |

## Video mode

Open a video file or the webcam, or use the generated clip (what the browser
checks drive). Every algorithm, ink, tone map and glitch runs live over the
frame; the same seeded pipeline, one frame at a time.

| Control | What it does |
|---|---|
| **Webcam** / **Open video…** | Pick the frame source. Loading a still image stops video mode. |
| **Play / Pause** | Starts and stops the frame clock. |
| **Frame rate** | 1–30 fps (the app's own cap). Slider drags keep working during playback. |
| **Temporal dither** | The three honest ways to spend the seed over time — see below. |
| **Record WebM** | Records the dithered canvas through `MediaRecorder` and downloads it (auto-stops at 60 s). |

| Temporal rule | What a frame does |
|---|---|
| **Frozen** | One screen for the whole clip: the stable, calm look. |
| **Shimmer** | A fresh seed every frame, so stochastic screens boil in place while the overall tone holds. |
| **Crawl** | Tile screens slide one pixel per frame — the classic walking ordered screen. (Structure screens are rebuilt instead and ignore the shift.) |

Cost control is the same deal as everywhere else in this project, with one
addition: **a frame that overruns its slot is dropped, not queued**. Playback
never builds a backlog and never pegs a core; the status bar reports the frame
rate and the drop count so the trade is visible. The working frame is capped at
720 px on its longest side.

Measured on this machine at 720×404 (headless Chromium, warm):

| Recipe | Per frame |
|---|---|
| B&W Floyd–Steinberg | ≈ 28 ms |
| Bayer 8×8 | ≈ 31 ms |
| Structure-aware (screen rebuilt per frame) | ≈ 240 ms |
| Yliluoma mixing (Game Boy) | ≈ 45 ms |
| All thirteen glitches | ≈ 130 ms |

So a 12 fps playthrough runs comfortably for the classic algorithms and drops
frames on the heaviest combinations — by design, and visibly.

## The pipeline

```
RGBA source ──▶ adjustments ──▶ pixel-size downscale ──▶ dither
     ──▶ tone map ──▶ glitch stack ──▶ glow ──▶ alpha ──▶ NEAREST upscale ──▶ RGBA result
```

- **Adjustments** run on the full working image: levels → gamma → brightness →
  contrast → saturation → hue → blur → sharpen → denoise, clamped at the end.
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
- **Tone maps, glitches and glow** run at the chunk resolution (before the
  upscale), then the result is scaled up. The **Colors** readout counts the
  dither stage before those passes, so it is the number the palette promises.

Determinism is a contract: every random decision flows through a seeded
mulberry32 generator, and the generated masks use fixed internal seeds. The same
recipe always produces the same proof — and the same video frame index always
produces the same frame, which is what makes a recording of a playback
reproducible. Blue-noise thresholds come from a generated 16×16 void-and-cluster
mask, tiled with per-tile rotations and offsets derived from the seed so the
tiling is not obvious.

## Performance

The budget from `DESIGN.md` is respected by capping work and caching:

- The working image is capped at **1600 px** on its longest side (larger images
  are scaled down on load and the status bar says so); a video frame is capped
  at **720 px**.
- Dragging a slider renders a **half-resolution preview** on the next animation
  frame; the full-quality pass runs when the control is released. During video
  playback the frame loop owns the canvas, so a slider drag never renders twice.
- Palettes are pre-quantised into a 32³ lookup table (built once per palette),
  glows and blooms use separable blur, and the glitch stack runs at the reduced
  resolution.
- Structure-aware screens are bounded by a sample budget and built once per
  render at the chunk resolution.
- Pixel size is capped at 16, the frame rate at 30 fps, and a slow video frame
  is dropped rather than queued.

Measured on this machine (`node test.js` prints them for 1024×1024, pixel size 1
— the worst case): B&W Floyd–Steinberg ≈ 145 ms, 16-colour palette
Floyd–Steinberg ≈ 170 ms, ordered dithering plus glitches ≈ 190 ms, the polished
mixing plan ≈ 615 ms, a structure screen with flow and streak at 100 ≈ 360 ms,
and all thirteen glitches ≈ 1.2 s. The default view (960×640 at pixel size 2)
renders in roughly 40–90 ms; the structure-aware screens are heavier — measured
in the browser at 960×640 pixel size 1 they land in the 300–600 ms band, and
around 240 ms per frame at 720×404 in video mode.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure: the station rail, the stage, the status bar, the toolbar and the viewport bar; script loading order |
| `style.css` | The console: station rhythm, stepper rows, the segmented update switch, the effects stack and the swatch strip, in the dark "print shop" theme |
| `dither.js` | DOM-free core: RNG, matrices, masks, structure-aware screens, algorithms, palettes, mixing plans, adjustments, tone maps, alpha, glitch stack, glow, the temporal rules, and `process()` |
| `video.js` | Browser-only video mode: frame source (file / webcam / generated clip), playback clock, frame dropping, WebM recording |
| `app.js` | Canvas rendering, controls, load/drop/paste, zoom/pan/compare, presets, text mode, video wiring, export |
| `test.js` | Node tests for the core |
| `README.md` | This file |
| `SOURCES.md` | Where every feature, table and palette came from |
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
seeded determinism across all 46 algorithms, the structure-aware screens
(determinism, endpoints, contour flow, vertical streaks, edge bias), pixel
chunking, settings clamping, the adjustments, every glitch and its modes, glow,
tone maps, the three alpha modes, colour counting, the video temporal rules, and
the performance budget.

## Browser verification

The repository ships a shared Playwright harness:

```bash
bash tools/check.sh "dither studio web/index.html" --expect canvas \
  --eval "window.__dither.stats()" --screenshot /tmp/dither.png
```

A phone or tablet has to be checked as one: Chromium reports `pointer: fine`
unless the harness is told otherwise, so without `--touch` a phone-width check
exercises the *desktop* layout and passes while the touch rules never load.

```bash
# a phone: coarse pointer, retina, console collapsed onto the proof
bash tools/check.sh "dither studio web/index.html" --size 390x844 --touch --dpr 3 \
  --eval "document.getElementById('console-toggle-note').textContent" --screenshot /tmp/phone.png

# the same phone with the console open, and an iPad the other way up
bash tools/check.sh "dither studio web/index.html" --size 390x844 --touch --dpr 3 \
  --click "#console-toggle" --screenshot /tmp/phone-open.png
bash tools/check.sh "dither studio web/index.html" --size 1024x768 --touch --dpr 2 \
  --screenshot /tmp/ipad.png
```

The page exposes `window.__dither` for checks and experimentation: `stats()`,
`applyPreset(id)`, `setSetting(path, value)`, `randomize()`, `canvasColors()`
(unique colours actually drawn on the canvas), `canvasSample()`/`canvasHash()`
(compare two frames), `setText()`/`textGrid()`, `alphaStats()`, the console
hooks `groups()`, `setGroup(id, open)`, `quality()`, `setQuality(mode)`,
`activeEffects()`, `addEffect(id)`, `removeEffect(id)`, `moveEffect(i, delta)`,
`swatches()`, `stepAlgorithm(delta)`, `stepPalette(delta)`, and the video hooks
`videoSynthetic(w, h)`, `videoTick(count, atFrame)`, `videoPlay()`,
`videoPause()`, `videoTemporal(mode)`, `videoSettings(frame)`, `videoStats()`,
`videoRecord(ms)`, `videoStop()`.

```bash
# the console: stations, the stack and the update modes
bash tools/check.sh "dither studio web/index.html" --eval "(function(){ var d = window.__dither; \
  d.addEffect('scanlines'); d.addEffect('grain'); d.moveEffect(1, -1); \
  return { stack: d.activeEffects(), rows: document.querySelectorAll('#effect-list .stack-row').length, \
           effects: d.groups().find(g => g.id === 'effects').note, \
           quality: d.setQuality('still'), swatches: d.swatches() }; })()"
```

```bash
# the video pipeline without a file or a camera
bash tools/check.sh "dither studio web/index.html" \
  --eval "JSON.stringify(window.__dither.videoSynthetic(480, 320))"

# the temporal rule, measured on canvas pixels rather than taken on trust
bash tools/check.sh "dither studio web/index.html" --eval "(async function(){ \
  const d = window.__dither; d.videoSynthetic(480, 320); \
  d.setSetting('algorithm','random-noise'); d.videoTemporal('freeze'); \
  d.videoTick(1, 4); const a = d.canvasSample(128); \
  d.videoTemporal('shimmer'); d.videoTick(1, 4); const b = d.canvasSample(128); \
  return { changed: a.some((v, i) => v !== b[i]), rule: d.videoSettings(7) }; })()"
```

## Credits

Inspired by **Dither Boy** (Studio AAA, commercial) and by
[**dither-guy**](https://github.com/manoelpiovesan/dither-guy), an open-source
Python alternative whose pipeline shape (adjust → downscale → dither →
post-process) informed this one. The structure-aware screens are built on the
idea of structure-aware halftoning and Cabral & Leedom's line-integral
convolution; the temporal rules are the classic temporal-dither choices made
explicit. No code was copied from any of these projects: the algorithms are the
published classics, the palettes are hardware facts, and this implementation is
original JavaScript. See [`SOURCES.md`](SOURCES.md) for the full provenance of
every feature and constant. Not affiliated with any project named here.
