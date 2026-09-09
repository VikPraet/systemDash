#!/usr/bin/env bash
# Install or upgrade Beacon from a pre-built GitHub Release tarball.
# Usage: install-release.sh <github-owner/repo> [tag|latest]
#
# Example:
#   bash install-release.sh myorg/systemDash v0.1.0
#   bash install-release.sh myorg/systemDash latest
#
# Requires: curl, tar, node (18+). Does NOT require yarn, git, or build tools.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <owner/repo> [tag|latest]" >&2
  exit 1
fi

REPO="$1"
REQUESTED="${2:-latest}"
INSTALL_ROOT="${SYSTEMDASH_HOME:-/opt/systemdash}"
RELEASES="$INSTALL_ROOT/releases"
CURRENT="$INSTALL_ROOT/current"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$RELEASES"

curl_api() {
  local url="https://api.github.com/repos/$REPO/$1"
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" "$url"
  else
    curl -fsSL -H "Accept: application/vnd.github+json" "$url"
  fi
}

curl_asset() {
  curl -fsSL -L "$1" -o "$2"
}

if [[ "$REQUESTED" == "latest" ]]; then
  if curl_api "releases/latest" >"$TMP/release.json"; then
    TAG="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).tag_name)" "$TMP/release.json")"
  else
    # No GitHub Latest (only pre-releases so far) — pick the newest published release.
    curl_api "releases?per_page=20" >"$TMP/releases.json"
    TAG="$(node -e "
      const list = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
      const r = (Array.isArray(list) ? list : []).find((x) => x && !x.draft && x.tag_name);
      if (!r) process.exit(2);
      console.log(r.tag_name);
    " "$TMP/releases.json")"
  fi
else
  TAG="$REQUESTED"
  [[ "$TAG" == v* ]] || TAG="v$TAG"
fi

VERSION="${TAG#v}"
PLATFORM="linux-x64"
ASSET="systemdash-${VERSION}-${PLATFORM}.tar.gz"

echo "==> Resolving release $TAG ($ASSET)"

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl_api "releases/tags/$TAG" >"$TMP/release.json"
  DOWNLOAD_URL="$(node -e "
    const r = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    const a = (r.assets || []).find(x => x.name === process.argv[2]);
    if (!a) process.exit(2);
    console.log(a.browser_download_url);
  " "$TMP/release.json" "$ASSET")"
  AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN")
else
  DOWNLOAD_URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"
  AUTH=()
fi

TARGET="$RELEASES/$VERSION"

echo "==> Downloading"
curl "${AUTH[@]}" -fsSL -L "$DOWNLOAD_URL" -o "$TMP/$ASSET"

echo "==> Extracting to $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"
tar -xzf "$TMP/$ASSET" -C "$TARGET"

ln -sfn "$TARGET" "$CURRENT"

echo "==> Installed Beacon $VERSION → $CURRENT"
echo "    Start: cd $CURRENT && node server/dist/index.js"
echo "    Or configure systemd (see docs/deploy-linux.md)"
if [[ -x "$CURRENT/scripts/configure-service-user.sh" ]]; then
  echo ""
  echo "    First-time / switch to a normal user:"
  echo "      cd $CURRENT && bash scripts/configure-service-user.sh vadmin"
  echo "      sudo cp $CURRENT/scripts/systemdash-vadmin.service.example /etc/systemd/system/systemdash.service"
  echo "      sudo systemctl daemon-reload && sudo systemctl restart systemdash"
fi
