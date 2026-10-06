/* app.js — canvas rendering, UI wiring and animation for the maze
 * visualizer. Depends on maze.js (the core) being loaded first.
 *
 * Animation runs in phases: 'generating' (replays the carve events),
 * 'solving' (reveals the solver's exploration order), 'done' (path shown).
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* elements                                                           */
  /* ------------------------------------------------------------------ */

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const canvasWrap = document.getElementById('canvas-wrap');

  const el = {
    newMaze: document.getElementById('new-maze'),
    build: document.getElementById('build'),
    pause: document.getElementById('pause'),
    skip: document.getElementById('skip'),
    generator: document.getElementById('generator'),
    solver: document.getElementById('solver'),
    seed: document.getElementById('seed'),
    cellSize: document.getElementById('cell-size'),
    cellSizeValue: document.getElementById('cell-size-value'),
    speed: document.getElementById('speed'),
    speedValue: document.getElementById('speed-value'),
    showSolution: document.getElementById('show-solution'),
    statDims: document.getElementById('stat-dims'),
    statSeed: document.getElementById('stat-seed'),
    statPassages: document.getElementById('stat-passages'),
    statPath: document.getElementById('stat-path'),
    statVisited: document.getElementById('stat-visited'),
    statStatus: document.getElementById('stat-status'),
  };

  /* ------------------------------------------------------------------ */
  /* state                                                              */
  /* ------------------------------------------------------------------ */

  const state = {
    maze: new MazeLib.Maze(2, 2),
    events: [], // carve events, replayed during the 'generating' phase
    eventIndex: 0,
    solution: null, // { path, visited } once computed
    visitIndex: 0,
    phase: 'generating', // generating | solving | done
    paused: false,
    cellSize: 16,
    speed: 300, // animation steps per second
    generator: 'backtracker',
    solver: 'bfs',
    seed: 20261002,
    pathVisible: true,
    active: null, // cell currently being carved / explored
    acc: 0,
    lastTime: 0,
  };

  let wrapW = 0;
  let wrapH = 0;

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  function drawDot(x, y, color) {
    const cs = state.cellSize;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * cs + cs / 2, y * cs + cs / 2, Math.max(2, cs * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    const maze = state.maze;
    const cs = state.cellSize;
    const w = maze.cols * cs;
    const h = maze.rows * cs;

    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, w, h);

    // explored cells
    if (state.solution) {
      const visited = state.solution.visited;
      ctx.fillStyle = 'rgba(122, 162, 255, 0.12)';
      for (let i = 0; i < state.visitIndex; i++) {
        ctx.fillRect(visited[i][0] * cs, visited[i][1] * cs, cs, cs);
      }
    }

    // active cell (wall being carved / cell being explored)
    if (state.active) {
      ctx.fillStyle = 'rgba(122, 162, 255, 0.45)';
      ctx.fillRect(state.active[0] * cs, state.active[1] * cs, cs, cs);
    }

    // solution path
    if (state.phase === 'done' && state.pathVisible && state.solution && state.solution.path) {
      const path = state.solution.path;
      ctx.strokeStyle = '#7aa2ff';
      ctx.lineWidth = Math.max(2, cs * 0.35);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(path[0][0] * cs + cs / 2, path[0][1] * cs + cs / 2);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i][0] * cs + cs / 2, path[i][1] * cs + cs / 2);
      }
      ctx.stroke();
    }

    // start and goal
    drawDot(0, 0, '#4ade80');
    drawDot(maze.cols - 1, maze.rows - 1, '#f87171');

    // walls on top
    ctx.strokeStyle = '#3d4560';
    ctx.lineWidth = Math.min(2.5, Math.max(1, cs / 7));
    ctx.beginPath();
    for (let y = 0; y < maze.rows; y++) {
      for (let x = 0; x <= maze.cols; x++) {
        if (maze.vWalls[maze.vi(x, y)]) {
          ctx.moveTo(x * cs, y * cs);
          ctx.lineTo(x * cs, (y + 1) * cs);
        }
      }
    }
    for (let y = 0; y <= maze.rows; y++) {
      for (let x = 0; x < maze.cols; x++) {
        if (maze.hWalls[maze.hi(x, y)]) {
          ctx.moveTo(x * cs, y * cs);
          ctx.lineTo((x + 1) * cs, y * cs);
        }
      }
    }
    ctx.stroke();
  }

  function updateStats() {
    const maze = state.maze;
    el.statDims.textContent = maze.cols + ' × ' + maze.rows;
    el.statSeed.textContent = String(state.seed);
    el.statPassages.textContent = state.eventIndex + ' / ' + state.events.length;

    let pathText = '—';
    if (state.solution) {
      pathText = state.solution.path ? state.solution.path.length + ' cells' : 'none';
    }
    el.statPath.textContent = pathText;

    let visitedText = '—';
    if (state.solution) {
      visitedText = state.visitIndex + ' / ' + state.solution.visited.length;
    }
    el.statVisited.textContent = visitedText;

    const label =
      state.phase === 'generating' ? 'Carving' : state.phase === 'solving' ? 'Exploring' : 'Solved';
    el.statStatus.textContent = state.paused ? label + ' (paused)' : label;
  }

  /* ------------------------------------------------------------------ */
  /* build / phases                                                     */
  /* ------------------------------------------------------------------ */

  function startSolving() {
    state.solution = MazeLib.solve(
      state.maze,
      [0, 0],
      [state.maze.cols - 1, state.maze.rows - 1],
      state.solver
    );
    state.visitIndex = 0;
    state.phase = 'solving';
  }

  function finishSolving() {
    if (state.phase === 'solving' && state.solution) {
      state.visitIndex = state.solution.visited.length;
      state.phase = 'done';
    }
    state.active = null;
  }

  /** Recompute the solution of the finished maze (e.g. solver changed). */
  function reSolve() {
    if (state.phase !== 'done') return;
    startSolving();
    finishSolving();
    render();
    updateStats();
  }

  /**
   * Build a maze that fits the wrap area.
   * `animate` true replays the construction; false jumps straight to the
   * solved state (used on resize / cell-size changes).
   */
  function build(animate) {
    const cs = state.cellSize;
    const dpr = window.devicePixelRatio || 1;
    wrapW = canvasWrap.clientWidth;
    wrapH = canvasWrap.clientHeight;
    const cols = Math.max(2, Math.floor(wrapW / cs));
    const rows = Math.max(2, Math.floor(wrapH / cs));
    const w = cols * cs;
    const h = rows * cs;

    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const result = MazeLib.generate(cols, rows, state.generator, state.seed);
    state.events = result.events;

    if (animate) {
      state.maze = new MazeLib.Maze(cols, rows);
      state.eventIndex = 0;
      state.solution = null;
      state.visitIndex = 0;
      state.phase = 'generating';
      state.active = null;
      state.paused = false;
      state.acc = 0;
      el.pause.textContent = 'Pause';
    } else {
      state.maze = result.maze;
      state.eventIndex = result.events.length;
      startSolving();
      finishSolving();
    }
    render();
    updateStats();
  }

  /** Apply up to `n` animation steps. */
  function consume(n) {
    if (state.phase === 'generating') {
      const end = Math.min(state.events.length, state.eventIndex + n);
      while (state.eventIndex < end) {
        const ev = state.events[state.eventIndex++];
        state.maze.carve(ev[0], ev[1], ev[2], ev[3]);
        state.active = [ev[2], ev[3]];
      }
      if (state.eventIndex >= state.events.length) {
        state.active = null;
        startSolving();
      }
    } else if (state.phase === 'solving' && state.solution) {
      const visited = state.solution.visited;
      state.visitIndex = Math.min(visited.length, state.visitIndex + n);
      state.active = state.visitIndex > 0 ? visited[state.visitIndex - 1] : null;
      if (state.visitIndex >= visited.length) {
        state.active = null;
        state.phase = 'done';
      }
    }
  }

  function loop(now) {
    const dt = state.lastTime ? Math.min(0.25, (now - state.lastTime) / 1000) : 0;
    state.lastTime = now;

    if (!state.paused && state.phase !== 'done') {
      state.acc += dt * state.speed;
      const steps = Math.floor(state.acc);
      if (steps > 0) {
        state.acc -= steps;
        consume(Math.min(steps, 20000));
      }
      render();
      updateStats();
    }
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ */
  /* controls                                                           */
  /* ------------------------------------------------------------------ */

  function randomSeed() {
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }

  function readSeed() {
    const value = Number(el.seed.value);
    return (Number.isFinite(value) ? Math.floor(value) : randomSeed()) >>> 0;
  }

  function togglePause() {
    state.paused = !state.paused;
    el.pause.textContent = state.paused ? 'Resume' : 'Pause';
    updateStats();
  }

  el.newMaze.addEventListener('click', function () {
    state.seed = randomSeed();
    el.seed.value = state.seed;
    build(true);
  });

  el.build.addEventListener('click', function () {
    state.seed = readSeed();
    el.seed.value = state.seed;
    build(true);
  });

  el.pause.addEventListener('click', togglePause);

  el.skip.addEventListener('click', function () {
    if (state.phase === 'generating') {
      while (state.eventIndex < state.events.length) {
        const ev = state.events[state.eventIndex++];
        state.maze.carve(ev[0], ev[1], ev[2], ev[3]);
      }
      startSolving();
    }
    finishSolving();
    render();
    updateStats();
  });

  el.generator.addEventListener('change', function () {
    state.generator = el.generator.value;
    build(true);
  });

  el.solver.addEventListener('change', function () {
    state.solver = el.solver.value;
    reSolve();
  });

  el.seed.addEventListener('change', function () {
    state.seed = readSeed();
    el.seed.value = state.seed;
  });

  el.cellSize.addEventListener('input', function () {
    state.cellSize = Number(el.cellSize.value);
    el.cellSizeValue.textContent = el.cellSize.value;
    build(false);
  });

  el.speed.addEventListener('input', function () {
    state.speed = Number(el.speed.value);
    el.speedValue.textContent = el.speed.value;
  });

  el.showSolution.addEventListener('change', function () {
    state.pathVisible = el.showSolution.checked;
    render();
  });

  /* ------------------------------------------------------------------ */
  /* keyboard                                                           */
  /* ------------------------------------------------------------------ */

  document.addEventListener('keydown', function (ev) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    switch (ev.key.toLowerCase()) {
      case ' ':
        ev.preventDefault();
        togglePause();
        break;
      case 'n':
        state.seed = randomSeed();
        el.seed.value = state.seed;
        build(true);
        break;
      case 's':
        el.skip.click();
        break;
    }
  });

  /* ------------------------------------------------------------------ */
  /* init                                                               */
  /* ------------------------------------------------------------------ */

  function fillSelect(select, registry, selected) {
    for (const id of Object.keys(registry)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = registry[id].name;
      if (id === selected) option.selected = true;
      select.appendChild(option);
    }
  }

  fillSelect(el.generator, MazeLib.GENERATORS, state.generator);
  fillSelect(el.solver, MazeLib.SOLVERS, state.solver);

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () {
      // rebuild instantly when the area actually changed size
      if (canvasWrap.clientWidth !== wrapW || canvasWrap.clientHeight !== wrapH) {
        build(false);
      }
    }).observe(canvasWrap);
  } else {
    window.addEventListener('resize', function () {
      build(false);
    });
  }

  build(true); // animated intro
  requestAnimationFrame(loop);
})();
