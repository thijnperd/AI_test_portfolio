# Game of Life

A zero-dependency, browser-based Conway's Game of Life. Open `index.html`
directly in a browser; there is no build step or server requirement. The
simulation core also runs in Node.js so its behavior can be tested separately
from the interface.

## Features

- Play, pause, and advance one generation at a time
- Paint cells or erase them by dragging on the canvas
- Stamp built-in spaceships, oscillators, a glider gun, and methuselah patterns
- Fill the grid randomly with adjustable density
- Choose toroidal edge wrapping or permanently dead edges
- Adjust simulation speed and cell size
- Toggle grid lines and view generation and population counters
- Resize the grid to fit the available canvas area while keeping its
  overlapping top-left cells

## Run the app

Open `index.html` in a modern browser. The app fills the grid randomly and
starts running automatically. Use the controls or keyboard shortcuts below to
pause, clear, or change the initial state.

### Controls

| Action | UI | Key |
|---|---|---|
| Play / pause | Play or Pause button | `Space` |
| Advance one generation | Step button | `S` |
| Randomize the grid | Random button | `R` |
| Clear the grid | Clear button | `C` |
| Toggle grid lines | Show grid checkbox | `G` |
| Paint cells | Left-drag on canvas | |
| Erase cells | Right-drag or Shift-drag | |
| Stamp a pattern | Select a pattern under Tool, then click or drag | |

Keyboard shortcuts are ignored while an input, select, or text area has focus.
The speed slider ranges from 1 to 60 generations per second, cell size from 4
to 32 pixels, and random density from 5% to 60%.

## Simulation rules

The core implements Conway's B3/S23 rules:

- A dead cell with exactly three live neighbors becomes alive.
- A live cell survives with two or three live neighbors.
- All other live cells die; all other dead cells stay dead.

With **Wrap edges** enabled, the grid behaves like a torus: neighbors beyond
one edge are counted from the opposite edge. With wrapping disabled, cells
outside the grid are treated as dead.

Random fills use `Math.random()` and are not seeded. Given an identical grid
state, stepping the simulation follows the same rules, but the app does not
provide seeded or replayable randomization.

## Built-in patterns

Patterns are defined as ASCII art in `life.js` (`O` marks a live cell) and
are listed in the Tool selector. Select **Draw cells** to paint individual
cells; select a pattern to stamp it centered on the clicked cell.

| Pattern | Type | Behavior |
|---|---|---|
| Glider | Spaceship | Moves diagonally by one cell every four generations |
| Lightweight spaceship | Spaceship | Moves horizontally by two cells every four generations |
| Blinker | Oscillator | Period 2 |
| Toad | Oscillator | Period 2 |
| Beacon | Oscillator | Period 2 |
| Pulsar | Oscillator | Period 3 |
| Pentadecathlon | Oscillator | Period 15 |
| Gosper glider gun | Gun | Emits gliders |
| R-pentomino | Methuselah | Grows from a five-cell seed |
| Acorn | Methuselah | Grows from a seven-cell seed |
| Diehard | Methuselah | A known methuselah pattern |

Pattern behavior can vary at grid edges, especially when wrapping is enabled.
The tests verify selected pattern properties on appropriately sized grids.

## Project files

| File | Purpose |
|---|---|
| `index.html` | Page structure, controls, and script loading order |
| `style.css` | Layout and visual theme |
| `life.js` | DOM-free simulation core and pattern definitions; works in browser and Node |
| `app.js` | Canvas rendering, animation, controls, and pointer/keyboard interaction |
| `test.js` | Node.js tests for the simulation core |
| `(ai instructions).md` | Project-specific guidance for AI assistants and contributors |

## Tests

From this folder, run:

```bash
node test.js
```

Tests use Node's built-in `assert` module; no packages need to be installed.
They cover pattern parsing and cell counts, B3/S23 behavior, oscillator
periods, spaceship movement, glider-gun growth, wrapping, resizing, clearing,
random density, and centered pattern placement. Run them after changes to
`life.js` or its public behavior. The browser interface in `app.js` is not
covered by this test file.
