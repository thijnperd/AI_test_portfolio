/* test.js — executable specification for the logic-puzzle cores
 * (sudoku.js and binairo.js).
 *
 * Run with:  node test.js
 * No dependencies: uses Node's built-in assert only.
 *
 * The tests pin down the properties that make each core correct:
 *
 *   Sudoku  — geometry and candidate logic, conflict reporting, the solver
 *             reproducing a published answer, uniqueness counting, the naked
 *             single and hidden single deductions, and a generator whose output
 *             is uniquely solvable and reproducible from its seed.
 *   Binairo — the three rules (equal quotas, no three in a row, no duplicate
 *             lines) as both deductions and validation, the solver, uniqueness
 *             counting, and the same guarantees about generated boards.
 *
 * Two kinds of fixture are used. Hand-built grids isolate one rule at a time.
 * Seeded fixtures are the exact puzzle/solution strings `generate` produced for
 * a fixed seed, which locks the generators' reproducibility: if a change makes
 * them emit a different puzzle for the same seed, these tests fail.
 */
'use strict';

const assert = require('assert');
const SudokuLib = require('./sudoku.js');
const BinairoLib = require('./binairo.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (err) {
    failed++;
    console.log('FAIL  ' + name + '\n      ' + err.message);
  }
}

/* ------------------------------------------------------------------ */
/* Sudoku fixtures                                                    */
/* ------------------------------------------------------------------ */

// A classic 9x9 with a single solution, and the published answer for it.
const CLASSIC_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const CLASSIC_SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

// The same puzzle with `.` blanks, which is how `format` renders an empty cell:
// the string above uses `0`, so a round-trip through parse+format normalises.
const CLASSIC_DOTTED = CLASSIC_PUZZLE.replace(/0/g, '.');

const EXPERT_SEED = 20261007;
const EXPERT_PUZZLE =
  '.8.4....1.7.....5...5..34...........1..2....9..2.6.53.5......2.6.38..7..7....9..5';
const EXPERT_SOLUTION =
  '389475261471926853265183497836594172157238649942761538518347926693852714724619385';

/* ------------------------------------------------------------------ */
/* Sudoku: RNG and grid helpers                                       */
/* ------------------------------------------------------------------ */

test('sudoku makeRng is deterministic and stays in [0, 1)', function () {
  const a = SudokuLib.makeRng(7);
  const b = SudokuLib.makeRng(7);
  for (let i = 0; i < 200; i++) {
    const v = a();
    assert.ok(v >= 0 && v < 1, 'rng value out of range: ' + v);
    assert.strictEqual(v, b(), 'the same seed must give the same sequence');
  }
});

test('sudoku create() is 81 empty cells', function () {
  const grid = SudokuLib.create();
  assert.strictEqual(grid.length, 81);
  assert.strictEqual(SudokuLib.isComplete(grid), false);
  for (let i = 0; i < 81; i++) assert.strictEqual(grid[i], 0);
});

test('sudoku parse accepts . 0 and - as blanks and round-trips', function () {
  const grid = SudokuLib.parse(CLASSIC_PUZZLE);
  assert.strictEqual(grid.length, 81);
  assert.strictEqual(grid[0], 5);
  assert.strictEqual(grid[2], 0);
  assert.strictEqual(SudokuLib.format(grid), CLASSIC_DOTTED);

  const dashed = SudokuLib.parse(CLASSIC_PUZZLE.replace(/0/g, '-'));
  assert.strictEqual(SudokuLib.format(dashed), CLASSIC_DOTTED);
  assert.strictEqual(SudokuLib.format(SudokuLib.parse(CLASSIC_DOTTED)), CLASSIC_DOTTED);
});

test('sudoku parse rejects a puzzle that is not 81 cells', function () {
  assert.throws(function () { SudokuLib.parse('123'); }, /81 cells/);
});

