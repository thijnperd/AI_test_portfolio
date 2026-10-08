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

  // sRGB → linear-light lookup, for blends that should add light rather than
  // numbers (the glow). 256 entries, built once.
  const SRGB_TO_LINEAR = (function () {
    const t = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const c = i / 255;
      t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return t;
  })();

  function linearToSrgb255(v) {
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return clamp255(Math.round(c * 255));
  }

  /* --- procedural masks ----------------------------------------------- */

  // Stable hash of a pixel coordinate and the user seed, in 0..1.
  function hash01(x, y, seed) {
    return hash32(Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x27d4, 0xc2b2ae35) ^ (seed >>> 0)) / 4294967296;
  }

  // Tileable value noise: smooth blobs instead of isolated speckles.
  function valueNoise(x, y, seed, cell) {
    const gx = x / cell, gy = y / cell;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash01(x0, y0, seed), b = hash01(x0 + 1, y0, seed);
    const c = hash01(x0, y0 + 1, seed), d = hash01(x0 + 1, y0 + 1, seed);
    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
    return (top + (bot - top) * sy) * 255;
  }

  // Interleaved gradient noise (Jimenez 2013) — cheap film-grain masks.
  function ignValue(x, y) {
    const v = 0.06711056 * x + 0.00583715 * y;
    const f = v - Math.floor(v);
    const g = 52.9829189 * f;
    return (g - Math.floor(g)) * 255;
  }

  // R2 low-discrepancy sequence (Roberts 2018) — even coverage, no tiling.
  function r2Value(x, y) {
    const v = 0.7548776662466927 * x + 0.5698402909980532 * y;
    return (v - Math.floor(v)) * 255;
  }

  // Two diagonal ramps read together as crosshatch shading.
  function crosshatchValue(x, y) {
    const a = ((x + y) % 8) * 32;
    const b = ((x - y + 8000) % 8) * 32;
    return (a + b) * 0.5;
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

  // Two masks: the 16×16 builds in a few milliseconds and is used by default;
  // the 64×64 is the real article (no visible tiling) and is generated lazily
  // once, on first use, because it takes a few hundred milliseconds.
  const BLUE_NOISE_SEED = 0x51e2d7;
  const BLUE_NOISE_CACHE = new Map();
  function blueNoiseRanks(size) {
    const s = size || 16;
    if (!BLUE_NOISE_CACHE.has(s)) {
      BLUE_NOISE_CACHE.set(s, voidAndCluster(s, BLUE_NOISE_SEED ^ (s * 0x9e3779b1)));
    }
    return BLUE_NOISE_CACHE.get(s);
  }

  // A tiled blue-noise threshold value: the mask, rotated and offset per tile
  // from the user seed so the tiling is not obvious.
  function blueNoiseValue(x, y, seed, size) {
    const s = Math.max(8, Math.min(64, Math.round(size || 16)));
    const mask = blueNoiseRanks(s);
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

  /* --- generated screens ---------------------------------------------- */

  // Order the cells of a size×size tile by a key and hand back the ranks.
  function rankedTile(size, keyFn) {
    const cells = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) cells.push([keyFn(x, y), y, x]);
    }
    cells.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; });
    const ranks = new Uint16Array(size * size);
    for (let r = 0; r < cells.length; r++) ranks[cells[r][1] * size + cells[r][2]] = r;
    return ranks;
  }

  // Clustered dot: cells fill outward from the tile centre, so dots grow as
  // round blobs the way a real contact screen's do. The tiny angular term
  // breaks radius ties so the first dots grow evenly in every direction.
  function clusteredDotRanks(size) {
    const c = (size - 1) / 2;
    return rankedTile(size, function (x, y) {
      const dx = x - c, dy = y - c;
      return Math.sqrt(dx * dx + dy * dy) + (0.35 * Math.atan2(dy, dx)) / (Math.PI * 2);
    });
  }

  // Rotated spirals: a halftone screen with its own angle at any tile size.
  function spiralRanks(size, turns) {
    const c = (size - 1) / 2;
    const t = turns === undefined ? 1 : turns;
    return rankedTile(size, function (x, y) {
      const dx = x - c, dy = y - c;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5;
      return r + a * t;
    });
  }

  // Line screens: whole lines thicken in step, so the screen reads as ruled
  // paper rather than dots.
  function lineRanks(size, vertical) {
    return rankedTile(size, function (x, y) {
      const along = vertical ? y : x;
      const across = vertical ? x : y;
      return (across % size) * size + along;
    });
  }

  function diagonalRanks(size) {
    return rankedTile(size, function (x, y) { return ((x + y) % size) * size + x; });
  }

  // Checkerboard: two ranks only, the coarsest screen there is.
  function checksRanks(size) {
    return rankedTile(size, function (x, y) { return ((x + y) & 1) * size * size + (y * size + x); });
  }

  const MATRIX_CACHE = new Map();
  function matrixFor(id) {
    if (MATRIX_CACHE.has(id)) return MATRIX_CACHE.get(id);
    let mat;
    if (id === 'bayer2') mat = normalizeRanks(bayerRanks(2));
    else if (id === 'bayer4') mat = normalizeRanks(bayerRanks(4));
    else if (id === 'bayer8') mat = normalizeRanks(bayerRanks(8));
    else if (id === 'bayer16') mat = normalizeRanks(bayerRanks(16));
    else if (id === 'clustered-dot') mat = normalizeRanks(CLUSTER_DOT_RANKS);
    else if (id === 'clustered-dot-8') mat = normalizeRanks(clusteredDotRanks(8));
    else if (id === 'halftone') mat = normalizeRanks(HALFTONE_RANKS);
    else if (id === 'halftone-8') mat = normalizeRanks(spiralRanks(8, 1));
    else if (id === 'halftone-16') mat = normalizeRanks(spiralRanks(16, 2.5));
    else if (id === 'spiral8') mat = normalizeRanks(spiralRanks(8, 4));
    else if (id === 'line-h2') mat = normalizeRanks(lineRanks(2, false));
    else if (id === 'line-v2') mat = normalizeRanks(lineRanks(2, true));
    else if (id === 'line-h4') mat = normalizeRanks(lineRanks(4, false));
    else if (id === 'line-v4') mat = normalizeRanks(lineRanks(4, true));
    else if (id === 'diagonal4') mat = normalizeRanks(diagonalRanks(4));
    else if (id === 'diagonal8') mat = normalizeRanks(diagonalRanks(8));
    else if (id === 'checks') mat = normalizeRanks(checksRanks(4));
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
    { id: 'apple2', name: 'Apple II (6)', colors: [
      [0, 0, 0], [255, 255, 255], [20, 245, 60], [255, 68, 253], [255, 106, 60], [20, 207, 253],
    ] },
    { id: 'msx', name: 'MSX (TMS9918)', colors: [
      [0, 0, 0], [33, 200, 66], [94, 220, 120], [84, 85, 237], [125, 118, 252], [212, 82, 77], [66, 235, 245], [252, 85, 84],
      [255, 121, 120], [212, 193, 84], [230, 206, 128], [33, 176, 59], [201, 91, 186], [204, 204, 204], [255, 255, 255],
    ] },
    { id: 'ega', name: 'EGA / VGA 16', colors: [
      [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170], [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
      [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255], [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255],
    ] },
    { id: 'virtualboy', name: 'Virtual Boy (4 red)', colors: [[0, 0, 0], [85, 0, 0], [170, 0, 0], [255, 0, 0]] },
    { id: 'gray-4', name: 'Grayscale 4 (2-bit)', colors: [[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]] },
    { id: 'gray-8', name: 'Grayscale 8 (3-bit)', colors: [
      [0, 0, 0], [36, 36, 36], [73, 73, 73], [109, 109, 109], [146, 146, 146], [182, 182, 182], [219, 219, 219], [255, 255, 255],
    ] },
    { id: 'gray-16', name: 'Grayscale 16 (4-bit)', colors: (function () {
      const out = [];
      for (let i = 0; i < 16; i++) {
        const v = Math.round((i * 255) / 15);
        out.push([v, v, v]);
      }
      return out;
    })() },
    { id: 'amber', name: 'Amber CRT ink', colors: [[26, 12, 0], [255, 176, 0]] },
    { id: 'sepia', name: 'Sepia ink', colors: [[43, 32, 24], [245, 222, 179]] },
    { id: 'cyan-ink', name: 'Cyan ink', colors: [[2, 26, 45], [120, 230, 255]] },
    { id: 'blueprint', name: 'Blueprint ink', colors: [[8, 24, 64], [214, 236, 255]] },
    { id: 'matrix', name: 'Matrix green ink', colors: [[3, 16, 6], [132, 255, 150]] },
    { id: 'ice', name: 'Ice ink', colors: [[6, 12, 34], [216, 240, 255]] },
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
    const black = adj.black === undefined ? 0 : adj.black;
    const white = adj.white === undefined ? 255 : adj.white;
    const gamma = adj.gamma === undefined ? 1 : adj.gamma;
    // Input levels first, then gamma: both are input-side, so a render with the
    // defaults is untouched by them.
    if (black > 0 || white < 255) {
      const span = Math.max(1, white - black);
      for (let i = 0; i < n; i++) f[i] = ((f[i] - black) / span) * 255;
    }
    if (gamma !== 1) {
      const inv = 1 / gamma;
      for (let i = 0; i < n; i++) f[i] = 255 * Math.pow(clamp255(f[i]) / 255, inv);
    }
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
    if (adj.denoise) median3RGB(f, w, h);      for (let i = 0; i < n; i++) f[i] = clamp255(f[i]);
    return f;
  }

  /* --- tone maps (duotone grades) ------------------------------------- */

  // A tone map sends black to one ink and white to the other, so it survives
  // dithering: a 1-bit dither stays two inks, a palette gets tinted.
  const TONE_MAPS = [
    { id: 'none', name: 'None' },
    { id: 'gray', name: 'Grayscale', ink: [0, 0, 0], paper: [255, 255, 255] },
    { id: 'sepia', name: 'Sepia', ink: [43, 32, 24], paper: [245, 222, 179] },
    { id: 'blueprint', name: 'Blueprint', ink: [8, 24, 64], paper: [214, 236, 255] },
    { id: 'cyanotype', name: 'Cyanotype', ink: [3, 32, 52], paper: [163, 224, 236] },
    { id: 'amber', name: 'Amber CRT', ink: [26, 12, 0], paper: [255, 176, 0] },
    { id: 'rose', name: 'Rose', ink: [40, 4, 20], paper: [255, 214, 224] },
    { id: 'forest', name: 'Forest', ink: [10, 28, 14], paper: [214, 240, 200] },
    { id: 'thermal', name: 'Thermal', ink: [12, 0, 40], paper: [255, 240, 120] },
    { id: 'gold', name: 'Gold leaf', ink: [36, 22, 0], paper: [255, 226, 140] },
    { id: 'custom', name: 'Custom (ink → paper)' },
  ];
  const TONE_MAP_BY_ID = new Map(TONE_MAPS.map(function (m) { return [m.id, m]; }));

  // Interleaved Float32 RGB in 0..255, mapped in place by luma.
  function applyToneMap(f, w, h, settings) {
    const map = TONE_MAP_BY_ID.get(settings.toneMap);
    if (!map || map.id === 'none') return f;
    const ink = map.id === 'custom' ? settings.toneInk : map.ink;
    const paper = map.id === 'custom' ? settings.tonePaper : map.paper;
    const dr = paper[0] - ink[0], dg = paper[1] - ink[1], db = paper[2] - ink[2];
    const n = w * h;
    for (let i = 0; i < n; i++) {
      const p = i * 3;
      const t = clamp255(luma(f[p], f[p + 1], f[p + 2])) / 255;
      f[p] = ink[0] + dr * t;
      f[p + 1] = ink[1] + dg * t;
      f[p + 2] = ink[2] + db * t;
    }
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
        out[di + 3] = src[si + 3];
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
    { id: 'bayer16', name: 'Bayer 16×16', group: 'Ordered', kind: 'ordered' },
    { id: 'clustered-dot', name: 'Clustered-Dot 4×4', group: 'Ordered', kind: 'ordered' },
    { id: 'clustered-dot-8', name: 'Clustered-Dot 8×8', group: 'Ordered', kind: 'ordered' },
    { id: 'halftone', name: 'Halftone 4×4', group: 'Ordered', kind: 'ordered' },
    { id: 'halftone-8', name: 'Halftone 8×8 (round)', group: 'Ordered', kind: 'ordered' },
    { id: 'halftone-16', name: 'Halftone 16×16 (fine)', group: 'Ordered', kind: 'ordered' },
    { id: 'spiral8', name: 'Spiral 8×8', group: 'Ordered', kind: 'ordered' },
    { id: 'line-h2', name: 'Line 2×2 (horizontal)', group: 'Ordered', kind: 'ordered' },
    { id: 'line-v2', name: 'Line 2×2 (vertical)', group: 'Ordered', kind: 'ordered' },
    { id: 'line-h4', name: 'Line 4×4 (horizontal)', group: 'Ordered', kind: 'ordered' },
    { id: 'line-v4', name: 'Line 4×4 (vertical)', group: 'Ordered', kind: 'ordered' },
    { id: 'diagonal4', name: 'Diagonal 4×4', group: 'Ordered', kind: 'ordered' },
    { id: 'diagonal8', name: 'Diagonal 8×8', group: 'Ordered', kind: 'ordered' },
    { id: 'checks', name: 'Checkerboard', group: 'Ordered', kind: 'ordered' },
    { id: 'void-cluster', name: 'Void-and-Cluster 8×8', group: 'Ordered', kind: 'ordered' },
    { id: 'random-noise', name: 'Random Noise', group: 'Stochastic', kind: 'noise' },
    { id: 'blue-noise-mask', name: 'Blue-Noise Mask 16', group: 'Stochastic', kind: 'bluenoise', size: 16 },
    { id: 'blue-noise-32', name: 'Blue-Noise Mask 32 (large)', group: 'Stochastic', kind: 'bluenoise', size: 32 },
    { id: 'clustered-noise', name: 'Clustered Noise', group: 'Stochastic', kind: 'clustered-noise', cell: 4 },
    { id: 'ign', name: 'Interleaved Gradient Noise', group: 'Stochastic', kind: 'formula', formula: 'ign' },
    { id: 'r2', name: 'R2 Low-Discrepancy', group: 'Stochastic', kind: 'formula', formula: 'r2' },
    { id: 'crosshatch', name: 'Crosshatch', group: 'Stochastic', kind: 'formula', formula: 'crosshatch' },
    { id: 'smooth-diffusion', name: 'Smooth Diffusion', group: 'Structure-aware', kind: 'structure', mode: 'flow' },
    { id: 'rain', name: 'Rain Streaks', group: 'Structure-aware', kind: 'structure', mode: 'rain' },
    { id: 'dot-field', name: 'Dot Field (edge dots)', group: 'Structure-aware', kind: 'structure', mode: 'dots' },
    { id: 'yliluoma-2', name: 'Yliluoma mix: 2 colours', group: 'Mixing', kind: 'yliluoma', option: 2 },
    { id: 'yliluoma-greedy', name: 'Yliluoma mix: quick', group: 'Mixing', kind: 'yliluoma', option: 3 },
    { id: 'yliluoma-polished', name: 'Yliluoma mix: deep', group: 'Mixing', kind: 'yliluoma', option: 4 },
    { id: 'floyd-steinberg', name: 'Floyd–Steinberg', group: 'Error diffusion', kind: 'diffusion', kernel: 'floyd-steinberg' },
    { id: 'atkinson', name: 'Atkinson', group: 'Error diffusion', kind: 'diffusion', kernel: 'atkinson' },
    { id: 'sierra', name: 'Sierra', group: 'Error diffusion', kind: 'diffusion', kernel: 'sierra' },
    { id: 'sierra-two-row', name: 'Sierra (two-row)', group: 'Error diffusion', kind: 'diffusion', kernel: 'sierra-two-row' },
    { id: 'sierra-lite', name: 'Sierra-Lite', group: 'Error diffusion', kind: 'diffusion', kernel: 'sierra-lite' },
    { id: 'jjn', name: 'Jarvis–Judice–Ninke', group: 'Error diffusion', kind: 'diffusion', kernel: 'jjn' },
    { id: 'stucki', name: 'Stucki', group: 'Error diffusion', kind: 'diffusion', kernel: 'stucki' },
    { id: 'burkes', name: 'Burkes', group: 'Error diffusion', kind: 'diffusion', kernel: 'burkes' },
    { id: 'nakano', name: 'Nakano', group: 'Error diffusion', kind: 'diffusion', kernel: 'nakano' },
    { id: 'fan', name: 'Fan', group: 'Error diffusion', kind: 'diffusion', kernel: 'fan' },
    { id: 'shiau-fan', name: 'Shiau–Fan', group: 'Error diffusion', kind: 'diffusion', kernel: 'shiau-fan' },
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
    'fan': { div: 16, weights: [[0, 1, 7], [1, -2, 1], [1, -1, 3], [1, 0, 5]] },
    'shiau-fan': { div: 18, weights: [[0, 1, 7], [1, -2, 1], [1, -1, 3], [1, 0, 5], [2, -1, 1], [2, 0, 1]] },
    'sierra-two-row': { div: 16, weights: [[0, 1, 4], [0, 2, 3], [1, -2, 1], [1, -1, 2], [1, 0, 3], [1, 1, 2], [1, 2, 1]] },
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

  /* --- masks ---------------------------------------------------------- */

  // The threshold mask for one pixel, 0..255. Ordered screens read their tile,
  // stochastic screens roll their own: white noise from the seeded RNG (the
  // order of calls is the pixel order, so it stays reproducible), blue noise
  // from the tiled void-and-cluster mask, clustered noise from a value-noise
  // field, formulas from their closed form.
  // `i` is the pixel index into the screen (structure screens are prebuilt),
  // and `screenShift` slides tile-based screens by whole pixels — that is what
  // makes an ordered screen crawl during video playback.
  function maskValue(algo, x, y, i, settings, rng, mat, m, screen) {
    const sy = settings.screenShift | 0;
    const px = x + sy, py = y + sy;
    switch (algo.kind) {
      case 'ordered': return mat[(py % m) * m + (px % m)];
      case 'noise': return rng() * 255;
      case 'bluenoise': return blueNoiseValue(px, py, settings.seed, algo.size || 16);
      case 'clustered-noise': return valueNoise(px, py, settings.seed, algo.cell || 4);
      case 'structure': return screen[i];
      case 'formula':
        if (algo.formula === 'ign') return ignValue(px, py);
        if (algo.formula === 'r2') return r2Value(px, py);
        return crosshatchValue(px, py);
      default: return 128;
    }
  }

  /* --- structure-aware screens ---------------------------------------- */

  // These screens read the image instead of just tiling over it. The base noise
  // is stretched along the image's own contours — the tangent of the iso-luma
  // direction, sampled either side of each pixel, a short line-integral
  // convolution — so dots flow with the shading rather than fighting it. Two
  // more knobs push it around: vertical streaks (rain) and an edge bias that
  // opens the screen up at edges while flats stay clean (a subject made of
  // dots). Each mode sets its own character; the sliders push it.
  //
  // Cost is bounded: one noise field per render, then a fixed number of nearest
  // samples per pixel (at most 1 + 2*10 + 2*10), no per-pixel allocation.
  const SCREEN_EDGE_REF = 26;   // gradient magnitude that counts as an edge
  const SCREEN_CELL_MIN = 1;
  const SCREEN_CELL_MAX = 12;

  function buildScreen(data, w, h, algo, settings) {
    const n = w * h;
    const cfg = settings.screen || {};
    const mode = algo.mode || 'flow';
    const cell = clampInt(Math.round(num(cfg.smooth, 3)), SCREEN_CELL_MIN, SCREEN_CELL_MAX);
    const flow = clampInt(Math.round(num(cfg.flow, 60)), 0, 100);
    const streak = clampInt(Math.round(num(cfg.streak, 0)), 0, 100);
    // The mode sets the character; the sliders push it.
    const flowAmt = (mode === 'rain' ? Math.min(flow, 25) : flow) / 100;
    const streakAmt = (mode === 'rain' ? Math.max(streak, 55) : streak) / 100;
    const seed = settings.seed >>> 0;

    // Two octaves of value noise: clumps at the cell size plus a third-size
    // detail octave, which is what keeps the pattern from looking like blobs.
    const field = new Float32Array(n);
    const detail = Math.max(1, Math.round(cell / 3));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = valueNoise(x, y, seed, cell);
        const b = valueNoise(x, y, seed ^ 0x9e3779b1, detail);
        field[y * w + x] = (a * 0.65 + b * 0.35) / 255;
      }
    }

    const lumaIn = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      lumaIn[i] = luma(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) / 255;
    }

    // Samples are read straight out of `field` with the index arithmetic
    // inlined: this loop runs 10+ times per pixel, and a closure call per
    // sample was most of the screen's cost.
    const maxX = w - 1, maxY = h - 1;
    function sampleAt(fx, fy) {
      let x = (fx + 0.5) | 0;
      let y = (fy + 0.5) | 0;
      if (x < 0) x = 0; else if (x > maxX) x = maxX;
      if (y < 0) y = 0; else if (y > maxY) y = maxY;
      return field[y * w + x];
    }

    const out = new Float32Array(n);
    // Samples per pixel are bounded by a budget, not just by the sliders: a
    // 1600 px working image would otherwise cost 41 neighbour samples for every
    // one of its pixels. Six million samples is about 100 ms of work here. The
    // two reaches shrink together, so the look keeps its proportions and only
    // loses a little of its tail.
    const budget = 6e6 / Math.max(1, n);
    const wantFlow = 1 + Math.round(flowAmt * 9);
    const wantStreak = 1 + Math.round(streakAmt * 9);
    const want = 1 + (flowAmt > 0 ? wantFlow : 0) * 2 + (streakAmt > 0 ? wantStreak : 0) * 2;
    const shrink = want > budget ? budget / want : 1;
    const flowReach = flowAmt > 0 ? Math.max(1, Math.round(wantFlow * shrink)) : 0;
    const streakReach = streakAmt > 0 ? Math.max(1, Math.round(wantStreak * shrink)) : 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const up = (y > 0 ? y - 1 : 0) * w;
      const down = (y < h - 1 ? y + 1 : h - 1) * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const gx = (lumaIn[row + (x < w - 1 ? x + 1 : w - 1)] - lumaIn[row + (x > 0 ? x - 1 : 0)]) * 255;
        const gy = (lumaIn[down + x] - lumaIn[up + x]) * 255;
        const mag = Math.sqrt(gx * gx + gy * gy);
        let v = field[i];
        if (flowAmt > 0) {
          // Tangent to the contour: perpendicular to the gradient.
          const len = mag || 1;
          const tx = -gy / len, ty = gx / len;
          let sum = v, count = 1;
          for (let k = 1; k <= flowReach; k++) {
            const o = k * 1.5;
            sum += sampleAt(x + tx * o, y + ty * o) + sampleAt(x - tx * o, y - ty * o);
            count += 2;
          }
          v = v * (1 - flowAmt) + (sum / count) * flowAmt;
        }
        if (streakAmt > 0) {
          let sum = v, count = 1;
          for (let k = 1; k <= streakReach; k++) {
            const o = k * 1.5;
            sum += sampleAt(x, y + o) + sampleAt(x, y - o);
            count += 2;
          }
          v = v * (1 - streakAmt) + (sum / count) * streakAmt;
        }
        const edge = Math.min(1, mag / SCREEN_EDGE_REF);
        // Flats keep a calm screen; edges open it up. The dots mode goes much
        // further: flats collapse towards a plain threshold, so the subject
        // reads as dots on the edges and clean paper inside.
        const gain = mode === 'dots' ? 0.12 + 1.15 * edge : mode === 'rain' ? 0.7 + 0.6 * edge : 0.85 + 0.5 * edge;
        // Held just inside the ends: a screen that reached 0 or 255 would make
        // pure-black or pure-white patches flip once the strength knob pushed
        // it, which is the one thing every other screen here guarantees.
        const m = 128 + (v - 0.5) * 255 * gain;
        out[i] = m < 1 ? 1 : m > 254 ? 254 : m;
      }
    }
    return out;
  }

  // `strength` scales every mask away from mid-grey: at 0 the screen is a plain
  // threshold, at 100 it is the published screen, above that it is pushed.
  function scaleMask(mask, k) {
    return k === 1 ? mask : 128 + (mask - 128) * k;
  }

  function scaledCoeffs(algo, strength) {
    const kernel = KERNELS[algo.kernel] || KERNELS['floyd-steinberg'];
    const k = strength / 100;
    const out = [];
    for (let i = 0; i < kernel.weights.length; i++) {
      const t = kernel.weights[i];
      out.push([t[0], t[1], (t[2] / kernel.div) * k]);
    }
    return out;
  }

  function mirrorCoeffs(coeffs) {
    const out = [];
    for (let i = 0; i < coeffs.length; i++) out.push([coeffs[i][0], -coeffs[i][1], coeffs[i][2]]);
    return out;
  }

  /* --- Yliluoma mixing ------------------------------------------------ */

  // Yliluoma's ordered dithering (bisqwit, 2017). Instead of snapping to one
  // colour per pixel, a *mixing plan* — a short sequence of palette entries —
  // is built for each target, and the ordered-screen rank picks the entry. The
  // plan is searched for, not derived: option 2 finds the best convex mix of
  // two palette colours, option 3 grows the plan greedily (the plan metric is
  // the sum of the squared distances between the target and every partial mean
  // of the sorted plan, exactly as published), option 4 additionally prunes
  // redundant entries from the finished plan.
  const YLL_STEPS = 16;          // plan length; the screen resolves 16 levels
  const YLL_MONO_LEVELS = 32;    // luma bins for the mono path
  const YLL_RGB_LEVELS = 16;     // per-channel bins for the colour path
  const YLL_CANDIDATES = 8;      // palette colours searched per plan step
  const YLL_CACHE = new Map();
  let yllScreen = null;

  function yliluomaScreen() {
    if (!yllScreen) {
      const mat = matrixFor('bayer8');
      yllScreen = new Float32Array(mat.length);
      for (let i = 0; i < mat.length; i++) yllScreen[i] = mat[i] / 255;
    }
    return yllScreen;
  }

  function yllEntry(paletteId, option, mono) {
    const key = paletteId + '|' + option + '|' + (mono ? 'm' : 'c');
    let entry = YLL_CACHE.get(key);
    if (!entry) {
      const colors = (PALETTE_BY_ID.get(paletteId) || PALETTE_BY_ID.get('bw')).colors;
      entry = {
        colors: colors,
        lumas: colors.map(function (c) { return luma(c[0], c[1], c[2]); }),
        plans: new Map(),
      };
      YLL_CACHE.set(key, entry);
    }
    return entry;
  }

  // The plan metric: the squared distance between the target and the running
  // mean of the plan over every prefix, weighted by 1/k. The plan is applied
  // left to right across the screen, so every prefix *is* a tone the tile shows
  // — but an unweighted sum is dominated by the first entry and drives the
  // search towards a single colour, so the later (visually dominant) prefixes
  // carry proportionally more weight. The last prefix is the plan's mean, which
  // is exactly what a full tile averages to.
  // The plan metric is the squared distance between the target and the plan's
  // *mean* — the one thing a plan is really for. Every entry of a plan lands the
  // same number of times across a screen tile, so the plan's mean is exactly
  // what the tile renders to. (Yliluoma's published metric sums the error of
  // every prefix of the sorted plan instead; implemented literally that sum is
  // dominated by the first entry, which is whatever dark colour the plan holds,
  // so the search drifts towards a single colour per target and the tile loses
  // its tone — the opposite of the point.)
  // The plan metric is the squared distance between the target and the plan's
  // *mean*, which is the one thing a plan is really for: every entry of a plan
  // lands the same number of times across a screen tile, so the plan's mean is
  // exactly the tone the tile renders.
  //
  // Yliluoma's published metric sums the error of every *prefix* of the sorted
  // plan instead. Implemented literally that sum is dominated by the darkest
  // entry the plan holds — the first prefix — so the search drifts towards one
  // colour per target and the tile loses its tone, which is the opposite of the
  // point (measured: a flat 128 rendered at 207). Weighting the prefixes by 1/k
  // softens but does not fix it. A cohesion term on top of the mean was also
  // measured and dropped: it costs real tone accuracy (mean error 5.8 → 10.5
  // across a target sweep) to buy a modest 30% reduction in entry spread.
  //
  // The honest consequence: on a sparse, saturated palette a plan can mix
  // colours that are individually far from the target, so mixing on a photo
  // has a granular texture. That is the trade this family makes — pick a dense
  // palette (a greyscale ramp) or the two-colour variant for a calmer screen.
  function planError(plan, colors, target) {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < plan.length; i++) {
      const c = colors[plan[i]];
      r += c[0]; g += c[1]; b += c[2];
    }
    const k = plan.length || 1;
    const dr = r / k - target[0], dg = g / k - target[1], db = b / k - target[2];
    return dr * dr + dg * dg + db * db;
  }

  // The plan is kept as a luma-sorted multiset; inserting in place is cheaper
  // than re-sorting and keeps the search working on one canonical form.
  function insertSorted(plan, lumas, c) {
    let lo = 0, hi = plan.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lumas[plan[mid]] <= lumas[c]) lo = mid + 1;
      else hi = mid;
    }
    plan.splice(lo, 0, c);
    return lo;
  }

  // The candidate set for a target: its nearest palette colours, plus the two
  // extremes, which is what lets a plan reach a tone no single entry has.
  function nearestCandidates(entry, target, count) {
    const colors = entry.colors;
    const order = [];
    for (let i = 0; i < colors.length; i++) {
      const dr = colors[i][0] - target[0], dg = colors[i][1] - target[1], db = colors[i][2] - target[2];
      order.push([dr * dr + dg * dg + db * db, i]);
    }
    order.sort(function (a, b) { return a[0] - b[0]; });
    const out = [];
    for (let i = 0; i < Math.min(count, order.length); i++) out.push(order[i][1]);
    let lo = 0, hi = 0;
    for (let i = 1; i < colors.length; i++) {
      if (entry.lumas[i] < entry.lumas[lo]) lo = i;
      if (entry.lumas[i] > entry.lumas[hi]) hi = i;
    }
    if (out.indexOf(lo) < 0) out.push(lo);
    if (out.indexOf(hi) < 0) out.push(hi);
    return out;
  }

  // Option 2: the two palette colours whose convex mixture best fits the target.
  function pairMixPlan(colors, target) {
    let bi = 0, bj = 0, bt = 0, bestErr = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const a = colors[i];
      for (let j = 0; j < colors.length; j++) {
        const c = colors[j];
        const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
        const len = dx * dx + dy * dy + dz * dz;
        let t = 0;
        if (len > 0) {
          t = ((target[0] - a[0]) * dx + (target[1] - a[1]) * dy + (target[2] - a[2]) * dz) / len;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
        }
        const mr = a[0] + t * dx - target[0], mg = a[1] + t * dy - target[1], mb = a[2] + t * dz - target[2];
        const err = mr * mr + mg * mg + mb * mb;
        if (err < bestErr) { bestErr = err; bi = i; bj = j; bt = t; }
      }
    }
    const n = Math.round(bt * YLL_STEPS);
    const plan = [];
    for (let i = 0; i < YLL_STEPS; i++) plan.push(i < YLL_STEPS - n ? bi : bj);
    const lumas = colors.map(function (c) { return luma(c[0], c[1], c[2]); });
    plan.sort(function (a, b) { return lumas[a] - lumas[b]; });
    return plan;
  }

  // Options 3/4: start from the best two-colour mix — an exhaustive search, so
  // the plan can never come out worse than option 2 — then improve it slot by
  // slot, trying every candidate colour in every slot and keeping what lowers
  // the error. Option 3 does one sweep over the target's nearest colours;
  // option 4 sweeps the whole palette three times, which is where its extra
  // quality comes from. Sweeps only ever accept improvements, so each variant
  // is bounded from above by the one before it.
  function searchPlan(entry, target, polish) {
    const colors = entry.colors, lumas = entry.lumas;
    const sweeps = polish ? 3 : 1;
    const cand = nearestCandidates(entry, target, polish ? colors.length : YLL_CANDIDATES);
    const plan = pairMixPlan(colors, target).slice();
    for (let pass = 0; pass < sweeps; pass++) {
      let improved = false;
      for (let i = 0; i < plan.length; i++) {
        const removed = plan.splice(i, 1)[0];
        let best = removed, bestErr = Infinity;
        for (let ci = 0; ci < cand.length; ci++) {
          const c = cand[ci];
          const at = insertSorted(plan, lumas, c);
          const err = planError(plan, colors, target);
          if (err < bestErr) { bestErr = err; best = c; }
          plan.splice(at, 1);
        }
        insertSorted(plan, lumas, best);
        if (best !== removed) improved = true;
      }
      if (!improved) break;
    }
    while (plan.length < YLL_STEPS) plan.push(plan[plan.length - 1]);
    if (plan.length > YLL_STEPS) plan.length = YLL_STEPS;
    return plan;
  }

  function buildPlan(entry, option, target, key) {
    let plan = entry.plans.get(key);
    if (plan) return plan;
    const colors = entry.colors;
    const found = option === 2 ? pairMixPlan(colors, target) : searchPlan(entry, target, option === 4);
    const out = new Uint8Array(YLL_STEPS);
    for (let i = 0; i < YLL_STEPS; i++) out[i] = found[i];
    entry.plans.set(key, out);
    return out;
  }

  // The ordered-screen rank, reshaped by the strength knob, as a plan index.
  function planIndex(rank, strength) {
    const k = strength / 100;
    let r = k === 1 ? rank : 0.5 + (rank - 0.5) * k;
    if (r < 0) r = 0;
    if (r > 0.999999) r = 0.999999;
    return (r * YLL_STEPS) | 0;
  }

  /* --- mono path ------------------------------------------------------ */

  // lumaIn: Float32Array (one per pixel). Returns Uint8ClampedArray of 0/255.
  function ditherMono(lumaIn, w, h, algo, settings, rng, screen) {
    const bias = 128 - settings.threshold;  // threshold = exposure bias
    const k = settings.ditherStrength / 100;
    const n = w * h;
    const out = new Uint8ClampedArray(n);
    const kind = algo.kind;

    if (kind === 'threshold' || kind === 'ordered' || kind === 'noise' || kind === 'bluenoise' ||
        kind === 'clustered-noise' || kind === 'formula' || kind === 'structure') {
      const mat = kind === 'ordered' ? matrixFor(algo.id) : null;
      const m = mat ? Math.round(Math.sqrt(mat.length)) : 0;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const i = row + x;
          const limit = scaleMask(maskValue(algo, x, y, i, settings, rng, mat, m, screen), k);
          out[i] = lumaIn[i] + bias > limit ? 255 : 0;
        }
      }
      return out;
    }

    if (kind === 'yliluoma') {
      // The mono path only ever runs with the B&W palette, so a plan entry is
      // either black or white: out is a hard read of the chosen entry.
      const entry = yllEntry('bw', algo.option, true);
      const screen = yliluomaScreen();
      const sm = Math.round(Math.sqrt(screen.length));
      const planLuma = entry.luma || (entry.luma = entry.colors.map(function (c) { return luma(c[0], c[1], c[2]); }));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const v = clamp255(lumaIn[i] + bias);
          const bin = clampInt(Math.round((v / 255) * (YLL_MONO_LEVELS - 1)), 0, YLL_MONO_LEVELS - 1);
          const plan = buildPlan(entry, algo.option, [v, v, v], bin);
          const idx = planIndex(screen[(y % sm) * sm + (x % sm)], settings.ditherStrength);
          out[i] = planLuma[plan[idx]] > 127 ? 255 : 0;
        }
      }
      return out;
    }

    // error diffusion
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = lumaIn[i] + bias;
    if (algo.kernel === 'riemersma') {
      riemersmaMono(f, w, h, out, k);
    } else {
      const coeffs = scaledCoeffs(algo, settings.ditherStrength);
      const variable = algo.kernel === 'ostromoukhov';
      diffuse(f, w, h, out, coeffs, variable, settings.serpentine, k);
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
  // With serpentine on, every other row runs right to left and the kernel is
  // mirrored to match, which is what stops Floyd–Steinberg's diagonal worms.
  function diffuse(f, w, h, out, coeffs, variable, serpentine, k) {
    const rev = serpentine ? mirrorCoeffs(coeffs) : null;
    for (let y = 0; y < h; y++) {
      const back = rev !== null && (y & 1) === 1;
      const use = back ? rev : coeffs;
      for (let s = 0; s < w; s++) {
        const x = back ? w - 1 - s : s;
        const i = y * w + x;
        const v = f[i];
        const snapped = v > 128 ? 255 : 0;
        out[i] = snapped;
        const err = v - snapped;
        if (variable) {
          const band = clampInt(Math.floor(v / 8), 0, 31) * 4;
          const div = OSTROMOUKHOV[band + 3];
          if (div === 0) continue;
          const dir = back ? -1 : 1;
          scatter1(f, w, h, y, x, err, [
            [0, dir, (OSTROMOUKHOV[band] / div) * k],
            [1, -dir, (OSTROMOUKHOV[band + 1] / div) * k],
            [1, 0, (OSTROMOUKHOV[band + 2] / div) * k],
          ]);
        } else {
          scatter1(f, w, h, y, x, err, use);
        }
      }
    }
  }

  const RIEMERSMA_LEN = 16;
  const RIEMERSMA_DECAY = 1 / RIEMERSMA_LEN;

  // Riemersma carries a queue of sixteen errors and holds the *sum* of it into
  // the current pixel (each entry is stored pre-scaled by the decay), so the
  // full error travels along the serpentine path.
  function riemersmaMono(f, w, h, out, k) {
    const queue = new Float32Array(RIEMERSMA_LEN);
    let head = 0;
    for (let y = 0; y < h; y++) {
      const leftToRight = (y & 1) === 0;
      for (let s = 0; s < w; s++) {
        const x = leftToRight ? s : w - 1 - s;
        const i = y * w + x;
        let carried = 0;
        for (let q = 0; q < RIEMERSMA_LEN; q++) carried += queue[q];
        const v = f[i] + carried;
        const snapped = v > 128 ? 255 : 0;
        out[i] = snapped;
        queue[head] = (v - snapped) * RIEMERSMA_DECAY * k;
        head = (head + 1) % RIEMERSMA_LEN;
      }
    }
  }

  /* --- palette path --------------------------------------------------- */

  const ORDERED_JITTER = 0.3;  // mask amplitude for palette mode, in 0..255
  const LUT_BITS = 4;          // per-channel target bins for the mixing plans

  function ditherPalette(f, w, h, algo, settings, rng, screen) {
    const palette = PALETTE_BY_ID.get(settings.palette) || PALETTE_BY_ID.get('bw');
    const colors = palette.colors;
    const lut = paletteLut(palette.id);
    const n = w * h;
    const out = new Uint8ClampedArray(n * 3);
    const kind = algo.kind;
    const k = settings.ditherStrength / 100;

    function write(i, idx) {
      const c = colors[idx];
      out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
    }

    if (kind === 'threshold') {
      for (let i = 0; i < n; i++) write(i, snapIndex(lut, f[i * 3], f[i * 3 + 1], f[i * 3 + 2]));
      return out;
    }

    if (kind === 'ordered' || kind === 'noise' || kind === 'bluenoise' ||
        kind === 'clustered-noise' || kind === 'formula' || kind === 'structure') {
      const mat = kind === 'ordered' ? matrixFor(algo.id) : null;
      const m = mat ? Math.round(Math.sqrt(mat.length)) : 0;
      const amp = ORDERED_JITTER * k;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const d = (maskValue(algo, x, y, i, settings, rng, mat, m, screen) - 128) * amp;
          write(i, snapIndex(lut, f[i * 3] + d, f[i * 3 + 1] + d, f[i * 3 + 2] + d));
        }
      }
      return out;
    }

    if (kind === 'yliluoma') {
      // Each pixel's colour is binned, a mixing plan is built for that bin, and
      // the ordered screen's rank selects an entry from the plan.
      const entry = yllEntry(palette.id, algo.option, false);
      const screen = yliluomaScreen();
      const sm = Math.round(Math.sqrt(screen.length));
      const step = 256 >> LUT_BITS;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 3;
          const br = clampInt(Math.floor(clamp255(f[i]) / step), 0, (1 << LUT_BITS) - 1);
          const bg = clampInt(Math.floor(clamp255(f[i + 1]) / step), 0, (1 << LUT_BITS) - 1);
          const bb = clampInt(Math.floor(clamp255(f[i + 2]) / step), 0, (1 << LUT_BITS) - 1);
          const key = (br << (LUT_BITS * 2)) | (bg << LUT_BITS) | bb;
          const plan = buildPlan(entry, algo.option, [br * step + step / 2, bg * step + step / 2, bb * step + step / 2], key);
          const idx = planIndex(screen[(y % sm) * sm + (x % sm)], settings.ditherStrength);
          write(y * w + x, plan[idx]);
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
        for (let s = 0; s < w; s++) {
          const x = leftToRight ? s : w - 1 - s;
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
          queue[head * 3] = (r - c[0]) * RIEMERSMA_DECAY * k;
          queue[head * 3 + 1] = (g - c[1]) * RIEMERSMA_DECAY * k;
          queue[head * 3 + 2] = (b - c[2]) * RIEMERSMA_DECAY * k;
          head = (head + 1) % RIEMERSMA_LEN;
        }
      }
      return out;
    }

    const coeffs = scaledCoeffs(algo, settings.ditherStrength);
    const variable = algo.kernel === 'ostromoukhov';
    const rev = settings.serpentine ? mirrorCoeffs(coeffs) : null;

    for (let y = 0; y < h; y++) {
      const back = rev !== null && (y & 1) === 1;
      const use = back ? rev : coeffs;
      for (let s = 0; s < w; s++) {
        const x = back ? w - 1 - s : s;
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
          const dir = back ? -1 : 1;
          scatter3(buf, w, h, y, x, er, eg, eb, [
            [0, dir, (OSTROMOUKHOV[band] / div) * k],
            [1, -dir, (OSTROMOUKHOV[band + 1] / div) * k],
            [1, 0, (OSTROMOUKHOV[band + 2] / div) * k],
          ]);
        } else {
          scatter3(buf, w, h, y, x, er, eg, eb, use);
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
    {
      id: 'grain', name: 'Grain', hint: 'seeded noise over the frame',
      modes: [{ id: 'mono', name: 'Monochrome' }, { id: 'colour', name: 'Colour' }],
    },
    {
      id: 'pixelsort', name: 'Pixel sort', hint: 'sorts bright runs by luminance',
      modes: [{ id: 'rows', name: 'Rows' }, { id: 'cols', name: 'Columns' }],
    },
    { id: 'wave', name: 'Wave ripple', hint: 'sine-displaces every row sideways' },
    { id: 'drip', name: 'Drip', hint: 'columns slide down and smear' },
    {
      id: 'kaleidoscope', name: 'Kaleidoscope', hint: 'mirrors the frame into wedges',
      modes: [{ id: '2', name: '2-way' }, { id: '4', name: '4-way' }, { id: '8', name: '8-way' }],
    },
    { id: 'deadpixels', name: 'Dead pixels', hint: 'stuck black and white pixels' },
    { id: 'vignette', name: 'Vignette', hint: 'darkens the corners' },
    { id: 'crt', name: 'CRT bloom & warp', hint: 'barrel warp plus a bright bloom pass' },
    {
      id: 'ripple', name: 'Ripple & swirl', hint: 'displaces pixels along rings, a vortex or noise',
      modes: [{ id: 'ripple', name: 'Rings' }, { id: 'swirl', name: 'Swirl' }, { id: 'turbulence', name: 'Turbulence' }],
    },
    {
      id: 'starfield', name: 'Starfield', hint: 'sparse glowing dust and stars',
      modes: [{ id: 'stars', name: 'Stars (dark areas)' }, { id: 'dust', name: 'Dust (everywhere)' }],
    },
  ];
  const GLITCH_BY_ID = new Map(GLITCHES.map(function (g) { return [g.id, g]; }));
  // The stack position and the effect's own index both fold into each effect's
  // RNG, so reordering the stack changes the frame without touching the seed.
  const GLITCH_SEED_INDEX = new Map(GLITCHES.map(function (g, i) { return [g.id, i + 1]; }));

  function applyGlitchStack(rgba, w, h, stack, seed) {
    for (let s = 0; s < stack.length; s++) {
      const item = stack[s];
      const amount = clampInt(item.amount, 0, 100);
      if (amount <= 0) continue;
      const idx = GLITCH_SEED_INDEX.get(item.id) || 1;
      const rng = makeRng((((seed >>> 0) ^ hash32(s + 1)) ^ hash32(idx)) >>> 0);
      GLITCH_FNS[item.id](rgba, w, h, amount, rng, item.mode);
    }
    return rgba;
  }

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

  function glitchGrain(d, w, h, amount, rng, mode) {
    const amp = (amount / 100) * 90;
    const n = w * h;
    const chroma = mode === 'colour';
    for (let i = 0; i < n; i++) {
      const noise = (rng() - 0.5) * amp;
      const p = i * 4;
      d[p] = clamp255(d[p] + (chroma ? (rng() - 0.5) * amp : noise));
      d[p + 1] = clamp255(d[p + 1] + noise);
      d[p + 2] = clamp255(d[p + 2] + (chroma ? (rng() - 0.5) * amp : noise));
    }
  }

  function glitchPixelSort(d, w, h, amount, rng, mode) {
    // Rows by default; in column mode the same sweep runs top to bottom.
    const cols = mode === 'cols';
    const span = cols ? h : w;
    const lines = cols ? w : h;
    const cutoff = 220 - (amount / 100) * 160;
    const lineLuma = new Float32Array(span);
    const order = [];
    for (let line = 0; line < lines; line++) {
      let i0, step;
      if (cols) { i0 = line * 4; step = w * 4; }
      else { i0 = line * w * 4; step = 4; }
      for (let s = 0; s < span; s++) {
        const i = i0 + s * step;
        lineLuma[s] = luma(d[i], d[i + 1], d[i + 2]);
      }
      let s = 0;
      while (s < span) {
        if (lineLuma[s] < cutoff) { s++; continue; }
        let s1 = s;
        while (s1 < span && lineLuma[s1] >= cutoff) s1++;
        if (s1 - s > 2) {
          // Reorder the run's pixels by luminance, darkest first, writing them
          // back in order so the run reads as a gradient.
          order.length = 0;
          for (let k = s; k < s1; k++) order.push([lineLuma[k], k]);
          order.sort(function (a, b) { return a[0] - b[0]; });
          const colors = order.map(function (pair) {
            const i = i0 + pair[1] * step;
            return [d[i], d[i + 1], d[i + 2]];
          });
          for (let k = 0; k < colors.length; k++) {
            const dest = i0 + (s + k) * step;
            d[dest] = colors[k][0]; d[dest + 1] = colors[k][1]; d[dest + 2] = colors[k][2];
          }
        }
        s = s1;
      }
    }
  }

  // Sine displacement per row — the classic analogue-tape wobble.
  function glitchWave(d, w, h, amount, rng, mode) {
    const src = d.slice();
    const amp = Math.max(1, Math.round((amount / 100) * Math.min(w, h) * 0.06));
    const period = 12 + rng() * 40;
    const phase = rng() * Math.PI * 2;
    for (let y = 0; y < h; y++) {
      const shift = Math.round(Math.sin((y / period) * Math.PI * 2 + phase) * amp);
      if (shift === 0) continue;
      for (let x = 0; x < w; x++) {
        const sx = (((x + shift) % w) + w) % w;
        const si = (y * w + sx) * 4, di = (y * w + x) * 4;
        d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2];
      }
    }
  }

  // Columns slide down and smear the pixels above them into the gap.
  function glitchDrip(d, w, h, amount, rng, mode) {
    const src = d.slice();
    const maxDrop = Math.round((amount / 100) * h * 0.35);
    if (maxDrop <= 0) return;
    let x = 0;
    while (x < w) {
      const strip = 1 + Math.floor(rng() * 5);
      const x1 = Math.min(w, x + strip);
      const drop = Math.round(rng() * maxDrop);
      for (let cx = x; cx < x1; cx++) {
        for (let y = 0; y < h; y++) {
          const sy = y - drop;
          const si = ((sy < 0 ? 0 : sy) * w + cx) * 4;
          const di = (y * w + cx) * 4;
          d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2];
        }
      }
      x = x1;
    }
  }

  // Mirrors the frame: 2-way across the vertical axis, 4-way into quadrants,
  // 8-way in polar wedges around the centre.
  function glitchKaleidoscope(d, w, h, amount, rng, mode) {
    const segs = mode === '2' ? 2 : mode === '8' ? 8 : 4;
    const src = d.slice();
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sx, sy;
        if (segs === 2) {
          sx = x < cx ? w - 1 - x : x;
          sy = y;
        } else if (segs === 4) {
          sx = x < cx ? w - 1 - x : x;
          sy = y < cy ? h - 1 - y : y;
        } else {
          const dx = x - cx, dy = y - cy;
          const r = Math.sqrt(dx * dx + dy * dy);
          const wedge = (Math.PI * 2) / segs;
          let a = Math.atan2(dy, dx);
          a = ((a % wedge) + wedge) % wedge;
          if (a > wedge / 2) a = wedge - a;
          sx = Math.round(cx + Math.cos(a) * r);
          sy = Math.round(cy + Math.sin(a) * r);
          sx = clampInt(sx, 0, w - 1);
          sy = clampInt(sy, 0, h - 1);
        }
        const si = (sy * w + sx) * 4, di = (y * w + x) * 4;
        d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2];
      }
    }
  }

  function glitchDeadPixels(d, w, h, amount, rng, mode) {
    const density = (amount / 100) * 0.02;
    const n = w * h;
    for (let i = 0; i < n; i++) {
      if (rng() > density) continue;
      const p = i * 4;
      const v = rng() < 0.5 ? 0 : 255;
      d[p] = v; d[p + 1] = v; d[p + 2] = v;
    }
  }

  function glitchVignette(d, w, h, amount) {
    const k = (amount / 100) * 0.85;
    const cx = w / 2, cy = h / 2;
    const maxR2 = cx * cx + cy * cy;
    for (let y = 0; y < h; y++) {
      const dy = y - cy;
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const t = (dx * dx + dy * dy) / maxR2;
        const kk = 1 - k * t * t;
        const p = (y * w + x) * 4;
        d[p] *= kk; d[p + 1] *= kk; d[p + 2] *= kk;
      }
    }
  }

  // Barrel warp plus a linear-light bloom of the bright parts.
  function glitchCRT(d, w, h, amount, rng, mode) {
    const k = (amount / 100) * 0.22;
    const src = d.slice();
    for (let y = 0; y < h; y++) {
      const ny = (y / Math.max(1, h - 1)) * 2 - 1;
      for (let x = 0; x < w; x++) {
        const nx = (x / Math.max(1, w - 1)) * 2 - 1;
        const s = 1 + k * (nx * nx + ny * ny);
        const sx = clampInt(Math.round(((nx * s + 1) / 2) * (w - 1)), 0, w - 1);
        const sy = clampInt(Math.round(((ny * s + 1) / 2) * (h - 1)), 0, h - 1);
        const si = (sy * w + sx) * 4, di = (y * w + x) * 4;
        d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2];
      }
    }
    const bright = new Float32Array(w * h * 3);
    const cells = w * h;
    for (let i = 0; i < cells; i++) {
      const l = luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      const t = l > 170 ? (l - 170) / 85 : 0;
      bright[i * 3] = d[i * 4] * t;
      bright[i * 3 + 1] = d[i * 4 + 1] * t;
      bright[i * 3 + 2] = d[i * 4 + 2] * t;
    }
    boxBlurRGB(bright, w, h, 2);
    boxBlurRGB(bright, w, h, 2);
    const gain = 0.5 + (amount / 100) * 0.9;
    for (let i = 0; i < cells; i++) {
      for (let c = 0; c < 3; c++) {
        const a = SRGB_TO_LINEAR[d[i * 4 + c]];
        const bi = clampInt(Math.round(bright[i * 3 + c]), 0, 255);
        const b = SRGB_TO_LINEAR[bi] * gain;
        d[i * 4 + c] = linearToSrgb255(a + b);
      }
    }
  }

  // Displacement: rings out from the centre, a vortex, or a noise field. Reading
  // each destination from a displaced source is what lets a still melt the way
  // an analogue tape eats a frame.
  function glitchRipple(d, w, h, amount, rng, mode) {
    const src = d.slice();
    const k = amount / 100;
    const cx = w / 2, cy = h / 2;
    const lambda = Math.max(6, Math.round(Math.min(w, h) * (0.2 - 0.12 * k)));
    const amp = Math.max(1, Math.round(Math.min(w, h) * 0.07 * k));
    const phase = rng() * Math.PI * 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sx, sy;
        if (mode === 'swirl') {
          const dx = x - cx, dy = y - cy;
          const r = Math.sqrt(dx * dx + dy * dy) || 1;
          const a = (amp * 2.5) / Math.max(4, r);
          const c = Math.cos(a), s = Math.sin(a);
          sx = cx + dx * c - dy * s;
          sy = cy + dx * s + dy * c;
        } else if (mode === 'turbulence') {
          sx = x + (valueNoise(x, y, 0x51ed, 12) / 255 - 0.5) * amp * 3.2;
          sy = y + (valueNoise(x, y, 0x2b17, 12) / 255 - 0.5) * amp * 3.2;
        } else {
          const dx = x - cx, dy = y - cy;
          const r = Math.sqrt(dx * dx + dy * dy) || 1;
          const o = Math.sin((r / lambda) * Math.PI * 2 + phase) * amp;
          sx = x + (dx / r) * o;
          sy = y + (dy / r) * o;
        }
        const si = (clampInt(Math.round(sy), 0, h - 1) * w + clampInt(Math.round(sx), 0, w - 1)) * 4;
        const di = (y * w + x) * 4;
        d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2];
      }
    }
  }

  // Dust that glows: single bright pixels for the glow pass to bloom. In stars
  // mode they only take over the dark, which is what puts a figure in a night
  // sky instead of a snowstorm.
  function glitchStarfield(d, w, h, amount, rng, mode) {
    const density = (amount / 100) * (mode === 'dust' ? 0.006 : 0.002);
    const cells = w * h;
    for (let i = 0; i < cells; i++) {
      if (rng() > density) continue;
      const di = i * 4;
      if (mode !== 'dust' && luma(d[di], d[di + 1], d[di + 2]) > 96) continue;
      const gain = 0.5 + rng() * 0.5;
      d[di] = clamp255(d[di] + 230 * gain);
      d[di + 1] = clamp255(d[di + 1] + 240 * gain);
      d[di + 2] = clamp255(d[di + 2] + 255 * gain);
    }
  }

  const GLITCH_FNS = {
    aberration: glitchAberration,
    blocks: glitchBlocks,
    scanlines: glitchScanlines,
    grain: glitchGrain,
    pixelsort: glitchPixelSort,
    wave: glitchWave,
    drip: glitchDrip,
    kaleidoscope: glitchKaleidoscope,
    deadpixels: glitchDeadPixels,
    vignette: glitchVignette,
    crt: glitchCRT,
    ripple: glitchRipple,
    starfield: glitchStarfield,
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
        // Light adds in linear space, so a glow keeps its hue instead of
        // drifting towards white as the two screens overlap.
        const a = SRGB_TO_LINEAR[rgba[i * 4 + c]];
        const bi = clampInt(Math.round(glow[i * 3 + c]), 0, 255);
        rgba[i * 4 + c] = linearToSrgb255(a + SRGB_TO_LINEAR[bi] * k);
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

  const ALPHA_MODES = ['matte', 'sharpen', 'keep'];

  const DEFAULT_SETTINGS = {
    algorithm: 'floyd-steinberg',
    palette: 'bw',
    pixelSize: 2,
    threshold: 128,
    seed: 20261008,
    ditherStrength: 100,
    serpentine: false,
    screen: { smooth: 3, flow: 60, streak: 0 },
    screenShift: 0,
    alphaMode: 'matte',
    toneMap: 'none',
    toneInk: [0, 0, 0],
    tonePaper: [255, 255, 255],
    adjustments: { black: 0, white: 255, gamma: 1, brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, denoise: false },
    glitches: [],
    glow: { radius: 0, intensity: 0 },
  };

  function colorTriple(v, fallback) {
    if (!v || v.length < 3) return fallback.slice();
    return [clampInt(Math.round(num(v[0], fallback[0])), 0, 255), clampInt(Math.round(num(v[1], fallback[1])), 0, 255), clampInt(Math.round(num(v[2], fallback[2])), 0, 255)];
  }

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
      ditherStrength: clampInt(Math.round(num(s.ditherStrength, DEFAULT_SETTINGS.ditherStrength)), 0, 200),
      serpentine: !!s.serpentine,
      screen: {
        smooth: clampInt(Math.round(num((s.screen || {}).smooth, DEFAULT_SETTINGS.screen.smooth)), SCREEN_CELL_MIN, SCREEN_CELL_MAX),
        flow: clampInt(Math.round(num((s.screen || {}).flow, DEFAULT_SETTINGS.screen.flow)), 0, 100),
        streak: clampInt(Math.round(num((s.screen || {}).streak, DEFAULT_SETTINGS.screen.streak)), 0, 100),
      },
      // Runtime only: video playback slides tile screens frame by frame.
      screenShift: clampInt(Math.round(num(s.screenShift, 0)), 0, 1000000),
      alphaMode: ALPHA_MODES.indexOf(s.alphaMode) >= 0 ? s.alphaMode : DEFAULT_SETTINGS.alphaMode,
      toneMap: TONE_MAP_BY_ID.has(s.toneMap) ? s.toneMap : DEFAULT_SETTINGS.toneMap,
      toneInk: colorTriple(s.toneInk, DEFAULT_SETTINGS.toneInk),
      tonePaper: colorTriple(s.tonePaper, DEFAULT_SETTINGS.tonePaper),
      adjustments: {
        black: clampInt(Math.round(num(adj.black, 0)), 0, 255),
        white: clampInt(Math.round(num(adj.white, 255)), 0, 255),
        gamma: num(adj.gamma, 1),
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
      }).map(function (g) {
        const meta = GLITCH_BY_ID.get(g.id);
        const modes = meta.modes;
        const mode = modes && modes.some(function (m) { return m.id === g.mode; }) ? g.mode : (modes ? modes[0].id : undefined);
        return { id: g.id, amount: clampInt(Math.round(g.amount), 0, 100), mode: mode };
      }),
      glow: { radius: num(glow.radius, 0), intensity: num(glow.intensity, 0) },
    };
  }

  function num(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  // --- video: the temporal rules -------------------------------------------
  // Playing a clip turns the seed into a time axis, and there are three honest
  // ways to do that (the classic temporal-dither choices made explicit):
  //   freeze  — one screen for the whole clip: the calm, stable look.
  //   shimmer — a fresh seed per frame, so stochastic screens boil in place
  //             while the overall tone holds (the palette's mixes average out).
  //   crawl   — tile screens slide a pixel per frame, the classic ordered
  //             "walking" screen (structure screens are rebuilt instead, and
  //             ignore the shift).
  // The stride is the golden-ratio hash constant, so consecutive frames land
  // far apart in the generator's stream and never fall into a short cycle.
  const TEMPORAL_MODES = ['freeze', 'shimmer', 'crawl'];

  function temporalSettings(settings, frameIndex, mode) {
    const merged = mergeSettings(settings);
    const index = Math.max(0, Math.round(num(frameIndex, 0)));
    if (mode === 'shimmer') {
      merged.seed = (merged.seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    } else if (mode === 'crawl') {
      // The same bound mergeSettings applies, because this assignment happens
      // after that clamp rather than through it.
      merged.screenShift = clampInt(index, 0, 1000000);
    }
    return merged;
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

    // Alpha is averaged per chunk and carried beside the colour, never mixed
    // into it: the hidden RGB under a transparent pixel must not tint its
    // neighbours.
    const alphaSmall = settings.alphaMode === 'matte' ? null : downscaleAlpha(src, w, h, dw, dh);

    const algo = ALGORITHM_BY_ID.get(settings.algorithm) || ALGORITHM_BY_ID.get('floyd-steinberg');
    const rng = makeRng(settings.seed);
    // Structure-aware screens read the image, so they are built once, here, at
    // the chunk resolution the dither itself runs at.
    const screen = algo.kind === 'structure' ? buildScreen(data, dw, dh, algo, settings) : null;
    let rgb;
    if (settings.palette === 'bw') {
      const ln = dw * dh;
      const gray = new Float32Array(ln);
      for (let i = 0; i < ln; i++) gray[i] = luma(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
      const dithered = ditherMono(gray, dw, dh, algo, settings, rng, screen);
      rgb = new Uint8ClampedArray(ln * 3);
      for (let i = 0; i < ln; i++) {
        rgb[i * 3] = dithered[i];
        rgb[i * 3 + 1] = dithered[i];
        rgb[i * 3 + 2] = dithered[i];
      }
    } else {
      rgb = ditherPalette(data, dw, dh, algo, settings, rng, screen);
    }

    const colors = countColorsRGB(rgb);

    // Tone map sits between the press and the finishing: it re-inks the dither
    // rather than grading the photo, so 1-bit stays exactly two inks.
    if (settings.toneMap !== 'none') {
      const mapped = new Float32Array(dw * dh * 3);
      for (let i = 0; i < dw * dh * 3; i++) mapped[i] = rgb[i];
      applyToneMap(mapped, dw, dh, settings);
      for (let i = 0; i < dw * dh * 3; i++) rgb[i] = mapped[i];
    }

    const rgba = toRGBA(rgb, dw, dh);
    if (alphaSmall) applyAlpha(rgba, dw, dh, alphaSmall, settings);
    if (settings.glitches.length) applyGlitchStack(rgba, dw, dh, settings.glitches, settings.seed);
    if (settings.glow.radius > 0 && settings.glow.intensity > 0) {
      applyGlow(rgba, dw, dh, settings.glow.radius, settings.glow.intensity);
    }

    const out = dw === w && dh === h ? rgba : upscaleNearest(rgba, dw, dh, w, h);
    return { data: out, width: w, height: h, ms: now() - t0, colors: colors };
  }

  // Chunk-mean alpha, 0..1, from the source RGBA buffer.
  function downscaleAlpha(src, w, h, sw, sh) {
    const out = new Float32Array(sw * sh);
    for (let oy = 0; oy < sh; oy++) {
      const y0 = Math.floor((oy * h) / sh);
      const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * h) / sh));
      for (let ox = 0; ox < sw; ox++) {
        const x0 = Math.floor((ox * w) / sw);
        const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * w) / sw));
        let sum = 0, count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            sum += src[(y * w + x) * 4 + 3];
            count++;
          }
        }
        out[oy * sw + ox] = sum / count / 255;
      }
    }
    return out;
  }

  // Two ways to carry transparency through the press: `sharpen` dithers the
  // matte itself against a Bayer screen (hard edges, no grey), `keep` writes the
  // chunk average back out as a real alpha channel for PNG export.
  function applyAlpha(rgba, w, h, alphaSmall, settings) {
    const sharpen = settings.alphaMode === 'sharpen';
    const mat = sharpen ? matrixFor('bayer4') : null;
    const m = mat ? Math.round(Math.sqrt(mat.length)) : 0;
    const k = settings.ditherStrength / 100;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (sharpen) {
          const limit = scaleMask(mat[(y % m) * m + (x % m)], k) / 255;
          rgba[i * 4 + 3] = alphaSmall[i] > limit ? 255 : 0;
        } else {
          rgba[i * 4 + 3] = clamp255(Math.round(alphaSmall[i] * 255));
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */

  const DitherLib = {
    // constants
    DEFAULTS: DEFAULT_SETTINGS,
    ALGORITHMS: ALGORITHMS,
    PALETTES: PALETTES,
    GLITCHES: GLITCHES,
    KERNELS: KERNELS,
    TONE_MAPS: TONE_MAPS,
    ALPHA_MODES: ALPHA_MODES,
    // building blocks
    makeRng: makeRng,
    bayerRanks: bayerRanks,
    matrixFor: matrixFor,
    buildScreen: buildScreen,
    clusteredDotRanks: clusteredDotRanks,
    spiralRanks: spiralRanks,
    lineRanks: lineRanks,
    diagonalRanks: diagonalRanks,
    checksRanks: checksRanks,
    voidAndCluster: voidAndCluster,
    valueNoise: valueNoise,
    ignValue: ignValue,
    r2Value: r2Value,
    blueNoiseValue: blueNoiseValue,
    blueNoiseRanks: blueNoiseRanks,
    paletteLut: paletteLut,
    snapIndex: snapIndex,
    // mixing plans (Yliluoma)
    mixingPlan: function (paletteId, option, target) {
      const entry = yllEntry(paletteId, option, false);
      const key = 't' + ((target[0] & 255) << 16 | (target[1] & 255) << 8 | (target[2] & 255));
      return Array.prototype.slice.call(buildPlan(entry, option, target, key));
    },
    planError: planError,
    // stages
    applyAdjustments: applyAdjustments,
    applyToneMap: applyToneMap,
    applyGlitchStack: applyGlitchStack,
    applyGlow: applyGlow,
    applyAlpha: applyAlpha,
    downscaleAlpha: downscaleAlpha,
    countColors: countColorsRGB,
    // the pipeline
    mergeSettings: mergeSettings,
    temporalSettings: temporalSettings,
    TEMPORAL_MODES: TEMPORAL_MODES,
    process: process,
  };

  global.DitherLib = DitherLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DitherLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
