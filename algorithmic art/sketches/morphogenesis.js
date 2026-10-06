/**
 * Morphogenesis — Turing reaction-diffusion (Gray–Scott).
 *
 * Two chemicals diffuse, react, and are replenished until the field settles
 * into spots, worms, labyrinths, or whorls — the "chemical basis of
 * morphogenesis" that Alan Turing proposed in 1952 to explain the markings of
 * leopards and giraffes.
 *
 * This is a live experiment in a petri dish: the pattern develops over time
 * from a seeded speck of chemistry and is never the same twice in sequence,
 * yet it is fully reproducible per seed. Three deliberate departures from the
 * textbook demo:
 *
 * 1. **Currents** — the chemistry is advected through a curl-noise field
 *    (semi-Lagrangian), so the pattern is combed into organic drifts instead
 *    of sitting in a dead grid.
 * 2. **Relief** — the catalyst concentration is lit as a height field: gradient
 *    normals, one raking light, soft specular. The surface reads as embossed
 *    embryonic skin, not a plot.
 * 3. **Stratigraphy** — color comes from a hand-tuned ramp over the
 *    concentration plus deterministic grain, so every export is a print with
 *    tooth.
 *
 * Regimes are the named Pearson / Gray–Scott parameter pairs (coral, mitosis,
 * worms, mazes, holes, fingerprints, spirals, chaos, solitons, waves); the Δ
 * sliders nudge feed/kill away from each regime's center. Original code; maths
 * after Turing (1952), Gray & Scott, Pearson (1993).
 *
 * @module sketches/morphogenesis
 */