test('sudoku parse tolerates newlines and padding so a grid can be pasted', function () {
  const rows = [];
  for (let r = 0; r < 9; r++) rows.push(CLASSIC_PUZZLE.slice(r * 9, r * 9 + 9));
  assert.strictEqual(SudokuLib.format(SudokuLib.parse(rows.join('\n'))), CLASSIC_DOTTED);

  // Padding and stray whitespace are ignored too.
  assert.strictEqual(SudokuLib.format(SudokuLib.parse(rows.join(' | '))), CLASSIC_DOTTED);
});

/* ------------------------------------------------------------------ */
/* Sudoku: candidates and conflicts                                   */
/* ------------------------------------------------------------------ */

test('sudoku candidatesFor lists what the row, column and box still allow', function () {
  // Row 0 = 1..8, so the last cell of the row can only be 9.
  const grid = SudokuLib.create();
  for (let v = 1; v <= 8; v++) grid[v - 1] = v;
  assert.deepStrictEqual(SudokuLib.candidatesFor(grid, 8), [9]);
});

test('sudoku candidatesFor excludes a value already used by a peer', function () {
  const grid = SudokuLib.create();
  grid[0] = 5;                    // (row 0, col 0)
  assert.ok(SudokuLib.candidatesFor(grid, 1).indexOf(5) === -1, 'same row');
  assert.ok(SudokuLib.candidatesFor(grid, 9).indexOf(5) === -1, 'same column');
  assert.ok(SudokuLib.candidatesFor(grid, 10).indexOf(5) === -1, 'same box');
  assert.ok(SudokuLib.candidatesFor(grid, 80).indexOf(5) !== -1, 'unrelated cell keeps 5');
});

test('sudoku candidatesFor returns [] for a filled cell', function () {
  const grid = SudokuLib.create();
  grid[40] = 4;
  assert.deepStrictEqual(SudokuLib.candidatesFor(grid, 40), []);
});

test('sudoku conflicts locates a repeated value in a row, column and box', function () {
  const row = SudokuLib.create();
  row[0] = 3;
  row[5] = 3;
  assert.deepStrictEqual(SudokuLib.conflicts(row).sort(function (a, b) { return a - b; }), [0, 5]);

  const col = SudokuLib.create();
  col[2] = 7;
  col[2 + 27] = 7;
  assert.deepStrictEqual(SudokuLib.conflicts(col).sort(function (a, b) { return a - b; }), [2, 29]);

  const box = SudokuLib.create();
  box[0] = 9;
  box[10] = 9;
  assert.deepStrictEqual(SudokuLib.conflicts(box).sort(function (a, b) { return a - b; }), [0, 10]);

  assert.deepStrictEqual(SudokuLib.conflicts(SudokuLib.create()), [], 'empty grid has no conflict');
});

test('sudoku conflicts is silent on a legal partial grid', function () {
  const grid = SudokuLib.parse(CLASSIC_PUZZLE);
  assert.deepStrictEqual(SudokuLib.conflicts(grid), []);
});

/* ------------------------------------------------------------------ */
/* Sudoku: solving and counting                                       */
/* ------------------------------------------------------------------ */

test('sudoku solve reproduces the published answer for a classic puzzle', function () {
  const solved = SudokuLib.solve(SudokuLib.parse(CLASSIC_PUZZLE));
  assert.ok(solved, 'the classic puzzle is solvable');
  assert.strictEqual(SudokuLib.format(solved), CLASSIC_SOLUTION);
  assert.strictEqual(SudokuLib.isComplete(solved), true);
  assert.deepStrictEqual(SudokuLib.conflicts(solved), []);
});

test('sudoku countSolutions reports exactly one solution for the classic puzzle', function () {
  const res = SudokuLib.countSolutions(SudokuLib.parse(CLASSIC_PUZZLE), 2);
  assert.strictEqual(res.count, 1);
  assert.strictEqual(res.exact, true);
  assert.strictEqual(SudokuLib.hasUniqueSolution(SudokuLib.parse(CLASSIC_PUZZLE)), true);
});

test('sudoku countSolutions reports more than one for an empty grid', function () {
  const res = SudokuLib.countSolutions(SudokuLib.create(), 2);
  assert.strictEqual(res.count, 2, 'the cap stops the count at two');
  assert.strictEqual(SudokuLib.hasUniqueSolution(SudokuLib.create()), false);
});

