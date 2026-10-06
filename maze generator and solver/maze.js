/* maze.js — maze generation and solving core.
 *
 * Pure logic, no DOM: runs in the browser (as `MazeLib`) and in Node
 * (`module.exports`) so the algorithms can be tested with `node test.js`.
 *
 * A "perfect" maze is a spanning tree of the cell grid: every cell is
 * reachable and there is exactly one path between any two cells. All
 * generators here produce perfect mazes.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Seeded RNG (mulberry32) — same seed, same maze.                     */
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

  /* ------------------------------------------------------------------ */
  /* Maze model                                                         */
  /* ------------------------------------------------------------------ */
  /* Walls are stored as two bit arrays:
   *   vWalls — vertical segments,   (cols + 1) wide per row (incl. borders)
   *   hWalls — horizontal segments, (rows + 1) tall per column (incl. borders)
   * 1 = wall present, 0 = passage. Border walls always stay in place. */

  class Maze {
    constructor(cols, rows) {
      if (cols < 1 || rows < 1) throw new Error('Maze needs at least 1x1 cells');
      this.cols = cols;
      this.rows = rows;
      this.vWalls = new Uint8Array((cols + 1) * rows).fill(1);
      this.hWalls = new Uint8Array(cols * (rows + 1)).fill(1);
    }

    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
    }

    vi(x, y) {
      return y * (this.cols + 1) + x;
    }

    hi(x, y) {
      return y * this.cols + x;
    }

    /**
     * True if there is a wall between two adjacent cells. Anything
     * non-adjacent or out of bounds counts as walled.
     */
    hasWall(x1, y1, x2, y2) {
      if (x2 === x1 + 1 && y2 === y1) return this.vWalls[this.vi(x1 + 1, y1)] === 1;
      if (x2 === x1 - 1 && y2 === y1) return this.vWalls[this.vi(x1, y1)] === 1;
      if (y2 === y1 + 1 && x2 === x1) return this.hWalls[this.hi(x1, y1 + 1)] === 1;
      if (y2 === y1 - 1 && x2 === x1) return this.hWalls[this.hi(x1, y1)] === 1;
      return true;
    }

    /** Remove the wall between two adjacent in-bounds cells. */
    carve(x1, y1, x2, y2) {
      if (!this.inBounds(x1, y1) || !this.inBounds(x2, y2)) {
        throw new Error('carve: cell out of bounds');
      }
      if (x2 === x1 + 1 && y2 === y1) this.vWalls[this.vi(x1 + 1, y1)] = 0;
      else if (x2 === x1 - 1 && y2 === y1) this.vWalls[this.vi(x1, y1)] = 0;
      else if (y2 === y1 + 1 && x2 === x1) this.hWalls[this.hi(x1, y1 + 1)] = 0;
      else if (y2 === y1 - 1 && x2 === x1) this.hWalls[this.hi(x1, y1)] = 0;
      else throw new Error('carve: cells are not adjacent');
      return this;
    }

    /** Open passages from a cell, as [x, y] pairs. */
    neighbors(x, y) {
      const out = [];
      if (y > 0 && !this.hasWall(x, y, x, y - 1)) out.push([x, y - 1]);
      if (x + 1 < this.cols && !this.hasWall(x, y, x + 1, y)) out.push([x + 1, y]);
      if (y + 1 < this.rows && !this.hasWall(x, y, x, y + 1)) out.push([x, y + 1]);
      if (x > 0 && !this.hasWall(x, y, x - 1, y)) out.push([x - 1, y]);
      return out;
    }

    /** Number of removed interior walls (= number of passages). */
    passageCount() {
      let n = 0;
      for (let y = 0; y < this.rows; y++) {
        for (let x = 1; x < this.cols; x++) {
          if (this.vWalls[this.vi(x, y)] === 0) n++;
        }
      }
      for (let y = 1; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          if (this.hWalls[this.hi(x, y)] === 0) n++;
        }
      }
      return n;
    }

    /** True when every border wall is still in place. */
    bordersIntact() {
      for (let y = 0; y < this.rows; y++) {
        if (this.vWalls[this.vi(0, y)] === 0) return false;
        if (this.vWalls[this.vi(this.cols, y)] === 0) return false;
      }
      for (let x = 0; x < this.cols; x++) {
        if (this.hWalls[this.hi(x, 0)] === 0) return false;
        if (this.hWalls[this.hi(x, this.rows)] === 0) return false;
      }
      return true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Generators — each produces a perfect maze                          */
  /* ------------------------------------------------------------------ */
  /* Every generator calls `record(x1, y1, x2, y2)` for each carved wall,
   * in order. The app replays these events to animate the construction. */

  function carveBetween(maze, record, x1, y1, x2, y2) {
    maze.carve(x1, y1, x2, y2);
    record(x1, y1, x2, y2);
  }

  /* Depth-first search with backtracking: carve forward from the current
   * cell to a random unvisited neighbour, backtrack when stuck. */
  function recursiveBacktracker(maze, rng, record) {
    const cols = maze.cols;
    const rows = maze.rows;
    const visited = new Uint8Array(cols * rows);
    const stack = [[0, 0]];
    visited[0] = 1;

    while (stack.length > 0) {
      const cell = stack[stack.length - 1];
      const x = cell[0];
      const y = cell[1];
      const options = [];
      if (y > 0 && !visited[(y - 1) * cols + x]) options.push([x, y - 1]);
      if (x + 1 < cols && !visited[y * cols + x + 1]) options.push([x + 1, y]);
      if (y + 1 < rows && !visited[(y + 1) * cols + x]) options.push([x, y + 1]);
      if (x > 0 && !visited[y * cols + x - 1]) options.push([x - 1, y]);

      if (options.length === 0) {
        stack.pop();
        continue;
      }
      const next = options[Math.floor(rng() * options.length)];
      carveBetween(maze, record, x, y, next[0], next[1]);
      visited[next[1] * cols + next[0]] = 1;
      stack.push(next);
    }
  }

  /* Grow a tree from a start cell: repeatedly carve through a random wall
   * on the frontier between a maze cell and a not-yet-added cell. */
  function randomizedPrim(maze, rng, record) {
    const cols = maze.cols;
    const rows = maze.rows;
    const inMaze = new Uint8Array(cols * rows);
    const frontier = [];

    function addFrontier(x, y) {
      if (y > 0 && !inMaze[(y - 1) * cols + x]) frontier.push([x, y, x, y - 1]);
      if (x + 1 < cols && !inMaze[y * cols + x + 1]) frontier.push([x, y, x + 1, y]);
      if (y + 1 < rows && !inMaze[(y + 1) * cols + x]) frontier.push([x, y, x, y + 1]);
      if (x > 0 && !inMaze[y * cols + x - 1]) frontier.push([x, y, x - 1, y]);
    }

    inMaze[0] = 1;
    addFrontier(0, 0);

    while (frontier.length > 0) {
      const i = Math.floor(rng() * frontier.length);
      const wall = frontier[i];
      frontier[i] = frontier[frontier.length - 1];
      frontier.pop();

      const x1 = wall[0];
      const y1 = wall[1];
      const x2 = wall[2];
      const y2 = wall[3];
      if (inMaze[y2 * cols + x2]) continue;

      carveBetween(maze, record, x1, y1, x2, y2);
      inMaze[y2 * cols + x2] = 1;
      addFrontier(x2, y2);
    }
  }

  /* Kruskal: consider all interior walls in random order, carve each one
   * whose two cells are in different components (union-find). */
  function kruskal(maze, rng, record) {
    const cols = maze.cols;
    const rows = maze.rows;
    const parent = new Int32Array(cols * rows);
    for (let i = 0; i < parent.length; i++) parent[i] = i;

    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }

    const walls = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (x + 1 < cols) walls.push([x, y, x + 1, y]);
        if (y + 1 < rows) walls.push([x, y, x, y + 1]);
      }
    }

    // Fisher-Yates shuffle
    for (let i = walls.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = walls[i];
      walls[i] = walls[j];
      walls[j] = tmp;
    }

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      const a = wall[1] * cols + wall[0];
      const b = wall[3] * cols + wall[2];
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) {
        parent[ra] = rb;
        carveBetween(maze, record, wall[0], wall[1], wall[2], wall[3]);
      }
    }
  }

  const GENERATORS = {
    backtracker: { name: 'Recursive backtracker', run: recursiveBacktracker },
    prim: { name: "Randomized Prim's", run: randomizedPrim },
    kruskal: { name: "Kruskal's", run: kruskal },
  };

  /**
   * Build a maze with the given generator and seed.
   * Returns { maze, events } where `events` lists the carved walls in
   * order — replay them on a fresh Maze to animate the construction.
   */
  function generate(cols, rows, algorithm, seed) {
    const gen = GENERATORS[algorithm || 'backtracker'];
    if (!gen) throw new Error('Unknown generator: ' + algorithm);
    const maze = new Maze(cols, rows);
    const events = [];
    gen.run(maze, makeRng(seed), function (x1, y1, x2, y2) {
      events.push([x1, y1, x2, y2]);
    });
    return { maze: maze, events: events };
  }

  /* ------------------------------------------------------------------ */
  /* Solvers                                                            */
  /* ------------------------------------------------------------------ */
  /* All solvers return { path, visited } where `path` is a list of
   * [x, y] cells from start to goal (or null when unreachable) and
   * `visited` is the exploration order, for animation. */

  /* Min-heap keyed by priority — used by A*. */
  class MinHeap {
    constructor() {
      this.items = [];
    }

    get size() {
      return this.items.length;
    }

    push(index, priority) {
      const items = this.items;
      items.push({ index: index, priority: priority });
      let i = items.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (items[p].priority <= items[i].priority) break;
        const tmp = items[p];
        items[p] = items[i];
        items[i] = tmp;
        i = p;
      }
    }

    pop() {
      const items = this.items;
      const top = items[0];
      const last = items.pop();
      if (items.length > 0) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < items.length && items[l].priority < items[m].priority) m = l;
          if (r < items.length && items[r].priority < items[m].priority) m = r;
          if (m === i) break;
          const tmp = items[m];
          items[m] = items[i];
          items[i] = tmp;
          i = m;
        }
      }
      return top;
    }
  }

  function cellList(indices, cols) {
    return indices.map(function (i) {
      return [i % cols, (i / cols) | 0];
    });
  }

  function reconstruct(maze, prev, goalIndex, visitedIndices) {
    const cols = maze.cols;
    const visited = cellList(visitedIndices, cols);
    if (prev[goalIndex] === -2) return { path: null, visited: visited };
    const path = [];
    for (let i = goalIndex; i !== -1; i = prev[i]) path.push(i);
    path.reverse();
    return { path: cellList(path, cols), visited: visited };
  }

  /* Breadth-first search — finds a shortest path. */
  function solveBfs(maze, start, goal) {
    const cols = maze.cols;
    const startIndex = start[1] * cols + start[0];
    const goalIndex = goal[1] * cols + goal[0];
    const prev = new Int32Array(cols * maze.rows).fill(-2);
    prev[startIndex] = -1;

    const queue = [startIndex];
    const visited = [];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      visited.push(i);
      if (i === goalIndex) break;
      const x = i % cols;
      const y = (i / cols) | 0;
      const next = maze.neighbors(x, y);
      for (let k = 0; k < next.length; k++) {
        const ni = next[k][1] * cols + next[k][0];
        if (prev[ni] === -2) {
          prev[ni] = i;
          queue.push(ni);
        }
      }
    }
    return reconstruct(maze, prev, goalIndex, visited);
  }

  /* Depth-first search — finds some path, not necessarily the shortest. */
  function solveDfs(maze, start, goal) {
    const cols = maze.cols;
    const startIndex = start[1] * cols + start[0];
    const goalIndex = goal[1] * cols + goal[0];
    const prev = new Int32Array(cols * maze.rows).fill(-2);
    prev[startIndex] = -1;

    const stack = [startIndex];
    const visited = [];
    while (stack.length > 0) {
      const i = stack.pop();
      visited.push(i);
      if (i === goalIndex) break;
      const x = i % cols;
      const y = (i / cols) | 0;
      const next = maze.neighbors(x, y);
      for (let k = 0; k < next.length; k++) {
        const ni = next[k][1] * cols + next[k][0];
        if (prev[ni] === -2) {
          prev[ni] = i;
          stack.push(ni);
        }
      }
    }
    return reconstruct(maze, prev, goalIndex, visited);
  }

  /* A* with a Manhattan-distance heuristic — shortest path, explores less
   * than BFS on average. */
  function solveAstar(maze, start, goal) {
    const cols = maze.cols;
    const startIndex = start[1] * cols + start[0];
    const goalIndex = goal[1] * cols + goal[0];
    const goalX = goal[0];
    const goalY = goal[1];

    function heuristic(x, y) {
      return Math.abs(x - goalX) + Math.abs(y - goalY);
    }

    const prev = new Int32Array(cols * maze.rows).fill(-2);
    const cost = new Float64Array(cols * maze.rows).fill(Infinity);
    const closed = new Uint8Array(cols * maze.rows);
    prev[startIndex] = -1;
    cost[startIndex] = 0;

    const heap = new MinHeap();
    heap.push(startIndex, heuristic(start[0], start[1]));

    const visited = [];
    while (heap.size > 0) {
      const i = heap.pop().index;
      if (closed[i]) continue;
      closed[i] = 1;
      visited.push(i);
      if (i === goalIndex) break;

      const x = i % cols;
      const y = (i / cols) | 0;
      const next = maze.neighbors(x, y);
      for (let k = 0; k < next.length; k++) {
        const nx = next[k][0];
        const ny = next[k][1];
        const ni = ny * cols + nx;
        const tentative = cost[i] + 1;
        if (tentative < cost[ni]) {
          cost[ni] = tentative;
          prev[ni] = i;
          heap.push(ni, tentative + heuristic(nx, ny));
        }
      }
    }
    return reconstruct(maze, prev, goalIndex, visited);
  }

  const SOLVERS = {
    bfs: { name: 'Breadth-first search', run: solveBfs },
    dfs: { name: 'Depth-first search', run: solveDfs },
    astar: { name: 'A* (Manhattan)', run: solveAstar },
  };

  /**
   * Solve a maze from start to goal with the given algorithm.
   * Returns { path, visited }; `path` is null when the goal is unreachable.
   */
  function solve(maze, start, goal, algorithm) {
    const solver = SOLVERS[algorithm || 'bfs'];
    if (!solver) throw new Error('Unknown solver: ' + algorithm);
    if (!maze.inBounds(start[0], start[1]) || !maze.inBounds(goal[0], goal[1])) {
      throw new Error('solve: start or goal out of bounds');
    }
    if (start[0] === goal[0] && start[1] === goal[1]) {
      return { path: [[start[0], start[1]]], visited: [] };
    }
    return solver.run(maze, start, goal);
  }

  /* ------------------------------------------------------------------ */
  /* Exports                                                            */
  /* ------------------------------------------------------------------ */

  const MazeLib = {
    Maze: Maze,
    makeRng: makeRng,
    generate: generate,
    solve: solve,
    GENERATORS: GENERATORS,
    SOLVERS: SOLVERS,
  };

  global.MazeLib = MazeLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MazeLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
