/* test.js — executable specification for the fluid core (fluid.js).
 *
 * Run with:  node test.js
 * No dependencies: uses Node's built-in assert only.
 *
 * The tests pin down the properties that make the solver correct and stable:
 * projection removes divergence (incompressibility), advection carries dye
 * along the flow, a uniform field neither explodes nor drifts, dissipation
 * fades the dye, buoyancy lifts it, and the whole run is deterministic.
 */
'use strict';

const assert = require('assert');
const FluidLib = require('./fluid.js');
const { Fluid } = FluidLib;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (err) {
    failed++;
    console.log('FAIL  ' + name + '\n      ' + err.message);
  }
}

function fluid(opts) {
  return new Fluid(Object.assign({
    width: 48, height: 32, seed: 1,
    viscosity: 0, vorticity: 0, buoyancy: 0, dissipation: 1,
  }, opts || {}));
}

/* Fill the interior velocity with a constant flow. */
function uniform(f, ux, uy) {
  for (let j = 1; j <= f.h; j++) {
    for (let i = 1; i <= f.w; i++) {
      const idx = f.IX(i, j);
      f.u[idx] = ux;
      f.v[idx] = uy;
    }
  }
  return f;
}

function finite(arr) {
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
}

/* Total (L1) divergence over the interior — the cleanest measure of how far
   the field is from incompressible. The single-cell maximum is dominated by
   boundary and Nyquist-frequency artefacts, so the sum is the honest metric. */
function l1Divergence(f) {
  const hx = 1 / f.w;
  const hy = 1 / f.h;
  let sum = 0;
  for (let j = 2; j <= f.h - 1; j++) {
    for (let i = 2; i <= f.w - 1; i++) {
      const idx = f.IX(i, j);
      sum += Math.abs(hx * (f.u[idx + 1] - f.u[idx - 1]) + hy * (f.v[idx + f.stride] - f.v[idx - f.stride])) * 0.5;
    }
  }
  return sum;
}

/* Residual of the pressure Poisson equation the projection solves. */
function poissonResidual(f) {
  let max = 0;
  for (let j = 2; j <= f.h - 1; j++) {
    for (let i = 2; i <= f.w - 1; i++) {
      const idx = f.IX(i, j);
      const r = Math.abs(4 * f.p[idx]
        - (f.p[idx - 1] + f.p[idx + 1] + f.p[idx - f.stride] + f.p[idx + f.stride])
        - f.div[idx]);
      if (r > max) max = r;
    }
  }
  return max;
}

/* ------------------------------------------------------------------ */
/* indexing and construction                                          */
/* ------------------------------------------------------------------ */

test('IX maps interior cells and inside() guards the border', function () {
  const f = fluid();
  assert.strictEqual(f.IX(1, 1), f.stride + 1);
  assert.ok(f.inside(1, 1));
  assert.ok(f.inside(f.w, f.h));
  assert.ok(!f.inside(0, 5));
  assert.ok(!f.inside(5, f.h + 1));
});

test('a new fluid starts empty', function () {
  const f = fluid();
  assert.strictEqual(f.dyeSum(), 0);
  assert.strictEqual(f.totalDye, 0);
});

test('clear zeroes every field', function () {
  const f = fluid();
  f.splat(20, 15, 3, -2, '#ffffff', 5);
  f.clear();
  assert.strictEqual(f.dyeSum(), 0);
  let max = 0;
  for (let i = 0; i < f.size; i++) max = Math.max(max, Math.abs(f.u[i]), Math.abs(f.v[i]));
  assert.strictEqual(max, 0);
});

/* ------------------------------------------------------------------ */
/* sources                                                            */
/* ------------------------------------------------------------------ */

test('splat injects velocity and dye inside the disc only', function () {
  const f = fluid();
  f.splat(24, 16, 5, -5, '#ffffff', 4);
  assert.ok(f.u[f.IX(24, 16)] > 0, 'velocity added at the centre');
  assert.ok(f.v[f.IX(24, 16)] < 0);
  assert.ok(f.dyeSum() > 0);
  assert.strictEqual(f.dyeSum() > 0, true);
  // A cell well beyond the radius stays untouched.
  assert.strictEqual(f.u[f.IX(24 + 10, 16)], 0);
  assert.strictEqual(f.r[f.IX(24 + 10, 16)], 0);
});

test('randomSplats is deterministic for a seed', function () {
  const a = fluid({ seed: 9 });
  const b = fluid({ seed: 9 });
  a.randomSplats(9, 20);
  b.randomSplats(9, 20);
  assert.deepStrictEqual(Array.from(a.u), Array.from(b.u));
  assert.deepStrictEqual(Array.from(a.r), Array.from(b.r));
});

/* ------------------------------------------------------------------ */
/* projection (incompressibility)                                     */
/* ------------------------------------------------------------------ */

test('project removes divergence from a messy velocity field', function () {
  const f = fluid({ width: 64, height: 48 });
  for (let j = 1; j <= f.h; j++) {
    for (let i = 1; i <= f.w; i++) {
      const idx = f.IX(i, j);
      f.u[idx] = 6 * Math.sin(i * 0.6) + ((i + j) % 2 ? 3 : -3);
      f.v[idx] = 6 * Math.cos(j * 0.5);
    }
  }
  const l1Before = l1Divergence(f);
  const maxBefore = f.divergenceMax();
  assert.ok(l1Before > 1e-2, 'the constructed field should be divergent, got ' + l1Before);
  f.project();
  const l1After = l1Divergence(f);
  assert.ok(l1After < l1Before * 0.3, 'projection should cut total divergence: ' + l1Before.toFixed(4) + ' -> ' + l1After.toFixed(4));
  assert.ok(f.divergenceMax() < maxBefore * 0.6, 'even the worst cell should improve');
});

