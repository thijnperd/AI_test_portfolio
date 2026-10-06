/* wfc.js — Wave Function Collapse core (simple tiled model).
 *
 * Pure logic, no DOM: runs in the browser (as `WFCLib`) and in Node
 * (`module.exports`) so the solver can be tested with `node test.js`.
 *
 * The model:
 *   - A tile set is a list of tiles. Each tile has four edge `sockets`
 *     `[north, east, south, west]`, a `weight`, and a `kind`/`track` used for
 *     drawing. Rotated variants are generated from a few base shapes.
 *   - Two tiles may sit next to each other in a direction when the touching
 *     sockets are equal (`buildAdjacency`). That single rule is what makes a
 *     circuit look like a circuit and a river look like a river.
 *   - A `Solver` keeps, for every cell, the set of tiles still allowed there.
 *     Each `step()` collapses the lowest-entropy cell (a seeded weighted pick)
 *     and then propagates the consequences to its neighbours. If propagation
 *     ever empties a cell's domain, the solver backtracks to an earlier
 *     decision and tries a different tile, so hard seeds still resolve.
 *
 * Everything is deterministic for a given seed: the only randomness is the
 * seeded mulberry32 RNG created from `seed`.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Seeded RNG (mulberry32) — same seed, same map.                      */
  /* ------------------------------------------------------------------ */

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Direction order used everywhere: north, east, south, west. */
  const OPPOSITE = [2, 3, 0, 1];

  /**
   * Rotate a socket tuple one quarter turn clockwise: [N,E,S,W] -> [W,N,E,S].
   *
   * @param {number[]} sockets
   * @returns {number[]}
   */
  function rotateSockets(sockets) {
    return [sockets[3], sockets[0], sockets[1], sockets[2]];
  }

  /* ------------------------------------------------------------------ */
  /* Tile shapes and tile sets                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Base shapes, described by the directions that carry a track. Rotations are
   * generated from these, so a straight only needs two variants and a cross
   * only one.
   */
  const SHAPES = [
    { kind: 'cross', dirs: [0, 1, 2, 3], weight: 0.30 },
    { kind: 'tee', dirs: [0, 1, 2], weight: 0.65 },
    { kind: 'straight', dirs: [1, 3], weight: 1.30 },
    { kind: 'corner', dirs: [1, 2], weight: 1.05 },
    { kind: 'end', dirs: [0], weight: 0.45 },
  ];

  /**
   * The authored tile sets. Colours live here too so the renderer in `app.js`
   * can stay thin; the solver only reads the numeric fields.
   */
  const TILE_SETS = {
    circuit: {
      id: 'circuit',
      label: 'Circuit',
      groundWeight: 3.1,
      tracks: [
        { id: 1, label: 'trace', weight: 1.0, color: '#5ce6c0' },
      ],
      grid: '#141b26',
      ground: '#10161f',
      uncertainty: '#2a3b52',
    },
    garden: {
      id: 'garden',
      label: 'Roads & Rivers',
      groundWeight: 2.2,
      tracks: [
        { id: 1, label: 'road', weight: 1.0, color: '#c8b184' },
        { id: 2, label: 'river', weight: 0.85, color: '#4f8cff' },
      ],
      grid: '#16241b',
      ground: '#121d16',
      uncertainty: '#24382a',
    },
  };

  const TILE_SET_NAMES = Object.keys(TILE_SETS);

  /**
   * Build the tile list for a named set.
   *
   * Tile 0 is always the plain ground tile (all sockets 0). Every other tile is
   * a rotation of a base shape carrying one of the set's tracks.
   *
   * @param {string} setName
   * @returns {object[]} tiles
   */
  function buildTiles(setName) {
    const set = TILE_SETS[setName] || TILE_SETS.circuit;
    const tiles = [];
    tiles.push({ id: 0, sockets: [0, 0, 0, 0], weight: set.groundWeight, kind: 'empty', rot: 0, track: 0 });
    for (let ti = 0; ti < set.tracks.length; ti++) {
      const track = set.tracks[ti];
      for (let si = 0; si < SHAPES.length; si++) {
        const shape = SHAPES[si];
        const seen = {};
        let dirs = shape.dirs.slice();
        for (let r = 0; r < 4; r++) {
          const sockets = [0, 0, 0, 0];
          for (let k = 0; k < dirs.length; k++) sockets[dirs[k]] = track.id;
          const key = sockets.join(',');
          if (!seen[key]) {
            seen[key] = true;
            tiles.push({
              id: tiles.length,
              sockets: sockets,
              weight: shape.weight * track.weight,
              kind: shape.kind,
              rot: r,
              track: track.id,
            });
          }
          dirs = dirs.map(function (d) { return (d + 1) % 4; });
        }
      }
    }
    return tiles;
  }

  /**
   * Precompute, for every direction and tile, which tiles may be placed in
   * that direction. `compat[d][s]` is an array of tile indices `t` with
   * `tiles[s].sockets[d] === tiles[t].sockets[OPPOSITE[d]]`.
   *
   * @param {object[]} tiles
   * @returns {number[][][]}
   */
  function buildAdjacency(tiles) {
    const n = tiles.length;
    const compat = [];
    for (let d = 0; d < 4; d++) {
      const perDir = new Array(n);
      for (let s = 0; s < n; s++) {
        const list = [];
        for (let t = 0; t < n; t++) {
          if (tiles[s].sockets[d] === tiles[t].sockets[OPPOSITE[d]]) list.push(t);
        }
        perDir[s] = list;
      }
      compat.push(perDir);
    }
    return compat;
  }

  /* ------------------------------------------------------------------ */
  /* Solver                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Wave Function Collapse solver over a `width x height` grid.
   *
   * State is stored flat: `domains[cell * numTiles + tile]` is 1 when that tile
   * is still allowed at that cell, and `counts[cell]` is how many are left.
   */
  class Solver {
    /**
     * @param {object} [options]
     * @param {number} [options.width=24]
     * @param {number} [options.height=24]
     * @param {string} [options.tileSet='circuit']
     * @param {object[]} [options.tiles] - override the tile list.
     * @param {number} [options.seed=1]
     * @param {boolean} [options.boundary=true] - keep tracks off the map edge.
     */
    constructor(options) {
      const o = options || {};
      this.w = Math.max(2, o.width ? o.width | 0 : 24);
      this.h = Math.max(2, o.height ? o.height | 0 : 24);
      this.tileSetName = o.tileSet || 'circuit';
      this.set = TILE_SETS[this.tileSetName] || TILE_SETS.circuit;
      this.boundary = o.boundary !== false;
      this.tiles = o.tiles || buildTiles(this.tileSetName);
      this.compat = buildAdjacency(this.tiles);
      this.numTiles = this.tiles.length;
      this.seed = (o.seed >>> 0) || 1;
      this.rng = makeRng(this.seed);
      this.reset();
    }

    /** Reset to a freshly seeded, un-collapsed grid. */
    reset() {
      const n = this.w * this.h;
      this.rng = makeRng(this.seed);
      this.domains = new Uint8Array(n * this.numTiles);
      this.counts = new Int32Array(n);
      this.chosen = new Int32Array(n).fill(-1);
      this.mark = new Int32Array(this.numTiles);
      this.markGen = 0;
      this.stack = [];
      this.done = false;
      this.contradiction = false;
      this.steps = 0;
      for (let c = 0; c < n; c++) {
        const base = c * this.numTiles;
        for (let t = 0; t < this.numTiles; t++) this.domains[base + t] = 1;
        this.counts[c] = this.numTiles;
      }
      if (this.boundary) this.applyBoundary();
    }

    /** Restrict every border cell so no track runs off the map. */
    applyBoundary() {
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const dirs = [];
          if (y === 0) dirs.push(0);
          if (x === this.w - 1) dirs.push(1);
          if (y === this.h - 1) dirs.push(2);
          if (x === 0) dirs.push(3);
          if (!dirs.length) continue;
          const cell = y * this.w + x;
          const base = cell * this.numTiles;
          let removed = 0;
          for (let t = 0; t < this.numTiles; t++) {
            if (!this.domains[base + t]) continue;
            let ok = true;
            for (let k = 0; k < dirs.length; k++) {
              if (this.tiles[t].sockets[dirs[k]] !== 0) { ok = false; break; }
            }
            if (!ok) { this.domains[base + t] = 0; removed++; }
          }
          if (removed) this.counts[cell] -= removed;
          if (this.counts[cell] <= 0) this.contradiction = true;
        }
      }
    }

    /** Index of the first (lowest-numbered) tile still allowed at a cell. */
    firstAllowed(cell) {
      const base = cell * this.numTiles;
      for (let t = 0; t < this.numTiles; t++) if (this.domains[base + t]) return t;
      return -1;
    }

    /** Tile indices still allowed at a cell. */
    allowedIndices(cell) {
      const base = cell * this.numTiles;
      const out = [];
      for (let t = 0; t < this.numTiles; t++) if (this.domains[base + t]) out.push(t);
      return out;
    }

    /** Apply a snapshot (domains + counts + chosen) back onto the grid. */
    restore(frame) {
      this.domains.set(frame.domains);
      this.counts.set(frame.counts);
      this.chosen.set(frame.chosen);
    }

    /** Snapshot the solver's per-cell state. */
    snapshot() {
      return {
        domains: this.domains.slice(),
        counts: this.counts.slice(),
        chosen: this.chosen.slice(),
      };
    }

    /** Force a cell to a single tile. */
    assign(cell, tile) {
      const base = cell * this.numTiles;
      for (let t = 0; t < this.numTiles; t++) this.domains[base + t] = t === tile ? 1 : 0;
      this.counts[cell] = 1;
      this.chosen[cell] = tile;
    }

    /** True when a cell is collapsed to one tile. */
    isCollapsed(x, y) {
      return this.counts[y * this.w + x] === 1;
    }

    /** Number of tiles still possible at a cell. */
    optionsAt(x, y) {
      return this.counts[y * this.w + x];
    }

    /**
     * Weighted Shannon entropy of a cell (lower = more decided). Returns 0 for a
     * collapsed cell.
     */
    entropyAt(x, y) {
      const cell = y * this.w + x;
      const base = cell * this.numTiles;
      let sum = 0;
      let sumLog = 0;
      for (let t = 0; t < this.numTiles; t++) {
        if (!this.domains[base + t]) continue;
        const w = this.tiles[t].weight;
        sum += w;
        sumLog += w * Math.log(w);
      }
      if (sum <= 0) return 0;
      return Math.log(sum) - sumLog / sum;
    }

    /** The tile index at a cell, or -1 while it is not collapsed. */
    tileIndexAt(x, y) {
      return this.chosen[y * this.w + x];
    }

    /** The tile object at a cell, or null while it is not collapsed. */
    tileAt(x, y) {
      const i = this.chosen[y * this.w + x];
      return i < 0 ? null : this.tiles[i];
    }

    /** How many cells are collapsed. */
    collapsedCount() {
      let n = 0;
      for (let c = 0; c < this.counts.length; c++) if (this.counts[c] === 1) n++;
      return n;
    }

    isDone() { return this.done; }
    hasContradiction() { return this.contradiction; }

    /**
     * Pick the uncollapsed cell with the lowest entropy (ties broken by the
     * seeded RNG) or -1 when every cell is collapsed.
     */
    lowestEntropy() {
      let min = Infinity;
      const cands = [];
      const n = this.w * this.h;
      for (let c = 0; c < n; c++) {
        if (this.counts[c] <= 1) continue;
        const x = c % this.w;
        const y = (c - x) / this.w;
        const h = this.entropyAt(x, y);
        if (h < min - 1e-9) { min = h; cands.length = 0; cands.push(c); }
        else if (h <= min + 1e-9) cands.push(c);
      }
      if (!cands.length) return -1;
      return cands[Math.floor(this.rng() * cands.length)];
    }

    /** Tile indices allowed at a cell, ordered by seeded weighted preference. */
    weightedOrder(cell) {
      const list = this.allowedIndices(cell);
      const keys = list.map(function (t) {
        const w = Math.max(1e-6, this.tiles[t].weight);
        return { t: t, k: Math.pow(this.rng(), 1 / w) };
      }, this);
      keys.sort(function (a, b) { return b.k - a.k; });
      return keys.map(function (e) { return e.t; });
    }

    /**
     * Constraint propagation: shrink the domains of neighbours until stable.
     * Returns false when a domain becomes empty (a contradiction).
     */
    propagate(start) {
      const queue = [start];
      while (queue.length) {
        const c = queue.pop();
        const cb = c * this.numTiles;
        const x = c % this.w;
        const y = (c - x) / this.w;
        for (let d = 0; d < 4; d++) {
          let nx = x;
          let ny = y;
          if (d === 0) ny--;
          else if (d === 1) nx++;
          else if (d === 2) ny++;
          else nx--;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const nc = ny * this.w + nx;
          this.markGen++;
          const gen = this.markGen;
          for (let s = 0; s < this.numTiles; s++) {
            if (!this.domains[cb + s]) continue;
            const arr = this.compat[d][s];
            for (let k = 0; k < arr.length; k++) this.mark[arr[k]] = gen;
          }
          const nb = nc * this.numTiles;
          let removed = 0;
          for (let t = 0; t < this.numTiles; t++) {
            if (this.domains[nb + t] && this.mark[t] !== gen) {
              this.domains[nb + t] = 0;
              removed++;
            }
          }
          if (removed) {
            this.counts[nc] -= removed;
            if (this.counts[nc] <= 0) return false;
            this.chosen[nc] = this.counts[nc] === 1 ? this.firstAllowed(nc) : -1;
            queue.push(nc);
          }
        }
      }
      return true;
    }

    /**
     * Backtrack: undo earlier decisions until one has an untried tile that
     * propagates cleanly. Returns false when the whole search space is
     * exhausted (a genuine contradiction).
     */
    backtrack() {
      while (this.stack.length) {
        const frame = this.stack.pop();
        while (frame.remaining.length) {
          const tile = frame.remaining.shift();
          this.restore(frame);
          this.assign(frame.cell, tile);
          if (this.propagate(frame.cell)) {
            this.stack.push(frame);
            return true;
          }
        }
      }
      return false;
    }

    /**
     * Advance the collapse by one decision (collapsing the lowest-entropy cell
     * and propagating). Returns true when the grid changed. Sets `done` or
     * `contradiction` when the search finishes.
     */
    step() {
      if (this.done || this.contradiction) return false;
      this.steps++;

      const cell = this.lowestEntropy();
      if (cell < 0) { this.done = true; return false; }

      const base = this.snapshot();
      const order = this.weightedOrder(cell);
      let placed = -1;
      for (let i = 0; i < order.length; i++) {
        this.restore(base);
        this.assign(cell, order[i]);
        if (this.propagate(cell)) { placed = i; break; }
      }

      if (placed >= 0) {
        this.stack.push({
          cell: cell,
          domains: base.domains,
          counts: base.counts,
          chosen: base.chosen,
          remaining: order.slice(placed + 1),
        });
        if (this.collapsedCount() === this.w * this.h) this.done = true;
        return true;
      }

      // Every tile for this cell failed — backtrack to an earlier decision.
      if (!this.backtrack()) {
        this.contradiction = true;
        return false;
      }
      if (this.collapsedCount() === this.w * this.h) this.done = true;
      return true;
    }

    /** Run `step()` to completion (or until the step cap). */
    solveAll(maxSteps) {
      const cap = maxSteps || this.w * this.h * 100 + 20000;
      let i = 0;
      while (!this.done && !this.contradiction && i < cap) {
        this.step();
        i++;
      }
      return { solved: this.done, contradiction: this.contradiction, steps: i };
    }

    /**
     * Check the whole grid against the adjacency table. Used by the tests and
     * available to the app for a self-check readout.
     *
     * @returns {{ ok: boolean, violations: number }}
     */
    validate() {
      let violations = 0;
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const a = this.chosen[y * this.w + x];
          if (a < 0) { violations++; continue; }
          for (let d = 0; d < 4; d++) {
            let nx = x;
            let ny = y;
            if (d === 0) ny--;
            else if (d === 1) nx++;
            else if (d === 2) ny++;
            else nx--;
            if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
            const b = this.chosen[ny * this.w + nx];
            if (this.compat[d][a].indexOf(b) === -1) violations++;
          }
        }
      }
      return { ok: violations === 0, violations: violations };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Exports                                                             */
  /* ------------------------------------------------------------------ */

  const WFCLib = {
    Solver: Solver,
    makeRng: makeRng,
    rotateSockets: rotateSockets,
    buildTiles: buildTiles,
    buildAdjacency: buildAdjacency,
    TILE_SETS: TILE_SETS,
    TILE_SET_NAMES: TILE_SET_NAMES,
    SHAPES: SHAPES,
    OPPOSITE: OPPOSITE,
  };

  global.WFCLib = WFCLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WFCLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
