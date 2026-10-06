/* test.js — executable specification for the raycasting horror core
 * (raycast.js).
 *
 * Run with:  node test.js
 * No dependencies: uses Node's built-in assert only.
 *
 * The tests pin down the engine properties: DDA distance and hit side, the
 * field of view, distance fog, the dread ramp, wall-sliding movement, a
 * pursuer that cannot cross walls, and a procedural level that is fully
 * connected with the exit at the farthest cell.
 */
'use strict';

const assert = require('assert');
const H = require('./raycast.js');

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

/* An 8x8 box: solid border, open 6x6 interior. */
function openWorld(cols, rows) {
  const w = new H.World(cols || 8, rows || 8);
  for (let y = 1; y < (rows || 8) - 1; y++) {
    for (let x = 1; x < (cols || 8) - 1; x++) w.set(x, y, H.FLOOR);
  }
  return w;
}

/* Independent BFS distance map over walkable cells. */
function bfs(world, sx, sy) {
  const cols = world.cols;
  const dist = new Int32Array(cols * world.rows).fill(-1);
  const q = [sy * cols + sx];
  dist[sy * cols + sx] = 0;
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    const x = i % cols;
    const y = (i / cols) | 0;
    const n = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
    for (let k = 0; k < 4; k++) {
      const nx = n[k][0];
      const ny = n[k][1];
      if (world.isWalkable(nx, ny) && dist[ny * cols + nx] === -1) {
        dist[ny * cols + nx] = dist[i] + 1;
        q.push(ny * cols + nx);
      }
    }
  }
  return dist;
}

/* ------------------------------------------------------------------ */

test('World treats the outside as solid wall', function () {
  const w = openWorld();
  assert.strictEqual(w.get(-1, 0), H.WALL);
  assert.strictEqual(w.get(0, 0), H.WALL);
  assert.strictEqual(w.get(1, 1), H.FLOOR);
  assert.ok(w.isWalkable(1, 1));
  assert.ok(!w.isWalkable(0, 0));
  assert.ok(!w.isWalkable(8, 8));
});

test('castRay measures the distance to the wall face (east and west)', function () {
  const w = openWorld();
  const east = H.castRay(w, 1.5, 1.5, 0, 64);
  assert.strictEqual(east.hit, true);
  assert.ok(Math.abs(east.dist - 5.5) < 1e-9, 'east dist was ' + east.dist);
  assert.strictEqual(east.side, 0, 'east hit is an x-side');

  const west = H.castRay(w, 1.5, 1.5, Math.PI, 64);
  assert.ok(Math.abs(west.dist - 0.5) < 1e-9, 'west dist was ' + west.dist);
  assert.strictEqual(west.side, 0);
});

test('castRay measures distance and side for north and south', function () {
  const w = openWorld();
  const north = H.castRay(w, 1.5, 1.5, -Math.PI / 2, 64);
  assert.ok(Math.abs(north.dist - 0.5) < 1e-9, 'north dist was ' + north.dist);
  assert.strictEqual(north.side, 1, 'north hit is a y-side');

  const south = H.castRay(w, 1.5, 1.5, Math.PI / 2, 64);
  assert.ok(Math.abs(south.dist - 5.5) < 1e-9, 'south dist was ' + south.dist);
  assert.strictEqual(south.side, 1);
});

test('castRay reports the wall cell it hit', function () {
  const w = openWorld();
  const east = H.castRay(w, 1.5, 1.5, 0, 64);
  assert.strictEqual(east.mapX, 7);
  assert.strictEqual(east.mapY, 1);
});

test('castRay gives up when nothing is within maxDist', function () {
  const w = openWorld();
  const r = H.castRay(w, 1.5, 1.5, 0, 2);
  assert.strictEqual(r.hit, false);
  assert.strictEqual(r.dist, 2);
});

test('castColumns returns one finite ray per column', function () {
  const w = openWorld();
  const cols = H.castColumns(w, 4.5, 4.5, 0, Math.PI / 3, 40, 64);
  assert.strictEqual(cols.length, 40);
  for (const c of cols) {
    assert.ok(Number.isFinite(c.dist) && c.dist > 0, 'ray distance must be positive and finite');
  }
});

