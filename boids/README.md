# Boids — Flocking Simulation

A zero-dependency, browser-based flocking simulation. Open `index.html`
directly in a browser — no build step, no server. The simulation core also runs
in Node.js, so the steering rules are covered by unit tests.

Boids (Craig Reynolds, 1986) show how complex flocking behaviour emerges from
three local rules that each boid applies to the neighbours it can see.

## Features

- Live flocking from three weighted steering rules: **separation**,
  **alignment**, and **cohesion**
- Adjustable flock size, perception radius, max speed, and per-rule weights
- **Wrap-around** (torus) or **bounce** world edges
- Motion trails for a sense of flow
- Seeded — the same seed and settings always produce the same flock
- Boids drawn as triangles oriented along their heading, coloured by speed
- Live status bar: boid count and flock alignment

## Run the app

Open `index.html` in a modern browser. The flock starts moving immediately.

### Controls

| Action | UI | Key |
|---|---|---|
| Play / pause | Pause button | `Space` |
| New random seed | New seed button | `N` |
| Rescatter the flock (same seed) | Scatter button | |
| Flock size, perception, speed | sliders | |
| Rule weights | Separation / Alignment / Cohesion sliders | |
| Edge behaviour | Edges dropdown | |
| Motion trails | Motion trails checkbox | |

Sliders apply live: changing the rule weights reshapes the flock without
reseeding it, while changing the flock size rebuilds it from the current seed.

## The rules

Each boid steers by blending three forces computed over neighbours inside its
perception radius:

| Rule | Steers toward | Effect |
|---|---|---|
| Separation | away from boids closer than the separation radius | stops crowding and collisions |
| Alignment | the average heading of neighbours | makes the flock move as one |
| Cohesion | the average position of neighbours | keeps the flock together |

The weights decide the character of the flock: strong cohesion and weak
separation clump into a tight ball; strong alignment gives long flowing
ribbons. With `wrap` edges the world is a torus, so boids that leave one side
reappear on the other; with `bounce` they rebound off the walls.

`boids.js` uses a seeded RNG, so a given seed always builds the same flock and
steps the same way. The app only uses `Math.random()` to choose a fresh seed.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure, controls, and script loading order |
| `style.css` | Layout and dark visual theme |
| `boids.js` | DOM-free flocking core (`Flock`, seeded RNG, steering); works in browser and Node |
| `app.js` | Canvas rendering, animation loop, controls, and keyboard shortcuts |
| `test.js` | Node.js tests for the core |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## Tests

From this folder, run:

```bash
node test.js
```

Tests use Node's built-in `assert` module; no packages need to be installed.
They cover the seeded RNG, torus math, seeded determinism, bounded speed,
wrap/bounce containment, and the three steering rules (separation pushes
apart, alignment converges headings, cohesion gathers). The browser interface
in `app.js` is not covered by this test file.
