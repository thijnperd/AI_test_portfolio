# AI instructions for the 2048 project

A small, dependency-free browser implementation of the 2048 puzzle. Keep the
game core separate from the browser interface.

## Before working

- Read this file and [`README.md`](README.md).
- For game rules, read `game.js` and the relevant cases in `test.js`.
- For rendering, input, or score handling, read `app.js`, `index.html`, and
  `style.css` as needed.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `game.js` | Board state, `slideLine` merge logic, moves in four directions, tile spawning, win/game-over detection, the `MILESTONES` ladder (`milestonesUpTo`, `nextMilestone`), achievement bookkeeping, and the seeded RNG. No DOM; exports `GameLib` for Node and the browser. |
| `app.js` | Board rendering, keyboard input, records (best tile / runs), the ladder UI, and the overlay. Depends on `game.js`. |
| `index.html` | UI structure and script load order (`game.js` before `app.js`). |
| `style.css` | Layout, tile colours, and animations. |
| `test.js` | Node.js tests for the game core, not browser UI tests. |
| `README.md` | User-facing setup, controls, rules, and test instructions. |

## Project constraints

- Keep the project dependency-free and runnable by opening `index.html` from
  disk; do not add a bundler, server requirement, or package dependency unless
  explicitly requested.
- Keep `game.js` independent of the browser so it stays testable in Node.
- Preserve the browser global (`GameLib`) and Node export behavior.
- **All randomness in the core goes through `makeRng(seed)`** — never
  `Math.random()` in `game.js`. The same seed must reproduce the same spawns.
  (`app.js` may use `Math.random()` only to pick fresh seeds.)
- **Preserve the merge rules:** a move slides toward an edge, equal neighbours
  merge into their sum, and **a tile merges at most once per move**
  (`slideLine` consumes both tiles, which is what stops `2 2 2 2` becoming `8`).
- `wrap`/`bounce`-style shortcuts do not apply here: the board does not wrap.
- The board is a square grid of numbers with `0` meaning empty; keep `grid[y][x]`
  indexing consistent with `lines()` and `app.js` rendering.
- **`hidden` loses to any layout rule — guard it.** `[hidden] { display: none }`
  comes from the UA stylesheet, so an author rule like `.overlay { display: flex }`
  silently overrides it, and `element.hidden = true` then changes nothing. This
  shipped once: the game-over overlay sat on top of the board permanently,
  reading "Game over" over a perfectly healthy game. `style.css` now opens with
  `[hidden] { display: none !important; }`. **Never check visibility by reading
  `.hidden`** — a browser test that reads the property passes even when the bug
  is present. Assert on `getComputedStyle(el).display` instead.
- **Never break the run on a win.** `won` stays true after `acknowledgeWin()`;
  `winSeen` is what stops the banner reappearing. Reaching 2048 must never block
  further moves, because the ladder past 2048 is the reason to keep playing.
- **Progress that outlives a run belongs in `app.js`** (localStorage), while
  anything about the current board stays in `game.js`. Keep `localStorage`
  access inside the `load`/`save` helpers so a privacy-mode failure cannot
  throw.

## Extending the game

### Change the rules or scoring

1. Change `slideLine` and/or `move` in `game.js`.
2. Update `move`'s `lastMerged` / `lastSpawned` bookkeeping if animation
   positions change, and the corresponding use in `app.js`.
3. Add or update tests in `test.js`, especially for the one-merge-per-move rule.
4. Update the rules section of `README.md` if user-facing behaviour changes.
5. Run `node test.js`.

### Change the ladder or the records

1. `MILESTONES` in `game.js` is the single source of the rungs — values, order,
   and labels. The panel UI builds itself from it, so adding a rung needs no
   HTML change.
2. `collectMilestones()` is called after a real move **and** from `load()`, so a
   board handed straight to the game is credited the rungs it already sits on.
   Keep both call sites if you touch it, or the ladder and the "next" target
   will be wrong until the first move.
3. Lifetime records live in `app.js` under the `2048-best`, `2048-best-tile`,
   and `2048-runs` keys. Do not reuse those key names for per-run state.

### Change rendering or controls

- Keep board state and rules in `game.js`; keep drawing, input, and overlay
  handling in `app.js`.
- Tile elements are created once and reused; update their text and value class
  in `render()` rather than rebuilding the DOM.
- Preserve keyboard handling and the `preventDefault()` that stops arrow keys
  from scrolling the page.
- Manually test the affected interaction in a browser; `test.js` does not
  exercise the DOM.

## Validation

From this directory, run:

```bash
node test.js
```

Run this after changes to `game.js` or game behaviour. For changes to `app.js`,
`index.html`, or `style.css`, also drive it in a real browser — from the
repository root:

```bash
bash tools/check.sh "2048/index.html" --expect "#board .tile" --wait 1200 \
  --eval "(function(){var A=window.GameApp; A.load([[1024,1024,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]); A.move('left'); return {max:A.game().maxTile(), won:A.game().won, overlay:getComputedStyle(document.getElementById('overlay')).display};})()"
```

That drives a win in two lines instead of a thousand moves. Check **both**
directions of the overlay: hidden while playing (`display: none`) and visible on
a win or a game over (`display: flex`) — the bug above was an overlay that was
*always* visible, so a one-directional check would have missed it. Keep README
claims aligned with what the source and tests actually guarantee.
