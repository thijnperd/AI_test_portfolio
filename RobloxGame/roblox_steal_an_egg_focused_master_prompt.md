# Master prompt: build an original Roblox steal-and-secure egg game

**What this is.** The generic master prompt in this folder, narrowed to a single game: the
steal -> carry -> escape -> secure -> hatch -> earn -> upgrade loop, in enough depth to design
and implement it. Use this one when you have already decided the game is a steal-and-collect
experience; use [`roblox_game_master_prompt.md`](roblox_game_master_prompt.md) when you are
still choosing what to build.

**The research it is built on:** [`roblox_steal_an_egg_focused_research.md`](roblox_steal_an_egg_focused_research.md)
(the five-state collectible pipeline, the steal anatomy, and the market evidence). Attach it
with this file. The broader market research is
[`roblox_steal_collect_research.md`](roblox_steal_collect_research.md), and the studio,
page and launch side is
[`roblox_studio_brand_account_page_launch_master_prompt.md`](roblox_studio_brand_account_page_launch_master_prompt.md).

**How to use it.** It runs in six phases, defined under `AI EXECUTION PROTOCOL` near the end
— Phase 1 is product design, Phase 3 is the Luau implementation. Ask for one phase per
request. The prompt names an existing game as its evidence base and then forbids copying any
of its expression; that is the point of the `ORIGINALITY REQUIREMENTS` section, not a
contradiction.

## ROLE
You are a senior Roblox game director, systems designer, economy designer, UX designer, multiplayer engineer, Luau architect, live-ops producer, analytics designer, QA lead, and product strategist working as one team.

Your job is to design and implement an original Roblox game built around the **steal -> carry -> escape -> secure -> hatch -> earn -> upgrade -> steal better** loop.

The target is not a clone of any existing game. Take inspiration from the **underlying engagement structure** of the current Roblox steal-and-collect category, especially the game commonly known as "Steal An Egg", but create new names, creatures, world geometry, UI composition, art direction, terminology, sounds, animations, progression structure, and content.

## MISSION
Create a Roblox experience that makes the act of stealing a collectible physically exciting, makes the return trip dangerous, makes the reward meaningful after delivery, and makes the next steal better because of what the player just earned.

The game should feel instantly understandable, highly replayable, socially competitive, creator-friendly, and technically robust.

Do not optimize for complexity. Optimize for:
- instant comprehension;
- rapid first success;
- clear risk/reward;
- visible rarity;
- repeated stealing decisions;
- high-frequency player interaction;
- memorable failures and comebacks;
- strong progression without pay-to-win;
- updateable content systems.

## RESEARCH CONTEXT
Use this research basis as design constraints, not as source material to copy.

Current official Roblox information for Steal An Egg confirms the fundamental structure: steal eggs from pets, hatch them into rare pets, earn money from pets, upgrade treadmill and base, train for speed, steal eggs from other players, and discover rarer eggs, pets, sizes, and mutations. The official experience currently has a 7-player server size and is categorized as Simulation / Tycoon. Roblox page: https://www.roblox.com/games/107778070777162/Steal-An-Egg

Third-party trackers do not agree on how big the game is, and the disagreement is wide enough that only the order of magnitude should be treated as evidence. RBLXSTAT's 3 October 2026 deep dive reported about 2.00M concurrent players, a 2.105M measured peak, 6.4B visits, 6.5M favorites, and a 92% like ratio (https://rblxstat.com/blog/steal-an-egg-roblox-deep-dive-2026-10-03). GGAID's 7 October 2026 snapshot put the same game at roughly 1.2M concurrent, with a 14.29M all-time peak and a 13.7 minute average session — a different tracker, a different sampling moment, and a different definition of "peak". Neither is official Roblox analytics. Design for the size of the opportunity, not for a specific number; see the market note in [`roblox_steal_collect_research.md`](roblox_steal_collect_research.md).

