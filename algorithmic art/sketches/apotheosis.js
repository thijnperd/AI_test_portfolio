/**
 * Apotheosis — the magnum opus.
 *
 * A distance-estimated raymarcher for the Mandelbulb and its Julia
 * morphologies, rendered on the CPU in progressive bands so the image
 * develops like a print in a darkroom. Coloring uses Quilez's four orbit
 * traps: the origin trap acts as a multiplicative ambient occlusion, and the
 * x=0 / y=0 / z=0 plane traps mix three pigments into the surface, so the
 * color follows the fractal's own structure. Lighting is a key light with
 * raymarched soft shadows, trap-AO, fresnel rim, proximity glow, depth fog,
 * and vignette.
 *
 * Deterministic per seed: the seed chooses the camera's viewing angle, the
 * light direction, and (in Julia mode) the constant c.
 *
 * @module sketches/apotheosis
 */
(function () {
  'use strict';

  /**
   * Trap palettes: a base color plus three plane-trap pigments.
   *
   * Each entry is a set of RGB triples in [0,1].
   *
   * @type {object}
   */
  const PALETTES = {
    ember: {
      base: [0.92, 0.74, 0.52], trapX: [0.82, 0.28, 0.16], trapY: [0.98, 0.68, 0.28], trapZ: [0.38, 0.13, 0.12],
      light: [1.0, 0.86, 0.62], bgTop: [0.12, 0.09, 0.10], bgBot: [0.025, 0.02, 0.025]
    },
    ocean: {
      base: [0.62, 0.78, 0.82], trapX: [0.10, 0.26, 0.42], trapY: [0.32, 0.66, 0.62], trapZ: [0.85, 0.72, 0.38],
      light: [0.82, 0.92, 1.0], bgTop: [0.06, 0.09, 0.13], bgBot: [0.015, 0.02, 0.03]
    },
    viridian: {
      base: [0.52, 0.72, 0.55], trapX: [0.10, 0.30, 0.22], trapY: [0.72, 0.80, 0.42], trapZ: [0.24, 0.18, 0.36],
      light: [0.88, 1.0, 0.82], bgTop: [0.07, 0.11, 0.09], bgBot: [0.018, 0.025, 0.02]
    },
    porcelain: {
      base: [0.94, 0.92, 0.88], trapX: [0.72, 0.68, 0.62], trapY: [0.88, 0.80, 0.66], trapZ: [0.52, 0.50, 0.52],
      light: [1.0, 0.98, 0.92], bgTop: [0.16, 0.155, 0.15], bgBot: [0.05, 0.05, 0.055]
    },
    onyx: {
      base: [0.42, 0.42, 0.48], trapX: [0.92, 0.58, 0.20], trapY: [0.55, 0.30, 0.62], trapZ: [0.20, 0.52, 0.58],
      light: [1.0, 0.92, 0.78], bgTop: [0.08, 0.08, 0.10], bgBot: [0.012, 0.012, 0.018]
    }
  };
  const PALETTE_NAMES = Object.keys(PALETTES);

  const BAILOUT = 2.4;

  /* ---------------- distance estimator + orbit traps ---------------- */
  // geometrically-correct polar formulation (Quilez): equal length
  // exponentiation, equal angle multiplication.
  // Returns the distance estimate; fills `out` (if given) with the four traps.
  function iterate(px, py, pz, p, out) {
    let zx, zy, zz, cx, cy, cz;
    if (p.mode === 'julia') {
      zx = px; zy = py; zz = pz;
      cx = p.cx; cy = p.cy; cz = p.cz;
    } else {
      zx = 0; zy = 0; zz = 0;
      cx = px; cy = py; cz = pz;
    }
    let dr = 1, r = 0;
    let tO = 1e9, tX = 1e9, tY = 1e9, tZ = 1e9;
    let escaped = false;
    for (let i = 0; i < p.iter; i++) {
      r = Math.sqrt(zx * zx + zy * zy + zz * zz);
      if (r > BAILOUT) { escaped = true; break; }
      if (out) {
        if (r < tO) tO = r;
        const ax = zx < 0 ? -zx : zx, ay = zy < 0 ? -zy : zy, az = zz < 0 ? -zz : zz;
        if (ax < tX) tX = ax;
        if (ay < tY) tY = ay;
        if (az < tZ) tZ = az;
      }
      const rp = Math.pow(r, p.power - 1);
      dr = rp * p.power * dr + 1;
      const zr = rp * r;
      const theta = Math.acos(zy / (r < 1e-9 ? 1e-9 : r));
      const phi = Math.atan2(zx, zz);
      const th = theta * p.power, ph = phi * p.power;
      const sth = Math.sin(th);
      zx = zr * sth * Math.sin(ph) + cx;
      zy = zr * Math.cos(th) + cy;
      zz = zr * sth * Math.cos(ph) + cz;
    }
    if (!escaped) return 0; // interior: treat as surface
    if (out) {
      out.o = tO; out.x = tX; out.y = tY; out.z = tZ;
    }
    return 0.5 * Math.log(r) * r / dr;
  }

  /* ---------------- vector helpers (flat, allocation-free) ---------------- */
  function norm3(v) {
    const d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / d, v[1] / d, v[2] / d];
  }

  function normal(x, y, z, p, out) {
    const e = 0.0012;
    const k1 = iterate(x + e, y - e, z - e, p) - iterate(x - e, y + e, z + e, p);
    const k2 = iterate(x - e, y - e, z + e, p) - iterate(x + e, y + e, z - e, p);
    const k3 = iterate(x - e, y + e, z - e, p) - iterate(x + e, y - e, z + e, p);
    const k4 = iterate(x + e, y + e, z + e, p) - iterate(x - e, y - e, z - e, p);
    const n = norm3([k1 + k4, k2 + k4, k3 + k4]);
    out[0] = n[0]; out[1] = n[1]; out[2] = n[2];
    return out;
  }

  function softShadow(x, y, z, lx, ly, lz, p, strength) {
    let res = 1, t = 0.015;
    for (let i = 0; i < 14; i++) {
      const h = iterate(x + lx * t, y + ly * t, z + lz * t, p);
      if (h < 0.0004) return 0;
      res = Math.min(res, 9 * h / t);
      t += Math.max(h, 0.012);
      if (t > 3.2) break;
    }
    return 1 + (res - 1) * strength;
  }

  /* ---------------- shading ---------------- */
  function mix3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function shade(hit, nx, ny, nz, t, rd, st, trap) {
    const p = st.fr, pal = st.pal;
    // trap pigments follow the fractal's own structure (Quilez)
    let col = pal.base;
    col = mix3(col, pal.trapX, (1 - Math.min(1, trap.x * 2.1)) * 0.85);
    col = mix3(col, pal.trapY, (1 - Math.min(1, trap.y * 2.1)) * 0.7);
    col = mix3(col, pal.trapZ, (1 - Math.min(1, trap.z * 2.1)) * 0.7);

    const L = st.light;
    const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const sh = softShadow(hit[0], hit[1], hit[2], L[0], L[1], L[2], p, st.params.shadow);
    const ao = Math.max(0.22, Math.min(1, trap.o * 1.55));       // origin trap = AO
    const rim = Math.pow(1 - Math.max(0, -(nx * rd[0] + ny * rd[1] + nz * rd[2])), 3);

    const amb = 0.16;
    const key = 1.18;
    let r = col[0] * (amb + key * diff * sh) * ao + rim * pal.light[0] * 0.32;
    let g = col[1] * (amb + key * diff * sh) * ao + rim * pal.light[1] * 0.32;
    let b = col[2] * (amb + key * diff * sh) * ao + rim * pal.light[2] * 0.32;

    // depth fog toward the background
    const fog = 1 - Math.exp(-st.params.fog * 0.32 * Math.max(0, t - st.camDist * 0.55));
    r += (st.bgMix[0] - r) * fog;
    g += (st.bgMix[1] - g) * fog;
    b += (st.bgMix[2] - b) * fog;
    return [r, g, b];
  }

  /* ---------------- one ray ---------------- */
  const NRM = [0, 0, 0];
  const TRAP = { o: 1, x: 1, y: 1, z: 1 };

  function march(st, ox, oy, oz, dx, dy, dz) {
    const p = st.fr;
    let t = 0.02, minDe = 1e9, hit = false;
    for (let i = 0; i < 96; i++) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      const d = iterate(x, y, z, p);
      if (d < minDe) minDe = d;
      if (d < 0.0006 * t + 0.0002) { hit = true; break; }
      t += d * 0.92;
      if (t > 14) break;
    }
    return { hit, t, minDe };
  }

  /* ---------------- per-pixel ---------------- */
  function renderPixel(st, px, py) {
    const RES = st.RES, buf = st.buf;
    const sx = (px + 0.5 - RES / 2) / (RES / 2);
    const sy = (py + 0.5 - RES / 2) / (RES / 2);
    const cam = st.cam;
    const dx = cam.fwd[0] * 1.55 + cam.right[0] * sx + cam.up[0] * sy;
    const dy = cam.fwd[1] * 1.55 + cam.right[1] * sx + cam.up[1] * sy;
    const dz = cam.fwd[2] * 1.55 + cam.right[2] * sx + cam.up[2] * sy;
    const rd = norm3([dx, dy, dz]);

    const m = march(st, cam.eye[0], cam.eye[1], cam.eye[2], rd[0], rd[1], rd[2]);
    let r, g, b;

    if (m.hit) {
      const hx = cam.eye[0] + rd[0] * m.t;
      const hy = cam.eye[1] + rd[1] * m.t;
      const hz = cam.eye[2] + rd[2] * m.t;
      normal(hx, hy, hz, st.fr, NRM);
      iterate(hx, hy, hz, st.fr, TRAP);
      const c = shade([hx, hy, hz], NRM[0], NRM[1], NRM[2], m.t, rd, st, TRAP);
      r = c[0]; g = c[1]; b = c[2];
    } else {
      // background: vertical gradient + proximity glow
      const bgT = py / RES;
      r = st.pal.bgTop[0] * (1 - bgT) + st.pal.bgBot[0] * bgT;
      g = st.pal.bgTop[1] * (1 - bgT) + st.pal.bgBot[1] * bgT;
      b = st.pal.bgTop[2] * (1 - bgT) + st.pal.bgBot[2] * bgT;
      const glow = Math.exp(-m.minDe * 7.5) * st.params.glow * 0.85;
      r += st.pal.light[0] * glow;
      g += st.pal.light[1] * glow;
      b += st.pal.light[2] * glow;
    }

    // vignette
    const vx = (px / RES - 0.5) * 2, vy = (py / RES - 0.5) * 2;
    const vig = 1 - Math.min(0.72, (vx * vx + vy * vy) * 0.32) * (st.params.vignette ? 1 : 0);
    r *= vig; g *= vig; b *= vig;

    const i4 = (py * RES + px) * 4;
    buf[i4] = 255 * Math.min(1, Math.max(0, r));
    buf[i4 + 1] = 255 * Math.min(1, Math.max(0, g));
    buf[i4 + 2] = 255 * Math.min(1, Math.max(0, b));
    buf[i4 + 3] = 255;
  }

  function renderRow(st, y) {
    for (let x = 0; x < st.RES; x++) renderPixel(st, x, y);
  }

  /* ---------------- registration ---------------- */
  Art.register({
    id: 'apotheosis',
    title: 'Apotheosis',
    animate: true,   // progressive refinement; pause freezes the developing

    params: {
      fractal: { label: 'Fractal', type: 'select', value: 'mandelbulb', options: ['mandelbulb', 'julia'] },
      power: { label: 'Power', type: 'range', min: 3, max: 12, step: 1, value: 8, integer: true },
      iterations: { label: 'Iterations', type: 'range', min: 4, max: 16, step: 1, value: 12, integer: true },
      resolution: { label: 'Resolution', type: 'range', min: 64, max: 640, step: 20, value: 420, integer: true },
      yaw: { label: 'Camera yaw', type: 'range', min: 0, max: 360, step: 1, value: 34 },
      pitch: { label: 'Camera pitch', type: 'range', min: -80, max: 80, step: 1, value: 22 },
      distance: { label: 'Distance', type: 'range', min: 2, max: 4.5, step: 0.05, value: 3.05 },
      lightAngle: { label: 'Light angle', type: 'range', min: 0, max: 360, step: 1, value: 118 },
      shadow: { label: 'Soft shadow', type: 'range', min: 0, max: 1, step: 0.05, value: 0.7 },
      glow: { label: 'Proximity glow', type: 'range', min: 0, max: 1.5, step: 0.05, value: 0.55 },
      fog: { label: 'Depth fog', type: 'range', min: 0, max: 1, step: 0.05, value: 0.35 },
      palette: { label: 'Palette', type: 'select', value: 'ember', options: PALETTE_NAMES },
      vignette: { label: 'Vignette', type: 'checkbox', value: true }
    },

    setup(e) {
      const p = e.params;
      const RES = p.resolution | 0;

      // the seed chooses the view: camera drift, light and julia constant
      const yawOff = rand(-0.42, 0.42);
      const pitchOff = rand(-0.18, 0.18);
      const yaw = (p.yaw * Math.PI) / 180 + yawOff;
      const pitch = (p.pitch * Math.PI) / 180 + pitchOff;

      const eye = [
        p.distance * Math.sin(yaw) * Math.cos(pitch),
        p.distance * Math.sin(pitch),
        p.distance * Math.cos(yaw) * Math.cos(pitch)
      ];
      const fwd = norm3([-eye[0], -eye[1], -eye[2]]);
      const right = norm3([fwd[2], 0, -fwd[0]]);
      const up = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0]
      ];

      const la = (p.lightAngle * Math.PI) / 180 + yawOff * 0.5;
      const light = norm3([Math.sin(la) * 0.72, 0.62, Math.cos(la) * 0.72]);

      const fr = {
        mode: p.fractal,
        power: p.power,
        iter: p.iterations,
        cx: gauss(0, 0.42), cy: gauss(0, 0.42), cz: gauss(0, 0.42)
      };

      const off = document.createElement('canvas');
      off.width = off.height = RES;
      const octx = off.getContext('2d');
      const img = octx.createImageData(RES, RES);

      const pal = PALETTES[p.palette] || PALETTES.ember;
      const bgMix = mix3(pal.bgTop, pal.bgBot, 0.5);

      e.state = {
        RES, buf: img.data, img, off, octx,
        cam: { eye, fwd, right, up },
        camDist: p.distance,
        light, pal, bgMix,
        fr, params: p,
        row: 0
      };
    },

    draw(e) {
      const st = e.state;
      if (!st || st.row >= st.RES) {
        if (st) { st.octx.putImageData(st.img, 0, 0); e.ctx.drawImage(st.off, 0, 0, e.w, e.h); }
        return;
      }
      // develop in bands, bounded by a per-frame time budget
      const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      while (st.row < st.RES && now() - t0 < 26) {
        renderRow(st, st.row++);
      }
      st.octx.putImageData(st.img, 0, 0);
      e.ctx.drawImage(st.off, 0, 0, e.w, e.h);
    }
  });
})();
