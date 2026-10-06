# AlgoArt — algorithmic art framework

A zero-dependency, browser-based framework for generative art. No build step,
no server: **double-click `index.html`** and it runs.

The canvas supports transparency: sketches leave negative space unpainted, and
PNG exports preserve that alpha. **Morphogenesis**, **Apotheosis**, and
**Physarum** keep their existing background treatments.
Use the **background** menu in the toolbar to preview or export with a
transparent, dark, or light ground. Sketches with a monochrome ink control
automatically switch between light ink on dark and dark ink on light.

## Layout

```
algorithmic art/
├── index.html          # app shell — gallery, canvas, param panel
├── style.css           # dark UI theme ("gallery at night")
├── core/
│   ├── utils.js        # seeded RNG, value noise/fbm, easings, palettes, math
│   └── engine.js       # sketch registry, render loop, auto param UI, export
├── PHILOSOPHY.md       # "Fluvial Order" — the movement behind the flagship sketches
├── API.md              # framework and sketch API reference
├── JSDOC.md            # JavaScript documentation conventions
├── sketches/
│   ├── noise-mosaic.js  # static: grid of shapes tinted/sized by noise
│   ├── noise-lines.js   # animated: grid of dashes oriented by noise
│   ├── flow-field.js    # animated: particles through a noise field
│   ├── line-displacement.js # static: lines warped by a luminance field (B&W)
│   ├── spirograph.js    # static: layered hypotrochoid curves
│   ├── wave-interference.js # static: color bands from two superposed wavefronts
│   ├── noise-contours.js # static: topographic isolines through seeded noise
│   ├── type-dots.js     # static: text rasterized into a grid of dots
│   ├── delaunay.js      # static: edge-biased Delaunay triangle line mesh
│   ├── orbital-bars.js  # retained source; excluded from the full distribution
│   ├── faultline.js     # static: folded and displaced geological strata
│   ├── tidepools.js     # retained source; excluded from the full distribution
│   ├── voronoi-atlas.js # static: settled, power-weighted faceted territories
│   ├── brownian-choir.js # static: wind-shaped diffusion-limited crystal growth
│   ├── asemic-ledger.js # retained source; excluded from the full distribution
│   ├── halton-herbarium.js # retained source; excluded from the full distribution
│   ├── physarum.js      # animated: trail-sensing agents form vascular networks
│   ├── sandpile.js      # static: Abelian sandpile (Bak–Tang–Wiesenfeld) fractal print
│   ├── strange-atlas.js # static: color-mapped strange attractor density print
│   ├── order-disorder.js# static: a lattice under a measured gradient of disorder
│   ├── substrate.js     # animated: crystalline growth, right-angle branching on sand
│   ├── differential-growth.js # animated: a closed contour folding into a membrane
│   ├── epicycle.js      # animated: orbital drawing machine (harmonograph silk)
│   ├── meander.js       # static flagship: flow-field ribbon composition — collision
│   │                    #   etiquette, probabilistic palettes, blocks/outline/soft fills
│   ├── recursive-basilica.js # static: nested procedural arches and luminous stonework
│   ├── morphogenesis.js # animated: Turing reaction-diffusion (Gray–Scott) — ten live
│   │                    #   pattern regimes combed by curl-noise currents, embossed relief
│   └── apotheosis.js    # MAGNUM OPUS: progressive raymarched Mandelbulb / Julia-bulb
│                        #   with orbit-trap colouring, soft shadows, trap-AO, glow
└── Source material/     # scratch area for raw experiments (see below)
```

## Documentation
Scripts are plain (no ES modules) so everything works from `file://`.

### API reference

JavaScript source documentation uses JSDoc comments, similar in purpose to
Python docstrings. See [`JSDOC.md`](JSDOC.md) for the conventions and
[`API.md`](API.md) for the public framework surface. The implementation files
to read first are:

