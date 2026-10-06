# Falling Sand — Particle Sandbox

A zero-dependency, browser-based falling-sand sandbox with a small physics
model: gravity as an acceleration, density that decides what sinks and what
floats, and hydrostatic pressure that lets liquids find their level. Open
`index.html` directly in a browser — no build step, no server. The simulation
core also runs in Node.js, so the rules are covered by unit tests.

## Materials

| Material | State | Density | Behaviour |
|---|---|---|---|
| Sand | powder | 2.0 | falls and piles; sinks through water and oil; wet sand holds a steeper pile |
| Water | liquid | 1.0 | falls, spreads, and levels out; sinks below oil |
| Oil | liquid | 0.6 | light and floats on water |
| Stone | solid | — | immovable |

Because movement is decided by **density**, pushing a heavy material into a
lighter one swaps them: sand sinks through both fluids, water sinks below oil,
and oil rides on top.

## Features

- Four materials plus empty: **sand**, **water**, **oil**, and solid **stone**
- **Gravity as acceleration** — a falling grain gains speed instead of moving
  one cell per tick forever
- **Density-based displacement** — heavier materials sink through lighter ones
- **Hydrostatic pressure** — liquids flow from a taller column to a shorter one
  and level out (communicating vessels); the `Pressure` readout shows the
  deepest liquid column
- **Angle of repose** — powder slides diagonally, but wet powder holds a
  steeper pile
- Paint with the brush, drag to pour, or toggle **rain** to shower sand from the top
- Adjustable brush size and simulation speed; play/pause, single-step, clear, randomize
- Seeded simulation — the same seed reproduces the same run

## Run the app

Open `index.html` in a modern browser. It opens with a random scene that starts
settling immediately.

### Controls

| Action | UI | Key |
|---|---|---|
| Play / pause | Pause button | `Space` |
| Advance one tick | Step button | |
| Randomize the scene | Randomize button | |
| Clear the grid | Clear button | `C` |
| Material and brush size | Material dropdown, Size slider | |
| Ticks per frame | Speed slider | |
| Sand rain | Rain checkbox | |
| Paint | Click / drag on the canvas | |

The canvas is one pixel per grid cell, scaled up and shown without smoothing, so
the grid stays crisp on any screen size.

## The physics

Each tick, in order:

1. **Gravity.** Every mobile cell gains vertical velocity
   (`GRAVITY = 0.4` cells/tick², capped per material), so falls speed up. A
   particle falls as many whole cells as its velocity allows.
2. **Pressure.** `computeFluids()` measures each column's liquid volume and
   surface row. Pressure at a cell is the depth of liquid above it.
3. **Movement**, bottom-up so a particle only moves once per tick:
   - **Powder** falls straight down, then diagonally (in a random order) — but
     *not* when it is wet, which is what makes wet sand stand steeper.
   - **Liquid** falls, then flows sideways. A surface cell only flows into a
     neighbour whose surface is **below** it and whose column holds **less**
     liquid, which is the pressure gradient that levels connected liquid out
     without oscillating.
   - A particle may move into an empty cell or **swap** with a *lighter* mobile
     cell; stone never yields.

Material is conserved: with no painting or rain, the counts of sand, water, oil,
and stone never change. Randomness comes from a seeded RNG, so a given seed
reproduces a run exactly; the app only uses `Math.random()` to pick fresh seeds.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure, controls, and script loading order |
| `style.css` | Layout and dark visual theme |
| `sand.js` | DOM-free core (`Sand`, materials, gravity, pressure, leveling); works in browser and Node |
| `app.js` | Pixel-buffer rendering, simulation loop, brush, and controls |
| `test.js` | Node.js tests for the core |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## Tests

From this folder, run:

```bash
node test.js
```

Tests use Node's built-in `assert` module; no packages need to be installed.
They cover gravity and acceleration, density-based sinking and floating,
three-fluid stratification, hydrostatic pressure, liquids finding their level
in a basin and across connected tanks, wet-sand repose, immovable stone,
material conservation, seeded determinism, and the brush/emit helpers. The
browser interface in `app.js` is not covered by this test file.