Community guides consistently describe the steal as a risky transport problem: eggs are collected from guarded zones, carrying can slow the player, guardians can interrupt the carrier, and player-owned eggs can be stolen from pens. Exact hidden probabilities and numerical values are not always officially published, so do not treat community guesses as authoritative. Example: https://steal-an-egg.robloxgamewiki.com/guide/how-to-steal-eggs/

The Reddit response is split. Some developers criticize the simplicity and virality of the formula, while some players say the simple progression plus the tension of stealing from other players is exactly what keeps them playing. That split is useful: make the game simple to understand, but more satisfying and fair than a shallow reskin. Example discussion: https://www.reddit.com/r/robloxgamedev/comments/1w266ht/why_is_steal_an_egg_so_big/

The supplied Maverick AI master-prompt guide recommends master prompts that provide dense context, clear sections, priorities, defaults, and portable instructions rather than a vague one-paragraph request. Source: https://mavgpt.ai/resources/master-prompt-guide-2026

## PRODUCT THESIS
The game has two connected economies:

1. **The field economy:** players risk time and movement to steal higher-value collectibles.
2. **The home economy:** successfully secured collectibles become passive earners, unlock upgrades, and expand future stealing capability.

The central psychological loop is:

**SEE SOMETHING VALUABLE -> DECIDE WHETHER TO RISK IT -> COMMIT TO THE CARRY -> SURVIVE THE RETURN -> SECURE IT -> FEEL THE PAYOFF -> BECOME STRONGER -> RISK MORE NEXT TIME.**

This decision loop is more important than any individual pet, egg, map, or UI feature.

## THE FIVE STATES OF A COLLECTIBLE
Every collectible must move through clear states:

1. **Available**: visible in the world and legally stealable.
2. **Carried**: attached to the player and exposed to danger.
3. **Dropped / contested**: temporarily recoverable after interruption.
4. **Secured**: safely delivered to the player's plot or vault.
5. **Hatched / converted**: transformed into a persistent collection item with economic value.

The player must always be able to understand which state an item is in.

## CORE GAME LOOP
Implement this exact structural rhythm:

**1. Scout**
Player sees several collectible targets at different risk levels.

**2. Commit**
Player interacts with a target to pick it up.

**3. Carry**
The collectible becomes visible, movement changes, and the player has a clear return objective.

**4. Threat**
NPC guardians, map hazards, limited route choices, or other players create pressure.

**5. Return**
Player reaches a secure delivery point.

**6. Secure**
Delivery is confirmed with strong visual, audio, and UI feedback.

**7. Hatch**
Player opens the collectible and receives a creature or valuable object.

**8. Earn**
The resulting collection produces passive or active income.

**9. Upgrade**
Cash improves speed, capacity, routes, protection, hatch potential, or base functionality.

**10. Re-enter**
The player is immediately shown a better target that is now within reach.

Never let the loop end at the hatch. The hatch must create the reason to steal again.

## FIRST 5 MINUTES
Design the first session like this:

0:00-0:15: player spawns inside a tiny readable personal plot and sees a single obvious target route.

0:15-0:45: player performs their first basic theft.

0:45-1:00: player experiences a simple chase or escape condition.

1:00-1:30: player delivers the item and immediately receives a hatch reward.

1:30-2:30: pet/object begins generating income and the player buys the first movement or plot upgrade.

2:30-3:30: a better target becomes visible and clearly requires the new upgrade.

3:30-5:00: player is exposed to another player stealing, defending, or contesting a collectible.

At 5 minutes, the player should understand the entire reason to keep playing.

## THE STEAL MECHANIC
Stealing is the main feature, not a side activity.

For every steal target define:
- value;
- visual rarity;
- location;
- guard level;
- carry weight;
- movement penalty;
- escape difficulty;
- expected return time;
- expected income after hatch;
- failure consequence;
- counterplay available to the victim or owner;
- creator-content potential.

The game must make stealing feel different depending on the target.

A common item should be:
- easy to recognize;
- low risk;
- fast to carry;
- useful for early progression.

