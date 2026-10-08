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
- 2026-10-07 11:53 — DeepSeek V4.1 Flash — Added a visible AI mode to 2048: an expectimax player (`ai.js`) with the monotonicity/smoothness/empty/corner heuristic, showing its scored shortlist and reasoning in the rail, backed by `applyMove` shared with the game core, 21 new tests (46 total), and a measured depth-3 record of 1024-4096 tiles at ~20ms a move.
- 2026-10-07 12:46 — DeepSeek V4.1 Flash — Added custom blocks to 2048: a new `blocks.js` core for divide/multiply/add/subtract operator tiles and plain number blocks, a per-block spawn rarity table (editable in the rail, including the classic 2 and 4), and a milestone ladder derived from the blocks in play so every rung is reachable (a 3s-only board climbs 96-12288), with 17 new tests (63 total) proving the default blocks still play tile-for-tile like the game before them.
- 2026-10-07 13:00 — DeepSeek V4.1 Flash — Made the `RobloxGame` design kit ready to use: converted the three research dossiers out of Word into Markdown (repairing the callout boxes the export had glued into their own labels), reconciled the two documents that disagreed about the game's player count instead of letting either stand as fact, removed the duplicated copy of the master prompt, gave the general prompt the same section structure as the other two, made every prompt name the research it depends on, and added the kit's README and project instructions.
- 2026-10-08 17:46 — Buffy — Added the Dither Studio project: a zero-dependency browser dithering press (20 classic algorithms, 11 retro palettes, tone/detail adjustments, a five-effect glitch stack plus glow, zoom/pan/compare, nine presets, PNG export; DOM-free core with 35 Node tests), and registered it in context.md and ai_startup_instructions.md.
- 2026-10-08 18:31 — Buffy — Made Dither Studio premium: 43 algorithms (generated line/diagonal/checks/spiral/clustered screens, IGN/R2/crosshatch masks, a lazy 32x32 blue-noise mask, Fan/Shiau-Fan/two-row kernels, and three Yliluoma mixing variants), 22 palettes, dither strength + serpentine, levels and gamma, ten tone maps, three alpha modes, six new glitch effects with per-effect modes, linear-light glow, ASCII text mode with .txt export, clipboard copy and a random-recipe button, plus SOURCES.md recording every published and open-source reference; 69 Node tests and browser checks green.
- 2026-10-08 19:10 — Buffy — Gave Dither Studio the three structure-aware looks (Smooth Diffusion, Rain Streaks, Dot Field) that bend a generated screen along the picture's own contours, a ripple and a starfield glitch plus matrix-green and ice inks, presets for the three looks, and a whole video mode in a new `video.js` (video file / webcam / generated clip, 1-30 fps, freeze-shimmer-crawl temporal dither rules, frame dropping instead of queueing, WebM recording); 87 Node tests and browser checks green.
