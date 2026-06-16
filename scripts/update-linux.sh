#!/usr/bin/env bash
# Pull latest code and rebuild. Restart the systemd service yourself (or it will
# restart on failure if ExecStart is configured).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .git ]]; then
  echo "Not a git checkout: $ROOT" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "==> Fetching origin"
git fetch origin

BEHIND="$(git rev-list --count HEAD..origin/"$BRANCH" 2>/dev/null || echo 0)"
if [[ "$BEHIND" == "0" ]]; then
  echo "Already up to date with origin/$BRANCH"
else
  echo "==> Pulling $BEHIND commit(s) from origin/$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

bash "$ROOT/scripts/install-linux.sh"
