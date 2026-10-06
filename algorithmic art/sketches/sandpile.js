/**
 * Sandpile — the Abelian sandpile (Bak–Tang–Wiesenfeld) as a coloured print.
 *
 * Grains are dropped onto a lattice of integer heights. Whenever a cell holds
 * four or more grains it topples: it loses four and hands one to each of its
 * four neighbours. Grains that fall off the open boundary leave the system, so
 * the avalanche always terminates, and the cells that toppled most form the
 * iconic self-similar pattern. Toppling is *Abelian* — the final stable
 * configuration does not depend on the order of topplings — so this sketch
 * relaxes each cell in as large a batch as possible (`t = height >> 2`) rather
 * than one grain at a time, which keeps large grain counts responsive.
 *
 * The image is rendered once (static, `animate: false`) through an offscreen
 * `ImageData` byte buffer scaled onto the canvas, so export is exact and the
 * pixel grid stays crisp. Colour is a log-scaled ramp over the per-cell
 * toppling count (or the final height), interpolated from a named palette.
 * Untouched cells are left transparent unless "Paint ground" is on.
 *
 * The model is the Bak–Tang–Wiesenfeld sandpile
 * (https://en.wikipedia.org/wiki/Abelian_sandpile_model); this is an original
 * implementation in the AlgoArt framework.
 *
 * Cost note: relaxing the pile costs roughly O(grains^2) total topplings, so
 * the defaults are kept deliberately light (8k grains) to stay instant on a
 * laptop even when a slider is dragged; the `grains` maximum is capped for the
 * same reason. Raise it knowingly.
 *
 * @module sketches/sandpile
 */
