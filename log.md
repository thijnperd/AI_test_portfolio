# Model activity log

Append-only. One entry per AI session, **newest at the bottom**. Do not rewrite,
reorder, or delete existing entries.

Every model that works in this repository adds exactly one line before it
finishes a session, with the date and time (24-hour, local), the model name it
is running as, and a single line saying what it did:

```
- YYYY-MM-DD HH:MM — <model name> — <what was done, in one line>
```

The full rule lives in
[`ai_startup_instructions.md`](ai_startup_instructions.md) under
[Model activity log](ai_startup_instructions.md#model-activity-log).

---

- 2026-10-06 22:16 — DeepSeek V4.1 Flash — Added the `fluid dynamics` and `wave function collapse` projects and the `differential-growth` and `sandpile` sketches, plus the laptop performance rule and this model activity log.
- 2026-10-06 22:31 — DeepSeek V4.1 Flash — Published this workspace to GitHub as the public `thijnperd/AI_test_portfolio` repository, rewriting history to keep the git-ignored Wiekentwie workbook and its contact data local.
- 2026-10-06 22:36 — DeepSeek V4.1 Flash — Added the commit-and-push rule to all four instruction entry points, so finished and verified work is always pushed to the public GitHub remote.
- 2026-10-07 10:46 — DeepSeek V4.1 Flash — Audited the whole repo (8 Node suites and 9 browser projects) and closed the one open DESIGN.md gap: keyboard focus now paints the house accent ring, plus a matching press state, in boids, falling sand, game of life, maze generator and solver, and 2048.
- 2026-10-07 11:08 — DeepSeek V4.1 Flash — Added the `logic puzzles` project: Sudoku and the binary puzzle (Binairo) at 6x6-12x12, each generated with a proven-unique solution and solved one deduction at a time, with 57 Node tests over both cores, and registered it in the root README, context.md, WhatIsThisFolder.md, ai_startup_instructions.md, and DESIGN.md.
