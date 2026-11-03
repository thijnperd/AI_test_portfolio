/* test.js — executable specification for the Chicken Lane core (core.js).
 *
 * Run with:  node test.js
 * No dependencies: Node's built-in assert only.
 *
 * These tests pin the published ladder, the fairness chain, and the engine's
 * money arithmetic. The ladder tests are the important ones: they assert the
 * exact multipliers Rainbet's Chicken Cross shows, which is only possible if the
 * draw-without-replacement model is right.
 */
'use strict';

const assert = require('assert');
const Core = require('./core.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (err) {
    failed++;
    console.log('FAIL  ' + name + '\n      ' + err.message);
  }
}

function close(actual, expected, tolerance, label) {
  const gap = Math.abs(actual - expected);
  assert.ok(
    gap <= tolerance,
    (label || 'value') + ' was ' + actual + ', expected ' + expected + ' +/- ' + tolerance
  );
}

/* ------------------------------------------------------- the published ladder */

test('every difficulty clears the road in the documented number of steps', function () {
  assert.strictEqual(Core.clearSteps('easy'), 24);
  assert.strictEqual(Core.clearSteps('medium'), 22);
  assert.strictEqual(Core.clearSteps('hard'), 20);
  assert.strictEqual(Core.clearSteps('daredevil'), 15);
});

test('first-lane multipliers match the published table', function () {
  assert.strictEqual(Core.multiplier('easy', 1), 1.0);
  assert.strictEqual(Core.multiplier('medium', 1), 1.09);
  assert.strictEqual(Core.multiplier('hard', 1), 1.2);
  assert.strictEqual(Core.multiplier('daredevil', 1), 1.6);
});

test('top multipliers reproduce the published table to the digit', function () {
  assert.strictEqual(Core.multiplier('easy', 24), 24);
  assert.strictEqual(Core.multiplier('medium', 22), 2208);
  assert.strictEqual(Core.multiplier('hard', 20), 51004.8);
  assert.strictEqual(Core.multiplier('daredevil', 15), 3138009.6);
});

test('the ladder never falls as you climb', function () {
  for (const d of Core.DIFFICULTIES) {
    const rows = Core.ladder(d.id);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(
        rows[i].multiplier > rows[i - 1].multiplier,
        d.id + ' step ' + rows[i].step + ' did not rise'
      );
    }
  }
});

test('each step is riskier than the one before it (draw without replacement)', function () {
  for (const d of Core.DIFFICULTIES) {
    const rows = Core.ladder(d.id);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(
        rows[i].odds < rows[i - 1].odds,
        d.id + ' step ' + rows[i].step + ' was not riskier'
      );
    }
    // On the final lane only the hazards are left to choose from.
    close(rows[rows.length - 1].odds, 1 / (d.hazards + 1), 1e-12, d.id + ' last-lane odds');
  }
});

test('the first step odds equal (lanes - hazards) / lanes', function () {
  assert.strictEqual(Core.stepOdds('easy', 1), 24 / 25);
  assert.strictEqual(Core.stepOdds('medium', 1), 22 / 25);
  assert.strictEqual(Core.stepOdds('hard', 1), 20 / 25);
  assert.strictEqual(Core.stepOdds('daredevil', 1), 15 / 25);
});

/* ------------------------------------------------------------------- the edge */

test('every stopping point returns exactly 96% in expectation', function () {
  for (const d of Core.DIFFICULTIES) {
    for (const row of Core.ladder(d.id)) {
      close(row.ev, Core.RTP, 0.005, d.id + ' step ' + row.step + ' return');
    }
  }
});

test('the house edge is 4%, not a secret', function () {
  close(1 - Core.RTP, 0.04, 1e-12, 'house edge');
});

test('a live simulation returns 96% at every stop point', function () {
  const stops = [1, 3, 5, 8];
  for (const d of Core.DIFFICULTIES) {
    for (const stop of stops) {
      if (stop > Core.clearSteps(d.id)) continue;
      // Deep stop points are rare events, so the sample has to be big enough to
      // say anything at all: aim for ~600 surviving runs (about 2.5% standard
      // error) and allow four of those.
      const p = Core.survive(d.id, stop);
      const rounds = Math.max(2000, Math.ceil(600 / p));
      let returned = 0;
      for (let i = 0; i < rounds; i++) {
        const road = Core.makeRoad('sim-server', 'sim-client', i + 1, d.id);
        let crossed = 0;
        while (crossed < stop && !road[crossed]) crossed += 1;
        if (crossed === stop) returned += Core.multiplier(d.id, stop);
      }
      const ev = returned / rounds;
      const tolerance = Math.max(0.02, (4 * Core.RTP) / Math.sqrt(rounds * p));
      close(ev, Core.RTP, tolerance, d.id + ' stop ' + stop + ' simulated return');
    }
  }
});

/* --------------------------------------------------------------- sha-256 */

