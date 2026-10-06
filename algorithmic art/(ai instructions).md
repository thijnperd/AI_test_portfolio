# AI instructions for the algorithmic art project

This project is a browser-based generative art framework. Treat it as a self-contained creative coding project.

## First checks

Before touching code:

- read `README.md`
- read `Source material/(ai instructions).md` if the task relates to experiments or scratch work
- read `SKILLS/algorithmic_art_skill.md` for algorithmic-art design,
  sketch creation, or generative-art implementation tasks
- identify whether the task belongs in `sketches/`, `core/`, or `Source material/`
- read `JSDOC.md` when changing JavaScript documentation or adding a sketch

## Project structure

- `index.html` loads the app shell and sketch registry
- `core/` contains shared framework logic
- `sketches/` contains finished, registered sketches
- `Source material/` is the scratch area for raw experiments and prototypes

## Core workflow

- Use `Source material/` for raw prototypes and quick experiments
- Promote only the strongest, most coherent results into `sketches/`
- Keep names explicit and readable
- Use the seeded helpers instead of `Math.random()`
- Register each new sketch in `index.html`
- Document each finished sketch with a concise JSDoc module banner and document
  non-obvious helpers/algorithm choices; follow `JSDOC.md`
- When adapting a general technique from a public source, cite it in the sketch
  banner and document the inspiration in `README.md`; keep the implementation
  and composition original

## Editing rules

- Do not move files around casually; preserve intended organization
- Keep the framework deterministic and browser-friendly
- Avoid adding heavy dependencies or build steps
- Prefer minimal edits that fit the existing architecture

## Debugging

- check `core/engine.js` or `core/utils.js` if the issue affects framework behavior
- check the relevant sketch file if the issue is local to one artwork
- validate by loading the page in the browser and testing the affected behavior
- When behavior, APIs, sketch listings, or documentation conventions change,
  update `README.md`, `API.md`, and relevant context documents
