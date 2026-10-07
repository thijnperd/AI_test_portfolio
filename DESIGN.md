# Design language — the Coding_etc house style

*The shared visual and interaction philosophy behind every project in this
repository. Read this before you style a new project or restyle an existing
one. It is deliberately specific: this repo has a house look, and the point is
that every project speaks it fluently rather than reinventing a theme.*

## The world: "Terminal Gallery"

One name for the whole room: **a dark instrument panel for a gallery at night.**
Near-black tinted backgrounds, a single cool accent, mono type, hairline
borders, and no decoration that does not carry information. The algorithms are
the exhibit; the chrome is the frame around them.

Every project in this repo is a variation on that room — the **instrument
panel** — with two authored departures (Algorithmic Art's "gallery at night"
staging, and the Analog Horror Raycaster's decaying VHS tape). Commit to the
room, then give the project its own voice inside it.

## The contract

1. **Name the world before styling.** Write the one-line direction at the top of
   the project's `style.css` or README (e.g. "instrument panel, pixelated
   materials"). Every later choice answers to it.
2. **The artifact leads; the chrome recedes.** The simulation, artwork, or board
   is the hero. Panels are a quiet 260px rail; they inform, they do not compete.
3. **One accent, one neutral ramp.** Exactly one accent colour, tinted neutrals,
   never pure grey soup. See the tokens below — reuse them, don't re-invent.
4. **Mono type is the identity.** This is a terminal-room house. Monospace
   everywhere; there is no second face on purpose. Weight and case create the
   hierarchy, not a second font.
5. **Hairlines, not shadows.** Separation comes from `1px` borders and tinted
   fills. Avoid drop shadows, glassy blur, and floating cards.
6. **Determinism is a design value.** Seeded output is part of the aesthetic:
   the same seed reproduces the same frame. Never call `Math.random()` in a
   project's *core*; route it through the seeded RNG. `Math.random()` belongs to
   the UI layer (fresh seeds, cosmetic noise).
7. **Motion is seasoning.** Interaction feedback is 120–200ms and *earned* — a
   state change, a settle, a spawn. Nothing idles, nothing bounces for show.
8. **Responsive by contraction, not redesign.** The panel collapses to a top bar
   under 720px; the stage keeps the lead. Same room, smaller.
9. **State, not just the happy path.** Hover, focus-visible, active, empty, and
   error states exist. Focus-visible outlines are non-negotiable.
10. **No dependency for style's sake.** Plain CSS variables and plain scripts.
    No framework, bundler, or design-system package.
11. **It has to run on a laptop, comfortably.** No project may be too intense
    for ordinary hardware. Defaults are light; the work a slider or size can
    ask for is capped; nothing pegs a CPU core, hangs for seconds, or drops the
    page far below 30 fps. Heavy work is computed once and cached (an offscreen
    buffer, a typed array), never recomputed per frame or per input event —
    dragging a slider must stay responsive, not re-run the whole simulation.

## Tokens

Copy these into `:root` verbatim. They are shared across the sibling projects
(`game of life`, `logic puzzles`, `maze generator and solver`, `boids`,
`falling sand`, `2048`).

```css
:root {
  --bg: #0e0f13;        /* page ground            */
  --panel: #15171d;     /* rails, headers          */
  --panel-2: #1b1e26;   /* controls, raised chips  */
  --line: #262a34;      /* hairlines and borders   */
  --text: #e8eaf0;      /* primary text            */
  --muted: #8b91a3;     /* labels, secondary text  */
  --accent: #7aa2ff;    /* the single accent       */
  --radius: 8px;
  --font: "SF Mono", "Cascadia Code", Consolas, "JetBrains Mono", Menlo, monospace;
}
```

Canvases do not sit on the page ground directly; they use a deeper well
(`#0b0c10`) so the artifact reads as recessed glass.

## Layout skeleton

The house layout is a fixed rail plus a flexible stage:

```css
body { display: grid; grid-template-columns: 260px minmax(0, 1fr); }
```

- **`.panel`** — the 260px rail: `h1.brand` (with the accent on one word),
  `.muted.intro`, then sections labelled with `.small` (uppercase, letter-spaced,
  `11px`), `.buttons`, `.field` controls, and a `.muted.hint` footer.
- **`.stage`** — the hero area. Typically `grid-template-rows: auto minmax(0, 1fr)`
  with a `.statusbar` of measurements above a `.canvas-wrap`.
- **`.statusbar`** — flat readouts as `Label <b>value</b>`. Show the numbers that
  make the algorithm legible (size, seed, generation, pressure…). This bar is a
  signature of the house style.
- **Breakpoint** — `@media (max-width: 720px)` collapses to one column with the
  panel capped (`max-height: 45vh`).

## Type scale

Mono only. A few sizes carry everything:

| Role | Treatment |
|---|---|
| Brand | `20–26px`, letter-spaced, one word in `--accent` |
| Section label | `11px`, uppercase, `0.12em` tracking, `--muted` |
| Body / controls | `13px / 1.5` |
| Numeric readouts | `--text`, `600–700` weight |

## Project voices

Same room, different residents. Name the voice in the project's docs so it stays
consistent.

| Project | Voice |
|---|---|
| `algorithmic art` | **Gallery at night** — deepest staging; the canvas is a lit exhibit, chrome nearly disappears. The **Fluvial Order** movement (`algorithmic art/PHILOSOPHY.md`) governs the artwork itself. |
| `game of life` | **Instrument panel** — quiet, precise, observational. |
| `logic puzzles` | **Instrument panel** — a rail steers two boards; the status bar reads out clues, filled cells and which deduction did the work. |
| `maze generator and solver` | **Instrument panel** — a statusbar of measurements while the maze is drawn. |
| `boids` | **Instrument panel** — motion is the subject; the panel only steers it. |
| `falling sand` | **Instrument panel, pixelated matter** — one pixel per cell, crisp and material. |
| `2048` | **Instrument panel, warm centre** — the board is the hero; tiles warm from grey to gold as they grow. |
| `analog horror raycaster` | **Authored exception — decaying VHS.** Its own palette (`--ink`, `--dim`, `--rec` signal red, `--amber` tape amber), scanlines, grain, a 288×162 dithered buffer, a fog-of-war minimap that expands on `M`, a pausing shop panel, two endings, and a menu that doubles as its settings and accessibility screen. It is the one place a second hue is allowed; it still obeys the *spirit*: mono type and chrome that recedes. |
| `Wiekentwie` | **Not a browser surface.** Excel/VBA; follows the native tool's conventions. |

## Anti-patterns

- Inter / Roboto / system-UI as the primary face, purple gradients, floating
  rounded cards, drop shadows, glassmorphism.
- A second accent colour, or accent used for anything but emphasis and the one
  brand word.
- Light-on-light or unverified contrast; muted text that cannot be read.
- Redesigning the layout at mobile instead of contracting the same layout.
- `Math.random()` in a project's core; unseeded output presented as deterministic.
- A default that pegs the CPU, a multi-second hang when a control changes, or
  a slider that recomputes heavy work on every `input` event. If an interaction
  is expensive, make the default cheap, cap the maximum, debounce, or cache.
- **An author `display` on a `hidden` element.** `[hidden] { display: none }`
  comes from the UA stylesheet, so any author rule — `.overlay { display: flex }`
  — overrides it and `element.hidden = true` silently stops working. This is
  not hypothetical: it left `2048`'s game-over overlay permanently on top of a
  healthy board. Every project that toggles the `hidden` attribute must own a
  guard (`[hidden] { display: none !important; }`, or a scoped
  `.thing[hidden] { display: none; }`). And never verify visibility by reading
  `.hidden` in a check — it reports `true` while the element is on screen.
- Adding a framework, bundler, or design-token package to achieve any of this.

## Checklist for a new project

1. Write the one-line world description in the README/CSS header.
2. Copy the `:root` tokens verbatim; do not fork the palette.
3. Use the `.panel` + `.stage` skeleton and the 720px contraction.
4. Put the artifact front and centre; give it a `.statusbar` of real numbers.
5. Wire a seeded RNG in the core; keep `Math.random()` out of the algorithm.
6. Add states (hover, focus-visible, disabled, empty) and honour
   `prefers-reduced-motion`.
7. Verify in a browser and confirm contrast on text and muted text.
8. **Check the budget on a laptop.** Defaults must be light: no pegged CPU,
   no multi-second stall when a slider moves or the window resizes, and the
   heaviest control settings still capped to something reasonable.

> **Known deviations to fix when touched:** none open. Reduced-motion is wired
> everywhere it is needed — `2048`'s tile and ladder pops, `logic puzzles`'s
> button and cell transitions, and the raycaster's flicker, blink, and gauge
> animations. The remaining sibling projects (`game of life`, `maze generator
> and solver`, `boids`, `falling sand`) declare no `animation` or `transition`
> at all, so there is nothing to guard until they gain motion.
