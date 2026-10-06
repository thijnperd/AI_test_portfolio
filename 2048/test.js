/* test.js — executable specification for the 2048 core (game.js).
 *
 * Run with:  node test.js
 * No dependencies: uses Node's built-in assert only.
 *
 * The tests pin down the sliding/merging rules in every direction, the
 * one-merge-per-tile rule, tile spawning, and game-over detection.
 */
'use strict';

const assert = require('assert');
const GameLib = require('./game.js');

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

function game(seed) {
  return new GameLib.Game({ size: 4, seed: seed || 1 });
}

function nonZero(grid) {
  let n = 0;
  for (const row of grid) for (const v of row) if (v !== 0) n++;
  return n;
}

const ZERO4 = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];

/* ------------------------------------------------------------------ */

test('slideLine merges a single pair', function () {
  const r = GameLib.slideLine([2, 2, 0, 0]);
  assert.deepStrictEqual(r.line, [4, 0, 0, 0]);
  assert.strictEqual(r.gained, 4);
});

test('slideLine never merges a tile twice in one move', function () {
  const r = GameLib.slideLine([2, 2, 2, 2]);
  assert.deepStrictEqual(r.line, [4, 4, 0, 0]);
  assert.strictEqual(r.gained, 8);
});

test('slideLine stops a merged tile from merging again', function () {
  const r = GameLib.slideLine([4, 4, 8, 0]);
  assert.deepStrictEqual(r.line, [8, 8, 0, 0]);
  assert.strictEqual(r.gained, 8);
});

test('slideLine leaves unequal neighbours alone and slides values', function () {
  assert.deepStrictEqual(GameLib.slideLine([2, 4, 2, 4]).line, [2, 4, 2, 4]);
  assert.deepStrictEqual(GameLib.slideLine([0, 2, 0, 4]).line, [2, 4, 0, 0]);
  assert.deepStrictEqual(GameLib.slideLine([0, 0, 0, 2]).line, [2, 0, 0, 0]);
});

test('a new game starts with exactly two tiles', function () {
  const g = game(1);
  assert.strictEqual(nonZero(g.grid), 2);
  assert.strictEqual(g.score, 0);
  for (const row of g.grid) {
    for (const v of row) assert.ok(v === 0 || v === 2 || v === 4, 'unexpected start tile ' + v);
  }
});

test('load rejects a board of the wrong size', function () {
  const g = game(1);
  assert.throws(function () { g.load([[0, 0, 0]]); }, /4x4/);
});