test('sudoku countSolutions reports zero for a grid with a repeated given', function () {
  const grid = SudokuLib.parse(CLASSIC_PUZZLE);
  grid[1] = 5;                    // 5 already sits in cell 0 of the same row
  const res = SudokuLib.countSolutions(grid, 2);
  assert.strictEqual(res.count, 0);
  assert.strictEqual(SudokuLib.solve(grid), null);
});

test('sudoku solve returns null when the puzzle has no answer', function () {
  const grid = SudokuLib.create();
  grid[0] = 1;
  grid[1] = 1;                    // two 1s in row 0
  assert.strictEqual(SudokuLib.solve(grid), null);
});

/* ------------------------------------------------------------------ */
/* Sudoku: deductions                                                 */
/* ------------------------------------------------------------------ */

test('sudoku logicalStep finds a naked single', function () {
  const grid = SudokuLib.create();
  for (let v = 1; v <= 8; v++) grid[v - 1] = v;   // row 0 holds 1..8
  const step = SudokuLib.logicalStep(grid);
  assert.deepStrictEqual(step, { index: 8, value: 9, technique: 'naked', unit: 'cell' });
});

test('sudoku logicalStep finds a hidden single when no naked single exists', function () {
  // Row 0 holds 1..6 and is missing 7, 8 and 9. A 7 in column 6 and another in
  // column 8 leave 7 with exactly one home in the row — and the cell still has
  // three candidates, so only the hidden-single scan can find it.
  const grid = SudokuLib.create();
  for (let v = 1; v <= 6; v++) grid[v - 1] = v;
  grid[5 * 9 + 6] = 7;            // column 6
  grid[7 * 9 + 8] = 7;            // column 8

  assert.deepStrictEqual(SudokuLib.candidatesFor(grid, 6), [8, 9]);
  assert.deepStrictEqual(SudokuLib.candidatesFor(grid, 7), [7, 8, 9]);
  assert.deepStrictEqual(SudokuLib.candidatesFor(grid, 8), [8, 9]);

  const step = SudokuLib.logicalStep(grid);
  assert.deepStrictEqual(step, { index: 7, value: 7, technique: 'hidden', unit: 'row' });
});

test('sudoku logicalStep returns null once the grid is complete', function () {
  const solved = SudokuLib.solve(SudokuLib.parse(CLASSIC_PUZZLE));
  assert.strictEqual(SudokuLib.logicalStep(solved), null);
});

test('sudoku nextStep falls back to a guess, taking the value from the solution', function () {
  const solution = SudokuLib.solve(SudokuLib.parse(CLASSIC_PUZZLE));
  const step = SudokuLib.nextStep(SudokuLib.create(), solution);
  assert.strictEqual(step.technique, 'guess', 'an empty grid gives logic nothing to work with');
  assert.strictEqual(step.index, 0);
  assert.strictEqual(step.value, solution[0]);
});

test('sudoku nextStep returns null when the grid already matches the solution', function () {
  const solution = SudokuLib.solve(SudokuLib.parse(CLASSIC_PUZZLE));
  assert.strictEqual(SudokuLib.nextStep(solution, solution), null);
});

test('sudoku solveWithSteps re-derives the solution and fills every blank', function () {
  const puzzle = SudokuLib.parse(CLASSIC_PUZZLE);
  const walk = SudokuLib.solveWithSteps(puzzle);
  assert.strictEqual(SudokuLib.format(walk.solution), CLASSIC_SOLUTION);

  const blanks = puzzle.filter(function (v) { return v === 0; }).length;
  assert.strictEqual(walk.steps.length, blanks, 'one step per empty cell');

  const tally = walk.techniques.naked + walk.techniques.hidden + walk.techniques.guess;
  assert.strictEqual(tally, walk.steps.length, 'every step is counted in the tally');

  // Replaying the steps from the puzzle must land on the solution.
  const grid = puzzle.slice();
  for (let i = 0; i < walk.steps.length; i++) {
    const step = walk.steps[i];
    assert.strictEqual(grid[step.index], 0, 'a step never overwrites a filled cell');
    grid[step.index] = step.value;
  }
  assert.strictEqual(SudokuLib.format(grid), CLASSIC_SOLUTION);
});

