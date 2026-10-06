/* sand.js — falling-sand cellular automaton core, with a small physics model.
 *
 * Pure logic, no DOM: runs in the browser (as `SandLib`) and in Node
 * (`module.exports`) so the rules can be tested with `node test.js`.
 *
 * Materials and their properties:
 *   stone  — solid, never moves (density is irrelevant, it is static)
 *   sand   — powder: heavy, piles at an angle of repose, sinks through fluids
 *   water  — liquid: medium density, flows to find its level
 *   oil    — liquid: light, floats on water, is pushed up by anything heavier
 *
 * Physics, in the order applied each tick:
 *   1. Gravity is an acceleration: every mobile cell gains vertical velocity
 *      (capped per material), so a fall speeds up instead of moving one cell
 *      forever.
 *   2. Density decides displacement: a particle may move into an empty cell or
 *      *swap* with a lighter mobile cell, which is what makes sand sink and
 *      oil float.
 *   3. Hydrostatic pressure: liquids flow from a taller column to a shorter
 *      one, so connected liquid levels out (communicating vessels). Pressure
 *      at a cell is the depth of liquid above it.
 *   4. Angle of repose: powders slide diagonally, but wet powder (touching a
 *      liquid) holds a steeper pile.
 *
 * A single tick moves each particle at most once, and the shuffled diagonal /
 * flow directions come from a seeded RNG, so a seed reproduces a run exactly.
 */
