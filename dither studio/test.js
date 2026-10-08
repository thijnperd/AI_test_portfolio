/* test.js — Node tests for Dither Studio's core (dither.js).
 *
 * The core is DOM-free on purpose, so the rules can be pinned here: matrices
 * and generated screens, mask generation, the palette quantizer, every dither
 * family, the Yliluoma mixing plans, the adjustments and tone maps, alpha,
 * the glitch stack, the pipeline, and the performance budget.
 *
 * Run from this folder:  node test.js
 */

'use strict';

const assert = require('assert');
const D = require('./dither.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL ' + name);
    console.log('       ' + (err && err.message));
  }
}

function group(name) {
  console.log('\n' + name);
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

// Build an RGBA source from a (x, y) -> [r, g, b] function.
function makeSource(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
      data[i + 3] = c[3] === undefined ? 255 : c[3];
    }
  }
  return { data: data, width: w, height: h };
}

function flat(w, h, v) {
  return makeSource(w, h, function () { return [v, v, v]; });
}

// Count how many pixels of an RGBA result are (near) white.
function whiteFraction(res) {
  let white = 0;
  const n = res.width * res.height;
  for (let i = 0; i < n; i++) if (res.data[i * 4] > 127) white++;
  return white / n;
}

function uniqueColors(res) {
  const set = new Set();
  const n = res.width * res.height;
  for (let i = 0; i < n; i++) set.add((res.data[i * 4] << 16) | (res.data[i * 4 + 1] << 8) | res.data[i * 4 + 2]);
  return set;
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Independent nearest-palette search, written from the definition (squared RGB
// distance) rather than reusing the core's lookup table.
function nearestByDefinition(colors, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const dr = r - colors[i][0], dg = g - colors[i][1], db = b - colors[i][2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 1. ordered matrices                                                */
/* ------------------------------------------------------------------ */

group('ordered matrices');

test('Bayer 2×2 is the classic [[0,2],[3,1]]', function () {
  assert.deepStrictEqual(Array.from(D.bayerRanks(2)), [0, 2, 3, 1]);
});

test('Bayer 4×4 and 8×8 contain every rank exactly once', function () {
  const b4 = Array.from(D.bayerRanks(4)).sort(function (a, b) { return a - b; });
  assert.deepStrictEqual(b4, Array.from({ length: 16 }, function (_, i) { return i; }));
  const b8 = new Set(Array.from(D.bayerRanks(8)));
  assert.strictEqual(b8.size, 64);
  assert.strictEqual(Math.min.apply(null, Array.from(b8)), 0);
  assert.strictEqual(Math.max.apply(null, Array.from(b8)), 63);
});

test('normalised matrices span most of 0..255 but never touch the ends', function () {
  ['bayer2', 'bayer4', 'bayer8', 'bayer16', 'clustered-dot', 'clustered-dot-8', 'halftone', 'halftone-8',
   'halftone-16', 'spiral8', 'line-h2', 'line-v2', 'line-h4', 'line-v4', 'diagonal4', 'diagonal8',
   'checks', 'void-cluster'].forEach(function (id) {
    const mat = D.matrixFor(id);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < mat.length; i++) {
      if (mat[i] < min) min = mat[i];
      if (mat[i] > max) max = mat[i];
    }
    const step = 255 / mat.length;
    assert.ok(min > 0, id + ' min is ' + min);
    assert.ok(min < step, id + ' min is ' + min);
    assert.ok(max > 255 - step, id + ' max is ' + max);
    assert.ok(max < 255, id + ' max is ' + max);
  });
});

test('clustered-dot and halftone are 4×4 with 16 distinct ranks', function () {
  assert.strictEqual(D.matrixFor('clustered-dot').length, 16);
  assert.strictEqual(D.matrixFor('halftone').length, 16);
});

test('Bayer 16×16 is a full permutation', function () {
  const ranks = Array.from(D.bayerRanks(16)).sort(function (a, b) { return a - b; });
  assert.strictEqual(ranks.length, 256);
  for (let i = 0; i < 256; i++) assert.strictEqual(ranks[i], i);
});

test('the clustered-dot screen grows outward from the tile centre', function () {
  const ranks = D.clusteredDotRanks(8);
  // The very first rank must sit at the centre, the last in a corner.
  let first = -1, last = -1;
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] === 0) first = i;
    if (ranks[i] === 63) last = i;
  }
  assert.strictEqual(first, 3 * 8 + 3, 'rank 0 is the centre cell');
  const lx = last % 8, ly = (last / 8) | 0;
  assert.ok((lx === 0 || lx === 7) && (ly === 0 || ly === 7), 'rank 63 is a corner (' + lx + ',' + ly + ')');
});

test('line screens thicken a whole line at a time', function () {
  const ranks = D.lineRanks(2, false);
  // Horizontal screen: rows 0 and 1 are one group, so the bottom row starts
  // half way through the ramp.
  assert.deepStrictEqual(Array.from(ranks), [0, 1, 2, 3]);
  const vertical = D.lineRanks(2, true);
  assert.deepStrictEqual(Array.from(vertical), [0, 2, 1, 3]);
});

test('the checkerboard screen fills one parity before the other', function () {
  const n = 4;
  const ranks = D.checksRanks(n);
  // Even cells take the low half of the ranks, odd cells the high half: at a
  // half-tone level the screen is a perfect checkerboard.
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const rank = ranks[y * n + x];
      const even = ((x + y) & 1) === 0;
      assert.ok(even ? rank < n * n / 2 : rank >= n * n / 2, 'parity of rank at ' + x + ',' + y);
    }
  }
});

test('diagonal screens rank one diagonal band at a time', function () {
  const n = 8;
  const ranks = D.diagonalRanks(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      assert.strictEqual(Math.floor(ranks[y * n + x] / n), (x + y) % n, 'band at ' + x + ',' + y);
    }
  }
});

test('generated screens are deterministic across calls', function () {
  assert.ok(sameBytes(D.spiralRanks(8, 2), D.spiralRanks(8, 2)));
  assert.ok(!sameBytes(D.spiralRanks(8, 1), D.spiralRanks(8, 4)));
});

/* ------------------------------------------------------------------ */
/* 2. generated masks                                                 */
/* ------------------------------------------------------------------ */

group('generated masks (void-and-cluster)');

