# Roblox studio, brand, and launch research

Research document for a steal-and-collect style Roblox experience: account architecture,
studio philosophy, the Creator Dashboard page, branding, launch, community, analytics,
monetization, and the operating system around the game. Research date: 7 October 2026.

**This markdown file is the version to use.** Its `.docx` twin
(`roblox_studio_brand_account_page_launch_research.docx`) is the original Word export, kept
alongside it for reference; the two are not maintained in parallel.

**The prompt it produces** is
[`roblox_studio_brand_account_page_launch_master_prompt.md`](roblox_studio_brand_account_page_launch_master_prompt.md).
The game-design side of the kit is [`roblox_game_master_prompt.md`](roblox_game_master_prompt.md)
and [`roblox_steal_an_egg_focused_master_prompt.md`](roblox_steal_an_egg_focused_master_prompt.md).

**Platform rules date fastest of all.** Anything here that quotes a Roblox limit, policy, or
discovery rule is a snapshot from the research date; Roblox changes those, and the master
prompt is written to make the model verify them against current Creator Hub documentation
instead. Treat the platform numbers in this document as leads to check, not as current facts.

## 1. Executive Summary

For a steal-and-collect Roblox game, the surrounding system should be designed around one promise: players can immediately understand what they can steal, why a stolen item is valuable, what can go wrong while carrying it home, and why they should come back tomorrow. Roblox’s current discovery documentation makes this even more important because recommendation is driven by post-discovery behavior, including play-through, bounce, repeat play days, playtime, intentional co-play, qualified sessions, and spending behavior. Accurate metadata and distinctive presentation are part of the same system, not separate polish work. (Roblox Discovery)

| Layer | What it must accomplish | Failure mode to avoid |
|---|---|---|
| Account | Protect ownership, identity, permissions, and revenue access. | One-person credential sharing, weak security, unclear ownership. |
| Studio / Group | Create a durable home for the IP and team. | Game owned by a personal account with no operational structure. |
| Studio project | Make rapid iteration safe and understandable. | Monolithic scripts, hard-coded tuning, secrets in code, no test discipline. |
| Brand | Make the game recognizable in one second. | Generic name, copied visual identity, inconsistent socials. |
| Experience page | Convert an impression into a qualified play. | Thumbnail promises a different game than the actual loop. |
| Launch | Create a controlled first wave and learn from it. | Buying large traffic before onboarding and retention work. |
| LiveOps | Give existing players reasons to return. | Updates that add content but not new decisions or stories. |
| Analytics | Turn player behavior into product decisions. | Tracking vanity metrics while ignoring D1, D7, bounce, and source quality. |
| Community | Turn players into testers, advocates, and storytellers. | Community used only for announcements or giveaways. |
| Monetization | Capture value without damaging trust. | Pay-to-win theft advantages that destroy the core competitive loop. |

## 2. The Philosophy Behind the Entire Project

### 2.1 Build the product, not just the game

A Roblox experience has at least four products inside it: the playable game, the discovery surface, the creator brand, and the live operating system. A great game with a weak page can fail to get enough qualified plays. A great page with a weak first five minutes can create impressions and bounces. A good launch with no live operations can create a spike and then decay.

### 2.2 Design for Roblox’s strengths

Roblox describes three platform strengths that matter here: content variety, low friction to start playing, and social connection. A steal-and-collect game should therefore start quickly, use familiar interaction patterns, and make the important outcomes visible to nearby players. Roblox explicitly recommends intuitive visual UI patterns and reducing friction in the first minutes of play. (Roblox user base and Design for Roblox)

- One-second fantasy: “There is a rare thing over there, and I can take it.”

- Ten-second understanding: “Carry it safely back to my base before another player interferes.”

- One-minute proof: the player successfully steals or secures something and gets a visible reward.

- Five-minute hook: the player sees the next rarity, upgrade, mutation, base improvement, or risky target.

- Seven-day reason: there are new targets, evolving collection goals, events, and social stories worth returning for.

## 3. Account and Ownership Architecture

Roblox supports both user-owned and group-owned experiences. Group ownership is specifically designed to let creators collaborate, share assets and profits, and operate as an independent studio. If several people will work on the game, a group-owned structure is usually the cleaner long-term architecture because permissions and the game’s operational identity live at the studio level. Roblox currently charges 100 Robux to create a group and allows group roles and permissions to be managed from the Creator Dashboard. (Roblox Groups)