/* ------------------------------------------------------------------ */
/* Sudoku: generation                                                 */
/* ------------------------------------------------------------------ */

test('sudoku fullGrid is complete and conflict-free', function () {
  for (let seed = 0; seed < 5; seed++) {
    const grid = SudokuLib.fullGrid(SudokuLib.makeRng(seed));
    assert.strictEqual(SudokuLib.isComplete(grid), true);
    assert.deepStrictEqual(SudokuLib.conflicts(grid), []);
  }
});

test('sudoku generate yields a uniquely solvable puzzle at every difficulty', function () {
  const diffs = SudokuLib.DIFFICULTIES;
  for (let d = 0; d < diffs.length; d++) {
    const game = SudokuLib.generate(20261007, diffs[d].id);
    assert.strictEqual(game.difficulty, diffs[d].id);
    assert.strictEqual(game.clues, game.puzzle.filter(function (v) { return v !== 0; }).length);
    assert.strictEqual(SudokuLib.isComplete(game.puzzle), false, diffs[d].id + ' leaves blanks');
    assert.deepStrictEqual(SudokuLib.conflicts(game.puzzle), [],
      diffs[d].id + ' puzzle must not already contain a clash');

    const res = SudokuLib.countSolutions(game.puzzle, 2);
    assert.ok(res.exact, diffs[d].id + ' uniqueness check must be exact');
    assert.strictEqual(res.count, 1, diffs[d].id + ' must have exactly one solution');

    const solved = SudokuLib.solve(game.puzzle);
    assert.strictEqual(SudokuLib.format(solved), SudokuLib.format(game.solution));
  }
});

test('sudoku generate keeps the puzzle a subset of its solution', function () {
  const game = SudokuLib.generate(4242, 'hard');
  for (let i = 0; i < 81; i++) {
    if (game.puzzle[i] !== 0) {
      assert.strictEqual(game.puzzle[i], game.solution[i], 'given at ' + i + ' must match the answer');
    }
  }
});

test('sudoku generate digs to the requested clue count without going under it', function () {
  const diffs = SudokuLib.DIFFICULTIES;
  for (let d = 0; d < diffs.length; d++) {
    const game = SudokuLib.generate(1234, diffs[d].id);
    assert.ok(game.clues >= diffs[d].clues,
      diffs[d].id + ' asked for ' + diffs[d].clues + ' clues, got ' + game.clues);
  }
});

test('sudoku generate is reproducible from its seed and varies by seed', function () {
  const a = SudokuLib.generate(999, 'medium');
  const b = SudokuLib.generate(999, 'medium');
  const c = SudokuLib.generate(1000, 'medium');
  assert.strictEqual(SudokuLib.format(a.puzzle), SudokuLib.format(b.puzzle));
  assert.strictEqual(SudokuLib.format(a.solution), SudokuLib.format(b.solution));
  assert.notStrictEqual(SudokuLib.format(a.puzzle), SudokuLib.format(c.puzzle));
});

test('sudoku generate still produces the seeded expert fixture', function () {
  const game = SudokuLib.generate(EXPERT_SEED, 'expert');
  assert.strictEqual(SudokuLib.format(game.puzzle), EXPERT_PUZZLE);
  assert.strictEqual(SudokuLib.format(game.solution), EXPERT_SOLUTION);
});

test('sudoku a generated puzzle survives a full solve-with-steps walk', function () {
  const game = SudokuLib.generate(31337, 'expert');
  const walk = SudokuLib.solveWithSteps(game.puzzle);
  assert.strictEqual(SudokuLib.format(walk.solution), SudokuLib.format(game.solution));
  assert.strictEqual(walk.steps.length, game.clues === 81 ? 0 : 81 - game.clues);
});

