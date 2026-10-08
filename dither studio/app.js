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
  const MONO_STACK = '"SF Mono", "Cascadia Code", Consolas, "JetBrains Mono", Menlo, monospace';

  const $ = function (id) { return document.getElementById(id); };

  const el = {
    open: $('open'), demo: $('demo'), file: $('file'),
    algorithm: $('algorithm'), palette: $('palette'),
    pixelSize: $('pixel-size'), pixelSizeValue: $('pixel-size-value'),
    threshold: $('threshold'), thresholdValue: $('threshold-value'), thresholdRow: $('threshold-row'),
    strength: $('strength'), strengthValue: $('strength-value'),
    serpentine: $('serpentine'),
    seed: $('seed'), seedValue: $('seed-value'), reseed: $('reseed'),
    smooth: $('smooth'), smoothValue: $('smooth-value'), smoothRow: $('smooth-row'),
    flow: $('flow'), flowValue: $('flow-value'), flowRow: $('flow-row'),
    streak: $('streak'), streakValue: $('streak-value'), streakRow: $('streak-row'),
    black: $('black'), blackValue: $('black-value'),
    white: $('white'), whiteValue: $('white-value'),
    gamma: $('gamma'), gammaValue: $('gamma-value'),
    toneMap: $('tone-map'), toneInk: $('tone-ink'), tonePaper: $('tone-paper'), inkCustom: $('ink-custom'),
    alphaMode: $('alpha-mode'),
    textMode: $('text-mode'), textCharset: $('text-charset'), textCharsetRow: $('text-charset-row'),
    textSize: $('text-size'), textSizeValue: $('text-size-value'), textSizeRow: $('text-size-row'),
    textExportRow: $('text-export-row'), exportTxt: $('export-txt'),
    random: $('random'), copy: $('copy'),
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
    videoWebcam: $('video-webcam'), videoOpen: $('video-open'), videoFile: $('video-file'),
    videoToggle: $('video-toggle'), videoFps: $('video-fps'), videoFpsValue: $('video-fps-value'),
    videoFpsRow: $('video-fps-row'), videoTemporal: $('video-temporal'),
    videoTemporalRow: $('video-temporal-row'), videoRecord: $('video-record'),
    videoRecordRow: $('video-record-row'), videoNote: $('video-note'),
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
    videoOn: false,     // frames come from video.js rather than a still image
  };

  // The glitch stack lives in the panel as a reorderable list, so the UI state
  // is the order plus a per-effect switch and amount.
  const glitches = {
    order: D.GLITCHES.map(function (g) { return g.id; }),
    on: {},
    amount: {},
    mode: {},
  };
  D.GLITCHES.forEach(function (g) {
    glitches.on[g.id] = false;
    glitches.amount[g.id] = 50;
    glitches.mode[g.id] = g.modes ? g.modes[0].id : undefined;
  });

  // Character ramps for text mode, darkest first. Kept here rather than in the
  // core: the core prints pixels, the shell picks the type.
  const TEXT_RAMPS = [
    { id: 'ascii', name: 'ASCII  ·  .:-=+*#%@', chars: ' .:-=+*#%@' },
    { id: 'blocks', name: 'Blocks · ░▒▓█', chars: ' ░▒▓█' },
    { id: 'shades', name: 'Shades · .·:;+=xX$@', chars: ' .·:;+=xX$@' },
    { id: 'hex', name: 'Hex · 0123456789ABCDEF', chars: '0123456789ABCDEF' },
    { id: 'binary', name: 'Binary · .01', chars: ' .01' },
  ];
  const TEXT_CELL_CAP = 30000;   // fillText calls per frame; above this, text mode is off

  const text = { on: false, ramp: 'ascii', size: 10 };

  // slider <-> settings bindings, also used to write settings back into the UI
  const plain = function (v) { return String(v); };
  const fixed2 = function (v) { return v.toFixed(2); };
  const BINDINGS = [
    { input: el.pixelSize, label: el.pixelSizeValue, path: 'pixelSize', fmt: plain },
    { input: el.threshold, label: el.thresholdValue, path: 'threshold', fmt: plain },
    { input: el.strength, label: el.strengthValue, path: 'ditherStrength', fmt: plain },
    { input: el.smooth, label: el.smoothValue, path: 'screen.smooth', fmt: plain },
    { input: el.flow, label: el.flowValue, path: 'screen.flow', fmt: plain },
    { input: el.streak, label: el.streakValue, path: 'screen.streak', fmt: plain },
    { input: el.black, label: el.blackValue, path: 'adjustments.black', fmt: plain },
    { input: el.white, label: el.whiteValue, path: 'adjustments.white', fmt: plain },
    { input: el.gamma, label: el.gammaValue, path: 'adjustments.gamma', fmt: fixed2 },
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
      .map(function (id) { return { id: id, amount: glitches.amount[id], mode: glitches.mode[id] }; });
  }

  function readGlitchState(list) {
    D.GLITCHES.forEach(function (g) {
      glitches.on[g.id] = false;
      glitches.amount[g.id] = 50;
      glitches.mode[g.id] = g.modes ? g.modes[0].id : undefined;
    });
    (list || []).forEach(function (item) {
      const meta = D.GLITCHES.find(function (g) { return g.id === item.id; });
      if (!meta) return;
      glitches.on[meta.id] = true;
      glitches.amount[meta.id] = item.amount;
      if (meta.modes) {
        const known = meta.modes.some(function (m) { return m.id === item.mode; });
        glitches.mode[meta.id] = known ? item.mode : meta.modes[0].id;
      }
    });
    const active = (list || []).map(function (item) { return item.id; });
    const rest = glitches.order.filter(function (id) { return active.indexOf(id) < 0; });
    glitches.order = active.concat(rest);
  }

  function rgbToHex(rgb) {
    function part(v) {
      const h = Math.max(0, Math.min(255, Math.round(v || 0))).toString(16);
      return h.length === 1 ? '0' + h : h;
    }
    return '#' + part(rgb[0]) + part(rgb[1]) + part(rgb[2]);
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function syncTextUI() {
    el.textMode.checked = text.on;
    el.textCharset.value = text.ramp;
    el.textSize.value = String(text.size);
    el.textSizeValue.textContent = String(text.size);
    el.textCharsetRow.hidden = !text.on;
    el.textSizeRow.hidden = !text.on;
    el.textExportRow.hidden = !text.on;
  }

  // The screen sliders only mean something to the structure-aware screens.
  function syncScreenRows() {
    const structure = algorithmById(state.settings.algorithm).kind === 'structure';
    el.smoothRow.hidden = !structure;
    el.flowRow.hidden = !structure;
    el.streakRow.hidden = !structure;
  }

  function syncUI() {
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
    el.serpentine.checked = !!s.serpentine;
    el.toneMap.value = s.toneMap;
    el.toneInk.value = rgbToHex(s.toneInk);
    el.tonePaper.value = rgbToHex(s.tonePaper);
    el.inkCustom.hidden = s.toneMap !== 'custom';
    el.alphaMode.value = s.alphaMode;
    el.thresholdRow.hidden = s.palette !== 'bw';
    el.canvas.classList.toggle('alpha-on', s.alphaMode !== 'matte');
    syncTextUI();
    syncScreenRows();
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

  function buildToneMapSelect() {
    D.TONE_MAPS.forEach(function (map) {
      const option = document.createElement('option');
      option.value = map.id;
      option.textContent = map.name;
      el.toneMap.appendChild(option);
    });
  }

  function buildTextSelect() {
    TEXT_RAMPS.forEach(function (ramp) {
      const option = document.createElement('option');
      option.value = ramp.id;
      option.textContent = ramp.name;
      el.textCharset.appendChild(option);
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
      controls.className = meta.modes ? 'glitch-row has-mode' : 'glitch-row';
      let mode = null;
      if (meta.modes) {
        mode = document.createElement('select');
        mode.setAttribute('aria-label', meta.name + ' mode');
        meta.modes.forEach(function (m) {
          const option = document.createElement('option');
          option.value = m.id;
          option.textContent = m.name;
          mode.appendChild(option);
        });
        mode.value = glitches.mode[id];
        mode.disabled = !glitches.on[id];
        controls.appendChild(mode);
      }
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
        if (mode) mode.disabled = !toggle.checked;
        render(true);
      });
      if (mode) {
        mode.addEventListener('change', function () {
          glitches.mode[id] = mode.value;
          render(true);
        });
      }
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
      const mode = rows[i].querySelector('select');
      toggle.checked = !!glitches.on[id];
      amount.value = String(glitches.amount[id]);
      amount.disabled = !glitches.on[id];
      if (mode) {
        mode.value = glitches.mode[id];
        mode.disabled = !glitches.on[id];
      }
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
    { id: 'noir', name: 'Halftone Noir', settings: {
      algorithm: 'halftone-16', palette: 'bw', pixelSize: 1,
      adjustments: { contrast: 1.28, gamma: 1.05, sharpen: 0.35 },
      toneMap: 'sepia',
    } },
    { id: 'amber', name: 'Amber CRT', settings: {
      algorithm: 'bayer8', palette: 'amber', pixelSize: 2,
      adjustments: { contrast: 1.15, brightness: 1.04 },
      glitches: [{ id: 'scanlines', amount: 30 }, { id: 'crt', amount: 45 }, { id: 'grain', amount: 18 }],
      glow: { radius: 2, intensity: 35 },
    } },
    { id: 'duo', name: 'Riso Duotone', settings: {
      algorithm: 'clustered-dot-8', palette: 'bw', pixelSize: 3,
      adjustments: { contrast: 1.2 },
      toneMap: 'custom', toneInk: [26, 34, 120], tonePaper: [255, 214, 120],
    } },
    { id: 'thermal', name: 'Thermal Cam', settings: {
      algorithm: 'bayer16', palette: 'gray-16', pixelSize: 2,
      adjustments: { contrast: 1.35, saturation: 1.4 },
      toneMap: 'thermal',
    } },
    { id: 'mix', name: 'Mixing Poster', settings: {
      algorithm: 'yliluoma-polished', palette: 'gray-16', pixelSize: 2,
      adjustments: { contrast: 1.15, gamma: 1.05 },
    } },
    { id: 'mixduo', name: 'Mixing Duotone', settings: {
      algorithm: 'yliluoma-2', palette: 'gameboy-pocket', pixelSize: 2,
      adjustments: { contrast: 1.2 },
      toneMap: 'gold',
    } },
    { id: 'inkline', name: 'Ink Linework', settings: {
      algorithm: 'line-h4', palette: 'blueprint', pixelSize: 1,
      adjustments: { contrast: 1.3, sharpen: 0.6, gamma: 1.1 },
    } },
    { id: 'storm', name: 'Artifact Storm', settings: {
      algorithm: 'random-noise', palette: 'virtualboy', pixelSize: 2,
      adjustments: { contrast: 1.2 },
      glitches: [
        { id: 'wave', amount: 45 }, { id: 'drip', amount: 40 }, { id: 'deadpixels', amount: 30 },
        { id: 'blocks', amount: 55 }, { id: 'pixelsort', amount: 60, mode: 'cols' },
      ],
    } },
    { id: 'void', name: 'Void Bloom', settings: {
      algorithm: 'void-cluster', palette: 'gray-8', pixelSize: 1,
      adjustments: { contrast: 1.1 },
      toneMap: 'cyanotype',
      glow: { radius: 3, intensity: 45 },
    } },
    // The three structure-aware looks, ready to compare against a photo.
    { id: 'wire', name: 'Wired Portrait', settings: {
      algorithm: 'smooth-diffusion', palette: 'bw', pixelSize: 1,
      screen: { smooth: 7, flow: 100, streak: 30 },
      adjustments: { contrast: 1.2, gamma: 1.05, sharpen: 0.4 },
    } },
    { id: 'matrixrain', name: 'Matrix Rain', settings: {
      algorithm: 'rain', palette: 'matrix', pixelSize: 1,
      screen: { smooth: 5, flow: 10, streak: 100 },
      adjustments: { contrast: 1.15, brightness: 1.03 },
      glow: { radius: 3, intensity: 45 },
    } },
    { id: 'icedots', name: 'Ice Dot Field', settings: {
      algorithm: 'dot-field', palette: 'ice', pixelSize: 1,
      screen: { smooth: 6, flow: 0, streak: 0 },
      adjustments: { contrast: 1.2, gamma: 1.08 },
      glow: { radius: 3, intensity: 55 },
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
    // During video playback the frame loop owns the canvas; a still render here
    // would only be overwritten by the next frame. (A tickOnce render, an
    // export or a paused frame still goes through the normal path.)
    if (state.videoOn && video && video.playing) return;
    const source = full ? state.source : state.preview;
    if (!source) return;
    state.settings.glitches = deriveGlitches();
    const res = D.process(source, state.settings);

    if (full) state.result = res;
    el.canvas.classList.toggle('alpha-on', state.settings.alphaMode !== 'matte');

    if (!(text.on && drawTextResult(res))) {
      if (full) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    }
    updateStats(res, full);
  }

  /* ------------------------------------------------------------------ */
  /* text mode                                                          */
  /* ------------------------------------------------------------------ */

  function rampFor(id) {
    const found = TEXT_RAMPS.find(function (r) { return r.id === id; });
    return (found || TEXT_RAMPS[0]).chars;
  }

  function textCellSize(res) {
    const scale = res.width / Math.max(1, state.source.width);
    return Math.max(3, Math.round(text.size * scale));
  }

  // The character grid: one character per cell, picked by the mean luminance of
  // the *dithered* cell, so the dither texture still shows through in which
  // character is chosen.
  function textGrid(res) {
    const cell = textCellSize(res);
    const cols = Math.max(1, Math.ceil(res.width / cell));
    const rows = Math.max(1, Math.ceil(res.height / cell));
    const chars = rampFor(text.ramp);
    const lumas = new Float32Array(cols * rows);
    let min = Infinity, max = -Infinity;
    for (let cy = 0; cy < rows; cy++) {
      const y0 = cy * cell, y1 = Math.min(res.height, y0 + cell);
      for (let cx = 0; cx < cols; cx++) {
        const x0 = cx * cell, x1 = Math.min(res.width, x0 + cell);
        let sum = 0, count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * res.width + x) * 4;
            sum += 0.2126 * res.data[i] + 0.7152 * res.data[i + 1] + 0.0722 * res.data[i + 2];
            count++;
          }
        }
        const luma = count ? sum / count : 0;
        lumas[cy * cols + cx] = luma;
        if (luma < min) min = luma;
        if (luma > max) max = luma;
      }
    }
    // Stretch the ramp over the proof's own luminance range: a dark proof (a
    // night scene, or any dark palette) would otherwise print as a field of
    // blanks and commas. The tone controls remain the way to change contrast.
    const span = max - min;
    const lines = [];
    for (let cy = 0; cy < rows; cy++) {
      let line = '';
      for (let cx = 0; cx < cols; cx++) {
        const t = span > 1 ? (lumas[cy * cols + cx] - min) / span : 0.5;
        line += chars[Math.min(chars.length - 1, Math.max(0, Math.round(t * (chars.length - 1))))];
      }
      lines.push(line);
    }
    return { cell: cell, cols: cols, rows: rows, lines: lines };
  }

  // The ink and paper for the type: the tone map's own colours when one is on,
  // otherwise the console's.
  function inkColors() {
    const map = D.TONE_MAPS.find(function (m) { return m.id === state.settings.toneMap; });
    if (map && map.id !== 'none') {
      const custom = map.id === 'custom';
      return {
        ink: rgbToHex(custom ? state.settings.toneInk : map.ink),
        paper: rgbToHex(custom ? state.settings.tonePaper : map.paper),
      };
    }
    return { ink: '#e8eaf0', paper: '#0b0c10' };
  }

  function drawTextResult(res) {
    const grid = textGrid(res);
    if (grid.cols * grid.rows > TEXT_CELL_CAP) return false;
    const ink = inkColors();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (state.settings.alphaMode === 'matte') {
      ctx.fillStyle = ink.paper;
      ctx.fillRect(0, 0, res.width, res.height);
    } else {
      ctx.clearRect(0, 0, res.width, res.height);
    }
    ctx.font = grid.cell + 'px ' + MONO_STACK;
    ctx.textBaseline = 'top';
    ctx.fillStyle = ink.ink;
    const glyph = ctx.measureText('M').width || grid.cell * 0.6;
    const dx = (grid.cell - glyph) / 2;
    for (let cy = 0; cy < grid.rows; cy++) {
      const line = grid.lines[cy];
      for (let cx = 0; cx < grid.cols; cx++) {
        ctx.fillText(line[cx], cx * grid.cell + dx, cy * grid.cell);
      }
    }
    return true;
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
    videoStop();
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

  function exportName(extension) {
    const base = (state.name || 'dither').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9._-]+/gi, '-');
    return base + '-dither' + extension;
  }

  function exportPNG() {
    if (!state.source && !state.videoOn) return;
    render(true);
    const scale = parseInt(el.exportScale.value, 10) || 1;
    const out = document.createElement('canvas');
    out.width = el.canvas.width * scale;
    out.height = el.canvas.height * scale;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    if (text.on) {
      // What you see is what you get: the character proof, scaled up as type.
      octx.drawImage(el.canvas, 0, 0, out.width, out.height);
    } else if (scale === 1) {
      octx.putImageData(toImageData(state.result), 0, 0);
    } else {
      buffer.width = state.result.width;
      buffer.height = state.result.height;
      buffer.getContext('2d').putImageData(toImageData(state.result), 0, 0);
      octx.drawImage(buffer, 0, 0, out.width, out.height);
    }
    out.toBlob(function (blob) {
      if (blob) download(blob, exportName('-' + scale + 'x.png'));
      else el.statStatus.textContent = 'The browser refused to build that PNG';
      el.statStatus.textContent = 'Exported PNG ' + scale + '×';
    }, 'image/png');
  }

  function exportTXT() {
    if (!state.source && !state.videoOn) return;
    render(true);
    const grid = textGrid(state.result);
    const body = grid.lines.join('\n') + '\n';
    download(new Blob([body], { type: 'text/plain' }), exportName('.txt'));
    el.statStatus.textContent = 'Exported ' + grid.cols + '×' + grid.rows + ' characters';
  }

  function copyPNG() {
    if (!state.source && !state.videoOn) return;
    render(true);
    el.canvas.toBlob(function (blob) {
      if (!blob) return;
      if (!navigator.clipboard || !window.ClipboardItem) {
        el.statStatus.textContent = 'This browser cannot copy images';
        return;
      }
      navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]).then(function () {
        el.statStatus.textContent = 'PNG copied to the clipboard';
      }).catch(function () {
        el.statStatus.textContent = 'The browser blocked the clipboard write';
      });
    }, 'image/png');
  }

  // A one-button surprise: a complete recipe, tones and glitches included.
  const RANDOM_TONES = ['none', 'none', 'sepia', 'blueprint', 'amber', 'cyanotype', 'forest', 'rose', 'thermal', 'gold'];

  function randomize() {
    const algo = D.ALGORITHMS[(Math.random() * D.ALGORITHMS.length) | 0];
    const palette = D.PALETTES[(Math.random() * D.PALETTES.length) | 0];
    const next = {
      algorithm: algo.id,
      palette: palette.id,
      pixelSize: 1 + ((Math.random() * 4) | 0),
      ditherStrength: 80 + ((Math.random() * 60) | 0),
      serpentine: Math.random() < 0.4,
      toneMap: RANDOM_TONES[(Math.random() * RANDOM_TONES.length) | 0],
      seed: (Math.random() * 0xffffffff) >>> 0,
      adjustments: {
        contrast: 1 + Math.random() * 0.3,
        saturation: 0.85 + Math.random() * 0.6,
        gamma: 0.9 + Math.random() * 0.25,
      },
      glitches: [],
      glow: { radius: 0, intensity: 0 },
    };
    const pool = D.GLITCHES.slice();
    const count = (Math.random() * 3) | 0;
    for (let i = 0; i < count && pool.length; i++) {
      const pick = pool.splice((Math.random() * pool.length) | 0, 1)[0];
      next.glitches.push({
        id: pick.id,
        amount: 20 + ((Math.random() * 55) | 0),
        mode: pick.modes ? pick.modes[(Math.random() * pick.modes.length) | 0].id : undefined,
      });
    }
    if (Math.random() < 0.3) {
      next.glow = { radius: 1 + ((Math.random() * 3) | 0), intensity: 20 + ((Math.random() * 40) | 0) };
    }
    applySettings(next, 'Random: ' + algo.name + ' · ' + palette.name);
  }

  /* ------------------------------------------------------------------ */
  /* wiring                                                             */
  /* ------------------------------------------------------------------ */

  function init() {
    buildAlgorithmSelect();
    buildPaletteSelect();
    buildToneMapSelect();
    buildTextSelect();
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
      syncScreenRows();
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

    el.serpentine.addEventListener('change', function () {
      state.settings.serpentine = el.serpentine.checked;
      render(true);
    });

    el.toneMap.addEventListener('change', function () {
      state.settings.toneMap = el.toneMap.value;
      el.inkCustom.hidden = state.settings.toneMap !== 'custom';
      render(true);
    });

    [el.toneInk, el.tonePaper].forEach(function (input) {
      input.addEventListener('input', function () {
        state.settings.toneInk = hexToRgb(el.toneInk.value);
        state.settings.tonePaper = hexToRgb(el.tonePaper.value);
        schedulePreview();
      });
      input.addEventListener('change', function () {
        state.settings.toneInk = hexToRgb(el.toneInk.value);
        state.settings.tonePaper = hexToRgb(el.tonePaper.value);
        render(true);
      });
    });

    el.alphaMode.addEventListener('change', function () {
      state.settings.alphaMode = el.alphaMode.value;
      el.canvas.classList.toggle('alpha-on', state.settings.alphaMode !== 'matte');
      render(true);
    });

    el.textMode.addEventListener('change', function () {
      text.on = el.textMode.checked;
      syncTextUI();
      render(true);
    });
    el.textCharset.addEventListener('change', function () {
      text.ramp = el.textCharset.value;
      render(true);
    });
    el.textSize.addEventListener('input', function () {
      text.size = parseInt(el.textSize.value, 10) || 10;
      el.textSizeValue.textContent = String(text.size);
      schedulePreview();
    });
    el.textSize.addEventListener('change', function () {
      text.size = parseInt(el.textSize.value, 10) || 10;
      render(true);
    });
    el.exportTxt.addEventListener('click', exportTXT);
    el.copy.addEventListener('click', copyPNG);
    el.random.addEventListener('click', randomize);

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
      else if (e.key === 'r' || e.key === 'R') randomize();
      else if (e.key === '+' || e.key === '=') zoomStep(1);
      else if (e.key === '-' || e.key === '_') zoomStep(-1);
      else if (e.key === '0') { state.zoom = null; applyZoom(); }
    });
    window.addEventListener('keyup', function (e) {
      if (e.key === 'c' || e.key === 'C') setCompare(false);
    });

    window.addEventListener('resize', applyZoom);

    syncUI();
    bindVideo();
    loadDemo();
  }

  /* ------------------------------------------------------------------ */
  /* video mode                                                         */
  /* ------------------------------------------------------------------ */

  // video.js owns the source, the clock and the recorder; this shell decides
  // what a frame *means*. The temporal choice is the interesting part:
  //   freeze  — one screen for the whole clip (the honest, calm look)
  //   shimmer — a fresh seed per frame, so stochastic screens boil and the
  //             tone stays put: a still idea of the palette's mixes
  //   crawl   — the screen itself slides by a pixel per frame (tile screens)
  const video = (window.DitherVideo && window.DitherVideo.create)
    ? window.DitherVideo.create({
      onFrame: renderVideoFrame,
      onStatus: videoStatus,
      getCanvas: function () { return el.canvas; },
    })
    : null;
  const videoState = { temporal: 'shimmer', ready: false };

  function videoStatus(text) {
    el.videoNote.textContent = text;
  }

  // The recipe travels per frame, so sliders and presets keep working during
  // playback; only the temporal rule varies frame to frame. That rule lives in
  // the core (D.temporalSettings), where node test.js can cover it.
  function videoSettingsFor(frameIndex) {
    const s = state.settings;
    const next = {};
    for (const key in s) next[key] = s[key];
    next.adjustments = {};
    for (const key in s.adjustments) next.adjustments[key] = s.adjustments[key];
    next.screen = { smooth: s.screen.smooth, flow: s.screen.flow, streak: s.screen.streak };
    next.glow = { radius: s.glow.radius, intensity: s.glow.intensity };
    next.glitches = deriveGlitches();
    return D.temporalSettings(next, frameIndex, videoState.temporal);
  }

  // The status bar during video mode: frame, rate, drops, and a REC flag. The
  // render loop calls it every frame, and the transport controls call it too so
  // stopping a recording does not leave a stale "REC" behind.
  function videoStatusLine() {
    if (!video) return;
    const s = video.stats();
    el.statFile.textContent = 'video frame ' + Math.max(0, s.frame - 1);
    el.statStatus.textContent = 'Video ' + s.fps + ' fps' +
      (s.dropped ? ' · ' + s.dropped + ' dropped' : '') +
      (s.recording ? ' · REC' : '');
  }

  function renderVideoFrame(imageData, frameIndex) {
    const settings = videoSettingsFor(frameIndex);
    const t0 = performance.now();
    const res = D.process(imageData, settings);
    state.result = res;
    if (el.canvas.width !== res.width || el.canvas.height !== res.height) {
      el.canvas.width = res.width;
      el.canvas.height = res.height;
      applyZoom();
    }
    el.canvas.classList.toggle('alpha-on', settings.alphaMode !== 'matte');
    if (!(text.on && drawTextResult(res))) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.putImageData(toImageData(res), 0, 0);
    }
    updateStats(res, true);
    videoStatusLine();
    return performance.now() - t0;
  }

  function videoShowRows(show) {
    el.videoFpsRow.hidden = !show;
    el.videoTemporalRow.hidden = !show;
    el.videoRecordRow.hidden = !show;
    el.videoToggle.disabled = !show;
  }

  async function startVideo(kind, file) {
    if (!video) {
      videoStatus('Video mode needs video.js, which did not load.');
      return false;
    }
    try {
      if (kind === 'webcam') await video.webcam();
      else await video.load(file);
    } catch (err) {
      videoStatus('Video could not start: ' + ((err && err.message) || 'unknown error'));
      return false;
    }
    videoState.ready = true;
    state.videoOn = true;
    state.name = kind === 'webcam' ? 'webcam' : 'video';
    state.zoom = null;
    videoShowRows(true);
    el.videoToggle.textContent = 'Play';
    video.setFps(el.videoFps.value);
    videoState.temporal = el.videoTemporal.value;
    video.tickOnce();          // paint frame zero right away, even while paused
    applyZoom();
    return true;
  }

  function startSynthetic(width, height) {
    if (!video) return null;
    video.synthetic(width, height);
    videoState.ready = true;
    state.videoOn = true;
    state.name = 'video';
    state.zoom = null;
    videoShowRows(true);
    el.videoToggle.textContent = 'Play';
    video.setFps(el.videoFps.value);
    videoState.temporal = el.videoTemporal.value;
    return video.tickOnce();
  }

  function videoStop() {
    if (!state.videoOn) return;
    state.videoOn = false;
    videoState.ready = false;
    if (video) {
      if (video.recording) video.stopRecording();
      video.release();
    }
    el.videoToggle.textContent = 'Play';
    videoShowRows(false);
    videoStatus('Pick a source above to run video through the press.');
  }

  function bindVideo() {
    if (!video) {
      videoStatus('Video mode needs video.js, which did not load.');
      return;
    }
    video.setFps(el.videoFps.value);
    el.videoOpen.addEventListener('click', function () { el.videoFile.click(); });
    el.videoFile.addEventListener('change', function () {
      const file = el.videoFile.files && el.videoFile.files[0];
      if (file) startVideo('file', file);
      el.videoFile.value = '';
    });
    el.videoWebcam.addEventListener('click', function () {
      videoStatus('Asking for the webcam…');
      startVideo('webcam');
    });
    el.videoToggle.addEventListener('click', function () {
      const playing = video.toggle();
      el.videoToggle.textContent = playing ? 'Pause' : 'Play';
      videoStatusLine();
    });
    el.videoFps.addEventListener('input', function () {
      el.videoFpsValue.textContent = String(video.setFps(el.videoFps.value));
    });
    el.videoTemporal.addEventListener('change', function () {
      videoState.temporal = el.videoTemporal.value;
      videoStatus(videoState.temporal === 'freeze'
        ? 'Frozen: one screen for the whole clip.'
        : videoState.temporal === 'crawl'
          ? 'Crawl: tile screens slide a pixel per frame.'
          : 'Shimmer: a fresh screen every frame.');
    });
    el.videoRecord.addEventListener('click', function () {
      if (video.recording) {
        el.videoRecord.disabled = true;
        video.stopRecording().then(function (out) {
          el.videoRecord.disabled = false;
          el.videoRecord.textContent = '● Record WebM';
          if (out && out.blob && out.blob.size) {
            download(out.blob, 'dither-video.webm');
            videoStatus('Saved dither-video.webm · ' + out.seconds + ' s · ' +
              Math.round(out.blob.size / 1024) + ' KB');
          } else {
            videoStatus('The recording came out empty.');
          }
          videoStatusLine();
        });
        return;
      }
      if (video.startRecording()) {
        el.videoRecord.textContent = '■ Stop & save';
      } else {
        videoStatus('Recording is not supported in this browser.');
      }
    });
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
        ditherStrength: state.settings.ditherStrength,
        serpentine: state.settings.serpentine,
        toneMap: state.settings.toneMap,
        alphaMode: state.settings.alphaMode,
        textMode: text.on,
        colors: state.result ? state.result.colors : null,
        ms: state.result ? Math.round(state.result.ms) : null,
        zoom: el.statZoom.textContent,
        glitches: deriveGlitches().map(function (g) {
          return g.id + ':' + g.amount + (g.mode ? ':' + g.mode : '');
        }),
        status: el.statStatus.textContent,
      };
    },
    applyPreset: function (id) { applyPreset(id); },
    randomize: randomize,
    exportTxt: exportTXT,
    // Test hook: load a synthetic source (a data URL) without a file dialog.
    loadDataURL: function (url, name) {
      const img = new Image();
      img.onload = function () { loadBitmap(img, name || 'test image'); };
      img.onerror = function () { el.statStatus.textContent = 'That test image did not load'; };
      img.src = url;
    },
    deriveGlitches: deriveGlitches,
    setText: function (on, ramp, size) {
      text.on = !!on;
      if (ramp) text.ramp = ramp;
      if (size) text.size = size;
      syncTextUI();
      render(true);
    },
    textGrid: function () {
      if (!state.result) return null;
      const grid = textGrid(state.result);
      return { cols: grid.cols, rows: grid.rows, cell: grid.cell, lines: grid.lines };
    },
    // Drawn alpha values, for checking a dithered or kept matte.
    alphaStats: function () {
      const data = ctx.getImageData(0, 0, el.canvas.width, el.canvas.height).data;
      let min = 255, max = 0;
      const levels = new Set();
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
        if (levels.size < 64) levels.add(data[i]);
      }
      return { min: min, max: max, count: levels.size, levels: Array.from(levels).sort(function (a, b) { return a - b; }) };
    },
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
    // Sampled canvas greys, so a check can measure how much two frames differ.
    canvasSample: function (count) {
      const data = ctx.getImageData(0, 0, el.canvas.width, el.canvas.height).data;
      const total = el.canvas.width * el.canvas.height;
      const n = Math.max(1, count || 64);
      const out = [];
      for (let i = 0; i < n; i++) {
        const p = Math.floor((i + 0.5) * total / n);
        out.push(data[p * 4]);
      }
      return out;
    },
    // The settings a given video frame is dithered with (the temporal rule).
    videoSettings: function (frame) {
      const s = videoSettingsFor(frame);
      return { seed: s.seed, screenShift: s.screenShift, baseSeed: state.settings.seed };
    },
    // A cheap fingerprint of what is on the canvas, for comparing frames.
    canvasHash: function () {
      const data = ctx.getImageData(0, 0, el.canvas.width, el.canvas.height).data;
      let h = 2166136261;
      for (let i = 0; i < data.length; i += 97) h = Math.imul(h ^ data[i], 16777619);
      return h >>> 0;
    },

    // --- video mode (needs video.js; the generated clip needs no file) -----
    videoSynthetic: function (w, h) { return startSynthetic(w, h); },
    videoTick: function (count, atFrame) {
      if (!video) return null;
      let stats = null;
      const n = Math.max(1, count || 1);
      for (let i = 0; i < n; i++) stats = video.tickOnce(atFrame);
      return stats;
    },
    videoPlay: function () {
      if (!video) return false;
      video.play();
      el.videoToggle.textContent = 'Pause';
      return video.playing;
    },
    videoPause: function () {
      if (!video) return false;
      video.pause();
      el.videoToggle.textContent = 'Play';
      return video.playing;
    },
    videoTemporal: function (mode) {
      videoState.temporal = mode;
      el.videoTemporal.value = mode;
      return videoState.temporal;
    },
    videoStop: videoStop,
    videoStats: function () { return video ? video.stats() : null; },
    // Record for `ms` of wall clock and report what came out, without a download.
    videoRecord: function (ms) {
      if (!video || !video.startRecording()) return Promise.resolve(null);
      return new Promise(function (resolve) {
        setTimeout(function () {
          video.stopRecording().then(function (out) {
            el.videoRecord.textContent = '● Record WebM';
            videoStatusLine();
            resolve(out ? { seconds: out.seconds, bytes: out.blob.size, type: out.blob.type } : null);
          });
        }, Math.max(200, ms || 1200));
      });
    },
  };

  init();
})();
