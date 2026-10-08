/* dither.js — the DOM-free dithering core for Dither Studio.
 *
 * World: "instrument panel, print shop" — the canvas is a proof sheet; this
 * file is the press. Everything here runs in the browser (as `DitherLib`) and
 * in Node (`module.exports`) so the rules can be tested with `node test.js`.
 *
 * The pipeline, in order:
 *
 *   RGBA source ──▶ adjustments ──▶ pixel-size downscale ──▶ dither
 *        ──▶ glitch stack ──▶ glow ──▶ NEAREST upscale ──▶ RGBA result
 *
 * Determinism is a contract: every random decision flows through
 * makeRng(seed). The generated masks (void-and-cluster, blue noise) use fixed
 * internal seeds, so the same settings always produce the same pixels.
 *
 * Dithering rules (mono path), with `v` the luma after the threshold bias:
 *   ordered / noise / blue-noise:  white when  v > mask        (mask 0..255)
 *   threshold:                     white when  v > 128
 *   error diffusion:               quantize to 0 / 255 at 128, diffuse the error
 *
 * Palette path: snap each pixel to the nearest palette colour by squared RGB
 * distance (through a 32³ quantised lookup table so a slider drag stays
 * responsive), then either jitter the pixel by the mask before snapping
 * (ordered/stochastic) or diffuse the RGB error (error-diffusion kernels).
 * The distance metric matches the space the error travels in on purpose:
 * that is what makes a flat patch dither to its own average instead of
 * collapsing to the single nearest colour.
 */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* seeded randomness                                                  */
  /* ------------------------------------------------------------------ */

  // mulberry32 — small, fast, and reproducible from a 32-bit seed.
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Deterministic integer hash, used for per-tile blue-noise offsets.
  function hash32(x) {
    x = (x ^ 61) ^ (x >>> 16);
    x = x + (x << 3);
    x = x ^ (x >>> 4);
    x = Math.imul(x, 0x27d4eb2d);
    x = x ^ (x >>> 15);
    return x >>> 0;
  }

  /* ------------------------------------------------------------------ */
  /* colour                                                             */
  /* ------------------------------------------------------------------ */

  function luma(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function clamp255(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }

  /* ------------------------------------------------------------------ */
  /* ordered-dither matrices                                            */
  /* ------------------------------------------------------------------ */

  // Bayer ranks via the recursive construction; values are 0..n²-1.
  function bayerRanks(n) {
    let m = [[0]];
    let size = 1;
    while (size < n) {
      const next = [];
      for (let y = 0; y < size * 2; y++) next.push(new Array(size * 2));
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = m[y][x] * 4;
          next[y][x] = v;
          next[y][x + size] = v + 2;
          next[y + size][x] = v + 3;
          next[y + size][x + size] = v + 1;
        }
      }
      m = next;
      size *= 2;
    }
    const out = new Uint16Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) out[y * n + x] = m[y][x];
    }
    return out;
  }

  // Classic clustered-dot and halftone 4×4 rank matrices.
  const CLUSTER_DOT_RANKS = [12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14];
  const HALFTONE_RANKS = [7, 13, 11, 4, 12, 16, 14, 8, 10, 15, 6, 2, 5, 9, 3, 1];

  // Ranks map onto (0, 255) with half-step midpoints, so the extremes never
  // quite reach 0 or 255: pure black and pure white dither without stray
  // speckles at either end.
  function normalizeRanks(ranks) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < ranks.length; i++) {
      if (ranks[i] < min) min = ranks[i];
      if (ranks[i] > max) max = ranks[i];
    }
    const span = max - min + 1;
    const out = new Float32Array(ranks.length);
    for (let i = 0; i < ranks.length; i++) out[i] = (ranks[i] - min + 0.5) * (255 / span);
    return out;
  }

  /* --- void-and-cluster (Ulichney) ------------------------------------ */

  // Returns a size×size permutation of 0..size²-1: the classic ordered mask.
  function voidAndCluster(size, seed) {
    const n = size * size;
    const rng = makeRng(seed);
    const sigma = Math.max(1.1, size / 6);
    const radius = Math.max(1, Math.ceil(sigma * 2));
    const taps = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        taps.push([dy, dx, Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))]);
      }
    }
    const energy = new Float32Array(n);

    function addAt(index, sign) {
      const y0 = (index / size) | 0, x0 = index % size;
      for (let t = 0; t < taps.length; t++) {
        const tap = taps[t];
        const y = (((y0 + tap[0]) % size) + size) % size;
        const x = (((x0 + tap[1]) % size) + size) % size;
        energy[y * size + x] += sign * tap[2];
      }
    }

    const binary = new Uint8Array(n);
    let ones = 0;
    for (let i = 0; i < n; i++) {
      if (rng() < 0.5) { binary[i] = 1; ones++; addAt(i, 1); }
    }

    function tightestCluster() {
      let best = -1;
      for (let i = 0; i < n; i++) {
        if (binary[i] && (best < 0 || energy[i] > energy[best])) best = i;
      }
      return best;
    }
    function largestVoid() {
      let best = -1;
      for (let i = 0; i < n; i++) {
        if (!binary[i] && (best < 0 || energy[i] < energy[best])) best = i;
      }
      return best;
    }

    // Relax: repeatedly move the tightest cluster into the largest void.
    for (let iter = 0; iter < n * 8; iter++) {
      const hi = tightestCluster();
      const lo = largestVoid();
      if (hi < 0 || lo < 0 || energy[hi] <= energy[lo]) break;
      binary[hi] = 0; addAt(hi, -1);
      binary[lo] = 1; addAt(lo, 1);
    }

    const ranks = new Uint16Array(n);
    // Phase 1 — remove tightest clusters, ranking downward.
    const relaxed = binary.slice();
    for (let r = ones - 1; r >= 0; r--) {
      const hi = tightestCluster();
      ranks[hi] = r;
      binary[hi] = 0; addAt(hi, -1);
    }
    // Phase 2 — from the relaxed pattern, fill largest voids, ranking upward.
    binary.set(relaxed);
    energy.fill(0);
    for (let i = 0; i < n; i++) if (binary[i]) addAt(i, 1);
    for (let r = ones; r < n; r++) {
      const lo = largestVoid();
      ranks[lo] = r;
      binary[lo] = 1; addAt(lo, 1);
    }
    return ranks;
  }

  const VOID_CLUSTER_SEED = 0xd17e5;  // fixed: masks are stable, the seed is for user noise
  let voidClusterCache = null;
  function voidCluster8() {
    if (!voidClusterCache) voidClusterCache = voidAndCluster(8, VOID_CLUSTER_SEED);
    return voidClusterCache;
  }

  const BLUE_NOISE_SIZE = 16;
  const BLUE_NOISE_SEED = 0x51e2d7;
  let blueNoiseCache = null;
  function blueNoiseRanks() {
    if (!blueNoiseCache) blueNoiseCache = voidAndCluster(BLUE_NOISE_SIZE, BLUE_NOISE_SEED);
    return blueNoiseCache;
  }

  // A tiled blue-noise threshold value: the 16×16 mask, rotated and offset
  // per tile from the user seed so the tiling is not obvious.
  function blueNoiseValue(x, y, seed) {
    const mask = blueNoiseRanks();
    const s = BLUE_NOISE_SIZE;
    const tx = (x / s) | 0, ty = (y / s) | 0;
    const h = hash32(Math.imul(tx + 1, 0x9e3779b1) ^ Math.imul(ty + 1, 0x85ebca6b) ^ (seed >>> 0));
    const ox = h & (s - 1);
    const oy = (h >>> 4) & (s - 1);
    const rot = (h >>> 8) & 3;
    let lx = x & (s - 1), ly = y & (s - 1);
    if (rot === 1) { const t = lx; lx = s - 1 - ly; ly = t; }
    else if (rot === 2) { lx = s - 1 - lx; ly = s - 1 - ly; }
    else if (rot === 3) { const t = lx; lx = ly; ly = s - 1 - t; }
    return mask[((ly + oy) & (s - 1)) * s + ((lx + ox) & (s - 1))] * (255 / (s * s - 1));
  }

  const MATRIX_CACHE = new Map();
  function matrixFor(id) {
    if (MATRIX_CACHE.has(id)) return MATRIX_CACHE.get(id);
    let mat;
    if (id === 'bayer2') mat = normalizeRanks(bayerRanks(2));
    else if (id === 'bayer4') mat = normalizeRanks(bayerRanks(4));
    else if (id === 'bayer8') mat = normalizeRanks(bayerRanks(8));
    else if (id === 'clustered-dot') mat = normalizeRanks(CLUSTER_DOT_RANKS);
    else if (id === 'halftone') mat = normalizeRanks(HALFTONE_RANKS);
    else if (id === 'void-cluster') mat = normalizeRanks(voidCluster8());
    else mat = normalizeRanks(bayerRanks(4));
    MATRIX_CACHE.set(id, mat);
    return mat;
  }

  /* ------------------------------------------------------------------ */
  /* palettes                                                           */
  /* ------------------------------------------------------------------ */

  // Values are the hardware / product palettes they name; B&W is the mono path.
  const PALETTES = [
    { id: 'bw', name: 'B&W (1-bit)', colors: [[0, 0, 0], [255, 255, 255]] },
    { id: 'gameboy', name: 'Game Boy', colors: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]] },
    { id: 'gameboy-pocket', name: 'Game Boy Pocket', colors: [[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]] },
    { id: 'c64', name: 'Commodore 64', colors: [
      [0, 0, 0], [255, 255, 255], [136, 0, 0], [170, 255, 238], [204, 68, 204], [0, 204, 85], [0, 0, 170], [238, 238, 119],
      [221, 136, 85], [102, 68, 0], [255, 119, 119], [51, 51, 51], [119, 119, 119], [170, 255, 102], [0, 136, 255], [187, 187, 187],
    ] },
    { id: 'nes', name: 'NES', colors: [
      [0, 0, 0], [252, 252, 252], [248, 0, 0], [188, 188, 188], [0, 120, 248], [0, 88, 248], [248, 120, 88], [0, 248, 152],
      [248, 56, 0], [168, 0, 32], [252, 160, 68], [152, 150, 152], [248, 184, 0], [104, 136, 252], [184, 248, 24], [236, 238, 236],
    ] },
    { id: 'zx-spectrum', name: 'ZX Spectrum', colors: [
      [0, 0, 0], [0, 0, 215], [215, 0, 0], [215, 0, 215], [0, 215, 0], [0, 215, 215], [215, 215, 0], [215, 215, 215],
      [0, 0, 255], [255, 0, 0], [255, 0, 255], [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 255, 255],
    ] },
    { id: 'cga', name: 'CGA Mode 4', colors: [[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]] },
    { id: 'macintosh', name: 'Macintosh II', colors: [
      [255, 255, 255], [255, 255, 0], [255, 102, 0], [221, 0, 0], [255, 0, 153], [51, 0, 153], [0, 0, 204], [0, 153, 255],
      [0, 170, 0], [0, 102, 0], [102, 51, 0], [153, 102, 51], [187, 187, 187], [136, 136, 136], [68, 68, 68], [0, 0, 0],
    ] },
    { id: 'teletext', name: 'Teletext', colors: [
      [0, 0, 0], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
    ] },
    { id: 'pico8', name: 'PICO-8', colors: [
      [0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81], [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232],
      [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54], [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170],
    ] },
    { id: 'gruvbox', name: 'Gruvbox', colors: [
      [40, 40, 40], [60, 56, 54], [80, 73, 69], [102, 92, 84], [189, 174, 147], [213, 196, 161], [235, 219, 178], [251, 241, 199],
      [204, 36, 29], [177, 98, 134], [152, 151, 26], [215, 153, 33], [69, 133, 136], [104, 157, 106], [214, 93, 14], [184, 187, 38],
    ] },
  ];

  const PALETTE_BY_ID = new Map(PALETTES.map(function (p) { return [p.id, p]; }));

  // 32³ nearest-colour lookup per palette: the table is indexed by a 5-bit
  // RGB bucket and holds the nearest palette entry for that bucket's centre.
  const LUT_CACHE = new Map();
  function paletteLut(id) {
    if (LUT_CACHE.has(id)) return LUT_CACHE.get(id);
    const palette = PALETTE_BY_ID.get(id) || PALETTE_BY_ID.get('bw');
    const colors = palette.colors;
    const lut = new Uint8Array(32768);
    for (let r = 0; r < 32; r++) {
      for (let g = 0; g < 32; g++) {
        for (let b = 0; b < 32; b++) {
          const cr = r * 8 + 4, cg = g * 8 + 4, cb = b * 8 + 4;
          let best = 0, bestD = Infinity;
          for (let i = 0; i < colors.length; i++) {
            const dr = cr - colors[i][0], dg = cg - colors[i][1], db = cb - colors[i][2];
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) { bestD = d; best = i; }
          }
          lut[(r << 10) | (g << 5) | b] = best;
        }
      }
    }
    LUT_CACHE.set(id, lut);
    return lut;
  }

  function snapIndex(lut, r, g, b) {
    const q = (clamp255(r) >> 3) << 10 | (clamp255(g) >> 3) << 5 | (clamp255(b) >> 3);
    return lut[q];
  }

  /* ------------------------------------------------------------------ */
  /* adjustments                                                        */
  /* ------------------------------------------------------------------ */

  // f is an interleaved Float32 RGB buffer, w*h*3 values in 0..255.
  function applyAdjustments(f, w, h, rawAdj) {
    const n = w * h * 3;
    const adj = rawAdj || {};
    const brightness = adj.brightness === undefined ? 1 : adj.brightness;
    const contrast = adj.contrast === undefined ? 1 : adj.contrast;
    const saturation = adj.saturation === undefined ? 1 : adj.saturation;
    const hue = adj.hue || 0;
    if (brightness !== 1) {
      for (let i = 0; i < n; i++) f[i] *= brightness;
    }
    if (contrast !== 1) {
      const k = contrast;
      for (let i = 0; i < n; i++) f[i] = (f[i] - 128) * k + 128;
    }
    if (saturation !== 1) {
      const s = saturation;
      for (let i = 0; i < n; i += 3) {
        const y = luma(f[i], f[i + 1], f[i + 2]);
        f[i] = y + (f[i] - y) * s;
        f[i + 1] = y + (f[i + 1] - y) * s;
        f[i + 2] = y + (f[i + 2] - y) * s;
      }
    }
    if (hue) {
      const a = (hue * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const m00 = 0.213 + c * 0.787 - s * 0.213, m01 = 0.715 - c * 0.715 - s * 0.715, m02 = 0.072 - c * 0.072 + s * 0.928;
      const m10 = 0.213 - c * 0.213 + s * 0.143, m11 = 0.715 + c * 0.285 + s * 0.140, m12 = 0.072 - c * 0.072 - s * 0.283;
      const m20 = 0.213 - c * 0.213 - s * 0.787, m21 = 0.715 - c * 0.715 + s * 0.715, m22 = 0.072 + c * 0.928 + s * 0.072;
      for (let i = 0; i < n; i += 3) {
        const r = f[i], g = f[i + 1], b = f[i + 2];
        f[i] = m00 * r + m01 * g + m02 * b;
        f[i + 1] = m10 * r + m11 * g + m12 * b;
        f[i + 2] = m20 * r + m21 * g + m22 * b;
      }
    }
    if (adj.blur > 0) {
      const radius = Math.max(1, Math.round(adj.blur));
      boxBlurRGB(f, w, h, radius);
      boxBlurRGB(f, w, h, radius);
    }
    if (adj.sharpen > 0) {
      const blurred = f.slice();
      boxBlurRGB(blurred, w, h, 1);
      const k = adj.sharpen;
      for (let i = 0; i < n; i++) f[i] += k * (f[i] - blurred[i]);
    }
    if (adj.denoise) median3RGB(f, w, h);
    for (let i = 0; i < n; i++) f[i] = clamp255(f[i]);
    return f;
  }

  // Separable box blur, in place, on an interleaved Float32 RGB buffer.
  function boxBlurRGB(f, w, h, radius) {
    const n = w * h * 3;
    const tmp = new Float32Array(n);
    const win = radius * 2 + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 3;
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const x = clampInt(k, 0, w - 1) * 3 + row;
        r += f[x]; g += f[x + 1]; b += f[x + 2];
      }
      for (let x = 0; x < w; x++) {
        const o = row + x * 3;
        tmp[o] = r / win; tmp[o + 1] = g / win; tmp[o + 2] = b / win;
        const out = clampInt(x - radius, 0, w - 1) * 3 + row;
        const add = clampInt(x + radius + 1, 0, w - 1) * 3 + row;
        r += f[add] - f[out];
        g += f[add + 1] - f[out + 1];
        b += f[add + 2] - f[out + 2];
      }
    }
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const o = clampInt(k, 0, h - 1) * w * 3 + x * 3;
        r += tmp[o]; g += tmp[o + 1]; b += tmp[o + 2];
      }
      for (let y = 0; y < h; y++) {
        const o = y * w * 3 + x * 3;
        f[o] = r / win; f[o + 1] = g / win; f[o + 2] = b / win;
        const out = clampInt(y - radius, 0, h - 1) * w * 3 + x * 3;
        const add = clampInt(y + radius + 1, 0, h - 1) * w * 3 + x * 3;
        r += tmp[add] - tmp[out];
        g += tmp[add + 1] - tmp[out + 1];
        b += tmp[add + 2] - tmp[out + 2];
      }
    }
  }

  function clampInt(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // 3×3 median per channel — the denoise option (off by default; the most
  // expensive adjustment).
  function median3RGB(f, w, h) {
    const src = f.slice();
    const scratch = new Float32Array(9);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let k = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = clampInt(y + dy, 0, h - 1);
            for (let dx = -1; dx <= 1; dx++) {
              const xx = clampInt(x + dx, 0, w - 1);
              scratch[k++] = src[(yy * w + xx) * 3 + c];
            }
          }
          for (let i = 1; i < 9; i++) {
            const v = scratch[i];
            let j = i - 1;
            while (j >= 0 && scratch[j] > v) { scratch[j + 1] = scratch[j]; j--; }
            scratch[j + 1] = v;
          }
          f[(y * w + x) * 3 + c] = scratch[4];
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* scaling                                                            */
  /* ------------------------------------------------------------------ */

  // Box-average downscale to (round(w/ps), round(h/ps)) — the pixel chunk.
  function downscale(f, w, h, ps) {
    const sw = Math.max(1, Math.round(w / ps));
    const sh = Math.max(1, Math.round(h / ps));
    const out = new Float32Array(sw * sh * 3);
    for (let oy = 0; oy < sh; oy++) {
      const y0 = Math.floor((oy * h) / sh);
      const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * h) / sh));
      for (let ox = 0; ox < sw; ox++) {
        const x0 = Math.floor((ox * w) / sw);
        const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * w) / sw));
        let r = 0, g = 0, b = 0, count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * w + x) * 3;
            r += f[i]; g += f[i + 1]; b += f[i + 2];
            count++;
          }
        }
        const o = (oy * sw + ox) * 3;
        out[o] = r / count; out[o + 1] = g / count; out[o + 2] = b / count;
      }
    }
    return { f: out, w: sw, h: sh };
  }

  function toRGBA(rgb, w, h) {
    const n = w * h;
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      out[i * 4] = rgb[i * 3];
      out[i * 4 + 1] = rgb[i * 3 + 1];
      out[i * 4 + 2] = rgb[i * 3 + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  function upscaleNearest(src, sw, sh, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(sh - 1, Math.floor((y * sh) / h));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(sw - 1, Math.floor((x * sw) / w));
        const si = (sy * sw + sx) * 4, di = (y * w + x) * 4;
        out[di] = src[si];
        out[di + 1] = src[si + 1];
        out[di + 2] = src[si + 2];
        out[di + 3] = 255;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* algorithms                                                         */
  /* ------------------------------------------------------------------ */

  const ALGORITHMS = [
    { id: 'threshold', name: 'Threshold (no dither)', group: 'Basic', kind: 'threshold' },
    { id: 'bayer2', name: 'Bayer 2×2', group: 'Ordered', kind: 'ordered' },
    { id: 'bayer4', name: 'Bayer 4×4', group: 'Ordered', kind: 'ordered' },
    { id: 'bayer8', name: 'Bayer 8×8', group: 'Ordered', kind: 'ordered' },
    { id: 'clustered-dot', name: 'Clustered-Dot 4×4', group: 'Ordered', kind: 'ordered' },
    { id: 'halftone', name: 'Halftone 4×4', group: 'Ordered', kind: 'ordered' },
    { id: 'void-cluster', name: 'Void-and-Cluster 8×8', group: 'Ordered', kind: 'ordered' },
    { id: 'random-noise', name: 'Random Noise', group: 'Stochastic', kind: 'noise' },
    { id: 'blue-noise-mask', name: 'Blue-Noise Mask', group: 'Stochastic', kind: 'bluenoise' },
    { id: 'floyd-steinberg', name: 'Floyd–Steinberg', group: 'Error diffusion', kind: 'diffusion', kernel: 'floyd-steinberg' },
    { id: 'atkinson', name: 'Atkinson', group: 'Error diffusion', kind: 'diffusion', kernel: 'atkinson' },
    { id: 'sierra', name: 'Sierra', group: 'Error diffusion', kind: 'diffusion', kernel: 'sierra' },
    { id: 'sierra-lite', name: 'Sierra-Lite', group: 'Error diffusion', kind: 'diffusion', kernel: 'sierra-lite' },
    { id: 'jjn', name: 'Jarvis–Judice–Ninke', group: 'Error diffusion', kind: 'diffusion', kernel: 'jjn' },
    { id: 'stucki', name: 'Stucki', group: 'Error diffusion', kind: 'diffusion', kernel: 'stucki' },
    { id: 'burkes', name: 'Burkes', group: 'Error diffusion', kind: 'diffusion', kernel: 'burkes' },
    { id: 'nakano', name: 'Nakano', group: 'Error diffusion', kind: 'diffusion', kernel: 'nakano' },
    { id: 'stevenson-arce', name: 'Stevenson–Arce', group: 'Error diffusion', kind: 'diffusion', kernel: 'stevenson-arce' },
    { id: 'riemersma', name: 'Riemersma', group: 'Error diffusion', kind: 'diffusion', kernel: 'riemersma' },
    { id: 'ostromoukhov', name: 'Ostromoukhov', group: 'Error diffusion', kind: 'diffusion', kernel: 'ostromoukhov' },
  ];

  const ALGORITHM_BY_ID = new Map(ALGORITHMS.map(function (a) { return [a.id, a]; }));

  // Classic published error-diffusion weights: [dy, dx, numerator] over `div`.
  const KERNELS = {
    'floyd-steinberg': { div: 16, weights: [[0, 1, 7], [1, -1, 3], [1, 0, 5], [1, 1, 1]] },
    'atkinson': { div: 8, weights: [[0, 1, 1], [0, 2, 1], [1, -1, 1], [1, 0, 1], [1, 1, 1], [2, 0, 1]] },
    'sierra': { div: 32, weights: [[0, 1, 5], [0, 2, 3], [1, -2, 2], [1, -1, 4], [1, 0, 5], [1, 1, 4], [1, 2, 2], [2, -1, 2], [2, 0, 3], [2, 1, 2]] },
    'sierra-lite': { div: 4, weights: [[0, 1, 2], [1, -1, 1], [1, 0, 1]] },
    'jjn': { div: 48, weights: [[0, 1, 7], [0, 2, 5], [1, -2, 3], [1, -1, 5], [1, 0, 7], [1, 1, 5], [1, 2, 3], [2, -2, 1], [2, -1, 3], [2, 0, 5], [2, 1, 3], [2, 2, 1]] },
    'stucki': { div: 42, weights: [[0, 1, 8], [0, 2, 4], [1, -2, 2], [1, -1, 4], [1, 0, 8], [1, 1, 4], [1, 2, 2], [2, -2, 1], [2, -1, 2], [2, 0, 4], [2, 1, 2], [2, 2, 1]] },
    'burkes': { div: 32, weights: [[0, 1, 8], [0, 2, 4], [1, -2, 2], [1, -1, 4], [1, 0, 8], [1, 1, 4], [1, 2, 2]] },
    'nakano': { div: 24, weights: [[0, 1, 8], [1, -1, 4], [1, 0, 4], [1, 1, 4], [2, -2, 1], [2, -1, 2], [2, 0, 1]] },
    'stevenson-arce': { div: 200, weights: [[0, 2, 32], [1, -3, 12], [1, -1, 26], [1, 1, 30], [1, 3, 16], [2, -2, 12], [2, 0, 26], [2, 2, 12], [3, -3, 5], [3, -1, 12], [3, 1, 12], [3, 3, 5]] },
  };

  // Ostromoukhov's variable-coefficient table (as published, 2001):
  // [right, down-left, down, divisor], indexed by floor(value / 8).
  const OSTROMOUKHOV = new Uint16Array([
    13, 0, 5, 18, 13, 0, 5, 18, 21, 0, 10, 31, 7, 0, 4, 11,
    8, 0, 5, 13, 47, 3, 28, 78, 23, 3, 13, 39, 15, 3, 8, 26,
    22, 5, 10, 37, 56, 14, 21, 91, 28, 8, 9, 45, 19, 6, 5, 30,
    14, 5, 3, 22, 7, 3, 1, 11, 65, 32, 7, 104, 23, 12, 2, 37,
    23, 12, 2, 37, 65, 32, 7, 104, 7, 3, 1, 11, 14, 5, 3, 22,
    19, 6, 5, 30, 28, 8, 9, 45, 56, 14, 21, 91, 22, 5, 10, 37,
    15, 3, 8, 26, 23, 3, 13, 39, 47, 3, 28, 78, 8, 0, 5, 13,
    7, 0, 4, 11, 21, 0, 10, 31, 13, 0, 5, 18, 13, 0, 5, 18,
  ]);

  /* --- mono path ------------------------------------------------------ */

  // lumaIn: Float32Array (one per pixel). Returns Uint8ClampedArray of 0/255.
  function ditherMono(lumaIn, w, h, algo, settings, rng) {
    const bias = 128 - settings.threshold;  // threshold = exposure bias
    const n = w * h;
    const out = new Uint8ClampedArray(n);
    const kind = algo.kind;

    if (kind === 'ordered') {
      const mat = matrixFor(algo.id);
      const m = Math.round(Math.sqrt(mat.length));
      for (let y = 0; y < h; y++) {
        const my = (y % m) * m;
        for (let x = 0; x < w; x++) {
          const v = lumaIn[y * w + x] + bias;
          out[y * w + x] = v > mat[my + (x % m)] ? 255 : 0;
        }
      }
      return out;
    }
    if (kind === 'noise') {
      for (let i = 0; i < n; i++) out[i] = lumaIn[i] + bias > rng() * 255 ? 255 : 0;
      return out;
    }
    if (kind === 'bluenoise') {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          out[i] = lumaIn[i] + bias > blueNoiseValue(x, y, settings.seed) ? 255 : 0;
        }
      }
      return out;
    }
    if (kind === 'threshold') {
      for (let i = 0; i < n; i++) out[i] = lumaIn[i] + bias > 128 ? 255 : 0;
      return out;
    }

    // error diffusion
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = lumaIn[i] + bias;
    if (algo.kernel === 'riemersma') {
      riemersmaMono(f, w, h, out);
    } else {
      const kernel = KERNELS[algo.kernel];
      const coeffs = kernel
        ? kernel.weights.map(function (t) { return [t[0], t[1], t[2] / kernel.div]; })
        : KERNELS['floyd-steinberg'].weights.map(function (t) { return [t[0], t[1], t[2] / 16]; });
      const variable = algo.kernel === 'ostromoukhov';
      diffuse(f, w, h, out, coeffs, variable);
    }
    return out;
  }

  // Scatter helper for 1-channel buffers. The accumulated values are left
  // unclamped: clamping would swallow error and pull flat areas off-tone.
  function scatter1(f, w, h, y, x, err, coeffs) {
    for (let k = 0; k < coeffs.length; k++) {
      const ny = y + coeffs[k][0];
      if (ny < 0 || ny >= h) continue;
      const nx = x + coeffs[k][1];
      if (nx < 0 || nx >= w) continue;
      const i = ny * w + nx;
      f[i] += err * coeffs[k][2];
    }
  }

  // Generic mono error diffusion, writing the quantised values into `out`.
  function diffuse(f, w, h, out, coeffs, variable) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = f[i];
        const snapped = v > 128 ? 255 : 0;
        out[i] = snapped;
        const err = v - snapped;
        if (variable) {
          const band = clampInt(Math.floor(v / 8), 0, 31) * 4;
          const div = OSTROMOUKHOV[band + 3];
          if (div === 0) continue;
          scatter1(f, w, h, y, x, err, [
            [0, 1, OSTROMOUKHOV[band] / div],
            [1, -1, OSTROMOUKHOV[band + 1] / div],
            [1, 0, OSTROMOUKHOV[band + 2] / div],
          ]);
        } else {
          scatter1(f, w, h, y, x, err, coeffs);
        }
      }
    }
  }

  const RIEMERSMA_LEN = 16;
  const RIEMERSMA_DECAY = 1 / RIEMERSMA_LEN;

  // Riemersma carries a queue of sixteen errors and holds the *sum* of it into
  // the current pixel (each entry is stored pre-scaled by the decay), so the
  // full error travels along the serpentine path.
  function riemersmaMono(f, w, h, out) {
    const queue = new Float32Array(RIEMERSMA_LEN);
    let head = 0;
    for (let y = 0; y < h; y++) {
      const leftToRight = (y & 1) === 0;
      for (let k = 0; k < w; k++) {
        const x = leftToRight ? k : w - 1 - k;
        const i = y * w + x;
        let carried = 0;
        for (let q = 0; q < RIEMERSMA_LEN; q++) carried += queue[q];
        const v = f[i] + carried;
        const snapped = v > 128 ? 255 : 0;
        out[i] = snapped;
        queue[head] = (v - snapped) * RIEMERSMA_DECAY;
        head = (head + 1) % RIEMERSMA_LEN;
      }
    }
  }

  /* --- palette path --------------------------------------------------- */

  const ORDERED_JITTER = 0.3;  // mask amplitude for palette mode, in 0..255

  function ditherPalette(f, w, h, algo, settings, rng) {
    const palette = PALETTE_BY_ID.get(settings.palette) || PALETTE_BY_ID.get('bw');
    const colors = palette.colors;
    const lut = paletteLut(palette.id);
    const n = w * h;
    const out = new Uint8ClampedArray(n * 3);
    const kind = algo.kind;

    function write(i, idx) {
      const c = colors[idx];
      out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
    }

    if (kind === 'threshold') {
      for (let i = 0; i < n; i++) write(i, snapIndex(lut, f[i * 3], f[i * 3 + 1], f[i * 3 + 2]));
      return out;
    }

    if (kind === 'ordered' || kind === 'noise' || kind === 'bluenoise') {
      const mat = kind === 'ordered' ? matrixFor(algo.id) : null;
      const m = mat ? Math.round(Math.sqrt(mat.length)) : 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          let mask;
          if (mat) mask = mat[(y % m) * m + (x % m)];
          else if (kind === 'noise') mask = rng() * 255;
          else mask = blueNoiseValue(x, y, settings.seed);
          const d = (mask - 127.5) * ORDERED_JITTER;
          write(i, snapIndex(lut, f[i * 3] + d, f[i * 3 + 1] + d, f[i * 3 + 2] + d));
        }
      }
      return out;
    }

    // error diffusion in RGB against the palette
    const buf = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) buf[i] = f[i];

    if (algo.kernel === 'riemersma') {
      const queue = new Float32Array(RIEMERSMA_LEN * 3);
      let head = 0;
      for (let y = 0; y < h; y++) {
        const leftToRight = (y & 1) === 0;
        for (let k = 0; k < w; k++) {
          const x = leftToRight ? k : w - 1 - k;
          const i = (y * w + x) * 3;
          let cr = 0, cg = 0, cb = 0;
          for (let q = 0; q < RIEMERSMA_LEN; q++) {
            cr += queue[q * 3]; cg += queue[q * 3 + 1]; cb += queue[q * 3 + 2];
          }
          const r = buf[i] + cr;
          const g = buf[i + 1] + cg;
          const b = buf[i + 2] + cb;
          const idx = snapIndex(lut, r, g, b);
          const c = colors[idx];
          out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
          queue[head * 3] = (r - c[0]) * RIEMERSMA_DECAY;
          queue[head * 3 + 1] = (g - c[1]) * RIEMERSMA_DECAY;
          queue[head * 3 + 2] = (b - c[2]) * RIEMERSMA_DECAY;
          head = (head + 1) % RIEMERSMA_LEN;
        }
      }
      return out;
    }

    const kernel = KERNELS[algo.kernel];
    const coeffs = kernel
      ? kernel.weights.map(function (t) { return [t[0], t[1], t[2] / kernel.div]; })
      : KERNELS['floyd-steinberg'].weights.map(function (t) { return [t[0], t[1], t[2] / 16]; });
    const variable = algo.kernel === 'ostromoukhov';

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        const idx = snapIndex(lut, r, g, b);
        const c = colors[idx];
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
        const er = r - c[0], eg = g - c[1], eb = b - c[2];
        if (variable) {
          const band = clampInt(Math.floor(luma(r, g, b) / 8), 0, 31) * 4;
          const div = OSTROMOUKHOV[band + 3];
          if (div === 0) continue;
          scatter3(buf, w, h, y, x, er, eg, eb, [
            [0, 1, OSTROMOUKHOV[band] / div],
            [1, -1, OSTROMOUKHOV[band + 1] / div],
            [1, 0, OSTROMOUKHOV[band + 2] / div],
          ]);
        } else {
          scatter3(buf, w, h, y, x, er, eg, eb, coeffs);
        }
      }
    }
    return out;
  }

  function scatter3(buf, w, h, y, x, er, eg, eb, coeffs) {
    for (let k = 0; k < coeffs.length; k++) {
      const ny = y + coeffs[k][0];
      if (ny < 0 || ny >= h) continue;
      const nx = x + coeffs[k][1];
      if (nx < 0 || nx >= w) continue;
      const i = (ny * w + nx) * 3;
      const wgt = coeffs[k][2];
      buf[i] += er * wgt;
      buf[i + 1] += eg * wgt;
      buf[i + 2] += eb * wgt;
    }
  }

  /* ------------------------------------------------------------------ */
  /* glitch stack (post-dither, at chunk resolution)                    */
  /* ------------------------------------------------------------------ */

  const GLITCHES = [
    { id: 'aberration', name: 'Chromatic aberration', hint: 'splits the red and blue channels' },
    { id: 'blocks', name: 'JPEG blocks', hint: 'shifts and crushes 8×8 blocks' },
    { id: 'scanlines', name: 'Scanlines', hint: 'darkens every second row' },
    { id: 'grain', name: 'Grain', hint: 'seeded monochrome noise' },
    { id: 'pixelsort', name: 'Pixel sort', hint: 'sorts bright runs by luminance' },
  ];
  const GLITCH_BY_ID = new Map(GLITCHES.map(function (g) { return [g.id, g]; }));

  function applyGlitchStack(rgba, w, h, stack, seed) {
    for (let s = 0; s < stack.length; s++) {
      const item = stack[s];
      const amount = clampInt(item.amount, 0, 100);
      if (amount <= 0) continue;
      const rng = makeRng((((seed >>> 0) ^ hash32(s + 1)) ^ hash32(GLITCH_INDEX[item.id] || 1)) >>> 0);
      GLITCH_FNS[item.id](rgba, w, h, amount, rng);
    }
    return rgba;
  }

  const GLITCH_INDEX = { aberration: 2, blocks: 3, scanlines: 5, grain: 7, pixelsort: 11 };

  // Red is sampled from the left and blue from the right, so the two channels
  // slide apart by `shift` pixels while green stays put.
  function glitchAberration(d, w, h, amount) {
    const shift = Math.max(1, Math.round((amount / 100) * 8));
    const src = d.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const xr = Math.max(0, x - shift);
        const xb = Math.min(w - 1, x + shift);
        d[i] = src[(y * w + xr) * 4];
        d[i + 2] = src[(y * w + xb) * 4 + 2];
      }
    }
  }

  function glitchBlocks(d, w, h, amount, rng) {
    const bs = 8;
    const density = (amount / 100) * 0.6;
    const src = d.slice();
    for (let by = 0; by < h; by += bs) {
      for (let bx = 0; bx < w; bx += bs) {
        if (rng() > density) continue;
        const shift = rng() < 0.5;
        const off = 1 + Math.floor(rng() * 6);
        const levels = 2 + Math.floor(rng() * 3);
        const y1 = Math.min(h, by + bs), x1 = Math.min(w, bx + bs);
        for (let y = by; y < y1; y++) {
          for (let x = bx; x < x1; x++) {
            const i = (y * w + x) * 4;
            if (shift) {
              const sx = clampInt(x + off, 0, w - 1);
              const si = (y * w + sx) * 4;
              d[i] = src[si]; d[i + 1] = src[si + 1]; d[i + 2] = src[si + 2];
            } else {
              const step = 255 / (levels - 1);
              d[i] = Math.round(src[i] / step) * step;
              d[i + 1] = Math.round(src[i + 1] / step) * step;
              d[i + 2] = Math.round(src[i + 2] / step) * step;
            }
          }
        }
      }
    }
  }

  function glitchScanlines(d, w, h, amount) {
    const k = 1 - (amount / 100) * 0.65;
    for (let y = 1; y < h; y += 2) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
      }
    }
  }

  function glitchGrain(d, w, h, amount, rng) {
    const amp = (amount / 100) * 90;
    const n = w * h;
    for (let i = 0; i < n; i++) {
      const noise = (rng() - 0.5) * amp;
      const p = i * 4;
      d[p] = clamp255(d[p] + noise);
      d[p + 1] = clamp255(d[p + 1] + noise);
      d[p + 2] = clamp255(d[p + 2] + noise);
    }
  }

  function glitchPixelSort(d, w, h, amount) {
    const cutoff = 220 - (amount / 100) * 160;
    const rowLuma = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        rowLuma[x] = luma(d[i], d[i + 1], d[i + 2]);
      }
      let x = 0;
      while (x < w) {
        if (rowLuma[x] < cutoff) { x++; continue; }
        let x1 = x;
        while (x1 < w && rowLuma[x1] >= cutoff) x1++;
        if (x1 - x > 2) {
          // Reorder the run's pixels by luminance, darkest first, writing them
          // back left to right so the run reads as a gradient.
          const order = [];
          for (let k = x; k < x1; k++) order.push([rowLuma[k], k]);
          order.sort(function (a, b) { return a[0] - b[0]; });
          const colors = order.map(function (pair) {
            const i = (y * w + pair[1]) * 4;
            return [d[i], d[i + 1], d[i + 2]];
          });
          for (let k = 0; k < colors.length; k++) {
            const dest = (y * w + x + k) * 4;
            d[dest] = colors[k][0]; d[dest + 1] = colors[k][1]; d[dest + 2] = colors[k][2];
          }
        }
        x = x1;
      }
    }
  }

  const GLITCH_FNS = {
    aberration: glitchAberration,
    blocks: glitchBlocks,
    scanlines: glitchScanlines,
    grain: glitchGrain,
    pixelsort: glitchPixelSort,
  };

  /* ------------------------------------------------------------------ */
  /* glow                                                               */
  /* ------------------------------------------------------------------ */

  function applyGlow(rgba, w, h, radius, intensity) {
    if (radius <= 0 || intensity <= 0) return rgba;
    const r = Math.max(1, Math.round(radius));
    const glow = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      glow[i * 3] = rgba[i * 4];
      glow[i * 3 + 1] = rgba[i * 4 + 1];
      glow[i * 3 + 2] = rgba[i * 4 + 2];
    }
    boxBlurRGB(glow, w, h, r);
    boxBlurRGB(glow, w, h, r);
    const k = intensity / 100;
    for (let i = 0; i < w * h; i++) {
      for (let c = 0; c < 3; c++) {
        const a = rgba[i * 4 + c];
        const b = glow[i * 3 + c] * k;
        rgba[i * 4 + c] = 255 - ((255 - a) * (255 - b)) / 255;
      }
    }
    return rgba;
  }

  /* ------------------------------------------------------------------ */
  /* colour counting                                                    */
  /* ------------------------------------------------------------------ */

  // 24-bit bitset (16 MB, reused) — bounded memory even for a 1600×1600 render.
  let colorBits = null;
  function countColorsRGB(rgb) {
    if (!colorBits) colorBits = new Uint8Array(1 << 24);
    else colorBits.fill(0);
    let count = 0;
    const n = rgb.length / 3;
    for (let i = 0; i < n; i++) {
      const p = rgb[i * 3] << 16 | rgb[i * 3 + 1] << 8 | rgb[i * 3 + 2];
      const byte = p >> 3, bit = 1 << (p & 7);
      if (!(colorBits[byte] & bit)) { colorBits[byte] |= bit; count++; }
    }
    return count;
  }

  /* ------------------------------------------------------------------ */
  /* settings + pipeline                                                */
  /* ------------------------------------------------------------------ */

  const DEFAULT_SETTINGS = {
    algorithm: 'floyd-steinberg',
    palette: 'bw',
    pixelSize: 2,
    threshold: 128,
    seed: 20261008,
    adjustments: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, denoise: false },
    glitches: [],
    glow: { radius: 0, intensity: 0 },
  };

  function mergeSettings(partial) {
    const s = partial || {};
    const adj = s.adjustments || {};
    const glow = s.glow || {};
    return {
      algorithm: s.algorithm || DEFAULT_SETTINGS.algorithm,
      palette: s.palette || DEFAULT_SETTINGS.palette,
      pixelSize: clampInt(Math.round(s.pixelSize || DEFAULT_SETTINGS.pixelSize), 1, 16),
      threshold: clampInt(Math.round(s.threshold === undefined ? DEFAULT_SETTINGS.threshold : s.threshold), 0, 255),
      seed: (s.seed === undefined ? DEFAULT_SETTINGS.seed : s.seed) >>> 0,
      adjustments: {
        brightness: num(adj.brightness, 1),
        contrast: num(adj.contrast, 1),
        saturation: num(adj.saturation, 1),
        hue: num(adj.hue, 0),
        blur: num(adj.blur, 0),
        sharpen: num(adj.sharpen, 0),
        denoise: !!adj.denoise,
      },
      glitches: (s.glitches || []).filter(function (g) {
        return g && GLITCH_BY_ID.has(g.id) && g.amount > 0;
      }).map(function (g) { return { id: g.id, amount: clampInt(Math.round(g.amount), 0, 100) }; }),
      glow: { radius: num(glow.radius, 0), intensity: num(glow.intensity, 0) },
    };
  }

  function num(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  // source: { data: RGBA array, width, height }
  // Returns { data: RGBA array, width, height, ms, colors }.
  // `colors` counts the dither stage (before glitches/glow) on purpose: it is
  // the number a palette promises.
  function process(source, partialSettings) {
    const t0 = now();
    const settings = mergeSettings(partialSettings);
    const w = source.width, h = source.height;

    // RGBA -> interleaved Float32 RGB
    const n = w * h;
    const f = new Float32Array(n * 3);
    const src = source.data;
    for (let i = 0; i < n; i++) {
      f[i * 3] = src[i * 4];
      f[i * 3 + 1] = src[i * 4 + 1];
      f[i * 3 + 2] = src[i * 4 + 2];
    }

    applyAdjustments(f, w, h, settings.adjustments);

    let data = f, dw = w, dh = h;
    if (settings.pixelSize > 1) {
      const small = downscale(f, w, h, settings.pixelSize);
      data = small.f; dw = small.w; dh = small.h;
    }

    const algo = ALGORITHM_BY_ID.get(settings.algorithm) || ALGORITHM_BY_ID.get('floyd-steinberg');
    const rng = makeRng(settings.seed);
    let rgb;
    if (settings.palette === 'bw') {
      const ln = dw * dh;
      const gray = new Float32Array(ln);
      for (let i = 0; i < ln; i++) gray[i] = luma(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
      const dithered = ditherMono(gray, dw, dh, algo, settings, rng);
      rgb = new Uint8ClampedArray(ln * 3);
      for (let i = 0; i < ln; i++) {
        rgb[i * 3] = dithered[i];
        rgb[i * 3 + 1] = dithered[i];
        rgb[i * 3 + 2] = dithered[i];
      }
    } else {
      rgb = ditherPalette(data, dw, dh, algo, settings, rng);
    }

    const colors = countColorsRGB(rgb);

    const rgba = toRGBA(rgb, dw, dh);
    if (settings.glitches.length) applyGlitchStack(rgba, dw, dh, settings.glitches, settings.seed);
    if (settings.glow.radius > 0 && settings.glow.intensity > 0) {
      applyGlow(rgba, dw, dh, settings.glow.radius, settings.glow.intensity);
    }

    const out = dw === w && dh === h ? rgba : upscaleNearest(rgba, dw, dh, w, h);
    return { data: out, width: w, height: h, ms: now() - t0, colors: colors };
  }

  /* ------------------------------------------------------------------ */

  const DitherLib = {
    // constants
    DEFAULTS: DEFAULT_SETTINGS,
    ALGORITHMS: ALGORITHMS,
    PALETTES: PALETTES,
    GLITCHES: GLITCHES,
    KERNELS: KERNELS,
    // building blocks
    makeRng: makeRng,
    bayerRanks: bayerRanks,
    matrixFor: matrixFor,
    voidAndCluster: voidAndCluster,
    blueNoiseValue: blueNoiseValue,
    paletteLut: paletteLut,
    snapIndex: snapIndex,
    // stages
    applyAdjustments: applyAdjustments,
    applyGlitchStack: applyGlitchStack,
    applyGlow: applyGlow,
    countColors: countColorsRGB,
    // the pipeline
    mergeSettings: mergeSettings,
    process: process,
  };

  global.DitherLib = DitherLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DitherLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
