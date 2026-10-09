# AI instructions for the Dither Studio project

A zero-dependency browser image-dithering tool: load an image *or a video*,
choose one of 46 dither algorithms and one of 24 palettes, grade it, ink it,
stack glitch effects, print it as pixels or as characters, export a PNG (or a
WebM recording). The core is DOM-free so it runs in Node for tests. World/voice:
**"instrument panel, print shop"** — dark press console, the canvas is a proof
sheet.

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
| `dither.js` | Everything algorithmic and DOM-free: seeded RNG, screen generation (Bayer, clustered-dot, halftone/spiral, line, diagonal, checks, void-and-cluster, blue noise), the structure-aware screens, the 46 algorithms, Yliluoma mixing plans and their cache, palettes and their nearest-colour lookup table, tone maps, adjustments, alpha handling, the glitch stack, glow, colour counting, the video temporal rules, and `process()`. Exports `DitherLib` for the browser and `module.exports` for Node. |
| `video.js` | Browser-only video mode: the frame source (video file, webcam, or a generated clip for checks), the playback clock with frame dropping, the working-size cap, and WebM recording. It knows nothing about dithering — `app.js` hands it an `onFrame(imageData, frameIndex)` callback. |
| `app.js` | Canvas presentation and UI wiring: renders preview vs full, builds the rail from `DitherLib.ALGORITHMS` / `PALETTES` / `GLITCHES` / `TONE_MAPS`, text mode, loads images (picker/drop/paste/data URL), zoom/pan/compare, presets, random recipes, clipboard, PNG/`.txt`/WebM export, video wiring, and the `window.__dither` debug hook. |
| `index.html` | UI structure and script load order (`dither.js`, `video.js`, then `app.js`). |
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
13. **Structure screens are image-dependent and budgeted.** `buildScreen` reads
    the *downscaled* RGB buffer, so it is built once per render at chunk
    resolution (never once per pixel loop). Its neighbour sampling is bounded by
    a sample budget (`6e6 / pixels`, both reaches shrinking together) so a large
    working image cannot blow the time budget, and the output stays inside
    `1..254` — a screen that reached 0 or 255 would flip pure patches once the
    strength knob pushed it. The three mode names (`flow`, `rain`, `dots`) set
    the character; the sliders only push it.
