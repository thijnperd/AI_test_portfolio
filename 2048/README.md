# 2048

A zero-dependency, browser-based implementation of the sliding-tile puzzle
**2048**. Open `index.html` directly in a browser — no build step, no server.
The game core also runs in Node.js, so the sliding and merging rules are
covered by unit tests.

Slide all tiles toward an edge; equal tiles that meet merge into their sum. A
new 2 or 4 appears after every move. Reach **2048** to win — then keep going,
because the ladder does not stop there.

## Features

- Full 2048 rules: sliding, one merge per tile per move, 2/4 tile spawns
- Arrow keys **and** WASD
- Score and best score, plus **best tile ever** and **runs played** (kept in
  `localStorage` when available, so the next session starts with something to
  beat)
- **A ladder of milestones** — `64 · Steady · Rolling · Deep · Halfway · 2048 ·
  Past the edge · Endless`. The rung you have reached this run lights up, the
  rung you are climbing is outlined, and rungs you have reached in an *earlier*
  run are marked as records to beat. There is always a next target, which is the
  point
- **Winning is not the end.** Hitting 2048 raises a banner you can dismiss with
  **Keep going**, and the run continues — the ladder keeps paying out at 4096 and
  8192, and the status line always names the next rung to aim at
- Pop animation on merged and newly spawned tiles, and a pop on the rung a move
  crosses
- Game-over overlay showing your best tile against your record, with a restart
  button
- `Enter` / `Space` dismisses the banner or starts a new game
- **An AI player you can watch think.** Flip it on and an expectimax search
  plays the board move by move, showing the four directions it weighed up with
  their scores, the arrow it picked, and the heuristic terms behind that choice
- **It plays past 2048.** The AI dismisses the win banner itself and keeps
  climbing the ladder, so you can leave it running
- Your records stay yours: an AI move never rewrites *best tile* or *runs*, and
  the AI keeps its own tally in its panel
- Seeded core — a seed reproduces the same tile sequence **and** the same AI
  game
- Respects `prefers-reduced-motion`

## Run the app

Open `index.html` in a modern browser and use the arrow keys (or `W A S D`) to
play. Press **New game** to restart.

| Action | Key |
|---|---|
| Slide left / right | `←` / `→` (or `A` / `D`) |
| Slide up / down | `↑` / `↓` (or `W` / `S`) |
| Keep going after 2048 | `Enter` / `Space`, or the **Keep going** button |
| New game | **New game** button, or `Enter` / `Space` on the game-over banner |
| AI play / pause | `P`, or the **Play** / **Pause** button |
| Take over from the AI | any direction key — the first press pauses it |

### AI mode

| Control | What it does |
|---|---|
| **Let the AI play** | Turns the AI on and starts it playing |
| **AI step** | Plays exactly one AI move, whatever the mode is set to |
| **Play** / **Pause** | Runs or stops it; the mode stays on while paused |
| **Look ahead** | Search depth, 1–4 moves. Deeper is stronger and slower |
| **Move every** | The gap between moves, 50–800ms. A slower cadence gives each move a bigger node budget |

The readout under those controls is the AI's shortlist: one row per direction
with a bar and the expectimax score it was given, the chosen row in the accent,
the directions that would not change the board dimmed, and a line saying why
the winner won — how many cells are empty, how close the lines are to
monotonic, and whether the biggest tile is holding a corner.

## The rules

- A move slides every tile as far as it can toward the chosen edge.
- Two tiles of equal value that meet merge into one tile worth their sum.
- **A tile merges at most once per move**, and a freshly merged tile cannot
  merge again in the same move. So `2 2 2 2` slides left to `4 4` (not `8`),
  and `4 4 8` slides left to `8 8`.
- After any move that changes the board, one new tile (90% a `2`, 10% a `4`)
  is placed in a random empty cell.
- The game is over when the board is full and no two neighbours are equal.

