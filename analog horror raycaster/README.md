# Static Halls — analog horror raycaster

A zero-dependency, browser-based raycasting horror game built around the
quality that makes old raycasters unsettling: low resolution, heavy fog, and
the sense that you are watching a decaying tape. Open `index.html` directly in
a browser — no build step, no server. The engine core also runs in Node.js, so
the level, ray casting, fog, pursuit, shop, and collectible logic are covered by
unit tests.

You wake at one end of a procedurally generated maze. Somewhere at the far end
is the way out. Something else is in there with you, and the longer you stay,
the worse the air gets. Tapes are scattered through the halls; the exit leads
deeper into the archive rather than out of it.

There are **two endings**, and they are lit differently. A cold **green** glow
is the exit. A **red** glow is its **den** — the dead end it sleeps in, which
pays triple and which you have to choose to walk into. It only pays while the
thing is *out*: if it is home, the den is just where it catches you.

## Features

- **Raycasting renderer** (DDA) into a **288×162** buffer, lightly dithered
  (8 levels per channel at 55% strength, easing to 6 then 5 as the dread rises)
  and scaled up with nearest-neighbour sampling — still unmistakably low-res,
  but the geometry stays readable
- **Textured floor and ceiling**, cast per pixel in the old Wolfenstein style:
  chunky checker tiles with a seam every fourth cell, fogged by row distance
- **Brick courses** on the walls (two bands per unit) and a cold green glow
  leaking from the exit when you can see straight to it
- **Tape artifacts on top of the picture:** a crawling tracking band, glitch
  slits, film scratches, occasional full-frame static bursts, a head-switching
  noise strip and corner brackets from the CRT shell, and a **heartbeat
  vignette** that tightens on the beat and tighter still when the presence nears
- **Minimap** with fog of war: it reveals only what you have walked past, and
  can be augmented (detector pings, a longer radius, a marked exit). `M` swings
  it between the close 25-tile chart and the wide 41-tile one
- **A shop (Exchange)** that pauses the world. Thirteen items cover detection,
  light, speed, stamina, steadiness, protection, and a **Surveyor's Rite** that
  solves the maze; shards are earned, never given
- **The Surveyor's Rite** — for 55 shards, an optimal route to the exit drawn on
  your chart, solved with the same breadth-first search the
  `maze generator and solver` project uses. Unseen stretches are dotted rather
  than hidden. It burns out with the tape, so it is re-bought per depth
- **Tape collectibles** that pay shards, and **depth progression**: clearing a
  tape descends you to a bigger, faster, less patient one
- **Hiding** — hold `C` while standing still and the dread recedes, which also
  takes the pace out of the thing hunting you. It is deliberately imperfect: the
  tape keeps running underneath, so relief caps out and slips away the moment
  you move
