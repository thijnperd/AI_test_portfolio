/**
 * Brownian Choir — a branching crystal assembled by wandering particles.
 *
 * Walkers drift through a seeded lattice and settle when they meet the growing
 * cluster. Wind, adhesion, a chosen nucleus, and rotational inheritance let
 * one physical rule range from frost to inked coral. The growth concept is
 * informed by Jason Webb's DLA experiments and the classic lattice model;
 * this canvas implementation is original and uses AlgoArt's seeded helpers.
 *
 * @see https://github.com/jasonwebb/2d-diffusion-limited-aggregation-experiments
 * @module sketches/brownian-choir
 */
(function () {
  'use strict';

  const SIZE = 260;
  const HALF = SIZE >> 1;
  const DIRECTIONS = [
    [-1, -1], [0, -1], [1, -1], [-1, 0],
    [1, 0], [-1, 1], [0, 1], [1, 1]
  ];
  const PALETTES = {
    frost: { bg: '#101820', colors: ['#34566a', '#4a8290', '#79b1ad', '#c4d6bd', '#f0d9aa'], glow: '#7ab4c5', frame: '#c6d1c4' },
    ember: { bg: '#211919', colors: ['#54332b', '#8b4732', '#c16c3d', '#e0a14f', '#f0d48e'], glow: '#de7948', frame: '#dabd91' },
    herbarium: { bg: '#e9e4d4', colors: ['#364e43', '#52745a', '#82916a', '#b69e68', '#b96245'], glow: '#6b845f', frame: '#35443c' }
  };

  function rotatePoint(x, y, count, index) {
    const a = TAU * index / count;
    return [Math.round(x * Math.cos(a) - y * Math.sin(a)), Math.round(x * Math.sin(a) + y * Math.cos(a))];
  }

  Art.register({
    id: 'brownian-choir',
    title: 'Brownian Choir',
    animate: false,
    params: {
      particles: { label: 'Settled particles', type: 'range', min: 350, max: 5200, step: 50, value: 2100, integer: true },
      travel: { label: 'Walker patience', type: 'range', min: 60, max: 700, step: 20, value: 280, integer: true },
      stickiness: { label: 'Adhesion', type: 'range', min: 0.25, max: 1, step: 0.05, value: 0.78 },
      wind: { label: 'Wind', type: 'range', min: -1, max: 1, step: 0.05, value: 0.12 },
      symmetry: { label: 'Rotational symmetry', type: 'select', value: '1', options: [{ value: '1', label: 'Free growth' }, { value: '2', label: 'Twin' }, { value: '4', label: 'Quartered' }, { value: '6', label: 'Hexagonal' }] },
      nucleus: { label: 'Nucleus', type: 'select', value: 'seed', options: ['seed', 'ring', 'twin'] },
      rendering: { label: 'Particle style', type: 'select', value: 'crystal', options: ['crystal', 'beads', 'filament'] },
      scale: { label: 'Print scale', type: 'range', min: 0.65, max: 1, step: 0.05, value: 0.88 },
      palette: { label: 'Palette', type: 'select', value: 'frost', options: ['frost', 'ember', 'herbarium'] }
    },

    setup(e) {
      const p = e.params;
      const occupancy = new Uint8Array(SIZE * SIZE);
      const points = [];
      const symmetry = Number(p.symmetry);
      const cx = HALF, cy = HALF;
      let radius = 0;

      function addPoint(x, y) {
        const forms = [];
        for (let i = 0; i < symmetry; i++) forms.push(rotatePoint(x - cx, y - cy, symmetry, i));
        for (const [dx, dy] of forms) {
          const px = cx + dx, py = cy + dy;
          if (px < 2 || py < 2 || px >= SIZE - 2 || py >= SIZE - 2) continue;
          const index = py * SIZE + px;
          if (occupancy[index]) continue;
          occupancy[index] = 1;
          const d = Math.hypot(px - cx, py - cy);
          radius = Math.max(radius, d);
          points.push({ x: px, y: py, d });
        }
      }

      if (p.nucleus === 'ring') {
        for (let a = 0; a < TAU; a += TAU / 16) addPoint(cx + Math.round(Math.cos(a) * 6), cy + Math.round(Math.sin(a) * 6));
      } else if (p.nucleus === 'twin') {
        addPoint(cx - 5, cy); addPoint(cx + 5, cy);
      } else {
        addPoint(cx, cy);
      }

      const wind = p.wind;
      let placed = 0;
      for (let walker = 0; walker < p.particles; walker++) {
        if (radius >= SIZE * 0.39) break;
        const spawnRadius = Math.min(radius + rand(9, 24), SIZE * 0.43);
        const angle = rand(TAU);
        let x = cx + Math.round(Math.cos(angle) * spawnRadius);
        let y = cy + Math.round(Math.sin(angle) * spawnRadius);

        for (let step = 0; step < p.travel; step++) {
          if (x < 2 || y < 2 || x >= SIZE - 2 || y >= SIZE - 2 || Math.hypot(x - cx, y - cy) > radius + 52) break;
          let touches = false;
          for (let oy = -1; oy <= 1 && !touches; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              if ((ox || oy) && occupancy[(y + oy) * SIZE + x + ox]) { touches = true; break; }
            }
          }
          if (touches && chance(p.stickiness)) {
            const before = points.length;
            addPoint(x, y);
            if (points.length > before) placed++;
            break;
          }

          const dir = DIRECTIONS[randInt(0, DIRECTIONS.length - 1)];
          x += dir[0];
          y += dir[1];
          if (wind && chance(Math.abs(wind) * 0.45)) y += wind > 0 ? 1 : -1;
        }
      }
      e.state = { occupancy, points, radius, placed, palette: PALETTES[p.palette] };
    },

    draw(e) {
      const { ctx, w, h, params: p, state } = e;
      const pal = state.palette;
      const span = Math.min(w, h) * p.scale * 0.86;
      const cell = span / SIZE;
      const originX = (w - span) / 2, originY = (h - span) / 2;
      const maxRadius = Math.max(1, state.radius);

      if (p.rendering === 'filament') {
        ctx.strokeStyle = colorCss(pal.colors[2], 0.62);
        ctx.lineWidth = Math.max(0.65, cell * 0.4);
        ctx.beginPath();
        for (const point of state.points) {
          const x = originX + (point.x + 0.5) * cell;
          const y = originY + (point.y + 0.5) * cell;
          const east = state.occupancy[point.y * SIZE + point.x + 1];
          const south = state.occupancy[(point.y + 1) * SIZE + point.x];
          if (east) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
          if (south) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
        }
        ctx.stroke();
      } else {
        for (const point of state.points) {
          const x = originX + (point.x + 0.5) * cell;
          const y = originY + (point.y + 0.5) * cell;
          const t = clamp(point.d / maxRadius, 0, 1);
          const tone = Math.min(pal.colors.length - 1, Math.floor(t * pal.colors.length));
          if (p.rendering === 'beads') {
            ctx.fillStyle = colorCss(pal.glow, 0.18);
            ctx.beginPath(); ctx.arc(x, y, cell * 0.85, 0, TAU); ctx.fill();
            ctx.fillStyle = pal.colors[tone];
            ctx.beginPath(); ctx.arc(x, y, cell * 0.43, 0, TAU); ctx.fill();
          } else {
            ctx.fillStyle = pal.colors[tone];
            ctx.fillRect(x - cell * 0.5, y - cell * 0.5, cell * 0.94, cell * 0.94);
            if (tone === pal.colors.length - 1 && point.d > maxRadius * 0.45) {
              ctx.fillStyle = colorCss(pal.glow, 0.5);
              ctx.fillRect(x - cell * 0.2, y - cell * 0.2, cell * 0.4, cell * 0.4);
            }
          }
        }
      }

    }
  });
})();
