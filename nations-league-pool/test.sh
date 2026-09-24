#!/usr/bin/env bash
# Run the whole test suite: ./test.sh [all|backend|e2e]
set -euo pipefail
cd "$(dirname "$0")"
what="${1:-all}"

install() { [ -d "$1/node_modules" ] || npm --prefix "$1" install --no-audit --no-fund; }

if [ "$what" = all ] || [ "$what" = backend ]; then
  echo "▶ backend (node:test)"
  install backend
  npm --prefix backend test
fi

if [ "$what" = all ] || [ "$what" = e2e ]; then
  echo "▶ browser tests (Playwright, demo mode)"
  install frontend
  install e2e
  (cd e2e && npx playwright test "${@:2}")
fi
echo "✅ alle tests geslaagd"