To view either Markdown document nicely in VS Code, open it and press
**Ctrl+Shift+V** for Markdown Preview. See
[`JSDOC.md`](JSDOC.md#how-to-view-the-documentation) for the viewing options
and inline API help.

- `core/utils.js` — the shared math, RNG, noise, easing, color, and palette
  helpers. Every sketch depends on this file, and it is the layer that
  guarantees deterministic output.
- `core/engine.js` — the app shell: sketch registry, canvas sizing, render
  loop, auto-built parameter UI, gallery, keyboard shortcuts, and PNG export.

Each sketch in `sketches/*.js` has a module-level JSDoc banner describing its
generative idea and documents non-obvious helpers or algorithmic choices.

Public API summary:

| Surface | Where | What it is |
|---|---|---|
| `Art.register(def)` | `core/engine.js` | Add a sketch to the gallery. |
| `Art.select(id)` | `core/engine.js` | Switch the active sketch. |
| `Art.restart()` | `core/engine.js` | Reseed + reset state + redraw. |
| `Art.reseed()` | `core/engine.js` | Assign a new random seed. |
| `Art.exportPng()` | `core/engine.js` | Download the current canvas as PNG. |
| `Art.randomizeParams()` | `core/engine.js` | Randomize every parameter on the active sketch. |
| `Art.resetParams()` | `core/engine.js` | Restore defaults on the active sketch. |
| `Art.ready` | `core/engine.js` | Set to `true` once the app has booted. |
| `Art.RNG` / `Art.Noise` | `core/utils.js` | Seeded RNG and value-noise field. |
| `Art.Color` | `core/utils.js` | HSL/hex conversion and deterministic palettes. |
| `Art.easings` | `core/utils.js` | Small easing lookup. |
| `rand`, `noise`, `fbm`, `hsl`, `colorCss`, `makePalette`, ... | `core/utils.js` | Bare globals for sketch files. |

To verify changes, open `index.html` in a browser and inspect the affected
sketch, its controls, and the browser console. See [`API.md`](API.md) for the
verification checklist.

## Controls

| Action | UI | Key |
|---|---|---|
| Pause / resume | toolbar | `Space` |
| New seed | toolbar | `R` |
| Randomize params | toolbar | `P` |
| Export PNG | toolbar | `E` |
| Next / prev sketch | gallery | `←` / `→` |
| Artwork ground | toolbar background menu | — |

For a given sketch, seed, and parameters, renders are intended to be
reproducible.

## The gallery's rising arc

The gallery is deliberately ordered from quieter, simpler studies to the most
ambitious and immersive work; the sketch script order in `index.html` controls
the gallery sequence and the initial selection. Early entries introduce noise,
geometry, and line studies. The middle develops more authored landscapes and
emergent growth — **Sandpile**'s toppling fractal and **Differential Growth**'s
folding membrane join the growth studies here — while the final works build
toward **Meander** (flow-field
ribbon composition), **Morphogenesis** (ten live Gray–Scott pattern regimes
combed by curl-noise currents), and **Apotheosis** (the magnum opus: a
progressive CPU-raymarched Mandelbulb / Julia-bulb with orbit-trap colouring,
soft shadows, ambient occlusion, fresnel rim, and proximity glow). **Strange
Atlas** turns a compact nonlinear recurrence into a phase-colored density
print; **Recursive Basilica** layers seeded arch profiles into a speculative
architectural section. For the
strongest first impression, jump to Apotheosis; explore Meander's `jumbo` scale,
`sharp` flow, or `blocks` fill style as well.

## Example inspirations

These sketches are original implementations in the AlgoArt framework, informed
by public explanations of the underlying techniques. Their source code and
compositions are original adaptations, not copied examples:

- [`flow-field.js`](sketches/flow-field.js) and
  [`meander.js`](sketches/meander.js) explore seeded noise fields and particle
  motion, with conceptual references to [The Coding Train's Perlin Noise Flow
  Field](https://thecodingtrain.com/challenges/24-perlin-noise-flow-field) and
  [The Nature of Code: Autonomous Agents](https://natureofcode.com/autonomous-agents/).
- [`noise-contours.js`](sketches/noise-contours.js) turns coherent noise into
  isolines, informed by the [p5.js noise reference](https://p5js.org/reference/p5/noise/)
  and [The Nature of Code: Randomness](https://natureofcode.com/random/).
- [`wave-interference.js`](sketches/wave-interference.js) samples two
  superposed circular wavefronts, informed by
  [The Nature of Code: Oscillation](https://natureofcode.com/oscillation/).

The references explain general techniques; the sketches use this project's
seeded helpers, controls, rendering model, and compositions.

## Research-driven sketches

The [AI Artists generative-art overview](https://aiartists.org/generative-art-design)
is an artist/resource index rather than a gallery of specific works. Its
references to Casey Reas and Michael Hansmeyer prompted two original studies:
**Strange Atlas** uses a simple nonlinear rule to reveal emergent form, while
**Recursive Basilica** explores procedural subdivision and architectural
repetition. The attractor is rendered as a phase-colored, density-mapped print;
the basilica combines nested arch profiles, masonry bands, and a lit aperture.
They do not reproduce either artist's work or code. Further context:
[Casey Reas](https://reas.com/) and
[Michael Hansmeyer](https://michael-hansmeyer.com/).

- **Differential Growth** relaxes a closed contour into an organic membrane:
  neighbours pull it taut, non-neighbours inside a radius push it apart, and
  over-stretched edges split. It is an original implementation in the lineage
  of [Anders Hoff's (inconvergent) `differential-line`](https://github.com/inconvergent/differential-line),
  with its own spatial hash, growth budget, and renderer.
- **Sandpile** is the [Abelian sandpile](https://en.wikipedia.org/wiki/Abelian_sandpile_model)
  (Bak–Tang–Wiesenfeld): grains dropped on a lattice topple until stable, and
  the per-cell toppling count is the self-similar print. An original
  implementation with batched toppling and a palette LUT.
- **Voronoi Atlas** adapts clipped Voronoi cells, power weights, and centroid
  settling into a faceted map. It is informed by the [d3-delaunay project](https://github.com/d3/d3-delaunay)
  and uses an original dependency-free polygon clipper.
- **Brownian Choir** turns lattice walkers into branching crystal growth. It is
  informed by [Jason Webb's DLA experiments](https://github.com/jasonwebb/2d-diffusion-limited-aggregation-experiments)
  and [The Coding Train's DLA challenge](https://github.com/CodingTrain/website-archive/tree/main/CodingChallenges/CC_034_DLA/P5).
  Its growth loop and rendering are original adaptations using seeded helpers.
The source directory also retains experiments that are intentionally excluded
from the full gallery distribution: `tidepools.js`, `asemic-ledger.js`,
`halton-herbarium.js`, and `orbital-bars.js`. They remain available as source
files but are not loaded by `index.html`.

## Source material

`Source material/` is the intake / scratch area for raw, unpolished
experiments (prototypes, tutorial ports, throwaway ideas). Nothing in it is
loaded by the app. Periodically review it, port the best / most worked-out
sketches into `sketches/`, then clear it. The full workflow for using this
folder and creating new sketches is documented in
[`Source material/(ai instructions).md`](Source%20material/(ai%20instructions).md).

## Adding a sketch

Create `sketches/my-sketch.js` and register it, then add a script tag to
`index.html` (order doesn't matter as long as `core/*.js` come first):

```html
<script src="sketches/my-sketch.js"></script>
```

Give each sketch a JSDoc module banner and document non-obvious helpers and
algorithmic assumptions. Follow [`JSDOC.md`](JSDOC.md). Update this README and
[`API.md`](API.md) when user-facing features or shared API contracts change.

```js
Art.register({
  id: 'my-sketch',
  title: 'My Sketch',
  animate: true,            // false = render once (static, export-friendly)

  params: {
    count:  { label: 'Count',  type: 'range', min: 10, max: 500, step: 1, value: 120, integer: true },
    mode:   { label: 'Mode',   type: 'select', value: 'a', options: ['a', 'b', 'c'] },
    accent: { label: 'Accent', type: 'color', value: '#7aa2ff' },
    title:  { label: 'Title',  type: 'text', value: 'hello' }
  },

  // called once per restart (new seed, resize, param change)
  setup(e) {
    e.state = { points: [] };   // scratch storage, reset on restart
    for (let i = 0; i < e.params.count; i++) {
      e.state.points.push({ x: rand(e.w), y: rand(e.h) });
    }
  },

  // called every frame when animate:true (once when false)
  draw(e) {
    const ctx = e.ctx;
    // Draw foreground marks; untouched canvas pixels stay transparent.
    // ... draw using e.params, e.state, e.t, e.dt, e.w, e.h
  }
});
```

### The `e` environment object

| Field | Meaning |
|---|---|
| `e.ctx` | 2D canvas context (already scaled for devicePixelRatio) |
| `e.canvas` | the canvas element |
| `e.w`, `e.h` | logical size in CSS pixels (square) |
| `e.params` | current parameter values (auto-wired to the UI) |
| `e.state` | your scratch object, reset on every restart |
| `e.seed` | current seed (integer) |
| `e.t` | seconds since restart |
| `e.dt` | seconds since previous frame |
| `e.random` | seeded RNG (same as global `RNG`) |
| `e.noise` | seeded noise (same as global `Noise`) |

### Param types

`range` (min/max/step/value/integer), `select` (options array), `color`,
`checkbox`, `text`. Omit `type` for a range.

## Global helpers (from `core/utils.js`)

- **Math:** `TAU`, `clamp(v,a,b)`, `lerp(a,b,t)`, `map(v,a,b,c,d,clip?)`,
  `dist(x1,y1,x2,y2)`
- **Random (seeded):** `rand()`, `rand(max)`, `rand(min,max)`, `randInt(a,b)`,
  `pick(arr)`, `chance(p)`, `gauss(mu,sigma)`, `easings.*`
- **Noise:** `noise(x,y)` → 0..1 value noise, `fbm(x,y,octaves)` → fractal noise
- **Color:** `makePalette(mode)` → `[{h,s,l}...]` (analogous, complementary,
  triadic, split, monochrome, random), `colorCss(color, alpha?)`,
  `hsl(h,s,l,a?)`, `hslToHex(h,s,l)`, `hexToHsl(hex)`

## Tips

- Use `RNG`/`Noise` only — never `Math.random()` — so output stays reproducible.
- Keep `draw()` allocation-light for animated sketches; build arrays in `setup()`.
- Static sketches (`animate: false`) redraw only on restart — ideal for
  high-detail pieces you export as PNG.
