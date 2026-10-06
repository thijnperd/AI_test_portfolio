#!/usr/bin/env bash
# check.sh — run tools/browser-check.cjs with the global Playwright resolvable.
#
#   bash tools/check.sh "boids/index.html" --expect canvas --screenshot /tmp/boids.png
#   bash tools/check.sh "2048/index.html" --press ArrowLeft --eval "document.querySelectorAll('.tile').length"
#
# NODE_PATH is pointed at the global npm root so `require('playwright')` works
# without installing anything into a project. browser-check.cjs also falls back
# to `npm root -g` on its own, so this wrapper is a convenience, not a
# requirement.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${NODE_PATH:-}" ]; then
  if command -v npm >/dev/null 2>&1; then
    export NODE_PATH="$(npm root -g)"
  fi
fi

exec node "$here/browser-check.cjs" "$@"
