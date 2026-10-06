/* test.js — executable specification for the flocking core (boids.js).
 *
 * Run with:  node test.js
 * No dependencies: uses Node's built-in assert only.
 *
 * The tests pin down the properties that make the simulation correct:
 * the three steering rules actually separate / align / gather boids,
 * the flock stays inside its world, and a seed reproduces the same flock.
 */
'use strict';

const assert = require('assert');
const BoidsLib = require('./boids.js');

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

/* Build a flock with an exact set of boids: [x, y, vx, vy]. */
function controlled(opts, boids) {
  const flock = new BoidsLib.Flock(Object.assign(
    { count: 0, edge: 'wrap', perception: 1000, separationRadius: 16, maxSpeed: 120 },
    opts || {}
  ));
  flock.boids = [];
  for (let i = 0; i < boids.length; i++) {
    flock.addBoid(boids[i][0], boids[i][1], boids[i][2], boids[i][3]);
  }
  return flock;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function speed(b) {
  return Math.hypot(b.vx, b.vy);
}

function headingAngle(a, b) {
  const dot = a.vx * b.vx + a.vy * b.vy;
  const det = a.vx * b.vy - a.vy * b.vx;
  return Math.abs(Math.atan2(det, dot));
}

/* ------------------------------------------------------------------ */

test('makeRng is deterministic and returns values in [0, 1)', function () {
  const a = BoidsLib.makeRng(123);
  const b = BoidsLib.makeRng(123);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.ok(v >= 0 && v < 1, 'rng value out of range: ' + v);
    assert.strictEqual(v, b(), 'same seed must give the same sequence');
  }
});

test('torusDelta picks the shortest signed distance', function () {
  assert.strictEqual(BoidsLib.torusDelta(2, 98, 100), -4);
  assert.strictEqual(BoidsLib.torusDelta(98, 2, 100), 4);
  assert.strictEqual(BoidsLib.torusDelta(10, 30, 100), 20);
});

test('reset fills the flock inside the world at a bounded speed', function () {
  const flock = new BoidsLib.Flock({ count: 200, seed: 1, width: 400, height: 300 });
  assert.strictEqual(flock.boids.length, 200);
  for (const b of flock.boids) {
    assert.ok(b.x >= 0 && b.x < 400 && b.y >= 0 && b.y < 300, 'boid spawned out of bounds');
    assert.ok(speed(b) <= 120 + 1e-9, 'initial speed exceeds maxSpeed');
  }
});

test('a seed reproduces the same flock exactly', function () {
  const a = new BoidsLib.Flock({ count: 80, seed: 42 });
  const b = new BoidsLib.Flock({ count: 80, seed: 42 });
  for (let i = 0; i < 120; i++) {
    a.step(1 / 60);
    b.step(1 / 60);
  }
  assert.deepStrictEqual(a.boids, b.boids);
});

test('different seeds give different flocks', function () {
  const a = new BoidsLib.Flock({ count: 60, seed: 1 });
  const b = new BoidsLib.Flock({ count: 60, seed: 2 });
  a.step(1 / 60);
  b.step(1 / 60);
  assert.notDeepStrictEqual(a.boids, b.boids);
});

test('stepping preserves the boid count', function () {
  const flock = new BoidsLib.Flock({ count: 50, seed: 9 });
  for (let i = 0; i < 200; i++) flock.step(1 / 60);
  assert.strictEqual(flock.boids.length, 50);
});

test('speed never exceeds maxSpeed and state stays finite', function () {
  const flock = new BoidsLib.Flock({ count: 120, seed: 7, maxSpeed: 90 });
  for (let i = 0; i < 400; i++) flock.step(1 / 60);
  for (const b of flock.boids) {
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), 'position went non-finite');
    assert.ok(speed(b) <= 90 + 1e-9, 'speed exceeded maxSpeed: ' + speed(b));
  }
});

