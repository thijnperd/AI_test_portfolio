---
name: systematic-debugging
description: Use when something is broken and the cause is not yet known — a bug, failing test, crash, visual glitch, or regression — and a structured root-cause hunt is needed before editing. Not for feature work or for production-incident triage of live cloud services.
version: 1.0.0
user-invocable: true
argument-hint: "[symptom, e.g. 'canvas is blank on load']"
---

# Systematic debugging — find the cause before touching code

## Loop (repeat until proven)

1. **Reproduce and characterize.** What exactly happens, where, when? A bug
   you cannot reproduce is a bug you cannot verify fixing. Capture the exact
   failing output/error text.
2. **Form one hypothesis.** "I think X causes Y because Z." One at a time.
   Prefer hypotheses that distinguish themselves with a cheap experiment.
3. **Test cheaply.** Instrument (log/print/assert), bisect (last known good
   commit or half the pipeline), or isolate (minimal repro). Change *one* thing
   per experiment.
4. **Read the result honestly.** Did the observation match the prediction? If
   not, the hypothesis is wrong — say so and form the next one. Do not edit
   code "for luck".
5. **Fix the root cause, minimally.** The smallest change that removes the
   cause. Symptoms disappearing is not the same as the cause being gone.

## Tools of the trade

- **Bisect:** `git bisect` for regressions; binary-search the pipeline (is the
  data wrong at step 2 or step 5?).
- **Boundaries:** bugs hide at boundaries — array edges, zero/empty inputs,
  coordinate transforms, async ordering, scaling/rounding, first-frame state.
- **Rubber duck:** write the mechanism of the bug in one paragraph before
  editing; the error is usually visible in the description.
- **Last change first:** what changed most recently? Regression scope is small.

## After the fix

- Prove it: run the most targeted check that reproduced the failure, then a
  wider one.
- Add or extend a regression test when the project has a test convention.
- State the root cause in one sentence in the report — not just "fixed".

## Examples

- "The animation stops after a minute" → reproduce with a long virtual-time
  run; hypothesis: rAF loop cancels on error; instrument draw; find the throw;
  fix the cause (the throw), not the symptom (restart the loop).
- "Numbers are off by a pixel at 2x DPI" → bound the transform math at the
  DPR boundary; fix the rounding at the root.
