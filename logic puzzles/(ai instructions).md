# AI instructions for the Logic Puzzles project

A small, dependency-free browser page with two generated puzzles — **Sudoku**
and the **binary puzzle** (Binairo) — each with a solver that can be stepped one
deduction at a time. Keep the puzzle cores separate from the browser interface.

## Before working

- Read this file and [`README.md`](README.md).
- For puzzle behaviour, read `sudoku.js` / `binairo.js` and the relevant cases in
  `test.js`.
- For the board, controls, or browser behaviour, read `app.js`, `index.html`,
  and `style.css` as needed.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md), including [`../DESIGN.md`](../DESIGN.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `sudoku.js` | Sudoku geometry (row/column/box peers), candidates, conflict reporting, the bitmask solver, solution counting, the naked/hidden single deductions and the generator. No DOM; exports `SudokuLib` for Node and the browser. |
| `binairo.js` | The three binary-puzzle rules as line propagation and validation, duplicate-line detection, the solver, solution counting, step deductions and the generator. No DOM; exports `BinairoLib`. |
| `app.js` | The DOM board (one `<button>` per cell), selection and peer tinting, keyboard input, the step/solve controls and the status bar. Depends on both cores. |
| `index.html` | UI structure and script load order (both cores before `app.js`). |
| `style.css` | Page layout and presentation. |
| `test.js` | Node.js tests for both cores, not browser UI tests. |
| `README.md` | User-facing setup, controls, algorithms, and test instructions. |

## The two cores

| Concern | Sudoku (`sudoku.js`) | Binary puzzle (`binairo.js`) |
|---|---|---|
| Grid | 81 plain cells, `0` = empty, `1`–`9` values | `size²` cells, `EMPTY` = `-1`, values `0`/`1` |
| Rule enforcement | row/column/box masks, one 9-bit mask each | `propagateLine` / `propagateGrid` for rules 1 and 2; `duplicateLines` for rule 3 |
| Search | bitset backtracker, always branching on the fewest-remaining-options cell | propagate, then branch on the most constrained cell |
| Counting | `countSolutions(grid, cap)` → `{ count, exact }` | `countSolutions(grid, cap, budget, size)` → `{ count, exact }` |
| Deduction | `logicalStep` (naked single, then hidden single) | `logicalStep` (rules 1 and 2 only) |
| Stepping | `nextStep(grid, solution)` → `'naked'` \| `'hidden'` \| `'guess'` | `nextStep(grid, solution, size)` → `'line'` \| `'guess'` |
| Validation | `conflicts` / `isComplete` | `validate` / `conflicts` / `isSolved` / `duplicateLines` |

## Project constraints

- Keep the project dependency-free and runnable by opening `index.html` from
  disk; do not add a bundler, server requirement, or package dependency unless
  explicitly requested.
- Keep `sudoku.js` and `binairo.js` independent of the browser so they stay
  testable in Node.
- Preserve the browser globals (`SudokuLib`, `BinairoLib`) and Node export
  behaviour when changing a core.
- **All randomness in the cores goes through `makeRng(seed)`** — never
  `Math.random()` in `sudoku.js` or `binairo.js`. The same seed must reproduce
  the same puzzle. (`app.js` may use `Math.random()` only to pick fresh seeds.)
- **Never report a puzzle as uniquely solvable unless the count is `exact`.**
  Both searches stop at a node budget; `exact: false` means the count is only a
  lower bound, and the generators must treat that as "not proven unique" and put
  the removed value back. Weakening this is the one change that can silently
  start shipping ambiguous puzzles.
- **The difficulty's clue count is a floor, not a promise.** Digging stops when
  a removal can no longer be proven safe, so a puzzle may end up with more clues
  than the target. Do not "fix" that by removing the uniqueness check.
- Sudoku stays 9×9. Other sizes need different box geometry; keep the board a
  fixed 81 cells unless the request is explicit about it.
- Binary-puzzle sizes are limited to `SIZES` (6, 8, 10, 12) — every size must be
  even for rule 1 to have an answer.
- Keep generation inside the repository's laptop budget: Sudoku a few
  milliseconds, the binary puzzle worst case a few hundred milliseconds at
  12×12. Generation is one click, never per frame or per input event; if a new
  size doubles that cost, raise the target clue count rather than accepting a
  multi-second stall.
- The `hidden` attribute is used for the size field when Sudoku is selected, so
  `style.css` must keep its `[hidden] { display: none !important; }` guard — an
  author `display` rule would otherwise silently defeat it.

## Extending

### Add a technique to the stepper

1. Extend `logicalStep` in the relevant core, before the guess fallback, and
   return a `technique` string.
2. Add the label in `TECHNIQUE_LABELS` in `app.js` and to `describeWalk`'s
   `order` array so the tally reads correctly.
3. Add a test that a grid requiring only that technique reports it. If the
   technique needs a new grid state, add the grid as a fixture.
4. Run `node test.js`, then check the step controls in a browser.

### Change generation or difficulty

1. Adjust the `DIFFICULTIES` entry in the relevant core (Sudoku uses a clue
   count, the binary puzzle a fill fraction).
2. Re-measure generation time across seeds, not one seed — the cost is in the
   uniqueness checks, and it is seed-dependent.
3. Update the seeded fixtures in `test.js` if the change alters what a seed
   produces, and say so in the commit message: those fixtures are the
   reproducibility contract.
4. Update the claimed clue counts and timings in `README.md`.

### Change rendering or controls

- Keep rules and deductions in the cores; keep tinting, selection, and phrasing
  in `app.js`.
- `paint()` runs on every step and keystroke and walks every cell — keep it
  allocation-light. Rebuild the cells only when the puzzle type or size changes
  (`buildBoard`), not on every paint.
- Keep the board real `<button>` elements: keyboard access, focus rings and
  screen-reader labels come from the browser. Do not swap the board for a canvas
  without replacing those affordances.
- Manually test the affected interaction in a browser; `test.js` does not
  exercise the DOM.

## Validation

From this directory, run:

```bash
node test.js
```

Run this after any change to `sudoku.js` or `binairo.js`. For changes to
`app.js`, `index.html`, or `style.css`, verify in a real browser with the
repository harness — a load check alone is not enough for a control change:

```bash
bash ../tools/check.sh "logic puzzles/index.html" --expect .board --expect .cell
```

Keep README claims aligned with what the source and tests actually guarantee.
