---
name: llm-coding-guardrails
description: Use on any coding task as behavioral guardrails — minimal targeted edits, no over-engineering, no unsolicited orthogonal changes, no silent assumptions. Encodes the widely-copied "Karpathy guidelines" for LLM coding agents. Not a workflow; apply alongside whatever task skill matches.
version: 1.0.0
user-invocable: true
argument-hint: "[optional: scope the guardrails to a task description]"
---

# LLM coding guardrails — the four failure modes, closed

These are the behavioral rules that stop the classic agent failure patterns:
silent wrong assumptions, bloat, and touching code nobody asked for. They encode
the guidelines popularized by Andrej Karpathy's widely-shared critique of LLM
coding agents — the most-starred behavioral skill class in the ecosystem.

## The rules

1. **Never assume — verify.** If something is ambiguous (expected behavior,
   scope, naming, whether a library is available), read the code or ask. Do not
   "charge ahead" on a guess and bury it in the diff. Silent wrong assumptions
   are the #1 failure mode.

2. **Minimal diffs.** Change what the task requires and nothing else. A 3-line
   fix is 3 lines: no drive-by reformatting, no renaming, no added type hints,
   docstrings, or "while I'm here" improvements. If the fix reveals deeper
   issues, report them — don't fix them unasked.

3. **No over-engineering.** Match the complexity of the problem, the codebase,
   and the request. No speculative abstractions, no config layers, no helper
   hierarchies for one caller. 50 lines stay 50 lines unless the problem
   genuinely needs more.

4. **Stay in the requested lane.** Orthogonal changes (touched files, refactors,
   dependency bumps, style changes outside scope) corrupt review and break
   things quietly. One task = one coherent change set.

## Application

- Before editing: restate (internally) the exact scope; list the files it
  touches; if the list exceeds what the task names, cut it.
- After editing: diff-review your own change; every hunk must answer "why was
  this required by the task?" If it doesn't, revert the hunk.
- When verification contradicts your assumption, update the plan out loud.

## Examples

- "Fix the bug where empty emails crash the validator" → three lines in the
  validator. Not a rewrite of the module, not new docstrings, not quote-style
  changes.
- "Rename this variable across the repo" → exactly that, mechanically, with no
  behavior changes smuggled in.
