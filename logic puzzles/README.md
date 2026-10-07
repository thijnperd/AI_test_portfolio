# Logic Puzzles — Sudoku and Binary Puzzle with a Solver

A zero-dependency, browser-based puzzle page: **Sudoku** and the **binary puzzle**
(Binairo, also sold as Takuzu or "0h h1"), each with its own generator and a
solver that shows its working one deduction at a time. Open `index.html`
directly in a browser — no build step, no server. Both cores also run in
Node.js, so the rules and the search are covered by unit tests.

Every puzzle on the page is generated, never shipped as a fixed list: a full
board is built first, then cells are dug out one at a time while a solution
count proves the answer is still unique. That is why the clue limit for each
difficulty is a target the generator can *prove*, not a guess.

## Features

- **Two puzzles in one page.** Sudoku at 9×9, the binary puzzle at 6×6, 8×8,
  10×10 and 12×12.
- **Exactly one solution, by construction.** Cells are only removed while
  `countSolutions` still reports a single answer — so no puzzle is ever
  ambiguous, and no "correct" answer is ever rejected.
- **A solver that explains itself.** *Next step* applies a **naked single** or a
  **hidden single** (Sudoku) or a **rule deduction** (binary puzzle), and only
  falls back to a labelled **guess** when the rules genuinely run out. The
  status bar keeps a tally of which technique did the work.
- **Input of your own.** Type into any empty cell; rule breaks are flagged
  immediately, and *Next step* will refuse to continue from a broken board
  rather than build on top of it.
- **Seeded and reproducible.** The same seed rebuilds the same puzzle; the
  status bar shows the seed and how long generation took.
- **Keyboard-first.** Real `<button>` cells, so tab, arrow keys, typing and
  screen-reader labels all work without a custom focus model.
- A live status bar of measurements: puzzle, size, clues, filled cells, last
  technique, seed, generation time and status.

## Run the app

Open `index.html` in a modern browser. A Sudoku starts immediately.

### Controls

| Action | UI | Key |
|---|---|---|
| New puzzle, fresh seed | New puzzle button | `N` |
| Apply one deduction | Next step button | `S` |
| Finish the board | Solve all button | `F` |
| Undo every move you made | Clear moves button | `C` |
| Move the selection | clicking a cell | arrow keys |
| Enter a value | clicking a cell, then typing | `1`–`9` (Sudoku), `0`–`1` (binary) |
| Erase a cell | | `Delete` / `Backspace`, or `0` for Sudoku |
| Puzzle type | Type dropdown | |
| Size (binary only) | Size dropdown | |
| Difficulty | Difficulty dropdown | |
| Highlight rule breaks / highlight peers | checkboxes | |

`0` is a real value in a binary puzzle, so the key erases only in Sudoku.
Switch the type and the difficulty list is rebuilt for that puzzle: Sudoku has
easy → expert, the binary puzzle has easy → hard.

## The two puzzles

### Sudoku (9×9)

Fill the grid so every row, every column and every 3×3 box holds `1`–`9`
exactly once.

### Binary puzzle (Binairo)

Fill the grid with `0`s and `1`s so that:

1. every row and column holds **equally many** 0s and 1s;
2. **no three equal symbols** sit next to each other, in either direction;
3. **no two rows are identical**, and no two columns are identical.

## The algorithms

### Generating

Both generators work the same way round, which is what makes them cheap:

1. **Build a full board.** Sudoku fills cells in order, shuffling the candidate
   values at each step. The binary puzzle propagates its rules as it fills and
   picks the next empty cell with the seeded RNG, backtracking on a contradiction.
2. **Dig holes.** Walk the cells in a seeded random order and try to blank each
   one. A removal is kept **only** if the board still has exactly one solution;
   otherwise the value goes back.

Every removal therefore costs one solution count, and the digging stops when
the board reaches the difficulty's clue target — or earlier, if no further
removal can be proven safe. That second case is why the target is a floor:
a puzzle can end up with more clues than its difficulty asked for, never fewer.

### Solving

**Sudoku** is a bitmask backtracker. One 9-bit mask per row, column and box
records the values already used, so "may this value go here?" is a single bit
test, and the search always branches on the empty cell with the **fewest
remaining options** — the cheapest place to be wrong. That is what keeps a 9×9
solve in the low milliseconds, and it is the same search reused for counting.

**The binary puzzle** solves its three rules in two very different ways. Rules 1
and 2 are *local*, so they are propagated: a line that has spent its quota of
ones forces every gap to zero, and two touching equal symbols force their
neighbours to the opposite value. Rule 3 is *global* — two rows can only be seen
to be identical once both are complete — so it is applied as a contradiction
test rather than a deduction. When propagation stalls, the search branches on
the most constrained cell. Both cores cap their search at a node budget, and
report `exact: false` when it bites, so a "unique" verdict is never claimed on
the strength of an unfinished search.

### Stepping

`nextStep` first asks for a pure deduction. Only when the rules force nothing
does it take the value from a solution of the board as it stands and label the
step a **guess**, which is what the technique tally reports. Because the target
is a real solution of the current board, a step can never be wrong — and a
generated puzzle, being unique, always walks to exactly its own answer.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure, controls and script loading order |
| `style.css` | Layout and the shared dark "instrument panel" theme |
| `sudoku.js` | DOM-free Sudoku core (`SudokuLib`): geometry, candidates, conflicts, solver, solution counting, generator |
| `binairo.js` | DOM-free binary-puzzle core (`BinairoLib`): the three rules as propagation and validation, solver, solution counting, generator |
| `app.js` | The DOM board, stepping, keyboard input and the status bar |
| `test.js` | Node.js tests for both cores |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## Tests

From this folder, run:

```bash
node test.js
```

Tests use Node's built-in `assert` module; no packages need to be installed.
They cover geometry and candidate logic, conflict reporting, the solver
reproducing the **published answer to a classic 9×9 puzzle** (external ground
truth, not our own output), uniqueness counting, the naked-single and
hidden-single deductions, rule propagation and validation for all three binary
rules, and a generator whose puzzles are uniquely solvable, honour their
difficulty target and reproduce from their seed. Two fixture sets pin the
generators down: hand-built grids that isolate one rule each, and the exact
puzzle/solution strings `generate` produced for a fixed seed.

The browser layer in `app.js` is not covered by `test.js`; it is verified in a
real browser with the repository's shared harness.

## Notes

- Randomness in both cores goes through a seeded RNG (`makeRng`, mulberry32);
  `Math.random()` appears only in `app.js`, to pick a fresh seed.
- Generation cost, measured on this machine: Sudoku 5–10ms per puzzle at every
  difficulty; the binary puzzle ~1ms at 8×8 and 23–36ms on average at 12×12,
  worst case a few hundred milliseconds. Nothing here runs per frame — a
  generation is one click.
- The binary puzzle is known as Binairo, Takuzu, Tohu-Wa-Vohu and "0h h1"
  depending on where you meet it. This is an original, dependency-free
  implementation of the same three rules.
