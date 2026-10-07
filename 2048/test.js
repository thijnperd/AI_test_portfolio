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
const AiLib = require('./ai.js');

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

/* ------------------------------------------------------------------ */
/* the AI player: heuristics, move choice, and whole games             */
/* ------------------------------------------------------------------ */

/* The same tiles in the same places, except that the 1024 sits in a corner on
 * one board and in the middle on the other — that and only that is the corner
 * bonus, so the pair isolates what the heuristic is paying for. */
const CORNER_BOARD = [[1024, 512, 64, 2], [8, 2, 32, 4], [2, 4, 8, 2], [0, 0, 0, 0]];
const MIDDLE_BOARD = [[2, 512, 64, 2], [8, 1024, 32, 4], [2, 4, 8, 2], [0, 0, 0, 0]];
const DEAD_BOARD = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];

function dirChanges(grid, dir) {
  return GameLib.applyMove(grid, 4, dir).moved;
}

test('log2 is exact for the tile values', function () {
  assert.strictEqual(AiLib.log2(2), 1);
  assert.strictEqual(AiLib.log2(2048), 11);
  assert.strictEqual(AiLib.log2(65536), 16);
});

test('countEmpty agrees with a hand count', function () {
  assert.strictEqual(AiLib.countEmpty(ZERO4), 16);
  assert.strictEqual(AiLib.countEmpty([[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 14);
});

test('monotonicityOf is zero for a sorted board and negative for a zigzag', function () {
  const sorted = [[2, 4, 8, 16], [2, 4, 8, 16], [2, 4, 8, 16], [2, 4, 8, 16]];
  assert.strictEqual(AiLib.monotonicityOf(sorted, 4), 0, 'every line runs one way');

  const zigzag = [[2, 16, 2, 16], [2, 16, 2, 16], [2, 16, 2, 16], [2, 16, 2, 16]];
  assert.ok(AiLib.monotonicityOf(zigzag, 4) < 0, 'a zigzag is penalised');
});

test('smoothnessOf is zero for equal neighbours and negative when scattered', function () {
  const flat = [[2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2]];
  assert.strictEqual(AiLib.smoothnessOf(flat, 4), 0);

  const scattered = [[2, 1024, 2, 1024], [2, 1024, 2, 1024], [2, 1024, 2, 1024], [2, 1024, 2, 1024]];
  assert.ok(AiLib.smoothnessOf(scattered, 4) < 0);
});

test('the heuristic terms add up to the documented weighted score', function () {
  const a = AiLib.analyse(CORNER_BOARD);
  const w = AiLib.WEIGHTS;
  const maxLog = AiLib.log2(a.maxTile);
  const expected = a.empties * w.empty
    + a.monotonicity * w.monotonicity
    + a.smoothness * w.smoothness
    + (a.maxInCorner ? maxLog * w.corner : 0)
    + (a.maxOnEdge ? maxLog * w.edge : 0);
  assert.ok(Math.abs(a.score - expected) < 1e-9, 'score ' + a.score + ' vs ' + expected);
});

test('the heuristic recognises the biggest tile holding a corner', function () {
  assert.strictEqual(AiLib.analyse(CORNER_BOARD).maxInCorner, true, 'corner board');
  assert.strictEqual(AiLib.analyse(MIDDLE_BOARD).maxInCorner, false, 'max tile buried in the middle');
});

test('the corner is worth paying for: same tiles score higher in a corner', function () {
  const inCorner = AiLib.evaluateGrid(CORNER_BOARD);
  const inMiddle = AiLib.evaluateGrid(MIDDLE_BOARD);
  assert.ok(inCorner > inMiddle, 'corner ' + inCorner + ' vs middle ' + inMiddle);
});

test('the monotone arrangement of the same tiles scores higher', function () {
  const sorted = [[2, 4, 8, 16], [2, 4, 8, 16], [2, 4, 8, 16], [2, 4, 8, 16]];
  const zigzag = [[2, 16, 2, 16], [2, 16, 2, 16], [2, 16, 2, 16], [2, 16, 2, 16]];
  assert.ok(AiLib.evaluateGrid(sorted) > AiLib.evaluateGrid(zigzag),
    'sorted ' + AiLib.evaluateGrid(sorted) + ' vs zigzag ' + AiLib.evaluateGrid(zigzag));
});

test('an open board scores far above a cramped one with the same biggest tile', function () {
  const open = [[2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 0, 0], [0, 0, 0, 0]];
  const cramped = [[2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2, 4], [8, 16, 32, 64]];
  assert.strictEqual(AiLib.maxTileOf(open), AiLib.maxTileOf(cramped), 'same biggest tile');
  assert.ok(AiLib.evaluateGrid(open) > AiLib.evaluateGrid(cramped),
    'open ' + AiLib.evaluateGrid(open) + ' vs cramped ' + AiLib.evaluateGrid(cramped));
});

test('bestMove reports all four directions, with legality from the real rules', function () {
  const r = AiLib.bestMove(CORNER_BOARD, { maxDepth: 2, maxNodes: 3000 });
  assert.strictEqual(r.candidates.length, 4);
  assert.deepStrictEqual(r.candidates.map(function (c) { return c.dir; }), GameLib.DIRECTIONS);
  for (const c of r.candidates) {
    assert.strictEqual(c.legal, dirChanges(CORNER_BOARD, c.dir),
      c.dir + ' legality must match the game\'s own rules');
    if (c.legal) assert.strictEqual(typeof c.value, 'number');
    else assert.strictEqual(c.value, null);
  }
});

test('bestMove only ever plays a direction that changes the board', function () {
  const boards = [
    CORNER_BOARD,
    MIDDLE_BOARD,
    [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    [[0, 0, 0, 2], [0, 0, 2, 0], [0, 2, 0, 0], [2, 0, 0, 0]],
    [[2, 4, 8, 16], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]],
  ];
  for (const b of boards) {
    const r = AiLib.bestMove(b, { maxDepth: 2, maxNodes: 2000 });
    if (r.dir === null) continue;   // a dead board is covered separately
    assert.ok(dirChanges(b, r.dir), 'chose ' + r.dir + ' on ' + JSON.stringify(b));
  }
});

test('bestMove returns the value of the direction it chose', function () {
  const r = AiLib.bestMove(CORNER_BOARD, { maxDepth: 2, maxNodes: 3000 });
  const chosen = r.candidates.find(function (c) { return c.dir === r.dir; });
  assert.ok(chosen, 'the chosen direction is in the shortlist');
  assert.strictEqual(chosen.value, r.value);
  const bestValue = Math.max.apply(null, r.candidates.filter(function (c) { return c.legal; })
    .map(function (c) { return c.value; }));
  assert.strictEqual(r.value, bestValue, 'and it is the best of them');
});

test('bestMove describes the board its chosen move would produce', function () {
  const r = AiLib.bestMove(CORNER_BOARD, { maxDepth: 2, maxNodes: 3000 });
  const after = GameLib.applyMove(CORNER_BOARD, 4, r.dir).grid;
  assert.deepStrictEqual(r.board, after, 'the returned board is the move applied');
  assert.strictEqual(r.breakdown.empties, AiLib.countEmpty(after));
  assert.strictEqual(r.breakdown.maxTile, AiLib.maxTileOf(after));
});

test('bestMove returns no direction on a board with no legal move', function () {
  const r = AiLib.bestMove(DEAD_BOARD, { maxDepth: 2, maxNodes: 2000 });
  assert.strictEqual(r.dir, null);
  assert.strictEqual(r.value, null);
  assert.strictEqual(r.breakdown, null);
  assert.deepStrictEqual(r.candidates.map(function (c) { return c.legal; }), [false, false, false, false]);
});

test('bestMove is deterministic for a given board and budget', function () {
  const a = AiLib.bestMove(CORNER_BOARD, { maxDepth: 3, maxNodes: 3000 });
  const b = AiLib.bestMove(CORNER_BOARD, { maxDepth: 3, maxNodes: 3000 });
  assert.strictEqual(a.dir, b.dir, 'same direction');
  assert.strictEqual(a.value, b.value, 'same value');
  assert.strictEqual(a.nodes, b.nodes, 'same amount of search');
  assert.deepStrictEqual(a.candidates.map(function (c) { return c.value; }),
    b.candidates.map(function (c) { return c.value; }), 'same shortlist');
});

test('a deeper look ahead searches at least as much, and stays inside its budget', function () {
  const shallow = AiLib.bestMove(CORNER_BOARD, { maxDepth: 1, maxNodes: 4000 });
  const deep = AiLib.bestMove(CORNER_BOARD, { maxDepth: 3, maxNodes: 4000 });
  assert.strictEqual(shallow.depth, 1);
  assert.strictEqual(deep.depth, 3);
  assert.ok(deep.nodes >= shallow.nodes, deep.nodes + ' vs ' + shallow.nodes);
  assert.ok(shallow.nodes <= 4000 && deep.nodes <= 4000,
    'the node budget is a hard stop: ' + shallow.nodes + ', ' + deep.nodes);
});

test('the root only reports a legal move for the directions that work', function () {
  // Every row is packed, so up and down cannot change anything; left can merge
  // the 2s in the top row, and right can slide that row as well.
  const board = [[2, 2, 4, 8], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]];
  const r = AiLib.bestMove(board, { maxDepth: 2, maxNodes: 3000 });
  const legal = r.candidates.filter(function (c) { return c.legal; }).map(function (c) { return c.dir; });
  assert.deepStrictEqual(legal.sort(), ['left', 'right'], 'only the two horizontal moves exist');
  assert.ok(legal.indexOf(r.dir) !== -1, 'and it picks one of them');
});

test('legalMoves lists exactly the directions that change the board', function () {
  const moves = AiLib.legalMoves(CORNER_BOARD).map(function (m) { return m.dir; });
  const expected = GameLib.DIRECTIONS.filter(function (d) { return dirChanges(CORNER_BOARD, d); });
  assert.deepStrictEqual(moves, expected);
  assert.deepStrictEqual(AiLib.legalMoves(DEAD_BOARD), []);
});

test('the AI plays a coherent opening: 60 moves reach at least 64', function () {
  const r = AiLib.playGame(1, { maxMoves: 60, maxNodes: 3000 });
  assert.strictEqual(r.moves, 60, 'it kept moving');
  assert.ok(r.maxTile >= 64, 'reached ' + r.maxTile);
  assert.ok(r.score > 0);
  assert.ok(r.nodes > 0);
});

test('the AI finishes a whole game and reaches a 512-class tile', function () {
  const r = AiLib.playGame(1, { maxNodes: 1500 });
  assert.strictEqual(r.over, true, 'the game reached a board with no legal move');
  assert.ok(r.moves > 100, 'and it took real moves to get there: ' + r.moves);
  assert.ok(r.maxTile >= 512, 'reached ' + r.maxTile + ' (measured: 1024 for this seed)');
});

test('a seeded AI game is reproducible, and a different seed plays differently', function () {
  const strip = function (r) {
    return { moves: r.moves, score: r.score, maxTile: r.maxTile, nodes: r.nodes };
  };
  const a = strip(AiLib.playGame(4, { maxMoves: 40, maxNodes: 2000 }));
  const b = strip(AiLib.playGame(4, { maxMoves: 40, maxNodes: 2000 }));
  const c = strip(AiLib.playGame(5, { maxMoves: 40, maxNodes: 2000 }));
  assert.deepStrictEqual(a, b, 'same seed, same game (the node counts match too)');
  assert.notDeepStrictEqual(a, c, 'a different seed deals different tiles');
});

/* ------------------------------------------------------------------ */
/* custom blocks: the arithmetic, the spawn table, and the ladder      */
/* ------------------------------------------------------------------ */

const BlocksLib = require('./blocks.js');

function rulesOf(blocks) {
  return BlocksLib.makeRules({ blocks: blocks });
}

const VANILLA = [{ kind: 'number', value: 2, weight: 90 }, { kind: 'number', value: 4, weight: 10 }];
const THREES = [{ kind: 'number', value: 3, weight: 100 }];

/* A board with one operator tile on it. Operator tiles are encoded as negative
 * numbers, and `-1` is the first operator block in the config. */
const OPERATOR_BOARD = [[8, -1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];

function ladderValues(rules) {
  return rules.ladder.map(function (r) { return r.value; });
}

test('applyOp applies each operator, and clamps at 1', function () {
  assert.strictEqual(BlocksLib.applyOp('add', 64, 2), 66);
  assert.strictEqual(BlocksLib.applyOp('subtract', 64, 2), 62);
  assert.strictEqual(BlocksLib.applyOp('multiply', 64, 2), 128);
  assert.strictEqual(BlocksLib.applyOp('divide', 64, 2), 32);
  assert.strictEqual(BlocksLib.applyOp('divide', 9, 2), 5, 'division rounds to a whole tile');
  assert.strictEqual(BlocksLib.applyOp('subtract', 2, 100), 1, 'a tile is shrunk, never erased');
  assert.strictEqual(BlocksLib.applyOp('divide', 1, 99), 1);
  assert.strictEqual(BlocksLib.applyOp('nonsense', 8, 2), 0, 'an unknown operator does nothing');
});

test('normalize fixes what a saved or hand-typed config can get wrong', function () {
  const n = BlocksLib.normalize({ blocks: [
    { kind: 'number', value: 2.4, weight: 5000 },
    { kind: 'wat', value: 6 },
    { kind: 'number', value: 6 },
    { kind: 'divide', amount: 0 },
  ] });
  assert.deepStrictEqual(n.blocks, [
    { kind: 'number', value: 2, weight: 1000 },
    { kind: 'number', value: 6, weight: 0 },
    { kind: 'divide', amount: 1, weight: 0 },
  ], 'rounded, clamped, and an unknown kind falls back to a number');
  assert.strictEqual(n.dropped, 1, 'the duplicate 6 is dropped');

  assert.strictEqual(BlocksLib.normalize(null).blocks.length, 2, 'no config means the default pair');
  assert.strictEqual(BlocksLib.normalize({ blocks: 'nonsense' }).blocks.length, 2);
  assert.strictEqual(BlocksLib.normalize({ blocks: [] }).blocks.length, 2);
});

test('normalize never leaves a board with nothing to spawn', function () {
  const n = BlocksLib.normalize({ blocks: [
    { kind: 'number', value: 2, weight: 0 },
    { kind: 'divide', amount: 2, weight: 10 },
  ] });
  assert.strictEqual(n.restored, true, 'the number block was put back in play');
  assert.strictEqual(n.blocks[0].weight, 1);
  assert.ok(n.blocks.some(function (b) { return b.kind === 'number' && b.weight > 0; }),
    'a board of operators alone could never make a move');

  const onlyOperators = BlocksLib.normalize({ blocks: [{ kind: 'multiply', amount: 2, weight: 5 }] });
  assert.ok(onlyOperators.blocks.some(function (b) { return b.kind === 'number' && b.weight > 0; }),
    'even a config with no numbers at all gets one back');
});

test('the default blocks reproduce the vanilla game exactly', function () {
  const rules = BlocksLib.makeRules(null);
  assert.strictEqual(rules.vanilla, true);
  assert.deepStrictEqual(rules.spawns.map(function (s) { return s.value; }), [2, 4]);
  assert.strictEqual(rules.spawns[0].upto, 0.9, 'the same 90% boundary the game used to hard-code');
  assert.strictEqual(rules.spawnValue(0), 2);
  assert.strictEqual(rules.spawnValue(0.8999), 2);
  assert.strictEqual(rules.spawnValue(0.9), 4, 'the boundary belongs to the 4, as `rng() < 0.9` did');
  assert.strictEqual(rules.spawnValue(0.999), 4);
  assert.strictEqual(rules.winValue, GameLib.WIN_VALUE);
  assert.deepStrictEqual(rules.ladder.map(function (r) { return [r.value, r.label]; }),
    GameLib.MILESTONES.map(function (r) { return [r.value, r.label]; }),
    'the derived ladder must be exactly the ladder the game always had');
});

test('the spawn table is the rarity control', function () {
  const rules = rulesOf([{ kind: 'number', value: 2, weight: 0 }, { kind: 'number', value: 8, weight: 1 }]);
  assert.deepStrictEqual(rules.spawns.map(function (s) { return s.value; }), [8],
    'a weight of 0 takes a block out of the table entirely');
  assert.strictEqual(rules.spawns[0].share, 1);

  const g = new GameLib.Game({ size: 4, seed: 11, rules: rules });
  g.load(ZERO4);
  for (let i = 0; i < 16; i++) g.addRandomTile();
  assert.deepStrictEqual(g.grid.flat().filter(function (v) { return v !== 0; }),
    [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8], 'only the block with a weight ever spawns');

  const shares = rulesOf([
    { kind: 'number', value: 2, weight: 90 },
    { kind: 'number', value: 4, weight: 10 },
    { kind: 'divide', amount: 2, weight: 100 },
  ]).spawns;
  assert.strictEqual(shares.length, 3);
  assert.ok(Math.abs(shares[2].share - 0.5) < 1e-9, 'weights are shares of the whole table');
  assert.strictEqual(shares[2].value, -1, 'an operator block spawns as its own tile');
});

test('mergePair: equal numbers merge, an operator merges into any number', function () {
  const rules = rulesOf(VANILLA.concat([{ kind: 'divide', amount: 2, weight: 5 }]));
  assert.strictEqual(rules.mergePair(4, 4), 8, 'the vanilla rule is unchanged');
  assert.strictEqual(rules.mergePair(2, 4), 0, 'unequal numbers still do not merge');
  assert.strictEqual(rules.mergePair(0, 0), 0, 'empty cells never merge');
  assert.strictEqual(rules.mergePair(8, 0), 0);
  assert.strictEqual(rules.mergePair(64, -1), 32, 'divide what it meets by 2');
  assert.strictEqual(rules.mergePair(-1, 64), 32, 'whichever side it is on');
  assert.strictEqual(rules.mergePair(-1, -1), 0, 'two operators never merge with each other');
  assert.strictEqual(rules.mergePair(-1, 1), 1, 'and the clamp holds through a merge');
});

test('two operator tiles next to each other are not a move', function () {
  const rules = rulesOf(VANILLA.concat([{ kind: 'divide', amount: 2, weight: 5 }]));
  const g = new GameLib.Game({ size: 4, seed: 1, rules: rules });
  g.load([[-1, -1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.strictEqual(g.canMove(), true, 'the board is not full');
  const r = g.move('left');
  assert.strictEqual(r.moved, false, 'they slide past each other, they do not merge');
  assert.strictEqual(g.grid[0][0], -1);
  assert.strictEqual(g.grid[0][1], -1);
});

test('a move rewrites the tile an operator meets', function () {
  const rules = rulesOf(VANILLA.concat([{ kind: 'divide', amount: 2, weight: 1 }]));
  const g = new GameLib.Game({ size: 4, seed: 1, rules: rules });
  g.load(OPERATOR_BOARD);
  const r = g.move('left');
  assert.strictEqual(r.moved, true);
  assert.strictEqual(g.grid[0][0], 4, 'the 8 met the \u00f72 and became a 4');
  assert.strictEqual(r.gained, 4, 'the score pays the tile the merge created');
  assert.ok(g.lastMerged.some(function (c) { return c[0] === 0 && c[1] === 0; }));
});

test('the ladder rescales onto values the blocks can actually reach', function () {
  const threes = BlocksLib.makeRules({ blocks: THREES });
  assert.deepStrictEqual(ladderValues(threes), [96, 192, 384, 768, 1536, 3072, 6144, 12288],
    'doubling a 3 never lands on a power of two');
  assert.deepStrictEqual(threes.ladder.map(function (r) { return r.label; }),
    GameLib.MILESTONES.map(function (r) { return r.label; }), 'the rungs keep their names');
  assert.strictEqual(threes.winValue, 3072, 'and the goal moves with them');
  assert.strictEqual(threes.vanilla, false);

  for (const rung of threes.ladder) {
    assert.strictEqual(rung.value % 3, 0, rung.value + ' is a 3-board value');
  }
});

test('every rung is the smallest reachable value at or above its target', function () {
  const configs = [null, { blocks: THREES }, { blocks: VANILLA.concat([{ kind: 'multiply', amount: 3, weight: 5 }]) }];
  for (const config of configs) {
    const rules = BlocksLib.makeRules(config);
    const values = BlocksLib.reachableValues(rules);
    assert.ok(values.length > 0);
    for (const rung of rules.ladder) {
      assert.ok(values.indexOf(rung.value) !== -1, rung.value + ' must be reachable');
      for (const v of values) {
        assert.ok(v < rung.target || v >= rung.value,
          v + ' sits between the target ' + rung.target + ' and the rung ' + rung.value);
      }
    }
  }
});

test('reachableValues is closed under the rules it was derived from', function () {
  const rules = rulesOf([{ kind: 'number', value: 3, weight: 100 }, { kind: 'multiply', amount: 5, weight: 10 }]);
  const values = BlocksLib.reachableValues(rules);
  const seen = {};
  for (const v of values) seen[v] = true;
  assert.ok(seen[3], 'the spawnable value is in it');
  for (const v of values) {
    assert.ok(v >= 1);
    // Only up to the ceiling the closure is derived under: the derivation is
    // allowed to stop above the top target, it is not allowed to be wrong below it.
    if (v * 2 <= 16384) assert.ok(seen[v * 2], 'doubling ' + v + ' to ' + (v * 2));
    for (const op of rules.operators) {
      const result = BlocksLib.applyOp(op.kind, v, op.amount);
      if (result <= 16384) assert.ok(seen[result], op.kind + ' of ' + v);
    }
  }
  assert.ok(values.every(function (v) { return v % 3 === 0; }), 'nothing off the 3-lattice is reachable');
});

test('an operator that only shrinks cannot cap a ladder the doubling still climbs', function () {
  const rules = rulesOf(VANILLA.concat([{ kind: 'divide', amount: 2, weight: 5 }]));
  assert.deepStrictEqual(ladderValues(rules), ladderValues(BlocksLib.makeRules(null)),
    'a \u00f72 tile halves what it meets, but two 2s still make a 4');
  assert.strictEqual(rules.winValue, 2048);

  assert.deepStrictEqual(BlocksLib.makeLadder([]), [], 'an empty value set has no rungs');
});

test('the derived ladder drives the milestones and the next goal', function () {
  const g = new GameLib.Game({ size: 4, seed: 1, rules: BlocksLib.makeRules({ blocks: THREES }) });
  g.load([[48, 48, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepStrictEqual(g.achievements, [], '48 is below every rung of a 3-board ladder');
  assert.strictEqual(g.nextGoal().value, 96, 'the first thing to aim at is 96, not 64');

  const r = g.move('left');
  assert.strictEqual(g.maxTile(), 96);
  assert.strictEqual(r.achieved, 96, 'and that is what the move reports');
  assert.deepStrictEqual(g.achievements, [96]);
  assert.strictEqual(g.nextGoal().value, 192);
});

test('setRules swaps the rules mid-run without touching the board', function () {
  const g = new GameLib.Game({ size: 4, seed: 1, rules: BlocksLib.makeRules(null) });
  g.load([[256, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepStrictEqual(g.achievements, [64, 128, 256]);
  const before = JSON.stringify(g.grid);

  g.setRules(BlocksLib.makeRules({ blocks: THREES }));
  assert.strictEqual(JSON.stringify(g.grid), before, 'the board is exactly as it was');
  assert.strictEqual(g.winValue, 3072, 'the goal follows the new ladder');
  assert.strictEqual(g.nextGoal().value, 384, 'and so does the next rung above the 256');

  // Editing the blocks must not pop a banner over a game that was already won.
  const w = new GameLib.Game({ size: 4, seed: 1, rules: BlocksLib.makeRules(null) });
  w.load([[2048, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.strictEqual(w.winSeen, false);
  w.setRules(BlocksLib.makeRules({ blocks: [{ kind: 'number', value: 2, weight: 100 }] }));
  assert.strictEqual(w.winSeen, true, 'a board already sitting on the goal does not celebrate it again');
  assert.strictEqual(w.won, false, 'and it is not retroactively a win');
});

test('a custom-rules game spawns exactly like its vanilla twin when the blocks are the default', function () {
  // The proof that the block machinery changed nothing: the default config goes
  // down the original code path, tile for tile and point for point.
  const plain = new GameLib.Game({ size: 4, seed: 77 });
  const derived = new GameLib.Game({ size: 4, seed: 77, rules: BlocksLib.makeRules(null) });
  const resaved = new GameLib.Game({ size: 4, seed: 77, rules: BlocksLib.makeRules({ blocks: VANILLA }) });
  // A four-move cycle is a real 2048 pattern, so the run crosses merges and
  // spawns rather than sliding the same row forever.
  const pattern = ['left', 'down', 'right', 'down'];
  for (let i = 0; i < 80; i++) {
    const dir = pattern[i % pattern.length];
    plain.move(dir);
    derived.move(dir);
    resaved.move(dir);
    assert.deepStrictEqual(derived.grid, plain.grid, 'default rules diverge at move ' + i);
    assert.deepStrictEqual(resaved.grid, plain.grid);
  }
  assert.strictEqual(derived.score, plain.score);
  assert.strictEqual(resaved.score, plain.score);
  assert.ok(plain.moveCount > 60, 'the run really played: ' + plain.moveCount);
  assert.ok(plain.maxTile() >= 32, 'and it really merged: ' + plain.maxTile());
});

test('the AI plays by the custom rules too', function () {
  const rules = rulesOf(VANILLA.concat([{ kind: 'divide', amount: 2, weight: 50 }]));
  const choice = AiLib.bestMove(OPERATOR_BOARD, { maxDepth: 2, maxNodes: 2000, rules: rules });
  assert.strictEqual(choice.candidates.length, 4);
  for (const c of choice.candidates) {
    assert.strictEqual(c.legal, GameLib.applyMove(OPERATOR_BOARD, 4, c.dir, null, rules.mergePair).moved,
      c.dir + ' legality must come from the block rules');
  }
  assert.ok(choice.dir, 'there is a move to make');
  assert.ok(GameLib.applyMove(OPERATOR_BOARD, 4, choice.dir, null, rules.mergePair).moved);
  assert.strictEqual(typeof choice.value, 'number');
});

test('the AI finishes a custom-rules game, and the same seed plays it again', function () {
  const rules = rulesOf(VANILLA.concat([{ kind: 'add', amount: 2, weight: 30 }]));
  const strip = function (r) {
    return { moves: r.moves, score: r.score, maxTile: r.maxTile, nodes: r.nodes, over: r.over };
  };
  const a = strip(AiLib.playGame(3, { maxNodes: 1200, rules: rules }));
  const b = strip(AiLib.playGame(3, { maxNodes: 1200, rules: rules }));
  assert.deepStrictEqual(a, b, 'same seed, same game');
  assert.strictEqual(a.over, true, 'and it plays it out to a dead board');
  assert.ok(a.moves > 20, 'it took real moves to get there: ' + a.moves);
});

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