(function (global) {
  'use strict';

  const EMPTY = 0;
  const SAND = 1;
  const WATER = 2;
  const WALL = 3;   // stone / solid
  const OIL = 4;
  const STONE = WALL;

  const MATERIALS = {};
  MATERIALS[EMPTY] = { name: 'empty', state: 'empty', density: 0 };
  MATERIALS[SAND] = { name: 'sand', state: 'powder', density: 2.0, maxFall: 7 };
  MATERIALS[WATER] = { name: 'water', state: 'liquid', density: 1.0, maxFall: 6 };
  MATERIALS[OIL] = { name: 'oil', state: 'liquid', density: 0.6, maxFall: 6 };
  MATERIALS[WALL] = { name: 'stone', state: 'solid', density: 100 };

  const NAME = {};
  for (const key in MATERIALS) NAME[key] = MATERIALS[key].name;

  const GRAVITY = 0.4;             // cells per tick^2
  const MOBILE = [false, true, true, false, true];  // indexed by material id
  const LIQUID = [false, false, true, false, true];

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Sand {
    constructor(options) {
      const o = options || {};
      if (!(o.width > 0) || !(o.height > 0)) throw new Error('Sand needs a positive width and height');
      this.width = o.width | 0;
      this.height = o.height | 0;
      const n = this.width * this.height;
      this.cells = new Uint8Array(n);
      this.velY = new Float32Array(n);      // vertical velocity, cells per tick
      this.moved = new Uint8Array(n);       // per-tick "already moved" guard
      this.depth = new Int32Array(n);       // contiguous liquid depth incl. self
      this.surface = new Float64Array(this.width).fill(Infinity); // topmost liquid y per column
      this.colVol = new Int32Array(this.width);  // liquid volume per column
      this.rng = makeRng((o.seed >>> 0) || 1);
    }

    idx(x, y) {
      return y * this.width + x;
    }

    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    get(x, y) {
      return this.inBounds(x, y) ? this.cells[this.idx(x, y)] : WALL;
    }

    set(x, y, type) {
      if (!this.inBounds(x, y)) return;
      const i = this.idx(x, y);
      this.cells[i] = type;
      this.velY[i] = 0;
    }

    clear() {
      this.cells.fill(EMPTY);
      this.velY.fill(0);
      this.depth.fill(0);
      this.surface.fill(Infinity);
      this.colVol.fill(0);
    }

    /* True when a particle of `from` may move into `to` (empty or lighter). */
    canDisplace(from, to) {
      if (to === EMPTY) return true;
      const f = MATERIALS[from];
      const t = MATERIALS[to];
      if (!f || !t) return false;
      if (t.state === 'solid') return false;   // stone is immovable
      return f.density > t.density;            // heavier sinks through lighter
    }

    /* Swap two cells, carrying their velocities (a move or a sink). */
    swap(i, j) {
      const t = this.cells[i];
      this.cells[i] = this.cells[j];
      this.cells[j] = t;
      const v = this.velY[i];
      this.velY[i] = this.velY[j];
      this.velY[j] = v;
    }

    /* Recompute hydrostatic pressure (liquid depth) and per-column surfaces. */
    computeFluids() {
      const w = this.width;
      const h = this.height;
      const cells = this.cells;
      const depth = this.depth;
      const surface = this.surface;
      const colVol = this.colVol;
      surface.fill(Infinity);
      colVol.fill(0);
      for (let x = 0; x < w; x++) {
        let run = 0;
        let vol = 0;
        for (let y = 0; y < h; y++) {
          const i = y * w + x;
          if (LIQUID[cells[i]]) {
            run++;
            vol++;
            depth[i] = run;
            if (surface[x] === Infinity) surface[x] = y;
          } else {
            run = 0;
            depth[i] = 0;
          }
        }
        colVol[x] = vol;
      }
    }

    /* Total liquid volume in a column. */
    columnVolume(x) {
      return (x >= 0 && x < this.width) ? this.colVol[x] : 0;
    }

    /* Hydrostatic pressure at a cell: how many liquid cells sit above it. */
    pressureAt(x, y) {
      if (!this.inBounds(x, y)) return 0;
      const i = this.idx(x, y);
      if (!LIQUID[this.cells[i]]) return 0;
      return Math.max(0, this.depth[i] - 1);
    }

    /* Highest pressure anywhere on the board (for the HUD). */
    maxPressure() {
      let max = 0;
      const cells = this.cells;
      const depth = this.depth;
      for (let i = 0; i < cells.length; i++) {
        if (LIQUID[cells[i]] && depth[i] - 1 > max) max = depth[i] - 1;
      }
      return max;
    }

    /* Topmost liquid row in a column, or Infinity when the column is dry. */
    surfaceAt(x) {
      return (x >= 0 && x < this.width) ? this.surface[x] : Infinity;
    }

    /* True when a cell touches a liquid on one of its four sides. */
    isWet(x, y) {
      return LIQUID[this.get(x - 1, y)] || LIQUID[this.get(x + 1, y)] ||
        LIQUID[this.get(x, y - 1)] || LIQUID[this.get(x, y + 1)];
    }

    /* Fall straight down as far as the velocity allows. Returns cells fallen. */
    fall(i, x, y, t) {
      const w = this.width;
      const h = this.height;
      const cells = this.cells;
      const moved = this.moved;
      const steps = Math.max(1, Math.floor(this.velY[i]));
      let ci = i;
      let cy = y;
      let fell = 0;
      while (fell < steps && cy + 1 < h) {
        const below = ci + w;
        if (!this.canDisplace(t, cells[below])) break;
        this.swap(ci, below);
        moved[below] = 1;
        ci = below;
        cy++;
        fell++;
      }
      if (fell > 0 && fell < steps) this.velY[ci] = 0; // it landed on something
      return fell;
    }

    stepPowder(i, x, y, t) {
      const w = this.width;
      const cells = this.cells;
      const moved = this.moved;
      const fell = this.fall(i, x, y, t);
      if (fell > 0) return;

      this.velY[i] = 0;
      if (this.isWet(x, y)) return; // wet powder holds a steeper pile

      const firstLeft = this.rng() < 0.5;
      const order = firstLeft ? [-1, 1] : [1, -1];
      for (let d = 0; d < 2; d++) {
        const nx = x + order[d];
        if (nx < 0 || nx >= w) continue;
        const j = (y + 1) * w + nx;
        if (this.canDisplace(t, cells[j])) {
          this.swap(i, j);
          moved[j] = 1;
          return;
        }
      }
    }

    stepLiquid(i, x, y, t) {
      const w = this.width;
      const cells = this.cells;
      const moved = this.moved;
      const fell = this.fall(i, x, y, t);
      if (fell > 0) return;

      this.velY[i] = 0;

      // Horizontal flow is driven by the pressure gradient: a surface cell
      // only flows into a neighbour whose surface is *below* it (deeper, less
      // pressure) and whose column holds less liquid. That levels connected
      // liquid out (communicating vessels) without oscillating.
      const vol = this.colVol[x];
      const firstLeft = this.rng() < 0.5;
      const order = firstLeft ? [-1, 1] : [1, -1];
      let best = -1;
      let bestSurface = -Infinity;
      for (let d = 0; d < 2; d++) {
        const nx = x + order[d];
        if (nx < 0 || nx >= w) continue;
        const s = this.surface[nx];
        if (!(s > y)) continue;                    // neighbour must be deeper
        if (!(this.colVol[nx] < vol)) continue;    // only flow into a lighter column
        const j = y * w + nx;
        if (!this.canDisplace(t, cells[j])) continue;
        if (s > bestSurface) {                     // prefer the deepest
          bestSurface = s;
          best = nx;
        }
      }
      if (best < 0) return;
      const j = y * w + best;
      this.swap(i, j);
      moved[j] = 1;
    }

    /* One tick of the automaton. */
    step() {
      const w = this.width;
      const h = this.height;
      const cells = this.cells;
      const moved = this.moved;
      moved.fill(0);

      // 1. gravity — an acceleration, capped per material
      for (let i = 0; i < cells.length; i++) {
        const t = cells[i];
        if (MOBILE[t]) {
          const cap = MATERIALS[t].maxFall;
          const v = this.velY[i] + GRAVITY;
          this.velY[i] = v > cap ? cap : v;
        } else {
          this.velY[i] = 0;
        }
      }

      // 2. hydrostatic pressure + surfaces for this tick
      this.computeFluids();

      // 3. movement, bottom-up so a particle that falls into a lower row is
      //    not moved again this tick; the bottom row still spreads sideways.
      for (let y = h - 1; y >= 0; y--) {
        const leftToRight = this.rng() < 0.5;
        for (let k = 0; k < w; k++) {
          const x = leftToRight ? k : w - 1 - k;
          const i = y * w + x;
          const t = cells[i];
          if (!MOBILE[t] || moved[i]) continue;
          if (MATERIALS[t].state === 'powder') this.stepPowder(i, x, y, t);
          else this.stepLiquid(i, x, y, t);
        }
      }
    }

    stepMany(n) {
      for (let s = 0; s < n; s++) this.step();
    }

    /* Count each cell type. */
    counts() {
      const out = { empty: 0, sand: 0, water: 0, oil: 0, wall: 0 };
      const cells = this.cells;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] === SAND) out.sand++;
        else if (cells[i] === WATER) out.water++;
        else if (cells[i] === OIL) out.oil++;
        else if (cells[i] === WALL) out.wall++;
        else out.empty++;
      }
      return out;
    }

    /* Seed the grid with a deterministic scatter of materials. */
    randomize(options) {
      const o = options || {};
      const sandChance = o.sandChance != null ? o.sandChance : 0.16;
      const waterChance = o.waterChance != null ? o.waterChance : 0.08;
      const oilChance = o.oilChance != null ? o.oilChance : 0.03;
      const wallChance = o.wallChance != null ? o.wallChance : 0.03;
      this.rng = makeRng((o.seed >>> 0) || (this.rng() * 0xffffffff) >>> 0);
      this.cells.fill(EMPTY);
      this.velY.fill(0);
      const pitch = wallChance;
      const pitch2 = pitch + sandChance;
      const pitch3 = pitch2 + waterChance;
      const pitch4 = pitch3 + oilChance;
      for (let i = 0; i < this.cells.length; i++) {
        const r = this.rng();
        if (r < pitch) this.cells[i] = WALL;
        else if (r < pitch2) this.cells[i] = SAND;
        else if (r < pitch3) this.cells[i] = WATER;
        else if (r < pitch4) this.cells[i] = OIL;
      }
      this.computeFluids();
    }

    /* Paint a filled circle of one material (used by the UI brush). */
    paint(cx, cy, radius, type) {
      const r2 = radius * radius;
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (!this.inBounds(x, y)) continue;
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r2) {
            const i = this.idx(x, y);
            this.cells[i] = type;
            this.velY[i] = 0;
          }
        }
      }
    }

    /* Drop a grain at the top of a column (a "faucet"). */
    emit(x, type) {
      if (x < 0 || x >= this.width) return;
      if (this.cells[x] === EMPTY) this.cells[x] = type; // top row
    }
  }

  const SandLib = {
    Sand: Sand,
    makeRng: makeRng,
    MATERIALS: MATERIALS,
    NAME: NAME,
    GRAVITY: GRAVITY,
    EMPTY: EMPTY,
    SAND: SAND,
    WATER: WATER,
    WALL: WALL,
    STONE: STONE,
    OIL: OIL,
  };

  global.SandLib = SandLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SandLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
