/**
 * Noise Lines — grid of dashes oriented by a flowing noise field. Color comes
 * from a static noise field so it stays put (no flicker) while the dashes
 * slowly rotate. Ported from the canvas-sketch prototype
 * (`Source material/sketch-04.js`).
 *
 * @module sketches/noise-lines
 */
Art.register({
  id: 'noise-lines',
  title: 'Noise Lines',
  animate: true,
  params: {
    cols:    { label: 'Columns',     type: 'range', min: 2,   max: 60,  step: 1,   value: 20, integer: true },
    rows:    { label: 'Rows',        type: 'range', min: 2,   max: 60,  step: 1,   value: 20, integer: true },
    freq:    { label: 'Noise scale', type: 'range', min: 0.2, max: 8,   step: 0.1, value: 2.5 },
    detail:  { label: 'Noise detail',type: 'range', min: 1,   max: 6,   step: 1,   value: 3, integer: true },
    amp:     { label: 'Angle range', type: 'range', min: 0,   max: 1,   step: 0.01,value: 0.55 },
    minW:    { label: 'Min weight',  type: 'range', min: 0.5, max: 20,  step: 0.5, value: 1 },
    maxW:    { label: 'Max weight',  type: 'range', min: 0.5, max: 40,  step: 0.5, value: 16 },
    length:  { label: 'Dash length', type: 'range', min: 0.2, max: 1,   step: 0.05,value: 0.85 },
    speed:   { label: 'Flow speed',  type: 'range', min: 0,   max: 2,   step: 0.02,value: 0.25 },
    palette: { label: 'Palette', type: 'select', value: 'analogous',
      options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'] },
    blackWhite: { label: 'Black & white', type: 'checkbox', value: false },
    dark:    { label: 'Light ink', type: 'checkbox', value: true }
  },

  setup(e) {
    // build the palette once per restart so it never changes between frames
    e.state = { pal: makePalette(e.params.palette) };
  },

  draw(e) {
    const p = e.params, st = e.state, ctx = e.ctx;
    ctx.clearRect(0, 0, e.w, e.h);

    const pal = st.pal;
    const cols = p.cols, rows = p.rows;
    const gridW = e.w * 0.86, gridH = e.h * 0.86;
    const cellW = gridW / cols, cellH = gridH / rows;
    const margx = (e.w - gridW) / 2, margy = (e.h - gridH) / 2;
    const ns = p.freq / Math.max(cols, rows);
    const t = e.t * p.speed;

    ctx.lineCap = 'round';
    for (let i = 0; i < cols * rows; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const gx = col * cellW + margx + cellW * 0.5;
      const gy = row * cellH + margy + cellH * 0.5;

      // static field → colour + weight (stable, never flickers)
      const nStatic = Noise.fbm(col * ns, row * ns, p.detail);
      // moving field → angle only (gentle motion)
      const nMove = Noise.fbm(col * ns + t, row * ns, p.detail);

      const angle = (nMove - 0.5) * TAU * p.amp;
      const wgt = map(nStatic, 0, 1, p.minW, p.maxW, true);
      const len = cellW * p.length;

      const col2 = p.blackWhite
        ? colorMono(p.dark)
        : colorCss(pal[Math.min(pal.length - 1, Math.floor(nStatic * pal.length))], 0.85);

      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(angle);
      ctx.lineWidth = wgt;
      ctx.strokeStyle = col2;
      ctx.beginPath();
      ctx.moveTo(-len * 0.5, 0);
      ctx.lineTo(len * 0.5, 0);
      ctx.stroke();
      ctx.restore();
    }
  }
});
