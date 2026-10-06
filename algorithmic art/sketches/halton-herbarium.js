/**
 * Halton Herbarium — stippled seed forms pressed between fieldbook pages.
 *
 * Organic specimen silhouettes receive a gently irregular edge, a few quiet
 * contour rings, and a low-discrepancy field of ink dots. The (2,3) Halton
 * sampling and neighbor-smoothed naturalism are informed by Ben Kovach's
 * generative-art article; this is an original canvas composition.
 *
 * @see https://www.generativehut.com/post/how-to-make-generative-art-feel-natural
 * @see https://github.com/camilleroux/awesome-generative-art
 * @module sketches/halton-herbarium
 */
(function () {
  'use strict';

  const PALETTES = {
    pollen: { bg: '#eee8d8', ink: '#31443a', colors: ['#9a5035', '#c37848', '#d7a35e', '#87906b', '#466b5d'], wash: '#d9d0b5', accent: '#bf6345' },
    cyanotype: { bg: '#e8e9df', ink: '#253c4b', colors: ['#234960', '#397487', '#6e9a9a', '#b0b997', '#d2b77b'], wash: '#c9d5c9', accent: '#a8503e' },
    night: { bg: '#171d20', ink: '#d3d0b9', colors: ['#385e61', '#57877b', '#9b9c73', '#d0a062', '#b85d43'], wash: '#29383a', accent: '#e6c483' }
  };

  function radicalInverse(index, base) {
    let value = 0, fraction = 1 / base, n = index;
    while (n > 0) {
      value += (n % base) * fraction;
      n = Math.floor(n / base);
      fraction /= base;
    }
    return value;
  }

  function edgeRadius(specimen, angle, edge) {
    const n = Noise.fbm(Math.cos(angle) * 1.7 + specimen.phase, Math.sin(angle) * 1.7 + specimen.phase * 0.7, 3) - 0.5;
    const lobes = Math.sin(angle * specimen.lobes + specimen.phase) * 0.1;
    const secondary = Math.sin(angle * (specimen.lobes + 3) - specimen.phase * 0.8) * 0.045;
    return 1 + edge * (n * 0.2 + lobes + secondary);
  }

  Art.register({
    id: 'halton-herbarium',
    title: 'Halton Herbarium',
    animate: false,
    params: {
      specimens: { label: 'Specimens', type: 'range', min: 2, max: 7, step: 1, value: 4, integer: true },
      dots: { label: 'Ink deposits', type: 'range', min: 300, max: 9000, step: 300, value: 3600, integer: true },
      lobes: { label: 'Growth lobes', type: 'range', min: 2, max: 9, step: 1, value: 5, integer: true },
      edge: { label: 'Edge weathering', type: 'range', min: 0, max: 1, step: 0.05, value: 0.55 },
      dotSize: { label: 'Dot size', type: 'range', min: 0.45, max: 2.2, step: 0.05, value: 1 },
      jitter: { label: 'Ink drift', type: 'range', min: 0, max: 1, step: 0.05, value: 0.22 },
      contours: { label: 'Contour rings', type: 'range', min: 0, max: 10, step: 1, value: 5, integer: true },
      arrangement: { label: 'Arrangement', type: 'select', value: 'diagonal', options: ['diagonal', 'orbit', 'specimen tray'] },
      palette: { label: 'Ink wash', type: 'select', value: 'pollen', options: ['pollen', 'cyanotype', 'night'] }
    },

    setup(e) {
      const p = e.params;
      const forms = [];
      for (let i = 0; i < p.specimens; i++) {
        let x, y;
        if (p.arrangement === 'orbit') {
          const a = i * 2.399 + rand(-0.22, 0.22);
          const r = 0.24 * Math.sqrt(i / Math.max(1, p.specimens - 1));
          x = 0.5 + Math.cos(a) * r;
          y = 0.5 + Math.sin(a) * r * 0.78;
        } else if (p.arrangement === 'specimen tray') {
          const cols = Math.ceil(Math.sqrt(p.specimens));
          const rows = Math.ceil(p.specimens / cols);
          x = 0.5 + ((i % cols) - (cols - 1) / 2) * 0.31 + rand(-0.025, 0.025);
          y = 0.5 + (Math.floor(i / cols) - (rows - 1) / 2) * 0.34 + rand(-0.025, 0.025);
        } else {
          const u = i / Math.max(1, p.specimens - 1);
          x = 0.34 + u * 0.34 + rand(-0.08, 0.08);
          y = 0.28 + u * 0.43 + rand(-0.07, 0.07);
        }
        const radius = rand(0.105, 0.16);
        forms.push({
          x: clamp(x, 0.21, 0.79), y: clamp(y, 0.2, 0.8),
          rx: radius * rand(0.84, 1.17), ry: radius * rand(0.72, 1.12),
          angle: rand(-0.7, 0.7), phase: rand(TAU),
          lobes: p.lobes + randInt(-1, 1), start: randInt(1, 300), dots: []
        });
      }

      const targetPerForm = Math.ceil(p.dots / forms.length);
      const candidatesPerForm = Math.ceil(targetPerForm * 3.2);
      for (const form of forms) {
        const c = Math.cos(form.angle), s = Math.sin(form.angle);
        let accepted = 0;
        for (let i = 0; i < candidatesPerForm && accepted < targetPerForm; i++) {
          const index = form.start + i;
          const u = (radicalInverse(index, 2) + form.phase / TAU) % 1;
          const v = (radicalInverse(index, 3) + (form.phase * 0.618 / TAU)) % 1;
          const nx = (u * 2 - 1) * 1.06;
          const ny = (v * 2 - 1) * 1.06;
          const localX = nx * form.rx, localY = ny * form.ry;
          const r = Math.hypot(nx, ny), a = Math.atan2(ny, nx);
          if (r > edgeRadius(form, a, p.edge)) continue;

          const x = form.x + (localX * c - localY * s);
          const y = form.y + (localX * s + localY * c);
          const jitter = p.jitter * 0.0016;
          const px = x + gauss(0, jitter), py = y + gauss(0, jitter);
          const toneNoise = Noise.fbm(px * 4 + form.phase, py * 4 - form.phase, 3);
          const radial = clamp(r + (toneNoise - 0.5) * 0.22, 0, 0.999);
          const radiusPx = Math.max(0.45, rand(0.55, 1.25) * p.dotSize * (1.08 - r * 0.28));
          form.dots.push({ x: px, y: py, radius: radiusPx, tone: Math.floor(radial * 5), alpha: rand(0.56, 0.95) });
          accepted++;
        }
      }
      e.state = { forms, palette: PALETTES[p.palette] };
    },

    draw(e) {
      const { ctx, w, h, params: p, state } = e;
      const pal = state.palette;
      const inkColors = pal.colors;
      const colors = inkColors;
      const segments = 180;
      for (const form of state.forms) {
        const cx = form.x * w, cy = form.y * h;
        const rx = form.rx * w, ry = form.ry * h;
        const c = Math.cos(form.angle), s = Math.sin(form.angle);

        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const a = i * TAU / segments;
          const r = edgeRadius(form, a, p.edge);
          const lx = Math.cos(a) * rx * r, ly = Math.sin(a) * ry * r;
          const x = cx + lx * c - ly * s, y = cy + lx * s + ly * c;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = colorCss(pal.wash, 0.42);
        ctx.fill();

        for (let ring = 0; ring < p.contours; ring++) {
          const scale = 0.88 - ring * 0.055;
          ctx.beginPath();
          for (let i = 0; i <= segments; i++) {
            const a = i * TAU / segments;
            const r = edgeRadius(form, a, p.edge) * scale;
            const lx = Math.cos(a) * rx * r, ly = Math.sin(a) * ry * r;
            const x = cx + lx * c - ly * s, y = cy + lx * s + ly * c;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = colorCss(pal.ink, 0.23 - ring * 0.008);
          ctx.lineWidth = Math.max(0.55, w * 0.00065);
          ctx.stroke();
        }

        for (const dot of form.dots) {
          ctx.fillStyle = colorCss(colors[dot.tone], dot.alpha);
          ctx.beginPath();
          ctx.arc(dot.x * w, dot.y * h, dot.radius * w / 900, 0, TAU);
          ctx.fill();
        }
      }

    }
  });
})();
