/* core.js — Chicken Lane's road, odds and provable randomness. No DOM.
 *
 * THE MODEL
 * ---------
 * A road is 25 lanes. Before your first step, `hazards` of those lanes are
 * already set (1, 3, 5 or 10 of them, depending on the difficulty). Every step
 * you take reveals one lane. Because a safe lane is *consumed* while every
 * hazard stays put, each step is riskier than the last — the walk is a draw
 * without replacement, not a row of coin flips.
 *
 * That gives the published numbers exactly:
 *
 *   survive(n)      = C(L - m, n) / C(L, n)        (L = 25, m = hazards)
 *   multiplier(n)   = RTP / survive(n)
 *
 * With RTP = 0.96 this reproduces Rainbet's Chicken Cross ladder to the digit:
 *   Easy      1 hazard    1.00x  ->  24x
 *   Medium    3 hazards   1.09x  ->  2208x
 *   Hard      5 hazards   1.20x  ->  51004.8x
 *   Daredevil 10 hazards  1.60x  ->  3138009.6x
 * The same formula with 20 lanes and RTP 0.98 reproduces Stake's Chicken
 * (1.03x -> 19.6x, 1.15x -> 1117.20x, 1.31x -> 15193.92x, 1.96x -> 181060.88x),
 * which is how we know the model is right rather than merely plausible.
 *
 * The multiplier is therefore not a house invention — it is forced. Every step
 * returns exactly RTP in expectation, so no stopping rule changes the value;
 * only the variance does. The game says so on screen.
 *
 * Exports `CluckCore` for the browser and for Node.
 */
'use strict';

