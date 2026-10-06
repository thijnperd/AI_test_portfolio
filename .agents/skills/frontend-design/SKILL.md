---
name: frontend-design
description: Use when building or styling any user-facing interface and the visual result must look deliberate and distinctive rather than generic — choosing a visual direction, typography, color, layout, and motion before writing CSS. Not for backend work; for auditing/polishing an existing UI use impeccable instead.
version: 1.0.0
user-invocable: true
argument-hint: "[visual direction, e.g. dark editorial / brutalist / gallery]"
---

# Frontend design — commit to a direction, kill the slop

Generic AI output has a look: Inter, purple gradients, floating rounded cards,
safe gray neutrals. Technically correct, visually interchangeable. This skill
forces deliberate aesthetic decisions **before** any code is written.

## The contract

1. **Name the world.** One or two adjectives plus an anchor (e.g. "gallery at
   night — warm near-black, hairlines, one amber accent", "brutalist zine —
   raw mono, hard borders, no shadows"). Write it at the top of the CSS or in
   the design notes so every later decision answers to it.
2. **Typography is the identity.** Choose a pairing with contrast of voice
   (display vs text vs data), not three near-identical sans-serifs. Ban the
   defaults unless the brief demands them: Inter, Roboto, Arial, and (when a
   distinctive voice is wanted) system-UI as the only face. Define the stack as
   CSS variables and reuse it.
3. **Color: one accent, a real neutral ramp.** Backgrounds are tinted (warm or
   cool), never pure `#808080` gray soup. Verify contrast for text and muted
   text (aim ≥ 4.5:1 on their backgrounds).
4. **Spatial composition.** Choose a rhythm (spacing scale), a grid, and a
   deliberate density. The main artifact leads; chrome recedes.
5. **Motion is seasoning.** Transitions 120–200ms on interaction only. Always
   honor `prefers-reduced-motion`.
6. **States, not just the happy path.** Hover, focus-visible, active, disabled,
   empty, error. Focus-visible outlines are non-negotiable.

## Execution rules

- Decide the direction in one paragraph, then build it fully — no hedging
  between two aesthetics.
- Express tokens (colors, fonts, radii, shadows) as CSS custom properties.
- Match the project's existing architecture (no new frameworks for style's sake).
- After building, verify in a browser (see `webapp-testing`).

## Examples

- "Build a settings panel" → first line of work: pick the direction ("quiet
  instrument panel: ink neutrals, mono labels, hairline dividers"), then code.
- "Make this look less like AI slop" → replace defaults (fonts, purple, cards)
  with a named world; keep all functionality identical.