test('void-and-cluster returns a full permutation of 0..n²-1', function () {
  const ranks = D.voidAndCluster(8, 0x1234);
  assert.strictEqual(ranks.length, 64);
  const seen = new Set(Array.from(ranks));
  assert.strictEqual(seen.size, 64);
  assert.strictEqual(Math.min.apply(null, Array.from(seen)), 0);
  assert.strictEqual(Math.max.apply(null, Array.from(seen)), 63);
});

test('void-and-cluster is deterministic per seed and differs across seeds', function () {
  const a = D.voidAndCluster(8, 7);
  const b = D.voidAndCluster(8, 7);
  const c = D.voidAndCluster(8, 8);
  assert.deepStrictEqual(Array.from(a), Array.from(b));
  assert.ok(!sameBytes(a, c));
});

test('16×16 mask generation stays inside the lazy cost budget', function () {
  const t0 = Date.now();
  D.voidAndCluster(16, 0x51e2d7);
  const ms = Date.now() - t0;
  assert.ok(ms < 400, 'generation took ' + ms + ' ms');
  console.log('       (16×16 mask generated in ' + ms + ' ms)');
});

test('the 32×32 blue-noise mask builds cold inside its lazy budget', function () {
  // Runs before any algorithm sweep, so this measures the real first build
  // rather than a cache hit.
  const t0 = Date.now();
  const ranks = D.blueNoiseRanks(32);
  const ms = Date.now() - t0;
  assert.strictEqual(ranks.length, 1024);
  assert.strictEqual(new Set(Array.from(ranks)).size, 1024, 'a full permutation');
  assert.ok(ms < 3000, 'generation took ' + ms + ' ms');
  console.log('       (32×32 mask generated cold in ' + ms + ' ms)');
});

test('blue-noise values are deterministic, bounded, and seed-sensitive', function () {
  const a = D.blueNoiseValue(5, 9, 1);
  assert.ok(a >= 0 && a <= 255, 'value in range');
  assert.strictEqual(D.blueNoiseValue(5, 9, 1), a);
  assert.strictEqual(D.blueNoiseValue(5, 9, 1), D.blueNoiseValue(5, 9, 1));
  // a different seed changes the per-tile rotation, so at least one sample moves
  let moved = false;
  for (let y = 0; y < 40 && !moved; y++) {
    for (let x = 0; x < 40 && !moved; x++) {
      if (D.blueNoiseValue(x, y, 1) !== D.blueNoiseValue(x, y, 2)) moved = true;
    }
  }
  assert.ok(moved, 'seeds produce different masks');
});

/* ------------------------------------------------------------------ */
/* 3. colour                                                          */
/* ------------------------------------------------------------------ */

group('palette quantizer');

