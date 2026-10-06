# AI instructions for the shared tools folder

Shared dev tooling. Nothing here is a dependency of any project: every project
stays zero-dependency and opens from `file://`. This folder exists only to
**verify** those projects in a real browser.

## Before working

- Read this file and [`README.md`](README.md) (the user-facing usage notes).
- For the repo-wide rules, read [`../AGENTS.md`](../AGENTS.md),
  [`../ai_startup_instructions.md`](../ai_startup_instructions.md), and
  [`../context.md`](../context.md).
- Read `browser-check.cjs` before changing its behaviour; it is the only
  executable here and its option table in `README.md` must stay accurate.

## What lives here

| File | Responsibility |
|---|---|
| `browser-check.cjs` | The headless Playwright driver: loads a page, records console/page errors, presses keys, clicks, asserts selectors, evaluates JS, screenshots. Prints a JSON summary; exits non-zero on any error or missing `--expect`. |
| `check.sh` | Thin wrapper that points `NODE_PATH` at the global npm root so `require('playwright')` resolves. `browser-check.cjs` falls back to `npm root -g` on its own, so this is convenience, not a requirement. |
| `README.md` | Install steps, the option table, and copy-paste examples. |

## Constraints

- **Never add a dependency to a project to support testing.** Playwright is
  installed *globally* on purpose and browsers live in the OS cache; keep it
  that way. Do not add a `package.json` here or in any project.
- **Do not put repo-local artifacts here.** No screenshots or reports checked
  into this folder; write scratch output to a temp path (e.g. `/tmp/...`).
- Run from the **repository root** so relative project paths resolve
  (`bash tools/check.sh "2048/index.html"`).
- Keep the output a single JSON object and keep the exit code meaningful —
  agent workflows branch on it. `ok` must stay `true` only when there are no
  console errors, no page errors, and every `--expect` matched.
- Preserve the **one `--eval` per run** contract (the last one wins) unless you
  also update `README.md`. Return a JSON string from the eval to inspect several
  values at once, and return a Promise to wait for frames to run.
- Windows note: run scripts with `bash tools/check.sh`, and remember the shell
  is Git Bash — use POSIX syntax and forward slashes.

## Adding or changing tooling

1. Prefer extending `browser-check.cjs` with an option over adding a second
   script; the option table in `README.md` is the contract.
2. Update `README.md` in the same change — its table is what other agents read.
3. Verify by driving at least one real project, including a **failing** case
   (e.g. a missing `--expect`) to confirm the non-zero exit still works.
4. If the tool changes which projects must be checked before finishing, update
   [`../ai_startup_instructions.md`](../ai_startup_instructions.md) too.

## Validation

```bash
# a real project loads, renders, and reports no errors
bash tools/check.sh "boids/index.html" --expect canvas --eval "window.Boids.count"

# a deliberate failure must exit non-zero
bash tools/check.sh "boids/index.html" --expect "#nope"; echo "exit=$?"
```
