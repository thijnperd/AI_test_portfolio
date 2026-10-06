---
name: security-review
description: Use when the user asks for a security review, vulnerability audit, or threat check of code or a change set — injection, secrets, auth, unsafe input handling, dependency risk. Not for general code quality (thermo-nuclear-code-quality-review) or production incident debugging (azure-diagnostics-style workflows).
version: 1.0.0
user-invocable: true
argument-hint: "[files, change set, or 'whole project']"
---

# Security review — hunt for exploitable behavior, report like an auditor

## Checklist (ordered by real-world frequency)

1. **Injection.** Every place user-controlled data reaches an interpreter:
   `innerHTML`/`eval`/`Function`, SQL string concatenation, shell commands, path
   joins (`../` traversal), regex from input (ReDoS).
2. **Secrets.** API keys, tokens, passwords in source, config, logs, or test
   fixtures. Check git history scope if a leak is found.
3. **Trust boundaries.** Auth checks on every entry point; permission checks
   server-side (never client-side only); CSRF on state-changing routes.
4. **Input handling.** Unvalidated uploads, deserialization of untrusted data,
   unsafe redirects, missing size limits.
5. **Dependencies.** Known-vulnerable packages, unpinned versions in scripts,
   typosquatting risk in new deps.
6. **Browser-specific for web apps.** XSS sinks, `postMessage` without origin
   checks, permissive CORS, insecure storage of tokens.

## Method

- Read the actual data flow; findings without a reachable source→sink path are
  noise.
- If `semgrep`/`codeql`/`npm audit` are already available in the environment,
  run them as evidence; never install new security tooling without asking.
- Classify each finding: **severity** (critical/high/medium/low), **exploit
  scenario** in one sentence, **fix** in one sentence.
- One verified finding beats ten speculative ones. Mark uncertainties as such.

## Report format

| # | Severity | Location | Finding | Exploit scenario | Fix |
|---|---|---|---|---|---|

End with: residual risks, assumptions made, and what was *not* covered.

## Examples

- "Review the export feature" → trace filename from input to disk write;
  check traversal; verify the download path can't serve arbitrary files.
- "Any secrets in this repo?" → grep for key patterns across source and config,
  verify each hit, report only real credentials with rotation advice.
