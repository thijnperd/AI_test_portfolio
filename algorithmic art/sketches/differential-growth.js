/**
 * Differential Growth — a closed contour that grows into an organic membrane.
 *
 * A ring of nodes is relaxed each frame: neighbours pull the contour taut
 * (line tension), non-neighbours inside a repulsion radius push apart, and any
 * edge that stretches past a threshold splits by inserting its midpoint. The
 * tug-of-war between tension and crowding is what folds a plain loop into the
 * pleated, brain-like membranes this technique is known for. A small seeded
 * wobble keeps it alive once growth saturates.
 *
 * Original implementation in the lineage of Anders Hoff's (inconvergent)
 * "differential-line" experiments (https://github.com/inconvergent/differential-line);
 * the spatial hash, growth budget and renderer here are this project's own.
 * Same seed + params always grows the same membrane.
 *
 * @module sketches/differential-growth
 */
(function () {
  'use strict';

  /**
   * Design-space canvas, square. The composition is built here and scaled to
   * the real canvas, so the look is resolution-independent.
   *
   * @type {number}
   */
  const DESIGN = 1000;

  /**
   * Relaxation passes per frame. More passes settle faster but cost more.
   *
   * @type {number}
   */
  const ITERATIONS = 3;

  /**
   * Maximum edge splits per frame. Keeps growth a gentle creep instead of a
   * single-frame explosion (and keeps the sketch light on an ordinary laptop).
   *
   * @type {number}
   */
  const MAX_SPLITS_PER_FRAME = 12;

  /**
   * Named ink/accent palettes, shared in spirit with `substrate.js`: a ground
   * the marks are meant to sit on, a body ink and one rare accent.
   *
   * @type {Object<string, {bg: string, ink: string, accent: string}>}
   */
  const PALETTES = {
    parchment: { bg: '#eae3d2', ink: '#3a2f26', accent: '#a4562e' },
    graphite: { bg: '#101013', ink: '#d8d4cb', accent: '#e0a45c' },
    dusk: { bg: '#1a2230', ink: '#c6d2e4', accent: '#d9784f' },
    algae: { bg: '#e6ecdf', ink: '#2f4a38', accent: '#7c9c5a' },
    serum: { bg: '#eef2f4', ink: '#1f2a33', accent: '#c2413b' },
    nocturne: { bg: '#0b0c10', ink: '#c9d2de', accent: '#7aa2ff' }
  };
  const PALETTE_NAMES = Object.keys(PALETTES);

  /* ------------------------------------------------------------------ */
  /* seeding                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Start the contour as a slightly irregular ring.
   *
   * The noise term makes the first ring gently non-circular so growth does not
   * begin from a perfectly symmetric state (which tends to grow symmetric).
   *
   * @param {number} count - number of seed nodes.
   * @returns {{x: number, y: number}[]} the node ring in design space.
   */
  function seedRing(count) {
    const nodes = [];
    const radius = DESIGN * 0.15;
    const phase = rand(0, TAU);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + phase;
      const wobble = 0.88 + 0.24 * noise(Math.cos(a) * 2.1 + 5, Math.sin(a) * 2.1 - 3);
      nodes.push({
        x: DESIGN / 2 + Math.cos(a) * radius * wobble,
        y: DESIGN / 2 + Math.sin(a) * radius * wobble
      });
    }
    return nodes;
  }

  /* ------------------------------------------------------------------ */
  /* the growth system                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Two nodes are linked if they are edge-adjacent on the closed loop.
   *
   * @param {number} i
   * @param {number} j
   * @param {number} n - node count.
   * @returns {boolean}
   */
  function adjacent(i, j, n) {
    return j === (i + 1) % n || j === (i - 1 + n) % n;
  }

  /**
   * One relaxation pass: crowd the nodes apart, then pull the contour taut.
   *
   * Repulsion uses a uniform spatial hash sized to the repulsion radius, so
   * each node only tests the ~9 cells around it instead of every other node.
   * Displacements accumulate in scratch arrays, then apply once, which keeps
   * the pass stable and prevents order-dependent drift.
   *
   * @param {object} st - sketch state (nodes + scratch buffers).
   * @param {object} p - live parameters.
   * @returns {void}
   */
  function relax(st, p) {
    const nodes = st.nodes;
    const n = nodes.length;
    if (n < 3) return;

    const cols = st.cols;
    const head = st.head;
    const next = st.next;
    const dx = st.dx;
    const dy = st.dy;
    const invCell = 1 / st.cell;
    const radius = p.repulsion;
    const r2 = radius * radius;

    /* --- rebuild the spatial hash (linked lists, no per-node objects) --- */
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      let cx = (nd.x * invCell) | 0;
      let cy = (nd.y * invCell) | 0;
      if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0; else if (cy >= cols) cy = cols - 1;
      const c = cy * cols + cx;
      next[i] = head[c];
      head[c] = i;
    }

    dx.fill(0, 0, n);
    dy.fill(0, 0, n);

    /* --- repulsion: push non-neighbours apart inside the radius --- */
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      let cx = (a.x * invCell) | 0;
      let cy = (a.y * invCell) | 0;
      if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0; else if (cy >= cols) cy = cols - 1;

      for (let oy = -1; oy <= 1; oy++) {
        const yy = cy + oy;
        if (yy < 0 || yy >= cols) continue;
        const row = yy * cols;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox;
          if (xx < 0 || xx >= cols) continue;
          let j = head[row + xx];
          while (j !== -1) {
            if (j !== i && !adjacent(i, j, n)) {
              const b = nodes[j];
              const ddx = a.x - b.x;
              const ddy = a.y - b.y;
              const d2 = ddx * ddx + ddy * ddy;
              if (d2 > 1e-6 && d2 < r2) {
                const d = Math.sqrt(d2);
                const push = ((radius - d) / radius) * 0.5;
                dx[i] += (ddx / d) * push;
                dy[i] += (ddy / d) * push;
              }
            }
            j = next[j];
          }
        }
      }
    }

    /* --- line tension: pull each node toward the midpoint of its neighbours */
    if (p.attraction > 0) {
      for (let i = 0; i < n; i++) {
        const prev = nodes[(i - 1 + n) % n];
        const nxt = nodes[(i + 1) % n];
        const mx = (prev.x + nxt.x) * 0.5;
        const my = (prev.y + nxt.y) * 0.5;
        dx[i] += (mx - nodes[i].x) * p.attraction;
        dy[i] += (my - nodes[i].y) * p.attraction;
      }
    }

    /* --- edge springs: keep edge length near the rest length --- */
    const rest = Math.max(1, radius * 0.5);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = nodes[i];
      const b = nodes[j];
      const ddx = b.x - a.x;
      const ddy = b.y - a.y;
      const d = Math.hypot(ddx, ddy) || 1e-6;
      if (d > rest) {
        const k = (d - rest) * 0.25;
        const ux = ddx / d;
        const uy = ddy / d;
        dx[i] += ux * k;
        dy[i] += uy * k;
        dx[j] -= ux * k;
        dy[j] -= uy * k;
      }
    }

    /* --- apply, with a seeded wobble and a soft frame clamp --- */
    const wob = p.wobble;
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      nd.x += dx[i];
      nd.y += dy[i];
      if (wob > 0) {
        nd.x += gauss(0, 0.4) * wob;
        nd.y += gauss(0, 0.4) * wob;
      }
      if (nd.x < 3) nd.x = 3; else if (nd.x > DESIGN - 3) nd.x = DESIGN - 3;
      if (nd.y < 3) nd.y = 3; else if (nd.y > DESIGN - 3) nd.y = DESIGN - 3;
    }
  }

  /**
   * Subdivide over-stretched edges by inserting midpoints (the growth step).
   *
   * The list is rebuilt only when something actually splits, so a saturated
   * membrane costs no allocation at all.
   *
   * @param {object} st - sketch state.
   * @param {object} p - live parameters.
   * @returns {void}
   */
  function grow(st, p) {
    const nodes = st.nodes;
    const n = nodes.length;
    if (n < 3) return;

    // The split threshold is tied to the repulsion spacing. Repulsion settles
    // a ring near R/2 between neighbours, so an absolute threshold (or one
    // above that spacing) can sit higher than any edge ever reaches and never
    // split — the membrane then never grows. Keeping the threshold below R/2
    // makes growth self-sustaining: new nodes crowd, push the contour out, and
    // folds appear once the frame confines it.
    const threshold = Math.max(1.2, p.repulsion * 0.3 * p.growth);
    const t2 = threshold * threshold;

    const out = [];
    let added = 0;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % n];
      out.push(a);
      // Cap on total nodes: out.length = (edges kept so far) + added <= n + added.
      if (added >= MAX_SPLITS_PER_FRAME || n + added >= p.maxNodes) continue;
      const ddx = b.x - a.x;
      const ddy = b.y - a.y;
      if (ddx * ddx + ddy * ddy > t2) {
        out.push({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });
        added++;
      }
    }
    if (added > 0) st.nodes = out;
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Trace the closed contour as a smooth curve.
   *
   * Each node becomes a quadratic control point with the path passing through
   * the midpoints of its edges — the cheap, robust way to draw a smooth closed
   * curve through a polyline without spline control-point bookkeeping.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x: number, y: number}[]} nodes
   * @returns {void}
   */
  function tracePath(ctx, nodes) {
    const n = nodes.length;
    if (n < 3) return;
    const first = nodes[0];
    const last = nodes[n - 1];
    ctx.beginPath();
    ctx.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
    for (let i = 0; i < n; i++) {
      const cur = nodes[i];
      const nxt = nodes[(i + 1) % n];
      ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + nxt.x) * 0.5, (cur.y + nxt.y) * 0.5);
    }
    ctx.closePath();
  }

  /* ------------------------------------------------------------------ */
  /* registration                                                       */
  /* ------------------------------------------------------------------ */

  Art.register({
    id: 'differential-growth',
    title: 'Differential Growth',
    animate: true,

    params: {
      nodes: { label: 'Seed nodes', type: 'range', min: 40, max: 1200, step: 10, value: 260, integer: true },
      growth: { label: 'Growth', type: 'range', min: 0.5, max: 1.5, step: 0.05, value: 0.8 },
      attraction: { label: 'Attraction', type: 'range', min: 0, max: 0.5, step: 0.01, value: 0.14 },
      repulsion: { label: 'Repulsion', type: 'range', min: 4, max: 28, step: 0.5, value: 11 },
      wobble: { label: 'Wobble', type: 'range', min: 0, max: 1, step: 0.02, value: 0.18 },
      maxNodes: { label: 'Max nodes', type: 'range', min: 500, max: 9000, step: 100, value: 3200, integer: true },
      width: { label: 'Line width', type: 'range', min: 0.3, max: 4, step: 0.1, value: 1.2 },
      palette: {
        label: 'Palette', type: 'select', value: 'graphite', options: PALETTE_NAMES
      },
      mono: { label: 'Black & white', type: 'checkbox', value: false },
      dark: { label: 'Light ink', type: 'checkbox', value: true },
      fill: { label: 'Soft fill', type: 'checkbox', value: true }
    },

    /**
     * Seed the ring and size the spatial-hash scratch buffers for this restart.
     *
     * @param {object} e - AlgoArt sketch environment.
     * @returns {void}
     */
    setup(e) {
      const p = e.params;
      const cell = Math.max(2, p.repulsion);
      const cols = Math.ceil(DESIGN / cell) + 1;
      // Buffers must cover the seed ring even if it outnumbers the growth cap.
      const cap = Math.max(p.nodes, p.maxNodes) + 16;
      e.state = {
        pal: PALETTES[p.palette] || PALETTES.graphite,
        nodes: seedRing(p.nodes),
        cell: cell,
        cols: cols,
        head: new Int32Array(cols * cols),
        next: new Int32Array(cap),
        dx: new Float32Array(cap),
        dy: new Float32Array(cap)
      };
    },

    /**
     * Relax, grow, and repaint the membrane from scratch each frame.
     *
     * @param {object} e - AlgoArt sketch environment.
     * @returns {void}
     */
    draw(e) {
      const st = e.state;
      const p = e.params;
      const ctx = e.ctx;

      if (e.dt > 0) {
        for (let k = 0; k < ITERATIONS; k++) relax(st, p);
        grow(st, p);
      }

      ctx.clearRect(0, 0, e.w, e.h);

      const scale = e.w / DESIGN;
      ctx.save();
      ctx.scale(scale, scale);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const ink = p.mono ? colorMono(p.dark) : colorCss(st.pal.ink, 0.92);
      const accent = p.mono ? colorMono(p.dark, 0.55) : colorCss(st.pal.accent, 0.85);

      tracePath(ctx, st.nodes);

      if (p.fill) {
        ctx.fillStyle = p.mono ? colorMono(p.dark, 0.07) : colorCss(st.pal.accent, 0.1);
        ctx.fill();
      }

      // Outer accent halo, then the ink line on top: a layered, plotted look.
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = p.width * 3.4;
      ctx.strokeStyle = accent;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.lineWidth = Math.max(0.4, p.width);
      ctx.strokeStyle = ink;
      ctx.stroke();

      ctx.restore();
    }
  });
})();
