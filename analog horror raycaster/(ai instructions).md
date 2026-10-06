# AI instructions for the Analog Horror Raycaster project

A small, dependency-free browser raycasting horror game. Keep the engine core
separate from the browser presentation layer.

## Before working

- Read this file and [`README.md`](README.md).
- For engine behaviour (level, rays, fog, movement, pursuit, the den, the
  solver, the shop, collectibles, difficulty), read `raycast.js` and the
  relevant cases in `test.js`.
- For rendering, the dither/post pass, the minimap, the shop UI, audio, or
  input, read `app.js`, `index.html`, and `style.css` as needed.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `raycast.js` | `World`, `generateLevel` (`FLOOR`/`WALL`/`EXIT`/`DEN`, and a `den` on the level), `castRay`, `castColumns`, `fogFactor`, `Atmosphere` (incl. `progress`, `calm`, `relax`, `relief`/`maxRelief`), `Player`, `Stalker` (incl. `setHome`, `mood`, `update`), `STALKER_HUNT`/`STALKER_GRACE`/`STALKER_SIGHT_KEEP`, `solvePath`, `isDeadEnd`, `farthestDeadEnd`, the seeded RNG, and the metastructure: `ITEMS`/`ITEM_BY_ID`/`EFFECT_RULES`, `applyItems`, `canBuy`, `placeCollectibles`, `collectNear`, `Explored` (incl. `revealAll`, `clear`), `depthSettings`. No DOM; exports `HorrorLib` for Node and the browser. |
| `app.js` | Scene rendering, palette dither, procedural textures (mist/grain), the analog-horror post pass, the minimap, the shop UI, the main menu + settings + secret test console, procedural audio, input, and the game loop. Depends on `raycast.js`. |
| `index.html` | Canvas, CRT overlay, HUD structure, minimap canvas, and the shop panel; script load order (`raycast.js` before `app.js`). |
| `style.css` | Scanlines, vignette, HUD, gauges, minimap, and shop styling. |
| `test.js` | Node.js tests for the engine core, not browser rendering tests. |
| `README.md` | User-facing setup, controls, the item table, how it works, and test instructions. |

## Performance budget (do not regress this)

The renderer runs at a **288×162** buffer and must hold ~60 FPS while the
analog post pass runs every frame. That pass is easy to blow up; a full-canvas
`fillRect` or a self-`drawImage` costs real milliseconds on a 1000×700 canvas.
Measured rules, learned the hard way:

- **Never add a full-canvas alpha fill for a per-frame effect.** The heartbeat
  vignette is a composited **CSS layer** (`#heartbeat`) whose `opacity` is set
  from `present()`; three full-canvas fills per frame cost ~25 FPS.
- **Fold per-pixel preferences into a pass that already runs.** Brightness
  multiplies each channel inside `ditherScene` (which visits every pixel anyway)
  and measured *free* in an A/B. The same effect as a canvas `fillRect` cost
  ~8 FPS, and as `filter: brightness()` on the canvas it was worse still — do
  not reach for a filter to avoid writing the loop.
- **Do not add extra full-frame `drawImage(scene, …)` passes.** A single ghost
  draw was enough to lose 7 FPS; it was removed for that reason.
- `renderFlats` casts **one row at a time**. Duplicating rows halved the cost
  but flattened the floor into bands and erased the depth cue you steer by, so
  that optimisation was reverted — it made the game unreadable. Buy the frame
  rate back with the lookup table, never by casting fewer rows.
- `FLAT_TONE` is a 16-entry table for the checker pattern, and each row
  pre-folds its fog and lit base into `br`/`bg`/`bb`, leaving one multiply-add
  per channel per pixel.
- Write the flats through the persistent `sceneBuf` byte array and avoid
  `Math.floor` in the inner loop (use `| 0`); allocation-free per frame.
- Wall columns draw **two** brick bands, not three.
- Reuse `grain`/`mist` canvases; cache any gradient you can (the old vignette
  gradient is gone, but the eye light still builds one — only when owned).
- If you add an effect, re-measure: drive the page and count frames over 2 s,
  at low **and** raised dread (`state.atmo.time = 60`).

## Project constraints

- Keep the project dependency-free and runnable by opening `index.html` from
  disk; do not add a bundler, server requirement, or package dependency unless
  explicitly requested.
- **Do not import across projects.** The Surveyor's Rite deliberately
  re-implements the BFS solver from `maze generator and solver` in `raycast.js`
  rather than requiring that folder; every project here is self-contained.
- Keep `raycast.js` independent of the browser so it stays testable in Node.
- Preserve the browser global (`HorrorLib`) and Node export behavior.
- **All randomness in the core goes through `makeRng(seed)`** — never
  `Math.random()` in `raycast.js`. The same seed must build the same maze and
  the same tape placement. (`app.js` may use `Math.random()` for cosmetic
  effects, fresh seeds, and audio noise.)