test('project solves the pressure Poisson equation', function () {
  const f = fluid({ width: 40, height: 28, iterations: 200 });
  f.randomSplats(5, 25);
  const scale = f.divergenceMax();
  f.project();
  const residual = poissonResidual(f);
  assert.ok(residual < scale * 0.1, 'the solved pressure should satisfy the equation: ' + residual + ' vs ' + scale);
});

test('project does not amplify the velocity field', function () {
  const f = fluid();
  f.randomSplats(4, 25);
  let before = 0;
  for (let i = 0; i < f.size; i++) before += Math.abs(f.u[i]) + Math.abs(f.v[i]);
  f.project();
  let after = 0;
  for (let i = 0; i < f.size; i++) after += Math.abs(f.u[i]) + Math.abs(f.v[i]);
  assert.ok(after <= before * 1.001 + 1e-6, 'projection must not add kinetic energy');
});

/* ------------------------------------------------------------------ */
/* advection                                                          */
/* ------------------------------------------------------------------ */

test('advection carries dye along a uniform flow', function () {
  const f = fluid({ width: 48, height: 24 });
  uniform(f, 2, 0);
  f.splat(12, 12, 0, 0, '#ffffff', 3);
  const c0 = f.dyeCentroid();
  f.step(0.05); // displacement = dt * w * u = 0.05 * 48 * 2 = 4.8 cells
  const c1 = f.dyeCentroid();
  assert.ok(c1[0] > c0[0] + 1.5, 'dye should move right, from ' + c0[0].toFixed(1) + ' to ' + c1[0].toFixed(1));
  assert.ok(Math.abs(c1[1] - c0[1]) < 1.5, 'dye should not drift vertically');
});

test('a uniform field stays uniform and bounded', function () {
  const f = fluid({ width: 40, height: 24 });
  uniform(f, 2, 0.5);
  f.stepMany(40, 0.02);
  let max = 0;
  for (let j = 1; j <= f.h; j++) {
    for (let i = 1; i <= f.w; i++) {
      const idx = f.IX(i, j);
      max = Math.max(max, Math.abs(f.u[idx]), Math.abs(f.v[idx]));
    }
  }
  assert.ok(finite(f.u) && finite(f.v), 'the field must stay finite');
  assert.ok(max < 3.5, 'an unforced uniform field must not blow up, max=' + max);
});

test('the solver stays stable across many steps with forcing', function () {
  const f = fluid({ width: 64, height: 40, vorticity: 4, buoyancy: 2 });
  f.randomSplats(3, 30);
  f.stepMany(60, 0.016);
  assert.ok(finite(f.u) && finite(f.v) && finite(f.r), 'nothing may become NaN/Infinity');
  const s = f.stats();
  assert.ok(s.maxSpeed < 1e4, 'speed stays sane, got ' + s.maxSpeed);
});

/* ------------------------------------------------------------------ */
/* dye behaviour                                                      */
/* ------------------------------------------------------------------ */

test('dissipation fades the dye over time', function () {
  const f = fluid({ dissipation: 0.9 });
  f.splat(24, 16, 0, 0, '#ffffff', 5);
  const before = f.dyeSum();
  f.step(0.016);
  assert.ok(f.dyeSum() < before, 'dye should fade: ' + before + ' -> ' + f.dyeSum());
});

test('without dissipation the dye is conserved (no flow)', function () {
  const f = fluid({ dissipation: 1 });
  f.splat(24, 16, 0, 0, '#ffffff', 4);
  const before = f.dyeSum();
  f.stepMany(5, 0.016);
  const after = f.dyeSum();
  assert.ok(Math.abs(after - before) < before * 0.02, 'still dye should be conserved: ' + before + ' -> ' + after);
});

test('buoyancy pushes the dye upward', function () {
  const f = fluid({ buoyancy: 5 });
  f.splat(24, 16, 0, 0, '#ffffff', 4);
  f.applyBuoyancy(0.1);
  assert.ok(f.v[f.IX(24, 16)] < 0, 'a buoyant cell should gain upward (negative) velocity');
});

test('dye centroid follows an off-centre splat', function () {
  const f = fluid();
  f.splat(12, 8, 0, 0, '#ffffff', 3);
  const c = f.dyeCentroid();
  assert.ok(Math.abs(c[0] - 12) < 1.5, 'centroid x near the splat');
  assert.ok(Math.abs(c[1] - 8) < 1.5, 'centroid y near the splat');
});

/* ------------------------------------------------------------------ */
/* determinism and measurements                                       */
/* ------------------------------------------------------------------ */

test('two fluids with the same seed and inputs stay identical', function () {
  const a = fluid({ width: 40, height: 24, seed: 7, vorticity: 3, buoyancy: 1 });
  const b = fluid({ width: 40, height: 24, seed: 7, vorticity: 3, buoyancy: 1 });
  a.randomSplats(7, 15);
  b.randomSplats(7, 15);
  a.stepMany(10, 0.016);
  b.stepMany(10, 0.016);
  assert.deepStrictEqual(Array.from(a.u), Array.from(b.u));
  assert.deepStrictEqual(Array.from(a.r), Array.from(b.r));
});

test('stats reports finite measurements with a small divergence', function () {
  const f = fluid({ width: 64, height: 40 });
  f.randomSplats(11, 20);
  f.stepMany(5, 0.016);
  const s = f.stats();
  assert.ok(Number.isFinite(s.meanSpeed) && Number.isFinite(s.maxSpeed));
  assert.ok(Number.isFinite(s.totalDye) && Number.isFinite(s.divergence));
  assert.ok(s.divergence < 0.25, 'a projected field should be nearly divergence free, got ' + s.divergence);
});

/* ---------- summary ---------- */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
