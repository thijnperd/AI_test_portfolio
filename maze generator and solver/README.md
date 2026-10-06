# Maze Generator & Solver

An animated maze construction and pathfinding visualizer. Zero-dependency,
browser-based, no build step: **double-click `index.html`** and it runs. The
algorithms live in a plain-JavaScript core that also runs in Node, so they are
covered by unit tests.

## Features

- Three generators, each producing **perfect mazes** (spanning trees):
  recursive backtracker, randomized Prim's, Kruskal's
- Three solvers: breadth-first search, depth-first search, A* (Manhattan)
- Live animation of both phases: the maze is carved cell by cell, then the
  solver's exploration is revealed before the final path is drawn
- Seeded generation — the same seed and settings always give the same maze
- Adjustable cell size and animation speed
- Status bar: grid size, seed, passage count, path length, visited cells

## Usage

Double-click `index.html`. A maze is carved and solved immediately on load.

### Controls

| Action | UI | Key |
|---|---|---|
| New maze (random seed) | New maze button | `N` |
| Rebuild with the shown seed | Build button | |
| Pause / resume animation | Pause button | `Space` |
| Jump to the finished result | Skip button | `S` |
| Change generator / solver | dropdowns | |
| Cell size, speed | sliders | |
| Hide / show the drawn path | Show solution checkbox | |

Green marks the start (top-left), red the goal (bottom-right). Blue shading is
the solver's exploration; the bright line is the path it found.

## The algorithms

A **perfect maze** is a spanning tree of the cell grid: every cell is
reachable and there is exactly one path between any two cells — no loops, no
walled-off rooms.

### Generators

| Generator | Idea | Characteristic |
|---|---|---|
| Recursive backtracker | DFS with backtracking: carve to a random unvisited neighbour, retreat when stuck | long corridors, few dead ends |
| Randomized Prim's | grow a tree by carving through a random wall on the frontier | short, branchy passages |
| Kruskal's | consider all walls in random order, carve each one that joins two different components (union-find) | very braided look |

### Solvers

| Solver | Guarantees | Notes |
|---|---|---|
| Breadth-first search | shortest path | explores level by level |
| Depth-first search | any path | may wander; path can be much longer |
| A* (Manhattan) | shortest path | like BFS but steered toward the goal, explores less |

BFS and A* always return a shortest path; the tests assert this against an
independent distance calculation.

## Project layout

```
maze generator and solver/
├── index.html   # app shell — control panel, status bar, canvas
├── style.css    # dark UI theme
├── maze.js      # core: maze model, seeded RNG, generators, solvers (no DOM)
├── app.js       # rendering, animation loop, UI wiring
├── test.js      # Node tests for the core
├── README.md
└── (ai instructions).md   # how to use and expand this project
```

## Tests

```
node test.js
```

No dependencies — Node's built-in `assert` only. The tests are the executable
specification of the project: they prove each generator produces a perfect
maze (connected, exactly `cols × rows − 1` passages, intact borders), that
generation is deterministic per seed, that the animation event list replays
to the same maze, and that every solver returns a valid path through open
passages with BFS / A* finding shortest ones. Run them after any change to
`maze.js`.
