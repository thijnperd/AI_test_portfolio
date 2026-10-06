/**
 * Recursive Basilica — a luminous architectural section made from nested rules.
 *
 * Repeated arch profiles, compressed buttresses, and fine structural tracery
 * turn a handful of geometric rules into a layered, imaginary building. Seeded
 * variation shifts the profile and the ornament without breaking its
 * silhouette. The work is an original procedural-design study prompted by the
 * generative-artist overview's references to Michael Hansmeyer and systems art.
 *
 * @see https://aiartists.org/generative-art-design
 * @see https://michael-hansmeyer.com/
 * @module sketches/recursive-basilica
 */
(function () {
  'use strict';

  const SIZE = 1000;
  const PALETTES = {
    alabaster: { bg: '#121922', wall: ['#334451', '#526c73', '#82938a', '#c1b99c', '#e4d8b8'], ink: '#e6d9b9', light: '#f2c77a', shadow: '#090e15' },
    vermilion: { bg: '#211917', wall: ['#49302c', '#70453a', '#a6543d', '#d17b4e', '#e0b778'], ink: '#f0d4a5', light: '#f5c66c', shadow: '#120e0d' },
    glacial: { bg: '#111c25', wall: ['#294451', '#3f6975', '#70989a', '#b5c5b2', '#e0dcc5'], ink: '#d9e5d8', light: '#a8e1df', shadow: '#091219' }
  };

  function archHeight(t, profile) {
    const sine = Math.max(0, Math.sin(Math.PI * t));
    if (profile === 'ogive') return Math.pow(sine, 0.72) * (0.83 + 0.17 * Math.abs(2 * t - 1));
    if (profile === 'parabolic') return 4 * t * (1 - t);
    return Math.pow(sine, 0.48);
  }

  function traceArch(ctx, cx, baseY, width, height, profile, phase, wobble, close) {
    const steps = 100;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = cx + (t - 0.5) * width;
      const distortion = Math.sin(t * 7 * Math.PI + phase) * wobble * Math.sin(Math.PI * t);
      const y = baseY - height * archHeight(t, profile) + distortion;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (close) {
      ctx.lineTo(cx + width * 0.5, baseY);
      ctx.lineTo(cx - width * 0.5, baseY);
      ctx.closePath();
    }
  }

  function drawPillar(ctx, x, baseY, width, topY, palette, mirror) {
    const sign = mirror ? -1 : 1;
    ctx.fillStyle = palette.wall[1];
    ctx.fillRect(x - width * 0.5, topY, width, baseY - topY);
    ctx.fillStyle = palette.wall[2];
    ctx.fillRect(x - width * 0.36, topY + 10, width * 0.15, baseY - topY - 18);
    ctx.fillStyle = palette.wall[0];
    for (let i = 0; i < 5; i++) {
      const y = topY + i * (baseY - topY) / 5;
      ctx.fillRect(x - width * 0.66, y, width * 1.32, Math.max(4, width * 0.1));
    }
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 3; i++) {
      const y = topY + width * 0.4 + i * width * 0.8;
      ctx.fillRect(x + sign * width * 0.06, y, width * 0.08, width * 0.44);
    }
    ctx.globalAlpha = 1;
  }

  function draw(e) {
    const { ctx, w, h, params: p, state } = e;
    const palette = PALETTES[p.palette];
    const scale = Math.min(w, h) / SIZE;
    const ox = (w - SIZE * scale) * 0.5;
    const oy = (h - SIZE * scale) * 0.5;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    const cx = 500 + state.offset;
    const baseY = 822;
    const fullW = 612;
    const fullH = 535;
    const openingW = fullW * 0.38;
    const openingH = fullH * 0.43;
    const insetPerRing = (fullW - openingW) / (2 * p.rings);
    const heightPerRing = (fullH - openingH) / p.rings;
    const phase = state.phase;

    drawPillar(ctx, cx - fullW * 0.45, baseY, 92, state.towers[0], palette, false);
    drawPillar(ctx, cx + fullW * 0.45, baseY, 92, state.towers[1], palette, true);

    for (let i = 0; i < p.rings; i++) {
      const course = state.courses[i];
      const inset = i * insetPerRing + course.width;
      const width = fullW - inset * 2;
      const height = fullH - i * heightPerRing + course.height;
      const floor = baseY - i * 1.3;
      const coursePhase = phase + i * 0.31 + course.phase;
      const wobble = p.irregularity * (1 - i / (p.rings + 1)) * 11 * course.wobble;
      traceArch(ctx, cx, floor, width, height, p.profile, coursePhase, wobble, true);
      ctx.fillStyle = palette.wall[(i + Math.floor(i / 3)) % palette.wall.length];
      ctx.fill();
      ctx.strokeStyle = i % 3 === 0 ? palette.ink : palette.shadow;
      ctx.globalAlpha = i % 3 === 0 ? 0.45 : 0.38;
      ctx.lineWidth = i % 3 === 0 ? 1.35 : 2.2;
      traceArch(ctx, cx, floor, width, height, p.profile, coursePhase, wobble, false);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    traceArch(ctx, cx, baseY, openingW, openingH, p.profile, phase, p.irregularity * 2, true);
    ctx.fillStyle = palette.shadow;
    ctx.fill();

    const apertureGlow = ctx.createRadialGradient(cx, baseY - openingH * 0.55, 5, cx, baseY - openingH * 0.58, openingW * 0.56);
    apertureGlow.addColorStop(0, colorCss(palette.light, 0.42));
    apertureGlow.addColorStop(0.36, colorCss(palette.light, 0.12));
    apertureGlow.addColorStop(1, colorCss(palette.shadow, 0));
    ctx.save();
    traceArch(ctx, cx, baseY, openingW, openingH, p.profile, phase, p.irregularity * 2, true);
    ctx.clip();
    ctx.fillStyle = apertureGlow;
    ctx.fillRect(cx - openingW, baseY - openingH, openingW * 2, openingH);
    ctx.restore();

    ctx.fillStyle = colorCss(palette.light, 0.88);
    ctx.beginPath();
    ctx.arc(cx, baseY - openingH * 0.56, 12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = colorCss(palette.light, 0.2);
    ctx.beginPath();
    ctx.arc(cx, baseY - openingH * 0.56, 30, 0, TAU);
    ctx.fill();

    ctx.fillStyle = palette.wall[0];
    ctx.fillRect(186, 818, 628, 24);
    ctx.fillStyle = palette.wall[3];
    ctx.fillRect(158, 842, 684, 14);
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(132, 856, 736, 3);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = colorCss(palette.ink, 0.48);
    ctx.lineWidth = 1;
    for (let i = 0; i < 42; i++) {
      const side = i % 2 ? 1 : -1;
      const fraction = rand(0.12, 0.94);
      const yy = 805 - fraction * 410;
      const xx = cx + side * (fullW * 0.5 - fraction * fullW * 0.12);
      const length = rand(4, 22);
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + side * length, yy - rand(2, 11));
      ctx.stroke();
    }

    ctx.restore();
  }

  Art.register({
    id: 'recursive-basilica',
    title: 'Recursive Basilica',
    animate: false,
    params: {
      profile: { label: 'Arch law', type: 'select', value: 'ogive', options: ['ogive', 'parabolic', 'round'] },
      rings: { label: 'Nested courses', type: 'range', min: 4, max: 12, step: 1, value: 8, integer: true },
      irregularity: { label: 'Stone drift', type: 'range', min: 0, max: 1, step: 0.05, value: 0.28 },
      palette: { label: 'Stone', type: 'select', value: 'alabaster', options: Object.keys(PALETTES) }
    },
    setup(e) {
      e.state = {
        offset: rand(-28, 28),
        phase: rand(TAU),
        towers: [rand(364, 398), rand(364, 398)],
        courses: Array.from({ length: e.params.rings }, () => ({
          width: rand(-4, 4),
          height: rand(-2, 2),
          phase: rand(TAU),
          wobble: rand(0.65, 1.35)
        }))
      };
    },
    draw
  });
})();