test('wrap keeps boids on the torus', function () {
  const flock = new BoidsLib.Flock({ count: 100, seed: 3, width: 300, height: 200, edge: 'wrap' });
  for (let i = 0; i < 400; i++) flock.step(1 / 60);
  for (const b of flock.boids) {
    assert.ok(b.x >= 0 && b.x < 300, 'x out of the torus: ' + b.x);
    assert.ok(b.y >= 0 && b.y < 200, 'y out of the torus: ' + b.y);
  }
});

test('bounce keeps boids inside the walls', function () {
  const flock = new BoidsLib.Flock({ count: 100, seed: 5, width: 300, height: 200, edge: 'bounce' });
  for (let i = 0; i < 400; i++) flock.step(1 / 60);
  for (const b of flock.boids) {
    assert.ok(b.x >= 0 && b.x <= 300, 'x left the world: ' + b.x);
    assert.ok(b.y >= 0 && b.y <= 200, 'y left the world: ' + b.y);
  }
});

test('separation pushes crowding boids apart', function () {
  const flock = controlled(
    { separation: 1, alignment: 0, cohesion: 0, separationRadius: 16, maxSpeed: 120 },
    [[100, 100, 0, 0], [110, 100, 0, 0]]
  );
  const before = distance(flock.boids[0], flock.boids[1]);
  for (let i = 0; i < 30; i++) flock.step(1 / 60);
  const after = distance(flock.boids[0], flock.boids[1]);
  assert.ok(after > before, 'boids should move apart (' + before + ' -> ' + after + ')');
});

test('separation is ignored for distant neighbours', function () {
  const flock = controlled(
    { separation: 1, alignment: 0, cohesion: 0, separationRadius: 10, perception: 1000 },
    [[100, 100, 0, 0], [200, 100, 0, 0]]
  );
  const a = flock.steering(flock.boids[0]);
  assert.deepStrictEqual(a, [0, 0]);
});

test('alignment turns two headings toward each other', function () {
  const flock = controlled(
    { separation: 0, alignment: 1, cohesion: 0, maxSpeed: 100 },
    [[100, 100, 100, 0], [200, 100, 70.71, 70.71]]
  );
  const before = headingAngle(flock.boids[0], flock.boids[1]);
  for (let i = 0; i < 60; i++) flock.step(1 / 60);
  const after = headingAngle(flock.boids[0], flock.boids[1]);
  assert.ok(after < before - 1e-6, 'headings should converge (' + before + ' -> ' + after + ')');
});

test('cohesion pulls two boids together', function () {
  const flock = controlled(
    { separation: 0, alignment: 0, cohesion: 1, maxSpeed: 100 },
    [[100, 100, 0, 0], [200, 100, 0, 0]]
  );
  const before = distance(flock.boids[0], flock.boids[1]);
  for (let i = 0; i < 20; i++) flock.step(1 / 60);
  const after = distance(flock.boids[0], flock.boids[1]);
  assert.ok(after < before, 'boids should gather (' + before + ' -> ' + after + ')');
});

test('alignmentScore reports how uniform the flock is', function () {
  const lined = controlled({}, [[10, 10, 100, 0], [50, 50, 100, 0], [80, 80, 100, 0]]);
  assert.ok(Math.abs(lined.alignmentScore() - 1) < 1e-9, 'parallel boids score 1');

  const opposed = controlled({}, [[10, 10, 100, 0], [50, 50, -100, 0]]);
  assert.ok(opposed.alignmentScore() < 1e-9, 'opposing boids cancel out');
});

test('centroid is the average position', function () {
  const flock = controlled({}, [[0, 0, 0, 0], [100, 50, 0, 0], [50, 100, 0, 0]]);
  assert.deepStrictEqual(flock.centroid(), [50, 50]);
});

test('addBoid appends a boid with its given state', function () {
  const flock = new BoidsLib.Flock({ count: 0, seed: 1 });
  const b = flock.addBoid(5, 6, 7, 8);
  assert.strictEqual(flock.boids.length, 1);
  assert.deepStrictEqual(b, { x: 5, y: 6, vx: 7, vy: 8 });
});

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
