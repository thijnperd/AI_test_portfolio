/* app.js — canvas rendering and UI wiring for the boids flocking
 * simulation. Depends on boids.js (the core) loading first.
 *
 * The core is deterministic for a given seed; this layer owns presentation:
 * sizing the canvas, the animation loop, the controls, and drawing each boid
 * as a triangle pointing along its heading.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const canvasWrap = document.getElementById('canvas-wrap');

  const el = {
    pause: document.getElementById('pause'),
    newSeed: document.getElementById('new-seed'),
    scatter: document.getElementById('scatter'),
    count: document.getElementById('count'),
    countValue: document.getElementById('count-value'),
    perception: document.getElementById('perception'),
    perceptionValue: document.getElementById('perception-value'),
    separation: document.getElementById('separation'),
    separationValue: document.getElementById('separation-value'),
    alignment: document.getElementById('alignment'),
    alignmentValue: document.getElementById('alignment-value'),
    cohesion: document.getElementById('cohesion'),
    cohesionValue: document.getElementById('cohesion-value'),
    maxSpeed: document.getElementById('max-speed'),
    maxSpeedValue: document.getElementById('max-speed-value'),
    edge: document.getElementById('edge'),
    trails: document.getElementById('trails'),
    statCount: document.getElementById('stat-count'),
    statAlign: document.getElementById('stat-align'),
    statStatus: document.getElementById('stat-status'),
  };

  const state = {
    flock: null,
    paused: false,
    trails: true,
    seed: 20261006,
    w: 0,
    h: 0,
    dpr: 1,
    lastTime: 0,
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
      count: Math.round(number('count', 160)),
      perception: number('perception', 46),
      separation: number('separation', 1.5),
      alignment: number('alignment', 1),
      cohesion: number('cohesion', 0.85),
      maxSpeed: number('maxSpeed', 120),
      edge: el.edge.value,
    };
  }

  function updateBadges() {
    el.countValue.textContent = el.count.value;
    el.perceptionValue.textContent = el.perception.value;
    el.separationValue.textContent = parseFloat(el.separation.value).toFixed(1);
    el.alignmentValue.textContent = parseFloat(el.alignment.value).toFixed(1);
    el.cohesionValue.textContent = parseFloat(el.cohesion.value).toFixed(1);
    el.maxSpeedValue.textContent = el.maxSpeed.value;
  }

  function buildFlock() {
    const p = readControls();
    state.flock = new BoidsLib.Flock({
      count: p.count,
      width: state.w,
      height: state.h,
      perception: p.perception,
      separation: p.separation,
      alignment: p.alignment,
      cohesion: p.cohesion,
      maxSpeed: p.maxSpeed,
      edge: p.edge,
      seed: state.seed,
    });
    clearCanvas();
  }

  /* Push slider values onto the live flock without reseeding it. */
  function applyLive() {
    const p = readControls();
    const o = state.flock.opts;
    o.perception = p.perception;
    o.separation = p.separation;
    o.alignment = p.alignment;
    o.cohesion = p.cohesion;
    o.maxSpeed = p.maxSpeed;
    o.edge = p.edge;
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  function clearCanvas() {
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, state.w, state.h);
  }

  function drawBoid(b) {
    const angle = Math.atan2(b.vy, b.vx);
    const t = Math.min(1, Math.hypot(b.vx, b.vy) / (state.flock.opts.maxSpeed || 1));
    const hue = 205 + t * 90; // slower = blue, faster = violet
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);
    ctx.fillStyle = 'hsl(' + hue.toFixed(0) + ', 90%, ' + (52 + t * 20).toFixed(0) + '%)';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, 3.6);
    ctx.lineTo(-4, -3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function render() {
    if (state.trails) {
      ctx.fillStyle = 'rgba(11, 12, 16, 0.22)';
      ctx.fillRect(0, 0, state.w, state.h);
    } else {
      clearCanvas();
    }
    const boids = state.flock.boids;
    for (let i = 0; i < boids.length; i++) drawBoid(boids[i]);
  }

  function updateStats() {
    el.statCount.textContent = state.flock.boids.length;
    el.statAlign.textContent = Math.round(state.flock.alignmentScore() * 100) + '%';
    el.statStatus.textContent = state.paused ? 'Paused' : 'Running';
  }

  /* ------------------------------------------------------------------ */
  /* sizing                                                             */
  /* ------------------------------------------------------------------ */

  function resize() {
    const rect = canvasWrap.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = Math.max(1, Math.floor(rect.width));
    state.h = Math.max(1, Math.floor(rect.height));
    canvas.width = state.w * state.dpr;
    canvas.height = state.h * state.dpr;
    canvas.style.width = state.w + 'px';
    canvas.style.height = state.h + 'px';
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (state.flock) {
      state.flock.opts.width = state.w;
      state.flock.opts.height = state.h;
      clearCanvas();
    } else {
      buildFlock();
    }
  }

  /* ------------------------------------------------------------------ */
  /* loop                                                               */
  /* ------------------------------------------------------------------ */

  function frame(now) {
    if (!state.lastTime) state.lastTime = now;
    let dt = (now - state.lastTime) / 1000;
    state.lastTime = now;
    if (dt > 0.05) dt = 0.05; // clamp the jump after a hidden tab
    if (!state.paused) state.flock.step(dt);
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

  el.newSeed.addEventListener('click', function () {
    state.seed = (Math.random() * 0xffffffff) >>> 0;
    buildFlock();
  });

  el.scatter.addEventListener('click', function () {
    state.flock.rng = BoidsLib.makeRng(state.seed);
    state.flock.reset();
    state.flock.opts.width = state.w;
    state.flock.opts.height = state.h;
    clearCanvas();
  });

  el.count.addEventListener('input', function () {
    updateBadges();
    buildFlock();
  });

  ['perception', 'separation', 'alignment', 'cohesion', 'maxSpeed'].forEach(function (id) {
    el[id].addEventListener('input', function () {
      updateBadges();
      applyLive();
    });
  });

  el.edge.addEventListener('change', applyLive);

  el.trails.addEventListener('change', function () {
    state.trails = el.trails.checked;
    clearCanvas();
  });

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', function (e) {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      el.pause.click();
    } else if (e.key === 'n' || e.key === 'N') {
      el.newSeed.click();
    }
  });

  updateBadges();
  resize();
  window.requestAnimationFrame(frame);
})();
