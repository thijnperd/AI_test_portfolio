# (ai instructions)

Instructions for AI assistants (and humans) working in the **maze generator
and solver** project: how the code is organised, the house rules, and how to
extend it safely.

---

## 1. File map and responsibilities

| File | Responsibility |
|---|---|
| `maze.js` | The algorithm core. `Maze` wall model, seeded RNG, generators, solvers. **No DOM code here.** Runs both in the browser (`MazeLib` global) and in Node (`module.exports`). |
| `app.js` | Everything browser-side: canvas rendering, the animation state machine (`generating` → `solving` → `done`), sliders/buttons, keyboard shortcuts. |
| `index.html` | Static shell: control panel, status bar, canvas. Controls are referenced by id from `app.js`. |
| `style.css` | Dark UI theme (CSS variables in `:root`). |
| `test.js` | Node tests for `maze.js` only — the executable specification. Run with `node test.js`. |

Keep this separation: algorithms go in `maze.js`, presentation and animation
go in `app.js`.

---

## 2. House rules

- **Zero dependencies.** No npm packages, no bundler, no build step. Plain
  scripts (not ES modules) so everything works from `file://`.
- **The core stays pure.** `maze.js` must never touch the DOM or the canvas,
  so `node test.js` can keep testing it headlessly.
- **Determinism matters.** All randomness in the core goes through
  `makeRng(seed)` (mulberry32) — never `Math.random()` in `maze.js`. The
  same seed and settings must always produce the same maze. (`app.js` may
  use `Math.random()` only to pick fresh seeds.)
- **Generators produce perfect mazes.** A new generator must maintain the
  spanning-tree invariant: connected, exactly `cols × rows − 1` passages,
  borders intact. The test suite enforces this for every registered
  generator.
- **Solvers return `{ path, visited }`.** `path` is `null` when the goal is
  unreachable; `visited` is the exploration order (the app animates it).
  BFS and A* must return *shortest* paths.
- **Match the existing style**: 2-space indent, `'use strict'` IIFEs,
  `const`/`let`, descriptive names. The theme colours are shared with the
  sibling projects (`--accent: #7aa2ff`, `--bg: #0e0f13`, …).
- This folder is self-contained: keep all project files, docs, and assets in
  here (see the repository-root `WhatIsThisFolder.md`).

---

## 3. How to extend

### Add a generator

1. Write `function myGenerator(maze, rng, record)` in `maze.js`. Carve every
   wall through `carveBetween(maze, record, x1, y1, x2, y2)` — the `record`
   callback feeds the animation event list; carving without it breaks the
   replay.
2. Register it in `GENERATORS` (kebab-case id, Title Case `name`).
3. Nothing else: `app.js` builds its dropdown from `GENERATORS`, and
   `test.js` loops over every registered generator to check the perfect-maze
   properties, determinism, and event replay.
4. Run `node test.js`.

### Add a solver

1. Write `function mySolver(maze, start, goal)` returning `{ path, visited }`
   (see `reconstruct` for the shared path-rebuilding helper).
2. Register it in `SOLVERS`. The UI dropdown and the per-solver tests pick it
   up automatically.
3. If it claims to find *shortest* paths, the existing BFS/A* shortest-path
   test is generic enough to include it — see the `['bfs', 'astar']` list.
4. Run `node test.js`.

### Change the maze model or `Maze` API

`app.js` renders directly from `maze.vWalls` / `maze.hWalls` via the `vi` /
`hi` index helpers. If you change the storage layout, update `render()` in
`app.js` and the layout-equality helpers in `test.js` (`sameLayout`,
`passageCount`, `bordersIntact`).

### Animation notes

- `build(animate)` in `app.js` is the entry point: `true` replays the carve
  events over time, `false` jumps straight to the solved state (used on
  resize and cell-size changes).
- `consume(n)` advances at most `n` steps (carve events or visited cells);
  the loop feeds it from `speed` (steps/s).
- Keep `render()` allocation-light — it runs every frame while animating.

---

## 4. Testing discipline

Run `node test.js` after **any** change to `maze.js` — all tests must pass.
They are the project's specification, not just a safety net.

Conventions in `test.js`:

- Property checks (connected, `cols × rows − 1` passages, intact borders)
  run against **every** registered generator automatically.
- Path checks run for **every** solver × generator combination.
- Shortest-path claims are verified against `distance()` — an independent BFS
  written inside the test file, deliberately not reusing the core's solvers.
- Determinism is checked by comparing full wall layouts (`sameLayout`).

Headless-browser note: `requestAnimationFrame` may fire only once in headless
Chrome (no compositor frames). To smoke-test `app.js`, shim it with
`setTimeout` and drive the UI (buttons + `change` events) from a probe page;
assert on the status-bar text.

---

## Summary

`maze.js` is the pure, deterministic, tested algorithm core; `app.js` is the
animation and UI layer. Add generators/solvers through the registries, keep
the perfect-maze and shortest-path guarantees intact, and run `node test.js`
before considering any change done.