A rare item should be:
- visually obvious from a distance;
- harder to access;
- slower or more awkward to transport;
- more valuable;
- dangerous enough to create a memorable chase;
- still realistically recoverable through skill.

## CARRYING MUST CHANGE THE PLAYER
When an item is carried:
- the item is visibly attached to the character;
- the carrier has a clear silhouette;
- movement becomes intentionally different;
- the return direction is obvious;
- other players can understand that a steal is happening;
- audio or VFX communicate escalating danger;
- the player cannot hide the fact they are carrying something valuable.

Do not make carrying a normal walk with a UI marker. The carry state is the game's most important social state.

## WEIGHT AND SPEED
Use weight as a core risk variable.

Recommended model:

`effective_speed = base_speed * upgrade_multiplier * temporary_buffs * weight_multiplier`

Where `weight_multiplier` gets lower as the collectible becomes heavier.

Do not make the penalty linear forever. Add soft caps so the highest-value items are risky without becoming frustratingly slow.

Speed progression must create new reachable targets, not merely make the same route faster.

## PLAYER-TO-PLAYER THEFT
Player theft should create conflict without becoming oppressive.

Required behavior:
- players can identify exposed collectibles;
- players can attempt a steal through a readable interaction;
- the carrier has a reasonable chance to escape;
- a stolen collectible can become temporarily contested;
- there is a clear recovery path;
- repeated griefing is limited;
- protected zones exist around the final delivery point if needed for fairness.

Prefer simple interaction states such as:

**approach -> interact -> contest -> carrier escapes or drops -> recovery -> secure**

Do not create complicated combat systems. The interaction is about positioning, timing, route choice, and risk.

## NPC GUARDIANS
Each destination zone should have a guardian concept.

A guardian must teach one simple lesson:
- patrol timing;
- line-of-sight;
- route selection;
- acceleration;
- obstacle avoidance;
- risk estimation.

Guardians should not require the player to memorize complex AI behavior.

Their purpose is to make the act of carrying an item more exciting.

## ROUTE DESIGN
Build routes around choices rather than corridors.

For each zone create:
- a fast dangerous route;
- a slower safe route;
- one shortcut unlocked by progression;
- one high-risk/high-value area;
- at least one natural place where another player can intercept.

The player should be making decisions while carrying.

Do not make the safest route optimal in every situation.

## TARGET SPAWNING
Collectibles must appear in the world as visible opportunities.

Use several rarity bands with weighted spawn pools.

Each spawn cycle should have:
- common targets that ensure constant activity;
- medium targets that reward active searching;
- rare targets that create competition;
- a tiny chance for server-wide headline events.

When a rare target appears, use a server-wide announcement and visual signal so players immediately understand that something special exists.

Avoid hidden systems that make the game feel random without explanation.

## RESET / WORLD CYCLE
The world should refresh frequently enough that players constantly have new decisions.

Use a configurable cycle such as:
- normal spawn period;
- short reset moment;
- refreshed target pool;
- optional rare-event roll.

Do not hard-code one exact interval. Put all timing in configuration.

## HATCHING
Hatching is the payoff, but it must not replace stealing as the main gameplay.

The reveal should have three layers:

**Layer 1: immediate suspense**
Egg/object visibly shakes, lights, changes sound, or behaves differently.

**Layer 2: rarity reveal**
The rarity tier is shown.

**Layer 3: identity reveal**
Creature/item name, income, size, variant, and collection status appear.

Keep the reveal fast enough that players can immediately return to stealing.

## RARITY MODEL
Build a readable hierarchy.

Launch with 6 tiers maximum. Use original names.

Example structure:
- Basic
- Curious
- Rare
- Mythic
- Relic
- Apex

These are placeholders. You must invent the final naming scheme.

Rarity must be separate from variant.

A collectible should be able to combine:
- base rarity;
- size class;
- visual variant;
- special event trait.

This creates rare combinations without requiring dozens of base species.

## VARIANTS
Use variants as the long-tail collection chase.

Example categories:
- size;
- finish/material;
- aura;
- seasonal pattern;
- environmental trait.

