/* app.js — canvas rendering and UI wiring for the fluid simulation.
 * Depends on fluid.js (the core) loading first.
 *
 * The solver runs on a coarse grid (the "resolution"); each frame its three
 * dye channels are tone-mapped into an ImageData buffer and blitted, scaled up
 * and smoothed, onto the display canvas. So the physics cost is set by the
 * grid size while the look is set by the screen.
 *
 * The core is deterministic for a given seed; this layer owns presentation:
 * sizing, the loop, the controls, and pointer interaction. It is the only
 * place `Math.random()` is allowed (ambient splats and fresh seeds).
 */
(function () {
  'use strict';

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const canvasWrap = document.getElementById('canvas-wrap');

  const el = {
    pause: document.getElementById('pause'),
    step: document.getElementById('step'),
    splat: document.getElementById('splat'),
    newSeed: document.getElementById('new-seed'),
    clear: document.getElementById('clear'),
    resolution: document.getElementById('resolution'),
    speed: document.getElementById('speed'),
    speedValue: document.getElementById('speed-value'),
    ambient: document.getElementById('ambient'),
    force: document.getElementById('force'),
    forceValue: document.getElementById('force-value'),
    vorticity: document.getElementById('vorticity'),
    vorticityValue: document.getElementById('vorticity-value'),
    buoyancy: document.getElementById('buoyancy'),
    buoyancyValue: document.getElementById('buoyancy-value'),
    viscosity: document.getElementById('viscosity'),
    viscosityValue: document.getElementById('viscosity-value'),
    fade: document.getElementById('fade'),
    fadeValue: document.getElementById('fade-value'),
    radius: document.getElementById('radius'),
    radiusValue: document.getElementById('radius-value'),
    statGrid: document.getElementById('stat-grid'),
    statSpeed: document.getElementById('stat-speed'),
    statDye: document.getElementById('stat-dye'),
    statFps: document.getElementById('stat-fps'),
    statStatus: document.getElementById('stat-status'),
  };

  /* One cool-violet ink family plus white — kept close in hue so the smoke
     reads as a single material rather than confetti. */
  const DYE_COLORS = ['#7aa2ff', '#8f8cff', '#a67aff', '#5ec8ff', '#ffffff'];

  const state = {
    fluid: null,
    off: document.createElement('canvas'),
    offCtx: null,
    image: null,
    paused: false,
    ambient: true,
    seed: 20261006,
    w: 0,
    h: 0,
    dpr: 1,
    pointer: { x: 0, y: 0, prevX: 0, prevY: 0, down: false, active: false },
    ambientClock: 0,
    fps: 60,
    frames: 0,
    fpsClock: 0,
  };

  /* ------------------------------------------------------------------ */
  /* controls                                                           */
  /* ------------------------------------------------------------------ */

  function number(id, fallback) {
    const n = parseFloat(el[id].value);
    return Number.isFinite(n) ? n : fallback;
  }

  function readControls() {
    return {
      resolution: parseInt(el.resolution.value, 10) || 128,
      force: number('force', 1),
      vorticity: number('vorticity', 2.5),
      buoyancy: number('buoyancy', 1.2),
      viscosity: number('viscosity', 0.00002),
      dissipation: number('fade', 0.995),
      radius: number('radius', 8),
    };
  }

  function updateBadges() {
    el.forceValue.textContent = parseFloat(el.force.value).toFixed(1);
    el.vorticityValue.textContent = parseFloat(el.vorticity.value).toFixed(1);
    el.buoyancyValue.textContent = parseFloat(el.buoyancy.value).toFixed(1);
    el.viscosityValue.textContent = parseFloat(el.viscosity.value).toFixed(5);
    el.fadeValue.textContent = parseFloat(el.fade.value).toFixed(3);
    el.speedValue.textContent = el.speed.value;
    el.radiusValue.textContent = el.radius.value;
  }

  /* Push the live solver parameters (everything except the grid size). */
  function applyLive() {
    const p = readControls();
    const f = state.fluid;
    if (!f) return;
    f.o.vorticity = p.vorticity;
    f.o.buoyancy = p.buoyancy;
    f.o.viscosity = p.viscosity;
    f.o.dissipation = p.dissipation;
  }

  /* ------------------------------------------------------------------ */
  /* construction / sizing                                              */
  /* ------------------------------------------------------------------ */

  function build() {
    const p = readControls();
    const aspect = state.h > 0 ? state.h / state.w : 0.6;
    const simW = p.resolution;
    const simH = Math.max(24, Math.min(400, Math.round(simW * aspect)));

    state.fluid = new FluidLib.Fluid({
      width: simW,
      height: simH,
      seed: state.seed,
      viscosity: p.viscosity,
      vorticity: p.vorticity,
      buoyancy: p.buoyancy,
      dissipation: p.dissipation,
    });
    state.fluid.randomSplats(state.seed, 12);

    state.off.width = state.fluid.w;
    state.off.height = state.fluid.h;
    state.offCtx = state.off.getContext('2d');
    state.image = state.offCtx.createImageData(state.fluid.w, state.fluid.h);

    updateStats();
  }

  function resize() {
    const rect = canvasWrap.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = Math.max(1, Math.floor(rect.width));
    state.h = Math.max(1, Math.floor(rect.height));
    canvas.width = state.w * state.dpr;
    canvas.height = state.h * state.dpr;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    build();
    render();
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  function render() {
    const f = state.fluid;
    if (!f) return;
    const px = state.image.data;
    let p = 0;

    for (let j = 1; j <= f.h; j++) {
      for (let i = 1; i <= f.w; i++) {
        const idx = f.IX(i, j);
        const r = f.r[idx];
        const g = f.g[idx];
        const b = f.b[idx];
        const m = r > g ? (r > b ? r : b) : (g > b ? g : b);
        if (m < 0.006) {
          px[p + 3] = 0;
        } else {
          const inv = 1 / m;
          px[p] = Math.min(255, r * inv * 255);
          px[p + 1] = Math.min(255, g * inv * 255);
          px[p + 2] = Math.min(255, b * inv * 255);
          px[p + 3] = Math.min(255, m * 245);
        }
        p += 4;
      }
    }

    state.offCtx.putImageData(state.image, 0, 0);

    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, state.w, state.h);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.96;
    ctx.drawImage(state.off, 0, 0, f.w, f.h, 0, 0, state.w, state.h);
    ctx.globalAlpha = 1;
  }

  function updateStats() {
    const f = state.fluid;
    if (!f) return;
    const s = f.stats();
    el.statGrid.textContent = f.w + '×' + f.h;
    el.statSpeed.textContent = s.meanSpeed.toFixed(2);
    el.statDye.textContent = Math.round(f.dyeSum());
    el.statFps.textContent = Math.round(state.fps);
    el.statStatus.textContent = state.paused ? 'Paused' : 'Running';
  }

  /* ------------------------------------------------------------------ */
  /* splats                                                             */
  /* ------------------------------------------------------------------ */

  function randomColor() {
    return DYE_COLORS[(Math.random() * DYE_COLORS.length) | 0];
  }

  function ambientSplat() {
    const f = state.fluid;
    const x = 2 + Math.random() * (f.w - 4);
    const y = 2 + Math.random() * (f.h - 4);
    const ang = Math.random() * Math.PI * 2;
    const mag = 0.3 + Math.random() * 1.2;
    f.splat(x, y, Math.cos(ang) * mag, Math.sin(ang) * mag, randomColor(), 4 + Math.random() * 9);
  }

  function pointerToGrid(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const f = state.fluid;
    return {
      x: ((clientX - rect.left) / rect.width) * f.w + 1,
      y: ((clientY - rect.top) / rect.height) * f.h + 1,
    };
  }

  function splatAt(cx, cy, dx, dy) {
    const f = state.fluid;
    const p = readControls();
    const k = 0.3 * p.force;
    f.splat(cx, cy, dx * k, dy * k, randomColor(), p.radius);
  }

  /* ------------------------------------------------------------------ */
  /* loop                                                               */
  /* ------------------------------------------------------------------ */

  function frame(now) {
    const f = state.fluid;

    if (!state.lastTime) state.lastTime = now;
    let dt = (now - state.lastTime) / 1000;
    state.lastTime = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) dt = 1 / 60;

    state.frames++;
    state.fpsClock += dt;
    if (state.fpsClock >= 0.5) {
      state.fps = state.frames / state.fpsClock;
      state.frames = 0;
      state.fpsClock = 0;
    }

    if (!state.paused && f) {
      if (state.ambient) {
        state.ambientClock += dt;
        if (state.ambientClock > 0.45) {
          state.ambientClock = 0;
          ambientSplat();
        }
      }
      const steps = parseInt(el.speed.value, 10) || 1;
      for (let s = 0; s < steps; s++) f.step(dt);
    }

    render();
    updateStats();
    window.requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ */
  /* events                                                             */
  /* ------------------------------------------------------------------ */

  el.pause.addEventListener('click', function () {
    state.paused = !state.paused;
    el.pause.textContent = state.paused ? 'Play' : 'Pause';
  });

  el.step.addEventListener('click', function () {
    if (state.fluid) { state.fluid.step(1 / 60); render(); updateStats(); }
  });

  el.splat.addEventListener('click', function () {
    if (state.fluid) { ambientSplat(); render(); }
  });

  el.newSeed.addEventListener('click', function () {
    state.seed = (Math.random() * 0xffffffff) >>> 0;
    build();
    render();
  });

  el.clear.addEventListener('click', function () {
    if (state.fluid) { state.fluid.clear(); render(); updateStats(); }
  });

  el.resolution.addEventListener('change', function () { build(); render(); });
  el.speed.addEventListener('input', updateBadges);
  el.ambient.addEventListener('change', function () { state.ambient = el.ambient.checked; });

  ['force', 'vorticity', 'buoyancy', 'viscosity', 'fade', 'radius'].forEach(function (id) {
    el[id].addEventListener('input', function () {
      updateBadges();
      applyLive();
    });
  });

  function onMove(clientX, clientY) {
    const g = pointerToGrid(clientX, clientY);
    const p = state.pointer;
    if (!p.active) { p.x = g.x; p.y = g.y; p.active = true; }
    const dx = g.x - p.x;
    const dy = g.y - p.y;
    p.x = g.x;
    p.y = g.y;
    if (state.paused) return;
    const scale = p.down ? 2.2 : 1;
    splatAt(g.x, g.y, dx * scale, dy * scale);
  }

  canvas.addEventListener('pointerdown', function (e) {
    state.pointer.down = true;
    canvas.setPointerCapture(e.pointerId);
    const g = pointerToGrid(e.clientX, e.clientY);
    state.pointer.x = g.x;
    state.pointer.y = g.y;
    state.pointer.active = true;
    splatAt(g.x, g.y, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  });

  canvas.addEventListener('pointermove', function (e) {
    onMove(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', function () { state.pointer.down = false; });
  canvas.addEventListener('pointerleave', function () {
    state.pointer.down = false;
    state.pointer.active = false;
  });

  window.addEventListener('resize', resize);

  window.addEventListener('keydown', function (e) {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      el.pause.click();
    } else if (e.key === 's' || e.key === 'S') {
      el.step.click();
    } else if (e.key === 'c' || e.key === 'C') {
      el.clear.click();
    } else if (e.key === 'n' || e.key === 'N') {
      el.newSeed.click();
    }
  });

  state.ambient = el.ambient.checked;
  updateBadges();
  resize();
  window.requestAnimationFrame(frame);
})();
