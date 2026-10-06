/**
 * Meander — flow-field ribbon composition ("Fluvial Order").
 *
 * The flagship static piece. Curved ribbons are advected through a
 * multi-octave noise field and deposited like sediment: weighted palettes,
 * strict collision etiquette, split end-caps, optional block / outline /
 * soft-hatch fills, a faint field-line underlayer, and paper grain. Same
 * seed + params always produces the same image.
 *
 * This is an original implementation in the lineage of long-form flow-field
 * works such as Fidenza.
 *
 * @module sketches/meander
 */
(function () {
  'use strict';

  /**
   * Design-space canvas, square. The whole composition is built in this
   * coordinate system and then scaled to fit the real canvas.
   *
   * @type {number}
   */
  const DESIGN = 1000;

  /**
   * Flow-field grid pitch in design pixels.
   *
   * @type {number}
   */
  const FIELD_CELL = 22;

  /**
   * Occupancy grid pitch used for the collision-avoidance checks.
   *
   * @type {number}
   */
  const OCC_CELL = 5;

  /* ---------------- thickness scales ---------------- */
  // fixed: one width · mix: [[width, weight], ...]
  const SCALE_MODES = {
    'micro-uniform': { fixed: 2.5 },
    'uniform': { fixed: 30 },
    'small': [[7, 0.45], [16, 0.35], [34, 0.2]],
    'medium': [[18, 0.4], [42, 0.35], [90, 0.25]],
    'large': [[55, 0.35], [110, 0.4], [190, 0.25]],
    'jumbo': [[90, 0.3], [170, 0.4], [260, 0.3]],
    'jumbo-xl': [[220, 0.4], [320, 0.35], [430, 0.25]]
  };

  /* ---------------- probabilistic palettes ----------------
     [color, weight] pairs; weights are deposition probabilities. */
  const PALETTES = {
    delft: {
      bg: '#f2efe7', ink: '#1d2432',
      colors: [['#22366b', 3.2], ['#2f5bb7', 1.6], ['#7c9cc9', 1.2], ['#d98e4a', 1.1], ['#b7412f', 0.5], ['#17202e', 1.4], ['#e8e2d4', 0.9]]
    },
    sanguine: {
      bg: '#f4ebe2', ink: '#33201a',
      colors: [['#c65a38', 3], ['#9c3b26', 1.8], ['#e2a33c', 1.4], ['#6e2c1e', 1.1], ['#f0e5d2', 0.8], ['#7c5548', 1]]
    },
    nocturne: {
      bg: '#0e1116', ink: '#c9d2de',
      colors: [['#38455c', 2.6], ['#a9b6c8', 1.5], ['#d9a441', 1.2], ['#2f6f6b', 1.3], ['#e6e9ee', 0.9], ['#232b38', 2]]
    },
    verdigris: {
      bg: '#eee9dd', ink: '#22302a',
      colors: [['#2c5c46', 2.8], ['#57896b', 1.7], ['#9dbf9a', 1.2], ['#b06a3b', 1.1], ['#22302a', 1.2], ['#e5ddc8', 0.8]]
    },
    ochre: {
      bg: '#f0e6d2', ink: '#3d2b1f',
      colors: [['#d9a441', 2.7], ['#b9762e', 1.9], ['#7c4a24', 1.3], ['#e8d5a8', 1], ['#3d2b1f', 1.2], ['#a4482c', 0.6]]
    },
    ice: {
      bg: '#eef1f2', ink: '#1b2733',
      colors: [['#2c3e50', 2.8], ['#6f8fa6', 1.8], ['#b8ccd8', 1.3], ['#d9784f', 0.7], ['#1b2733', 1.3], ['#e3e9ec', 0.8]]
    },
    mono: {
      bg: '#0c0c0e', ink: '#f2f2f0',
      colors: [['#f2f2f0', 2.4], ['#c9c9c4', 1.6], ['#8c8c88', 1.4], ['#55554f', 1.2], ['#e0a45c', 0.5]]
    },
    poppy: {
      bg: '#f6f1e7', ink: '#22304e',
      colors: [['#d1382f', 2.6], ['#edb949', 1.5], ['#22304e', 1.6], ['#e0796b', 1.1], ['#f6f1e7', 0.7], ['#7a2320', 0.9]]
    }
  };

  const PALETTE_NAMES = Object.keys(PALETTES);

  /* ---------------- small deterministic helpers ---------------- */
  function pickWeighted(pairs) {
    let total = 0;
    for (let i = 0; i < pairs.length; i++) total += pairs[i][1];
    let r = rand() * total;
    for (let i = 0; i < pairs.length; i++) {
      r -= pairs[i][1];
      if (r <= 0) return pairs[i][0];
    }
    return pairs[pairs.length - 1][0];
  }

  function pickThickness(mode) {
    const spec = SCALE_MODES[mode] || SCALE_MODES.large;
    return spec.fixed !== undefined ? spec.fixed : pickWeighted(spec);
  }

  function angDiff(target, current) {
    let d = (target - current) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  /* ---------------- flow field ---------------- */
  function buildField(p) {
    const n = Math.ceil(DESIGN / FIELD_CELL) + 2;
    const vx = new Float32Array(n * n);
    const vy = new Float32Array(n * n);
    const freq = p.fieldScale * 2.2 / DESIGN;
    const turb = p.turbulence === 'none' ? 0 : p.turbulence === 'low' ? 0.5 : p.turbulence === 'high' ? 1.8 : 1;

    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const x = gx * FIELD_CELL, y = gy * FIELD_CELL;
        let ang;
        if (p.flow === 'spiral') {
          const a0 = Math.atan2(y - DESIGN / 2, x - DESIGN / 2);
          ang = a0 + Math.PI / 2 + (fbm(x * freq, y * freq, p.fieldDetail) - 0.5) * 0.9;
        } else {
          const nz = fbm(x * freq, y * freq, p.fieldDetail);
          const nz2 = fbm(x * freq * 2.7 + 91.7, y * freq * 2.7 - 47.3, 2);
          ang = (nz - 0.5) * Math.PI * 4 * turb + (nz2 - 0.5) * 1.2 * turb + Math.PI * 0.27;
        }
        // "sharp" flow quantises to plotter-grammar angle increments (π/5)
        if (p.flow === 'sharp') ang = Math.round(ang / (Math.PI / 5)) * (Math.PI / 5);
        const i = gy * n + gx;
        vx[i] = Math.cos(ang);
        vy[i] = Math.sin(ang);
      }
    }
    return { n, vx, vy };
  }

  function sampleAngle(f, x, y) {
    const fx = x / FIELD_CELL, fy = y / FIELD_CELL;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const idx = (xx, yy) => {
      xx = xx < 0 ? 0 : xx >= f.n ? f.n - 1 : xx;
      yy = yy < 0 ? 0 : yy >= f.n ? f.n - 1 : yy;
      return yy * f.n + xx;
    };
    const lerp2 = (a, b, t) => a + (b - a) * t;
    const i00 = idx(x0, y0), i10 = idx(x0 + 1, y0), i01 = idx(x0, y0 + 1), i11 = idx(x0 + 1, y0 + 1);
    const vx = lerp2(lerp2(f.vx[i00], f.vx[i10], tx), lerp2(f.vx[i01], f.vx[i11], tx), ty);
    const vy = lerp2(lerp2(f.vy[i00], f.vy[i10], tx), lerp2(f.vy[i01], f.vy[i11], tx), ty);
    return Math.atan2(vy, vx);
  }

  /* ---------------- occupancy grid (collision etiquette) ---------------- */
  function makeOccupancy() {
    const n = Math.ceil(DESIGN / OCC_CELL) + 1;
    return { n, cells: new Uint8Array(n * n) };
  }

  function hits(occ, x, y, r) {
    const n = occ.n, cells = occ.cells;
    let cx0 = Math.floor((x - r) / OCC_CELL), cx1 = Math.floor((x + r) / OCC_CELL);
    let cy0 = Math.floor((y - r) / OCC_CELL), cy1 = Math.floor((y + r) / OCC_CELL);
    if (cx0 < 0) cx0 = 0; if (cy0 < 0) cy0 = 0;
    if (cx1 >= n) cx1 = n - 1; if (cy1 >= n) cy1 = n - 1;
    for (let cy = cy0; cy <= cy1; cy++) {
      const row = cy * n;
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cells[row + cx]) return true;
      }
    }
    return false;
  }

  function stamp(occ, x, y, r) {
    const n = occ.n, cells = occ.cells;
    let cx0 = Math.floor((x - r) / OCC_CELL), cx1 = Math.floor((x + r) / OCC_CELL);
    let cy0 = Math.floor((y - r) / OCC_CELL), cy1 = Math.floor((y + r) / OCC_CELL);
    if (cx0 < 0) cx0 = 0; if (cy0 < 0) cy0 = 0;
    if (cx1 >= n) cx1 = n - 1; if (cy1 >= n) cy1 = n - 1;
    for (let cy = cy0; cy <= cy1; cy++) {
      const row = cy * n;
      for (let cx = cx0; cx <= cx1; cx++) cells[row + cx] = 1;
    }
  }

  function stampShape(occ, pts, r) {
    for (let i = 0; i < pts.length; i += 2) stamp(occ, pts[i][0], pts[i][1], r);
    const last = pts[pts.length - 1];
    stamp(occ, last[0], last[1], r);
  }

  /* ---------------- path integration ---------------- */
  function growPath(field, occ, x, y, r, p) {
    const pts = [[x, y]];
    const step = Math.min(18, Math.max(2.5, r * 0.55));
    const maxSteps = Math.round(rand(240, 640) / step) + 10;
    const bound = p.margin ? 70 : -12;
    const inertia = p.flow === 'sharp' ? 1 : 0.42; // sharp snaps; organic smooths
    let heading = sampleAngle(field, x, y);

    for (let i = 0; i < maxSteps; i++) {
      const target = sampleAngle(field, x, y);
      heading += angDiff(target, heading) * inertia;
      const nx = x + Math.cos(heading) * step;
      const ny = y + Math.sin(heading) * step;
      if (nx < bound || nx > DESIGN - bound || ny < bound || ny > DESIGN - bound) break;
      if (p.collision !== 'off' && hits(occ, nx, ny, r * 0.92)) break;
      x = nx; y = ny;
      pts.push([x, y]);
    }
    return pts;
  }

  /* ---------------- composition (setup) ---------------- */
  function buildComposition(p) {
    const field = buildField(p);
    const occ = makeOccupancy();
    const pal = PALETTES[p.palette] || PALETTES.delft;
    const shapes = [];
    const target = p.shapes;
    const maxAttempts = target * 8;
    const minLenBase = p.collision === 'strict' ? 110 : p.collision === 'relaxed' ? 55 : 30;

    for (let i = 0; i < maxAttempts && shapes.length < target; i++) {
      const th = pickThickness(p.scale);
      const r = th / 2;
      const m = p.margin ? 72 : 12;
      const x = rand(m, DESIGN - m);
      const y = rand(m, DESIGN - m);
      if (p.collision !== 'off' && hits(occ, x, y, r * 0.92)) continue;

      const pts = growPath(field, occ, x, y, r, p);
      const step = Math.min(18, Math.max(2.5, r * 0.55));
      const len = pts.length * step;
      if (len < minLenBase + r * 1.2) continue;

      const col = pickWeighted(pal.colors);
      const split = p.splitEnds && pts.length > 10 && chance(0.78);
      const shape = {
        pts, r, col,
        split,
        tail: split ? rand(0.1, 0.22) : 0,
        endCol: split ? pickWeighted(pal.colors) : col
      };
      shapes.push(shape);
      if (p.collision !== 'off') stampShape(occ, pts, r + 3);
    }
    return { field, shapes, pal };
  }

  /* ---------------- geometry helpers ---------------- */
  function normals(pts, i0, i1) {
    const out = [];
    for (let i = i0; i <= i1; i++) {
      const p0 = pts[Math.max(i0, i - 1)], p1 = pts[Math.min(i1, i + 1)];
      let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      const d = Math.hypot(dx, dy) || 1;
      out.push([-dy / d, dx / d]);
    }
    return out;
  }

  function ribbonPath(ctx, pts, i0, i1, r) {
    const nrm = normals(pts, i0, i1);
    const left = [], right = [];
    for (let i = i0; i <= i1; i++) {
      const n = nrm[i - i0], pt = pts[i];
      left.push([pt[0] + n[0] * r, pt[1] + n[1] * r]);
      right.push([pt[0] - n[0] * r, pt[1] - n[1] * r]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    return { left, right };
  }

  /* ---------------- fills ---------------- */
  function fillSolid(ctx, pts, i0, i1, r, col) {
    ribbonPath(ctx, pts, i0, i1, r);
    ctx.fillStyle = col;
    ctx.fill();
  }

  function fillOutline(ctx, pts, i0, i1, r, col) {
    ribbonPath(ctx, pts, i0, i1, r);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function fillBlocks(ctx, pts, i0, i1, r, pal) {
    ctx.save();
    ribbonPath(ctx, pts, i0, i1, r);
    ctx.clip();
    // bbox of the sub-ribbon
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = i0; i <= i1; i++) {
      const p = pts[i];
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    const cell = Math.max(7, r * 0.42);
    for (let y = y0; y < y1; y += cell) {
      for (let x = x0; x < x1; x += cell) {
        if (chance(0.12)) continue; // breathing gaps
        ctx.fillStyle = pickWeighted(pal.colors);
        ctx.fillRect(x, y, cell * 1.02, cell * 1.02);
      }
    }
    ctx.restore();
  }

  function fillSoft(ctx, pts, i0, i1, r, col) {
    if (i1 - i0 < 2) { fillSolid(ctx, pts, i0, i1, r, col); return; }
    ctx.save();
    ribbonPath(ctx, pts, i0, i1, r);
    ctx.clip();
    const nrm = normals(pts, i0, i1);
    const step = Math.max(0.9, r * 0.055);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(0.8, step * 0.8);
    ctx.globalAlpha = 0.42;
    for (let o = -r * 0.94; o <= r * 0.94; o += step) {
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        const n = nrm[i - i0], pt = pts[i];
        const j = (noise(pt[0] * 0.012, pt[1] * 0.012) - 0.5) * 4.5;
        const x = pt[0] + n[0] * (o + j), y = pt[1] + n[1] * (o + j);
        if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawShape(ctx, sh, pal, p) {
    const pts = sh.pts, r = sh.r;
    const paint = (i0, i1, col) => {
      if (i1 - i0 < 1) return;
      if (p.style === 'outline') fillOutline(ctx, pts, i0, i1, r, col);
      else if (p.style === 'blocks') { fillSolid(ctx, pts, i0, i1, r, pal.bg); fillBlocks(ctx, pts, i0, i1, r, pal); }
      else if (p.style === 'soft') fillSoft(ctx, pts, i0, i1, r, col);
      else fillSolid(ctx, pts, i0, i1, r, col);
    };
    if (sh.split) {
      const cut = Math.max(2, Math.floor(pts.length * (1 - sh.tail)));
      paint(0, cut, sh.col);
      paint(cut - 1, pts.length - 1, sh.endCol);
    } else {
      paint(0, pts.length - 1, sh.col);
    }
  }

  /* ---------------- underlayer + grain ---------------- */
  function drawFieldLines(ctx, field, pal) {
    ctx.strokeStyle = pal.ink;
    ctx.globalAlpha = 0.055;
    ctx.lineWidth = 1;
    for (let gy = 90; gy < DESIGN; gy += 88) {
      for (let gx = 90; gx < DESIGN; gx += 88) {
        let x = gx + rand(-30, 30), y = gy + rand(-30, 30);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let i = 0; i < 70; i++) {
          const a = sampleAngle(field, x, y);
          x += Math.cos(a) * 9; y += Math.sin(a) * 9;
          if (x < -20 || x > DESIGN + 20 || y < -20 || y > DESIGN + 20) break;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawGrain(ctx, w, h, pal, amount) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const tctx = tile.getContext('2d');
    const img = tctx.createImageData(128, 128);
    const ink = pal.ink;
    const m = /^#?([0-9a-f]{6})$/i.exec(ink);
    const n = m ? parseInt(m[1], 16) : 0x808080;
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand();
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = v < 0.5 ? (rand() * 26 * amount) | 0 : 0;
    }
    tctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.globalCompositeOperation = 'source-atop';
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* ---------------- render (draw) ---------------- */
  function render(e) {
    const st = e.state, p = e.params, ctx = e.ctx;
    const S = e.w / DESIGN;

    ctx.save();
    ctx.scale(S, S);
    if (p.fieldLines) drawFieldLines(ctx, st.field, st.pal);
    for (let i = 0; i < st.shapes.length; i++) drawShape(ctx, st.shapes[i], st.pal, p);
    ctx.restore();

    if (p.grain > 0) drawGrain(ctx, e.w, e.h, st.pal, p.grain);
  }

  /* ---------------- registration ---------------- */
  Art.register({
    id: 'meander',
    title: 'Meander',
    animate: false,

    params: {
      shapes: { label: 'Shapes', type: 'range', min: 60, max: 1400, step: 20, value: 420, integer: true },
      scale: {
        label: 'Scale', type: 'select', value: 'large',
        options: ['micro-uniform', 'uniform', 'small', 'medium', 'large', 'jumbo', 'jumbo-xl']
      },
      turbulence: { label: 'Turbulence', type: 'select', value: 'medium', options: ['none', 'low', 'medium', 'high'] },
      flow: { label: 'Flow', type: 'select', value: 'organic', options: ['organic', 'spiral', 'sharp'] },
      style: { label: 'Fill style', type: 'select', value: 'solid', options: ['solid', 'blocks', 'outline', 'soft'] },
      palette: { label: 'Palette', type: 'select', value: 'delft', options: PALETTE_NAMES },
      fieldScale: { label: 'Field scale', type: 'range', min: 0.4, max: 5, step: 0.1, value: 1.6 },
      fieldDetail: { label: 'Field detail', type: 'range', min: 1, max: 5, step: 1, value: 3, integer: true },
      collision: { label: 'Collision', type: 'select', value: 'strict', options: ['strict', 'relaxed', 'off'] },
      splitEnds: { label: 'Split ends', type: 'checkbox', value: true },
      margin: { label: 'Margin', type: 'checkbox', value: true },
      fieldLines: { label: 'Field lines', type: 'checkbox', value: true },
      grain: { label: 'Grain', type: 'range', min: 0, max: 1, step: 0.05, value: 0.35 }
    },

    setup(e) {
      e.state = buildComposition(e.params);
    },

    draw(e) {
      render(e);
    }
  });
})();