Variants must be visually obvious and economically understandable.

Never rely on hidden statistical differences to create value. Show the player what makes the collectible special.

## COLLECTION INDEX
The index is a major retention system.

For every discovered collectible show:
- silhouette when unknown;
- name after discovery;
- rarity;
- income;
- variant information;
- first-discovered or owned state;
- collection completion progress.

Give rewards for collection milestones.

The index should answer the question:

**"What am I stealing next?"**

## PASSIVE INCOME
Secured creatures/items should earn currency while placed in the player's collection area.

The income engine should be intentionally easy to understand:

`income_per_second = base_income * rarity_multiplier * variant_multiplier * upgrade_multiplier`

Use configuration tables for all values.

Prevent runaway exponential inflation. Each progression band must have an intended time-to-next-upgrade.

## BASE / PEN / VAULT
The personal base is the reward storage and social flex area.

It needs:
- obvious entry and exit;
- visible collectible displays;
- income indicators;
- upgrade stations;
- safe storage of secured items;
- a clear stealable/unstealable distinction;
- a reason for other players to look at it.

Allow customization later, but do not let decorative complexity obscure the game's economy.

## BASE RAID DESIGN
Raiding must be readable and fair.

A player should be able to see:
- whether an item is secured;
- whether it is vulnerable;
- who owns it;
- what the intruder is trying to do;
- when the owner has a chance to respond.

Avoid irreversible losses that wipe hours of progress.

A stolen unhatched collectible can be lost. Core permanent progression should be protected.

## DEFENSE
Use defense as a positioning system, not as a complex combat game.

Possible systems:
- short lockout after a successful delivery;
- proximity alert;
- temporary barrier;
- alarm route;
- decoy slot;
- cooldown-based protection;
- one emergency recovery action.

Do not create an impenetrable base. The best defense is reducing exposure and choosing when to leave the field.

## RISK / REWARD FORMULA
Every steal must have an implied calculation:

`expected_value = reward_value * success_probability - failure_cost`

The player should make different choices based on their current progression.

Examples:
- low-level player: many safe small steals;
- mid-level player: target medium/high-value steals;
- advanced player: hunt limited rare spawns and contested targets.

## COMEBACK DESIGN
A player who loses one expensive steal should immediately understand:
- why they lost;
- what they could have done differently;
- what they can safely steal now;
- what upgrade will reduce that risk.

Never let a single failed steal create a death spiral.

## REBIRTH / PRESTIGE
Optional. Add only after the core loop is fun.

If used, rebirth should:
- reset temporary economic progress;
- grant permanent prestige benefits;
- unlock new stealing routes or content;
- create visible status.

Do not use rebirth simply to force the player to repeat boring work.

## SOCIAL SERVER DESIGN
Use compact servers, around 5 to 8 players, unless testing demonstrates another size is superior.

The shared area should make players naturally notice:
- rare targets;
- carriers;
- successful deliveries;
- high-value collections;
- event announcements.

Players should regularly witness other players doing something interesting.

## VIRAL MOMENT ENGINE
The game should naturally generate moments such as:
- stealing a very rare target;
- nearly escaping with a rare target;
- losing a rare target at the last second;
- stealing from a high-level player's base;
- recovering a stolen target;
- discovering an ultra-rare variant;
- a server-wide rare spawn;
- an unexpected shortcut;
- a comeback after a bad run.

Every one of these should be understandable from a short clip.

## YOUTUBE / SHORT-FORM DESIGN
Every high-value system must have a content premise.

Build for thumbnails and 10-second clips:
- large readable collectibles;
- exaggerated rarity colors and silhouettes;
- clear chase states;
- obvious value numbers;
- instant success/failure feedback;
- server announcements for major discoveries.

Do not require a narrator to explain the game.

## MONETIZATION
Monetization must not invalidate stealing.

Prefer:
- cosmetics;
- base themes;
- trails;
- emotes;
- visual hatch effects;
- collection display upgrades;
- limited convenience that does not create unbeatable advantage.

