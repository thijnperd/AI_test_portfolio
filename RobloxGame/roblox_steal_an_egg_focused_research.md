# Roblox steal-and-secure game research

Deep focus on the gameplay structure behind Steal An Egg. Research date: 7 October 2026.
Design brief plus the master prompt it produces.

**This markdown file is the version to use.** Its `.docx` twin
(`roblox_steal_an_egg_focused_research_and_master_prompt.docx`) is the original Word export,
kept alongside it for reference; the two are not maintained in parallel.

**The prompt it produces** is
[`roblox_steal_an_egg_focused_master_prompt.md`](roblox_steal_an_egg_focused_master_prompt.md).
The wider market research is [`roblox_steal_collect_research.md`](roblox_steal_collect_research.md),
which is also where the market figures are reconciled (see the callout in its section 3).

**How to read the numbers.** Only one reading below is a player count, and it is a third-party
tracker measurement that disagrees with the other document in this folder. Treat it as
evidence that the category is large, not as a fact about this game.

## Executive summary

This document intentionally narrows the earlier Roblox research. The main reference point is no longer the broader Roblox market. It is the specific interaction design of a steal-and-collect game: seeing valuable collectibles in the world, deciding whether to risk the trip, carrying the prize while visibly vulnerable, getting it home, hatching it, turning it into income, and using that income to steal a better prize.

Current Roblox evidence supports this focus. The official Steal An Egg page describes the sequence as stealing eggs, hatching rare pets, earning money, upgrading treadmill and base, training for Speed, stealing from other players, and discovering rarer eggs, pets, sizes, and mutations. The experience is categorized as Simulation / Tycoon and uses seven-player servers.

A third-party RBLXSTAT snapshot from 3 October 2026 measured about 2.00 million concurrent players, a 2.105 million recent peak, 6.4 billion visits, 6.5 million favorites, and a 92% like ratio. These are tracker measurements, not official Roblox analytics, and they do not agree with the readings in the companion market research — GGAID's snapshot four days later put the same game at roughly 1.2M concurrent. See the callout in
[`roblox_steal_collect_research.md`](roblox_steal_collect_research.md) section 3 for how to treat that conflict: it is real, it is unresolved, and it does not change any design conclusion here.

## 1. The exact product pattern to reproduce

The most useful abstraction is a five-state collectible pipeline. It is more specific than the generic phrase "steal, hatch, upgrade" because it isolates why the stealing itself creates tension.

| State | What happens | Why it matters |
|---|---|---|
| 1. Available | A target sits in a shared zone, visible to everyone who can reach it. | Scarcity creates an immediate decision: take something safe now or hunt for more value. |
| 2. Carried | The target is attached to the player, changes movement, and creates a clear return objective. | This is the tension state. The player has committed value but has not secured it. |
| 3. Contested / dropped | A guardian or another player interrupts the carrier, creating a recoverable contested object. | Failure becomes a story and a second contest rather than a menu result. |
| 4. Secured | The target reaches the player base or vault and becomes protected. | The dangerous part ends with a strong payoff. |
| 5. Hatched / converted | The target becomes a persistent creature or collectible that generates value and unlocks progression. | The last steal directly funds the next steal. |

## 2. Steal An Egg gameplay anatomy

The official Roblox description confirms the major loops. Community guides add useful observed detail: guarded targets are taken from world zones; carrying can be affected by item weight; guardians can pressure the carrier; and player-owned unhatched eggs can be raided. Because these guides are unofficial and some hidden values are uncertain, use their structural observations, not their exact hidden numbers, as design evidence.

| System | Observed structure | Design implication |
|---|---|---|
| World targets | Eggs appear in distinct zones and have different value/risk. | The field becomes a visible menu of risks. |
| Guardians | Target zones are protected by NPC threats. | Guard behavior should teach route choice and timing, not complex combat. |
| Carry state | The player physically transports the prize. Community guides report heavier targets can slow movement. | The prize must change how the player moves. |
| Speed progression | Training increases Speed and helps access better areas. | Upgrades should change which steals are feasible. |
| Player raids | Other players can steal unhatched eggs from pens. | The base becomes economically meaningful because exposure is social. |
| Rarity | Multiple rarity tiers create visibly different target values. | Players should understand rarity before they commit to a steal. |
| Variants | Sizes and mutations add another collector layer. | Separate base rarity from secondary variant rarity. |
| Passive income | Hatched pets generate money. | Owned collectibles finance future stealing. |
| Compact servers | Official page lists 7-player servers. | Rare targets and carriers remain socially visible. |

