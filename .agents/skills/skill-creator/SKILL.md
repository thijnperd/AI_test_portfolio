---
name: skill-creator
description: Use when the user asks to create, write, improve, or evaluate an agent skill (SKILL.md) — designing the skill's structure, description, and instructions. Also use when asked to research or install community skills and judge their quality.
version: 1.0.0
user-invocable: true
argument-hint: "[topic or workflow the skill should cover]"
---

# Skill authoring — what separates a working skill from dead weight

## Anatomy

```
skill-name/
├── SKILL.md        # lean core instructions (frontmatter + body)
├── reference.md    # optional: deep context, loaded only when needed
└── scripts/        # optional: deterministic work done in code
```

Frontmatter: `name` (kebab-case), `description` (the routing rule — this is what
gets pattern-matched at startup), optionally `version`, `user-invocable`,
`argument-hint`.

## Quality bar (from studying the best skills in the ecosystem)

1. **The description reads like a routing rule.** Bad: "Helps with documents."
   Good: "Use when the user asks to extract form fields, fill, redact, or parse
   tables from a PDF." Vague descriptions produce no activation or wrong
   activation.
2. **One skill, one job.** Compound skills trigger at the wrong moments. Split
   them.
3. **Lean body, fat references.** Core instructions fit on a phone screen; push
   edge cases into companion files loaded on demand.
4. **Examples over rules.** Three worked examples beat twenty bullet constraints.
5. **Code does deterministic work.** Sorting, parsing, validation, checksums —
   scripts, not prose the model has to simulate.
6. **Honest metadata.** Never claim capabilities the skill cannot deliver.
7. **State the boundaries.** "Not for X" in the description stops misrouting.

## Process

1. Interview the workflow: trigger moments, inputs, outputs, failure modes.
2. Write the routing description first; it decides discoverability.
3. Draft the body as imperative steps with one complete example.
4. Move anything not needed on every activation into a reference file.
5. Test activation: would this description fire on the intended requests and
   stay silent on adjacent ones?

## Security note

Skills can execute arbitrary code. Before recommending any community skill,
audit its SKILL.md and every bundled script (look for network calls, credential
access, obfuscation). Prefer vetted sources (official vendor repos) and say so
when recommending.

## Examples

- "Write a skill for generating changelogs" → routing description: "Use when the
  user asks to draft or update a changelog/release notes from commits or diffs."
  Body: step-by-step with one worked example, plus a script for grouping commits.
- "Is this community skill safe to install?" → read SKILL.md + scripts, check for
  network/credential behavior, report findings before installing.