| Structure | Best use | Advantages | Risks |
|---|---|---|---|
| User-owned | Solo prototype or very small hobby project. | Simple, fast, no extra group administration. | Ownership and operational responsibility stay tightly coupled to one account. |
| Group-owned studio | Serious live game, collaborators, contractors, or a long-lived IP. | Central ownership, roles, audit logs, revenue controls, group branding. | Requires permission management and clear internal agreements. |

> **Recommended studio principle** — The account is the security root. The group is the studio. The experience is the product. The game assets are the IP. Keep those concepts separate even when one person currently controls all of them.

### 3.1 Account security baseline

- Enable 2-Step Verification and use a strong account-recovery setup. Roblox currently supports authenticator-app and security-key options in addition to other verification flows. (Roblox Support)

- Do not share the owner password with artists, scripters, marketers, or contractors. Use group roles and Studio collaboration permissions instead.

- Use least privilege. A person who only needs to edit a game should not automatically receive authority over group revenue, roles, or sensitive resources.

- Turn on appropriate group protections and review audit logs. Roblox specifically exposes group activity history and permissions for operational oversight.

- Never place API keys, passwords, access tokens, or external-service secrets in public source code, replicated objects, or normal data stores. Roblox provides Secrets Store and recommends minimum-scope keys. (Secrets Store, API Keys)

## 4. Roblox Studio Project Philosophy

The project should be structured so that a new contributor can understand where gameplay lives, where tuning lives, what is server-authoritative, what is client-side presentation, and which systems persist data. Roblox Studio supports live collaboration and version history, but good tooling does not replace good architecture. (Roblox Collaboration)

| Area | Recommended responsibility |
|---|---|
| ReplicatedStorage | Shared modules, constants, remotes, definitions that are safe for clients to know. |
| ServerScriptService | Authoritative gameplay logic, theft validation, economy, inventory security, anti-exploit checks, persistence orchestration. |
| ServerStorage | Server-only assets and templates that should not replicate until needed. |
| StarterPlayer / StarterGui | Client controllers, UI, input, local presentation, camera behavior. |
| Workspace | Actual runtime world, spawn points, bases, egg targets, interaction volumes, map content. |
| Lighting / SoundService | Presentation systems, ambience, global visual and audio settings. |
| ConfigService | Live-tunable values such as rarity odds, prices, timers, event toggles, and balance variables. Roblox supports updating configs without restarting servers. |
| DataStoreService | Persistent player progression and owned inventory, designed around safe, retry-aware writes. |
| Secrets Store | API keys, passwords, access tokens, and other sensitive external-service credentials. |

> **Architecture rule for a theft game** — The client can request a steal, but the server decides whether the steal actually happened. The client can show the carrying animation, but the server owns the item state, ownership state, rewards, cooldowns, and final inventory.

### 4.1 Configuration philosophy

Avoid hard-coding balancing numbers across scripts. Use a central configuration layer for egg prices, rarity weights, movement modifiers, carry limits, steal cooldowns, protection timers, rebirth requirements, and event multipliers. Roblox’s Experience Configs are specifically intended for real-time tuning and timed content without republishing a new game version. (Experience Configs)

## 5. Brand Identity and Studio Naming

The brand should be recognizable before a player reads the title. This does not mean a giant logo everywhere. It means repeated visual language: a consistent type style, icon silhouette, color logic, character/creature shape language, and tone across the Roblox page, group page, YouTube, short-form clips, update graphics, and in-game UI.

| Brand asset | Rule for this project |
|---|---|
| Studio name | Short, pronounceable, easy to type, not a near-copy of another Roblox creator. |
| Experience name | Simple enough to understand in one glance, distinctive enough not to be confused with existing games. |
| Logo | Readable at small size, works as a group icon, watermark, and social avatar. |
| Game icon | One high-impact symbol or character communicating the fantasy. Avoid tiny details. |
| Thumbnail language | Show an actual theft or high-value collection moment, not generic character posing. |
| UI identity | Use the same icon language and color logic as the marketing assets. |
| Video identity | Actual gameplay, consistent framing, recognizable effects and vocabulary. |

## 6. The Roblox Experience Page

Roblox’s current discovery guidance is explicit: metadata should be accurate, unique, and aligned with the actual experience. Misleading metadata, giveaway-led titles, and games whose metadata/place files closely resemble existing experiences can reduce exposure. The Game Details Page is intended to help high-intent players understand the experience and make a decision. (Roblox Discovery)

