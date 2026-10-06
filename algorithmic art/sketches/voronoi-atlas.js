/**
 * Voronoi Atlas — a field of cut, color-bearing territories.
 *
 * Seeded sites claim the nearest ground; a few rounds of centroidal settling
 * make the cells feel placed, while power weights and a gentle noise drift
 * keep the map from becoming a sterile diagram. Facets are rendered as an
 * original canvas treatment. The geometric idea is informed by d3-delaunay's
 * Voronoi/Delaunay model; no library code or runtime dependency is used.
 *
 * @see https://github.com/d3/d3-delaunay
 * @module sketches/voronoi-atlas
 */
(function () {
  'use strict';

  const PALETTES = {
    porcelain: { bg: '#eee9dc', ink: '#39474b', colors: ['#4e7b80', '#78a6a1', '#d09a67', '#bd6148', '#d8c69e', '#a8b9aa'], accent: '#f4dfb5' },
    lagoon: { bg: '#dfe8df', ink: '#284b4b', colors: ['#1f6570', '#398c8b', '#84b4a0', '#bdd0a7', '#d6c995', '#e2a875'], accent: '#f4e7c5' },
    midnight: { bg: '#171f28', ink: '#10171d', colors: ['#24485b', '#356a78', '#60908d', '#a0ae91', '#d6ad70', '#9d5360'], accent: '#e7d2a1' }
  };

  /** Clip a convex polygon to the region closer in weighted distance to a. */
  function clipForSite(poly, a, b) {
    if (!poly.length) return poly;
    const out = [];
    let prev = poly[poly.length - 1];
    let prevD = powerDistance(prev, a) - powerDistance(prev, b);
    for (const point of poly) {
      const d = powerDistance(point, a) - powerDistance(point, b);
      if ((d <= 0) !== (prevD <= 0)) {
        const t = prevD / (prevD - d);
        out.push({ x: prev.x + (point.x - prev.x) * t, y: prev.y + (point.y - prev.y) * t });
      }
      if (d <= 0) out.push(point);
      prev = point;
      prevD = d;
    }
    return out;
  }

  function powerDistance(point, site) {
    const dx = point.x - site.x, dy = point.y - site.y;
    return dx * dx + dy * dy - site.weight;
  }

  function makeCell(sites, index, bounds) {
    let poly = [
      { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
      { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom }
    ];
    const site = sites[index];
    for (let j = 0; j < sites.length && poly.length; j++) {
      if (j !== index) poly = clipForSite(poly, site, sites[j]);
    }
    return poly;
  }

  function centroid(poly) {
    let area = 0, x = 0, y = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const cross = a.x * b.y - b.x * a.y;
      area += cross;
      x += (a.x + b.x) * cross;
      y += (a.y + b.y) * cross;
    }
    if (Math.abs(area) < 1e-8) return poly[0] || { x: 0.5, y: 0.5 };
    return { x: x / (3 * area), y: y / (3 * area) };
  }

  Art.register({
    id: 'voronoi-atlas',
    title: 'Voronoi Atlas',
    animate: false,
    params: {
      cells: { label: 'Territories', type: 'range', min: 12, max: 72, step: 1, value: 38, integer: true },
      layout: { label: 'Site layout', type: 'select', value: 'scatter', options: ['scatter', 'current', 'orbit'] },
      settling: { label: 'Centroid settling', type: 'range', min: 0, max: 5, step: 1, value: 2, integer: true },
      areaBias: { label: 'Area variation', type: 'range', min: 0, max: 0.9, step: 0.05, value: 0.3 },
      drift: { label: 'Field drift', type: 'range', min: 0, max: 1, step: 0.05, value: 0.32 },
      facets: { label: 'Facet depth', type: 'range', min: 0, max: 1, step: 0.05, value: 0.46 },
      linework: { label: 'Boundary weight', type: 'range', min: 0.4, max: 3, step: 0.1, value: 1.1 },
      palette: { label: 'Palette', type: 'select', value: 'porcelain', options: ['porcelain', 'lagoon', 'midnight'] }
    },

    setup(e) {
      const p = e.params;
      const sites = [];
      const margin = 0.055;
      const count = p.cells;
      const scale = 1 / Math.sqrt(count);
      for (let i = 0; i < count; i++) {
        let x, y;
        if (p.layout === 'current') {
          x = rand(margin, 1 - margin);
          y = clamp(x * 0.72 + rand(0.05, 0.25) + gauss(0, 0.09), margin, 1 - margin);
        } else if (p.layout === 'orbit') {
          const a = rand(TAU), r = Math.sqrt(rand()) * 0.43;
          x = clamp(0.5 + Math.cos(a) * r, margin, 1 - margin);
          y = clamp(0.5 + Math.sin(a) * r, margin, 1 - margin);
        } else {
          x = rand(margin, 1 - margin);
          y = rand(margin, 1 - margin);
        }
        sites.push({ x, y, weight: rand(-1, 1) * p.areaBias * scale * scale * 0.2, tone: randInt(0, 5) });
      }

      const bounds = { left: margin, top: margin, right: 1 - margin, bottom: 1 - margin };
      for (let pass = 0; pass < p.settling; pass++) {
        for (let i = 0; i < sites.length; i++) {
          const c = centroid(makeCell(sites, i, bounds));
          sites[i].x = lerp(sites[i].x, c.x, 0.62);
          sites[i].y = lerp(sites[i].y, c.y, 0.62);
        }
      }

      for (const site of sites) {
        const angle = Noise.fbm(site.x * 2.8 + 9, site.y * 2.8 + 3, 3) * TAU;
        const amount = p.drift * scale * 0.38;
        site.x = clamp(site.x + Math.cos(angle) * amount, margin, 1 - margin);
        site.y = clamp(site.y + Math.sin(angle) * amount, margin, 1 - margin);
      }
      e.state = { sites, bounds, palette: PALETTES[p.palette] };
    },

    draw(e) {
      const { ctx, w, h, params: p, state } = e;
      const pal = state.palette;
      const sites = state.sites;
      const bounds = { left: state.bounds.left * w, top: state.bounds.top * h, right: state.bounds.right * w, bottom: state.bounds.bottom * h };
      for (let i = 0; i < sites.length; i++) {
        const poly = makeCell(sites, i, bounds);
        if (poly.length < 3) continue;
        const center = centroid(poly);
        const base = pal.colors[sites[i].tone];
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let j = 1; j < poly.length; j++) ctx.lineTo(poly[j].x, poly[j].y);
        ctx.closePath();
        ctx.fillStyle = base;
        ctx.fill();

        // Alternating fan facets add a cut-stone glint without breaking the
        // shared Voronoi boundaries.
        if (p.facets > 0.02) {
          for (let j = 0; j < poly.length; j++) {
            if ((j + i) % 2) continue;
            const a = poly[j], b = poly[(j + 1) % poly.length];
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.closePath();
            const color = pal.colors[(sites[i].tone + j + 1) % pal.colors.length];
            ctx.fillStyle = colorCss(color, p.facets * 0.38);
            ctx.fill();
          }
        }

        ctx.strokeStyle = colorCss(pal.ink, 0.66);
        ctx.lineWidth = p.linework;
        ctx.stroke();
        if (i % 4 === 0) {
          ctx.fillStyle = colorCss(pal.accent, 0.82);
          ctx.beginPath();
          ctx.arc(center.x, center.y, Math.max(1.3, w * 0.003), 0, TAU);
          ctx.fill();
        }
      }

    }
  });
})();
