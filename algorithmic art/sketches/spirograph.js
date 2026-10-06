/**
 * Spirograph — layered hypotrochoid curves (static, export-friendly).
 *
 * @module sketches/spirograph
 */
Art.register({
  id: 'spirograph',
  title: 'Spirograph',
  animate: false,
  params: {
    rings:   { label: 'Rings',      type: 'range', min: 1,   max: 40,  step: 1,    value: 14, integer: true },
    petals:  { label: 'Petals',     type: 'range', min: 3,   max: 40,  step: 1,    value: 11, integer: true },
    radius:  { label: 'Radius',     type: 'range', min: 0.2, max: 0.95,step: 0.01, value: 0.82 },
    twist:   { label: 'Twist',      type: 'range', min: 0,   max: 1,   step: 0.01, value: 0.35 },
    hole:    { label: 'Center hole',type: 'range', min: 0,   max: 1,   step: 0.01, value: 0.45 },
    width:   { label: 'Line width', type: 'range', min: 0.2, max: 4,   step: 0.1,  value: 0.9 },
    alpha:   { label: 'Opacity',    type: 'range', min: 0.05,max: 1,   step: 0.05, value: 0.55 },
    palette: { label: 'Palette', type: 'select', value: 'triadic',
      options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'] },
    dark:    { label: 'Light ink', type: 'checkbox', value: true },
    blackWhite: { label: 'Black & white', type: 'checkbox', value: false }
  },

  draw(e) {
    const p = e.params, ctx = e.ctx;
    const cx = e.w / 2, cy = e.h / 2;
    const R = Math.min(e.w, e.h) / 2 * p.radius;
    const pal = makePalette(p.palette);

    ctx.lineWidth = p.width;
    ctx.lineCap = 'round';

    const steps = 720;
    for (let k = 0; k < p.rings; k++) {
      const f = p.rings === 1 ? 0 : k / (p.rings - 1);
      const rr = R * (p.hole + (1 - p.hole) * f);
      const phase = f * Math.PI * 2 * p.twist;
      const c = pal[k % pal.length];
      ctx.strokeStyle = p.blackWhite ? colorMono(p.dark) : colorCss(c, p.alpha);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const wob = 1 + 0.12 * Math.sin(t * p.petals + phase * 3);
        const x = cx + rr * wob * Math.cos(t + phase);
        const y = cy + rr * wob * Math.sin(t + phase);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
});