test('fogFactor is zero at the eye, monotonic, and bounded', function () {
  assert.strictEqual(H.fogFactor(0, 0.5), 0);
  let prev = -1;
  for (let d = 0.5; d <= 40; d += 0.5) {
    const f = H.fogFactor(d, 0.5);
    assert.ok(f >= 0 && f <= 1, 'fog out of range at ' + d + ': ' + f);
    assert.ok(f >= prev, 'fog must not decrease with distance');
    prev = f;
  }
  assert.ok(H.fogFactor(400, 0.5) > 0.99, 'far distance is nearly opaque');
});

test('Atmosphere ramps dread over time and thickens the fog', function () {
  const a = new H.Atmosphere({ rampSeconds: 50 });
  assert.strictEqual(a.dread, 0);
  const fog0 = a.fogDensity();
  a.update(25);
  assert.ok(Math.abs(a.dread - 0.5) < 1e-9, 'half time should be half dread');
  assert.ok(a.fogDensity() > fog0, 'fog thickens as dread rises');
  a.update(1000);
  assert.strictEqual(a.dread, 1, 'dread clamps at 1');
  assert.ok(a.staticAmount() > 0.3, 'static rises with dread');
});

test('Player cannot walk into a wall but slides along it', function () {
  const w = openWorld();
  const p = new H.Player(2.5, 1.5, 0);
  assert.ok(!p.tryMove(w, 0, -1), 'moving into the north wall must fail');
  assert.strictEqual(p.y, 1.5, 'blocked axis stays put');
  assert.ok(p.tryMove(w, 1, -1), 'the free axis still moves');
  assert.ok(p.x > 2.5, 'the player slid east');
  assert.strictEqual(p.y, 1.5, 'the blocked axis did not move');
});

test('Player.turn adjusts the heading', function () {
  const p = new H.Player(1, 1, 0);
  p.turn(Math.PI / 2);
  assert.ok(Math.abs(p.angle - Math.PI / 2) < 1e-9);
});

test('Stalker closes the distance on open floor', function () {
  const w = openWorld();
  const s = new H.Stalker(1.5, 1.5);
  const before = s.distanceTo(6.5, 6.5);
  for (let i = 0; i < 120; i++) s.step(w, 6.5, 6.5, 1 / 60, 2);
  const after = s.distanceTo(6.5, 6.5);
  assert.ok(after < before - 1, 'stalker should close in (' + before + ' -> ' + after + ')');
});

test('Stalker never ends up inside a wall', function () {
  const level = H.generateLevel({ cols: 21, rows: 21, seed: 7 });
  const w = level.world;
  const s = new H.Stalker(level.exit.x, level.exit.y);
  for (let i = 0; i < 600; i++) s.step(w, level.start.x, level.start.y, 1 / 60, 2.5);
  assert.ok(w.isWalkable(Math.floor(s.x), Math.floor(s.y)), 'stalker passed into a wall');
});

test('generateLevel carves a connected maze with a far exit', function () {
  const level = H.generateLevel({ cols: 25, rows: 25, seed: 3 });
  const w = level.world;

  assert.strictEqual(w.cols % 2, 1, 'dimensions are forced odd');
  for (let x = 0; x < w.cols; x++) {
    assert.strictEqual(w.get(x, 0), H.WALL, 'top border must stay solid');
    assert.strictEqual(w.get(x, w.rows - 1), H.WALL, 'bottom border must stay solid');
  }

  assert.ok(w.isWalkable(1, 1), 'start cell is floor');
  assert.ok(w.isWalkable(level.exit.cell[0], level.exit.cell[1]), 'exit cell is walkable');
  assert.strictEqual(w.get(level.exit.cell[0], level.exit.cell[1]), H.EXIT, 'exit is marked');

  // Every floor cell is reachable from the start (a perfect maze is connected).
  const dist = bfs(w, 1, 1);
  let reachable = 0;
  let maxDist = 0;
  for (let y = 0; y < w.rows; y++) {
    for (let x = 0; x < w.cols; x++) {
      if (w.isWalkable(x, y)) {
        assert.ok(dist[y * w.cols + x] >= 0, 'floor cell ' + x + ',' + y + ' is unreachable');
        reachable++;
        if (dist[y * w.cols + x] > maxDist) maxDist = dist[y * w.cols + x];
      }
    }
  }
  assert.strictEqual(reachable, w.floorCount(), 'reachable count equals floor count');

  // The exit sits at the farthest cell from the start.
  const exitDist = dist[level.exit.cell[1] * w.cols + level.exit.cell[0]];
  assert.strictEqual(exitDist, maxDist, 'exit must be the farthest cell (' + exitDist + ' vs ' + maxDist + ')');
});

