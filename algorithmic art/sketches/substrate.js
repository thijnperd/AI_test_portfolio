/**
 * Substrate — crystalline growth ("Fluvial Order", growth grammar).
 *
 * Lines grow across the plate and spawn thinner children at right angles;
 * already-settled territory is never crossed. Thousands of inherited decisions
 * accumulate into one calm, sandy image. In the lineage of Jared Tarbell's
 * Substrate — original code. The drawing accumulates on the canvas, so you can
 * export a PNG at any moment.
 *
 * @module sketches/substrate
 */
(function () {
  'use strict';

  /**
   * Design-space canvas, square.
   *
   * @type {number}
   */
  const DESIGN = 1000;

  /**
   * Occupancy grid pitch used for the settled-territory checks.
   *
   * @type {number}
   */
  const OCC_CELL = 5;

  const PALETTES = {
    parchment: { bg: '#eae3d2', ink: '#3a2f26', accent: '#a4562e' },
    graphite: { bg: '#101013', ink: '#d8d4cb', accent: '#e0a45c' },
    dusk: { bg: '#1a2230', ink: '#c6d2e4', accent: '#d9784f' },
    algae: { bg: '#e6ecdf', ink: '#2f4a38', accent: '#7c9c5a' }
  };
  const PALETTE_NAMES = Object.keys(PALETTES);

  /* ---------------- occupancy ---------------- */
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
      for (let cx = cx0; cx <= cx1; cx++) if (cells[row + cx]) return true;
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

  /* ---------------- angle snapping (plotter grammar) ---------------- */
  function snap(ang, mode) {
    if (mode === 'octant') return Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
    if (mode === 'quarter') return Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
    return ang;
  }

  /* ---------------- growth ---------------- */
  function seedSegments(p) {
    const segs = [];
    for (let i = 0; i < p.seeds; i++) {
      const ang = snap(rand(0, TAU), p.angles);
      segs.push({
        x: rand(DESIGN * 0.18, DESIGN * 0.82),
        y: rand(DESIGN * 0.18, DESIGN * 0.82),
        ang,
        w: p.width,
        len: 0,
        alive: true,
        accent: chance(0.12)
      });
    }
    return segs;
  }

  function advance(st, p, dist) {
    const occ = st.occ;
    const stepLen = 3;
    const nSteps = Math.max(1, Math.round(dist / stepLen));
    const spawnPerStep = p.spawn * 0.02;

    for (let s = 0; s < nSteps; s++) {
      for (let i = 0; i < st.segs.length; i++) {
        const seg = st.segs[i];
        if (!seg.alive) continue;

        const px = seg.x, py = seg.y;
        if (p.angles === 'free') seg.ang += rand(-0.018, 0.018); // organic drift
        seg.x += Math.cos(seg.ang) * stepLen;
        seg.y += Math.sin(seg.ang) * stepLen;
        seg.len += stepLen;

        // Territory rules: a line never crosses a settled region — but it must
        // not be killed by the ground it just covered itself either. The crash
        // probe therefore looks AHEAD, beyond the width of our own trail stamp.
        const out = seg.x < 8 || seg.x > DESIGN - 8 || seg.y < 8 || seg.y > DESIGN - 8;
        const look = stepLen * 2 + seg.w * 0.5;
        const lx = seg.x + Math.cos(seg.ang) * look;
        const ly = seg.y + Math.sin(seg.ang) * look;
        const crash = seg.len > seg.w && hits(occ, lx, ly, Math.max(1, seg.w * 0.25));
        if (out || crash) { seg.alive = false; continue; }

        stamp(occ, seg.x, seg.y, seg.w * 0.5 + 0.5);

        // lay down sand
        const alpha = clamp(0.22 + seg.w * 0.075, 0.22, 0.95);
        st.ctx.strokeStyle = colorCss(seg.accent ? st.pal.accent : st.pal.ink, alpha);
        st.ctx.lineWidth = Math.max(0.5, seg.w);
        st.ctx.beginPath();
        st.ctx.moveTo(px, py);
        st.ctx.lineTo(seg.x, seg.y);
        st.ctx.stroke();

        if (p.sand > 0 && chance(p.sand * 0.5)) {
          st.ctx.fillStyle = colorCss(seg.accent ? st.pal.accent : st.pal.ink, alpha * 0.45);
          st.ctx.fillRect(seg.x + rand(-seg.w, seg.w), seg.y + rand(-seg.w, seg.w), 1, 1);
        }

        // inheritance
        if (seg.w > 1.1 && st.segs.length < p.maxLines && chance(spawnPerStep)) {
          const childAng = snap(seg.ang + (chance(0.5) ? Math.PI / 2 : -Math.PI / 2) + rand(-0.05, 0.05), p.angles);
          st.segs.push({
            x: seg.x, y: seg.y, ang: childAng,
            w: seg.w * 0.74, len: 0, alive: true,
            accent: chance(0.1)
          });
        }

        // width decay: thin lines eventually exhaust
        seg.w *= 0.9992;
        if (seg.w < 0.45) seg.alive = false;
      }
    }
  }

  /* ---------------- registration ---------------- */
  Art.register({
    id: 'substrate',
    title: 'Substrate',
    animate: true,

    params: {
      seeds: { label: 'Seeds', type: 'range', min: 1, max: 30, step: 1, value: 6, integer: true },
      speed: { label: 'Growth', type: 'range', min: 0.5, max: 6, step: 0.1, value: 2.4 },
      spawn: { label: 'Branch rate', type: 'range', min: 0, max: 1, step: 0.05, value: 0.5 },
      maxLines: { label: 'Max lines', type: 'range', min: 100, max: 6000, step: 100, value: 1800, integer: true },
      width: { label: 'Seed width', type: 'range', min: 1, max: 14, step: 0.5, value: 7 },
      sand: { label: 'Sand grain', type: 'range', min: 0, max: 1, step: 0.05, value: 0.55 },
      angles: { label: 'Angles', type: 'select', value: 'octant', options: ['free', 'octant', 'quarter'] },
      palette: { label: 'Palette', type: 'select', value: 'parchment', options: PALETTE_NAMES }
    },

    setup(e) {
      const pal = PALETTES[e.params.palette] || PALETTES.parchment;
      e.state = {
        pal,
        occ: makeOccupancy(),
        segs: seedSegments(e.params),
        ctx: e.ctx
      };
    },

    draw(e) {
      const st = e.state, p = e.params, ctx = e.ctx;
      const S = e.w / DESIGN;
      ctx.save();
      ctx.scale(S, S);
      ctx.lineCap = 'round';
      let any = false;
      for (let i = 0; i < st.segs.length; i++) if (st.segs[i].alive) { any = true; break; }
      if (any && e.dt > 0) advance(st, p, p.speed * 130 * e.dt);
      ctx.restore();
    }
  });
})();
