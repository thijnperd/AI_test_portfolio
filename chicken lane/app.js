/* app.js — the browser half of Chicken Lane.
 *
 * Everything here is presentation and input. The rules, the odds and the
 * randomness live in core.js, which knows nothing about a DOM; the pixels live in
 * art.js, which knows nothing about the game.
 *
 * FEEL NOTES (kept here because they are tuning, not rules):
 *  - a hop is ~310 ms: 60 ms crouch with squash, 180 ms arc with stretch, 70 ms
 *    landing squash and a puff of dust. Input is never blocked by it.
 *  - a crash gets 70 ms of hit-stop before the bird moves, then a 450 ms tumble.
 *  - screen shake uses a trauma value that decays: shake = trauma^2, so small
 *    events stay subtle and big ones read big without a jolt.
 *  - the hop note climbs a pentatonic scale with the lane number, so a long run
 *    becomes a melody rather than the same blip.
 * None of that changes an outcome: the road is already fixed when you click.
 */
(function () {
  'use strict';

  const Core = window.CluckCore;
  const Art = window.Art;
  const STORE = 'chicken-lane-v1';
  const SESSION_GOAL = 10;
  const R = Math.round;
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduceMotion = () => !!(motionQuery && motionQuery.matches);
  const params = new URLSearchParams(window.location.search);
  const forceCodeArt = params.get('art') === 'code';

  /* Bumped whenever a round ends or a new one starts, so a result card that is
     still on a timer cannot appear over the round that replaced it. */
  let resultToken = 0;

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
    birds: $('birds'),
    birdName: $('bird-name'),
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
    statGoal: $('stat-goal'),
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
    rNext: $('result-next'),
    rNote: $('result-note'),
    card: document.querySelector('.card'),
    again: $('again'),
    dismiss: $('dismiss'),
    mute: $('mute'),
  };

  /* --------------------------------------------------------------- storage */

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
    bird: typeof saved.bird === 'string' ? saved.bird : 'rooster',
    best: saved.best && typeof saved.best === 'object' ? saved.best : {},
    lastMult: 0,
    oddsFor: null,
    oddsRows: [],
    roundsThisSession: 0,
  };

  function bestFor(id) {
    const value = state.best[id];
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function recordBest(id, multiplier) {
    if (!(multiplier > 0)) return false;
    if (multiplier > bestFor(id) + 0.004) {
      state.best[id] = multiplier;
      return true;
    }
    return false;
  }

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
          bird: state.bird,
          best: state.best,
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
    trauma: 0,
    flash: 0,
    feathers: [],
    coins: [],
    pointsShown: 0,
    last: 0,
    raf: 0,
  };

  const ctx = els.canvas.getContext('2d');
  const lanes = () => state.table.clearSteps;
  const crossedNow = () => (state.table.round ? state.table.round.crossed : 0);
  const probe = (crossed) => view.x0 + (crossed - 0.5) * view.laneW;

  function clampCam(target) {
    const min = -view.laneW * 0.7;
    const max = Math.max(min, view.worldW - view.w + view.laneW * 0.5);
    return Math.min(max, Math.max(min, target));
  }

  function birdHeight() {
    return Math.max(30, Math.min(104, view.laneW * 0.95));
  }

  function resize() {
    const rect = els.wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = Math.max(300, R(rect.width));
    view.h = Math.max(220, R(rect.height));
    view.dpr = dpr;
    els.canvas.width = R(view.w * dpr);
    els.canvas.height = R(view.h * dpr);
    els.canvas.style.width = view.w + 'px';
    els.canvas.style.height = view.h + 'px';
    // About five and a half lanes on screen: chunky sprites, and you can still
    // see what the next three steps pay.
    view.laneW = Math.max(40, Math.min(104, R(view.w / 5.8)));
    view.x0 = R(view.laneW * 1.15);
    view.worldW = view.x0 + lanes() * view.laneW + view.laneW * 1.9;
    view.camTarget = clampCam(probe(crossedNow()) - view.w * 0.34);
    view.camX = view.camTarget;
    ctx.imageSmoothingEnabled = false;
    draw(performance.now());
  }

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
    easy: { cars: 1, speed: 0.85 },
    medium: { cars: 2, speed: 1.0 },
    hard: { cars: 2, speed: 1.2 },
    daredevil: { cars: 3, speed: 1.5 },
  };

  const carCache = new Map();
  function laneTraffic(lane, difficultyId) {
    const key = difficultyId + ':' + lane;
    if (carCache.has(key)) return carCache.get(key);
    const mode = TRAFFIC[difficultyId] || TRAFFIC.medium;
    const rnd = mulberry32(lane * 2654435761 + 12345);
    const cars = [];
    for (let i = 0; i < mode.cars; i++) {
      cars.push({
        offset: rnd(),
        speed: (0.07 + rnd() * 0.09) * mode.speed,
        dir: lane % 2 === 0 ? 1 : -1,
        tone: Art.CAR_TONES[Math.floor(rnd() * Art.CAR_TONES.length)],
        truck: rnd() > 0.7,
      });
    }
    carCache.set(key, cars);
    return cars;
  }

  /* ------------------------------------------------------------- drawing */

  const MONO = '"SF Mono", "Cascadia Code", Consolas, "JetBrains Mono", Menlo, monospace';
  const ACCENT = '#7aa2ff';

  function shortMult(value) {
    if (!isFinite(value)) return '\u2014';
    if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e4) return (value / 1000).toFixed(1) + 'k';
    if (value >= 1000) return (value / 1000).toFixed(1).replace('.0', '') + 'k';
    if (value >= 100) return value.toFixed(0);
    return value.toFixed(2);
  }

  function paintGround() {
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
      ctx.fillRect(R(x), 0, laneW + 1, view.h);
    }

    // Kerbs, hatched so they read as pavement rather than more road.
    const hatched = (from, to) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(from, 0, to - from, view.h);
      ctx.clip();
      ctx.fillStyle = '#1b1f27';
      ctx.fillRect(from, 0, to - from, view.h);
      ctx.strokeStyle = '#222834';
      ctx.lineWidth = 1;
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
      ctx.moveTo(R(x) + 0.5, -10);
      ctx.lineTo(R(x) + 0.5, view.h + 10);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Solid edges of the carriageway.
    ctx.strokeStyle = '#4a5163';
    ctx.lineWidth = 2;
    for (const x of [roadLeft, roadRight]) {
      if (x < -6 || x > view.w + 6) continue;
      ctx.beginPath();
      ctx.moveTo(R(x) + 0.5, 0);
      ctx.lineTo(R(x) + 0.5, view.h);
      ctx.stroke();
    }

    // Far kerb: chequered strip, the golden egg, and a lantern at either end.
    if (roadRight > -laneW && roadRight < view.w + laneW * 2) {
      const sq = Math.max(8, R(laneW * 0.2));
      for (let y = 0, row = 0; y < view.h; y += sq, row++) {
        ctx.fillStyle = row % 2 ? '#e8eaf0' : '#2c313d';
        ctx.fillRect(R(roadRight + 4), y, sq, sq);
        ctx.fillStyle = row % 2 ? '#2c313d' : '#e8eaf0';
        ctx.fillRect(R(roadRight + 4 + sq), y, sq, sq);
      }
      const eggX = roadRight + laneW * 1.05;
      const eggY = view.h * 0.5;
      const r = Math.max(9, laneW * 0.2);
      ctx.save();
      ctx.translate(R(eggX), R(eggY));
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

  }

  function paintLanterns(now) {
    if (!Art.hasLantern()) return;
    const laneW = view.laneW;
    const roadRight = view.x0 + lanes() * laneW - view.camX;
    const roadLeft = view.x0 - view.camX;
    const frame = Math.floor(now / 180);
    const size = Math.max(14, laneW * 0.42);
    const spots = [
      [roadLeft - laneW * 0.42, view.h * 0.16],
      [roadLeft - laneW * 0.42, view.h * 0.84],
      [roadRight + laneW * 1.05, view.h * 0.16],
      [roadRight + laneW * 1.05, view.h * 0.84],
    ];
    for (const spot of spots) {
      if (spot[0] < -size || spot[0] > view.w + size) continue;
      Art.lantern(ctx, spot[0], spot[1], size, frame + (spot[1] > view.h * 0.5 ? 2 : 0));
    }
  }

  function paintTags() {
    const t = state.table;
    const laneW = view.laneW;
    const roadLeft = view.x0 - view.camX;
    const crossed = crossedNow();
    const live = t.status === 'live';
    const best = bestFor(t.difficultyId);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // The lane you are about to step into, tinted end to end.
    if (live && crossed < lanes()) {
      const x = roadLeft + crossed * laneW;
      ctx.fillStyle = 'rgba(122, 162, 255, 0.10)';
      ctx.fillRect(R(x), 0, laneW, view.h);
    }

    // A payout gutter along the bottom, drawn over the traffic so a car can
    // never hide what a lane pays. This is the one piece of chrome on the stage.
    const bandTop = view.h - 34;
    ctx.fillStyle = 'rgba(9, 10, 14, 0.68)';
    ctx.fillRect(0, bandTop, view.w, 34);
    ctx.fillStyle = 'rgba(38, 42, 52, 0.95)';
    ctx.fillRect(0, bandTop, view.w, 1);

    const tagY = bandTop + 17;

    // Your own best cash-out, marked on the road as a target, never as a tease.
    if (best > 0) {
      let bestLane = 0;
      for (let i = 1; i <= lanes(); i++) {
        if (Core.multiplier(t.difficultyId, i) <= best + 0.004) bestLane = i;
      }
      if (bestLane > 0) {
        const bx = roadLeft + bestLane * laneW;
        if (bx > -20 && bx < view.w + 20) {
          ctx.save();
          ctx.strokeStyle = 'rgba(122, 162, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(R(bx) + 0.5, 8);
          ctx.lineTo(R(bx) + 0.5, bandTop);
          ctx.stroke();
          ctx.restore();
          ctx.font = '600 9px ' + MONO;
          ctx.fillStyle = 'rgba(122, 162, 255, 0.8)';
          ctx.fillText('BEST', R(bx) - 12, 14);
        }
      }
    }

    for (let i = 1; i <= lanes(); i++) {
      const x = roadLeft + (i - 0.5) * laneW;
      // Keep clear of the mute button in the bottom-right corner.
      if (x < 22 || x > view.w - 40) continue;
      const next = live && i === crossed + 1;
      const mult = Core.multiplier(t.difficultyId, i);

      if (next) {
        ctx.fillStyle = 'rgba(122, 162, 255, 0.75)';
        ctx.beginPath();
        ctx.moveTo(R(x) - 5, bandTop - 12);
        ctx.lineTo(R(x) + 5, bandTop - 12);
        ctx.lineTo(R(x), bandTop - 4);
        ctx.closePath();
        ctx.fill();
      }

      ctx.font = '600 ' + (next ? 11 : 10) + 'px ' + MONO;
      ctx.fillStyle = next ? '#8db0ff' : '#565d70';
      ctx.fillText(shortMult(mult) + '\u00d7', R(x), R(tagY));
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
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
        const length = (car.truck ? 1.25 : 0.92) * laneW;
        Art.car(ctx, x, cy, laneW * 0.34, length, car.tone, car.dir, car.truck);
      }
    }
  }

  function paintBird(now) {
    const laneW = view.laneW;
    const roadLeft = view.x0 - view.camX;
    const crossed = crossedNow();
    const height = birdHeight();

    let x = roadLeft + (crossed - 0.5) * laneW;
    let y = view.h * 0.52;
    let lift = 0;
    let squashX = 1;
    let squashY = 1;
    let rot = 0;

    if (!reduceMotion()) y += Math.sin(now / 430) * 1.6;

    if (view.hop) {
      const hop = view.hop;
      const t = now - hop.start;
      const crouch = reduceMotion() ? 1 : 60;
      const jump = reduceMotion() ? 1 : 180;
      const land = reduceMotion() ? 0 : 70;
      const fromX = roadLeft + (hop.from - 0.5) * laneW;
      const toX = roadLeft + (hop.to - 0.5) * laneW;

      if (t < crouch) {
        const c = t / crouch;
        squashY = 1 - 0.2 * c;
        squashX = 1 + 0.16 * c;
        x = fromX;
      } else if (t < crouch + jump) {
        const k = (t - crouch) / jump;
        const ease = 1 - Math.pow(1 - k, 3);
        x = fromX + (toX - fromX) * ease;
        lift = Math.sin(Math.PI * k) * laneW * 0.55;
        const stretch = Math.sin(Math.PI * k);
        squashY = 1 + 0.16 * stretch;
        squashX = 1 - 0.12 * stretch;
      } else {
        const k = Math.min(1, Math.max(0, (t - crouch - jump) / Math.max(1, land)));
        x = toX;
        squashY = 0.8 + 0.2 * k;
        squashX = 1.18 - 0.18 * k;
      }
    }

    if (view.bust) {
      const bust = view.bust;
      const stop = reduceMotion() ? 0 : 70;
      const k = Math.min(1, Math.max(0, (now - bust.start - stop) / 450));
      const dir = bust.lane % 2 === 0 ? 1 : -1;
      x += Math.sin(k * Math.PI) * 24 * dir;
      y -= Math.sin(k * Math.PI) * 18;
      lift += k * 6;
      rot = k * 2.2 * dir;
      squashX = 1 + k * 0.14;
      squashY = 1 - k * 0.14;
    }

    // A shadow that stays on the asphalt while the bird is in the air.
    const shadeW = Math.max(6, R(height * (0.46 - Math.min(0.22, lift / (view.laneW * 3)))));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fillRect(R(x - shadeW / 2), R(y + 2), shadeW, 2);

    Art.bird(ctx, state.bird, x, y - lift, height, {
      squashX: squashX,
      squashY: squashY,
      rot: rot,
    });
  }

  function paintBustCar(now) {
    if (!view.bust) return;
    const stop = reduceMotion() ? 0 : 70;
    const k = Math.min(1, Math.max(0, (now - view.bust.start - stop) / 300));
    const laneW = view.laneW;
    const roadLeft = view.x0 - view.camX;
    const dir = view.bust.lane % 2 === 0 ? 1 : -1;
    const x = roadLeft + (view.bust.lane - 0.5) * laneW;
    const y = view.h * 0.52 + (dir > 0 ? -1 : 1) * (1 - k) * laneW * 2.6;
    Art.car(ctx, x, y, laneW * 0.44, laneW * 1.05, '#3a4054', dir, false);
  }

  function paintParticles() {
    for (const feather of view.feathers) {
      Art.feather(ctx, feather.x, feather.y, feather.size, feather.life, feather.rot);
    }
    for (const coin of view.coins) {
      Art.coin(ctx, coin.x, coin.y, coin.size, { rot: coin.rot, alpha: coin.life, pile: coin.pile });
    }
  }

  function draw(now) {
    const shake = view.trauma * view.trauma;
    const ox = shake > 0.001 ? R((Math.random() * 2 - 1) * 5 * shake) : 0;
    const oy = shake > 0.001 ? R((Math.random() * 2 - 1) * 4 * shake) : 0;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, R(ox * view.dpr), R(oy * view.dpr));
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(-8, -8, view.w + 16, view.h + 16);
    paintGround();
    paintLanterns(now);
    paintCars(now);
    paintTags();
    paintBird(now);
    paintBustCar(now);
    paintParticles();
    if (view.flash > 0.01) {
      ctx.fillStyle = 'rgba(224, 87, 77, ' + (view.flash * 0.3).toFixed(3) + ')';
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  /* --------------------------------------------------------------- motion */

  function spawnDust(lane) {
    if (reduceMotion()) return;
    const laneW = view.laneW;
    const x = view.x0 + (lane - 0.5) * laneW - view.camX;
    const y = view.h * 0.52;
    for (let i = 0; i < 4; i++) {
      view.feathers.push({
        x: x + (i - 1.5) * 6,
        y: y - 2,
        vx: (i - 1.5) * 0.35,
        vy: -0.4 - Math.random() * 0.5,
        size: 1,
        rot: 0,
        spin: 0,
        life: 1,
        dust: true,
      });
    }
  }

  function spawnFeathers(lane) {
    const laneW = view.laneW;
    const x = view.x0 + (lane - 0.5) * laneW - view.camX;
    const y = view.h * 0.52;
    for (let i = 0; i < 14; i++) {
      view.feathers.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 0.55,
        vy: -Math.random() * 0.9 - 0.15,
        size: 2,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.006,
        life: 1,
        dust: false,
      });
    }
  }

  function spawnCoins(lane, big) {
    const laneW = view.laneW;
    const x = view.x0 + (lane - 0.5) * laneW - view.camX;
    const y = view.h * 0.52 - birdHeight() * 0.6;
    const count = big ? 12 : 7;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      view.coins.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * (0.5 + Math.random() * 0.5),
        vy: Math.sin(angle) * (0.5 + Math.random() * 0.4) - 0.7,
        rot: 0,
        spin: (Math.random() - 0.5) * 0.004,
        life: 1,
        size: Math.max(10, laneW * 0.3),
        pile: big && i % 3 === 0,
      });
    }
  }

  function update(dt, now) {
    const target = clampCam(probe(crossedNow()) - view.w * 0.34);
    view.camTarget = target;
    view.camX += (target - view.camX) * Math.min(1, dt / 110);

    if (view.hop) {
      const hop = view.hop;
      const total = (reduceMotion() ? 2 : 60 + 180) + 4;
      if (!hop.landed && now - hop.start >= total) {
        hop.landed = true;
        spawnDust(hop.to);
      }
      if (now - hop.start >= total + (reduceMotion() ? 0 : 80)) view.hop = null;
    }
    if (view.bust && now - view.bust.start > 760) view.bust = null;

    view.trauma = Math.max(0, view.trauma - dt / 380);
    if (view.flash > 0) view.flash = Math.max(0, view.flash - dt / 420);

    for (const p of view.feathers) {
      p.vy += (p.dust ? 0.01 : 0.02) * dt * 0.06;
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.rot += p.spin * dt;
      p.life -= dt * (p.dust ? 0.0028 : 0.0011);
    }
    if (view.feathers.length) view.feathers = view.feathers.filter((p) => p.life > 0);

    for (const c of view.coins) {
      c.vy += 0.028 * dt * 0.06;
      c.x += c.vx * dt * 0.06;
      c.y += c.vy * dt * 0.06;
      c.rot += c.spin * dt;
      c.life -= dt * 0.0011;
    }
    if (view.coins.length) view.coins = view.coins.filter((c) => c.life > 0);

    // The points counter counts up rather than snapping: cheap, and it makes a
    // cash-out feel like it landed.
    const real = state.table.balance;
    if (view.pointsShown !== real) {
      const gap = real - view.pointsShown;
      if (Math.abs(gap) < 0.8) view.pointsShown = real;
      else view.pointsShown += gap * Math.min(1, dt / 130);
      const shown = Core.formatPoints(view.pointsShown);
      if (els.points.textContent !== shown) els.points.textContent = shown;
      if (els.sbPoints.textContent !== shown) els.sbPoints.textContent = shown;
    }
  }

  function loop(now) {
    view.raf = window.requestAnimationFrame(loop);
    const busy =
      state.table.status === 'live' ||
      view.hop ||
      view.bust ||
      view.feathers.length > 0 ||
      view.coins.length > 0 ||
      view.trauma > 0 ||
      view.flash > 0 ||
      view.pointsShown !== state.table.balance;
    // ~60fps while the road is live, ~18fps when it is only ambient. The canvas
    // is small and the draw is a few dozen rects and sprites.
    if (now - view.last < (busy ? 16 : 55)) return;
    const dt = Math.min(64, now - view.last || 16);
    view.last = now;
    update(dt, now);
    draw(now);
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

  /* A pentatonic run: each lane is one step up, so a long crossing is a melody. */
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function hopNote(lane) {
    const step = SCALE[Math.min(SCALE.length - 1, Math.max(0, lane - 1))];
    return 330 * Math.pow(2, step / 12);
  }

  function sfx(kind, value) {
    if (state.muted) return;
    if (kind === 'hop') tone(hopNote(value || 1), 0.075, 'square', 0.03);
    else if (kind === 'land') tone(180, 0.05, 'sine', 0.02);
    else if (kind === 'cash') {
      tone(660, 0.09, 'triangle', 0.05);
      window.setTimeout(function () {
        tone(990, 0.14, 'triangle', 0.045);
      }, 85);
    } else if (kind === 'best') {
      window.setTimeout(function () {
        tone(1320, 0.16, 'triangle', 0.04);
      }, 200);
    } else if (kind === 'bust') {
      tone(180, 0.3, 'sawtooth', 0.05, 58);
      window.setTimeout(function () {
        tone(110, 0.22, 'square', 0.028, 55);
      }, 55);
    }
  }

  /* ---------------------------------------------------------------- panel */

  function buildRoads() {
    els.roads.innerHTML = Core.DIFFICULTIES.map(function (d) {
      const clear = Core.clearSteps(d.id);
      const max = Core.multiplier(d.id, clear);
      const best = bestFor(d.id);
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
        '\u00d7' +
        (best ? ' \u00b7 pb ' + shortMult(best) : '') +
        '</span>' +
        '</button>'
      );
    }).join('');
  }

  function buildBirds() {
    if (!els.birds) return;
    els.birds.innerHTML = '';
    Art.BIRDS.forEach(function (entry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bird';
      button.dataset.bird = entry.id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(entry.id === state.bird));
      button.setAttribute('aria-label', entry.label);
      button.title = entry.label;
      button.appendChild(Art.birdCanvas(entry.id, 40));
      els.birds.appendChild(button);
    });
    els.birdName.textContent = Art.birdById(state.bird).label;
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
      els.oddsSummary.textContent =
        rows.length + ' lanes \u00b7 max ' + shortMult(rows[rows.length - 1].multiplier) + '\u00d7';
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

    view.pointsShown = t.balance;
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
    if (els.birds) {
      for (const btn of els.birds.children) {
        btn.setAttribute('aria-checked', btn.dataset.bird === state.bird ? 'true' : 'false');
      }
    }

    els.roadNote.innerHTML =
      '<b>' +
      d.name +
      '</b> \u00b7 ' +
      clear +
      ' lanes \u00b7 first ' +
      Core.formatPercent(Core.stepOdds(t.difficultyId, 1), 0) +
      ' safe \u00b7 last ' +
      Core.formatPercent(Core.stepOdds(t.difficultyId, clear), 0) +
      ' safe';

    els.cross.disabled = !live && !t.canPlace();
    if (live) {
      els.cross.textContent =
        'Cross \u25b8 ' + shortMult(Core.multiplier(t.difficultyId, crossed + 1)) + '\u00d7';
    } else {
      els.cross.textContent = 'Cross';
    }

    els.cash.disabled = !live;
    els.cash.dataset.live = live ? '1' : '0';
    els.cash.textContent = live ? 'Cash out \u00b7 ' + Core.formatPoints(t.currentPayout()) : 'Cash out';

    els.sbMult.textContent = live
      ? Core.formatMultiplier(t.round.multiplier) + '\u00d7'
      : state.lastMult
        ? Core.formatMultiplier(state.lastMult) + '\u00d7'
        : '\u2014';
    els.sbNext.textContent =
      Core.formatPercent(Core.stepOdds(t.difficultyId, live ? Math.min(crossed + 1, clear) : 1), 0) + ' safe';
    els.sbCrossed.textContent = crossed + ' / ' + clear;

    els.hint.classList.toggle('gone', t.nonce > 0);

    // Fairness
    const seed = t.serverSeed;
    els.factSeed.textContent = seed.slice(0, 12) + '\u2026';
    els.factSeed.title = seed;
    els.factHash.textContent = t.serverSeedHash.slice(0, 16) + '\u2026';
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
      ? Core.formatMultiplier(s.bestMultiplier) + '\u00d7 \u00b7 ' + Core.formatPoints(s.bestPayout)
      : '\u2014';
    const done = Math.min(state.roundsThisSession, SESSION_GOAL);
    els.statGoal.textContent =
      done + ' / ' + SESSION_GOAL + ' rounds' + (done >= SESSION_GOAL ? ' \u2014 a good place to stop' : '');

    renderOdds();
  }

  /* --------------------------------------------------------------- result */

  /* A crash and its card are a pair. If a new round starts before the card has
     appeared, that card must never arrive on top of the new road. */
  function scheduleResult(res, kind, delay) {
    const token = (resultToken += 1);
    window.setTimeout(function () {
      if (token !== resultToken) return;
      openResult(res, kind);
    }, delay);
  }

  function openResult(res, kind) {
    const t = state.table;
    const reveal = res.revealed || t.reveal() || { hazardLanes: [] };
    const cars = reveal.hazardLanes.length
      ? 'Cars this road: lane ' + reveal.hazardLanes.join(', ') + '.'
      : 'That road had no car at all.';
    const best = bestFor(t.difficultyId);
    let isBest = false;

    els.card.classList.toggle('lost', kind === 'bust');
    els.card.classList.toggle('won', kind !== 'bust');

    if (kind === 'bust') {
      const reached = Core.multiplier(t.difficultyId, Math.max(0, res.crossed - 1));
      els.rKicker.textContent = 'Roasted';
      els.rMult.textContent = Core.formatMultiplier(reached) + '\u00d7';
      els.rLine.textContent = '\u2212' + Core.formatPoints(t.round.bet) + ' points';
      els.rNext.textContent = best
        ? 'Your best cash-out here is ' + Core.formatMultiplier(best) + '\u00d7.'
        : 'Nothing banked on this road yet.';
      els.rNote.textContent = 'Hit in lane ' + res.crossed + '. ' + cars;
    } else if (kind === 'auto') {
      isBest = recordBest(t.difficultyId, res.multiplier);
      els.rKicker.textContent = 'Far kerb';
      els.rMult.textContent = Core.formatMultiplier(res.multiplier) + '\u00d7';
      els.rLine.textContent =
        '+' + Core.formatPoints(res.payout - t.round.bet) + ' points, all ' + t.clearSteps + ' lanes clear';
      els.rNext.textContent = isBest ? 'New best cash-out on this road.' : '';
      els.rNote.textContent = cars;
    } else {
      isBest = recordBest(t.difficultyId, res.multiplier);
      els.rKicker.textContent = 'Cashed out';
      els.rMult.textContent = Core.formatMultiplier(res.multiplier) + '\u00d7';
      els.rLine.textContent = '+' + Core.formatPoints(res.payout - t.round.bet) + ' points';
      els.rNext.textContent = isBest
        ? 'New best cash-out on this road.'
        : best
          ? 'Your best here is ' + Core.formatMultiplier(best) + '\u00d7.'
          : '';
      els.rNote.textContent = 'After ' + res.crossed + ' of ' + t.clearSteps + ' lanes. ' + cars;
    }

    if (isBest) {
      sfx('best');
      view.trauma = Math.min(1, view.trauma + 0.12);
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
      // A fresh road carries none of the last round's wreckage: no lingering
      // red flash, no tumbling bird, no card still waiting on its timer.
      resultToken += 1;
      view.bust = null;
      view.flash = 0;
      view.feathers = [];
      view.hop = null;
    }
    const res = t.cross();
    if (!res.ok) return;

    if (res.safe) {
      view.hop = {
        from: res.crossed - 1,
        to: res.crossed,
        start: performance.now(),
        landed: false,
      };
      sfx('hop', res.crossed);
      view.trauma = Math.min(1, view.trauma + 0.03);
      if (res.auto) {
        state.lastMult = res.multiplier;
        state.roundsThisSession += 1;
        sfx('cash');
        spawnCoins(res.crossed, true);
        view.trauma = Math.min(1, view.trauma + 0.18);
        scheduleResult(res, 'auto', reduceMotion() ? 0 : 320);
      }
    } else {
      state.lastMult = Core.multiplier(t.difficultyId, Math.max(0, res.crossed - 1));
      state.roundsThisSession += 1;
      view.flash = 1;
      view.trauma = Math.min(1, view.trauma + 0.62);
      view.bust = { lane: res.crossed, start: performance.now() };
      spawnFeathers(res.crossed);
      sfx('bust');
      scheduleResult(res, 'bust', reduceMotion() ? 0 : 700);
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
    state.roundsThisSession += 1;
    sfx('cash');
    spawnCoins(res.crossed, res.multiplier >= 2);
    view.trauma = Math.min(1, view.trauma + 0.14);
    resultToken += 1; // cancel any card still pending from an earlier crash
    openResult(res, 'cash');
    writeStore();
    render();
  }

  /* ---------------------------------------------------------------- wiring */

  buildRoads();
  els.mute.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
  els.mute.textContent = state.muted ? '\u2205' : '\u266a';
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
    if (state.table.status === 'live') return;
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

  if (els.birds) {
    els.birds.addEventListener('click', function (event) {
      const button = event.target.closest('[data-bird]');
      if (!button) return;
      state.bird = button.dataset.bird;
      els.birdName.textContent = Art.birdById(state.bird).label;
      for (const btn of els.birds.children) {
        btn.setAttribute('aria-checked', btn.dataset.bird === state.bird ? 'true' : 'false');
      }
      writeStore();
      draw(performance.now());
    });
  }

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
    els.mute.textContent = state.muted ? '\u2205' : '\u266a';
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
  view.raf = window.requestAnimationFrame(loop);

  // The sprite pack is optional: if it is not on disk, art.js falls back to its
  // own pixel art and everything here behaves identically.
  Art.load({ code: forceCodeArt }).then(function () {
    buildBirds();
    render();
    draw(performance.now());
  });

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
    setBird: function (id) {
      state.bird = id;
      render();
      draw(performance.now());
    },
    usingAtlas: function () {
      return Art.usingAtlas();
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
        bird: state.bird,
        best: state.best,
        atlas: Art.usingAtlas(),
        coins: view.coins.length,
        feathers: view.feathers.length,
      };
    },
  };
})();
