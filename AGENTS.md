# Instructions for AI agents

This repository is the personal coding-projects workspace of Thijn Köhne. It is
a **collection of independent, self-contained projects**, not one codebase.

## Start here

1. Read this file (it is loaded automatically by AGENTS.md-aware tools, including
   Freebuff / Codebuff and other agent CLIs).
2. Read [`context.md`](context.md) — the index of durable project context and
   read-before-coding documents.
3. Read [`ai_startup_instructions.md`](ai_startup_instructions.md) — the full
   workflow, project conventions, and the general skill catalog.Read [`DESIGN.md`](DESIGN.md) before styling or restyling any project's interface — it also holds the performance budget every project must respect (no project may be too intense for an ordinary laptop).
4. Identify the project folder that owns the task, then read that folder's
   `README.md` and `(ai instructions).md` before editing.
5. Check the skill catalog below (and in `ai_startup_instructions.md`) and load
   any skill that matches the task.

Do not assume this file is the only guidance. `context.md` and the per-project
instruction files add rules for their own scopes.

## How Freebuff loads guidance in this repo

Freebuff is built on Codebuff and follows the open Agent Skills / AGENTS.md
conventions. That means:

- **`AGENTS.md` (this file) is the auto-loaded entry point.** Other startup
  documents (`context.md`, `ai_startup_instructions.md`, project instructions)
  are *not* auto-loaded — read them explicitly when this file points to them.
- **Skills live in [`.agents/skills/`](.agents/skills/)** as
  `<name>/SKILL.md` with YAML frontmatter (`name` + `description`). Every skill
  there is discovered automatically and becomes a `/skill:<name>` command; the
  agent can also load one on demand through its skill tool. Providers also scan
  `.claude/skills/` (project) and `~/.agents/skills/`, `~/.claude/skills/`
  (global), with project skills taking priority.
- Tools that read other conventions are supported through the compatibility
  files [`.github/copilot-instructions.md`](.github/copilot-instructions.md)
  (GitHub Copilot) and `context.md` (this repo's own index).

The catalog below is a routing table: load the skill whose *use case* matches
the task, not merely because a keyword appears. Open the full `SKILL.md` before
applying a skill.

## General skills catalog

Check this catalog on every task. Files live at
`.agents/skills/<name>/SKILL.md` and can also be invoked as `/skill:<name>`. Community skills are pinned in `skills-lock.json` (source + hash) so the set is reproducible — keep it in sync rather than editing `.agents/skills/` by hand; add more with `npx skills add <owner/repo> --list` and restore with `npx skills experimental_install`.

| Skill | Use it when... |
|---|---|
| `grill-me` | The user asks for a structured, probing interview to sharpen a plan or design. |
| `to-spec` | The user asks to turn the conversation and project context into a written feature specification. |
| `to-tickets` | The user asks to break a plan, spec, or discussion into implementation tickets with dependencies. |
| `tdd` | The user requests test-first development, says TDD/red-green-refactor, or specifically asks for integration tests. |
| `improve-codebase-architecture` | The user asks for architectural improvement opportunities or a deepening-oriented architecture review. |
| `impeccable` | The task designs, redesigns, critiques, audits, or polishes a frontend/UI/UX. Not for backend-only tasks. |
| `thermo-nuclear-code-quality-review` | The user asks for an especially strict or deep maintainability/code-quality review. |
| `webapp-testing` | The user asks to test, verify, or demo a web app in a real browser. Not for unit tests. |
| `frontend-design` | Building or styling a user-facing interface that needs a deliberate visual direction. |
| `skill-creator` | Creating, improving, or evaluating an agent skill, or researching/installing community skills. |
| `handoff` | Deliberately ending or splitting a session and preparing a structured handoff. |
| `llm-coding-guardrails` | Any coding task; general behavioral guardrails alongside a task-specific skill. |
| `canvas-design` | Creating standalone visual-art deliverables where composition and visual quality are the goal. |
| `brand-guidelines` | Applying a defined or newly proposed brand identity (colors, type, logo, tone). |
| `security-review` | The user asks for a security review, vulnerability audit, or threat check. |
| `mcp-builder` | Designing or building an MCP server or integrating an external API/tool for agent use. |
| `systematic-debugging` | Diagnosing an unknown cause of a bug, failing test, crash, or regression before editing. |
| `animate` | Building motion from scratch: adding an animation, a transition, or making a component feel alive. For critique of existing motion use `review-animations`; for a codebase-wide audit use `improve-animations`. |
| `review-animations` | Critiquing animation or motion code against a high craft bar. User-invoked only (it disables automatic invocation). |
| `improve-animations` | Auditing a codebase's motion and producing prioritised, self-contained implementation plans. Read-only on source. |
| `find-animation-opportunities` | Finding places that should animate but do not, with exact values proposed. Read-only and deliberately restrained. |
| `design-taste-frontend` | Building landing pages, portfolios, or redesigns that must not look templated. The repo's `DESIGN.md` house style outranks any preset direction. |
| `web-design-guidelines` | Reviewing UI code for Web Interface Guidelines compliance, accessibility, and UX best practice. |
| `diagnosing-bugs` | Diagnosing hard bugs or performance regressions. Overlaps `systematic-debugging`; prefer that for a general unknown-cause hunt. |
| `algorithmic-art` | Creating generative or algorithmic art. It assumes p5.js, so prefer the zero-dependency canvas approach of the `algorithmic art` project where the two conflict. |
| `theme-factory` | Styling an artifact (HTML page, doc, or deck) with a theme. The `DESIGN.md` tokens outrank preset themes. |
| `doc-coauthoring` | Writing or co-authoring documentation, proposals, specs, or decision docs. |

## Rules for working here

- Identify the project folder that owns the requested work before creating or
  editing files.
- Read that project's `README.md` and `(ai instructions).md` before making
  changes, if they exist.
- If the task is within a subfolder that has its own instruction file, read it.
- Keep project-specific changes inside the owning project folder. Use the
  repository root only for shared docs and index files.
- When the user's request is clear, proceed without permission-seeking or
  preference interviews. Inspect the repo to resolve ordinary uncertainties;
  ask only if an essential ambiguity, conflict, or risky decision cannot
  otherwise be resolved.
- Keep every project light enough to run comfortably on a laptop: light
  defaults, capped maxima, cache heavy work instead of recomputing it per frame
  or per slider event, and never peg a CPU core. See the performance clause in
  `DESIGN.md`.
- Before you finish a session, append one entry to [`log.md`](log.md): a single
  line with the date and time, the model name you are running as, and what you
  did. See [`ai_startup_instructions.md`](ai_startup_instructions.md).
- For bug fixes, understand the root cause and run the most relevant available
  validation.
- Keep `context.md` and the instruction files in sync when you add or rename
  durable docs, project folders, or skills.

## Browser verification

Playwright is installed globally (never as a project dependency). Verify any
browser-facing change with the shared harness:

```bash
bash tools/check.sh "<project>/index.html" --expect canvas --screenshot /tmp/shot.png
```

It records console/page errors, can `--press`/`--click`, assert with `--expect`,
read state with `--eval`, and exits non-zero on failure. See `tools/README.md`.

