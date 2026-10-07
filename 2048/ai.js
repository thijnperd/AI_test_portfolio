/* ai.js — the expectimax player for the 2048 core.
 *
 * Pure logic, no DOM: runs in the browser (as `AiLib`) and in Node
 * (`module.exports`) so its judgement can be tested with `node test.js`.
 *
 * ## The algorithm
 *
 * This is the expectimax search described in the top answer to
 * "What is the optimal algorithm for the game 2048?"
 * (https://stackoverflow.com/q/22342854): a *max* player alternating with a
 * *chance* player, evaluated by a small heuristic.
 *
 *   - A **max** node is our turn: try every legal direction, take the best.
 *   - A **chance** node is the board spawning a tile: average over every empty
 *     cell and both spawn values, weighted 90% for a 2 and 10% for a 4 — the
 *     game's real distribution. Averaging (rather than assuming the worst)
 *     is the whole point: it rates a move by its *expected* outcome.
 *   - At the depth limit (or when the node budget runs out) the position is
 *     scored by the heuristic below.
 *
 * ## The heuristic
 *
 * The four terms are the ones that answer converged on, and each one encodes a
 * piece of 2048 strategy:
 *
 *   - **empty cells** — room to manoeuvre is life; a cramped board dies.
 *   - **monotonicity** — rows and columns that only ever increase or decrease
 *     along one direction can be fed from one edge, which is the "snake"
 *     strategy players use by hand.
 *   - **smoothness** — neighbours of similar size can actually merge, so a
 *     tidy board has more futures than a scattered one.
 *   - **corner bonus** — the biggest tile parked in a corner cannot be
 *     disturbed, so the corner is worth paying for, scaled by how big that
 *     tile is.
 *
 * ## Determinism and the laptop budget
 *
 * Search is bounded by **depth and a node count**, never by wall-clock time, so
 * a given board always yields the same move on any machine — which is what
 * makes it testable. A move costs a few thousand node visits; the budget stops
 * the search *deepening*, but every child of a chance node is still scored, so
 * the average being taken is never a partial one.
 *
 * The sliding rules are not re-implemented here: moves are simulated with
 * `GameLib.applyMove`, the same function the game itself uses.
 *
 * ## Custom blocks
 *
 * `options.rules` is a ruleset from `blocks.js`, and the search follows it: the
 * chance node averages over the blocks that can actually spawn and their real
 * shares instead of the vanilla 90/10 pair, and the heuristic reads an operator
 * tile through `rules.heuristicValue` rather than treating its encoding as a
 * number. With no rules, or with the untouched default set, both collapse to
 * the vanilla paths — `ctx.rules` and `ctx.merge` are then null, so the search
 * is bit-for-bit the search it was before blocks existed.
 */
