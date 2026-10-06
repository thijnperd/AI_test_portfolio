# AI startup instructions for this repository

Use this file as the starting point for any coding task in this repository.

## Objective

This repository is a collection of separate projects. Treat it as a set of independent folders, not as one app or one codebase.

## First actions for every AI session

When a task starts, do the following in order:

1. Read this file first.
2. Read `context.md` in the repository root.
3. Check the repository root for repo-level instruction files and project folders.
4. Identify the relevant project folder for the task.
5. Read the context-index entries that apply to the project and task.
6. Read that project's README.md and local `(ai instructions).md` if present.
7. Look for a `skills` or `SKILLS` folder in the repository and in the
   relevant project or task subfolder.
8. Compare the task against the general skill catalog below and any
   project-specific skill catalogs.
9. Read the full instruction file for every skill that clearly applies,
   including any references it requires. Do not load unrelated skill
   instructions or apply a workflow just because its name sounds similar.
10. Only then make changes.
11. When the task is done, append one entry to `log.md` (the
    [model activity log](#model-activity-log) below).
12. Commit the finished work and push it to the GitHub remote (see
    [Committing and pushing when a task is done](#committing-and-pushing-when-a-task-is-done)).

## Files to check in order

Always check these instruction sources before editing:

- `ai_startup_instructions.md` — repository startup instructions (this file)
- `context.md` — index of durable project context and mandatory read-before-coding documents
- `AGENTS.md` — compatibility entry point for tools that load AGENTS files
- `.github/copilot-instructions.md` — repo-level Copilot guidance
- `DESIGN.md` — the shared visual and interaction design language and performance budget (read before styling or restyling any project, and before any change that affects cost)
- `tools/README.md` — the shared Playwright browser-testing harness (how to verify a project in a real browser)
- `README.md` in the relevant project folder
- `(ai instructions).md` in the relevant project folder
- any nested instruction file under a subfolder such as `Source material/(ai instructions).md` if the task is specifically in that area
- applicable skill documentation in a `skills` or `SKILLS` folder
- `.agents/skills/` — check the catalog below and load/open the relevant skill(s); each skill is `.agents/skills/<name>/SKILL.md`

Do not assume every AI tool automatically loads every instruction file.

- **Freebuff / Codebuff** auto-load the root `AGENTS.md`, which points here and
  to `context.md`. They also discover every skill under `.agents/skills/` as
  `<name>/SKILL.md` and expose it as `/skill:<name>` (and through the agent's
  skill tool), so read the matching `SKILL.md` before applying it. This startup
  file is not auto-loaded by itself; follow the pointer from `AGENTS.md`, or ask
  the assistant to read it at the start of a session and to reread it when it
  changes.
- **GitHub Copilot** reads `.github/copilot-instructions.md`.
- For any other tool that does not confirm automatic startup-file support, ask
  it explicitly to read and follow this file, and to reread it when it changes.

## How to find the relevant project

Before changing code, determine which project the task belongs to:

- look at the directory names in the repo root
- inspect nearby folders and files to understand the scope
- if the task mentions a feature, domain, or app name, match it to the project folder that owns it
- if the task is broad or unclear, do not edit blindly; inspect the folder structure first

## Scope rules

- Keep changes inside the relevant project folder.
- Do not mix unrelated projects in the same task.
- Do not modify repo-root files unless the request explicitly targets them.
- Keep code changes small and targeted.

## Interaction defaults

When the user clearly asks for work, proceed with the work instead of asking
for permission, offering a menu of approaches, or conducting an interview.

- Resolve ordinary uncertainties by inspecting the repository, its
  instructions, and existing patterns. Do not ask the user to answer questions
  that can be answered by reading the project.
- For minor or reversible choices, make a sensible, conventional choice and
  mention it briefly in the completion summary if it matters.
- Ask a concise clarifying question only when an essential fact is missing,
  materially different interpretations would produce substantially different
  results, instructions conflict, or a risky/irreversible action needs
  authorization. Ask only after reasonable inspection cannot resolve it.
- If clarification is genuinely necessary, ask one focused question at a
  time; do not turn it into a sequence of preference checks.
- Do not ask "Should I proceed?", request approval for routine edits or tests,
  or add unsolicited follow-up questions/offers after completing the task.
- Use interview, grilling, quiz, or approval workflows only when the user
  explicitly requests that interaction or it is an unavoidable prerequisite.

## Project folder conventions

Each project folder should ideally contain:

- `README.md`
- source files
- assets or generated output if needed
- tests or notes when relevant
- `(ai instructions).md` for project-specific AI guidance

## Required project-specific instruction sequence

For any project task:

1. Open the project folder.
2. Check for `README.md`.
3. Check for `(ai instructions).md`.
4. If a nested task belongs to a sub-area such as `Source material`, also read that subfolder's instruction file.
5. Search for `skills` or `SKILLS` folders at the repository, project, and
   relevant subfolder levels.
6. Check the general skill catalog below on every task; select skills whose
   stated use cases match the request.
7. Read the full file for each selected skill and any references it requires.
   Follow its workflow when applicable, respecting its prerequisites and
   limitations. Do not read or apply unrelated skills.
8. Follow the project's local conventions before inventing a new structure.

## General skills catalog

Check this catalog for every task. The descriptions are routing hints: use a
skill when the request matches its stated scenario, not simply because a
keyword appears. General skills are stored in `.agents/skills/<name>/SKILL.md`; read the
matching file before applying its guidance.

| Skill | File | Use it when... |
|---|---|---|
| `grill-me` | `.agents/skills/grill-me/SKILL.md` | The user asks for a structured, probing interview to sharpen a plan or design. |
| `to-spec` | `.agents/skills/to-spec/SKILL.md` | The user asks to turn the conversation and project context into a written feature specification. |
| `to-tickets` | `.agents/skills/to-tickets/SKILL.md` | The user asks to break a plan, spec, or discussion into implementation tickets with dependencies. |
| `tdd` | `.agents/skills/tdd/SKILL.md` | The user requests test-first development, says TDD/red-green-refactor, or specifically asks for integration tests. |
| `improve-codebase-architecture` | `.agents/skills/improve-codebase-architecture/SKILL.md` | The user asks for architectural improvement opportunities or a deepening-oriented architecture review. |
| `impeccable` | `.agents/skills/impeccable/SKILL.md` | The task designs, redesigns, critiques, audits, or polishes a frontend/UI/UX, including visual layout, accessibility, responsiveness, motion, or interface copy. Not for backend-only tasks. |
| `thermo-nuclear-code-quality-review` | `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md` | The user asks for an especially strict or deep maintainability/code-quality review focused on abstractions, file size, or branching complexity. |
| `webapp-testing` | `.agents/skills/webapp-testing/SKILL.md` | The user asks to test, verify, or demo a web app in a real browser, inspect browser errors/screenshots, or validate canvas/animation output. Not for unit tests or Node test runners. |
| `frontend-design` | `.agents/skills/frontend-design/SKILL.md` | Building or styling a user-facing interface where a deliberate, distinctive visual direction is needed. For auditing or polishing an existing UI, use `impeccable`. |
| `skill-creator` | `.agents/skills/skill-creator/SKILL.md` | Creating, improving, or evaluating an agent skill, or researching/installing community skills. |
| `handoff` | `.agents/skills/handoff/SKILL.md` | Deliberately ending or splitting a session and preparing a structured handoff for a fresh session or agent. |
| `llm-coding-guardrails` | `.agents/skills/llm-coding-guardrails/SKILL.md` | Any coding task; use as general behavioral guardrails alongside any task-specific skill. |
| `canvas-design` | `.agents/skills/canvas-design/SKILL.md` | Creating standalone visual-art deliverables such as posters or illustrations where composition and visual quality are the goal; not app UI or generative-algorithm sketches. |
| `brand-guidelines` | `.agents/skills/brand-guidelines/SKILL.md` | Applying a defined or newly proposed brand identity, including colors, typography, logo use, or tone. |
| `security-review` | `.agents/skills/security-review/SKILL.md` | The user asks for a security review, vulnerability audit, or threat check; not general code quality or production incident response. |
| `mcp-builder` | `.agents/skills/mcp-builder/SKILL.md` | Designing or building an MCP server or integrating an external API/tool for agent use; not merely consuming available MCP tools. |
| `systematic-debugging` | `.agents/skills/systematic-debugging/SKILL.md` | Diagnosing an unknown cause of a bug, failing test, crash, visual glitch, or regression before editing; not feature work or live cloud incidents. |
| `animate` | `.agents/skills/animate/SKILL.md` | Building motion from scratch: adding an animation, a transition, or making a component feel alive. For critique of existing motion use `review-animations`; for a codebase-wide audit use `improve-animations`. |
| `review-animations` | `.agents/skills/review-animations/SKILL.md` | Critiquing animation or motion code against a high craft bar. User-invoked only (it disables automatic invocation). |
| `improve-animations` | `.agents/skills/improve-animations/SKILL.md` | Auditing a codebase's motion and producing prioritised, self-contained implementation plans. Read-only on source. |
| `find-animation-opportunities` | `.agents/skills/find-animation-opportunities/SKILL.md` | Finding places that should animate but do not, with exact values proposed. Read-only and deliberately restrained. |
| `design-taste-frontend` | `.agents/skills/design-taste-frontend/SKILL.md` | Building landing pages, portfolios, or redesigns that must not look templated. The repo's `DESIGN.md` house style outranks any preset direction. |
| `web-design-guidelines` | `.agents/skills/web-design-guidelines/SKILL.md` | Reviewing UI code for Web Interface Guidelines compliance, accessibility, and UX best practice. |
| `diagnosing-bugs` | `.agents/skills/diagnosing-bugs/SKILL.md` | Diagnosing hard bugs or performance regressions. Overlaps `systematic-debugging`; prefer that for a general unknown-cause hunt. |
| `algorithmic-art` | `.agents/skills/algorithmic-art/SKILL.md` | Creating generative or algorithmic art. It assumes p5.js, so prefer the zero-dependency canvas approach of the `algorithmic art` project where the two conflict. |
| `theme-factory` | `.agents/skills/theme-factory/SKILL.md` | Styling an artifact (HTML page, doc, or deck) with a theme. The `DESIGN.md` tokens outrank preset themes. |
| `doc-coauthoring` | `.agents/skills/doc-coauthoring/SKILL.md` | Writing or co-authoring documentation, proposals, specs, or decision docs. |

Some skills describe a user-invoked workflow, require an issue tracker or
specialized tool, or explicitly disable automatic invocation. Respect those
conditions: do not claim to run unavailable commands/tools, publish tickets
without the configured tracker, or start a guided interview unless the skill
and user's request call for it. When no skill matches, proceed using the
repository and project instructions as usual.

## Browser verification

Browser-facing changes should be checked in a real browser, not by reading the
HTML. Playwright is installed globally (not as a project dependency) and driven
by the shared harness:

- `bash tools/check.sh "<project>/index.html" --expect canvas --screenshot /tmp/shot.png`
- drive interactions with `--press <key>` / `--click <selector>`, read state with
  `--eval "<js>"`, and assert elements with `--expect <selector>`.
- the script exits non-zero on any console error or failed assertion, so it can
  gate a change. See `tools/README.md` for all options and examples.

## Debugging rule

When fixing a bug:

- read the relevant file(s) first
- understand the root cause before editing
- choose the smallest possible fix
- run the most targeted validation available

## Creation rule

When creating a new project or new project folder:

- choose a clear, descriptive name
- create a `README.md`
- add a local `(ai instructions).md` when useful
- keep the project self-contained and isolated from other projects
- keep it light enough to run comfortably on a laptop: light defaults, capped
  maxima, and heavy work cached rather than recomputed every frame or on every
  slider change (see the performance clause in `DESIGN.md`)

## Known instruction files in this repo

At the moment, these are the instruction-bearing files to check:

- `ai_startup_instructions.md` (this file)
- `context.md` (read each task; identifies additional context to read for the relevant project)
- `AGENTS.md`
- `.github/copilot-instructions.md`
- `DESIGN.md` (shared design language and performance budget for every project in the repo)
- `log.md` (model activity log; every model appends one entry per session — see above)
- `tools/README.md` (shared browser-testing harness; Playwright is installed globally)
- `.agents/skills/` — general skill catalog (27 skills; select the applicable
  ones and read each skill's `.agents/skills/<name>/SKILL.md`); the set is pinned in `skills-lock.json` (source + hash) for reproducibility
- `WhatIsThisFolder.md`
- `algorithmic art/(ai instructions).md`
- `algorithmic art/README.md`
- `algorithmic art/API.md` (when changing shared framework APIs or planning validation)
- `algorithmic art/JSDOC.md` (when writing or updating JavaScript documentation)
- `algorithmic art/PHILOSOPHY.md`
- all applicable files in `algorithmic art/SKILLS/` (see `context.md` for
  task-based descriptions)
- `algorithmic art/SKILLS/algorithmic_art_skill.md`
- `algorithmic art/SKILLS/canvas_performance.md`
- `algorithmic art/SKILLS/color_palette_mastery.md`
- `algorithmic art/SKILLS/generative_composition.md`
- `algorithmic art/Source material/(ai instructions).md`
- `game of life/(ai instructions).md`
- `game of life/README.md`
- `game of life/test.js` (tests are an executable specification for expected behavior)
- `maze generator and solver/(ai instructions).md`
- `maze generator and solver/README.md`
- `maze generator and solver/test.js` (tests are an executable specification for expected behavior)
- `boids/README.md` (Boids overview)
- `boids/(ai instructions).md` (Boids project guidance)
- `boids/test.js` (tests are an executable specification for expected behavior)
- `falling sand/README.md` (Falling Sand overview)
- `falling sand/(ai instructions).md` (Falling Sand project guidance)
- `falling sand/test.js` (tests are an executable specification for expected behavior)
- `2048/README.md` (2048 overview)
- `2048/(ai instructions).md` (2048 project guidance)
- `2048/test.js` (tests are an executable specification for expected behavior)
- `analog horror raycaster/README.md` (Analog Horror Raycaster overview)
- `analog horror raycaster/(ai instructions).md` (Analog Horror Raycaster project guidance)
- `analog horror raycaster/test.js` (tests are an executable specification for expected behavior)
- `fluid dynamics/README.md` (Fluid Dynamics overview)
- `fluid dynamics/(ai instructions).md` (Fluid Dynamics project guidance)
- `fluid dynamics/test.js` (tests are an executable specification for the fluid solver)
- `wave function collapse/README.md` (Wave Function Collapse overview)
- `wave function collapse/(ai instructions).md` (Wave Function Collapse project guidance)
- `wave function collapse/test.js` (tests are an executable specification for the WFC solver)
- `Wiekentwie/README.md` (Wiekentwie overview)
- `Wiekentwie/(ai instructions).md` (Wiekentwie project guidance)
- `Wiekentwie/Installatie-Excel.md` (Wiekentwie install and usage guide, in Dutch)
- `Wiekentwie/tests/edge_cases.ps1` (Wiekentwie executable specification; requires Excel for Windows)
- `tools/(ai instructions).md` (shared browser-testing tooling constraints)
- applicable `.agents/skills/<name>/SKILL.md` files (use the catalog above)

## Model activity log

Every AI model that works in this repository appends one entry to
[`log.md`](log.md) before it finishes a session. No exceptions, and no
backfilling of earlier sessions.

- **File:** `log.md` in the repository root. Create it if it does not exist.
  Keep it at the root; never move it into a project folder.
- **One entry per session, appended at the bottom** (oldest first). Do not
  rewrite, reorder, or delete existing entries.
- **One line per entry**, with exactly these three things in this order:

  ```
  - YYYY-MM-DD HH:MM — <model name> — <what you did, in one line>
  ```

  - the **date and time** the entry is written (24-hour clock, local time),
  - the **model name** you are running as — use the model identity you were
    given, not a guess (e.g. `DeepSeek V4.1 Flash`),
  - **what you did**, in a single line. If a session did several things,
    summarise them on that one line.
- A model does not edit or "fix" another model's entry. To correct your own,
  append a new entry rather than amending history.
- The log records *who changed what*, across the whole repository. It is not a
  substitute for a project's own README or changelog.

## Committing and pushing when a task is done

When a task is finished, commit the work and push it. Do not leave finished
work sitting uncommitted, and do not stop after editing the files.

- **Remote and branch.** Push to `origin` — `thijnperd/AI_test_portfolio`
  (`https://github.com/thijnperd/AI_test_portfolio`) — on branch `main`, which
  already tracks `origin/main`. A plain `git push` is what is wanted.
- **Order.** Finish and verify the work, append the `log.md` entry above, then
  commit and push. One push per completed task, not one per file.
- **Verify before you push.** Run the checks that cover the change: the
  project's `node test.js`, and `tools/check.sh` for anything browser-facing.
  Do not push unchecked work. If a check could not run, say so plainly instead
  of implying it passed.
- **Check what you are publishing.** This repository is public, so anything
  pushed is world-readable and effectively permanent. Confirm you are not
  adding secrets, credentials, or personal data, and that files which must stay
  local are covered by `.gitignore` (for example `*.xlsm` — see
  `Wiekentwie/(ai instructions).md`). Never `git add -f` an ignored data file.
- **Confirm the push landed.** Work is not done until it is on the remote: check
  the command's exit status, or compare `git rev-parse HEAD` with
  `git ls-remote origin refs/heads/main`.
- **Report failures honestly.** If the push fails — authentication, a rejected
  non-fast-forward, no network — fix it, or say plainly that it failed. Never
  describe a failed or skipped push as done.
- **Do not rewrite published history.** No `git push --force`, no history
  rewriting, and no pushing to another remote or branch, unless the user asks
  for it explicitly.
- **Skip the push only when told to.** Leave the work uncommitted when the user
  asks you not to push, or when the session was read-only (inspection, review,
  explanation) and produced no changes to commit.

## Summary

The AI must start here, identify the correct project, and then read the most relevant instruction files before editing. The repo is organized by project folders, and each project can carry its own local guidance.
