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
| `game.js` | Board state, `slideLine` merge logic, `applyMove` (a pure move used by both the game and the AI), moves in four directions, tile spawning, win/game-over detection, the vanilla `MILESTONES` ladder (`milestonesUpTo`, `nextMilestone`), achievement bookkeeping, the seeded RNG, and `setRules` — the seam a ruleset is handed through. No DOM; exports `GameLib` for Node and the browser. |
| `blocks.js` | The block rules (`BlocksLib`): the block kinds and their arithmetic, `normalize` (the sanitising), `makeRules` (the ruleset: spawn table, `mergePair`, tile presentation, derived `ladder` and `winValue`), and `reachableValues` / `makeLadder`. No DOM; depends on `game.js`. |
| `ai.js` | The expectimax player: the heuristic and its weights, the max/chance search, `bestMove` (with the candidate shortlist the UI renders), and `playGame` for headless measurement. No DOM; exports `AiLib`. Depends on `game.js`, and plays by a ruleset when given one. |
| `app.js` | Board rendering, keyboard input, records (best tile / runs), the block editor, the ladder UI, the overlay, and the visible AI mode. Depends on `game.js`, `blocks.js` and `ai.js`. |
| `index.html` | UI structure and script load order (`game.js`, `blocks.js`, `ai.js`, `app.js`). |
| `style.css` | Layout, tile colours, animations, the block editor, and the AI readout. |
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
- **`blocks.js` is the only place that decides whether two tiles merge, and into
  what.** `rules.mergePair(a, b)` returns the result, or `0` for "these two do
  not merge"; `slideLine` and `applyMove` take it as an optional callback and
  `canMove` asks the same question through `Game.merges`. Never write a second
  opinion about merging anywhere — a board the game calls playable must be one
  the sliding would really change, or a `canMove` that disagrees with `applyMove`
  turns into a game that reports *game over* over a live board.
- **The vanilla path must stay the vanilla path.** The default blocks set
  `rules.vanilla`, and with it `Game.merge` is null and the AI's `ctx.rules` and
  `ctx.merge` are null, so `slideLine` doubles inline, `addRandomTile` compares
  against the literal `0.9`, and the heuristic calls `log2` directly. A test
  plays 80 moves and asserts the default-rules board is identical to the
  no-rules board, tile for tile — if you touch the rules plumbing, keep that test
  green rather than adjusting it.
- **The ladder is derived, not declared.** `MILESTONES` in `game.js` is the
  *vanilla* ladder and the default; a game's own rungs are `rules.ladder`, built
  by `blocks.js` from the values its blocks can reach. Every rung must be
  reachable, which is the whole point: a board that only spawns 3s climbs
  96/192/384/..., not powers of two. `game.collectMilestones`, `nextGoal`,
  `renderLadder` and `flashRung` all read the *game's* ladder, never the constant.
- **Editing the blocks must never rewrite the board.** `Game.setRules` swaps the
  merge predicate, the spawn table, the ladder and the win value under a live run
  and touches nothing else; the UI calls it on every edit. A board already at or
  above a newly lowered goal gets `winSeen = true` instead of a banner, so an edit
  can never pop "you won" over a game that was already won.
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

1. `MILESTONES` in `game.js` is the source of the *vanilla* rungs, and it is what
   a game with no ruleset uses. A game with a ruleset uses `rules.ladder`, which
   `blocks.js` derives from the reachable value set. The panel rebuilds its rungs
   from whatever ladder the game has (`buildLadder`), so adding a rung or a new
   block kind needs no HTML change.
2. `LADDER_TARGETS` / `LADDER_LABELS` in `blocks.js` are the vanilla targets and
   their names; a rung is the smallest reachable value at or above its target,
   and a target nothing can reach is dropped. Do not "fix" a short ladder by
   adding rungs nothing can reach.
3. `collectMilestones()` is called after a real move **and** from `load()`, so a
   board handed straight to the game is credited the rungs it already sits on.
   Keep both call sites if you touch it, or the ladder and the "next" target
   will be wrong until the first move.
4. Lifetime records live in `app.js` under the `2048-best`, `2048-best-tile`,
   and `2048-runs` keys, and the block config under `2048-blocks`. Do not reuse
   those key names for per-run state.

### Change the blocks

1. The kinds and their arithmetic are one table each: `KINDS` and `OP_FN` in
   `blocks.js`. An operator result must stay a positive integer (clamp at 1 —
   a merge may never erase a tile), and a new operator that can produce a value
   *below* the value it acted on must be added to the `canShrink` check in
   `reachableValues`, or the closure will stop early and the ladder will miss
   rungs.
2. Operator tiles are encoded as negative grid values (`-(code)`, `0` is empty,
   positive is a number). Anything that reads `grid` values must go through
   `rules.label` / `rules.klass` / `rules.heuristicValue` rather than assuming a
   power of two — `ai.js` does, and so does `render()`.
3. A config the player is mid-edit is not necessarily playable. `normalize` fixes
   it rather than guarding every use, and its `notes` say what it had to do. Keep
   the "at least one spawning number" rule: a board of operators alone can never
   make a move.
4. The closure in `reachableValues` is bounded by `LADDER_LIMIT` and runs on
   every edit. Measure it before adding work to it (`node -e` over
   `BlocksLib.makeRules` on a `+1` config is the worst case, a few milliseconds);
   it must not become something a dragging slider can feel.
5. Update the rules and the measured cost in `README.md`, and add tests to
   `test.js` — the ladder properties (every rung reachable, every rung the first
   reachable value above its target, the set closed under its own rules) are the
   ones that catch a subtle mistake.

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

Run this after changes to `game.js`, `blocks.js`, or game behaviour. For changes
to `app.js`, `index.html`, or `style.css`, also drive it in a real browser — from
the repository root:

```bash
bash tools/check.sh "2048/index.html" --expect "#board .tile" --wait 1200 \
  --eval "(function(){var A=window.GameApp; A.load([[1024,1024,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]); A.move('left'); return {max:A.game().maxTile(), won:A.game().won, overlay:getComputedStyle(document.getElementById('overlay')).display};})()"
```

That drives a win in two lines instead of a thousand moves. Check **both**
directions of the overlay: hidden while playing (`display: none`) and visible on
a win or a game over (`display: flex`) — the bug above was an overlay that was
*always* visible, so a one-directional check would have missed it. Keep README
claims aligned with what the source and tests actually guarantee.

The block editor is driven through its own seam, which is how a rarity edit is
proven to reach the spawn table rather than only the widget:

```js
window.GameApp.setBlocks({ blocks: [              // applies and returns the rungs
  { kind: 'number', value: 2, weight: 0 },
  { kind: 'number', value: 8, weight: 1 },
] });
window.GameApp.blocks();      // { config, shares, vanilla, notes, ladder, winValue, spawns }
window.GameApp.spawnValueAt(0.5);   // what a draw in the middle of the table yields
```

Check all three: that a weighted block really is the only thing that spawns, that
a custom ladder reaches the DOM (`#milestones .rung-value`) as well as the state,
and that an operator tile renders as its symbol (`#board .tile.op`) while the
merge it takes part in lands on the board. Remember `setBlocks` writes the config
through to `localStorage` — reset it to the default config at the end if the
check runs against a real profile.

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
