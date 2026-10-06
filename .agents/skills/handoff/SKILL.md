---
name: handoff
description: Use when the user wants to end or split a session deliberately — compress the current work into a structured handoff document so a fresh session (or a different agent) can continue without losing context. Not for summarizing code for humans or writing docs.
version: 1.0.0
user-invocable: true
argument-hint: "[optional: who picks up next, e.g. 'new session' / 'another agent']"
---

# Handoff — deliberate exit before context degrades

Long sessions drift: attention relationships strain and output quality decays.
A handoff document is a clean exit — it tells the *next* worker exactly what
matters, instead of hoping a compaction summary kept the right details.

## What goes in the document

1. **Purpose of the next session** — the single most important next outcome,
   one or two sentences.
2. **Current state** — what is done, what is in progress, what is broken, with
   file paths.
3. **Key decisions and constraints** — the non-obvious choices made and why
   (architecture, conventions, rejected alternatives). This is the part that
   compaction throws away first.
4. **Next actions** — ordered, concrete, with validation commands where known.
5. **Pointers, not copies** — list file paths and artifacts to read; never
   duplicate file contents into the document.
6. **Suggested skills/instructions to load** — name the repo's instruction files
   and skills the next session must read for this scope.

## Rules

- Write it so someone with zero session context can act on it.
- Keep it under ~150 lines; every line must change what the successor does.
- Save it where the user expects (project folder or a path they name); default
  temp directories get lost — say where it is.
- Do not fabricate progress. If something is half-done, say exactly how.

## Examples

- "Create a handoff before I run out of context" → produce the document now,
  state its path, list the two highest-priority next actions.
- "Hand this off to another agent to implement the remaining tests" → emphasize
  constraints and validation commands the implementation must follow.
