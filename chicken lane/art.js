/* art.js — every pixel Chicken Lane draws.
 *
 * The playfield is pixel art on a 32 px grid. Three sprite sheets are used from
 * the "32rogues" pack (Seth Boyles) when it is present on disk:
 *
 *   animals.png        row 14 — chicken, rooster, duck, goose, swan, turkey,
 *                      guineafowl, peacock; row 13 — penguin, cassowary, emu
 *   items.png          row 24 — coins (single, small stack, large stack, purse)
 *   animated-tiles.png row 7  — a four-frame lantern
 *
 * That pack's licence does not permit redistribution, so the sheets are NOT in
 * the repository (see .gitignore and README). When they are missing, every
 * sprite here falls back to a hand-drawn stand-in of the same size and pose, so
 * the layout, hitboxes, camera and feel are identical either way — only the
 * pixels differ. Nothing in this file requires the pack to work.
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
  };

  const CELL = 32;

  /* Cell coordinates, read off the sheets with a labelled grid. */
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

  const COIN_CELL = { cx: 0, cy: 24 };
  const COIN_PILE_CELL = { cx: 2, cy: 24 };
  const LANTERN_ROW = 7;
  const LANTERN_FRAMES = 4;

  const state = {
    loaded: false,
    atlas: {},
    useAtlas: true,
  };

  /* ------------------------------------------------------- hand-drawn stand-in
   * A 16x16 chicken, drawn from characters so it is editable as text. Used only
   * when the pack is absent; the shape and pose match the 32 px sprite closely
   * enough that nothing in the layout shifts.
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

  /** Resolves once the pack has been tried. Never rejects. */
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

  /* ------------------------------------------------------------------- cars */

  /* Muted body tones, snapped against the night asphalt. */
  const CAR_TONES = ['#2b3140', '#333a4b', '#3a2f38', '#2c3a3c', '#3b3630'];

  function car(ctx, cx, cy, width, length, tone, dir, truck) {
    const w = Math.max(8, R(width));
    const len = Math.max(14, R(length));
    const x = R(cx - w / 2);
    const y = R(cy - len / 2);
    const body = tone || CAR_TONES[0];

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // contact shadow, offset so the car sits on the asphalt
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x + 2, y + 3, w, len);

    // one pixel of outline keeps the silhouette legible at night
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(x - 1, y - 1, w + 2, len + 2);
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, len);

    // roof highlight down the middle, so the body is not a flat slab
    ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.fillRect(x + R(w * 0.38), y + 3, Math.max(1, R(w * 0.24)), len - 6);

    // two glass panes with a body-coloured pillar between them
    const glass = Math.max(0, R(w * 0.17));
    const winW = Math.max(2, w - glass * 2);
    const winLen = Math.max(3, R(len * (truck ? 0.11 : 0.16)));
    const frontY = dir > 0 ? y + R(len * 0.6) : y + R(len * 0.17);
    const backY = dir > 0 ? y + R(len * 0.17) : y + R(len * 0.63);
    ctx.fillStyle = 'rgba(150, 172, 205, 0.42)';
    ctx.fillRect(x + glass, frontY, winW, winLen);
    ctx.fillRect(x + glass, backY, winW, winLen);

    // bonnet seam
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x + 1, dir > 0 ? y + len - R(len * 0.24) : y + R(len * 0.23), w - 2, 1);

    // headlights at the nose, tail lights at the back
    const noseY = dir > 0 ? y + len - 3 : y + 1;
    const tailY = dir > 0 ? y + 1 : y + len - 3;
    ctx.fillStyle = '#ffe9b8';
    ctx.fillRect(x + 1, noseY, 2, 2);
    ctx.fillRect(x + w - 3, noseY, 2, 2);
    ctx.fillStyle = 'rgba(224, 87, 77, 0.85)';
    ctx.fillRect(x + 1, tailY, 2, 2);
    ctx.fillRect(x + w - 3, tailY, 2, 2);

    ctx.restore();
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
    BIRDS,
    CAR_TONES,
    BIRD_INK,
    FALLBACK_TINTS,
    load,
    bird,
    birdCanvas,
    birdById,
    birdIndex,
    coin,
    lantern,
    hasLantern,
    car,
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
