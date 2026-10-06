/**
 * Physarum — speculative mycology.
 *
 * Thousands of autonomous agents sense the trails their predecessors left,
 * turn toward them, move, and deposit — the Jeff Jones (2010) approximation
 * of *Physarum polycephalum*. No agent knows the shape it belongs to; the
 * vascular network is pure emergence, negotiated between strangers through a
 * chemical memory that blurs and forgets.
 *
 * Two departures from the textbook demo:
 *
 * 1. **Speculative biology** — the agents' sensor distance, turn, and step
 *    are functions of the trail they stand on (after Sage Jenson's "36
 *    Points"), so behavior changes between the open field and the settled
 *    highways: explorers become commuters. Eight named behavior profiles live
 *    in this parameter space.
 * 2. **Stratigraphy** — the image accumulates a persistent, usage-weighted ink
 *    over the whole run while the living trail keeps glowing through it: veins
 *    age into geology. Export a PNG at any moment.
 *
 * Deterministic per seed: the same seed grows the same organism. Original
 * code; algorithm after Jones (2010), parameter modulation after Jenson
 * (2019–2022).
 *
 * @module sketches/physarum
 */
(function () {
  'use strict';

  /**
   * Behavior profiles.
   *
   * Each entry tunes how agents behave as a function of the trail value `x`
   * under their feet (0 = open ground, 1 = deep highway): `param = a + b·x^e`,
   * with `e ∈ {0.5, 1, 2, 3}`.
   *
   * @type {object}
   */
  const BEHAVIORS = {
    mycelium: { // the classic: thick, confident vascular nets
      sd: [7, 6, 0.5], sa: 0.50, ra: [0.34, -0.14, 1], md: [1.15, 0.35, 1],
      decay: 0.945, dep: 0.9, wander: 0.10, respawn: 0.00012
    },
    veins: { // strong trail-locking: bold highways, few strays
      sd: [5, 9, 0.5], sa: 0.34, ra: [0.26, -0.18, 1], md: [1.0, 0.5, 1],
      decay: 0.955, dep: 1.15, wander: 0.05, respawn: 0.00006
    },
    filigree: { // small sensors, nervous turns: dense lace
      sd: [4, 3, 1], sa: 0.72, ra: [0.55, -0.2, 1], md: [0.85, 0.25, 1],
      decay: 0.935, dep: 0.65, wander: 0.16, respawn: 0.0002
    },
    tendrils: { // long-range explorers that never quite settle
      sd: [11, 7, 0.5], sa: 0.88, ra: [0.46, -0.1, 1], md: [1.35, 0.3, 1],
      decay: 0.955, dep: 0.8, wander: 0.22, respawn: 0.00035
    },
    labyrinth: { // slow forgetting builds walled mazes
      sd: [9, 8, 0.5], sa: 0.44, ra: [0.5, -0.28, 1], md: [1.0, 0.3, 1],
      decay: 0.968, dep: 1.0, wander: 0.07, respawn: 0.00008
    },
    chordate: { // long straight filaments, spinal sheets
      sd: [8, 10, 1], sa: 0.22, ra: [0.16, -0.08, 1], md: [1.5, 0.4, 1],
      decay: 0.958, dep: 0.95, wander: 0.04, respawn: 0.00005
    },
    pearls: { // churning colonies that bead into dotted chains
      sd: [3, 12, 2], sa: 0.62, ra: [0.62, -0.3, 1], md: [1.15, -0.5, 3],
      decay: 0.93, dep: 1.3, wander: 0.28, respawn: 0.001
    },
    gossamer: { // a mist of fine threads, barely there
      sd: [6, 4, 1], sa: 0.58, ra: [0.6, -0.22, 1], md: [0.62, 0.2, 1],
      decay: 0.972, dep: 0.4, wander: 0.12, respawn: 0.00025
    }
  };
  const BEHAVIOR_NAMES = Object.keys(BEHAVIORS);

  /* ---------------- palettes (ink density ramps) ----------------
     `dark`: dark ground with light ink (glow adds light);
     sepia is the inverse — paper ground, ink darkens, glow subtracts. */
  const PALETTES = {
    noctiluca: { dark: true, stops: [[0.00, '#05070d'], [0.30, '#0e2e40'], [0.58, '#2c7d80'], [0.82, '#9fd8b5'], [1.00, '#f6f3d8']] },
    ember:     { dark: true, stops: [[0.00, '#0a0506'], [0.30, '#3d0f16'], [0.58, '#96301c'], [0.82, '#e0742c'], [1.00, '#ffd98a']] },
    cyanotype: { dark: true, stops: [[0.00, '#071226'], [0.32, '#12336b'], [0.62, '#3f6fb5'], [0.85, '#9dbfe6'], [1.00, '#f2f6fb']] },
    sepia:     { dark: false, stops: [[0.00, '#e8ddc4'], [0.30, '#bfa271'], [0.58, '#8a5f36'], [0.82, '#5d3a1e'], [1.00, '#2e1c0e']] },
    spore:     { dark: true, stops: [[0.00, '#0b0614'], [0.30, '#2c1454'], [0.58, '#6d2f9e'], [0.82, '#c472c8'], [1.00, '#fbdff0']] },
    carbon:    { dark: true, stops: [[0.00, '#0c0c0d'], [0.32, '#2e2f31'], [0.62, '#6f7176'], [0.85, '#c3c5c9'], [1.00, '#f8f8f6']] }
  };
  const PALETTE_NAMES = Object.keys(PALETTES);

  function buildLut(stops) {
    const lut = new Uint8Array(256 * 3);
    const pts = stops.map(s => {
      const c = Art.Color.hexToRgb(s[1]);
      return { t: s[0], r: c.r, g: c.g, b: c.b };
    });
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let a = pts[0], b = pts[pts.length - 1];
      for (let j = 0; j < pts.length - 1; j++) {
        if (t >= pts[j].t && t <= pts[j + 1].t) { a = pts[j]; b = pts[j + 1]; break; }
      }
      const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      const s = u * u * (3 - 2 * u);
      lut[i * 3] = a.r + (b.r - a.r) * s;
      lut[i * 3 + 1] = a.g + (b.g - a.g) * s;
      lut[i * 3 + 2] = a.b + (b.b - a.b) * s;
    }
    return lut;
  }

  // param = a + b · x^e with e ∈ {0.5, 1, 2, 3} (pow-free for speed)
  function mod(x, m) {
    const e = m[2];
    let p;
    if (e === 0.5) p = Math.sqrt(x < 0 ? 0 : x);
    else if (e === 1) p = x;
    else if (e === 2) p = x * x;
    else p = x * x * x;
    return m[0] + m[1] * p;
  }

  function sample(trail, n, x, y) {
    // bilinear, toroidal — integer wrapping (float % is a hot-path tax)
    let x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    x0 = ((x0 % n) + n) % n;
    y0 = ((y0 % n) + n) % n;
    const x1 = x0 + 1 === n ? 0 : x0 + 1;
    const y1 = y0 + 1 === n ? 0 : y0 + 1;
    const row0 = y0 * n, row1 = y1 * n;
    return trail[row0 + x0] * (1 - fx) * (1 - fy) + trail[row0 + x1] * fx * (1 - fy) +
      trail[row1 + x0] * (1 - fx) * fy + trail[row1 + x1] * fx * fy;
  }

  /* ---------------- simulation ---------------- */
  function agentStep(st, p, prof) {
    const n = st.n;
    const trail = st.trail, ink = st.ink;
    const ax = st.ax, ay = st.ay, adx = st.adx, ady = st.ady;
    const cosSA = st.cosSA, sinSA = st.sinSA;
    const wander = p.wander, respawn = prof.respawn, dep = p.dep;

    for (let i = 0; i < st.count; i++) {
      const x = ax[i], y = ay[i];
      const dx = adx[i], dy = ady[i];

      // behaviour depends on the trail underfoot (speculative biology)
      const here = sample(trail, n, x, y);
      const x0 = here > 1 ? 1 : here;
      const SD = mod(x0, prof.sd);
      const RA = mod(x0, prof.ra);
      const MD = mod(x0, prof.md);

      // sense ahead / left / right
      const fC = sample(trail, n, x + dx * SD, y + dy * SD);
      const fL = sample(trail, n, x + (dx * cosSA - dy * sinSA) * SD, y + (dy * cosSA + dx * sinSA) * SD);
      const fR = sample(trail, n, x + (dx * cosSA + dy * sinSA) * SD, y + (dy * cosSA - dx * sinSA) * SD);

      // one signed rotation covers turn + wander
      let ang = 0;
      if (fC >= fL && fC >= fR) {
        ang = 0; // hold course
      } else if (fL > fR) {
        ang = RA;
      } else if (fR > fL) {
        ang = -RA;
      } else {
        ang = RNG.unit() < 0.5 ? RA : -RA;
      }
      if (wander > 0) ang += (RNG.unit() - 0.5) * wander;

      let ndx = dx, ndy = dy;
      if (ang !== 0) {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        ndx = dx * ca - dy * sa;
        ndy = dy * ca + dx * sa;
      }

      let nx = x + ndx * MD;
      let ny = y + ndy * MD;
      // toroidal wrap (cheap: one correction is enough for small steps)
      if (nx < 0) nx += n; else if (nx >= n) nx -= n;
      if (ny < 0) ny += n; else if (ny >= n) ny -= n;

      if (respawn > 0 && RNG.unit() < respawn) {
        nx = RNG.unit() * n;
        ny = RNG.unit() * n;
        const a = RNG.unit() * TAU;
        ndx = Math.cos(a);
        ndy = Math.sin(a);
      }

      ax[i] = nx; ay[i] = ny; adx[i] = ndx; ady[i] = ndy;

      const idx = (ny | 0) * n + (nx | 0);
      trail[idx] += dep;
      // ink is usage-weighted: settled highways darken, strays leave a breath
      ink[idx] += 1 + trail[idx] * 0.15;
    }
  }

  // separable blur (1-2-1) + decay — the "forgetting"
  function diffuseDecay(st, amount, decay) {
    const n = st.n, trail = st.trail, tmp = st.tmp;
    const a = amount * 0.25, mid = 1 - amount * 0.5;
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const xl = x > 0 ? x - 1 : n - 1;
        const xr = x < n - 1 ? x + 1 : 0;
        tmp[row + x] = (trail[row + xl] + trail[row + xr]) * a + trail[row + x] * mid;
      }
    }
    for (let y = 0; y < n; y++) {
      const row = y * n;
      const up = (y > 0 ? y - 1 : n - 1) * n;
      const dn = (y < n - 1 ? y + 1 : 0) * n;
      for (let x = 0; x < n; x++) {
        trail[row + x] = ((tmp[up + x] + tmp[dn + x]) * a + tmp[row + x] * mid) * decay;
      }
    }
  }

  /* ---------------- rendering ---------------- */
  function render(st, p, img) {
    const n = st.n, ink = st.ink, trail = st.trail, lut = st.lut, grain = st.grain;
    const d = img.data;
    const gain = p.exposure * 0.011;
    const sgn = st.glowSign;
    let o = 0;
    for (let i = 0; i < n * n; i++) {
      // accumulated geology: rational response, graceful at every run length
      const raw = ink[i] * gain;
      const t = raw / (1 + raw);
      let li = (t * 255) | 0;
      if (li > 255) li = 255;
      // living front glows through the fresh trail (soft-capped)
      const tg = trail[i] * p.memory * 0.14;
      const glow = sgn * 110 * tg / (1 + tg);
      const g = grain[i];
      d[o] = lut[li * 3] + glow + g;
      d[o + 1] = lut[li * 3 + 1] + glow + g;
      d[o + 2] = lut[li * 3 + 2] + glow + g;
      d[o + 3] = 255;
      o += 4;
    }
  }

  /* ---------------- registration ---------------- */
  Art.register({
    id: 'physarum',
    title: 'Physarum',
    animate: true,

    params: {
      behavior:  { label: 'Behaviour', type: 'select', value: 'mycelium', options: BEHAVIOR_NAMES },
      population: { label: 'Population', type: 'range', min: 2000, max: 40000, step: 1000, value: 9000, integer: true },
      resolution: { label: 'Resolution', type: 'range', min: 128, max: 384, step: 64, value: 256, integer: true },
      speed:     { label: 'Speed', type: 'range', min: 1, max: 8, step: 1, value: 2, integer: true },
      memory:    { label: 'Trail glow', type: 'range', min: 0, max: 1, step: 0.05, value: 0.55 },
      exposure:  { label: 'Exposure', type: 'range', min: 0.4, max: 2.4, step: 0.1, value: 1 },
      diffusion: { label: 'Diffusion', type: 'range', min: 0, max: 1, step: 0.05, value: 0.45 },
      palette:   { label: 'Palette', type: 'select', value: 'noctiluca', options: PALETTE_NAMES },
      grain:     { label: 'Grain', type: 'range', min: 0, max: 1, step: 0.05, value: 0.25 }
    },

    setup(e) {
      const p = e.params;
      const n = Math.round(p.resolution);
      const pal = PALETTES[p.palette] || PALETTES.noctiluca;
      const prof = BEHAVIORS[p.behavior] || BEHAVIORS.mycelium;
      const count = Math.round(p.population);

      const st = {
        n, count, prof,
        trail: new Float32Array(n * n),
        tmp: new Float32Array(n * n),
        ink: new Float32Array(n * n),
        ax: new Float32Array(count),
        ay: new Float32Array(count),
        adx: new Float32Array(count),
        ady: new Float32Array(count),
        cosSA: Math.cos(prof.sa),
        sinSA: Math.sin(prof.sa),
        lut: buildLut(pal.stops),
        glowSign: pal.dark ? 1 : -1,
        grain: new Int8Array(n * n)
      };
      for (let i = 0; i < count; i++) {
        st.ax[i] = rand(n);
        st.ay[i] = rand(n);
        const a = rand(0, TAU);
        st.adx[i] = Math.cos(a);
        st.ady[i] = Math.sin(a);
      }
      for (let i = 0; i < n * n; i++) st.grain[i] = Math.round(gauss(0, 7));

      // behaviour sets deposit / forgetting / wander
      st.dep = prof.dep * (0.85 + p.diffusion * 0.3);
      st.decay = prof.decay;
      st.wanderMul = prof.wander;

      const off = document.createElement('canvas');
      off.width = n;
      off.height = n;
      const octx = off.getContext('2d');
      st.img = octx.createImageData(n, n);
      st.off = off;
      st.octx = octx;

      e.state = st;
    },

    draw(e) {
      const st = e.state, p = e.params, ctx = e.ctx;
      const prof = st.prof;
      const sim = {
        n: st.n, count: st.count, trail: st.trail, ink: st.ink,
        ax: st.ax, ay: st.ay, adx: st.adx, ady: st.ady,
        cosSA: st.cosSA, sinSA: st.sinSA,
        dep: st.dep / p.speed, wander: st.wanderMul
      };
      for (let s = 0; s < p.speed; s++) agentStep(sim, sim, prof);
      diffuseDecay(st, p.diffusion, st.decay);
      render(st, p, st.img);
      st.octx.putImageData(st.img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(st.off, 0, 0, e.w, e.h);
    }
  });
})();
