/**
 * Orbital Bars — a ring of tangential bars with a slowly rotating dashed arc
 * ring. Bar length, color, and spin vary smoothly around the ring via noise so
 * the whole thing reads as one coherent, clean composition. Ported from the
 * canvas-sketch prototype (`Source material/sketch-03.js`).
 *
 * @module sketches/orbital-bars
 */
Art.register({
  id: 'orbital-bars',
  title: 'Orbital Bars',
  animate: true,
  params: {
    count:    { label: 'Bars',         type: 'range', min: 4,    max: 80,   step: 1,    value: 24, integer: true },
    radius:   { label: 'Ring radius',  type: 'range', min: 0.12, max: 0.45, step: 0.01, value: 0.28 },
    barLen:   { label: 'Bar length',   type: 'range', min: 0.2,  max: 1.2,  step: 0.05, value: 0.85 },
    barW:     { label: 'Bar width',    type: 'range', min: 0.004,max: 0.05, step: 0.002,value: 0.012 },
    ringSpin: { label: 'Ring spin',    type: 'range', min: -0.4, max: 0.4,  step: 0.01, value: 0.05 },
    barSpin:  { label: 'Bar spin',     type: 'range', min: 0,    max: 1,    step: 0.01, value: 0.25 },
    arcRadius:{ label: 'Arc radius',   type: 'range', min: 0.2,  max: 0.55, step: 0.01, value: 0.42 },
    arcSpin:  { label: 'Arc spin',     type: 'range', min: -0.4, max: 0.4,  step: 0.01, value: 0.08 },
    width:    { label: 'Arc width',    type: 'range', min: 1,    max: 24,   step: 1,    value: 6, integer: true },
    palette:  { label: 'Palette', type: 'select', value: 'complementary',
      options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'] },
    blackWhite: { label: 'Black & white', type: 'checkbox', value: false },
    dark:     { label: 'Light ink', type: 'checkbox', value: true }
  },

  setup(e) {
    const n = e.params.count;
    const pal = makePalette(e.params.palette);
    const st = { lenScale: [], colIdx: [], spin: [], pal };
    for (let i = 0; i < n; i++) {
      // sample noise around the unit circle → smooth, seamless variation
      const a = (i / n) * TAU;
      const nv = Noise.fbm(Math.cos(a) * 1.2 + 10, Math.sin(a) * 1.2 + 10, 3);
      st.lenScale.push(0.55 + 0.45 * nv);
      st.colIdx.push(Math.min(pal.length - 1, Math.floor(nv * pal.length)));
      st.spin.push((nv - 0.5) * 2);   // smooth, coherent spin speeds (-1..1)
    }
    e.state = st;
  },

  draw(e) {
    const p = e.params, st = e.state, ctx = e.ctx;
    ctx.clearRect(0, 0, e.w, e.h);

    const cx = e.w / 2, cy = e.h / 2;
    const n = p.count;
    const slice = TAU / n;
    const ringR = e.w * p.radius;
    const spacing = ringR * slice;          // gap between bars along the ring
    const bw = e.w * p.barW;
    const ringRot = e.t * p.ringSpin;

    // --- ring of bars (tangential, never overlapping) ---
    for (let i = 0; i < n; i++) {
      const a = i * slice + ringRot;
      const x = cx + Math.cos(a) * ringR;
      const y = cy + Math.sin(a) * ringR;
      const len = spacing * p.barLen * st.lenScale[i];
      const barRot = a + Math.PI / 2 + e.t * p.barSpin * st.spin[i];
      const c = p.blackWhite ? colorMono(p.dark) : colorCss(st.pal[st.colIdx[i]], 0.92);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(barRot);
      ctx.fillStyle = c;
      ctx.fillRect(-bw / 2, -len / 2, bw, len);
      ctx.restore();
    }

    // --- outer dashed arc ring (one shared, smooth rotation) ---
    const gap = slice * 0.18;
    const arcR = e.w * p.arcRadius;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(e.t * p.arcSpin);
    ctx.lineWidth = p.width;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      ctx.strokeStyle = p.blackWhite ? colorMono(p.dark) : colorCss(st.pal[st.colIdx[i]], 0.85);
      ctx.beginPath();
      ctx.arc(0, 0, arcR, i * slice + gap, (i + 1) * slice - gap);
      ctx.stroke();
    }
    ctx.restore();
  }
});
