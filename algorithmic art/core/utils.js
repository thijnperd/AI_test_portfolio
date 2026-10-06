/**
 * AlgoArt · core utilities
 *
 * Sealed helpers for the whole framework: deterministic math, a seeded RNG,
 * value noise + fractal Brownian motion, a small easing table, HSL/hex color
 * conversion, deterministic palette generation, and a few generic utilities.
 *
 * This file is a plain immediately-invoked function expression, not an ES
 * module. That is intentional: it is the only file that must run from a
 * `file://` URL with no bundler, so `index.html` can double-click-run.
 *
 * What it exposes depends on who asks for it:
 * - **Sketches** get bare globals (`rand`, `noise`, `fbm`, `hsl`, `colorCss`,
 *   `makePalette`, ...).
 * - **The framework** gets a single `Art.*` namespace (`Art.RNG`,
 *   `Art.Noise`, `Art.Color`, ...).
 * - **Tests** inspect `window.Art.RNG` and `window.Art.Noise`.
 *
 * @module utils
 */
(function (global) {
  'use strict';

  /**
   * Mathematical helpers.
 *
   * These are the small functions every sketch reaches for first: wrapping
   * trigonometry constant, clamping, linear interpolation, range mapping,
   * Euclidean distance, smoothstep, and rounding to a step grid.
   *
   * @inner
   * @fileoverview Deterministic math primitives shared by sketches and the
   * engine.
   */
  const TAU = Math.PI * 2;

  /**
   * Clamp a value into an inclusive range.
   *
   * @param {number} v
   * @param {number} a - lower bound.
   * @param {number} b - upper bound.
   * @returns {number}
   */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /**
   * Linear interpolation between two endpoints.
   *
   * @param {number} a
   * @param {number} b
   * @param {number} t - typically in [0,1], but unclamped.
   * @returns {number}
   */
  function lerp(a, b, t) { return a + (b - a) * t; }

  /**
   * Inverted lerp: how far `v` sits between `a` and `b` as a 0..1 fraction.
   *
   * @param {number} a
   * @param {number} b
   * @param {number} v
   * @returns {number}
   */
  function inv(a, b, v) { return b - a ? (v - a) / (b - a) : 0; }

  /**
   * Remap a value from one range to another, with optional clipping.
   *
   * @param {number} v
   * @param {number} a
   * @param {number} b
   * @param {number} c
   * @param {number} d
   * @param {boolean} [clip] - when true, clip the result into [c,d] (or [d,c]).
   * @returns {number}
   */
  function map(v, a, b, c, d, clip) {
    const r = c + (d - c) * inv(a, b, v);
    if (!clip) return r;
    return d > c ? clamp(r, c, d) : clamp(r, d, c);
  }
  function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
  function smoothstep(t) { return t * t * (3 - 2 * t);  }

  /**
   * Round a value to the nearest multiple of `step`.
   *
   * @param {number} v
   * @param {number} step
   * @returns {number}
   */
  function roundTo(v, step) { return step > 0 ? Math.round(v / step) * step : v; }

  /**
   * Seeded RNG (mulberry32).
   *
   * Deterministic, fast, and good enough for visual variation. The same
   * signed 32-bit integer seed always produces the same sequence, which is why
   * the whole framework can promise reproducible renders.
   *
   * Public surface:
   * - `seed(s)` reseeds and returns the RNG for chaining.
   * - `unit()` → [0, 1).
   * - `range(a [, b])` → `[0, a)` or `[a, b)`.
   * - `int(a [, b])` → integer in `[a, b]`.
   * - `pick(arr)`, `chance(p)`, `shuffle(arr)`, `gauss(mu, sigma)`.
   *
   * @inner
   * @type {{ _s: number, seed: function, unit: function, range: function, int: function, pick: function, chance: function, shuffle: function, gauss: function }}
   */
  const RNG = {
    _s: 0x9e3779b9,
    /**
     * Seed the RNG with a 32-bit integer.
     *
     * @param {number} s
     * @returns {object} this RNG, for chaining.
     */
    seed(s) { this._s = (s >>> 0) || 0x9e3779b9; return this; },
    /**
     * Random float in [0, 1).
     *
     * @returns {number}
     */
    unit() {
      let t = (this._s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /**
     * Random range, matching the sketch-friendly `rand(...)` surface.
     *
     * - `range()` → `[0, 1)`.
     * - `range(max)` → `[0, max)`.
     * - `range(min, max)` → `[min, max)`.
     *
     * @param {number} [a]
     * @param {number} [b]
     * @returns {number}
     */
    range(a, b) {
      if (a === undefined) return this.unit();
      if (b === undefined) return this.unit() * a;
      return a + this.unit() * (b - a);
    },
    /**
     * Random integer in `[a, b]` (or `[0, a]` when only one argument).
     *
     * @param {number} a
     * @param {number} [b]
     * @returns {number}
     */
    int(a, b) {
      if (b === undefined) { b = a; a = 0; }
      return Math.floor(this.range(a, b + 1));
    },
    /**
     * Random element from an array.
     *
     * @param {Array} arr
     * @returns {*}
     */
    pick(arr) { return arr[Math.min(arr.length - 1, Math.floor(this.unit() * arr.length))]; },
    /**
     * True with probability `p`.
     *
     * @param {number} p - probability in [0, 1].
     * @returns {boolean}
     */
    chance(p) { return this.unit() < p; },
    /**
     * In-place Fisher-Yates shuffle.
     *
     * @param {Array} arr
     * @returns {Array} the same array, shuffled.
     */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.unit() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    },
    /**
     * Gaussian sample via Box-Muller.
     *
     * @param {number} [mu]
     * @param {number} [sigma]
     * @returns {number}
     */
    gauss(mu, sigma) {
      mu = mu || 0; sigma = sigma === undefined ? 1 : sigma;
      let u = 0, v = 0;
      while (u === 0) u = this.unit();
      while (v === 0) v = this.unit();
      return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
    }
  };

  /**
   * Value noise + fractal Brownian motion.
   *
   * `Noise` is the deterministic field the flow sketches sample. It is a
   * small, tiled, hash-based value noise with a smoothstep interpolant and an
   * optional fBM aggregate. The shared seed is what makes two runs with the
   * same integer produce the same field.
   *
   * Public surface:
   * - `seed(s)`.
   * - `value2(x, y)` → [0, 1).
   * - `fbm(x, y, octaves, lac, gain)`.
   *
   * @inner
   * @type {{ _s: number, seed: function, _hash: function, value2: function, fbm: function }}
   */
  const Noise = {
    _s: 1,
    /**
     * Seed the noise field with a 32-bit integer.
     *
     * @param {number} s
     * @returns {void}
     */
    seed(s) { this._s = (s >>> 0) || 1; },
    /**
     * Internal hash for the noise field.
     *
     * Not part of the public surface; sketches should call `noise()` or
     * `fbm()`.
     *
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    _hash(x, y) {
      let n = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ this._s;
      n = Math.imul(n ^ (n >>> 15), 0x2545f491);
      return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
    },
    /**
     * 2D value noise at `(x, y)`.
     *
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    value2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const u = smoothstep(x - xi), v = smoothstep(y - yi);
      const a = this._hash(xi, yi);
      const b = this._hash(xi + 1, yi);
      const c = this._hash(xi, yi + 1);
      const d = this._hash(xi + 1, yi + 1);
      return lerp(lerp(a, b, u), lerp(c, d, u), v);
    },
    /**
     * Fractal Brownian motion.
     *
     * Layers `value2` at increasing frequency and decreasing amplitude.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} [octaves]
     * @param {number} [lac]
     * @param {number} [gain]
     * @returns {number}
     */
    fbm(x, y, octaves, lac, gain) {
      octaves = octaves || 4;
      lac = lac || 2;
      gain = gain || 0.5;
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * this.value2(x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lac;
      }
      return sum / (norm || 1);
    }
  };

  /**
   * Easing functions.
   *
   * Small lookup of common tween curves. Used mainly by sketches that want a
   * deliberate motion profile; the framework itself does not depend on them.
   *
   * @inner
   * @type {object}
   */
  const easings = {
    linear: t => t,
    inQuad: t => t * t,
    outQuad: t => t * (2 - t),
    inOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    inCubic: t => t * t * t,
    outCubic: t => (--t) * t * t + 1,
    inOutCubic: t => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    outElastic: t => (t === 0 || t === 1) ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1,
    outBounce: t => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    }
  };

  /**
   * Color utilities.
   *
   * HSL/hex conversion, alpha-aware color formatting, a two-tone monochrome
   * helper, and deterministic palette generation. Palettes use the seeded RNG,
   * so the same seed gives the same palette — important for reproducibility.
   *
   * @inner
   * @fileoverview Color conversion and deterministic palette generation.
   */
  /**
   * Format an HSL color as CSS.
   *
   * Hue is normalized into [0, 360). Saturation and lightness are clamped to
   * [0, 100]. When `a` is omitted or >= 1, the result is `hsl(...)`; otherwise
   * it is `hsla(...)`.
   *
   * @param {number} h
   * @param {number} s
   * @param {number} l
   * @param {number} [a]
   * @returns {string}
   */
  function hsl(h, s, l, a) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100);
    l = clamp(l, 0, 100);
    return a === undefined || a >= 1
      ? 'hsl(' + h.toFixed(1) + ',' + s.toFixed(1) + '%,' + l.toFixed(1) + '%)'
      : 'hsla(' + h.toFixed(1) + ',' + s.toFixed(1) + '%,' + l.toFixed(1) + '%,' + a.toFixed(3) + ')';
  }

  /**
   * Parse a hex color into RGB.
   *
   * @param {string} hex
   * @returns {{ r: number, g: number, b: number }}
   */
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return { r: 0, g: 0, b: 0 };
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /**
   * Convert hex to HSL.
   *
   * @param {string} hex
   * @returns {{ h: number, s: number, l: number }}
   */
  function hexToHsl(hex) {
    let { r, g, b } = hexToRgb(hex);
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  /**
   * Convert HSL to hex.
   *
   * @param {number} h
   * @param {number} s
   * @param {number} l
   * @returns {string}
   */
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const to = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + to(r) + to(g) + to(b);
  }

  /**
   * Alpha-aware CSS color.
   *
   * Accepts either a hex string or an `{h, s, l}` object. When `a` is omitted
   * or >= 1, the hex path returns the original string unchanged; otherwise it
   * becomes an `rgba(...)` string.
   *
   * @param {string|object} c
   * @param {number} [a]
   * @returns {string}
   */
  function color(c, a) {
    if (typeof c === 'string') {
      if (a === undefined || a >= 1) return c;
      const { r, g, b } = hexToRgb(c);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    return hsl(c.h, c.s, c.l, a);
  }

  /**
   * Two-tone monochrome color.
   *
   * Used by the `blackWhite` sketches. On a dark ground the marks are pure
   * white; on a light ground they are pure black. With alpha, the result is
   * `rgba(...)` of that single channel.
   *
   * @param {boolean} dark
   * @param {number} [alpha]
   * @returns {string}
   */
  function mono(dark, alpha) {
    const v = dark ? 255 : 0;
    if (alpha === undefined || alpha >= 1) return dark ? '#ffffff' : '#000000';
    return 'rgba(' + v + ',' + v + ',' + v + ',' + alpha + ')';
  }

  /**
   * Supported palette generation modes.
   *
   * @type {string[]}
   */
  const PALETTE_MODES = ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'];

  /**
   * Deterministic harmonious palette.
   *
   * Returns an array of 5 `{h, s, l}` colors built from a base hue chosen by
   * the seeded RNG, with hue jitter and per-color saturation/lightness
   * variation. The palette therefore depends on the RNG state at call time,
   * which keeps palette-driven sketches reproducible.
   *
   * @param {string} mode - one of `PALETTE_MODES`.
   * @returns {{ h: number, s: number, l: number }[]}
   */
  function makePalette(mode) {
    const h0 = RNG.range(0, 360);
    const s = RNG.range(55, 92);
    let hues;
    const jitter = () => RNG.range(-8, 8);
    switch (mode) {
      case 'complementary': hues = [0, 14, 180, 194, 0].map(d => h0 + d + jitter()); break;
      case 'triadic': hues = [0, 120, 240, 120, 240].map(d => h0 + d + jitter()); break;
      case 'split': hues = [0, 150, 210, 150, 330].map(d => h0 + d + jitter()); break;
      case 'monochrome': hues = [h0, h0, h0, h0, h0]; break;
      case 'random': hues = Array.from({ length: 5 }, () => RNG.range(0, 360)); break;
      default: hues = [-34, -17, 0, 17, 34].map(d => h0 + d + jitter()); break;
    }
    const lights = [72, 60, 48, 66, 40];
    return hues.map((h, i) => ({
      h: ((h % 360) + 360) % 360,
      s: clamp(s + RNG.range(-14, 14), 22, 96),
      l: clamp(lights[i] + RNG.range(-7, 7), 12, 88)
    }));
  }

  /**
   * Public exports.
   *
   * The framework is not an ES module. Instead, everything is attached either
   * to the shared `Art.*` namespace or to the global object for convenient
   * sketch authoring. This split is why sketch files can call `rand(...)` and
   * `noise(...)` directly while the engine can call `Art.RNG.seed(...)`.
   *
   * @inner
   */
  const Art = global.Art || (global.Art = {});
  Object.assign(Art, { TAU, clamp, lerp, map, inv, dist, smoothstep, roundTo });
  Art.RNG = RNG;
  Art.Noise = Noise;
  Art.Color = { hsl, hexToRgb, hexToHsl, hslToHex, color, mono, makePalette, PALETTE_MODES };
  Art.easings = easings;

  /**
   * Bare globals for sketch files.
   *
   * Mirrors the `Art.*` surface but in a shape sketches find convenient. These
   * names are intentionally short because sketches call them constantly.
   *
   * @type {{ rand: function, randInt: function, pick: function, chance: function, gauss: function, noise: function, fbm: function, hsl: function, colorCss: function, colorMono: function, makePalette: function, hexToHsl: function, hslToHex: function }}
   */
  Object.assign(global, {
    TAU, clamp, lerp, map, dist, easings,
    RNG, Noise,
    rand: RNG.range.bind(RNG),
    randInt: RNG.int.bind(RNG),
    pick: RNG.pick.bind(RNG),
    chance: RNG.chance.bind(RNG),
    gauss: RNG.gauss.bind(RNG),
    noise: Noise.value2.bind(Noise),
    fbm: Noise.fbm.bind(Noise),
    hsl, colorCss: color, colorMono: mono, makePalette, hexToHsl, hslToHex
  });
})(window);
