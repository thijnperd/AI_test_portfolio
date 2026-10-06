---
name: generative-composition
description: Use when the structure, layout, or overall quality of a generative artwork needs decisions — composition, hierarchy, negative space, scale variation, density, margins, or evaluating whether an algorithm produces consistently strong outputs across many seeds. Not for color specifics (color-palette-mastery) or UI layout.
---

# Generative composition — designing the system that designs the image

You are not composing one image; you are composing a *procedure* whose every
output should be worth keeping. That is the quality bar of long-form generative
art (the Fidenza test: does the algorithm stay surprising without ever falling
apart?).

## Compositional levers

1. **Focal hierarchy.** Even abstract work needs a dominant and a subordinate.
   Create hierarchy by scale, density, or value contrast — one region leads, the
   rest supports.
2. **Negative space is an element.** Budget it explicitly. Margin modes, gaps
   between colliding forms, and quiet zones around the focal point are design
   decisions, not leftovers. "Shapes that could have touched but were told not
   to" is a whole aesthetic.
3. **Scale variation.** A mix of large, medium, and small elements (weighted,
   not uniform) creates rhythm. All-same-size reads mechanical; all-random-size
   reads noisy. Choose a distribution and tune its weights.
4. **Flow and direction.** Give the eye a path: a dominant direction (diagonal,
   radial, spiraling) with counter-movement. One primary axis + drift beats
   isotropic chaos.
5. **Density with boundaries.** Turbulence/density params define the piece's
   temperament (low turbulence = calm, high = dramatic). Know which register the
   piece is in and stay consistent within it.
6. **Edge treatment.** Full-bleed vs margin vs vignette — how forms meet the
   frame is part of the composition.

## The multi-seed evaluation (mandatory for flagship work)

Before calling a generative piece done, render **at least 8–10 seeds** and
judge the *set*, not the favorite:

- Does any seed collapse (empty, muddy, dead-centered, tangled)?
- Do the params span their intended range without breaking the composition?
- Is variety visible between seeds while style stays coherent?

Fix collapse cases in the algorithm (guard rails, distributions), not by
picking a lucky seed.

## Craft bar

The final algorithm should appear as though it took countless hours to develop:
every parameter refined through countless iterations, complexity without visual
noise, order without rigidity. If a param exists, every value of it should
produce something defensible.
