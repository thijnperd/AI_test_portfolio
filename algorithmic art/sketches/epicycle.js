/**
 * Epicycle — an orbital drawing machine.
 *
 * Evolved from the bar-and-ring mechanics of `orbital-bars.js`: instead of
 * a static ring, two stacks of harmonic arms (x and y) rotate at
 * ratio-bound angular velocities and their intersection is a pen that lays
 * down a silk curve — a live harmonograph in the lineage of pen-plotter
 * drawing machines. Amplitudes carry the smooth noise-varied signature of
 * its ancestor; damping spirals the pen gently toward the heart of the
 * machine. The drawing accumulates on an offscreen plate, so you can export
 * a PNG at any moment.
 *
 * @module sketches/epicycle
 */
(function () {
  'use strict';

  /**
   * Design-space canvas, square.
   *
   * @type {number}
   */
  const DESIGN = 1000;

  /**
   * Frequency ratio sets the machine can be tuned to.
   *
   * @type {object}
   */
  const RATIO_SETS = {
    harmonic: [1, 2, 3, 4, 5],
    octave: [1, 2, 3, 5, 8],
    golden: [1, 1.618, 2.618, 4.236, 6.854],
    fibonacci: [1, 1, 2, 3, 5],
    prime: [2, 3, 5, 7, 11]
  };

  function buildMachine(p) {
    const k = p.harmonics;
    const ratios = RATIO_SETS[p.ratios] || RATIO_SETS.harmonic;
    const ax = [], fx = [], phx = [];
    const ay = [], fy = [], phy = [];
    let norm = 0;
    for (let i = 0; i < k; i++) {
      const decayW = Math.pow(0.72, i);
      norm += decayW;
      // amplitudes from smooth noise around the circle (orbital-bars signature)
      const nv = Noise.fbm(Math.cos(i * 1.7) * 1.3 + 21, Math.sin(i * 1.7) * 1.3 + 21, 3);
      const amp = decayW * (0.7 + 0.6 * nv);

      ax.push(amp);
      ay.push(amp * (0.7 + 0.6 * Noise.fbm(i * 2.3 + 5, i * 1.1 + 9, 2)));
      // tiny detune keeps the curve alive instead of closing instantly
      const detune = (Noise.value2(i * 3.1 + 40, i * 7.7 + 40) - 0.5) * 0.004;
      fx.push(ratios[i % ratios.length] + detune);
      fy.push(ratios[(i + 1) % ratios.length] + detune * 1.7);
      phx.push(rand(0, TAU));
      phy.push(rand(0, TAU));
    }
    const scale = p.scale / (norm || 1);
    return {
      ax: ax.map(v => v * scale), ay: ay.map(v => v * scale),
      fx, fy, phx, phy
    };
  }

  function penPos(m, u, damp) {
    const decay = Math.exp(-damp * u);
    let x = 0, y = 0;
    for (let i = 0; i < m.fx.length; i++) {
      x += m.ax[i] * Math.cos(TAU * m.fx[i] * u + m.phx[i]);
      y += m.ay[i] * Math.sin(TAU * m.fy[i] * u + m.phy[i]);
    }
    return [x * decay, y * decay];
  }

  /* ---------------- registration ---------------- */
  Art.register({
    id: 'epicycle',
    title: 'Epicycle',
    animate: true,

    params: {
      harmonics: { label: 'Harmonics', type: 'range', min: 1, max: 5, step: 1, value: 3, integer: true },
      ratios: { label: 'Ratios', type: 'select', value: 'golden', options: Object.keys(RATIO_SETS) },
      speed: { label: 'Speed', type: 'range', min: 0.1, max: 3, step: 0.05, value: 0.6 },
      scale: { label: 'Reach', type: 'range', min: 0.15, max: 0.92, step: 0.01, value: 0.62 },
      damp: { label: 'Damping', type: 'range', min: 0, max: 0.25, step: 0.005, value: 0.02 },
      thickness: { label: 'Ink weight', type: 'range', min: 0.3, max: 4, step: 0.1, value: 1.1 },
      ink: { label: 'Ink length', type: 'range', min: 2000, max: 60000, step: 1000, value: 18000, integer: true },
      palette: {
        label: 'Palette', type: 'select', value: 'complementary',
        options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random']
      },
      mechanism: { label: 'Show mechanism', type: 'checkbox', value: true },
      dark: { label: 'Light ink', type: 'checkbox', value: true }
    },

    setup(e) {
      const p = e.params;
      const pal = makePalette(p.palette);
      const plate = document.createElement('canvas');
      plate.width = plate.height = DESIGN;
      const pctx = plate.getContext('2d');
      e.state = {
        m: buildMachine(p),
        pal,
        plate, pctx,
        drawn: 0,       // ink used so far
        last: null      // previous pen position
      };
    },

    draw(e) {
      const p = e.params, st = e.state, ctx = e.ctx;
      const m = st.m;
      const S = e.w / DESIGN;
      ctx.clearRect(0, 0, e.w, e.h);

      /* --- lay ink on the plate (sampled so the silk stays smooth) --- */
      const pctx = st.pctx;
      const steps = Math.max(2, Math.round(e.dt * 240 * p.speed + 2));
      const t0 = e.t - e.dt * p.speed;
      const du = (e.dt * p.speed) / steps;
      for (let s = 0; s < steps && st.drawn < p.ink; s++) {
        const u = Math.max(0, t0 + du * s);
        const [px, py] = penPos(m, u, p.damp);
        const x = DESIGN / 2 + px * DESIGN * 0.5;
        const y = DESIGN / 2 + py * DESIGN * 0.5;
        if (st.last) {
          const dx = x - st.last[0], dy = y - st.last[1];
          const speed = Math.hypot(dx, dy);          // px per sample
          const ti = Math.min(st.pal.length - 1,
            Math.floor(Math.min(1, speed / 9) * st.pal.length));
          const alpha = clamp(0.75 - speed * 0.02, 0.16, 0.75);
          pctx.strokeStyle = colorCss(st.pal[ti], alpha);
          pctx.lineWidth = p.thickness * clamp(1.35 - speed * 0.045, 0.35, 1.35);
          pctx.lineCap = 'round';
          pctx.beginPath();
          pctx.moveTo(st.last[0], st.last[1]);
          pctx.lineTo(x, y);
          pctx.stroke();
          st.drawn++;
        }
        st.last = [x, y];
      }

      /* --- present plate + mechanism --- */
      ctx.save();
      ctx.scale(S, S);
      ctx.drawImage(st.plate, 0, 0, DESIGN, DESIGN);

      if (p.mechanism) {
        const cx = DESIGN / 2, cy = DESIGN / 2;
        const [px, py] = penPos(m, e.t * p.speed, p.damp);
        const penX = cx + px * DESIGN * 0.5;
        const penY = cy + py * DESIGN * 0.5;
        const faint = p.dark ? 'rgba(236,234,230,0.16)' : 'rgba(20,24,32,0.18)';
        const ghost = p.dark ? 'rgba(236,234,230,0.07)' : 'rgba(20,24,32,0.08)';

        // reach circle
        ctx.strokeStyle = ghost;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, p.scale * DESIGN * 0.5, 0, TAU);
        ctx.stroke();

        // x machine: cumulative horizontal readout
        const u = e.t * p.speed, decay = Math.exp(-p.damp * u);
        ctx.strokeStyle = faint;
        ctx.fillStyle = faint;
        ctx.lineWidth = 1.2;
        let cxAcc = cx;
        ctx.beginPath();
        ctx.moveTo(cx - p.scale * DESIGN * 0.25, cy);
        for (let i = 0; i < m.fx.length; i++) {
          const v = m.ax[i] * Math.cos(TAU * m.fx[i] * u + m.phx[i]) * decay;
          const nx = cxAcc + v * DESIGN * 0.5;
          ctx.lineTo(nx, cy);
          ctx.arc(nx, cy, 3, 0, TAU);
          cxAcc = nx;
        }
        ctx.stroke();

        // y machine: cumulative vertical readout
        ctx.beginPath();
        ctx.moveTo(cx, cy - p.scale * DESIGN * 0.25);
        let cyAcc = cy;
        for (let i = 0; i < m.fy.length; i++) {
          const v = m.ay[i] * Math.sin(TAU * m.fy[i] * u + m.phy[i]) * decay;
          const ny = cyAcc + v * DESIGN * 0.5;
          ctx.lineTo(cx, ny);
          ctx.arc(cx, ny, 3, 0, TAU);
          cyAcc = ny;
        }
        ctx.stroke();

        // pen + guides
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.moveTo(penX, penY);
        ctx.lineTo(cxAcc, penY);
        ctx.moveTo(penX, penY);
        ctx.lineTo(penX, cyAcc);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = p.dark ? '#e2a24c' : '#b7412f';
        ctx.beginPath();
        ctx.arc(penX, penY, 5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  });
})();
