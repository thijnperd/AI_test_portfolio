# Repository context index

This file indexes durable project context and specialized guidance that an AI
assistant should read before coding when it applies to the task. Start with
[`ai_startup_instructions.md`](ai_startup_instructions.md), then use this index
to find the additional files relevant to the project and work area. That file
also carries the end-of-task duties: append your `log.md` line, then commit the
finished work and push it to `origin main`.

## How to use this index

1. Identify the project and sub-area relevant to the task.
2. Read the applicable project instructions and context documents listed
   below before editing.
3. Check the skill catalog in `ai_startup_instructions.md` and read any
   matching skill files as directed there.
4. Do not read unrelated project context just because it is listed here.

Paths in this index are relative to the repository root.

## Project context and instructions

| File | Read before coding when... |
|---|---|
| `ai_startup_instructions.md` | Starting any task; includes repository workflow, skill routing, the requirement to commit and push finished work to `origin main` (`thijnperd/AI_test_portfolio`), and the user's preference to avoid unnecessary questions and proceed when requests are clear. |
| `AGENTS.md` | Starting work in this repository with an AI tool that recognizes `AGENTS.md`; it points to the startup instructions and this index. |
| `.github/copilot-instructions.md` | Starting work in this repository with a tool that reads Copilot repository instructions. |
| `WhatIsThisFolder.md` | Creating a project or changing repository organization; it describes the repository's purpose and folder conventions. |
| `DESIGN.md` | Styling or restyling any project's interface; it defines the shared house design language (tokens, layout, project voices, anti-patterns) and the performance budget every project must respect — no project may be too intense for an ordinary laptop. |
| `log.md` | At the end of every AI session: append one line (date + time, model name, what you did). It is the repository-level model activity log; keep it at the root and never rewrite earlier entries. |
| `tools/README.md` | Testing, verifying, or demoing a browser project; it documents the shared Playwright harness (`tools/check.sh`) and its options. |
| `tools/(ai instructions).md` | Adding to, or changing, the shared browser-testing tooling; it holds the constraints for everything in `tools/`. |
| `algorithmic art/(ai instructions).md` | Working anywhere in the Algorithmic Art project. |
| `algorithmic art/README.md` | Working in Algorithmic Art; use it to understand the app, structure, and API. |
| `algorithmic art/API.md` | Changing or consuming the shared AlgoArt API, or planning browser verification. |
| `algorithmic art/JSDOC.md` | Adding or revising JavaScript documentation, or viewing the project's docs in VS Code. |
| `algorithmic art/PHILOSOPHY.md` | Creating or substantially changing artwork in the Fluvial Order visual movement; use its aesthetic principles to guide the result. |
| `algorithmic art/Source material/(ai instructions).md` | Working with prototypes, raw experiments, or the `Source material` folder. |
| `algorithmic art/SKILLS/algorithmic_art_skill.md` | Creating algorithmic-art concepts or sketches for this project. |
| `algorithmic art/SKILLS/canvas_performance.md` | Optimizing slow, janky, memory-heavy, high-detail, progressive, or export-heavy canvas rendering. |
| `algorithmic art/SKILLS/color_palette_mastery.md` | Choosing or improving colors and palettes for generative artwork; not for application UI themes. |
| `algorithmic art/SKILLS/generative_composition.md` | Designing or evaluating the composition, hierarchy, density, scale, margins, and seed-to-seed quality of generative artwork. |
| `game of life/(ai instructions).md` | Working anywhere in the Game of Life project. |
| `game of life/README.md` | Working in Game of Life; use it to understand behavior, controls, and validation. |
| `game of life/test.js` | Changing or debugging simulation behavior; tests specify the core's expected behavior. |
| `logic puzzles/(ai instructions).md` | Working anywhere in the Logic Puzzles project. |
| `logic puzzles/README.md` | Working in Logic Puzzles; use it to understand both puzzles, the algorithms, controls, and validation. |
| `logic puzzles/test.js` | Changing or debugging either core (Sudoku generation/solving/uniqueness/deductions, or the binary puzzle's rules, solver and generator); tests specify the expected behavior. |
| `maze generator and solver/(ai instructions).md` | Working anywhere in the Maze Generator and Solver project. |
| `maze generator and solver/README.md` | Working in Maze Generator and Solver; use it to understand behavior, structure, and validation. |
| `maze generator and solver/test.js` | Changing or debugging maze-generation or solver behavior; tests specify expected behavior. |
| `Wiekentwie/README.md` | Working in Wiekentwie; overview, files, requirements, and validation. |
| `Wiekentwie/(ai instructions).md` | Working anywhere in the Wiekentwie project; project conventions and constraints. |
| `Wiekentwie/Installatie-Excel.md` | Working in the Wiekentwie project; it is the project's install/usage guide and documents the VBA behaviour and its limits. |
| `Wiekentwie/tests/edge_cases.ps1` | Changing or debugging the Wiekentwie VBA module; the script is the executable specification (requires Excel for Windows). |
| `boids/(ai instructions).md` | Working anywhere in the Boids project. |
| `boids/README.md` | Working in Boids; use it to understand behavior, controls, and validation. |
| `boids/test.js` | Changing or debugging flocking behavior; tests specify the core's expected behavior. |
| `falling sand/(ai instructions).md` | Working anywhere in the Falling Sand project. |
| `falling sand/README.md` | Working in Falling Sand; use it to understand behavior, controls, and validation. |
| `falling sand/test.js` | Changing or debugging the automaton; tests specify the expected material rules. |
| `2048/(ai instructions).md` | Working anywhere in the 2048 project. |
| `2048/README.md` | Working in 2048; use it to understand behavior, controls, the AI player and its measured strength, and validation. |
| `2048/ai.js` | Changing or debugging the AI player (the heuristic, the expectimax search, or its move choice); it is the DOM-free `AiLib` core that `ai.js`'s tests cover. |
| `2048/test.js` | Changing or debugging the game rules or the AI; tests specify the expected sliding and merging behavior, the heuristic terms, and the AI's move choice. |
| `analog horror raycaster/(ai instructions).md` | Working anywhere in the Analog Horror Raycaster project. |
| `analog horror raycaster/README.md` | Working in the raycaster; use it to understand behavior, controls, and validation. |
| `analog horror raycaster/test.js` | Changing or debugging the engine (level, rays, fog, movement, pursuit, the item catalogue and effect stacking, collectible placement, fog of war, depth scaling, the den and its solver-backed route); tests specify the expected behavior. |
| `fluid dynamics/(ai instructions).md` | Working anywhere in the Fluid Dynamics project. |
| `fluid dynamics/README.md` | Working in Fluid Dynamics; use it to understand behavior, controls, the solver, and validation. |
| `fluid dynamics/test.js` | Changing or debugging the solver (projection, advection, vorticity, buoyancy, splats); tests specify the expected behavior. |
| `wave function collapse/(ai instructions).md` | Working anywhere in the Wave Function Collapse project. |
| `wave function collapse/README.md` | Working in Wave Function Collapse; use it to understand the algorithm, controls, and validation. |
| `wave function collapse/test.js` | Changing or debugging the solver (adjacency, entropy, propagation, backtracking, boundary rules); tests specify the expected behavior. |
| `RobloxGame/(ai instructions).md` | Working anywhere in the Roblox Game design kit; it holds the rules that keep the prompts usable (originality constraints, anti-fabrication clauses, dated and sourced numbers) and the .md/.docx pairing rules. |
| `RobloxGame/README.md` | Working in the Roblox Game design kit; it indexes which master prompt to use when, the order to use them in, and what was corrected in the folder. |
| `dither studio/README.md` | Working in Dither Studio; use it to understand the app, the algorithm/palette/glitch catalogues, controls, performance caps, and validation, plus how this folder pairs with the standalone app repository it is published as (`thijnperd/dither-studio`, git-ignored here under `dither-studio/`). |
| `dither studio/SOURCES.md` | Adding or changing a feature, algorithm, palette or numeric table in Dither Studio; it records which published work or open-source tool each one came from, and the divergences we chose deliberately. |
| `dither studio/(ai instructions).md` | Working anywhere in the Dither Studio project; it holds the core invariants that must not be broken (seeded determinism, palette membership, RGB metric consistency, unclamped error, caps) and the steps for adding algorithms, palettes, glitches, and presets. The app repository carries the same rules as its `AGENTS.md`. |
| `dither studio/test.js` | Changing or debugging the dither core (matrices, masks, algorithms, palettes, adjustments, glitch stack, glow, temporal rules, pipeline); tests specify the expected behavior. |
| `dither studio/video.js` | Working on Dither Studio's video mode (frame source, playback clock with frame dropping, working-size cap, WebM recording); it is browser-only and deliberately knows nothing about dithering. |

## Skills

General skills live in `.agents/skills/` as `<name>/SKILL.md`, using the Agent
Skills format. Freebuff / Codebuff discover them automatically and expose each
as a `/skill:<name>` command and through the agent's skill tool; other tools can
read the file directly. On every task, check the skill catalog in
`ai_startup_instructions.md` (mirrored in `AGENTS.md`); when a skill matches,
read and follow its full instructions and any required references.
Project-specific skills live in their project's `SKILLS/` folder and are listed
above. Do not load unrelated skills.

The project list is not exhaustive. If another project or subfolder contains
an `README.md`, `(ai instructions).md`, or other clearly task-relevant context
document, inspect and follow it even before this index is updated.

## Keeping this index current

At the end of every task, review any Markdown files created or changed during
the task. If a file contains durable instructions, architectural decisions,
domain rules, setup/validation requirements, or other context that future AI
work in its scope must read before coding:

1. Add or update a row above with its repository-relative path and a concise
   trigger describing when it must be read.
2. Edit this `context.md` as part of the same task before reporting completion.
3. If the new document changes the repository startup procedure or the
   discoverability of instructions, update `ai_startup_instructions.md` too.

Do not register ordinary task documentation that is not needed before future
coding. Remove or revise entries when files are renamed, deleted, or no longer
authoritative. Keep this index focused and avoid duplicate copies of the full
instructions; link to the canonical source instead.

## Projects published as their own repositories

A project that outgrows the portfolio can be published as its own GitHub
repository. When that happens, the published copy stays out of version control
here (`.gitignore`) while the portfolio keeps the working project, and the
project's `README.md` states which folder is which and that the two are kept in
step. Today:

| Project | Repository | Where the copy lives here |
|---|---|---|
| Dither Studio | [thijnperd/dither-studio](https://github.com/thijnperd/dither-studio) — the standalone app: launchers, manifest, generated icons, `GUIDE.md`, CI | `dither-studio/` (git-ignored; the portfolio copy is `dither studio/`) |
