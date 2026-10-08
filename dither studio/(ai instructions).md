# AI instructions for the Dither Studio project

A zero-dependency browser image-dithering tool: load an image, choose one of 43
dither algorithms and one of 22 palettes, grade it, ink it, stack glitch
effects, print it as pixels or as characters, export a PNG. The core is DOM-free
so it runs in Node for tests. World/voice: **"instrument panel, print shop"** —
dark press console, the canvas is a proof sheet.

## Before working

- Read this file and [`README.md`](README.md).
- For dithering behaviour, read `dither.js` and the relevant cases in `test.js`.
- For rendering, controls, text mode, zoom/compare or export, read `app.js`,
  `index.html`, and `style.css` as needed.
- Before adding a feature, algorithm, palette or numeric table, read
  [`SOURCES.md`](SOURCES.md) and add a row for where it came from.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `dither.js` | Everything algorithmic and DOM-free: seeded RNG, screen generation (Bayer, clustered-dot, halftone/spiral, line, diagonal, checks, void-and-cluster, blue noise), the 43 algorithms, Yliluoma mixing plans and their cache, palettes and their nearest-colour lookup table, tone maps, adjustments, alpha handling, the glitch stack, glow, colour counting, and `process()`. Exports `DitherLib` for the browser and `module.exports` for Node. |
| `app.js` | Canvas presentation and UI wiring: renders preview vs full, builds the rail from `DitherLib.ALGORITHMS` / `PALETTES` / `GLITCHES` / `TONE_MAPS`, text mode, loads images (picker/drop/paste/data URL), zoom/pan/compare, presets, random recipes, clipboard, PNG/`.txt` export, and the `window.__dither` debug hook. |
| `index.html` | UI structure and script load order (`dither.js` before `app.js`). |
| `style.css` | Page layout and presentation; the `:root` tokens are copied verbatim from `../DESIGN.md`. |
| `SOURCES.md` | Provenance: which published work or open-source tool each feature, table and palette came from, plus the divergences that were chosen deliberately. |
| `test.js` | Node tests for the core, not browser UI tests. |
| `README.md` | User-facing setup, controls, algorithm/palette/glitch catalogues, and test instructions. |

## Core invariants — do not break these

1. **Determinism.** All randomness in `dither.js` goes through `makeRng(seed)`
   (mulberry32) or the hash-based mask functions. Never call `Math.random()` in
   the core — `app.js` may use it only to pick a fresh seed or a random recipe.
   Mask generation uses fixed internal seeds and is cached, so masks are stable
   while the user seed drives noise dithers and the glitch stack.
2. **Palette membership.** In a colour mode, every output pixel is exactly one
   of the palette's RGB entries — including the mixing family, whose plans only
   ever index palette entries. Tests assert this for every palette and for
   ordered, stochastic, mixing, error-diffusion and threshold algorithms.
3. **RGB metric consistency.** Palette quantization is nearest by *squared RGB
   distance*, and error diffusion accumulates its error in RGB. This is
   deliberate: a Lab-distance quantizer was implemented and measured to be
   inconsistent with per-channel RGB error diffusion — flat patches collapsed
   to a single palette colour and lost their average tone. Do not "upgrade" the
   metric to Lab/CIEDE2000 without re-running the flat-patch tone tests.
4. **Unclamped error accumulation.** `scatter1`/`scatter3` and the Riemersma
   queue must not clamp the diffusion buffer; clamping swallows error and pulls
   flat areas off-tone (measured: mean luma 96.5 vs 106.8 for a target of 110).
5. **Endpoint-safe masks.** `normalizeRanks` maps ranks with half-step
   midpoints onto `(0, 255)`, so pure-black and pure-white patches dither with
   no stray speckles at either end. Generated screens must keep this property.
6. **Mask semantics.** For ordered, formula, noise, blue-noise and clustered-
   noise kinds the mono rule is `luma + bias > scaleMask(mask, strength)` with
   the mask in 0..255, and `scaleMask(m, 1) === m` exactly — strength 1.00 must
   be the published screen to the bit. `threshold` is an exposure bias for the
   whole mono path; keep it hidden in colour modes.
7. **Mixing plan metric.** `planError` minimises the squared distance between
   the target and the plan's **mean**, not Yliluoma's published prefix sum.
   That is a measured decision, not an oversight — the literal prefix sum
   collapses plans to a single colour (a flat 128 rendered at 207), 1/k
   weighting only softens it, and a cohesion term costs more tone accuracy than
   it buys (5.8 → 10.5 mean error over a target sweep). Plans stay luma-sorted
   multisets, every variant is bounded from above by the one before it, and the
   `planError` ordering (2 ≥ quick ≥ deep) is asserted in the tests.
8. **Alpha is separate from colour.** The matte is averaged per chunk and must
   never be mixed into the RGB buffer; a transparent pixel's hidden colour must
   not tint its neighbours. `sharpen` resolves it against a Bayer screen to
   0/255; `keep` writes the chunk average; `matte` leaves the frame opaque.
9. **Tone maps run after the dither**, on the chunk grid, before the glitches —
   that ordering is what keeps a 1-bit dither to exactly two inks, and it is why
   `colors` (counted at the dither stage) stays meaningful.
10. **Chunked pipeline order.** levels → gamma → brightness → contrast →
    saturation → hue → blur → sharpen → denoise → box-average downscale by
    `pixelSize` → dither → tone map → glitch stack → glow → alpha → NEAREST
    upscale. Glitches, glow and the tone map intentionally run at chunk
    resolution.