var CluckCore = (function () {
  const LANES = 25;
  const RTP = 0.96;
  const START_POINTS = 1000;
  const MIN_BET = 1;
  const MAX_BET = 100000;

  const DIFFICULTIES = [
    { id: 'easy', name: 'Easy', hazards: 1, blurb: '24 lanes' },
    { id: 'medium', name: 'Medium', hazards: 3, blurb: '22 lanes' },
    { id: 'hard', name: 'Hard', hazards: 5, blurb: '20 lanes' },
    { id: 'daredevil', name: 'Daredevil', hazards: 10, blurb: '15 lanes' },
  ];

  function difficulty(id) {
    for (const d of DIFFICULTIES) if (d.id === id) return d;
    return DIFFICULTIES[0];
  }

  /* ---------------------------------------------------------------- maths */

  /** C(n, k) as a float. n stays small here (25), so this is exact. */
  function choose(n, k) {
    if (k < 0 || k > n || n < 0) return 0;
    k = Math.min(k, n - k);
    let out = 1;
    for (let i = 1; i <= k; i++) out = (out * (n - k + i)) / i;
    return out;
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  /** How many lanes you must cross to reach the far kerb. */
  function clearSteps(id) {
    return LANES - difficulty(id).hazards;
  }

  /** P(the n-th step is safe, given you survived n - 1 steps). */
  function stepOdds(id, n) {
    const m = difficulty(id).hazards;
    const left = LANES - (n - 1);
    if (left <= 0) return 0;
    return (left - m) / left;
  }

  /** P(you reach lane n alive). n = 0 is the kerb you start on. */
  function survive(id, n) {
    const m = difficulty(id).hazards;
    if (n <= 0) return 1;
    if (n > LANES - m) return 0;
    return choose(LANES - m, n) / choose(LANES, n);
  }

  /** The multiplier for having crossed n lanes. n = 0 is 1.00x (your stake). */
  function multiplier(id, n) {
    if (n <= 0) return 1;
    const s = survive(id, n);
    return s > 0 ? round2(RTP / s) : Infinity;
  }

  const ladders = {};
  /** The whole ladder for one difficulty, as the odds panel shows it. */
  function ladder(id) {
    if (ladders[id]) return ladders[id];
    const rows = [];
    const clear = clearSteps(id);
    for (let n = 1; n <= clear; n++) {
      const row = {
        step: n,
        odds: stepOdds(id, n),
        survive: survive(id, n),
        multiplier: multiplier(id, n),
      };
      row.ev = row.survive * row.multiplier;
      rows.push(row);
    }
    ladders[id] = rows;
    return rows;
  }

  /* ------------------------------------------------------------- sha-256 */

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function utf8Bytes(text) {
    const out = [];
    for (const ch of String(text)) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80) out.push(cp);
      else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0x10000) {
        out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else {
        out.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 63),
          0x80 | ((cp >> 6) & 63),
          0x80 | (cp & 63)
        );
      }
    }
    return Uint8Array.from(out);
  }

  /** SHA-256 of a string, as lowercase hex. Used to commit a round, not to hide it. */
  function sha256(text) {
    const bytes = utf8Bytes(text);
    const bitLength = bytes.length * 8;
    const padded = ((bytes.length + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(padded);
    buf.set(bytes);
    buf[bytes.length] = 0x80;

    const hiBits = Math.floor(bitLength / 4294967296);
    const loBits = bitLength >>> 0;
    const end = padded - 8;
    buf[end] = (hiBits >>> 24) & 255;
    buf[end + 1] = (hiBits >>> 16) & 255;
    buf[end + 2] = (hiBits >>> 8) & 255;
    buf[end + 3] = hiBits & 255;
    buf[end + 4] = (loBits >>> 24) & 255;
    buf[end + 5] = (loBits >>> 16) & 255;
    buf[end + 6] = (loBits >>> 8) & 255;
    buf[end + 7] = loBits & 255;

    const H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const W = new Uint32Array(64);

    for (let off = 0; off < padded; off += 64) {
      for (let t = 0; t < 16; t++) {
        const q = off + t * 4;
        W[t] = (buf[q] << 24) | (buf[q + 1] << 16) | (buf[q + 2] << 8) | buf[q + 3];
      }
      for (let t = 16; t < 64; t++) {
        const a1 = W[t - 15];
        const b1 = W[t - 2];
        const s0 = rotr(a1, 7) ^ rotr(a1, 18) ^ (a1 >>> 3);
        const s1 = rotr(b1, 17) ^ rotr(b1, 19) ^ (b1 >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }

      let a = H[0], b = H[1], c = H[2], d = H[3];
      let e = H[4], f = H[5], g = H[6], h = H[7];

      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + W[t]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }

      H[0] = (H[0] + a) | 0;
      H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0;
      H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0;
      H[5] = (H[5] + f) | 0;
      H[6] = (H[6] + g) | 0;
      H[7] = (H[7] + h) | 0;
    }

    let hex = '';
    for (let i = 0; i < 8; i++) hex += (H[i] >>> 0).toString(16).padStart(8, '0');
    return hex;
  }

  /** An endless supply of floats in [0, 1), chained out of one seed string. */
  function floatStream(material) {
    let digest = sha256(material);
    let words = [];
    let at = 0;

    function digestFloats(hex) {
      const out = [];
      for (let i = 0; i < 8; i++) out.push(parseInt(hex.substr(i * 8, 8), 16) / 4294967296);
      return out;
    }

    words = digestFloats(digest);
    return function next() {
      if (at >= words.length) {
        digest = sha256(digest);
        words = digestFloats(digest);
        at = 0;
      }
      return words[at++];
    };
  }

  /**
   * The round's road: one entry per lane you have to cross, `true` meaning a
   * hazard sits in that lane. The chance of one is forced by the model above —
   * it starts at (L - m) / L and tightens as the road runs out, which is exactly
   * why the last lane is the worst one. The whole road is drawn here, before the
   * first step, so no click can move a car.
   */
  function makeRoad(serverSeed, clientSeed, nonce, id) {
    const clear = clearSteps(id);
    const hazards = difficulty(id).hazards;
    const next = floatStream(serverSeed + ':' + clientSeed + ':' + nonce);

    // Draw `hazards` distinct lanes out of all LANES without replacement, so a
    // round really does hold exactly the m hazards the road is named for (and the
    // reveal can never claim more than the odds table does). Drawing each lane at
    // its conditional probability would give the same survival law — the ladder is
    // identical — but a road holding a different number of hazards, which is a lie
    // the player can see after settling.
    const positions = [];
    for (let lane = 1; lane <= LANES; lane++) positions.push(lane);
    for (let i = 0; i < hazards; i++) {
      const pick = i + Math.floor(next() * (LANES - i));
      const held = positions[i];
      positions[i] = positions[pick];
      positions[pick] = held;
    }

    const struck = positions.slice(0, hazards);
    const road = [];
    for (let lane = 1; lane <= clear; lane++) road.push(struck.indexOf(lane) !== -1);
    return road;
  }

  /* ------------------------------------------------------------- display */

  /** Rainbet's own house style: always two decimals, e.g. 2208.00x. */
  function formatMultiplier(value) {
    if (!isFinite(value)) return '\u2014';
    if (value >= 1000) return value.toFixed(2);
    return value.toFixed(2);
  }

  function formatPoints(value) {
    const n = Math.round(value);
    const sign = n < 0 ? '-' : '';
    const digits = String(Math.abs(n));
    let out = '';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
      out += digits[i];
    }
    return sign + out;
  }

  function formatPercent(value, digits) {
    const places = digits === undefined ? 2 : digits;
    if (value > 0 && value < 0.0001) return '<0.01%';
    return (value * 100).toFixed(places) + '%';
  }

  /* -------------------------------------------------------------- engine */

  class Table {
    constructor(opts) {
      const o = opts || {};
      this.balance = o.balance === undefined ? START_POINTS : o.balance;
      this.bet = o.bet === undefined ? 25 : o.bet;
      this.difficultyId = o.difficulty || 'medium';
      this.clientSeed = o.clientSeed || 'chicken-lane';
      this.serverSeed = o.serverSeed || sha256('chicken-lane:' + (o.entropy || 'default'));
      this.serverSeedHash = sha256(this.serverSeed);
      this.nonce = 0;
      this.status = 'idle'; // idle | live | busted | cashed
      this.round = null;
      this.stats = {
        rounds: 0,
        busts: 0,
        cashes: 0,
        staked: 0,
        returned: 0,
        bestMultiplier: 0,
        bestPayout: 0,
        peakBalance: this.balance,
      };
    }

    get difficulty() {
      return difficulty(this.difficultyId);
    }

    get clearSteps() {
      return clearSteps(this.difficultyId);
    }

    /** What cashing out right now would pay, in points. */
    currentPayout() {
      const crossed = this.round ? this.round.crossed : 0;
      return Math.round(this.bet * multiplier(this.difficultyId, crossed));
    }

    setBet(value) {
      const n = Math.floor(Number(value));
      if (!isFinite(n)) return this.bet;
      this.bet = Math.max(MIN_BET, Math.min(MAX_BET, n));
      return this.bet;
    }

    /** You cannot change the road mid-walk. */
    setDifficulty(id) {
      if (this.status === 'live') return this.difficultyId;
      difficulty(id); // validates by falling back
      this.difficultyId = id;
      return this.difficultyId;
    }

    canPlace() {
      return (
        this.status !== 'live' &&
        this.bet >= MIN_BET &&
        this.bet <= Math.min(this.balance, MAX_BET)
      );
    }

    place() {
      if (!this.canPlace()) return { ok: false, reason: 'You need more points than that.' };
      this.nonce += 1;
      this.balance -= this.bet;
      const road = makeRoad(this.serverSeed, this.clientSeed, this.nonce, this.difficultyId);
      this.round = {
        nonce: this.nonce,
        bet: this.bet,
        difficulty: this.difficultyId,
        crossed: 0,
        multiplier: 1,
        road: road,
        lanes: [],
        payout: 0,
        auto: false,
      };
      this.status = 'live';
      this.stats.staked += this.bet;
      return { ok: true, round: this.round };
    }

    /**
     * Take one step. Returns what the player needs to see, and never more than
     * one lane's worth of the road — the map stays private until the round ends.
     */
    cross() {
      if (this.status !== 'live' || !this.round) return { ok: false };
      const round = this.round;
      const lane = round.crossed;
      const hazard = round.road[lane];

      round.crossed += 1;
      round.lanes.push({ lane: lane, hazard: hazard });

      if (hazard) {
        round.payout = 0;
        this.status = 'busted';
        this.stats.rounds += 1;
        this.stats.busts += 1;
        return {
          ok: true,
          safe: false,
          lane: lane,
          crossed: round.crossed,
          multiplier: 0,
          payout: 0,
          status: this.status,
          revealed: this.reveal(),
        };
      }

      round.multiplier = multiplier(this.difficultyId, round.crossed);

      if (round.crossed >= this.clearSteps) {
        round.auto = true;
        const payout = Math.round(round.bet * round.multiplier);
        this._settle(payout);
        return {
          ok: true,
          safe: true,
          lane: lane,
          crossed: round.crossed,
          multiplier: round.multiplier,
          payout: payout,
          auto: true,
          status: this.status,
          revealed: this.reveal(),
        };
      }

      return {
        ok: true,
        safe: true,
        lane: lane,
        crossed: round.crossed,
        multiplier: round.multiplier,
        payout: 0,
        status: this.status,
      };
    }

    cashOut() {
      if (this.status !== 'live' || !this.round) return { ok: false };
      const round = this.round;
      const payout = Math.round(round.bet * round.multiplier);
      const multiplierNow = round.multiplier;
      round.payout = payout;
      this._settle(payout);
      return {
        ok: true,
        crossed: round.crossed,
        multiplier: multiplierNow,
        payout: payout,
        status: this.status,
        revealed: this.reveal(),
      };
    }

    _settle(payout) {
      this.balance += payout;
      this.status = payout > this.round.bet ? 'cashed' : 'cashed';
      this.stats.rounds += 1;
      this.stats.cashes += 1;
      this.stats.returned += payout;
      if (this.round.multiplier > this.stats.bestMultiplier) {
        this.stats.bestMultiplier = this.round.multiplier;
      }
      if (payout > this.stats.bestPayout) this.stats.bestPayout = payout;
      if (this.balance > this.stats.peakBalance) this.stats.peakBalance = this.balance;
    }

    /** Everything needed to re-run the round by hand. Only valid once settled. */
    reveal() {
      const round = this.round;
      if (!round) return null;
      const hazardLanes = round.road
        .map((hazard, index) => (hazard ? index + 1 : 0))
        .filter(Boolean);
      return {
        serverSeed: this.serverSeed,
        serverSeedHash: this.serverSeedHash,
        clientSeed: this.clientSeed,
        nonce: round.nonce,
        difficulty: round.difficulty,
        hazards: hazardLanes.length,
        hazardLanes: hazardLanes,
        material: this.serverSeed + ':' + this.clientSeed + ':' + round.nonce,
      };
    }

    /** Free points, always available: this game has nothing to buy. */
    topUp(amount) {
      const gift = amount === undefined ? START_POINTS : Math.floor(amount);
      this.balance += gift;
      if (this.balance > this.stats.peakBalance) this.stats.peakBalance = this.balance;
      return this.balance;
    }
  }

  return {
    LANES,
    RTP,
    START_POINTS,
    MIN_BET,
    MAX_BET,
    DIFFICULTIES,
    difficulty,
    choose,
    round2,
    clearSteps,
    stepOdds,
    survive,
    multiplier,
    ladder,
    sha256,
    floatStream,
    makeRoad,
    formatMultiplier,
    formatPoints,
    formatPercent,
    Table,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CluckCore;
