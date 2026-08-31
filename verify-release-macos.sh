#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
[[ "$(uname -s)" == "Darwin" ]] || { echo "This verification requires macOS." >&2; exit 2; }
for tool in codesign xcrun spctl hdiutil plutil lipo; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 2; }
done

VERSION="$(tr -d '[:space:]' < VERSION)"
DMG="${1:-$HERE/dist/Sentinel-${VERSION}.dmg}"
[[ -f "$DMG" ]] || { echo "DMG not found: $DMG" >&2; exit 2; }

MOUNT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sentinel-release-verify.XXXXXX")"
MOUNTED=0
cleanup() {
  if [[ "$MOUNTED" -eq 1 ]]; then
    hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || hdiutil detach "$MOUNT_DIR" -force -quiet >/dev/null 2>&1 || true
  fi
  rmdir "$MOUNT_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

printf '%s\n' "Verifying signed and notarized DMG envelope…"
codesign --verify --verbose=2 "$DMG"
xcrun stapler validate "$DMG"
# Production verification is fail-closed: a Gatekeeper rejection is a release failure.
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG"

printf '%s\n' "Mounting DMG read-only and verifying the shipped application…"
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT_DIR" "$DMG" >/dev/null
MOUNTED=1
APP="$MOUNT_DIR/Sentinel.app"
[[ -d "$APP" ]] || { echo "Mounted DMG does not contain Sentinel.app" >&2; exit 2; }
[[ ! -L "$APP" ]] || { echo "Sentinel.app inside DMG must not be a symlink" >&2; exit 2; }

PLIST="$APP/Contents/Info.plist"
[[ -f "$PLIST" ]] || { echo "Sentinel.app is missing Info.plist" >&2; exit 2; }
PACKAGED_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")"
PACKAGED_UI="$(/usr/libexec/PlistBuddy -c 'Print :SentinelDesktopUI' "$PLIST")"
[[ "$PACKAGED_VERSION" == "$VERSION" ]] || { echo "DMG app version mismatch: $PACKAGED_VERSION (expected $VERSION)" >&2; exit 2; }
[[ "$PACKAGED_UI" == "2.6 Native Frontend" ]] || { echo "DMG app UI identity mismatch: $PACKAGED_UI" >&2; exit 2; }

codesign --verify --deep --strict --verbose=2 "$APP"
# Verify Gatekeeper evaluates the actual app users will drag into /Applications.
spctl --assess --type execute --verbose=4 "$APP"

LAUNCHER="$APP/Contents/MacOS/Sentinel"
[[ -x "$LAUNCHER" ]] || { echo "Universal launcher is missing or not executable" >&2; exit 2; }
ARCHS="$(lipo -archs "$LAUNCHER")"
grep -qw arm64 <<<"$ARCHS" || { echo "Universal launcher is missing arm64" >&2; exit 2; }
grep -qw x86_64 <<<"$ARCHS" || { echo "Universal launcher is missing x86_64" >&2; exit 2; }

for engine in \
  "$APP/Contents/Resources/bin/sentinel-macos-arm64" \
  "$APP/Contents/Resources/bin/sentinel-macos-x86_64"; do
  [[ -x "$engine" ]] || { echo "Missing executable engine: $engine" >&2; exit 2; }
  codesign --verify --strict --verbose=2 "$engine"
  for marker in \
    'Sentinel 2.6 Native Frontend' \
    'Sentinel 2.6 Investigation Workbench' \
    'Sentinel 2.6 Full Scan Center' \
    'Sentinel 2.6 Contextual Action Dock' \
    'Sentinel 2.6 Comprehensive User Manual' \
    'Sentinel 2.6 WebLLM Local AI' \
    'Sentinel 2.6 Local AI Reliability'; do
    LC_ALL=C grep -aFq "$marker" "$engine" || { echo "Shipped engine is missing marker: $marker" >&2; exit 2; }
  done
done

printf '%s\n' \
  "Release verification passed: $DMG" \
  "DMG signature + notarization staple + Gatekeeper: PASS" \
  "Mounted Sentinel.app signature + Gatekeeper + version/UI identity: PASS" \
  "Universal launcher and both embedded 2.6 engines: PASS"