(function () {
  'use strict';

  /**
   * Named colour ramps. Each is an ordered list of hex stops from the ground /
   * empty tone (index 0) to the peak tone (last index); the colour lookup
   * table interpolates between them.
   *
   * @type {Object.<string, string[]>}
   */
  const PALETTES = {
    ember: ['#0b0c10', '#2a1420', '#6a1f33', '#b83b2b', '#e8833a', '#ffd98a'],
    aurora: ['#07121a', '#0d2b3a', '#1d6b6b', '#3fa08a', '#8fd6b0', '#eafbe8'],
    abyss: ['#05060d', '#0d1430', '#1e2f6b', '#3f5fb0', '#7fa6e0', '#dbe9ff'],
    neon: ['#0a0a12', '#241046', '#5a1b8a', '#a02bd6', '#ff4fa3', '#ffd0f0'],
    graphite: ['#0e0f13', '#1d212b', '#3a4152', '#6b768f', '#aab4cc', '#eef2fb'],
    sandstone: ['#e9e0cf', '#d8c39a', '#c2945e', '#a05f34', '#6f3b21', '#3a1f12']
  };
  const PALETTE_NAMES = Object.keys(PALETTES);

  /**
   * The toppling threshold: a cell with this many grains is unstable.
   *
   * @type {number}
   */
  const THRESHOLD = 4;

  /**
   * Safety ceiling on relaxation batches.
   *
   * The batching below makes typical piles fast, but a pathological parameter
   * combination must still never freeze the browser. If this many batch
   * operations run, relaxation stops and the (partial) field is painted.
   *
   * @type {number}
   */
  const RELAX_BUDGET = 120000000;

  /**
   * Hash a 32-bit seed into a mulberry32 stream, matching the framework RNG.
   *
   * @param {number} seed
   * @returns {function(): number} A generator returning [0, 1).
   */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Parse a `#rrggbb` string into a three-component byte triple.
   *
   * @param {string} hex
   * @returns {number[]} `[r, g, b]` in 0..255.
   */
  function hexBytes(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /**
   * Build a 256-entry RGB lookup table by interpolating the palette stops.
   *
   * @param {string[]} stops - Ordered hex stops.
   * @returns {Uint8ClampedArray} 256 * 3 bytes.
   */
  function buildLut(stops) {
    const rgb = stops.map(hexBytes);
    const lut = new Uint8ClampedArray(256 * 3);
    const last = rgb.length - 1;
    for (let i = 0; i < 256; i++) {
      const f = (i / 255) * last;
      const k = Math.min(last - 1, Math.floor(f));
      const s = f - k;
      const a = rgb[k];
      const b = rgb[k + 1];
      lut[i * 3] = a[0] + (b[0] - a[0]) * s;
      lut[i * 3 + 1] = a[1] + (b[1] - a[1]) * s;
      lut[i * 3 + 2] = a[2] + (b[2] - a[2]) * s;
    }
    return lut;
  }

  /**
   * Drop `grains` onto the lattice according to the chosen mode.
   *
   * - `centre` piles every grain on the middle cell.
   * - `random` scatters them uniformly (seeded).
   * - `ring` seeds several evenly spaced piles around a circle, with a little
   *   seeded angular jitter so the piles are not mechanically perfect.
   *
   * @param {Int32Array} h - Height field, mutated in place.
   * @param {number} n - Lattice edge length.
   * @param {number} grains - Number of grains to place.
   * @param {string} mode - `centre` | `random` | `ring`.
   * @param {function(): number} rng - Seeded generator from {@link makeRng}.
   * @returns {void}
   */
  function drop(h, n, grains, mode, rng) {
    if (mode === 'random') {
      const cells = n * n;
      for (let g = 0; g < grains; g++) {
        h[Math.min(cells - 1, Math.floor(rng() * cells))]++;
      }
      return;
    }

    if (mode === 'ring') {
      const piles = Math.max(3, Math.round(n / 22));
      const cx = n / 2;
      const cy = n / 2;
      const radius = n * 0.34;
      const per = Math.floor(grains / piles);
      for (let p = 0; p < piles; p++) {
        const angle = (p / piles) * Math.PI * 2 + (rng() - 0.5) * 0.25;
        const px = Math.round(cx + Math.cos(angle) * radius);
        const py = Math.round(cy + Math.sin(angle) * radius);
        if (px < 0 || px >= n || py < 0 || py >= n) continue;
        h[py * n + px] += per;
      }
      const placed = per * piles;
      for (let g = placed; g < grains; g++) { // distribute the remainder
        const px = Math.round(cx + Math.cos(rng() * Math.PI * 2) * radius);
        const py = Math.round(cy + Math.sin(rng() * Math.PI * 2) * radius);
        if (px >= 0 && px < n && py >= 0 && py < n) h[py * n + px]++;
      }
      return;
    }

    // centre (default)
    const c = n >> 1;
    h[c * n + c] += grains;
  }

  /**
   * Relax the lattice to its unique stable configuration.
   *
   * Cells of four or more grains topple in batches (`t = h >> 2`), which is
   * exact because toppling is Abelian. A worklist plus a `queued` flag keeps
   * the queue free of duplicates, and the open boundary dissipates grains so
   * the process always terminates. `tc` accumulates the odometer — how many
   * times each cell toppled — which is what the print is coloured by.
   *
   * @param {Int32Array} h - Height field, mutated to the stable configuration.
   * @param {Uint32Array} tc - Toppling counts, accumulated in place.
   * @param {number} n - Lattice edge length.
   * @returns {{ topplings: number, budgetHit: boolean }} Relaxation stats.
   */
  function relax(h, tc, n) {
    const stack = [];
    const queued = new Uint8Array(n * n);
    for (let i = 0; i < h.length; i++) {
      if (h[i] >= THRESHOLD) { queued[i] = 1; stack.push(i); }
    }

    let batch = 0;
    let topplings = 0;
    while (stack.length && batch < RELAX_BUDGET) {
      const i = stack.pop();
      queued[i] = 0;
      const hi = h[i];
      if (hi < THRESHOLD) continue;

      const t = hi >> 2; // number of topplings folded into this batch
      h[i] = hi - (t << 2);
      tc[i] += t;
      topplings += t;
      batch++;

      const x = i % n;
      const y = (i - x) / n;

      if (x > 0) { const j = i - 1; h[j] += t; if (h[j] >= THRESHOLD && !queued[j]) { queued[j] = 1; stack.push(j); } }
      if (x < n - 1) { const j = i + 1; h[j] += t; if (h[j] >= THRESHOLD && !queued[j]) { queued[j] = 1; stack.push(j); } }
      if (y > 0) { const j = i - n; h[j] += t; if (h[j] >= THRESHOLD && !queued[j]) { queued[j] = 1; stack.push(j); } }
      if (y < n - 1) { const j = i + n; h[j] += t; if (h[j] >= THRESHOLD && !queued[j]) { queued[j] = 1; stack.push(j); } }
    }

    return { topplings: topplings, budgetHit: batch >= RELAX_BUDGET };
  }

  /**
   * Paint the relaxed lattice into an `ImageData` buffer.
   *
   * Each cell's value is normalised (log-scaled toppling count, height, or a
   * blend), shaped by the contrast exponent, and mapped through the palette
   * LUT. Cells the pile never touched stay transparent unless the ground is
   * painted.
   *
   * @param {ImageData} img - Target buffer, sized `n * n`.
   * @param {Int32Array} h - Stable height field.
   * @param {Uint32Array} tc - Toppling counts (the odometer).
   * @param {number[]} lut - 256 * 3 RGB table from {@link buildLut}.
   * @param {string} scheme - `toppling` | `height` | `blend`.
   * @param {number} gamma - Contrast exponent (1 = linear).
   * @param {boolean} ground - Paint untouched cells with the ground tone.
   * @returns {void}
   */
  function paint(img, h, tc, lut, scheme, gamma, ground) {
    const px = img.data;
    let maxTc = 0;
    for (let i = 0; i < tc.length; i++) if (tc[i] > maxTc) maxTc = tc[i];
    const logMax = Math.log1p(maxTc) || 1;
    const inv = 1 / gamma;

    for (let i = 0, p = 0; i < h.length; i++, p += 4) {
      const t = tc[i];
      let v = 0;
      if (scheme === 'height') {
        v = h[i] / (THRESHOLD - 1);
      } else if (scheme === 'blend') {
        v = 0.62 * (Math.log1p(t) / logMax) + 0.38 * (h[i] / (THRESHOLD - 1));
      } else {
        v = Math.log1p(t) / logMax;
      }
      if (v < 0) v = 0;
      else if (v > 1) v = 1;
      if (inv !== 1) v = Math.pow(v, inv);

      const idx = (v * 255 + 0.5) | 0;
      const o = idx * 3;
      px[p] = lut[o];
      px[p + 1] = lut[o + 1];
      px[p + 2] = lut[o + 2];
      px[p + 3] = (ground || v > 0) ? 255 : 0;
    }
  }

  /* ---------------- registration ---------------- */
  Art.register({
    id: 'sandpile',
    title: 'Sandpile',
    animate: false,

    params: {
      grains: { label: 'Grains', type: 'range', min: 4000, max: 30000, step: 2000, value: 8000, integer: true },
      mode: { label: 'Drop', type: 'select', value: 'centre', options: ['centre', 'random', 'ring'] },
      resolution: { label: 'Resolution', type: 'range', min: 120, max: 400, step: 20, value: 180, integer: true },
      scheme: { label: 'Colour by', type: 'select', value: 'toppling', options: ['toppling', 'height', 'blend'] },
      gamma: { label: 'Contrast', type: 'range', min: 0.3, max: 3, step: 0.05, value: 1 },
      palette: { label: 'Palette', type: 'select', value: 'ember', options: PALETTE_NAMES },
      ground: { label: 'Paint ground', type: 'checkbox', value: false }
    },

    /**
     * Relax the sandpile once and pre-render it into an offscreen canvas.
     *
     * @param {object} e - Sketch environment from the AlgoArt engine.
     * @param {number} e.w - Logical canvas width in CSS pixels.
     * @param {object} e.params - Current parameter values.
     * @param {number} e.seed - Current seed.
     * @returns {void}
     */
    setup(e) {
      const p = e.params;
      const n = Math.max(16, Math.round(p.resolution));
      const rng = makeRng(e.seed);

      const h = new Int32Array(n * n);
      const tc = new Uint32Array(n * n);
      drop(h, n, Math.max(1, Math.round(p.grains)), p.mode, rng);
      const stats = relax(h, tc, n);

      const lut = buildLut(PALETTES[p.palette] || PALETTES.ember);

      const off = document.createElement('canvas');
      off.width = n;
      off.height = n;
      const octx = off.getContext('2d');
      const img = octx.createImageData(n, n);
      paint(img, h, tc, lut, p.scheme, Math.max(0.05, p.gamma), p.ground);

      e.state = { n: n, off: off, img: img, octx: octx, stats: stats };
    },

    /**
     * Blit the pre-rendered sandpile, scaled to the canvas with smoothing off.
     *
     * @param {object} e - Sketch environment from the AlgoArt engine.
     * @param {CanvasRenderingContext2D} e.ctx - Scaled 2D drawing context.
     * @param {number} e.w - Logical canvas width in CSS pixels.
     * @param {number} e.h - Logical canvas height in CSS pixels.
     * @param {object} e.state - State initialized by setup for this restart.
     * @returns {void}
     */
    draw(e) {
      const st = e.state;
      st.octx.putImageData(st.img, 0, 0);
      e.ctx.imageSmoothingEnabled = false;
      e.ctx.clearRect(0, 0, e.w, e.h);
      e.ctx.drawImage(st.off, 0, 0, st.n, st.n, 0, 0, e.w, e.h);
    }
  });
})();