/* ------------------------------------------------------------------ */
/* Binairo fixtures                                                   */
/* ------------------------------------------------------------------ */

const BIN_FIXTURES = [
  {
    size: 6,
    difficulty: 'medium',
    clues: 16,
    puzzle: '..1..0\n.1..10\n0.11..\n...10.\n001..1\n.0...1',
    solution: '011010\n110010\n001101\n110100\n001011\n100101',
  },
  {
    size: 8,
    difficulty: 'medium',
    clues: 28,
    puzzle: '....0...\n0.01.0.1\n0...10.1\n.10.1...\n.101..1.\n..11..01\n0...11..\n..101..0',
    solution: '10110100\n01010011\n00101011\n11001100\n11010010\n00110101\n01001101\n10101010',
  },
  {
    size: 10,
    difficulty: 'hard',
    clues: 34,
    puzzle: [
      '..0.1..1..',
      '...0.01...',
      '00.1...1..',
      '1.0....0..',
      '..1..0.10.',
      '10..1...0.',
      '1..1.....0',
      '...0..11..',
      '0.0..01...',
      '.1...1...0',
    ].join('\n'),
    solution: [
      '0100110110',
      '1010101010',
      '0011010101',
      '1100110010',
      '0011001101',
      '1010101001',
      '1101010010',
      '0010101101',
      '0101001011',
      '1101010100',
    ].join('\n'),
  },
];

const BIN_SEED = 20261007;

/* ------------------------------------------------------------------ */
/* Binairo: RNG, parsing and the rules                                */
/* ------------------------------------------------------------------ */

test('binairo makeRng is deterministic and stays in [0, 1)', function () {
  const a = BinairoLib.makeRng(11);
  const b = BinairoLib.makeRng(11);
  for (let i = 0; i < 200; i++) {
    const v = a();
    assert.ok(v >= 0 && v < 1, 'rng value out of range: ' + v);
    assert.strictEqual(v, b(), 'the same seed must give the same sequence');
  }
});

test('binairo create() fills a board with EMPTY', function () {
  const grid = BinairoLib.create(8);
  assert.strictEqual(grid.length, 64);
  assert.strictEqual(BinairoLib.isComplete(grid), false);
  for (let i = 0; i < grid.length; i++) assert.strictEqual(grid[i], BinairoLib.EMPTY);
});

test('binairo parse and format round-trip every fixture', function () {
  for (let f = 0; f < BIN_FIXTURES.length; f++) {
    const fixture = BIN_FIXTURES[f];
    const grid = BinairoLib.parse(fixture.puzzle);
    assert.strictEqual(grid.length, fixture.size * fixture.size);
    assert.strictEqual(BinairoLib.format(grid), fixture.puzzle);
  }
});

test('binairo parse rejects a size that cannot be balanced', function () {
  assert.throws(function () { BinairoLib.parse('01\n10\n'); }, /6, 8, 10 or 12 rows/);
});

test('binairo propagateLine forces the opposite after a touching pair', function () {
  // Two 1s at the start of a line: the cell after them can no longer be 1.
  const line = new Int8Array([1, 1, 0, 0, 0, 0, 0, 0].map(function (v) { return v === 0 ? -1 : v; }));
  line[0] = 1;
  line[1] = 1;
  assert.strictEqual(BinairoLib.propagateLine(line, 4), true);
  assert.strictEqual(line[2], 0, 'a third 1 is impossible, so the cell must be 0');
});

test('binairo propagateLine finds the gap in a sandwich on its own', function () {
  // 1 . 1 leaves the middle cell no choice.
  const line = new Int8Array([1, -1, 1, -1, -1, -1, -1, -1]);
  assert.strictEqual(BinairoLib.propagateLine(line, 4), true);
  assert.strictEqual(line[1], 0);
});

test('binairo propagateLine rejects three equal symbols in a row', function () {
  const line = new Int8Array([1, 1, 1, -1, -1, -1, -1, -1]);
  assert.strictEqual(BinairoLib.propagateLine(line, 4), false);
});

