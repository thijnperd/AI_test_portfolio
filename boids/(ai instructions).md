# AI instructions for the Boids project

A small, dependency-free browser flocking simulation. Keep the simulation core
separate from the browser interface.

## Before working

- Read this file and [`README.md`](README.md).
- For simulation behaviour, read `boids.js` and the relevant cases in `test.js`.
- For rendering, controls, or browser behaviour, read `app.js`, `index.html`,
  and `style.css` as needed.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `boids.js` | `Flock` state, the seeded RNG, the three steering rules, integration, and edge handling. No DOM; exports `BoidsLib` for Node and the browser. |
| `app.js` | Canvas rendering, animation loop, control wiring, and pointer/keyboard interaction. Depends on `boids.js`. |
| `index.html` | UI structure and script load order (`boids.js` before `app.js`). |
| `style.css` | Page layout and presentation. |
| `test.js` | Node.js tests for the simulation core, not browser UI tests. |
| `README.md` | User-facing setup, controls, rules, and test instructions. |

## Project constraints

- Keep the project dependency-free and runnable by opening `index.html` from
  disk; do not add a bundler, server requirement, or package dependency unless
  explicitly requested.
- Keep `boids.js` independent of the browser so it stays testable in Node.
- Preserve the browser global (`BoidsLib`) and Node export behavior.
- **All randomness in the core goes through `makeRng(seed)`** — never
  `Math.random()` in `boids.js`. The same seed and settings must produce the
  same flock. (`app.js` may use `Math.random()` only to pick fresh seeds.)
- Speeds must stay bounded by `maxSpeed`; positions must stay inside the world
  for both `edge: 'wrap'` and `edge: 'bounce'`.

## Extending the simulation

### Add or change a steering rule

1. Add the accumulation in `steering(boid)` in `boids.js`, using neighbour
   deltas computed with `torusDelta` so the rule respects wrap-around.
2. Add a weight to `DEFAULTS` and use it when combining forces.
3. Expose it in the UI in `index.html` and wire it in `app.js`
   (`applyLive` / `readControls`) if it is user-adjustable.
4. Add a test in `test.js` that isolates the rule with the other weights at 0.
5. Run `node test.js`.

### Change rendering or controls

- Keep simulation state and rules in `boids.js`; keep drawing, animation, and
  interaction in `app.js`.
- Keep `render()` allocation-light — it runs every frame while animating.
- Preserve responsive layout and device-pixel-ratio handling in `resize()`.
- Manually test the affected interaction in a browser; `test.js` does not
  exercise the DOM or canvas.

## Validation

From this directory, run:

```bash
node test.js
```

Run this after changes to `boids.js` or simulation behaviour. For changes to
`app.js`, `index.html`, or `style.css`, also open `index.html` in a browser and
check the affected controls and display. Keep README claims aligned with what
the source and tests actually guarantee.
