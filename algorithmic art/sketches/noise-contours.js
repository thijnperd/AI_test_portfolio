/**
 * Noise Contours — topographic isolines traced through a seeded noise field.
 *
 * The field is sampled and contoured with marching squares. The visual
 * technique is informed by the p5.js noise reference and Nature of Code's
 * discussion of coherent noise; this implementation is original and uses the
 * AlgoArt canvas and seeded-noise helpers.
 *
 * @module sketches/noise-contours
 */
Art.register({
  id: 'noise-contours',
  title: 'Noise Contours',
  animate: false,
  params: {
    resolution: { label: 'Field resolution', type: 'range', min: 24, max: 120, step: 4, value: 72, integer: true },
    scale:      { label: 'Noise scale', type: 'range', min: 1, max: 9, step: 0.1, value: 3.6 },
    levels:     { label: 'Contour levels', type: 'range', min: 3, max: 18, step: 1, value: 10, integer: true },
    palette:    { label: 'Palette', type: 'select', value: 'analogous',
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
    const stepX = e.w / cols;
    const stepY = e.h / rows;
    const scale = p.scale / cols;
    const field = new Float32Array((cols + 1) * (rows + 1));
    const points = new Float32Array(8);
    const values = new Float32Array(4);

    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) {
        field[y * (cols + 1) + x] = Noise.fbm(x * scale, y * scale, 4);
      }
    }

    ctx.lineWidth = Math.max(0.7, stepX * 0.075);
    ctx.lineJoin = 'round';
    for (let levelIndex = 0; levelIndex < p.levels; levelIndex++) {
      const threshold = (levelIndex + 1) / (p.levels + 1);
      const color = e.state.palette[levelIndex % e.state.palette.length];
      ctx.strokeStyle = colorCss(color, 0.88);
      ctx.beginPath();

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * (cols + 1) + x;
          values[0] = field[i];
          values[1] = field[i + 1];
          values[2] = field[i + cols + 2];
          values[3] = field[i + cols + 1];
          let count = 0;

          for (let edge = 0; edge < 4; edge++) {
            const next = (edge + 1) % 4;
            const a = values[edge];
            const b = values[next];
            if ((a < threshold) === (b < threshold)) continue;

            const t = (threshold - a) / (b - a);
            let ax, ay, bx, by;
            if (edge === 0) { ax = x; ay = y; bx = x + 1; by = y; }
            else if (edge === 1) { ax = x + 1; ay = y; bx = x + 1; by = y + 1; }
            else if (edge === 2) { ax = x + 1; ay = y + 1; bx = x; by = y + 1; }
            else { ax = x; ay = y + 1; bx = x; by = y; }

            points[count++] = (ax + (bx - ax) * t) * stepX;
            points[count++] = (ay + (by - ay) * t) * stepY;
          }

          if (count === 4) {
            ctx.moveTo(points[0], points[1]);
            ctx.lineTo(points[2], points[3]);
          } else if (count === 8) {
            const topLeftHigh = values[0] >= threshold;
            if (topLeftHigh) {
              ctx.moveTo(points[0], points[1]);
              ctx.lineTo(points[6], points[7]);
              ctx.moveTo(points[2], points[3]);
              ctx.lineTo(points[4], points[5]);
            } else {
              ctx.moveTo(points[0], points[1]);
              ctx.lineTo(points[2], points[3]);
              ctx.moveTo(points[4], points[5]);
              ctx.lineTo(points[6], points[7]);
            }
          }
        }
      }
      ctx.stroke();
    }
  }
});
