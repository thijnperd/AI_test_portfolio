# AI instructions for the Fluid Dynamics project

A small, dependency-free browser fluid simulation (incompressible Navier–Stokes,
Stam's "Stable Fluids"). Keep the solver core separate from the browser
interface.

## Before working

- Read this file and [`README.md`](README.md).
- For simulation behaviour, read `fluid.js` and the relevant cases in `test.js`.
- For rendering, the controls, or pointer behaviour, read `app.js`,
  `index.html`, and `style.css` as needed.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md),
  [`../context.md`](../context.md) and [`../DESIGN.md`](../DESIGN.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `fluid.js` | The grid and its fields, boundary conditions, Gauss-Seidel projection, semi-Lagrangian advection, vorticity confinement, buoyancy, splats, and measurements. No DOM; exports `FluidLib` for Node and the browser. |
| `app.js` | Dye tone-mapping and rendering, the animation loop, pointer interaction, and control wiring. Depends on `fluid.js`. |
| `index.html` | UI structure and script load order (`fluid.js` before `app.js`). |
| `style.css` | Page layout and presentation. |
| `test.js` | Node.js tests for the solver core, not browser UI tests. |
| `README.md` | User-facing setup, controls, the algorithm, and test instructions. |

## The model

| Concern | Where | Rule |
|---|---|---|
| Boundary | `setBnd(b, x)` | `b = 1` reflects horizontal velocity, `b = 2` vertical; other fields copy. Corners average their neighbours. |
| Diffusion | `diffuse`, `linSolve` | Implicit Gauss-Seidel solve, stable at any timestep. |
| Projection | `project` | Compute divergence, relax pressure, subtract its gradient — this is what makes the field incompressible. Runs **twice** per step. |
| Advection | `advect` | Semi-Lagrangian: sample `d0` backwards along velocity and bilinearly interpolate. |
| Vorticity | `applyVorticity` | Restore curl the projection damps; off when `vorticity === 0`. |
| Buoyancy | `applyBuoyancy` | Upward force proportional to the local dye; off when `buoyancy === 0`. |
| Loop order | `step` | forces → diffuse → project → advect → project → vorticity/buoyancy → diffuse dye → advect dye → fade. |

## Project constraints

- Keep the project dependency-free and runnable by opening `index.html` from
  disk; do not add a bundler, server requirement, or package dependency unless
  explicitly requested.
- Keep `fluid.js` independent of the browser so it stays testable in Node.
- Preserve the browser global (`FluidLib`) and Node export behaviour.
- **All randomness in the core goes through `makeRng(seed)`** — never
  `Math.random()` in `fluid.js`. (`app.js` may use `Math.random()` only for
  fresh seeds and ambient splats.)
- **Preserve the invariants the tests defend:** projection must not amplify the
  velocity field, advection must be stable, dye is conserved when
  `dissipation === 1`, and a run is reproducible for a given seed.
- **Keep the border ring.** Border cells are ghost cells; the interior is
  `1..w` × `1..h`. Never index the interior from `0`.

## Extending

### Change the physics or a parameter

1. Add or tune the constant in `DEFAULTS` (or the relevant method) in
   `fluid.js`.
2. If it is user-adjustable, expose it in `index.html` and wire it in `app.js`
   (`readControls` / `applyLive`) — live parameters are pushed onto
   `fluid.o`, so anything read each step updates without a rebuild.
3. Add a test in `test.js` that isolates the change, then run `node test.js`.

### Change rendering or controls

- Keep physics state and stepping in `fluid.js`; keep tone-mapping, drawing,
  and interaction in `app.js`.
- Keep `render()` allocation-light — it runs every frame. Reuse the ImageData
  buffer; only rebuild it when the grid size changes.
- Preserve device-pixel-ratio handling in `resize()`.
- Manually test the affected interaction in a browser; `test.js` does not
  exercise the DOM or canvas.

## Validation

From this directory, run:

```bash
node test.js
```

Run this after changes to `fluid.js` or simulation behaviour. For changes to
`app.js`, `index.html`, or `style.css`, also open `index.html` in a browser and
check the affected controls and display. Keep README claims aligned with what
the source and tests actually guarantee.
