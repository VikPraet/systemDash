#!/usr/bin/env bash
# First-time install or rebuild from an existing git clone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi
if ! command -v yarn >/dev/null 2>&1; then
  echo "yarn is required" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

if [[ ! -d .git ]]; then
  echo "This directory is not a git checkout: $ROOT" >&2
  exit 1
fi

echo "==> Installing dependencies"
yarn install --frozen-lockfile 2>/dev/null || yarn install

echo "==> Building web + server"
yarn build

COMMIT="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
VERSION="$(node -p "require('./package.json').version")"
INSTALL_FILE="$ROOT/.systemdash-install.json"

cat >"$INSTALL_FILE" <<EOF
{
  "commit": "$COMMIT",
  "branch": "$BRANCH",
  "version": "$VERSION",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "==> Installed Beacon $VERSION ($COMMIT on $BRANCH)"
echo "    Metadata: $INSTALL_FILE"
echo "    Start with: yarn start   (or systemd — see docs/deploy-linux.md)"
