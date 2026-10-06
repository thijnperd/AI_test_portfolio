/**
 * AlgoArt · engine
 *
 * The app shell behind the gallery: sketch registry, canvas sizing, the render
 * loop, the auto-built parameter UI, the gallery list, and PNG export.
 *
 * Like `core/utils.js`, this is a plain immediately-invoked function
 * expression rather than an ES module. That is the constraint that makes the
 * whole app runnable by double-clicking `index.html` from a `file://` URL.
 *
 * Runtime shape:
 * - `Art.register(def)` adds a sketch.
 * - `Art.select(id)` switches the active sketch.
 * - `Art.restart()`, `Art.reseed()`, `Art.exportPng()`, `Art.randomizeParams()`,
 *   `Art.resetParams()` are the public lifecycle helpers the UI binds to.
 * - When everything is ready, `Art.ready` is set to `true`.
 *
 * @module engine
 */
(function (global) {
  'use strict';

  /**
   * Shared `Art` namespace.
   *
   * Initialized from any prior value so the file is idempotent if it is ever
   * loaded more than once; in practice it is loaded once, after `utils.js`.
   */
  const Art = global.Art || (global.Art = {});

  /**
   * Registered sketches, in loading order.
   *
   * This is the single source of truth for the gallery, the param panel, and
   * the sketch-switching helpers.
   *
   * @type {object[]}
   */
  const sketches = [];

  /**
   * The currently active sketch definition.
   *
   * @type {object|null}
   */
  let current = null;

  /**
   * The 2D rendering context for the stage canvas.
   *
   * @type {CanvasRenderingContext2D|null}
   */
  let ctx = null;

  /**
   * The stage canvas element.
   *
   * @type {HTMLCanvasElement|null}
   */
  let canvas = null;

  /**
   * Optional display/export ground behind transparent sketch pixels.
   *
   * @type {'transparent'|'dark'|'light'}
   */
  let backgroundMode = 'transparent';

  /**
   * The current `requestAnimationFrame` handle.
   *
   * @type {number}
   */
  let rafId = 0;

  /**
   * Timestamp of the previous frame, used to compute `dt`.
   *
   * @type {number}
   */
  let lastTime = 0;

  /**
   * Seconds since the current sketch was (re)started.
   *
   * @type {number}
   */
  let elapsed = 0;

  /**
   * Whether the render loop is currently paused.
   *
   * @type {boolean}
   */
  let paused = false;

  /**
   * Debounce timer handle for pending param/UI restarts.
   *
   * @type {number}
   */
  let restartTimer = 0;

  /**
   * Sketch registry.
   *
   * Accepts a definition with at least `{ id, draw }`. If a sketch with the
   * same `id` is already registered, the duplicate is ignored with a warning.
   * Missing fields are filled with safe defaults: `title` falls back to `id`,
   * `animate` defaults to `true`, `params` defaults to `{}`, and `state`
   * defaults to `null` (persistent per-sketch state that survives restarts).
   *
   * @param {object} def
   * @returns {void}
   */
  function register(def) {
    if (!def || !def.id || typeof def.draw !== 'function') {
      console.error('[Art] register() needs { id, draw }', def);
      return;
    }
    if (sketches.some(s => s.id === def.id)) {
      console.warn('[Art] duplicate sketch id: ' + def.id);
      return;
    }
    def.title = def.title || def.id;
    def.animate = def.animate !== false; // default: animated loop
    def.params = def.params || {};
    def.state = def.state || null;       // optional per-sketch persistent state
    sketches.push(def);
    if (galleryEl) renderGallery();
  }

  /**
   * Element lookup helper.
   *
   * Shortcut for `document.getElementById`, used throughout the engine for
   * toolbar, gallery, param panel, seed input, and HUD elements.
   *
   * @param {string} id
   * @returns {HTMLElement|null}
   */
  const $ = id => document.getElementById(id);

  /**
   * Cached gallery list element.
   *
   * Set during `boot()` and reused by `renderGallery()`.
   *
   * @type {HTMLUListElement|null}
   */
  let galleryEl = null;

  /**
   * Compute param defaults from a sketch definition.
   *
   * Same rules as the test harness `defaultsFor`: explicit `spec.value` wins;
   * otherwise `select` defaults to its first option, `checkbox` to `false`,
   * `color` to opaque white, and `range` to its `min` (or 0 when `min` is
   * absent).
   *
   * @param {object} def
   * @returns {object}
   */
  function defaultsFor(def) {
    const out = {};
    for (const k in def.params) {
      const spec = def.params[k];
      out[k] = spec.value !== undefined ? spec.value
        : spec.type === 'select' ? (spec.options && spec.options[0])
        : spec.type === 'checkbox' ? false
        : spec.type === 'color' ? '#ffffff'
        : (spec.min !== undefined ? spec.min : 0);
    }
    return out;
  }

  /**
   * Current canvas size in CSS pixels.
   *
   * The canvas backing store is larger by `devicePixelRatio`; this helper
   * returns the logical size the sketches think in.
   *
   * @returns {number}
   */
  function size() {
    return canvas ? canvas.width / (global.devicePixelRatio || 1) : 0;
  }

  /**
   * Resize the stage canvas to fit the stage element.
   *
   * The canvas is sized to the smaller stage dimension, capped below by 160px
   * and above by a device-pixel-ratio of 2. When the canvas resizes, the
   * current sketch is restarted so it can recompute anything that depends on
   * canvas size.
   *
   * @returns {void}
   */
  function resize() {
    if (!canvas) return;
    const stage = $('stage');
    const rect = stage.getBoundingClientRect();
    const pad = 8;
    const px = Math.max(160, Math.floor(Math.min(rect.width, rect.height) - pad));
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.style.width = px + 'px';
    canvas.style.height = px + 'px';
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(px * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (current) restart();
  }

  /**
   * Restart the current sketch.
   *
   * Reseeds the shared RNG and noise with the sketch's current seed, resets
   * the elapsed timer, clears `current.state` for a fresh scratch space,
   * clears the canvas, runs `setup()` once, paints the first frame, and
   * updates the HUD. Static sketches stop after the first frame; animated ones
   * keep going via the loop.
   *
   * @returns {void}
   */
  function restart() {
    if (!current || !ctx) return;
    Art.RNG.seed(current.seed >>> 0);
    Art.Noise.seed(current.seed >>> 0);
    elapsed = 0;
    current.state = {}; // fresh scratch space for every restart
    const w = size();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const env = makeEnv();
    if (typeof current.setup === 'function') current.setup(env);
    renderFrame(0, 0); // always paint first frame (matters for static sketches)
    if (!current.animate) updateHud();
  }

  /**
   * Build the per-frame environment object.
   *
   * The environment exposes `ctx`, `canvas`, `w`, `h`, `seed`, `params`,
   * `t`, `dt`, `random`, `noise`, and `state`. The `state` property is a
   * getter/setter on the env object itself so `setup()` can assign
   * `e.state = {...}` and later frames still see it through `current.state`.
   *
   * @returns {object}
   */
  function makeEnv() {
    const env = {
      ctx, canvas,
      w: size(),
      h: size(),
      seed: current.seed,
      params: current.values,
      t: elapsed,
      random: Art.RNG,
      noise: Art.Noise
    };
    // state lives on the sketch, not the per-frame env, so setup() can
    // assign e.state = {...} and later frames still see it
    Object.defineProperty(env, 'state', {
      get() { return current.state; },
      set(v) { current.state = v; }
    });
    return env;
  }

  /**
   * Render one frame of the current sketch.
   *
   * Advances `elapsed`, rebuilds the environment with the updated `t` and `dt`,
   * calls `current.draw(env)`, and catches any exceptions so a single bad frame
   * does not kill the loop. The HUD is refreshed no more than twice a second.
   *
   * @param {number} dt - seconds since the previous frame.
   * @param {number} now - current performance/timestamp.
   * @returns {void}
   */
  function renderFrame(dt, now) {
    if (!current) return;
    elapsed += dt;
    const env = makeEnv();
    env.t = elapsed;
    env.dt = dt;
    try {
      current.draw(env);
    } catch (err) {
      console.error('[Art] draw error in "' + current.id + '":', err);
      cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }
    if (now - lastTime > 500) { updateHud(now); lastTime = now; }
  }

  /**
   * Animation-frame loop.
   *
   * Schedules the next frame unconditionally, computes a clamped `dt`, and
   * wanders into `renderFrame()` only when the sketch is active, not paused,
   * and animated. When the sketch is paused or static, the loop still ticks but
   * does not render.
   *
   * @param {number} now
   * @returns {void}
   */
  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - (tick._last || now)) / 1000);
    tick._last = now;
    if (paused || !current || !current.animate) return;
    renderFrame(dt, now);
  }

  /**
   * Start (or restart) the animation loop.
   *
   * Cancels any existing loop, resets loop timing state, and kicks off a fresh
   * `requestAnimationFrame` chain.
   *
   * @returns {void}
   */
  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    tick._last = 0;
    lastTime = 0;
    rafId = requestAnimationFrame(tick);
  }

  /**
   * Match sketches with a monochrome ink toggle to the selected ground.
   *
   * @returns {boolean} Whether the active sketch has a linked ink setting.
   */
  function syncInkToBackground() {
    if (!current || backgroundMode === 'transparent' || !current.params.dark) return false;
    current.values.dark = backgroundMode === 'dark';
    const paramsEl = $('params');
    const inkControl = paramsEl && paramsEl.querySelector('[data-param="dark"] input[type="checkbox"]');
    if (inkControl) inkControl.checked = current.values.dark;
    return true;
  }

  /**
   * Switch to a sketch by id.
   *
   * Looks up the definition, assigns it as `current`, seeds a default seed if
   * the sketch has none, merges saved values with the sketch defaults, resets
   * pause state, rebuilds the gallery and param UI, restarts the sketch, starts
   * the loop, and refreshes the HUD.
   *
   * @param {string} id
   * @returns {void}
   */
  function select(id) {
    const def = sketches.find(s => s.id === id);
    if (!def) return;
    current = def;
    if (!current.seed) current.seed = (Math.random() * 4294967295) >>> 0;
    current.values = Object.assign(defaultsFor(def), current.values || {});
    syncInkToBackground();
    Art.current = current;
    paused = false;
    $('btn-pause').textContent = '⏸ Pause';
    renderGallery();
    renderParams();
    restart();
    startLoop();
    updateHud(0, true);
  }

  /**
   * Rebuild the gallery list.
   *
   * Clears `galleryEl` and rebuilds one button per registered sketch. The active
   * sketch gets the `.active` class and an `aria-current` attribute. Clicking a
   * gallery button switches to that sketch.
   *
   * @returns {void}
   */
  function renderGallery() {
    if (!galleryEl) return;
    galleryEl.innerHTML = '';
    sketches.forEach((s, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sketch-btn' + (current === s ? ' active' : '');
      btn.innerHTML = '<span class="sketch-idx">' + String(i + 1).padStart(2, '0') +
        '</span><span class="sketch-name"></span>';
      btn.querySelector('.sketch-name').textContent = s.title;
      if (current === s) btn.setAttribute('aria-current', 'true');
      btn.addEventListener('click', () => select(s.id));
      li.appendChild(btn);
      galleryEl.appendChild(li);
    });
  }

  /**
   * Rebuild the parameter panel for the current sketch.
   *
   * For each param, creates a labeled control matching its type: `select`,
   * `checkbox`, `color`, `text`, or range (the default). Changes commit the new
   * value immediately and schedule a restart of the sketch; immediate restarts
   * happen for controls that should feel direct (select, checkbox, text), while
   * other controls are debounced.
   *
   * @returns {void}
   */
  function renderParams() {
    const box = $('params');
    if (!box || !current) return;
    box.innerHTML = '';
    const keys = Object.keys(current.params);
    if (!keys.length) {
      box.innerHTML = '<p class="muted">No parameters for this sketch.</p>';
      return;
    }
    keys.forEach(key => {
      const spec = current.params[key];
      const row = document.createElement('div');
      row.className = 'param param-' + (spec.type || 'range');
      row.dataset.param = key;

      const label = document.createElement('label');
      label.className = 'param-label';
      label.textContent = spec.label || key;
      row.appendChild(label);

      let input;
      /**
       * Commit a new param value and refresh the value hint.
       *
       * @param {*} value
       * @param {boolean} immediate
       * @returns {void}
       */
      const commit = (value, immediate) => {
        current.values[key] = value;
        const hint = row.querySelector('.param-value');
        if (hint) hint.textContent = formatValue(value, spec);
        scheduleRestart(immediate);
      };

      if (spec.type === 'select') {
        input = document.createElement('select');
        (spec.options || []).forEach(opt => {
          const o = document.createElement('option');
          if (typeof opt === 'object') { o.value = opt.value; o.textContent = opt.label; }
          else { o.value = opt; o.textContent = opt; }
          input.appendChild(o);
        });
        input.value = current.values[key];
        input.addEventListener('change', () => commit(input.value, true));
      } else if (spec.type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!current.values[key];
        input.addEventListener('change', () => commit(input.checked, true));
        label.insertBefore(input, label.firstChild);
      } else if (spec.type === 'color') {
        input = document.createElement('input');
        input.type = 'color';
        input.value = current.values[key];
        input.addEventListener('input', () => commit(input.value));
      } else if (spec.type === 'text') {
        input = document.createElement('input');
        input.type = 'text';
        input.value = current.values[key];
        input.addEventListener('change', () => commit(input.value, true));
      } else { // range (default)
        input = document.createElement('input');
        input.type = 'range';
        input.min = spec.min !== undefined ? spec.min : 0;
        input.max = spec.max !== undefined ? spec.max : 1;
        input.step = spec.step !== undefined ? spec.step : (spec.integer ? 1 : 'any');
        input.value = current.values[key];
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          commit(spec.integer ? Math.round(v) : v);
        });
      }
      input.className = 'param-input';

      if (spec.type !== 'checkbox') {
        const val = document.createElement('span');
        val.className = 'param-value';
        val.textContent = formatValue(current.values[key], spec);
        label.appendChild(val);
      }
      if (spec.type !== 'checkbox') row.appendChild(input); // checkbox stays inside its label
      box.appendChild(row);
    });
  }

  /**
   * Format a param value for the value hint next to its control.
   *
   * Numbers with a step >= 1 are shown as integers; other numbers are shown with
   * two decimals; everything else is shown as a string.
   *
   * @param {*} v
   * @param {object} spec
   * @returns {string}
   */
  function formatValue(v, spec) {
    if (typeof v === 'number') {
      const step = spec.step;
      if (step !== undefined && step >= 1) return String(Math.round(v));
      return v.toFixed(2);
    }
    return String(v);
  }

  /**
   * Schedule a sketch restart after a short debounce.
   *
   * Clears any pending restart, then either restarts immediately (for direct
   * controls like select/checkbox/text) or waits 60ms and restarts (for
   * in-flight range changes). The HUD is refreshed on every restart path.
   *
   * @param {boolean} immediate
   * @returns {void}
   */
  function scheduleRestart(immediate) {
    if (!current) return;
    clearTimeout(restartTimer);
    if (immediate) { restart(); updateHud(0, true); return; }
    restartTimer = setTimeout(() => { restart(); updateHud(0, true); }, 60);
  }

  /**
   * Update the HUD line under the canvas.
   *
   * Shows the sketch title, the current seed, an optional FPS readout, and an
   * optional `paused` marker. When `force` is true or the sketch is static, the
   * FPS column is omitted. The seed input is refreshed unless the user is
   * actively typing in it.
   *
   * @param {number} [now]
   * @param {boolean} [force]
   * @returns {void}
   */
  function updateHud(now, force) {
    const hud = $('hud');
    if (!hud || !current) return;
    const fps = force || !current.animate ? '' : ' · ' + fpsText(now) + ' fps';
    hud.innerHTML = '';
    const title = document.createElement('span');
    title.className = 'hud-title';
    title.textContent = current.title;
    const seed = document.createElement('span');
    seed.className = 'hud-seed';
    seed.textContent = 'seed ' + current.seed;
    hud.appendChild(title);
    hud.appendChild(document.createTextNode(' · '));
    hud.appendChild(seed);
    if (fps) hud.appendChild(document.createTextNode(fps));
    if (paused) {
      hud.appendChild(document.createTextNode(' · '));
      const p = document.createElement('span');
      p.className = 'hud-paused';
      p.textContent = 'paused';
      hud.appendChild(p);
    }
    const seedInput = $('seed-input');
    if (seedInput && document.activeElement !== seedInput) seedInput.value = current.seed;
  }

  /**
   * Smoothed FPS readout.
   *
   * Accumulates frame counts over roughly half-second windows so the displayed
   * number does not flicker every frame.
   *
   * @param {number} now
   * @returns {number}
   */
  let fpsAcc = 0, fpsCount = 0, fpsShown = 0;
  function fpsText(now) {
    if (!fpsShown) { fpsShown = now; }
    const dt = now - fpsAcc;
    fpsCount++;
    if (dt > 500) {
      fpsShown = Math.round(fpsCount * 1000 / dt);
      fpsAcc = now;
      fpsCount = 0;
    }
    return fpsShown;
  }

  /**
   * Assign a new random seed to the current sketch.
   *
   * @returns {void}
   */
  function reseed() {
    if (!current) return;
    current.seed = (Math.random() * 4294967295) >>> 0;
    restart();
    updateHud(0, true);
  }

  /**
   * Set the current sketch's seed from a user value.
   *
   * Non-finite values are treated as 0. The seed is always stored as an
   * unsigned 32-bit integer.
   *
   * @param {*} value
   * @returns {void}
   */
  function setSeed(value) {
    if (!current) return;
    const n = Number(value);
    current.seed = (Number.isFinite(n) ? Math.floor(n) : 0) >>> 0;
    restart();
    updateHud(0, true);
  }

  /**
   * Toggle pause on the current animated sketch.
   *
   * Static sketches do not have a pause state, so this is a no-op for them.
   *
   * @returns {void}
   */
  function togglePause() {
    if (!current || !current.animate) return;
    paused = !paused;
    $('btn-pause').textContent = paused ? '▶ Play' : '⏸ Pause';
    updateHud(0, true);
  }

  /**
   * Randomize every parameter on the current sketch.
   *
   * Selects pick a random option, checkboxes flip with 50/50 odds, colors are
   * regenerated through the palette machinery, and other values are sampled
   * within their min/max range. Params marked `randomize: false` are left
   * untouched. After randomizing, the param panel is rebuilt and the sketch is
   * restarted.
   *
   * @returns {void}
   */
  function randomizeParams() {
    if (!current) return;
    for (const key in current.params) {
      const spec = current.params[key];
      if (spec.type === 'select' && spec.options && spec.options.length) {
        current.values[key] = spec.options[Math.floor(Art.RNG.unit() * spec.options.length)];
        if (typeof current.values[key] === 'object') current.values[key] = current.values[key].value;
      } else if (spec.randomize === false) {
        // leave untouched
      } else if (spec.type === 'checkbox') {
        current.values[key] = Art.RNG.chance(0.5);
      } else if (spec.type === 'color') {
        current.values[key] = Art.Color.hslToHex(
          Art.RNG.range(0, 360), Art.RNG.range(45, 90), Art.RNG.range(35, 75));
      } else if (spec.type !== 'text') {
        const min = spec.min !== undefined ? spec.min : 0;
        const max = spec.max !== undefined ? spec.max : 1;
        let v = Art.RNG.range(min, max);
        if (spec.integer || (spec.step !== undefined && spec.step >= 1)) v = Math.round(v);
        current.values[key] = v;
      }
    }
    syncInkToBackground();
    renderParams();
    restart();
    updateHud(0, true);
  }

  /**
   * Reset the current sketch's params to their defaults.
   *
   * @returns {void}
   */
  function resetParams() {
    if (!current) return;
    current.values = defaultsFor(current);
    syncInkToBackground();
    renderParams();
    restart();
    updateHud(0, true);
  }

  /**
   * Export the current canvas as a PNG.
   *
   * Creates a temporary download link named after the sketch id and seed, then
   * triggers a download by clicking it.
   *
   * @returns {void}
   */
  function exportPng() {
    if (!canvas) return;
    const name = (current ? current.id : 'art') + '-' + (current ? current.seed : '') + '.png';
    const link = document.createElement('a');
    link.download = name;
    if (backgroundMode === 'transparent') {
      link.href = canvas.toDataURL('image/png');
    } else {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const exportCtx = exportCanvas.getContext('2d');
      exportCtx.fillStyle = backgroundMode === 'dark' ? '#101013' : '#f2efe7';
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      exportCtx.drawImage(canvas, 0, 0);
      link.href = exportCanvas.toDataURL('image/png');
    }
    link.click();
  }

  /**
   * Bind the toolbar buttons to their engine actions.
   *
   * Pause/resume, reseed, randomize, reset, and export are all wired here, along
   * with the seed-input `change` and `Go` button.
   *
   * @returns {void}
   */
  function bindToolbar() {
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-reseed').addEventListener('click', reseed);
    $('btn-random').addEventListener('click', randomizeParams);
    $('btn-reset').addEventListener('click', resetParams);
    $('btn-export').addEventListener('click', exportPng);
    const backgroundSelect = $('background-mode');
    backgroundSelect.value = backgroundMode;
    canvas.style.backgroundColor = 'transparent';
    backgroundSelect.addEventListener('change', () => {
      backgroundMode = backgroundSelect.value;
      canvas.style.backgroundColor = backgroundMode === 'dark' ? '#101013'
        : backgroundMode === 'light' ? '#f2efe7' : 'transparent';
      if (syncInkToBackground()) scheduleRestart(true);
    });

    const seedInput = $('seed-input');
    seedInput.addEventListener('change', () => setSeed(seedInput.value));
    $('btn-seed').addEventListener('click', () => setSeed(seedInput.value));
  }

  /**
   * Bind keyboard shortcuts.
   *
   * Ignores events from text-like inputs so typing in the seed box does not
   * trigger app shortcuts. Shortcuts:
   * - Space: pause/resume
   * - R: new seed
   * - E: export PNG
   * - P: randomize params
   * - 0: reset params
   * - ArrowLeft/ArrowRight: previous/next sketch
   *
   * @returns {void}
   */
  function bindKeys() {
    document.addEventListener('keydown', e => {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      else if (e.key === 'r' || e.key === 'R') reseed();
      else if (e.key === 'e' || e.key === 'E') exportPng();
      else if (e.key === 'p' || e.key === 'P') randomizeParams();
      else if (e.key === '0') resetParams();
      else if (e.key === 'ArrowRight' && sketches.length > 1) {
        const i = sketches.indexOf(current);
        select(sketches[(i + 1) % sketches.length].id);
      } else if (e.key === 'ArrowLeft' && sketches.length > 1) {
        const i = sketches.indexOf(current);
        select(sketches[(i - 1 + sketches.length) % sketches.length].id);
      }
    });
  }

  /**
   * Boot the app.
   *
   * Grabs the canvas and its context, caches the gallery list element, binds the
   * toolbar and keyboard shortcuts, attaches the window resize handler, sizes the
   * canvas, renders the gallery, selects the first sketch, and marks the engine
   * as ready.
   *
   * @returns {void}
   */
  function boot() {
    canvas = $('canvas');
    ctx = canvas.getContext('2d');
    galleryEl = $('gallery');
    bindToolbar();
    bindKeys();
    window.addEventListener('resize', resize);
    resize();
    renderGallery();
    if (sketches.length) select(sketches[0].id);
    global.Art.ready = true;
  }

  /**
   * Public engine API.
   *
   * These are the symbols the UI and external code are meant to use. The
   * internal helpers above are deliberately not exposed.
   */
  Art.register = register;
  Art.sketches = sketches;
  Art.select = select;
  Art.restart = restart;
  Art.reseed = reseed;
  Art.exportPng = exportPng;
  Art.randomizeParams = randomizeParams;
  Art.resetParams = resetParams;

  /**
   * Start the app once the document is ready.
   *
   * If the DOM is still loading, waits for `DOMContentLoaded`; otherwise boots
   * immediately. This is what makes the app resilient to script-tag ordering as
   * long as `core/*.js` are in the page before this file.
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