## 3. The steal itself is the product

The reference experience is not interesting merely because it contains eggs. The differentiator is that acquiring value requires a dangerous state transition. A player must move from a safe information state into a vulnerable transport state, then convert success into permanent progression.

- Before pickup, the player is evaluating opportunity.

- At pickup, the decision becomes irreversible enough to create commitment.

- During carry, the collectible is visible and the player has an obvious route problem.

- Near delivery, tension peaks because success is close but value is still exposed.

- After delivery, the player receives a strong confirmation and can immediately see the next target.

This is the central design rule for the new game: add depth to the stealing situation, not complexity to the menus.

## 4. Risk ladder: what the player should see in the world

| Target class | Risk | Value | Decision question |
|---|---|---|---|
| Safe | Low | Low | Can I bank easy progress? |
| Efficient | Low-medium | Medium | Is this the best return for my current speed? |
| Greedy | Medium-high | High | Can I carry this without getting intercepted? |
| Jackpot | Very high | Very high | Is this rare enough to risk losing? |
| Server event | Extreme / contested | Exceptional | Should I abandon a safe plan to chase this? |

Do not make the highest-value target automatically optimal. The game is strongest when different players can rationally choose different risks based on their upgrades, confidence and current goals.

## 5. Carrying: the most important gameplay state

The player should visibly become a carrier. This is the moment other users can understand without UI explanation. The object should be attached to the avatar, large enough to read, and mechanically consequential.

- Carrying visibly changes the player silhouette.

- Carrying reduces or modifies movement in a predictable way.

- The base/return direction is always clear.

- Rarer objects produce stronger visual and audio feedback.

- Rivals can recognize that the player is carrying something worth taking.

- The carrier has route choices and limited defensive options.

- Failure produces a dropped/contested object rather than an invisible rollback whenever possible.

## 6. Weight, speed and route design

The most important progression variable is not raw currency. It is the player's ability to move a valuable object through danger. Build three interacting variables: player movement, collectible weight, and route risk.

Recommended model: effective_speed = base_speed × permanent_speed_multiplier × temporary_buffs × weight_multiplier. Keep all factors in configuration. Weight penalties should be strong enough to change route decisions but capped so premium targets remain exciting rather than tedious.

| Route | Advantage | Cost | Design role |
|---|---|---|---|
| Fast | Shortest return time | High exposure | Experienced carriers and high-confidence runs |
| Safe | Less exposure | Longer return | Reliable progress |
| Shortcut | Short route | Requires progression | Makes speed upgrades tangible |
| High-value branch | Access to better targets | High risk | Advanced target hunting |
| Interception point | Creates natural rival contact | Both sides become exposed | Social story generator |

## 7. NPC guardians

Guardians exist to make carrying interesting. They should be simple enough to learn after one encounter.

| Guardian behavior | What the player learns |
|---|---|
| Patrol loop | Observe before grabbing. |
| Line-of-sight | Use cover and route timing. |
| Burst chase | Do not commit to a target you cannot outrun. |
| Knock/drop pressure | Protect the final segment of the route. |
| Zone-specific behavior | Every new zone changes stealing decisions. |

## 8. Player-to-player theft

Player theft is the social multiplier. A rival does not need a complex combat system to create tension. The interaction can be built from proximity, timing, route interception, a contested state and recovery.

- Approach the exposed player or base item.

- Begin a readable steal interaction.

- Enter a short contest window.

- Carrier escapes, item drops, or ownership changes.

- Both players understand the outcome immediately.

- Permanent progression remains protected so a single raid cannot destroy long-term play.

The intended emotional outcome is "I almost got away" or "I stole that back", not "my account progress is ruined".

## 9. Base / pen / vault

