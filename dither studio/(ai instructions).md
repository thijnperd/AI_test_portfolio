# AI instructions for the Dither Studio project

A zero-dependency browser image-dithering tool: load an image, choose one of 20
dither algorithms and a retro palette, stack glitch effects, export a PNG. The
core is DOM-free so it runs in Node for tests. World/voice: **"instrument
panel, print shop"** — dark press console, the canvas is a proof sheet.

## Before working

- Read this file and [`README.md`](README.md).
- For dithering behaviour, read `dither.js` and the relevant cases in `test.js`.
- For rendering, controls, zoom/compare or export, read `app.js`,
  `index.html`, and `style.css` as needed.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `dither.js` | Everything algorithmic and DOM-free: seeded RNG, ordered matrix generation (Bayer, clustered-dot, halftone, void-and-cluster, blue noise), the 20 algorithms, palettes and their nearest-colour lookup table, adjustments, the glitch stack, glow, colour counting, and `process()`. Exports `DitherLib` for the browser and `module.exports` for Node. |
| `app.js` | Canvas presentation and UI wiring: renders preview vs full, builds the rail from `DitherLib.ALGORITHMS` / `PALETTES` / `GLITCHES`, loads images (picker/drop/paste), zoom/pan/compare, presets, PNG export, and the `window.__dither` debug hook. |
| `index.html` | UI structure and script load order (`dither.js` before `app.js`). |
| `style.css` | Page layout and presentation; the `:root` tokens are copied verbatim from `../DESIGN.md`. |
| `test.js` | Node tests for the core, not browser UI tests. |
| `README.md` | User-facing setup, controls, algorithm/palette/glitch catalogues, and test instructions. |

## Core invariants — do not break these

1. **Determinism.** All randomness in `dither.js` goes through `makeRng(seed)`
   (mulberry32). Never call `Math.random()` in the core — `app.js` may use it
   only to pick a fresh seed. Mask generation (void-and-cluster, blue noise)
   uses fixed internal seeds and is cached, so masks are stable while the user
   seed drives noise dithers and the glitch stack.
2. **Palette membership.** In a colour mode, every output pixel is exactly one
   of the palette's RGB entries. Tests assert this for every palette and for
   ordered, stochastic, error-diffusion, and threshold algorithms.
3. **RGB metric consistency.** Palette quantization is nearest by *squared RGB
   distance*, and error-diffusion accumulates its error in RGB. This is
   deliberate: a Lab-distance quantizer was implemented and measured to be
   inconsistent with per-channel RGB error diffusion — flat patches collapsed
   to a single palette colour and lost their average tone. Do not "upgrade" the
   metric to Lab/CIEDE2000 without re-running the flat-patch tone tests.
4. **Unclamped error accumulation.** `scatter1`/`scatter3` and the Riemersma
   queue must not clamp the diffusion buffer; clamping swallows error and pulls
   flat areas off-tone (measured: mean luma 96.5 vs 106.8 for a target of 110).
5. **Endpoint-safe masks.** `normalizeRanks` maps ranks with half-step
   midpoints onto `(0, 255)`, so pure-black and pure-white patches dither with
   no stray speckles at either end. Tests pin this.
6. **Mono decision rules.** After the threshold bias (`bias = 128 - threshold`):
   ordered/stochastic use `luma + bias > mask` (mask 0..255), plain threshold
   uses `> 128`, error diffusion quantises at `> 128` and diffuses the error.
   `threshold` is an exposure bias for the whole mono path — keep it consistent
   across algorithms, and keep it hidden in colour modes.
7. **Chunked pipeline order.** adjustments → box-average downscale by
   `pixelSize` → dither → glitch stack → glow → NEAREST upscale. Glitches and
   glow intentionally run at chunk resolution. `colors` counts the dither stage
   *before* glitches/glow, so the readout stays meaningful.
8. **Caps.** The working image is capped at `MAX_SOURCE = 1600` in `app.js`;
   `mergeSettings` clamps `pixelSize` to 1..16 and `threshold` to 0..255 and
   drops unknown/zero-amount glitches. Keep the preview-vs-full render split
   (preview on `input`, full on `change`) — it is what keeps slider drags
   responsive (`DESIGN.md` performance clause).

## Extending

### Add an algorithm

1. Add an entry to `ALGORITHMS` in `dither.js` with `id`, `name`, `group`, and
   `kind` (`threshold`, `ordered`, `noise`, `bluenoise`, or `diffusion`). For
   ordered algorithms supply a matrix through `matrixFor()`; for diffusion add
   a table to `KERNELS` (weights `[dy, dx, numerator]` + `div`) or special-case
   it like `riemersma`/`ostromoukhov`.
2. Both the mono and palette paths must handle it (`ditherMono` and
   `ditherPalette`); verify palette membership and tone.
3. Add tests: registration, output shape, tone reproduction (flat patches), and
   membership in colour mode. `node test.js` prints the algorithm count —
   update the count test if you add one.

### Add a palette

Add an entry to `PALETTES` (`id`, `name`, `colors` — hardware/product palettes
are facts; do not invent values). The lookup table and the UI list build
themselves. Tests iterate all palettes, so a new one is covered automatically.
The `bw` palette is special: it selects the mono path.

### Add a glitch effect

1. Write `glitchSomething(d, w, h, amount, rng)` operating on an RGBA
   `Uint8ClampedArray` in place; random choices must come from the passed
   `rng`, never `Math.random()`.
2. Register it in `GLITCHES` and `GLITCH_FNS`; add an index to `GLITCH_INDEX`
   (that mixes the effect id into the per-effect seed).
3. The panel list builds itself; add a test asserting the effect's rule, its
   determinism for a fixed seed, and that the stack runs in order.

### Add a preset

Add an entry to `PRESETS` in `app.js` (`id`, `name`, partial `settings`).
Presets are merged over `DEFAULTS` via `DitherLib.mergeSettings`, so they can
be partial and must not contain invalid values.

## Validation

From this directory, run:

```bash
node test.js
```

Run it after any change to `dither.js`. It pins the invariants above and prints
timings for the 1024×1024 pixel-size-1 performance budget (assertions are
generous caps; watch the printed numbers for regressions).

For browser-facing changes, use the shared harness from the repository root:

```bash
bash tools/check.sh "dither studio/index.html" --expect canvas \
  --wait 1200 --screenshot /tmp/dither.png \
  --eval "JSON.stringify(window.__dither.stats())"

# palette membership, on the actual canvas
bash tools/check.sh "dither studio/index.html" --eval \
  "window.__dither.setSetting('palette','gameboy'); window.__dither.canvasColors()"

# apply a preset with a glitch stack
bash tools/check.sh "dither studio/index.html" \
  --eval "window.__dither.applyPreset('vhs'); JSON.stringify(window.__dither.stats())"
```

`window.__dither` exposes `stats()`, `applyPreset(id)`,
`setSetting(path, value)` and `canvasColors()`. Prefer it over reading the DOM,
and check for console errors (the harness fails on any).

Keep `README.md` claims aligned with what the source and tests actually
guarantee, and keep the project dependency-free (`index.html` must open from
`file://`).
