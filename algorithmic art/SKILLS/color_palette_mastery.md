---
name: color-palette-mastery
description: Use when choosing, designing, or tuning colors for algorithmic art — palettes, color harmonies, probabilistic color assignment, gradients, background/ink pairing, or fixing color that looks muddy, random, or garish. Not for app UI theming.
---

# Color palette mastery for generative art

Random RGB is noise; color in generative art is *distribution*. Every strong
generative work treats color as a weighted depositions over a hand-tuned set.

## Principles

1. **Palette = roles + weights.** A palette is 3–6 colors with *roles* (ground,
   body, accent, tint, ink) and, for generative use, *probabilities*. Most
   elements take the body colors; accents punctuate at 5–15%.
2. **Anchor hue first.** Pick one anchor (or let the seed pick it), then derive:
   analogous (±15–35°) for calm, complementary (+180°) for tension, split/
   triadic for energy. Jitter derived hues ±5–10° so nothing is mechanically pure.
3. **Control value, not just hue.** A composition reads by lightness structure
   first. Keep a deliberate value range (e.g. one dark anchor, one light tint,
   midtones between). Two mid-value hues fight; a value jump creates hierarchy.
4. **Background is a color decision.** Warm cream paper vs near-black ink vs a
   tinted mid-ground completely changes the piece. The background tone should
   appear *inside* the palette too (as negative-space color), so the image and
   its ground belong together.
5. **Perceptual, not numeric.** HSL is convenient but naive (equal lightness
   steps look unequal). For fine work, nudge lightness by eye: yellows read
   brighter than blues at equal L.
6. **Fewer, committed colors beat many polite ones.** 3 colors used with
   discipline look designed; 10 averaged colors look defaulted.

## Generative patterns

- **Probabilistic palettes:** `[{c:'#22366b', w:3.2}, ...]` with weighted pick.
  Heavy tones settle often, rare tones punctuate — stratigraphy by weight.
- **Spatial color logic:** derive color from the same field/quantity that shapes
  the geometry (velocity→warmth, depth→desaturation, density→value). Color that
  follows the structure looks inevitable.
- **Gradients with grain:** never bare linear gradients in large flat areas —
  add deterministic grain or banding breaks.
- **Determinism:** derive palettes from the seeded RNG so each seed deposits its
  own consistent stratigraphy.

## Checklist before shipping a piece

- [ ] Squint test: does the value structure still read?
- [ ] Is any color present "by accident" (default fill, leftover state)?
- [ ] Does the background belong to the palette?
- [ ] Is the accent rare enough to stay special?
- [ ] Same seed → same colors (no `Math.random()` leakage)?
