#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"

[[ "$(uname -s)" == "Darwin" ]] || { echo "Developer ID release must run on macOS." >&2; exit 2; }
for tool in git xcrun codesign security hdiutil ditto plutil spctl shasum; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 2; }
done

: "${DEVELOPER_ID_APP:?Set DEVELOPER_ID_APP, e.g. 'Developer ID Application: Your Name (TEAMID)'}"
: "${NOTARY_PROFILE:?Set NOTARY_PROFILE to a Keychain profile created with xcrun notarytool store-credentials}"

# A release artifact must describe the exact committed source it was built from.
# build-desktop-macos.sh stamps git HEAD into Info.plist, so allowing modified,
# staged, or untracked source here would create a signed/notarized artifact whose
# provenance field no longer identifies its actual contents.
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "Refusing production release from a dirty working tree." >&2
  echo "Commit, stash, or remove all modified/staged/untracked files before releasing." >&2
  git status --short >&2 || true
  exit 2
fi
SOURCE_SHA="$(git rev-parse --verify HEAD)"
[[ -n "$SOURCE_SHA" ]] || { echo "Unable to resolve release source commit." >&2; exit 2; }

VERSION="$(tr -d '[:space:]' < VERSION)"
BUNDLE_ID="${SENTINEL_BUNDLE_ID:-io.github.lord-navy-crypto.sentinel}"
APP="$HERE/dist/Sentinel.app"
DMG="$HERE/dist/Sentinel-${VERSION}.dmg"
ROOT="$HERE/dist/release-dmg-root"

./build-desktop-macos.sh

PACKAGED_SHA="$(/usr/libexec/PlistBuddy -c 'Print :SentinelSourceCommit' "$APP/Contents/Info.plist")"
if [[ "$PACKAGED_SHA" != "$SOURCE_SHA" ]]; then
  echo "Refusing release: packaged source commit does not match the clean release HEAD." >&2
  echo "Package: $PACKAGED_SHA" >&2
  echo "Expected: $SOURCE_SHA" >&2
  exit 2
fi

# Sign from the inside out. --options runtime enables Hardened Runtime.
for bin in \
  "$APP/Contents/Resources/bin/sentinel-macos-arm64" \
  "$APP/Contents/Resources/bin/sentinel-macos-x86_64" \
  "$APP/Contents/MacOS/Sentinel"; do
  codesign --force --timestamp --options runtime --sign "$DEVELOPER_ID_APP" "$bin"
done
codesign --force --timestamp --options runtime --sign "$DEVELOPER_ID_APP" "$APP"

# A malformed signature is a hard release failure before notarization.
codesign --verify --deep --strict --verbose=2 "$APP"

rm -rf "$ROOT" "$DMG" "$DMG.sha256"
mkdir -p "$ROOT"
ditto "$APP" "$ROOT/Sentinel.app"
ln -s /Applications "$ROOT/Applications"
hdiutil create -volname "Sentinel ${VERSION}" -srcfolder "$ROOT" -ov -format UDZO "$DMG"

# Apple supports Developer ID Application signing for direct-distribution DMGs.
codesign --force --timestamp --sign "$DEVELOPER_ID_APP" -i "${BUNDLE_ID}.dmg" "$DMG"
codesign --verify --verbose=2 "$DMG"

printf '%s\n' "Submitting to Apple Notary Service…"
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"

# One fail-closed verifier checks the exact artifact users will receive,
# including Gatekeeper, the mounted app, both engine binaries, and product identity.
SENTINEL_EXPECTED_SOURCE_SHA="$SOURCE_SHA" ./verify-release-macos.sh "$DMG"

shasum -a 256 "$DMG" > "$DMG.sha256"
cat "$DMG.sha256"
printf '%s\n' \
  "Release ready: $DMG" \
  "Source commit: $SOURCE_SHA" \
  "Verification: clean source + provenance + signature + notarization + Gatekeeper + mounted app + universal engines PASS" \
  "Upload this single DMG and its .sha256 file to GitHub Releases / your download website."
