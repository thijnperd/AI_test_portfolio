---
name: brand-guidelines
description: Use when the user asks to apply a brand identity to an artifact — brand colors, typography, logo usage, or tone of voice — whether the brand rules are given in conversation, stored in a file, or must be proposed. Not for designing a UI from scratch (frontend-design) or auditing one (impeccable).
version: 1.0.0
user-invocable: true
argument-hint: "[artifact + brand source, e.g. 'pitch deck, brand in BRAND.md']"
---

# Brand application — one identity, everywhere

## Workflow

1. **Locate the brand truth.** Check the project for a brand/design file
   (BRAND.md, DESIGN.md, tokens in CSS/JSON). If none exists and the user gave
   rules in conversation, use those. If neither, propose a compact identity and
   confirm before applying.
2. **Distill it to tokens.** Extract: color roles (not just hex — what each
   color is *for*), typefaces and their roles, spacing/radius/voice rules, and
   explicit prohibitions (colors/fonts never to use).
3. **Apply roles, not colors.** When coloring an element, ask which brand role
   it plays (primary action, emphasis, surface, text, muted), then take that
   role's value. Never invent a shade between roles.
4. **Type discipline.** Display face for headlines only; text face for reading;
   data/mono for numbers. Preserve the brand's tracking and casing conventions.
5. **Voice (for copy).** Match tone rules from the brand source; if the brand
   defines none, keep copy plain, concrete, and free of marketing filler.

## Rules

- Brand rules outrank personal taste; when they conflict with accessibility
  (contrast), surface the conflict and propose the closest compliant variant
  instead of silently ignoring either.
- Keep a single source of truth (CSS variables/tokens), never hardcoded hex
  scattered through files.
- Logos: use the provided asset; never redraw, recolor, or stretch it.

## Examples

- "Apply our brand to this landing page" → extract tokens from the brand file,
  map each existing color/font to a role, then convert — layout unchanged.
- "Make this slide look like us" → brand palette + display face for the title,
  voice-consistent copy, export-ready margins.
