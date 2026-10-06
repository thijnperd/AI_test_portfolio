/* app.js — canvas rendering and UI wiring for the falling-sand sandbox.
 * Depends on sand.js (the core) loading first.
 *
 * The canvas backing store is one pixel per grid cell and is scaled up with
 * CSS (`image-rendering: pixelated`), so rendering is a single putImageData
 * per frame regardless of the on-screen size.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const canvasWrap = document.getElementById('canvas-wrap');

  const el = {
    pause: document.getElementById('pause'),
    step: document.getElementById('step'),
    clear: document.getElementById('clear'),
    randomize: document.getElementById('randomize'),
    material: document.getElementById('material'),
    brush: document.getElementById('brush'),
    brushValue: document.getElementById('brush-value'),
    speed: document.getElementById('speed'),
    speedValue: document.getElementById('speed-value'),
    rain: document.getElementById('rain'),
    statSand: document.getElementById('stat-sand'),
    statWater: document.getElementById('stat-water'),
    statOil: document.getElementById('stat-oil'),
    statPressure: document.getElementById('stat-pressure'),
    statStatus: document.getElementById('stat-status'),
  };

  const COLORS = {};
  COLORS[SandLib.EMPTY] = [11, 12, 16];
  COLORS[SandLib.SAND] = [224, 178, 92];
  COLORS[SandLib.WATER] = [79, 140, 255];
  COLORS[SandLib.OIL] = [126, 84, 44];
  COLORS[SandLib.WALL] = [74, 80, 96];

  const CELL = 4; // css pixels per grid cell

  const state = {
    sand: null,
    imageData: null,
    pixels: null,
    paused: false,
    rain: false,
    seed: 1,
    painting: false,
    brush: 3,
  };

  /* ------------------------------------------------------------------ */
  /* setup / sizing                                                     */
  /* ------------------------------------------------------------------ */

  function resize() {
    const rect = canvasWrap.getBoundingClientRect();
    const w = Math.max(40, Math.floor(rect.width / CELL));
    const h = Math.max(30, Math.floor(rect.height / CELL));
    if (state.sand && state.sand.width === w && state.sand.height === h) return;

    const prev = state.sand;
    state.seed = (Math.random() * 0xffffffff) >>> 0;
    state.sand = new SandLib.Sand({ width: w, height: h, seed: state.seed });

    if (prev) {
      // keep the overlapping top-left region of the previous scene
      for (let y = 0; y < Math.min(prev.height, h); y++) {
        for (let x = 0; x < Math.min(prev.width, w); x++) {
          state.sand.set(x, y, prev.get(x, y));
        }
      }
    } else {
      state.sand.randomize({ seed: state.seed, sandChance: 0.14, waterChance: 0.07, oilChance: 0.03, wallChance: 0.02 });
    }

    canvas.width = w;
    canvas.height = h;
    state.imageData = ctx.createImageData(w, h);
    state.pixels = state.imageData.data;
    render();
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  function render() {
    const sand = state.sand;
    const cells = sand.cells;
    const px = state.pixels;
    for (let i = 0, p = 0; i < cells.length; i++, p += 4) {
      const c = COLORS[cells[i]];
      px[p] = c[0];
      px[p + 1] = c[1];
      px[p + 2] = c[2];
      px[p + 3] = 255;
    }
    ctx.putImageData(state.imageData, 0, 0);
  }

  function updateStats() {
    const c = state.sand.counts();
    el.statSand.textContent = c.sand;
    el.statWater.textContent = c.water;
    el.statOil.textContent = c.oil;
    el.statPressure.textContent = state.sand.maxPressure();
    el.statStatus.textContent = state.paused ? 'Paused' : (state.rain ? 'Raining' : 'Running');
  }

  /* ------------------------------------------------------------------ */
  /* simulation loop                                                    */
  /* ------------------------------------------------------------------ */

  function tick() {
    if (!state.paused) {
      const steps = parseInt(el.speed.value, 10) || 1;
      state.sand.stepMany(steps);
      if (state.rain) {
        for (let n = 0; n < 2; n++) {
          state.sand.emit(Math.floor(Math.random() * state.sand.width), SandLib.SAND);
        }
      }
    }
    render();
    updateStats();
    window.requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------ */
  /* painting                                                           */
  /* ------------------------------------------------------------------ */

  function materialValue() {
    const v = el.material.value;
    if (v === 'sand') return SandLib.SAND;
    if (v === 'water') return SandLib.WATER;
    if (v === 'oil') return SandLib.OIL;
    if (v === 'wall') return SandLib.WALL;
    return SandLib.EMPTY;
  }

  function paintAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * state.sand.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * state.sand.height);
    state.sand.paint(x, y, state.brush, materialValue());
  }

  canvas.addEventListener('pointerdown', function (e) {
    state.painting = true;
    canvas.setPointerCapture(e.pointerId);
    paintAt(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (state.painting) paintAt(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', function () {
    state.painting = false;
  });

  canvas.addEventListener('pointerleave', function () {
    state.painting = false;
  });

  /* ------------------------------------------------------------------ */
  /* controls                                                           */
  /* ------------------------------------------------------------------ */

  el.pause.addEventListener('click', function () {
    state.paused = !state.paused;
    el.pause.textContent = state.paused ? 'Play' : 'Pause';
  });

  el.step.addEventListener('click', function () {
    state.sand.step();
    render();
    updateStats();
  });

  el.clear.addEventListener('click', function () {
    state.sand.clear();
    render();
    updateStats();
  });

  el.randomize.addEventListener('click', function () {
    state.seed = (Math.random() * 0xffffffff) >>> 0;
    state.sand.randomize({ seed: state.seed, sandChance: 0.14, waterChance: 0.07, oilChance: 0.03, wallChance: 0.02 });
    render();
    updateStats();
  });

  el.brush.addEventListener('input', function () {
    state.brush = parseInt(el.brush.value, 10);
    el.brushValue.textContent = state.brush;
  });

  el.speed.addEventListener('input', function () {
    el.speedValue.textContent = el.speed.value;
  });

  el.rain.addEventListener('change', function () {
    state.rain = el.rain.checked;
  });

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', function (e) {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      el.pause.click();
    } else if (e.key === 'c' || e.key === 'C') {
      el.clear.click();
    }
  });

  el.brushValue.textContent = el.brush;
  el.speedValue.textContent = el.speed.value;
  resize();
  window.requestAnimationFrame(tick);
})();