### 6.1 Title philosophy

- Make the core fantasy identifiable without requiring the player to decode slang or lore.

- Do not stuff unrelated keywords into the title.

- Do not lead with Robux, giveaways, or monetization claims.

- Do not choose a name because it looks like a competitor’s name.

- Prefer a title that can become the name of a YouTube series, update event, and community brand.

### 6.2 Description formula

For this genre, the description should answer five questions in order: What do I steal? What do I do with it? What can go wrong? What can I unlock? Why should I return?

> **Page-description skeleton**
>
> STEAL rare [collectibles].
> CARRY them back before other players take them.
> BUILD your collection and upgrade your base.
> DISCOVER mutations, rarities and special targets.
> RETURN for limited events, new targets and risky steals.

### 6.3 Icon

Roblox currently recommends a square icon of at least 512×512 pixels. Icons appear prominently in Home and are a key part of recognition and brand building. Roblox recommends that the icon express the game’s theme, tone, or genre and remain clear when displayed at small sizes. (Experience Icons)

- One primary subject, not a collage.

- Strong silhouette and contrast.

- The rare collectible should be instantly recognizable.

- Design for small display first, then add detail only if it survives reduction.

- Do not make the icon look like an ad for a feature that does not exist.

### 6.4 Thumbnails

Roblox currently supports up to 10 images or videos on an experience detail page. Image thumbnails should be 16:9, ideally 1920×1080. Roblox currently allows up to 3 uploaded video thumbnails per month. Thumbnail personalization can run with 2-5 active thumbnails, and Roblox reports an average +8.5% qualified-play-through-rate improvement in its testing, with larger gains for some games. (Thumbnails)

| Thumbnail | Job | Steal-and-collect composition |
|---|---|---|
| Hero | Explain the game immediately. | Player carrying a visibly rare collectible toward a base while another player approaches. |
| Conflict | Show the social risk. | Two players contesting one extremely valuable target. |
| Rarity | Show aspiration. | Large, unusual, highly recognizable rare collectible in a clean environment. |
| Base | Show ownership. | A visibly upgraded collection/base with the player’s rare assets on display. |
| Update | Show change. | New target/event mechanic that is genuinely live in the game. |

> **Thumbnail rule** — A player should be able to describe the thumbnail aloud without knowing the game: “That person is carrying a rare thing home and someone is trying to stop them.” That is stronger than “two Roblox characters standing next to an egg.”

## 7. Complete Page Architecture

1. Icon: recognizable fantasy and studio identity.

1. Primary thumbnail: the clearest theft moment.

1. Secondary thumbnails: conflict, rarity, base, new content.

1. Title: short, memorable, relevant.

1. Description: core loop plus progression plus return reason.

1. Events and Updates: keep the page alive and communicate why a player should return.

1. Group/Community connection: establish who is behind the game and where updates are announced.

1. Social links: use only through Roblox’s supported, compliant surfaces and eligibility rules.

1. Monetization: passes/products/subscriptions that reinforce rather than replace the core loop.

1. Badges: milestones that create collection and shareable achievement value.

## 8. Group, Community and Social System

Roblox says groups are a strong way for creators to connect with and inform communities. Group roles can separately govern creation, membership, moderation, analytics, and revenue actions. Group activity history can be used to monitor changes. (Groups)

| Role | Suggested access philosophy |
|---|---|
| Owner | Highest authority. Keep this role extremely limited. |
| Technical lead | Edit game, publish within defined process, no unnecessary revenue/role authority. |
| Builder | Edit designated game content. |
| Scripter | Edit designated game code. |
| UI / Art | Edit designated visual assets. |
| Community | Moderation/community tools, not financial authority. |
| QA / Tester | Playtest access only where practical. |

Roblox currently allows up to three social links on game details pages for eligible, age-verified creators. Those links are intended to sit on Roblox’s supported game surfaces rather than be inserted directly into the experience as raw off-platform links. (Social Media Links)

## 9. Launch Philosophy

Do not start with “How many players can we buy?” Start with “What happens to the first 100 players?” Roblox’s current discovery system evaluates organic cohorts using post-click behavior. Sponsored traffic can help accelerate awareness, but the core game still needs to convert acquired players into meaningful sessions, repeat visits, co-play, and healthy monetization. (Roblox Discovery, Ads Manager)