test('binairo propagateLine fills the remainder once a line has its quota', function () {
  // Four 1s in a line of eight spends the quota, so every gap becomes 0.
  const line = new Int8Array([1, -1, 1, -1, 1, -1, 1, -1]);
  assert.strictEqual(BinairoLib.propagateLine(line, 4), true);
  for (let i = 1; i < 8; i += 2) assert.strictEqual(line[i], 0, 'gap ' + i + ' must be 0');
});

test('binairo propagateLine rejects a line over quota', function () {
  const line = new Int8Array([1, 1, 0, 1, 1, 0, -1, -1]);
  assert.strictEqual(BinairoLib.propagateLine(line, 4), false, 'five 1s cannot be balanced');
});

test('binairo propagateGrid carries a forced value from a row into a column', function () {
  const grid = BinairoLib.create(6);
  // Row 0 = 1 1 ? — the pair forces the third cell to 0, spending two of the
  // three zeros, which is enough for propagation to reach other lines.
  grid[0] = 1;
  grid[1] = 1;
  assert.strictEqual(BinairoLib.propagateGrid(grid, 6), true);
  assert.strictEqual(grid[2], 0, 'the pair forces 0 next to it');
});

test('binairo validate reports a triple and an over-quota line', function () {
  // Three 1s fill the quota exactly (half of six) and are caught by rule 2;
  // a fourth overflows the quota and is caught by rule 1.
  const grid = BinairoLib.create(6);
  grid[0] = 1;
  grid[1] = 1;
  grid[2] = 1;
  const quota = BinairoLib.validate(grid, 6);
  assert.ok(quota.some(function (p) { return /three 1s/.test(p); }), 'a triple is reported');
  assert.ok(!quota.some(function (p) { return /more than 3/.test(p); }),
    'three of six is exactly the quota, not an overflow');

  grid[3] = 1;
  const problems = BinairoLib.validate(grid, 6);
  assert.ok(problems.some(function (p) { return /three 1s/.test(p); }), 'the triple is still reported');
  assert.ok(problems.some(function (p) { return /more than 3/.test(p); }), 'the overflow is reported');

  assert.deepStrictEqual(BinairoLib.validate(BinairoLib.create(6), 6), [],
    'an empty board breaks no rule');
});

test('binairo validate reports two identical complete rows', function () {
  const grid = BinairoLib.parse('010101\n101010\n010101\n101010\n010101\n101010');
  const problems = BinairoLib.validate(grid, 6);
  assert.ok(problems.some(function (p) { return /identical/.test(p); }), 'duplicate rows are reported');
  assert.strictEqual(BinairoLib.isSolved(grid, 6), false);
});

test('binairo duplicateLines finds the repeated row', function () {
  const grid = BinairoLib.parse('010101\n101010\n010101\n101010\n010101\n101010');
  const dupes = BinairoLib.duplicateLines(grid, 6);
  assert.ok(dupes.length > 0, 'a repeat is found');
});

test('binairo conflicts flags the cells of a triple', function () {
  const grid = BinairoLib.create(6);
  grid[0] = 1;
  grid[1] = 1;
  grid[2] = 1;
  const bad = BinairoLib.conflicts(grid, 6);
  [0, 1, 2].forEach(function (i) {
    assert.ok(bad.indexOf(i) !== -1, 'cell ' + i + ' belongs to the triple');
  });
});

/* ------------------------------------------------------------------ */
/* Binairo: solving and counting                                      */
/* ------------------------------------------------------------------ */

test('binairo isSolved accepts every generated solution', function () {
  for (let f = 0; f < BIN_FIXTURES.length; f++) {
    const fixture = BIN_FIXTURES[f];
    const grid = BinairoLib.parse(fixture.solution);
    assert.strictEqual(BinairoLib.isSolved(grid, fixture.size), true,
      'the ' + fixture.size + 'x' + fixture.size + ' solution is valid');
    assert.strictEqual(BinairoLib.isSolved(BinairoLib.parse(fixture.puzzle), fixture.size), false,
      'the puzzle itself still has gaps');
  }
});

