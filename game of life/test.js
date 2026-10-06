/* test.js — sanity tests for the Game of Life simulation core (life.js).
 *
 * Run with:  node test.js
 * No dependencies: uses Node's built-in assert only.
 */
'use strict';

const assert = require('assert');
const Life = require('./life.js');

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

/* ---------- helpers ---------- */

function make(cols, rows) {
  return new Life(cols, rows);
}

function snapshot(life) {
  const keys = [];
  for (let y = 0; y < life.rows; y++) {
    for (let x = 0; x < life.cols; x++) {
      if (life.get(x, y)) keys.push(x + ',' + y);
    }
  }
  return keys.sort();
}

function shifted(keys, dx, dy, cols, rows) {
  return keys
    .map(function (key) {
      const parts = key.split(',').map(Number);
      const x = ((parts[0] + dx) % cols + cols) % cols;
      const y = ((parts[1] + dy) % rows + rows) % rows;
      return x + ',' + y;
    })
    .sort();
}

function run(life, generations, wrap) {
  for (let i = 0; i < generations; i++) life.step(wrap);
}

/* Runs a pattern for `period` generations on a grid with dead edges and
 * checks it returns to its exact starting position (oscillator / still
 * life). The grid must be large enough that the pattern never comes near
 * the edges during its cycle (the pentadecathlon, for one, throws sparks
 * 16 cells wide). */
function checkPeriod(patternId, cols, rows, period) {
  const life = make(cols, rows);
  life.placeCentered(patternId, Math.floor(cols / 2), Math.floor(rows / 2));
  const start = snapshot(life);
  run(life, period, false);
  assert.deepStrictEqual(
    snapshot(life),
    start,
    patternId + ' did not return to its start after ' + period + ' generations'
  );
}

/* ---------- pattern integrity ---------- */

test('all patterns parse to at least one cell', function () {
  const ids = Object.keys(Life.PATTERNS);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const p = Life.PATTERNS[id];
    assert.ok(p.cells.length > 0, id + ' has no cells');
    assert.ok(p.w > 0 && p.h > 0, id + ' has no size');
  }
});

test('pattern cell counts match the literature', function () {
  assert.strictEqual(Life.PATTERNS.glider.cells.length, 5);
  assert.strictEqual(Life.PATTERNS['lightweight-spaceship'].cells.length, 9);
  assert.strictEqual(Life.PATTERNS.blinker.cells.length, 3);
  assert.strictEqual(Life.PATTERNS.toad.cells.length, 6);
  assert.strictEqual(Life.PATTERNS.beacon.cells.length, 8);
  assert.strictEqual(Life.PATTERNS.pulsar.cells.length, 48);
  assert.strictEqual(Life.PATTERNS.pentadecathlon.cells.length, 12);
  assert.strictEqual(Life.PATTERNS['gosper-glider-gun'].cells.length, 36);
  assert.strictEqual(Life.PATTERNS['r-pentomino'].cells.length, 5);
  assert.strictEqual(Life.PATTERNS.acorn.cells.length, 7);
  assert.strictEqual(Life.PATTERNS.diehard.cells.length, 7);
});

/* ---------- rules ---------- */

test('block is a still life', function () {
  const life = make(10, 10);
  life.set(4, 4, 1).set(5, 4, 1).set(4, 5, 1).set(5, 5, 1);
  run(life, 5, true);
  assert.deepStrictEqual(snapshot(life), ['4,4', '4,5', '5,4', '5,5'].sort());
});

test('a lone cell dies', function () {
  const life = make(10, 10);
  life.set(5, 5, 1);
  life.step(true);
  assert.strictEqual(life.population, 0);
  assert.strictEqual(life.generation, 1);
});

test('an empty grid stays empty', function () {
  const life = make(8, 8);
  run(life, 10, true);
  assert.strictEqual(life.population, 0);
  assert.strictEqual(life.generation, 10);
});

/* ---------- oscillators ---------- */

test('blinker oscillates with period 2', function () {
  checkPeriod('blinker', 10, 10, 2);
});

