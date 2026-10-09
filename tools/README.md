# tools — shared browser testing

Dev tooling that is shared across the projects in this repo. Nothing here is a
dependency of any project: every project stays zero-dependency and opens from
`file://`. This folder is only for *verifying* those projects in a real browser.

## What's installed

- **Playwright 1.63.0** installed globally (`npm install -g playwright`), so
  `require('playwright')` resolves from the global npm root.
- **Chromium** browser binaries downloaded to the Playwright cache
  (`%LOCALAPPDATA%\ms-playwright` on Windows, `~/Library/Caches/ms-playwright`
  on macOS, `~/.cache/ms-playwright` on Linux).

Global install (not a project dependency) is deliberate: the projects here must
stay openable with no build step. Browsers live in the OS cache, not in the repo.

To (re)install or update:

```bash
npm install -g playwright
playwright install chromium
```

## `browser-check.cjs`

A small headless driver: loads a page, records console/page errors, can press
keys, click, assert selectors exist, evaluate JS, and screenshot. Prints a JSON
summary and exits non-zero on any error or missing `--expect`.

```bash
node tools/browser-check.cjs <url-or-path> [options]
```

| Option | Meaning |
|---|---|
| `--wait <ms>` | wait after load before checking (default `1000`) |
| `--size <WxH>` | viewport size (default `1000x700`) |
| `--expect <sel>` | fail unless the selector exists (repeatable) |
| `--press <key>` | press a key after load, e.g. `ArrowLeft`, `Space` (repeatable) |
| `--click <sel>` | click an element after load (repeatable) |
| `--screenshot <file>` | save a PNG of the final state |
| `--eval <js>` | evaluate JS in the page and print the result |
| `--touch` | emulate a touch device: `pointer: coarse` and `hover: none` match, touch events fire |
| `--dpr <n>` | device pixel ratio (default `1`; pair with `--touch` for a retina phone or iPad) |
| `--headed` | show a real window (default: headless) |

A local path is turned into a `file://` URL automatically.

`--touch` matters for any layout that branches on the pointer, not the width:
headless Chromium reports `pointer: fine`, so without it a phone-width check
would exercise the desktop layout and pass while the touch styles were never
loaded at all.

## `check.sh`

A wrapper that points `NODE_PATH` at the global npm root, so you do not have to
export it yourself. `browser-check.cjs` also falls back to `npm root -g` on its
own, so the wrapper is a convenience, not a requirement.

```bash
bash tools/check.sh "boids/index.html" --expect canvas --screenshot /tmp/boids.png

# drive a game: press a key, read state, capture the frame
bash tools/check.sh "2048/index.html" \
  --press ArrowLeft --press ArrowLeft \
  --expect ".tile" \
  --eval "Array.from(document.querySelectorAll('.tile')).filter(t => t.textContent).length" \
  --screenshot /tmp/2048.png

# start the horror game (any key begins) and capture the raycast frame
bash tools/check.sh "analog horror raycaster/index.html" --press Enter \
  --expect canvas --wait 2500 --screenshot /tmp/hallway.png

# a phone: coarse pointer, retina, and the touch-only pieces really match
bash tools/check.sh "dither studio web/index.html" --size 390x844 --touch --dpr 3 \
  --eval "matchMedia('(pointer: coarse)').matches" --screenshot /tmp/phone.png

# an iPad, the other way up
bash tools/check.sh "dither studio web/index.html" --size 1024x768 --touch --dpr 2 \
  --screenshot /tmp/ipad.png
```

## Notes

- Run from the repository root so relative project paths resolve.
- The JSON summary is machine-readable; `ok` is `true` only when there are no
  console errors, no page errors, and every `--expect` matched.
- Prefer this over reading HTML when a task says "test/verify/demo the app" —
  see the `webapp-testing` skill in `.agents/skills/webapp-testing/`.
