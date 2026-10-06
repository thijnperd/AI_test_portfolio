# Copilot instructions for this repository

Treat this repository as a portfolio of separate, self-contained projects, not as one monolithic codebase.

## Startup file

Start by reading `ai_startup_instructions.md` in the repository root. That file tells the assistant how to identify the relevant project folder and where to find other instruction files.
Also read `context.md` in the repository root before coding. It indexes
project-specific guidance and durable context, with triggers for when each
document applies. `AGENTS.md` is the shared entry point loaded automatically by
AGENTS.md-aware tools and points to both files.

General skills live in `.agents/skills/<name>/SKILL.md` (Agent Skills format).
Tools that support skills discover them automatically; otherwise read the
matching `SKILL.md` directly.

## Core rules

- Identify the correct project folder before creating files or editing code.
- Keep all project-specific files, docs, assets, and generated output inside that project folder.
- Do not mix unrelated projects in the same directory.
- Use the repository root only for shared documentation, index files, and repo-wide notes.
- Prefer clear, descriptive project names over vague placeholders such as `project1`, `misc`, or `stuff`.
- If a task is ambiguous, inspect nearby folders and the relevant project documentation before making assumptions.
- When a request is clear, do the work without asking permission or conducting
  a preference interview. Resolve routine uncertainty by inspecting the repo;
  ask only when an essential ambiguity, conflict, or risky decision cannot be
  resolved from available context. Avoid unsolicited follow-up offers.

## Project structure

Each project should ideally include:

- `README.md` with purpose, setup, and usage notes
- source files and configuration relevant to the project
- assets or generated outputs if needed
- tests or notes when relevant
- a local `(ai instructions).md` when the project needs custom guidance for AI or contributors

## Editing workflow

Before modifying code:

1. Determine which project folder is relevant.
2. Check the project folder and nearby child folders for scope.
3. Read the relevant project README and any project-local `(ai instructions).md` if present.
4. Look for `skills` or `SKILLS` folders in the repository and relevant
   project/subfolders. Check the general skills catalog in
   `ai_startup_instructions.md` on every task, then read
   `.agents/skills/<name>/SKILL.md` for the relevant skills only.
5. Keep the fix or change tightly scoped to the relevant project.
6. Prefer minimal, understandable edits over broad refactors.

## Debugging workflow

When fixing a bug:

- read the relevant file(s) and understand the actual issue
- identify the root cause before changing code
- keep the fix as small as possible
- validate with the most targeted check available
- for browser-facing changes, verify with the shared Playwright harness
  (`bash tools/check.sh <project>/index.html --expect canvas`); do not add
  Playwright as a dependency of a project — see `tools/README.md`

## Final behavior

If the task is to create a new project, include a clear project folder name, a README, and keep the work isolated. If the task is to edit an existing file, stay inside the right project and follow that project's local conventions before inventing new ones.
