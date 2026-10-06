/**
 * Tidepools — nested basins left behind by a receding tide.
 *
 * Seeded basin centers settle into a loose coastal cluster. Their warped
 * contour rings share a common radial field, so the waterline feels eroded
 * by one landscape rather than assembled from unrelated loops.
 *
 * @module sketches/tidepools
 */
Art.register({
  id: 'tidepools',
  title: 'Tidepools',
  animate: false,
  params: {
    basins: { label: 'Basins', type: 'range', min: 2, max: 9, step: 1, value: 5, integer: true },
    contours: { label: 'Contour lines', type: 'range', min: 4, max: 18, step: 1, value: 11, integer: true },
    erosion: { label: 'Erosion', type: 'range', min: 0, max: 1, step: 0.05, value: 0.48 },
    palette: { label: 'Palette', type: 'select', value: 'shallows', options: ['shallows', 'kelp', 'moonpool'] }
  },

  setup(e) {
    const palettes = {
      shallows: { bg: '#eee8d9', ink: '#244d54', water: ['#3f8583', '#6ca6a0', '#9fc1ae', '#d4d0b0'], accent: '#c16a43' },
      kelp: { bg: '#e8e2cc', ink: '#273e36', water: ['#426c55', '#73906a', '#a5ab78', '#c8bb8e'], accent: '#a7563b' },
      moonpool: { bg: '#171e26', ink: '#c0d1cb', water: ['#294b5a', '#3a7180', '#62929a', '#9cb7ae'], accent: '#d5a76a' }
    };
    const centers = [];
    const attempts = e.params.basins * 90;
    for (let i = 0; i < attempts && centers.length < e.params.basins; i++) {
      const x = rand(0.19, 0.81), y = rand(0.19, 0.81);
      const r = rand(0.075, 0.14);
      if (centers.every(c => Math.hypot((x - c.x) * 1.1, y - c.y) > r + c.r + 0.025)) {
        centers.push({ x, y, r, phase: rand(TAU), stretch: rand(0.7, 1.25), weight: rand(0.7, 1.3) });
      }
    }
    e.state = { palette: palettes[e.params.palette], centers };
  },

  draw(e) {
    const { ctx, w, h, params: p, state } = e;
    const pal = state.palette;

    function radiusAt(c, a, level) {
      const nx = Math.cos(a), ny = Math.sin(a);
      const n1 = Noise.fbm((c.x * 3 + nx * 1.2 + 11) * 1.3, (c.y * 3 + ny * 1.2 + 7) * 1.3, 3) - 0.5;
      const n2 = Math.sin(a * 3 + c.phase) * 0.38 + Math.cos(a * 5 - c.phase * 0.6) * 0.16;
      return c.r * (0.12 + level * 0.88) * (1 + p.erosion * (n1 * 0.48 + n2 * 0.16));
    }

    const basins = state.centers.slice().sort((a, b) => b.r - a.r);
    for (const c of basins) {
      const cx = c.x * w, cy = c.y * h;
      const rx = c.r * w * c.stretch;
      const ry = c.r * h / c.stretch;
      const segments = 180;

      for (let ring = p.contours - 1; ring >= 0; ring--) {
        const level = (ring + 1) / p.contours;
        const outer = ring === p.contours - 1;
        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const a = i * TAU / segments;
          const r = radiusAt(c, a, level);
          const x = cx + Math.cos(a) * rx * (r / c.r);
          const y = cy + Math.sin(a) * ry * (r / c.r);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = outer ? pal.water[(Math.round(c.weight * 2) + 1) % pal.water.length] : pal.water[(ring + Math.floor(c.phase)) % pal.water.length];
        ctx.fill();
        ctx.strokeStyle = colorCss(pal.ink, outer ? 0.72 : 0.54);
        ctx.lineWidth = Math.max(0.75, w * (outer ? 0.00125 : 0.00075));
        ctx.stroke();
      }

      ctx.fillStyle = colorCss(pal.accent, 0.78);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(c.phase) * rx * 0.045, cy + Math.sin(c.phase) * ry * 0.045,
        Math.max(1.2, rx * 0.018), Math.max(0.8, ry * 0.009), c.phase, 0, TAU);
      ctx.fill();
    }

  }
});
