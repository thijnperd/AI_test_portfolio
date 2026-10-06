/**
 * Strange Atlas — a luminous map of a nonlinear system's orbit.
 *
 * A compact trigonometric recurrence deposits hundreds of thousands of
 * deterministic samples into a density field. Color follows orbit phase, so
 * a simple rule resolves into a layered, topographic drawing. This is an
 * original process study prompted by the artist and software references in
 * aiartists.org's generative-art overview, including Casey Reas's discussion
 * of systems that make variation visible.
 *
 * @see https://aiartists.org/generative-art-design
 * @see https://reas.com/
 * @module sketches/strange-atlas
 */
(function () {
  'use strict';

  const RES = 760;
  const SPLAT_WEIGHT = [1, 2, 1];
  const FAMILIES = {
    'Tidal Lace': [-2.24, 0.43, -0.65, -2.43],
    'Blue Current': [1.4, -2.3, 2.4, -2.1],
    'Copper Bloom': [-2.7, -0.09, -0.86, -2.2],
    'Night Signal': [2.01, -2.53, 1.61, -0.33]
  };
  const PALETTES = {
    abyss: ['#174e63', '#36a6a0', '#c7dcbb', '#f0bd73', '#e87552'],
    mineral: ['#303d59', '#527c88', '#a2b49a', '#e0bb82', '#bd6048'],
    ultraviolet: ['#29204c', '#604d9b', '#bb78bd', '#f0a87b', '#f2dfb3']
  };

  function renderOrbit(family, count, variation, paletteName) {
    const coefficients = FAMILIES[family].map(value => value + rand(-variation, variation));
    const points = new Float32Array(count * 2);
    let x = rand(-0.4, 0.4), y = rand(-0.4, 0.4);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < count + 1200; i++) {
      const nextX = Math.sin(coefficients[0] * y) - Math.cos(coefficients[1] * x);
      const nextY = Math.sin(coefficients[2] * x) - Math.cos(coefficients[3] * y);
      x = nextX;
      y = nextY;
      if (i < 1200) continue;
      const index = (i - 1200) * 2;
      points[index] = x;
      points[index + 1] = y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const width = Math.max(0.001, maxX - minX);
    const height = Math.max(0.001, maxY - minY);
    if (variation > 0 && (width < 0.55 || height < 0.55)) {
      return renderOrbit(family, count, 0, paletteName);
    }
    const scale = (RES * 0.82) / Math.max(width, height);
    const offsetX = (RES - width * scale) * 0.5;
    const offsetY = (RES - height * scale) * 0.5;
    const bins = new Uint16Array(RES * RES * 4);

    for (let i = 0; i < count; i++) {
      const px = Math.floor((points[i * 2] - minX) * scale + offsetX);
      const py = Math.floor((points[i * 2 + 1] - minY) * scale + offsetY);
      if (px < 0 || py < 0 || px >= RES || py >= RES) continue;
      const slot = Math.min(3, Math.floor(i * 4 / count));
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = px + dx, sy = py + dy;
          if (sx < 0 || sy < 0 || sx >= RES || sy >= RES) continue;
          const address = (sy * RES + sx) * 4 + slot;
          bins[address] = Math.min(65535, bins[address] + SPLAT_WEIGHT[dx + 1] * SPLAT_WEIGHT[dy + 1]);
        }
      }
    }

    let peak = 1;
    let occupied = 0;
    for (let i = 0; i < bins.length; i += 4) {
      const density = bins[i] + bins[i + 1] + bins[i + 2] + bins[i + 3];
      if (density) occupied++;
      peak = Math.max(peak, density);
    }
    // Some coefficient combinations settle into a fixed point; retry the stable family rule.
    if (variation > 0 && occupied < Math.max(500, count * 0.012)) {
      return renderOrbit(family, count, 0, paletteName);
    }

    const image = document.createElement('canvas');
    image.width = RES;
    image.height = RES;
    const imageCtx = image.getContext('2d');
    const frame = imageCtx.createImageData(RES, RES);
    const colors = PALETTES[paletteName].map(hex => Art.Color.hexToRgb(hex));
    for (let pixel = 0; pixel < RES * RES; pixel++) {
      const bin = pixel * 4;
      const total = bins[bin] + bins[bin + 1] + bins[bin + 2] + bins[bin + 3];
      if (!total) continue;
      const phase = (bins[bin + 1] + bins[bin + 2] * 2 + bins[bin + 3] * 3) / total / 3;
      const scaledPhase = phase * (colors.length - 1);
      const low = Math.floor(scaledPhase);
      const high = Math.min(colors.length - 1, low + 1);
      const blend = scaledPhase - low;
      const intensity = 0.48 + 0.52 * Math.pow(Math.log1p(total) / Math.log1p(peak), 0.62);
      const out = pixel * 4;
      frame.data[out] = (colors[low].r + (colors[high].r - colors[low].r) * blend) * intensity;
      frame.data[out + 1] = (colors[low].g + (colors[high].g - colors[low].g) * blend) * intensity;
      frame.data[out + 2] = (colors[low].b + (colors[high].b - colors[low].b) * blend) * intensity;
      frame.data[out + 3] = 255;
    }
    imageCtx.putImageData(frame, 0, 0);
    return image;
  }

  Art.register({
    id: 'strange-atlas',
    title: 'Strange Atlas',
    animate: false,
    params: {
      family: { label: 'Orbit family', type: 'select', value: 'Tidal Lace', options: Object.keys(FAMILIES) },
      points: { label: 'Orbit samples', type: 'range', min: 50000, max: 320000, step: 10000, value: 210000, integer: true },
      variation: { label: 'Rule variation', type: 'range', min: 0, max: 0.28, step: 0.01, value: 0.035 },
      palette: { label: 'Ink', type: 'select', value: 'abyss', options: Object.keys(PALETTES) }
    },

    setup(e) {
      e.state = { image: renderOrbit(e.params.family, e.params.points, e.params.variation, e.params.palette) };
    },

    draw(e) {
      const { ctx, w, h, state } = e;
      const size = Math.min(w, h) * 0.82;
      const x = (w - size) * 0.5;
      const y = (h - size) * 0.5;

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(state.image, x, y, size, size);
      ctx.restore();
    }
  });
})();
