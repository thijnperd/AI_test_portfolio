/* blocks.js — the custom tiles you can add to 2048.
 *
 * Pure logic, no DOM: runs in the browser (as `BlocksLib`) and in Node
 * (`module.exports`), so the arithmetic, the spawn table, and the derived
 * ladder are all covered by `node test.js`.
 *
 * ## What a block is
 *
 * The vanilla game has two blocks, a 2 and a 4, and both are *numbers*: a tile
 * merges with an equal tile and the pair becomes their sum.
 *
 * A custom block is either another number — a 6, a 3, a 96: it spawns like a 2
 * does and merges only with itself — or an **operator tile**, which carries a
 * symbol instead of a number and merges with *any* number tile it is slid into,
 * rewriting that tile through its operator:
 *
 *     ÷2 slid into a 64  ->  32
 *     +2 slid into a 4   ->  6
 *     ×2 slid into a 64  ->  128
 *
 * An operator is a modifier, not a value, so two operator tiles never merge
 * with each other: a board of nothing but operators is dead. That is what the
 * per-block rarity controls are for.
 *
 * ## Why the ladder is derived rather than declared
 *
 * `game.js` used to carry a fixed powers-of-two ladder, which is wrong the
 * moment a modifier exists: spawn a 3 and nothing but 3s, and no power of two
 * above 3 is reachable at all. So the ladder is computed here instead — close
 * the set of values the active blocks can produce, then take the smallest
 * reachable value at or above each vanilla target (64, 128 ... 8192). Every
 * rung is therefore a value the board can really hold. With the default blocks
 * this reproduces the ladder the game always had, exactly.
 *
 * ## Rarity
 *
 * Every block has a spawn weight, including the 2 and the 4, and the weights
 * are normalised into one cumulative table that a single `rng()` draw indexes.
 * With the default 90 and 10 the table is the vanilla `rng() < 0.9 ? 2 : 4`
 * drawn from a table instead of a literal, so the default game is unchanged.
 */
