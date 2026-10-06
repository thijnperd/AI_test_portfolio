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
