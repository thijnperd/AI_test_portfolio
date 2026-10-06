/**
 * Noise Mosaic — grid of shapes tinted and sized by fbm noise (static).
 *
 * @module sketches/noise-mosaic
 */
Art.register({
  id: 'noise-mosaic',
  title: 'Noise Mosaic',
  animate: false,
  params: {
    cells:   { label: 'Grid size',  type: 'range', min: 6,  max: 80,  step: 1,  value: 34, integer: true },
    scale:   { label: 'Noise scale',type: 'range', min: 1,  max: 12,  step: 0.1,value: 4 },
    detail:  { label: 'Detail',     type: 'range', min: 1,  max: 6,   step: 1,  value: 3, integer: true },
    sizeAmt: { label: 'Shape size', type: 'range', min: 0.2,max: 1.4, step: 0.05,value: 1 },
    gap:     { label: 'Gap',        type: 'range', min: 0,  max: 0.4, step: 0.01,value: 0.12 },
    shape:   { label: 'Shape', type: 'select', value: 'circle',
      options: ['circle', 'square', 'triangle', 'ring'] },
    palette: { label: 'Palette', type: 'select', value: 'split',
      options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'] },
    dark:    { label: 'Light ink', type: 'checkbox', value: true },
    blackWhite: { label: 'Black & white', type: 'checkbox', value: false }
  },

  draw(e) {
    const p = e.params, ctx = e.ctx;
    const pal = makePalette(p.palette);
    const n = p.cells;
    const cell = e.w / n;
    const pad = cell * p.gap;
    const ns = p.scale / n;

    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const v = Noise.fbm(gx * ns, gy * ns, p.detail);
        const c = pal[Math.min(pal.length - 1, Math.floor(v * pal.length))];
        const cx = (gx + 0.5) * cell;
        const cy = (gy + 0.5) * cell;
        const r = (cell / 2 - pad) * p.sizeAmt * (0.35 + 0.65 * v);

        ctx.fillStyle = p.blackWhite ? colorMono(p.dark) : colorCss(c, 0.35 + 0.6 * v);
        ctx.strokeStyle = p.blackWhite ? colorMono(p.dark) : colorCss(c, 0.9);
        ctx.lineWidth = Math.max(0.5, cell * 0.06);

        const x = cx - r, y = cy - r, s = r * 2;
        ctx.beginPath();
        if (p.shape === 'square') {
          ctx.rect(x, y, s, s);
          ctx.fill();
        } else if (p.shape === 'triangle') {
          ctx.moveTo(cx, y);
          ctx.lineTo(x + s, y + s);
          ctx.lineTo(x, y + s);
          ctx.closePath();
          ctx.fill();
        } else if (p.shape === 'ring') {
          ctx.arc(cx, cy, Math.max(0.5, r), 0, TAU);
          ctx.stroke();
        } else {
          ctx.arc(cx, cy, Math.max(0.5, r), 0, TAU);
          ctx.fill();
        }
      }
    }
  }
});