test('generateLevel is deterministic per seed', function () {
  const a = H.generateLevel({ cols: 25, rows: 25, seed: 42 });
  const b = H.generateLevel({ cols: 25, rows: 25, seed: 42 });
  assert.deepStrictEqual(a.world.tiles, b.world.tiles);
  assert.deepStrictEqual(a.exit.cell, b.exit.cell);
  assert.deepStrictEqual(a.start, b.start);

  const c = H.generateLevel({ cols: 25, rows: 25, seed: 43 });
  assert.notDeepStrictEqual(a.world.tiles, c.world.tiles);
});

/* Cell path from (sx, sy) to a goal cell, via BFS. Returns null if none. */
function bfsPath(world, sx, sy, goalCell) {
  const cols = world.cols;
  const start = sy * cols + sx;
  const goal = goalCell[1] * cols + goalCell[0];
  const prev = new Int32Array(cols * world.rows).fill(-2);
  prev[start] = -1;
  const q = [start];
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    if (i === goal) {
      const path = [];
      let cur = i;
      while (cur !== -1) {
        path.push([cur % cols, (cur / cols) | 0]);
        cur = prev[cur];
      }
      return path.reverse();
    }
    const x = i % cols;
    const y = (i / cols) | 0;
    const n = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
    for (let k = 0; k < 4; k++) {
      const nx = n[k][0];
      const ny = n[k][1];
      if (world.isWalkable(nx, ny) && prev[ny * cols + nx] === -2) {
        prev[ny * cols + nx] = i;
        q.push(ny * cols + nx);
      }
    }
  }
  return null;
}

/* Nudge the player toward a target, in small steps, using the real movement. */
function walkTo(player, world, tx, ty) {
  for (let i = 0; i < 400; i++) {
    const dx = tx - player.x;
    const dy = ty - player.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) return true;
    const step = Math.min(0.05, d);
    player.tryMove(world, (dx / d) * step, (dy / d) * step);
  }
  return Math.hypot(tx - player.x, ty - player.y) < 0.1;
}

test('a run is winnable: the player can walk from the start to the exit', function () {
  for (const seed of [1, 5, 19, 77]) {
    const level = H.generateLevel({ cols: 21, rows: 21, seed: seed });
    const w = level.world;
    const p = new H.Player(level.start.x, level.start.y, level.start.angle);

    const path = bfsPath(w, 1, 1, level.exit.cell);
    assert.ok(path, 'seed ' + seed + ': a path must exist');

    for (let i = 1; i < path.length; i++) {
      const ok = walkTo(p, w, path[i][0] + 0.5, path[i][1] + 0.5);
      assert.ok(ok, 'seed ' + seed + ': player stuck at cell ' + path[i][0] + ',' + path[i][1]);
    }
    assert.ok(
      Math.hypot(p.x - level.exit.x, p.y - level.exit.y) < 0.7,
      'seed ' + seed + ': player should reach the exit'
    );
  }
});

/* ------------------------------------------------------------------ */
/* shop, collectibles, map, difficulty                                */
/* ------------------------------------------------------------------ */

test('the item catalogue is well-formed', function () {
  const ids = {};
  for (const item of H.ITEMS) {
    assert.ok(item.id && typeof item.id === 'string', 'every item needs an id');
    assert.ok(!ids[item.id], 'duplicate item id: ' + item.id);
    ids[item.id] = true;
    assert.ok(item.name && item.blurb, item.id + ' needs a name and blurb');
    assert.ok(Number.isFinite(item.cost) && item.cost > 0, item.id + ' needs a positive cost');
    for (const key in item.effects) {
      assert.ok(H.EFFECT_RULES[key], item.id + ' uses an unknown effect: ' + key);
      assert.ok(key in H.DEFAULT_EFFECTS, item.id + ' effect missing from defaults: ' + key);
    }
  }
  assert.ok(H.ITEMS.length >= 8, 'there should be a solid catalogue');
  assert.strictEqual(H.ITEM_BY_ID['signal-tap'].name, 'Signal Tap');
});

