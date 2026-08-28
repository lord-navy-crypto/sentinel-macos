#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"

[[ "$(uname -s)" == "Darwin" ]] || { echo "Developer ID release must run on macOS." >&2; exit 2; }
for tool in xcrun codesign security hdiutil ditto plutil; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 2; }
done

: "${DEVELOPER_ID_APP:?Set DEVELOPER_ID_APP, e.g. 'Developer ID Application: Your Name (TEAMID)'}"
: "${NOTARY_PROFILE:?Set NOTARY_PROFILE to a Keychain profile created with xcrun notarytool store-credentials}"

VERSION="$(tr -d '[:space:]' < VERSION)"
BUNDLE_ID="${SENTINEL_BUNDLE_ID:-io.github.lord-navy-crypto.sentinel}"
APP="$HERE/dist/Sentinel.app"
DMG="$HERE/dist/Sentinel-${VERSION}.dmg"
ROOT="$HERE/dist/release-dmg-root"

./build-desktop-macos.sh

# Sign from the inside out. --options runtime enables Hardened Runtime.
for bin in \
  "$APP/Contents/Resources/bin/sentinel-macos-arm64" \
  "$APP/Contents/Resources/bin/sentinel-macos-x86_64" \
  "$APP/Contents/MacOS/Sentinel"; do
  codesign --force --timestamp --options runtime --sign "$DEVELOPER_ID_APP" "$bin"
done
codesign --force --timestamp --options runtime --sign "$DEVELOPER_ID_APP" "$APP"

codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --type execute --verbose=4 "$APP" || true

rm -rf "$ROOT" "$DMG"
mkdir -p "$ROOT"
ditto "$APP" "$ROOT/Sentinel.app"
ln -s /Applications "$ROOT/Applications"
hdiutil create -volname "Sentinel ${VERSION}" -srcfolder "$ROOT" -ov -format UDZO "$DMG"

# Apple documents Developer ID Application signing for DMGs used in direct distribution.
codesign --force --timestamp --sign "$DEVELOPER_ID_APP" -i "${BUNDLE_ID}.dmg" "$DMG"
codesign --verify --verbose=2 "$DMG"

printf '%s\n' "Submitting to Apple Notary Service…"
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"

# Final offline-friendly artifact verification.
codesign --verify --deep --strict --verbose=2 "$APP"
shasum -a 256 "$DMG" > "$DMG.sha256"
cat "$DMG.sha256"
printf '%s\n' \
  "Release ready: $DMG" \
  "Upload this single DMG to GitHub Releases / your download website."
