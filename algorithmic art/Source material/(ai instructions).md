# (ai instructions)

Instructions for AI assistants (and humans) working in the **algorithmic art**
project: how to use the `Source material` folder, and how to turn experiments
into new, polished algorithmic-art sketches.

---

## 1. What `Source material` is for

`Source material` is the **intake / scratch area** for raw experiments.

- Drop quick prototypes here: `canvas-sketch` doodles, one-off JS experiments,
  ports from tutorials, throwaway generative ideas, sketches copied from
  courses or videos.
- Anything goes here — messy code, hardcoded values, `Math.random()`,
  external libraries, broken/incomplete attempts. This folder is allowed to
  be untidy.
- Name files simply and sequentially while experimenting (e.g.
  `sketch-01.js`, `sketch-01b.js`, `sketch-02.js`). Don't polish names yet.
- This folder is **not** loaded by `index.html`. Nothing here runs in the app.

---

## 2. The workflow: from raw idea to a finished sketch

1. **Prototype** in `Source material` until the idea looks good.
2. **Review** the folder and pick the sketches that are the *best and most
   worked-out* — the refined versions, not the early drafts. (Usually a family
   of files evolves toward one good version; keep that one.)
3. **Port** the winners into `sketches/` using the AlgoArt framework (see §3).
   Give each a clear, correct name (see §4).
4. **Register** each new sketch with a `<script>` tag in `index.html`.
5. **Clear `Source material`** once the good work has been promoted, so it's
   ready for the next round of experiments.

Repeat this cycle for every batch of experiments.

---

## 3. How to create a new algorithmic-art sketch

Create `sketches/<name>.js` and register it. Full API reference lives in
[`../README.md`](../README.md); the essentials:

```js
/**
 * Sketch Name — one-line description of the idea.
 *
 * @module sketches/<name>
 */
Art.register({
  id: 'my-sketch',          // kebab-case, matches the filename
  title: 'My Sketch',       // human-readable, shown in the gallery
  animate: true,            // false = render once (static, export-friendly)

  params: {
    count:  { label: 'Count',  type: 'range', min: 10, max: 500, step: 1, value: 120, integer: true },
    mode:   { label: 'Mode',   type: 'select', value: 'a', options: ['a', 'b', 'c'] },
    accent: { label: 'Accent', type: 'color', value: '#7aa2ff' },
    showBg: { label: 'Background', type: 'checkbox', value: true },
    title:  { label: 'Title',  type: 'text', value: 'hello' }
  },

  setup(e) {
    e.state = { points: [] };            // scratch storage, reset on restart
    for (let i = 0; i < e.params.count; i++) {
      e.state.points.push({ x: rand(e.w), y: rand(e.h) });
    }
  },

  draw(e) {
    const ctx = e.ctx;
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, e.w, e.h);
    // draw using e.params, e.state, e.t, e.dt, e.w, e.h
  }
});
```

### Rules when porting / writing sketches

- **Determinism:** use the seeded helpers (`rand`, `RNG`, `Noise`, `noise`,
  `fbm`) — never `Math.random()` — so the same seed + params always produce
  the same image.
- **Prefer framework params** over ad-hoc input handling. If a prototype
  listens to `keyup` or a GUI library (e.g. Tweakpane), expose those controls
  as `params` instead so they get the auto-built UI, randomization, and export.
- **Drop external dependencies.** Port `canvas-sketch` / `canvas-sketch-util`
  calls to the built-in helpers (`map`, `TAU`, `makePalette`, `colorCss`, …).
- **Keep `draw()` allocation-light** for animated sketches; build arrays in
  `setup()`.
- Use `setup(e)` for per-restart state; `e.state` is cleared on every restart
  (new seed, resize, param change).
- Static sketches (`animate: false`) are ideal for high-detail, export-friendly
  pieces.
- **Document the piece.** Every finished sketch should start with a module-level
  JSDoc banner describing its idea and purpose. Document public contracts and
  non-obvious helpers or algorithmic assumptions; do not narrate obvious code.
  Follow [`../JSDOC.md`](../JSDOC.md).
- **Credit conceptual sources.** When a finished piece adapts a general
  technique learned from a public tutorial or reference, cite it in the module
  banner and add a short entry to `README.md`. Do not copy source code or
  compositions; make an original implementation.

### Registering the script

Add a `<script>` tag in `index.html` after the existing sketch scripts
(`core/*.js` must load first):

```html
<script src="sketches/my-sketch.js"></script>
```

---

## 4. Naming conventions

- **Folder / project:** descriptive (`algorithmic art`, not `project1`).
- **Sketch file + `id`:** kebab-case noun describing the concept
  (`orbital-bars`, `noise-lines`, `type-dots`), not `sketch-07`.
- **`title`:** the same name in Title Case for the gallery.
- Prefer explicit, readable names over short or ambiguous abbreviations.

---

## Summary

Use `Source material` as a messy scratch area for raw experiments. When an idea
is worked out, port it into `sketches/` as a clean, deterministic, named sketch
using the AlgoArt `Art.register` API, register it in `index.html`, then clear
`Source material` for the next round. See [`../README.md`](../README.md) for
the full framework reference.