| Stage | Primary objective | What to watch |
|---|---|---|
| Prototype | Prove theft feels exciting. | Time-to-first-steal, failed steals, player understanding. |
| Closed test | Prove the game survives multiplayer reality. | Replication, exploits, server load, economy abuse, rage quits. |
| Soft launch | Find onboarding and progression problems. | D1 retention, first-session bounce, session length, first successful steal. |
| Public launch | Scale discovery carefully. | Home impressions, qPTR, D1/D7, play days, co-play, revenue quality. |
| LiveOps | Turn spikes into durable cohorts. | Returners, event participation, source quality, update lift. |

## 10. Analytics as the Operating System

Roblox explicitly recommends using analytics to optimize retention, engagement, monetization, and acquisition. D1 measures return on the second day, D7 measures return after a week, and D30 measures longer-term return. Roblox also provides acquisition/source breakdowns and benchmark comparisons for eligible games. (Analytics)

| Metric | Question for a steal game | Likely product response |
|---|---|---|
| Play-through rate / qPTR | Does the page make the game feel worth clicking? | Improve title, icon, thumbnail clarity, audience match. |
| First-play bounce | Do people understand the steal loop fast enough? | Shorten tutorial, surface first target faster, improve UI. |
| D1 retention | Did yesterday’s players want to steal again? | Improve core loop, reward rhythm, first-day progression. |
| D7 retention | Is there enough medium-term depth? | Add collection goals, new target tiers, meaningful unlocks. |
| Playtime | Is the game satisfying after the initial novelty? | Increase meaningful decision density, not empty grind. |
| Intentional co-play | Are friends deliberately playing together? | Add co-op theft opportunities and friend-based moments. |
| Spend days / Robux per user | Does monetization feel useful enough to return to? | Improve value proposition without invalidating skill and risk. |
| Source performance | Which traffic sources create good players? | Scale sources that create retained players, not just clicks. |

> **Important current discovery detail** — Roblox’s current Recommended for You documentation says recommendation signals are based on organic Home-recommendation cohorts and are calculated as averages per user, not total values. This means a smaller game with unusually strong player behavior can compete without already having a giant player count. (Roblox Discovery)

## 11. Onboarding and First Five Minutes

Roblox describes onboarding as the first minutes of play and explicitly recommends teaching only the essentials, getting to the fun quickly, and leaving players wanting more. Roblox’s retention documentation recommends avoiding a complex or time-consuming FTUE and aiming to reach the fun in roughly five minutes or less. (Onboarding, Retention)

1. Spawn directly where the player can see a target and a route home.

1. Show one interaction cue, not a wall of instructions.

1. Let the first theft succeed quickly enough to demonstrate the fantasy.

1. Immediately reveal the reward and what it can become.

1. Expose a nearby higher-risk target so the player understands the next decision.

1. Introduce player interference only after the player understands carrying and securing.

1. End onboarding with a visible medium-term goal, such as a rare mutation, stronger base, or new target zone.

## 12. Monetization Philosophy for a Steal Game

Roblox currently supports passes, developer products, subscriptions, private servers, paid access, avatar items, and other monetization paths. Roblox also warns creators to consider player perception when choosing monetization methods because poor strategies can cause negative sentiment. (Monetization)

| Monetization | Good fit | Do not use it to… |
|---|---|---|
| Pass | Permanent convenience, extra cosmetic slots, base decoration systems, non-dominant perks. | Make stealing success effectively automatic. |
| Developer product | Temporary convenience, optional recovery, cosmetic reroll, event currency. | Sell direct competitive outcomes that erase risk. |
| Subscription | Ongoing cosmetic or community-oriented benefits for mature player groups. | Create a mandatory paywall for the basic loop. |
| Private server | Friends-only theft sessions and custom social play. | Hide core content behind a recurring fee. |

> **Economic philosophy** — The player should feel that paying buys convenience, expression, or optional acceleration, not that payment purchases the right to win the defining theft encounter.

## 13. LiveOps and Update System

Roblox’s current event system lets creators publish time-based events with thumbnails, titles, descriptions, and notifications. Published events can appear on the experience detail page, and eligible active events can be discovered through trending event surfaces. Roblox currently permits up to 10 ongoing or upcoming events, with separate criteria for trending event visibility. (Experience Events and Updates)

