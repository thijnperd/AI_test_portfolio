/**
 * Faultline — a geological section of folded, displaced sediment.
 *
 * Shared strata bend around a slow fold, then slip at seeded faults. Fine
 * striations and sparse mineral flecks make the cut face read like a printed
 * specimen rather than a flat diagram.
 *
 * @module sketches/faultline
 */
Art.register({
  id: 'faultline',
  title: 'Faultline',
  animate: false,
  params: {
    layers: { label: 'Strata', type: 'range', min: 7, max: 30, step: 1, value: 17, integer: true },
    folding: { label: 'Fold', type: 'range', min: 0, max: 1, step: 0.05, value: 0.42 },
    displacement: { label: 'Fault shift', type: 'range', min: 0, max: 1, step: 0.05, value: 0.38 },
    texture: { label: 'Mineral grain', type: 'range', min: 0, max: 1, step: 0.05, value: 0.35 },
    palette: { label: 'Palette', type: 'select', value: 'ochre', options: ['ochre', 'glacier', 'basalt'] }
  },

  setup(e) {
    const palettes = {
      ochre: { bg: '#eee6d6', bands: ['#a65336', '#d28a52', '#e1b978', '#63766b', '#35454a'], ink: '#302f2a', fleck: '#f4d9a5' },
      glacier: { bg: '#e4ece8', bands: ['#456f78', '#79a2a2', '#b7c9b9', '#d7c9a6', '#52666b'], ink: '#263c43', fleck: '#f5f1df' },
      basalt: { bg: '#181d20', bands: ['#39494a', '#64736b', '#a27b52', '#c39b69', '#30383a'], ink: '#111719', fleck: '#e3c58e' }
    };
    const faults = [rand(0.34, 0.48), rand(0.59, 0.72)].slice(0, chance(0.62) ? 2 : 1)
      .sort((a, b) => a - b).map(x => ({ x, shift: rand(-1, 1) * rand(0.025, 0.075) }));
    e.state = {
      palette: palettes[e.params.palette],
      folds: Array.from({ length: 3 }, () => ({ x: rand(0.2, 0.82), width: rand(0.12, 0.3), height: rand(-1, 1) })),
      faults,
      phase: rand(TAU)
    };
  },

  draw(e) {
    const { ctx, w, h, params: p, state } = e;
    const pal = state.palette;
    const marginX = w * 0.065;
    const top = h * 0.17;
    const bottom = h * 0.82;
    const span = w - marginX * 2;
    const samples = Math.max(160, Math.round(w * 0.48));
    const step = span / samples;
    const layerH = (bottom - top) / p.layers;

    // Faults shift every layer beneath a seam, preserving stratigraphic order.
    function seamY(layer, x) {
      const u = x / span;
      let y = top + layer * layerH;
      for (const fold of state.folds) {
        const q = (u - fold.x) / fold.width;
        y += fold.height * p.folding * layerH * 2.8 * Math.exp(-q * q) * Math.sin(q * 1.8);
      }
      for (const fault of state.faults) {
        const edge = clamp((u - fault.x) / 0.012, 0, 1);
        const eased = edge * edge * (3 - 2 * edge);
        y += eased * fault.shift * p.displacement * (bottom - top);
      }
      const wave = Math.sin(u * 9 + state.phase + layer * 0.27) * 0.55 + Math.sin(u * 21 - layer * 0.18) * 0.2;
      return y + wave * layerH * (0.16 + p.folding * 0.22);
    }

    for (let layer = 0; layer < p.layers; layer++) {
      const upper = [], lower = [];
      for (let i = 0; i <= samples; i++) {
        const x = i * step;
        upper.push([marginX + x, seamY(layer, x)]);
        lower.push([marginX + x, seamY(layer + 1, x)]);
      }
      ctx.beginPath();
      ctx.moveTo(upper[0][0], upper[0][1]);
      for (let i = 1; i < upper.length; i++) ctx.lineTo(upper[i][0], upper[i][1]);
      for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i][0], lower[i][1]);
      ctx.closePath();
      ctx.fillStyle = pal.bands[(layer + Math.floor(rand(0, 2))) % pal.bands.length];
      ctx.fill();

      ctx.strokeStyle = colorCss(pal.ink, 0.13 + (layer % 4 === 0 ? 0.1 : 0));
      ctx.lineWidth = Math.max(0.45, w * 0.00075);
      for (let line = 1; line <= 3; line++) {
        const offset = layerH * line / 4;
        ctx.beginPath();
        for (let i = 0; i <= samples; i += 2) {
          const x = i * step;
          const y = seamY(layer, x) + offset + Math.sin(x * 0.026 + layer) * layerH * 0.035;
          if (i === 0) ctx.moveTo(marginX + x, y); else ctx.lineTo(marginX + x, y);
        }
        ctx.stroke();
      }
    }

    for (const fault of state.faults) {
      const x = marginX + fault.x * span;
      ctx.strokeStyle = colorCss(pal.ink, 0.56);
      ctx.lineWidth = Math.max(1, w * 0.0014);
      ctx.beginPath(); ctx.moveTo(x - 9, top - 4); ctx.lineTo(x + 8, bottom + 5); ctx.stroke();
      ctx.strokeStyle = colorCss(pal.fleck, 0.72);
      ctx.lineWidth = Math.max(0.7, w * 0.0008);
      ctx.beginPath(); ctx.moveTo(x - 5, top); ctx.lineTo(x + 12, bottom); ctx.stroke();
    }

    const flecks = Math.round(samples * p.texture * 0.38);
    ctx.fillStyle = colorCss(pal.fleck, 0.64);
    for (let i = 0; i < flecks; i++) {
      const x = rand(marginX, w - marginX);
      const layer = randInt(0, p.layers - 1);
      const localX = x - marginX;
      const y0 = seamY(layer, localX), y1 = seamY(layer + 1, localX);
      const y = rand(Math.min(y0, y1) + 2, Math.max(y0, y1) - 2);
      ctx.beginPath();
      ctx.ellipse(x, y, rand(0.6, 2.2), rand(0.45, 1.1), rand(-0.4, 0.4), 0, TAU);
      ctx.fill();
    }

  }
});
