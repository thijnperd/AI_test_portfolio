/**
 * Asemic Ledger — a page of invented script from a wandering field hand.
 *
 * Marks are assembled from a small grammar of hand-built paths, then eased,
 * slanted, and given uneven pressure. The path-based lettering approach is
 * informed by Amy Goodchild's handwriting article; this is an original,
 * nonverbal mark system rather than a reproduction of her letterforms.
 *
 * @see https://www.amygoodchild.com/blog/cursive-handwriting-in-javascript
 * @see https://github.com/camilleroux/awesome-generative-art
 * @module sketches/asemic-ledger
 */
(function () {
  'use strict';

  const GLYPHS = [
    [[[0.05, 0.78], [0.16, 0.38], [0.34, 0.22], [0.53, 0.34], [0.48, 0.59], [0.28, 0.65], [0.32, 0.82], [0.72, 0.69]]],
    [[[0.08, 0.72], [0.21, 0.77], [0.39, 0.61], [0.55, 0.3], [0.73, 0.22]], [[0.35, 0.57], [0.49, 0.73], [0.74, 0.71]]],
    [[[0.05, 0.76], [0.14, 0.32], [0.33, 0.2], [0.53, 0.32], [0.59, 0.77]], [[0.16, 0.55], [0.45, 0.51]]],
    [[[0.22, 0.81], [0.27, 0.54], [0.36, 0.26], [0.59, 0.22], [0.71, 0.4], [0.63, 0.59], [0.39, 0.61], [0.29, 0.76], [0.53, 0.8], [0.76, 0.69]]],
    [[[0.12, 0.78], [0.23, 0.49], [0.44, 0.34], [0.65, 0.37], [0.77, 0.62]], [[0.39, 0.61], [0.25, 0.79], [0.57, 0.83]]],
    [[[0.18, 0.83], [0.21, 0.47], [0.38, 0.24], [0.62, 0.29], [0.74, 0.48], [0.57, 0.61], [0.34, 0.58], [0.31, 0.8], [0.67, 0.77]]],
    [[[0.14, 0.78], [0.22, 0.65], [0.19, 0.5], [0.38, 0.3], [0.6, 0.27], [0.72, 0.43], [0.64, 0.57], [0.43, 0.57], [0.37, 0.75], [0.58, 0.82], [0.77, 0.7]]],
    [[[0.1, 0.77], [0.23, 0.37], [0.4, 0.22], [0.58, 0.28], [0.51, 0.55], [0.3, 0.58], [0.22, 0.8]], [[0.48, 0.59], [0.63, 0.76], [0.79, 0.67]]],
    [[[0.13, 0.72], [0.21, 0.45], [0.39, 0.33], [0.58, 0.44], [0.51, 0.63], [0.3, 0.61], [0.27, 0.79], [0.51, 0.82], [0.73, 0.72]]],
    [[[0.18, 0.8], [0.28, 0.36], [0.43, 0.27], [0.63, 0.4], [0.7, 0.76]], [[0.05, 0.59], [0.78, 0.57]]],
    [[[0.09, 0.76], [0.26, 0.3], [0.4, 0.23], [0.57, 0.36], [0.49, 0.58], [0.3, 0.57], [0.28, 0.8]], [[0.54, 0.56], [0.71, 0.38], [0.78, 0.72]]],
    [[[0.09, 0.72], [0.24, 0.68], [0.36, 0.45], [0.54, 0.31], [0.7, 0.37], [0.74, 0.53], [0.58, 0.6], [0.45, 0.78], [0.72, 0.77]]]
  ];

  const PALETTES = {
    herbarium: { bg: '#eee9dc', ink: '#283b35', faint: '#8f9b83', accent: '#a94f38', rule: '#cfc4a8' },
    midnight: { bg: '#171d22', ink: '#d8d0b9', faint: '#788a80', accent: '#d18a58', rule: '#4d5c58' },
    bluebook: { bg: '#e8ece8', ink: '#284758', faint: '#66858a', accent: '#bd6348', rule: '#afc0b6' }
  };

  function smoothPath(points) {
    let path = points;
    for (let pass = 0; pass < 2; pass++) {
      const next = [path[0]];
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        next.push([a[0] * 0.68 + b[0] * 0.32, a[1] * 0.68 + b[1] * 0.32]);
        next.push([a[0] * 0.32 + b[0] * 0.68, a[1] * 0.32 + b[1] * 0.68]);
      }
      next.push(path[path.length - 1]);
      path = next;
    }
    return path;
  }

  Art.register({
    id: 'asemic-ledger',
    title: 'Asemic Ledger',
    animate: false,
    params: {
      lines: { label: 'Written lines', type: 'range', min: 4, max: 12, step: 1, value: 8, integer: true },
      marks: { label: 'Marks per line', type: 'range', min: 7, max: 28, step: 1, value: 19, integer: true },
      size: { label: 'Mark scale', type: 'range', min: 0.65, max: 1.35, step: 0.05, value: 1 },
      slant: { label: 'Pen slant', type: 'range', min: -0.5, max: 0.8, step: 0.05, value: 0.22 },
      tremor: { label: 'Hand tremor', type: 'range', min: 0, max: 1, step: 0.05, value: 0.28 },
      pressure: { label: 'Stroke pressure', type: 'range', min: 0.4, max: 1.8, step: 0.05, value: 1 },
      palette: { label: 'Ink & paper', type: 'select', value: 'herbarium', options: ['herbarium', 'midnight', 'bluebook'] }
    },

    setup(e) {
      const rows = [];
      for (let i = 0; i < e.params.lines; i++) {
        const glyphs = [];
        let x = rand(-0.025, 0.035);
        for (let j = 0; j < e.params.marks; j++) {
          const width = rand(0.72, 1.25);
          glyphs.push({ type: randInt(0, GLYPHS.length - 1), width, height: rand(0.76, 1.14), lift: gauss(0, 0.05) });
          x += width * rand(0.83, 1.12);
          if (chance(0.11)) x += rand(0.15, 0.38);
        }
        rows.push({ glyphs, phase: rand(TAU), y: i / Math.max(1, e.params.lines - 1) });
      }
      e.state = { rows, palette: PALETTES[e.params.palette] };
    },

    draw(e) {
      const { ctx, w, h, params: p, state } = e;
      const pal = state.palette;
      const left = w * 0.09, right = w * 0.91;
      const top = h * 0.12, bottom = h * 0.88;
      const rowGap = (bottom - top) / Math.max(1, state.rows.length - 1);
      const scale = w * 0.022 * p.size;
      for (let ri = 0; ri < state.rows.length; ri++) {
        const row = state.rows[ri];
        const baseY = top + ri * rowGap;
        let cursor = left + rowGap * row.glyphs[0].lift * 0.1;
        for (let gi = 0; gi < row.glyphs.length; gi++) {
          const glyph = row.glyphs[gi];
          const glyphScale = scale * glyph.height;
          if (cursor > right - glyphScale * 0.8) break;
          const paths = GLYPHS[glyph.type];
          for (let si = 0; si < paths.length; si++) {
            const pts = smoothPath(paths[si]);
            const transformed = pts.map((pt, pi) => {
              const px = cursor + pt[0] * glyphScale + (0.78 - pt[1]) * p.slant * glyphScale;
              const u = (cursor - left) / (right - left);
              const drift = Noise.fbm(u * 4 + gi * 0.03, ri * 0.23 + row.phase, 3) - 0.5;
              const py = baseY - glyphScale * (0.79 - pt[1] + glyph.lift) + drift * p.tremor * glyphScale * 0.38;
              return [px, py];
            });
            ctx.beginPath();
            ctx.moveTo(transformed[0][0], transformed[0][1]);
            for (let k = 1; k < transformed.length - 1; k++) {
              const midX = (transformed[k][0] + transformed[k + 1][0]) / 2;
              const midY = (transformed[k][1] + transformed[k + 1][1]) / 2;
              ctx.quadraticCurveTo(transformed[k][0], transformed[k][1], midX, midY);
            }
            const last = transformed[transformed.length - 1];
            ctx.lineTo(last[0], last[1]);
            ctx.strokeStyle = colorCss(gi % 13 === 0 && ri % 3 === 0 ? pal.accent : pal.ink, rand(0.64, 0.92));
            ctx.lineWidth = Math.max(0.65, glyphScale * 0.045 * p.pressure * rand(0.76, 1.22));
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
          }
          cursor += glyphScale * glyph.width * rand(0.83, 1.12);
          if (chance(0.11)) cursor += glyphScale * rand(0.35, 0.75);
        }
      }

    }
  });
})();