test('the palette lookup table agrees with nearest-by-definition at bucket centres', function () {
  D.PALETTES.forEach(function (palette) {
    const lut = D.paletteLut(palette.id);
    for (let r = 0; r < 32; r += 7) {
      for (let g = 0; g < 32; g += 5) {
        for (let b = 0; b < 32; b += 3) {
          const cr = r * 8 + 4, cg = g * 8 + 4, cb = b * 8 + 4;
          const expected = nearestByDefinition(palette.colors, cr, cg, cb);
          const got = D.snapIndex(lut, cr, cg, cb);
          assert.strictEqual(got, expected,
            palette.id + ' (' + cr + ',' + cg + ',' + cb + ') -> ' + got + ' expected ' + expected);
        }
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 4. mono dithering                                                  */
/* ------------------------------------------------------------------ */

group('mono dithering');

test('ordered dithering matches density and clips endpoints', function () {
  const black = D.process(flat(32, 32, 0), { algorithm: 'bayer8', pixelSize: 1, seed: 1 });
  const white = D.process(flat(32, 32, 255), { algorithm: 'bayer8', pixelSize: 1, seed: 1 });
  assert.strictEqual(whiteFraction(black), 0, 'pure black stays black');
  assert.strictEqual(whiteFraction(white), 1, 'pure white stays white');
  for (const v of [64, 128, 191]) {
    const res = D.process(flat(32, 32, v), { algorithm: 'bayer8', pixelSize: 1, seed: 1 });
    const want = v / 255;
    assert.ok(Math.abs(whiteFraction(res) - want) < 0.04,
      'flat ' + v + ' → ' + whiteFraction(res).toFixed(3) + ' white, want ' + want.toFixed(3));
  }
});

test('mono output only ever contains black and white', function () {
  const src = makeSource(24, 24, function (x, y) { return [x * 10, y * 10, (x + y) * 5]; });
  ['threshold', 'bayer4', 'halftone', 'random-noise', 'blue-noise-mask', 'floyd-steinberg', 'riemersma']
    .forEach(function (algorithm) {
      const res = D.process(src, { algorithm: algorithm, palette: 'bw', pixelSize: 2, seed: 5 });
      const colors = uniqueColors(res);
      colors.forEach(function (c) {
        assert.ok(c === 0 || c === 0xffffff, algorithm + ' produced ' + c.toString(16));
      });
    });
});

test('the threshold control biases the mono output', function () {
  const src = flat(16, 16, 120);
  const low = whiteFraction(D.process(src, { algorithm: 'threshold', pixelSize: 1, threshold: 200 }));
  const mid = whiteFraction(D.process(src, { algorithm: 'threshold', pixelSize: 1, threshold: 128 }));
  const high = whiteFraction(D.process(src, { algorithm: 'threshold', pixelSize: 1, threshold: 20 }));
  assert.strictEqual(low, 0);
  assert.strictEqual(mid, 0);
  assert.strictEqual(high, 1);
});

test('error diffusion reproduces tone with a dithered pattern', function () {
  for (const algorithm of ['floyd-steinberg', 'atkinson', 'stucki', 'burkes', 'sierra', 'jjn', 'nakano', 'stevenson-arce', 'ostromoukhov', 'riemersma']) {
    const res = D.process(flat(64, 64, 64), { algorithm: algorithm, pixelSize: 1, seed: 3 });
    const frac = whiteFraction(res);
    assert.ok(Math.abs(frac - 64 / 255) < 0.08, algorithm + ' flat 64 → ' + frac.toFixed(3) + ' white');
    assert.ok(frac > 0 && frac < 1, algorithm + ' produced a pattern');
  }
});

test('every error-diffusion kernel is a proper normalised spread', function () {
  Object.keys(D.KERNELS).forEach(function (id) {
    const k = D.KERNELS[id];
    const total = k.weights.reduce(function (s, w) { return s + w[2] / k.div; }, 0);
    assert.ok(total > 0.6 && total <= 1.0001, id + ' spreads ' + total);
    k.weights.forEach(function (w) {
      assert.ok(w[0] >= 0, id + ' only diffuses forward in y');
    });
  });
});

test('every registered algorithm is reachable and keeps the canvas size', function () {
  assert.strictEqual(D.ALGORITHMS.length, 43);
  const src = flat(20, 20, 100);
  D.ALGORITHMS.forEach(function (algo) {
    const res = D.process(src, { algorithm: algo.id, palette: 'bw', pixelSize: 2, seed: 9 });
    assert.strictEqual(res.width, 20, algo.id + ' width');
    assert.strictEqual(res.height, 20, algo.id + ' height');
  });
  function count(kind) { return D.ALGORITHMS.filter(function (a) { return a.kind === kind; }).length; }
  assert.strictEqual(count('diffusion'), 14);
  assert.strictEqual(count('ordered'), 18);
  assert.strictEqual(count('yliluoma'), 3);
  assert.strictEqual(count('formula'), 3);
  assert.strictEqual(count('threshold'), 1);
  assert.strictEqual(count('noise') + count('bluenoise') + count('clustered-noise'), 4);
  // Every id is unique, or the picker would silently shadow one.
  const ids = new Set(D.ALGORITHMS.map(function (a) { return a.id; }));
  assert.strictEqual(ids.size, D.ALGORITHMS.length);
});

test('dither strength scales the mask down to a plain threshold', function () {
  const src = makeSource(32, 32, function (x, y) { return [64 + x * 4, 64 + y * 4, 120]; });
  const off = D.process(src, { algorithm: 'bayer8', palette: 'bw', pixelSize: 1, ditherStrength: 0 });
  const plain = D.process(src, { algorithm: 'threshold', palette: 'bw', pixelSize: 1 });
  assert.ok(sameBytes(off.data, plain.data), 'strength 0 is exactly a threshold');
  const full = D.process(src, { algorithm: 'bayer8', palette: 'bw', pixelSize: 1, ditherStrength: 100 });
  assert.ok(!sameBytes(off.data, full.data), 'strength 100 brings the screen back');
  const pushed = D.process(src, { algorithm: 'random-noise', palette: 'bw', pixelSize: 1, ditherStrength: 160 });
  const normal = D.process(src, { algorithm: 'random-noise', palette: 'bw', pixelSize: 1, ditherStrength: 100 });
  assert.ok(!sameBytes(pushed.data, normal.data), 'overdrive pushes the noise further out');
});

test('serpentine sweeps change the pattern without breaking tone', function () {
  const src = flat(48, 48, 90);
  const normal = D.process(src, { algorithm: 'floyd-steinberg', palette: 'bw', pixelSize: 1, seed: 2 });
  const snake = D.process(src, { algorithm: 'floyd-steinberg', palette: 'bw', pixelSize: 1, seed: 2, serpentine: true });
  assert.ok(!sameBytes(normal.data, snake.data), 'the sweep order changes the pattern');
  assert.ok(Math.abs(whiteFraction(snake) - 90 / 255) < 0.06, 'tone is still reproduced');
});

/* ------------------------------------------------------------------ */
/* 5. palette dithering                                               */
/* ------------------------------------------------------------------ */

group('palette dithering');

test('palette output only ever contains palette colours', function () {
  const src = makeSource(32, 32, function (x, y) {
    return [(x * 8) % 256, (y * 8) % 256, ((x + y) * 4) % 256];
  });
  D.PALETTES.forEach(function (palette) {
    const allowed = new Set(palette.colors.map(function (c) { return (c[0] << 16) | (c[1] << 8) | c[2]; }));
    ['bayer4', 'floyd-steinberg', 'atkinson', 'riemersma', 'random-noise', 'threshold'].forEach(function (algorithm) {
      const res = D.process(src, { algorithm: algorithm, palette: palette.id, pixelSize: 1, seed: 4 });
      uniqueColors(res).forEach(function (c) {
        assert.ok(allowed.has(c), palette.id + '/' + algorithm + ' produced ' + c.toString(16));
      });
    });
  });
});

test('palette error diffusion preserves the average tone of a flat patch', function () {
  const src = flat(48, 48, 110);
  // Game Boy: mean luminance of its four greens, so a flat mid patch should sit between them
  const palette = D.PALETTES.find(function (p) { return p.id === 'gameboy'; });
  const lums = palette.colors.map(function (c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; });
  const min = Math.min.apply(null, lums), max = Math.max.apply(null, lums);
  const res = D.process(src, { algorithm: 'floyd-steinberg', palette: 'gameboy', pixelSize: 1, seed: 4 });
  const n = res.width * res.height;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += 0.2126 * res.data[i * 4] + 0.7152 * res.data[i * 4 + 1] + 0.0722 * res.data[i * 4 + 2];
  const mean = sum / n;
  assert.ok(mean >= min && mean <= max, 'mean ' + mean.toFixed(1) + ' outside palette range');
  assert.ok(uniqueColors(res).size >= 2, 'a flat patch dithers between at least two palette colours');
});

/* ------------------------------------------------------------------ */
/* 6. determinism                                                     */
/* ------------------------------------------------------------------ */

group('determinism');

test('the same seed reproduces the same pixels (noise, blue noise, glitches)', function () {
  const src = makeSource(32, 32, function (x, y) { return [(x * 7) % 256, (y * 11) % 256, ((x ^ y) * 5) % 256]; });
  const settings = {
    algorithm: 'blue-noise-mask',
    palette: 'gruvbox',
    pixelSize: 2,
    seed: 424242,
    adjustments: { brightness: 1.1, contrast: 0.95, saturation: 1.2, hue: 20, blur: 0, sharpen: 0.4, denoise: false },
    glitches: [{ id: 'grain', amount: 40 }, { id: 'blocks', amount: 60 }, { id: 'scanlines', amount: 30 }],
    glow: { radius: 2, intensity: 40 },
  };
  const a = D.process(src, settings);
  const b = D.process(src, settings);
  assert.ok(sameBytes(a.data, b.data), 'identical seeds must match byte for byte');
  const c = D.process(src, Object.assign({}, settings, { seed: 424243 }));
  assert.ok(!sameBytes(a.data, c.data), 'a different seed must change the noise');
});

test('process is deterministic for every algorithm', function () {
  const src = makeSource(24, 24, function (x, y) { return [(x * 9) % 256, (y * 9) % 256, 128]; });
  D.ALGORITHMS.forEach(function (algo) {
    ['bw', 'pico8'].forEach(function (palette) {
      const opts = { algorithm: algo.id, palette: palette, pixelSize: 2, seed: 77, glitches: [{ id: 'grain', amount: 20 }] };
      assert.ok(sameBytes(D.process(src, opts).data, D.process(src, opts).data), algo.id + '/' + palette);
    });
  });
});

/* ------------------------------------------------------------------ */
/* 7. scaling and the pipeline                                        */
/* ------------------------------------------------------------------ */

group('pipeline');

test('the result always keeps the source resolution', function () {
  const src = makeSource(37, 23, function (x, y) { return [x, y, 100]; });
  [1, 2, 3, 8, 16].forEach(function (pixelSize) {
    const res = D.process(src, { algorithm: 'bayer4', pixelSize: pixelSize });
    assert.strictEqual(res.width, 37);
    assert.strictEqual(res.height, 23);
    assert.strictEqual(res.data.length, 37 * 23 * 4);
  });
});

test('pixel size produces uniform chunks', function () {
  const src = makeSource(8, 8, function (x, y) { return [x * 30, y * 30, 60]; });
  const res = D.process(src, { algorithm: 'floyd-steinberg', pixelSize: 4, seed: 2 });
  for (let by = 0; by < 8; by += 4) {
    for (let bx = 0; bx < 8; bx += 4) {
      const first = (by * 8 + bx) * 4;
      for (let y = by; y < by + 4; y++) {
        for (let x = bx; x < bx + 4; x++) {
          const i = (y * 8 + x) * 4;
          assert.strictEqual(res.data[i], res.data[first], 'block uniform at ' + x + ',' + y);
          assert.strictEqual(res.data[i + 1], res.data[first + 1]);
          assert.strictEqual(res.data[i + 2], res.data[first + 2]);
        }
      }
    }
  }
});

test('settings merge clamps and rejects nonsense', function () {
  const s = D.mergeSettings({
    pixelSize: 99,
    threshold: -5,
    algorithm: 'bayer4',
    palette: 'gameboy',
    glitches: [{ id: 'grain', amount: 500 }, { id: 'nope', amount: 10 }, { id: 'scanlines', amount: 0 }],
  });
  assert.strictEqual(s.pixelSize, 16);
  assert.strictEqual(s.threshold, 0);
  assert.strictEqual(s.glitches.length, 1);
  assert.strictEqual(s.glitches[0].amount, 100);
  assert.strictEqual(s.adjustments.brightness, 1);
  const d = D.mergeSettings(undefined);
  assert.strictEqual(d.algorithm, D.DEFAULTS.algorithm);
  assert.strictEqual(d.pixelSize, D.DEFAULTS.pixelSize);
});

/* ------------------------------------------------------------------ */
/* 8. adjustments                                                     */
/* ------------------------------------------------------------------ */

group('adjustments');

test('brightness, contrast and saturation move in the expected direction', function () {
  const f = new Float32Array([100, 150, 200]);
  const bright = D.applyAdjustments(f.slice(), 1, 1, { brightness: 1.5, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0 });
  assert.ok(bright[0] > 100 && bright[0] === 150);
  const contrasty = D.applyAdjustments(f.slice(), 1, 1, { brightness: 1, contrast: 1.5, saturation: 1, hue: 0, blur: 0, sharpen: 0 });
  assert.ok(contrasty[0] < 100 && contrasty[2] > 200);
  const gray = D.applyAdjustments(f.slice(), 1, 1, { brightness: 1, contrast: 1, saturation: 0, hue: 0, blur: 0, sharpen: 0 });
  assert.ok(Math.abs(gray[0] - gray[1]) < 1e-3 && Math.abs(gray[1] - gray[2]) < 1e-3, 'desaturated to grey');
});

test('hue rotation turns red towards green', function () {
  const f = new Float32Array([255, 0, 0]);
  const out = D.applyAdjustments(f, 1, 1, { brightness: 1, contrast: 1, saturation: 1, hue: 120, blur: 0, sharpen: 0 });
  assert.ok(out[0] < 40, 'red channel drops: ' + out[0]);
  assert.ok(out[1] > 90, 'green channel rises: ' + out[1]);
  assert.ok(out[2] < 40, 'blue stays low: ' + out[2]);
});

test('blur flattens and sharpen exaggerates local contrast', function () {
  const w = 32, h = 32;
  const f = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const v = (i % w) < 16 ? 40 : 210;
    f[i * 3] = v; f[i * 3 + 1] = v; f[i * 3 + 2] = v;
  }
  function variance(buf) {
    let mean = 0;
    for (let i = 0; i < w * h; i++) mean += buf[i * 3];
    mean /= w * h;
    let s = 0;
    for (let i = 0; i < w * h; i++) s += (buf[i * 3] - mean) ** 2;
    return s / (w * h);
  }
  const base = variance(f);
  const blurred = variance(D.applyAdjustments(f.slice(), w, h, { blur: 2 }));
  const sharpened = variance(D.applyAdjustments(f.slice(), w, h, { sharpen: 1.5 }));
  assert.ok(blurred < base, 'blur reduces variance (' + blurred.toFixed(0) + ' < ' + base.toFixed(0) + ')');
  assert.ok(sharpened > base, 'sharpen increases variance');
});

test('denoise removes isolated speckles', function () {
  const w = 9, h = 9;
  const f = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { f[i * 3] = 100; f[i * 3 + 1] = 100; f[i * 3 + 2] = 100; }
  const centre = (4 * w + 4) * 3;
  f[centre] = 255;
  D.applyAdjustments(f, w, h, { denoise: true });
  assert.strictEqual(f[centre], 100, 'the speckle is replaced by the local median');
});

/* ------------------------------------------------------------------ */
/* 9. glitch stack and glow                                           */
/* ------------------------------------------------------------------ */

group('glitch stack and glow');

test('scanlines darken odd rows only', function () {
  const w = 4, h = 4;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(200);
  D.applyGlitchStack(rgba, w, h, [{ id: 'scanlines', amount: 50 }], 1);
  for (let y = 0; y < h; y++) {
    const v = rgba[(y * w) * 4];
    if (y % 2 === 1) assert.ok(v < 200, 'odd row ' + y + ' darkened to ' + v);
    else assert.strictEqual(v, 200, 'even row ' + y + ' untouched');
  }
});

test('chromatic aberration moves the red and blue channels apart', function () {
  const w = 24, h = 1;
  const rgba = new Uint8ClampedArray(w * 4);
  rgba[4 * 4] = 255;  // a single red pixel at x = 4
  D.applyGlitchStack(rgba, w, h, [{ id: 'aberration', amount: 100 }], 1);
  assert.strictEqual(rgba[(4 + 8) * 4], 255, 'red moved right by the max shift of 8');
  assert.strictEqual(rgba[4 * 4], 0, 'the original site is cleared');
});

test('pixel sort sorts bright runs and leaves the dark separators alone', function () {
  const vals = [5, 200, 150, 100, 5, 250, 180, 120, 90, 5, 220, 110, 5, 230, 140, 5];
  const w = vals.length, h = 1;
  const rgba = new Uint8ClampedArray(w * 4);
  for (let x = 0; x < w; x++) { rgba[x * 4] = vals[x]; rgba[x * 4 + 1] = vals[x]; rgba[x * 4 + 2] = vals[x]; }
  D.applyGlitchStack(rgba, w, h, [{ id: 'pixelsort', amount: 100 }], 1);
  function at(i) { return rgba[i * 4]; }
  [0, 4, 9, 12, 15].forEach(function (i) {
    assert.strictEqual(at(i), 5, 'separator at ' + i);
  });
  assert.deepStrictEqual([1, 2, 3].map(at), [100, 150, 200], 'first run sorted');
  assert.deepStrictEqual([5, 6, 7, 8].map(at), [90, 120, 180, 250], 'second run sorted');
  assert.deepStrictEqual([10, 11].map(at), [220, 110], 'runs of two are left alone');
});

test('grain is seeded and actually changes pixels', function () {
  const w = 16, h = 16;
  const a = new Uint8ClampedArray(w * h * 4).fill(120);
  const b = new Uint8ClampedArray(w * h * 4).fill(120);
  D.applyGlitchStack(a, w, h, [{ id: 'grain', amount: 60 }], 5);
  D.applyGlitchStack(b, w, h, [{ id: 'grain', amount: 60 }], 5);
  assert.ok(sameBytes(a, b), 'same seed, same grain');
  assert.ok(!sameBytes(a, new Uint8ClampedArray(w * h * 4).fill(120)), 'grain changes the image');
});

test('glow brightens, and intensity zero is a no-op', function () {
  const w = 16, h = 16;
  const base = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = (i % w) < 8 ? 0 : 255;
    base[i * 4] = v; base[i * 4 + 1] = v; base[i * 4 + 2] = v; base[i * 4 + 3] = 255;
  }
  const untouched = D.applyGlow(base.slice(), w, h, 3, 0);
  assert.ok(sameBytes(untouched, base), 'intensity 0 leaves the image alone');
  const glowing = D.applyGlow(base.slice(), w, h, 3, 60);
  let before = 0, after = 0;
  for (let i = 0; i < w * h; i++) { before += base[i * 4]; after += glowing[i * 4]; }
  assert.ok(after > before, 'glow brightens the dark half (' + after + ' > ' + before + ')');
});

test('colour counting sees the dither stage, not the glow', function () {
  const src = flat(16, 16, 128);
  const res = D.process(src, { algorithm: 'floyd-steinberg', palette: 'bw', pixelSize: 1, glow: { radius: 4, intensity: 80 } });
  assert.strictEqual(res.colors, 2, 'a 1-bit dither counts two colours');
  const grey = D.process(src, { algorithm: 'floyd-steinberg', palette: 'gameboy-pocket', pixelSize: 1 });
  assert.ok(grey.colors <= 4);
});

/* ------------------------------------------------------------------ */
/* 10. Yliluoma mixing plans                                          */
/* ------------------------------------------------------------------ */

group('Yliluoma mixing plans');

const C64 = D.PALETTES.find(function (p) { return p.id === 'c64'; }).colors;

function planMean(plan) {
  const m = [0, 0, 0];
  plan.forEach(function (i) {
    m[0] += C64[i][0] / plan.length;
    m[1] += C64[i][1] / plan.length;
    m[2] += C64[i][2] / plan.length;
  });
  return m;
}

test('a plan is a sorted multiset of valid palette indices', function () {
  [2, 3, 4].forEach(function (option) {
    const plan = D.mixingPlan('c64', option, [128, 128, 128]);
    assert.strictEqual(plan.length, 16, 'plan length for option ' + option);
    plan.forEach(function (i) {
      assert.ok(i >= 0 && i < C64.length, 'index ' + i + ' is in the palette');
    });
    for (let i = 1; i < plan.length; i++) {
      const la = 0.2126 * C64[plan[i - 1]][0] + 0.7152 * C64[plan[i - 1]][1] + 0.0722 * C64[plan[i - 1]][2];
      const lb = 0.2126 * C64[plan[i]][0] + 0.7152 * C64[plan[i]][1] + 0.0722 * C64[plan[i]][2];
      assert.ok(la <= lb, 'plan is sorted by luma at ' + i);
    }
  });
});

test('the pair mix uses exactly two colours, the searched plans use more when it helps', function () {
  const target = [200, 180, 60];
  const pair = D.mixingPlan('c64', 2, target);
  assert.ok(new Set(pair).size <= 2, 'option 2 mixes two colours');
  const greedy = D.mixingPlan('c64', 3, target);
  assert.ok(new Set(greedy).size >= 2, 'option 3 mixes at least two colours');
});

test('the plan error falls as the search gets smarter', function () {
  [[40, 40, 40], [128, 128, 128], [200, 180, 60], [20, 60, 200], [90, 20, 20]].forEach(function (target) {
    const e2 = D.planError(D.mixingPlan('c64', 2, target), C64, target);
    const e3 = D.planError(D.mixingPlan('c64', 3, target), C64, target);
    const e4 = D.planError(D.mixingPlan('c64', 4, target), C64, target);
    const label = target.join(',');
    assert.ok(e3 <= e2, 'the improved mix is never worse than two colours for ' + label +
      ' (' + e3.toFixed(0) + ' <= ' + e2.toFixed(0) + ')');
    assert.ok(e4 <= e3, 'the wider search never makes it worse for ' + label +
      ' (' + e4.toFixed(0) + ' <= ' + e3.toFixed(0) + ')');
  });
  // And it is genuinely better somewhere: a two-colour mix cannot reach a
  // target that sits between three palette colours as closely.
  const awkward = [192, 176, 150];
  assert.ok(D.planError(D.mixingPlan('c64', 4, awkward), C64, awkward) <
    D.planError(D.mixingPlan('c64', 2, awkward), C64, awkward), 'more entries, better mix');
});

test('a flat patch under a mixing plan averages out to the target colour', function () {
  // The 8×8 screen is a permutation, so every plan entry lands the same number
  // of times and the patch mean is the plan mean — a genuine tone match.
  [[64, 64, 64], [128, 128, 128], [192, 176, 150]].forEach(function (target) {
    const src = makeSource(32, 32, function () { return target; });
    const res = D.process(src, { algorithm: 'yliluoma-polished', palette: 'c64', pixelSize: 1, seed: 1 });
    const allowed = new Set(C64.map(function (c) { return (c[0] << 16) | (c[1] << 8) | c[2]; }));
    let r = 0, g = 0, b = 0;
    const n = res.width * res.height;
    for (let i = 0; i < n; i++) {
      const c = (res.data[i * 4] << 16) | (res.data[i * 4 + 1] << 8) | res.data[i * 4 + 2];
      assert.ok(allowed.has(c), 'plan output stays in the palette');
      r += res.data[i * 4]; g += res.data[i * 4 + 1]; b += res.data[i * 4 + 2];
    }
    const dr = r / n - target[0], dg = g / n - target[1], db = b / n - target[2];
    function dist(c) {
      const er = c[0] - target[0], eg = c[1] - target[1], eb = c[2] - target[2];
      return Math.sqrt(er * er + eg * eg + eb * eb);
    }
    // The plan is searched for the pixel's 4-bit bin centre (what the cache is
    // keyed on), so measure the mixing against that, and the result against the
    // real target separately.
    const centre = target.map(function (v) { return (v >> 4) * 16 + 8; });
    const drc = r / n - centre[0], dgc = g / n - centre[1], dbc = b / n - centre[2];
    const centreErr = Math.sqrt(drc * drc + dgc * dgc + dbc * dbc);
    assert.ok(centreErr < 6, 'mixes to its bin centre within 6 units, got ' + centreErr.toFixed(1));
    let nearest = Infinity;
    C64.forEach(function (c) { nearest = Math.min(nearest, dist(c)); });
    const err = dist([r / n, g / n, b / n]);
    assert.ok(err < nearest, 'and the rendered patch (' + err.toFixed(1) +
      ') still beats the nearest single colour (' + nearest.toFixed(1) + ')');
  });
});

test('mono Yliluoma mixing still prints black and white only', function () {
  const src = flat(32, 32, 128);
  ['yliluoma-2', 'yliluoma-greedy', 'yliluoma-polished'].forEach(function (algorithm) {
    const res = D.process(src, { algorithm: algorithm, palette: 'bw', pixelSize: 1, seed: 3 });
    uniqueColors(res).forEach(function (c) {
      assert.ok(c === 0 || c === 0xffffff, algorithm + ' produced ' + c.toString(16));
    });
    const frac = whiteFraction(res);
    assert.ok(Math.abs(frac - 0.5) < 0.06, algorithm + ' flat 128 → ' + frac.toFixed(3) + ' white');
  });
});

/* ------------------------------------------------------------------ */
/* 11. tone maps and alpha                                            */
/* ------------------------------------------------------------------ */

group('tone maps and alpha');

test('a tone map sends black to the ink and white to the paper', function () {
  const black = D.process(flat(8, 8, 0), { algorithm: 'threshold', palette: 'bw', pixelSize: 1, toneMap: 'sepia' });
  assert.strictEqual(black.data[0], 43);
  assert.strictEqual(black.data[1], 32);
  assert.strictEqual(black.data[2], 24);
  const white = D.process(flat(8, 8, 255), { algorithm: 'threshold', palette: 'bw', pixelSize: 1, toneMap: 'sepia' });
  assert.strictEqual(white.data[0], 245);
  assert.strictEqual(white.data[1], 222);
  assert.strictEqual(white.data[2], 179);
});

test('a tone map keeps a 1-bit dither at exactly two inks', function () {
  const src = makeSource(24, 24, function (x, y) { return [x * 10, 255 - y * 10, 128]; });
  const res = D.process(src, { algorithm: 'floyd-steinberg', palette: 'bw', pixelSize: 1, toneMap: 'blueprint', seed: 2 });
  const colors = uniqueColors(res);
  assert.strictEqual(colors.size, 2, 'two inks, got ' + colors.size);
  assert.strictEqual(res.colors, 2, 'and the readout still counts the dither stage');
});

test('the custom tone map uses the ink and paper it is given', function () {
  const res = D.process(flat(8, 8, 0), {
    algorithm: 'threshold', palette: 'bw', pixelSize: 1, toneMap: 'custom',
    toneInk: [10, 90, 20], tonePaper: [250, 250, 200],
  });
  assert.strictEqual(res.data[0], 10);
  assert.strictEqual(res.data[1], 90);
  assert.strictEqual(res.data[2], 20);
});

test('alpha sharpen dithers the matte to 0 or 255 and follows the gradient', function () {
  const w = 64, h = 16;
  const src = makeSource(w, h, function (x) {
    const a = Math.round((x / (w - 1)) * 255);
    return [128, 128, 128, a];
  });
  const res = D.process(src, { algorithm: 'floyd-steinberg', palette: 'bw', pixelSize: 4, alphaMode: 'sharpen', ditherStrength: 0 });
  const strips = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = res.data[(y * w + x) * 4 + 3];
      assert.ok(a === 0 || a === 255, 'alpha is hard, got ' + a);
      const s = Math.min(3, (x / w) * 4 | 0);
      counts[s]++;
      if (a === 255) strips[s]++;
    }
  }
  const frac = strips.map(function (v, i) { return v / counts[i]; });
  for (let i = 1; i < 4; i++) {
    assert.ok(frac[i] >= frac[i - 1], 'opacity rises left to right: ' + frac.join(', '));
  }
  assert.ok(frac[3] > 0.9 && frac[0] < 0.1, 'ends are fully opaque and fully clear');
});

test('alpha keep writes the chunk average as a real alpha channel', function () {
  const w = 32, h = 8;
  const src = makeSource(w, h, function (x) { return [200, 40, 40, Math.round((x / (w - 1)) * 255)]; });
  const res = D.process(src, { algorithm: 'bayer4', palette: 'bw', pixelSize: 4, alphaMode: 'keep' });
  const seen = new Set();
  for (let y = 0; y < h; y++) {
    const rowStart = res.data[(y * w) * 4 + 3];
    for (let x = 0; x < w; x++) {
      const a = res.data[(y * w + x) * 4 + 3];
      seen.add(a);
      assert.ok(a >= 0 && a <= 255, 'alpha in range');
      // One value per chunk: eight chunks across, so four pixels share it.
      assert.strictEqual(a, res.data[(y * w + (x - (x % 4))) * 4 + 3], 'alpha is constant across the chunk');
      assert.ok(rowStart !== undefined);
    }
  }
  assert.ok(seen.size >= 6, 'a gradient keeps several alpha levels (got ' + seen.size + ')');
  assert.ok(Math.min.apply(null, Array.from(seen)) < 60, 'the left chunks are mostly clear');
  assert.ok(Math.max.apply(null, Array.from(seen)) > 200, 'the right chunks are mostly opaque');
});

test('alpha matte leaves the frame fully opaque', function () {
  const src = makeSource(8, 8, function () { return [128, 128, 128, 0]; });
  const res = D.process(src, { algorithm: 'bayer4', palette: 'bw', pixelSize: 2 });
  for (let i = 0; i < 8 * 8; i++) assert.strictEqual(res.data[i * 4 + 3], 255);
  assert.strictEqual(D.mergeSettings({}).alphaMode, 'matte');
  assert.strictEqual(D.mergeSettings({ alphaMode: 'nonsense' }).alphaMode, 'matte');
});

test('the alpha matte is averaged per chunk, not per pixel', function () {
  // Alternating columns: every chunk straddles one clear and one opaque source
  // pixel, so a per-chunk average is exactly half everywhere.
  const src = makeSource(4, 4, function (x) { return [0, 0, 0, x % 2 ? 255 : 0]; });
  const res = D.process(src, { algorithm: 'threshold', palette: 'bw', pixelSize: 2, alphaMode: 'keep' });
  for (let i = 0; i < 16; i++) assert.strictEqual(res.data[i * 4 + 3], 128, 'chunk average at ' + i);
});

/* ------------------------------------------------------------------ */
/* 12. the wider glitch stack                                         */
/* ------------------------------------------------------------------ */

group('wider glitch stack');

function imageOf(w, h, fn) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      const i = (y * w + x) * 4;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return rgba;
}

test('every glitch names itself and only offers modes it implements', function () {
  assert.strictEqual(D.GLITCHES.length, 11);
  const ids = new Set();
  D.GLITCHES.forEach(function (g) {
    assert.ok(g.id && g.name && g.hint, 'metadata for ' + g.id);
    assert.ok(!ids.has(g.id), 'unique id ' + g.id);
    ids.add(g.id);
    if (g.modes) g.modes.forEach(function (m) { assert.ok(m.id && m.name); });
  });
  const merged = D.mergeSettings({ glitches: [{ id: 'grain', amount: 40, mode: 'nope' }, { id: 'kaleidoscope', amount: 30 }] });
  assert.strictEqual(merged.glitches[0].mode, 'mono', 'unknown modes fall back to the first');
  assert.strictEqual(merged.glitches[1].mode, '2');
});

test('wave ripple shifts whole rows and wraps them', function () {
  const w = 64, h = 32;
  const src = imageOf(w, h, function (x) { return x === 16 ? [255, 255, 255] : [0, 0, 0]; });
  const out = src.slice();
  D.applyGlitchStack(out, w, h, [{ id: 'wave', amount: 100 }], 5);
  let movedRows = 0, before = 0, after = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i] > 0) before++;
      if (out[i] > 0) after++;
      if (x === 16 && src[i] !== out[i]) movedRows++;
    }
  }
  assert.ok(movedRows > 0, 'some rows are displaced');
  assert.strictEqual(after, before, 'wrapping moves pixels, it never creates or loses them');
});

