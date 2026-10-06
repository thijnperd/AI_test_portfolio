/* app.js — canvas rendering and UI wiring for the Wave Function Collapse
 * tilemap generator. Depends on wfc.js (the core) loading first.
 *
 * The core is deterministic for a given seed; this layer owns presentation:
 * sizing the canvas, the animation loop, the collapse-speed control, and
 * drawing the grid — collapsed tiles as their glyph, undecided cells as a tint
 * that fades as their options are pruned.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const canvasWrap = document.getElementById('canvas-wrap');

  const el = {
    pause: document.getElementById('pause'),
    step: document.getElementById('step'),
    solve: document.getElementById('solve'),
    newSeed: document.getElementById('new-seed'),
    clear: document.getElementById('clear'),
    width: document.getElementById('width'),
    widthValue: document.getElementById('width-value'),
    height: document.getElementById('height'),
    heightValue: document.getElementById('height-value'),
    tileset: document.getElementById('tileset'),
    speed: document.getElementById('speed'),
    speedValue: document.getElementById('speed-value'),
    boundary: document.getElementById('boundary'),
    animate: document.getElementById('animate'),
    uncertain: document.getElementById('uncertain'),
    statGrid: document.getElementById('stat-grid'),
    statCollapsed: document.getElementById('stat-collapsed'),
    statContradictions: document.getElementById('stat-contradictions'),
    statSeed: document.getElementById('stat-seed'),
    statStatus: document.getElementById('stat-status'),
  };

  const state = {
    solver: null,
    seed: 20261006,
    paused: false,
    animate: true,
    boundary: true,
    showUncertain: true,
    w: 0,
    h: 0,
    dpr: 1,
  };

  /* ------------------------------------------------------------------ */
  /* color helpers                                                      */
  /* ------------------------------------------------------------------ */

  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 'rgba(0,0,0,' + a + ')';
    const n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function trackColor(set, id) {
    for (let i = 0; i < set.tracks.length; i++) {
      if (set.tracks[i].id === id) return set.tracks[i].color;
    }
    return '#8b91a3';
  }

  /* ------------------------------------------------------------------ */
  /* controls                                                           */
  /* ------------------------------------------------------------------ */

  function readControls() {
    return {
      width: parseInt(el.width.value, 10) || 24,
      height: parseInt(el.height.value, 10) || 24,
      tileSet: el.tileset.value,
      speed: parseInt(el.speed.value, 10) || 2,
      boundary: el.boundary.checked,
      animate: el.animate.checked,
    };
  }

  function updateBadges() {
    el.widthValue.textContent = el.width.value;
    el.heightValue.textContent = el.height.value;
    el.speedValue.textContent = el.speed.value;
  }

  function rebuild(newSeed) {
    const p = readControls();
    if (newSeed) state.seed = (Math.random() * 0xffffffff) >>> 0;
    state.boundary = p.boundary;
    state.animate = p.animate;
    state.solver = new WFCLib.Solver({
      width: p.width,
      height: p.height,
      tileSet: p.tileSet,
      boundary: p.boundary,
      seed: state.seed,
    });
    render();
    updateStats();
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  function drawTile(px, py, cs, tile, set) {
    const cx = px + cs / 2;
    const cy = py + cs / 2;
    const color = trackColor(set, tile.track);
    const sockets = tile.sockets;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, cs * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (sockets[0]) { ctx.moveTo(cx, cy); ctx.lineTo(cx, py); }
    if (sockets[1]) { ctx.moveTo(cx, cy); ctx.lineTo(px + cs, cy); }
    if (sockets[2]) { ctx.moveTo(cx, cy); ctx.lineTo(cx, py + cs); }
    if (sockets[3]) { ctx.moveTo(cx, cy); ctx.lineTo(px, cy); }
    ctx.stroke();

    const conns = (sockets[0] ? 1 : 0) + (sockets[1] ? 1 : 0) + (sockets[2] ? 1 : 0) + (sockets[3] ? 1 : 0);
    if (conns > 1) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.5, cs * 0.17), 0, TAU);
      ctx.fill();
    }
  }

  function render() {
    const s = state.solver;
    ctx.clearRect(0, 0, state.w, state.h);
    if (!s) return;

    const set = s.set;
    const gw = s.w;
    const gh = s.h;
    const pad = 18;
    const cs = Math.max(1, Math.floor(Math.min((state.w - pad * 2) / gw, (state.h - pad * 2) / gh)));
    const ox = Math.floor((state.w - cs * gw) / 2);
    const oy = Math.floor((state.h - cs * gh) / 2);

    ctx.fillStyle = set.ground;
    ctx.fillRect(ox, oy, cs * gw, cs * gh);

    if (state.showUncertain) {
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const c = y * gw + x;
          if (s.chosen[c] >= 0) continue;
          const frac = s.counts[c] / s.numTiles;
          ctx.fillStyle = hexA(set.uncertainty, 0.12 + 0.5 * frac);
          ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
        }
      }
    }

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const idx = s.chosen[y * gw + x];
        if (idx < 0) continue;
        const tile = s.tiles[idx];
        if (tile.kind === 'empty') continue; // ground already filled
        drawTile(ox + x * cs, oy + y * cs, cs, tile, set);
      }
    }

    ctx.strokeStyle = 'rgba(236,234,230,0.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, cs * gw - 1, cs * gh - 1);
  }

  function updateStats() {
    const s = state.solver;
    if (!s) return;
    const total = s.w * s.h;
    const done = s.collapsedCount();
    el.statGrid.textContent = s.w + '×' + s.h + ' · ' + s.set.label;
    el.statCollapsed.textContent = done + ' / ' + total + ' (' + Math.round((done / total) * 100) + '%)';
    el.statContradictions.textContent = s.hasContradiction() ? '1' : '0';
    el.statSeed.textContent = state.seed;
    el.statStatus.textContent = s.hasContradiction()
      ? 'Contradiction'
      : (s.isDone() ? 'Solved' : (state.paused ? 'Paused' : 'Collapsing'));
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
    render();
  }

  /* ------------------------------------------------------------------ */
  /* loop                                                               */
  /* ------------------------------------------------------------------ */

  function frame() {
    const s = state.solver;
    if (!state.paused && state.animate && s && !s.isDone() && !s.hasContradiction()) {
      const speed = parseInt(el.speed.value, 10) || 1;
      for (let i = 0; i < speed; i++) {
        if (!s.step()) break;
      }
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
    el.pause.textContent = state.paused ? 'Run' : 'Pause';
    updateStats();
  });

  el.step.addEventListener('click', function () {
    state.solver.step();
    render();
    updateStats();
  });

  el.solve.addEventListener('click', function () {
    state.solver.solveAll();
    render();
    updateStats();
  });

  el.newSeed.addEventListener('click', function () {
    rebuild(true);
  });

  el.clear.addEventListener('click', function () {
    rebuild(false);
  });

  el.width.addEventListener('input', function () { updateBadges(); rebuild(false); });
  el.height.addEventListener('input', function () { updateBadges(); rebuild(false); });
  el.tileset.addEventListener('change', function () { rebuild(false); });
  el.boundary.addEventListener('change', function () { rebuild(false); });

  el.speed.addEventListener('input', updateBadges);

  el.animate.addEventListener('change', function () {
    state.animate = el.animate.checked;
  });

  el.uncertain.addEventListener('change', function () {
    state.showUncertain = el.uncertain.checked;
    render();
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
    } else if (e.key === 's' || e.key === 'S') {
      el.step.click();
    } else if (e.key === 'f' || e.key === 'F') {
      el.solve.click();
    }
  });

  updateBadges();
  state.boundary = el.boundary.checked;
  state.animate = el.animate.checked;
  state.showUncertain = el.uncertain.checked;
  resize();
  rebuild(false);
  window.requestAnimationFrame(frame);
})();
