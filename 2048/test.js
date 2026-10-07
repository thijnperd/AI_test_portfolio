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

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
