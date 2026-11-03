/* app.js — the browser half of Chicken Lane.
 *
 * Everything here is presentation and input. The rules, the odds and the
 * randomness live in core.js, which knows nothing about a DOM.
 *
 * The road is drawn, not shipped: asphalt bands, lane dashes, traffic and the
 * bird are all paths on one small canvas. That keeps the project a single folder
 * with no image files, and it means the playfield can be restyled without
 * touching the maths.
 */
(function () {
  'use strict';

  const Core = window.CluckCore;
  const STORE = 'chicken-lane-v1';
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduceMotion = () => !!(motionQuery && motionQuery.matches);

  const $ = (id) => document.getElementById(id);
  const els = {
    points: $('points'),
    roadNo: $('road-no'),
    topup: $('topup'),
    bet: $('bet'),
    betHalf: $('bet-half'),
    betDouble: $('bet-double'),
    betNote: $('bet-note'),
    chips: document.querySelectorAll('.chip[data-bet]'),
    roads: $('roads'),
    roadNote: $('road-note'),
    cross: $('cross'),
    cash: $('cash'),
    oddsSummary: $('odds-summary'),
    oddsBody: $('odds-body'),
    factSeed: $('fact-seed'),
    factHash: $('fact-hash'),
    factNonce: $('fact-nonce'),
    factRoad: $('fact-road'),
    clientSeed: $('client-seed'),
    statRounds: $('stat-rounds'),
    statBusts: $('stat-busts'),
    statCashes: $('stat-cashes'),
    statStaked: $('stat-staked'),
    statReturned: $('stat-returned'),
    statNet: $('stat-net'),
    statBest: $('stat-best'),
    sbPoints: $('sb-points'),
    sbRoad: $('sb-road'),
    sbMult: $('sb-mult'),
    sbNext: $('sb-next'),
    sbCrossed: $('sb-crossed'),
    wrap: $('canvas-wrap'),
    canvas: $('road'),
    hint: $('canvas-hint'),
    result: $('result'),
    rKicker: $('result-kicker'),
    rMult: $('result-mult'),
    rLine: $('result-line'),
    rNote: $('result-note'),
    card: document.querySelector('.card'),
    again: $('again'),
    dismiss: $('dismiss'),
    mute: $('mute'),
  };

  /* --------------------------------------------------------------- state */

  function readStore() {
    try {
      return JSON.parse(window.localStorage.getItem(STORE)) || {};
    } catch (err) {
      return {};
    }
  }

  function randomSeed() {
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    let hex = '';
    for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
    return hex;
  }

  const saved = readStore();

  const state = {
    table: new Core.Table({
      balance: Number.isFinite(saved.balance) ? Math.max(0, Math.floor(saved.balance)) : Core.START_POINTS,
      bet: Number.isFinite(saved.bet) ? saved.bet : 25,
      difficulty: saved.difficulty || 'medium',
      clientSeed: typeof saved.clientSeed === 'string' && saved.clientSeed ? saved.clientSeed : 'night-' + Math.random().toString(36).slice(2, 8),
      serverSeed: randomSeed(),
    }),
    muted: !!saved.muted,
    lastMult: 0,
    oddsFor: null,
    oddsRows: [],
  };

  function writeStore() {
    const t = state.table;
    try {
      window.localStorage.setItem(
        STORE,
        JSON.stringify({
          balance: t.balance,
          bet: t.bet,
          difficulty: t.difficultyId,
          clientSeed: t.clientSeed,
          muted: state.muted,
        })
      );
    } catch (err) {
      /* Private mode. The game plays fine, it just forgets you. */
    }
  }

  /* -------------------------------------------------------------- canvas */

  const view = {
    w: 0,
    h: 0,
    dpr: 1,
    laneW: 60,
    x0: 70,
    worldW: 1600,
    camX: 0,
    camTarget: 0,
    hop: null,
    bust: null,
    flash: 0,
    feathers: [],
    last: 0,
    raf: 0,
  };

  const ctx = els.canvas.getContext('2d');
  const lanes = () => state.table.clearSteps;
  const probe = (crossed) => view.x0 + (crossed - 0.5) * view.laneW;

  function clampCam(target) {
    const min = -view.laneW * 0.7;
    const max = Math.max(min, view.worldW - view.w + view.laneW * 0.5);
    return Math.min(max, Math.max(min, target));
  }

  function resize() {
    const rect = els.wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = Math.max(300, Math.round(rect.width));
    view.h = Math.max(220, Math.round(rect.height));
    view.dpr = dpr;
    els.canvas.width = Math.round(view.w * dpr);
    els.canvas.height = Math.round(view.h * dpr);
    els.canvas.style.width = view.w + 'px';
    els.canvas.style.height = view.h + 'px';
    // Aim for about seven lanes on screen: enough to see the next three steps.
    view.laneW = Math.max(34, Math.min(88, view.w / 7.4));
    view.x0 = view.laneW * 1.15;
    view.worldW = view.x0 + lanes() * view.laneW + view.laneW * 1.9;
    view.camTarget = clampCam(probe(crossedNow()) - view.w * 0.34);
    view.camX = view.camTarget;
    draw(performance.now());
  }

  const crossedNow = () => (state.table.round ? state.table.round.crossed : 0);

  /* --------------- traffic: deterministic per lane, cosmetic only -------- */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TRAFFIC = {
    easy: { cars: 1, speed: 0.9 },
    medium: { cars: 2, speed: 1.05 },
    hard: { cars: 2, speed: 1.25 },
    daredevil: { cars: 3, speed: 1.55 },
  };

  const carCache = new Map();
  function laneTraffic(lane, difficultyId) {
    const key = difficultyId + ':' + lane;
    if (carCache.has(key)) return carCache.get(key);
    const mode = TRAFFIC[difficultyId] || TRAFFIC.medium;
    const rnd = mulberry32(lane * 2654435761 + 12345);
    const count = mode.cars;
    const cars = [];
    for (let i = 0; i < count; i++) {
      cars.push({
        offset: rnd(),
        speed: (0.07 + rnd() * 0.09) * mode.speed,
        dir: lane % 2 === 0 ? 1 : -1,
        tone: ['#2b3140', '#333a4b', '#3a2f38', '#2c3a3c'][Math.floor(rnd() * 4)],
        truck: rnd() > 0.72,
      });
    }
    carCache.set(key, cars);
    return cars;
  }

  /* ------------------------------------------------------------- drawing */

  const MONO = '"SF Mono", "Cascadia Code", Consolas, "JetBrains Mono", Menlo, monospace';

  function shortMult(value) {
    if (!isFinite(value)) return '\u2014';
    if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e4) return (value / 1000).toFixed(1) + 'k';
    if (value >= 1000) return (value / 1000).toFixed(1).replace('.0', '') + 'k';
    if (value >= 100) return value.toFixed(0);
    return value.toFixed(2);
  }

  function paintGround() {
    const t = state.table;
    const laneW = view.laneW;
    const count = lanes();

    ctx.fillStyle = '#101218';
    ctx.fillRect(0, 0, view.w, view.h);

    const roadLeft = view.x0 - view.camX;
    const roadRight = roadLeft + count * laneW;

    for (let i = 0; i < count; i++) {
      const x = roadLeft + i * laneW;
      if (x + laneW < -4 || x > view.w + 4) continue;
      ctx.fillStyle = i % 2 ? '#14161c' : '#171a21';
      ctx.fillRect(x, 0, laneW + 0.5, view.h);
    }

    // The two kerbs, hatched so they read as pavement rather than more road.
    ctx.strokeStyle = '#232833';
    ctx.lineWidth = 1;
    const hatched = (from, to) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(from, 0, to - from, view.h);
      ctx.clip();
      ctx.fillStyle = '#1b1f27';
      ctx.fillRect(from, 0, to - from, view.h);
      ctx.strokeStyle = '#222834';
      for (let y = -40; y < view.h + 40; y += 14) {
        ctx.beginPath();
        ctx.moveTo(from, y);
        ctx.lineTo(to, y + 14);
        ctx.stroke();
      }
      ctx.restore();
    };

    if (roadLeft > -40) hatched(roadLeft - laneW * 0.85, roadLeft);
    if (roadRight < view.w + 40) hatched(roadRight, roadRight + laneW * 1.6);

    // Lane dividers, running the way the traffic runs.
    ctx.setLineDash([12, 17]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3b4150';
    for (let i = 1; i < count; i++) {
      const x = roadLeft + i * laneW;
      if (x < -6 || x > view.w + 6) continue;
      ctx.beginPath();
      ctx.moveTo(x, -10);
      ctx.lineTo(x, view.h + 10);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Solid edges of the carriageway.
    ctx.strokeStyle = '#4a5163';
    ctx.lineWidth = 2;
    for (const x of [roadLeft, roadRight]) {
      if (x < -6 || x > view.w + 6) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, view.h);
      ctx.stroke();
    }

    // The far kerb: a chequered strip and the golden egg at the end of the road.
    if (roadRight > -laneW && roadRight < view.w + laneW * 2) {
      const sq = Math.max(7, laneW * 0.18);
      for (let y = 0, row = 0; y < view.h; y += sq, row++) {
        ctx.fillStyle = row % 2 ? '#e8eaf0' : '#2c313d';
        ctx.fillRect(roadRight + 4, y, sq, sq);
        ctx.fillStyle = row % 2 ? '#2c313d' : '#e8eaf0';
        ctx.fillRect(roadRight + 4 + sq, y, sq, sq);
      }
      const eggX = roadRight + laneW * 1.05;
      const eggY = view.h * 0.5;
      const r = Math.max(9, laneW * 0.2);
      ctx.save();
      ctx.translate(eggX, eggY);
      ctx.fillStyle = '#e8c26a';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.82, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 246, 216, 0.55)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.24, -r * 0.4, r * 0.24, r * 0.36, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Lane numbers, every fifth lane, so a long road stays readable.
    ctx.font = '600 10px ' + MONO;
    ctx.fillStyle = '#333a48';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 5; i <= count; i += 5) {
      const x = roadLeft + (i - 0.5) * laneW;
      if (x < 12 || x > view.w - 12) continue;
      ctx.fillText(String(i).padStart(2, '0'), x, 16);
    }
    void t;
  }

  function paintTags() {
    const t = state.table;
    const laneW = view.laneW;
    const roadLeft = view.x0 - view.camX;
    const crossed = crossedNow();
    const live = t.status === 'live';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 1; i <= lanes(); i++) {
      const x = roadLeft + (i - 0.5) * laneW;
      if (x < 18 || x > view.w - 18) continue;
      const next = live && i === crossed + 1;
      const mult = Core.multiplier(t.difficultyId, i);
      const tagY = view.h - 46;

      if (next) {
        ctx.fillStyle = 'rgba(122, 162, 255, 0.10)';
        ctx.fillRect(roadLeft + (i - 1) * laneW, 0, laneW, view.h);
        ctx.fillStyle = 'rgba(122, 162, 255, 0.65)';
        ctx.beginPath();
        ctx.moveTo(x - 5, tagY - 27);
        ctx.lineTo(x + 5, tagY - 27);
        ctx.lineTo(x, tagY - 18);
        ctx.closePath();
        ctx.fill();
      }

      ctx.font = '600 ' + (next ? 11 : 10) + 'px ' + MONO;
      ctx.fillStyle = next ? '#8db0ff' : '#4b5264';
      ctx.fillText(shortMult(mult) + '\u00d7', x, tagY);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function paintCar(cx, cy, w, len, tone, dir, truck) {
    const body = truck ? len * 1.55 : len;
    const y = cy - body / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    roundRect(cx - w / 2 + 2, y + 3, w, body, w * 0.28);
    ctx.fill();

    ctx.fillStyle = tone;
    roundRect(cx - w / 2, y, w, body, w * 0.28);
    ctx.fill();

    // Cabin glass, inset from the nose.
    ctx.fillStyle = 'rgba(140, 155, 180, 0.28)';
    const glassH = body * (truck ? 0.22 : 0.3);
    const glassY = dir > 0 ? y + body * (truck ? 0.5 : 0.34) : y + body * (truck ? 0.28 : 0.36);
    roundRect(cx - w * 0.32, glassY, w * 0.64, glassH, w * 0.14);
    ctx.fill();

    // Headlights at the leading end, tail lights at the trailing one.
    const noseY = dir > 0 ? y + body - 4 : y + 4;
    ctx.fillStyle = '#ffe9b8';
    ctx.beginPath();
    ctx.arc(cx - w * 0.3, noseY, Math.max(1.4, w * 0.06), 0, Math.PI * 2);
    ctx.arc(cx + w * 0.3, noseY, Math.max(1.4, w * 0.06), 0, Math.PI * 2);
    ctx.fill();

    const tailY = dir > 0 ? y + 4 : y + body - 4;
    ctx.fillStyle = 'rgba(224, 87, 77, 0.55)';
    ctx.beginPath();
    ctx.arc(cx - w * 0.3, tailY, Math.max(1.2, w * 0.05), 0, Math.PI * 2);
    ctx.arc(cx + w * 0.3, tailY, Math.max(1.2, w * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }

  function paintCars(now) {
    const t = state.table;
    const laneW = view.laneW;
    const roadLeft = view.x0 - view.camX;
    const seconds = now / 1000;

    for (let lane = 1; lane <= lanes(); lane++) {
      const x = roadLeft + (lane - 0.5) * laneW;
      if (x < -laneW || x > view.w + laneW) continue;
      const cars = laneTraffic(lane, t.difficultyId);
      for (const car of cars) {
        const span = view.h + laneW * 3;
        let travel = (car.offset + seconds * car.speed * car.dir) % 1;
        if (travel < 0) travel += 1;
        const cy = travel * span - laneW * 1.5;
        if (cy < -laneW * 2 || cy > view.h + laneW * 2) continue;
        const carLen = (car.truck ? 1.9 : 1.25) * laneW;
        paintCar(x, cy, laneW * 0.52, carLen, car.tone, car.dir, car.truck);
      }
    }
  }

  function paintBird(now) {
    const laneW = view.laneW;
    const roadLeft = view.x0 - view.camX;
    const crossed = crossedNow();
    const scale = Math.max(0.6, Math.min(1.1, laneW / 64));

    let x = roadLeft + (crossed - 0.5) * laneW;
    let y = view.h * 0.52;
    let lift = 0;
    let squashX = 1;
    let squashY = 1;
    let rot = 0;
    let hurt = false;

    if (!reduceMotion()) y += Math.sin(now / 430) * 1.6;

    if (view.hop) {
      const k = Math.min(1, (now - view.hop.start) / Math.max(1, view.hop.dur));
      const ease = 1 - Math.pow(1 - k, 3);
      const fromX = roadLeft + (view.hop.from - 0.5) * laneW;
      const toX = roadLeft + (view.hop.to - 0.5) * laneW;
      x = fromX + (toX - fromX) * ease;
      lift = Math.sin(Math.PI * k) * laneW * 0.5;
      squashY = 1 + Math.sin(Math.PI * k) * 0.16;
      squashX = 1 - Math.sin(Math.PI * k) * 0.1;
    }

    if (view.bust) {
      const k = Math.min(1, (now - view.bust.start) / 520);
      const dir = view.bust.lane % 2 === 0 ? 1 : -1;
      hurt = true;
      x += Math.sin(k * Math.PI) * 26 * dir;
      y -= Math.sin(k * Math.PI) * 20;
      lift += k * 8;
      rot = k * 2.1 * dir;
      squashX = 1 + k * 0.12;
      squashY = 1 - k * 0.12;
    }

    drawBird(x, y - lift, scale, squashX, squashY, rot, hurt);
  }

  function drawBird(cx, cy, scale, squashX, squashY, rot, hurt) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(scale * squashX, scale * squashY);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 17, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.strokeStyle = '#e8a24a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, 11);
    ctx.lineTo(-6, 19);
    ctx.moveTo(-6, 19);
    ctx.lineTo(-10, 19);
    ctx.moveTo(5, 11);
    ctx.lineTo(7, 19);
    ctx.moveTo(7, 19);
    ctx.lineTo(11, 19);
    ctx.stroke();

    // tail
    ctx.fillStyle = '#d5dae6';
    ctx.beginPath();
    ctx.moveTo(-15, -3);
    ctx.lineTo(-27, -11);
    ctx.lineTo(-25, 3);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = '#f2f4f9';
    ctx.beginPath();
    ctx.ellipse(0, 2, 17, 13.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // wing
    ctx.fillStyle = '#d5dae6';
    ctx.beginPath();
    ctx.ellipse(-2, 3, 9.5, 7, -0.18, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.fillStyle = '#f2f4f9';
    ctx.beginPath();
    ctx.arc(12, -11, 9.6, 0, Math.PI * 2);
    ctx.fill();

    // comb
    ctx.fillStyle = '#e0574d';
    ctx.beginPath();
    ctx.arc(9, -20.5, 3.5, 0, Math.PI * 2);
    ctx.arc(13.5, -22, 4, 0, Math.PI * 2);
    ctx.arc(17.8, -19.8, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // beak
    ctx.fillStyle = '#e8a24a';
    ctx.beginPath();
    ctx.moveTo(19.5, -10.5);
    ctx.lineTo(28, -7.8);
    ctx.lineTo(19.5, -5.2);
    ctx.closePath();
    ctx.fill();

    // wattle
    ctx.fillStyle = '#e0574d';
    ctx.beginPath();
    ctx.arc(18.4, -3.8, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // eye
    ctx.strokeStyle = '#0b0e13';
    ctx.fillStyle = '#0b0e13';
    if (hurt) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(9.4, -14.6);
      ctx.lineTo(15, -9.2);
      ctx.moveTo(15, -14.6);
      ctx.lineTo(9.4, -9.2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(13.6, -11.8, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function paintBustCar(now) {
    if (!view.bust) return;
    const k = Math.min(1, (now - view.bust.start) / 380);
    const laneW = view.laneW;
    const roadLeft = view.x0 - view.camX;
    const dir = view.bust.lane % 2 === 0 ? 1 : -1;
    const x = roadLeft + (view.bust.lane - 0.5) * laneW;
    const y = view.h * 0.52 + (dir > 0 ? -1 : 1) * (1 - k) * laneW * 3.2;
    paintCar(x, y, laneW * 0.6, laneW * 1.4, '#333a4b', dir, false);
  }

  function paintFeathers() {
    for (const feather of view.feathers) {
      ctx.save();
      ctx.translate(feather.x, feather.y);
      ctx.rotate(feather.rot);
      ctx.globalAlpha = Math.max(0, feather.life);
      ctx.fillStyle = '#f2f4f9';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.2, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function draw(now) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    paintGround();
    paintTags();
    paintCars(now);
    paintBird(now);
    paintBustCar(now);
    paintFeathers();
    if (view.flash > 0.01) {
      ctx.fillStyle = 'rgba(224, 87, 77, ' + (view.flash * 0.3).toFixed(3) + ')';
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  /* --------------------------------------------------------------- motion */

  function update(dt, now) {
    const target = clampCam(probe(crossedNow()) - view.w * 0.34);
    view.camTarget = target;
    view.camX += (target - view.camX) * Math.min(1, dt / 110);

    if (view.hop && now - view.hop.start >= Math.max(1, view.hop.dur)) view.hop = null;
    if (view.bust && now - view.bust.start > 700) view.bust = null;

    if (view.flash > 0) view.flash = Math.max(0, view.flash - dt / 420);

    for (const feather of view.feathers) {
      feather.vy += 0.045 * dt * 0.06;
      feather.x += feather.vx * dt * 0.06;
      feather.y += feather.vy * dt * 0.06;
      feather.rot += feather.spin * dt * 0.002;
      feather.life -= dt * 0.0009;
    }
    if (view.feathers.length) view.feathers = view.feathers.filter((f) => f.life > 0);
  }

  function loop(now) {
    view.raf = window.requestAnimationFrame(loop);
    const busy =
      state.table.status === 'live' || view.hop || view.bust || view.feathers.length > 0 || view.flash > 0;
    // ~60fps while the road is live, ~18fps when it is only ambient. The canvas
    // is small and the draw is a few dozen paths, so this stays cheap on a
    // laptop; nothing is recomputed, only painted.
    if (now - view.last < (busy ? 16 : 55)) return;
    const dt = Math.min(64, now - view.last || 16);
    view.last = now;
    update(dt, now);
    draw(now);
  }

  function makeFeathers(lane) {
    const laneW = view.laneW;
    const x = view.x0 + (lane - 0.5) * laneW - view.camX;
    const y = view.h * 0.52;
    const out = [];
    for (let i = 0; i < 14; i++) {
      out.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 7 - 1,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 6,
        life: 1,
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------- sound */

  let audio = null;
  function audioContext() {
    if (audio) {
      if (audio.state === 'suspended') audio.resume();
      return audio;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      audio = new Ctor();
    } catch (err) {
      return null;
    }
    return audio;
  }

  function tone(freq, duration, type, gain, slideTo) {
    const ac = audioContext();
    if (!ac) return;
    const start = ac.currentTime;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function sfx(kind) {
    if (state.muted) return;
    if (kind === 'hop') tone(430 + Math.random() * 60, 0.07, 'square', 0.035);
    else if (kind === 'cash') {
      tone(660, 0.1, 'triangle', 0.05);
      window.setTimeout(() => tone(990, 0.16, 'triangle', 0.045), 90);
    } else if (kind === 'bust') {
      tone(180, 0.3, 'sawtooth', 0.055, 58);
      window.setTimeout(() => tone(120, 0.22, 'square', 0.03, 60), 40);
    }
  }

  /* ---------------------------------------------------------------- panel */

  function buildRoads() {
    els.roads.innerHTML = Core.DIFFICULTIES.map(function (d) {
      const clear = Core.clearSteps(d.id);
      const max = Core.multiplier(d.id, clear);
      return (
        '<button class="road" type="button" role="radio" data-road="' +
        d.id +
        '" aria-checked="false">' +
        '<span class="road-name">' +
        d.name +
        '</span>' +
        '<span class="road-sub">' +
        clear +
        ' lanes</span>' +
        '<span class="road-max">' +
        shortMult(max) +
        '\u00d7</span>' +
        '</button>'
      );
    }).join('');
  }

  function renderOdds() {
    const t = state.table;
    const rows = Core.ladder(t.difficultyId);
    if (state.oddsFor !== t.difficultyId) {
      state.oddsFor = t.difficultyId;
      els.oddsBody.innerHTML = rows
        .map(function (row) {
          return (
            '<tr data-step="' +
            row.step +
            '"><td>' +
            row.step +
            '</td><td>' +
            Core.formatMultiplier(row.multiplier) +
            '\u00d7</td><td class="dim">' +
            Core.formatPercent(row.survive) +
            '</td><td class="dim">' +
            Core.formatPercent(row.odds, 0) +
            '</td></tr>'
          );
        })
        .join('');
      state.oddsRows = els.oddsBody.querySelectorAll('tr');
      els.oddsSummary.textContent = rows.length + ' lanes · max ' + shortMult(rows[rows.length - 1].multiplier) + '\u00d7';
    }
    const at = t.round ? t.round.crossed : 0;
    for (const row of state.oddsRows) {
      row.classList.toggle('now', Number(row.dataset.step) === at);
    }
  }

  function render() {
    const t = state.table;
    const d = t.difficulty;
    const live = t.status === 'live';
    const crossed = crossedNow();
    const clear = t.clearSteps;

    els.points.textContent = Core.formatPoints(t.balance);
    els.sbPoints.textContent = Core.formatPoints(t.balance);
    els.sbRoad.textContent = d.name;
    els.roadNo.textContent = '#' + (t.nonce + 1);

    if (document.activeElement !== els.bet) els.bet.value = String(t.bet);
    els.betNote.textContent = t.bet > t.balance ? 'more than you hold' : '';

    for (const btn of els.roads.children) {
      const on = btn.dataset.road === t.difficultyId;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    }

    els.roadNote.innerHTML =
      '<b>' +
      d.name +
      '</b> · ' +
      clear +
      ' lanes · first ' +
      Core.formatPercent(Core.stepOdds(t.difficultyId, 1), 0) +
      ' safe · last ' +
      Core.formatPercent(Core.stepOdds(t.difficultyId, clear), 0) +
      ' safe';

    els.cross.disabled = !live && !t.canPlace();
    if (live) {
      els.cross.textContent = 'Cross ▸ ' + shortMult(Core.multiplier(t.difficultyId, crossed + 1)) + '\u00d7';
    } else {
      els.cross.textContent = 'Cross';
    }

    els.cash.disabled = !live;
    els.cash.dataset.live = live ? '1' : '0';
    els.cash.textContent = live ? 'Cash out · ' + Core.formatPoints(t.currentPayout()) : 'Cash out';

    els.sbMult.textContent = live
      ? Core.formatMultiplier(t.round.multiplier) + '\u00d7'
      : state.lastMult
        ? Core.formatMultiplier(state.lastMult) + '\u00d7'
        : '\u2014';
    els.sbNext.textContent =
      Core.formatPercent(Core.stepOdds(t.difficultyId, live ? Math.min(crossed + 1, clear) : 1), 0) +
      ' safe';
    els.sbCrossed.textContent = crossed + ' / ' + clear;

    els.hint.classList.toggle('gone', t.nonce > 0);

    // Fairness
    const seed = t.serverSeed;
    els.factSeed.textContent = seed.slice(0, 12) + '…';
    els.factSeed.title = seed;
    els.factHash.textContent = t.serverSeedHash.slice(0, 16) + '…';
    els.factHash.title = t.serverSeedHash;
    els.factNonce.textContent = String(t.round ? t.round.nonce : t.nonce);
    if (els.clientSeed.value !== t.clientSeed) els.clientSeed.value = t.clientSeed;
    if (t.round) {
      const reveal = t.reveal();
      els.factRoad.textContent = reveal.hazardLanes.length
        ? 'cars in lanes ' + reveal.hazardLanes.join(', ')
        : 'no cars at all';
      els.factRoad.title = 'Rebuild with ' + reveal.material;
    } else {
      els.factRoad.textContent = 'no round yet';
      els.factRoad.title = '';
    }

    // Session
    const s = t.stats;
    els.statRounds.textContent = String(s.rounds);
    els.statBusts.textContent = String(s.busts);
    els.statCashes.textContent = String(s.cashes);
    els.statStaked.textContent = Core.formatPoints(s.staked);
    els.statReturned.textContent = Core.formatPoints(s.returned);
    const net = s.returned - s.staked;
    els.statNet.textContent = (net > 0 ? '+' : '') + Core.formatPoints(net);
    els.statNet.style.color = net > 0 ? 'var(--text)' : net < 0 ? 'var(--muted)' : '';
    els.statBest.textContent = s.bestMultiplier
      ? Core.formatMultiplier(s.bestMultiplier) + '\u00d7 · ' + Core.formatPoints(s.bestPayout)
      : '\u2014';

    renderOdds();
  }

  /* --------------------------------------------------------------- result */

  function openResult(res, kind) {
    const t = state.table;
    const reveal = res.revealed || t.reveal() || { hazardLanes: [] };
    const cars = reveal.hazardLanes.length
      ? 'Cars this road: lane ' + reveal.hazardLanes.join(', ') + '.'
      : 'That road had no car at all.';

    els.card.classList.toggle('lost', kind === 'bust');
    els.card.classList.toggle('won', kind !== 'bust');

    if (kind === 'bust') {
      const reached = Core.multiplier(t.difficultyId, Math.max(0, res.crossed - 1));
      els.rKicker.textContent = 'Roasted';
      els.rMult.textContent = Core.formatMultiplier(reached) + '\u00d7';
      els.rLine.textContent = '\u2212' + Core.formatPoints(t.round.bet) + ' points';
      els.rNote.textContent = 'Hit in lane ' + res.crossed + '. ' + cars;
    } else if (kind === 'auto') {
      els.rKicker.textContent = 'Far kerb';
      els.rMult.textContent = Core.formatMultiplier(res.multiplier) + '\u00d7';
      els.rLine.textContent =
        '+' + Core.formatPoints(res.payout - t.round.bet) + ' points, all ' + t.clearSteps + ' lanes clear';
      els.rNote.textContent = cars;
    } else {
      els.rKicker.textContent = 'Cashed out';
      els.rMult.textContent = Core.formatMultiplier(res.multiplier) + '\u00d7';
      els.rLine.textContent = '+' + Core.formatPoints(res.payout - t.round.bet) + ' points';
      els.rNote.textContent = 'After ' + res.crossed + ' of ' + t.clearSteps + ' lanes. ' + cars;
    }

    els.result.hidden = false;
    els.again.focus({ preventScroll: true });
  }

  function closeResult() {
    els.result.hidden = true;
  }

  /* --------------------------------------------------------------- actions */

  function doCross() {
    const t = state.table;
    closeResult();
    if (t.status !== 'live') {
      if (!t.place().ok) {
        els.betNote.textContent = 'more than you hold';
        return;
      }
    }
    const res = t.cross();
    if (!res.ok) return;

    if (res.safe) {
      view.hop = {
        from: res.crossed - 1,
        to: res.crossed,
        start: performance.now(),
        dur: reduceMotion() ? 1 : 240,
      };
      sfx('hop');
      if (res.auto) {
        state.lastMult = res.multiplier;
        sfx('cash');
        const delay = reduceMotion() ? 0 : 300;
        window.setTimeout(function () {
          openResult(res, 'auto');
        }, delay);
      }
    } else {
      state.lastMult = Core.multiplier(t.difficultyId, Math.max(0, res.crossed - 1));
      view.flash = 1;
      view.bust = { lane: res.crossed, start: performance.now() };
      view.feathers = makeFeathers(res.crossed);
      sfx('bust');
      const delay = reduceMotion() ? 0 : 640;
      window.setTimeout(function () {
        openResult(res, 'bust');
      }, delay);
    }

    writeStore();
    render();
  }

  function doCash() {
    const t = state.table;
    if (t.status !== 'live') return;
    const res = t.cashOut();
    if (!res.ok) return;
    state.lastMult = res.multiplier;
    sfx('cash');
    openResult(res, 'cash');
    writeStore();
    render();
  }

  function nudgeBet() {
    const t = state.table;
    if (t.bet > t.balance) {
      els.betNote.textContent = 'more than you hold';
      els.bet.focus({ preventScroll: true });
    }
  }

  /* ---------------------------------------------------------------- wiring */

  buildRoads();
  els.mute.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
  els.mute.textContent = state.muted ? '∅' : '♪';
  els.mute.setAttribute('aria-label', state.muted ? 'Sound off' : 'Sound on');

  els.bet.addEventListener('input', function () {
    state.table.setBet(els.bet.value);
    render();
    writeStore();
  });

  els.betHalf.addEventListener('click', function () {
    state.table.setBet(Math.max(Core.MIN_BET, Math.floor(state.table.bet / 2)));
    render();
    writeStore();
  });

  els.betDouble.addEventListener('click', function () {
    state.table.setBet(state.table.bet * 2);
    render();
    writeStore();
  });

  for (const chip of els.chips) {
    chip.addEventListener('click', function () {
      const raw = chip.dataset.bet;
      state.table.setBet(raw === 'max' ? Math.min(state.table.balance, Core.MAX_BET) : Number(raw));
      render();
      writeStore();
    });
  }

  els.topup.addEventListener('click', function () {
    state.table.topUp();
    render();
    writeStore();
  });

  els.roads.addEventListener('click', function (event) {
    const button = event.target.closest('[data-road]');
    if (!button) return;
    if (state.table.status === 'live') return;
    state.table.setDifficulty(button.dataset.road);
    carCache.clear();
    resize();
    render();
    writeStore();
  });

  els.roads.addEventListener('keydown', function (event) {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (keys.indexOf(event.key) === -1) return;
    event.preventDefault();
    const ids = Core.DIFFICULTIES.map(function (d) {
      return d.id;
    });
    const at = ids.indexOf(state.table.difficultyId);
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextId = ids[(at + step + ids.length) % ids.length];
    state.table.setDifficulty(nextId);
    carCache.clear();
    resize();
    render();
    writeStore();
    const nextButton = els.roads.querySelector('[data-road="' + nextId + '"]');
    if (nextButton) nextButton.focus();
  });

  els.cross.addEventListener('click', doCross);
  els.cash.addEventListener('click', doCash);
  els.again.addEventListener('click', doCross);
  els.dismiss.addEventListener('click', closeResult);

  els.clientSeed.addEventListener('change', function () {
    const value = els.clientSeed.value.trim() || 'chicken-lane';
    state.table.clientSeed = value;
    writeStore();
    render();
  });

  els.mute.addEventListener('click', function () {
    state.muted = !state.muted;
    els.mute.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    els.mute.setAttribute('aria-label', state.muted ? 'Sound off' : 'Sound on');
    els.mute.textContent = state.muted ? '∅' : '♪';
    writeStore();
  });

  document.addEventListener('keydown', function (event) {
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SUMMARY') return;
    if (event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault();
      doCross();
    } else if (event.key === 'c' || event.key === 'C') {
      event.preventDefault();
      doCash();
    } else if (event.key === 'Escape') {
      closeResult();
    }
  });

  if (window.ResizeObserver) new ResizeObserver(resize).observe(els.wrap);
  else window.addEventListener('resize', resize);

  resize();
  render();
  nudgeBet();
  view.raf = window.requestAnimationFrame(loop);

  /* A seam for the browser checks in tools/, so a check can drive the real game
     instead of guessing at timings. */
  window.ChickenLane = {
    cross: doCross,
    cash: doCash,
    table: function () {
      return state.table;
    },
    setBet: function (value) {
      state.table.setBet(value);
      render();
    },
    setRoad: function (id) {
      state.table.setDifficulty(id);
      carCache.clear();
      resize();
      render();
    },
    state: function () {
      const t = state.table;
      return {
        status: t.status,
        balance: t.balance,
        bet: t.bet,
        road: t.difficultyId,
        crossed: t.round ? t.round.crossed : 0,
        multiplier: t.round ? t.round.multiplier : 0,
        payout: t.round ? t.round.payout : 0,
        overlay: !els.result.hidden,
        cars: t.round ? t.round.road.filter(Boolean).length : 0,
      };
    },
  };
})();
