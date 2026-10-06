/**
 * (Dis)Order — a lattice under a measured gradient of disorder ("Fluvial
 * Order", grid grammar).
 *
 * A perfect grid of forms, with jitter growing across the canvas: geometry
 * relaxing into gesture. In the lineage of Vera Molnár's (Des)Ordres —
 * original code.
 *
 * @module sketches/order-disorder
 */
(function () {
  'use strict';

  /**
   * Design-space canvas, square.
   *
   * @type {number}
   */
  const DESIGN = 1000;

  const PALETTES = {
    paper: { bg: '#f2efe7', fg: '#22262e', alt: '#b7412f' },
    ink: { bg: '#0c0c0e', fg: '#eceae6', alt: '#e0a45c' },
    terracotta: { bg: '#f4ebe2', fg: '#9c3b26', alt: '#33201a' },
    blueprint: { bg: '#12263f', fg: '#cfe0f2', alt: '#e2a24c' }
  };
  const PALETTE_NAMES = Object.keys(PALETTES);

  // 0..1 measure of how far a cell sits along the disorder gradient
  function disorderFactor(i, j, n, progression) {
    if (progression === 'diagonal') return (i + j) / (2 * (n - 1) || 1);
    if (progression === 'radial') {
      const c = (n - 1) / 2;
      const d = Math.hypot(i - c, j - c) / (Math.hypot(c, c) || 1);
      return clamp(d, 0, 1);
    }
    return j / (n - 1 || 1); // row
  }

  function drawCell(ctx, x, y, size, d, p, pal) {
    const j = Math.pow(d, 1.6) * p.disorder * size * 0.55;
    const jit = () => rand(-j, j);
    const lw = p.weights;

    // every cell keeps one "museum" tone available for rare emphasis
    const col = chance(0.08) ? pal.alt : pal.fg;
    ctx.strokeStyle = colorCss(col, 0.92 - d * 0.15);
    ctx.lineWidth = lw;
    ctx.beginPath();

    if (p.shape === 'circle') {
      const cx = x + jit(), cy = y + jit();
      const r = size * 0.36 * (1 + rand(-1, 1) * d * p.disorder * 0.5);
      ctx.arc(cx, cy, Math.max(1, r), 0, TAU);
    } else if (p.shape === 'line') {
      const cx = x + jit(), cy = y + jit();
      const ang = rand(-1, 1) * d * p.disorder * Math.PI * 0.9 + Math.PI / 4;
      const r = size * 0.42;
      ctx.moveTo(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r);
      ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    } else {
      const h = size * 0.36;
      ctx.moveTo(x - h + jit(), y - h + jit());
      ctx.lineTo(x + h + jit(), y - h + jit());
      ctx.lineTo(x + h + jit(), y + h + jit());
      ctx.lineTo(x - h + jit(), y + h + jit());
      ctx.closePath();
    }
    ctx.stroke();
  }

  function render(e) {
    const p = e.params, ctx = e.ctx;
    const pal = PALETTES[p.palette] || PALETTES.paper;
    const n = p.cells;
    const S = e.w / DESIGN;

    ctx.save();
    ctx.scale(S, S);
    const margin = 90;
    const size = (DESIGN - margin * 2) / n;

    // the order underneath: faint reference lattice
    if (p.halo) {
      ctx.strokeStyle = colorCss(pal.fg, 0.07);
      ctx.lineWidth = 1;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          ctx.strokeRect(margin + i * size + size * 0.12, margin + j * size + size * 0.12, size * 0.76, size * 0.76);
        }
      }
    }

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const d = disorderFactor(i, j, n, p.progression);
        const x = margin + i * size + size / 2;
        const y = margin + j * size + size / 2;
        drawCell(ctx, x, y, size, d, p, pal);
      }
    }
    ctx.restore();
  }

  Art.register({
    id: 'order-disorder',
    title: '(Dis)Order',
    animate: false,

    params: {
      cells: { label: 'Grid', type: 'range', min: 3, max: 40, step: 1, value: 15, integer: true },
      disorder: { label: 'Disorder', type: 'range', min: 0, max: 1, step: 0.02, value: 0.45 },
      shape: { label: 'Form', type: 'select', value: 'square', options: ['square', 'circle', 'line'] },
      progression: { label: 'Gradient', type: 'select', value: 'row', options: ['row', 'diagonal', 'radial'] },
      weights: { label: 'Line weight', type: 'range', min: 0.4, max: 6, step: 0.2, value: 1.4 },
      palette: { label: 'Palette', type: 'select', value: 'paper', options: PALETTE_NAMES },
      halo: { label: 'Show lattice', type: 'checkbox', value: true }
    },

    setup(e) { e.state = {}; },

    draw(e) { render(e); }
  });
})();
