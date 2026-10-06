/* app.js — rendering, atmosphere, audio, and gameplay for the raycasting
 * horror game. Depends on raycast.js (the core) loading first.
 *
 * The world is raycast into a low-resolution offscreen buffer (288x162),
 * lightly dithered, then scaled up with nearest-neighbour sampling. On top of it we layer the analog-horror pass: procedural mist,
 * film grain, a sickly red tint, VHS tracking and glitch slits, camera shake —
 * all driven by `Atmosphere`, the dread value that climbs the longer you stay.
 *
 * On top of the game itself sits a metastructure: tapes are scattered through
 * the maze and pay out shards, the exit descends you to a deeper tape, and
 * shards buy kit from a shop that pauses the world. The kit is what makes the
 * later tapes survivable, which is why the shop persists across deaths.
 */
(function () {
  'use strict';

  const SCENE_W = 288;           // internal buffer — low-res, but readable
  const SCENE_H = 162;
  const DEFAULT_FOV = 1.15;      // ~66 degrees
  const MAX_DIST = 26;
  const BASE_MOVE_SPEED = 2.4;   // world units / second
  const SPRINT_MULT = 1.75;
  const TURN_SPEED = 2.4;        // radians / second
  const CATCH_DIST = 0.55;
  /* Past this range IT drops out of the frame for single beats, and never
   * resolves to a solid shape. Closer, it is always there and solid.
   *
   * Both of these have to sit inside the range the fog actually allows, or they
   * are dead code: the monster is culled past `ln(1/0.15)/density` units, which
   * is ~21m at dread 0 but only ~3.7m at dread 0.5. 7 and 4.5 are reachable
   * through the low-to-mid dread where most of a run happens. */
  const STALKER_FLICKER_DIST = 7;
  /* Inside this range you get features at all — eyes, a jaw. Research is clear
   * that withheld detail outranks rendered detail for this kind of thing. */
  const STALKER_DETAIL = 4.5;
  /* How wrong the proportions are allowed to be. */
  const MM_TILES_SMALL = 25;
  const MM_TILES_LARGE = 41;
  const REACH_DIST = 0.7;
  const SPRINT_SECONDS = 3.2;    // stamina at 1.0 buys this long of sprint
  const COLOUR_LEVELS = 8;       // per channel
  const DITHER_STRENGTH = 0.55;  // how hard the ordered dither bites (1 = full)
  const DRAG_LOOK = 0.005;       // radians of turn per pixel of drag, before prefs

  /* Player-facing options. These are the settings the genre's players expect to
   * find: FOV, look sensitivity, brightness, and independent control over every
   * source of camera motion (shake, glitch, bob) because first-person horror is
   * the genre that makes people motion-sick. */
  function fovNow() {
    return state.prefs ? state.prefs.fov : DEFAULT_FOV;
  }

  const DEFAULT_PREFS = {
    fov: DEFAULT_FOV,   // radians
    sens: 1,            // look sensitivity multiplier
    brightness: 1,     // >1 lifts the blacks, <1 crushes them
    motion: 1,          // scales shake, glitch and head bob (0 = off)
    volume: 1,
    headbob: true,
    dither: true,
    grain: true,
    mist: true,
    tint: true,
    subtitles: true,
    showFps: false,
  };

  /* ------------------------------------------------------------------ */
  /* canvases                                                           */
  /* ------------------------------------------------------------------ */

  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d');

  const scene = document.createElement('canvas');
  scene.width = SCENE_W;
  scene.height = SCENE_H;
  const sctx = scene.getContext('2d', { willReadFrequently: true });

  const mm = document.getElementById('minimap');
  const mmCtx = mm.getContext('2d');
  const MM_TILE = 6;
  let MM_TILES = MM_TILES_SMALL;  // odd so the player sits dead centre
  let MM_R = (MM_TILES - 1) / 2;
  let MM_SIZE = MM_TILES * MM_TILE;
  mm.width = MM_SIZE;
  mm.height = MM_SIZE;

  const mist = makeMist(256, 1337);
  const grain = makeGrain(256, 99);

  const el = {
    rec: document.getElementById('rec'),
    clock: document.getElementById('clock'),
    depth: document.getElementById('depth'),
    shards: document.getElementById('shards'),
    tapes: document.getElementById('tapes'),
    dreadFill: document.getElementById('dread-fill'),
    dreadLabel: document.getElementById('dread-label'),
    staminaFill: document.getElementById('stamina-fill'),
    staminaLabel: document.getElementById('stamina-label'),
    proximity: document.getElementById('proximity'),
    message: document.getElementById('message'),
    submessage: document.getElementById('submessage'),
    hint: document.getElementById('hint'),
    fps: document.getElementById('fps'),
    hiddenBadge: document.getElementById('hidden-badge'),
    menu: document.getElementById('menu'),
    menuDepth: document.getElementById('menu-depth'),
    menuBegin: document.getElementById('menu-begin'),
    admin: document.getElementById('admin'),
    adminBody: document.getElementById('admin-body'),
    adminState: document.getElementById('admin-state'),
    adminFps: document.getElementById('admin-fps'),
    heartbeat: document.getElementById('heartbeat'),
    shop: document.getElementById('shop'),
    shopList: document.getElementById('shop-list'),
    shopShards: document.getElementById('shop-shards'),
    shopNote: document.getElementById('shop-note'),
    adminNote: document.getElementById('admin-note'),
  };

  /* ------------------------------------------------------------------ */
  /* game state                                                         */
  /* ------------------------------------------------------------------ */

  const state = {
    phase: 'playing', // playing | caught | escaped | den
    depth: 1,       // which tape you are inside
    settings: null,
    level: null,
    player: null,
    stalker: null,
    atmo: null,
    tapes: [],
    explored: null,
    time: 0,        // seconds since this tape began
    keys: Object.create(null),
    dragging: false,
    lastPointerX: 0,
    whisper: -1,
    message: 0,     // seconds left on the current submessage
    flash: 0,       // white/red flash intensity
    burst: 0,        // seconds left on a full-frame static burst
    vigApplied: -1,  // last opacity written to the heartbeat layer
    // persistent across deaths and descents
    shards: 0,
    owned: [],
    effects: null,
    // per-run
    stamina: 1,
    sprinting: false,
    proximity: null,
    route: null,
    routeTo: null,
    routeCell: null,
    minimapTiles: MM_TILES_SMALL,
    shopOpen: false,
    shopBuilt: false,
    // options + test-console switches
    prefs: null,           // filled from DEFAULT_PREFS at boot
    moving: false,         // gates the head bob
    hiding: false,         // currently buying dread relief
    menuOpen: true,        // boot into the main menu
    adminOpen: false,
    freezeDread: false,    // console: stop the ramp advancing
    dreadOverride: null,   // console: pin dread to a value
    noClip: false,         // console: walk through walls
    freezeStalker: false,  // console: stop it moving
    stalkerSpeedMul: 1,
    levelOverride: null,   // console: force the dither level count
    fps: 0,
    fpsFrames: 0,
    fpsSince: 0,
  };

  const WHISPERS = [
    [0.12, 'you are not alone'],
    [0.30, 'it heard that'],
    [0.50, 'it has seen you'],
    [0.70, 'do not look back'],
    [0.88, 'IT IS HERE'],
  ];

  const PROX_DISTANCE_LABELS = [
    [2.0, 'BREATHING'],
    [5.0, 'CLOSE'],
    [10.0, 'NEAR'],
    [18.0, 'DISTANT'],
  ];

  function proximityBand(d) {
    for (let i = 0; i < PROX_DISTANCE_LABELS.length; i++) {
      if (d < PROX_DISTANCE_LABELS[i][0]) return PROX_DISTANCE_LABELS[i][1];
    }
    return 'FAR';
  }

  /* Build (or rebuild) the world for the current depth. Shards, owned kit,
   * and the shop survive; the maze, tapes, and dread do not. */
  function newRun() {
    const settings = HorrorLib.depthSettings(state.depth);
    state.settings = settings;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    state.level = HorrorLib.generateLevel({ cols: settings.cols, rows: settings.rows, seed: seed });
    state.player = new HorrorLib.Player(state.level.start.x, state.level.start.y, state.level.start.angle);
    // IT starts out at home, in its den, not waiting on the exit. You have to
    // walk past it to leave, and you can choose to walk *in* instead.
    state.stalker = new HorrorLib.Stalker(state.level.den.x, state.level.den.y);
    state.stalker.setHome(state.level.den.x, state.level.den.y);
    state.atmo = new HorrorLib.Atmosphere({ rampSeconds: settings.rampSeconds });

    const rng = HorrorLib.makeRng((seed ^ 0x9e3779b9) >>> 0);
    state.tapes = HorrorLib.placeCollectibles(state.level.world, settings.tapes, rng, { minFromStart: 4 });
    state.explored = new HorrorLib.Explored(state.level.world.cols, state.level.world.rows);
    state.explored.reveal(state.level.start.x, state.level.start.y, state.effects.mapRadius);

    state.time = 0;
    state.whisper = -1;
    state.message = 0;
    state.flash = 0;
    state.stamina = 1;
    state.sprinting = false;
    state.proximity = null;
    state.stalkerMood = state.stalker.mood;
    state.route = null;
    state.routeTo = null;
    state.routeCell = null;
  }

  /* Recompute the Surveyor's Rite route to the exit. It is bought, it is
   * consumed by the tape, and it is the only thing that turns the map into an
   * answer instead of a memory. */
  function refreshRoute() {
    if (!state.effects.survey || !state.level) {
      state.route = null;
      state.routeTo = null;
      return;
    }
    state.route = HorrorLib.solvePath(
      state.level.world,
      state.player.x, state.player.y,
      state.level.exit.x, state.level.exit.y
    );
    state.routeTo = state.route ? state.route.length - 1 : 0;
  }

  function beginDepth() {
    newRun();
    state.phase = 'playing';
    el.message.textContent = '';
    el.submessage.textContent = '';
    el.hint.textContent = 'Tape ' + pad2(state.depth) +
      ' · find the exit · B shop · M chart · C hide · Shift run · or go into the den.';
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* ------------------------------------------------------------------ */
  /* procedural textures                                                */
  /* ------------------------------------------------------------------ */

  function makeMist(size, seed) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const rng = HorrorLib.makeRng(seed);
    for (let i = 0; i < 80; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = size * (0.08 + rng() * 0.2);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(220,228,240,' + (0.05 + rng() * 0.09).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(220,228,240,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  function makeGrain(size, seed) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const rng = HorrorLib.makeRng(seed);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng() < 0.5 ? 0 : 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* sizing                                                             */
  /* ------------------------------------------------------------------ */

  const view = { w: SCENE_W, h: SCENE_H, dpr: 1 };

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    view.w = Math.max(64, Math.floor(rect.width));
    view.h = Math.max(64, Math.floor(rect.height));
    canvas.width = Math.floor(view.w * view.dpr);
    canvas.height = Math.floor(view.h * view.dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    ctx.imageSmoothingEnabled = false;
  }

  /* ------------------------------------------------------------------ */
  /* scene rendering                                                    */
  /* ------------------------------------------------------------------ */

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  /* A persistent RGBA buffer for the flats. Alpha is set once; every frame we
   * only rewrite the colour bytes, so no per-pixel allocation. */
  const sceneBuf = sctx.createImageData(SCENE_W, SCENE_H);
  const scenePx = sceneBuf.data;
  for (let i = 3; i < scenePx.length; i += 4) scenePx[i] = 255;

  /* The checker tone only depends on the low two bits of the tile coordinates,
   * so the whole pattern is 16 values. Table it: the inner loop drops every
   * branch and the tile stays exactly as it was. */
  const FLAT_TONE = new Float32Array(16);
  for (let q = 0; q < 4; q++) {
    for (let p = 0; p < 4; p++) {
      let tone = ((p + q) & 1) ? 1 : 0.76;
      if (p === 0 || q === 0) tone *= 0.8;
      FLAT_TONE[(q << 2) | p] = tone;
    }
  }

  /* Textured floor and ceiling, cast per pixel (Wolfenstein style). Cheaper *and*
   * far more "old machine" than a flat gradient: distance fog is worked out
   * once per row, then each pixel just samples a chunky checker tile with a
   * seam every fourth cell. */
  function renderFlats(fogR, fogG, fogB, density) {
    const p = state.player;
    const fov = fovNow();
    const halfH = SCENE_H / 2;
    const posZ = 0.5 * SCENE_H;
    const dirX0 = Math.cos(p.angle - fov / 2);
    const dirY0 = Math.sin(p.angle - fov / 2);
    const dirX1 = Math.cos(p.angle + fov / 2);
    const dirY1 = Math.sin(p.angle + fov / 2);
    const px = scenePx;
    const fr = Math.round(fogR);
    const fg = Math.round(fogG);
    const fb = Math.round(fogB);

    // One row at a time. Duplicating rows halved the cost but flattened the
    // floor into horizontal bands, erasing the depth cue you steer by.
    for (let y = 0; y < SCENE_H; y++) {
      const below = y > halfH;
      const pRow = below ? (y - halfH) : (halfH - y);
      const iRow = y * SCENE_W * 4;

      // the horizon itself is pure fog
      if (pRow <= 0) {
        for (let x = 0; x < SCENE_W; x++) {
          const i = iRow + x * 4;
          px[i] = fr;
          px[i + 1] = fg;
          px[i + 2] = fb;
        }
        continue;
      }

      const rowDist = posZ / pRow;
      const stepX = rowDist * (dirX1 - dirX0) / SCENE_W;
      const stepY = rowDist * (dirY1 - dirY0) / SCENE_W;
      let fx = p.x + rowDist * dirX0;
      let fy = p.y + rowDist * dirY0;
      // Fog contributions and the lit base are constant across the row, so
      // fold them here and leave one multiply-add per channel per pixel.
      const f = HorrorLib.fogFactor(rowDist, density);
      const invF = 1 - f;
      const fogFr = fogR * f;
      const fogFg = fogG * f;
      const fogFb = fogB * f;
      const br = (below ? 62 : 48) * invF;
      const bg = (below ? 56 : 50) * invF;
      const bb = (below ? 52 : 64) * invF;

      for (let x = 0; x < SCENE_W; x++) {
        const tx = fx | 0;
        const ty = fy | 0;
        fx += stepX;
        fy += stepY;
        const tone = FLAT_TONE[((ty & 3) << 2) | (tx & 3)];
        const i = iRow + x * 4;
        px[i] = (br * tone + fogFr) | 0;
        px[i + 1] = (bg * tone + fogFg) | 0;
        px[i + 2] = (bb * tone + fogFb) | 0;
      }
    }

    sctx.putImageData(sceneBuf, 0, 0);
  }

  function renderScene() {
    const world = state.level.world;
    const p = state.player;
    const fov = fovNow();
    const atmo = state.atmo;
    const eff = state.effects;
    const dread = atmo.dread;
    const density = atmo.fogDensity() * eff.fogMul;

    // Fog colour drifts from cold blue-grey to a sickly rust as dread rises.
    const fogR = mix(16, 44, dread);
    const fogG = mix(18, 14, dread);
    const fogB = mix(24, 16, dread);

    // textured ceiling and floor
    renderFlats(fogR, fogG, fogB, density);

    // wall columns
    const proj = SCENE_H * 0.92;
    for (let x = 0; x < SCENE_W; x++) {
      const angle = p.angle - fov / 2 + ((x + 0.5) / SCENE_W) * fov;
      const hit = HorrorLib.castRay(world, p.x, p.y, angle, MAX_DIST);
      const dist = Math.max(0.0001, hit.dist);
      const h = (proj / dist) * 1.35;
      const top = (SCENE_H - h) / 2;

      const sideShade = hit.side === 1 ? 0.68 : 1;
      const brick = ((hit.mapX * 7 + hit.mapY * 13) % 5) / 5;
      const shade = sideShade * (0.72 + brick * 0.3);

      const f = HorrorLib.fogFactor(dist, density);
      const r = mix(96 * shade, fogR, f);
      const g = mix(101 * shade, fogG, f);
      const b = mix(112 * shade, fogB, f);

      // brick courses: two bands per wall unit, alternating tone
      const bandH = h / 2;
      const dark = ((hit.mapX + hit.mapY) & 1) ? 0.9 : 1;
      sctx.fillStyle = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
      sctx.fillRect(x, top, 1, bandH + 1);
      sctx.fillStyle = 'rgb(' + ((r * dark) | 0) + ',' + ((g * dark) | 0) + ',' + ((b * dark) | 0) + ')';
      sctx.fillRect(x, top + bandH, 1, h - bandH + 1);
    }

    drawTapes(world, density);
    drawExitGlow(world, density);
    drawDenGlow(world, density);
    drawStalker(world, density);
    applyEyeLight();
  }

  /* A cold green glow leaking from the way out — visible down a straight run,
   * hidden by any wall in between. */
  function drawExitGlow(world, density) {
    const p = state.player;
    const fov = fovNow();
    const dx = state.level.exit.x - p.x;
    const dy = state.level.exit.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_DIST * 0.6) return;

    let rel = Math.atan2(dy, dx) - p.angle;
    rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    if (Math.abs(rel) > fov / 2 + 0.2) return;

    const ray = HorrorLib.castRay(world, p.x, p.y, p.angle + rel, dist + 0.4);
    if (ray.hit && ray.dist < dist - 0.4) return;

    const f = HorrorLib.fogFactor(dist, density);
    if (f > 0.9) return;

    // Standing on the exit makes `dist` zero; an infinite radius throws inside
    // createRadialGradient and takes the whole animation loop down with it.
    if (!(dist > 0.05)) return;
    const h = Math.min(SCENE_H * 6, (SCENE_H * 0.92 / dist) * 1.1);
    const cx = ((rel + fov / 2) / fov) * SCENE_W;
    const cy = SCENE_H / 2;
    const rad = Math.min(SCENE_W, Math.max(3, h * 0.5));
    const pulse = 0.55 + 0.45 * Math.sin(state.time * 2.2);
    const grad = sctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, 'rgba(120,220,180,' + ((1 - f) * 0.5 * pulse).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(120,220,180,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }

  /* A faint, cold pool of light around the eye — the Cold Cathode item. */
  function applyEyeLight() {
    const light = state.effects.light;
    if (light <= 0) return;
    const cx = SCENE_W / 2;
    const cy = SCENE_H * 0.54;
    const rad = SCENE_W * (0.34 + light * 0.26);
    const grad = sctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, 'rgba(206,218,236,' + (0.08 + light * 0.2).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(206,218,236,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, SCENE_W, SCENE_H);
  }

  /* Tapes you have not collected, glowing faintly down the corridor. */
  function drawTapes(world, density) {
    const p = state.player;
    const fov = fovNow();
    const tapes = state.tapes;
    for (let i = 0; i < tapes.length; i++) {
      const t = tapes[i];
      if (t.taken) continue;
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_DIST * 0.7) continue;
      let rel = Math.atan2(dy, dx) - p.angle;
      rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(rel) > fov / 2 + 0.2) continue;
      const ray = HorrorLib.castRay(world, p.x, p.y, p.angle + rel, dist + 0.4);
      if (ray.hit && ray.dist < dist - 0.3) continue;
      const f = HorrorLib.fogFactor(dist, density);
      if (f > 0.9) continue;

      if (!(dist > 0.05)) continue;
      const h = Math.min(SCENE_H * 2, (SCENE_H * 0.92 / dist) * 0.16);
      const w = Math.max(1, h * 0.7);
      const cx = ((rel + fov / 2) / fov) * SCENE_W;
      const bob = Math.sin(state.time * 3 + i) * h * 0.25;
      const y = SCENE_H * 0.62 + bob;
      sctx.globalAlpha = (1 - f) * 0.9;
      sctx.fillStyle = '#c9c2a4';
      sctx.fillRect(Math.round(cx - w / 2), Math.round(y), Math.round(w), Math.round(Math.max(1, h)));
      sctx.fillStyle = 'rgba(255,240,200,0.5)';
      sctx.fillRect(Math.round(cx - w / 2), Math.round(y + h * 0.5), Math.round(w), 1);
      sctx.globalAlpha = 1;
    }
  }

  /* IT.
   *
   * The research on stalker design is unusually consistent, and three points
   * drove this rewrite:
   *
   *   1. Never show it whole. Imagination outdoes any model, so the silhouette
   *      is what carries the read and the detail is withheld. It is only ever
   *      partially drawn, and past `STALKER_VANISH` you get fragments.
   *   2. The silhouette must be wrong before it is scary. A body that is too
   *      tall, too thin, with a neck too long and arms past the knees reads as
   *      "that is not a person" in a way no gore does — and it reads at a
   *      distance, where detail would not.
   *   3. Unpredictability beats aggression. It flickers out of existence for
   *      single frames when far away, so you are never sure it was there.
   */
  function drawStalker(world, density) {
    const p = state.player;
    const fov = fovNow();
    const s = state.stalker;
    if (state.menuOpen || state.adminOpen || state.atmo.dread < 0.05) return;

    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (!(dist > 0.05)) return;
    if (dist > MAX_DIST * 0.8) return;

    let rel = Math.atan2(dy, dx) - p.angle;
    rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    if (Math.abs(rel) > fov / 2 + 0.15) return;

    // hidden behind a wall?
    const ray = HorrorLib.castRay(world, p.x, p.y, p.angle + rel, dist + 0.5);
    if (ray.hit && ray.dist < dist - 0.25) return;

    const f = HorrorLib.fogFactor(dist, density);
    if (f > 0.85) return;

    // 3 — single-frame dropouts, but only where it is already indistinct. Up
    // close it stays, because a monster you cannot see is not a monster.
    if (dist > STALKER_FLICKER_DIST) {
      const beat = Math.floor(state.time * 11);
      const hash = Math.abs((Math.sin(beat * 12.9898) * 43758.5453) % 1);
      if (hash < 0.2) return;
    }

    const h = Math.min(SCENE_H * 5, (SCENE_H * 0.92 / dist) * 2.05);
    const w = Math.max(1, h * 0.2);
    const cx = ((rel + fov / 2) / fov) * SCENE_W;
    const top = (SCENE_H - h) / 2;
    const body = 1 - f;

    // A 1px tremble so the outline never sits still on the grid.
    const jitter = Math.round(Math.sin(state.time * 41) * 0.5);
    const rx = Math.round(cx + jitter);
    const alpha = body * (dist > STALKER_FLICKER_DIST ? 0.72 : 0.96);
    sctx.globalAlpha = alpha;
    sctx.fillStyle = '#04050a';

    // legs — two thin columns with a gap, so the empty space is part of the shape
    const hip = top + h * 0.52;
    const legW = Math.max(1, w * 0.34);
    sctx.fillRect(Math.round(rx - w * 0.5), Math.round(hip), Math.round(legW), Math.round(h * 0.48));
    sctx.fillRect(Math.round(rx + w * 0.5 - legW), Math.round(hip), Math.round(legW), Math.round(h * 0.48));

    // torso, too narrow for the height
    sctx.fillRect(Math.round(rx - w / 2), Math.round(top + h * 0.24), Math.round(w), Math.round(h * 0.3));

    // arms hanging well past the hips
    const armW = Math.max(1, w * 0.22);
    sctx.fillRect(Math.round(rx - w * 0.5 - armW), Math.round(top + h * 0.28), Math.round(armW), Math.round(h * 0.42));
    sctx.fillRect(Math.round(rx + w * 0.5), Math.round(top + h * 0.28), Math.round(armW), Math.round(h * 0.42));

    // the neck: the single most wrong proportion on the whole thing
    const neck = Math.max(1, w * 0.16);
    sctx.fillRect(Math.round(rx - neck / 2), Math.round(top + h * 0.12), Math.round(neck), Math.round(h * 0.13));

    // head — a narrow wedge, tilted, never a circle
    const headW = w * 0.5;
    const headH = h * 0.13;
    const hy = top + h * 0.03;
    sctx.beginPath();
    sctx.moveTo(rx - headW * 0.5, hy + headH);
    sctx.lineTo(rx + headW * 0.5, hy + headH * 0.86);
    sctx.lineTo(rx + headW * 0.22, hy);
    sctx.lineTo(rx - headW * 0.28, hy + headH * 0.18);
    sctx.closePath();
    sctx.fill();

    // Detail is earned by distance. Only inside `STALKER_DETAIL` do you get
    // features at all, and the eyes are intermittent even then.
    if (dist < STALKER_DETAIL) {
      const near = 1 - dist / STALKER_DETAIL;
      const eyeW = Math.max(1, w * 0.16);
      const eyesOn = Math.sin(state.time * 2.7) > -0.25;
      sctx.globalAlpha = alpha * near;
      sctx.fillStyle = eyesOn ? 'rgba(214,58,58,0.92)' : 'rgba(120,30,30,0.55)';
      sctx.fillRect(Math.round(rx - headW * 0.34), Math.round(hy + headH * 0.34), Math.round(eyeW), Math.round(eyeW * 0.7));
      sctx.fillRect(Math.round(rx + headW * 0.12), Math.round(hy + headH * 0.3), Math.round(eyeW), Math.round(eyeW * 0.7));
      // a jaw line, so it has a face without ever having a face
      sctx.fillStyle = 'rgba(150,24,24,0.4)';
      sctx.fillRect(Math.round(rx - headW * 0.2), Math.round(hy + headH * 0.72), Math.round(headW * 0.4), 1);
    }

    sctx.globalAlpha = 1;
  }

  /* The den. It should read as a wound in the map: you can see it from
   * further away than the exit, and it does not look like a way out. */
  function drawDenGlow(world, density) {
    const p = state.player;
    const fov = fovNow();
    const den = state.level.den;
    if (!den) return;
    const dx = den.x - p.x;
    const dy = den.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (!(dist > 0.05)) return;
    if (dist > MAX_DIST * 0.8) return;

    let rel = Math.atan2(dy, dx) - p.angle;
    rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    if (Math.abs(rel) > fov / 2 + 0.25) return;

    const ray = HorrorLib.castRay(world, p.x, p.y, p.angle + rel, dist + 0.4);
    if (ray.hit && ray.dist < dist - 0.4) return;

    const f = HorrorLib.fogFactor(dist, density);
    if (f > 0.92) return;

    const h = Math.min(SCENE_H * 4, (SCENE_H * 0.92 / dist) * 1.4);
    const cx = ((rel + fov / 2) / fov) * SCENE_W;
    const cy = SCENE_H * 0.6;
    const rad = Math.min(SCENE_W, Math.max(3, h * 0.6));
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 1.3);
    const grad = sctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, 'rgba(158,40,64,' + ((1 - f) * (0.22 + pulse * 0.2)).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(90,10,30,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }

  /* ------------------------------------------------------------------ */
  /* palette dither — crush the scene to a handful of colours            */
  /* ------------------------------------------------------------------ */

  const BAYER4 = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
  ];

  /* Ordered-dither every pixel of the scene buffer down to `levels` steps per
   * channel. DITHER_STRENGTH keeps it as texture rather than noise: at full
   * strength the speckle swallows the wall/floor edge you navigate by.
   *
   * Brightness rides along here because this pass already visits every pixel;
   * `useDither` false gives the clean, un-speckled version of the same palette. */
  function ditherScene(levels, brightness, useDither) {
    const img = sctx.getImageData(0, 0, SCENE_W, SCENE_H);
    const d = img.data;
    const step = 255 / (levels - 1);
    const amp = step * DITHER_STRENGTH;
    const bright = brightness == null ? 1 : brightness;
    for (let y = 0; y < SCENE_H; y++) {
      const row = (y & 3) * 4;
      for (let x = 0; x < SCENE_W; x++) {
        const i = (y * SCENE_W + x) * 4;
        const thr = useDither ? (BAYER4[row + (x & 3)] / 16 - 0.5) * amp : 0;
        let r = Math.round((d[i] * bright + thr) / step) * step;
        let g = Math.round((d[i + 1] * bright + thr) / step) * step;
        let b = Math.round((d[i + 2] * bright + thr) / step) * step;
        if (r < 0) r = 0; else if (r > 255) r = 255;
        if (g < 0) g = 0; else if (g > 255) g = 255;
        if (b < 0) b = 0; else if (b > 255) b = 255;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
    }
    sctx.putImageData(img, 0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* compositing + analog-horror post pass                              */
  /* ------------------------------------------------------------------ */

  /* Repeat a texture over the whole canvas so a drifting layer never leaves a
   * bare patch on wide screens. */
  function tileImage(g, img, W, H, x0, y0, w, h) {
    const startX = (Math.floor(x0) % w) - w;
    const startY = (Math.floor(y0) % h) - h;
    for (let y = startY; y < H; y += h) {
      for (let x = startX; x < W; x += w) {
        g.drawImage(img, x, y, w, h);
      }
    }
  }

  function present() {
    const atmo = state.atmo;
    const eff = state.effects;
    const prefs = state.prefs;
    const dread = atmo.dread;
    const W = canvas.width;
    const H = canvas.height;

    ctx.imageSmoothingEnabled = false;

    // Camera motion — shake, bob, glitch and the flash all answer to one
    // preference, because motion sickness is the genre's classic problem.
    const shake = atmo.shake() * eff.shakeMul * prefs.motion;
    const ox = (Math.random() * 2 - 1) * shake * view.dpr;
    const bob = prefs.headbob && state.moving && !state.hiding
      ? Math.sin(state.time * 9) * (state.sprinting ? 2.4 : 1.4) * prefs.motion * view.dpr
      : 0;
    const oy = (Math.random() * 2 - 1) * shake * view.dpr + bob;

    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(scene, ox - 2, oy - 2, W + 4, H + 4);

    // drifting procedural mist (two tiled layers, offset in time)
    if (prefs.mist) {
      ctx.globalAlpha = 0.1 + dread * 0.5;
      const drift = (state.time * 6) % 256;
      tileImage(ctx, mist, W, H, -drift, -drift * 0.4, SCENE_W * 2, SCENE_H * 2);
      tileImage(ctx, mist, W, H, drift - 256, drift * 0.3 - 80, SCENE_W * 1.9, SCENE_H * 1.9);
      ctx.globalAlpha = 1;
    }

    // film grain
    if (prefs.grain) {
      ctx.globalAlpha = atmo.staticAmount();
      const gx = -Math.floor(Math.random() * grain.width);
      const gy = -Math.floor(Math.random() * grain.height);
      for (let y = gy; y < H; y += grain.height) {
        for (let x = gx; x < W; x += grain.width) {
          ctx.drawImage(grain, x, y);
        }
      }
      ctx.globalAlpha = 1;
    }

    // static burst — a dead channel punches through for a few frames
    if (prefs.grain && Math.random() < 0.0025 + dread * 0.012) state.burst = 0.09;
    if (state.burst > 0) {
      ctx.globalAlpha = 0.42;
      for (let y = 0; y < H; y += grain.height) {
        for (let x = 0; x < W; x += grain.width) {
          ctx.drawImage(grain, x, y);
        }
      }
      ctx.globalAlpha = 1;
    }

    // film scratches
    if (Math.random() < 0.35 + dread * 0.4) {
      const sx = Math.floor(Math.random() * W);
      ctx.fillStyle = 'rgba(235,240,255,' + (0.03 + Math.random() * 0.05).toFixed(3) + ')';
      ctx.fillRect(sx, 0, Math.max(1, Math.round(view.dpr)), H);
    }

    // sickly red tint
    const tint = prefs.tint ? atmo.tintAmount() : 0;
    if (tint > 0.001) {
      ctx.fillStyle = 'rgba(120,14,20,' + tint.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // VHS tracking band, slowly crawling up the screen
    const bandY = ((state.time * 42) % (H + 160)) - 80;
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(0, bandY, W, 26 * view.dpr);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, bandY + 30 * view.dpr, W, 8 * view.dpr);

    // glitch slits
    if (Math.random() < atmo.glitchChance() * eff.glitchMul * prefs.motion) {
      const slices = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < slices; i++) {
        const sy = Math.floor(Math.random() * H);
        const sh = (2 + Math.random() * 14) * view.dpr;
        const dx = Math.round((Math.random() * 2 - 1) * 20 * (0.4 + dread) * view.dpr);
        ctx.drawImage(canvas, 0, sy, W, sh, dx, sy, W, sh);
      }
    }

    // brightness flicker
    if (Math.random() < 0.2 + dread * 0.3) {
      ctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * (0.05 + dread * 0.12)).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // heartbeat vignette — the walls close in on the beat, and tighter still
    // when the presence is near. Painted by the compositor (a CSS layer), not
    // by us: a full-canvas gradient fill per frame is far too expensive.
    let pulse = 0;
    if (dread > 0.08) {
      const beat = 1.15 - dread * 0.55;
      const phase = (state.time % beat) / beat;
      pulse = Math.pow(1 - phase, 3);
    }
    const near = state.proximity == null ? 0 : HorrorLib.clamp(1 - state.proximity / 12, 0, 1);
    const vig = Math.round(pulse * (dread * 0.12 + near * 0.22) * prefs.motion * 100) / 100;
    if (vig !== state.vigApplied) {
      el.heartbeat.style.opacity = vig.toFixed(2);
      state.vigApplied = vig;
    }

    // (brightness is applied inside ditherScene — it rides the per-pixel pass
    // that already runs, where a full-canvas fill here would cost ~8 FPS.)

    // impact flash (caught / ward / jump scare)
    if (state.flash > 0 && prefs.motion > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, state.flash * prefs.motion).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ------------------------------------------------------------------ */
  /* minimap (fog of war + detector pings)                              */
  /* ------------------------------------------------------------------ */

  /* Plot at a world position, clamped to the rim so off-screen pings still
   * point the way. Returns true when the mark stayed inside the frame. */
  function mmPlot(ox, oy, wx, wy, margin) {
    const m = margin == null ? 4 : margin;
    let x = (wx - ox) * MM_TILE;
    let y = (wy - oy) * MM_TILE;
    const inside = x >= m && y >= m && x <= MM_SIZE - m && y <= MM_SIZE - m;
    if (x < m) x = m; else if (x > MM_SIZE - m) x = MM_SIZE - m;
    if (y < m) y = m; else if (y > MM_SIZE - m) y = MM_SIZE - m;
    return { x: x, y: y, inside: inside };
  }

  /* Resize the chart. It only ever changes how much of what you already know
   * is on screen at once — the reveal radius is unharmed. */
  function setMinimapTiles(tiles) {
    MM_TILES = tiles === MM_TILES_LARGE ? MM_TILES_LARGE : MM_TILES_SMALL;
    MM_R = (MM_TILES - 1) / 2;
    MM_SIZE = MM_TILES * MM_TILE;
    // backing store only — the displayed size is the stylesheet's business, so
    // `.minimap.wide` can be overridden on small screens
    mm.width = MM_SIZE;
    mm.height = MM_SIZE;
    mm.classList.toggle('wide', MM_TILES === MM_TILES_LARGE);
    state.minimapTiles = MM_TILES;
    return MM_TILES;
  }

  function toggleMinimap() {
    setMinimapTiles(MM_TILES === MM_TILES_SMALL ? MM_TILES_LARGE : MM_TILES_SMALL);
    el.submessage.textContent = 'chart ' + (MM_TILES === MM_TILES_LARGE ? 'wide' : 'close');
    state.message = 1.2;
    blip(700, 0.04);
    return MM_TILES;
  }

  function drawMinimap() {
    const world = state.level.world;
    const p = state.player;
    const eff = state.effects;
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const ox = cx - MM_R;
    const oy = cy - MM_R;

    mmCtx.fillStyle = '#05080a';
    mmCtx.fillRect(0, 0, MM_SIZE, MM_SIZE);

    // cells, one pixel-gap each so the grid reads
    for (let ty = 0; ty < MM_TILES; ty++) {
      for (let tx = 0; tx < MM_TILES; tx++) {
        const wx = ox + tx;
        const wy = oy + ty;
        if (!state.explored.isSeen(wx, wy)) continue;
        const t = world.get(wx, wy);
        let colour;
        if (t === HorrorLib.WALL) colour = '#1b2a2b';
        else if (t === HorrorLib.EXIT) colour = '#b8913f';
        else colour = '#123b34';
        mmCtx.fillStyle = colour;
        mmCtx.fillRect(tx * MM_TILE, ty * MM_TILE, MM_TILE - 1, MM_TILE - 1);
      }
    }

    // The Surveyor's Rite: the optimal route, cell by cell. Unseen stretches
    // are drawn dotted rather than hidden, because the whole point of paying
    // for it is to be told the way you have not been yet.
    if (state.route && state.route.length > 1) {
      for (let i = 0; i < state.route.length; i++) {
        const c = state.route[i];
        const seen = state.explored.isSeen(c[0], c[1]);
        if (!seen && (i & 1)) continue;
        mmCtx.globalAlpha = seen ? 0.85 : 0.42;
        mmCtx.fillStyle = '#7aa2ff';
        mmCtx.fillRect((c[0] + 0.5 - ox) * MM_TILE - 1, (c[1] + 0.5 - oy) * MM_TILE - 1, 3, 3);
      }
      mmCtx.globalAlpha = 1;
    }

    // the den, once you have laid eyes on it
    if (state.level.den && state.explored.isSeen(state.level.den.cell[0], state.level.den.cell[1])) {
      const mark = mmPlot(ox, oy, state.level.den.x, state.level.den.y);
      mmCtx.globalAlpha = mark.inside ? 0.95 : 0.5;
      mmCtx.fillStyle = '#9e2840';
      mmCtx.beginPath();
      mmCtx.arc(mark.x, mark.y, 3, 0, Math.PI * 2);
      mmCtx.fill();
      mmCtx.globalAlpha = 1;
    }

    // tapes still out there
    for (let i = 0; i < state.tapes.length; i++) {
      const t = state.tapes[i];
      if (t.taken) continue;
      if (!state.explored.isSeen(t.cell[0], t.cell[1])) continue;
      mmCtx.fillStyle = '#d8d2b0';
      mmCtx.fillRect((t.x - ox) * MM_TILE - 1, (t.y - oy) * MM_TILE - 1, 3, 3);
    }

    // the exit, marked even through the fog once you own Dead Reckoning
    if (eff.seeExit) {
      const mark = mmPlot(ox, oy, state.level.exit.x, state.level.exit.y);
      const blink = 0.55 + 0.45 * Math.sin(state.time * 6);
      mmCtx.globalAlpha = blink;
      mmCtx.fillStyle = '#e8c064';
      mmCtx.fillRect(mark.x - 3, mark.y - 3, 6, 6);
      mmCtx.globalAlpha = 1;
    }

    // the presence, once you own the Signal Tap
    if (eff.seeStalker) {
      const mark = mmPlot(ox, oy, state.stalker.x, state.stalker.y);
      const pulse = 3 + Math.sin(state.time * 9) * 1.4;
      mmCtx.globalAlpha = mark.inside ? 1 : 0.55;
      mmCtx.fillStyle = '#e0483c';
      mmCtx.beginPath();
      mmCtx.arc(mark.x, mark.y, pulse, 0, Math.PI * 2);
      mmCtx.fill();
      mmCtx.globalAlpha = 1;
    }

    // proximity ring — a tightening collar as it closes
    if (eff.proximity && state.proximity != null) {
      const near = HorrorLib.clamp(1 - state.proximity / 14, 0, 1);
      mmCtx.strokeStyle = 'rgba(224,72,60,' + (0.25 + near * 0.6).toFixed(2) + ')';
      mmCtx.lineWidth = 1;
      mmCtx.beginPath();
      mmCtx.arc(MM_SIZE / 2, MM_SIZE / 2, (1 - near) * (MM_R * MM_TILE) + 6, 0, Math.PI * 2);
      mmCtx.stroke();
    }

    // the player: a chunky arrow at the centre
    const px = (p.x - ox) * MM_TILE;
    const py = (p.y - oy) * MM_TILE;
    mmCtx.save();
    mmCtx.translate(px, py);
    mmCtx.rotate(p.angle);
    mmCtx.fillStyle = '#eef2e6';
    mmCtx.beginPath();
    mmCtx.moveTo(5, 0);
    mmCtx.lineTo(-3.5, -3.5);
    mmCtx.lineTo(-1.5, 0);
    mmCtx.lineTo(-3.5, 3.5);
    mmCtx.closePath();
    mmCtx.fill();
    mmCtx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* HUD                                                                */
  /* ------------------------------------------------------------------ */

  let clockStart = null;

  function stamp() {
    const base = new Date(clockStart);
    base.setSeconds(base.getSeconds() + Math.floor(state.time));
    const pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return base.getFullYear() + '-' + pad(base.getMonth() + 1) + '-' + pad(base.getDate()) +
      ' ' + pad(base.getHours()) + ':' + pad(base.getMinutes()) + ':' + pad(base.getSeconds());
  }

  function tapesTaken() {
    let n = 0;
    for (let i = 0; i < state.tapes.length; i++) if (state.tapes[i].taken) n++;
    return n;
  }

  function updateHud() {
    el.clock.textContent = stamp();
    el.depth.textContent = 'TAPE ' + pad2(state.depth);
    el.shards.textContent = '\u25c8 ' + state.shards;
    el.tapes.textContent = tapesTaken() + '/' + state.tapes.length;

    const dread = Math.round(state.atmo.dread * 100);
    el.dreadFill.style.width = dread + '%';
    el.dreadLabel.textContent = dread + '%';

    el.staminaFill.style.width = Math.round(state.stamina * 100) + '%';
    el.staminaLabel.textContent = state.sprinting ? 'RUN' : 'BREATH';

    el.hiddenBadge.hidden = !(state.hiding && state.phase === 'playing' && !state.menuOpen);

    if (state.effects.proximity && state.proximity != null && state.phase === 'playing') {
      el.proximity.hidden = false;
      el.proximity.textContent = 'IT: ' + state.proximity.toFixed(1) + 'm — ' + proximityBand(state.proximity);
      el.proximity.className = 'proximity' + (state.proximity < 5 ? ' close' : '');
    } else {
      el.proximity.hidden = true;
    }

    if (state.message > 0) {
      state.message -= 1 / 60;
      if (state.message <= 0) el.submessage.textContent = '';
    }
  }

  function checkWhispers() {
    const dread = state.atmo.dread;
    for (let i = 0; i < WHISPERS.length; i++) {
      if (i > state.whisper && dread >= WHISPERS[i][0]) {
        state.whisper = i;
        el.submessage.textContent = WHISPERS[i][1];
        state.message = 4;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* shop                                                               */
  /* ------------------------------------------------------------------ */

  function buildShop() {
    if (state.shopBuilt) return;
    const items = HorrorLib.ITEMS;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'shop-item';
      row.dataset.id = item.id;

      const head = document.createElement('span');
      head.className = 'shop-item-head';
      const index = document.createElement('span');
      index.className = 'shop-index';
      index.textContent = pad2(i + 1);
      const name = document.createElement('span');
      name.className = 'shop-name';
      name.textContent = item.name;
      const cost = document.createElement('span');
      cost.className = 'shop-cost';
      cost.textContent = '\u25c8 ' + item.cost;
      head.appendChild(index);
      head.appendChild(name);
      head.appendChild(cost);

      const blurb = document.createElement('span');
      blurb.className = 'shop-blurb';
      blurb.textContent = item.blurb;

      row.appendChild(head);
      row.appendChild(blurb);
      row.addEventListener('click', function () { buyItem(item.id); });
      el.shopList.appendChild(row);
    }
    state.shopBuilt = true;
  }

  function refreshShop() {
    el.shopShards.textContent = '\u25c8 ' + state.shards;
    const rows = el.shopList.children;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const id = row.dataset.id;
      const item = HorrorLib.ITEM_BY_ID[id];
      const check = HorrorLib.canBuy(state.owned, id, state.shards);
      const count = state.owned.filter(function (o) { return o === id; }).length;
      row.classList.toggle('owned', check.reason === 'owned');
      row.classList.toggle('locked', check.reason === 'shards');
      row.disabled = !check.ok;
      let label = check.ok ? '' : (check.reason === 'owned' ? 'INSTALLED' : 'NO SHARDS');
      if (item.stackable && count > 0) label = 'INSTALLED x' + count;
      row.dataset.status = label;
    }
  }

  function toggleShop(force) {
    const open = force == null ? !state.shopOpen : force;
    if (open === state.shopOpen) return;
    state.shopOpen = open;
    el.shop.hidden = !open;
    if (open) {
      buildShop();
      refreshShop();
      el.shopNote.textContent = 'A moment to spend what you have recovered.';
      state.keys = Object.create(null);
      state.sprinting = false;
      blip(180, 0.06);
    }
  }

  function buyItem(id) {
    const item = HorrorLib.ITEM_BY_ID[id];
    const check = HorrorLib.canBuy(state.owned, id, state.shards);
    if (!check.ok) {
      el.shopNote.textContent = check.reason === 'owned' ? 'Already in your kit.'
        : check.reason === 'shards' ? 'Not enough shards.'
          : 'That item is not real.';
      blip(90, 0.07);
      return;
    }
    state.shards -= item.cost;
    state.owned.push(id);
    state.effects = HorrorLib.applyItems(state.owned);
    if (state.effects.survey) {
      state.routeCell = null;   // force a fresh solve on the next frame
      refreshRoute();
    }
    el.shopNote.textContent = 'Installed: ' + item.name + '.';
    blip(620, 0.06);
    blip(880, 0.08);
    refreshShop();
    updateHud();
  }

  /* ------------------------------------------------------------------ */
  /* audio (procedural, best-effort)                                    */
  /* ------------------------------------------------------------------ */

  let audio = null;
  let beatAt = 0;

  function initAudio() {
    if (audio) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ac = new Ctx();
      const master = ac.createGain();
      master.gain.value = 0;
      master.connect(ac.destination);

      const droneGain = ac.createGain();
      droneGain.gain.value = 0.22;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      const o1 = ac.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 46;
      const o2 = ac.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = 46.6;
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(droneGain);
      droneGain.connect(master);
      o1.start();
      o2.start();

      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ac.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400;
      const nGain = ac.createGain();
      nGain.gain.value = 0;
      noise.connect(hp);
      hp.connect(nGain);
      nGain.connect(master);
      noise.start();

      audio = { ac: ac, master: master, nGain: nGain, lp: lp };
    } catch (err) {
      audio = null;
    }
  }

  function thump() {
    if (!audio) return;
    try {
      const ac = audio.ac;
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(70, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g);
      g.connect(audio.master);
      osc.start(t);
      osc.stop(t + 0.32);
    } catch (err) { /* best effort */ }
  }

  function blip(freq, dur) {
    if (!audio) return;
    try {
      const ac = audio.ac;
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.08));
      osc.connect(g);
      g.connect(audio.master);
      osc.start(t);
      osc.stop(t + (dur || 0.08) + 0.02);
    } catch (err) { /* best effort */ }
  }

  function updateAudio() {
    if (!audio) return;
    const playing = state.phase === 'playing';
    const dread = state.atmo.dread;
    try {
      const t = audio.ac.currentTime;
      audio.master.gain.setTargetAtTime(playing ? 0.55 * state.prefs.volume : 0.0, t, 0.6);
      audio.nGain.gain.setTargetAtTime(playing ? dread * 0.11 : 0, t, 0.5);
      audio.lp.frequency.setTargetAtTime(160 + dread * 900, t, 0.5);
      if (playing && dread > 0.12 && state.time >= beatAt) {
        beatAt = state.time + (1.15 - dread * 0.55);
        thump();
      }
    } catch (err) { /* best effort */ }
  }

  /* ------------------------------------------------------------------ */
  /* loop                                                              */
  /* ------------------------------------------------------------------ */

  function collectTapes() {
    const eff = state.effects;
    const got = HorrorLib.collectNear(state.tapes, state.player.x, state.player.y, eff.pickupRadius);
    if (got.length === 0) return;
    const per = state.settings.shardPerTape;
    state.shards += got.length * per;
    el.submessage.textContent = '+' + (got.length * per) + ' shards';
    state.message = 2;
    blip(760, 0.05);
    blip(1020, 0.06);
  }

  /* Is IT in front of you with nothing in the way? Feeds the behaviour in
   * raycast.js — being watched is what sends it off. */
  function stalkerInSight() {
    const p = state.player;
    const s = state.stalker;
    const dist = Math.hypot(s.x - p.x, s.y - p.y);
    if (!(dist > 0.05) || dist > MAX_DIST) return false;
    const fov = fovNow();
    let rel = Math.atan2(s.y - p.y, s.x - p.x) - p.angle;
    rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    if (Math.abs(rel) > fov / 2) return false;
    const ray = HorrorLib.castRay(state.level.world, p.x, p.y, p.angle + rel, dist + 0.5);
    return !(ray.hit && ray.dist < dist - 0.25);
  }

  function update(dt) {
    const atmo = state.atmo;
    const eff = state.effects;
    const p = state.player;

    const paused = state.shopOpen || state.adminOpen || state.menuOpen;
    if (state.phase === 'playing' && !paused) {
      state.time += dt;

      // turning + strafing
      if (state.keys.ArrowLeft || state.keys.a) p.turn(-TURN_SPEED * dt);
      if (state.keys.ArrowRight || state.keys.d) p.turn(TURN_SPEED * dt);

      let fwd = 0;
      let strafe = 0;
      if (state.keys.ArrowUp || state.keys.w) fwd += 1;
      if (state.keys.ArrowDown || state.keys.s) fwd -= 1;
      if (state.keys.q) strafe -= 1;
      if (state.keys.e) strafe += 1;

      // sprint drains stamina, standing still refills it
      const wantsSprint = !!(state.keys.Shift || state.keys.shift);
      const moving = !!(fwd || strafe);
      state.moving = moving;

      // Hiding (hold C while standing still) buys dread relief. It cannot be
      // hidden away entirely, and stepping out hands the dread straight back.
      state.hiding = !!(state.keys.c || state.keys.C) && !moving;
      if (state.hiding) atmo.calm(dt);
      else atmo.relax(dt);

      state.sprinting = wantsSprint && moving && state.stamina > 0.02;
      if (state.sprinting) {
        state.stamina = HorrorLib.clamp(state.stamina - dt / (SPRINT_SECONDS * eff.staminaMul), 0, 1);
      } else {
        state.stamina = HorrorLib.clamp(state.stamina + dt / (SPRINT_SECONDS * 1.6), 0, 1);
      }

      if (moving) {
        const speed = BASE_MOVE_SPEED * eff.speedMul * (state.sprinting ? SPRINT_MULT : 1);
        const cos = Math.cos(p.angle);
        const sin = Math.sin(p.angle);
        const dx = (cos * fwd + Math.cos(p.angle + Math.PI / 2) * strafe) * speed * dt;
        const dy = (sin * fwd + Math.sin(p.angle + Math.PI / 2) * strafe) * speed * dt;
        if (state.noClip) {
          p.x += dx;
          p.y += dy;
        } else {
          p.tryMove(state.level.world, dx, dy);
        }
      }

      if (!state.freezeDread) {
        atmo.update(dt);
        // dreadMul (Slow Tape) scales the ramp as a whole, so every mood
        // channel that reads `dread` stays coherent.
        atmo.dread = HorrorLib.clamp(atmo.dread * eff.dreadMul, 0, 1);
      }
      if (state.dreadOverride != null) {
        atmo.dread = HorrorLib.clamp(state.dreadOverride, 0, 1);
      }
      checkWhispers();
      collectTapes();
      state.explored.reveal(p.x, p.y, eff.mapRadius);

      // the surveyed route follows you: re-solve whenever you cross a cell, so
      // it always answers "from here" rather than "from where you were"
      if (eff.survey) {
        const cell = Math.floor(p.x) + ',' + Math.floor(p.y);
        if (cell !== state.routeCell) {
          state.routeCell = cell;
          refreshRoute();
        }
      } else if (state.route) {
        state.route = null;
      }

      state.proximity = state.stalker.distanceTo(p.x, p.y);

      // the stalker wakes once the dread has risen. It hunts, withdraws to its
      // den, and comes back — and being looked at from a distance sends it off,
      // which is why a clean look at it is rare.
      if (atmo.dread > 0.05 && !state.freezeStalker) {
        const speed = state.settings.stalkerSpeed * (0.55 + atmo.dread * 1.4) * state.stalkerSpeedMul;
        state.stalkerMood = state.stalker.update(state.level.world, p.x, p.y, dt, speed, {
          lookedAt: stalkerInSight(),
          rng: (Math.sin(state.time * 0.7) + 1) * 0.5,
          huntSeconds: HorrorLib.STALKER_HUNT,
          graceSeconds: HorrorLib.STALKER_GRACE,
        });
      }

      // Order matters. Being caught is checked first, so standing on top of the
      // thing always ends you. That also fixes the den: walking into it gets you
      // the other ending only while IT is out, because otherwise it is home.
      const toDen = Math.hypot(state.level.den.x - p.x, state.level.den.y - p.y);
      const toExit = Math.hypot(state.level.exit.x - p.x, state.level.exit.y - p.y);
      if (state.proximity < CATCH_DIST) {
        if (eff.ward > 0) {
          const i = state.owned.indexOf('palindrome-ward');
          if (i !== -1) state.owned.splice(i, 1);
          state.effects = HorrorLib.applyItems(state.owned);
          // banished home, and it stays there for a while: the ward buys real
          // distance rather than teleporting it to the far side of the map
          state.stalker.x = state.level.den.x;
          state.stalker.y = state.level.den.y;
          state.stalker.mood = 'den';
          state.stalker.timer = HorrorLib.STALKER_GRACE * 1.5;
          state.stalkerMood = 'den';
          state.flash = 1.2;
          el.submessage.textContent = 'the ward held — it remembers';
          state.message = 4;
          blip(120, 0.3);
        } else {
          state.phase = 'caught';
          state.flash = 1.2;
          el.message.textContent = 'IT FOUND YOU';
          el.submessage.textContent = 'press R to surface and try again';
          state.proximity = 0;
        }
      } else if (toDen < REACH_DIST) {
        const bonus = state.settings.escapeBonus * 3;
        state.shards += bonus;
        state.phase = 'den';
        state.flash = 1.2;
        el.message.textContent = 'YOU WENT IN';
        el.submessage.textContent =
          '+' + bonus + ' shards · you found the way it comes from · press R to go deeper';
        blip(90, 0.5);
        blip(140, 0.4);
      } else if (toExit < REACH_DIST) {
        state.shards += state.settings.escapeBonus;
        state.phase = 'escaped';
        el.message.textContent = 'TAPE RECOVERED';
        el.submessage.textContent = '+' + state.settings.escapeBonus + ' shards · press R to descend to tape ' + pad2(state.depth + 1);
        blip(520, 0.12);
        blip(780, 0.14);
      }
    }

    state.flash = Math.max(0, state.flash - dt * 2.2);
    state.burst = Math.max(0, state.burst - dt);
  }

  /* One complete pass over the picture: scene, palette, and the CRT
   * composition. The game loop and the test hook both go through here, so a
   * test can never end up measuring a different pipeline from the shipped one
   * — which is exactly how `renderPasses` was previously reading a stale
   * frame and reporting "the monster does not draw". */
  function drawFrame() {
    renderScene();
    // the palette degrades as the dread rises: fewer colours, more artefacts
    const levels = state.levelOverride != null
      ? state.levelOverride
      : (state.atmo.dread > 0.55 ? 5 : (state.atmo.dread > 0.28 ? 6 : COLOUR_LEVELS));
    ditherScene(levels, state.prefs.brightness, state.prefs.dither);
    present();
  }

  let last = 0;
  let faultLogged = 0;

  function frame(now) {
    // The next frame is scheduled *before* any work, because scheduling it at
    // the end is how a game dies: one thrown exception and the loop is never
    // re-armed, leaving a frozen picture that still accepts no input. The fault
    // is still reported to the console, so browser checks fail loudly on it
    // rather than quietly papering over it.
    window.requestAnimationFrame(frame);

    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    try {
      update(dt);
      drawFrame();
      if (state.level && state.explored) drawMinimap();
      updateHud();
      updateAudio();
    } catch (err) {
      if (faultLogged < 5) {
        faultLogged++;
        console.error('frame fault: ' + (err && err.message ? err.message : String(err)));
      }
    }

    // frame counter (HUD, and the test console)
    state.fpsFrames++;
    if (!state.fpsSince) state.fpsSince = now;
    if (now - state.fpsSince >= 500) {
      state.fps = Math.round((state.fpsFrames * 1000) / (now - state.fpsSince));
      state.fpsFrames = 0;
      state.fpsSince = now;
      if (state.prefs.showFps) el.fps.textContent = state.fps + ' fps';
      if (state.adminOpen) refreshAdmin();
    }
  }

  /* ------------------------------------------------------------------ */
  /* main menu, settings, and the secret test console                    */
  /* ------------------------------------------------------------------ */

  function openMenu(show) {
    const want = show == null ? !state.menuOpen : !!show;
    state.menuOpen = want;
    el.menu.hidden = !want;
    el.menuDepth.textContent = pad2(state.depth);
    if (want) {
      state.keys = Object.create(null);
      state.moving = false;
      state.sprinting = false;
      state.hiding = false;
    }
  }

  function beginGame() {
    initAudio();
    if (audio && audio.ac.state === 'suspended') audio.ac.resume();
    if (state.menuOpen) openMenu(false);
  }

  /* Subtitles are the lines the tape whispers at you; the big centre titles are
   * part of the picture and stay either way. */
  function applySubtitles() {
    el.submessage.style.visibility = state.prefs.subtitles ? '' : 'hidden';
  }


  function wireSettings() {
    const p = state.prefs;

    function range(id, valId, key, fmt, toInput, fromSlider, after) {
      const input = document.getElementById(id);
      const label = document.getElementById(valId);
      input.value = toInput(p[key]);
      label.textContent = fmt(Number(input.value));
      input.addEventListener('input', function () {
        const v = Number(input.value);
        p[key] = fromSlider(v);
        label.textContent = fmt(v);
        if (after) after();
      });
    }

    function check(id, key, after) {
      const box = document.getElementById(id);
      box.checked = !!p[key];
      box.addEventListener('change', function () {
        p[key] = box.checked;
        if (after) after();
      });
    }

    const times = function (v) { return v === 0 ? 'off' : v.toFixed(2) + '\u00d7'; };
    const same = function (v) { return v; };

    range('set-fov', 'set-fov-val', 'fov',
      function (v) { return Math.round(v) + '\u00b0'; },
      function (rad) { return Math.round(rad * 180 / Math.PI); },
      function (deg) { return deg * Math.PI / 180; });
    range('set-sens', 'set-sens-val', 'sens', times, same, same);
    range('set-bright', 'set-bright-val', 'brightness', times, same, same);
    range('set-motion', 'set-motion-val', 'motion', times, same, same);
    range('set-vol', 'set-vol-val', 'volume',
      function (v) { return Math.round(v * 100) + '%'; }, same, same);

    check('set-headbob', 'headbob');
    check('set-dither', 'dither');
    check('set-grain', 'grain');
    check('set-mist', 'mist');
    check('set-tint', 'tint');
    check('set-subtitles', 'subtitles', applySubtitles);
    check('set-fps', 'showFps', function () { el.fps.hidden = !state.prefs.showFps; });
  }

  /* The console. Every switch the game has, plus a live dump of the state, so
   * any behaviour can be reproduced without playing to it. */
  const adminGroups = [];

  function toggleAdmin(show) {
    const want = show == null ? !state.adminOpen : !!show;
    state.adminOpen = want;
    el.admin.hidden = !want;
    if (want) {
      if (state.shopOpen) toggleShop(false);
      state.keys = Object.create(null);
      refreshAdmin();
    }
  }

  function giveAllKit() {
    state.owned = HorrorLib.ITEMS.map(function (i) { return i.id; });
    state.effects = HorrorLib.applyItems(state.owned);
  }

  function togglePref(key) {
    state.prefs[key] = !state.prefs[key];
    if (key === 'showFps') el.fps.hidden = !state.prefs.showFps;
  }

  function buildAdmin() {
    const s = state;
    adminGroups.length = 0;
    adminGroups.push(
      { title: 'Dread', items: [
        { label: 'dread 0', run: function () { s.dreadOverride = 0; } },
        { label: '0.25', run: function () { s.dreadOverride = 0.25; } },
        { label: '0.5', run: function () { s.dreadOverride = 0.5; } },
        { label: '0.75', run: function () { s.dreadOverride = 0.75; } },
        { label: 'dread 1', run: function () { s.dreadOverride = 1; } },
        { label: 'release', run: function () { s.dreadOverride = null; } },
        { label: 'freeze ramp', on: function () { return s.freezeDread; }, run: function () { s.freezeDread = !s.freezeDread; } },
        { label: 'relief max', run: function () { s.atmo.relief = s.atmo.maxRelief; } },
        { label: 'relief 0', run: function () { s.atmo.relief = 0; } },
        { label: 'rewind clock', run: function () { s.atmo.time = 0; s.atmo.relief = 0; s.time = 0; } },
      ] },
      { title: 'Shards & kit', items: [
        { label: '+100', run: function () { s.shards += 100; } },
        { label: '+1000', run: function () { s.shards += 1000; } },
        { label: 'shards 0', run: function () { s.shards = 0; } },
        { label: 'give all kit', run: giveAllKit },
        { label: 'clear kit', run: function () { s.owned = []; s.effects = HorrorLib.applyItems([]); } },
        { label: 'ward +1', run: function () { s.owned.push('palindrome-ward'); s.effects = HorrorLib.applyItems(s.owned); } },
        { label: 'survey rite', run: function () {
          s.owned.push('surveyors-rite');
          s.effects = HorrorLib.applyItems(s.owned);
          s.routeCell = null;
          refreshRoute();
        } },
        { label: 'drop survey', run: function () { s.owned = s.owned.filter(function (o) { return o !== 'surveyors-rite'; }); s.effects = HorrorLib.applyItems(s.owned); refreshRoute(); } },
        { label: 'chart wide/close', run: toggleMinimap },
        { label: 'route?', run: function () {
          el.adminNote.textContent = s.route ? 'route: ' + s.route.length + ' cells, from ' + s.routeCell : 'no route solved';
        } },
      ] },
      { title: 'Player', items: [
        { label: 'to start', run: function () { s.player.x = s.level.start.x; s.player.y = s.level.start.y; } },
        { label: 'to exit', run: function () { s.player.x = s.level.exit.x; s.player.y = s.level.exit.y; } },
        { label: 'to den', run: function () { s.player.x = s.level.den.x; s.player.y = s.level.den.y; } },
        { label: 'to it', run: function () { s.player.x = s.stalker.x; s.player.y = s.stalker.y; } },
        { label: 'full breath', run: function () { s.stamina = 1; } },
        { label: 'noclip', on: function () { return s.noClip; }, run: function () { s.noClip = !s.noClip; } },
      ] },
      { title: 'The presence', items: [
        { label: 'freeze it', on: function () { return s.freezeStalker; }, run: function () { s.freezeStalker = !s.freezeStalker; } },
        { label: 'send to player', run: function () { s.stalker.x = s.player.x; s.stalker.y = s.player.y; } },
        { label: 'send to exit', run: function () { s.stalker.x = s.level.exit.x; s.stalker.y = s.level.exit.y; } },
        { label: 'to its den', run: function () { s.stalker.x = s.level.den.x; s.stalker.y = s.level.den.y; s.stalker.mood = 'den'; s.stalker.timer = 8; } },
        { label: 'speed 0.5x', run: function () { s.stalkerSpeedMul = 0.5; } },
        { label: 'speed 1x', run: function () { s.stalkerSpeedMul = 1; } },
        { label: 'speed 3x', run: function () { s.stalkerSpeedMul = 3; } },
      ] },
      { title: 'Tape & progress', items: [
        { label: 'depth 1', run: function () { s.depth = 1; beginDepth(); } },
        { label: 'next tape', run: function () { s.depth += 1; beginDepth(); } },
        { label: 'depth 6', run: function () { s.depth = 6; beginDepth(); } },
        { label: 'force escape', run: function () { s.player.x = s.level.exit.x; s.player.y = s.level.exit.y; } },
        { label: 'collect tapes', run: function () { s.tapes.forEach(function (t) { if (!t.taken) { t.taken = true; s.shards += s.settings.shardPerTape; } }); } },
        { label: 'reveal map', run: function () { s.explored.revealAll(); } },
        { label: 'into the den', run: function () { s.player.x = s.level.den.x; s.player.y = s.level.den.y; } },
        { label: 'clear map', run: function () { s.explored.clear(); } },
      ] },
      { title: 'View & motion', items: [
        { label: 'dither', on: function () { return s.prefs.dither; }, run: function () { togglePref('dither'); } },
        { label: 'grain', on: function () { return s.prefs.grain; }, run: function () { togglePref('grain'); } },
        { label: 'mist', on: function () { return s.prefs.mist; }, run: function () { togglePref('mist'); } },
        { label: 'red tint', on: function () { return s.prefs.tint; }, run: function () { togglePref('tint'); } },
        { label: 'head bob', on: function () { return s.prefs.headbob; }, run: function () { togglePref('headbob'); } },
        { label: 'levels 2', run: function () { s.levelOverride = 2; } },
        { label: 'levels 3', run: function () { s.levelOverride = 3; } },
        { label: 'levels 8', run: function () { s.levelOverride = 8; } },
        { label: 'levels 16', run: function () { s.levelOverride = 16; } },
        { label: 'levels auto', run: function () { s.levelOverride = null; } },
        { label: 'fps', on: function () { return s.prefs.showFps; }, run: function () { togglePref('showFps'); } },
      ] },
    );

    el.adminBody.innerHTML = '';
    for (let gi = 0; gi < adminGroups.length; gi++) {
      const g = adminGroups[gi];
      const box = document.createElement('div');
      box.className = 'admin-group';
      const heading = document.createElement('h3');
      heading.textContent = g.title;
      box.appendChild(heading);
      const row = document.createElement('div');
      row.className = 'admin-actions';
      for (let i = 0; i < g.items.length; i++) {
        const item = g.items[i];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'admin-btn';
        btn.textContent = item.label;
        btn.addEventListener('click', function () { item.run(); refreshAdmin(); });
        item.el = btn;
        row.appendChild(btn);
      }
      box.appendChild(row);
      el.adminBody.appendChild(box);
    }
  }

  function refreshAdmin() {
    const s = state;
    for (let gi = 0; gi < adminGroups.length; gi++) {
      const items = adminGroups[gi].items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].el && items[i].on) items[i].el.classList.toggle('on', !!items[i].on());
      }
    }
    // While the console is open update() is paused, so the dread switches have
    // to be resolved here — otherwise the picture would not change until you
    // closed it again, which is useless for testing.
    if (s.dreadOverride != null) s.atmo.dread = HorrorLib.clamp(s.dreadOverride, 0, 1);
    else s.atmo.dread = HorrorLib.clamp(s.atmo.progress() - s.atmo.relief, 0, 1);

    let taken = 0;
    for (let i = 0; i < s.tapes.length; i++) if (s.tapes[i].taken) taken++;
    el.adminState.textContent = [
      'phase     ' + s.phase + (s.menuOpen ? ' (menu)' : '') + (s.adminOpen ? ' (console)' : '') + (s.shopOpen ? ' (shop)' : ''),
      'depth     ' + s.depth + '    tapes ' + taken + '/' + s.tapes.length,
      'dread     ' + s.atmo.dread.toFixed(3) + '   raw ' + s.atmo.progress().toFixed(3) + '   relief ' + s.atmo.relief.toFixed(2) + '/' + s.atmo.maxRelief,
      'mood      tint ' + s.atmo.tintAmount().toFixed(3) + '  fog ' + s.atmo.fogDensity().toFixed(3) + '  static ' + s.atmo.staticAmount().toFixed(3),
      'shards    ' + s.shards + '   kit [' + s.owned.join(' ') + ']',
      'player    ' + s.player.x.toFixed(2) + ',' + s.player.y.toFixed(2) + '   angle ' + s.player.angle.toFixed(2) + '   breath ' + s.stamina.toFixed(2),
      'stalker   ' + s.stalker.x.toFixed(2) + ',' + s.stalker.y.toFixed(2) + '   dist ' + (s.proximity == null ? '-' : s.proximity.toFixed(2)) + '   x' + s.stalkerSpeedMul,
      'explored  ' + s.explored.seenCount() + '/' + (s.explored.cols * s.explored.rows) + '   hiding ' + s.hiding,
      'render    ' + SCENE_W + 'x' + SCENE_H + '   levels ' + (s.levelOverride == null ? 'auto' : s.levelOverride) + (s.prefs.dither ? '' : '   dither off') + '   fps ' + s.fps,
    ].join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* input                                                             */
  /* ------------------------------------------------------------------ */

  window.addEventListener('keydown', function (e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    // the test console owns the keyboard while it is open
    if (state.adminOpen) {
      if (e.key === 'Escape' || k === '`') toggleAdmin(false);
      e.preventDefault();
      return;
    }

    // so does the guide while the menu is up
    if (state.menuOpen) {
      if (e.key === 'Enter') { beginGame(); e.preventDefault(); }
      else if (k === '`') { toggleAdmin(true); e.preventDefault(); }
      return;
    }

    if (state.shopOpen) {
      if (e.key === 'Escape' || k === 'b') { toggleShop(false); e.preventDefault(); return; }
      if (k >= '1' && k <= '9') {
        const item = HorrorLib.ITEMS[Number(k) - 1];
        if (item) buyItem(item.id);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }

    if (k === '`') { toggleAdmin(true); e.preventDefault(); return; }
    if (e.key === 'Escape') { openMenu(true); e.preventDefault(); return; }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(e.key) !== -1) e.preventDefault();
    state.keys[k] = true;
    // keep Shift etc. under their real names too
    state.keys[e.key] = true;

    if (k === 'b') { toggleShop(true); return; }

    if (k === 'm') { toggleMinimap(); return; }

    if (e.key === 'r' || e.key === 'R') {
      if (state.phase === 'escaped' || state.phase === 'den') state.depth += 1;
      else if (state.phase === 'caught') state.depth = 1;
      beginDepth();
      return;
    }

    beginGame();
  });

  window.addEventListener('keyup', function (e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    state.keys[k] = false;
    state.keys[e.key] = false;
  });

  canvas.addEventListener('pointerdown', function (e) {
    beginGame();
    state.dragging = true;
    state.lastPointerX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastPointerX;
    state.lastPointerX = e.clientX;
    if (state.phase === 'playing' && !state.shopOpen && !state.menuOpen && !state.adminOpen) {
      state.player.turn(dx * DRAG_LOOK * state.prefs.sens);
    }
  });

  canvas.addEventListener('pointerup', function () {
    state.dragging = false;
  });

  window.addEventListener('blur', function () {
    state.keys = Object.create(null);
    state.dragging = false;
  });

  window.addEventListener('resize', resize);

  /* ------------------------------------------------------------------ */
  /* boot                                                              */
  /* ------------------------------------------------------------------ */

  state.prefs = Object.assign({}, DEFAULT_PREFS);
  state.effects = HorrorLib.applyItems(state.owned);
  clockStart = Date.now();
  newRun();
  state.phase = 'playing';   // the menu pauses the run; there is no intro state
  buildShop();
  buildAdmin();
  wireSettings();
  applySubtitles();
  openMenu(true);
  el.message.textContent = '';
  el.submessage.textContent = '';
  el.hint.textContent = 'Tape ' + pad2(state.depth) + ' · WASD move · Q/E strafe · Shift run · C hide · B shop · Esc menu · ` console.';
  resize();
  window.requestAnimationFrame(frame);

  /* Expose a tiny handle so the browser tests can poke the game. */
  window.HorrorApp = {
    state: state,
    toggleShop: toggleShop,
    buyItem: buyItem,
    beginDepth: beginDepth,
    openMenu: openMenu,
    toggleAdmin: toggleAdmin,
    generateLevel: HorrorLib.generateLevel,
    giveAllKit: giveAllKit,
    refreshAdmin: refreshAdmin,
    effects: function () { return state.effects; },
    prefs: function () { return state.prefs; },
    scene: { w: SCENE_W, h: SCENE_H, levels: COLOUR_LEVELS },
    route: function () { return state.route; },
    stalkerMood: function () { return state.stalker.mood; },
    minimapTiles: function () { return MM_TILES; },
    setMinimapTiles: setMinimapTiles,
    toggleMinimap: toggleMinimap,
    refreshRoute: refreshRoute,
    /* Move the player without walking, for tests and the console. */
    warp: function (x, y) {
      state.player.x = x;
      state.player.y = y;
      state.routeCell = null;
      return { x: state.player.x, y: state.player.y };
    },
    /* Run full render passes synchronously. This exists because the picture is
     * where the two-vanishing bug lived, and a test that only ticks `update()`
     * would never have caught it. */
    renderPasses: function (n) {
      const count = n || 1;
      for (let i = 0; i < count; i++) drawFrame();
      return count;
    },
    /* Tick the simulation by hand. The overlays pause `frame()`, so any test
     * that wants the world to move while a panel is open lifts them first. */
    tick: function (seconds, steps) {
      const n = steps || Math.max(1, Math.round(seconds * 60));
      const dt = seconds / n;
      const paused = [state.shopOpen, state.adminOpen, state.menuOpen];
      state.shopOpen = false;
      state.adminOpen = false;
      state.menuOpen = false;
      for (let i = 0; i < n; i++) update(dt);
      state.shopOpen = paused[0];
      state.adminOpen = paused[1];
      state.menuOpen = paused[2];
      return state.phase;
    },
  };
})();
