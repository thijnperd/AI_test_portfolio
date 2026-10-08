/* app.js — the browser shell for Dither Studio.
 * Depends on dither.js (the core) loading first.
 *
 * The canvas backing store is one pixel per working pixel; zoom is CSS only
 * (`image-rendering: pixelated`), so a render is a single putImageData and the
 * browser does the scaling.
 *
 * Cost control (DESIGN.md performance clause):
 *   - the working image is capped at MAX_SOURCE on its longest side;
 *   - dragging a slider renders a half-resolution preview on the next frame;
 *   - the full-quality pass only runs when the control is released.
 */

(function () {
  'use strict';

  const D = window.DitherLib;
  const MAX_SOURCE = 1600;
  const PREVIEW_SCALE = 0.5;
  const ZOOM_STEPS = [1, 2, 3, 4, 6, 8];

  const $ = function (id) { return document.getElementById(id); };

  const el = {
    open: $('open'), demo: $('demo'), file: $('file'),
    algorithm: $('algorithm'), palette: $('palette'),
    pixelSize: $('pixel-size'), pixelSizeValue: $('pixel-size-value'),
    threshold: $('threshold'), thresholdValue: $('threshold-value'), thresholdRow: $('threshold-row'),
    seed: $('seed'), seedValue: $('seed-value'), reseed: $('reseed'),
    brightness: $('brightness'), brightnessValue: $('brightness-value'),
    contrast: $('contrast'), contrastValue: $('contrast-value'),
    saturation: $('saturation'), saturationValue: $('saturation-value'),
    hue: $('hue'), hueValue: $('hue-value'),
    blur: $('blur'), blurValue: $('blur-value'),
    sharpen: $('sharpen'), sharpenValue: $('sharpen-value'),
    denoise: $('denoise'),
    glitchList: $('glitch-list'),
    glowRadius: $('glow-radius'), glowRadiusValue: $('glow-radius-value'),
    glowIntensity: $('glow-intensity'), glowIntensityValue: $('glow-intensity-value'),
    preset: $('preset'), presetExport: $('preset-export'), presetImport: $('preset-import'), presetFile: $('preset-file'),
    statFile: $('stat-file'), statSize: $('stat-size'), statAlgorithm: $('stat-algorithm'),
    statPalette: $('stat-palette'), statColors: $('stat-colors'), statRender: $('stat-render'),
    statStatus: $('stat-status'), statZoom: $('stat-zoom'),
    zoomOut: $('zoom-out'), zoomFit: $('zoom-fit'), zoomIn: $('zoom-in'), compare: $('compare'),
    exportScale: $('export-scale'), export: $('export'),
    wrap: $('canvas-wrap'), canvas: $('canvas'),
  };

  const ctx = el.canvas.getContext('2d');
  const buffer = document.createElement('canvas');

  const state = {
    source: null,       // { data, width, height } at working resolution
    original: null,     // ImageData of the working source, for compare
    preview: null,      // half-resolution { data, width, height }
    name: 'demo',
    result: null,       // last full-resolution result
    settings: D.mergeSettings(D.DEFAULTS),
    zoom: null,         // null = fit, otherwise a scale
    panning: null,
    rafPending: false,
  };

  // The glitch stack lives in the panel as a reorderable list, so the UI state
  // is the order plus a per-effect switch and amount.
  const glitches = {
    order: D.GLITCHES.map(function (g) { return g.id; }),
    on: {},
    amount: {},
  };
  D.GLITCHES.forEach(function (g) {
    glitches.on[g.id] = false;
    glitches.amount[g.id] = 50;
  });

  // slider <-> settings bindings, also used to write settings back into the UI
  const plain = function (v) { return String(v); };
  const fixed2 = function (v) { return v.toFixed(2); };
  const BINDINGS = [
    { input: el.pixelSize, label: el.pixelSizeValue, path: 'pixelSize', fmt: plain },
    { input: el.threshold, label: el.thresholdValue, path: 'threshold', fmt: plain },
    { input: el.brightness, label: el.brightnessValue, path: 'adjustments.brightness', fmt: fixed2 },
    { input: el.contrast, label: el.contrastValue, path: 'adjustments.contrast', fmt: fixed2 },
    { input: el.saturation, label: el.saturationValue, path: 'adjustments.saturation', fmt: fixed2 },
    { input: el.hue, label: el.hueValue, path: 'adjustments.hue', fmt: function (v) { return v + '°'; } },
    { input: el.blur, label: el.blurValue, path: 'adjustments.blur', fmt: plain },
    { input: el.sharpen, label: el.sharpenValue, path: 'adjustments.sharpen', fmt: fixed2 },
    { input: el.glowRadius, label: el.glowRadiusValue, path: 'glow.radius', fmt: plain },
    { input: el.glowIntensity, label: el.glowIntensityValue, path: 'glow.intensity', fmt: plain },
  ];

  /* ------------------------------------------------------------------ */
  /* settings plumbing                                                  */
  /* ------------------------------------------------------------------ */

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let target = obj;
    for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
    target[parts[parts.length - 1]] = value;
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o[k]; }, obj);
  }

  function deriveGlitches() {
    return glitches.order
      .filter(function (id) { return glitches.on[id]; })
      .map(function (id) { return { id: id, amount: glitches.amount[id] }; });
  }

  function readGlitchState(list) {
    D.GLITCHES.forEach(function (g) {
      glitches.on[g.id] = false;
      glitches.amount[g.id] = 50;
    });
    (list || []).forEach(function (item) {
      glitches.on[item.id] = true;
      glitches.amount[item.id] = item.amount;
    });
    const active = (list || []).map(function (item) { return item.id; });
    glitches.order = active.concat(glitches.order.filter(function (id) { return active.indexOf(id) < 0; }));
  }  function syncUI() {
    const s = state.settings;
    el.algorithm.value = s.algorithm;
    el.palette.value = s.palette;
    BINDINGS.forEach(function (binding) {
      const value = getPath(s, binding.path);
      binding.input.value = value;
      binding.label.textContent = binding.fmt(parseFloat(value));
    });
    el.seed.value = s.seed;
    el.seedValue.textContent = String(s.seed);
    el.denoise.checked = !!s.adjustments.denoise;
    el.thresholdRow.hidden = s.palette !== 'bw';
    rebuildGlitchValues();
  }

  /* ------------------------------------------------------------------ */
  /* panel construction                                                 */
  /* ------------------------------------------------------------------ */

  function buildAlgorithmSelect() {
    const groups = [];
    D.ALGORITHMS.forEach(function (algo) {
      let group = groups.find(function (g) { return g.name === algo.group; });
      if (!group) { group = { name: algo.group, items: [] }; groups.push(group); }
      group.items.push(algo);
    });
    groups.forEach(function (group) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.name;
      group.items.forEach(function (algo) {
        const option = document.createElement('option');
        option.value = algo.id;
        option.textContent = algo.name;
        optgroup.appendChild(option);
      });
      el.algorithm.appendChild(optgroup);
    });
  }

  function buildPaletteSelect() {
    D.PALETTES.forEach(function (palette) {
      const option = document.createElement('option');
      option.value = palette.id;
      option.textContent = palette.name + ' · ' + palette.colors.length + ' colors';
      el.palette.appendChild(option);
    });
  }

  function buildGlitchList() {
    el.glitchList.textContent = '';
    glitches.order.forEach(function (id, index) {
      const meta = D.GLITCHES.find(function (g) { return g.id === id; });
      const row = document.createElement('div');
      row.className = 'glitch';
      row.title = meta.hint;

      const check = document.createElement('label');
      check.className = 'check';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = !!glitches.on[id];
      toggle.setAttribute('aria-label', meta.name);
      const name = document.createElement('span');
      name.textContent = meta.name;
      check.appendChild(toggle);
      check.appendChild(name);

      const controls = document.createElement('div');
      controls.className = 'glitch-row';
      const amount = document.createElement('input');
      amount.type = 'range';
      amount.min = '0';
      amount.max = '100';
      amount.step = '1';
      amount.value = String(glitches.amount[id]);
      amount.disabled = !glitches.on[id];
      amount.setAttribute('aria-label', meta.name + ' amount');
      const up = document.createElement('button');
      up.className = 'btn btn-mini';
      up.textContent = '↑';
      up.title = 'Move up';
      up.disabled = index === 0;
      const down = document.createElement('button');
      down.className = 'btn btn-mini';
      down.textContent = '↓';
      down.title = 'Move down';
      down.disabled = index === glitches.order.length - 1;
      controls.appendChild(amount);
      controls.appendChild(up);
      controls.appendChild(down);
      row.appendChild(check);
      row.appendChild(controls);
      el.glitchList.appendChild(row);

      toggle.addEventListener('change', function () {
        glitches.on[id] = toggle.checked;
        amount.disabled = !toggle.checked;
        render(true);
      });
      amount.addEventListener('input', function () {
        glitches.amount[id] = parseInt(amount.value, 10);
        schedulePreview();
      });
      amount.addEventListener('change', function () { render(true); });
      up.addEventListener('click', function () { moveGlitch(index, -1); });
      down.addEventListener('click', function () { moveGlitch(index, 1); });
    });
  }

  function rebuildGlitchValues() {
    const rows = el.glitchList.children;
    for (let i = 0; i < rows.length; i++) {
      const id = glitches.order[i];
      const toggle = rows[i].querySelector('input[type="checkbox"]');
      const amount = rows[i].querySelector('input[type="range"]');
      toggle.checked = !!glitches.on[id];
      amount.value = String(glitches.amount[id]);
      amount.disabled = !glitches.on[id];
    }
  }

  function moveGlitch(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= glitches.order.length) return;
    const id = glitches.order[index];
    glitches.order[index] = glitches.order[target];
    glitches.order[target] = id;
    buildGlitchList();
    render(true);
  }

  const PRESETS = [
    { id: 'gameboy', name: 'Retro Game Boy', settings: {
      algorithm: 'bayer4', palette: 'gameboy', pixelSize: 4,
      adjustments: { contrast: 1.1, sharpen: 0.5 },
    } },
    { id: 'newsprint', name: 'Newsprint', settings: {
      algorithm: 'halftone', palette: 'bw', pixelSize: 2,
      adjustments: { contrast: 1.25, sharpen: 0.3 },
    } },
    { id: 'zine', name: 'Zine 1-bit', settings: {
      algorithm: 'floyd-steinberg', palette: 'bw', pixelSize: 1,
      adjustments: { contrast: 1.15 },
    } },
    { id: 'c64', name: 'C64 Poster', settings: {
      algorithm: 'bayer8', palette: 'c64', pixelSize: 3,
      adjustments: { saturation: 1.3, contrast: 1.05 },
    } },
    { id: 'terminal', name: 'Terminal Green', settings: {
      algorithm: 'clustered-dot', palette: 'gameboy', pixelSize: 2,
      adjustments: { contrast: 1.2, saturation: 1.2, brightness: 1.05 },
    } },
    { id: 'spectrum', name: 'Spectrum Loading', settings: {
      algorithm: 'sierra', palette: 'zx-spectrum', pixelSize: 2,
      adjustments: { saturation: 1.25, contrast: 1.1 },
    } },
    { id: 'riso', name: 'Riso Poster', settings: {
      algorithm: 'stevenson-arce', palette: 'gruvbox', pixelSize: 3,
      adjustments: { contrast: 1.2, saturation: 0.9 },
    } },
    { id: 'vhs', name: 'VHS Decay', settings: {
      algorithm: 'bayer4', palette: 'pico8', pixelSize: 2,
      adjustments: { contrast: 1.05, saturation: 1.15 },
      glitches: [{ id: 'scanlines', amount: 35 }, { id: 'aberration', amount: 25 }, { id: 'grain', amount: 30 }],
      glow: { radius: 2, intensity: 30 },
    } },
    { id: 'sort', name: 'Glitch Sort', settings: {
      algorithm: 'floyd-steinberg', palette: 'cga', pixelSize: 1,
      adjustments: { contrast: 1.1 },
      glitches: [{ id: 'pixelsort', amount: 70 }, { id: 'aberration', amount: 20 }],
    } },
  ];

  function buildPresetSelect() {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a recipe…';
    el.preset.appendChild(placeholder);
    PRESETS.forEach(function (preset) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      el.preset.appendChild(option);
    });
  }

  function applySettings(next, label) {
    state.settings = D.mergeSettings(next);
    readGlitchState(next && next.glitches);
    syncUI();
    buildGlitchList();
    render(true);
    if (label) el.statStatus.textContent = label;
  }

  function applyPreset(id) {
    const preset = PRESETS.find(function (p) { return p.id === id; });
    if (!preset) return;
    applySettings(preset.settings, preset.name);
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  function toImageData(res) {
    return new ImageData(res.data, res.width, res.height);
  }

  function render(full) {
    const source = full ? state.source : state.preview;
    if (!source) return;
    state.settings.glitches = deriveGlitches();
    const res = D.process(source, state.settings);

    if (full) {
      state.result = res;
      ctx.putImageData(toImageData(res), 0, 0);
    } else {
      buffer.width = res.width;
      buffer.height = res.height;
      const bctx = buffer.getContext('2d');
      bctx.putImageData(toImageData(res), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
      ctx.drawImage(buffer, 0, 0, el.canvas.width, el.canvas.height);
    }
    updateStats(res, full);
  }

  function schedulePreview() {
    if (state.rafPending) return;
    state.rafPending = true;
    window.requestAnimationFrame(function () {
      state.rafPending = false;
      render(false);
    });
  }

  function algorithmById(id) {
    return D.ALGORITHMS.find(function (a) { return a.id === id; }) || D.ALGORITHMS[0];
  }

  function paletteById(id) {
    return D.PALETTES.find(function (p) { return p.id === id; }) || D.PALETTES[0];
  }

  function updateStats(res, full) {
    const algo = algorithmById(state.settings.algorithm);
    const palette = paletteById(state.settings.palette);
    el.statFile.textContent = state.name;
    el.statSize.textContent = res.width + '×' + res.height;
    el.statAlgorithm.textContent = algo.name;
    el.statPalette.textContent = palette.name;
    el.statColors.textContent = res.colors.toLocaleString('en-US');
    el.statRender.textContent = Math.round(res.ms) + ' ms';
    el.statStatus.textContent = full ? 'Ready' : 'Preview';
  }

  /* ------------------------------------------------------------------ */
  /* zoom, pan, compare                                                 */
  /* ------------------------------------------------------------------ */

  function effectiveScale() {
    if (state.zoom !== null) return state.zoom;
    const rect = el.wrap.getBoundingClientRect();
    const fit = Math.min(
      (rect.width - 48) / el.canvas.width,
      (rect.height - 48) / el.canvas.height
    );
    return Math.max(0.05, Math.min(8, fit));
  }

  function applyZoom() {
    const scale = effectiveScale();
    el.canvas.style.width = Math.max(1, Math.round(el.canvas.width * scale)) + 'px';
    el.canvas.style.height = Math.max(1, Math.round(el.canvas.height * scale)) + 'px';
    el.statZoom.textContent = state.zoom === null ? 'Fit' : state.zoom + '×';
  }

  function zoomStep(direction) {
    const current = effectiveScale();
    if (direction > 0) {
      const next = ZOOM_STEPS.find(function (step) { return step > current + 1e-3; });
      state.zoom = next === undefined ? ZOOM_STEPS[ZOOM_STEPS.length - 1] : next;
    } else {
      const lower = ZOOM_STEPS.filter(function (step) { return step < current - 1e-3; });
      state.zoom = lower.length ? lower[lower.length - 1] : ZOOM_STEPS[0];
    }
    applyZoom();
  }

  function showResult() {
    if (state.result) ctx.putImageData(toImageData(state.result), 0, 0);
  }

  function setCompare(on) {
    if (!state.original) return;
    if (on) ctx.putImageData(state.original, 0, 0);
    else showResult();
    el.compare.classList.toggle('btn-primary', on);
  }

  /* ------------------------------------------------------------------ */
  /* loading images                                                     */
  /* ------------------------------------------------------------------ */

  function setSource(imageData, name, capped) {
    state.original = imageData;
    state.source = { data: imageData.data, width: imageData.width, height: imageData.height };
    state.name = name;

    const pw = Math.max(1, Math.round(imageData.width * PREVIEW_SCALE));
    const ph = Math.max(1, Math.round(imageData.height * PREVIEW_SCALE));
    const full = document.createElement('canvas');
    full.width = imageData.width;
    full.height = imageData.height;
    full.getContext('2d').putImageData(imageData, 0, 0);
    const half = document.createElement('canvas');
    half.width = pw;
    half.height = ph;
    const hctx = half.getContext('2d');
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(full, 0, 0, pw, ph);
    const halfData = hctx.getImageData(0, 0, pw, ph);
    state.preview = { data: halfData.data, width: pw, height: ph };

    el.canvas.width = imageData.width;
    el.canvas.height = imageData.height;
    state.zoom = null;
    applyZoom();
    render(true);
    el.statStatus.textContent = capped ? 'Scaled to ' + MAX_SOURCE + 'px' : 'Ready';
  }

  function loadBitmap(bitmap, name) {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_SOURCE / longest);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const scratch = document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
    const sctx = scratch.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(bitmap, 0, 0, w, h);
    setSource(sctx.getImageData(0, 0, w, h), name, scale < 1);
  }

  function loadFile(file) {
    if (!file) return;
    if (window.createImageBitmap) {
      window.createImageBitmap(file).then(function (bitmap) {
        loadBitmap(bitmap, file.name || 'image');
        bitmap.close && bitmap.close();
      }).catch(function () {
        el.statStatus.textContent = 'Could not read that image';
      });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      loadBitmap(img, file.name || 'image');
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { el.statStatus.textContent = 'Could not read that image'; };
    img.src = url;
  }

  /* ------------------------------------------------------------------ */
  /* demo scene (so the page opens with art)                            */
  /* ------------------------------------------------------------------ */

  function rnd(i) {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function demoCloud(c, x, y, rx, ry, alpha) {
    const g = c.createRadialGradient(x, y, 1, x, y, rx);
    g.addColorStop(0, 'rgba(255,216,196,' + alpha + ')');
    g.addColorStop(0.55, 'rgba(242,170,150,' + (alpha * 0.5) + ')');
    g.addColorStop(1, 'rgba(230,150,140,0)');
    c.save();
    c.translate(x, y);
    c.scale(1, ry / rx);
    c.translate(-x, -y);
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function demoRidge(c, w, baseY, amp, phase, seeds, color) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, baseY);
    for (let x = 0; x <= w; x += 3) {
      const t = x / w;
      let y = 0;
      for (let k = 1; k <= 3; k++) y += Math.sin(t * Math.PI * k * seeds + k * 2.3 + phase) / k;
      c.lineTo(x, baseY - amp * (0.45 + 0.55 * y * 0.5 + 0.45));
    }
    c.lineTo(w, baseY);
    c.closePath();
    c.fill();
  }

  function drawDemo(canvasEl, w, h) {
    const c = canvasEl.getContext('2d');
    const horizon = Math.round(h * 0.62);

    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#232a4d');
    sky.addColorStop(0.42, '#6f4a6c');
    sky.addColorStop(0.76, '#d07a5e');
    sky.addColorStop(1, '#f7bc7c');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, horizon);

    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 110; i++) {
      const x = Math.round(rnd(i) * w);
      const y = Math.round(rnd(i + 40) * horizon * 0.42);
      const size = rnd(i + 80) > 0.85 ? 2 : 1;
      c.fillRect(x, y, size, size);
    }

    const sunX = w * 0.62;
    const sunY = horizon - h * 0.15;
    const sunR = h * 0.085;
    const halo = c.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 5);
    halo.addColorStop(0, 'rgba(255,236,196,0.55)');
    halo.addColorStop(0.4, 'rgba(255,172,112,0.22)');
    halo.addColorStop(1, 'rgba(255,140,90,0)');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(sunX, sunY, sunR * 5, 0, Math.PI * 2);
    c.fill();
    const sun = c.createRadialGradient(sunX, sunY, 1, sunX, sunY, sunR);
    sun.addColorStop(0, '#fff9e6');
    sun.addColorStop(1, '#ffc873');
    c.fillStyle = sun;
    c.beginPath();
    c.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    c.fill();

    demoCloud(c, w * 0.2, h * 0.17, w * 0.15, h * 0.035, 0.5);
    demoCloud(c, w * 0.76, h * 0.29, w * 0.11, h * 0.028, 0.42);
    demoCloud(c, w * 0.44, h * 0.4, w * 0.09, h * 0.022, 0.3);

    demoRidge(c, w, horizon, h * 0.2, 0.4, 6, '#564662');
    demoRidge(c, w, horizon, h * 0.14, 1.7, 4, '#3a2f52');

    const water = c.createLinearGradient(0, horizon, 0, h);
    water.addColorStop(0, '#4b4269');
    water.addColorStop(1, '#161a2e');
    c.fillStyle = water;
    c.fillRect(0, horizon, w, h - horizon);

    for (let i = 0; i < 30; i++) {
      const t = i / 30;
      const y = horizon + t * (h - horizon);
      const width = w * (0.03 + t * 0.2) * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.7)));
      const alpha = 0.42 * (1 - t) * (0.5 + 0.5 * Math.abs(Math.sin(i * 0.9)));
      c.fillStyle = 'rgba(255,190,120,' + alpha.toFixed(3) + ')';
      c.fillRect(Math.round(sunX - width / 2 + Math.sin(i * 2.1) * w * 0.012), Math.round(y), Math.round(width), 2);
    }

    c.fillStyle = '#0a0c14';
    c.fillRect(0, horizon + (h - horizon) * 0.55, w, 3);
    for (let i = 0; i < 7; i++) {
      c.fillRect(Math.round(w * (0.06 + i * 0.13)), horizon + (h - horizon) * 0.55, 4, Math.round((h - horizon) * 0.4));
    }

    c.beginPath();
    c.moveTo(w * 0.18, horizon - 2);
    c.lineTo(w * 0.18, horizon - h * 0.075);
    c.lineTo(w * 0.225, horizon - 2);
    c.closePath();
    c.fill();
    c.fillRect(Math.round(w * 0.153), horizon, Math.round(w * 0.05), 3);
  }

  function loadDemo() {
    const w = 960;
    const h = 640;
    const scratch = document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
    drawDemo(scratch, w, h);
    setSource(scratch.getContext('2d').getImageData(0, 0, w, h), 'demo scene', false);
  }

  /* ------------------------------------------------------------------ */
  /* export                                                             */
  /* ------------------------------------------------------------------ */

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function exportPNG() {
    if (!state.source) return;
    render(true);
    const scale = parseInt(el.exportScale.value, 10) || 1;
    const out = document.createElement('canvas');
    out.width = el.canvas.width * scale;
    out.height = el.canvas.height * scale;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    if (scale === 1) {
      octx.putImageData(toImageData(state.result), 0, 0);
    } else {
      buffer.width = state.result.width;
      buffer.height = state.result.height;
      buffer.getContext('2d').putImageData(toImageData(state.result), 0, 0);
      octx.drawImage(buffer, 0, 0, out.width, out.height);
    }
    const base = (state.name || 'dither').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9._-]+/gi, '-');
    out.toBlob(function (blob) {
      if (blob) download(blob, base + '-dither-' + scale + 'x.png');
      el.statStatus.textContent = 'Exported PNG ' + scale + '×';
    }, 'image/png');
  }

  /* ------------------------------------------------------------------ */
  /* wiring                                                             */
  /* ------------------------------------------------------------------ */

  function init() {
    buildAlgorithmSelect();
    buildPaletteSelect();
    buildGlitchList();
    buildPresetSelect();

    BINDINGS.forEach(function (binding) {
      binding.input.addEventListener('input', function () {
        const value = parseFloat(binding.input.value);
        setPath(state.settings, binding.path, value);
        binding.label.textContent = binding.fmt(value);
        schedulePreview();
      });
      binding.input.addEventListener('change', function () {
        setPath(state.settings, binding.path, parseFloat(binding.input.value));
        render(true);
      });
    });

    el.algorithm.addEventListener('change', function () {
      state.settings.algorithm = el.algorithm.value;
      render(true);
    });

    el.palette.addEventListener('change', function () {
      state.settings.palette = el.palette.value;
      el.thresholdRow.hidden = state.settings.palette !== 'bw';
      render(true);
    });

    el.seed.addEventListener('change', function () {
      state.settings.seed = (parseInt(el.seed.value, 10) || 0) >>> 0;
      el.seedValue.textContent = String(state.settings.seed);
      render(true);
    });

    el.reseed.addEventListener('click', function () {
      state.settings.seed = (Math.random() * 0xffffffff) >>> 0;
      el.seed.value = state.settings.seed;
      el.seedValue.textContent = String(state.settings.seed);
      render(true);
    });

    el.denoise.addEventListener('change', function () {
      state.settings.adjustments.denoise = el.denoise.checked;
      render(true);
    });

    el.demo.addEventListener('click', loadDemo);
    el.open.addEventListener('click', function () { el.file.click(); });
    el.file.addEventListener('change', function () {
      loadFile(el.file.files && el.file.files[0]);
      el.file.value = '';
    });

    el.preset.addEventListener('change', function () {
      const id = el.preset.value;
      el.preset.value = '';
      if (id) applyPreset(id);
    });

    el.presetExport.addEventListener('click', function () {
      state.settings.glitches = deriveGlitches();
      const payload = { app: 'dither-studio', version: 1, settings: state.settings };
      download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'dither-studio-preset.json');
      el.statStatus.textContent = 'Preset exported';
    });

    el.presetImport.addEventListener('click', function () { el.presetFile.click(); });
    el.presetFile.addEventListener('change', function () {
      const file = el.presetFile.files && el.presetFile.files[0];
      el.presetFile.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = JSON.parse(String(reader.result));
          const settings = parsed && parsed.settings ? parsed.settings : parsed;
          applySettings(settings, 'Preset imported');
        } catch (err) {
          el.statStatus.textContent = 'That preset file could not be read';
        }
      };
      reader.readAsText(file);
    });

    el.zoomIn.addEventListener('click', function () { zoomStep(1); });
    el.zoomOut.addEventListener('click', function () { zoomStep(-1); });
    el.zoomFit.addEventListener('click', function () { state.zoom = null; applyZoom(); });

    el.compare.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      setCompare(true);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (type) {
      el.compare.addEventListener(type, function () { setCompare(false); });
    });

    el.export.addEventListener('click', exportPNG);

    // pan by dragging the canvas
    el.canvas.addEventListener('pointerdown', function (e) {
      if (el.canvas.width * effectiveScale() <= el.wrap.clientWidth + 1 &&
          el.canvas.height * effectiveScale() <= el.wrap.clientHeight + 1) return;
      state.panning = { x: e.clientX, y: e.clientY, left: el.wrap.scrollLeft, top: el.wrap.scrollTop };
      el.canvas.classList.add('panning');
      try { el.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    });
    el.canvas.addEventListener('pointermove', function (e) {
      if (!state.panning) return;
      el.wrap.scrollLeft = state.panning.left - (e.clientX - state.panning.x);
      el.wrap.scrollTop = state.panning.top - (e.clientY - state.panning.y);
    });
    ['pointerup', 'pointercancel'].forEach(function (type) {
      el.canvas.addEventListener(type, function () {
        state.panning = null;
        el.canvas.classList.remove('panning');
      });
    });

    // drop and paste
    ['dragenter', 'dragover'].forEach(function (type) {
      el.wrap.addEventListener(type, function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        el.statStatus.textContent = 'Drop to load';
      });
    });
    el.wrap.addEventListener('drop', function (e) {
      e.preventDefault();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      loadFile(file);
    });
    window.addEventListener('paste', function (e) {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
          loadFile(items[i].getAsFile());
          return;
        }
      }
    });

    window.addEventListener('keydown', function (e) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'c' || e.key === 'C') setCompare(true);
      else if (e.key === '+' || e.key === '=') zoomStep(1);
      else if (e.key === '-' || e.key === '_') zoomStep(-1);
      else if (e.key === '0') { state.zoom = null; applyZoom(); }
    });
    window.addEventListener('keyup', function (e) {
      if (e.key === 'c' || e.key === 'C') setCompare(false);
    });

    window.addEventListener('resize', applyZoom);

    syncUI();
    loadDemo();
  }

  /* ------------------------------------------------------------------ */
  /* debug hook (also what tools/check.sh asserts against)              */
  /* ------------------------------------------------------------------ */

  window.__dither = {
    stats: function () {
      return {
        file: state.name,
        width: el.canvas.width,
        height: el.canvas.height,
        algorithm: state.settings.algorithm,
        palette: state.settings.palette,
        pixelSize: state.settings.pixelSize,
        colors: state.result ? state.result.colors : null,
        ms: state.result ? Math.round(state.result.ms) : null,
        zoom: el.statZoom.textContent,
        glitches: deriveGlitches().map(function (g) { return g.id + ':' + g.amount; }),
        status: el.statStatus.textContent,
      };
    },
    applyPreset: function (id) { applyPreset(id); },
    setSetting: function (path, value) {
      setPath(state.settings, path, value);
      syncUI();
      render(true);
    },
    // unique colours actually drawn on the canvas — verifies palette membership
    canvasColors: function () {
      const data = ctx.getImageData(0, 0, el.canvas.width, el.canvas.height).data;
      const set = new Set();
      for (let i = 0; i < data.length; i += 4) set.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return set.size;
    },
  };

  init();
})();
