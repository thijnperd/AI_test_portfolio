/**
 * Line Displacement — parallel lines warped by a (smoothed) luminance field.
 *
 * The field is blurred so neighboring lines sweep coherently instead of
 * crossing, keeping a loaded portrait clearly readable. Pure black & white.
 *
 * @module sketches/line-displacement
 */
(function () {
  'use strict';

  /**
   * Field resolution for the generated/loaded luminance field.
   *
   * @type {number}
   */
  const GRID = 256;

  /**
   * Loaded source image field, if any.
   *
   * @type {object|null}
   */
  let imgField = null;

  /**
   * Cached generated field and its key, so regeneration is skipped when the
   * parameters have not changed.
   *
   * @type {object|null}
   */
  let genCache = null;

  /**
   * Key used to decide whether the generated field cache is still valid.
   *
   * @type {string|null}
   */
  let genKey = null;

  /**
   * DOM wrapper for the optional image picker UI, created once per restart.
   *
   * @type {HTMLDivElement|null}
   */
  let pickerWrap = null;

  /**
   * Smoothstep.
   *
   * @param {number} t
   * @returns {number}
   */
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  function fieldFromImage(img) {
    const c = document.createElement('canvas');
    c.width = GRID; c.height = GRID;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, GRID, GRID);
    const ar = img.width / img.height;
    let dw = GRID, dh = GRID, dx = 0, dy = 0;
    if (ar > 1) { dw = GRID * ar; dx = (GRID - dw) / 2; }
    else { dh = GRID / ar; dy = (GRID - dh) / 2; }
    g.drawImage(img, dx, dy, dw, dh);
    const d = g.getImageData(0, 0, GRID, GRID).data;
    const data = new Float32Array(GRID * GRID);
    for (let i = 0; i < GRID * GRID; i++)
      data[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    return { data, w: GRID, h: GRID };
  }

  function generatedField(e) {
    const p = e.params;
    const key = [e.seed, p.fieldScale, p.detail, p.invert].join('|');
    if (genKey === key && genCache) return genCache;
    const data = new Float32Array(GRID * GRID);
    const sc = p.fieldScale;
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const u = x / GRID, v = y / GRID;
      const dx = u - 0.5, dy = (v - 0.5) * 1.15;
      const r = Math.sqrt(dx * dx + dy * dy);
      const fig = smooth(1 - r * 2.0);
      const n = fbm(u * sc * 3 + 12, v * sc * 3 + 34, p.detail);
      let lum = clamp(fig * 0.72 + n * 0.55 - 0.12, 0, 1);
      if (p.invert) lum = 1 - lum;
      data[y * GRID + x] = lum;
    }
    genKey = key; genCache = { data, w: GRID, h: GRID };
    return genCache;
  }

  /* separable box blur — smooths gradients so lines don't tangle */
  function blurField(f, passes) {
    const w = f.w, h = f.h;
    const a = Float32Array.from(f.data);
    if (passes <= 0) return { data: a, w, h };
    const b = new Float32Array(w * h);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const l = a[y * w + Math.max(0, x - 1)], m = a[y * w + x], r = a[y * w + Math.min(w - 1, x + 1)];
        b[y * w + x] = (l + m + r) / 3;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = b[Math.max(0, y - 1) * w + x], m = b[y * w + x], d = b[Math.min(h - 1, y + 1) * w + x];
        a[y * w + x] = (u + m + d) / 3;
      }
    }
    return { data: a, w, h };
  }

  function sampleField(f, u, v) {
    u = clamp(u, 0, 1); v = clamp(v, 0, 1);
    const x = u * (f.w - 1), y = v * (f.h - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(f.w - 1, x0 + 1), y1 = Math.min(f.h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const a = f.data[y0 * f.w + x0], b = f.data[y0 * f.w + x1];
    const c = f.data[y1 * f.w + x0], d = f.data[y1 * f.w + x1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }

  function ensurePicker() {
    const box = document.getElementById('params');
    if (pickerWrap) {
      if (box && pickerWrap.parentNode !== box) box.appendChild(pickerWrap);
      return;
    }
    pickerWrap = document.createElement('div');
    pickerWrap.className = 'param param-file';
    const label = document.createElement('label');
    label.className = 'param-label';
    label.textContent = 'Source image ';
    const hint = document.createElement('span');
    hint.className = 'param-value';
    hint.textContent = imgField ? 'loaded' : 'none (generated)';
    label.appendChild(hint);
    pickerWrap.appendChild(label);
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.className = 'param-input';
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = function () {
        imgField = fieldFromImage(img);
        hint.textContent = file.name;
        Art.restart();
      };
      img.src = URL.createObjectURL(file);
    });
    pickerWrap.appendChild(input);
    const clear = document.createElement('button');
    clear.type = 'button'; clear.textContent = 'Use generated field';
    clear.addEventListener('click', function () {
      imgField = null; hint.textContent = 'none (generated)'; Art.restart();
    });
    pickerWrap.appendChild(clear);
    if (box) box.appendChild(pickerWrap);
  }

  Art.register({
    id: 'line-displacement',
    title: 'Line Displacement',
    animate: false,
    params: {
      lines:      { label: 'Lines',        type: 'range', min: 40,  max: 900, step: 10,   value: 440, integer: true },
      direction:  { label: 'Direction',    type: 'select', value: 'vertical', options: ['vertical', 'horizontal'] },
      amp:        { label: 'Displacement', type: 'range', min: 0,   max: 1,   step: 0.01, value: 0.3 },
      smooth:     { label: 'Smoothing',    type: 'range', min: 0,   max: 8,   step: 1,    value: 3, integer: true },
      contrast:   { label: 'Contrast',     type: 'range', min: 0.3, max: 3,   step: 0.05, value: 1.3 },
      width:      { label: 'Line width',   type: 'range', min: 0.2, max: 3,   step: 0.1,  value: 0.7 },
      step:       { label: 'Sample step',  type: 'range', min: 1,   max: 6,   step: 1,    value: 2, integer: true },
      jitter:     { label: 'Jitter',       type: 'range', min: 0,   max: 0.1, step: 0.002,value: 0.004 },
      jitterScale:{ label: 'Jitter freq',  type: 'range', min: 1,   max: 40,  step: 1,    value: 18, integer: true },
      fieldScale: { label: 'Field scale',  type: 'range', min: 0.5, max: 8,   step: 0.1,  value: 2.5 },
      detail:     { label: 'Field detail', type: 'range', min: 1,   max: 6,   step: 1,    value: 4, integer: true },
      invert:     { label: 'Invert field', type: 'checkbox', value: false },
      palette:    { label: 'Palette', type: 'select', value: 'monochrome',
        options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'] },
      blackWhite: { label: 'Black & white', type: 'checkbox', value: true },
      dark:       { label: 'Light ink', type: 'checkbox', value: true }
    },

    setup(e) {
      ensurePicker();
      const raw = imgField || generatedField(e);
      e.state = {
        field: blurField(raw, e.params.smooth),
        pal: makePalette(e.params.palette)
      };
    },

    draw(e) {
      const p = e.params, st = e.state, ctx = e.ctx;
      const bg = p.dark ? '#000000' : '#ffffff';
      ctx.fillStyle = bg;

      const field = st.field;
      const vertical = p.direction === 'vertical';
      const n = p.lines;
      const along = vertical ? e.h : e.w;
      const across = vertical ? e.w : e.h;
      const ampPx = p.amp * across;
      const jitPx = p.jitter * across;
      const steps = Math.max(2, Math.round(along / p.step));
      const contrast = p.contrast;

      ctx.lineWidth = p.width;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';

      for (let li = 0; li < n; li++) {
        const base = (li + 0.5) / n;
        const basePx = base * across;
        if (p.blackWhite) {
          ctx.strokeStyle = colorMono(p.dark);
        } else {
          const cl = clamp((sampleField(field, vertical ? base : 0.5, vertical ? 0.5 : base) - 0.5) * contrast + 0.5, 0, 1);
          ctx.strokeStyle = colorCss(st.pal[Math.min(st.pal.length - 1, Math.floor(cl * st.pal.length))], 0.9);
        }
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const lum = vertical ? sampleField(field, base, u) : sampleField(field, u, base);
          const disp = (clamp((lum - 0.5) * contrast + 0.5, 0, 1) - 0.5) * ampPx;
          const j = (noise(vertical ? base * p.jitterScale : u * p.jitterScale,
                           vertical ? u * p.jitterScale : base * p.jitterScale) - 0.5) * jitPx;
          let X, Y;
          if (vertical) { X = basePx + disp + j; Y = u * e.h; }
          else { Y = basePx + disp + j; X = u * e.w; }
          if (s === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
    }
  });
})();
