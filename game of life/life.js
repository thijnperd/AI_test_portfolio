/* life.js — Conway's Game of Life simulation core.
 *
 * Pure logic, no DOM: runs in the browser (as `Life`) and in Node
 * (`module.exports`) so the rules can be tested with `node test.js`.
 *
 * Rules: B3/S23 — a dead cell is born with exactly 3 neighbours,
 * a live cell survives with 2 or 3 neighbours.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Patterns                                                           */
  /* ------------------------------------------------------------------ */
  /* Patterns are ASCII art for readability: 'O' is a live cell,
   * anything else is empty. Rows may be shorter than the widest row. */

  const PATTERN_ART = {
    glider: {
      name: 'Glider',
      art: ['.O.', '..O', 'OOO'],
    },
    'lightweight-spaceship': {
      name: 'Lightweight spaceship',
      art: ['O..O.', '....O', 'O...O', '.OOOO'],
    },
    blinker: {
      name: 'Blinker',
      art: ['OOO'],
    },
    toad: {
      name: 'Toad',
      art: ['.OOO', 'OOO.'],
    },
    beacon: {
      name: 'Beacon',
      art: ['OO..', 'OO..', '..OO', '..OO'],
    },
    pulsar: {
      name: 'Pulsar',
      art: [
        '..OOO...OOO..',
        '.............',
        'O....O.O....O',
        'O....O.O....O',
        'O....O.O....O',
        '..OOO...OOO..',
        '.............',
        '..OOO...OOO..',
        'O....O.O....O',
        'O....O.O....O',
        'O....O.O....O',
        '.............',
        '..OOO...OOO..',
      ],
    },
    pentadecathlon: {
      name: 'Pentadecathlon',
      art: ['..O....O..', 'OO.OOOO.OO', '..O....O..'],
    },
    'gosper-glider-gun': {
      name: 'Gosper glider gun',
      art: [
        '........................O...........',
        '......................O.O...........',
        '............OO......OO............OO',
        '...........O...O....OO............OO',
        'OO........O.....O...OO..............',
        'OO........O...O.OO....O.O...........',
        '..........O.....O.......O...........',
        '...........O...O....................',
        '............OO......................',
      ],
    },
    'r-pentomino': {
      name: 'R-pentomino',
      art: ['.OO', 'OO.', '.O.'],
    },
    acorn: {
      name: 'Acorn',
      art: ['.O.....', '...O...', 'OO..OOO'],
    },
    diehard: {
      name: 'Diehard',
      art: ['......O.', 'OO......', '.O...OOO'],
    },
  };

  function parseArt(art) {
    const cells = [];
    const h = art.length;
    let w = 0;
    for (let y = 0; y < art.length; y++) {
      const row = art[y];
      w = Math.max(w, row.length);
      for (let x = 0; x < row.length; x++) {
        if (row[x] === 'O') cells.push([x, y]);
      }
    }
    return { cells: cells, w: w, h: h };
  }

  const PATTERNS = {};
  for (const id of Object.keys(PATTERN_ART)) {
    const parsed = parseArt(PATTERN_ART[id].art);
    PATTERNS[id] = {
      id: id,
      name: PATTERN_ART[id].name,
      cells: parsed.cells,
      w: parsed.w,
      h: parsed.h,
    };
  }

  function resolvePattern(pattern) {
    if (typeof pattern === 'string') {
      const found = PATTERNS[pattern];
      if (!found) throw new Error('Unknown pattern: ' + pattern);
      return found;
    }
    if (Array.isArray(pattern)) {
      // raw [x, y] coordinate list
      let w = 0;
      let h = 0;
      for (let i = 0; i < pattern.length; i++) {
        w = Math.max(w, pattern[i][0] + 1);
        h = Math.max(h, pattern[i][1] + 1);
      }
      return { cells: pattern, w: w, h: h };
    }
    return pattern;
  }

  /* ------------------------------------------------------------------ */
  /* Simulation                                                         */
  /* ------------------------------------------------------------------ */

  class Life {
    constructor(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      this.cells = new Uint8Array(cols * rows);
      this.buffer = new Uint8Array(cols * rows);
      this.generation = 0;
      this.population = 0;
    }

    /** Resize the grid, keeping the overlapping top-left region. */
    resize(cols, rows) {
      if (cols === this.cols && rows === this.rows) return this;
      const cells = new Uint8Array(cols * rows);
      const w = Math.min(cols, this.cols);
      const h = Math.min(rows, this.rows);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          cells[y * cols + x] = this.cells[y * this.cols + x];
        }
      }
      this.cols = cols;
      this.rows = rows;
      this.cells = cells;
      this.buffer = new Uint8Array(cols * rows);
      this.population = this.count();
      return this;
    }

    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
    }

    get(x, y) {
      return this.inBounds(x, y) ? this.cells[y * this.cols + x] : 0;
    }

    /** Set a cell to 1 (alive) or 0 (dead). Keeps the population count. */
    set(x, y, value) {
      if (!this.inBounds(x, y)) return this;
      const i = y * this.cols + x;
      const v = value ? 1 : 0;
      if (this.cells[i] !== v) {
        this.cells[i] = v;
        this.population += v ? 1 : -1;
      }
      return this;
    }

    toggle(x, y) {
      return this.set(x, y, !this.get(x, y));
    }

    clear() {
      this.cells.fill(0);
      this.generation = 0;
      this.population = 0;
      return this;
    }

    /** Fill the grid with random cells (resets the generation counter). */
    randomize(density) {
      const d = density === undefined ? 0.25 : density;
      let population = 0;
      for (let i = 0; i < this.cells.length; i++) {
        const v = Math.random() < d ? 1 : 0;
        this.cells[i] = v;
        population += v;
      }
      this.generation = 0;
      this.population = population;
      return this;
    }

    count() {
      let n = 0;
      for (let i = 0; i < this.cells.length; i++) n += this.cells[i];
      return n;
    }

    /**
     * Advance one generation.
     * `wrap` (default true) makes the grid a torus; otherwise the edges
     * act as permanently dead cells.
     */
    step(wrap) {
      const torus = wrap === undefined ? true : wrap;
      const cols = this.cols;
      const rows = this.rows;
      const cells = this.cells;
      const buffer = this.buffer;
      let population = 0;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let neighbours = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              let nx = x + dx;
              let ny = y + dy;
              if (torus) {
                nx = (nx + cols) % cols;
                ny = (ny + rows) % rows;
              } else if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
                continue;
              }
              neighbours += cells[ny * cols + nx];
            }
          }
          const i = y * cols + x;
          const alive = cells[i] === 1;
          const next = alive ? (neighbours === 2 || neighbours === 3) : neighbours === 3;
          buffer[i] = next ? 1 : 0;
          population += buffer[i];
        }
      }

      // swap the buffers: `buffer` becomes the new state
      this.cells = buffer;
      this.buffer = cells;
      this.generation++;
      this.population = population;
      return population;
    }

    /**
     * Stamp a pattern with its top-left corner at (x, y).
     * `pattern` is a pattern id or an object/array of cell coordinates.
     */
    place(pattern, x, y) {
      const p = resolvePattern(pattern);
      for (let i = 0; i < p.cells.length; i++) {
        this.set(x + p.cells[i][0], y + p.cells[i][1], 1);
      }
      return this;
    }

    /** Stamp a pattern centred on (x, y). */
    placeCentered(pattern, x, y) {
      const p = resolvePattern(pattern);
      return this.place(p, Math.round(x - p.w / 2), Math.round(y - p.h / 2));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Exports                                                            */
  /* ------------------------------------------------------------------ */

  Life.PATTERNS = PATTERNS;
  Life.parseArt = parseArt;

  global.Life = Life;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Life;
  }
})(typeof window !== 'undefined' ? window : globalThis);
