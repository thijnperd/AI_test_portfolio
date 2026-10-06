# Wave Function Collapse — Tilemap Generator

A zero-dependency, browser-based implementation of **Wave Function Collapse**
(the simple tiled model). Open `index.html` directly in a browser — no build
step, no server. The solver core also runs in Node.js, so the constraint logic
is covered by unit tests.

Wave Function Collapse (Maxim Gumin, 2016) generates a map that *obeys local
rules* without ever being drawn by hand. Every cell starts "in superposition":
it could be any tile. The solver repeatedly collapses the least uncertain cell
to one tile and prunes its neighbours until the whole grid has settled into an
image that never breaks the edge rules.

## Features

- **Constraint propagation**, not image copying: tiles are stitched only where
  their edge sockets agree
- **Entropy-driven collapse** — the most decided cell is settled next, which is
  what keeps the result coherent
- **Backtracking** — when a choice would paint the map into a corner, the
  solver rewinds to an earlier decision and tries another tile
- **Two authored tile sets**: a PCB-like **Circuit** and **Roads & Rivers**
- Animated collapse with a live uncertainty tint, plus a one-click **Solve all**
- Optional boundary rules that keep tracks off the map edges
- Seeded — the same seed reproduces the same map
- Live status bar: grid size, collapsed cells, contradictions, seed, status

## Run the app

Open `index.html` in a modern browser. A grid starts collapsing immediately.

### Controls

| Action | UI | Key |
|---|---|---|
| Pause / run | Pause button | `Space` |
| Collapse one cell | Step button | `S` |
| Finish the grid | Solve all button | `F` |
| New random seed | New seed button | `N` |
| Restart with the same seed | Clear button | |
| Grid columns / rows | sliders | |
| Tile set | Tile set dropdown | |
| Collapse speed | Speed slider | |
| Uncertainty tint / boundary / animation | checkboxes | |

Changing the grid size, tile set, or boundary mode rebuilds the grid from the
current seed; the speed, tint, and animation toggles apply live.

## The algorithm

1. **Tiles and sockets.** Each tile has four edge sockets `[north, east, south,
   west]` and a weight. A handful of base shapes (end, straight, corner, tee,
   cross) are rotated into every orientation, so the tile set stays small but
   expressive.
2. **Adjacency.** Tile `A` may sit to the east of tile `B` only if `A`'s west
   socket equals `B`'s east socket. Doing this for all four directions up front
   turns the sockets into a lookup table.
3. **Superposition.** Every cell starts allowing every tile.
4. **Observation.** The solver measures each cell's weighted Shannon entropy
   and collapses the lowest-entropy cell with a seeded, weight-biased pick.
5. **Propagation.** Collapsing a cell removes every now-impossible tile from
   its neighbours, which may cascade further. A cascade that empties a cell's
   domain is a **contradiction**.
6. **Backtracking.** Rather than give up, the solver restores the state before
   the last decision and tries the next-best tile. Only when no alternative
   remains does it report a genuine contradiction.

Randomness comes from a seeded RNG in `wfc.js`, so a given seed reproduces its
map exactly; the app only uses `Math.random()` to pick fresh seeds.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure, controls, and script loading order |
| `style.css` | Layout and the shared dark "instrument panel" theme |
| `wfc.js` | DOM-free core (`WFCLib`): tile sets, adjacency, the solver, validation; works in browser and Node |
| `app.js` | Canvas rendering, animation loop, controls, and keyboard shortcuts |
| `test.js` | Node.js tests for the core |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## Tests

From this folder, run:

```bash
node test.js
```

Tests use Node's built-in `assert` module; no packages need to be installed.
They cover rotation consistency, the adjacency table (matching sockets and
symmetry), propagation pruning impossible options, full-grid solving with zero
adjacency violations, deterministic seeds, contradiction detection on an
unsatisfiable tile set, backtracking on a satisfiable one, boundary rules, and
the `validate()` self-check. The browser interface in `app.js` is not covered by
this test file.

## Credit

The algorithm follows Maxim Gumin's
[WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse). This is
an original, dependency-free implementation of the *simple tiled* variant with
its own tile sets, adjacency model, solver, and renderer.
