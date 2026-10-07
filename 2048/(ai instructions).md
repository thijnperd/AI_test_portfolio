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
| `game.js` | Board state, `slideLine` merge logic, `applyMove` (a pure move used by both the game and the AI), moves in four directions, tile spawning, win/game-over detection, the `MILESTONES` ladder (`milestonesUpTo`, `nextMilestone`), achievement bookkeeping, and the seeded RNG. No DOM; exports `GameLib` for Node and the browser. |
| `ai.js` | The expectimax player: the heuristic and its weights, the max/chance search, `bestMove` (with the candidate shortlist the UI renders), and `playGame` for headless measurement. No DOM; exports `AiLib`. Depends on `game.js`. |
| `app.js` | Board rendering, keyboard input, records (best tile / runs), the ladder UI, the overlay, and the visible AI mode. Depends on `game.js` and `ai.js`. |
| `index.html` | UI structure and script load order (`game.js`, then `ai.js`, then `app.js`). |
| `style.css` | Layout, tile colours, animations, and the AI readout. |
| `test.js` | Node.js tests for the game core and the AI, not browser UI tests. |
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
- **The AI must not fork the rules.** `ai.js` simulates moves with
  `GameLib.applyMove`; never re-implement sliding in the AI, or a search can
  start disagreeing with the game about what a move does. `applyMove`'s optional
  `out` grid exists for the search's reuse — when it is passed, the returned
  `grid` *is* that buffer, so consume it before the next call.
- **The search is bounded by depth and node count, never by a clock.** A
  wall-clock budget would make the AI play differently on different machines and
  make it untestable. `maxNodes` and `maxDepth` are the levers; keep them the
  only ones, and keep every loop over a `Map` or an object keyed in a fixed
  order so the result cannot depend on iteration order.
- **Nothing the AI does may touch the human records.** `render()` updates
  `best` / `bestTile` only when `lastMoveHuman` is set, and `newGame()` counts a
  run only if the human moved in it. The AI tracks its own best in its panel.
  Breaking this turns "your best tile" into a description of the AI.
- **The AI plays past 2048 by itself.** `aiMove()` acknowledges the win banner
  instead of leaving it up, because a banner would sit over the board while the
  AI kept playing. The human path must still show the banner — check both.
- **Keep one search inside the laptop budget.** The browser derives the node
  budget from the gap between moves (`gap × 90`, clamped 1,500–20,000) so a fast
  cadence cannot peg a core. Measured at the default: ~20ms a move, worst case
  ~40ms. If a change makes a move take noticeably longer, lower the budget or
  the chance-node sample, do not raise the cap.

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

### Change the AI

1. Weights live in `WEIGHTS` in `ai.js`; the depth and node budget come from
   the caller (`app.js` passes them from its sliders).
2. **Re-measure, do not assume.** `AiLib.playGame(seed, opts)` plays a real game
   through the real core and reports the tile, score, moves, nodes and time.
   Sweep several seeds: the cost and the strength are both seed-dependent, and a
   single game will mislead you.
3. Keep the returned `candidates` in `GameLib.DIRECTIONS` order with `legal`
   flags for every direction — the UI renders one row per entry and depends on
   all four being present, including the illegal ones.
4. Update the measured table in `README.md` if the numbers move.

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

The AI is driven through the same seam, which avoids waiting on its timer:

```js
window.GameApp.aiPlay();          // start it
window.GameApp.aiStep();          // exactly one AI move, mode or not
window.GameApp.aiState();         // { playing, dir, nodes, ms, candidates, ... }
window.GameApp.aiPause();
```

The AI readout is asserted from the DOM (`#ai-candidates .choice.chosen`,
`#ai-why`, `#ai-badge`) and the badge is checked by `display`, never by reading
`hidden`. Note that the win banner must **not** appear when the AI crosses 2048:
it acknowledges the win and plays on, so the overlay staying hidden there is the
correct behaviour, not a missing banner.
