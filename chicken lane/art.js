/* art.js — every pixel Chicken Lane draws.
 *
 * The stage is side-on, so the sprites the packs actually contain are the ones
 * used: profiles. Two packs supply the art, both optional:
 *
 *   32rogues (Seth Boyles)
 *     animals.png          rows 9-15 — cattle, horses, buffalo, yaks, boars,
 *                          sheep and goats, plus the bird picker on rows 13-14
 *     items.png             row 24 — coins
 *     animated-tiles.png    row 7 — a four-frame lantern
 *
 *   free_pixel_16_woods
 *     16 px ground tiles and single-cell props (grass, packed earth, tufts,
 *     flowers, boulders), used for the verges and the track itself.
 *
 * Neither pack may be redistributed, and this repository is public, so `Assets/`
 * is gitignored (see README). Everything here has a hand-drawn stand-in of the
 * same size, so layout, hitboxes, camera and feel are identical without them —
 * only the pixels differ. Nothing in this file requires the packs to work.
 *
 * Rules for everything in here:
 *   - nearest-neighbour, always: imageSmoothingEnabled = false
 *   - integer positions and integer scale sizes; a sprite never lands on 10.4 px
 *   - draw in CSS pixels; the caller owns canvas sizing
 */
'use strict';

var Art = (function () {
  const R = Math.round;

  const SHEETS = {
    animals: 'Assets/32rogues-0.5.0/32rogues/animals.png',
    items: 'Assets/32rogues-0.5.0/32rogues/items.png',
    anim: 'Assets/32rogues-0.5.0/32rogues/animated-tiles.png',
    woods: 'Assets/pixel_16_woods v2 free/free_pixel_16_woods.png',
  };

  const CELL = 32;
  const TILE = 16;

  /* Cell coordinates, read off the sheets with a labelled grid and checked
     against the packs' own index files. */
  const BIRDS = [
    { id: 'rooster', label: 'Rooster', sheet: 'animals', cx: 1, cy: 14 },
    { id: 'chicken', label: 'Chicken', sheet: 'animals', cx: 0, cy: 14 },
    { id: 'duck', label: 'Duck', sheet: 'animals', cx: 2, cy: 14 },
    { id: 'goose', label: 'Goose', sheet: 'animals', cx: 3, cy: 14 },
    { id: 'turkey', label: 'Turkey', sheet: 'animals', cx: 4, cy: 14 },
    { id: 'peacock', label: 'Peacock', sheet: 'animals', cx: 6, cy: 14 },
    { id: 'penguin', label: 'Penguin', sheet: 'animals', cx: 0, cy: 13 },
    { id: 'cassowary', label: 'Cassowary', sheet: 'animals', cx: 2, cy: 13 },
    { id: 'emu', label: 'Emu', sheet: 'animals', cx: 3, cy: 13 },
  ];

  /* The traffic. Farm animals in profile, all facing right on the sheet, each
     with a coat colour for the hand-drawn stand-in. */
  const HERDS = [
    { id: 'cow', label: 'Cow', cx: 0, cy: 9, coat: '#a9552c' },
    { id: 'horse', label: 'Horse', cx: 1, cy: 9, coat: '#8d5a37' },
    { id: 'buffalo', label: 'Buffalo', cx: 2, cy: 10, coat: '#71707f' },
    { id: 'yak', label: 'Yak', cx: 3, cy: 10, coat: '#8f4a22' },
    { id: 'reindeer', label: 'Reindeer', cx: 1, cy: 10, coat: '#3f5a6e' },
    { id: 'boar', label: 'Boar', cx: 7, cy: 9, coat: '#8a6a4a' },
    { id: 'ram', label: 'Ram', cx: 3, cy: 15, coat: '#6f8896' },
  ];

  const COIN_CELL = { cx: 0, cy: 24 };
  const COIN_PILE_CELL = { cx: 2, cy: 24 };
  const LANTERN_ROW = 7;
  const LANTERN_FRAMES = 4;

  /* Solid ground fills and single-cell props from the woods sheet. */
  const GROUND_CELLS = {
    grass: { cx: 11, cy: 3, tint: '#4f8f34' },
    dirt: { cx: 7, cy: 3, tint: '#b98a5e' },
  };
  const PROP_CELLS = {
    tuft: { cx: 14, cy: 8 },
    flower: { cx: 16, cy: 3 },
    rock: { cx: 14, cy: 2 },
  };

  const state = {
    loaded: false,
    atlas: {},
    useAtlas: true,
  };

  /* ------------------------------------------------------- hand-drawn stand-in
   * Drawn from characters so it is editable as text. Used only when a pack is
   * absent; sizes match the 32 px sprites closely enough that nothing shifts.
   */
  const BIRD_ART = [
    '................',
    '................',
    '.....rr.........',
    '....rrrr........',
    '....rWWWr.......',
    '...WWkWWWW......',
    '..aWWWWWWWW.....',
    'aaaWWWWWWWWW....',
    '..aWWSSWWWWW....',
    '...WWSSWWWW.....',
    '....WWWWWWW.....',
    '....WW..WW......',
    '....yy..yy......',
    '...yyy..yyy.....',
    '................',
    '................',
  ];

  const BIRD_INK = {
    r: '#e0574d',
    W: '#f2f4f9',
    S: '#cdd4e2',
    a: '#e8a24a',
    y: '#e8a24a',
    k: '#12141a',
  };

  /* Eight body colours so the bird picker still has eight options offline. */
  const FALLBACK_TINTS = [
    '#f2f4f9', '#f4d7c2', '#dff0f5', '#f7e9c9',
    '#e6d9f2', '#c9e8d2', '#f2c9d4', '#d9e2f7',
  ];

  /* A blocky quadruped in profile, facing right, for the no-pack case. */
  const BEAST_ART = [
    '................',
    '..........hhh...',
    '..HHHHHHHHHHH...',
    '.HHHHHHHHHHHHHH.',
    '.HHHHHHHHHHHHHH.',
    '.HHHHHHHHHHHHkk.',
    '.HHHHHHHHHHHHHH.',
    '.HHHHHHHHHHHHH..',
    '..HHHHHHHHHHH...',
    '..HHHHHHHHHH....',
    '..HH..HH..HH....',
    '..HH..HH..HH....',
    '..HH..HH..HH....',
    '..kk..kk..kk....',
    '................',
    '................',
  ];

  /* --------------------------------------------------------------- loading */

  function loadImage(src) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = src;
    });
  }

  /** Resolves once the packs have been tried. Never rejects. */
  function load(opts) {
    const force = opts && opts.code;
    if (force) {
      state.useAtlas = false;
      state.loaded = true;
      return Promise.resolve(false);
    }
    const names = Object.keys(SHEETS);
    return Promise.all(names.map(function (name) {
      return loadImage(SHEETS[name]);
    })).then(function (images) {
      let found = 0;
      names.forEach(function (name, i) {
        if (images[i]) {
          state.atlas[name] = images[i];
          found += 1;
        }
      });
      state.useAtlas = found > 0;
      state.loaded = true;
      return state.useAtlas;
    });
  }

  function sheet(name) {
    return state.useAtlas ? state.atlas[name] || null : null;
  }

  /* ------------------------------------------------------------------ birds */

  function birdById(id) {
    for (const bird of BIRDS) if (bird.id === id) return bird;
    return BIRDS[0];
  }

  function birdIndex(id) {
    for (let i = 0; i < BIRDS.length; i++) if (BIRDS[i].id === id) return i;
    return 0;
  }

  /**
   * Draw a bird standing on (cx, feetY).
   *
   * `height` is the desired sprite height in CSS pixels; the real scale is
   * snapped to an integer multiple of the 32 px cell (or the 16 px stand-in), so
   * the pixels stay square. `squashX` / `squashY` stretch the *destination* box
   * in whole pixels rather than scaling the context — a chunky pixel squash
   * instead of a resampled one.
   */
  function bird(ctx, id, cx, feetY, height, opts) {
    const o = opts || {};
    const entry = birdById(id);
    const img = sheet(entry.sheet);
    const flip = o.flip !== false; // the sheets draw birds facing left
    const rot = o.rot || 0;
    const squashX = o.squashX || 1;
    const squashY = o.squashY || 1;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(R(cx), R(feetY));
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);

    if (img) {
      const scale = Math.max(1, Math.round(height / CELL));
      const w = Math.max(2, R(CELL * scale * squashX));
      const h = Math.max(2, R(CELL * scale * squashY));
      ctx.drawImage(
        img,
        entry.cx * CELL,
        entry.cy * CELL,
        CELL,
        CELL,
        R(-w / 2),
        R(-h),
        w,
        h
      );
    } else {
      const scale = Math.max(1, Math.round(height / 16));
      const tint = FALLBACK_TINTS[birdIndex(id) % FALLBACK_TINTS.length];
      const cellW = 16 * scale;
      const cellH = 16 * scale;
      const boxW = Math.max(1, R(cellW * squashX));
      const boxH = Math.max(1, R(cellH * squashY));
      const pxW = boxW / 16;
      const pxH = boxH / 16;
      for (let row = 0; row < 16; row++) {
        const line = BIRD_ART[row];
        for (let col = 0; col < 16; col++) {
          const glyph = line[col];
          if (glyph === '.') continue;
          let colour = BIRD_INK[glyph];
          if (glyph === 'W') colour = tint;
          ctx.fillStyle = colour;
          ctx.fillRect(
            R(-boxW / 2 + col * pxW),
            R(-boxH + row * pxH),
            Math.max(1, Math.ceil(pxW)),
            Math.max(1, Math.ceil(pxH))
          );
        }
      }
    }

    ctx.restore();
  }

  /** A small standalone canvas of one bird, for the picker buttons. */
  function birdCanvas(id, px) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(px * dpr);
    canvas.style.width = px + 'px';
    canvas.style.height = px + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    bird(ctx, id, px / 2, px - 2, px - 6);
    return canvas;
  }

  /* ----------------------------------------------------------------- herds */

  function herdById(id) {
    for (const herd of HERDS) if (herd.id === id) return herd;
    return HERDS[0];
  }

  /**
   * Draw one animal standing on (cx, feetY), facing the way it is walking.
   * The sheets draw every animal facing right, so a leftward walk is a flip.
   */
  function beast(ctx, id, cx, feetY, height, dir) {
    const entry = herdById(id);
    const img = sheet('animals');
    const facing = dir < 0 ? -1 : 1;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(R(cx), R(feetY));
    if (facing < 0) ctx.scale(-1, 1);

    if (img) {
      const scale = Math.max(1, Math.round(height / CELL));
      const s = CELL * scale;
      ctx.drawImage(
        img,
        entry.cx * CELL,
        entry.cy * CELL,
        CELL,
        CELL,
        R(-s / 2),
        -s,
        s,
        s
      );
    } else {
      const scale = Math.max(1, Math.round(height / 16));
      const s = 16 * scale;
      const px = s / 16;
      for (let row = 0; row < 16; row++) {
        const line = BEAST_ART[row];
        for (let col = 0; col < 16; col++) {
          const glyph = line[col];
          if (glyph === '.') continue;
          ctx.fillStyle = glyph === 'k' ? '#241a14' : glyph === 'h' ? '#e6d6ae' : entry.coat;
          ctx.fillRect(
            R(-s / 2 + col * px),
            R(-s + row * px),
            Math.max(1, Math.ceil(px)),
            Math.max(1, Math.ceil(px))
          );
        }
      }
    }

    ctx.restore();
  }

  /* ----------------------------------------------------------------- ground */

  const tileCache = new Map();

  function tileCanvas(kind, scale) {
    const key = kind + ':' + scale;
    if (tileCache.has(key)) return tileCache.get(key);
    const spec = GROUND_CELLS[kind] || GROUND_CELLS.grass;
    const img = sheet('woods');
    const canvas = document.createElement('canvas');
    canvas.width = TILE * scale;
    canvas.height = TILE * scale;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    if (img) {
      c.drawImage(img, spec.cx * TILE, spec.cy * TILE, TILE, TILE, 0, 0, canvas.width, canvas.height);
    } else {
      c.fillStyle = spec.tint;
      c.fillRect(0, 0, canvas.width, canvas.height);
      // A little grain, so the fallback is a surface rather than a flat wash.
      c.fillStyle = 'rgba(0, 0, 0, 0.12)';
      const step = Math.max(2, scale * 4);
      for (let y = 0; y < canvas.height; y += step) {
        for (let x = (y / step) % 2 ? 0 : step / 2; x < canvas.width; x += step) {
          c.fillRect(x, y, scale, scale);
        }
      }
    }
    tileCache.set(key, canvas);
    return canvas;
  }

  const patternCache = new Map();

  /** A repeating fill for a ground kind. Returns null if patterns are missing. */
  function ground(ctx, kind, scale) {
    const key = kind + ':' + scale;
    if (patternCache.has(key)) return patternCache.get(key);
    const pattern = ctx.createPattern ? ctx.createPattern(tileCanvas(kind, scale), 'repeat') : null;
    patternCache.set(key, pattern);
    return pattern;
  }

  /** A single-cell prop (tuft, flower, boulder) standing on (cx, bottomY). */
  function prop(ctx, kind, cx, bottomY, height) {
    const img = sheet('woods');
    const spec = PROP_CELLS[kind];
    if (!img || !spec) return false;
    const scale = Math.max(1, Math.round(height / TILE));
    const s = TILE * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      img,
      spec.cx * TILE,
      spec.cy * TILE,
      TILE,
      TILE,
      R(cx - s / 2),
      R(bottomY - s),
      s,
      s
    );
    ctx.restore();
    return true;
  }

  /* ------------------------------------------------------------------ coins */

  function coin(ctx, x, y, size, opts) {
    const o = opts || {};
    const img = sheet('items');
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = o.alpha === undefined ? 1 : Math.max(0, o.alpha);
    if (o.rot) {
      ctx.translate(x, y);
      ctx.rotate(o.rot);
      x = 0;
      y = 0;
    }
    if (img) {
      const cell = o.pile ? COIN_PILE_CELL : COIN_CELL;
      const scale = Math.max(1, Math.round(size / CELL));
      const s = CELL * scale;
      ctx.drawImage(img, cell.cx * CELL, cell.cy * CELL, CELL, CELL, R(x - s / 2), R(y - s / 2), s, s);
    } else {
      const s = Math.max(2, R(size / 2));
      ctx.fillStyle = '#8a6a24';
      ctx.fillRect(R(x - s / 2), R(y - s / 2), s, s);
      ctx.fillStyle = '#e8c26a';
      ctx.fillRect(R(x - s / 2) + 1, R(y - s / 2) + 1, s - 2, s - 2);
      ctx.fillStyle = '#fff2c4';
      ctx.fillRect(R(x - s / 2) + 1, R(y - s / 2) + 1, 1, 1);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- lanterns */

  function lantern(ctx, x, y, size, frame) {
    const img = sheet('anim');
    if (!img) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const scale = Math.max(1, Math.round(size / CELL));
    const s = CELL * scale;
    const step = ((frame | 0) % LANTERN_FRAMES + LANTERN_FRAMES) % LANTERN_FRAMES;
    ctx.drawImage(
      img,
      step * CELL,
      LANTERN_ROW * CELL,
      CELL,
      CELL,
      R(x - s / 2),
      R(y - s / 2),
      s,
      s
    );
    ctx.restore();
    return true;
  }

  function hasLantern() {
    return !!sheet('anim');
  }

  /* ------------------------------------------------------------------ misc */

  /** A chunky 1-2 px dust puff, drawn as rects so it stays pixel-crisp. */
  function dust(ctx, x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = '#8f95a8';
    const s = Math.max(1, R(size));
    ctx.fillRect(R(x), R(y), s, s);
    ctx.fillRect(R(x - s), R(y + s), s, s);
    ctx.fillRect(R(x + s), R(y), s, s);
    ctx.restore();
  }

  function feather(ctx, x, y, size, alpha, rot) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(R(x), R(y));
    if (rot) ctx.rotate(rot);
    ctx.fillStyle = '#f2f4f9';
    const s = Math.max(1, R(size));
    ctx.fillRect(-s, 0, s * 3, Math.max(1, s));
    ctx.restore();
  }

  return {
    CELL,
    TILE,
    BIRDS,
    HERDS,
    BIRD_INK,
    FALLBACK_TINTS,
    load,
    bird,
    birdCanvas,
    birdById,
    birdIndex,
    beast,
    herdById,
    ground,
    prop,
    coin,
    lantern,
    hasLantern,
    dust,
    feather,
    usingAtlas: function () {
      return state.useAtlas;
    },
    isLoaded: function () {
      return state.loaded;
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Art;
