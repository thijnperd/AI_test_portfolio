# AlgoArt API reference

This document is the curated entry point to the inline API documentation. The
code is the real source of truth: `core/utils.js`, `core/engine.js`, and the
sketches use JSDoc comments so a JS-aware editor can surface descriptions and
contracts on demand. See [`JSDOC.md`](JSDOC.md) for the documentation style.

## What lives where

- `core/utils.js` — the deterministic math/RNG/noise/color/palette layer all
  sketches rely on.
- `core/engine.js` — the app shell: registry, render loop, param UI, gallery,
  keys, export.
- `sketches/*.js` — individual pieces, each with a module banner and inline
  notes on non-obvious helpers and algorithmic choices.
- `JSDOC.md` — conventions for documenting JavaScript source in this project.

## How to read the docs

The API is documented inline, not in a separate generator pipeline. That choice
keeps the docs next to the code they describe and lets the same file run in the
browser with no build step. If you are working in an editor with JS language
support, the JSDoc blocks are the primary reference. This markdown file is for
the higher-level map: what the major surfaces are, what they are for, and where
the interesting details live.

## Core utilities (`core/utils.js`)

This is the layer that makes the whole project deterministic.

Public namespaces:

- **`Art.RNG`** — a seeded mulberry32 random number generator. Seed it once per
  render with `Art.RNG.seed(int)` and then use `unit()`, `range(...)`,
  `int(...)`, `pick(arr)`, `chance(p)`, `shuffle(arr)`, `gauss(mu, sigma)`.
  Sketches usually reach for the bare globals instead: `rand`, `randInt`,
  `pick`, `chance`, `gauss`.
- **`Art.Noise`** — a seeded value-noise field. `value2(x, y)` returns a
  deterministic 0..1 noise sample; `fbm(x, y, octaves, lac, gain)` layers it
  into fractal noise. Sketches usually use the bare globals `noise(...)` and
  `fbm(...)`.
- **`Art.Color`** — color conversion and palette generation. The useful pieces
  are `hsl(h, s, l, a?)`, `hexToRgb(hex)`, `hexToHsl(hex)`, `hslToHex(h, s,
  l)`, `color(c, a?)` (alpha-aware color from hex or `{h,s,l}`), `mono(dark,
  a?)` (two-tone black/white), and `makePalette(mode)` (deterministic palette of
  `{h,s,l}` colors). The palette mode names are in `Art.Color.PALETTE_MODES`.
- **`Art.easings`** — a small lookup of common tween curves.
- **Bare globals** — `TAU`, `clamp`, `lerp`, `map`, `dist`, `smoothstep`,
  `roundTo`, `easings`, `RNG`, `Noise`, and the sketch-friendly shortcuts named
  above. These exist so sketch code can stay short; they are the same objects
  behind the `Art.*` namespace.

The most important property of this file is not the helpers themselves but the
fact that the RNG and noise are seeded. Same seed, same sequence, same result.
that is why the app aims for reproducible renders for matching seeds and
parameters.

## Engine (`core/engine.js`)

This is the app. It owns the canvas, the gallery, the param panel, the HUD, the
keyboard shortcuts, and the render loop. The public surface is intentionally
small.

Registry and selection:

- **`Art.register(def)`** — add a sketch. Requires `{ id, draw }`. Duplicates are
  ignored with a warning. Missing fields get safe defaults: `title` falls back to
  `id`, `animate` defaults to `true`, `params` defaults to `{}`, and `state`
  defaults to `null` for optional persistent per-sketch state.
- **`Art.sketches`** — the live array of registered sketches, in loading order.
- **`Art.select(id)`** — switch the active sketch, reseed if needed, merge saved
  values with defaults, rebuild the gallery and param UI, restart, start the loop,
  update the HUD.
- **`Art.current`** — the currently active sketch, mirrored on `Art` so external
  code can read it.

Lifecycle:

- **`Art.restart()`** — reseed the RNG/noise with the current seed, reset elapsed
  time, clear `current.state`, clear the canvas, run `setup()` once, paint the
  first frame, update the HUD. This is what happens on seed change, param change,
  resize, and sketch switch.
- **`Art.reseed()`** — assign a new random seed to the current sketch and restart.
- **`Art.resetParams()`** — restore the sketch's parameters to their defaults and
  restart.
- **`Art.randomizeParams()`** — randomize every parameter on the current sketch
  and restart. Selects pick a random option, checkboxes flip with 50/50 odds,
  colors are regenerated, other values are sampled within their min/max range.
  Params marked `randomize: false` are left untouched.

Export:

- **`Art.exportPng()`** — download the current canvas as a PNG named
  `<sketch-id>-<seed>.png`. The toolbar background menu chooses whether
  transparent artwork pixels stay transparent or are composited over a dark
  or light ground in the exported image. For sketches with a `dark` ink
  parameter, choosing an opaque ground synchronizes that parameter for contrast.