test('applyItems starts from the defaults and combines effects', function () {
  const none = H.applyItems([]);
  assert.deepStrictEqual(none, H.DEFAULT_EFFECTS);
  assert.strictEqual(H.applyItems(null).fogMul, 1, 'a missing list is treated as empty');

  assert.strictEqual(H.applyItems(['signal-tap']).seeStalker, true);
  assert.strictEqual(H.applyItems(['dead-reckoning']).seeExit, true);
  assert.strictEqual(H.applyItems(['heart-monitor']).proximity, true);
  assert.strictEqual(H.applyItems(['adrenal']).speedMul, 1.18);

  const foggy = H.applyItems(['gas-mask', 'cold-cathode']);
  assert.ok(Math.abs(foggy.fogMul - 0.75 * 0.55) < 1e-9, 'fog multipliers compound');
  assert.strictEqual(foggy.light, 0.6, 'light is a maximum, not a sum');

  const steady = H.applyItems(['isolator']);
  assert.strictEqual(steady.shakeMul, 0.35);
  assert.strictEqual(steady.glitchMul, 0.4);
  assert.strictEqual(H.applyItems(['slow-tape']).dreadMul, 0.7);
});

test('wards stack while map and magnet effects take the maximum', function () {
  assert.strictEqual(H.applyItems(['palindrome-ward', 'palindrome-ward']).ward, 2);
  assert.strictEqual(H.applyItems(['cartographer']).mapRadius, 10);
  assert.strictEqual(H.applyItems(['cartographer', 'cartographer']).mapRadius, 10, 'max, not sum');
  assert.strictEqual(H.applyItems(['tape-magnet']).pickupRadius, 1.8);
});

test('applyItems ignores unknown ids so a stale save cannot break a run', function () {
  const eff = H.applyItems(['not-a-real-item', 'signal-tap']);
  assert.strictEqual(eff.seeStalker, true);
  assert.strictEqual(eff.fogMul, 1);
});

test('canBuy enforces cost, ownership, and stacking', function () {
  assert.deepStrictEqual(H.canBuy([], 'nope', 999), { ok: false, reason: 'unknown' });
  assert.strictEqual(H.canBuy([], 'gas-mask', 24).reason, 'shards');
  assert.strictEqual(H.canBuy([], 'gas-mask', 25).ok, true);
  assert.strictEqual(H.canBuy(['gas-mask'], 'gas-mask', 999).reason, 'owned');
  assert.strictEqual(H.canBuy(['palindrome-ward'], 'palindrome-ward', 60).ok, true, 'wards stack');
  assert.strictEqual(H.canBuy(['palindrome-ward'], 'palindrome-ward', 59).reason, 'shards');
});

test('placeCollectibles scatters tapes on walkable cells deterministically', function () {
  const a = H.generateLevel({ cols: 25, rows: 25, seed: 4 });
  const b = H.generateLevel({ cols: 25, rows: 25, seed: 4 });
  const tapesA = H.placeCollectibles(a.world, 8, H.makeRng(99));
  const tapesB = H.placeCollectibles(b.world, 8, H.makeRng(99));

  assert.strictEqual(tapesA.length, 8);
  assert.deepStrictEqual(tapesA, tapesB, 'the same seed places the same tapes');

  const seen = {};
  for (const t of tapesA) {
    assert.ok(a.world.isWalkable(Math.floor(t.x), Math.floor(t.y)), 'tape must sit on floor');
    assert.notStrictEqual(a.world.get(Math.floor(t.x), Math.floor(t.y)), H.EXIT, 'not on the exit');
    assert.ok(Math.hypot(t.x - 1.5, t.y - 1.5) >= 4, 'not right next to the start');
    const key = t.cell[0] + ',' + t.cell[1];
    assert.ok(!seen[key], 'no two tapes share a cell');
    seen[key] = true;
  }
});

