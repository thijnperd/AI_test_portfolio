# AI instructions for the Wave Function Collapse project

A small, dependency-free browser implementation of the Wave Function Collapse
simple tiled model. Keep the solver core separate from the browser interface.

## Before working

- Read this file and [`README.md`](README.md).
- For solver behaviour, read `wfc.js` and the relevant cases in `test.js`.
- For rendering, controls, or browser behaviour, read `app.js`, `index.html`,
  and `style.css` as needed.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md), including [`../DESIGN.md`](../DESIGN.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `wfc.js` | Tile sets and shapes, socket rotation, the adjacency table, the `Solver` (domains, entropy, propagation, backtracking, validation). No DOM; exports `WFCLib` for Node and the browser. |
| `app.js` | Canvas rendering, the animation loop, control wiring, and pointer/keyboard interaction. Depends on `wfc.js`. |
| `index.html` | UI structure and script load order (`wfc.js` before `app.js`). |
| `style.css` | Page layout and presentation. |
| `test.js` | Node.js tests for the solver core, not browser UI tests. |
| `README.md` | User-facing setup, controls, algorithm, and test instructions. |

## The core model

| Concern | Where | Rule |
|---|---|---|
| Sockets | `buildTiles` | Each tile's four sockets are `[N, E, S, W]`; rotated variants come from `SHAPES`, so never author every rotation by hand. |
| Adjacency | `buildAdjacency` | `compat[d][s]` lists every tile that may sit in direction `d` of tile `s`. Two tiles match when the touching sockets are equal. |
| Entropy | `entropyAt`, `lowestEntropy` | Weighted Shannon entropy; the lowest-entropy cell is collapsed next, ties broken by the seeded RNG. |
| Propagation | `propagate` | Shrink neighbour domains until stable; return `false` when a domain empties. |
| Backtracking | `step`, `backtrack` | Snapshot domains/counts/chosen before each decision; rewind if a choice contradicts. |
| Validation | `validate` | Walks every adjacent pair and counts adjacency violations (used by tests and the app). |

## Project constraints

- Keep the project dependency-free and runnable by opening `index.html` from
  disk; do not add a bundler, server requirement, or package dependency unless
  explicitly requested.
- Keep `wfc.js` independent of the browser so it stays testable in Node.
- Preserve the browser global (`WFCLib`) and Node export behaviour.
- **All randomness in the core goes through `makeRng(seed)`** — never
  `Math.random()` in `wfc.js`. The same seed must reproduce the same map.
  (`app.js` may use `Math.random()` only to pick fresh seeds.)
- **Never break the socket rule.** `compat[d][s]` and `tiles[s].sockets[d]` must
  stay in agreement; `test.js` enforces matching sockets and symmetry.
- **Keep `reset()` reseeding the RNG** so a reset grid is as reproducible as a
  fresh one.

## Extending

### Add a tile or a tile set

1. Add the shape to `SHAPES` (a socket arity plus a weight) or a whole set to
   `TILE_SETS` with its tracks, ground weight, and colours.
2. `buildTiles` generates the rotations automatically — do not add hand-made
   variants.
3. If you add a new shape kind, extend the renderer in `app.js` if it needs a
   special glyph, and update the expected variant counts in `test.js`.
4. Run `node test.js`.

### Change rendering or controls

- Keep solver state in `wfc.js`; keep drawing, animation, and interaction in
  `app.js`.
- Keep `render()` allocation-light — it runs every frame while animating.
- Preserve responsive layout and device-pixel-ratio handling in `resize()`.
- Manually test the affected interaction in a browser; `test.js` does not
  exercise the DOM or canvas.

## Validation

From this directory, run:

```bash
node test.js
```

Run this after changes to `wfc.js` or solver behaviour. For changes to `app.js`,
`index.html`, or `style.css`, also open `index.html` in a browser and check the
affected controls and display. Keep README claims aligned with what the source
and tests actually guarantee.
