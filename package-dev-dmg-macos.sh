#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
[[ "$(uname -s)" == "Darwin" ]] || { echo "This script requires macOS (hdiutil)." >&2; exit 2; }
VERSION="$(tr -d '[:space:]' < VERSION)"
./build-desktop-macos.sh
ROOT="$HERE/dist/dmg-root"
DMG="$HERE/dist/Sentinel-${VERSION}-dev.dmg"
rm -rf "$ROOT" "$DMG"
mkdir -p "$ROOT"
ditto "$HERE/dist/Sentinel.app" "$ROOT/Sentinel.app"
ln -s /Applications "$ROOT/Applications"
hdiutil create -volname "Sentinel ${VERSION}" -srcfolder "$ROOT" -ov -format UDZO "$DMG"
shasum -a 256 "$DMG" > "$DMG.sha256"
printf '%s\n' "Development DMG created: $DMG" "UNSIGNED / UNNOTARIZED — for local testing only."
