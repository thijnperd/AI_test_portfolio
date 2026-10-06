/* fluid.js — Stable Fluids (Jos Stam, 1999) incompressible solver core.
 *
 * Pure logic, no DOM: runs in the browser (as `FluidLib`) and in Node
 * (`module.exports`) so the solver can be tested with `node test.js`.
 *
 * The fluid lives on an Eulerian grid with a one-cell boundary ring. Each step
 * advances incompressible Navier–Stokes the way Stam's "Stable Fluids" does:
 *
 *     add forces -> diffuse (optional) -> project -> advect -> project
 *
 * `project` solves a Poisson equation for pressure with Gauss-Seidel sweeps and
 * subtracts its gradient, which is what makes the velocity field divergence
 * free (incompressible). Advection is semi-Lagrangian, so it is unconditionally
 * stable — big timesteps blur, they never explode.
 *
 * Dye is carried as three colour channels rather than one scalar, so splats
 * paint coloured smoke. Every field is a Float32Array and the solver itself has
 * no randomness at all: the same inputs always produce the same field.
 * `randomSplats()` is the only seeded entry point.
 *
 * The hot loops address fields by index arithmetic (`i + j * stride`) rather
 * than a method call per cell, which is what keeps a 128x72 grid at frame rate
 * in plain JavaScript.
 *
 * References: Jos Stam, "Stable Fluids" (SIGGRAPH 1999); the GPU version by
 * Pavel Dobryakov (WebGL-Fluid-Simulation) is the visual reference for the
 * coloured-dye splatting and vorticity-confinement model used by the UI layer.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Seeded RNG (mulberry32) — used only by randomSplats().             */
  /* ------------------------------------------------------------------ */

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DEFAULTS = {
    width: 128,          // interior cells, horizontally
    height: 72,          // interior cells, vertically
    viscosity: 0.00002,  // kinematic viscosity (0 disables diffusion)
    diffusion: 0.0,      // dye diffusion (0 keeps the dye crisp)
    dissipation: 0.995,  // dye retained per step (1 = no fade)
    iterations: 20,      // Gauss-Seidel sweeps per projection
    dt: 0.016,           // default timestep (one 60 Hz frame)
    vorticity: 2.5,      // vorticity confinement strength (0 = off)
    buoyancy: 1.2,       // upward force per unit of dye (0 = off)
    seed: 1,
  };

  /* Diffusions this weak are below the visible threshold; skipping them
     removes two full Gauss-Seidel solves per step and costs nothing visible. */
  const MIN_DIFFUSE = 0.005;

  /* Parse "#rrggbb" into {r,g,b} floats in [0,1] (defaults to white). */
  function hexToRgb01(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return { r: 1, g: 1, b: 1 };
    const n = parseInt(m[1], 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }

  class Fluid {
    constructor(options) {
      const o = Object.assign({}, DEFAULTS, options || {});
      this.o = o;
      this.w = Math.max(8, o.width | 0);
      this.h = Math.max(8, o.height | 0);
      this.stride = this.w + 2;
      const n = this.stride * (this.h + 2);
      this.size = n;

      const f = function () { return new Float32Array(n); };
      this.u = f();   this.v = f();          // velocity
      this.u0 = f();  this.v0 = f();         // velocity scratch
      this.p = f();   this.div = f();        // pressure + divergence
      this.curl = f();                       // vorticity scratch
      this.r = f();   this.g = f(); this.b = f();   // dye channels
      this.r0 = f();  this.g0 = f(); this.b0 = f(); // dye scratch

      this.totalDye = 0;
      this.rng = makeRng(((o.seed >>> 0) || 1));
    }

    /* Linear index of interior cell (x,y); x in [1..w], y in [1..h]. */
    IX(x, y) { return x + y * this.stride; }

    inside(x, y) { return x >= 1 && x <= this.w && y >= 1 && y <= this.h; }

    copy(dst, src) { dst.set(src); }

    /* Zero every field. */
    clear() {
      this.u.fill(0); this.v.fill(0);
      this.u0.fill(0); this.v0.fill(0);
      this.p.fill(0); this.div.fill(0); this.curl.fill(0);
      this.r.fill(0); this.g.fill(0); this.b.fill(0);
      this.r0.fill(0); this.g0.fill(0); this.b0.fill(0);
      this.totalDye = 0;
      return this;
    }

    /* ------------------------------------------------------------------ */
    /* boundary conditions (b: 1 = horizontal velocity, 2 = vertical, 0 = other) */
    /* ------------------------------------------------------------------ */

    setBnd(b, x) {
      const w = this.w, h = this.h, s = this.stride;
      for (let j = 1; j <= h; j++) {
        const row = j * s;
        x[row] = b === 1 ? -x[row + 1] : x[row + 1];
        x[row + w + 1] = b === 1 ? -x[row + w] : x[row + w];
      }
      for (let i = 1; i <= w; i++) {
        x[i] = b === 2 ? -x[i + s] : x[i + s];
        const bi = i + (h + 1) * s;
        x[bi] = b === 2 ? -x[i + h * s] : x[i + h * s];
      }
      x[0] = 0.5 * (x[1] + x[s]);
      x[(h + 1) * s] = 0.5 * (x[1 + (h + 1) * s] + x[h * s]);
      x[w + 1] = 0.5 * (x[w] + x[w + 1 + s]);
      x[w + 1 + (h + 1) * s] = 0.5 * (x[w + (h + 1) * s] + x[w + 1 + h * s]);
    }

    /* Gauss-Seidel relaxation of (x - a * laplacian(x)) = x0. */
    linSolve(b, x, x0, a, c) {
      const w = this.w, h = this.h, s = this.stride;
      const inv = 1 / c;
      const iters = this.o.iterations;
      for (let k = 0; k < iters; k++) {
        for (let j = 1; j <= h; j++) {
          const row = j * s;
          for (let i = 1; i <= w; i++) {
            const idx = row + i;
            x[idx] = (x0[idx] + a * (x[idx - 1] + x[idx + 1] + x[idx - s] + x[idx + s])) * inv;
          }
        }
        this.setBnd(b, x);
      }
    }

    /* Implicit diffusion of `x0` into `x`. */
    diffuse(b, x, x0, diff, dt) {
      const a = dt * diff * this.w * this.h;
      this.linSolve(b, x, x0, a, 1 + 4 * a);
    }

    /* Semi-Lagrangian advection: sample `d0` backwards along the velocity. */
    advect(b, d, d0, u, v, dt) {
      const w = this.w, h = this.h, s = this.stride;
      const dtx = dt * w;
      const dty = dt * h;
      for (let j = 1; j <= h; j++) {
        const row = j * s;
        for (let i = 1; i <= w; i++) {
          const idx = row + i;
          let x = i - dtx * u[idx];
          let y = j - dty * v[idx];
          if (x < 0.5) x = 0.5; else if (x > w + 0.5) x = w + 0.5;
          if (y < 0.5) y = 0.5; else if (y > h + 0.5) y = h + 0.5;
          const i0 = x | 0, j0 = y | 0;
          const s1 = x - i0, s0 = 1 - s1;
          const t1 = y - j0, t0 = 1 - t1;
          const r0 = j0 * s, r1 = r0 + s;
          d[idx] = s0 * (t0 * d0[r0 + i0] + t1 * d0[r1 + i0])
                 + s1 * (t0 * d0[r0 + i0 + 1] + t1 * d0[r1 + i0 + 1]);
        }
      }
      this.setBnd(b, d);
    }

    /* Make the velocity field divergence free (incompressible). */
    project() {
      const w = this.w, h = this.h, s = this.stride;
      const u = this.u, v = this.v, p = this.p, div = this.div;
      const hx = 1 / w;
      const hy = 1 / h;

      for (let j = 1; j <= h; j++) {
        const row = j * s;
        for (let i = 1; i <= w; i++) {
          const idx = row + i;
          div[idx] = -0.5 * (hx * (u[idx + 1] - u[idx - 1]) + hy * (v[idx + s] - v[idx - s]));
          p[idx] = 0;
        }
      }
      this.setBnd(0, div);
      this.setBnd(0, p);
      this.linSolve(0, p, div, 1, 4);

      for (let j = 1; j <= h; j++) {
        const row = j * s;
        for (let i = 1; i <= w; i++) {
          const idx = row + i;
          u[idx] -= 0.5 * (p[idx + 1] - p[idx - 1]) / hx;
          v[idx] -= 0.5 * (p[idx + s] - p[idx - s]) / hy;
        }
      }
      this.setBnd(1, u);
      this.setBnd(2, v);
    }

    /**
     * Re-inject swirl that the projection damps away (vorticity confinement).
     *
     * Curl and its gradient are computed on the unit-spacing grid, so the grid
     * scale cancels and the force is simply `dt * eps * curl * n` — the standard
     * form. Dividing by the cell spacing here would inject energy without bound.
     */
    applyVorticity(dt) {
      const w = this.w, h = this.h, s = this.stride;
      const u = this.u, v = this.v, curl = this.curl;
      const eps = this.o.vorticity;

      for (let j = 1; j <= h; j++) {
        const row = j * s;
        for (let i = 1; i <= w; i++) {
          const idx = row + i;
          curl[idx] = ((v[idx + 1] - v[idx - 1]) - (u[idx + s] - u[idx - s])) * 0.5;
        }
      }
      this.setBnd(0, curl);

      for (let j = 2; j <= h - 1; j++) {
        const row = j * s;
        for (let i = 2; i <= w - 1; i++) {
          const idx = row + i;
          const fx = (Math.abs(curl[idx + 1]) - Math.abs(curl[idx - 1])) * 0.5;
          const fy = (Math.abs(curl[idx + s]) - Math.abs(curl[idx - s])) * 0.5;
          const len = Math.sqrt(fx * fx + fy * fy) + 1e-5;
          const c = curl[idx];
          u[idx] += eps * dt * c * (fx / len);
          v[idx] -= eps * dt * c * (fy / len);
        }
      }
      this.setBnd(1, u);
      this.setBnd(2, v);
    }

    /* Dye rises: an upward force proportional to the local dye brightness. */
    applyBuoyancy(dt) {
      const w = this.w, h = this.h, s = this.stride;
      const v = this.v, r = this.r, g = this.g, b = this.b;
      const k = this.o.buoyancy;
      for (let j = 1; j <= h; j++) {
        const row = j * s;
        for (let i = 1; i <= w; i++) {
          const idx = row + i;
          const d = (r[idx] + g[idx] + b[idx]) * (1 / 3);
          v[idx] -= k * d * dt;   // canvas y grows downward, so "up" is negative
        }
      }
      this.setBnd(2, v);
    }

    /* ------------------------------------------------------------------ */
    /* sources                                                            */
    /* ------------------------------------------------------------------ */

    /* Inject velocity and coloured dye into a disc around (cx, cy). */
    splat(cx, cy, fx, fy, color, radius) {
      const c = typeof color === 'string' ? hexToRgb01(color) : (color || { r: 1, g: 1, b: 1 });
      const r = radius === undefined ? 6 : radius;
      const r2 = r * r;
      const u = this.u, v = this.v, R = this.r, G = this.g, B = this.b;
      const s = this.stride;
      const x0 = Math.max(1, Math.floor(cx - r));
      const x1 = Math.min(this.w, Math.ceil(cx + r));
      const y0 = Math.max(1, Math.floor(cy - r));
      const y1 = Math.min(this.h, Math.ceil(cy + r));
      const denom = r2 * 0.5 + 1e-6;
      for (let y = y0; y <= y1; y++) {
        const row = y * s;
        const dy = y - cy;
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const fall = Math.exp(-d2 / denom);
          const idx = row + x;
          u[idx] += fx * fall;
          v[idx] += fy * fall;
          R[idx] += c.r * fall;
          G[idx] += c.g * fall;
          B[idx] += c.b * fall;
        }
      }
    }

    /* A deterministic scatter of splats — the only randomness in the core. */
    randomSplats(seed, count, palette) {
      if (seed !== undefined && seed !== null) this.rng = makeRng(seed >>> 0);
      const cols = palette || ['#7aa2ff', '#a67aff', '#4fe0d0', '#ffffff', '#ff7ab6'];
      const n = count === undefined ? 12 : count;
      for (let i = 0; i < n; i++) {
        const x = 2 + this.rng() * (this.w - 4);
        const y = 2 + this.rng() * (this.h - 4);
        const ang = this.rng() * Math.PI * 2;
        const mag = 0.4 + this.rng() * 1.6;
        const col = cols[(this.rng() * cols.length) | 0];
        this.splat(x, y, Math.cos(ang) * mag, Math.sin(ang) * mag, col, 5 + this.rng() * 9);
      }
      return this;
    }

    /* ------------------------------------------------------------------ */
    /* time integration                                                   */
    /* ------------------------------------------------------------------ */

    step(dt) {
      const d = dt === undefined ? this.o.dt : dt;
      const { u, v, u0, v0, r, g, b, r0, g0, b0 } = this;

      if (this.o.viscosity > 0 && d * this.o.viscosity * this.w * this.h > MIN_DIFFUSE) {
        this.diffuse(1, u0, u, this.o.viscosity, d); this.copy(u, u0);
        this.diffuse(2, v0, v, this.o.viscosity, d); this.copy(v, v0);
      }

      this.project();

      this.copy(u0, u); this.copy(v0, v);
      this.advect(1, u, u0, u0, v0, d);
      this.advect(2, v, v0, u0, v0, d);
      this.project();

      if (this.o.vorticity > 0) this.applyVorticity(d);
      if (this.o.buoyancy > 0) this.applyBuoyancy(d);

      if (this.o.diffusion > 0) {
        this.diffuse(0, r0, r, this.o.diffusion, d); this.copy(r, r0);
        this.diffuse(0, g0, g, this.o.diffusion, d); this.copy(g, g0);
        this.diffuse(0, b0, b, this.o.diffusion, d); this.copy(b, b0);
      }

      this.copy(r0, r); this.copy(g0, g); this.copy(b0, b);
      this.advect(0, r, r0, u, v, d);
      this.advect(0, g, g0, u, v, d);
      this.advect(0, b, b0, u, v, d);

      const dis = this.o.dissipation;
      const n = this.size;
      let tot = 0;
      if (dis < 1) {
        for (let i = 0; i < n; i++) { r[i] *= dis; g[i] *= dis; b[i] *= dis; tot += r[i] + g[i] + b[i]; }
      } else {
        for (let i = 0; i < n; i++) tot += r[i] + g[i] + b[i];
      }
      this.totalDye = tot;
    }

    stepMany(n, dt) {
      for (let i = 0; i < (n || 1); i++) this.step(dt);
    }

    /* ------------------------------------------------------------------ */
    /* measurements (used by the status bar and the tests)                */
    /* ------------------------------------------------------------------ */

    /* Largest |divergence| over the interior — small after project(). */
    divergenceMax() {
      const w = this.w, h = this.h, s = this.stride;
      const u = this.u, v = this.v;
      const hx = 1 / w, hy = 1 / h;
      let max = 0;
      for (let j = 2; j <= h - 1; j++) {
        const row = j * s;
        for (let i = 2; i <= w - 1; i++) {
          const idx = row + i;
          const div = Math.abs(hx * (u[idx + 1] - u[idx - 1]) + hy * (v[idx + s] - v[idx - s])) * 0.5;
          if (div > max) max = div;
        }
      }
      return max;
    }

    /* Mean and peak speed, total dye — the numbers the status bar shows. */
    stats() {
      const w = this.w, h = this.h, s = this.stride;
      let mean = 0, peak = 0, tot = 0;
      for (let j = 1; j <= h; j++) {
        const row = j * s;
        for (let i = 1; i <= w; i++) {
          const idx = row + i;
          const sp = Math.sqrt(this.u[idx] * this.u[idx] + this.v[idx] * this.v[idx]);
          mean += sp;
          if (sp > peak) peak = sp;
          tot += this.r[idx] + this.g[idx] + this.b[idx];
        }
      }
      const n = w * h;
      return { meanSpeed: mean / n, maxSpeed: peak, totalDye: tot, divergence: this.divergenceMax() };
    }

    /* Centre of mass of the dye, in grid coordinates. */
    dyeCentroid() {
      const w = this.w, h = this.h, s = this.stride;
      let x = 0, y = 0, m = 0;
      for (let j = 1; j <= h; j++) {
        const row = j * s;
        for (let i = 1; i <= w; i++) {
          const idx = row + i;
          const wgt = this.r[idx] + this.g[idx] + this.b[idx];
          if (wgt <= 0) continue;
          x += i * wgt; y += j * wgt; m += wgt;
        }
      }
      if (m === 0) return [0, 0];
      return [x / m, y / m];
    }

    dyeSum() {
      const n = this.size;
      let tot = 0;
      for (let i = 0; i < n; i++) tot += this.r[i] + this.g[i] + this.b[i];
      return tot;
    }
  }

  const FluidLib = {
    Fluid: Fluid,
    makeRng: makeRng,
    hexToRgb01: hexToRgb01,
    DEFAULTS: DEFAULTS,
    MIN_DIFFUSE: MIN_DIFFUSE,
  };

  global.FluidLib = FluidLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FluidLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
