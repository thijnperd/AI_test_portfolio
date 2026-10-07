# AI instructions for the Roblox game design kit

This folder is a **documents** project: master prompts and the research behind
them, for designing an original Roblox steal-and-collect game. There is no code,
no build, and nothing to run. The "artifact" is what happens when a person pastes
one of these prompts into an AI, so the quality that matters is **how the text
behaves as instructions**.

## Before working

- Read this file and [`README.md`](README.md) — the README is the kit's index and
  says which file is for what.
- Identify which file actually owns the change. The prompts and the research are
  separate documents that reference each other; a change to one often needs a
  matching line in another.
- Follow the repository-level guidance in [`../AGENTS.md`](../AGENTS.md) and
  [`../context.md`](../context.md).

## What each file is

| File | Responsibility |
|---|---|
| `roblox_game_master_prompt.md` | The general prompt: invent and specify the game, then build it in phases. Contains the output contract. |
| `roblox_steal_an_egg_focused_master_prompt.md` | The same task narrowed to one game's loop, with far more design depth and a six-phase execution protocol. |
| `roblox_studio_brand_account_page_launch_master_prompt.md` | Everything around the game: ownership, Studio structure, the experience page, brand, onboarding, analytics, monetization, live-ops, launch. |
| `*_research.md` | The three briefs. Each prompt names the brief it needs in its own front matter and must be used with it. |
| `*.docx` | The original Word exports of the three research documents. Provenance only. |
| `README.md` | The index: which file to use when, how to sequence them, and what was corrected. |

## The rules that make these prompts work

- **Originality constraints are load-bearing.** Every prompt names an existing
  game as market evidence *and* forbids copying its name, characters, art, UI,
  copy, map layout, animation, sound, or numerical tuning. A prompt that names
  a game without that prohibition is a clone request. Never remove or soften
  these clauses, and if you add a new reference game, add its prohibition in the
  same breath.
- **The anti-fabrication clauses stay.** The general prompt says not to claim
  Roblox Studio was opened, a server run, or gameplay tested unless the tool
  environment allowed it; the launch prompt says to verify platform limits
  against current Creator Hub documentation rather than stating an old rule as
  current. These are the difference between a usable prompt and one that produces
  confident fiction. Keep them, and keep them near the output contract.
- **Numbers need a date and a source, or they need to go.** These documents cite
  third-party player counts and platform limits that change. Any figure added
  must carry the date it was read and who measured it, and must be presented as
  evidence rather than fact. Never quietly re-baseline a number, and never invent
  one to fill a gap.
- **Say what is unverified.** The two player counts in this kit disagree with each
  other and neither could be checked here; that conflict is stated in both the
  research and the focused prompt. That is the standard: an unresolved conflict
  is written down as an unresolved conflict, not resolved by choosing a winner.
- **Prompts are instructions, not prose.** Keep the imperative mood, the explicit
  decision rules, and the ordered phases. When you add a requirement, say what
  the model must *do* and what it must *return*; when you remove one, check it is
  not the only thing enforcing a constraint somewhere else.
- **Keep the front matter shape.** Every prompt and every research document opens
  with what it is, what it is for, the research it depends on, and how to use it,
  with relative links to its neighbours. New files follow that shape.

## Working on the research documents

- **The `.md` files are canonical; the `.docx` files are history.** They were
  converted from Word, and the conversion was not free: it added the front
  matter, removed the duplicated master prompt from section 14 (which is now a
  pointer), and reconciled the market figures. Do not re-export a `.docx` over a
  `.md`, and do not hand-edit both — if the Word exports ever need refreshing, say
  so in the README rather than creating a third copy of the content.
- **One-cell tables in the source Word files are callouts, not tables** (a label,
  usually bold, followed by the text it labels). They are rendered as blockquotes
  with the label bold. Watch the two shapes: most spell the label as its own
  paragraph, but some put the label and the body in one paragraph separated only
  by line breaks — that one glued label and text together into
  `skeletonSTEAL rare...` on the first pass and had to be split by hand. Preserve
  the callout shape if the conversion is ever repeated.
- **Cross-references must resolve.** All links in this folder are relative and
  point at files in the folder. If a file is renamed, update every reference —
  the prompts point at the research by filename and the kit breaks silently if
  a name drifts.
- **Never let two files be the same document.** The duplicated master prompt was
  removed for exactly this reason. If content belongs in two places, put it in one
  and link to it from the other.

## Validation

There is no test suite here. Before finishing:

```bash
# every relative link in the folder resolves to a real file
cd RobloxGame && grep -oE '\]\([^)#]+\.md[^)]*\)' *.md | sed 's/.*](\(.*\))/\1/' | sort -u | while read -r f; do [ -e "$f" ] || echo "MISSING: $f"; done
```

Then read the changed file end to end. A prompt is a deliverable that cannot be
type-checked, so the review is the verification: check that the instruction is
unambiguous, that it does not contradict a rule elsewhere in the same file, that
any number is dated and sourced, and that the originality and anti-fabrication
clauses are intact.

If a prompt is edited in a way that changes what it asks for, note it in
[`README.md`](README.md) under "What was cleaned up in this folder" — that section
is the kit's change log for readers, not for code.