test('sha256 matches the FIPS-180 test vectors', function () {
  assert.strictEqual(
    Core.sha256(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  assert.strictEqual(
    Core.sha256('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  assert.strictEqual(
    Core.sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
  );
});

test('sha256 handles a payload longer than one 64-byte block', function () {
  assert.strictEqual(Core.sha256('a'.repeat(200)).length, 64);
});

/* ------------------------------------------------------------ fairness chain */

test('the same seeds and nonce always rebuild the same road', function () {
  assert.deepStrictEqual(
    Core.makeRoad('server', 'client', 7, 'hard'),
    Core.makeRoad('server', 'client', 7, 'hard')
  );
});

test('a new nonce makes a new road', function () {
  assert.notDeepStrictEqual(
    Core.makeRoad('server', 'client', 1, 'hard'),
    Core.makeRoad('server', 'client', 2, 'hard')
  );
});

test('a road is exactly as long as the walk to the far kerb', function () {
  for (const d of Core.DIFFICULTIES) {
    const road = Core.makeRoad('s', 'c', 3, d.id);
    assert.strictEqual(road.length, Core.clearSteps(d.id));
    assert.ok(road.every((car) => car === true || car === false), 'road entries must be booleans');
  }
});

test('the first lane has a car exactly as often as the odds say', function () {
  const rounds = 8000;
  for (const d of Core.DIFFICULTIES) {
    let cars = 0;
    for (let nonce = 1; nonce <= rounds; nonce++) {
      if (Core.makeRoad('first-lane', 'c', nonce, d.id)[0]) cars += 1;
    }
    const expected = 1 - Core.stepOdds(d.id, 1);
    const sigma = Math.sqrt((expected * (1 - expected)) / rounds);
    close(cars / rounds, expected, 4 * sigma, d.id + ' first-lane car rate');
  }
});

test('the lane the first car sits in follows the published distribution', function () {
  const rounds = 30000;
  const id = 'medium';
  const clear = Core.clearSteps(id);
  const counts = new Array(clear + 1).fill(0); // index = lane, 0 = no car at all
  for (let nonce = 1; nonce <= rounds; nonce++) {
    const at = Core.makeRoad('dist', 'c', nonce, id).indexOf(true);
    counts[at === -1 ? 0 : at + 1] += 1;
  }
  for (let lane = 1; lane <= clear; lane++) {
    const expected = Core.survive(id, lane - 1) * (1 - Core.stepOdds(id, lane));
    const sigma = Math.sqrt((expected * (1 - expected)) / rounds);
    close(counts[lane] / rounds, expected, 5 * sigma, 'first car on lane ' + lane);
  }
  const clean = Core.survive(id, clear);
  const sigma = Math.sqrt((clean * (1 - clean)) / rounds);
  close(counts[0] / rounds, clean, 5 * sigma, 'roads with no car at all');
});

/* ------------------------------------------------------------------ engine */

function table(opts) {
  return new Core.Table(Object.assign({ serverSeed: 'test-server', entropy: 'x' }, opts));
}

test('placing a bet takes the stake out of the balance', function () {
  const t = table({ balance: 1000, bet: 100 });
  const placed = t.place();
  assert.strictEqual(placed.ok, true);
  assert.strictEqual(t.balance, 900);
  assert.strictEqual(t.status, 'live');
});

test('you cannot bet more points than you hold', function () {
  const t = table({ balance: 50, bet: 100 });
  assert.strictEqual(t.canPlace(), false);
  assert.strictEqual(t.place().ok, false);
  assert.strictEqual(t.balance, 50);
});

test('you cannot place a second bet mid-round', function () {
  const t = table({ balance: 1000, bet: 10 });
  t.place();
  assert.strictEqual(t.place().ok, false);
  assert.strictEqual(t.balance, 990);
});

test('cashing out pays stake times the multiplier and ends the round', function () {
  const t = table({ balance: 1000, bet: 100, difficulty: 'medium' });
  t.place();
  const first = t.cross();
  assert.strictEqual(first.safe, true);
  const cash = t.cashOut();
  assert.strictEqual(cash.ok, true);
  assert.strictEqual(t.status, 'cashed');
  assert.strictEqual(t.balance, 900 + Math.round(100 * t.round.multiplier));
});

test('a hazard ends the round and keeps the stake', function () {
  const t = table({ balance: 1000, bet: 100, difficulty: 'daredevil' });
  let guard = 0;
  let busted = false;
  t.place();
  while (guard++ < 40) {
    const step = t.cross();
    if (step.safe === false) {
      busted = true;
      assert.strictEqual(step.payout, 0);
      assert.strictEqual(step.status, 'busted');
      break;
    }
  }
  assert.ok(busted, 'daredevil should bust eventually');
  assert.strictEqual(t.balance, 900);
});

test('crossing every lane cashes out automatically at the top multiplier', function () {
  const t = table({ balance: 1000, bet: 10, difficulty: 'easy' });
  // Find a seed whose road has no car at all, so the full climb is survivable
  // and the auto-cash path is the one exercised.
  let found = null;
  for (let i = 1; i <= 2000 && !found; i++) {
    if (Core.makeRoad('auto-server', 'auto-client', i, 'easy').every((car) => !car)) found = i;
  }
  assert.ok(found, 'no seed cleared all 24 lanes');
  t.serverSeed = 'auto-server';
  t.clientSeed = 'auto-client';
  t.nonce = found - 1;
  t.place();
  let last = null;
  for (let i = 0; i < Core.clearSteps('easy'); i++) last = t.cross();
  assert.strictEqual(last.auto, true);
  assert.strictEqual(last.status, 'cashed');
  assert.strictEqual(t.round.multiplier, 24);
  assert.strictEqual(last.payout, 240);
  assert.strictEqual(t.balance, 990 + 240);
});

test('cash out after zero steps returns the stake and nothing more', function () {
  const t = table({ balance: 500, bet: 40 });
  t.place();
  const cash = t.cashOut();
  assert.strictEqual(cash.multiplier, 1);
  assert.strictEqual(cash.payout, 40);
  assert.strictEqual(t.balance, 500);
});

test('cashing out mid-round is refused once the round is over', function () {
  const t = table({ balance: 500, bet: 20 });
  t.place();
  t.cashOut();
  assert.strictEqual(t.cashOut().ok, false);
  assert.strictEqual(t.cross().ok, false);
});

test('the road cannot be changed mid-walk', function () {
  const t = table({ balance: 500, bet: 20, difficulty: 'easy' });
  t.place();
  assert.strictEqual(t.setDifficulty('daredevil'), 'easy');
  t.cashOut();
  assert.strictEqual(t.setDifficulty('daredevil'), 'daredevil');
});

test('revealing a settled round exposes the whole road and nothing else', function () {
  const t = table({ balance: 500, bet: 20, difficulty: 'medium' });
  assert.strictEqual(t.reveal(), null);
  t.place();
  t.cross();
  const reveal = t.reveal();
  assert.strictEqual(reveal.hazardLanes.length, reveal.hazards);
  assert.strictEqual(reveal.material, 'test-server:chicken-lane:' + reveal.nonce);
  assert.strictEqual(reveal.serverSeedHash, Core.sha256(reveal.serverSeed));
  for (const lane of reveal.hazardLanes) {
    assert.ok(
      lane >= 1 && lane <= Core.clearSteps('medium'),
      'lane ' + lane + ' is off the road'
    );
  }
});

test('a round is reproducible from what the game reveals', function () {
  const t = table({ balance: 500, bet: 20, difficulty: 'hard' });
  t.place();
  t.cross();
  t.cashOut();
  const reveal = t.reveal();
  const rebuilt = Core.makeRoad(reveal.serverSeed, reveal.clientSeed, reveal.nonce, 'hard');
  assert.deepStrictEqual(
    rebuilt.map((car, i) => (car ? i + 1 : 0)).filter(Boolean),
    reveal.hazardLanes
  );
});

test('points can always be topped up for free', function () {
  const t = table({ balance: 5, bet: 5 });
  t.place();
  t.cross();
  t.cashOut();
  assert.ok(t.balance <= 10);
  assert.strictEqual(t.topUp(), 1005);
  assert.strictEqual(t.topUp(0), 1005);
});

test('stats track rounds, stakes and the best run', function () {
  const t = table({ balance: 1000, bet: 10, difficulty: 'medium' });
  t.place();
  t.cross();
  t.cashOut();
  assert.strictEqual(t.stats.rounds, 1);
  assert.strictEqual(t.stats.cashes, 1);
  assert.strictEqual(t.stats.staked, 10);
  assert.ok(t.stats.bestMultiplier >= 1.09);
});

test('a long session at one stop point loses about 4% of everything staked', function () {
  const t = table({ balance: 100000, bet: 10, difficulty: 'hard' });
  for (let i = 0; i < 1500; i++) {
    t.place();
    let alive = true;
    while (alive && t.round.crossed < 3) alive = t.cross().safe;
    if (t.status === 'live') t.cashOut();
  }
  const edge = (t.stats.staked - t.stats.returned) / t.stats.staked;
  close(edge, 0.04, 0.06, 'realised house edge over 1500 rounds');
});

/* --------------------------------------------------------------- formatting */

test('multipliers print the way the casino prints them', function () {
  assert.strictEqual(Core.formatMultiplier(1), '1.00');
  assert.strictEqual(Core.formatMultiplier(2208), '2208.00');
  assert.strictEqual(Core.formatMultiplier(3138009.6), '3138009.60');
  assert.strictEqual(Core.formatMultiplier(Infinity), '\u2014');
});

test('points print with thousands separators', function () {
  assert.strictEqual(Core.formatPoints(1000), '1,000');
  assert.strictEqual(Core.formatPoints(31380096), '31,380,096');
  assert.strictEqual(Core.formatPoints(-40), '-40');
  assert.strictEqual(Core.formatPoints(999), '999');
});

test('tiny probabilities do not round to zero', function () {
  assert.strictEqual(Core.formatPercent(0.000001), '<0.01%');
  assert.strictEqual(Core.formatPercent(0.88), '88.00%');
});

/* ------------------------------------------------------------------ report */

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