test('toad oscillates with period 2', function () {
  checkPeriod('toad', 10, 10, 2);
});

test('beacon oscillates with period 2', function () {
  checkPeriod('beacon', 10, 10, 2);
});

test('pulsar oscillates with period 3', function () {
  checkPeriod('pulsar', 20, 20, 3);
});

test('pentadecathlon oscillates with period 15', function () {
  checkPeriod('pentadecathlon', 24, 24, 15);
});

/* ---------- spaceships ---------- */

test('glider translates diagonally every 4 generations', function () {
  const cols = 20;
  const rows = 20;
  const life = make(cols, rows);
  life.place('glider', 5, 5);
  const start = snapshot(life);
  run(life, 4, true);
  assert.deepStrictEqual(
    snapshot(life),
    shifted(start, 1, 1, cols, rows),
    'glider should move +1,+1 per 4 generations'
  );
  run(life, 4, true);
  assert.deepStrictEqual(snapshot(life), shifted(start, 2, 2, cols, rows));
});

test('lightweight spaceship travels orthogonally at c/2', function () {
  const cols = 30;
  const rows = 30;
  const life = make(cols, rows);
  life.place('lightweight-spaceship', 10, 10);
  const start = snapshot(life);
  run(life, 4, true);
  assert.deepStrictEqual(
    snapshot(life),
    shifted(start, 2, 0, cols, rows),
    'LWSS should move +2,0 per 4 generations'
  );
  run(life, 4, true);
  assert.deepStrictEqual(snapshot(life), shifted(start, 4, 0, cols, rows));
});

/* ---------- gun & methuselahs ---------- */

test('gosper glider gun keeps emitting gliders (population grows)', function () {
  const life = make(80, 40);
  life.place('gosper-glider-gun', 2, 2);
  assert.strictEqual(life.population, 36);
  run(life, 120, false);
  assert.ok(
    life.population > 40,
    'expected population to grow past 40, got ' + life.population
  );
});

test('r-pentomino grows before settling', function () {
  const life = make(100, 100);
  life.placeCentered('r-pentomino', 50, 50);
  run(life, 100, false);
  assert.ok(life.population > 5, 'r-pentomino should grow, got ' + life.population);
});

/* ---------- grid behaviour ---------- */

test('wrap: an oscillator can cross the seam', function () {
  const life = make(10, 10);
  life.set(9, 5, 1).set(0, 5, 1).set(1, 5, 1);
  life.step(true);
  assert.deepStrictEqual(snapshot(life), ['0,4', '0,5', '0,6'].sort());
});

test('no wrap: the same cells die at the edge', function () {
  const life = make(10, 10);
  life.set(9, 5, 1).set(0, 5, 1).set(1, 5, 1);
  life.step(false);
  // each cell has too few neighbours without the seam, so all three die
  assert.strictEqual(life.population, 0);
});

test('resize keeps the overlapping region', function () {
  const life = make(10, 10);
  life.set(2, 2, 1).set(3, 2, 1).set(2, 3, 1).set(3, 3, 1);
  life.resize(20, 8);
  assert.strictEqual(life.cols, 20);
  assert.strictEqual(life.rows, 8);
  assert.deepStrictEqual(snapshot(life), ['2,2', '2,3', '3,2', '3,3'].sort());
});

test('clear resets cells and generation', function () {
  const life = make(10, 10);
  life.place('glider', 1, 1);
  run(life, 3, true);
  life.clear();
  assert.strictEqual(life.population, 0);
  assert.strictEqual(life.generation, 0);
});

test('randomize fills roughly the requested density', function () {
  const life = make(50, 50);
  life.randomize(0.5);
  const ratio = life.population / (50 * 50);
  assert.strictEqual(life.generation, 0);
  assert.ok(ratio > 0.4 && ratio < 0.6, 'density out of range: ' + ratio);
});

test('placeCentered stamps symmetrically around the target', function () {
  const life = make(11, 11);
  life.placeCentered('blinker', 5, 5);
  assert.deepStrictEqual(snapshot(life), ['4,5', '5,5', '6,5'].sort());
});

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