| Cadence | Content type | Purpose |
|---|---|---|
| Frequent | Balance, bug fixes, small target additions. | Keep the game healthy. |
| Weekly-ish | New target, mutation, base item, challenge, or limited mechanic. | Create a reason to revisit. |
| Major | New zone, theft mechanic, progression layer, event. | Create a genuine new play pattern. |
| Seasonal | Themed collection/event. | Create shared community moments and media opportunities. |

## 14. YouTube, Shorts and External Content System

The marketing concept should come from the game’s mechanics. Do not create a fake story around a mechanic that does not exist. Roblox currently requires video thumbnails to accurately portray authentic gameplay and prohibits misleading gameplay representations. (Thumbnails)

| Content format | Natural premise for this game |
|---|---|
| Short clip | “I stole the rarest target and almost lost it on the way home.” |
| Challenge | “Can we steal three high-tier targets without getting caught?” |
| Update video | “New mutation/event changed which targets are worth risking.” |
| Collection reveal | “We finally completed this rarity set.” |
| Social story | “A server-wide race started when one rare target spawned.” |

## 15. Performance and Device Philosophy

Roblox emphasizes low-friction play across a wide range of devices. The current performance guidance recommends choosing a baseline low-end device, testing throughout development, and using instance streaming where appropriate. Roblox also recommends real-device testing for thermal behavior and network conditions. (Design for Performance, Test on Hardware)

- Design the theft loop so it remains understandable and responsive on mobile.

- Keep high-value collectibles visually obvious without filling the map with excessive geometry.

- Treat pickup/carry/drop states as performance-sensitive because they may be occurring repeatedly across many players.

- Use streaming for larger environments when appropriate.

- Test on actual mobile hardware and constrained network conditions, not only a development PC.

- Monitor crashes, memory, FPS, and server behavior after each meaningful update.

## 16. Localization and Global Readability

Roblox automatically translates game names, descriptions, and in-game text for users who have Automatic Translations enabled. Manual translations override automatic ones when present. Visual UI is especially valuable because it reduces translation burden and improves comprehension across audiences. (Localization, Design for Roblox)

- Use short UI labels and icons.

- Avoid putting essential instructions into long paragraphs.

- Design rarity states visually, not only with text labels.

- Keep names and messages localization-friendly.

- Use manual translation once the game has proven which languages materially improve the experience.

## 17. Safety, Moderation and IP Philosophy

Roblox treats creator safety as part of experience design. For this project, keep player interaction competitive without encouraging harassment, scams, impersonation, or unsafe user-generated content. Roblox’s safety guidance emphasizes proactive design choices and moderation controls. (Roblox Safety)

- Build theft as an explicit game mechanic, never as a real-world fraud metaphor or social-engineering system.

- Avoid mechanics that require players to reveal passwords, personal information, or external credentials.

- Use original names, characters, icons, thumbnails, maps, and marketing assets. Borrow the high-level gameplay pattern, not another game’s protected identity or assets.

- Moderate any player-generated content and keep reporting and moderation flows operational.

- Never use bots, fake engagement, alt accounts for rewards, or other artificial growth schemes. Roblox explicitly prohibits artificial or automated activity within Creator Rewards.

## 18. Operating the Project with an AI Agent

The supplied Maverick AI guide recommends using a reusable master prompt that captures context, goals, priorities, preferences, constraints, and working style. For a Roblox studio, the same architecture is more useful when adapted from a personal context file into a persistent product context file: the game thesis, audience, design rules, technical architecture, page system, brand rules, analytics, monetization, and launch principles. (Maverick AI, 8 July 2026)

| AI context layer | What to store |
|---|---|
| Identity | Studio name, game name, genre, one-sentence fantasy, audience. |
| Game thesis | Core loop, steal states, progression, economy, social mechanics. |
| Brand | Tone, visual language, naming rules, icon rules, thumbnail rules. |
| Technical | Folder structure, server/client ownership, data model, config system, security rules. |
| Growth | Discovery goals, acquisition sources, content strategy, page experiments. |
| Analytics | North-star metrics, thresholds, dashboards, experiment log. |
| LiveOps | Update cadence, events, seasonal framework, rollback rules. |
| Constraints | Roblox policy, originality, performance, safety, budget, team capacity. |
| Decision rules | What to optimize first and what to refuse even if it boosts short-term numbers. |

## 19. Studio + Launch Master Prompt

The standalone Markdown file delivered with this document contains the full reusable prompt. The following is the operating specification it is built around.