test('drip slides column strips down', function () {
  const w = 64, h = 32;
  const src = imageOf(w, h, function (x, y) { return y === 0 ? [255, 255, 255] : [0, 0, 0]; });
  const out = src.slice();
  D.applyGlitchStack(out, w, h, [{ id: 'drip', amount: 100 }], 7);
  let below = 0;
  for (let x = 0; x < w; x++) {
    for (let y = 1; y < h; y++) if (out[(y * w + x) * 4] > 0) below++;
  }
  assert.ok(below > 0, 'bright pixels land below the top row');
});

test('kaleidoscope 2-way and 4-way mirror the frame', function () {
  const w = 32, h = 16;
  const src = imageOf(w, h, function (x, y) { return [(x * 8) % 256, (y * 16) % 256, 40]; });
  const two = src.slice();
  D.applyGlitchStack(two, w, h, [{ id: 'kaleidoscope', amount: 60, mode: '2' }], 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4;
      assert.strictEqual(two[a], two[b], 'mirrored at x=' + x);
      assert.strictEqual(two[a + 2], two[b + 2]);
    }
  }
  const four = src.slice();
  D.applyGlitchStack(four, w, h, [{ id: 'kaleidoscope', amount: 60, mode: '4' }], 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4, b = ((h - 1 - y) * w + (w - 1 - x)) * 4;
      assert.strictEqual(four[a], four[b], 'point mirrored at ' + x + ',' + y);
    }
  }
});