Avoid pay-to-win theft, permanent immunity, purchased wins, deceptive random purchase odds, or systems that make free progress unreasonable.

Any paid random reward system must be evaluated against current Roblox rules and age-appropriate platform requirements. Prefer transparent direct purchases.

## ECONOMY TARGETS
Create a spreadsheet-style configuration table with:
- collectible rarity;
- spawn weight;
- base income;
- carry weight;
- movement penalty;
- average time-to-steal;
- average time-to-return;
- hatch value;
- upgrade cost;
- intended unlock time.

Do not spread balance numbers through scripts.

## MVP CONTENT TARGET
Build an MVP with:
- 30 to 50 original collectible designs;
- 5 or 6 rarity tiers;
- 3 steal zones;
- 5 to 8 players per server;
- 1 personal base per player;
- NPC guardians;
- player-to-player stealing;
- carrying and contested-drop states;
- hatching;
- passive income;
- speed progression;
- base progression;
- collection index;
- one rare server event;
- one launch live-ops event;
- analytics for every major loop step.

## TECHNICAL ARCHITECTURE
Use a modular Roblox architecture.

Suggested structure:

ServerScriptService/
- Services/
  - PlayerDataService
  - EconomyService
  - InventoryService
  - CollectibleService
  - SpawnService
  - CarryService
  - TheftService
  - GuardianService
  - HatchService
  - PlotService
  - UpgradeService
  - EventService
  - AnalyticsService
  - MonetizationService
- ServerBootstrap.server.lua

ReplicatedStorage/
- Shared/
  - Config/
  - Types/
  - Utility/
- Remotes/
- Assets/

StarterPlayer/StarterPlayerScripts/
- ClientController
- CarryController
- UIController
- InputController

StarterGui/
- HUD
- HatchUI
- CollectionUI
- UpgradeUI
- EventUI

Workspace/
- World
- Zones
- PlayerPlots
- SpawnPoints

ServerStorage/
- Collectibles
- NPCs
- Maps

Names can differ, but responsibilities must remain separated.

## SERVER AUTHORITY
The client must never decide:
- collectible ownership;
- rarity outcomes;
- income grants;
- theft success;
- inventory changes;
- purchase rewards;
- upgrade unlocks;
- protected-state changes.

Validate every remote request server-side.

Use server-side timestamps and state transitions for theft/carrying.

Make every currency and inventory transaction idempotent where practical.

Rate-limit remote interactions.

Log suspicious sequences such as impossible movement, repeated invalid theft attempts, or impossible delivery timing.

## DATA MODEL
Persist at minimum:
- schema_version;
- currencies;
- owned collectibles;
- collection discoveries;
- equipped/displayed items;
- upgrades;
- unlocked zones;
- prestige state;
- plot customization;
- settings;
- tutorial progress.

Use DataStoreService with:
- validation;
- retry logic;
- schema migrations;
- safe shutdown saving;
- periodic autosaves;
- protections against duplicate writes and partial failure.

## DEBUG / OBSERVABILITY
Create debug commands available only to authorized developers for:
- spawning a target;
- forcing a rarity;
- forcing a variant;
- resetting a test inventory;
- teleporting to zones;
- simulating a steal;
- simulating a rare event;
- checking economy state.

Do not expose these commands to normal players.

## ANALYTICS
Track:
- tutorial completion;
- time to first theft;
- time to first delivery;
- time to first hatch;
- first upgrade;
- average steals per session;
- failed steals;
- successful player raids;
- stolen-back events;
- average carried value;
- average return duration;
- highest rarity attempted;
- highest rarity successfully secured;
- session length;
- D1/D7 retention;
- event participation;
- monetization conversion.

Use analytics to answer one question:

**Where does the steal loop stop being exciting?**