> **AI operating identity** — You are the senior Roblox product strategist, game designer, technical lead, growth operator, creative director, and live-operations planner for a steal-and-collect Roblox studio. Your job is to maximize long-term player value and sustainable discovery, not to imitate an existing game mechanically or visually.

- Always distinguish verified Roblox platform facts from design assumptions.

- Use official Roblox documentation for platform rules, limits, monetization, publishing, and discovery claims.

- Never recommend fake engagement, bots, alt-account reward manipulation, misleading metadata, or copied assets/branding.

- For every proposed feature, state its player benefit, risk, technical cost, content cost, and expected effect on retention or social play.

- When evaluating the experience page, optimize the conversion chain: impression -> click -> first minute -> first successful steal -> return visit.

- Prefer simple core mechanics with rich content and meaningful player decisions over mechanic sprawl.

- Treat every major update as both a gameplay release and a discovery/content moment.

- Keep the player’s defining fantasy intact: risk, ownership, scarcity, theft, protection, and reward.

## 20. Final Pre-Launch Checklist

| Check | Pass condition |
|---|---|
| Ownership | Correct creator/group owns the experience and key assets. |
| Security | 2SV enabled; roles least-privilege; secrets protected. |
| Project | Server/client responsibilities clear; configs centralized; persistence tested. |
| Core loop | New player can steal and secure something quickly. |
| Page | Title, description, icon, and thumbnails all describe the same actual game. |
| Visuals | Icon and thumbnails are legible at small size and distinct from competitors. |
| Onboarding | First five minutes teach only essentials and reach the defining fun quickly. |
| Performance | Mobile and lower-end testing completed; memory/FPS/network behavior acceptable. |
| Analytics | Retention, engagement, acquisition, monetization, and cohort views configured. |
| Launch | A controlled acquisition plan exists; ads are not being used to hide a broken FTUE. |
| Community | Announcement, feedback, bug-report, and moderation processes exist. |
| LiveOps | At least the first update/event cycle is designed before launch. |
| Originality | Game identity, naming, art, copy, and marketing are independently created. |

## Sources and Current-Platform References

This document was researched against Roblox Creator Hub and Roblox Support material available in October 2026. Platform rules, UI labels, discovery systems, limits, and monetization programs can change, so re-check the linked official documentation immediately before launch or any major change.

- Roblox Creator Hub, Discovery: https://create.roblox.com/docs/discovery

- Roblox Creator Hub, Experience Icons: https://create.roblox.com/docs/production/publishing/experience-icons

- Roblox Creator Hub, Thumbnails: https://create.roblox.com/docs/production/publishing/thumbnails

- Roblox Creator Hub, Experience Events and Updates: https://create.roblox.com/docs/production/promotion/experience-events

- Roblox Creator Hub, Groups (teams): https://create.roblox.com/docs/projects/groups

- Roblox Creator Hub, Collaboration: https://create.roblox.com/docs/projects/collaboration

- Roblox Creator Hub, Create and publish games and places: https://create.roblox.com/docs/production/publishing/publish-games-and-places

- Roblox Creator Hub, Analytics: https://create.roblox.com/docs/production/analytics

- Roblox Creator Hub, Get started with analytics: https://create.roblox.com/docs/production/analytics/get-started

- Roblox Creator Hub, Onboarding: https://create.roblox.com/docs/production/game-design/onboarding

- Roblox Creator Hub, Ads Manager: https://create.roblox.com/docs/production/promotion/ads-manager

- Roblox Creator Hub, Creator Rewards: https://create.roblox.com/docs/creator-rewards

- Roblox Creator Hub, Social media links: https://create.roblox.com/docs/production/promotion/social-media-links

- Roblox Creator Hub, Localization: https://create.roblox.com/docs/production/localization

- Roblox Creator Hub, Design for performance: https://create.roblox.com/docs/performance-optimization/design

- Roblox Creator Hub, Secrets stores: https://create.roblox.com/docs/cloud-services/secrets

- Roblox Creator Hub, Manage API keys: https://create.roblox.com/docs/cloud/auth/api-keys

- Roblox Creator Hub, Safety: https://create.roblox.com/docs/safety

- Roblox Support, 2-Step Verification: https://en.help.roblox.com/hc/en-us/articles/212459863-Add-2-Step-Verification-to-Your-Account

- Maverick AI, Build Your Master Prompt, July 8 2026: https://mavgpt.ai/resources/master-prompt-guide-2026