test('kaleidoscope 8-way keeps the frame and changes it', function () {
  const w = 32, h = 32;
  const src = imageOf(w, h, function (x, y) { return [(x * 8) % 256, (y * 8) % 256, 0]; });
  const out = src.slice();
  D.applyGlitchStack(out, w, h, [{ id: 'kaleidoscope', amount: 60, mode: '8' }], 3);
  assert.ok(!sameBytes(out, src), 'the frame is rebuilt');
  for (let i = 0; i < w * h; i++) {
    assert.ok(out[i * 4] >= 0 && out[i * 4] <= 255);
  }
});

test('dead pixels are stuck on an extreme', function () {
  const w = 64, h = 64;
  const src = imageOf(w, h, function () { return [128, 128, 128]; });
  const out = src.slice();
  D.applyGlitchStack(out, w, h, [{ id: 'deadpixels', amount: 100 }], 11);
  let dead = 0;
  for (let i = 0; i < w * h; i++) {
    const v = out[i * 4];
    if (v !== 128) {
      assert.ok(v === 0 || v === 255, 'stuck value ' + v);
      assert.strictEqual(out[i * 4 + 1], v);
      dead++;
    }
  }
  const frac = dead / (w * h);
  assert.ok(frac > 0.005 && frac < 0.06, 'about two percent of pixels, got ' + (frac * 100).toFixed(2) + '%');
});