14. **The temporal rules live in the core.** `temporalSettings(settings, frame,
    mode)` is the only place a video frame's recipe differs from the still one:
    `freeze` leaves it alone, `shimmer` strides the seed by the golden-ratio
    constant, `crawl` slides `screenShift` (clamped, because that assignment
    happens *after* `mergeSettings`' own clamp). The same frame index must
    always produce the same recipe — that is what makes playback and recording
    reproducible.
15. **Video drops frames instead of queueing.** The loop in `video.js` renders at
    most one frame per slot, counts the frames it missed when a render overran,
    and caps the working frame at 720 px. `app.js` must not render a still over
    a playing video (`render()` returns early while `video.playing`), or slider
    drags would fight the frame loop for the canvas.

## Console structure (the rail)

`app.js` builds the rail as a list of **stations** (`GROUPS`: source, press,
tone, ink, detail, effects, glow, motion, type, preset). The rules that keep it
navigable:

1. **Everything lives in a station.** A new control goes inside an existing
   station's `.group-body` — never as a bare row in the rail — and the station's
   header carries a one-line summary in `syncGroupNotes()` so a *closed* station
   still reports what is set (`Press · Bayer 8×8 · C64 · 16c`). A new station is
   added to `GROUPS`, gets a matching `<section id="g-<id>" class="group"
   data-group="<id>">` with a `.group-head` button and a `#note-<id>` span, and
   the jump strip picks it up automatically.
2. **Station state is a `data-open` attribute, not `hidden`.** The body is
   hidden by `.group[data-open="false"] .group-body { display: none }`, and
   `[hidden] { display: none !important; }` guards the attributes elsewhere —
   an author `display` silently defeating `hidden` is a known trap in
   `DESIGN.md`. Never verify visibility by reading `.hidden`; measure the box.
3. **The effects stack is additive.** `glitches.order` still lists every effect
   and `glitches.on[]` says which run, so presets, JSON export and
   `deriveGlitches()` keep their shape; the UI renders only the active ones in
   `order` sequence. Adding appends, reordering rewrites `order` as
   active-then-inactive, and `removeEffect` only clears the flag. Never rebuild
   the stack from the DOM.
4. **The update mode is decided in one place.** `schedulePreview()` honours
   `state.quality` — `full` renders full-resolution on every input event, `live`
   schedules the half-resolution preview on the next frame, `still` renders
   nothing until `change`. Keep every new slider on the `input` → `change` pair
   so all three modes work without special cases.
5. **The rail scrolls, the stage does not shrink.** `body` is a fixed grid; the
   station list is the scroll container and the viewport bar is a fixed row of
   the stage.
6. **The responsive layers contract, they do not redesign.** One stylesheet
   carries them, in this order: every control a finger hits is grown inside
   `@media (pointer: coarse)` (the iPad layer — sizing on the *pointer*, not the
   width, or a tablet gets desktop targets); the rail widens a little for
   `(min-width: 721px) and (max-width: 1180px)` on a coarse pointer; and under
   720px — plus a short landscape window, whatever its width — the rail
   collapses into the console bar. A new control belongs inside a station and
   inherits all three; do not add a second layout for phones.
7. **The console bar is scripted *and* styled, and the CSS is the source of
   truth for where it exists.** `initConsole()` collapses the rail when the
   stylesheet is showing the bar, and it asks by reading
   `getComputedStyle(#console-toggle).display` rather than re-comparing a
   breakpoint in JavaScript — a number in two files drifts, a computed style
   cannot. Two traps came with it: a *hidden* rail measures as a pile of
   zero-height groups at zero, which reads as "the last station", so `markJump`
   only measures when `el.rail.clientHeight > 0` and re-measures when the bar
   opens; and the bar's own summary comes from `STATION_NOTES` via
   `syncConsoleNote()`, which reads a cached station id rather than measuring,
   so a render never forces a layout.
8. **The canvas owns touch gestures.** Under `(pointer: coarse)` the canvas is
   `touch-action: none` and its pointer handlers do the work: one pointer pans,
   two pinch through `PINCH_ZOOM` (a finer ladder than the buttons' `ZOOM_STEPS`,
   so the readout still reads like a value a button could have produced). Native
   scrolling or page zoom would otherwise fight the proof mid-gesture.

## Extending

### Add an algorithm

1. Add an entry to `ALGORITHMS` in `dither.js` with `id`, `name`, `group` and
   `kind` — one of `threshold`, `ordered`, `noise`, `bluenoise`,
   `clustered-noise`, `formula`, `structure`, `yliluoma`, `diffusion`. Ordered
   algorithms need a matrix from `matrixFor()` (add a generator next to
   `lineRanks` and the others if the screen is new); formula algorithms need a
   branch in `maskValue`; structure algorithms need a `mode` handled in
   `buildScreen` (`flow`, `rain`, `dots` are the existing characters); diffusion
   algorithms need a table in `KERNELS` (`weights: [dy, dx, numerator]` + `div`)
   or a special case like `riemersma`/`ostromoukhov`.
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
3. The console builds itself — the effect appears in the **Add to the stack**
   list, and adding it renders a row with its name, amount, its mode select if
   `modes` exist, and the reorder/remove buttons. Nothing else needs updating.
   Add a test for the effect's rule, its determinism for a fixed seed, and (if
   it has modes) that the mode reaches the core.

### Add a tone map