(function (global) {
  'use strict';

  const GameLib = (typeof module !== 'undefined' && module.exports)
    ? require('./game.js')
    : global.GameLib;

  const DIRECTIONS = GameLib.DIRECTIONS;
  const WIN_VALUE = GameLib.WIN_VALUE;

  /* The vanilla spawn distribution, used when no ruleset is given. The weights
   * and the arithmetic match `rules.spawns` for the default blocks exactly, so
   * a vanilla search is unchanged by the block machinery. */
  const VANILLA_SPAWNS = [{ value: 2, share: 0.9 }, { value: 4, share: 0.1 }];

  /* Heuristic weights. Empty cells dominate; monotonicity is worth about a
   * third of an empty cell per unit; smoothness is a tie-breaker; the corner
   * bonus is scaled by the log of the biggest tile so it grows with the tile. */
  const WEIGHTS = {
    empty: 2.7,
    monotonicity: 1.0,
    smoothness: 0.1,
    corner: 1.0,
    edge: 0.3,
  };

  const DEFAULTS = {
    maxDepth: 3,          // player moves analysed ahead
    maxNodes: 8000,       // node visits per move — the laptop budget
    maxSpawnCells: 6,     // empty cells sampled per chance node (see below)
  };

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                      */
  /* ------------------------------------------------------------------ */

  function sizeOf(grid) {
    return grid.length;
  }

  /* Tiles are powers of two, so a table is both exact and fast — this is
   * called a few dozen times per scored position. */
  const LOG2_TABLE = {
    2: 1, 4: 2, 8: 3, 16: 4, 32: 5, 64: 6, 128: 7, 256: 8,
    512: 9, 1024: 10, 2048: 11, 4096: 12, 8192: 13, 16384: 14,
    32768: 15, 65536: 16,
  };

  function log2(value) {
    const known = LOG2_TABLE[value];
    return known === undefined ? Math.log(value) / Math.LN2 : known;
  }

  /* A tile's value as the heuristic should read it. An operator tile is a
   * modifier rather than a magnitude, so the ruleset reports it as the smallest
   * tile: it costs a cell like anything else, but it never pretends to be a
   * 1024 and it never earns a corner bonus.
   *
   * This is a ternary at each use rather than a shared helper, for the same
   * reason the loops below are written out in full: it runs a few times per cell
   * of every scored position, and the call frame cost more than the branch. */
  function emptyCells(grid) {
    const size = grid.length;
    const out = [];
    const flat = emptyIndices(grid);
    for (let i = 0; i < flat.length; i++) {
      out.push([flat[i] % size, (flat[i] / size) | 0]);
    }
    return out;
  }

  /* Empty cells as flat indices. The search walks flat lists rather than
   * [x, y] pairs because this runs at every chance node. */
  function emptyIndices(grid) {
    const size = grid.length;
    const out = [];
    for (let y = 0; y < size; y++) {
      const row = grid[y];
      for (let x = 0; x < size; x++) {
        if (row[x] === 0) out.push(y * size + x);
      }
    }
    return out;
  }

  /* Count only — scoring a leaf needs the number, not the list. */
  function countEmpty(grid) {
    let n = 0;
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        if (row[x] === 0) n++;
      }
    }
    return n;
  }

  function maxTileOf(grid) {
    let max = 0;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] > max) max = grid[y][x];
      }
    }
    return max;
  }

  /* How far each row and column is from being fully monotonic, in tile
   * doublings. The better of the two directions counts, and the total is
   * negative (0 is a perfectly monotonic board). */
  function monotonicityOf(grid, size, rules) {
    let total = 0;

    /* Both loops are written out in full rather than sharing a callback: this
     * is the hottest function in the search and an indirect call per cell cost
     * more than the arithmetic it wrapped. */
    for (let y = 0; y < size; y++) {
      const values = grid[y];
      let increasing = 0;
      let decreasing = 0;
      let current = 0;
      let next = 1;
      while (next < size) {
        while (next < size && values[next] === 0) next++;
        if (next >= size) break;
        const a = values[current] === 0 ? 0 : (rules ? log2(rules.heuristicValue(values[current])) : log2(values[current]));
        const b = values[next] === 0 ? 0 : (rules ? log2(rules.heuristicValue(values[next])) : log2(values[next]));
        if (a > b) decreasing += b - a;
        else if (b > a) increasing += a - b;
        current = next;
        next++;
      }
      total += increasing > decreasing ? increasing : decreasing;
    }

    for (let x = 0; x < size; x++) {
      let increasing = 0;
      let decreasing = 0;
      let current = 0;
      let next = 1;
      while (next < size) {
        while (next < size && grid[next][x] === 0) next++;
        if (next >= size) break;
        const a = grid[current][x] === 0 ? 0 : (rules ? log2(rules.heuristicValue(grid[current][x])) : log2(grid[current][x]));
        const b = grid[next][x] === 0 ? 0 : (rules ? log2(rules.heuristicValue(grid[next][x])) : log2(grid[next][x]));
        if (a > b) decreasing += b - a;
        else if (b > a) increasing += a - b;
        current = next;
        next++;
      }
      total += increasing > decreasing ? increasing : decreasing;
    }

    return total;
  }

  /* Penalise neighbouring tiles that differ a lot — they can never merge. */
  function smoothnessOf(grid, size, rules) {
    let total = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = grid[y][x];
        if (v === 0) continue;
        const a = rules ? log2(rules.heuristicValue(v)) : log2(v);
        if (x + 1 < size && grid[y][x + 1] !== 0) {
          const right = grid[y][x + 1];
          total -= Math.abs(a - (rules ? log2(rules.heuristicValue(right)) : log2(right)));
        }
        if (y + 1 < size && grid[y + 1][x] !== 0) {
          const below = grid[y + 1][x];
          total -= Math.abs(a - (rules ? log2(rules.heuristicValue(below)) : log2(below)));
        }
      }
    }
    return total;
  }

  /* Reusable scratch so scoring a leaf allocates nothing: the search visits
   * thousands of nodes per move and this function is the hot path. */
  const scratch = {
    empties: 0, monotonicity: 0, smoothness: 0,
    maxTile: 0, maxInCorner: false, maxOnEdge: false, score: 0,
  };

  /** Score a position, filling the shared scratch object with the terms. */
  function assess(grid, weights, rules) {
    const w = weights || WEIGHTS;
    const size = sizeOf(grid);
    const empties = countEmpty(grid);
    const monotonicity = monotonicityOf(grid, size, rules);
    const smoothness = smoothnessOf(grid, size, rules);
    const maxTile = maxTileOf(grid);

    let maxInCorner = false;
    let maxOnEdge = false;
    if (maxTile > 0) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (grid[y][x] !== maxTile) continue;
          const onLeft = x === 0;
          const onRight = x === size - 1;
          const onTop = y === 0;
          const onBottom = y === size - 1;
          if ((onLeft || onRight) && (onTop || onBottom)) maxInCorner = true;
          if (onLeft || onRight || onTop || onBottom) maxOnEdge = true;
        }
      }
    }

    const maxLog = maxTile > 0 ? log2(maxTile) : 0;
    const score = empties * w.empty
      + monotonicity * w.monotonicity
      + smoothness * w.smoothness
      + (maxInCorner ? maxLog * w.corner : 0)
      + (maxOnEdge ? maxLog * w.edge : 0);

    scratch.empties = empties;
    scratch.monotonicity = monotonicity;
    scratch.smoothness = smoothness;
    scratch.maxTile = maxTile;
    scratch.maxInCorner = maxInCorner;
    scratch.maxOnEdge = maxOnEdge;
    scratch.score = score;
    return score;
  }

  /** Score a position (no breakdown). */
  function evaluateGrid(grid, weights, rules) {
    return assess(grid, weights, rules);
  }

  /** The heuristic terms for a position, for the interface to explain itself. */
  function analyse(grid, weights, rules) {
    assess(grid, weights, rules);
    return {
      empties: scratch.empties,
      monotonicity: scratch.monotonicity,
      smoothness: scratch.smoothness,
      maxTile: scratch.maxTile,
      maxInCorner: scratch.maxInCorner,
      maxOnEdge: scratch.maxOnEdge,
      score: scratch.score,
    };
  }

  /** Directions that actually change the board, in a fixed order. */
  function legalMoves(grid, rules) {
    const size = sizeOf(grid);
    const merge = (rules && !rules.vanilla) ? rules.mergePair : null;
    const out = [];
    for (let i = 0; i < DIRECTIONS.length; i++) {
      const dir = DIRECTIONS[i];
      const res = GameLib.applyMove(grid, size, dir, null, merge);
      if (res.moved) out.push({ dir: dir, grid: res.grid, gained: res.gained });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Expectimax                                                         */
  /* ------------------------------------------------------------------ */

  /*
   * One reusable grid per search level, so a simulated move does not allocate
   * a fresh 4x4. Depth is strictly nested and strictly decreasing, so a level's
   * buffer is never in use by two frames at once.
   *
   * (A transposition table on string keys was tried here and removed: at 4x4 it
   * cost about 5us per node to hash and store, while saving only around a tenth
   * of the nodes — a net loss. Measured, not assumed.)
   */
  function makeContext(size, options) {
    const maxDepth = Math.max(1, Math.min(6, options.maxDepth || DEFAULTS.maxDepth));
    const scratch = [];
    for (let level = 0; level <= maxDepth + 1; level++) {
      scratch.push(GameLib.emptyGrid(size));
    }
    // The untouched default blocks collapse to the vanilla paths: no rules to
    // consult, no merge callback, and the built-in 90/10 spawn pair.
    const rules = (options.rules && !options.rules.vanilla) ? options.rules : null;

    return {
      size: size,
      weights: options.weights || WEIGHTS,
      maxDepth: maxDepth,
      maxNodes: Math.max(1000, options.maxNodes || DEFAULTS.maxNodes),
      maxSpawnCells: Math.max(1, Math.min(16, options.maxSpawnCells || DEFAULTS.maxSpawnCells)),
      rules: rules,
      merge: rules ? rules.mergePair : null,
      spawns: (rules && rules.spawns.length) ? rules.spawns : VANILLA_SPAWNS,
      nodes: 0,
      scratch: scratch,
    };
  }

  /* Our turn: the best expectation over the legal directions. */
  function maxValue(grid, depth, ctx) {
    ctx.nodes++;
    if (depth <= 0 || ctx.nodes > ctx.maxNodes) return evaluateGrid(grid, ctx.weights, ctx.rules);

    const size = ctx.size;
    const buffer = ctx.scratch[depth];
    let best = -Infinity;
    let any = false;

    for (let i = 0; i < DIRECTIONS.length; i++) {
      const res = GameLib.applyMove(grid, size, DIRECTIONS[i], buffer, ctx.merge);
      if (!res.moved) continue;
      any = true;
      const value = chanceValue(res.grid, depth, ctx);
      if (value > best) best = value;
    }

    if (!any) return evaluateGrid(grid, ctx.weights, ctx.rules);
    return best;
  }

  /* The board's turn: average over every empty cell and every block that can
   * spawn there, weighted by that block's real share of the spawn table. */
  function chanceValue(grid, depth, ctx) {
    ctx.nodes++;
    if (depth <= 0 || ctx.nodes > ctx.maxNodes) return evaluateGrid(grid, ctx.weights, ctx.rules);

    const size = ctx.size;
    const spawns = ctx.spawns;
    const all = emptyIndices(grid);
    if (all.length === 0) return evaluateGrid(grid, ctx.weights, ctx.rules);

    // Averaging all 16 cells times two spawn values at every chance node is
    // what makes a full-width search too expensive. When the board is open, a
    // fixed, evenly spread sample stands in for the whole: deterministic, and
    // still spread across the board rather than clustered in one corner.
    let empties = all;
    if (all.length > ctx.maxSpawnCells) {
      empties = [];
      for (let k = 0; k < ctx.maxSpawnCells; k++) {
        empties.push(all[Math.floor(k * all.length / ctx.maxSpawnCells)]);
      }
    }

    let total = 0;
    for (let i = 0; i < empties.length; i++) {
      const x = empties[i] % size;
      const y = (empties[i] / size) | 0;
      const saved = grid[y][x];

      for (let s = 0; s < spawns.length; s++) {
        grid[y][x] = spawns[s].value;
        total += spawns[s].share * maxValue(grid, depth - 1, ctx);
      }

      grid[y][x] = saved;
    }
    // The shares sum to 1, so the mean is simply the total over the cells.
    return total / empties.length;
  }

  /**
   * Choose a move.
   *
   * Returns
   *   { dir, value, candidates, depth, nodes, ms, breakdown, key }
   * where `candidates` lists all four directions with the expectimax value of
   * each (and `legal: false` for the ones that would not change the board), so
   * the interface can show what the AI weighed up. `dir` is null when no move
   * exists — the game is over.
   *
   * `options`: { maxDepth, maxNodes, weights }.
   */
  function bestMove(grid, options) {
    const o = options || {};
    const size = sizeOf(grid);
    const started = now();
    const ctx = makeContext(size, o);
    const depth = ctx.maxDepth;
    const buffer = ctx.scratch[depth];

    const candidates = [];
    let best = null;

    for (let i = 0; i < DIRECTIONS.length; i++) {
      const dir = DIRECTIONS[i];
      const res = GameLib.applyMove(grid, size, dir, buffer, ctx.merge);
      if (!res.moved) {
        candidates.push({ dir: dir, legal: false, value: null });
        continue;
      }
      // The player moves, then a tile spawns: the value of this direction is
      // the expectation over that spawn. The result is read out of the shared
      // buffer before the next direction overwrites it.
      const value = chanceValue(res.grid, depth, ctx);
      candidates.push({ dir: dir, legal: true, value: value });
      if (!best || value > best.value) {
        best = { dir: dir, value: value, gained: res.gained, board: copyGrid(res.grid) };
      }
    }

    if (!best) {
      return {
        dir: null,
        value: null,
        candidates: candidates,
        depth: depth,
        nodes: ctx.nodes,
        ms: now() - started,
        breakdown: null,
      };
    }

    return {
      dir: best.dir,
      value: best.value,
      gained: best.gained,
      board: best.board,
      candidates: candidates,
      depth: depth,
      nodes: ctx.nodes,
      ms: now() - started,
      breakdown: analyse(best.board, ctx.weights, ctx.rules),
    };
  }

  function copyGrid(grid) {
    const out = [];
    for (let y = 0; y < grid.length; y++) out.push(grid[y].slice());
    return out;
  }

  function now() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  /**
   * Play a whole game with the AI driving, for measurement and tests.
   *
   * Uses the real `Game` core, so the spawns (and therefore the run) depend on
   * `seed` — the same seed always plays the same game. Returns
   * { seed, moves, score, maxTile, won, over, nodes, ms }.
   */
  function playGame(seed, options) {
    const o = options || {};
    const game = new GameLib.Game({ size: o.size || 4, seed: seed >>> 0, rules: o.rules });
    const started = now();
    let nodes = 0;
    let moves = 0;

    while (!game.isGameOver() && moves < (o.maxMoves || 20000)) {
      const choice = bestMove(game.grid, o);
      if (!choice.dir) break;
      game.move(choice.dir);
      nodes += choice.nodes;
      moves++;
    }

    return {
      seed: seed >>> 0,
      moves: moves,
      score: game.score,
      maxTile: game.maxTile(),
      won: game.maxTile() >= (o.rules ? o.rules.winValue : WIN_VALUE),
      over: game.isGameOver(),
      nodes: nodes,
      ms: now() - started,
    };
  }

  const AiLib = {
    WEIGHTS: WEIGHTS,
    DEFAULTS: DEFAULTS,
    evaluateGrid: evaluateGrid,
    analyse: analyse,
    legalMoves: legalMoves,
    emptyCells: emptyCells,
    countEmpty: countEmpty,
    copyGrid: copyGrid,
    maxTileOf: maxTileOf,
    monotonicityOf: monotonicityOf,
    smoothnessOf: smoothnessOf,
    log2: log2,
    bestMove: bestMove,
    playGame: playGame,
  };

  global.AiLib = AiLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AiLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
