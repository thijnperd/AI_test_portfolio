/* sudoku.js — 9x9 Sudoku generation and solving core.
 *
 * Pure logic, no DOM: runs in the browser (as `SudokuLib`) and in Node
 * (`module.exports`) so the rules can be tested with `node test.js`.
 *
 * A grid is a plain array of 81 cells in row-major order. `0` means empty and
 * `1..9` are the values, so a puzzle can also be written as an 81-character
 * string with `.` or `0` for the blanks (see `parse`).
 *
 * The solver is a bitmask backtracker: one 9-bit mask remembers the values
 * already used in each row, column and box, so "may this value go here?" is a
 * single bit test. It always picks the empty cell with the fewest remaining
 * options, which is what keeps 9x9 puzzles near-instant. The same search is
 * reused to count solutions, which is how the generator knows a puzzle it dug
 * out still has exactly one answer.
 */
(function (global) {
  'use strict';

  const SIZE = 9;
  const BOX = 3;
  const EMPTY = 0;
  const CELLS = SIZE * SIZE;      // 81
  const ALL = 0x3fe;              // bits 1..9 (bit 0, the empty value, is unused)

  /* ------------------------------------------------------------------ */
  /* Seeded RNG (mulberry32) — the house convention                     */
  /* ------------------------------------------------------------------ */

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  }

  /* ------------------------------------------------------------------ */
  /* Geometry: row, column, box and the 20 peers of every cell          */
  /* ------------------------------------------------------------------ */

  const ROW = new Uint8Array(CELLS);
  const COL = new Uint8Array(CELLS);
  const BOXOF = new Uint8Array(CELLS);
  const PEERS = [];

  for (let i = 0; i < CELLS; i++) {
    const r = (i / SIZE) | 0;
    const c = i % SIZE;
    ROW[i] = r;
    COL[i] = c;
    BOXOF[i] = ((r / BOX) | 0) * BOX + ((c / BOX) | 0);
  }

  for (let i = 0; i < CELLS; i++) {
    const seen = [];
    for (let j = 0; j < CELLS; j++) {
      if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOXOF[j] === BOXOF[i])) {
        seen.push(j);
      }
    }
    PEERS.push(Uint8Array.from(seen));
  }

  /* The nine cells of each row, column and box — used by the hidden-single
   * deduction and by `conflicts`. */
  const UNITS = [];
  for (let u = 0; u < 27; u++) {
    const cells = [];
    for (let i = 0; i < CELLS; i++) {
      const kind = (u / 9) | 0;
      const n = u % 9;
      if ((kind === 0 && ROW[i] === n) ||
          (kind === 1 && COL[i] === n) ||
          (kind === 2 && BOXOF[i] === n)) {
        cells.push(i);
      }
    }
    UNITS.push({ kind: ['row', 'col', 'box'][(u / 9) | 0], index: u % 9, cells: cells });
  }

  /* How many options a candidate mask holds, for the MRV scan, and the
   * reverse map from a single-bit mask back to its value. */
  const POPCOUNT = new Uint8Array(1 << 10);
  const BIT_INDEX = new Uint8Array(1 << 10);
  for (let m = 0; m < POPCOUNT.length; m++) {
    let n = 0;
    for (let b = m; b; b &= b - 1) n++;
    POPCOUNT[m] = n;
    BIT_INDEX[m] = n === 1 ? Math.round(Math.log2(m)) : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Grid helpers                                                       */
  /* ------------------------------------------------------------------ */

  function create() {
    return new Array(CELLS).fill(EMPTY);
  }

  function clone(grid) {
    return Array.prototype.slice.call(grid);
  }

  function isComplete(grid) {
    for (let i = 0; i < CELLS; i++) if (!grid[i]) return false;
    return true;
  }

  /** Parse an 81-character puzzle; `.`, `0`, `-` and whitespace mean empty. */
  function parse(text) {
    const chars = String(text).toUpperCase().replace(/[^0-9.\-]/g, '').split('');
    if (chars.length !== CELLS) {
      throw new Error('a Sudoku puzzle needs exactly 81 cells, got ' + chars.length);
    }
    const grid = create();
    for (let i = 0; i < CELLS; i++) {
      const ch = chars[i];
      grid[i] = (ch === '.' || ch === '-' || ch === '0') ? EMPTY : parseInt(ch, 10);
    }
    return grid;
  }

  /** Render a grid back to an 81-character string (`.` for empty). */
  function format(grid) {
    let out = '';
    for (let i = 0; i < CELLS; i++) out += grid[i] ? String(grid[i]) : '.';
    return out;
  }

  /** Render as nine rows, for readable output and test failures. */
  function formatGrid(grid) {
    const rows = [];
    for (let r = 0; r < SIZE; r++) {
      rows.push(format(grid.slice(r * SIZE, r * SIZE + SIZE)));
    }
    return rows.join('\n');
  }

  /**
   * Values that may legally go in a cell: those not already used by any of its
   * 20 peers. Returns [] for a filled cell or a cell with no options.
   */
  function candidatesFor(grid, index) {
    if (grid[index]) return [];
    let used = 0;
    const peers = PEERS[index];
    for (let p = 0; p < peers.length; p++) {
      const v = grid[peers[p]];
      if (v) used |= 1 << v;
    }
    const out = [];
    for (let v = 1; v <= SIZE; v++) if (!(used & (1 << v))) out.push(v);
    return out;
  }

  /**
   * Cells that clash with another cell in the same row, column or box.
   * A partially filled grid is fine; only real duplicates are reported, so
   * this is what the interface highlights while you type.
   */
  function conflicts(grid) {
    const bad = new Array(CELLS).fill(false);
    for (let u = 0; u < UNITS.length; u++) {
      const cells = UNITS[u].cells;
      for (let a = 0; a < cells.length; a++) {
        const v = grid[cells[a]];
        if (!v) continue;
        for (let b = a + 1; b < cells.length; b++) {
          if (grid[cells[b]] === v) {
            bad[cells[a]] = true;
            bad[cells[b]] = true;
          }
        }
      }
    }
    const out = [];
    for (let i = 0; i < CELLS; i++) if (bad[i]) out.push(i);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* The search: placement, MRV branching, solution counting            */
  /* ------------------------------------------------------------------ */

  /**
   * Run the backtracking search over a grid.
   *
   *   cap     stop after this many solutions (0 = find the first one only)
   *   budget  stop after this many search nodes; `exact` is false if it bites
   *
   * Returns { count, solution, exact, nodes }. `solution` is the first grid
   * found. When `cap` is 0 the search returns as soon as one solution exists,
   * so `count` is then 0 or 1 and should be read as "solvable".
   */
  function search(grid, cap, budget) {
    const cells = Uint8Array.from(grid);
    const rowMask = new Uint16Array(SIZE);
    const colMask = new Uint16Array(SIZE);
    const boxMask = new Uint16Array(SIZE);
    const limit = budget === undefined ? 200000 : budget;

    for (let i = 0; i < CELLS; i++) {
      const v = cells[i];
      if (!v) continue;
      const bit = 1 << v;
      if ((rowMask[ROW[i]] | colMask[COL[i]] | boxMask[BOXOF[i]]) & bit) {
        // already contradicted by a peer — report it without searching
        return { count: 0, solution: null, exact: true, nodes: 0 };
      }
      rowMask[ROW[i]] |= bit;
      colMask[COL[i]] |= bit;
      boxMask[BOXOF[i]] |= bit;
    }

    let count = 0;
    let solution = null;
    let nodes = 0;
    let exhausted = false;

    function recurse() {
      if (++nodes > limit) {
        exhausted = true;
        return;
      }
      // Pick the empty cell with the fewest options: the cheapest place to
      // be wrong, and the reason this is fast enough to run on a click.
      let best = -1;
      let bestMask = 0;
      let bestCount = SIZE + 1;
      for (let i = 0; i < CELLS; i++) {
        if (cells[i]) continue;
        const avail = ALL & ~(rowMask[ROW[i]] | colMask[COL[i]] | boxMask[BOXOF[i]]);
        const n = POPCOUNT[avail];
        if (n === 0) return;             // dead end, nothing to try
        if (n < bestCount) {
          bestCount = n;
          best = i;
          bestMask = avail;
          if (n === 1) break;
        }
      }

      if (best === -1) {                 // every cell filled
        count++;
        if (!solution) solution = Array.from(cells);
        return;
      }

      const r = ROW[best];
      const c = COL[best];
      const b = BOXOF[best];
      for (let m = bestMask; m; m &= m - 1) {
        const bit = m & -m;
        const v = BIT_INDEX[bit];        // the value that bit stands for
        cells[best] = v;
        rowMask[r] |= bit;
        colMask[c] |= bit;
        boxMask[b] |= bit;

        recurse();

        cells[best] = 0;
        rowMask[r] &= ~bit;
        colMask[c] &= ~bit;
        boxMask[b] &= ~bit;

        if (exhausted) return;
        if (cap && count >= cap) return;
      }
    }

    recurse();
    return { count, solution, exact: !exhausted, nodes };
  }

  /**
   * Count the solutions of a grid, stopping at `cap` (default 2 — enough to
   * tell "exactly one" from "more than one").
   *
   * Returns { count, exact }. `exact` is false when the node budget ran out,
   * which means the count is a lower bound: callers that care about uniqueness
   * must treat a non-exact result as "not proven unique".
   */
  function countSolutions(grid, cap, budget) {
    const want = cap === undefined ? 2 : cap;
    const res = search(grid, want, budget);
    return { count: res.count, exact: res.exact };
  }

  /** Solve a grid, or return null when it has no solution. */
  function solve(grid) {
    const res = search(grid, 0, 200000);
    return res.solution;
  }

  /** True when the grid has exactly one solution. */
  function hasUniqueSolution(grid, budget) {
    const res = countSolutions(grid, 2, budget);
    return res.exact && res.count === 1;
  }

  /* ------------------------------------------------------------------ */
  /* Deductions, for stepping through a solve                           */
  /* ------------------------------------------------------------------ */

  /**
   * The next deduction that pure logic can make, or null when the grid is
   * already complete:
   *
   *   { index, value, technique: 'naked' | 'hidden', unit: 'cell'|'row'|'col'|'box' }
   *
   * Scans in cell order, so the same grid always yields the same step.
   */
  function logicalStep(grid) {
    if (isComplete(grid)) return null;

    // A cell with a single candidate: "naked single".
    for (let i = 0; i < CELLS; i++) {
      if (grid[i]) continue;
      const opts = candidatesFor(grid, i);
      if (opts.length === 1) {
        return { index: i, value: opts[0], technique: 'naked', unit: 'cell' };
      }
    }

    // A value with only one home left in a unit: "hidden single".
    for (let u = 0; u < UNITS.length; u++) {
      const unit = UNITS[u];
      for (let v = 1; v <= SIZE; v++) {
        let spot = -1;
        let spots = 0;
        for (let c = 0; c < unit.cells.length; c++) {
          const i = unit.cells[c];
          if (grid[i] === v) { spots = 0; spot = -1; break; }   // already placed
          if (grid[i]) continue;
          const opts = candidatesFor(grid, i);
          if (opts.indexOf(v) !== -1) {
            spots++;
            spot = i;
            if (spots > 1) break;
          }
        }
        if (spots === 1) {
          return { index: spot, value: v, technique: 'hidden', unit: unit.kind };
        }
      }
    }

    return null;
  }

  /**
   * The next step towards `solution`. Logical deductions first; when logic
   * stalls, fall back to the value the solution calls for and label it
   * `'guess'` so the interface can show that a trial was needed.
   *
   * Returns a step object with a `technique` of 'naked', 'hidden' or 'guess',
   * or null once the grid matches the solution.
   */
  function nextStep(grid, solution) {
    const step = logicalStep(grid);
    if (step) return step;

    for (let i = 0; i < CELLS; i++) {
      if (!grid[i]) {
        return { index: i, value: solution[i], technique: 'guess', unit: 'cell' };
      }
    }
    return null;
  }

  /**
   * Solve a puzzle one deduction at a time and return the whole walkthrough.
   *
   * The grid is first solved outright, then re-derived by deductions so the
   * step list is always consistent with that solution (no step is ever later
   * contradicted). Returns { solution, steps, techniques }.
   */
  function solveWithSteps(puzzle, maxSteps) {
    const solution = solve(puzzle);
    if (!solution) return { solution: null, steps: [], techniques: {} };

    const grid = clone(puzzle);
    const steps = [];
    const techniques = { naked: 0, hidden: 0, guess: 0 };
    const limit = maxSteps === undefined ? CELLS : maxSteps;

    for (let n = 0; n < limit; n++) {
      const step = nextStep(grid, solution);
      if (!step) break;
      grid[step.index] = step.value;
      techniques[step.technique]++;
      steps.push(step);
    }

    return { solution: solution, steps: steps, techniques: techniques };
  }

  /* ------------------------------------------------------------------ */
  /* Generation                                                         */
  /* ------------------------------------------------------------------ */

  const DIFFICULTIES = [
    { id: 'easy', label: 'Easy', clues: 42 },
    { id: 'medium', label: 'Medium', clues: 34 },
    { id: 'hard', label: 'Hard', clues: 28 },
    { id: 'expert', label: 'Expert', clues: 24 },
  ];

  function difficultyById(id) {
    for (let i = 0; i < DIFFICULTIES.length; i++) {
      if (DIFFICULTIES[i].id === id) return DIFFICULTIES[i];
    }
    return DIFFICULTIES[1];
  }

  /** A complete, valid grid, filled in a seeded random order. */
  function fullGrid(rng) {
    const cells = new Uint8Array(CELLS);
    const rowMask = new Uint16Array(SIZE);
    const colMask = new Uint16Array(SIZE);
    const boxMask = new Uint16Array(SIZE);

    function fill(pos) {
      if (pos === CELLS) return true;
      const r = ROW[pos];
      const c = COL[pos];
      const b = BOXOF[pos];
      const avail = ALL & ~(rowMask[r] | colMask[c] | boxMask[b]);
      const values = [];
      for (let v = 1; v <= SIZE; v++) if (avail & (1 << v)) values.push(v);
      shuffle(values, rng);

      for (let k = 0; k < values.length; k++) {
        const v = values[k];
        const bit = 1 << v;
        cells[pos] = v;
        rowMask[r] |= bit;
        colMask[c] |= bit;
        boxMask[b] |= bit;
        if (fill(pos + 1)) return true;
        cells[pos] = 0;
        rowMask[r] &= ~bit;
        colMask[c] &= ~bit;
        boxMask[b] &= ~bit;
      }
      return false;
    }

    fill(0);
    return Array.from(cells);
  }

  /**
   * Generate a puzzle with exactly one solution.
   *
   * A full grid is filled first, then cells are removed in a seeded random
   * order — but only while the puzzle still has exactly one answer. That check
   * is the whole cost of generation, which is why the low-clue difficulties
   * settle for the fewest holes they can prove, not a fixed count.
   *
   * Returns { puzzle, solution, clues, difficulty, seed, attempts, budgetHit }.
   */
  function generate(seed, difficulty) {
    const diff = typeof difficulty === 'string' ? difficultyById(difficulty) : difficulty;
    const target = Math.max(17, diff ? diff.clues : 34);
    const solution = fullGrid(makeRng(seed >>> 0));
    const puzzle = solution.slice();
    const order = shuffle(
      Array.from({ length: CELLS }, function (_, i) { return i; }),
      makeRng((seed >>> 0) ^ 0x9e3779b9)
    );

    let clues = CELLS;
    let attempts = 0;
    let budgetHit = false;

    for (let k = 0; k < order.length; k++) {
      if (clues <= target) break;
      const i = order[k];
      const keep = puzzle[i];
      puzzle[i] = EMPTY;
      attempts++;
      const res = countSolutions(puzzle, 2, 60000);
      if (!res.exact) budgetHit = true;
      if (res.exact && res.count === 1) {
        clues--;
      } else {
        puzzle[i] = keep;
      }
    }

    return {
      puzzle: puzzle,
      solution: solution,
      clues: clues,
      difficulty: diff ? diff.id : 'medium',
      seed: seed >>> 0,
      attempts: attempts,
      budgetHit: budgetHit,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Exports                                                            */
  /* ------------------------------------------------------------------ */

  const SudokuLib = {
    SIZE: SIZE,
    BOX: BOX,
    EMPTY: EMPTY,
    CELLS: CELLS,
    DIFFICULTIES: DIFFICULTIES,
    makeRng: makeRng,
    create: create,
    clone: clone,
    parse: parse,
    format: format,
    formatGrid: formatGrid,
    isComplete: isComplete,
    candidatesFor: candidatesFor,
    conflicts: conflicts,
    countSolutions: countSolutions,
    hasUniqueSolution: hasUniqueSolution,
    solve: solve,
    solveWithSteps: solveWithSteps,
    logicalStep: logicalStep,
    nextStep: nextStep,
    generate: generate,
    fullGrid: fullGrid,
  };

  global.SudokuLib = SudokuLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SudokuLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