test('collectNear takes only the tapes inside the radius', function () {
  const tapes = [
    { x: 1.5, y: 1.5, taken: false },
    { x: 5.0, y: 5.0, taken: false },
    { x: 1.9, y: 1.6, taken: false },
  ];
  const got = HorrorLib.collectNear(tapes, 1.5, 1.5, 0.3);
  assert.equal(got.length, 1);
  assert.equal(tapes[0].taken, true);
  assert.equal(tapes[2].taken, false);
  const again = HorrorLib.collectNear(tapes, 1.5, 1.5, 5);
  assert.equal(again.length, 2);
  assert.equal(tapes[1].taken, true);
  assert.equal(HorrorLib.collectNear(null, 0, 0, 1).length, 0);
});

test('Explored tracks fog of war within a radius', function () {
  const map = new H.Explored(10, 10);
  assert.strictEqual(map.isSeen(5, 5), false);
  map.reveal(5, 5, 2);
  assert.strictEqual(map.isSeen(5, 5), true);
  assert.strictEqual(map.isSeen(7, 5), true, 'edge of the disc is seen');
  assert.strictEqual(map.isSeen(8, 5), false, 'beyond the radius is not seen');
  assert.strictEqual(map.isSeen(-1, 0), false, 'outside the grid is never seen');
  assert.strictEqual(map.seenCount(), 13, 'a radius-2 disc covers 13 cells');

  const corner = new H.Explored(10, 10);
  corner.reveal(0, 0, 2);
  assert.strictEqual(corner.isSeen(0, 0), true);
  assert.strictEqual(corner.seenCount(), 6, 'revealing at a corner clips to the grid');
});

test('depthSettings grows the maze and quickens the stalker', function () {
  const d1 = H.depthSettings(1);
  assert.strictEqual(d1.cols, 21);
  assert.strictEqual(d1.tapes, 5);
  assert.strictEqual(d1.rampSeconds, 85);
  assert.strictEqual(d1.stalkerSpeed, 0.85);
  assert.strictEqual(d1.escapeBonus, 20);

  const d2 = H.depthSettings(2);
  assert.strictEqual(d2.cols, 25);
  assert.ok(d2.stalkerSpeed > d1.stalkerSpeed, 'the stalker speeds up with depth');
  assert.ok(d2.rampSeconds < d1.rampSeconds, 'dread arrives sooner with depth');
  assert.strictEqual(d2.escapeBonus, 32);

  const deep = H.depthSettings(100);
  assert.strictEqual(deep.cols, 43, 'the maze size is capped');
  assert.strictEqual(deep.rampSeconds, 45, 'the ramp is floored');
  assert.strictEqual(deep.tapes, 12, 'tape count is capped');
  for (const d of [1, 2, 3, 4, 5]) assert.strictEqual(H.depthSettings(d).cols % 2, 1, 'maze stays odd-sized');
});

test('hiding buys dread relief, but it is capped and worn off by moving', function () {
  const a = new H.Atmosphere({ rampSeconds: 100 });
  assert.strictEqual(a.relief, 0);
  assert.ok(a.maxRelief > 0 && a.maxRelief < 1, 'relief can never make you fully safe');

  // run the ramp to full dread, then hide
  for (let i = 0; i < 200; i++) a.update(0.5);
  assert.strictEqual(a.dread, 1);
  a.calm(1);
  assert.ok(a.relief > 0, 'hiding builds relief');
  a.update(0); // dread is derived in update(), like every other frame
  assert.ok(a.dread < 1, 'relief lowers dread');

  // hold still for a long time: relief saturates at the cap
  for (let i = 0; i < 100; i++) a.calm(1);
  assert.strictEqual(a.relief, a.maxRelief);
  a.update(0);
  assert.ok(a.dread > 0, 'there is no way to hide the dread away entirely');

  // moving again gives the dread back
  const hid = a.dread;
  for (let i = 0; i < 100; i++) a.relax(1);
  assert.strictEqual(a.relief, 0);
  a.update(0);
  assert.ok(a.dread > hid, 'relief is worn off by moving');
  assert.strictEqual(a.dread, 1);
});

