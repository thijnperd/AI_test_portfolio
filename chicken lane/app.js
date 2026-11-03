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

  /* The stage is side-on: the track runs across, the bird climbs lane by lane and
     the herds charge along each lane. Side-on is the view the sprite packs are
     drawn for — their animals are profiles — and it makes traffic read at a
     glance instead of looking like dark blocks on dark tarmac. */
  const view = {
    w: 0,
    h: 0,
    dpr: 1,
    laneH: 64,
    worldH: 0,
    camY: 0,
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

  /* World coordinates: y grows downward, the far kerb is 0 and the near kerb the
     player starts from is the bottom of the world. Lane n is the far one. */
  const laneTop = (i) => (lanes() - i + 1) * view.laneH;
  const laneBottom = (i) => (lanes() - i + 2) * view.laneH;
  const feetY = (crossed) =>
    crossed <= 0
      ? (lanes() + 1.86) * view.laneH
      : laneBottom(Math.min(crossed, lanes())) - view.laneH * 0.18;
  const sy = (worldY) => R(worldY - view.camY);
  const birdX = () => R(view.w * 0.46);

  function clampCam(target) {
    const max = Math.max(0, view.worldH - view.h);
    return Math.min(max, Math.max(0, target));
  }

  function birdHeight() {
    return Math.max(26, Math.min(96, view.laneH * 0.92));
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
    // Five and a half lanes on screen: chunky animals, and you can still see
    // what the next few steps pay.
    view.laneH = Math.max(44, Math.min(112, R(view.h / 5.6)));
    view.worldH = (lanes() + 2) * view.laneH;
    view.camTarget = clampCam(feetY(crossedNow()) - view.h * 0.74);
    view.camY = view.camTarget;
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

  /* Ambient herds: which animals wander a lane, and how fast. Decoration only —
     every lane has animals whatever the road, so the herd can never hint at where
     the hidden hazards are. */
  const HERD = {
    easy: { beasts: 1, speed: 0.9 },
    medium: { beasts: 2, speed: 1.0 },
    hard: { beasts: 2, speed: 1.15 },
    daredevil: { beasts: 3, speed: 1.35 },
  };

  const herdCache = new Map();
  function laneHerd(lane, difficultyId) {
    const key = difficultyId + ':' + lane;
    if (herdCache.has(key)) return herdCache.get(key);
    const mode = HERD[difficultyId] || HERD.medium;
    const rnd = mulberry32(lane * 2654435761 + 12345);
    const beasts = [];
    for (let i = 0; i < mode.beasts; i++) {
      beasts.push({
        offset: rnd(),
        speed: (0.06 + rnd() * 0.07) * mode.speed,
        dir: lane % 2 === 0 ? 1 : -1,
        species: Art.HERDS[Math.floor(rnd() * Art.HERDS.length)].id,
      });
    }
    herdCache.set(key, beasts);
    return beasts;
  }

  /* ------------------------------------------------------------- drawing */

  const MONO = '"SF Mono", "Cascadia Code", Consolas, "JetBrains Mono", Menlo, monospace';
  const ACCENT = '#7aa2ff';
  /* Width of the payout rail down the right edge of the stage. */
  const TAG_RAIL = 50;

  function shortMult(value) {
    if (!isFinite(value)) return '\u2014';
    if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e4) return (value / 1000).toFixed(1) + 'k';
    if (value >= 1000) return (value / 1000).toFixed(1).replace('.0', '') + 'k';
    if (value >= 100) return value.toFixed(0);
    return value.toFixed(2);
  }

  function paintGround() {
    const n = lanes();
    const laneH = view.laneH;
    // 16 px tiles at a whole scale factor, so the ground stays crisp.
    const scale = Math.max(2, Math.min(5, Math.round(laneH / 16)));
    const grass = Art.ground(ctx, 'grass', scale);
    const dirt = Art.ground(ctx, 'dirt', scale);

    /* Every band is drawn twice: a flat colour, then the pack's texture over it
       at reduced strength. The tile is a pebble scatter, and at full strength
       its repeat is loud enough to read as wallpaper rather than as ground. */
    const band = (fromWorld, toWorld, fallback, fill, alpha) => {
      const top = sy(fromWorld);
      const bottom = sy(toWorld);
      if (bottom < -8 || top > view.h + 8) return;
      ctx.fillStyle = fallback;
      ctx.fillRect(0, top, view.w, bottom - top);
      if (!fill) return;
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      ctx.fillStyle = fill;
      ctx.fillRect(0, top, view.w, bottom - top);
      ctx.globalAlpha = 1;
    };

    ctx.fillStyle = '#0b0f0d';
    ctx.fillRect(0, 0, view.w, view.h);

    band(-laneH * 1.5, 0, '#20351a', grass, 0.9); // far verge, behind the finish
    band((n + 1) * laneH, (n + 3) * laneH, '#20351a', grass, 0.9); // near verge
    band(laneH, (n + 1) * laneH, '#6b4f34', dirt, 0.42); // the track

    // Alternating bands, so the track reads as lanes rather than as a field.
    for (let i = 1; i <= n; i++) {
      if (i % 2) continue;
      const top = sy(laneTop(i));
      if (top > view.h || top + laneH < 0) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.fillRect(0, top, view.w, laneH);
    }

    // Kerb lips: a hard edge, so the track reads as a surface, not a smear.
    const topEdge = sy(laneH);
    const bottomEdge = sy((n + 1) * laneH);
    ctx.fillStyle = 'rgba(9, 10, 14, 0.5)';
    if (topEdge > -6 && topEdge < view.h + 6) ctx.fillRect(0, topEdge - 3, view.w, 3);
    if (bottomEdge > -6 && bottomEdge < view.h + 6) ctx.fillRect(0, bottomEdge, view.w, 3);

    // Lane dividers, dashed the way the herds run.
    ctx.save();
    ctx.setLineDash([18, 12]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(250, 246, 232, 0.34)';
    for (let i = 1; i < n; i++) {
      const y = sy(laneBottom(i)) + 0.5;
      if (y < -12 || y > view.h + 12) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(view.w, y);
      ctx.stroke();
    }
    ctx.restore();

    // The far kerb: a chequered finish strip, with the egg waiting on the verge.
    const stripY = sy(laneH) - 9;
    if (stripY > -12 && stripY < view.h + 12) {
      const sq = 9;
      for (let x = 0, i = 0; x < view.w; x += sq, i++) {
        ctx.fillStyle = i % 2 ? '#e8eaf0' : '#2c313d';
        ctx.fillRect(x, stripY, sq, 8);
      }
    }

    // Scrub on both verges, at fixed world positions so it does not crawl.
    const scrub = Math.max(18, laneH * 0.42);
    const farBase = sy(0);
    const nearBase = sy((n + 2) * laneH);
    for (let x = 24, i = 0; x < view.w; x += 76, i++) {
      Art.prop(ctx, i % 3 === 0 ? 'flower' : i % 3 === 1 ? 'tuft' : 'rock', x, farBase - 3, scrub);
      Art.prop(ctx, i % 2 ? 'tuft' : 'rock', x + 38, nearBase, scrub);
    }

    // The far kerb's prize, drawn only while the top of the world is on screen.
    const eggY = sy(laneH * 0.5);
    if (eggY > -laneH && eggY < view.h + laneH) {
      const r = Math.max(8, laneH * 0.19);
      ctx.save();
      ctx.translate(R(view.w * 0.72), R(eggY));
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
    const laneH = view.laneH;
    const frame = Math.floor(now / 180);
    const size = Math.max(14, laneH * 0.4);
    const far = sy(laneH * 0.5);
    const near = sy((lanes() + 2) * laneH - laneH * 0.5);
    for (let x = 46; x < view.w; x += 168) {
      if (far > -size && far < view.h + size) Art.lantern(ctx, x, far, size, frame);
      if (near > -size && near < view.h + size) Art.lantern(ctx, x + 84, near, size, frame + 2);
    }
  }

  function paintTags() {
    const t = state.table;
    const n = lanes();
    const laneH = view.laneH;
    const crossed = crossedNow();
    const live = t.status === 'live';
    const best = bestFor(t.difficultyId);

    // The lane you are about to step into, tinted right across the track.
    if (live && crossed < n) {
      ctx.fillStyle = 'rgba(122, 162, 255, 0.10)';
      ctx.fillRect(0, sy(laneTop(crossed + 1)), view.w, laneH);
    }

    // Payout rail down the right edge, painted over the herds so an animal can
    // never hide what a lane pays. This is the one piece of chrome on the stage.
    ctx.fillStyle = 'rgba(9, 10, 14, 0.66)';
    ctx.fillRect(view.w - TAG_RAIL, 0, TAG_RAIL, view.h);
    ctx.fillStyle = 'rgba(38, 42, 52, 0.95)';
    ctx.fillRect(view.w - TAG_RAIL, 0, 1, view.h);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 1; i <= n; i++) {
      const mid = sy(laneTop(i) + laneH / 2);
      if (mid < -14 || mid > view.h + 14) continue;
      const next = live && i === crossed + 1;
      const mult = Core.multiplier(t.difficultyId, i);

      ctx.font = '600 ' + (next ? 12 : 10) + 'px ' + MONO;
      ctx.fillStyle = next ? '#8db0ff' : '#6a7186';
      ctx.fillText(shortMult(mult) + '\u00d7', view.w - 9, R(mid));

      if (next) {
        ctx.fillStyle = 'rgba(122, 162, 255, 0.85)';
        ctx.beginPath();
        ctx.moveTo(view.w - TAG_RAIL - 10, R(mid) - 5);
        ctx.lineTo(view.w - TAG_RAIL - 10, R(mid) + 5);
        ctx.lineTo(view.w - TAG_RAIL - 2, R(mid));
        ctx.closePath();
        ctx.fill();
      }
    }

    // Your own best cash-out, marked as a rule across the track: a target, never
    // a tease.
    if (best > 0) {
      let bestLane = 0;
      for (let i = 1; i <= n; i++) {
        if (Core.multiplier(t.difficultyId, i) <= best + 0.004) bestLane = i;
      }
      if (bestLane > 0) {
        const y = sy(laneBottom(bestLane)) + 0.5;
        if (y > -14 && y < view.h + 14) {
          ctx.save();
          ctx.setLineDash([5, 6]);
          ctx.strokeStyle = 'rgba(122, 162, 255, 0.34)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(view.w - TAG_RAIL, y);
          ctx.stroke();
          ctx.restore();
          ctx.textAlign = 'left';
          ctx.font = '600 9px ' + MONO;
          ctx.fillStyle = 'rgba(122, 162, 255, 0.8)';
          ctx.fillText('BEST', 8, R(y) - 7);
        }
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function paintHerd(now) {
    const t = state.table;
    const laneH = view.laneH;
    const seconds = now / 1000;
    const pad = laneH * 1.6;
    const size = Math.max(28, R(laneH * 0.94));

    for (let lane = 1; lane <= lanes(); lane++) {
      const base = sy(laneBottom(lane)) - laneH * 0.1;
      if (base < -laneH || base - laneH > view.h + laneH) continue;
      const beasts = laneHerd(lane, t.difficultyId);
      for (const beast of beasts) {
        const span = view.w + pad * 2;
        let travel = (beast.offset + seconds * beast.speed * beast.dir) % 1;
        if (travel < 0) travel += 1;
        Art.beast(ctx, beast.species, R(travel * span - pad), base, size, beast.dir);
      }
    }
  }

  function paintBird(now) {
    const laneH = view.laneH;
    const crossed = crossedNow();
    const height = birdHeight();

    let x = birdX();
    let y = sy(feetY(crossed));
    let lift = 0;
    let squashX = 1;
    let squashY = 1;
    let rot = 0;

    if (!reduceMotion()) y += Math.sin(now / 430) * 1.4;

    if (view.hop) {
      const hop = view.hop;
      const t = now - hop.start;
      const crouch = reduceMotion() ? 1 : 60;
      const jump = reduceMotion() ? 1 : 180;
      const land = reduceMotion() ? 0 : 70;
      const fromY = sy(feetY(hop.from));
      const toY = sy(feetY(hop.to));

      if (t < crouch) {
        const c = t / crouch;
        squashY = 1 - 0.2 * c;
        squashX = 1 + 0.16 * c;
        y = fromY;
      } else if (t < crouch + jump) {
        const k = (t - crouch) / jump;
        const ease = 1 - Math.pow(1 - k, 3);
        y = fromY + (toY - fromY) * ease;
        lift = Math.sin(Math.PI * k) * laneH * 0.55;
        const stretch = Math.sin(Math.PI * k);
        squashY = 1 + 0.16 * stretch;
        squashX = 1 - 0.12 * stretch;
      } else {
        const k = Math.min(1, Math.max(0, (t - crouch - jump) / Math.max(1, land)));
        y = toY;
        squashY = 0.8 + 0.2 * k;
        squashX = 1.18 - 0.18 * k;
      }
    }

    if (view.bust) {
      const bust = view.bust;
      const stop = reduceMotion() ? 0 : 70;
      const k = Math.min(1, Math.max(0, (now - bust.start - stop) / 450));
      const dir = bust.dir || 1;
      x += Math.sin(k * Math.PI) * 24 * dir;
      y -= Math.sin(k * Math.PI) * 18;
      lift += k * 6;
      rot = k * 2.2 * dir;
      squashX = 1 + k * 0.14;
      squashY = 1 - k * 0.14;
    }

    // A shadow that stays on the ground while the bird is in the air.
    const shadeW = Math.max(6, R(height * (0.46 - Math.min(0.22, lift / (laneH * 3)))));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fillRect(R(x - shadeW / 2), R(y + 2), shadeW, 2);

    Art.bird(ctx, state.bird, x, y - lift, height, {
      squashX: squashX,
      squashY: squashY,
      rot: rot,
    });
  }

  function paintBustBeast(now) {
    if (!view.bust) return;
    const stop = reduceMotion() ? 0 : 70;
    const k = Math.min(1, Math.max(0, (now - view.bust.start - stop) / 300));
    const laneH = view.laneH;
    const dir = view.bust.dir || 1;
    const base = sy(laneBottom(Math.min(view.bust.lane, lanes()))) - laneH * 0.1;
    const x = birdX() - dir * (1 - k) * view.w * 0.6;
    Art.beast(ctx, view.bust.species || 'cow', x, base, laneH * 1.05, dir);
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
    paintHerd(now);
    paintTags();
    paintBird(now);
    paintBustBeast(now);
    paintParticles();
    if (view.flash > 0.01) {
      ctx.fillStyle = 'rgba(224, 87, 77, ' + (view.flash * 0.3).toFixed(3) + ')';
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  /* --------------------------------------------------------------- motion */

  function spawnDust(lane) {
    if (reduceMotion()) return;
    const x = birdX();
    const y = sy(feetY(lane));
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
    const x = birdX();
    const y = sy(feetY(lane)) - birdHeight() * 0.45;
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
    const laneW = view.laneH;
    const x = birdX();
    const y = sy(feetY(lane)) - birdHeight() * 0.6;
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
    const target = clampCam(feetY(crossedNow()) - view.h * 0.74);
    view.camTarget = target;
    view.camY += (target - view.camY) * Math.min(1, dt / 110);

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
        ? 'loose in lanes ' + reveal.hazardLanes.join(', ')
        : 'nothing loose at all';
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
      ? 'Loose this road: lane ' + reveal.hazardLanes.join(', ') + '.'
      : 'That road had nothing loose in it.';
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
      const net = res.payout - t.round.bet;
      // A first lane on Easy pays exactly the stake back. Saying "+0 points"
      // reads like a bug; say what actually happened.
      els.rLine.textContent = net > 0
        ? '+' + Core.formatPoints(net) + ' points'
        : 'Stake back, nothing won';
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
      const herd = laneHerd(res.crossed, t.difficultyId);
      const culprit = herd[0] || { species: 'cow', dir: 1 };
      view.bust = {
        lane: res.crossed,
        start: performance.now(),
        species: culprit.species,
        dir: culprit.dir,
      };
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
    herdCache.clear();
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
    herdCache.clear();
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
      herdCache.clear();
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
