/* app.js — canvas rendering, UI wiring and interaction for the Game of Life.
 * Depends on life.js (the simulation core) being loaded first.
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
    play: document.getElementById('play'),
    step: document.getElementById('step'),
    clear: document.getElementById('clear'),
    random: document.getElementById('random'),
    speed: document.getElementById('speed'),
    speedValue: document.getElementById('speed-value'),
    cellSize: document.getElementById('cell-size'),
    cellSizeValue: document.getElementById('cell-size-value'),
    density: document.getElementById('density'),
    densityValue: document.getElementById('density-value'),
    wrap: document.getElementById('wrap'),
    showGrid: document.getElementById('show-grid'),
    pattern: document.getElementById('pattern'),
    generation: document.getElementById('generation'),
    population: document.getElementById('population'),
    status: document.getElementById('status'),
  };

  /* ------------------------------------------------------------------ */
  /* state                                                              */
  /* ------------------------------------------------------------------ */

  const state = {
    life: new Life(1, 1),
    cellSize: 12, // CSS pixels per cell
    speed: 10,          // generations per second
    density: 0.25,
    wrap: true,
    showGrid: true,
    running: false,
    pattern: 'draw', // 'draw' or a pattern id
    acc: 0,
    lastTime: 0,
    painting: false,
    paintValue: 1,
    lastCell: null,
    hover: null,
  };

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  function render() {
    const life = state.life;
    const cellSize = state.cellSize;
    const w = life.cols * cellSize;
    const h = life.rows * cellSize;

    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, w, h);

    // live cells, one flat fill
    ctx.fillStyle = '#7aa2ff';
    for (let y = 0; y < life.rows; y++) {
      for (let x = 0; x < life.cols; x++) {
        if (life.get(x, y)) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    // grid lines (only when cells are big enough to see them)
    if (state.showGrid && cellSize >= 6) {
      ctx.strokeStyle = 'rgba(232, 234, 240, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < life.cols; x++) {
        ctx.moveTo(x * cellSize + 0.5, 0);
        ctx.lineTo(x * cellSize + 0.5, h);
      }
      for (let y = 1; y < life.rows; y++) {
        ctx.moveTo(0, y * cellSize + 0.5);
        ctx.lineTo(w, y * cellSize + 0.5);
      }
      ctx.stroke();
    }

    // hover highlight while painting
    if (state.hover && state.pattern === 'draw') {
      ctx.strokeStyle = 'rgba(122, 162, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        state.hover.x * cellSize + 0.5,
        state.hover.y * cellSize + 0.5,
        cellSize - 1,
        cellSize - 1
      );
    }
  }

  function updateStats() {
    el.generation.textContent = state.life.generation;
    el.population.textContent = state.life.population;
    el.status.textContent = state.running ? 'Running' : 'Paused';
  }

  /* ------------------------------------------------------------------ */
  /* layout                                                             */
  /* ------------------------------------------------------------------ */

  function layout() {
    const cellSize = state.cellSize;
    const dpr = window.devicePixelRatio || 1;
    const cols = Math.max(8, Math.floor(canvasWrap.clientWidth / cellSize));
    const rows = Math.max(8, Math.floor(canvasWrap.clientHeight / cellSize));
    const w = cols * cellSize;
    const h = rows * cellSize;

    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    state.life.resize(cols, rows);
    render();
    updateStats();
  }

  /* ------------------------------------------------------------------ */
  /* simulation control                                                 */
  /* ------------------------------------------------------------------ */

  function setRunning(running) {
    state.running = running;
    state.acc = 0;
    el.play.textContent = running ? 'Pause' : 'Play';
    updateStats();
  }

  function stepOnce() {
    state.life.step(state.wrap);
    render();
    updateStats();
  }

  function loop(now) {
    const dt = state.lastTime ? Math.min(0.25, (now - state.lastTime) / 1000) : 0;
    state.lastTime = now;

    if (state.running) {
      const interval = 1 / state.speed;
      state.acc += dt;
      let steps = 0;
      while (state.acc >= interval && steps < 8) {
        state.life.step(state.wrap);
        state.acc -= interval;
        steps++;
      }
      if (steps > 0) {
        render();
        updateStats();
      }
    }
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ */
  /* pointer interaction                                                */
  /* ------------------------------------------------------------------ */

  function cellFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left) / state.cellSize);
    const y = Math.floor((ev.clientY - rect.top) / state.cellSize);
    return state.life.inBounds(x, y) ? { x: x, y: y } : null;
  }

  function applyAt(cell) {
    if (state.pattern !== 'draw' && state.paintValue === 1) {
      state.life.placeCentered(state.pattern, cell.x, cell.y);
    } else {
      state.life.set(cell.x, cell.y, state.paintValue);
    }
    state.lastCell = cell;
    render();
    updateStats();
  }

  /* Paint every cell along a line so fast mouse moves leave no gaps. */
  function applyLine(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 1; i <= steps; i++) {
      const cell = {
        x: from.x + Math.round((dx * i) / steps),
        y: from.y + Math.round((dy * i) / steps),
      };
      state.life.set(cell.x, cell.y, state.paintValue);
    }
    state.lastCell = to;
    render();
    updateStats();
  }

  canvas.addEventListener('mousedown', function (ev) {
    const cell = cellFromEvent(ev);
    if (!cell) return;
    ev.preventDefault();
    state.painting = true;
    state.paintValue = ev.button === 2 || ev.shiftKey ? 0 : 1;
    applyAt(cell);
  });

  canvas.addEventListener('mousemove', function (ev) {
    const cell = cellFromEvent(ev);
    state.hover = cell;
    if (state.painting && cell) {
      if (state.lastCell && (cell.x !== state.lastCell.x || cell.y !== state.lastCell.y)) {
        if (state.pattern === 'draw') {
          applyLine(state.lastCell, cell);
        } else {
          applyAt(cell);
        }
      }
    } else {
      render();
    }
  });

  function endPainting() {
    state.painting = false;
    state.lastCell = null;
  }

  canvas.addEventListener('mouseup', endPainting);
  canvas.addEventListener('mouseleave', function () {
    endPainting();
    state.hover = null;
    render();
  });
  canvas.addEventListener('contextmenu', function (ev) {
    ev.preventDefault();
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
        setRunning(!state.running);
        break;
      case 's':
        setRunning(false);
        stepOnce();
        break;
      case 'r':
        state.life.randomize(state.density);
        render();
        updateStats();
        break;
      case 'c':
        state.life.clear();
        render();
        updateStats();
        break;
      case 'g':
        state.showGrid = !state.showGrid;
        el.showGrid.checked = state.showGrid;
        render();
        break;
    }
  });

  /* ------------------------------------------------------------------ */
  /* controls                                                           */
  /* ------------------------------------------------------------------ */

  el.play.addEventListener('click', function () {
    setRunning(!state.running);
  });

  el.step.addEventListener('click', function () {
    setRunning(false);
    stepOnce();
  });

  el.random.addEventListener('click', function () {
    state.life.randomize(state.density);
    render();
    updateStats();
  });

  el.clear.addEventListener('click', function () {
    state.life.clear();
    render();
    updateStats();
  });

  el.speed.addEventListener('input', function () {
    state.speed = Number(el.speed.value);
    el.speedValue.textContent = el.speed.value;
  });

  el.cellSize.addEventListener('input', function () {
    state.cellSize = Number(el.cellSize.value);
    el.cellSizeValue.textContent = el.cellSize.value;
    layout();
  });

  el.density.addEventListener('input', function () {
    state.density = Number(el.density.value) / 100;
    el.densityValue.textContent = el.density.value + '%';
  });

  el.wrap.addEventListener('change', function () {
    state.wrap = el.wrap.checked;
  });

  el.showGrid.addEventListener('change', function () {
    state.showGrid = el.showGrid.checked;
    render();
  });

  el.pattern.addEventListener('change', function () {
    state.pattern = el.pattern.value;
    render();
  });

  /* ------------------------------------------------------------------ */
  /* init                                                               */
  /* ------------------------------------------------------------------ */

  function fillPatternOptions() {
    const draw = document.createElement('option');
    draw.value = 'draw';
    draw.textContent = 'Draw cells';
    el.pattern.appendChild(draw);

    for (const id of Object.keys(Life.PATTERNS)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = Life.PATTERNS[id].name;
      el.pattern.appendChild(option);
    }
  }

  fillPatternOptions();

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(layout).observe(canvasWrap);
  } else {
    window.addEventListener('resize', layout);
  }

  layout();
  state.life.randomize(state.density); // start with something alive
  render();
  setRunning(true); // auto-play on load
  requestAnimationFrame(loop);
})();