- **`castRay` must return the *perpendicular* wall distance**, not the
  Euclidean distance along the ray — that is what keeps walls straight and
  free of fisheye. Do not "fix" it to the ray length.
- **`Stalker` must never enter a wall.** It checks the destination cell per
  axis before moving; keep that guard when changing its behaviour.
- **`generateLevel` must stay connected** (a perfect maze) with the exit at the
  farthest cell, so a run is always winnable. The **den** is placed at the
  farthest *dead end* that is neither the exit nor the start, and `DEN` is
  walkable, so it never blocks a route.
- **`placeCollectibles` must skip `DEN` as well as `EXIT`.** Do not let a tape
  spawn inside the den.
- **A zero distance must never reach a gradient.** `drawExitGlow`, `drawDenGlow`,
  `drawTapes` and `drawStalker` each guard `!(dist > 0.05)` and clamp their
  height/radius. Standing exactly on the exit made `dist` 0, and the resulting
  infinite radius threw inside `createRadialGradient` every frame, which killed
  the animation loop outright. Any new world-space glow needs the same guard.
- **Schedule `requestAnimationFrame` before doing the work, and keep the
  `try/catch` in `frame()`.** Re-arming it at the end of the frame means one
  throw freezes the game permanently into a picture that accepts no input. The
  fault is still reported with `console.error`, so browser checks fail loudly
  rather than silently swallowing it.
- **Draw through `drawFrame()`.** It is the single scene→dither→present
  pipeline, shared by the loop and the `renderPasses()` test hook. A test hook
  with its own pipeline once read a stale frame and "proved" the monster did not
  draw.
- **The ending checks are order-sensitive.** Catch first, then den, then exit.
  Standing on IT must always end you, and the den pays only while IT is away —
  otherwise walking into the monster's bedroom while it is lying there would
  reward you.
- **Do not put a `//` comment on a line that still has code after it.** A
  trailing comment once swallowed the `B` shop hotkey, and the browser test
  passed anyway because it clicked the DOM row instead of pressing the key. Test
  hotkeys by *pressing* them.
- **Keep the game winnable and solvable.** Item effects, the shard economy, and
  the depth curve must not dead-end a run; a fresh run with no kit has to be
  survivable, which is what the tape-1 difficulty is tuned for.
- **Balance numbers live in the core, not the UI.** Costs, effect magnitudes,
  shard payouts, and depth scaling belong in `ITEMS`, `EFFECT_RULES`, and
  `depthSettings` so they stay testable. `app.js` reads aggregated effects via
  `applyItems` — do not hand-roll effect maths in the UI.
- Angles follow screen space: `+x` east, `+y` south, `0` faces east. Keep the
  map `grid[y][x]` / `tiles[y * cols + x]` indexing consistent with the
  renderer *and* the minimap.
- **Readability outranks mood.** `tintAmount()` is capped at 0.2 and the
  heartbeat vignette at `0.12 + proximity * 0.22`. An earlier build washed the
  screen red at 0.5 and you could no longer see the geometry, which makes the
  maze unplayable. Express dread through fog, grain, shake and colour shift
  instead of a heavier wash, and re-check legibility before raising either.
- **Hiding must stay capped.** `Atmosphere.maxRelief` (0.6) is what keeps hiding
  a breathing space rather than a win button: `progress()` keeps climbing under
  `relief`, so the dread always comes back. Do not let relief reach 1.
- **Resolution is a navigability budget, not a style dial.** `SCENE_W`/`SCENE_H`
  (288×162) and `DITHER_STRENGTH` (0.55) were changed *after* 192×108 at full
  dither strength with a 3-level palette crush made the corridors unreadable.
  The retro look comes from the low-res buffer, the palette, and
  nearest-neighbour upscaling — not from starving the geometry of information.
  Do not lower either without re-checking that the maze is still navigable.

## The test console (secret, and how to drive it)

