/* test.js — executable specification for the maze core (maze.js).
 *
 * Run with:  node test.js
 * No dependencies: uses Node's built-in assert only.
 *
 * The tests verify the properties that define the algorithms:
 *   - generators produce *perfect* mazes (spanning trees: connected,
 *     exactly cols*rows-1 passages, borders intact), deterministically
 *   - solvers return valid paths through open passages, and BFS / A*
 *     return *shortest* paths
 */
'use strict';

const assert = require('assert');
const MazeLib = require('./maze.js');

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

/* ---------- independent checks (do not reuse the core's solvers) ---------- */

/* Flood fill over open passages; returns the number of reachable cells. */
function floodCount(maze, start) {
  const cols = maze.cols;
  const rows = maze.rows;
  const seen = new Uint8Array(cols * rows);
  const stack = [start[1] * cols + start[0]];
  seen[start[1] * cols + start[0]] = 1;
  let n = 0;
  while (stack.length > 0) {
    const i = stack.pop();
    n++;
    const x = i % cols;
    const y = (i / cols) | 0;
    const next = maze.neighbors(x, y);
    for (let k = 0; k < next.length; k++) {
      const ni = next[k][1] * cols + next[k][0];
      if (!seen[ni]) {
        seen[ni] = 1;
        stack.push(ni);
      }
    }
  }
  return n;
}

/* Independent BFS distance (in cells) between two cells, or -1. */
function distance(maze, start, goal) {
  const cols = maze.cols;
  const startIndex = start[1] * cols + start[0];
  const goalIndex = goal[1] * cols + goal[0];
  const dist = new Int32Array(cols * maze.rows).fill(-1);
  dist[startIndex] = 0;
  const queue = [startIndex];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (i === goalIndex) return dist[i];
    const next = maze.neighbors(i % cols, (i / cols) | 0);
    for (let k = 0; k < next.length; k++) {
      const ni = next[k][1] * cols + next[k][0];
      if (dist[ni] === -1) {
        dist[ni] = dist[i] + 1;
        queue.push(ni);
      }
    }
  }
  return -1;
}

function assertValidPath(maze, path, start, goal) {
  assert.ok(Array.isArray(path) && path.length > 0, 'path is empty');
  assert.deepStrictEqual(path[0], start, 'path does not start at start');
  assert.deepStrictEqual(path[path.length - 1], goal, 'path does not end at goal');
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const adjacent =
      (Math.abs(a[0] - b[0]) === 1 && a[1] === b[1]) ||
      (Math.abs(a[1] - b[1]) === 1 && a[0] === b[0]);
    assert.ok(adjacent, 'path jumps from ' + a + ' to ' + b);
    assert.ok(!maze.hasWall(a[0], a[1], b[0], b[1]), 'path crosses a wall');
  }
}

function sameLayout(a, b) {
  return (
    a.cols === b.cols &&
    a.rows === b.rows &&
    Buffer.compare(Buffer.from(a.vWalls), Buffer.from(b.vWalls)) === 0 &&
    Buffer.compare(Buffer.from(a.hWalls), Buffer.from(b.hWalls)) === 0
  );
}

const GENERATOR_IDS = Object.keys(MazeLib.GENERATORS);
const SOLVER_IDS = Object.keys(MazeLib.SOLVERS);

/* ---------- seeded RNG ---------- */

test('makeRng is deterministic and returns values in [0, 1)', function () {
  const a = MazeLib.makeRng(42);
  const b = MazeLib.makeRng(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.strictEqual(v, b(), 'same seed must give the same sequence');
    assert.ok(v >= 0 && v < 1, 'value out of range: ' + v);
  }
  const c = MazeLib.makeRng(43);
  assert.notStrictEqual(a(), c(), 'different seeds should differ');
});

/* ---------- maze model ---------- */

test('a fresh maze has all walls and no passages', function () {
  const maze = new MazeLib.Maze(5, 4);
  assert.strictEqual(maze.passageCount(), 0);
  assert.ok(maze.bordersIntact());
  assert.ok(maze.hasWall(0, 0, 1, 0));
  assert.ok(maze.hasWall(0, 0, 0, 1));
  assert.strictEqual(maze.neighbors(0, 0).length, 0);
});

test('carve removes exactly the shared wall', function () {
  const maze = new MazeLib.Maze(5, 4);
  maze.carve(0, 0, 1, 0);
  assert.ok(!maze.hasWall(0, 0, 1, 0), 'shared wall should be gone');
  assert.ok(maze.hasWall(0, 0, 0, 1), 'other walls must stay');
  assert.strictEqual(maze.passageCount(), 1);
  assert.deepStrictEqual(maze.neighbors(0, 0), [[1, 0]]);
  assert.deepStrictEqual(maze.neighbors(1, 0), [[0, 0]]);
});

test('carve rejects non-adjacent and out-of-bounds cells', function () {
  const maze = new MazeLib.Maze(5, 4);
  assert.throws(function () { maze.carve(0, 0, 2, 0); }, /not adjacent/);
  assert.throws(function () { maze.carve(0, 0, 0, 0); }, /not adjacent/);
  assert.throws(function () { maze.carve(-1, 0, 0, 0); }, /out of bounds/);
  assert.throws(function () { maze.carve(4, 0, 5, 0); }, /out of bounds/);
  assert.strictEqual(maze.passageCount(), 0);
});

test('non-adjacent cells always count as walled', function () {
  const maze = new MazeLib.Maze(5, 4);
  assert.ok(maze.hasWall(0, 0, 2, 2));
});

