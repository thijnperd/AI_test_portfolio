# Fluid Dynamics — Navier–Stokes Sandbox

A zero-dependency, browser-based incompressible fluid simulation. Open
`index.html` directly in a browser — no build step, no server. The solver core
also runs in Node.js, so the physics is covered by unit tests.

The fluid is solved on an Eulerian grid with **Jos Stam's "Stable Fluids"**
method (SIGGRAPH 1999): add forces, diffuse, project to a divergence-free field,
advect, project again. Advection is semi-Lagrangian, so the simulation is
unconditionally stable — big timesteps blur, they never explode.

## Features

- **Incompressible Navier–Stokes** on the CPU, in plain JavaScript with typed
  arrays — no WebGL, no shaders, no libraries
- **Coloured smoke**: dye is carried as three colour channels, so pointer
  splats paint and blend like ink in water
- **Vorticity confinement** to restore the swirl that the projection damps
- **Buoyancy** so dye rises, and adjustable viscosity, dye fade and splat radius
- Drag on the stage to push the fluid; ambient splats keep it alive on its own
- Deterministic: a seed reproduces the same run
- Live status bar: grid size, mean speed, total dye, FPS

## Run the app

Open `index.html` in a modern browser. The field starts with a few seeded
splats and settles immediately.

### Controls

| Action | UI | Key |
|---|---|---|
| Play / pause | Pause button | `Space` |
| Advance one step | Step button | `S` |
| Add a random splat | Splat button | |
| New random seed | New seed button | `N` |
| Clear the field | Clear button | `C` |
| Push the fluid | drag on the canvas | |
| Grid resolution, steps/frame | Resolution select, Speed slider | |
| Pointer force, vorticity, buoyancy | sliders | |
| Viscosity, dye fade, splat radius | sliders | |
| Ambient splats | checkbox | |

## The algorithm

Each step, in order:

1. **Forces.** Pointer drags (and ambient splats) add velocity and dye over a
   soft disc.
2. **Diffuse (optional).** Viscosity is applied with an implicit Gauss-Seidel
   solve, which stays stable at any timestep.
3. **Project.** A Poisson equation for pressure is relaxed with Gauss-Seidel
   sweeps, and its gradient is subtracted from the velocity — this is what makes
   the field **divergence free** (incompressible).
4. **Advect.** Velocity and dye are moved by sampling backwards along the flow
   (semi-Lagrangian bilinear interpolation).
5. **Project again**, then apply **vorticity confinement** and **buoyancy**.
6. **Fade** the dye by the dissipation factor.

The grid carries a one-cell boundary ring with the standard no-slip reflection,
so nothing leaks out of the box. All state lives in `Float32Array`s and there is
no randomness in the solver itself; `randomSplats()` is the only seeded entry
point, and the app only uses `Math.random()` for fresh seeds and ambient noise.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure, controls, and script loading order |
| `style.css` | Layout and the shared dark "instrument panel" theme |
| `fluid.js` | DOM-free core (`FluidLib`): the grid, projection, advection, vorticity, buoyancy, splats; works in browser and Node |
| `app.js` | Dye rendering, the animation loop, pointer interaction, and controls |
| `test.js` | Node.js tests for the core |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## Tests

From this folder, run:

```bash
node test.js
```

Tests use Node's built-in `assert` module; no packages need to be installed.
They cover indexing, splats, seeded determinism, projection (divergence removal
and no energy gain), advection along a uniform flow, stability under long runs
with forcing, dye dissipation and conservation, buoyancy, and the measurement
helpers. The browser interface in `app.js` is not covered by this test file.

## Credit

The solver follows Jos Stam's
[*Stable Fluids*](https://graphics.stanford.edu/papers/stam66/) (1999) and the
GPU version by Pavel Dobryakov
([WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation))
is the visual reference for the coloured-dye splatting model. This is an
original, dependency-free CPU implementation with its own renderer and controls.
