/**
 * Delaunay Triangulation — a luminance source is edge-detected, sampled with a
 * full grid of points (denser at features), Delaunay triangulated, and rendered
 * as a low-poly mesh. Shaded fill keeps the image clearly discernible.
 *
 * @module sketches/delaunay
 */
(function () {
  'use strict';

  /**
   * Field resolution for the generated/loaded luminance field.
   *
   * @type {number}
   */
  const GRID = 256;

  /**
   * Loaded source image field, if any.
   *
   * @type {object|null}
   */
  let imgField = null;

  /**
   * Cached generated field.
   *
   * @type {object|null}
   */
  let genCache = null;

  /**
   * Key used to decide whether the generated field cache is still valid.
   *
   * @type {string|null}
   */
  let genKey = null;

  /**
   * DOM wrapper for the optional image picker UI, created once per restart.
   *
   * @type {HTMLDivElement|null}
   */
  let pickerWrap = null;

  /**
   * Smoothstep.
   *
   * @param {number} t
   * @returns {number}
   */
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  function fieldFromImage(img) {
    const c = document.createElement('canvas');
    c.width = GRID; c.height = GRID;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, GRID, GRID);
    const ar = img.width / img.height;
    let dw = GRID, dh = GRID, dx = 0, dy = 0;
    if (ar > 1) { dw = GRID * ar; dx = (GRID - dw) / 2; }
    else { dh = GRID / ar; dy = (GRID - dh) / 2; }
    g.drawImage(img, dx, dy, dw, dh);
    const d = g.getImageData(0, 0, GRID, GRID).data;
    const data = new Float32Array(GRID * GRID);
    for (let i = 0; i < GRID * GRID; i++)
      data[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    return { data, w: GRID, h: GRID };
  }

  function generatedField(e) {
    const p = e.params;
    const key = [e.seed, p.fieldScale, p.detail, p.invert].join('|');
    if (genKey === key && genCache) return genCache;
    const data = new Float32Array(GRID * GRID);
    const sc = p.fieldScale;
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const u = x / GRID, v = y / GRID;
      const dx = u - 0.5, dy = (v - 0.5) * 1.15;
      const r = Math.sqrt(dx * dx + dy * dy);
      const fig = smooth(1 - r * 2.0);
      const n = fbm(u * sc * 3 + 12, v * sc * 3 + 34, p.detail);
      let lum = clamp(fig * 0.72 + n * 0.55 - 0.12, 0, 1);
      if (p.invert) lum = 1 - lum;
      data[y * GRID + x] = lum;
    }
    genKey = key; genCache = { data, w: GRID, h: GRID };
    return genCache;
  }

  function sampleField(f, u, v) {
    u = clamp(u, 0, 1); v = clamp(v, 0, 1);
    const x = u * (f.w - 1), y = v * (f.h - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(f.w - 1, x0 + 1), y1 = Math.min(f.h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const a = f.data[y0 * f.w + x0], b = f.data[y0 * f.w + x1];
    const c = f.data[y1 * f.w + x0], d = f.data[y1 * f.w + x1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }

  function edgeMagnitude(field) {
    const data = field.data, w = field.w, h = field.h;
    const mag = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -data[i-w-1] -2*data[i-1] -data[i+w-1] + data[i-w+1] +2*data[i+1] + data[i+w+1];
      const gy = -data[i-w-1] -2*data[i-w] -data[i-w+1] + data[i+w-1] +2*data[i+w] + data[i+w+1];
      mag[i] = Math.sqrt(gx*gx + gy*gy);
    }
    let max = 0; for (let i = 0; i < mag.length; i++) if (mag[i] > max) max = mag[i];
    if (max > 0) for (let i = 0; i < mag.length; i++) mag[i] /= max;
    return mag;
  }

  function circumContains(ax,ay,bx,by,cx,cy,px,py) {
    const d = 2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
    if (Math.abs(d) < 1e-9) return false;
    const a2=ax*ax+ay*ay, b2=bx*bx+by*by, c2=cx*cx+cy*cy;
    const ux=(a2*(by-cy)+b2*(cy-ay)+c2*(ay-by))/d;
    const uy=(a2*(cx-bx)+b2*(ax-cx)+c2*(bx-ax))/d;
    const r2=(ax-ux)*(ax-ux)+(ay-uy)*(ay-uy);
    const dx=px-ux, dy=py-uy;
    return dx*dx+dy*dy < r2;
  }

  function delaunay(pts) {
    const n = pts.length;
    if (n < 3) return [];
    let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    for (const p of pts){ if(p.x<minx)minx=p.x; if(p.y<miny)miny=p.y; if(p.x>maxx)maxx=p.x; if(p.y>maxy)maxy=p.y; }
    const dmax=Math.max(maxx-minx,maxy-miny)*10||1, mx=(minx+maxx)/2, my=(miny+maxy)/2;
    const all=pts.slice();
    all.push({x:mx-dmax,y:my-dmax}); all.push({x:mx,y:my+dmax}); all.push({x:mx+dmax,y:my-dmax});
    const s0=n,s1=n+1,s2=n+2;
    let tris=[[s0,s1,s2]];
    for (let i=0;i<n;i++){
      const p=all[i], bad=[];
      for (let ti=0;ti<tris.length;ti++){ const t=tris[ti];
        if (circumContains(all[t[0]].x,all[t[0]].y,all[t[1]].x,all[t[1]].y,all[t[2]].x,all[t[2]].y,p.x,p.y)) bad.push(ti); }
      const edgeCount=new Map();
      for (const ti of bad){ const t=tris[ti];
        for (let e=0;e<3;e++){ let a=t[e],b=t[(e+1)%3]; if(a>b){const tmp=a;a=b;b=tmp;}
          const key=a+','+b; edgeCount.set(key,(edgeCount.get(key)||0)+1); } }
      const boundary=[];
      for (const [key,count] of edgeCount){ if(count===1){ const pr=key.split(','); boundary.push([+pr[0],+pr[1]]); } }
      bad.sort((a,b)=>b-a); for (const ti of bad) tris.splice(ti,1);
      for (const [a,b] of boundary) tris.push([a,b,i]);
    }
    const result=[];
    for (const t of tris){ if(t[0]>=n||t[1]>=n||t[2]>=n) continue; result.push(t); }
    return result;
  }

  function ensurePicker() {
    const box = document.getElementById('params');
    if (pickerWrap) {
      if (box && pickerWrap.parentNode !== box) box.appendChild(pickerWrap);
      return;
    }
    pickerWrap = document.createElement('div');
    pickerWrap.className = 'param param-file';
    const label = document.createElement('label');
    label.className = 'param-label';
    label.textContent = 'Source image ';
    const hint = document.createElement('span');
    hint.className = 'param-value';
    hint.textContent = imgField ? 'loaded' : 'none (generated)';
    label.appendChild(hint);
    pickerWrap.appendChild(label);
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.className = 'param-input';
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = function () {
        imgField = fieldFromImage(img);
        hint.textContent = file.name;
        Art.restart();
      };
      img.src = URL.createObjectURL(file);
    });
    pickerWrap.appendChild(input);
    const clear = document.createElement('button');
    clear.type = 'button'; clear.textContent = 'Use generated field';
    clear.addEventListener('click', function () {
      imgField = null; hint.textContent = 'none (generated)'; Art.restart();
    });
    pickerWrap.appendChild(clear);
    if (box) box.appendChild(pickerWrap);
  }

  Art.register({
    id: 'delaunay',
    title: 'Delaunay Triangulation',
    animate: false,
    params: {
      cell:          { label: 'Grid spacing',  type: 'range', min: 4,  max: 30, step: 1,    value: 9, integer: true },
      edgeDensity:   { label: 'Edge density',  type: 'range', min: 0,  max: 1,  step: 0.05, value: 0.8 },
      jitter:        { label: 'Point jitter',  type: 'range', min: 0,  max: 1,  step: 0.05, value: 0.35 },
      width:         { label: 'Line width',    type: 'range', min: 0.2,max: 3,  step: 0.1,  value: 0.6 },
      shade:         { label: 'Shade fill',    type: 'checkbox', value: true },
      showEdges:     { label: 'Show edges',    type: 'checkbox', value: true },
      showPoints:    { label: 'Show points',   type: 'checkbox', value: false },
      fieldScale:    { label: 'Field scale',   type: 'range', min: 0.5,max: 8,  step: 0.1,  value: 2.5 },
      detail:        { label: 'Field detail',  type: 'range', min: 1,  max: 6,  step: 1,    value: 4, integer: true },
      invert:        { label: 'Invert field',  type: 'checkbox', value: false },
      palette:       { label: 'Palette', type: 'select', value: 'monochrome',
        options: ['analogous', 'complementary', 'triadic', 'split', 'monochrome', 'random'] },
      blackWhite:    { label: 'Black & white', type: 'checkbox', value: true },
      dark:          { label: 'Light ink', type: 'checkbox', value: true }
    },

    setup(e) {
      ensurePicker();
      const p = e.params;
      const field = imgField || generatedField(e);
      const mag = edgeMagnitude(field);

      // Inset mesh leaves a quiet, borderless transparent margin.
      const pts = [];
      const cell = p.cell, jit = p.jitter, edgeDensity = p.edgeDensity;
      const margin = 0.06;
      const add = (x, y) => {
        const jx = x + (RNG.unit() - 0.5) * cell * jit;
        const jy = y + (RNG.unit() - 0.5) * cell * jit;
        pts.push({
          x: (margin + clamp(jx / GRID, 0, 1) * (1 - margin * 2)) * e.w,
          y: (margin + clamp(jy / GRID, 0, 1) * (1 - margin * 2)) * e.h
        });
      };
      for (let gy = 0; gy < GRID; gy += cell) {
        for (let gx = 0; gx < GRID; gx += cell) {
          add(gx, gy);                                   // base grid point
          const m = mag[clamp(gy, 0, GRID - 1) * GRID + clamp(gx, 0, GRID - 1)];
          if (RNG.unit() < m * edgeDensity) {            // extra detail at features
            add(gx + RNG.range(-0.5, 0.5) * cell, gy + RNG.range(-0.5, 0.5) * cell);
          }
        }
      }

      e.state = { field, pts, tris: delaunay(pts), pal: makePalette(e.params.palette) };
    },

    draw(e) {
      const p = e.params, st = e.state, ctx = e.ctx;
      ctx.lineWidth = p.width;
      ctx.lineJoin = 'round';

      const palColor = (lum) => colorCss(st.pal[Math.min(st.pal.length - 1, Math.floor(lum * st.pal.length))], 1);

      for (const t of st.tris) {
        const A = st.pts[t[0]], B = st.pts[t[1]], C = st.pts[t[2]];
        const cx = (A.x + B.x + C.x) / 3 / e.w, cy = (A.y + B.y + C.y) / 3 / e.h;
        const lum = clamp(sampleField(st.field, cx, cy), 0, 1);

        ctx.beginPath();
        ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.closePath();

        if (p.shade) {
          if (p.blackWhite) { const g = Math.round(lum * 255); ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; }
          else ctx.fillStyle = palColor(lum);
          ctx.fill();
        }
        if (p.showEdges) {
          ctx.strokeStyle = p.blackWhite ? colorMono(p.dark) : palColor(lum);
          ctx.stroke();
        }
      }

      if (p.showPoints) {
        ctx.fillStyle = colorMono(p.dark);
        for (const q of st.pts) { ctx.beginPath(); ctx.arc(q.x, q.y, p.width * 1.3, 0, TAU); ctx.fill(); }
      }
    }
  });
})();
