/* test.js — executable specification for the falling-sand core (sand.js).
 *
 * Run with:  node test.js
 * No dependencies: uses Node's built-in assert only.
 *
 * The tests pin down the material rules (sand falls and piles, sinking and
 * floating by density, liquids finding their level), the physics model
 * (gravity as acceleration, hydrostatic pressure, wet-sand repose), the
 * conservation of material, and seeded determinism.
 */
'use strict';

const assert = require('assert');
const SandLib = require('./sand.js');

const { EMPTY, SAND, WATER, WALL, OIL, STONE } = SandLib;

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

function grid(width, height, seed) {
  return new SandLib.Sand({ width: width, height: height, seed: seed || 1 });
}

/* Position of the first cell of a given type, or null. */
function find(sand, type) {
  for (let y = 0; y < sand.height; y++) {
    for (let x = 0; x < sand.width; x++) {
      if (sand.get(x, y) === type) return [x, y];
    }
  }
  return null;
}

/* Every cell of a given type, as [x, y] pairs. */
function findAll(sand, type) {
  const out = [];
  for (let y = 0; y < sand.height; y++) {
    for (let x = 0; x < sand.width; x++) {
      if (sand.get(x, y) === type) out.push([x, y]);
    }
  }
  return out;
}

/* A walled basin: solid floor, solid left and right walls, open middle. */
function basin(width, height, seed) {
  const s = grid(width, height, seed);
  for (let x = 0; x < width; x++) s.set(x, height - 1, WALL);
  for (let y = 0; y < height; y++) {
    s.set(0, y, WALL);
    s.set(width - 1, y, WALL);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* material rules                                                     */
/* ------------------------------------------------------------------ */

test('get/set/inBounds treat the outside as solid wall', function () {
  const s = grid(3, 3);
  assert.ok(s.inBounds(2, 2));
  assert.ok(!s.inBounds(3, 0));
  s.set(1, 1, SAND);
  assert.strictEqual(s.get(1, 1), SAND);
  assert.strictEqual(s.get(-1, 0), WALL, 'out of bounds reads as wall');
});

test('STONE is an alias for the solid material', function () {
  assert.strictEqual(STONE, WALL);
  assert.strictEqual(SandLib.MATERIALS[WALL].state, 'solid');
});

test('canDisplace follows density: heavier sinks through lighter', function () {
  const s = grid(2, 2);
  assert.strictEqual(s.canDisplace(SAND, WATER), true);
  assert.strictEqual(s.canDisplace(SAND, OIL), true);
  assert.strictEqual(s.canDisplace(WATER, OIL), true);
  assert.strictEqual(s.canDisplace(OIL, WATER), false, 'oil cannot sink through water');
  assert.strictEqual(s.canDisplace(WATER, SAND), false, 'water cannot sink through sand');
  assert.strictEqual(s.canDisplace(SAND, WALL), false, 'nothing moves stone');
  assert.strictEqual(s.canDisplace(SAND, SAND), false, 'equal density does not merge');
  assert.strictEqual(s.canDisplace(WATER, EMPTY), true);
});

test('a grain of sand falls straight down', function () {
  const s = grid(1, 5);
  s.set(0, 0, SAND);
  s.step();
  assert.strictEqual(s.get(0, 1), SAND, 'sand should move down one row');
  assert.strictEqual(s.get(0, 0), EMPTY);
});

test('sand settles on the floor', function () {
  const s = grid(1, 5);
  s.set(0, 0, SAND);
  s.stepMany(10);
  assert.strictEqual(s.get(0, 4), SAND, 'sand should rest on the bottom row');
  assert.strictEqual(s.counts().sand, 1);
});

test('sand rests on a wall', function () {
  const s = grid(1, 5);
  s.set(0, 4, WALL);
  s.set(0, 0, SAND);
  s.stepMany(10);
  assert.strictEqual(s.get(0, 3), SAND, 'sand should sit on top of the wall');
  assert.strictEqual(s.get(0, 4), WALL, 'the wall must not move');
});

test('sand slides diagonally around an obstacle', function () {
  const s = grid(3, 3);
  s.set(1, 2, WALL);   // obstacle directly below the grain
  s.set(1, 0, SAND);
  s.stepMany(5);
  const pos = find(s, SAND);
  assert.strictEqual(pos[1], 2, 'sand should reach the bottom row');
  assert.ok(pos[0] === 0 || pos[0] === 2, 'sand should slip around the wall, got x=' + pos[0]);
});

test('sand sinks through water and oil', function () {
  const s = grid(1, 3);
  s.set(0, 1, SAND);
  s.set(0, 2, WATER);
  s.step();
  assert.strictEqual(s.get(0, 2), SAND, 'sand should sink to the bottom');
  assert.strictEqual(s.get(0, 1), WATER, 'water should rise above the sand');

  const o = grid(1, 3);
  o.set(0, 1, SAND);
  o.set(0, 2, OIL);
  o.step();
  assert.strictEqual(o.get(0, 2), SAND, 'sand should sink through oil');
  assert.strictEqual(o.get(0, 1), OIL);
});

test('oil floats on water and water sinks below oil', function () {
  // oil above water — stable
  const a = grid(1, 4);
  a.set(0, 3, WALL);
  a.set(0, 2, WATER);
  a.set(0, 1, OIL);
  a.stepMany(10);
  assert.strictEqual(a.get(0, 2), WATER, 'water stays below');
  assert.strictEqual(a.get(0, 1), OIL, 'oil stays on top');

  // water above oil — water sinks, oil rises
  const b = grid(1, 4);
  b.set(0, 3, WALL);
  b.set(0, 2, OIL);
  b.set(0, 1, WATER);
  b.stepMany(10);
  assert.strictEqual(b.get(0, 2), WATER, 'water sinks below the oil');
  assert.strictEqual(b.get(0, 1), OIL, 'oil rises above the water');
});

test('three fluids stratify by density', function () {
  const s = grid(1, 5);
  s.set(0, 4, WALL);
  s.set(0, 1, SAND);
  s.set(0, 2, WATER);
  s.set(0, 3, OIL);
  s.stepMany(40);
  assert.strictEqual(s.get(0, 3), SAND, 'sand sinks to the bottom');
  assert.strictEqual(s.get(0, 2), WATER, 'water settles in the middle');
  assert.strictEqual(s.get(0, 1), OIL, 'oil floats on top');
});

test('a lone water cell spreads sideways on a flat surface', function () {
  const s = grid(5, 1);
  s.set(2, 0, WATER);
  s.step();
  const pos = find(s, WATER);
  assert.ok(Math.abs(pos[0] - 2) === 1, 'water should spread to a neighbour, got x=' + pos[0]);
});

test('water with nowhere to go does not vanish', function () {
  const s = grid(1, 1);
  s.set(0, 0, WATER);
  s.step();
  assert.strictEqual(s.get(0, 0), WATER, 'the lone cell has no neighbour to flow into');
});

test('walls never move', function () {
  const s = grid(20, 20, 5);
  s.randomize({ seed: 5, sandChance: 0.2, waterChance: 0.1, oilChance: 0.05, wallChance: 0.05 });
  const walls = findAll(s, WALL);
  s.stepMany(40);
  for (const [x, y] of walls) {
    assert.strictEqual(s.get(x, y), WALL, 'wall moved at ' + x + ',' + y);
  }
});

test('material is conserved while nothing is added', function () {
  const s = grid(24, 18, 11);
  s.randomize({ seed: 11, sandChance: 0.2, waterChance: 0.12, oilChance: 0.05, wallChance: 0.04 });
  const before = s.counts();
  s.stepMany(60);
  const after = s.counts();
  assert.strictEqual(after.sand, before.sand, 'sand count changed');
  assert.strictEqual(after.water, before.water, 'water count changed');
  assert.strictEqual(after.oil, before.oil, 'oil count changed');
  assert.strictEqual(after.wall, before.wall, 'wall count changed');
});

/* ------------------------------------------------------------------ */
/* physics                                                            */
/* ------------------------------------------------------------------ */

test('gravity accelerates a falling grain past one cell per tick', function () {
  const s = grid(1, 40);
  s.set(0, 39, WALL);      // floor far below
  s.set(0, 0, SAND);
  s.stepMany(10);
  const pos = find(s, SAND);
  assert.ok(pos[1] > 12, 'sand should accelerate beyond 1 cell/tick, reached y=' + pos[1]);
});

test('pressure grows with the depth of liquid above a cell', function () {
  const s = grid(3, 6);
  for (let x = 0; x < 3; x++) s.set(x, 5, WALL);
  s.set(1, 2, WATER);
  s.set(1, 3, WATER);
  s.set(1, 4, WATER);
  s.computeFluids();

  assert.strictEqual(s.pressureAt(1, 2), 0, 'the surface has no liquid above it');
  assert.strictEqual(s.pressureAt(1, 3), 1);
  assert.strictEqual(s.pressureAt(1, 4), 2);
  assert.strictEqual(s.pressureAt(0, 4), 0, 'a dry column has no pressure');
  assert.strictEqual(s.pressureAt(1, 5), 0, 'a solid cell is not under liquid pressure');
  assert.strictEqual(s.maxPressure(), 2, 'the deepest cell reports the peak pressure');
});

test('liquids find their level in a basin (communicating vessels)', function () {
  const s = basin(5, 6, 3);
  // a tall column of water in the middle basin (columns 1..3, floor at row 5)
  s.set(2, 2, WATER);
  s.set(2, 3, WATER);
  s.set(2, 4, WATER);
  s.stepMany(60);

  const water = findAll(s, WATER);
  assert.strictEqual(water.length, 3, 'no water is lost while levelling');
  for (const [, y] of water) {
    assert.strictEqual(y, 4, 'every drop should rest on the same level row, got y=' + y);
  }
});

test('two connected tanks reach the same surface height', function () {
  // A wide basin; water poured on the left should spread to the right.
  const s = basin(9, 8, 7);
  s.set(1, 6, WATER);
  s.set(1, 5, WATER);
  s.set(1, 4, WATER);
  s.set(2, 6, WATER);
  s.stepMany(120);

  const surfaces = [];
  for (let x = 1; x < 8; x++) surfaces.push(s.surfaceAt(x));
  const wet = surfaces.filter(function (v) { return v !== Infinity; });
  const min = Math.min.apply(null, wet);
  const max = Math.max.apply(null, wet);
  assert.ok(max - min <= 1, 'surfaces should be within one row of each other, got ' + min + '..' + max);
});

test('wet sand holds a steeper pile than dry sand', function () {
  // A pillar with empty space on both sides. Dry sand slips off; wet sand does not.
  function scene(withWater) {
    const s = grid(5, 4, 1);
    for (let x = 0; x < 5; x++) s.set(x, 3, WALL); // floor
    s.set(2, 2, WALL);                             // pillar
    s.set(2, 1, SAND);                             // grain on the pillar
    if (withWater) s.set(2, 0, WATER);             // water directly above the grain
    s.step();
    return s;
  }

  const dry = scene(false);
  const dryPos = find(dry, SAND);
  assert.ok(dryPos[1] === 2 && (dryPos[0] === 1 || dryPos[0] === 3),
    'dry sand should slip off the pillar, got ' + dryPos);

  const wet = scene(true);
  assert.strictEqual(wet.get(2, 1), SAND, 'wet sand should hold its pile on the pillar');
});

/* ------------------------------------------------------------------ */
/* seeding, painting, emitting                                        */
/* ------------------------------------------------------------------ */

test('a seed reproduces the same run exactly', function () {
  const a = grid(30, 20, 99);
  const b = grid(30, 20, 99);
  a.randomize({ seed: 99, sandChance: 0.2, waterChance: 0.1, oilChance: 0.05, wallChance: 0.03 });
  b.randomize({ seed: 99, sandChance: 0.2, waterChance: 0.1, oilChance: 0.05, wallChance: 0.03 });
  a.stepMany(40);
  b.stepMany(40);
  assert.deepStrictEqual(a.cells, b.cells);
});

test('randomize is deterministic and lands every material', function () {
  const a = grid(40, 40, 3);
  const b = grid(40, 40, 3);
  const opts = { seed: 3, sandChance: 0.2, waterChance: 0.1, oilChance: 0.06, wallChance: 0.05 };
  a.randomize(opts);
  b.randomize(opts);
  assert.deepStrictEqual(a.cells, b.cells);
  const c = a.counts();
  assert.strictEqual(c.sand + c.water + c.oil + c.wall + c.empty, 40 * 40);
  assert.ok(c.wall > 0 && c.sand > 0 && c.water > 0 && c.oil > 0, 'each material should appear');
});

test('paint fills a disc of the chosen material', function () {
  const s = grid(11, 11);
  s.paint(5, 5, 2, SAND);
  assert.strictEqual(s.get(5, 5), SAND);
  assert.strictEqual(s.get(7, 5), SAND);
  assert.strictEqual(s.get(8, 5), EMPTY, 'outside the radius stays empty');
  assert.strictEqual(s.counts().sand, 13, 'radius-2 disc has 13 cells');
});

test('emit drops a grain in the top row only when empty', function () {
  const s = grid(3, 3);
  s.emit(1, SAND);
  assert.strictEqual(s.get(1, 0), SAND);
  s.emit(1, WATER); // occupied -> no change
  assert.strictEqual(s.get(1, 0), SAND);
});

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
