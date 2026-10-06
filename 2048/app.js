/* app.js — DOM rendering and input for the 2048 game.
 * Depends on game.js (the core) loading first.
 *
 * The board is a fixed 4x4 grid of tile elements created once; each move just
 * updates their text and value class, and flashes the merged / spawned tiles.
 *
 * Progression lives here rather than in the core, because it outlives a run:
 * the ladder, the best tile ever reached, and the number of runs are kept in
 * localStorage so the next session starts with something to beat.
 */
(function () {
  'use strict';

  const SIZE = 4;

  const board = document.getElementById('board');
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlay-text');
  const overlaySub = document.getElementById('overlay-sub');
  const el = {
    newGame: document.getElementById('new-game'),
    overlayButton: document.getElementById('overlay-button'),
    overlayContinue: document.getElementById('overlay-continue'),
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    bestTile: document.getElementById('best-tile'),
    runs: document.getElementById('runs'),
    status: document.getElementById('status'),
    milestones: document.getElementById('milestones'),
    ladderNext: document.getElementById('ladder-next'),
    ladderNote: document.getElementById('ladder-note'),
  };

  const tiles = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const d = document.createElement('div');
    d.className = 'tile';
    board.appendChild(d);
    tiles.push(d);
  }

  /* -------- persistence -------- */

  function load(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : fallback;
    } catch (err) {
      return fallback; // storage unavailable (e.g. privacy mode)
    }
  }

  function save(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (err) {
      /* best effort — the game is fully playable without persistence */
    }
  }

  let best = load('2048-best', 0);
  let bestTile = load('2048-best-tile', 0);
  let runs = load('2048-runs', 0);

  /* -------- ladder -------- */

  const ladder = [];
  GameLib.MILESTONES.forEach(function (rung) {
    const li = document.createElement('li');
    li.className = 'rung';
    const value = document.createElement('b');
    value.className = 'rung-value';
    value.textContent = rung.value;
    const label = document.createElement('span');
    label.className = 'rung-label';
    label.textContent = rung.label;
    li.appendChild(value);
    li.appendChild(label);
    el.milestones.appendChild(li);
    ladder.push(li);
  });

  /* Redraw the ladder against the current run and the best-ever tile. */
  function renderLadder() {
    const reached = game.bestMilestone();
    const next = game.nextGoal();
    for (let i = 0; i < ladder.length; i++) {
      const rung = ladder[i];
      const value = GameLib.MILESTONES[i].value;
      rung.classList.toggle('done', game.achievements.indexOf(value) !== -1);
      rung.classList.toggle('ever', value > reached && value <= bestTile);
      rung.classList.toggle('next', !!next && next.value === value);
    }
    if (next) {
      el.ladderNext.textContent = 'next ' + next.value;
      el.ladderNote.textContent = bestTile > 0 && next.value > bestTile
        ? 'A new personal best if you reach ' + next.value + '.'
        : 'Best tile so far: ' + bestTile + '.';
    } else {
      el.ladderNext.textContent = 'complete';
      el.ladderNote.textContent = 'Every rung reached. The board is yours to break.';
    }
  }

  /* Briefly pop the rung a move just crossed. */
  function flashRung(value) {
    const idx = GameLib.MILESTONES.findIndex(function (r) { return r.value === value; });
    if (idx === -1) return;
    const rung = ladder[idx];
    rung.classList.remove('pop');
    void rung.offsetWidth;
    rung.classList.add('pop');
  }

  /* -------- board -------- */

  function tileAt(coord) {
    return coord ? tiles[coord[1] * SIZE + coord[0]] : null;
  }

  /* Retrigger a one-shot CSS animation on a tile. */
  function flash(coord, cls) {
    const d = tileAt(coord);
    if (!d) return;
    d.classList.remove(cls);
    void d.offsetWidth;
    d.classList.add(cls);
  }

  function render() {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = game.grid[y][x];
        const d = tiles[y * SIZE + x];
        d.textContent = v ? String(v) : '';
        d.className = 'tile' + (v ? ' v' + Math.min(v, 8192) : '');
      }
    }
    flash(game.lastSpawned, 'spawn');
    for (let i = 0; i < game.lastMerged.length; i++) flash(game.lastMerged[i], 'merge');
    if (game.justAchieved) flashRung(game.justAchieved);

    // lifetime records
    if (game.score > best) {
      best = game.score;
      save('2048-best', best);
    }
    const top = game.maxTile();
    if (top > bestTile) {
      bestTile = top;
      save('2048-best-tile', bestTile);
    }

    el.score.textContent = game.score;
    el.best.textContent = best;
    el.bestTile.textContent = bestTile > 0 ? String(bestTile) : '\u2014';
    el.runs.textContent = runs;

    const over = game.isGameOver();
    const celebrating = game.won && !game.winSeen && !over;

    if (over) {
      overlay.hidden = false;
      overlayText.textContent = 'Game over \u2014 score ' + game.score;
      overlaySub.textContent = 'Best tile ' + game.maxTile() +
        (bestTile > game.maxTile() ? ' \u00b7 your record is ' + bestTile : ' \u00b7 a new record');
      el.overlayContinue.hidden = true;
      el.status.textContent = 'Game over';
    } else if (celebrating) {
      const next = game.nextGoal();
      overlay.hidden = false;
      overlayText.textContent = '2048!';
      overlaySub.textContent = next
        ? 'The board goes on \u2014 next rung is ' + next.value + '.'
        : 'Every rung reached.';
      el.overlayContinue.hidden = false;
      el.status.textContent = 'You reached 2048!';
    } else {
      overlay.hidden = true;
      const next = game.nextGoal();
      el.status.textContent = next ? 'Playing \u00b7 aim ' + next.value : 'Playing';
    }

    renderLadder();
  }

  /* -------- run control -------- */

  function newGame() {
    if (game && game.moveCount > 0) {
      runs++;
      save('2048-runs', runs);
    }
    game = new GameLib.Game({ size: SIZE, seed: (Math.random() * 0xffffffff) >>> 0 });
    render();
  }

  function keepGoing() {
    game.acknowledgeWin();
    render();
  }

  const KEY_DIRS = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    a: 'left',
    d: 'right',
    w: 'up',
    s: 'down',
  };

  function move(dir) {
    game.move(dir);
    render();
  }

  window.addEventListener('keydown', function (e) {
    if (!overlay.hidden && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (!el.overlayContinue.hidden) keepGoing();
      else newGame();
      return;
    }
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  });

  el.newGame.addEventListener('click', newGame);
  el.overlayButton.addEventListener('click', newGame);
  el.overlayContinue.addEventListener('click', keepGoing);

  let game = new GameLib.Game({ size: SIZE, seed: (Math.random() * 0xffffffff) >>> 0 });
  render();

  /* A small handle so the browser tests can drive the game without playing a
   * thousand moves to reach a win. `load` is a test seam only — the app itself
   * never calls it. */
  window.GameApp = {
    game: function () { return game; },
    move: move,
    newGame: newGame,
    keepGoing: keepGoing,
    load: function (rows) {
      game.load(rows);
      render();
      return game.maxTile();
    },
    records: function () {
      return { best: best, bestTile: bestTile, runs: runs };
    },
  };
})();
