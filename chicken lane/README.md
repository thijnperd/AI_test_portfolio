# Chicken Lane

*A dark instrument panel, driven at night.* A free, points-only browser game:
cross a farm track one lane at a time while the herds wander past, watch the
multiplier climb, and cash out before one of them finds you.

Open `index.html`. Nothing to install, no build step, no dependencies.

**This is a game, not a casino.** Points only — nothing to deposit, nothing to
buy, nothing to withdraw, no prizes, no affiliate links. See
[What it is not](#what-it-is-not).

---

## How it plays

1. Set a bet in points (start: 1,000, top up for free whenever you like).
2. Pick a road — Easy, Medium, Hard or Daredevil. The number of lanes and the
   multiplier ladder change with it.
3. Press **Cross** (or `Space`). One press, one lane.
4. **Cash out** (`C`) whenever you like. The button always shows the exact
   number of points you would take.
5. Reach the far kerb and the round pays itself out at the top multiplier.

Your bird is cosmetic: nine of them are here — rooster, chicken, duck, goose,
turkey, peacock, penguin, cassowary and emu — and every one crosses at exactly
the same odds.

Every lane you cross is **sealed behind you**: a stone wall closes above and below
it and its herd stops walking, so the track turns into a corridor of everything
you have already got through and the bird hops over the next wall on its way up.

The whole road for the round is fixed before your first step, so nothing you do
can move an animal into your lane. The payout rail down the right edge shows what
each remaining lane pays (it is painted over the herds, so traffic can never hide
a number), the next lane is tinted because that is the decision in front of you,
and a dashed rule marks your own best cash-out on this road.

| Key | What it does |
|---|---|
| `Space` / `Enter` | Cross one lane (or start the next round) |
| `C` | Cash out |
| `Esc` | Close the result card |
| `←` `→` `↑` `↓` | Change road, when the road selector has focus |

## The maths, and where the numbers came from

This is a **step-multiplier** game, the genre Rainbet sells as *Chicken Cross*,
Stake as *Chicken* and InOut as *Chicken Road*. The mechanic is not the same as a
crash game: there is no clock, and every step waits for you.

The road has **25 lanes**, and `m` of them hold a hazard — a loose animal
(1, 3, 5 or 10, by road). Before the first step all 25 are set. Because a lane you
survive is used up while every hazard stays put, **the walk is a draw without
replacement** — which is why every step is riskier than the last, and why the
final lane is the worst one in the game.

That gives the whole ladder in two lines:

```
survive(n)    = C(25 − m, n) / C(25, n)      P(reach lane n alive)
multiplier(n) = 0.96 / survive(n)            with the multiplier rounded to 2 dp
```

The multiplier is therefore **not a house invention — it is forced** by the
return the game promises. Every lane returns the same 96% in expectation, so no
stopping rule changes the value; only the variance does.

### The fit

With **25 lanes at 96%** (Rainbet's published *Max RTP*), this reproduces
Rainbet's Chicken Cross ladder:

| Road | Lanes to cross | First lane | Top multiplier |
|---|---|---|---|
| Easy | 24 | 1.00× | 24× |
| Medium | 22 | 1.09× | **2,208×** |
| Hard | 20 | 1.20× | **51,004.80×** |
| Daredevil | 15 | 1.60× | **3,138,009.60×** |

The same formula with **20 lanes at 98%** reproduces every published Stake
*Chicken* value to the digit — 1.03×→19.6×, 1.15×→1,117.20×, 1.31×→15,193.92×,
1.96×→**181,060.88×**. Two providers, eight published endpoints, one model. That
double fit is the evidence the reconstruction is right rather than merely
plausible. (`test.js` asserts the Rainbet set exactly.)

*Caveats, stated plainly:* neither provider publishes a per-lane table. Rainbet's
own page gives only "Max RTP 96.00%", a bet count and a winners feed — which is
where 2,208.00× comes from (several users hit exactly that value, and
2,208 = 0.96 × C(25,3)). The same feed caps at a suspiciously exact 47,545.60×
across several users, which looks like a per-multiplier ceiling on that
operator's Hard tier; **this game does not cap payouts**, so its Hard road runs on
to 51,004.80×. Where our table and an operator's differ, theirs wins — this is a
reconstruction, not a claim.

### Why 96% and not more

96% is Rainbet's figure, so this game uses it: **the house keeps 4 points of every
100 staked**. Stake's version returns 98% (2 points), InOut's *Chicken Road 2*
95.5%. The rail prints the number, the odds table prints the return of every
single lane, and the session panel prints what the 4% has actually cost you so
far. A game with nothing at stake can afford to be this candid; that is rather
the point.

One consequence worth knowing: a *first* lane on Easy pays 1.00×, so crossing once
and banking is exactly break-even. That is not a bug — at 24/25 to survive, a
fair payout is your stake back.

## What it is not

- **Not gambling.** There is no money, no deposit, no purchase, no cashier, no
  wallet, no crypto, no withdrawal, and nothing of value to win. Points are
  virtual, unlimited and free: **+ 1,000 free points** is always one click away,
  with no timer and nothing to watch.
- **Not affiliated** with Rainbet, Stake, InOut Games, or any operator or
  developer. No code, artwork, audio, layout or data was taken from any of them.
  The name, the bird, the road, the palette and the code are this project's own.
  The rules of a step-multiplier game are, as far as we can tell, not protectable
  — the *expression* is, which is why none of theirs is here.
- **Not a demo of a real product.** There is no "play for real" button, no
  affiliate link and no referral code, and there never will be.
- **18+.** Casino-style games can be habit-forming even when they are free. The
  game shows your net points, the house edge and the true odds so that the
  arithmetic stays visible rather than being something you feel your way around.
  If gambling is a problem for you or someone close: [GamCare](https://www.gamcare.org.uk/),
  [BeGambleAware](https://www.begambleaware.org/), or the US NCPG helpline
  [1-800-522-4700](https://www.ncpgambling.org/help-treatment/).

It is also honest about the genre's central illusion: the traffic is
**decoration**. Animals wander every lane at a speed set by the road, and players
often assume timing matters. It does not — the outcome of every lane was decided
before you placed the bet. The herd is drawn on every lane whatever the road, so
it can never hint at where a hazard is. The Fairness panel says so, and can prove
it.

## Fairness

Every round is derived from three values:

```
road = SHA-256 chain of  serverSeed : clientSeed : nonce
```

The digest is turned into a stream of floats, and those floats draw **`m`
distinct lanes out of all 25** — one draw per hazard, without replacement. The
whole road is drawn at the moment you place the bet, never during the round, so a
round holds exactly the `m` hazards its road is named for and every lane you never
reached can still be checked after you settle.

- The **server seed hash** is on screen before you play; the seed itself is
  revealed after every round, with the nonce, the material and the lane numbers
  the cars were in.
- Change the **client seed** in the Fairness panel and future roads change with
  it (past rounds are unaffected, which is what makes the panel useful).
- Rebuild any round by hand: `node -e "console.log(require('./core.js').makeRoad(seed, client, nonce, 'hard'))"`.

This is a small, honest implementation of the scheme real operators use. It is
*not* a security boundary: the game is a single local page, so anyone who opens
dev tools can read the road. What it does honestly is make cheating pointless and
verification trivial — the claim being tested is "the game did not change the road
under you", and that claim is exactly true.

## Art

The stage is **side-on**: the track runs across the screen, the bird climbs it lane
by lane, and the herds charge left and right along the lanes between a grass verge
at the bottom and the far verge with its finish strip and golden egg at the top.
Side-on is the view the packs are actually drawn for — every animal in them is a
profile — and it makes traffic unmistakable at a glance instead of a dark shape on
dark tarmac.

Pixel art on a 32 px grid, drawn nearest-neighbour and scaled by whole numbers, because
half-pixel scaling is what makes a pixel scene look soft. The track and verges are tiled
from the pack's 16 px ground sheet, with its grass tufts, flowers and boulders scattered
along the verges; lane dashes, alternating lane bands, the chequered finish strip and the
payout rail are drawn in code. A bird that crouches, stretches and squashes when it hops,
and animals that step along their lane as they graze.

The birds, the coins, the lanterns and every animal in the herds come from the
**32rogues** pack by **Seth Boyles**; the ground tiles and the verge props come from
**free_pixel_16_woods**. Both have one catch worth knowing about: the 32rogues licence
allows use in commercial and non-commercial projects but **forbids redistribution**,
and this repository is public. So the packs themselves are `.gitignore`d
(`chicken lane/Assets/`) and are not in git, and everything that needs a sprite has a
hand-drawn stand-in in `art.js` — the bird from a 16x16 character grid tinted nine
ways, the animals from a blocky quadruped tinted per species — so the layout, sizes
and feel are identical without the packs.

That means the game is complete either way. With the pack on disk you get its rooster,
duck, penguin and the rest, real coin sprites and lantern light. In a fresh clone, on
GitHub Pages, or on anyone else's machine the fallback art takes over and the layout,
sizes and feel are identical — only the pixels differ. Both are one URL apart: open
`index.html` and `index.html?art=code`.

Lane markings, the finish strip, the payout rail, dust and feathers are this project's
own. Sound is two oscillators and an envelope through the Web Audio API, so there is no
audio file anywhere.

The pack's licence also rules out NFT/blockchain use and use in generative-AI or
machine-learning projects. Read it before taking this game anywhere commercial:
`Assets/32rogues-0.5.0/32rogues/LICENSE.txt` if you have the folder, and the credit
above if you do not.

## Files

| File | Responsibility |
|---|---|
| `core.js` | The rules: the 25-lane model, the ladder, SHA-256, the road generator, the round engine and the points arithmetic. No DOM. Exports `CluckCore` for the browser and for Node. |
| `app.js` | The browser half: the rail, keyboard, sound, game feel (hop, hit-stop, shake, particles), the result card, and the `window.ChickenLane` seam the browser checks drive. |
| `art.js` | Every pixel: the atlas loader, the bird catalogue, the herd catalogue, the tiled ground and verge props, coins, lanterns, particles, and the hand-drawn fallbacks used when the packs are absent. |
| `index.html` | Page structure and script order (`core.js`, then `app.js`). |
| `style.css` | The house tokens, the console rail, the playfield palette, states, and the phone contraction. |
| `test.js` | Node tests for the core. Not UI tests. |
| `README.md` | This file. |

## Validation

```bash
cd "chicken lane" && node test.js
```

33 tests: the published ladder to the digit, the 96% identity at every stopping
point, a Monte-Carlo return check at four stop points on all four roads, the
SHA-256 FIPS vectors, the fairness chain (same seed → same road, first-car
distribution against the analytic pmf), and the money arithmetic (stake
deduction, bust, auto-cash, cash-out, refusal to bet more than you hold).

In a real browser, from the repository root:

```bash
bash tools/check.sh "chicken lane/index.html" --expect "#road" --wait 900 \
  --eval "window.ChickenLane.cross(); window.ChickenLane.cross(); JSON.stringify(window.ChickenLane.state())"
```

The seam is `cross()`, `cash()`, `setBet(points)`, `setRoad(id)`, `setBird(id)` and
`state()`, so a check can play a round without waiting on animation timers. The result
card is verified by computed `display`, never by reading `.hidden`.

Two more paths worth checking: the fallback art (`index.html?art=code`), because that
is what anyone without the sprite pack sees, and the phone layout at
`--size 390x844 --touch --dpr 2`, where the two action buttons sit side by side on a
sticky bar.
