# AI instructions for the Falling Sand project

A small, dependency-free browser falling-sand sandbox with a physics model
(gravity acceleration, density, hydrostatic pressure). Keep the automaton core
separate from the browser interface.

## Before working

- Read this file and [`README.md`](README.md).
- For simulation behaviour, read `sand.js` and the relevant cases in `test.js`.
- For rendering, the brush, or browser behaviour, read `app.js`, `index.html`,
  and `style.css` as needed.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `sand.js` | Materials and their properties, the grid, the seeded RNG, gravity/velocity, hydrostatic pressure, one-tick movement, painting/emit helpers, and counts. No DOM; exports `SandLib` for Node and the browser. |
| `app.js` | Pixel-buffer rendering, the animation loop, pointer painting, and control wiring. Depends on `sand.js`. |
| `index.html` | UI structure and script load order (`sand.js` before `app.js`). |
| `style.css` | Page layout and presentation. |
| `test.js` | Node.js tests for the automaton core, not browser UI tests. |
| `README.md` | User-facing setup, controls, the physics model, and test instructions. |

## The physics model

| Concern | Where | Rule |
|---|---|---|
| Gravity | `step()` | Mobile cells gain `GRAVITY` cells/tick² up to their material's `maxFall`, then `fall()` moves them that many whole cells. |
| Density | `canDisplace(from, to)` | A particle may enter an empty cell or **swap with a lighter mobile cell**; stone (solid) never yields. |
| Pressure | `computeFluids()`, `pressureAt()` | Per column, liquid `depth` (contiguous) and `surface` (topmost liquid row) plus `colVol` (volume). Pressure at a cell is the liquid above it. |
| Leveling | `stepLiquid()` | A surface cell flows only into a neighbour whose `surface` is **below** it and whose `colVol` is **smaller** — the pressure gradient that levels liquid out. |
| Repose | `stepPowder()`, `isWet()` | Powder slides diagonally unless it is wet (orthogonally touching a liquid). |

## Project constraints

- Keep the project dependency-free and runnable by opening `index.html` from
  disk; do not add a bundler, server requirement, or package dependency unless
  explicitly requested.
- Keep `sand.js` independent of the browser so it stays testable in Node.
- Preserve the browser global (`SandLib`) and Node export behavior.
- **All randomness in the core goes through `makeRng(seed)`** — never
  `Math.random()` in `sand.js`. The same seed must reproduce the same run.
  (`app.js` may use `Math.random()` only to pick fresh seeds.)
- **Preserve the invariants the tests defend:** stone never moves, material is
  conserved when nothing is painted or emitted, and each particle moves at most
  once per tick (keep the `moved` mask and the bottom-up scan).
- **Keep the leveling rule stable.** The `surface > y` **and** `colVol < vol`
  guards are what stop liquids oscillating; do not relax them to a bare "flow
  into any empty neighbour" — that reintroduces churn. See the `test.js` cases
  "liquids find their level" and "two connected tanks".
- **Velocity travels with the particle.** `swap()` moves `cells` *and* `velY`
  together; keep it that way or falling speeds will attach to the wrong cell.

## Extending the sandbox

### Add a material

1. Add a constant in `sand.js`, give it an entry in `MATERIALS` (`state`,
   `density`, and `maxFall` for mobile materials), and extend the `MOBILE` /
   `LIQUID` lookup tables and `NAME`.
2. `canDisplace` already handles density generically; add any special rule
   there if the material needs one.
3. Add its colour to `COLORS` in `app.js`, an option to the material dropdown in
   `index.html`, and its count to `counts()` and the status bar.
4. Add tests in `test.js` on small grids that isolate the new behaviour
   (including any density interaction with sand/water/oil).
5. Run `node test.js`.

### Tune motion, gravity, or the HUD

- `GRAVITY`, per-material `maxFall`, and the leveling guards live in `sand.js`;
  change them there, not in `app.js`.
- The `Pressure` readout is `Sand.maxPressure()`; keep the status bar in sync if
  you add or rename materials.

## Validation

From this directory, run:

```bash
node test.js
```

Run this after changes to `sand.js` or simulation behaviour. For changes to
`app.js`, `index.html`, or `style.css`, also open `index.html` in a browser and
check the affected controls and display. Keep README claims aligned with what
the source and tests actually guarantee.
