/* app.js — DOM rendering and input for the logic puzzles.
 * Depends on sudoku.js and binairo.js (the cores) loading first.
 *
 * The board is a grid of real <button> cells, created once per size and then
 * only re-labelled, so keyboard access, focus rings and screen-reader labels
 * come for free instead of being re-invented over a canvas.
 *
 * Two things live here rather than in a core, because they are presentation:
 * which cells to tint (selection and its peers) and how to phrase a step.
 * Every rule and every deduction comes from the cores.
 */
(function () {
  'use strict';

  const S = window.SudokuLib;
  const B = window.BinairoLib;

  const board = document.getElementById('board');
  const el = {
    puzzle: document.getElementById('puzzle'),
    size: document.getElementById('size'),
    sizeField: document.getElementById('size-field'),
    difficulty: document.getElementById('difficulty'),
    newPuzzle: document.getElementById('new-puzzle'),
    step: document.getElementById('step'),
    solve: document.getElementById('solve'),
    clear: document.getElementById('clear'),
    mark: document.getElementById('mark'),
    peers: document.getElementById('peers'),
    candidates: document.getElementById('candidates'),
    rules: document.getElementById('rules'),
    statPuzzle: document.getElementById('stat-puzzle'),
    statSize: document.getElementById('stat-size'),
    statClues: document.getElementById('stat-clues'),
    statFilled: document.getElementById('stat-filled'),
    statTechnique: document.getElementById('stat-technique'),
    statSeed: document.getElementById('stat-seed'),
    statTime: document.getElementById('stat-time'),
    statStatus: document.getElementById('stat-status'),
  };

  const RULES = {
    sudoku: 'Each row, column and 3\u00d73 box holds 1\u20139 exactly once.',
    binary: 'Every row and column holds equally many 0s and 1s, no three equal ' +
      'symbols touch, and no two rows or columns repeat.',
  };

  const TECHNIQUE_LABELS = {
    naked: 'Naked single',
    hidden: 'Hidden single',
    line: 'Rule deduction',
    guess: 'Guess',
    solve: 'Solved outright',
  };

  const state = {
    puzzle: 'sudoku',
    difficulty: 'medium',
    size: 9,              // cells per side for the board on screen
    grid: [],
    given: [],
    seed: 20261007,       // start reproducible; "New puzzle" picks a fresh one
    genMs: 0,
    selected: -1,
    steps: 0,
    tally: {},
    lastTechnique: null,
    target: null,
    targetKey: '',
    done: false,
    unsolvable: false,
  };

  let cells = [];

  /* ------------------------------------------------------------------ */
  /* Puzzle definitions                                                 */
  /* ------------------------------------------------------------------ */

  function def() {
    return state.puzzle === 'sudoku'
      ? { empty: S.EMPTY, size: S.SIZE, difficulties: S.DIFFICULTIES, label: 'Sudoku' }
      : { empty: B.EMPTY, size: state.size, difficulties: B.DIFFICULTIES, label: 'Binary' };
  }

  function conflicts() {
    if (state.puzzle === 'sudoku') return S.conflicts(state.grid);
    return B.conflicts(state.grid, state.size);
  }

  function complete() {
    const empty = def().empty;
    for (let i = 0; i < state.grid.length; i++) if (state.grid[i] === empty) return false;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */

  function buildBoard() {
    board.textContent = '';
    cells = [];
    const n = def().size;
    board.style.setProperty('--n', String(n));
    board.setAttribute('aria-label', def().label + ' board, ' + n + ' by ' + n);

    for (let i = 0; i < n * n; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.addEventListener('click', function () { select(i); });
      board.appendChild(cell);
      cells.push(cell);
    }
  }

  /** Row, column and (for Sudoku) box neighbours of a cell. */
  function peerSet(index) {
    const n = def().size;
    const r = (index / n) | 0;
    const c = index % n;
    const out = new Set();
    for (let k = 0; k < n; k++) {
      out.add(r * n + k);
      out.add(k * n + c);
    }
    if (state.puzzle === 'sudoku') {
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) out.add((br + y) * n + bc + x);
      }
    }
    out.delete(index);
    return out;
  }

  function paint() {
    const n = def().size;
    const empty = def().empty;
    const bad = el.mark.checked ? new Set(conflicts()) : new Set();
    const peers = state.selected >= 0 && el.peers.checked ? peerSet(state.selected) : null;

    state.done = complete() && bad.size === 0;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const value = state.grid[i];
      const r = (i / n) | 0;
      const c = i % n;
      const classes = ['cell'];

      if (state.given[i]) classes.push('given');
      if (c === n - 1) classes.push('edge-right');
      else if (state.puzzle === 'sudoku' && c % 3 === 2) classes.push('box-right');
      if (r === n - 1) classes.push('edge-bottom');
      else if (state.puzzle === 'sudoku' && r % 3 === 2) classes.push('box-bottom');
      if (peers && peers.has(i)) classes.push('peer');
      if (i === state.selected) classes.push('selected');
      if (bad.has(i)) classes.push('bad');

      cell.className = classes.join(' ');
      cell.textContent = value === empty ? '' : String(value);
      cell.setAttribute('aria-label',
        'row ' + (r + 1) + ', column ' + (c + 1) + ', ' +
        (value === empty ? 'empty' : value) + (state.given[i] ? ', given' : ''));
    }

    board.classList.toggle('done', state.done);
    board.classList.toggle('nosolution', state.unsolvable);
    paintCandidates();
    paintStats();
  }

  /** What may legally go in the selected cell. */
  function candidatesFor(index) {
    if (index < 0) return null;
    const empty = def().empty;
    if (state.grid[index] !== empty) return [];

    if (state.puzzle === 'sudoku') return S.candidatesFor(state.grid, index);

    // For a binary puzzle, offer the values that do not break a rule at once.
    const out = [];
    for (let v = 0; v <= 1; v++) {
      const trial = Int8Array.from(state.grid);
      trial[index] = v;
      if (B.propagateGrid(trial, state.size)) out.push(v);
    }
    return out;
  }

  function paintCandidates() {
    const empty = def().empty;
    if (state.selected < 0 || state.selected >= state.grid.length) {
      el.candidates.innerHTML = 'Select a cell to see what it still allows.';
      return;
    }
    const r = ((state.selected / def().size) | 0) + 1;
    const c = (state.selected % def().size) + 1;
    const where = 'Row ' + r + ', column ' + c;
    const value = state.grid[state.selected];

    // A filled cell has no candidates to list, so report what is in it.
    if (value !== empty) {
      el.candidates.innerHTML = where + ' holds <b>' + value + '</b>' +
        (state.given[state.selected] ? ' (given)' : '');
      return;
    }

    const opts = candidatesFor(state.selected);
    if (!opts.length) {
      el.candidates.innerHTML = where + ': <b>nothing fits here</b>';
      return;
    }
    el.candidates.innerHTML = where + ' allows <b>' + opts.join(' ') + '</b>';
  }

  function paintStats() {
    const empty = def().empty;
    let filled = 0;
    let clues = 0;
    for (let i = 0; i < state.grid.length; i++) {
      if (state.grid[i] !== empty) filled++;
      if (state.given[i]) clues++;
    }
    const n = def().size;

    el.statPuzzle.textContent = def().label;
    el.statSize.textContent = n + '\u00d7' + n;
    el.statClues.textContent = String(clues);
    el.statFilled.textContent = filled + ' / ' + (n * n);
    el.statTechnique.textContent = state.lastTechnique
      ? TECHNIQUE_LABELS[state.lastTechnique]
      : '\u2014';
    el.statSeed.textContent = String(state.seed);
    el.statTime.textContent = state.genMs + 'ms';
  }

  function setStatus(text) {
    el.statStatus.textContent = text;
  }

  /* ------------------------------------------------------------------ */
  /* Generating                                                         */
  /* ------------------------------------------------------------------ */

  function newPuzzle(freshSeed) {
    if (freshSeed) state.seed = (Math.random() * 0xffffffff) >>> 0;
    const wasPuzzle = state.puzzle;
    state.puzzle = el.puzzle.value;
    state.size = state.puzzle === 'sudoku' ? 9 : (parseInt(el.size.value, 10) || 8);

    const t0 = performance.now();
    let out;
    if (state.puzzle === 'sudoku') {
      out = S.generate(state.seed, state.difficulty);
    } else {
      out = B.generate(state.seed, state.size, state.difficulty);
    }
    state.genMs = Math.max(1, Math.round(performance.now() - t0));

    if (!out) {
      state.grid = [];
      state.given = [];
      buildBoard();
      board.classList.add('nosolution');
      setStatus('No board for that seed — try another');
      return;
    }

    state.grid = out.puzzle.slice();
    state.given = out.puzzle.map(function (v) { return v !== def().empty; });
    state.steps = 0;
    state.tally = {};
    state.lastTechnique = null;
    state.unsolvable = false;
    state.target = null;
    state.targetKey = '';
    state.selected = state.puzzle === wasPuzzle && state.selected < state.grid.length
      ? state.selected
      : -1;

    buildBoard();
    paint();
    setStatus('Ready \u2014 ' + out.clues + ' clues, one solution');
  }

  /* ------------------------------------------------------------------ */
  /* Solving                                                           */
  /* ------------------------------------------------------------------ */

  function gridKey() {
    return state.grid.join(',');
  }

  /** A solution of the board as it stands, cached until the board changes. */
  function currentTarget() {
    const key = gridKey();
    if (key === state.targetKey) return state.target;
    state.targetKey = key;
    state.target = state.puzzle === 'sudoku'
      ? S.solve(state.grid)
      : B.solve(state.grid, state.size);
    return state.target;
  }

  function stepOnce() {
    if (state.done) return false;

    if (conflicts().length) {
      setStatus('A cell breaks a rule \u2014 fix the highlighted cells first');
      return false;
    }
    const target = currentTarget();
    if (!target) {
      state.unsolvable = true;
      setStatus('No solution continues from here');
      paint();
      return false;
    }

    const step = state.puzzle === 'sudoku'
      ? S.nextStep(state.grid, target)
      : B.nextStep(state.grid, target, state.size);
    if (!step) return false;

    state.grid[step.index] = step.value;
    state.steps++;
    state.tally[step.technique] = (state.tally[step.technique] || 0) + 1;
    state.lastTechnique = step.technique;
    state.selected = step.index;

    paint();
    if (state.done) setStatus('Solved \u2014 ' + describeWalk());
    return true;
  }

  function solveAll() {
    const limit = state.grid.length;
    for (let i = 0; i < limit; i++) {
      if (state.done) break;
      if (!stepOnce()) break;
    }
    if (state.done) {
      state.lastTechnique = 'solve';
      paint();
      setStatus('Solved \u2014 ' + describeWalk());
    }
  }

  /** "14 steps: 12 deductions, 2 guesses" — how the solve actually went. */
  function describeWalk() {
    const parts = [];
    const order = ['naked', 'hidden', 'line', 'guess'];
    for (let i = 0; i < order.length; i++) {
      const key = order[i];
      if (state.tally[key]) parts.push(state.tally[key] + ' ' + TECHNIQUE_LABELS[key].toLowerCase() + (state.tally[key] === 1 ? '' : 's'));
    }
    return state.steps + (state.steps === 1 ? ' step' : ' steps') +
      (parts.length ? ' (' + parts.join(', ') + ')' : '');
  }

  function clearMoves() {
    const empty = def().empty;
    for (let i = 0; i < state.grid.length; i++) {
      if (!state.given[i]) state.grid[i] = empty;
    }
    state.steps = 0;
    state.tally = {};
    state.lastTechnique = null;
    state.unsolvable = false;
    state.target = null;
    state.targetKey = '';
    paint();
    setStatus('Moves cleared');
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                             */
  /* ------------------------------------------------------------------ */

  function select(index) {
    state.selected = index;
    paint();
  }

  function move(dr, dc) {
    const n = def().size;
    let r = state.selected < 0 ? 0 : (state.selected / n) | 0;
    let c = state.selected < 0 ? 0 : state.selected % n;
    r = Math.min(n - 1, Math.max(0, r + dr));
    c = Math.min(n - 1, Math.max(0, c + dc));
    select(r * n + c);
  }

  function type(value) {
    if (state.selected < 0 || state.given[state.selected]) return;
    const empty = def().empty;
    const max = state.puzzle === 'sudoku' ? 9 : 1;
    if (value < 0 || value > max) return;
    if (state.grid[state.selected] === value) return;
    state.grid[state.selected] = value === empty ? empty : value;
    state.target = null;
    state.targetKey = '';
    state.unsolvable = false;
    paint();
    if (conflicts().length) setStatus('That entry breaks a rule');
    else if (state.done) setStatus('Solved \u2014 ' + describeWalk());
    else setStatus('Playing');
  }

  function erase() {
    if (state.selected < 0 || state.given[state.selected]) return;
    state.grid[state.selected] = def().empty;
    state.target = null;
    state.targetKey = '';
    state.unsolvable = false;
    paint();
    setStatus('Playing');
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.target.tagName === 'SELECT' || ev.target.tagName === 'INPUT') return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const key = ev.key;

    if (key === 'ArrowUp') { move(-1, 0); ev.preventDefault(); return; }
    if (key === 'ArrowDown') { move(1, 0); ev.preventDefault(); return; }
    if (key === 'ArrowLeft') { move(0, -1); ev.preventDefault(); return; }
    if (key === 'ArrowRight') { move(0, 1); ev.preventDefault(); return; }
    if (key === 'Backspace' || key === 'Delete') { erase(); ev.preventDefault(); return; }

    if (key >= '0' && key <= '9') {
      const value = parseInt(key, 10);
      // 0 is a real value in a binary puzzle; in Sudoku it means "erase".
      if (state.puzzle === 'binary') type(value);
      else if (value === 0) erase();
      else type(value);
      ev.preventDefault();
      return;
    }

    const lower = key.toLowerCase();
    if (lower === 'n') { newPuzzle(true); ev.preventDefault(); }
    else if (lower === 's') { stepOnce(); ev.preventDefault(); }
    else if (lower === 'f') { solveAll(); ev.preventDefault(); }
    else if (lower === 'c') { clearMoves(); ev.preventDefault(); }
  });

  /* ------------------------------------------------------------------ */
  /* Wiring                                                            */
  /* ------------------------------------------------------------------ */

  /** The difficulty list differs per puzzle, so rebuild it on a switch. */
  function fillDifficulties() {
    const list = state.puzzle === 'sudoku' ? S.DIFFICULTIES : B.DIFFICULTIES;
    el.difficulty.textContent = '';
    let found = false;
    for (let i = 0; i < list.length; i++) {
      const option = document.createElement('option');
      option.value = list[i].id;
      option.textContent = list[i].label;
      if (list[i].id === state.difficulty) found = true;
      el.difficulty.appendChild(option);
    }
    if (!found) state.difficulty = list[Math.min(1, list.length - 1)].id;
    el.difficulty.value = state.difficulty;
  }

  function onPuzzleChange() {
    state.puzzle = el.puzzle.value;
    state.size = state.puzzle === 'sudoku' ? 9 : (parseInt(el.size.value, 10) || 8);
    el.sizeField.hidden = state.puzzle !== 'binary';
    el.rules.textContent = RULES[state.puzzle];
    fillDifficulties();
    state.size = state.puzzle === 'sudoku' ? 9 : (parseInt(el.size.value, 10) || 8);
    newPuzzle(false);
  }

  el.newPuzzle.addEventListener('click', function () { newPuzzle(true); });
  el.step.addEventListener('click', function () { if (!stepOnce()) paint(); });
  el.solve.addEventListener('click', solveAll);
  el.clear.addEventListener('click', clearMoves);
  el.puzzle.addEventListener('change', onPuzzleChange);
  el.size.addEventListener('change', function () { newPuzzle(false); });
  el.difficulty.addEventListener('change', function () {
    state.difficulty = el.difficulty.value;
    newPuzzle(false);
  });
  el.mark.addEventListener('change', paint);
  el.peers.addEventListener('change', paint);

  /* ------------------------------------------------------------------ */
  /* Boot                                                              */
  /* ------------------------------------------------------------------ */

  state.puzzle = el.puzzle.value;
  state.size = state.puzzle === 'sudoku' ? 9 : (parseInt(el.size.value, 10) || 8);
  el.sizeField.hidden = state.puzzle !== 'binary';
  el.rules.textContent = RULES[state.puzzle];
  fillDifficulties();
  newPuzzle(false);
})();
