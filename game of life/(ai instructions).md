# AI instructions for the Game of Life project

This is a small, dependency-free browser implementation of Conway's Game of
Life. Keep the simulation core separate from the browser interface.

## Before working

- Read this file and `README.md`.
- For simulation behavior, read `life.js` and the relevant cases in `test.js`.
- For controls, rendering, or browser behavior, read `app.js`, `index.html`,
  and `style.css` as needed.
- Follow the repository-level guidance in `../ai_startup_instructions.md` and
  `../WhatIsThisFolder.md`.

## File responsibilities

| File | Responsibility |
|---|---|
| `life.js` | Grid state, B3/S23 generation steps, and pattern definitions. No DOM or canvas dependencies; exports `Life` for Node and the browser. |
| `app.js` | Canvas rendering, animation loop, UI event handling, and pointer/keyboard interaction. Depends on `life.js`. |
| `index.html` | UI structure and script load order (`life.js` before `app.js`). |
| `style.css` | Page layout and presentation. |
| `test.js` | Node.js tests for the simulation core, not browser UI tests. |
| `README.md` | User-facing setup, controls, rules, and test instructions. |

## Project constraints

- Keep the project dependency-free and runnable by opening `index.html` from
  disk; do not add a bundler, server requirement, or package dependency unless
  explicitly requested.
- Keep `life.js` independent of the browser so it remains testable in Node.
- Preserve the browser global and Node export behavior when changing the core.
- The default rule is B3/S23. Only change it when requested, and update the
  README and tests to match.
- Randomization currently uses `Math.random()` and is intentionally not seeded.
  Do not describe the simulation or random fills as deterministic.
- The app starts with a random grid and begins running automatically.
- `layout()` resizes the grid while preserving its overlapping top-left region.

## Extending the simulation

### Add or change a pattern

1. Add or update its entry in `PATTERN_ART` in `life.js`. Use a kebab-case ID,
   a readable display name, and ASCII rows where `O` is live.
2. Verify the pattern's cell count and claimed behavior with a suitably sized
   grid; consider edge wrapping and finite-grid effects.
3. Add or update tests in `test.js`. Use exact state comparisons for periods
   and spaceship movement where possible, rather than relying only on
   population counts.
4. Update the pattern table in `README.md` if user-facing behavior changes.
   `app.js` fills the pattern selector from `Life.PATTERNS`, so adding a
   pattern does not normally require HTML changes.

### Add or change a UI control

1. Add the markup and a unique element ID in `index.html`.
2. Look up and wire the element in `app.js`, following the existing event
   handling and state conventions.
3. Update this file or `README.md` if the control changes the user workflow.
4. Manually test the affected interaction in a browser; `test.js` does not
   exercise the DOM or canvas.

### Change rendering or layout

- Keep simulation state and rules in `life.js`; keep drawing and browser
  interaction in `app.js`.
- Preserve responsive layout and ensure canvas dimensions and drawing scale
  remain consistent with the device pixel ratio.
- Check resize behavior, pointer-to-cell mapping, and redraw behavior in a
  browser after relevant changes.

## Validation

From this directory, run:

```bash
node test.js
```

Run this after changes to `life.js` or simulation behavior. For changes to
`app.js`, `index.html`, or `style.css`, also open `index.html` in a browser and
check the affected controls and display. Keep README claims aligned with what
the source and tests actually guarantee.
