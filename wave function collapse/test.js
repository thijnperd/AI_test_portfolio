/* test.js — executable specification for the Wave Function Collapse core
 * (wfc.js).
 *
 * Run with:  node test.js
 * No dependencies: uses Node's built-in assert only.
 *
 * The tests pin down the properties that make the solver correct: the
 * adjacency table agrees with the sockets and is symmetric, rotated variants
 * are consistent, propagation prunes impossible options, an unsatisfiable grid
 * is reported as a contradiction, a valid grid has zero adjacency violations,
 * boundary mode keeps tracks off the edges, and a seed reproduces the map.
 */
'use strict';

const assert = require('assert');
const WFCLib = require('./wfc.js');

const { OPPOSITE, SHAPES } = WFCLib;

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

function solve(options) {
  const s = new WFCLib.Solver(options);
  s.solveAll();
  return s;
}

/* ------------------------------------------------------------------ */
/* tiles and adjacency                                                */
/* ------------------------------------------------------------------ */

test('makeRng is deterministic and returns values in [0, 1)', function () {
  const a = WFCLib.makeRng(7);
  const b = WFCLib.makeRng(7);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.ok(v >= 0 && v < 1, 'rng value out of range: ' + v);
    assert.strictEqual(v, b(), 'same seed must give the same sequence');
  }
});

test('buildTiles starts with a plain ground tile', function () {
  const tiles = WFCLib.buildTiles('circuit');
  assert.deepStrictEqual(tiles[0].sockets, [0, 0, 0, 0]);
  assert.strictEqual(tiles[0].kind, 'empty');
});

test('rotations produce the expected number of variants per shape', function () {
  const tiles = WFCLib.buildTiles('circuit');
  const counts = {};
  for (const t of tiles) {
    if (t.kind === 'empty') continue;
    counts[t.kind] = (counts[t.kind] || 0) + 1;
  }
  assert.strictEqual(counts.end, 4, 'an end has four orientations');
  assert.strictEqual(counts.straight, 2, 'a straight has two orientations');
  assert.strictEqual(counts.corner, 4, 'a corner has four orientations');
  assert.strictEqual(counts.tee, 4, 'a tee has four orientations');
  assert.strictEqual(counts.cross, 1, 'a cross has one orientation');
});

test('every tile carries exactly its shape arity of one track', function () {
  const arity = {};
  for (const sh of SHAPES) arity[sh.kind] = sh.dirs.length;
  for (const setName of WFCLib.TILE_SET_NAMES) {
    for (const t of WFCLib.buildTiles(setName)) {
      if (t.kind === 'empty') {
        assert.deepStrictEqual(t.sockets, [0, 0, 0, 0], 'ground must have no sockets');
        continue;
      }
      let nz = 0;
      for (const v of t.sockets) {
        if (v) nz++;
        assert.ok(v === 0 || v === t.track, 'socket must be 0 or the tile track');
      }
      assert.strictEqual(nz, arity[t.kind], t.kind + ' has the wrong socket count');
    }
  }
});

test('rotating a socket tuple four times returns it unchanged', function () {
  for (const t of WFCLib.buildTiles('garden')) {
    let s = t.sockets.slice();
    for (let i = 0; i < 4; i++) s = WFCLib.rotateSockets(s);
    assert.deepStrictEqual(s, t.sockets);
  }
});