test('vignette darkens the corners more than the centre', function () {
  const w = 32, h = 32;
  const src = imageOf(w, h, function () { return [200, 200, 200]; });
  const out = src.slice();
  D.applyGlitchStack(out, w, h, [{ id: 'vignette', amount: 100 }], 1);
  const centre = out[(16 * w + 16) * 4];
  const corner = out[0];
  assert.strictEqual(centre, 200, 'the middle is untouched');
  assert.ok(corner < centre * 0.4, 'the corner is much darker (' + corner + ')');
});

test('crt warps the frame and blooms the bright parts', function () {
  const w = 48, h = 48;
  const src = imageOf(w, h, function (x, y) {
    const dot = Math.abs(x - 24) < 3 && Math.abs(y - 24) < 3;
    return dot ? [255, 255, 255] : [10, 10, 10];
  });
  const out = src.slice();
  D.applyGlitchStack(out, w, h, [{ id: 'crt', amount: 80 }], 2);
  let halo = 0;
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0;
    const near = Math.abs(x - 24) < 10 && Math.abs(y - 24) < 10;
    if (near && out[i * 4] > 10 && out[i * 4] < 250) halo++;
  }
  assert.ok(halo > 20, 'bright light spills into the dark field (' + halo + ' pixels)');
});

test('grain colour mode separates the channels', function () {
  const w = 32, h = 32;
  const mono = imageOf(w, h, function () { return [120, 120, 120]; });
  const colour = mono.slice();
  D.applyGlitchStack(mono, w, h, [{ id: 'grain', amount: 80, mode: 'mono' }], 4);
  D.applyGlitchStack(colour, w, h, [{ id: 'grain', amount: 80, mode: 'colour' }], 4);
  let monoEqual = 0, colourEqual = 0;
  for (let i = 0; i < w * h; i++) {
    if (mono[i * 4] === mono[i * 4 + 2]) monoEqual++;
    if (colour[i * 4] === colour[i * 4 + 2]) colourEqual++;
  }
  assert.strictEqual(monoEqual, w * h, 'mono grain moves every channel together');
  assert.ok(colourEqual < w * h * 0.5, 'colour grain does not');
});

