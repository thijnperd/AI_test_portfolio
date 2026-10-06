/**
 * Flow Field — particles advected through fbm noise, drawing trails.
 *
 * @module sketches/flow-field
 */
Art.register({
  id: 'flow-field',
  title: 'Flow Field',
  animate: true,
  params: {
    count:   { label: 'Particles',    type: 'range', min: 100, max: 6000, step: 100, value: 1800, integer: true },
    scale:   { label: 'Noise scale',  type: 'range', min: 0.5, max: 12,   step: 0.1, value: 3.5 },
    detail:  { label: 'Noise detail', type: 'range', min: 1,   max: 6,    step: 1,   value: 3, integer: true },
    speed:   { label: 'Speed',        type: 'range', min: 0.1, max: 5,    step: 0.1, value: 1.4 },
    width:   { label: 'Line width',   type: 'range', min: 0.2, max: 3,    step: 0.1, value: 0.7 },
    fade:    { label: 'Trail fade',   type: 'range', min: 0.01,max: 0.3,  step: 0.01,value: 0.07 },
    palette: { label: 'Palette', type: 'select', value: 'analogous',
      options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'] },
    dark:    { label: 'Light ink', type: 'checkbox', value: true },
    blackWhite: { label: 'Black & white', type: 'checkbox', value: false }
  },

  setup(e) {
    const pal = makePalette(e.params.palette);
    e.state = { parts: [], pal, time: 0 };
    for (let i = 0; i < e.params.count; i++) {
      e.state.parts.push({
        x: rand(e.w), y: rand(e.h),
        life: rand(60, 400)
      });
    }
  },

  draw(e) {
    const p = e.params, st = e.state, ctx = e.ctx;
    st.time += e.dt;

    // gentle fade for trails
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = p.fade;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, e.w, e.h);
    ctx.restore();

    const ns = p.scale / Math.max(e.w, e.h);
    const step = p.speed * 60 * e.dt;
    const pal = st.pal;

    ctx.lineWidth = p.width;
    ctx.lineCap = 'round';

    for (let i = 0; i < st.parts.length; i++) {
      const pt = st.parts[i];
      const n = Noise.fbm(pt.x * ns, pt.y * ns, p.detail);
      const ang = n * Math.PI * 4 + st.time * 0.15;
      const px = pt.x, py = pt.y;
      pt.x += Math.cos(ang) * step;
      pt.y += Math.sin(ang) * step;
      pt.life -= 1;

      const out = pt.x < -20 || pt.x > e.w + 20 || pt.y < -20 || pt.y > e.h + 20;
      if (out || pt.life <= 0) {
        pt.x = rand(e.w); pt.y = rand(e.h);
        pt.life = rand(60, 400);
        continue;
      }

      const c = pal[i % pal.length];
      ctx.strokeStyle = p.blackWhite ? colorMono(p.dark) : colorCss(c, 0.68);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  }
});