test('adjacency agrees with the sockets and is symmetric', function () {
  const tiles = WFCLib.buildTiles('circuit');
  const compat = WFCLib.buildAdjacency(tiles);
  for (let d = 0; d < 4; d++) {
    for (let s = 0; s < tiles.length; s++) {
      for (const t of compat[d][s]) {
        assert.strictEqual(
          tiles[t].sockets[OPPOSITE[d]], tiles[s].sockets[d],
          'edge sockets must match for tiles ' + s + ' and ' + t + ' in dir ' + d
        );
        assert.ok(
          compat[OPPOSITE[d]][t].indexOf(s) !== -1,
          'adjacency must be symmetric for tiles ' + s + ' and ' + t
        );
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* the solver                                                         */
/* ------------------------------------------------------------------ */

test('a fresh grid allows every tile everywhere and reports full entropy', function () {
  const s = new WFCLib.Solver({ width: 8, height: 8, seed: 1, boundary: false });
  assert.strictEqual(s.optionsAt(4, 4), s.numTiles);
  assert.ok(s.entropyAt(4, 4) > 0, 'an undecided cell has positive entropy');
  assert.strictEqual(s.collapsedCount(), 0);
  assert.strictEqual(s.isDone(), false);
});

test('assign collapses a cell to one tile and zeroes its entropy', function () {
  const s = new WFCLib.Solver({ width: 6, height: 6, seed: 1, boundary: false });
  s.assign(2 * 6 + 2, 0);
  assert.strictEqual(s.isCollapsed(2, 2), true);
  assert.strictEqual(s.entropyAt(2, 2), 0);
  assert.strictEqual(s.tileAt(2, 2).sockets.join(','), '0,0,0,0');
});

test('propagation prunes neighbours to compatible options', function () {
  const s = new WFCLib.Solver({ width: 7, height: 7, seed: 3, boundary: false });
  const straight = s.tiles.find(function (t) {
    return t.kind === 'straight' && t.sockets[1] === 1 && t.sockets[3] === 1;
  });
  assert.ok(straight, 'expected a horizontal straight tile');

  const cell = 3 * 7 + 3;
  s.assign(cell, straight.id);
  assert.strictEqual(s.propagate(cell), true, 'propagation should not contradict');

  const east = 3 * 7 + 4;
  const eastOptions = s.allowedIndices(east);
  assert.ok(eastOptions.length < s.numTiles, 'the east neighbour must lose options');
  for (const t of eastOptions) {
    assert.strictEqual(s.tiles[t].sockets[3], 1, 'east neighbour must expose a matching west socket');
  }

  const north = 2 * 7 + 3;
  for (const t of s.allowedIndices(north)) {
    assert.strictEqual(s.tiles[t].sockets[2], 0, 'north neighbour must keep its south socket blank');
  }
});

test('solveAll fully collapses a grid with no adjacency violations', function () {
  const s = solve({ width: 10, height: 10, tileSet: 'circuit', seed: 11 });
  assert.strictEqual(s.hasContradiction(), false, 'a small valid grid must not contradict');
  assert.strictEqual(s.isDone(), true);
  assert.strictEqual(s.collapsedCount(), 100);
  const check = s.validate();
  assert.ok(check.ok, 'solved grid has ' + check.violations + ' adjacency violations');
});

test('solveAll terminates and stays valid for both tile sets', function () {
  for (const setName of WFCLib.TILE_SET_NAMES) {
    for (const seed of [1, 2, 3]) {
      const s = solve({ width: 12, height: 9, tileSet: setName, seed: seed });
      assert.strictEqual(s.isDone() || s.hasContradiction(), true, setName + ' must finish');
      if (s.isDone()) assert.ok(s.validate().ok, setName + ' seed ' + seed + ' is invalid');
    }
  }
});

test('a seed reproduces the same map', function () {
  const a = solve({ width: 12, height: 12, seed: 99 });
  const b = solve({ width: 12, height: 12, seed: 99 });
  assert.deepStrictEqual(Array.from(a.chosen), Array.from(b.chosen));
});

test('different seeds can give different maps', function () {
  const a = solve({ width: 14, height: 14, seed: 1 });
  const b = solve({ width: 14, height: 14, seed: 2 });
  assert.notDeepStrictEqual(Array.from(a.chosen), Array.from(b.chosen));
});

test('an unsatisfiable tile set is reported as a contradiction', function () {
  const tiles = [
    { id: 0, sockets: [1, 2, 3, 4], weight: 1, kind: 'empty', rot: 0, track: 0 },
    { id: 1, sockets: [5, 6, 7, 8], weight: 1, kind: 'empty', rot: 0, track: 0 }
  ];
  const s = new WFCLib.Solver({ width: 2, height: 1, tiles: tiles, seed: 1, boundary: false });
  const res = s.solveAll();
  assert.strictEqual(res.solved, false);
  assert.strictEqual(s.hasContradiction(), true, 'no arrangement exists, so it must contradict');
});

test('backtracking still resolves a satisfiable custom grid', function () {
  const tiles = [
    { id: 0, sockets: [0, 0, 0, 0], weight: 1, kind: 'empty', rot: 0, track: 0 },
    { id: 1, sockets: [1, 1, 1, 1], weight: 1, kind: 'cross', rot: 0, track: 1 }
  ];
  const s = new WFCLib.Solver({ width: 4, height: 3, tiles: tiles, seed: 2, boundary: false });
  const res = s.solveAll();
  assert.strictEqual(res.solved, true);
  assert.strictEqual(s.hasContradiction(), false);
  assert.ok(s.validate().ok, 'the resolved grid must be valid');
});

test('boundary mode keeps every track off the map edges', function () {
  const s = solve({ width: 9, height: 7, tileSet: 'garden', boundary: true, seed: 4 });
  assert.ok(s.isDone(), 'the garden grid should resolve');
  assert.ok(s.validate().ok);
  const w = s.w;
  const h = s.h;
  for (let x = 0; x < w; x++) {
    assert.strictEqual(s.tileAt(x, 0).sockets[0], 0, 'north edge must be closed');
    assert.strictEqual(s.tileAt(x, h - 1).sockets[2], 0, 'south edge must be closed');
  }
  for (let y = 0; y < h; y++) {
    assert.strictEqual(s.tileAt(0, y).sockets[3], 0, 'west edge must be closed');
    assert.strictEqual(s.tileAt(w - 1, y).sockets[1], 0, 'east edge must be closed');
  }
});

test('validate detects an adjacency violation', function () {
  const tiles = [
    { id: 0, sockets: [0, 0, 0, 0], weight: 1, kind: 'empty', rot: 0, track: 0 },
    { id: 1, sockets: [1, 1, 1, 1], weight: 1, kind: 'cross', rot: 0, track: 1 }
  ];
  const s = new WFCLib.Solver({ width: 2, height: 1, tiles: tiles, seed: 1, boundary: false });
  s.assign(0, 0);
  s.assign(1, 1); // ground (east socket 0) next to a cross (west socket 1)
  const check = s.validate();
  assert.strictEqual(check.ok, false);
  assert.ok(check.violations > 0);
});

test('reset returns the solver to a fresh, reproducible grid', function () {
  const s = new WFCLib.Solver({ width: 6, height: 6, seed: 5 });
  s.solveAll();
  s.reset();
  assert.strictEqual(s.isDone(), false);
  assert.strictEqual(s.collapsedCount(), 0);
  const a = new WFCLib.Solver({ width: 6, height: 6, seed: 5 });
  s.solveAll();
  a.solveAll();
  assert.deepStrictEqual(Array.from(s.chosen), Array.from(a.chosen));
});

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
