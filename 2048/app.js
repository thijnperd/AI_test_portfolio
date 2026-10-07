/* app.js — DOM rendering, input, and the AI player for the 2048 game.
 * Depends on game.js and ai.js (the cores) loading first.
 *
 * The board is a fixed 4x4 grid of tile elements created once; each move just
 * updates their text and value class, and flashes the merged / spawned tiles.
 *
 * Progression lives here rather than in the core, because it outlives a run:
 * the ladder, the best tile ever reached, and the number of runs are kept in
 * localStorage so the next session starts with something to beat.
 *
 * AI mode drives the same `move()` path a key press does — it only chooses the
 * direction. Everything it weighed up is rendered back into the panel, so the
 * search is visible rather than a black box: the four candidate directions with
 * their expectimax values, the direction it chose, and the heuristic terms
 * behind that choice.
 *
 * Records stay the human's: an AI move never rewrites "best tile", or the
 * record would just describe the AI. The AI keeps its own tally in its panel.
 *
 * The Blocks section owns the one thing that is neither a rule nor a record: the
 * block config the player has built. It is kept in localStorage like the other
 * records, and every edit rebuilds the ruleset (`blocks.js`) that the game and
 * the AI then play by. Which merges are legal, what can spawn, and where the
 * ladder's rungs sit all move together, so the ladder is rebuilt from the
 * ruleset rather than from a constant.
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
    aiMode: document.getElementById('ai-mode'),
    aiStep: document.getElementById('ai-step'),
    aiPlay: document.getElementById('ai-play'),
    aiDepth: document.getElementById('ai-depth'),
    aiDepthValue: document.getElementById('ai-depth-value'),
    aiSpeed: document.getElementById('ai-speed'),
    aiSpeedValue: document.getElementById('ai-speed-value'),
    aiCandidates: document.getElementById('ai-candidates'),
    aiWhy: document.getElementById('ai-why'),
    aiStats: document.getElementById('ai-stats'),
    aiBadge: document.getElementById('ai-badge'),
    aiBadgeDir: document.getElementById('ai-badge-dir'),
    aiBadgeText: document.getElementById('ai-badge-text'),
    blocks: document.getElementById('blocks'),
    blockAdd: document.getElementById('block-add'),
    blockReset: document.getElementById('block-reset'),
    blocksNote: document.getElementById('blocks-note'),
    blocksNoteInline: document.getElementById('blocks-note-inline'),
  };

  const DIRS = ['left', 'right', 'up', 'down'];
  const ARROWS = { left: '\u2190', right: '\u2192', up: '\u2191', down: '\u2193' };

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

  /* The block config is structured, so it goes through JSON — with the same
   * promise that a broken or unavailable store cannot stop the game. */
  function loadConfig() {
    try {
      const raw = window.localStorage.getItem('2048-blocks');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function saveConfig(config) {
    try {
      window.localStorage.setItem('2048-blocks', JSON.stringify(config));
    } catch (err) {
      /* best effort */
    }
  }

  let best = load('2048-best', 0);
  let bestTile = load('2048-best-tile', 0);
  let runs = load('2048-runs', 0);

  /* -------- blocks -------- */

  const KINDS = BlocksLib.KINDS;

  /* A working copy, never the module's own constant. The editor writes back into
   * `config.blocks`, and an aliased default would be edited in place — which is
   * how "Reset" ends up resetting to whatever the last edit left behind. */
  function copyConfig(source) {
    let copy = null;
    try {
      copy = JSON.parse(JSON.stringify(source || BlocksLib.DEFAULT_CONFIG));
    } catch (err) {
      copy = null;   // a stored value that is not JSON at all
    }
    if (!copy || !Array.isArray(copy.blocks)) {
      copy = JSON.parse(JSON.stringify(BlocksLib.DEFAULT_CONFIG));
    }
    return copy;
  }

  let config = copyConfig(loadConfig());
  let rules = BlocksLib.makeRules(config);

  /* A block's identity across the working config, the normalised ruleset, and
   * the spawn table — the three can disagree, because a config the player is
   * mid-edit is not necessarily one the rules can honour. */
  function keyOf(block) {
    return block.kind === 'number' ? 'n' + block.value : block.kind + ':' + block.amount;
  }

  /* -------- the ladder -------- */

  /* The rungs come from the active ruleset, not from a constant, because the
   * blocks decide which values are reachable. Rebuilt whenever the blocks are,
   * so a rescaled ladder lands on real values. */
  let rungs = [];
  const ladder = [];

  function buildLadder(list) {
    el.milestones.textContent = '';
    rungs = list;
    ladder.length = 0;
    for (let i = 0; i < list.length; i++) {
      const li = document.createElement('li');
      li.className = 'rung';
      const value = document.createElement('b');
      value.className = 'rung-value';
      value.textContent = list[i].value;
      const label = document.createElement('span');
      label.className = 'rung-label';
      label.textContent = list[i].label;
      li.appendChild(value);
      li.appendChild(label);
      el.milestones.appendChild(li);
      ladder.push(li);
    }
  }

  /* Redraw the ladder against the current run and the best-ever tile. */
  function renderLadder() {
    const reached = game.bestMilestone();
    const next = game.nextGoal();
    for (let i = 0; i < ladder.length; i++) {
      const rung = ladder[i];
      const value = rungs[i].value;
      rung.classList.toggle('done', game.achievements.indexOf(value) !== -1);
      rung.classList.toggle('ever', value > reached && value <= bestTile);
      rung.classList.toggle('next', !!next && next.value === value);
    }
    if (!rungs.length) {
      el.ladderNext.textContent = 'none';
      el.ladderNote.textContent = 'Nothing on this board can be reached twice over \u2014 there is no ladder to climb.';
    } else if (next) {
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
    for (let i = 0; i < rungs.length; i++) {
      if (rungs[i].value !== value) continue;
      const rung = ladder[i];
      rung.classList.remove('pop');
      void rung.offsetWidth;
      rung.classList.add('pop');
      return;
    }
  }

  /* -------- the block editor -------- */

  const blockRows = [];

  /* One entry per row of the working config: what share of the spawns that block
   * takes, and whether the rules kept it at all.
   *
   * It cannot be keyed by the block itself, because two rows are allowed to be
   * the same block — the normaliser keeps the first of each and drops the rest,
   * and a duplicate shares every property with the one that beat it. So the keys
   * are walked in order, exactly as `normalize` walks them. */
  function spawnShares() {
    const shares = {};
    for (let i = 0; i < rules.spawns.length; i++) {
      shares[keyOf(rules.spawns[i].block)] = rules.spawns[i].share;
    }
    const out = [];
    const seen = {};
    for (let i = 0; i < config.blocks.length; i++) {
      const key = keyOf(config.blocks[i]);
      const first = !seen[key];
      seen[key] = true;
      out.push({ share: first ? shares[key] : undefined, duplicate: !first });
    }
    return out;
  }

  /* Two different kinds of "not spawning": a weight of 0 is a choice, a dropped
   * duplicate is the rules telling you so, and they should not read alike. */
  function formatShare(info) {
    if (info.duplicate) return 'out of play';
    if (info.share === undefined) return 'never';
    if (info.share >= 0.999) return 'always';
    const pct = info.share * 100;
    return (pct < 1 ? '<1' : String(Math.round(pct))) + '%';
  }

  /* The value field is a number for a plain block and an operand for an
   * operator, so its label, range and meaning all follow the kind. */
  function buildBlockRow(block, index, shares) {
    const li = document.createElement('li');
    li.className = 'block';
    li.dataset.index = String(index);

    const kind = document.createElement('select');
    kind.className = 'block-kind';
    kind.setAttribute('aria-label', 'Block ' + (index + 1) + ' kind');
    for (let i = 0; i < KINDS.length; i++) {
      const option = document.createElement('option');
      option.value = KINDS[i].id;
      option.textContent = KINDS[i].symbol ? KINDS[i].symbol + ' ' + KINDS[i].id : 'number';
      kind.appendChild(option);
    }
    kind.value = block.kind;

    const amount = document.createElement('input');
    amount.className = 'block-amount';
    amount.type = 'number';
    amount.min = '1';
    amount.max = String(BlocksLib.MAX_VALUE);
    amount.value = String(block.kind === 'number' ? block.value : block.amount);
    amount.title = block.kind === 'number'
      ? 'The number on this tile'
      : KINDS.filter(function (k) { return k.id === block.kind; })[0].hint;

    const remove = document.createElement('button');
    remove.className = 'btn btn-icon block-remove';
    remove.type = 'button';
    remove.textContent = '\u00d7';
    remove.title = 'Remove this block';

    const rarity = document.createElement('label');
    rarity.className = 'block-rarity';
    const caption = document.createElement('span');
    caption.textContent = 'rarity';
    const range = document.createElement('input');
    range.className = 'block-weight';
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.step = '1';
    range.value = String(block.weight);
    range.setAttribute('aria-label', 'How often this block spawns');
    const shareLabel = document.createElement('b');
    shareLabel.className = 'block-share';
    shareLabel.textContent = formatShare(shares[index]);
    rarity.appendChild(caption);
    rarity.appendChild(range);
    rarity.appendChild(shareLabel);

    if (shares[index].duplicate) li.classList.add('inactive');

    const top = document.createElement('div');
    top.className = 'block-top';
    top.appendChild(kind);
    top.appendChild(amount);
    top.appendChild(remove);
    li.appendChild(top);
    li.appendChild(rarity);

    // A kind change is structural — it changes what the number field means and
    // what the tile will look like — so that one rebuilds the list.
    kind.addEventListener('change', function () {
      editBlock(index, function (b) {
        const next = KINDS.filter(function (k) { return k.id === kind.value; })[0];
        const previous = b.kind === 'number' ? b.value : b.amount;
        if (next.id === 'number') {
          return { kind: 'number', value: previous, weight: b.weight };
        }
        return { kind: next.id, amount: previous, weight: b.weight };
      }, true);
    });

    amount.addEventListener('input', function () {
      const value = parseInt(amount.value, 10);
      if (!Number.isFinite(value)) return;   // mid-typing: keep what we had
      editBlock(index, function (b) {
        if (b.kind === 'number') { b.value = value; return b; }
        b.amount = value;
        return b;
      }, false);
    });

    range.addEventListener('input', function () {
      editBlock(index, function (b) {
        b.weight = parseInt(range.value, 10) || 0;
        return b;
      }, false);
    });

    remove.addEventListener('click', function () {
      config.blocks.splice(index, 1);
      applyBlocks(true);
    });

    return li;
  }

  /* Everything that can change without the list itself changing: each row's
   * share, the note, and the two buttons. Separate from `renderBlocks` because
   * a weight nudge must not rebuild the row it was typed into — the focus, and
   * with it a slider drag, would go with the old element. */
  function refreshBlocks() {
    const shares = spawnShares();

    // The last number block cannot be removed: a board that can never spawn a
    // value can never make a move.
    const numbers = [];
    for (let i = 0; i < config.blocks.length; i++) {
      if (config.blocks[i].kind === 'number') numbers.push(i);
    }
    const onlyNumber = numbers.length === 1 ? numbers[0] : -1;

    for (let i = 0; i < blockRows.length && i < config.blocks.length; i++) {
      const row = blockRows[i];
      row.querySelector('.block-share').textContent = formatShare(shares[i]);
      row.classList.toggle('inactive', shares[i].duplicate);
      const btn = row.querySelector('.block-remove');
      btn.disabled = i === onlyNumber;
      btn.title = i === onlyNumber
        ? 'A board needs at least one number to spawn'
        : 'Remove this block';
    }

    el.blocksNoteInline.textContent = rules.vanilla
      ? 'the classic pair'
      : config.blocks.length + ' in play';
    el.blocksNote.textContent = rules.notes.length
      ? rules.notes.join(' ')
      : 'Every block spawns with the share shown; the ladder above is built from what they can reach.';
    el.blockAdd.disabled = config.blocks.length >= BlocksLib.MAX_BLOCKS;
    el.blockReset.disabled = rules.vanilla;
  }

  /* Build the list from scratch. Only a change to the list — a block added,
   * removed, or turned into a different kind — needs this. */
  function renderBlocks() {
    const shares = spawnShares();
    el.blocks.textContent = '';
    blockRows.length = 0;
    for (let i = 0; i < config.blocks.length; i++) {
      const row = buildBlockRow(config.blocks[i], i, shares);
      el.blocks.appendChild(row);
      blockRows.push(row);
    }
    refreshBlocks();
  }

  /* Edit one block in place and re-derive everything that depends on it. */
  function editBlock(index, change, rebuild) {
    config.blocks[index] = change(config.blocks[index]);
    applyBlocks(rebuild);
  }

  /* Rebuild the ruleset from the working config, hand it to the running game,
   * and redraw the ladder it implies. The board itself is never touched: an edit
   * changes which merges are legal and what can spawn from here on, not what is
   * already on the grid. */
  function applyBlocks(rebuild) {
    rules = BlocksLib.makeRules(config);
    saveConfig({ blocks: config.blocks });
    game.setRules(rules);
    buildLadder(rules.ladder);
    if (rebuild) renderBlocks();
    else refreshBlocks();
    render();
  }

  /* Add a block that is not obviously a duplicate of one already in play: the
   * next power of two nobody uses yet, so a new row is a real second option
   * rather than a duplicate the rules will quietly drop. */
  function addBlock() {
    const taken = {};
    for (let i = 0; i < config.blocks.length; i++) taken[keyOf(config.blocks[i])] = true;
    for (let value = 8; value <= 8192; value *= 2) {
      if (!taken['n' + value]) {
        config.blocks.push({ kind: 'number', value: value, weight: 5 });
        applyBlocks(true);
        return;
      }
    }
    config.blocks.push({ kind: 'divide', amount: 2, weight: 5 });
    applyBlocks(true);
  }

  el.blockAdd.addEventListener('click', addBlock);
  el.blockReset.addEventListener('click', function () {
    config = copyConfig(BlocksLib.DEFAULT_CONFIG);
    applyBlocks(true);
  });

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
        // The ruleset owns how a tile reads, because a custom block is not a
        // number: an operator tile shows its symbol and hides its encoding.
        d.textContent = v ? rules.label(v) : '';
        d.className = 'tile' + (v ? ' ' + rules.klass(v) : '');
      }
    }
    flash(game.lastSpawned, 'spawn');
    for (let i = 0; i < game.lastMerged.length; i++) flash(game.lastMerged[i], 'merge');
    if (game.justAchieved) flashRung(game.justAchieved);

    // Lifetime records are the human's. An AI move must not rewrite them, or
    // "best tile" would just be a description of the AI; it has its own panel.
    if (lastMoveHuman) {
      if (game.score > best) {
        best = game.score;
        save('2048-best', best);
      }
      const top = game.maxTile();
      if (top > bestTile) {
        bestTile = top;
        save('2048-best-tile', bestTile);
      }
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
      overlayText.textContent = game.winValue + '!';
      overlaySub.textContent = next
        ? 'The board goes on \u2014 next rung is ' + next.value + '.'
        : 'Every rung reached.';
      el.overlayContinue.hidden = false;
      el.status.textContent = 'You reached ' + game.winValue + '!';
    } else {
      overlay.hidden = true;
      const next = game.nextGoal();
      el.status.textContent = next ? 'Playing \u00b7 aim ' + next.value : 'Playing';
    }

    renderLadder();
  }

  /* -------- the AI player -------- */

  /* Session history for the AI, kept apart from the human records. */
  const ai = {
    playing: false,
    timer: null,
    depth: 3,
    speed: 160,
    last: null,
    moves: 0,
    runs: 0,
    bestTile: 0,
    bestScore: 0,
  };

  /* What the current run has seen, for the two sets of bookkeeping. */
  let run = { humanMoves: 0, aiMoves: 0 };
  /* Whose move produced the board on screen right now — the record gate. */
  let lastMoveHuman = false;

  /*
   * Node budget for one search, derived from the gap between moves: the AI may
   * spend roughly a quarter of that gap thinking, so a fast cadence cannot peg
   * the CPU. 8000 nodes measured at ~20-40ms on this machine, hence ~90 nodes
   * per millisecond of gap.
   */
  function aiNodeBudget(speed) {
    return Math.max(1500, Math.min(20000, Math.round(speed * 90)));
  }

  /* One AI move. Returns false when there was nothing to do. */
  function aiMove() {
    if (game.isGameOver()) {
      stopPlaying();
      return false;
    }

    const choice = AiLib.bestMove(game.grid, {
      maxDepth: ai.depth,
      maxNodes: aiNodeBudget(ai.speed),
      rules: rules,
    });
    ai.last = choice;

    if (!choice.dir) {
      stopPlaying();
      renderAI();
      return false;
    }

    ai.moves++;
    run.aiMoves++;
    lastMoveHuman = false;
    game.move(choice.dir);

    // Track the AI's own best, which never touches the human records.
    const top = game.maxTile();
    if (top > ai.bestTile) ai.bestTile = top;
    if (game.score > ai.bestScore) ai.bestScore = game.score;

    // The AI is not stopped by 2048: it dismisses the banner and plays on,
    // which is the whole point of the ladder above the goal.
    if (game.won && !game.winSeen) game.acknowledgeWin();

    render();
    renderAI();
    if (game.isGameOver()) stopPlaying();
    return true;
  }

  function scheduleAi() {
    if (ai.timer) {
      clearTimeout(ai.timer);
      ai.timer = null;
    }
    if (!ai.playing) return;
    ai.timer = setTimeout(function () {
      ai.timer = null;
      if (!ai.playing) return;
      aiMove();
      scheduleAi();
    }, ai.speed);
  }

  function startPlaying() {
    if (ai.playing) return;
    ai.playing = true;
    el.aiPlay.textContent = 'Pause';
    aiMove();
    scheduleAi();
    renderAI();
  }

  function stopPlaying() {
    ai.playing = false;
    if (ai.timer) {
      clearTimeout(ai.timer);
      ai.timer = null;
    }
    el.aiPlay.textContent = 'Play';
    renderAI();
  }

  /* -------- the AI readout -------- */

  const choiceRows = [];

  function buildChooser() {
    el.aiCandidates.textContent = '';
    choiceRows.length = 0;
    for (let i = 0; i < DIRS.length; i++) {
      const li = document.createElement('li');
      li.className = 'choice';
      li.dataset.dir = DIRS[i];

      const dir = document.createElement('span');
      dir.className = 'choice-dir';
      dir.textContent = ARROWS[DIRS[i]];

      const track = document.createElement('span');
      track.className = 'choice-bar';
      const fill = document.createElement('i');
      fill.style.width = '0%';
      track.appendChild(fill);

      const value = document.createElement('b');
      value.className = 'choice-value';
      value.textContent = '\u2014';   // idle until the AI has thought once

      li.appendChild(dir);
      li.appendChild(track);
      li.appendChild(value);
      el.aiCandidates.appendChild(li);
      choiceRows.push({ row: li, fill: fill, value: value });
    }
  }

  /* The four directions with their expectimax values: the AI's shortlist. */
  function renderChooser(choice) {
    if (!choiceRowData(choice)) return;
    const legal = [];
    for (let i = 0; i < choice.candidates.length; i++) {
      const c = choice.candidates[i];
      if (c.legal) legal.push(c.value);
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < legal.length; i++) {
      if (legal[i] < lo) lo = legal[i];
      if (legal[i] > hi) hi = legal[i];
    }

    for (let i = 0; i < choiceRows.length; i++) {
      const row = choiceRows[i];
      const c = choice.candidates[i];
      row.row.classList.toggle('illegal', !c.legal);
      row.row.classList.toggle('chosen', c.legal && choice.dir === c.dir);
      if (!c.legal) {
        row.value.textContent = 'no move';
        row.fill.style.width = '0%';
        continue;
      }
      row.value.textContent = formatValue(c.value);
      const span = hi > lo ? (c.value - lo) / (hi - lo) : 1;
      row.fill.style.width = Math.round(20 + span * 80) + '%';
    }
  }

  function choiceRowData(choice) {
    return !!(choice && choice.candidates && choice.candidates.length === DIRS.length);
  }

  /* Values are heuristic scores in the thousands; keep them readable. */
  function formatValue(v) {
    const n = Math.round(v);
    return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }

  /* The heuristic terms behind the chosen move, in plain words. */
  function describeChoice(choice) {
    if (!choiceRowData(choice) || !choice.dir) return null;
    const b = choice.breakdown;
    const mono = b.monotonicity === 0
      ? 'every line already runs one way'
      : 'lines run ' + Math.abs(Math.round(b.monotonicity)) + ' steps off monotonic';
    const corner = b.maxInCorner
      ? 'the ' + b.maxTile + ' is parked in a corner'
      : 'the ' + b.maxTile + ' is not in a corner yet';
    return 'Chose <b>' + choice.dir + '</b>: ' + b.empties + ' empty cell' +
      (b.empties === 1 ? '' : 's') + ', ' + mono + ', ' + corner + '.';
  }

  function renderAI() {
    const choice = ai.last;

    if (choiceRowData(choice)) {
      renderChooser(choice);
      const why = describeChoice(choice);
      el.aiWhy.innerHTML = why || 'No move available \u2014 the board is finished.';
    } else {
      el.aiWhy.innerHTML = 'Tick <b>Let the AI play</b> to watch it work through a board.';
    }

    if (choice) {
      el.aiStats.textContent = 'searched ' + choice.depth + ' move' + (choice.depth === 1 ? '' : 's') +
        ' ahead \u00b7 ' + choice.nodes + ' positions \u00b7 ' + Math.max(1, Math.round(choice.ms)) + 'ms' +
        (ai.moves ? ' \u2014 AI: ' + ai.moves + ' moves' : '');
    } else {
      el.aiStats.textContent = '';
    }

    if (choiceRowData(choice) && choice.dir) {
      el.aiBadge.hidden = false;
      el.aiBadgeDir.textContent = ARROWS[choice.dir];
      el.aiBadgeText.textContent = choice.dir + ' \u00b7 ' + formatValue(choice.value);
    } else {
      el.aiBadge.hidden = true;
    }
    el.aiBadge.classList.toggle('playing', ai.playing);

    if (ai.bestTile > 0) {
      el.aiStats.textContent += (el.aiStats.textContent ? ' \u00b7 ' : '') +
        'best tile ' + ai.bestTile;
    }
  }

  /* -------- run control -------- */

  function newGame() {
    stopPlaying();
    if (run.humanMoves > 0) {
      runs++;
      save('2048-runs', runs);
    }
    if (run.aiMoves > 0) ai.runs++;
    run = { humanMoves: 0, aiMoves: 0 };
    lastMoveHuman = false;
    ai.last = null;
    game = new GameLib.Game({ size: SIZE, seed: (Math.random() * 0xffffffff) >>> 0, rules: rules });
    render();
    renderAI();
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
    run.humanMoves++;
    lastMoveHuman = true;
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
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (ai.playing) stopPlaying();
      else {
        el.aiMode.checked = true;
        startPlaying();
      }
      return;
    }
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    // Taking over from the AI is one key press: the first direction key pauses
    // it rather than racing it, and the next one plays.
    if (ai.playing) {
      stopPlaying();
      return;
    }
    move(dir);
  });

  el.newGame.addEventListener('click', newGame);
  el.overlayButton.addEventListener('click', newGame);
  el.overlayContinue.addEventListener('click', keepGoing);

  el.aiMode.addEventListener('change', function () {
    if (el.aiMode.checked) startPlaying();
    else stopPlaying();
  });

  el.aiPlay.addEventListener('click', function () {
    if (ai.playing) stopPlaying();
    else {
      el.aiMode.checked = true;
      startPlaying();
    }
  });

  el.aiStep.addEventListener('click', function () {
    if (ai.playing) stopPlaying();
    aiMove();
    renderAI();
  });

  el.aiDepth.addEventListener('input', function () {
    ai.depth = parseInt(el.aiDepth.value, 10) || 3;
    el.aiDepthValue.textContent = String(ai.depth);
  });

  el.aiSpeed.addEventListener('input', function () {
    ai.speed = parseInt(el.aiSpeed.value, 10) || 160;
    el.aiSpeedValue.textContent = String(ai.speed);
  });

  let game = new GameLib.Game({ size: SIZE, seed: (Math.random() * 0xffffffff) >>> 0, rules: rules });
  buildChooser();
  buildLadder(rules.ladder);
  renderBlocks();
  el.aiDepthValue.textContent = String(ai.depth);
  el.aiSpeedValue.textContent = String(ai.speed);
  render();
  renderAI();

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
      lastMoveHuman = false;
      render();
      return game.maxTile();
    },
    records: function () {
      return { best: best, bestTile: bestTile, runs: runs };
    },
    /* The block editor's seams. `setBlocks` and `spawnValueAt` exist so a
     * browser check can prove a rarity edit really changes the spawn table,
     * and that a rescaled ladder lands on reachable values. */
    setBlocks: function (next) {
      config = copyConfig(next);
      applyBlocks(true);
      return rungs.map(function (r) { return r.value; });
    },
    blocks: function () {
      return {
        config: JSON.parse(JSON.stringify(config)),
        shares: spawnShares(),   // one entry per row, in the same order
        vanilla: rules.vanilla,
        notes: rules.notes.slice(),
        ladder: rungs.map(function (r) { return r.value; }),
        winValue: rules.winValue,
        spawns: rules.spawns.map(function (s) { return { value: s.value, share: s.share }; }),
      };
    },
    spawnValueAt: function (r) { return rules.spawnValue(r); },
    aiStep: function () { return aiMove(); },
    aiPlay: function () { el.aiMode.checked = true; startPlaying(); },
    aiPause: stopPlaying,
    aiState: function () {
      return {
        playing: ai.playing,
        depth: ai.depth,
        speed: ai.speed,
        moves: ai.moves,
        runs: ai.runs,
        bestTile: ai.bestTile,
        dir: ai.last ? ai.last.dir : null,
        nodes: ai.last ? ai.last.nodes : 0,
        ms: ai.last ? ai.last.ms : 0,
        candidates: ai.last ? ai.last.candidates : [],
      };
    },
  };
})();
