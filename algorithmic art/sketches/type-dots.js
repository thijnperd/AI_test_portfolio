/**
 * Type Dots — a letter or word rasterized into a grid of dots, sized by pixel
 * coverage and colored by a noise field. Ported from the canvas-sketch
 * prototype (`Source material/sketch-05.js`); text is a parameter instead of a
 * keyup handler.
 *
 * @module sketches/type-dots
 */
Art.register({
  id: 'type-dots',
  title: 'Type Dots',
  animate: false,
  params: {
    text:   { label: 'Text',       type: 'text', value: 'A' },
    cells:  { label: 'Resolution', type: 'range', min: 12,  max: 90,  step: 1,   value: 48, integer: true },
    font:   { label: 'Font', type: 'select', value: 'serif',
      options: ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'] },
    fill:   { label: 'Fill', type: 'select', value: 'size',
      options: ['size', 'alpha', 'both'] },
    polarity: { label: 'Polarity', type: 'select', value: 'glyph',
      options: ['glyph', 'field'] },
    maxSize:{ label: 'Dot size',   type: 'range', min: 0.4, max: 1.2, step: 0.05, value: 0.95 },
    freq:   { label: 'Color scale',type: 'range', min: 0.2, max: 8,   step: 0.1, value: 2.5 },
    detail: { label: 'Color detail',type: 'range',min: 1,   max: 6,   step: 1,   value: 3, integer: true },
    palette:{ label: 'Palette', type: 'select', value: 'analogous',
      options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'] },
    blackWhite: { label: 'Black & white', type: 'checkbox', value: false },
    dark:   { label: 'Light ink', type: 'checkbox', value: true }
  },

  setup(e) {
    const cols = e.params.cells;
    const rows = cols;
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const octx = off.getContext('2d');

    // rasterize the text onto a low-res canvas, centered by its ink bounds
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, cols, rows);
    octx.fillStyle = '#fff';
    octx.font = cols + 'px ' + e.params.font;
    octx.textBaseline = 'top';

    const m = octx.measureText(e.params.text);
    const mx = -m.actualBoundingBoxLeft;
    const my = -m.actualBoundingBoxAscent;
    const mw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const mh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const tx = (cols - mw) * 0.5 - mx;
    const ty = (rows - mh) * 0.5 - my;

    octx.save();
    octx.translate(tx, ty);
    octx.strokeText(e.params.text, 0, 0); // stroke softens the edges
    octx.fillText(e.params.text, 0, 0);
    octx.restore();

    e.state = {
      data: octx.getImageData(0, 0, cols, rows).data,
      cols, rows,
      pal: makePalette(e.params.palette)
    };
  },

  draw(e) {
    const p = e.params, st = e.state, ctx = e.ctx;
    const cols = st.cols, rows = st.rows;
    const cell = e.w / cols;
    const ns = p.freq / cols;

    for (let i = 0; i < cols * rows; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const bright = st.data[i * 4] / 255;      // 1 = ink, 0 = empty
      // 'glyph' draws the letter; 'field' draws its surrounding dots and
      // leaves the letter transparent.
      const cover = p.polarity === 'field' ? 1 - bright : bright;
      if (cover <= 0.02) continue;

      const x = col * cell + cell / 2;
      const y = row * cell + cell / 2;
      let r = cell * 0.5 * p.maxSize;
      let alpha = 1;
      if (p.blackWhite) {
        r *= cover;                 // size shading only → stays a true 2-tone
      } else if (p.fill === 'size') {
        r *= cover;
      } else if (p.fill === 'alpha') {
        alpha = cover;
      } else {
        r *= (0.3 + 0.7 * cover);
        alpha = cover;
      }

      // colour from a static noise field → smooth organic regions
      const cn = Noise.fbm(col * ns, row * ns, p.detail);
      const c = p.blackWhite
        ? colorMono(p.dark)
        : colorCss(st.pal[Math.min(st.pal.length - 1, Math.floor(cn * st.pal.length))], alpha);

      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.2, r), 0, TAU);
      ctx.fill();
    }
  }
});