test('binairo solve solves every fixture to its published answer', function () {
  for (let f = 0; f < BIN_FIXTURES.length; f++) {
    const fixture = BIN_FIXTURES[f];
    const solved = BinairoLib.solve(BinairoLib.parse(fixture.puzzle), fixture.size);
    assert.ok(solved, 'the ' + fixture.size + 'x' + fixture.size + ' puzzle is solvable');
    assert.strictEqual(BinairoLib.format(solved), fixture.solution);
  }
});

test('binairo countSolutions reports exactly one solution per fixture', function () {
  for (let f = 0; f < BIN_FIXTURES.length; f++) {
    const fixture = BIN_FIXTURES[f];
    const res = BinairoLib.countSolutions(BinairoLib.parse(fixture.puzzle), 2, 400000, fixture.size);
    assert.strictEqual(res.exact, true, fixture.size + ' uniqueness must be exact');
    assert.strictEqual(res.count, 1, fixture.size + ' must have exactly one solution');
  }
});

test('binairo countSolutions caps at two on an empty board', function () {
  const res = BinairoLib.countSolutions(BinairoLib.create(6), 2, 400000, 6);
  assert.strictEqual(res.count, 2);
  assert.strictEqual(BinairoLib.hasUniqueSolution(BinairoLib.create(6), 400000, 6), false);
});

test('binairo solve returns null for a contradictory board', function () {
  const grid = BinairoLib.create(6);
  grid[0] = 1;
  grid[1] = 1;
  grid[2] = 1;                    // three in a row can never be repaired
  assert.strictEqual(BinairoLib.solve(grid, 6), null);
});

test('binairo fullBoard produces a complete, valid board at every size', function () {
  for (let s = 0; s < BinairoLib.SIZES.length; s++) {
    const size = BinairoLib.SIZES[s];
    const board = BinairoLib.fullBoard(BinairoLib.makeRng(size * 31 + 7), size);
    assert.ok(board, size + 'x' + size + ' board was generated');
    assert.strictEqual(BinairoLib.isSolved(board, size), true,
      size + 'x' + size + ' board obeys all three rules: ' +
      BinairoLib.validate(board, size).join('; '));
  }
});

/* ------------------------------------------------------------------ */
/* Binairo: deductions                                                */
/* ------------------------------------------------------------------ */

test('binairo logicalStep reports a line deduction as a forced value', function () {
  const grid = BinairoLib.create(6);
  grid[0] = 1;
  grid[1] = 1;
  const step = BinairoLib.logicalStep(grid, 6);
  assert.strictEqual(step.technique, 'line');
  assert.strictEqual(step.index, 2);
  assert.strictEqual(step.value, 0);
});

test('binairo nextStep guesses once the rules force nothing', function () {
  const fixture = BIN_FIXTURES[0];
  const solution = BinairoLib.parse(fixture.solution);
  const step = BinairoLib.nextStep(BinairoLib.create(6), solution, 6);
  assert.strictEqual(step.technique, 'guess', 'an empty board forces nothing');
  assert.strictEqual(step.index, 0);
  assert.strictEqual(step.value, solution[0]);
});

test('binairo nextStep returns null when the grid is already the solution', function () {
  const solution = BinairoLib.parse(BIN_FIXTURES[0].solution);
  assert.strictEqual(BinairoLib.nextStep(solution, solution, 6), null);
});

test('binairo solveWithSteps re-derives the solution for every fixture', function () {
  for (let f = 0; f < BIN_FIXTURES.length; f++) {
    const fixture = BIN_FIXTURES[f];
    const puzzle = BinairoLib.parse(fixture.puzzle);
    const walk = BinairoLib.solveWithSteps(puzzle, fixture.size);
    assert.strictEqual(BinairoLib.format(walk.solution), fixture.solution);

    const blanks = puzzle.filter(function (v) { return v === BinairoLib.EMPTY; }).length;
    assert.strictEqual(walk.steps.length, blanks, 'one step per empty cell');
    assert.strictEqual(walk.techniques.line + walk.techniques.guess, walk.steps.length);

    const grid = puzzle.slice();
    for (let i = 0; i < walk.steps.length; i++) {
      const step = walk.steps[i];
      assert.strictEqual(grid[step.index], BinairoLib.EMPTY, 'a step never overwrites a filled cell');
      grid[step.index] = step.value;
    }
    assert.strictEqual(BinairoLib.isSolved(grid, fixture.size), true, 'the walk lands on a valid board');
  }
});