test('move left merges and adds score', function () {
  const g = game(1);
  g.load([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r = g.move('left');
  assert.strictEqual(r.moved, true);
  assert.strictEqual(r.gained, 4);
  assert.strictEqual(g.grid[0][0], 4);
  assert.strictEqual(g.score, 4);
  assert.ok(g.lastMerged.some(function (c) { return c[0] === 0 && c[1] === 0; }), 'merge recorded');
  assert.ok(g.lastSpawned, 'a tile spawned after the move');
});

test('move right slides toward the right edge', function () {
  const g = game(1);
  g.load([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  g.move('right');
  assert.strictEqual(g.grid[0][3], 4);
});

test('move up slides a column toward the top', function () {
  const g = game(1);
  g.load([[0, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0]]);
  g.move('up');
  assert.strictEqual(g.grid[0][0], 4);
});

test('move down slides a column toward the bottom', function () {
  const g = game(1);
  g.load([[2, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  g.move('down');
  assert.strictEqual(g.grid[3][0], 4);
});

test('a move with no change is a no-op and spawns nothing', function () {
  const board = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  const g = game(1);
  g.load(board);
  const before = JSON.stringify(g.grid);
  const r = g.move('left');
  assert.strictEqual(r.moved, false);
  assert.strictEqual(r.gained, 0);
  assert.strictEqual(JSON.stringify(g.grid), before, 'the board must not change');
  assert.strictEqual(nonZero(g.grid), 16, 'no tile should spawn');
});

test('unknown directions are rejected', function () {
  const g = game(1);
  assert.throws(function () { g.move('diagonal'); }, /Unknown direction/);
});

test('addRandomTile is deterministic and places a 2 or 4 on an empty cell', function () {
  const a = game(7);
  const b = game(7);
  a.load(ZERO4);
  b.load(ZERO4);
  a.addRandomTile();
  b.addRandomTile();
  assert.deepStrictEqual(a.grid, b.grid);
  assert.strictEqual(nonZero(a.grid), 1);
  const value = a.grid.flat().find(function (v) { return v !== 0; });
  assert.ok(value === 2 || value === 4, 'new tile must be 2 or 4');
});

test('canMove is true while a merge or an empty cell exists', function () {
  const open = game(1);
  open.load([[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.strictEqual(open.canMove(), true, 'an empty cell allows a move');

  const mergeable = game(1);
  mergeable.load([[2, 2, 4, 4], [8, 16, 32, 64], [128, 256, 512, 1024], [2, 4, 8, 16]]);
  assert.strictEqual(mergeable.canMove(), true, 'an equal pair allows a move');
});

test('a full board with no matches is game over', function () {
  const g = game(1);
  g.load([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  assert.strictEqual(g.canMove(), false);
  assert.strictEqual(g.isGameOver(), true);
});

test('reaching 2048 wins and updates the max tile', function () {
  const g = game(1);
  g.load([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  g.move('left');
  assert.strictEqual(g.maxTile(), 2048);
  assert.strictEqual(g.won, true);
});

test('score accumulates across moves', function () {
  const g = game(1);
  g.load([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  g.move('left'); // +8
  assert.strictEqual(g.score, 8);
});

/* ------------------------------------------------------------------ */
/* progression: milestones, wins, and the reason to keep playing       */
/* ------------------------------------------------------------------ */

test('MILESTONES ascend and include the announced goal', function () {
  const m = GameLib.MILESTONES;
  assert.ok(m.length >= 6, 'the ladder should have real rungs');
  for (let i = 1; i < m.length; i++) {
    assert.ok(m[i].value > m[i - 1].value, 'milestones must ascend');
  }
  assert.ok(m.some(function (r) { return r.value === GameLib.WIN_VALUE; }), '2048 is on the ladder');
  for (const rung of m) {
    assert.ok(rung.label, 'rung ' + rung.value + ' needs a label');
    assert.strictEqual(rung.value & (rung.value - 1), 0, 'rungs are powers of two');
  }
});

test('milestonesUpTo and nextMilestone walk the ladder', function () {
  assert.deepStrictEqual(GameLib.milestonesUpTo(0), []);
  assert.deepStrictEqual(
    GameLib.milestonesUpTo(64).map(function (m) { return m.value; }),
    [64],
    'the first rung is reached at exactly 64'
  );
  assert.deepStrictEqual(
    GameLib.milestonesUpTo(2048).map(function (m) { return m.value; }),
    [64, 128, 256, 512, 1024, 2048]
  );
  assert.strictEqual(GameLib.nextMilestone(0).value, 64);
  assert.strictEqual(GameLib.nextMilestone(64).value, 128, 'the next rung after 64 is 128');
  assert.strictEqual(GameLib.nextMilestone(2048).value, 4096, 'the ladder keeps going past the goal');
  assert.strictEqual(
    GameLib.nextMilestone(GameLib.MILESTONES[GameLib.MILESTONES.length - 1].value),
    null,
    'nothing is left above the top rung'
  );
});

test('a fresh game has no achievements, no moves, and nothing to celebrate', function () {
  const g = game(3);
  assert.deepStrictEqual(g.achievements, []);
  assert.strictEqual(g.moveCount, 0);
  assert.strictEqual(g.won, false);
  assert.strictEqual(g.winSeen, false);
  assert.strictEqual(g.justAchieved, null);
  assert.strictEqual(g.bestMilestone(), 0);
  assert.strictEqual(g.nextGoal().value, 64, 'the first thing to aim at is 64');
});

test('crossing a rung is recorded once and reported for the UI', function () {
  const g = game(1);
  g.load([[32, 32, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepStrictEqual(g.achievements, [], 'a 32 board has not reached the first rung');

  const r = g.move('left');
  assert.strictEqual(r.achieved, 64, 'the move reports the rung it crossed');
  assert.deepStrictEqual(g.achievements, [64]);
  assert.strictEqual(g.bestMilestone(), 64);
  assert.strictEqual(g.nextGoal().value, 128, 'and the next goal moves up');

  // moving around the same tile must not re-announce it
  g.move('right');
  assert.deepStrictEqual(g.achievements, [64], 'a rung is only recorded once per run');
  assert.strictEqual(g.justAchieved, null, 'and it is not re-announced');
});

test('the win banner waits to be acknowledged and the run survives it', function () {
  const g = game(1);
  g.load([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  g.move('left');
  assert.strictEqual(g.maxTile(), 2048);
  assert.strictEqual(g.won, true);
  assert.strictEqual(g.winSeen, false, 'the banner is still waiting to be dismissed');
  assert.ok(g.achievements.indexOf(2048) !== -1, '2048 counts as a rung');

  g.acknowledgeWin();
  assert.strictEqual(g.winSeen, true);
  assert.strictEqual(g.won, true, 'dismissing the banner does not undo the win');
  assert.strictEqual(g.isGameOver(), false, 'and the board is still playable');

  // the run continues normally, and further rungs still count
  g.load([[2048, 2048, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r = g.move('left');
  assert.strictEqual(g.maxTile(), 4096);
  assert.strictEqual(r.achieved, 4096, 'the ladder keeps paying out past the goal');
});

test('moveCount counts only moves that changed the board', function () {
  const g = game(1);
  g.load([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  g.move('left'); // no change
  g.move('up');   // no change
  assert.strictEqual(g.moveCount, 0, 'dead moves do not count');
  g.load([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  g.move('left');
  g.move('down');
  assert.strictEqual(g.moveCount, 2);
});

test('load counts the rungs a board already sits on', function () {
  const g = game(1);
  g.load([[512, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepStrictEqual(g.achievements, [64, 128, 256, 512], 'the ladder is credited immediately');
  assert.strictEqual(g.bestMilestone(), 512);
  assert.strictEqual(g.nextGoal().value, 1024, 'so the next goal is right without playing a move');
  assert.strictEqual(g.won, false);
});

test('a reset clears the run but the ladder helper still works', function () {
  const g = game(1);
  g.load([[64, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.strictEqual(g.bestMilestone(), 64);
  g.reset();
  assert.deepStrictEqual(g.achievements, [], 'a new run starts the ladder over');
  assert.strictEqual(g.moveCount, 0);
  assert.strictEqual(g.score, 0);
  assert.strictEqual(GameLib.milestonesUpTo(64).length, 1, 'the helper is unaffected by run state');
});

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