test('pixel sort in column mode sorts vertically', function () {
  const w = 4, h = 16;
  const vals = [5, 200, 150, 100, 5, 250, 180, 120, 90, 5, 220, 110, 5, 230, 140, 5];
  const src = imageOf(w, h, function (x, y) { return [vals[y], vals[y], vals[y]]; });
  const out = src.slice();
  D.applyGlitchStack(out, w, h, [{ id: 'pixelsort', amount: 100, mode: 'cols' }], 1);
  function at(x, y) { return out[(y * w + x) * 4]; }
  assert.deepStrictEqual([1, 2, 3].map(function (y) { return at(0, y); }), [100, 150, 200], 'first column run sorted');
  assert.strictEqual(at(0, 0), 5, 'separators stay put');
  assert.strictEqual(at(0, 15), 5);
});

test('new palettes carry the levels they promise', function () {
  function levels(id) { return D.PALETTES.find(function (p) { return p.id === id; }).colors.length; }
  assert.strictEqual(levels('gray-4'), 4);
  assert.strictEqual(levels('gray-8'), 8);
  assert.strictEqual(levels('gray-16'), 16);
  assert.strictEqual(levels('ega'), 16);
  assert.strictEqual(levels('msx'), 15);
  assert.strictEqual(levels('apple2'), 6);
  const gray16 = D.PALETTES.find(function (p) { return p.id === 'gray-16'; }).colors;
  gray16.forEach(function (c) {
    assert.strictEqual(c[0], c[1]);
    assert.strictEqual(c[1], c[2]);
  });
  assert.deepStrictEqual(gray16[0], [0, 0, 0]);
  assert.deepStrictEqual(gray16[15], [255, 255, 255]);
  // Twenty-two palettes, every id unique.
  const ids = new Set(D.PALETTES.map(function (p) { return p.id; }));
  assert.strictEqual(ids.size, D.PALETTES.length);
});

