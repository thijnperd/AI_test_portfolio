/* binairo.js — binary puzzle (Binairo / Takuzu) generation and solving core.
 *
 * Pure logic, no DOM: runs in the browser (as `BinairoLib`) and in Node
 * (`module.exports`) so the rules can be tested with `node test.js`.
 *
 * A grid is a plain array of `size * size` cells in row-major order holding
 * `0`, `1` or `EMPTY` (-1). Boards are square and even-sized, so every row and
 * column can hold exactly the same number of zeros and ones.
 *
 * The three rules of the puzzle, which the solver enforces directly:
 *
 *   1. every row and column holds equally many 0s and 1s;
 *   2. no three equal symbols sit next to each other in a row or column;
 *   3. no two rows are identical, and no two columns are identical.
 *
 * Rules 1 and 2 are local, so they can be *propagated*: a line that already
 * holds its quota of ones forces all its remaining cells to zero, and any two
 * touching equal symbols force their neighbours to the opposite value. Rule 3
 * is global — it can only be checked once a line is complete — so it is applied
 * as a contradiction test rather than as a deduction.
 */
(function (global) {
  'use strict';

  const EMPTY = -1;
  const SIZES = [6, 8, 10, 12];

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
  /* Geometry: the rows and columns of a size, built once and cached     */
  /* ------------------------------------------------------------------ */

  const LINES = {};

  function linesFor(size) {
    if (LINES[size]) return LINES[size];
    const rows = [];
    const cols = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(r * size + c);
      rows.push(row);
    }
    for (let c = 0; c < size; c++) {
      const col = [];
      for (let r = 0; r < size; r++) col.push(r * size + c);
      cols.push(col);
    }
    LINES[size] = { rows: rows, cols: cols, all: rows.concat(cols), half: size >> 1 };
    return LINES[size];
  }

  /* ------------------------------------------------------------------ */
  /* Grid helpers                                                       */
  /* ------------------------------------------------------------------ */

  function create(size) {
    return new Array(size * size).fill(EMPTY);
  }

  function clone(grid) {
    return Array.prototype.slice.call(grid);
  }

  function isComplete(grid) {
    for (let i = 0; i < grid.length; i++) if (grid[i] === EMPTY) return false;
    return true;
  }

  /** Parse a board; each line of text is a row, `.`/`-`/space means empty. */
  function parse(text) {
    const raw = String(text).trim().split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    const size = raw.length;
    if (SIZES.indexOf(size) === -1) {
      throw new Error('a binary puzzle needs 6, 8, 10 or 12 rows, got ' + size);
    }
    const grid = create(size);
    for (let r = 0; r < size; r++) {
      const chars = raw[r].replace(/[^01.\-]/g, '');
      if (chars.length !== size) {
        throw new Error('row ' + (r + 1) + ' needs exactly ' + size + ' cells');
      }
      for (let c = 0; c < size; c++) {
        const ch = chars[c];
        grid[r * size + c] = (ch === '.' || ch === '-') ? EMPTY : parseInt(ch, 10);
      }
    }
    return grid;
  }

  /** Render as one line of `0`, `1` and `.` per row. */
  function format(grid) {
    const size = Math.sqrt(grid.length) | 0;
    const rows = [];
    for (let r = 0; r < size; r++) {
      let line = '';
      for (let c = 0; c < size; c++) {
        const v = grid[r * size + c];
        line += v === EMPTY ? '.' : String(v);
      }
      rows.push(line);
    }
    return rows.join('\n');
  }

  function sizeOf(grid) {
    const n = Math.sqrt(grid.length);
    if (n !== Math.floor(n) || SIZES.indexOf(n) === -1) {
      throw new Error('a binary puzzle grid needs 36, 64, 100 or 144 cells, got ' + grid.length);
    }
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Rule 1 and 2: line propagation                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Apply rules 1 and 2 to one line in place until nothing more is forced.
   *
   * Returns false when the line is already contradictory (too many equal
   * symbols in one line, or three in a row), true otherwise.
   */
  function propagateLine(line, half) {
    const n = line.length;

    for (let round = 0; round <= n; round++) {
      let changed = false;
      let ones = 0;
      let zeros = 0;
      let empties = 0;
      for (let i = 0; i < n; i++) {
        if (line[i] === 1) ones++;
        else if (line[i] === 0) zeros++;
        else empties++;
      }

      if (ones > half || zeros > half) return false;

      // Rule 1: a line that has spent its quota forces the rest.
      if (empties > 0 && ones === half) {
        for (let i = 0; i < n; i++) if (line[i] === EMPTY) { line[i] = 0; changed = true; }
      } else if (empties > 0 && zeros === half) {
        for (let i = 0; i < n; i++) if (line[i] === EMPTY) { line[i] = 1; changed = true; }
      }

      // Rule 2: no three equal symbols in a row.
      for (let i = 0; i + 2 < n; i++) {
        const a = line[i];
        const b = line[i + 1];
        const c = line[i + 2];
        if (a !== EMPTY && a === b && b === c) return false;
        if (a !== EMPTY && a === b && c === EMPTY) { line[i + 2] = 1 - a; changed = true; }
        else if (a === EMPTY && b !== EMPTY && b === c) { line[i] = 1 - b; changed = true; }
        else if (a !== EMPTY && b === EMPTY && a === c) { line[i + 1] = 1 - a; changed = true; }
      }

      if (!changed) break;
    }

    return true;
  }

  /**
   * Propagate rules 1 and 2 across every row and column until stable.
   * Returns false as soon as the grid is contradictory.
   */
  function propagateGrid(grid, size) {
    const lines = linesFor(size).all;
    const half = size >> 1;
    const scratch = new Int8Array(size);
    let pass = 0;

    let changed = true;
    while (changed) {
      changed = false;
      if (++pass > size * 4) break;          // defence in depth; never loops
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        for (let i = 0; i < size; i++) scratch[i] = grid[line[i]];
        if (!propagateLine(scratch, half)) return false;
        for (let i = 0; i < size; i++) {
          if (scratch[i] !== grid[line[i]]) {
            grid[line[i]] = scratch[i];
            changed = true;
          }
        }
      }
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Rule 3: identical rows and columns                                 */
  /* ------------------------------------------------------------------ */

  /** Indices of the lines that duplicate an earlier, complete line. */
  function duplicateLines(grid, size) {
    const lines = linesFor(size);
    const bad = [];
    const kinds = [lines.rows, lines.cols];
    for (let k = 0; k < kinds.length; k++) {
      const group = kinds[k];
      const seen = [];
      for (let a = 0; a < group.length; a++) {
        let value = '';
        let complete = true;
        for (let i = 0; i < group[a].length; i++) {
          const v = grid[group[a][i]];
          if (v === EMPTY) { complete = false; break; }
          value += v;
        }
        if (!complete) continue;
        if (seen.indexOf(value) !== -1) bad.push(group[a][0]);
        else seen.push(value);
      }
    }
    return bad;
  }

  /* ------------------------------------------------------------------ */
  /* Validation                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Every rule violation present in a grid, as readable strings. An empty
   * array means the grid obeys the rules (it may still have gaps).
   */
  function validate(grid, size) {
    const n = size === undefined ? sizeOf(grid) : size;
    const half = n >> 1;
    const problems = [];
    const kinds = [['row', linesFor(n).rows], ['column', linesFor(n).cols]];

    for (let k = 0; k < kinds.length; k++) {
      const label = kinds[k][0];
      const group = kinds[k][1];
      for (let a = 0; a < group.length; a++) {
        const cells = group[a];
        let ones = 0;
        let zeros = 0;
        for (let i = 0; i < cells.length; i++) {
          if (grid[cells[i]] === 1) ones++;
          else if (grid[cells[i]] === 0) zeros++;
        }
        if (ones > half) problems.push(label + ' ' + (a + 1) + ' has ' + ones + ' ones, more than ' + half);
        if (zeros > half) problems.push(label + ' ' + (a + 1) + ' has ' + zeros + ' zeros, more than ' + half);
        for (let i = 0; i + 2 < cells.length; i++) {
          const v = grid[cells[i]];
          if (v !== EMPTY && v === grid[cells[i + 1]] && v === grid[cells[i + 2]]) {
            problems.push(label + ' ' + (a + 1) + ' has three ' + v + 's in a row from cell ' + (i + 1));
          }
        }
      }
    }

    const dupes = duplicateLines(grid, n);
    for (let i = 0; i < dupes.length; i++) {
      problems.push('two identical lines (cell ' + dupes[i] + ' starts a repeat)');
    }
    return problems;
  }

  /** True when every cell is filled and no rule is broken. */
  function isSolved(grid, size) {
    return isComplete(grid) && validate(grid, size).length === 0;
  }

  /** Cells that currently break a rule — what the interface highlights. */
  function conflicts(grid, size) {
    const n = size === undefined ? sizeOf(grid) : size;
    const bad = new Array(grid.length).fill(false);
    const groups = linesFor(n).all;
    const half = n >> 1;

    for (let a = 0; a < groups.length; a++) {
      const cells = groups[a];
      let ones = 0;
      let zeros = 0;
      for (let i = 0; i < cells.length; i++) {
        if (grid[cells[i]] === 1) ones++;
        else if (grid[cells[i]] === 0) zeros++;
      }
      if (ones > half || zeros > half) {
        for (let i = 0; i < cells.length; i++) bad[cells[i]] = true;
      }
      for (let i = 0; i + 2 < cells.length; i++) {
        const v = grid[cells[i]];
        if (v !== EMPTY && v === grid[cells[i + 1]] && v === grid[cells[i + 2]]) {
          bad[cells[i]] = true;
          bad[cells[i + 1]] = true;
          bad[cells[i + 2]] = true;
        }
      }
    }

    const dupes = duplicateLines(grid, n);
    for (let i = 0; i < dupes.length; i++) bad[dupes[i]] = true;

    const out = [];
    for (let i = 0; i < bad.length; i++) if (bad[i]) out.push(i);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* The search                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Backtracking search over a grid: propagate, then branch on an empty cell.
   *
   *   cap     stop after this many solutions (0 = stop at the first one)
   *   budget  stop after this many search nodes; `exact` goes false if it bites
   *
   * Returns { count, solution, exact, nodes }. A caller that needs uniqueness
   * must check `exact` — a budget-stopped count is only a lower bound.
   */
  function search(grid, cap, budget, size) {
    const n = size === undefined ? sizeOf(grid) : size;
    const work = Int8Array.from(grid);
    const limit = budget === undefined ? 40000 : budget;

    let count = 0;
    let solution = null;
    let nodes = 0;
    let exhausted = false;

    function recurse() {
      if (++nodes > limit) {
        exhausted = true;
        return;
      }
      if (!propagateGrid(work, n)) return;
      if (duplicateLines(work, n).length) return;

      // The most constrained empty cell is the one whose row and column have
      // the fewest gaps, which is where a wrong branch is cheapest to catch.
      let best = -1;
      let bestScore = -1;
      for (let i = 0; i < work.length; i++) {
        if (work[i] !== EMPTY) continue;
        const r = (i / n) | 0;
        const c = i % n;
        const score = filledNeighbours(work, n, r, c);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }

      if (best === -1) {
        count++;
        if (!solution) solution = Array.from(work);
        return;
      }

      for (let v = 0; v <= 1; v++) {
        const snapshot = work.slice();
        work[best] = v;
        recurse();
        work.set(snapshot);
        if (exhausted) return;
        if (cap && count >= cap) return;
      }
    }

    recurse();
    return { count: count, solution: solution, exact: !exhausted, nodes: nodes };
  }

  function filledNeighbours(grid, size, r, c) {
    let filled = 0;
    for (let i = 0; i < size; i++) {
      if (grid[r * size + i] !== EMPTY) filled++;
      if (grid[i * size + c] !== EMPTY) filled++;
    }
    return filled;
  }

  /**
   * Count solutions, stopping at `cap` (default 2). Returns { count, exact }.
   * See `search` for why `exact` matters.
   */
  function countSolutions(grid, cap, budget, size) {
    const res = search(grid, cap === undefined ? 2 : cap, budget, size);
    return { count: res.count, exact: res.exact };
  }

  /** Solve a grid, or return null when it has no solution. */
  function solve(grid, size) {
    const res = search(grid, 0, 40000, size);
    return res.solution;
  }

  /** True when the grid has exactly one solution. */
  function hasUniqueSolution(grid, budget, size) {
    const res = countSolutions(grid, 2, budget, size);
    return res.exact && res.count === 1;
  }

  /* ------------------------------------------------------------------ */
  /* Deductions, for stepping through a solve                           */
  /* ------------------------------------------------------------------ */

  /**
   * The next value that pure logic can place, or null when the grid is
   * complete. Rule 1 and 2 deductions are reported as `'line'`; when only
   * rule 3 can force a cell the technique is `'duplicate'`.
   *
   * Returns { index, value, technique, unit }.
   */
  function logicalStep(grid, size) {
    const n = size === undefined ? sizeOf(grid) : size;
    if (isComplete(grid)) return null;

    // Rules 1 and 2: propagate a copy and report the first cell it changed.
    const work = Int8Array.from(grid);
    if (propagateGrid(work, n)) {
      for (let i = 0; i < work.length; i++) {
        if (grid[i] === EMPTY && work[i] !== EMPTY) {
          return { index: i, value: work[i], technique: 'line', unit: 'line' };
        }
      }
    }

    return null;
  }

  /**
   * The next step towards `solution`: a deduction when one exists, otherwise
   * the value the solution calls for, labelled `'guess'`.
   */
  function nextStep(grid, solution, size) {
    const step = logicalStep(grid, size);
    if (step) return step;

    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === EMPTY) {
        return { index: i, value: solution[i], technique: 'guess', unit: 'cell' };
      }
    }
    return null;
  }

  /**
   * Solve a puzzle one step at a time and return the whole walkthrough.
   * Returns { solution, steps, techniques }.
   */
  function solveWithSteps(puzzle, size, maxSteps) {
    const n = size === undefined ? sizeOf(puzzle) : size;
    const solution = solve(puzzle, n);
    if (!solution) return { solution: null, steps: [], techniques: {} };

    const grid = clone(puzzle);
    const steps = [];
    const techniques = { line: 0, guess: 0 };
    const limit = maxSteps === undefined ? grid.length : maxSteps;

    for (let k = 0; k < limit; k++) {
      const step = nextStep(grid, solution, n);
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
    { id: 'easy', label: 'Easy', fill: 0.58 },
    { id: 'medium', label: 'Medium', fill: 0.44 },
    { id: 'hard', label: 'Hard', fill: 0.34 },
  ];

  function difficultyById(id) {
    for (let i = 0; i < DIFFICULTIES.length; i++) {
      if (DIFFICULTIES[i].id === id) return DIFFICULTIES[i];
    }
    return DIFFICULTIES[1];
  }

  /**
   * A complete board with no rule broken, grown by the seeded search.
   * Returns null if the node budget ran out before a board was found.
   */
  function fullBoard(rng, size, budget) {
    const n = size;
    const work = new Int8Array(n * n).fill(EMPTY);
    const limit = budget === undefined ? 20000 : budget;
    let nodes = 0;
    let done = false;

    function recurse() {
      if (++nodes > limit) return false;
      if (!propagateGrid(work, n)) return false;
      if (duplicateLines(work, n).length) return false;

      const empties = [];
      for (let i = 0; i < work.length; i++) if (work[i] === EMPTY) empties.push(i);
      if (!empties.length) { done = true; return true; }

      const idx = empties[(rng() * empties.length) | 0];
      const first = rng() < 0.5 ? 0 : 1;
      const order = first === 0 ? [0, 1] : [1, 0];

      for (let k = 0; k < 2; k++) {
        const snapshot = work.slice();
        work[idx] = order[k];
        if (recurse()) return true;
        work.set(snapshot);
        if (done) return true;
      }
      return false;
    }

    recurse();
    return done ? Array.from(work) : null;
  }

  /**
   * Generate a puzzle with exactly one solution.
   *
   * A full board is grown first (retrying with a derived seed if the search
   * budget runs out), then cells are removed in a seeded random order while the
   * puzzle still has exactly one answer. The `fill` fraction in each difficulty
   * is a target, not a promise: digging stops when a removal can no longer be
   * proven safe, so a puzzle may end up with more clues than the target.
   *
   * Returns { puzzle, solution, clues, size, difficulty, seed, attempts, restarts }.
   */
  function generate(seed, size, difficulty) {
    const n = SIZES.indexOf(size) === -1 ? 8 : size;
    const diff = typeof difficulty === 'string' ? difficultyById(difficulty) : difficulty;
    const fraction = diff ? diff.fill : 0.44;
    const target = Math.max(n, Math.round(n * n * fraction));

    let board = null;
    let restarts = 0;
    for (let attempt = 0; attempt < 6 && !board; attempt++) {
      board = fullBoard(makeRng((seed >>> 0) + attempt * 0x9e3779b9), n, 40000);
      if (!board) restarts++;
    }
    if (!board) return null;

    const puzzle = board.slice();
    const order = shuffle(
      Array.from({ length: n * n }, function (_, i) { return i; }),
      makeRng((seed >>> 0) ^ 0x85ebca6b)
    );

    let clues = n * n;
    let attempts = 0;

    for (let k = 0; k < order.length; k++) {
      if (clues <= target) break;
      const i = order[k];
      const keep = puzzle[i];
      puzzle[i] = EMPTY;
      attempts++;
      const res = countSolutions(puzzle, 2, 30000, n);
      if (res.exact && res.count === 1) clues--;
      else puzzle[i] = keep;
    }

    return {
      puzzle: puzzle,
      solution: board,
      clues: clues,
      size: n,
      difficulty: diff ? diff.id : 'medium',
      seed: seed >>> 0,
      attempts: attempts,
      restarts: restarts,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Exports                                                            */
  /* ------------------------------------------------------------------ */

  const BinairoLib = {
    EMPTY: EMPTY,
    SIZES: SIZES,
    DIFFICULTIES: DIFFICULTIES,
    makeRng: makeRng,
    create: create,
    clone: clone,
    sizeOf: sizeOf,
    parse: parse,
    format: format,
    isComplete: isComplete,
    isSolved: isSolved,
    validate: validate,
    conflicts: conflicts,
    duplicateLines: duplicateLines,
    propagateLine: propagateLine,
    propagateGrid: propagateGrid,
    countSolutions: countSolutions,
    hasUniqueSolution: hasUniqueSolution,
    solve: solve,
    solveWithSteps: solveWithSteps,
    logicalStep: logicalStep,
    nextStep: nextStep,
    fullBoard: fullBoard,
    generate: generate,
  };

  global.BinairoLib = BinairoLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BinairoLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