/* ------------------------------------------------------------------ */
/* Binairo: generation                                                */
/* ------------------------------------------------------------------ */

test('binairo generate yields a uniquely solvable puzzle at every size', function () {
  for (let s = 0; s < BinairoLib.SIZES.length; s++) {
    const size = BinairoLib.SIZES[s];
    for (let d = 0; d < BinairoLib.DIFFICULTIES.length; d++) {
      const diff = BinairoLib.DIFFICULTIES[d];
      const game = BinairoLib.generate(BIN_SEED, size, diff.id);
      assert.ok(game, size + 'x' + size + ' ' + diff.id + ' was generated');
      assert.strictEqual(game.size, size);
      assert.strictEqual(game.difficulty, diff.id);
      assert.strictEqual(game.clues, game.puzzle.filter(function (v) { return v !== BinairoLib.EMPTY; }).length);
      assert.strictEqual(BinairoLib.isSolved(game.solution, size), true,
        size + 'x' + size + ' solution obeys the rules');

      const res = BinairoLib.countSolutions(game.puzzle, 2, 400000, size);
      assert.ok(res.exact, size + ' ' + diff.id + ' uniqueness must be exact');
      assert.strictEqual(res.count, 1, size + ' ' + diff.id + ' must have exactly one solution');

      const solved = BinairoLib.solve(game.puzzle, size);
      assert.strictEqual(BinairoLib.format(solved), BinairoLib.format(game.solution));
    }
  }
});

test('binairo generate honours its difficulty target without going under it', function () {
  for (let d = 0; d < BinairoLib.DIFFICULTIES.length; d++) {
    const diff = BinairoLib.DIFFICULTIES[d];
    const size = 8;
    const target = Math.round(size * size * diff.fill);
    const game = BinairoLib.generate(555, size, diff.id);
    assert.ok(game.clues >= target,
      diff.id + ' asked for at least ' + target + ' clues, got ' + game.clues);
  }
});

test('binairo generate is reproducible from its seed and varies by seed', function () {
  const a = BinairoLib.generate(88, 8, 'medium');
  const b = BinairoLib.generate(88, 8, 'medium');
  const c = BinairoLib.generate(89, 8, 'medium');
  assert.strictEqual(BinairoLib.format(a.puzzle), BinairoLib.format(b.puzzle));
  assert.strictEqual(BinairoLib.format(a.solution), BinairoLib.format(b.solution));
  assert.notStrictEqual(BinairoLib.format(a.puzzle), BinairoLib.format(c.puzzle));
});

test('binairo generate still produces the seeded fixtures', function () {
  for (let f = 0; f < BIN_FIXTURES.length; f++) {
    const fixture = BIN_FIXTURES[f];
    const game = BinairoLib.generate(BIN_SEED, fixture.size, fixture.difficulty);
    assert.ok(game, fixture.size + 'x' + fixture.size + ' was generated');
    assert.strictEqual(game.clues, fixture.clues, 'clue count for the ' + fixture.size + ' fixture');
    assert.strictEqual(BinairoLib.format(game.puzzle), fixture.puzzle);
    assert.strictEqual(BinairoLib.format(game.solution), fixture.solution);
  }
});

test('binairo a generated hard board survives a full solve-with-steps walk', function () {
  const game = BinairoLib.generate(2468, 10, 'hard');
  const walk = BinairoLib.solveWithSteps(game.puzzle, 10);
  assert.strictEqual(BinairoLib.format(walk.solution), BinairoLib.format(game.solution));
  assert.strictEqual(BinairoLib.isSolved(walk.solution, 10), true);
});

/* ------------------------------------------------------------------ */

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
