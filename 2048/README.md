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
- Seeded core — a seed reproduces the same tile sequence
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
| `game.js` | DOM-free puzzle core (`Game`, `slideLine`, `MILESTONES`, `milestonesUpTo`, `nextMilestone`, seeded RNG); works in browser and Node |
| `app.js` | Board rendering, keyboard input, records, the ladder, and the overlay |
| `test.js` | Node.js tests for the core |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## Tests

From this folder, run:

```bash
node test.js
```

25 tests use Node's built-in `assert` module; no packages need to be installed.
They cover the line-slide/merge rules (including the one-merge-per-tile rule),
moves in all four directions, no-op moves, deterministic tile spawning,
win detection, scoring, game-over detection, and the progression rules: the
milestone ladder (`milestonesUpTo` / `nextMilestone`), a rung being recorded
once per run, a loaded board being credited the rungs it already sits on, the
win banner waiting to be acknowledged, and the run surviving that dismissal.
The browser interface in `app.js` is not covered by this test file.

`window.GameApp` exposes `game()`, `move`, `newGame`, `keepGoing`, `load` and
`records` so a browser check can drive the game without playing a thousand
moves to reach a win. `load` is a test seam; the app never calls it.