| Function | Required behavior |
|---|---|
| Storage | Clearly distinguish secured collectibles from vulnerable ones. |
| Income | Show which collections are generating currency. |
| Status | Make rare collections visible to visitors. |
| Raid surface | Expose only intentionally vulnerable goods. |
| Progression | Offer upgrades that increase future stealing power. |
| Social flex | Make the collection legible at a glance. |

The base should visually answer three questions: what do I own, what can someone take, and what am I working toward next?

## 10. Hatching, rarity and variants

Hatching is the reward bridge, not the main activity. It should be fast, visual and immediately connected to the next steal.

- Suspense: the object changes before the result is known.

- Rarity reveal: the tier appears immediately.

- Identity reveal: name, variant and income appear.

- Collection consequence: the index shows whether it is new.

- Economic consequence: the result immediately changes future options.

Community catalogs report a multi-tier rarity system and additional size/mutation layers, but the exact hidden odds are not stable enough to copy. Use the design principle of independent axes: base rarity + size + visual variant + optional event trait.

| Axis | Purpose | New-game rule |
|---|---|---|
| Base rarity | Primary value/difficulty | 5-6 launch tiers, original names |
| Size | Secondary collector chase | Rare sizes are visually obvious |
| Variant | Visual or economic modifier | Transparent and independently rolled |
| Event trait | Limited-time collection | Reserved for updates and special moments |

## 11. Target spawning and reset cycles

The world should constantly create new reasons to move. Common targets prevent dead time. Medium targets encourage active search. Rare targets create server-wide competition. Extremely rare targets become events.

| Spawn tier | Frequency | Server treatment |
|---|---|---|
| Common | Constant | No announcement, highly readable |
| Uncommon | Frequent | Subtle visual/audio cue |
| Rare | Occasional | Visible server cue |
| Mythic | Rare | Strong announcement and global VFX |
| Server jackpot | Very rare | Server-wide event that creates a temporary race |

A configurable spawn cycle is preferable to fixed hard-coded timing. The system should support normal spawns, a short reset period, refreshed target pools, and optional rare-event rolls.

## 12. Economy: every successful steal must improve the next steal

The economy should form a closed loop: steal -> hatch -> earn -> upgrade -> reach better targets -> steal. If a reward cannot be connected to future stealing capability, it should be cosmetic or collection-focused rather than a competing economic branch.

Use a simple formula such as income_per_second = base_income × rarity_multiplier × variant_multiplier × upgrade_multiplier. Put all numbers into configuration tables. Avoid uncontrolled exponential growth.

| Economic output | Must affect |
|---|---|
| Cash | Immediate upgrades and base growth |
| Collection progress | Future target goals |
| Speed | Reach and escape capability |
| Capacity | How much risk/value can be managed |
| Zone unlock | Higher target classes |
| Prestige, if added | Long-term status and future capability |

## 13. Progression should change stealing, not just numbers

The most valuable upgrade is one that changes the decision landscape. A +10% income boost is less interesting than an upgrade that lets the player carry a heavy target through a shortcut or survive a guardian encounter.

| Upgrade axis | Gameplay effect |
|---|---|
| Speed | Faster travel and access to risky targets |
| Carry capacity | Ability to transport heavier or multiple targets |
| Route access | Shortcuts and alternate paths |
| Base capacity | More active income and more collection display |
| Defense utility | Limited counterplay when being raided |
| Collection bonuses | Meaningful reason to pursue sets |

## 14. Creator and YouTube design

The YouTube evidence is useful because theft naturally produces simple video premises. Current search results include beginner guides and theft-focused gameplay whose title tells the viewer exactly what the video is about. Examples include stealing every common/rare egg, sneaking into bases, upgrading speed, hatching stolen eggs, and revealing a valuable collection.

| Moment | Potential video hook |
|---|---|
| Rare target appears | "A jackpot spawned in our server" |
| Carrier chase | "I had 10 seconds to escape with this" |
| Base raid | "I stole from the richest player" |
| Last-second loss | "I lost the rarest egg at the finish" |
| Recovery | "We stole it back" |
| Variant hatch | "I got the impossible variant" |
| Collection completion | "I finally completed the index" |

## 15. Reddit: what to fix rather than blindly copy

