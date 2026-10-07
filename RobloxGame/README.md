# Roblox game design kit

Research and master prompts for designing and building an **original** Roblox
steal-and-collect game — the *Steal An Egg* / *Steal a Brainrot* pattern studied
as a product, then rebuilt as something new.

There is **no code in this folder**. These are documents to hand to an AI (or to
a person): three master prompts, and the research each one is built on.

## Which file to use when

| File | Reach for it when |
|---|---|
| [`roblox_game_master_prompt.md`](roblox_game_master_prompt.md) | You are starting from nothing. It makes the model invent and specify the game — concept, loop, economy, architecture, output contract — before writing any code. |
| [`roblox_steal_an_egg_focused_master_prompt.md`](roblox_steal_an_egg_focused_master_prompt.md) | You have already decided it is a steal-and-collect game and want depth: the five states of a collectible, the carry mechanic, weight and speed, guardians, routes, hatching, rarity, base raids, and the Luau build in six phases. |
| [`roblox_studio_brand_account_page_launch_master_prompt.md`](roblox_studio_brand_account_page_launch_master_prompt.md) | The game is being built and you need everything around it: account and group ownership, Studio project structure, the experience page and its metadata, icons and thumbnails, onboarding, community, analytics, monetization, live-ops, performance, safety, and launch order. |
| [`roblox_steal_collect_research.md`](roblox_steal_collect_research.md) | The brief behind the general prompt: market evidence, cross-game design principles, the recommended original concept, MVP scope, risks. |
| [`roblox_steal_an_egg_focused_research.md`](roblox_steal_an_egg_focused_research.md) | The brief behind the focused prompt: one game's interaction design taken apart in detail. |
| [`roblox_studio_brand_launch_research.md`](roblox_studio_brand_launch_research.md) | The brief behind the studio/launch prompt: page conversion, branding, discovery signals, launch sequence. |

The three `.docx` files are the original Word exports of the three research
documents. **The markdown versions are the ones to use** — they are readable by
any tool, and they are the copies that get corrected. The `.docx` files are kept
as provenance, and the two are not maintained in parallel.

## How to use it

1. **Pick one prompt, not all three**, and attach the research file it names on
   its own second line. The prompts reference their brief by filename, so a
   prompt without its research is missing half its context.
2. **Ask for one phase at a time.** The general and focused prompts both run in
   phases and both say not to start coding before the Product Requirements
   Document is internally consistent. Asking for the whole game in one message is
   the fastest way to get a shallow answer.
3. **Expect the model to state assumptions** rather than interview you — all
   three prompts instruct it to make reasonable assumptions and continue.
4. **Keep the platform questions current.** The launch prompt explicitly tells
   the model to check current Roblox Creator Hub and Support documentation before
   quoting any limit, policy, or discovery rule, because those change. Nothing
   written in this folder is a substitute for that check.

A sensible full sequence, if you want to use all three:

| Step | Attach | Paste | Ask for |
|---|---|---|---|
| 1 | `roblox_steal_collect_research.md` | `roblox_game_master_prompt.md` | Phase 1 only — the Product Requirements Document |
| 2 | `roblox_steal_an_egg_focused_research.md` | `roblox_steal_an_egg_focused_master_prompt.md` | Phases 1–3 — the loop, the economy, then the Luau |
| 3 | `roblox_studio_brand_launch_research.md` | `roblox_studio_brand_account_page_launch_master_prompt.md` | The page, the brand, and the launch plan |

## What was cleaned up in this folder

So that the kit can be used as-is, the following were corrected. Each is the
kind of thing that makes a prompt set quietly unusable rather than obviously
broken.

- **The generic master prompt had no markdown structure.** Its section labels
  (`ROLE`, `MISSION`, …) were bare capitals in a wall of text, unlike the other
  two prompts. They are now `## SECTION` headings, the same shape the other two
  use. No wording changed.
- **The master prompt asked for "the attached research document".** There are
  three research documents in the folder and no way to tell which was meant. It
  now names [`roblox_steal_collect_research.md`](roblox_steal_collect_research.md).
- **The same master prompt existed twice.** `roblox_game_master_prompt.md` was a
  verbatim copy of section 14 of the research dossier, so editing one would
  silently leave the other stale. Section 14 now keeps its provenance note and
  points at the prompt file, which is the single copy.
- **Two documents disagreed about the size of the game.** One cites roughly 2.00M
  concurrent players (RBLXSTAT, 3 October 2026), the other roughly 1.2M (GGAID,
  7 October 2026) — for the same game, four days apart, alongside a 2.105M
  "recent peak" and a 14.29M "all-time peak". Neither is official Roblox
  analytics and neither could be verified here, so **both readings are now shown
  together with the conflict stated** instead of one of them being presented as
  the fact. See the callout in
  [section 3 of the market research](roblox_steal_collect_research.md#3-current-roblox-market-snapshot).
- **The research was only available as Word files.** `.docx` cannot be pasted
  into most agent chats and cannot be read by a text-only tool, which made the
  briefs the prompts depend on effectively unusable. Each is now also a `.md`.
- **Each file now says what it is and what it is for**, at the top, with links to
  its neighbours — so the folder can be navigated without opening all six.

## Limits and honesty

- **The market figures are not verified.** They are third-party tracker readings
  that contradict each other, so only the order of magnitude should be treated as
  evidence. The design rules do not depend on them; anything factual should be
  re-measured when it matters.
- **Platform rules date fastest.** Roblox limits, policies and discovery rules
  change; the launch prompt is written to make the model check them rather than
  trust this folder.
- **Nothing here has been built or playtested.** These are design documents. No
  claim in them has been validated by shipping a Roblox experience.
- **Originality is a constraint, not a footnote.** Every prompt names an existing
  game as market evidence *and* forbids reproducing its name, characters, art,
  UI, copy, map, animation, sound, or tuning. Design principles are fair game;
  protected expression is not. If a prompt is edited, that constraint has to
  survive the edit.
