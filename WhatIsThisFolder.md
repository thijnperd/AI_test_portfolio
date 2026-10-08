# Coding Projects Repository

This folder is the personal repository for coding projects by Thijn Köhne for testing ai's like: FreeBuff AI.

## Purpose

This workspace is meant to hold separate, self-contained projects. Each project should be easy to understand at a glance, both for humans and for AI tools.

## Project organization rule

Every project must live in its own folder with a name that clearly describes what it is about.

Good examples:

- `algorithmic-art`
- `portfolio-website`
- `weather-dashboard`
- `todo-app`
- `game-of-life`

Avoid vague names such as:

- `project1`
- `stuff`
- `misc`
- `new-folder`

A project folder should make sense without opening the files. The name should communicate the purpose, subject, or core idea of the project.

## Recommended project structure

Each project folder should ideally contain:

- `README.md` — purpose, setup, and usage notes
- source files and configuration relevant to the project
- assets, generated outputs, or data if needed
- tests, notes, or examples if relevant
- a markdown file named `(ai instructions).md` for project-specific AI guidance

## Repository conventions

This repository is meant to hold separate, self-contained projects rather than one big codebase.

- Keep each project in its own folder with a clear, descriptive name.
- Use the repository root only for shared documentation, repo-level notes, and index files.
- Keep project-specific code, assets, docs, and generated files inside the relevant project folder.
- Avoid mixing unrelated projects in the same directory.
- Prefer readable names over vague placeholders such as `project1`, `misc`, or `stuff`.
- If a task is ambiguous, check the nearby folder structure and the relevant project README before making assumptions.

## AI / Copilot guidance

The repository includes a startup instruction file at [ai_startup_instructions.md](ai_startup_instructions.md). This is the main file to read at the start of a session, because it tells the assistant how to find the right project and where to look for additional instruction files.

The shared entry point is [AGENTS.md](AGENTS.md): tools such as Freebuff /
Codebuff load it automatically and it points to the startup instructions and
this repo's [context.md](context.md) index. AI assistants should also read the
repo-level guidance in [.github/copilot-instructions.md](.github/copilot-instructions.md),
then check for local instruction files such as `(ai instructions).md` in the
relevant project folder before making changes.

The shared visual language for every project here — tokens, layout, project
voices, and anti-patterns — is [DESIGN.md](DESIGN.md). Read it before styling
or restyling any interface.

Every AI session appends one line to [log.md](log.md) before it finishes: the
date and time, the model name, and what it did. The rule is in
[ai_startup_instructions.md](ai_startup_instructions.md).

This repository is also **published publicly on GitHub** as
[`thijnperd/AI_test_portfolio`](https://github.com/thijnperd/AI_test_portfolio)
(`origin`, branch `main`). A finished task is a pushed task: append the `log.md`
line, then commit and push. Because the repository is public, check what you are
publishing first — no secrets, credentials, or personal data, and data files
such as `Wiekentwie/WieKentWie.xlsm` stay local and git-ignored.

Reusable skills live in [`.agents/skills/`](.agents/skills) as
`<name>/SKILL.md` (Agent Skills format). Skill-aware tools discover them
automatically and expose each as `/skill:<name>`; otherwise read the matching
file directly.

## Current projects

- [algorithmic art](algorithmic%20art) — generative art experiments using HTML, CSS, and JavaScript.
- [dither studio](dither%20studio) — a browser dithering studio that reads an image (or a video) as a print proof: 46 algorithms across ordered screens, error diffusion, stochastic masks, three structure-aware screens that bend their texture along the picture's own contours, and Yliluoma colour mixing, 24 hardware and ink palettes, pixel-size chunking, a tone-map ink system, alpha matte dithering, a 13-effect glitch stack, glow, text/ASCII mode, presets, PNG export, and a live video mode with frame dropping, three temporal dither rules (frozen, shimmer, crawl) and WebM recording, with the DOM-free core covered by Node tests and the sources it was researched from recorded in `SOURCES.md`.
- [game of life](game%20of%20life) — interactive Conway's Game of Life simulation in HTML, CSS, and JavaScript, with Node tests for the rules.
- [logic puzzles](logic%20puzzles) — Sudoku and the binary puzzle (Binairo) with a generator that proves every puzzle has exactly one solution and a solver that can be stepped one deduction at a time (naked and hidden singles, rule deductions, and a labelled guess when logic stalls), in HTML, CSS, and JavaScript, with Node tests for both cores.
- [maze generator and solver](maze%20generator%20and%20solver) — animated maze construction and pathfinding visualizer in HTML, CSS, and JavaScript, with Node tests for the algorithms.
- [Wiekentwie](Wiekentwie) — "Wie kent wie?": a Dutch Excel/VBA matchmaking app (offer a contact, search for people) documented in Dutch, with PowerShell edge-case tests that drive real Excel.
- [boids](boids) — animated flocking simulation driven by three steering rules, in HTML, CSS, and JavaScript, with Node tests for the flocking core.
- [falling sand](falling%20sand) — a material sandbox (sand, water, walls) built on a small cellular automaton, with Node tests for the rules.
- [2048](2048) — the sliding-tile puzzle with arrow/WASD controls, score tracking, and a ladder of tile milestones (with the best tile and run count remembered between sessions) so reaching 2048 opens the next rung rather than ending the game, with Node tests for the slide-and-merge and progression rules.
- [fluid dynamics](fluid%20dynamics) — an interactive incompressible-fluid sandbox (Jos Stam's Stable Fluids) with coloured dye, vorticity confinement, and buoyancy, rendered on the CPU with typed arrays, with Node tests for projection, advection, and stability.
- [wave function collapse](wave%20function%20collapse) — a tilemap generator that grows maps from edge constraints alone (the WFC simple tiled model), with entropy-driven collapse, backtracking, two tile sets, and Node tests for the adjacency table and solver.
- [RobloxGame](RobloxGame) — a design kit rather than a program: three master prompts (general game design, a focused steal-and-collect design, and the studio/brand/page/launch side) plus the three research briefs each one is built on, all in Markdown with the original Word exports kept as provenance.
- [analog horror raycaster](analog%20horror%20raycaster) — "Static Halls": a first-person raycasting horror game with procedural mist fog, a rising dread curve, a stalking presence that hunts and then sleeps in its den, two endings (the exit, or walking into that den), a fog-of-war minimap that expands on `M`, a shard shop across escalating depth tapes including a maze-solver route reveal, and a guide/settings menu with hiding to manage the dread, in HTML, CSS, and JavaScript, with Node tests for the engine.

## Summary

This repository is organized to stay clear, searchable, and easy for both humans and AI assistants to understand. The main rule is simple: treat each project as its own self-contained unit, keep work on that project inside its own folder, and use the project or repo instruction files when needed to preserve consistency.