`` ` `` opens a paused overlay with every switch in the game and a live state
dump. It exists so any behaviour can be reproduced without playing up to it, and
it is the fastest way to verify a rendering or atmosphere change in a browser.

Use it — or `window.HorrorApp` directly — before reaching for manual play:

```js
// from tools/check.sh --eval, or DevTools
const A = window.HorrorApp, s = A.state;
A.toggleAdmin(true);      // or press `
A.openMenu(false);        // or press Enter / Esc
A.giveAllKit();           // install every catalogue item
s.dreadOverride = 1;      // pin dread (null releases it)
s.freezeDread = true;     // stop the ramp
s.noClip = true;          // walk through walls
s.freezeStalker = true;   // stop it moving
s.explored.revealAll();   // full map
s.levelOverride = 3;      // force the dither level count
A.beginDepth();           // rebuild the current tape
A.warp(x, y);             // teleport without walking
A.tick(1.5);              // advance the sim by hand (~90 steps)
A.renderPasses(3);        // run full draw passes synchronously
A.route();                // the solved route, or null
A.stalkerMood();          // 'hunt' | 'withdraw' | 'den'
A.minimapTiles();         // 25 or 41
A.toggleMinimap();        // same as pressing M
```

`tick()` and `renderPasses()` exist because the overlays pause `frame()`: any
test that wants the world or the picture to move while a panel is open uses
them. `renderPasses()` goes through `drawFrame()`, so it renders exactly what
ships.

Two rules when working on it:

- **The console must take effect while the game is paused.** `update()` does not
  run when the console is open, so `refreshAdmin()` resolves the dread switches
  itself. If you add a switch that only makes sense inside `update()`, give it
  the same treatment or it will look broken.
- **Keep it driven by data.** Groups and buttons come from `adminGroups`, and
  the readout is one array of lines. Add an entry, not another handler.

Because the game is paused while it is open, and it is paused at the menu, both
are also the reliable way to park the game for a screenshot.

## Extending the game

### Retune IT

IT's whole design is *withheld information*, so treat these as the load-bearing
parts, not as style:

- **Silhouette before detail.** Too tall, too thin, neck too long, arms past the
  knees, legs with a gap between them. It has to read as "not a person" at a
  distance, where detail cannot help.
- **Distance gates the detail.** `STALKER_DETAIL` (4.5m) is where eyes and a jaw
  appear at all, and the eyes are intermittent even there. Past
  `STALKER_FLICKER_DIST` (7m) it drops out of single frames.
- **Both thresholds must stay inside the fog's envelope,** which is
  `ln(1/0.15)/fogDensity()` — about 21m at dread 0 but only 2–5m through the
  mid-range. A threshold beyond that is dead code that looks like a feature.
- **The behaviour is the scare:** hunt, go home, lie still, come back, and leave
  when watched from a distance. Do not turn it into a constant pursuer; a
  monster that never leaves is just a timer.

### Add an item

1. Add an entry to `ITEMS` in `raycast.js` with `id`, `name`, `blurb`, `cost`,
   and `effects` (only keys already present in `EFFECT_RULES`/`DEFAULT_EFFECTS`).
2. If it needs a new effect key, add it to `EFFECT_RULES` and `DEFAULT_EFFECTS`
   as well, then honour it in `app.js`.
3. Extend the catalogue test in `test.js` if the new key has a combination rule
   worth pinning down.
4. The shop UI builds itself from `ITEMS`, so no HTML change is needed.

### Tune the mood (fog, dread, colour)

- The core exposes the numbers: `Atmosphere` returns fog density, static,
  tint, shake, and glitch chance from `dread`.
- The look is applied in `app.js` (`renderScene`, `ditherScene`, `present`).
  Keep colours derived from `dread` so the creepiness ramp stays coherent, and
  keep kit multipliers (`fogMul`, `shakeMul`, `glitchMul`) applied at the point
  of use rather than baked into `Atmosphere`.

### Change the engine (map, rays, pursuit, economy)

1. Change `raycast.js`.
2. Add or update tests in `test.js` — especially the ray distances, the
   connected/hard-exit level properties, the no-wall-clipping guard, the effect
   combination rules, and the collectible invariants.
3. Update the "How it works" section of `README.md` if behaviour changes.
4. Run `node test.js`.

### Add effects, UI, or audio

- Keep cosmetic effects, the minimap, and the shop rendering in `app.js`; guard
  the WebAudio setup in `try/catch` (autoplay policies and headless
  environments can refuse it) and start it on a user gesture.
- Render at the low internal resolution and scale up for the retro look.
- `app.js` exposes `window.HorrorApp` (state, `toggleShop`, `buyItem`,
  `beginDepth`, `openMenu`, `toggleAdmin`, `giveAllKit`, `refreshAdmin`,
  `generateLevel`, `effects()`, `prefs()`, and the scene dimensions) so browser
  tests can drive the game; keep that handle working when you refactor.
- **User options live in `state.prefs`** (see `DEFAULT_PREFS`), and the per-tape
  difficulty lives in `state.settings`. Do not conflate them: `prefs` is the
  player's, `settings` belongs to `depthSettings(depth)`.
- Manually test in a browser; `test.js` does not exercise the DOM, canvas,
  minimap, shop, or audio.

## Validation

From this directory, run:

```bash
node test.js
```

Run this after changes to `raycast.js`. For changes to `app.js`, `index.html`,
or `style.css`, also drive it in a real browser — from the repository root:

```bash
bash tools/check.sh "analog horror raycaster/index.html" --press Enter --expect canvas --wait 2500
```

Then exercise the affected feature (press `B` and click a shop row, move to
reveal minimap cells, and read `window.HorrorApp.state` with `--eval`). Keep
README claims aligned with what the source and tests actually guarantee.