Reddit discussions are strongly polarized. Some developers describe the game as extremely simple and attribute its success to virality, marketing and psychological engagement. Other commenters say the simplicity itself is the appeal, because the progression and player stealing are easy to understand. The same discussion also contains criticism that the experience feels like a reskin or cash-grab style game.

This suggests a strong design opportunity: preserve the clarity and addictive loop while making the actual stealing more skillful, the economy more fair, the comeback path stronger, and the identity unquestionably original.

## 16. Original game concept brief

Working pitch: Sprint into a chaotic shared world, snatch mysterious collectible pods from guarded zones, get them safely back to your personal vault, open them into strange creatures, grow a passive-income collection, and use the upgrades to risk bigger and more valuable snatches.

The concept should retain the structural strengths of the steal-and-collect category while introducing a distinct fictional theme, original collectibles, a new map layout, and at least one secondary mechanic that meaningfully affects route choice.

## 17. MVP scope

| Component | Target |
|---|---|
| Players/server | 5-8 |
| Steal zones | 3 |
| Collectibles | 30-50 original designs |
| Rarity tiers | 5-6 |
| Variant axes | 2-3 |
| Guardian behaviors | 3 |
| Player theft | Carry contest + drop + recovery |
| Personal bases | 1 per player |
| Progression | Speed + capacity + zone unlocks |
| Economy | 1 soft currency + optional premium currency |
| Events | 1 rare server event + 1 launch event |
| Analytics | End-to-end steal funnel |

## 18. Metrics that specifically diagnose the steal loop

| Metric | What it tells you |
|---|---|
| Time to first pickup | Is the premise obvious? |
| Pickup-to-delivery time | Is carrying fun or tedious? |
| Delivery success rate | Is risk fair? |
| Loss location | Where does tension become frustration? |
| Steals/session | How often does the player choose to repeat the loop? |
| Average carried value | Are players willing to risk meaningful assets? |
| Post-hatch next-target rate | Does reward naturally lead to another steal? |
| Player raid participation | Is social theft actually compelling? |
| D1/D7 retention | Does the loop survive novelty? |

## 19. AI master prompt: what it must force the builder to solve

The supplied Maverick guide recommends a master prompt with dense context, clear priorities, defaults and portable instructions. This game-specific prompt therefore acts as a complete operating brief for an AI development agent instead of a generic "make a Roblox game" request. Source: https://mavgpt.ai/resources/master-prompt-guide-2026

- Role and mission

- Research context

- Core product thesis

- Five-state collectible model

- Steal mechanic

- Carry physics and weight

- Route architecture

- NPC guardians

- Player theft

- Base raids and defense

- Hatching

- Rarity/size/variants

- Target spawning

- Economy and progression

- Retention

- Creatorability

- Monetization

- Technical architecture

- Server authority

- Persistence

- Analytics

- Playtest simulation

- Balance pass

- Launch readiness

## 20. Delivery

The full implementation master prompt is delivered as a separate Markdown file, roblox_steal_an_egg_focused_master_prompt.md. It instructs a coding-capable AI to design, architect, implement, test, balance and prepare the game for launch, with the steal/carry/return loop treated as the primary system.

## Sources

- Roblox, Steal An Egg official page: https://www.roblox.com/games/107778070777162/Steal-An-Egg

- RBLXSTAT, Steal An Egg October 3, 2026 deep dive: https://rblxstat.com/blog/steal-an-egg-roblox-deep-dive-2026-10-03

- Maverick AI, Build Your Master Prompt: https://mavgpt.ai/resources/master-prompt-guide-2026

- Steal An Egg community guide on stealing: https://steal-an-egg.robloxgamewiki.com/guide/how-to-steal-eggs/

- Steal An Egg community guide on base defense: https://steal-an-egg.wiki/strategies/player-base-defense

- Steal An Egg mutation reference: https://stealaneggroblox.wiki/mutations/

- Reddit, Why is Steal an Egg so big?: https://www.reddit.com/r/robloxgamedev/comments/1w266ht/why_is_steal_an_egg_so_big/

- Reddit, What did Steal an Egg do?: https://www.reddit.com/r/doors_roblox/comments/1w89b5q/so_what_did_steal_an_egg_do/
