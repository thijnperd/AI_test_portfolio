# Thijn Köhne

I build things that shouldn't work in a browser, but do.

Right now that means an image/video dithering press, a first-person raycaster,
an expectimax 2048 AI and a particle sandbox — all plain HTML/CSS/JS, no build
step, no framework, no dependencies. Open the folder and it runs. Where a
project has a simulation core, that core also runs in Node under tests,
because "it looks right" isn't a specification.

## [**Dither Studio**](https://github.com/thijnperd/dither-studio) — the flagship

An offline dithering press for images *and video*, written from scratch with
zero dependencies. Not a toy: it carries **46 dithering algorithms** (from
Floyd–Steinberg and Riemersma to void-and-cluster blue noise and three
structure-aware screens that read the image's own contours), **24 palettes**,
Yliluoma colour mixing plans, tone maps, alpha mattes, a 13-effect glitch
stack, character-based text mode and full video dithering with temporal rules
and WebM recording. A seeded, deterministic core sits under all of it, pinned
by 87 Node tests and timing budgets.

It ships **three builds from one engine**: a frozen web demo on GitHub Pages,
an installable web app, and a Photoshop-shaped Electron desktop app for
Windows — menus, tool rail, docked panels, native dialogs — released
[here](https://github.com/thijnperd/dither-studio/releases).

### [Try it now, nothing to install →](https://thijnperd.github.io/dither-studio/)

![The Dither Studio press console](https://raw.githubusercontent.com/thijnperd/dither-studio/main/docs/screenshot-console.png)

![The desktop app](https://raw.githubusercontent.com/thijnperd/dither-studio/main/docs/desktop-app.png)

---

## The workshop

Everything below is self-contained, dependency-free and covered by tests where
it has a core worth specifying. Live where possible; screenshots everywhere.

| Project | What it is |
|---|---|
| [Fluid dynamics](https://github.com/thijnperd/AI_test_portfolio/tree/main/fluid%20dynamics) | Incompressible Navier–Stokes (Stam's *Stable Fluids*) with vorticity confinement — interactive, in the browser. |
| [Analog horror raycaster](https://github.com/thijnperd/AI_test_portfolio/tree/main/analog%20horror%20raycaster) | "Static Halls": a first-person raycasting horror game — procedural fog, a stalking presence, fog-of-war, two endings. |
| [2048 AI](https://github.com/thijnperd/AI_test_portfolio/tree/main/2048) | Expectimax search over a weighted board heuristic; measured across thousands of games, and you can watch it think. |
| [Falling sand](https://github.com/thijnperd/AI_test_portfolio/tree/main/falling%20sand) | Particle physics: gravity, density, hydrostatic pressure, wet-sand repose. |
| [Boids](https://github.com/thijnperd/AI_test_portfolio/tree/main/boids) | Reynolds' flocking in three steering rules, weights adjustable live. |
| [Wave function collapse](https://github.com/thijnperd/AI_test_portfolio/tree/main/wave%20function%20collapse) | Tilemaps grown from edge constraints, with backtracking. |
| [Logic puzzles](https://github.com/thijnperd/AI_test_portfolio/tree/main/logic%20puzzles) | Sudoku and Binairo generators with unique-solution guarantees and human-style deductive solvers. |
| [Maze generator](https://github.com/thijnperd/AI_test_portfolio/tree/main/maze%20generator%20and%20solver) | Animated maze construction and pathfinding. |
| [Algorithmic art](https://github.com/thijnperd/AI_test_portfolio/tree/main/algorithmic%20art) | A generative-art studio — every sketch seeded, reproducible, PNG export. |

The whole collection lives in [AI_test_portfolio](https://github.com/thijnperd/AI_test_portfolio).

## Other builds

- **[PolyTAS](https://github.com/thijnperd/PolyTAS)** — tool-assisted speedrun
  editor for PolyTrack: per-frame input editing, live recording, replay script
  generation. Chrome MV3.
- **[Imdb_ML](https://github.com/thijnperd/Imdb_ML)** — Python ML that predicts
  a movie's rating from its description.
- **[AIChooser](https://github.com/thijnperd/AIChooser)** — a flowchart-style
  site for finding the right AI for the job. TypeScript.
- **[Dagtekst-Widget](https://github.com/thijnperd/Dagtekst-Widget)** — a Dutch
  daily-text widget.
- **Balatro mods** in Lua (not public — ask me about them).

## Stack

Badges are for the languages I ship, not the languages I installed once:

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![Lua (Balatro mods)](https://img.shields.io/badge/Lua-2C2D72?style=flat-square&logo=lua&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)

## What I lean on

- **Zero-dependency discipline.** If a browser or the standard library can do
  it, I write it there. Everything above runs from a folder with no `npm
  install`, no bundler, nothing.
- **Tests as specification.** The simulation and dithering cores run in Node;
  the 87 dither tests pin determinism, palette membership, tone reproduction
  and timing budgets.
- **Performance budgets.** The preview-vs-full render split, capped working
  sizes and lazy mask generation keep every project running comfortably on an
  ordinary laptop — measured, not hoped.

## Contact

Open an issue on any repo above — I read them.

---

*In the spirit of the projects: this profile is plain Markdown, no statistics
widgets or trophy racks. Source code is the portfolio.*
