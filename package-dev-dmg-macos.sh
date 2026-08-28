#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
[[ "$(uname -s)" == "Darwin" ]] || { echo "This script requires macOS (hdiutil)." >&2; exit 2; }
VERSION="$(tr -d '[:space:]' < VERSION)"
CHANNEL="${SENTINEL_RELEASE_CHANNEL:-dev}"
case "$CHANNEL" in
  dev|beta) ;;
  *) echo "SENTINEL_RELEASE_CHANNEL must be 'dev' or 'beta'." >&2; exit 2 ;;
esac

./build-desktop-macos.sh
ROOT="$HERE/dist/dmg-root"
DMG="$HERE/dist/Sentinel-${VERSION}-${CHANNEL}.dmg"
rm -rf "$ROOT" "$DMG" "$DMG.sha256"
mkdir -p "$ROOT"
ditto "$HERE/dist/Sentinel.app" "$ROOT/Sentinel.app"
ln -s /Applications "$ROOT/Applications"

VOLNAME="Sentinel ${VERSION}"
[[ "$CHANNEL" == "beta" ]] && VOLNAME="Sentinel ${VERSION} Beta"
hdiutil create -volname "$VOLNAME" -srcfolder "$ROOT" -ov -format UDZO "$DMG"
shasum -a 256 "$DMG" > "$DMG.sha256"

if [[ "$CHANNEL" == "beta" ]]; then
  printf '%s\n' \
    "Beta DMG created: $DMG" \
    "Checksum: $DMG.sha256" \
    "UNSIGNED / UNNOTARIZED BETA — suitable for controlled GitHub/website testing, not a production notarized release."
else
  printf '%s\n' \
    "Development DMG created: $DMG" \
    "UNSIGNED / UNNOTARIZED — for local development/testing only."
fi
