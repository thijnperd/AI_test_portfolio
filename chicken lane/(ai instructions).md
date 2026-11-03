# AI instructions for the Chicken Lane project

A free, points-only browser game: cross 25 lanes of night traffic, cash out
before a car finds you. Dependency-free, openable from `file://`, with a DOM-free
core under Node tests.

## Before working

- Read this file and [`README.md`](README.md).
- For the rules and odds, read `core.js` and the matching cases in `test.js`.
- For painting, input or the panel, read `app.js`, `index.html` and `style.css`.
- Follow the repository guidance in [`../AGENTS.md`](../AGENTS.md),
  [`../context.md`](../context.md) and [`../DESIGN.md`](../DESIGN.md).

## File responsibilities

| File | Responsibility |
|---|---|
| `core.js` | `LANES`, `RTP`, `DIFFICULTIES`, the survival/multiplier maths, `ladder`, SHA-256, `floatStream`, `makeRoad`, the `Table` round engine, formatting. **No DOM.** |
| `app.js` | Canvas painting, panel rendering, input, sound, the result card, the `window.ChickenLane` check seam. |
| `index.html` | Structure and script order. |
| `style.css` | Tokens, rail, playfield palette, states, phone contraction. |
| `test.js` | Node tests for the core only. |

## Invariants — do not break these

1. **The multiplier is derived, never declared.** `multiplier(id, n)` is
   `RTP / survive(id, n)`. There is no hand-written ladder anywhere, and there
   must not be: a declared ladder is how a game quietly stops returning what it
   claims. If you add a road, give it a hazard count and the ladder follows.
2. **`clearSteps = LANES − hazards`, and the road is exactly that long.** Not 25
   lanes; not 25 minus something else. The per-lane car probability is
   `stepOdds(id, n) = (25 − m − n + 1) / (25 − n + 1)`, which telescopes to
   `1 / C(25, m)` across the whole road — that telescoping is the published
   top-multiplier numbers. Change the road length or the odds and the ladder
   silently stops matching the table in the README.
3. **The road is drawn once, in `place()`, and never re-rolled.** `cross()` may
   only reveal one lane. `reveal()` is what exposes the whole road, and it is
   only meaningful after the round has settled. A round the player can reload or
   redraw out of is not a round.
4. **No `Math.random()` in `core.js`.** Entropy arrives as `serverSeed` from the
   caller (the app uses `crypto.getRandomValues`). The UI layer may use
   `Math.random()` for fresh seeds and cosmetic noise; the rules may not.
5. **Points are integers and the display never disagrees with the payout.** Stakes
   are whole points, payouts are `Math.round(bet × multiplier)`, and the cash-out
   button prints the same `currentPayout()` that `cashOut()` will pay. If you add
   a display path, route it through `core.js`'s formatting rather than
   re-deriving a number.
6. **`[hidden]` loses to any author `display` rule.** `style.css` opens with
   `[hidden] { display: none !important; }` for that reason. Never verify the
   result card by reading `.hidden` — assert on computed `display`.
7. **The game is free, and stays free.** No purchase, no timer, no ad, no
   "deposit", no affiliate or referral link, and no cap on the free top-up. The
   odds table and the house edge stay visible. This is the project's whole
   premise, not a feature you can trade away.

## The house style

Chrome is the shared instrument panel: the `:root` tokens copied verbatim, one
accent, hairlines, mono type, no shadows. The playfield is the one authored
exception — it has its own small palette (asphalt, sodium white, a red comb,
`--hazard` as a *signal*) because a white bird on grey asphalt has to read at
forty pixels. `--hazard` appears only where something is dangerous or lost. Never
let a second hue into the chrome.

## Performance budget

One small canvas, `devicePixelRatio` capped at 2. The render loop is frame-capped
— about 60fps while a round is live, about 18fps when the road is only ambient —
and it paints a few dozen paths; nothing is recomputed per frame. Car layout is
computed once per lane per road and cached in `carCache`. Any new per-frame work
must be a paint, not a computation, and `prefers-reduced-motion` must keep
disabling the hop, the spin and the idle bob.

## Adding or changing a road

1. Add an entry to `DIFFICULTIES` with a `hazards` count. The ladder, the odds
   table, the button labels and the canvas tags all derive from it.
2. The tests assert Rainbet's published values by name. A new road needs its own
   sourced values or it should not claim any — do not invent endpoints and add
   them to the tests.
3. Update the table in `README.md`.
4. `node test.js`.

## Validation

```bash
cd "chicken lane" && node test.js
```

For anything touching `app.js`, `index.html` or `style.css`, drive it in a real
browser from the repository root:

```bash
bash tools/check.sh "chicken lane/index.html" --expect "#road" --wait 900 \
  --eval "(function(){var L=window.ChickenLane;L.setRoad('medium');L.setBet(50);L.cross();L.cross();L.cash();return JSON.stringify({s:L.state(),overlay:getComputedStyle(document.getElementById('result')).display});})()"
```

Check both directions of the result card (hidden while playing, visible after a
cash-out or a bust), and check the phone contraction at `--size 390x844 --touch
--dpr 2` — the `CROSS` button is sticky at the bottom of the panel there on
purpose, so make sure it stays reachable.