test('the red tint stays low enough to steer by', function () {
  const a = new H.Atmosphere({ rampSeconds: 10 });
  a.update(10);
  assert.strictEqual(a.dread, 1);
  // Never more than a quarter-opacity wash, or the geometry stops reading.
  assert.ok(a.tintAmount() <= 0.25, 'tint at full dread stays readable, got ' + a.tintAmount());
  assert.ok(a.tintAmount() < 0.5, 'tint was reduced from the old 0.5 wash');
  assert.ok(a.staticAmount() > 0.3, 'static still rises with dread');
  // every mood channel stays monotonic in dread
  const b = new H.Atmosphere({ rampSeconds: 10 });
  b.update(5);
  assert.ok(a.fogDensity() > b.fogDensity() && a.shake() > b.shake());
  assert.ok(a.glitchChance() > b.glitchChance() && a.staticAmount() > b.staticAmount());
});

test('hiding does not stop the tape: progress keeps climbing under relief', function () {
  const a = new H.Atmosphere({ rampSeconds: 10 });
  for (let i = 0; i < 50; i++) a.calm(1);
  a.update(5);
  assert.strictEqual(a.progress(), 0.5, 'the raw ramp is unaffected by hiding');
  assert.ok(a.dread < 0.5, 'but the dread is suppressed by it');
  assert.strictEqual(a.relief, a.maxRelief);
});

test('Explored can reveal and clear the whole grid', function () {
  const e = new H.Explored(6, 4);
  assert.strictEqual(e.seenCount(), 0);
  e.revealAll();
  assert.strictEqual(e.seenCount(), 24);
  assert.ok(e.isSeen(0, 0) && e.isSeen(5, 3));
  e.clear();
  assert.strictEqual(e.seenCount(), 0);
});

/* ------------------------------------------------------------------ */
/* the den, the solver, and what the presence does                     */
/* ------------------------------------------------------------------ */

/* Independent breadth-first distance, so the solver is checked against a
 * second implementation rather than against itself. */
function bfsDistance(world, sx, sy, gx, gy) {
  const cols = world.cols;
  const dist = {};
  const queue = [[sx, sy]];
  dist[sx + ',' + sy] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const d = dist[cell[0] + ',' + cell[1]];
    if (cell[0] === gx && cell[1] === gy) return d;
    for (const step of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = cell[0] + step[0];
      const ny = cell[1] + step[1];
      const key = nx + ',' + ny;
      if (key in dist) continue;
      if (!world.isWalkable(nx, ny)) continue;
      dist[key] = d + 1;
      queue.push([nx, ny]);
    }
  }
  return null;
}

test('the den is a far dead end, and it is never the exit', function () {
  const level = H.generateLevel({ cols: 25, rows: 25, seed: 11 });
  const den = level.den;
  assert.ok(den, 'a level carries a den');
  assert.strictEqual(level.world.get(den.cell[0], den.cell[1]), H.DEN, 'the den tile is placed');
  assert.ok(level.world.isWalkable(den.cell[0], den.cell[1]), 'you can walk into the den');
  assert.ok(H.isDeadEnd(level.world, den.cell[0], den.cell[1]), 'it beds down in a dead end');
  assert.notDeepStrictEqual(den.cell, level.exit.cell, 'the den is not the exit');
  assert.notDeepStrictEqual(den.cell, [1, 1], 'and it is not the spawn point');

  const toDen = H.farthestCell(level.world, 1, 1);
  assert.ok(Math.hypot(den.x - 1.5, den.y - 1.5) > 4, 'it is a long walk away');
  assert.ok(toDen, 'sanity: the maze is connected');
});

test('solvePath returns a shortest route, checked against a second BFS', function () {
  const level = H.generateLevel({ cols: 21, rows: 21, seed: 5 });
  const world = level.world;
  const path = H.solvePath(world, 1.5, 1.5, level.exit.x, level.exit.y);
  assert.ok(Array.isArray(path), 'a reachable exit has a route');

  // endpoints line up with the cells we asked for
  assert.deepStrictEqual(path[0], [1, 1]);
  assert.deepStrictEqual(path[path.length - 1], level.exit.cell);

  // every step is one cell, orthogonal, and on walkable floor
  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i][0] - path[i - 1][0]);
    const dy = Math.abs(path[i][1] - path[i - 1][1]);
    assert.strictEqual(dx + dy, 1, 'steps are orthogonal single cells');
    assert.ok(world.isWalkable(path[i][0], path[i][1]), 'and walkable');
  }
  assert.ok(!path.some(function (c) { return world.get(c[0], c[1]) === H.WALL; }), 'never through a wall');

  // and it is genuinely the shortest one
  const best = bfsDistance(world, 1, 1, level.exit.cell[0], level.exit.cell[1]);
  assert.strictEqual(path.length, best + 1, 'path length is the BFS distance, so it is optimal');

  // no route between sealed rooms
  const sealed = new H.World(4, 4);
  sealed.set(1, 1, H.FLOOR);
  sealed.set(2, 2, H.FLOOR);
  assert.strictEqual(H.solvePath(sealed, 1.5, 1.5, 2.5, 2.5), null, 'no route reports null');
  assert.strictEqual(H.solvePath(sealed, 1.5, 1.5, 0.5, 0.5), null, 'a walled goal reports null');
  assert.deepStrictEqual(H.solvePath(sealed, 1.5, 1.5, 1.5, 1.5), [[1, 1]], 'standing still is a one-cell path');
});