Add an entry to `TONE_MAPS` with `ink` and `paper` RGB triples (the `custom`
entry is the only one without colours and reads the user's pickers). Nothing
else needs changing: the rail, the core stage and text mode's paper/type all
read the list.

### Add a video feature

Video is deliberately split: `video.js` owns the source, the clock, the caps and
recording; `app.js` owns what a frame *means* (`renderVideoFrame`,
`videoSettingsFor`). Add per-frame behaviour by extending the settings the shell
builds (or `temporalSettings` when it is a temporal rule), not by teaching
`video.js` about palettes. Any new hook that the browser checks drive should be
mounted on `window.__dither` (`videoTick`, `videoRecord`, …) and listed in the
README's verification section.

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
bash tools/check.sh "dither studio web/index.html" --expect canvas \
  --wait 1200 --screenshot /tmp/dither.png \
  --eval "JSON.stringify(window.__dither.stats())"

# palette membership, on the actual canvas
bash tools/check.sh "dither studio web/index.html" --eval \
  "window.__dither.setSetting('palette','gameboy'); window.__dither.canvasColors()"

# a preset with a glitch stack, including effect modes
bash tools/check.sh "dither studio web/index.html" \
  --eval "window.__dither.applyPreset('storm'); JSON.stringify(window.__dither.stats().glitches)"

# text mode: the character grid the canvas is actually printing
bash tools/check.sh "dither studio web/index.html" \
  --eval "window.__dither.setText(true,'ascii',10); JSON.stringify(window.__dither.textGrid().lines.slice(0,4))"

# alpha: a synthetic transparent source, then the three modes
bash tools/check.sh "dither studio web/index.html" --eval "(async function(){ \
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

Video mode needs no file and no camera in a check — the generated clip drives
real frames:

```bash
# play, measure and record, all inside one eval (the harness accepts one)
bash tools/check.sh "dither studio web/index.html" --eval "(async function(){ \
  const d = window.__dither; d.videoSynthetic(480, 320); d.videoPlay(); \
  await new Promise(r => setTimeout(r, 1500)); const played = d.videoStats(); \
  const rec = await d.videoRecord(1200); d.videoPause(); \
  return { frames: played.drawn, dropped: played.dropped, rec: rec }; })()"

# the temporal rules, isolated on one clip frame (both modes, same picture)
bash tools/check.sh "dither studio web/index.html" --eval "(function(){ \
  const d = window.__dither; d.videoSynthetic(480, 320); \
  d.setSetting('algorithm','random-noise'); \
  d.videoTemporal('freeze'); d.videoTick(1, 4); const a = d.canvasSample(128); \
  d.videoTemporal('shimmer'); d.videoTick(1, 4); const b = d.canvasSample(128); \
  return { reshuffled: a.filter((v, i) => Math.abs(v - b[i]) > 32).length, \
           settings: d.videoSettings(7) }; })()"
```

The console is checkable without clicking: `groups()` reports every station with
its open state and header summary, `setGroup(id, open)` moves one, `quality()`
and `setQuality(mode)` drive the update mode, and `addEffect` / `removeEffect` /
`moveEffect` / `activeEffects` / `swatches` / `stepAlgorithm` / `stepPalette`
cover the rest.

```bash
# stations, stack and update modes in one pass
bash tools/check.sh "dither studio web/index.html" --eval "(function(){ var d = window.__dither; \
  d.addEffect('scanlines'); d.addEffect('grain'); d.moveEffect(1, -1); \
  var ink = document.getElementById('alpha-mode'); ink.value = 'keep'; \
  ink.dispatchEvent(new Event('change', { bubbles: true })); \
  return { stack: d.activeEffects(), groups: d.groups(), quality: d.setQuality('still'), \
           swatches: d.swatches(), alpha: d.alphaStats().count }; })()"
```

`window.__dither` exposes `stats()`, `applyPreset(id)`, `setSetting(path,
value)`, `randomize()`, `exportTxt()`, `setText(on, ramp, size)`, `textGrid()`,
`alphaStats()`, `canvasColors()`, `canvasSample(n)`, `canvasHash()`,
`deriveGlitches()`, `loadDataURL(url, name)`, the console hooks `groups()`,
`setGroup(id, open)`, `quality()`, `setQuality(mode)`, `activeEffects()`,
`addEffect(id)`, `removeEffect(id)`, `moveEffect(index, delta)`, `swatches()`,
`stepAlgorithm(delta)`, `stepPalette(delta)`, and the video hooks
`videoSynthetic(w, h)`, `videoTick(count, atFrame)`, `videoPlay()`,
`videoPause()`, `videoTemporal(mode)`, `videoSettings(frame)`, `videoStats()`,
`videoRecord(ms)`, `videoStop()`. Prefer it over reading the DOM, and check for
console errors (the harness fails on any). Note the harness takes only the last
`--eval`, so chain multi-step checks inside one async expression.

Keep `README.md` claims aligned with what the source and tests actually
guarantee, keep the project dependency-free (`index.html` must open from
`file://`), and keep `SOURCES.md` current with every sourced addition.
