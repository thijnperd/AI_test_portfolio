# Repository context index

This file indexes durable project context and specialized guidance that an AI
assistant should read before coding when it applies to the task. Start with
[`ai_startup_instructions.md`](ai_startup_instructions.md), then use this index
to find the additional files relevant to the project and work area.

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
| `ai_startup_instructions.md` | Starting any task; includes repository workflow, skill routing, and the user's preference to avoid unnecessary questions and proceed when requests are clear. |
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
| `2048/README.md` | Working in 2048; use it to understand behavior, controls, and validation. |
| `2048/test.js` | Changing or debugging the game rules; tests specify the expected sliding and merging behavior. |
| `analog horror raycaster/(ai instructions).md` | Working anywhere in the Analog Horror Raycaster project. |
| `analog horror raycaster/README.md` | Working in the raycaster; use it to understand behavior, controls, and validation. |
| `analog horror raycaster/test.js` | Changing or debugging the engine (level, rays, fog, movement, pursuit, the item catalogue and effect stacking, collectible placement, fog of war, depth scaling, the den and its solver-backed route); tests specify the expected behavior. |
| `fluid dynamics/(ai instructions).md` | Working anywhere in the Fluid Dynamics project. |
| `fluid dynamics/README.md` | Working in Fluid Dynamics; use it to understand behavior, controls, the solver, and validation. |
| `fluid dynamics/test.js` | Changing or debugging the solver (projection, advection, vorticity, buoyancy, splats); tests specify the expected behavior. |
| `wave function collapse/(ai instructions).md` | Working anywhere in the Wave Function Collapse project. |
| `wave function collapse/README.md` | Working in Wave Function Collapse; use it to understand the algorithm, controls, and validation. |
| `wave function collapse/test.js` | Changing or debugging the solver (adjacency, entropy, propagation, backtracking, boundary rules); tests specify the expected behavior. |

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
