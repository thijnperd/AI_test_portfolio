/* game.js — 2048 puzzle core.
 *
 * Pure logic, no DOM: runs in the browser (as `GameLib`) and in Node
 * (`module.exports`) so the rules can be tested with `node test.js`.
 *
 * The board is a square grid of numbers (0 = empty). A move slides every tile
 * toward one edge; two equal tiles that meet merge into their sum, and a tile
 * can only merge once per move. After any move that changes the board, one new
 * tile (2 or 4) is placed in a random empty cell.
 *
 * The RNG is seeded, so a seed reproduces the same sequence of tiles.
 *
 * ## Custom blocks
 *
 * Which merges are legal, what can spawn, and where the ladder's rungs sit are
 * all rules a `Game` can be given: `options.rules` is a ruleset built by
 * `blocks.js` (`BlocksLib.makeRules`). It is threaded through as two things
 * rather than one, because they are needed in different places — a single
 * `merge(a, b)` callback for the sliding, and a `spawnValue(r)` draw for the
 * tile that appears afterwards.
 *
 * With no ruleset, or with the untouched default one (`rules.vanilla`), the
 * callback stays null and every function below takes the original code path,
 * so the vanilla game is exactly the game it was before blocks existed.
 */
(function (global) {
  'use strict';

  /* Seeded RNG (mulberry32) — same seed, same tile sequence. */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DIRECTIONS = ['left', 'right', 'up', 'down'];
  const WIN_VALUE = 2048;

  /* The ladder. Reaching 2048 is the announced goal, but the board keeps going
   * and there is always a next rung — which is the whole reason to keep
   * playing after the first win, and to start another run after a bad one. */
  const MILESTONES = [
    { value: 64, label: 'Warm-up' },
    { value: 128, label: 'Steady' },
    { value: 256, label: 'Rolling' },
    { value: 512, label: 'Deep' },
    { value: 1024, label: 'Halfway' },
    { value: 2048, label: 'The goal' },
    { value: 4096, label: 'Past the edge' },
    { value: 8192, label: 'Endless' },
  ];

  /* Every milestone at or below `maxTile`, ascending. The ladder is normally a
   * game's own (`game.ladder`), derived from the blocks in play; the constant
   * here is the vanilla ladder and the default. */
  function milestonesUpTo(maxTile, ladder) {
    const rungs = ladder || MILESTONES;
    return rungs.filter(function (m) { return m.value <= maxTile; });
  }

  /* The next rung above `maxTile`, or null once the ladder is climbed. */
  function nextMilestone(maxTile, ladder) {
    const rungs = ladder || MILESTONES;
    for (let i = 0; i < rungs.length; i++) {
      if (rungs[i].value > maxTile) return rungs[i];
    }
    return null;
  }

  /* Slide one line of values toward index 0 and merge the neighbours that can
   * merge. Returns the resulting line, the score gained, and the output indices
   * that came from a merge (used for the pop animation).
   *
   * `merge(a, b)` is the optional rules callback: it returns the tile the pair
   * becomes, or 0 when the two do not merge at all. Without it, neighbours merge
   * when they are equal — the vanilla rule — and the doubling is inlined. */
  function slideLine(line, merge) {
    const nums = [];
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== 0) nums.push(line[i]);
    }
    const out = [];
    const merged = [];
    let gained = 0;
    for (let i = 0; i < nums.length; i++) {
      if (i + 1 < nums.length) {
        const value = merge
          ? merge(nums[i], nums[i + 1])
          : (nums[i] === nums[i + 1] ? nums[i] * 2 : 0);
        if (value > 0) {
          out.push(value);
          merged.push(out.length - 1);
          gained += value;
          i++; // consume both tiles — a tile merges at most once per move
          continue;
        }
      }
      out.push(nums[i]);
    }
    while (out.length < line.length) out.push(0);
    return { line: out, gained: gained, merged: merged };
  }

  /* Ordered cell coordinates for a move, from the destination edge inward. */
  function lines(size, dir) {
    const n = size;
    const out = [];
    if (dir === 'left' || dir === 'right') {
      for (let y = 0; y < n; y++) {
        const row = [];
        for (let i = 0; i < n; i++) {
          row.push([dir === 'left' ? i : n - 1 - i, y]);
        }
        out.push(row);
      }
    } else {
      for (let x = 0; x < n; x++) {
        const col = [];
        for (let i = 0; i < n; i++) {
          col.push([x, dir === 'up' ? i : n - 1 - i]);
        }
        out.push(col);
      }
    }
    return out;
  }

  function emptyGrid(size) {
    const g = [];
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) row.push(0);
      g.push(row);
    }
    return g;
  }

  /* Apply a move to a copy of a grid, without spawning a tile.
   *
   * This is the single implementation of the sliding rules: `Game.move` calls
   * it and so does the AI in `ai.js`, so a search can never disagree with the
   * game about what a move does. Returns
   * { grid, moved, gained, merged }.
   *
   * `out` is an optional grid to write into instead of allocating a new one —
   * the AI reuses one buffer per search level, and copying beats allocating a
   * fresh 4x4 per simulated move. When `out` is given, the returned `grid` is
   * that buffer, so it must be consumed before the next call with the same
   * buffer.
   *
   * `merge` is the optional custom-block rules callback described in
   * `slideLine`. */
  function applyMove(grid, size, dir, out, merge) {
    if (DIRECTIONS.indexOf(dir) === -1) throw new Error('Unknown direction: ' + dir);
    const lineCoords = lines(size, dir);
    const target = out || [];
    if (out) {
      for (let y = 0; y < size; y++) {
        const src = grid[y];
        const dst = target[y];
        for (let x = 0; x < size; x++) dst[x] = src[x];
      }
    } else {
      for (let y = 0; y < size; y++) target.push(grid[y].slice());
    }
    const outGrid = target;

    let moved = false;
    let gained = 0;
    const merged = [];

    for (let l = 0; l < lineCoords.length; l++) {
      const coords = lineCoords[l];
      const values = [];
      for (let i = 0; i < coords.length; i++) {
        values.push(outGrid[coords[i][1]][coords[i][0]]);
      }
      const res = slideLine(values, merge);
      for (let i = 0; i < coords.length; i++) {
        const x = coords[i][0];
        const y = coords[i][1];
        if (outGrid[y][x] !== res.line[i]) moved = true;
        outGrid[y][x] = res.line[i];
      }
      gained += res.gained;
      for (let m = 0; m < res.merged.length; m++) {
        const c = coords[res.merged[m]];
        merged.push([c[0], c[1]]);
      }
    }

    return { grid: outGrid, moved: moved, gained: gained, merged: merged };
  }

  class Game {
    constructor(options) {
      const o = options || {};
      this.size = o.size || 4;
      this.rng = makeRng((o.seed >>> 0) || 1);
      this.grid = emptyGrid(this.size);
      this.score = 0;
      this.won = false;
      this.lastSpawned = null;
      this.lastMerged = [];
      this.moveCount = 0;
      this.achievements = [];
      this.justAchieved = null;
      this.winSeen = false;
      this.setRules(o.rules);
      this.reset();
    }

    /* Adopt a ruleset (or drop back to the vanilla rules with null).
     *
     * The board is untouched: what changes is which merges are legal, what can
     * spawn, where the ladder's rungs sit, and the value that raises the win
     * banner. A board that already sits at or above a newly lowered goal has
     * its banner marked as seen, so editing the blocks mid-run cannot pop a
     * "you won" screen over a game that was already won. */
    setRules(rules) {
      this.rules = rules || null;
      this.merge = rules && !rules.vanilla ? rules.mergePair : null;
      this.ladder = rules ? rules.ladder : MILESTONES;
      this.winValue = rules ? rules.winValue : WIN_VALUE;
      if (this.winValue > 0 && this.maxTile() >= this.winValue) this.winSeen = true;
      return this;
    }

    reset() {
      this.grid = emptyGrid(this.size);
      this.score = 0;
      this.won = false;
      this.lastSpawned = null;
      this.lastMerged = [];
      this.moveCount = 0;
      this.achievements = [];
      this.justAchieved = null;
      this.winSeen = false;
      this.addRandomTile();
      this.addRandomTile();
    }

    /* Highest milestone this run has crossed, or 0 before the first one. */
    bestMilestone() {
      let best = 0;
      for (let i = 0; i < this.achievements.length; i++) {
        if (this.achievements[i] > best) best = this.achievements[i];
      }
      return best;
    }

    /* The next rung to aim at for the current board. */
    nextGoal() {
      return nextMilestone(this.maxTile(), this.ladder);
    }

    /* Dismiss the win banner without ending the run — the board stays playable. */
    acknowledgeWin() {
      this.winSeen = true;
      return this;
    }

    /* Place a copy of an exact board (used by tests and the UI). */
    load(rows) {
      const size = this.size;
      if (rows.length !== size || rows.some(function (r) { return r.length !== size; })) {
        throw new Error('load: board must be ' + size + 'x' + size);
      }
      this.grid = rows.map(function (r) { return r.slice(); });
      this.score = 0;
      this.won = false;
      this.lastSpawned = null;
      this.lastMerged = [];
      this.moveCount = 0;
      this.achievements = [];
      this.justAchieved = null;
      this.winSeen = false;
      // A loaded board still counts the rungs it already sits on, so the ladder
      // and the next goal are right immediately rather than after one move.
      this.collectMilestones();
    }

    /* Record any milestone the current board has crossed. Returns the highest
     * one newly crossed this call, or null. */
    collectMilestones() {
      const max = this.maxTile();
      let newest = null;
      for (let i = 0; i < this.ladder.length; i++) {
        const value = this.ladder[i].value;
        if (value <= max && this.achievements.indexOf(value) === -1) {
          this.achievements.push(value);
          newest = value;
        }
      }
      this.achievements.sort(function (a, b) { return a - b; });
      return newest;
    }

    emptyCells() {
      const out = [];
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          if (this.grid[y][x] === 0) out.push([x, y]);
        }
      }
      return out;
    }

    /* Place one spawning tile in a random empty cell. Returns its [x, y]. */
    addRandomTile() {
      const empties = this.emptyCells();
      if (empties.length === 0) return null;
      const pick = empties[Math.floor(this.rng() * empties.length)];
      // One rng draw for the value either way, so a seeded run is reproducible
      // whether or not the blocks are customised.
      const value = this.rules ? this.rules.spawnValue(this.rng()) : (this.rng() < 0.9 ? 2 : 4);
      this.grid[pick[1]][pick[0]] = value;
      return pick;
    }

    /* Slide all tiles toward `dir`. Returns { moved, gained }. */
    move(dir) {
      const res = applyMove(this.grid, this.size, dir, null, this.merge);
      this.lastMerged = res.merged;
      this.lastSpawned = null;
      this.justAchieved = null;
      if (!res.moved) return { moved: false, gained: 0 };

      this.grid = res.grid;
      this.moveCount++;
      this.score += res.gained;
      // `>=` rather than an exact match: a modifier can step straight over the
      // goal, and the win should not depend on landing on it exactly.
      if (this.winValue > 0 && this.maxTile() >= this.winValue) {
        this.won = true;
      }
      this.justAchieved = this.collectMilestones();
      this.lastSpawned = this.addRandomTile();
      return { moved: true, gained: res.gained, achieved: this.justAchieved };
    }

    /* True while any move would change the board. */
    canMove() {
      const n = this.size;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const v = this.grid[y][x];
          if (v === 0) return true;
          // The same predicate the sliding uses, so a board is never reported
          // playable by a merge that `applyMove` would refuse.
          if (x + 1 < n && this.merges(v, this.grid[y][x + 1])) return true;
          if (y + 1 < n && this.merges(v, this.grid[y + 1][x])) return true;
        }
      }
      return false;
    }

    /* Whether two tiles sitting next to each other would merge. */
    merges(a, b) {
      return this.merge ? this.merge(a, b) > 0 : a === b;
    }

    isGameOver() {
      return !this.canMove();
    }

    /* Largest tile currently on the board. */
    maxTile() {
      let max = 0;
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          if (this.grid[y][x] > max) max = this.grid[y][x];
        }
      }
      return max;
    }
  }

  const GameLib = {
    Game: Game,
    slideLine: slideLine,
    applyMove: applyMove,
    emptyGrid: emptyGrid,
    makeRng: makeRng,
    DIRECTIONS: DIRECTIONS,
    WIN_VALUE: WIN_VALUE,
    MILESTONES: MILESTONES,
    milestonesUpTo: milestonesUpTo,
    nextMilestone: nextMilestone,
  };

  global.GameLib = GameLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