(function () {
  'use strict';

  /**
   * Diffusion and time constants for the Gray–Scott system.
   *
   * @type {{ DU: number, DV: number, DT: number }}
   */
  const DU = 1.0, DV = 0.5, DT = 1.0;

  /* ---------------- regimes (feed F, kill k) ---------------- */
  const REGIMES = {
    coral:        { f: 0.0545, k: 0.0620 },
    mitosis:      { f: 0.0367, k: 0.0649 },
    worms:        { f: 0.0580, k: 0.0610 },
    mazes:        { f: 0.0290, k: 0.0570 },
    holes:        { f: 0.0390, k: 0.0605 },
    fingerprints: { f: 0.0370, k: 0.0600 },
    spirals:      { f: 0.0180, k: 0.0510 },
    chaos:        { f: 0.0260, k: 0.0540 },
    solitons:     { f: 0.0300, k: 0.0620 },
    waves:        { f: 0.0140, k: 0.0480 }
  };
  const REGIME_NAMES = Object.keys(REGIMES);

  /* ---------------- palettes (concentration ramps) ---------------- */
  const PALETTES = {
    embryo:    [[0.00, '#2a1226'], [0.22, '#7c2b4e'], [0.48, '#c96a63'], [0.72, '#eec9a3'], [1.00, '#faf1de']],
    reef:      [[0.00, '#04222a'], [0.25, '#0b4f5c'], [0.55, '#2e8f8b'], [0.80, '#9fd6b8'], [1.00, '#f2f7e4']],
    magma:     [[0.00, '#0b0410'], [0.28, '#4a0e2e'], [0.55, '#a12a1c'], [0.80, '#f07022'], [1.00, '#ffd97a']],
    verdigris: [[0.00, '#0a1f18'], [0.25, '#1c4a38'], [0.55, '#4e8f5e'], [0.80, '#a8cf8f'], [1.00, '#eef5d8']],
    graphite:  [[0.00, '#0c0c0e'], [0.30, '#3a3c42'], [0.62, '#8d9099'], [0.85, '#d8dade'], [1.00, '#f7f7f5']],
    dusk:      [[0.00, '#120b26'], [0.28, '#3b2a68'], [0.55, '#7c5cc4'], [0.80, '#c8a2e8'], [1.00, '#f6ecff']]
  };
  const PALETTE_NAMES = Object.keys(PALETTES);

  const INIT_NAMES = ['noise', 'blobs', 'stripes', 'ring', 'scatter'];

  /* ---------------- palette LUT ---------------- */
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

  /* ---------------- grid setup ---------------- */
  function makeSim(n) {
    const size = n * n;
    return {
      n,
      u: new Float32Array(size).fill(1),
      v: new Float32Array(size),
      u2: new Float32Array(size),
      v2: new Float32Array(size),
      vx: new Float32Array(size),
      vy: new Float32Array(size),
      psi: new Float32Array(size),
      xm: new Int32Array(n), xp: new Int32Array(n),
      ym: new Int32Array(n), yp: new Int32Array(n),
      grain: new Int8Array(size)
    };
  }

  function buildIndex(st) {
    for (let i = 0; i < st.n; i++) {
      st.xm[i] = i > 0 ? i - 1 : st.n - 1;
      st.xp[i] = i < st.n - 1 ? i + 1 : 0;
      st.ym[i] = (i > 0 ? i - 1 : st.n - 1) * st.n;
      st.yp[i] = (i < st.n - 1 ? i + 1 : 0) * st.n;
    }
  }

  /* ---------------- seeding the chemistry ---------------- */
  function deposit(st, cx, cy, r) {
    const n = st.n, rr = r * r;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const yy = ((Math.round(cy) + dy) % n + n) % n;
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy > rr) continue;
        const xx = ((Math.round(cx) + dx) % n + n) % n;
        const i = yy * n + xx;
        st.u[i] = 0.5;
        st.v[i] = 0.25;
      }
    }
  }

  function seedField(st, kind) {
    const n = st.n;
    st.u.fill(1);
    st.v.fill(0);
    const fs = 3.2 / n;

    if (kind === 'blobs') {
      const count = randInt(5, 12);
      for (let i = 0; i < count; i++) {
        deposit(st, rand(n), rand(n), rand(n * 0.035, n * 0.11));
      }
    } else if (kind === 'scatter') {
      const count = randInt(36, 90);
      for (let i = 0; i < count; i++) {
        deposit(st, rand(n), rand(n), rand(2, n * 0.03));
      }
    } else if (kind === 'ring') {
      const r0 = n * rand(0.18, 0.34), w = n * rand(0.02, 0.05);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const d = Math.hypot(x - n / 2, y - n / 2);
          if (Math.abs(d - r0) < w) { const i = y * n + x; st.u[i] = 0.5; st.v[i] = 0.25; }
        }
      }
    } else if (kind === 'stripes') {
      const ang = rand(0, TAU), fq = rand(0.045, 0.09);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const warp = (fbm(x * fs * 1.6, y * fs * 1.6, 3) - 0.5) * 26;
          const band = Math.sin((x * ca + y * sa) * fq + warp);
          if (band > 0.25) { const i = y * n + x; st.u[i] = 0.5; st.v[i] = 0.25; }
        }
      }
    } else { // 'noise' — thresholded fbm patches, the richest starter
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const f = fbm(x * fs, y * fs, 4);
          if (f > 0.585 && f < 0.66) { const i = y * n + x; st.u[i] = 0.5; st.v[i] = 0.25; }
        }
      }
    }
  }

  /* ---------------- curl-noise currents ---------------- */
  function buildFlow(st, strength) {
    const n = st.n, fs = 2.6 / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        st.psi[y * n + x] = fbm(x * fs, y * fs, 3);
      }
    }
    let mx = 1e-6;
    for (let y = 0; y < n; y++) {
      const y0 = y * n;
      for (let x = 0; x < n; x++) {
        const gx = st.psi[y0 + st.xp[x]] - st.psi[y0 + st.xm[x]];
        const gy = st.psi[st.yp[y] + x] - st.psi[st.ym[y] + x];
        const i = y0 + x;
        st.vx[i] = gy;
        st.vy[i] = -gx;
        const m = Math.abs(gx) + Math.abs(gy);
        if (m > mx) mx = m;
      }
    }
    const s = strength * 1.35 / mx;
    for (let i = 0; i < n * n; i++) { st.vx[i] *= s; st.vy[i] *= s; }
  }

  /* ---------------- simulation ---------------- */
  function step(st, f, k) {
    const n = st.n;
    const u = st.u, v = st.v, u2 = st.u2, v2 = st.v2;
    const xm = st.xm, xp = st.xp, ym = st.ym, yp = st.yp;
    for (let y = 0; y < n; y++) {
      const y0 = y * n, rowU = ym[y], rowD = yp[y];
      for (let x = 0; x < n; x++) {
        const xl = xm[x], xr = xp[x];
        const i = y0 + x;
        const uc = u[i], vc = v[i];
        const lapU =
          0.2 * (u[y0 + xl] + u[y0 + xr] + u[rowU + x] + u[rowD + x]) +
          0.05 * (u[rowU + xl] + u[rowU + xr] + u[rowD + xl] + u[rowD + xr]) - uc;
        const lapV =
          0.2 * (v[y0 + xl] + v[y0 + xr] + v[rowU + x] + v[rowD + x]) +
          0.05 * (v[rowU + xl] + v[rowU + xr] + v[rowD + xl] + v[rowD + xr]) - vc;
        const uvv = uc * vc * vc;
        let nu = uc + (lapU * DU - uvv + f * (1 - uc)) * DT;
        let nv = vc + (lapV * DV + uvv - (f + k) * vc) * DT;
        // clamp + denormal flush: a dying regime must die FAST and visibly,
        // never linger in gradual underflow (which also crawls at ~100× cost)
        u2[i] = nu < 1e-5 ? 0 : nu > 1 ? 1 : nu;
        v2[i] = nv < 1e-5 ? 0 : nv > 1 ? 1 : nv;
      }
    }
    st.u = u2; st.u2 = u;
    st.v = v2; st.v2 = v;
  }

  // semi-Lagrangian advection through the curl field (the "currents")
  function advect(st, mult) {
    const n = st.n;
    const u = st.u, v = st.v, u2 = st.u2, v2 = st.v2;
    for (let y = 0; y < n; y++) {
      const y0 = y * n;
      for (let x = 0; x < n; x++) {
        const i = y0 + x;
        let sx = x - st.vx[i] * mult, sy = y - st.vy[i] * mult;
        sx = ((sx % n) + n) % n;
        sy = ((sy % n) + n) % n;
        const x0 = Math.floor(sx), y0i = Math.floor(sy);
        const fx = sx - x0, fy = sy - y0i;
        const x1 = x0 + 1 < n ? x0 + 1 : 0;
        const y1 = y0i + 1 < n ? y0i + 1 : 0;
        const i00 = y0i * n + x0, i10 = y0i * n + x1;
        const i01 = y1 * n + x0, i11 = y1 * n + x1;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy, w11 = fx * fy;
        u2[i] = u[i00] * w00 + u[i10] * w10 + u[i01] * w01 + u[i11] * w11;
        v2[i] = v[i00] * w00 + v[i10] * w10 + v[i01] * w01 + v[i11] * w11;
      }
    }
    st.u = u2; st.u2 = u;
    st.v = v2; st.v2 = v;
  }

  /* ---------------- rendering ---------------- */
  function render(st, p, img) {
    const n = st.n, v = st.v, d = img.data;
    const lut = st.lut, grain = st.grain;
    // catalyst concentrations live in roughly [0, 0.43]; span the whole ramp
    const SPAN = 2.38;
    const ang = p.light * Math.PI / 180;
    const lx = Math.cos(ang) * 0.76, ly = Math.sin(ang) * 0.76, lz = 0.65;
    const relief = p.relief * 2.6;
    let o = 0;
    for (let y = 0; y < n; y++) {
      const y0 = y * n, rowU = st.ym[y], rowD = st.yp[y];
      for (let x = 0; x < n; x++) {
        const xl = st.xm[x], xr = st.xp[x];
        const i = y0 + x;
        const val = v[i];
        let li = (val * SPAN * 255) | 0;
        li = li < 0 ? 0 : li > 255 ? 255 : li;
        const gx = (v[y0 + xr] - v[y0 + xl]) * relief;
        const gy = (v[rowD + x] - v[rowU + x]) * relief;
        // surface normal of the concentration relief
        const invLen = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const dot = (-gx * lx - gy * ly + lz) * invLen;
        const diff = dot > 0 ? dot : 0;
        const shade = 0.58 + 0.72 * diff;
        const d2 = diff * diff;
        const glint = d2 * d2 * d2 * d2 * 34; // soft specular on the relief
        const g = grain[i] * p.grain;
        d[o] = lut[li * 3] * shade + glint + g;
        d[o + 1] = lut[li * 3 + 1] * shade + glint + g;
        d[o + 2] = lut[li * 3 + 2] * shade + glint + g;
        d[o + 3] = 255;
        o += 4;
      }
    }
  }

  /* ---------------- registration ---------------- */
  Art.register({
    id: 'morphogenesis',
    title: 'Morphogenesis',
    animate: true,

    params: {
      regime:   { label: 'Regime', type: 'select', value: 'coral', options: REGIME_NAMES },
      feed:     { label: 'Feed Δ', type: 'range', min: -0.008, max: 0.008, step: 0.0002, value: 0 },
      kill:     { label: 'Kill Δ', type: 'range', min: -0.008, max: 0.008, step: 0.0002, value: 0 },
      resolution: { label: 'Resolution', type: 'range', min: 96, max: 320, step: 32, value: 160, integer: true },
      speed:    { label: 'Sim speed', type: 'range', min: 1, max: 24, step: 1, value: 7, integer: true },
      init:     { label: 'Seed pattern', type: 'select', value: 'noise', options: INIT_NAMES },
      currents: { label: 'Currents', type: 'range', min: 0, max: 1, step: 0.05, value: 0.25 },
      palette:  { label: 'Palette', type: 'select', value: 'embryo', options: PALETTE_NAMES },
      relief:   { label: 'Relief', type: 'range', min: 0, max: 1, step: 0.05, value: 0.55 },
      light:    { label: 'Light angle', type: 'range', min: 0, max: 360, step: 5, value: 315, integer: true },
      grain:    { label: 'Grain', type: 'range', min: 0, max: 1, step: 0.05, value: 0.3 }
    },

    setup(e) {
      const p = e.params;
      const n = Math.round(p.resolution);
      const st = makeSim(n);
      buildIndex(st);
      seedField(st, p.init);
      buildFlow(st, p.currents);
      st.lut = buildLut(PALETTES[p.palette] || PALETTES.embryo);
      for (let i = 0; i < n * n; i++) st.grain[i] = Math.round(gauss(0, 16));

      const off = document.createElement('canvas');
      off.width = n;
      off.height = n;
      const octx = off.getContext('2d');
      st.img = octx.createImageData(n, n);
      st.off = off;
      st.octx = octx;

      const reg = REGIMES[p.regime] || REGIMES.coral;
      st.f = clamp(reg.f + p.feed, 0.004, 0.1);
      st.k = clamp(reg.k + p.kill, 0.03, 0.085);

      e.state = st;
    },      draw(e) {
      const st = e.state, p = e.params, ctx = e.ctx;
      for (let s = 0; s < p.speed; s++) {
        step(st, st.f, st.k);
        // currents: advect once per 4 steps with 4× displacement — the same
        // drift with a quarter of the semi-Lagrangian smear
        if (p.currents > 0 && (s & 3) === 3) advect(st, 4);
      }
      render(st, p, st.img);
      st.octx.putImageData(st.img, 0, 0);
      ctx.imageSmoothingEnabled = true; // bilinear upscale: soft, organic
      ctx.drawImage(st.off, 0, 0, e.w, e.h);
    }
  });
})();
