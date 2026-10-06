---
name: webapp-testing
description: Use when the user asks to test, verify, or demo a web app or page in a real browser — clicking through UI flows, checking for console errors, taking screenshots, or debugging rendering/visual output. Also use to validate canvas or animation output after a change. Not for unit tests or Node test runners.
version: 1.0.0
user-invocable: true
argument-hint: "[path-or-url] [flow to verify]"
---

# Webapp testing — verify in a real browser, not by reading code

Reading HTML proves nothing about what a user sees. This skill drives a real
browser (headless Chrome is enough) against the actual page and reports facts:
what rendered, what broke, what the console said.

## Workflow

1. **Locate the entry point.** Find the app's `index.html` or dev-server command
   in the relevant project folder. Prefer `file://` URLs for static apps; start a
   dev server only when the app requires one.
2. **Boot it headlessly and capture the console.** The goal of the first run is
   error capture, not screenshots:
   ```bash
   "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
     --enable-logging=stderr --v=0 --virtual-time-budget=8000 \
     --window-size=1280,900 "file:///ABSOLUTE/PATH/index.html" --dump-dom > /tmp/dom.html 2> /tmp/console.log
   grep -Ei "uncaught|error|CONSOLE" /tmp/console.log
   ```
   On macOS/Linux use `google-chrome`/`chromium`/`chrome` from PATH. If a Playwright
   project is already installed, prefer Playwright; never install heavy tooling
   into a project just to run this skill.
3. **Verify the rendered DOM, not the source.** Assert facts in the dump: element
   counts, key text present, dynamic lists populated. Grep `-o ... | wc -l`
   instead of eyeballing minified output.
4. **Exercise the flow the user named.** Clicking flows need scripted interaction
   (Playwright/Puppeteer) or URL-driven states. For canvas/animation apps, use
   `--virtual-time-budget` generously and verify pixels indirectly (exported
   output, DOM state, or a screenshot the user can look at).
5. **Report evidence.** Console errors verbatim, what passed, what did not.
   Screenshots to a path the user can open.

## Rules

- Never claim something "works" from code reading alone when this skill applies.
- The console log is the ground truth for silent failures (uncaught errors kill
  render loops without breaking the page).
- Keep all artifacts (dumps, screenshots, logs) in temp space or a project-local
  folder the user expects; clean up throwaway files.

## Examples

- "Make sure the gallery still loads after the refactor" → boot, grep console,
  count gallery items in the DOM dump, report.
- "Check that the new sketch renders" → boot with a large virtual-time budget,
  confirm no draw errors in console, screenshot the stage.