Sketches should paint a ground only when it is part of the artwork. Otherwise,
leave those pixels untouched to preserve transparent negative space. Animated
sketches that replace each frame should clear before drawing; trail-based
sketches can instead fade with transparent compositing.

Read-only state:

- **`Art.ready`** — set to `true` once the app has booted. Useful if any other
  script wants to defer work until the engine is up.

Render loop internals that are worth knowing even if you do not call them
directly:

- The loop is a `requestAnimationFrame` chain. It always schedules the next
  frame; it only renders when the current sketch is active, not paused, and
  animated.
- `dt` is clamped to 0.1s to avoid huge jumps when the tab is backgrounded.
- The per-frame environment passed to `draw()` is rebuilt every frame and exposes
  `ctx`, `canvas`, `w`, `h`, `seed`, `params`, `t`, `dt`, `random`, `noise`, and
  `state`. The `state` property is a getter/setter on the env object so `setup()`
  can do `e.state = {...}` and later frames still see it through
  `current.state`.

## Sketch contract

A sketch is just an object registered with `Art.register({...})`. The required
fields are `id` and `draw`. The optional fields that matter most are `title`,
`animate`, `params`, and `state`.

The environment object `e` passed into `setup(e)` and `draw(e)`:

- `e.ctx` — 2D canvas context, already scaled for devicePixelRatio.
- `e.canvas` — the canvas element.
- `e.w`, `e.h` — logical size in CSS pixels (square canvas).
- `e.params` — current parameter values, wired to the auto-built UI.
- `e.state` — scratch space; reset on every restart.
- `e.seed` — current seed as an integer.
- `e.t` — seconds since restart.
- `e.dt` — seconds since the previous frame.
- `e.random` — the seeded RNG (`Art.RNG`).
- `e.noise` — the seeded noise field (`Art.Noise`).

Param types the engine knows how to render:

- `range` — min/max/step/value/integer. This is the default when `type` is
  omitted.
- `select` — options array; options can be strings or `{ value, label }`.
- `color` — native color input.
- `checkbox` — boolean toggle.
- `text` — text input.

## How sketches are meant to be read

The flagship sketches are not tutorials; they are dense on purpose. Each one has
a module banner that says what it is and what makes it distinct, then a set of
well-named constants and helpers that are commented where the naming alone is not
enough.

A few things to know before reading any individual sketch:

- `meander.js` is the flagship static piece. Its interesting parts are the flow
  field build/sample, the occupancy grid for collision etiquette, the ribbon path
  geometry, and the four fill styles.
- `morphogenesis.js` is the flagship animated reaction-diffusion piece. Its
  interesting parts are the Gray–Scott stepping, the curl-noise advection, the
  relief lighting, and the concentration-to-color LUT.
- `apotheosis.js` is the magnum opus. Its interesting parts are the Mandelbulb /
  Julia distance estimator, the four orbit traps, the soft-shadow march, and the
  progressive band rendering.
- `substrate.js` and `epicycle.js` are the other two flagship animated pieces.
  `substrate.js` is about growth with inheritance and territory rules;
  `epicycle.js` is about the orbital drawing machine and the accumulated plate.
- `order-disorder.js` is the flagship grid piece. Its interesting part is the
  disorder gradient and how a single `disorder` parameter changes a deterministic
  lattice into gesture.
- `strange-atlas.js` maps samples from a bounded nonlinear recurrence into a
  color-coded density print; change its orbit family, sample count, rule
  variation, and ink palette.
- `recursive-basilica.js` constructs a layered procedural facade from nested
  arch profiles, seeded stone drift, and a luminous aperture.
- `sandpile.js` is a static Abelian-sandpile print: it drops grains with the
  seeded RNG, relaxes with batched toppling (`t = height >> 2`), and paints the
  odometer through a palette LUT in an offscreen `ImageData`.
- `differential-growth.js` is an animated closed contour that folds into a
  membrane; its interesting parts are the uniform spatial hash (a linked list,
  never O(n²)), the batched relaxation in scratch `Float32Array`s, and the
  midpoint-subdivision growth cap.

The smaller sketches include noise contours and wave interference. Their code
is closer to one readable idea each. External concept references and their
relationship to the original implementations are listed in the project
[`README.md`](README.md).

## Verification

This repository does not retain an automated test runner. For code changes,
open `index.html` in a browser and inspect the affected sketch, controls,
console, resizing behavior, and seed reproducibility. Keep JSDoc and this API
reference aligned with the implementation; see [`JSDOC.md`](JSDOC.md).

## Source material

`Source material/` is the scratch area. Nothing in it is loaded by the app, and
nothing in it is expected to be clean. When an experiment is strong enough to
become a real sketch, port it into `sketches/` with the full sketch contract, add
the JSDoc banner, register it in `index.html`, and clear the scratch copy.
The workflow for that is documented in `Source material/(ai instructions).md`.
