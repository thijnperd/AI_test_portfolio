/**
 * Wave Interference — overlapping circular wavefronts rendered as color bands.
 *
 * The design uses the trigonometric oscillation and superposition ideas
 * introduced in Nature of Code's oscillation chapter. The implementation and
 * composition are original and use the AlgoArt framework.
 *
 * @module sketches/wave-interference
 */
Art.register({
  id: 'wave-interference',
  title: 'Wave Interference',
  animate: false,
  params: {
    resolution: { label: 'Tile resolution', type: 'range', min: 40, max: 180, step: 10, value: 110, integer: true },
    wavelength: { label: 'Wavelength', type: 'range', min: 8, max: 42, step: 1, value: 23, integer: true },
    separation: { label: 'Source separation', type: 'range', min: 0.15, max: 0.75, step: 0.01, value: 0.42 },
    phase:      { label: 'Phase offset', type: 'range', min: 0, max: 6.28, step: 0.01, value: 1.4 },
    palette:    { label: 'Palette', type: 'select', value: 'complementary',
      options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'] },
  },

  setup(e) {
    e.state = { palette: makePalette(e.params.palette) };
  },

  draw(e) {
    const p = e.params;
    const ctx = e.ctx;
    const cols = p.resolution;
    const rows = Math.max(1, Math.round(cols * e.h / e.w));
    const cellW = e.w / cols;
    const cellH = e.h / rows;
    const sourceX = e.w * (0.5 - p.separation * 0.5);
    const sourceY = e.h * 0.5;
    const waveNumber = TAU / p.wavelength;
    const bins = new Uint8Array(cols * rows);
    const binCount = 8;

    for (let y = 0; y < rows; y++) {
      const py = (y + 0.5) * cellH;
      for (let x = 0; x < cols; x++) {
        const px = (x + 0.5) * cellW;
        const left = Math.hypot(px - sourceX, py - sourceY);
        const right = Math.hypot(px - (e.w - sourceX), py - sourceY);
        const amplitude = Math.sin(left * waveNumber) +
          Math.sin(right * waveNumber + p.phase);
        const normalized = (amplitude + 2) * 0.25;
        bins[y * cols + x] = Math.min(binCount - 1, Math.floor(normalized * binCount));
      }
    }

    const colors = [];
    for (let i = 0; i < binCount; i++) {
      colors.push(colorCss(e.state.palette[i % e.state.palette.length], 0.92));
    }
    // Leave the lowest-amplitude band as transparent negative space.
    for (let bin = 1; bin < binCount; bin++) {
      ctx.fillStyle = colors[bin];
      ctx.beginPath();
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (bins[y * cols + x] === bin) {
            ctx.rect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
          }
        }
      }
      ctx.fill();
    }
  }
});
