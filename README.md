# Coding_etc — self-contained coding projects

A collection of independent coding projects by **Thijn Köhne**. Each one is
deliberately self-contained: plain HTML, CSS and JavaScript with **no build
step, no bundler and no dependencies**. Open a project's `index.html` in a
browser and it runs; where a project has a simulation or game core, that core
also runs in Node.js so its rules are covered by tests.

## Projects

| Project | What it is |
|---|---|
| [algorithmic art](algorithmic%20art) | A zero-dependency generative-art studio: a gallery of seeded, reproducible sketches with PNG export. |
| [dither studio](dither%20studio) | A print shop for pixels: 43 dithering algorithms, 22 palettes, tone maps, alpha mattes, an 11-effect glitch stack and text mode, with the whole core under Node tests. |
| [analog horror raycaster](analog%20horror%20raycaster) | "Static Halls" — a first-person raycasting horror game with procedural fog, a stalking presence, a shard shop and two endings. |
| [boids](boids) | Reynolds' flocking, from three steering rules with adjustable weights. |
| [falling sand](falling%20sand) | A particle sandbox with gravity, density, hydrostatic pressure and wet-sand repose. |
| [fluid dynamics](fluid%20dynamics) | Incompressible Navier–Stokes (Stam's *Stable Fluids*) with coloured dye, vorticity confinement and buoyancy. |
| [game of life](game%20of%20life) | An interactive Conway's Game of Life. |
| [logic puzzles](logic%20puzzles) | Sudoku and the binary puzzle (Binairo), generated with a unique solution and solved one deduction at a time. |
| [maze generator and solver](maze%20generator%20and%20solver) | Animated maze construction and pathfinding. |
| [wave function collapse](wave%20function%20collapse) | A tilemap generator that grows maps from edge constraints alone, with backtracking. |
| [2048](2048) | The sliding-tile puzzle, with custom blocks (divide, add, multiply — each with its own spawn rarity), a milestone ladder derived from the blocks in play, and an expectimax AI you can watch solve the board. |
| [RobloxGame](RobloxGame) | A design kit, not code: three master prompts and the research behind them for building an original Roblox steal-and-collect game. |
| [Wiekentwie](Wiekentwie) | A Dutch Excel/VBA app ("Wie kent wie?") for offering and searching contacts. |

## Running anything

Open the project's `index.html` in a modern browser — there is nothing to
install. For the projects with a testable core, the tests use Node's built-in
`assert` module only:

```bash
cd boids && node test.js
```

That covers `2048`, `analog horror raycaster`, `boids`, `dither studio`,
`falling sand`, `fluid dynamics`, `game of life`, `logic puzzles`,
`maze generator and solver`, and `wave function collapse`. (Wiekentwie is
tested with PowerShell against a real Excel install; the algorithmic-art studio
is verified in the browser.)

## How the repository is organised

Thirteen independent projects, plus the shared documents and tooling that keep
them consistent:

- [`ai_startup_instructions.md`](ai_startup_instructions.md) — the workflow for
  AI assistants working here, and [`AGENTS.md`](AGENTS.md) for tools that load
  it automatically.
- [`context.md`](context.md) — the index of read-before-coding documents.
- [`DESIGN.md`](DESIGN.md) — the shared visual language and the performance
  budget every project must respect: *a dark instrument panel for a gallery at
  night.*
- [`log.md`](log.md) — the model activity log.
- `tools/` — the shared Playwright harness used to verify anything
  browser-facing; Playwright is installed globally, never as a project
  dependency.
- `.agents/skills/` — reusable agent skills, pinned in `skills-lock.json`.

## Verification

Browser-facing changes are checked in a real browser rather than by reading the
HTML. The harness records console and page errors, can drive interactions, and
exits non-zero on any failure:

```bash
bash tools/check.sh "boids/index.html" --expect canvas --screenshot /tmp/boids.png
```