test('generate rejects unknown algorithms', function () {
  assert.throws(function () { MazeLib.generate(5, 5, 'nope', 1); }, /Unknown generator/);
  assert.throws(function () { MazeLib.solve(new MazeLib.Maze(2, 2), [0, 0], [1, 1], 'nope'); }, /Unknown solver/);
});

/* ---------- generators ---------- */

GENERATOR_IDS.forEach(function (id) {
  test(id + ': produces a perfect maze', function () {
    const cols = 20;
    const rows = 15;
    const result = MazeLib.generate(cols, rows, id, 1234);
    const maze = result.maze;
    // spanning tree: connected and exactly cols*rows-1 passages
    assert.strictEqual(floodCount(maze, [0, 0]), cols * rows, 'not all cells reachable');
    assert.strictEqual(maze.passageCount(), cols * rows - 1, 'wrong passage count');
    assert.ok(maze.bordersIntact(), 'border walls must stay');
    assert.strictEqual(result.events.length, cols * rows - 1, 'one event per carved wall');
  });

  test(id + ': is deterministic per seed', function () {
    const a = MazeLib.generate(12, 9, id, 777).maze;
    const b = MazeLib.generate(12, 9, id, 777).maze;
    const c = MazeLib.generate(12, 9, id, 778).maze;
    assert.ok(sameLayout(a, b), 'same seed must give the same maze');
    assert.ok(!sameLayout(a, c), 'different seeds should give different mazes');
  });

  test(id + ': events replay reproduces the maze', function () {
    const result = MazeLib.generate(10, 8, id, 99);
    const replayed = new MazeLib.Maze(10, 8);
    for (const ev of result.events) {
      replayed.carve(ev[0], ev[1], ev[2], ev[3]);
    }
    assert.ok(sameLayout(replayed, result.maze), 'replay differs from generated maze');
  });
});

test('generators work on 1x1 and 2x2 grids', function () {
  for (const id of GENERATOR_IDS) {
    const tiny = MazeLib.generate(1, 1, id, 5);
    assert.strictEqual(tiny.events.length, 0);
    assert.ok(tiny.maze.bordersIntact());

    const small = MazeLib.generate(2, 2, id, 5);
    assert.strictEqual(small.maze.passageCount(), 3);
    assert.strictEqual(floodCount(small.maze, [0, 0]), 4);
  }
});

/* ---------- solvers ---------- */

GENERATOR_IDS.forEach(function (genId) {
  SOLVER_IDS.forEach(function (solverId) {
    test(solverId + ' on a ' + genId + ' maze: returns a valid path', function () {
      const cols = 20;
      const rows = 15;
      const maze = MazeLib.generate(cols, rows, genId, 321).maze;
      const start = [0, 0];
      const goal = [cols - 1, rows - 1];
      const result = MazeLib.solve(maze, start, goal, solverId);
      assertValidPath(maze, result.path, start, goal);
      // visited cells are unique and all inside the path's reach
      const seen = new Set();
      for (const cell of result.visited) {
        const key = cell[0] + ',' + cell[1];
        assert.ok(!seen.has(key), 'visited list repeats ' + key);
        seen.add(key);
      }
    });
  });
});

test('bfs and astar find shortest paths (independent distance)', function () {
  const cols = 25;
  const rows = 18;
  const maze = MazeLib.generate(cols, rows, 'backtracker', 2026).maze;
  const start = [0, 0];
  const goal = [cols - 1, rows - 1];
  const expected = distance(maze, start, goal) + 1; // cells = edges + 1
  assert.ok(expected > 1);
  for (const id of ['bfs', 'astar']) {
    const result = MazeLib.solve(maze, start, goal, id);
    assert.strictEqual(result.path.length, expected, id + ' is not shortest');
  }
});

test('dfs finds a path at least as long as the shortest', function () {
  const cols = 25;
  const rows = 18;
  const maze = MazeLib.generate(cols, rows, 'prim', 2026).maze;
  const start = [0, 0];
  const goal = [cols - 1, rows - 1];
  const expected = distance(maze, start, goal) + 1;
  const result = MazeLib.solve(maze, start, goal, 'dfs');
  assertValidPath(maze, result.path, start, goal);
  assert.ok(result.path.length >= expected, 'DFS cannot beat the shortest path');
});

test('solving start == goal returns the single cell', function () {
  const maze = MazeLib.generate(6, 6, 'kruskal', 1).maze;
  for (const id of SOLVER_IDS) {
    const result = MazeLib.solve(maze, [3, 3], [3, 3], id);
    assert.deepStrictEqual(result.path, [[3, 3]]);
    assert.strictEqual(result.visited.length, 0);
  }
});

test('unreachable goals give a null path', function () {
  // 2x1 grid with the shared wall still standing
  const maze = new MazeLib.Maze(2, 1);
  for (const id of SOLVER_IDS) {
    const result = MazeLib.solve(maze, [0, 0], [1, 0], id);
    assert.strictEqual(result.path, null, id + ' should report no path');
    assert.ok(result.visited.length > 0, 'exploration should still be recorded');
  }
});

test('solve rejects out-of-bounds start or goal', function () {
  const maze = new MazeLib.Maze(3, 3);
  assert.throws(function () { MazeLib.solve(maze, [-1, 0], [2, 2], 'bfs'); }, /out of bounds/);
  assert.throws(function () { MazeLib.solve(maze, [0, 0], [3, 3], 'bfs'); }, /out of bounds/);
});

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