- **A main menu** with the guide and the accessibility settings, plus a **secret
test console** (`` ` ``) that pauses the game and exposes every switch — dread,
  shards, kit, teleports, the stalker, depth, the renderer, and a live state dump
- **Sprint with a stamina meter** (`Shift`), extended by the Deep Lungs item
- **Procedural mist** that drifts and thickens, layered over distance fog
- **Rising dread** over the tape's run: fog thickens, the tint turns sickly red,
  film grain and glitching increase, the camera starts to shake, and the
  stalker speeds up
- **IT** — a stalker built to the design everyone agrees on: never seen whole.
  It hunts, then **goes home to its den and lies still**, then comes back. Watch
  it from a distance and it slips away, so a clean look is rare. It cannot pass
  through a wall, but it rounds corners. What you get is a silhouette that is
  wrong before it is scary: too tall, too thin, a neck too long, arms past the
  knees, and single-frame dropouts that leave you unsure it was ever there
- **Analog-horror post pass:** scanlines, vignette, film grain, a crawling VHS
  tracking band, glitch slits, brightness flicker, and a jump-scare flash
- **Procedural audio** (best effort, started on your first input): a low drone,
  rising static, and a heartbeat that quickens with dread
- Seeded level generation — the same seed always builds the same maze

## Run the app

Open `index.html` in a modern browser. The main menu comes up first with the
guide and the settings; press `Enter` or click **BEGIN** to go in, and `Esc` at
any time to come back and change something.

| Action                   | Key                           |
| ------------------------ | ----------------------------- |
| Move forward / back      | `W` / `S` or `↑` / `↓`        |
| Turn left / right        | `A` / `D` or `←` / `→`        |
| Strafe left / right      | `Q` / `E`                     |
| Sprint (uses stamina)    | hold `Shift` while moving     |
| Hide (lowers dread)      | hold `C` while standing still |
| Look around              | click-drag on the canvas      |
| Open / close the shop    | `B` (or `Esc` to close)       |
| Buy in the shop          | click a row, or `1`–`9`       |
| Chart close / wide       | `M`                           |
| Pause, guide, settings   | `Esc`                         |
| Test console (secret)    | `` ` ``                       |
| Restart / descend        | `R`                           |

## Settings and accessibility

The menu carries the options first-person horror players expect to be able to
change, and they apply live:

- **Field of view** (55–110°) and **look sensitivity**
- **Brightness** — lift or crush the whole picture
- **Camera motion** — one slider that scales shake, head bob, glitch and the
  jump-scare flash, and can be set to *off*
- Independent toggles for **head bob**, **dither**, **grain**, **mist** and the
  **red tint**, so the tape can be made as clean or as filthy as you like
- **Volume**, **subtitles**, and an **FPS counter**

Nothing here is a cheat: the same switches are on the test console if you want
them mid-run as well.

`R` reads the situation: after the exit **or the den** it descends to the next
tape, after being caught it puts you back at tape 1. Your shards and installed
kit survive both — the shop is the meta-progression, the depth is the challenge.

## The exchange

Shards come from tapes (8 each) and from reaching the exit (20, +12 per depth).
The house rule is that kit is never required to survive tape 1 and almost
required by tape 5.

| Item                  | Cost | Effect                                      |
| --------------------- | ---- | ------------------------------------------- |
| Signal Tap            | 30   | The presence shows up on your map           |
| Gas Mask              | 25   | Fog density ×0.75                           |
| Cold Cathode          | 40   | Fog density ×0.55 and a weak eye light      |
| Adrenal Spike         | 25   | Movement speed ×1.18                        |
| Deep Lungs            | 20   | Stamina pool ×1.7                           |
| Tape Magnet           | 22   | Pickup radius 1.8 (auto-collects tapes)     |
| Ground Loop Isolator  | 24   | Camera shake ×0.35, glitch chance ×0.4      |
| Cartographer          | 28   | Map reveal radius 10                        |
| Dead Reckoning        | 34   | The exit is always marked on the map        |
| Heart Monitor         | 24   | Distance/band readout to the presence       |
| Slow Tape             | 45   | Dread ramp ×0.7 (everything cruel is slower)|
| Surveyor's Rite       | 55   | Optimal route to the exit on the chart, consumed by the tape |
| Palindrome Ward       | 60   | Survive one touch and send it home (stackable)|

Effects combine by kind, not by accident: flags (detection, exit, proximity) are
OR-ed, multiplicative effects multiply, wards add, and map/magnet/light take the
strongest single value. Buying the same non-stackable item twice is refused.

## How it works

- **Level:** a perfect maze (spanning tree) carved on a seeded RNG, so every
  cell is reachable and there is exactly one route between any two cells. The
  start is `(1, 1)`; the exit is placed at the cell farthest from it, and the
  den at the farthest **dead end** from it that is not the exit or the start.
- **Solving:** `solvePath(world, fromX, fromY, toX, toY)` is a breadth-first
  search that returns the optimal cell route (or `null`), the same approach the
  `maze generator and solver` project uses. It backs the Surveyor's Rite and is
  checked in the tests against an independent BFS.
- **Depth:** `depthSettings(depth)` grows the maze (`21 + (depth-1)*4`, capped at
  `43`, forced odd), adds tapes (`4 + depth`, capped at 12), shortens the dread
  ramp (`85 - (depth-1)*6` s, floor 45 s), and quickens the stalker
  (`0.85 + (depth-1)*0.09`).
- **Ray casting:** one DDA ray per screen column returns the *perpendicular*
  wall distance (which removes fisheye), the hit side, and the wall cell.
  Column height is `projection / distance`.
- **Fog:** `1 - exp(-density * distance)`, so walls fade smoothly to the fog
  colour. Density is driven by `Atmosphere` and scaled by the kit's `fogMul`.
- **Dread:** `Atmosphere.update(dt)` ramps `dread` from 0 to 1 over the run and
  exposes the fog density, static amount, tint, shake, and glitch chance that
  the renderer reads. The Slow Tape scales `dread` itself, so every mood channel
  that reads it stays coherent.
- **Relief:** `Atmosphere` keeps `relief` alongside the ramp, and `dread` is
  `progress() - relief`. `calm(dt)` and `relax(dt)` move it, capped by
  `maxRelief` (0.6), so hiding buys real time off but can never clear the tape.
- **Readability is a hard constraint on the mood.** The red tint is capped at
  0.2 (`tintAmount`) and the heartbeat vignette at 0.12 + proximity, because a
  stronger wash stopped the geometry reading — and you cannot steer by a picture
  you cannot read.
- **Pixelation:** the scene is drawn into a 288×162 canvas, passed through an
  ordered (Bayer 4×4) dither at 55% strength that quantises each channel to 8
  levels, then blitted to the display with `imageSmoothingEnabled = false` and
  `image-rendering: pixelated`. Resolution and dither strength are tuned for
  legibility first: both were eased off after a chunkier pass made the maze hard
  to navigate.
- **Minimap:** `Explored` keeps a byte per cell. Each frame a disc of
  `effects.mapRadius` around the player is revealed and the explored cells are
  drawn around the player's cell; the Signal Tap adds a stalker ping, Dead
  Reckoning adds the exit, Heart Monitor adds a proximity collar, the den is
  marked once you have seen it, and the Surveyor's Rite draws the solved route
  on top. `M` resizes the canvas backing store so the chart stays exactly 1:1
  with its pixels.
- **Movement:** axis-separated, so you slide along walls instead of sticking.
- **Stalker:** `step()` moves straight at you one axis at a time, checking the
  target cell first — it slides around corners but can never enter a wall.
  `update()` layers the behaviour on top: `hunt` → `withdraw` → `den` → `hunt`,
  where being watched from beyond `STALKER_SIGHT_KEEP` (3.3m) sends it away and
  arriving home beds it down for a while.
- **The fog is what keeps it hidden,** not a rule: it is culled past `0.85` fog,
  which is `ln(1/0.15)/density` ≈ 21m at dread 0 but only ≈ 2m at dread 1. So a
  long clean look at it is a low-dread luxury, and late in a tape you only ever
  get it close. The flicker and detail ranges (7m and 4.5m) are deliberately set
  inside that envelope rather than picked to look good on paper.
- **The frame loop cannot die.** `requestAnimationFrame` is re-armed *before*
  any work, and `update`/render are wrapped so a fault is logged to the console
  and the next frame still runs. Scheduling it last meant a single throw froze
  the game into a picture that accepted no input — which is exactly what
  standing on the exit used to do (`dist` 0 produced an infinite radius inside
  `createRadialGradient`). Any per-object glow now guards against a zero
  distance and clamps its radius.
- **Ending order matters.** The catch is tested before the den and the exit, so
  standing on the thing always ends you, and the den pays only while IT is away.

## Project files

| File                   | Purpose                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`           | Canvas, CRT overlay, HUD structure, minimap canvas, and the shop panel                                                                                                                                |
| `style.css`            | Scanlines, vignette, HUD, gauges, minimap, and shop styling                                                                                                                                          |
| `raycast.js`           | DOM-free core: `World`, `generateLevel` (`DEN` tile, `den`), `castRay`, `castColumns`, `fogFactor`, `Atmosphere`, `Player`, `Stalker` (+`setHome`/`update`), `solvePath`/`isDeadEnd`/`farthestDeadEnd`, `ITEMS`/`applyItems`/`canBuy`, `placeCollectibles`/`collectNear`, `Explored`, `depthSettings`; works in browser and Node |
| `app.js`               | Scene rendering, the dither and analog-horror post pass, the minimap, the shop UI, procedural audio, input, and the game loop                                                                          |
| `test.js`              | Node.js tests for the core                                                                                                                                                                          |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors                                                                                                                                        |

## Tests

From this folder, run:

```bash
node test.js
```

33 tests use Node's built-in `assert` module; no packages need to be installed.
They cover DDA distance and hit side in all four directions, out-of-range rays,
the field of view, distance fog, the dread ramp, wall-sliding movement, a
pursuer that never enters a wall, a procedural level that is fully connected
with the exit at the farthest cell, the den being a far dead end that is never
the exit, `solvePath` returning a provably shortest route (cross-checked against
a second BFS), the stalker's hunt/withdraw/den cycle and its reaction to being
watched, the item catalogue and effect combination rules, `canBuy`, the survey
item, deterministic collectible placement and collection, the `Explored`
fog-of-war disc, and the per-depth difficulty curve. The browser rendering,
minimap, shop UI, and audio in `app.js` are not covered by this test file —
verify those in a browser.