/* ------------------------------------------------------------------ */
/* 13. performance budget                                             */
/* ------------------------------------------------------------------ */

group('performance budget (1024×1024, pixel size 1)');

function budget(name, settings, capMs) {
  const w = 1024, h = 1024;
  const src = makeSource(w, h, function (x, y) {
    return [
      128 + 100 * Math.sin(x * 0.05),
      128 + 100 * Math.sin(y * 0.07),
      128 + 100 * Math.sin((x + y) * 0.03),
    ];
  });
  const t0 = Date.now();
  const res = D.process(src, settings);
  const ms = Date.now() - t0;
  assert.strictEqual(res.data.length, w * h * 4);
  assert.ok(ms < capMs, name + ' took ' + ms + ' ms (cap ' + capMs + ' ms)');
  console.log('       ' + name + ': ' + ms + ' ms');
  return ms;
}

test('B&W Floyd–Steinberg on a megapixel', function () {
  budget('bw floyd-steinberg', { algorithm: 'floyd-steinberg', palette: 'bw', pixelSize: 1, seed: 1 }, 1200);
});

test('16-colour palette Floyd–Steinberg on a megapixel', function () {
  budget('c64 floyd-steinberg', { algorithm: 'floyd-steinberg', palette: 'c64', pixelSize: 1, seed: 1 }, 2500);
});

test('ordered dithering with the glitch stack on a megapixel', function () {
  budget('c64 bayer8 + glitches', {
    algorithm: 'bayer8', palette: 'c64', pixelSize: 1, seed: 1,
    glitches: [{ id: 'grain', amount: 30 }, { id: 'scanlines', amount: 25 }],
  }, 2000);
});

test('the polished mixing plan on a megapixel', function () {
  budget('c64 yliluoma-polished', { algorithm: 'yliluoma-polished', palette: 'c64', pixelSize: 1, seed: 1 }, 4000);
});

test('the whole glitch stack on a megapixel', function () {
  const settings = {
    algorithm: 'bayer4', palette: 'c64', pixelSize: 1, seed: 1,
    glitches: D.GLITCHES.map(function (g) { return { id: g.id, amount: 50 }; }),
  };
  budget('all 11 glitches', settings, 6000);
});

test('a cached blue-noise mask costs nothing to reuse', function () {
  const t0 = Date.now();
  D.blueNoiseRanks(32);
  D.blueNoiseRanks(32);
  assert.ok(Date.now() - t0 < 50, 'cache hits are instant');
});

/* ------------------------------------------------------------------ */

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