The core uses a seeded RNG, so a given seed reproduces the same spawn sequence.
The app only uses `Math.random()` to pick a fresh seed for a new game.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure, score boxes, board, and script loading order |
| `style.css` | Layout, dark theme, tile colours, and animations |
| `game.js` | DOM-free puzzle core (`Game`, `slideLine`, `applyMove`, `MILESTONES`, `milestonesUpTo`, `nextMilestone`, seeded RNG); works in browser and Node |
| `ai.js` | DOM-free AI core (`AiLib`): the heuristic, the expectimax search, and a headless `playGame` for measuring it; works in browser and Node |
| `app.js` | Board rendering, keyboard input, records, the ladder, the overlay, and the visible AI mode |
| `test.js` | Node.js tests for the core and the AI |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## The AI player

This is the **expectimax** approach from the top answer to
["What is the optimal algorithm for the game 2048?"](https://stackoverflow.com/q/22342854),
implemented from scratch against this repo's own rules.

A *max* node is our turn: try every legal direction. A *chance* node is the
board spawning a tile: average over the empty cells and both spawn values,
weighted 90% for a 2 and 10% for a 4 — the game's real distribution. Averaging
rather than assuming the worst is the whole point: a move is rated by its
**expected** outcome, so the AI will happily accept a 10% risk of a 4 if the
rest of the futures are good.

Positions are scored by the four terms that answer converged on:

| Term | Weight | Why |
|---|---|---|
| Empty cells | 2.7 each | room to manoeuvre is life; a cramped board dies |
| Monotonicity | 1.0 per doublings off | lines that run one way can be fed from a single edge — the "snake" pattern |
| Smoothness | 0.1 per doublings apart | neighbours of similar size can still merge |
| Corner bonus | 1.0 × log₂(max tile) | a big tile in a corner cannot be disturbed |

The search is bounded by **depth and node count, never wall-clock time**, so the
same board always yields the same move on any machine — which is what makes it
testable at all. Moves are simulated with `GameLib.applyMove`, the same function
the game uses, so the search can never disagree with the game about what a move
does.

### Measured, not assumed

Playing real games through the real core, 4 fixed seeds each:

| Setting | Max tiles reached | Cost per move |
|---|---|---|
| Look ahead 2 | 512, 2048, 2048, 512 | 5.9ms average |
| **Look ahead 3 (default)** | **2048, 1024, 4096, 2048** | **20.3ms average** |

Worst case for one move at the default budget is around 40ms. The default in the
browser comes from the gap between moves (`gap × 90` nodes, clamped to
1,500–20,000), so asking for a faster cadence spends less on each move instead of
pegging a core. A whole game is a few hundred to a few thousand moves.

Two honesty notes. The chance node samples at most **six** empty cells on an
open board rather than all sixteen — a documented approximation, evenly spread
across the board, that is what keeps depth 3 inside the budget. And this is a
*strong* player, not a perfect one: `depth 2` reaches a 512-class tile as often
as a 2048 one, which is exactly why the default is 3.

## Tests

From this folder, run:

```bash
node test.js
```

46 tests use Node's built-in `assert` module; no packages need to be installed.

The first 25 cover the game: the line-slide/merge rules (including the
one-merge-per-tile rule), moves in all four directions, no-op moves,
deterministic tile spawning, win detection, scoring, game-over detection, and
the progression rules — the milestone ladder (`milestonesUpTo` /
`nextMilestone`), a rung being recorded once per run, a loaded board being
credited the rungs it already sits on, the win banner waiting to be
acknowledged, and the run surviving that dismissal.

The other 21 cover the AI: each heuristic term on a board built to isolate it
(including the weighted sum adding up to the documented formula), that every
direction is reported with legality taken from the game's own rules, that the
chosen direction always changes the board and is genuinely the best of the
shortlist, that it reports no move on a dead board, determinism of the search
and of a whole seeded game, the node budget being a hard stop, and two real
games — 60 moves reaching at least 64, and one played to completion reaching a
512-class tile. Those two play actual games, so the suite takes a few seconds
rather than milliseconds.

The browser interface in `app.js` is not covered by this test file.

`window.GameApp` exposes `game()`, `move`, `newGame`, `keepGoing`, `load` and
`records` so a browser check can drive the game without playing a thousand
moves to reach a win. `load` is a test seam; the app never calls it. It also
exposes `aiStep()`, `aiPlay()`, `aiPause()` and `aiState()` so the AI can be
driven and inspected from a browser check without waiting on its timer.
