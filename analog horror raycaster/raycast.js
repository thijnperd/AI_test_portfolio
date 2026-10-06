/* raycast.js — raycasting horror core.
 *
 * Pure logic, no DOM: runs in the browser (as `HorrorLib`) and in Node
 * (`module.exports`) so the engine can be tested with `node test.js`.
 *
 * Contents:
 *   World        — the tile grid (walls / floor / exit)
 *   generateLevel — a procedural, seeded perfect maze with a start and a far exit
 *   castRay      — DDA ray casting (perpendicular wall distance + hit side)
 *   castColumns  — one ray per screen column for a field of view
 *   fogFactor    — distance fog, density driven by dread
 *   Atmosphere   — the creepiness ramp that feeds fog, static, and speed
 *   Player       — axis-separated movement with wall collision
 *   Stalker      — a greedy pursuer that can never pass through a wall
 *
 * Angles follow screen space: +x is east, +y is south (down), so angle 0 faces
 * east and angle increases clockwise.
 */
(function (global) {
  'use strict';

  const WALL = 1;
  const FLOOR = 0;
  const EXIT = 2;
  const DEN = 3;  // where IT beds down; entering it is the other ending

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ */
  /* World                                                              */
  /* ------------------------------------------------------------------ */

  class World {
    constructor(cols, rows) {
      this.cols = cols | 0;
      this.rows = rows | 0;
      this.tiles = new Uint8Array(this.cols * this.rows).fill(WALL);
    }

    idx(x, y) {
      return y * this.cols + x;
    }

    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
    }

    /* Out-of-bounds reads are solid wall, so rays never leave the map. */
    get(x, y) {
      return this.inBounds(x, y) ? this.tiles[this.idx(x, y)] : WALL;
    }

    set(x, y, type) {
      if (this.inBounds(x, y)) this.tiles[this.idx(x, y)] = type;
    }

    isWall(x, y) {
      return this.get(x, y) === WALL;
    }

    isWalkable(x, y) {
      return this.inBounds(x, y) && this.tiles[this.idx(x, y)] !== WALL;
    }

    /* Number of non-wall cells. */
    floorCount() {
      let n = 0;
      for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] !== WALL) n++;
      return n;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Level generation (seeded perfect maze)                              */
  /* ------------------------------------------------------------------ */

  const STEP = [[0, -2], [0, 2], [-2, 0], [2, 0]];

  /* Carve a perfect maze on the odd cells of the grid and place the start at
   * (1,1) and the exit at the cell farthest from it. */
  function generateLevel(opts) {
    const o = opts || {};
    let cols = o.cols || 25;
    let rows = o.rows || 25;
    if (cols % 2 === 0) cols++;
    if (rows % 2 === 0) rows++;
    cols = Math.max(5, cols);
    rows = Math.max(5, rows);
    const seed = (o.seed >>> 0) || 1;
    const rng = makeRng(seed);

    const world = new World(cols, rows);
    const stack = [[1, 1]];
    world.set(1, 1, FLOOR);

    while (stack.length > 0) {
      const cur = stack[stack.length - 1];
      const options = [];
      for (let i = 0; i < STEP.length; i++) {
        const nx = cur[0] + STEP[i][0];
        const ny = cur[1] + STEP[i][1];
        if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && world.get(nx, ny) === WALL) {
          options.push([nx, ny, STEP[i][0] / 2, STEP[i][1] / 2]);
        }
      }
      if (options.length === 0) {
        stack.pop();
        continue;
      }
      const next = options[Math.floor(rng() * options.length)];
      world.set(cur[0] + next[2], cur[1] + next[3], FLOOR);
      world.set(next[0], next[1], FLOOR);
      stack.push([next[0], next[1]]);
    }

    const far = farthestCell(world, 1, 1);
    world.set(far[0], far[1], EXIT);

    // IT beds down in the farthest dead end, which is almost never the exit.
    const denCell = farthestDeadEnd(world, 1, 1, far);
    world.set(denCell[0], denCell[1], DEN);

    return {
      world: world,
      seed: seed,
      start: { x: 1.5, y: 1.5, angle: faceOpen(world, 1, 1) },
      exit: { x: far[0] + 0.5, y: far[1] + 0.5, cell: far },
      den: { x: denCell[0] + 0.5, y: denCell[1] + 0.5, cell: denCell },
    };
  }

  /* BFS over walkable cells; returns the farthest cell from (sx, sy). */
  function farthestCell(world, sx, sy) {
    const cols = world.cols;
    const dist = new Int32Array(cols * world.rows).fill(-1);
    const queue = [sy * cols + sx];
    dist[sy * cols + sx] = 0;
    let best = [sx, sy];
    let bestDist = 0;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const x = i % cols;
      const y = (i / cols) | 0;
      if (dist[i] > bestDist) {
        bestDist = dist[i];
        best = [x, y];
      }
      const next = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
      for (let k = 0; k < 4; k++) {
        const nx = next[k][0];
        const ny = next[k][1];
        if (world.isWalkable(nx, ny) && dist[ny * cols + nx] === -1) {
          dist[ny * cols + nx] = dist[i] + 1;
          queue.push(ny * cols + nx);
        }
      }
    }
    return best;
  }

  /* Open on exactly one side — the pockets of a maze. */
  function isDeadEnd(world, x, y) {
    if (!world.isWalkable(x, y)) return false;
    let open = 0;
    if (world.isWalkable(x, y - 1)) open++;
    if (world.isWalkable(x, y + 1)) open++;
    if (world.isWalkable(x - 1, y)) open++;
    if (world.isWalkable(x + 1, y)) open++;
    return open === 1;
  }

  /* BFS over walkable cells; the farthest dead end from (sx, sy), ignoring the
   * exit (and the start cell itself). Falls back to the start when a maze is
   * too small to have one. */
  function farthestDeadEnd(world, sx, sy, exclude) {
    const cols = world.cols;
    const dist = new Int32Array(cols * world.rows).fill(-1);
    const queue = [sy * cols + sx];
    dist[sy * cols + sx] = 0;
    let best = null;
    let bestDist = 0;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const x = i % cols;
      const y = (i / cols) | 0;
      const isExcluded = exclude && x === exclude[0] && y === exclude[1];
      if (!isExcluded && dist[i] > 0 && dist[i] > bestDist && isDeadEnd(world, x, y)) {
        bestDist = dist[i];
        best = [x, y];
      }
      const next = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
      for (let k = 0; k < 4; k++) {
        const nx = next[k][0];
        const ny = next[k][1];
        if (world.isWalkable(nx, ny) && dist[ny * cols + nx] === -1) {
          dist[ny * cols + nx] = dist[i] + 1;
          queue.push(ny * cols + nx);
        }
      }
    }
    return best || [sx, sy];
  }

  /* Shortest route between two cells, in the same spirit as the BFS solver in
   * the `maze generator and solver` project: breadth-first over walkable cells,
   * then walk the parent links back. Returns [x, y] cells from start to goal
   * inclusive, or null when there is no route. */
  function solvePath(world, fromX, fromY, toX, toY) {
    const cols = world.cols;
    const sx = Math.floor(fromX);
    const sy = Math.floor(fromY);
    const gx = Math.floor(toX);
    const gy = Math.floor(toY);
    if (!world.isWalkable(sx, sy) || !world.isWalkable(gx, gy)) return null;
    const start = sy * cols + sx;
    const goal = gy * cols + gx;
    if (start === goal) return [[sx, sy]];

    const prev = new Int32Array(cols * world.rows).fill(-1);
    const seen = new Uint8Array(cols * world.rows);
    const queue = [start];
    seen[start] = 1;
    let found = false;
    for (let head = 0; head < queue.length && !found; head++) {
      const i = queue[head];
      const x = i % cols;
      const y = (i / cols) | 0;
      const next = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
      for (let k = 0; k < 4; k++) {
        const nx = next[k][0];
        const ny = next[k][1];
        if (!world.isWalkable(nx, ny)) continue;
        const ni = ny * cols + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        prev[ni] = i;
        if (ni === goal) {
          found = true;
          break;
        }
        queue.push(ni);
      }
    }
    if (!found) return null;

    const path = [];
    let cur = goal;
    while (cur !== start) {
      path.push([cur % cols, (cur / cols) | 0]);
      cur = prev[cur];
      if (cur < 0) return null;
    }
    path.push([sx, sy]);
    path.reverse();
    return path;
  }

  /* Angle (radians) toward an adjacent open cell, preferring east. */
  function faceOpen(world, cx, cy) {
    if (world.isWalkable(cx + 1, cy)) return 0;
    if (world.isWalkable(cx, cy + 1)) return Math.PI / 2;
    if (world.isWalkable(cx - 1, cy)) return Math.PI;
    if (world.isWalkable(cx, cy - 1)) return -Math.PI / 2;
    return 0;
  }

  /* ------------------------------------------------------------------ */
  /* Ray casting (DDA)                                                   */
  /* ------------------------------------------------------------------ */

  /* Cast one ray and return the perpendicular wall distance, the hit side
   * (0 = x side, 1 = y side), and the wall cell that was hit. */
  function castRay(world, ox, oy, angle, maxDist) {
    const limit = maxDist == null ? 64 : maxDist;
    const rdx = Math.cos(angle);
    const rdy = Math.sin(angle);
    let mapX = Math.floor(ox);
    let mapY = Math.floor(oy);

    const deltaX = rdx === 0 ? Infinity : Math.abs(1 / rdx);
    const deltaY = rdy === 0 ? Infinity : Math.abs(1 / rdy);

    let stepX;
    let stepY;
    let sideDistX;
    let sideDistY;
    if (rdx < 0) {
      stepX = -1;
      sideDistX = (ox - mapX) * deltaX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - ox) * deltaX;
    }
    if (rdy < 0) {
      stepY = -1;
      sideDistY = (oy - mapY) * deltaY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - oy) * deltaY;
    }

    let side = 0;
    let traveled = 0;
    while (traveled < limit) {
      if (sideDistX < sideDistY) {
        traveled = sideDistX;
        sideDistX += deltaX;
        mapX += stepX;
        side = 0;
      } else {
        traveled = sideDistY;
        sideDistY += deltaY;
        mapY += stepY;
        side = 1;
      }
      if (world.isWall(mapX, mapY)) {
        return {
          hit: true,
          dist: traveled, // perpendicular distance (no fisheye)
          side: side,
          mapX: mapX,
          mapY: mapY,
          angle: angle,
        };
      }
    }
    return { hit: false, dist: limit, side: side, mapX: mapX, mapY: mapY, angle: angle };
  }

  /* One ray per screen column across a field of view. */
  function castColumns(world, ox, oy, dir, fov, count, maxDist) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const angle = dir - fov / 2 + ((i + 0.5) / count) * fov;
      out.push(castRay(world, ox, oy, angle, maxDist));
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Fog                                                                 */
  /* ------------------------------------------------------------------ */

  /* Distance fog in [0, 1]: 0 at the eye, approaching 1 far away. */
  function fogFactor(dist, density) {
    if (!(dist > 0) || density <= 0) return 0;
    return clamp(1 - Math.exp(-density * dist), 0, 1);
  }

  /* ------------------------------------------------------------------ */
  /* Atmosphere — the slowly rising dread that drives the mood           */
  /* ------------------------------------------------------------------ */

  class Atmosphere {
    constructor(opts) {
      const o = opts || {};
      this.time = 0;
      this.rampSeconds = o.rampSeconds || 75;
      this.dread = 0;
      /* Suppression bought by hiding. The raw ramp keeps climbing underneath,
       * so hiding slows the dread down but can never make you safe for good. */
      this.relief = 0;
      this.maxRelief = o.maxRelief == null ? 0.6 : o.maxRelief;
    }

    /* The ramp as it would be with no relief — what the tape is doing to you. */
    progress() {
      return clamp(this.time / this.rampSeconds, 0, 1);
    }

    update(dt) {
      this.time += dt;
      this.dread = clamp(this.progress() - this.relief, 0, 1);
      return this.dread;
    }

    /* Hide: hold still in cover and the dread recedes. Capped by maxRelief. */
    calm(dt, rate) {
      this.relief = clamp(this.relief + (rate == null ? 0.3 : rate) * dt, 0, this.maxRelief);
      return this.relief;
    }

    /* Back on the move, the dread catches up again. */
    relax(dt, rate) {
      this.relief = clamp(this.relief - (rate == null ? 0.55 : rate) * dt, 0, this.maxRelief);
      return this.relief;
    }

    /* Fog thickens as dread rises. */
    fogDensity() {
      return 0.09 + this.dread * 0.85;
    }

    /* Film grain / static amount. */
    staticAmount() {
      return 0.04 + this.dread * 0.28;
    }

    /* Redness of the sickly tint over the scene. Kept low on purpose: past
     * about a third the picture stops being readable, which you cannot steer
     * by, so dread has to express itself through fog, grain and shake instead. */
    tintAmount() {
      return this.dread * 0.2;
    }

    /* Camera shake in pixels. */
    shake() {
      return this.dread * 2.4;
    }

    /* Chance of a glitch slit this frame. */
    glitchChance() {
      return this.dread * 0.35;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Player                                                              */
  /* ------------------------------------------------------------------ */

  class Player {
    constructor(x, y, angle) {
      this.x = x;
      this.y = y;
      this.angle = angle || 0;
      this.radius = 0.22;
    }

    /* A position is standable when all four corners of the body are floor. */
    canStand(world, x, y) {
      const r = this.radius;
      return world.isWalkable(Math.floor(x - r), Math.floor(y - r)) &&
        world.isWalkable(Math.floor(x + r), Math.floor(y - r)) &&
        world.isWalkable(Math.floor(x - r), Math.floor(y + r)) &&
        world.isWalkable(Math.floor(x + r), Math.floor(y + r));
    }

    /* Move in world units, sliding along walls one axis at a time. */
    tryMove(world, dx, dy) {
      let moved = false;
      if (dx !== 0 && this.canStand(world, this.x + dx, this.y)) {
        this.x += dx;
        moved = true;
      }
      if (dy !== 0 && this.canStand(world, this.x, this.y + dy)) {
        this.y += dy;
        moved = true;
      }
      return moved;
    }

    turn(da) {
      this.angle += da;
      return this.angle;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Stalker                                                             */
  /* ------------------------------------------------------------------ */

  /* Default behaviour windows, in seconds. Short hunts and long absences are
   * what make it frightening — a pursuer that never leaves is just a timer. */
  const STALKER_HUNT = 13;
  const STALKER_GRACE = 9;
  /* Watched from further out than this, it leaves. Inside it, it does not. */
  const STALKER_SIGHT_KEEP = 3.3;

  class Stalker {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.radius = 0.3;
      this.home = { x: x, y: y };
      this.mood = 'hunt';   // 'hunt' | 'withdraw' | 'den'
      this.timer = STALKER_HUNT;  // seconds left in the current mood
      this.trips = 0;       // how many times it has gone back to bed
    }

    distanceTo(x, y) {
      return Math.hypot(this.x - x, this.y - y);
    }

    /* Where it beds down. IT always returns here. */
    setHome(x, y) {
      this.home.x = x;
      this.home.y = y;
      return this;
    }

    /* One tick of behaviour.
     *
     *   hunt      — drifts toward the player
     *   withdraw  — slips back toward the den, whether it was seen or not
     *   den       — lies still in the dark until the timer runs out
     *
     * `opts.lookedAt` is true when the player has a clear line of sight on it;
     * beyond a short range that sends it away, which is why you rarely get a
     * clean look at the thing. `opts.rng` (0..1) staggers the windows so two
     * runs are never the same shape. */
    update(world, targetX, targetY, dt, speed, opts) {
      const options = opts || {};
      const hunt = options.huntSeconds == null ? STALKER_HUNT : options.huntSeconds;
      const grace = options.graceSeconds == null ? STALKER_GRACE : options.graceSeconds;
      const rng = options.rng == null ? 0.5 : options.rng;
      const near = this.distanceTo(targetX, targetY);

      this.timer -= dt;

      if (this.mood === 'den') {
        if (this.timer <= 0) {
          this.mood = 'hunt';
          this.timer = hunt * (0.7 + rng * 0.6);
        }
        return this.mood;
      }

      if (this.mood === 'hunt') {
        const spooked = options.lookedAt && near > STALKER_SIGHT_KEEP;
        if (this.timer <= 0 || spooked) {
          this.mood = 'withdraw';
          this.timer = grace;
          return this.mood;
        }
        this.step(world, targetX, targetY, dt, speed);
        return this.mood;
      }

      // withdraw — head home, then bed down for a while
      if (this.distanceTo(this.home.x, this.home.y) < 0.45) {
        this.trips++;
        this.mood = 'den';
        this.timer = grace * (0.8 + rng * 0.8);
        return this.mood;
      }
      this.step(world, this.home.x, this.home.y, dt, speed * 0.8);
      return this.mood;
    }

    /* Move straight toward the target, one axis at a time, never entering a
     * wall. Sliding along the axis that is free lets it round corners. */
    step(world, targetX, targetY, dt, speed) {
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const ux = dx / len;
      const uy = dy / len;
      const dist = speed * dt;

      const nx = this.x + ux * dist;
      if (world.isWalkable(Math.floor(nx), Math.floor(this.y))) this.x = nx;
      const ny = this.y + uy * dist;
      if (world.isWalkable(Math.floor(this.x), Math.floor(ny))) this.y = ny;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Shop: items, aggregated effects, and purchases                      */
  /* ------------------------------------------------------------------ */

  /* How each effect key combines across owned items. */
  const EFFECT_RULES = {
    seeStalker: 'or',
    seeExit: 'or',
    proximity: 'or',
    fogMul: 'mul',
    speedMul: 'mul',
    shakeMul: 'mul',
    glitchMul: 'mul',
    dreadMul: 'mul',
    staminaMul: 'mul',
    ward: 'add',
    survey: 'or',
    mapRadius: 'max',
    pickupRadius: 'max',
    light: 'max',
  };

  const DEFAULT_EFFECTS = {
    seeStalker: false,
    seeExit: false,
    proximity: false,
    fogMul: 1,
    speedMul: 1,
    shakeMul: 1,
    glitchMul: 1,
    dreadMul: 1,
    staminaMul: 1,
    ward: 0,
    survey: false,
    mapRadius: 6,
    pickupRadius: 1,
    light: 0,
  };

  /* The catalogue. Buying an id appends it to the owned list; only items
   * flagged `stackable` can be bought more than once. */
  const ITEMS = [
    {
      id: 'signal-tap',
      name: 'Signal Tap',
      blurb: 'The presence shows up on your map.',
      cost: 30,
      effects: { seeStalker: true },
    },
    {
      id: 'gas-mask',
      name: 'Gas Mask',
      blurb: 'Thins the air. The fog recedes.',
      cost: 25,
      effects: { fogMul: 0.75 },
    },
    {
      id: 'cold-cathode',
      name: 'Cold Cathode',
      blurb: 'A weak light pushes the dark back.',
      cost: 40,
      effects: { fogMul: 0.55, light: 0.6 },
    },
    {
      id: 'adrenal',
      name: 'Adrenal Spike',
      blurb: 'You move faster. It still hears you.',
      cost: 25,
      effects: { speedMul: 1.18 },
    },
    {
      id: 'deep-lungs',
      name: 'Deep Lungs',
      blurb: 'Sprint longer between breaths.',
      cost: 20,
      effects: { staminaMul: 1.7 },
    },
    {
      id: 'tape-magnet',
      name: 'Tape Magnet',
      blurb: 'Nearby tapes come to you.',
      cost: 22,
      effects: { pickupRadius: 1.8 },
    },
    {
      id: 'isolator',
      name: 'Ground Loop Isolator',
      blurb: 'Steadies the picture. Less shake, less glitch.',
      cost: 24,
      effects: { shakeMul: 0.35, glitchMul: 0.4 },
    },
    {
      id: 'cartographer',
      name: 'Cartographer',
      blurb: 'Your map reaches further.',
      cost: 28,
      effects: { mapRadius: 10 },
    },
    {
      id: 'dead-reckoning',
      name: 'Dead Reckoning',
      blurb: 'The way out is always marked.',
      cost: 34,
      effects: { seeExit: true },
    },
    {
      id: 'heart-monitor',
      name: 'Heart Monitor',
      blurb: 'Shows how close it is.',
      cost: 24,
      effects: { proximity: true },
    },
    {
      id: 'slow-tape',
      name: 'Slow Tape',
      blurb: 'Dread creeps in slower.',
      cost: 45,
      effects: { dreadMul: 0.7 },
    },
    {
      id: 'surveyors-rite',
      name: "Surveyor's Rite",
      blurb: 'Traces the shortest way out, and burns out with this tape.',
      cost: 55,
      stackable: true,
      effects: { survey: true },
    },
    {
      id: 'palindrome-ward',
      name: 'Palindrome Ward',
      blurb: 'Survive one touch. It remembers.',
      cost: 60,
      stackable: true,
      effects: { ward: 1 },
    },
  ];

  const ITEM_BY_ID = {};
  for (let i = 0; i < ITEMS.length; i++) ITEM_BY_ID[ITEMS[i].id] = ITEMS[i];

  /* Combine a list of owned item ids into one effects object. Unknown ids are
   * ignored, so a stale save cannot break a run. */
  function applyItems(ids) {
    const eff = Object.assign({}, DEFAULT_EFFECTS);
    const list = ids || [];
    for (let i = 0; i < list.length; i++) {
      const item = ITEM_BY_ID[list[i]];
      if (!item) continue;
      const effects = item.effects;
      for (const key in effects) {
        const value = effects[key];
        const rule = EFFECT_RULES[key];
        if (rule === 'or') eff[key] = eff[key] || !!value;
        else if (rule === 'add') eff[key] = eff[key] + value;
        else if (rule === 'max') eff[key] = Math.max(eff[key], value);
        else eff[key] = eff[key] * value;
      }
    }
    return eff;
  }

  /* Whether an item can be bought right now. */
  function canBuy(owned, id, shards) {
    const item = ITEM_BY_ID[id];
    if (!item) return { ok: false, reason: 'unknown' };
    const count = (owned || []).filter(function (o) { return o === id; }).length;
    if (!item.stackable && count > 0) return { ok: false, reason: 'owned' };
    if (shards < item.cost) return { ok: false, reason: 'shards' };
    return { ok: true, reason: '' };
  }

  /* ------------------------------------------------------------------ */
  /* Collectibles, exploration, and difficulty                           */
  /* ------------------------------------------------------------------ */

  /* Scatter `count` tapes on walkable cells, away from the start, using a
   * seeded shuffle so a seed places the same tapes. */
  function placeCollectibles(world, count, rng, opts) {
    const o = opts || {};
    const minFromStart = o.minFromStart == null ? 4 : o.minFromStart;
    const cells = [];
    for (let y = 1; y < world.rows - 1; y++) {
      for (let x = 1; x < world.cols - 1; x++) {
        const tile = world.get(x, y);
        if (world.isWalkable(x, y) && tile !== EXIT && tile !== DEN) cells.push([x, y]);
      }
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = cells[i];
      cells[i] = cells[j];
      cells[j] = tmp;
    }
    const out = [];
    for (let i = 0; i < cells.length && out.length < count; i++) {
      const cell = cells[i];
      if (Math.hypot(cell[0] + 0.5 - 1.5, cell[1] + 0.5 - 1.5) < minFromStart) continue;
      out.push({ x: cell[0] + 0.5, y: cell[1] + 0.5, cell: cell, taken: false });
    }
    return out;
  }

  /* Take every un-taken tape within `radius` of (x, y); marks them taken and
   * returns the ones collected. */
  function collectNear(tapes, x, y, radius) {
    const r = radius == null ? 1 : radius;
    const got = [];
    const list = tapes || [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.taken) continue;
      if (Math.hypot(t.x - x, t.y - y) <= r) {
        t.taken = true;
        got.push(t);
      }
    }
    return got;
  }

  /* Fog-of-war bookkeeping for the minimap. */
  class Explored {
    constructor(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      this.seen = new Uint8Array(cols * rows);
    }

    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
    }

    reveal(cx, cy, radius) {
      const r = Math.max(0, radius);
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(this.cols - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(this.rows - 1, Math.ceil(cy + r));
      const r2 = r * r;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r2) this.seen[y * this.cols + x] = 1;
        }
      }
    }

    isSeen(x, y) {
      return this.inBounds(x, y) && this.seen[y * this.cols + x] === 1;
    }

    /* Reveal the whole grid — used by the admin menu and by tests. */
    revealAll() {
      this.seen.fill(1);
    }

    clear() {
      this.seen.fill(0);
    }

    seenCount() {
      let n = 0;
      for (let i = 0; i < this.seen.length; i++) if (this.seen[i]) n++;
      return n;
    }
  }

  /* Per-depth difficulty: bigger maze, more tapes, faster stalker, shorter
   * patience before the dread sets in. */
  function depthSettings(depth) {
    const d = Math.max(1, depth | 0);
    let size = Math.min(43, 21 + (d - 1) * 4);
    if (size % 2 === 0) size++;
    return {
      depth: d,
      cols: size,
      rows: size,
      tapes: Math.min(12, 4 + d),
      rampSeconds: Math.max(45, 85 - (d - 1) * 6),
      stalkerSpeed: 0.85 + (d - 1) * 0.09,
      shardPerTape: 8,
      escapeBonus: 20 + (d - 1) * 12,
    };
  }

  const HorrorLib = {
    WALL: WALL,
    FLOOR: FLOOR,
    EXIT: EXIT,
    DEN: DEN,
    World: World,
    generateLevel: generateLevel,
    farthestCell: farthestCell,
    farthestDeadEnd: farthestDeadEnd,
    isDeadEnd: isDeadEnd,
    solvePath: solvePath,
    castRay: castRay,
    castColumns: castColumns,
    fogFactor: fogFactor,
    Atmosphere: Atmosphere,
    Player: Player,
    Stalker: Stalker,
    STALKER_HUNT: STALKER_HUNT,
    STALKER_GRACE: STALKER_GRACE,
    STALKER_SIGHT_KEEP: STALKER_SIGHT_KEEP,
    makeRng: makeRng,
    clamp: clamp,
    ITEMS: ITEMS,
    ITEM_BY_ID: ITEM_BY_ID,
    EFFECT_RULES: EFFECT_RULES,
    DEFAULT_EFFECTS: DEFAULT_EFFECTS,
    applyItems: applyItems,
    canBuy: canBuy,
    placeCollectibles: placeCollectibles,
    collectNear: collectNear,
    Explored: Explored,
    depthSettings: depthSettings,
  };

  global.HorrorLib = HorrorLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HorrorLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
