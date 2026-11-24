#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Datchord needs Node.js 24 or newer. Install it from https://nodejs.org"
  exit 1
fi

if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "Your Node.js version is too old. Install Node.js 24 or newer from https://nodejs.org"
  exit 1
fi

export PORT="${PORT:-3000}"
mkdir -p data

URL="http://localhost:${PORT}"
echo "Starting Datchord at ${URL}"
echo "Keep this window open while you use Datchord. Press Ctrl+C to stop."

if command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
fi

exec node server/index.js