/* Trace the stalker for a while and record the moods it passes through. */
function stalkerMoods(steps, dt, lookedAt) {
  const world = new H.World(9, 9);
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) world.set(x, y, H.FLOOR);
  const it = new H.Stalker(7.5, 1.5);
  it.setHome(1.5, 7.5);
  const seen = [];
  for (let i = 0; i < steps; i++) {
    const mood = it.update(world, 5.5, 5.5, dt, 1, { lookedAt: lookedAt, rng: 0 });
    if (seen[seen.length - 1] !== mood) seen.push(mood);
  }
  return { moods: seen, it: it };
}

test('the presence hunts, withdraws to its den, and comes back', function () {
  const run = stalkerMoods(700, 0.1, false);
  assert.deepStrictEqual(run.moods.slice(0, 4), ['hunt', 'withdraw', 'den', 'hunt'], 'it cycles, it does not just chase');
  assert.ok(run.moods.length > 7, 'and the cycle repeats within a couple of minutes');
  for (let i = 1; i < run.moods.length; i++) {
    assert.notStrictEqual(run.moods[i], run.moods[i - 1], 'it never lingers in the same mood');
  }
  assert.ok(run.it.trips >= 1, 'it went back to bed at least once');
  assert.ok(Math.hypot(run.it.home.x - 1.5, run.it.home.y - 7.5) < 1e-9, 'home is the den');
});

test('being watched sends the presence away, unless it is already close', function () {
  // far away and watched: it leaves
  const spooked = stalkerMoods(200, 0.1, true);
  assert.ok(spooked.moods.indexOf('withdraw') !== -1, 'a clear look pushes it off');
  assert.strictEqual(spooked.moods.indexOf('withdraw') <= 1, true, 'and it reacts quickly');

  // within touching range, watching it does not save you
  const world = new H.World(9, 9);
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) world.set(x, y, H.FLOOR);
  const close = new H.Stalker(5.0, 5.5);
  assert.strictEqual(close.update(world, 5.5, 5.5, 0.1, 1, { lookedAt: true, rng: 0 }), 'hunt');

  // a plain step still walks straight at you, as before
  const plain = new H.Stalker(7.5, 5.5);
  const before = plain.distanceTo(5.5, 5.5);
  plain.step(world, 5.5, 5.5, 0.5, 2);
  assert.ok(plain.distanceTo(5.5, 5.5) < before, 'step() closes the distance');
});

test('the surveyor\u2019s rite is expensive, one-shot, and reveals the route', function () {
  const rite = H.ITEM_BY_ID['surveyors-rite'];
  assert.ok(rite, 'the rite is in the catalogue');
  assert.ok(rite.cost >= 50, 'it costs many shards, and it should');
  assert.strictEqual(rite.effects.survey, true);
  assert.strictEqual(H.applyItems(['surveyors-rite']).survey, true);
  assert.strictEqual(H.applyItems([]).survey, false, 'and it is off by default');
  assert.strictEqual(rite.stackable, true, 'it can be re-bought for the next tape');

  // whatever it reveals is a real route to the exit
  const level = H.generateLevel({ cols: 21, rows: 21, seed: 8 });
  const path = H.solvePath(level.world, level.start.x, level.start.y, level.exit.x, level.exit.y);
  assert.ok(path && path.length > 1, 'the revealed route has cells in it');
  assert.deepStrictEqual(path[path.length - 1], level.exit.cell, 'and it ends on the exit');
});

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
