#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
[[ "$(uname -s)" == "Darwin" ]] || { echo "This verification requires macOS." >&2; exit 2; }
VERSION="$(tr -d '[:space:]' < VERSION)"
DMG="${1:-$HERE/dist/Sentinel-${VERSION}.dmg}"
[[ -f "$DMG" ]] || { echo "DMG not found: $DMG" >&2; exit 2; }
codesign --verify --verbose=2 "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG" || true
printf '%s\n' "DMG signature/staple checks completed: $DMG"