(function (global) {
  'use strict';

  const GameLib = (typeof module !== 'undefined' && module.exports)
    ? require('./game.js')
    : global.GameLib;

  /* The kinds of block the interface offers, in the order it offers them. */
  const KINDS = [
    { id: 'number', hint: 'the number on the tile', symbol: '' },
    { id: 'divide', hint: 'divide what it meets by', symbol: '\u00f7' },
    { id: 'multiply', hint: 'multiply what it meets by', symbol: '\u00d7' },
    { id: 'add', hint: 'add to what it meets', symbol: '+' },
    { id: 'subtract', hint: 'subtract from what it meets', symbol: '\u2212' },
  ];

  const KIND_BY_ID = {};
  for (let i = 0; i < KINDS.length; i++) KIND_BY_ID[KINDS[i].id] = KINDS[i];

  /* The vanilla board, as a block config. */
  const DEFAULT_CONFIG = {
    blocks: [
      { kind: 'number', value: 2, weight: 90 },
      { kind: 'number', value: 4, weight: 10 },
    ],
  };

  const MAX_BLOCKS = 12;
  /* A block's number and an operand are both capped just under the ladder's own
   * ceiling, so a spawnable number is always inside the closure below. */
  const MAX_VALUE = 1 << 15;
  const MAX_WEIGHT = 1000;

  const LADDER_TARGETS = [64, 128, 256, 512, 1024, 2048, 4096, 8192];
  const LADDER_LABELS = [
    'Warm-up', 'Steady', 'Rolling', 'Deep', 'Halfway',
    'The goal', 'Past the edge', 'Endless',
  ];
  /* The closure is derived under a value ceiling rather than a count cap. A
   * count cap would make the ladder depend on the order values were discovered
   * in; a ceiling cannot, because there are only `LADDER_LIMIT` integers to
   * hold. 65536 leaves every target room to find its rung (a rung is never
   * further than one doubling above its target) and still bounds the work. */
  const LADDER_LIMIT = 1 << 16;

  /* Membership flags for the closure, allocated once. A config edit runs this
   * on every slider move, so it must not leave garbage behind. */
  const SEEN = new Uint8Array(LADDER_LIMIT + 1);
  const EXPANDED = new Uint8Array(LADDER_LIMIT + 1);

  /* An operator tile is not a value, so the AI's heuristic scores it as the
   * smallest tile rather than as a hole in the board. */
  const OPERATOR_VALUE = 2;

  /* ------------------------------------------------------------------ */
  /* Operators                                                          */
  /* ------------------------------------------------------------------ */

  /* What an operator tile does to the number tile it merges into. Every
   * result is a positive integer: `subtract` and `divide` clamp at 1 so they
   * can shrink a tile but never erase one.
   *
   * The table is keyed rather than switched on because these functions run once
   * per reachable value per operator — a +1 block closes over tens of thousands
   * of values, and a string comparison chain there is the difference between a
   * slider that moves and one that stutters. */
  const OP_FN = {
    divide: function (value, amount) { return Math.max(1, Math.round(value / amount)); },
    multiply: function (value, amount) { return value * amount; },
    add: function (value, amount) { return value + amount; },
    subtract: function (value, amount) { return Math.max(1, value - amount); },
  };

  function applyOp(kind, value, amount) {
    const fn = OP_FN[kind];
    return fn ? fn(value, amount) : 0;
  }

  function clampInt(value, fallback, min, max) {
    const n = typeof value === 'number' ? Math.round(value) : parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function isKind(id) {
    return Object.prototype.hasOwnProperty.call(KIND_BY_ID, id);
  }

  /* ------------------------------------------------------------------ */
  /* Normalising a config                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Sanitise a block config into the shape the rest of the module expects.
   *
   * Anything a saved config or a hand-typed one can get wrong is fixed here
   * rather than guarded at every use: unknown kinds become numbers, operands
   * and weights are clamped and rounded, duplicates are dropped, and the rules
   * are kept playable — at least one *number* block must be able to spawn,
   * because a board of operator tiles alone can never merge.
   */
  function normalize(config) {
    const src = (config && Array.isArray(config.blocks)) ? config.blocks : DEFAULT_CONFIG.blocks;
    const blocks = [];
    const seenNumber = {};
    const seenOp = {};
    let dropped = 0;
    let restored = false;

    for (let i = 0; i < src.length && blocks.length < MAX_BLOCKS; i++) {
      const b = src[i];
      if (!b || typeof b !== 'object') continue;
      const kind = isKind(b.kind) ? b.kind : 'number';
      const weight = clampInt(b.weight, 0, 0, MAX_WEIGHT);
      if (kind === 'number') {
        const value = clampInt(b.value, 2, 1, MAX_VALUE);
        if (seenNumber[value]) { dropped++; continue; }
        seenNumber[value] = true;
        blocks.push({ kind: 'number', value: value, weight: weight });
      } else {
        const amount = clampInt(b.amount, 2, 1, MAX_VALUE);
        const key = kind + ':' + amount;
        if (seenOp[key]) { dropped++; continue; }
        seenOp[key] = true;
        blocks.push({ kind: kind, amount: amount, weight: weight });
      }
    }

    if (blocks.length === 0) {
      blocks.push({ kind: 'number', value: 2, weight: 90 });
      blocks.push({ kind: 'number', value: 4, weight: 10 });
    }

    let spawnableNumber = false;
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].kind === 'number' && blocks[i].weight > 0) spawnableNumber = true;
    }
    if (!spawnableNumber) {
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].kind === 'number') { blocks[i].weight = 1; restored = true; break; }
      }
      if (!restored) {
        blocks.unshift({ kind: 'number', value: 2, weight: 90 });
        restored = true;
      }
    }

    return { blocks: blocks, dropped: dropped, restored: restored };
  }

  /* ------------------------------------------------------------------ */
  /* The reachable value set and the ladder it produces                 */
  /* ------------------------------------------------------------------ */

  /**
   * Every positive value the active blocks can put on the board.
   *
   * The closure is seeded with the spawnable numbers and grown with two rules:
   * two equal tiles merge into their sum, and an operator applied to any
   * reachable value produces another reachable value. That ignores how many
   * copies of a tile a player would have to build — it is an over-approximation
   * on purpose, because the ladder's job is to name values that *can* exist,
   * not to solve the board.
   *
   * The scan is over an integer-indexed flag array rather than a set, and it
   * walks values in ascending order, so the result is sorted without a sort and
   * cannot depend on discovery order. Dividing is the one operator that can
   * reach *below* the scan position, so a smaller result rewinds the cursor and
   * the value it landed on is expanded on the way back up.
   */
  function reachableValues(rules) {
    const seen = SEEN;
    const expanded = EXPANDED;
    seen.fill(0);
    expanded.fill(0);
    let first = LADDER_LIMIT + 1;
    let hi = 0;

    /* Mark a value reachable. Returns true only the first time, which is what
     * the cursor and the rewind both key off. */
    function mark(value) {
      if (value < 1 || value > LADDER_LIMIT || seen[value]) return false;
      seen[value] = 1;
      if (value < first) first = value;
      if (value > hi) hi = value;
      return true;
    }

    for (let i = 0; i < rules.spawns.length; i++) {
      if (rules.spawns[i].value > 0) mark(rules.spawns[i].value);
    }
    // A config with every number at weight 0 cannot spawn a value at all; the
    // normaliser restores one, but a hand-built ruleset still deserves an answer.
    if (!hi) {
      for (let i = 0; i < rules.blocks.length; i++) {
        if (rules.blocks[i].kind === 'number') mark(rules.blocks[i].value);
      }
    }
    if (!hi) return [];

    const operators = rules.operators;
    /* A non-growing operator — divide, or subtract — can drop a result below the
     * cursor, so the scan has to stay exhaustive for it. Everything else only
     * ever produces larger values, and then the scan can stop once it is past
     * the last two targets: nothing above could still change a rung, because a
     * rung is never further than one doubling above its target. */
    let canShrink = false;
    for (let k = 0; k < operators.length; k++) {
      if (operators[k].kind === 'divide' || operators[k].kind === 'subtract') canShrink = true;
    }
    const stopAfter = canShrink ? LADDER_LIMIT : LADDER_TARGETS[LADDER_TARGETS.length - 1] * 2;

    let index = first;
    while (index <= hi && index <= stopAfter) {
      if (!seen[index] || expanded[index]) { index++; continue; }
      expanded[index] = 1;

      mark(index * 2);

      let rewind = 0;
      for (let k = 0; k < operators.length; k++) {
        const op = operators[k];
        const value = op.apply(index, op.amount);
        if (mark(value) && value < index && (rewind === 0 || value < rewind)) rewind = value;
      }

      if (rewind) { index = rewind; continue; }  // rescan: the cursor may sit past a new value
      index++;
    }

    const out = [];
    for (let v = 1; v <= hi; v++) if (seen[v]) out.push(v);
    return out;
  }

  /**
   * The ladder: one rung per vanilla target, each sitting on the smallest
   * reachable value at or above that target. A target nothing can reach is
   * dropped, and two targets that land on the same value are one rung — so a
   * short ladder is a statement about the blocks, not a bug.
   */
  function makeLadder(values) {
    const rungs = [];
    let cursor = 0;
    for (let i = 0; i < LADDER_TARGETS.length; i++) {
      const target = LADDER_TARGETS[i];
      let value = 0;
      for (let j = cursor; j < values.length; j++) {
        if (values[j] >= target) { value = values[j]; cursor = j; break; }
      }
      if (!value) continue;
      if (rungs.length && rungs[rungs.length - 1].value === value) continue;
      rungs.push({ value: value, label: LADDER_LABELS[i], target: target });
    }
    return rungs;
  }

  /* The value that raises the win banner: the rung sitting on the vanilla goal
   * (2048), or the closest rung below it, or nothing at all on an empty ladder. */
  function winValueOf(rungs) {
    for (let i = rungs.length - 1; i >= 0; i--) {
      if (rungs[i].target === GameLib.WIN_VALUE) return rungs[i].value;
    }
    let best = 0;
    for (let i = 0; i < rungs.length; i++) {
      if (rungs[i].target <= GameLib.WIN_VALUE) best = rungs[i].value;
    }
    return best || (rungs.length ? rungs[0].value : 0);
  }

  function opResult(operator, value) {
    return operator ? operator.apply(value, operator.amount) : 0;
  }

  /* ------------------------------------------------------------------ */
  /* The ruleset                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Build the rules a `Game` (and the AI) plays by.
   *
   * Returns an object with the sanitised `blocks` (one entry per block, in the
   * order the interface lists them), the cumulative `spawns` table a single rng
   * draw indexes, `mergePair(a, b)` — the one implementation of "do these two
   * tiles merge, and into what" — the tile presentation helpers, the derived
   * `ladder`, the `winValue`, and plain-language `notes` for the panel.
   *
   * `vanilla` is true only for the untouched default config. Callers use it to
   * keep the original code paths — `game.js` then skips the merge callback and
   * the AI keeps its unmodified heuristic — so the default game is bit-for-bit
   * the game it was before blocks existed.
   */
  function makeRules(config) {
    const norm = normalize(config);
    const blocks = norm.blocks;

    /* Operator tiles are encoded as negative numbers: 0 is empty, a positive
     * number is a number tile, and `-(code)` identifies an operator block.
     * Each block also caches its own `tile` and `label` so the interface never
     * has to re-derive them. */
    const operators = [];
    const operatorsFor = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === 'number') {
        b.label = String(b.value);
        b.tile = b.value;
        continue;
      }
      const op = {
        kind: b.kind,
        amount: b.amount,
        weight: b.weight,
        code: operators.length + 1,
        apply: OP_FN[b.kind],
        symbol: KIND_BY_ID[b.kind].symbol,
        hint: KIND_BY_ID[b.kind].hint,
        label: KIND_BY_ID[b.kind].symbol + b.amount,
      };
      operators.push(op);
      operatorsFor[op.code] = op;
      b.label = op.label;
      b.tile = -op.code;
    }

    /* One cumulative table over every block that can spawn, in config order, so
     * the row a weight sits in is the row it draws from. */
    const spawns = [];
    let total = 0;
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].weight > 0) total += blocks[i].weight;
    }
    let cumulative = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.weight <= 0) continue;
      cumulative += b.weight;
      spawns.push({
        value: b.kind === 'number' ? b.value : b.tile,
        weight: b.weight,
        upto: total > 0 ? cumulative / total : 1,
        share: total > 0 ? b.weight / total : 0,
        block: b,
      });
    }

    const vanilla = blocks.length === 2
      && blocks[0].kind === 'number' && blocks[0].value === 2 && blocks[0].weight === 90
      && blocks[1].kind === 'number' && blocks[1].value === 4 && blocks[1].weight === 10;

    const numbers = [];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].kind === 'number') numbers.push(blocks[i]);
    }

    const rules = {
      blocks: blocks,
      numbers: numbers,
      operators: operators,
      spawns: spawns,
      vanilla: vanilla,
      winValue: 0,
      ladder: [],

      /* The only place that decides whether two tiles merge, and into what.
       * 0 means "these two do not merge"; every real result is at least 1. */
      mergePair: function (a, b) {
        if (a === 0 || b === 0) return 0;
        if (a < 0) {
          if (b < 0) return 0;              // an operator is not a value
          return opResult(operatorsFor[-a], b);
        }
        if (b < 0) return opResult(operatorsFor[-b], a);
        return a === b ? a + b : 0;          // numbers merge only with their equal
      },

      /* Draw one spawn: exactly one rng() call, whatever the table looks like. */
      spawnValue: function (r) {
        if (spawns.length === 0) return 2;
        for (let i = 0; i < spawns.length; i++) {
          if (r < spawns[i].upto) return spawns[i].value;
        }
        return spawns[spawns.length - 1].value;
      },

      isOperator: function (v) { return v < 0; },

      /* The text on a tile: the number, or the operator's symbol and operand. */
      label: function (v) {
        if (v < 0) {
          const op = operatorsFor[-v];
          return op ? op.label : '?';
        }
        return String(v);
      },

      /* Which colour band a tile uses. Operators have their own, and a number
       * between two ladder values borrows the lower one so it is never
       * unstyled. */
      klass: function (v) {
        if (v < 0) return 'op';
        let band = 2;
        while (band * 2 <= v && band < 8192) band *= 2;
        return 'v' + band;
      },

      /* What the AI's log-based heuristic should read a tile as. */
      heuristicValue: function (v) {
        return v < 0 ? OPERATOR_VALUE : v;
      },
    };

    rules.ladder = makeLadder(reachableValues(rules));
    rules.winValue = winValueOf(rules.ladder);

    const notes = [];
    if (norm.dropped) notes.push('Two blocks shared a value, so only the first of each is in play.');
    if (norm.restored) notes.push('Every number block weighed 0, so 2 is still spawning \u2014 a board with no numbers can never merge.');
    if (rules.ladder.length === 0) {
      notes.push('No block here can produce a mergeable value, so there is nothing to climb.');
    } else if (rules.ladder.length < LADDER_TARGETS.length) {
      notes.push('The blocks cap the climb at ' + rules.ladder[rules.ladder.length - 1].value +
        ' \u2014 the rungs above it are out of reach.');
    }
    if (operators.length) notes.push('Operator tiles merge with any number tile, and never with each other.');
    rules.notes = notes;

    return rules;
  }

  const BlocksLib = {
    KINDS: KINDS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    MAX_BLOCKS: MAX_BLOCKS,
    LADDER_TARGETS: LADDER_TARGETS,
    applyOp: applyOp,
    normalize: normalize,
    reachableValues: reachableValues,
    makeLadder: makeLadder,
    makeRules: makeRules,
  };

  global.BlocksLib = BlocksLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlocksLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
