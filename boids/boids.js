/* boids.js — flocking simulation core (Reynolds' Boids).
 *
 * Pure logic, no DOM: runs in the browser (as `BoidsLib`) and in Node
 * (`module.exports`) so the flocking rules can be tested with `node test.js`.
 *
 * Each boid steers by combining three weighted rules over its neighbours:
 *   separation — steer away from crowding neighbours
 *   alignment  — match the average heading of neighbours
 *   cohesion   — steer toward the average position of neighbours
 *
 * The world is a torus when `edge: 'wrap'`, otherwise boids bounce off the
 * walls. All randomness goes through a seeded RNG, so the same seed and
 * settings always produce the same flock.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Seeded RNG (mulberry32) — same seed, same flock.                    */
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
    count: 160,
    width: 900,
    height: 620,
    perception: 46,       // neighbour search radius
    separationRadius: 16, // "too close" radius
    maxSpeed: 120,        // pixels per second
    separation: 1.5,      // rule weights
    alignment: 1.0,
    cohesion: 0.85,
    edge: 'wrap',         // 'wrap' | 'bounce'
  };

  /* Clamp a vector to a maximum length. */
  function limit(x, y, max) {
    const len = Math.hypot(x, y);
    if (len > max && len > 0) {
      const s = max / len;
      return [x * s, y * s];
    }
    return [x, y];
  }

  /* Rescale a vector to an exact length (a zero vector stays zero). */
  function withLength(x, y, len) {
    const d = Math.hypot(x, y);
    if (d === 0) return [0, 0];
    return [(x / d) * len, (y / d) * len];
  }

  /* Shortest signed distance from a to b along one torus axis. */
  function torusDelta(a, b, size) {
    let d = b - a;
    if (d > size / 2) d -= size;
    else if (d < -size / 2) d += size;
    return d;
  }

  class Flock {
    constructor(options) {
      this.opts = Object.assign({}, DEFAULTS, options || {});
      this.rng = makeRng(this.opts.seed >>> 0);
      this.boids = [];
      this.reset();
    }

    /* Fill the flock with boids at random positions and headings. */
    reset() {
      const o = this.opts;
      this.boids = [];
      for (let i = 0; i < o.count; i++) {
        const angle = this.rng() * Math.PI * 2;
        const speed = o.maxSpeed * (0.6 + 0.4 * this.rng());
        this.boids.push({
          x: this.rng() * o.width,
          y: this.rng() * o.height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
        });
      }
      return this.boids;
    }

    /* Add a boid with an explicit state (used by tests and the sandbox). */
    addBoid(x, y, vx, vy) {
      const b = { x: x, y: y, vx: vx || 0, vy: vy || 0 };
      this.boids.push(b);
      return b;
    }

    /* Steering acceleration for one boid from the current flock state. */
    steering(boid) {
      const o = this.opts;
      const p2 = o.perception * o.perception;
      const s2 = o.separationRadius * o.separationRadius;
      let sepX = 0, sepY = 0;
      let aliX = 0, aliY = 0;
      let cohX = 0, cohY = 0;
      let neighbours = 0;
      let close = 0;

      for (let i = 0; i < this.boids.length; i++) {
        const other = this.boids[i];
        if (other === boid) continue;
        const dx = torusDelta(boid.x, other.x, o.width);
        const dy = torusDelta(boid.y, other.y, o.height);
        const d2 = dx * dx + dy * dy;
        if (d2 > p2) continue;
        neighbours++;
        aliX += other.vx;
        aliY += other.vy;
        cohX += dx;
        cohY += dy;
        if (d2 > 0 && d2 < s2) {
          // Steer away, weighted by 1/distance so nearer boids push harder.
          const inv = 1 / Math.sqrt(d2);
          sepX -= dx * inv;
          sepY -= dy * inv;
          close++;
        }
      }

      let ax = 0;
      let ay = 0;

      if (close > 0) {
        const s = withLength(sepX, sepY, o.maxSpeed);
        ax += o.separation * s[0];
        ay += o.separation * s[1];
      }
      if (neighbours > 0) {
        const a = withLength(aliX, aliY, o.maxSpeed);
        ax += o.alignment * (a[0] - boid.vx);
        ay += o.alignment * (a[1] - boid.vy);

        const c = withLength(cohX, cohY, o.maxSpeed);
        ax += o.cohesion * (c[0] - boid.vx);
        ay += o.cohesion * (c[1] - boid.vy);
      }
      return [ax, ay];
    }

    /* Advance the simulation by dt seconds. */
    step(dt) {
      if (!(dt > 0)) return;
      const o = this.opts;
      const accelerations = [];
      for (let i = 0; i < this.boids.length; i++) {
        accelerations.push(this.steering(this.boids[i]));
      }
      for (let i = 0; i < this.boids.length; i++) {
        const b = this.boids[i];
        const a = accelerations[i];
        b.vx += a[0] * dt;
        b.vy += a[1] * dt;
        const v = limit(b.vx, b.vy, o.maxSpeed);
        b.vx = v[0];
        b.vy = v[1];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        this.constrain(b);
      }
    }

    /* Keep a boid inside the world (wrap onto the torus or bounce). */
    constrain(b) {
      const o = this.opts;
      if (o.edge === 'bounce') {
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
        else if (b.x > o.width) { b.x = o.width; b.vx = -Math.abs(b.vx); }
        if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
        else if (b.y > o.height) { b.y = o.height; b.vy = -Math.abs(b.vy); }
      } else {
        b.x = ((b.x % o.width) + o.width) % o.width;
        b.y = ((b.y % o.height) + o.height) % o.height;
      }
    }

    /* Average position of the flock (its centre of mass). */
    centroid() {
      let x = 0;
      let y = 0;
      for (let i = 0; i < this.boids.length; i++) {
        x += this.boids[i].x;
        y += this.boids[i].y;
      }
      const n = this.boids.length || 1;
      return [x / n, y / n];
    }

    /* Alignment score in [0, 1]: 1 means every boid points the same way. */
    alignmentScore() {
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < this.boids.length; i++) {
        const b = this.boids[i];
        const len = Math.hypot(b.vx, b.vy) || 1;
        sx += b.vx / len;
        sy += b.vy / len;
      }
      const n = this.boids.length || 1;
      return Math.hypot(sx / n, sy / n);
    }
  }

  const BoidsLib = {
    Flock: Flock,
    makeRng: makeRng,
    limit: limit,
    withLength: withLength,
    torusDelta: torusDelta,
    DEFAULTS: DEFAULTS,
  };

  global.BoidsLib = BoidsLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BoidsLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