11. **Caps.** The working image is capped at `MAX_SOURCE = 1600` in `app.js`;
    text mode is capped at `TEXT_CELL_CAP` cells; `mergeSettings` clamps
    `pixelSize` to 1..16, `threshold` to 0..255 and `ditherStrength` to 0..200,
    validates `alphaMode`/`toneMap`/glitch `mode`, and drops unknown or
    zero-amount glitches. Keep the preview-vs-full render split (preview on
    `input`, full on `change`) — it is what keeps slider drags responsive
    (`DESIGN.md` performance clause).
12. **Nothing expensive on load.** The 32×32 blue-noise mask and the mixing-plan
    cache are built lazily, on first use, and cached per palette/bin. Do not
    move mask generation into module load.

## Extending

### Add an algorithm

1. Add an entry to `ALGORITHMS` in `dither.js` with `id`, `name`, `group` and
   `kind` — one of `threshold`, `ordered`, `noise`, `bluenoise`,
   `clustered-noise`, `formula`, `yliluoma`, `diffusion`. Ordered algorithms
   need a matrix from `matrixFor()` (add a generator next to `lineRanks` and the
   others if the screen is new); formula algorithms need a branch in
   `maskValue`; diffusion algorithms need a table in `KERNELS`
   (`weights: [dy, dx, numerator]` + `div`) or a special case like
   `riemersma`/`ostromoukhov`.
2. Both paths must handle it (`ditherMono` and `ditherPalette`), including the
   serpentine sweep and the strength scaling where they apply.
3. Add tests: registration and family counts, output shape, tone reproduction on
   flat patches, palette membership in colour mode, and determinism. `node
   test.js` asserts the total algorithm count — update it when you add one.
4. Add a row to `SOURCES.md` naming the published source.

### Add a palette

Add an entry to `PALETTES` (`id`, `name`, `colors` — hardware/product palettes
are facts; do not invent values, and record the source in `SOURCES.md`). The
lookup table, the UI list, the mixing plans and the tests all pick it up
automatically. The `bw` palette is special: it selects the mono path.

### Add a glitch effect

1. Write `glitchSomething(d, w, h, amount, rng, mode)` operating on an RGBA
   `Uint8ClampedArray` in place; random choices must come from the passed `rng`.
2. Register it in `GLITCHES` (name, hint, and `modes` if it has any) and in
   `GLITCH_FNS`. The per-effect seed index comes from the `GLITCHES` order, so
   no separate index table needs updating.
3. The panel builds itself — a glitch with `modes` gets a mode select in its
   row. Add a test for the effect's rule, its determinism for a fixed seed, and
   (if it has modes) that the mode reaches the core.

### Add a tone map

Add an entry to `TONE_MAPS` with `ink` and `paper` RGB triples (the `custom`
entry is the only one without colours and reads the user's pickers). Nothing
else needs changing: the rail, the core stage and text mode's paper/type all
read the list.

### Add a preset

Add an entry to `PRESETS` in `app.js` (`id`, `name`, partial `settings`).
Presets are merged over `DEFAULTS` via `DitherLib.mergeSettings`, so they can be
partial and must not contain invalid values. Pair mixing algorithms with dense
palettes (greyscale ramps) or the two-colour variant — see invariant 7.

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

# a preset with a glitch stack, including effect modes
bash tools/check.sh "dither studio/index.html" \
  --eval "window.__dither.applyPreset('storm'); JSON.stringify(window.__dither.stats().glitches)"

# text mode: the character grid the canvas is actually printing
bash tools/check.sh "dither studio/index.html" \
  --eval "window.__dither.setText(true,'ascii',10); JSON.stringify(window.__dither.textGrid().lines.slice(0,4))"

# alpha: a synthetic transparent source, then the three modes
bash tools/check.sh "dither studio/index.html" --eval "(async function(){ \
  const d = window.__dither; \
  const c = document.createElement('canvas'); c.width = 240; c.height = 160; \
  const x = c.getContext('2d'); const g = x.createLinearGradient(0,0,240,0); \
  g.addColorStop(0,'rgba(255,90,60,0)'); g.addColorStop(1,'rgba(60,120,255,1)'); \
  x.fillStyle = g; x.beginPath(); x.arc(120,80,78,0,Math.PI*2); x.fill(); \
  d.loadDataURL(c.toDataURL('image/png'), 'alpha test'); \
  await new Promise(r => setTimeout(r, 500)); \
  d.setSetting('alphaMode','sharpen'); const a = d.alphaStats(); \
  d.setSetting('alphaMode','keep'); const b = d.alphaStats(); \
  return { sharpen: a.levels, keepLevels: b.count }; })()"
```

`window.__dither` exposes `stats()`, `applyPreset(id)`, `setSetting(path,
value)`, `randomize()`, `exportTxt()`, `setText(on, ramp, size)`, `textGrid()`,
`alphaStats()`, `canvasColors()`, `deriveGlitches()` and `loadDataURL(url,
name)`. Prefer it over reading the DOM, and check for console errors (the
harness fails on any).

Keep `README.md` claims aligned with what the source and tests actually
guarantee, keep the project dependency-free (`index.html` must open from
`file://`), and keep `SOURCES.md` current with every sourced addition.