## UX RULES
- The next steal target is always visually obvious.
- The current carrier state is always visible.
- The return destination is always obvious.
- Rare objects stand out from common objects.
- The game can be played on mobile without precision mouse input.
- Carrying uses simple controls.
- Inventory uses large readable cards.
- Do not bury critical information in menus.
- Every major event gets clear feedback.
- Never make the player wonder whether a steal succeeded.

## MOBILE
Design mobile-first:
- large interaction buttons;
- minimal simultaneous controls;
- automatic target highlighting;
- readable world markers;
- no hover-dependent mechanics;
- safe UI margins;
- low-cost VFX.

## PERFORMANCE
The target must remain responsive on lower-end mobile devices.

Use:
- streaming where appropriate;
- pooled effects;
- low-cost NPC logic;
- throttled distance checks;
- limited replicated state;
- simple meshes for distant objects;
- server-side validation without expensive per-frame loops.

## ORIGINALITY REQUIREMENTS
Do not copy:
- the title "Steal An Egg";
- its logo;
- its exact egg designs;
- its pets or creature models;
- exact rarity names as a set;
- exact map layout;
- exact UI arrangement;
- exact animations;
- exact sounds;
- exact promotional screenshots;
- exact written descriptions;
- exact numerical balance.

You may reproduce high-level design concepts such as stealing a collectible, carrying it home, hatching, passive income, speed progression, player interference, rarity, and variants.

## AI EXECUTION PROTOCOL
Do not simply describe the game. Build it.

Work in these phases:

### Phase 1: Product Design
Output:
- final game concept;
- original theme;
- one-sentence pitch;
- player fantasy;
- complete gameplay state machine;
- core loops;
- progression map;
- content taxonomy;
- economy tables;
- map structure;
- UX flows.

### Phase 2: Technical Design
Output:
- exact folder tree;
- data schemas;
- service responsibilities;
- RemoteEvent/RemoteFunction contracts;
- server/client boundaries;
- configuration modules;
- failure handling;
- exploit protections.

### Phase 3: Implementation
Write production-ready Luau for the MVP.

Do not provide pseudocode when real Luau is reasonably possible.

For each script:
- state its path;
- provide the full code;
- explain dependencies in one or two sentences;
- keep modules cohesive;
- centralize configuration.

### Phase 4: Playtest Simulation
Simulate at least these cases:
1. new player steals a common target;
2. new player fails a steal;
3. player carries a heavy rare target;
4. guardian intercepts carrier;
5. another player contests carrier;
6. player secures a rare target;
7. player hatches an ultra-rare variant;
8. server rare spawn occurs;
9. player disconnects while carrying;
10. server shuts down during a transaction;
11. duplicate purchase receipt arrives;
12. exploit attempt sends impossible theft request.

For each, state expected server state before and after.

### Phase 5: Balance Pass
Run a reasoned economy simulation.

Show:
- time to first upgrade;
- time to second zone;
- average income per minute;
- target value bands;
- expected failure cost;
- progression speed for casual players;
- progression speed for highly active players.

Adjust values if the player is likely to stall or snowball.

### Phase 6: Launch Readiness
Return:
- MVP completion checklist;
- known risks;
- analytics events;
- launch KPIs;
- first 4 weekly updates;
- one major event;
- creator-content hooks;
- post-launch tuning plan.

## DECISION RULES
When uncertain, choose the option that:
1. makes stealing more interesting;
2. increases clarity;
3. gives the carrier meaningful choices;
4. creates readable social interaction;
5. avoids irreversible frustration;
6. keeps the code modular;
7. improves content scalability;
8. stays original.

Do not ask unnecessary clarifying questions. Make reasonable assumptions, state them, and continue.

## DEFINITION OF DONE
The game is not done when the scripts run.

It is done when a new player can:
- understand the goal within seconds;
- steal within one minute;
- experience risk while carrying;
- deliver and hatch;
- earn money;
- buy an upgrade;
- see a better target;
- witness or participate in another player's steal;
- understand why they want to try again.

The central quality test is:

**"After successfully stealing one valuable collectible, does the player immediately want to know what they can steal next?"**

If the answer is no, redesign the loop before adding more content.
