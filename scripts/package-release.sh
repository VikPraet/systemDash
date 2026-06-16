#!/usr/bin/env bash
# Build a self-contained release tarball (run in CI on Linux for linux-x64 assets).
# The server only needs Node.js — no yarn, gcc, or git on the target machine.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-linux-x64}"
VERSION="$(node -p "require('./package.json').version")"
COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
STAGE="$ROOT/.release-staging"
ARCHIVE="systemdash-${VERSION}-${PLATFORM}.tar.gz"

echo "==> Installing dependencies"
yarn install --frozen-lockfile 2>/dev/null || yarn install

echo "==> Building web + server"
yarn build

echo "==> Pruning to production dependencies"
yarn install --production --frozen-lockfile 2>/dev/null || yarn install --production

echo "==> Staging release layout"
rm -rf "$STAGE"
mkdir -p "$STAGE/server/dist" "$STAGE/web/dist"

cp -a server/dist/. "$STAGE/server/dist/"
cp -a web/dist/. "$STAGE/web/dist/"
cp -a node_modules "$STAGE/node_modules/"

cat >"$STAGE/package.json" <<EOF
{
  "name": "systemdash",
  "version": "$VERSION",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/dist/index.js"
  }
}
EOF

cat >"$STAGE/VERSION.json" <<EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "platform": "$PLATFORM",
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "==> Creating $ARCHIVE"
rm -f "$ROOT/$ARCHIVE"
tar -czf "$ROOT/$ARCHIVE" -C "$STAGE" .
rm -rf "$STAGE"

echo "==> Done: $ROOT/$ARCHIVE"
echo "    Ship this file via GitHub Releases (or any static host)."
echo "    On the server: bash scripts/install-release.sh <owner/repo> $VERSION"
