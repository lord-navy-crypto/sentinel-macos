#!/usr/bin/env bash
# Validate a REAL Sentinel Box DMG on a macOS host. This is NOT UI testing.
# Usage: bash scripts/verify-macos-dmg.sh test|release /absolute/path/file.dmg aarch64-apple-darwin|x86_64-apple-darwin
set -euo pipefail
set +x

if [[ "$(uname -s)" != "Darwin" || $# -ne 3 ]]; then
  echo "Usage (macOS only): $0 test|release <Sentinel-Box.dmg> <aarch64-apple-darwin|x86_64-apple-darwin>" >&2
  exit 2
fi
MODE="$1"; DMG="$2"; TARGET="$3"
case "$MODE" in test|release) ;; *) echo "Mode must be test or release." >&2; exit 2;; esac
case "$TARGET" in
  aarch64-apple-darwin) EXPECT_ARCH="arm64";;
  x86_64-apple-darwin) EXPECT_ARCH="x86_64";;
  *) echo "Unknown target architecture." >&2; exit 2;;
esac
[[ -f "$DMG" && -s "$DMG" ]] || { echo "Missing or empty DMG." >&2; exit 1; }
for command_name in hdiutil codesign shasum lipo xcrun; do
  command -v "$command_name" >/dev/null || { echo "Required macOS tool missing: $command_name" >&2; exit 1; }
done

echo "Checking disk image, architecture and application metadata..."
hdiutil verify "$DMG" >/dev/null
MOUNT="$(mktemp -d -t sentinel-box-qa)"
MOUNTED=0
cleanup() {
  if [[ "$MOUNTED" == "1" ]]; then hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true; fi
  rmdir "$MOUNT" >/dev/null 2>&1 || true
}
trap cleanup EXIT
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT" "$DMG" >/dev/null
MOUNTED=1
APP="$MOUNT/Sentinel Box.app"
PLIST="$APP/Contents/Info.plist"
[[ -d "$APP/Contents/MacOS" && -s "$PLIST" ]] || { echo "Expected app bundle missing." >&2; exit 1; }
/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$PLIST" | grep -Fx "Sentinel Box" >/dev/null
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST" | grep -Fx "com.lordnavycrypto.dailydesk" >/dev/null
EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$PLIST")"
APP_BIN="$APP/Contents/MacOS/$EXECUTABLE"
[[ -x "$APP_BIN" ]] || { echo "Executable missing or not executable." >&2; exit 1; }
ARCHES="$(lipo -archs "$APP_BIN")"
case " $ARCHES " in
  *" $EXPECT_ARCH "*) ;;
  *) echo "Expected $EXPECT_ARCH binary but detected: $ARCHES" >&2; exit 1;;
esac

codesign --verify --deep --strict --verbose=2 "$APP" >/dev/null
SIGNATURE="$(codesign -dv --verbose=4 "$APP" 2>&1)"
if [[ "$MODE" == "test" ]]; then
  [[ "$SIGNATURE" == *"Signature=adhoc"* ]] ||
    { echo "TEST mode expected ad-hoc signature. Do not relabel as notarized." >&2; exit 1; }
  echo "Ad-hoc signature confirmed: this is a TEST BUILD, not a public release."
else
  [[ "$SIGNATURE" != *"Signature=adhoc"* ]] ||
    { echo "RELEASE REFUSED: app is only ad-hoc signed." >&2; exit 1; }
  [[ "$SIGNATURE" == *"Authority=Developer ID Application:"* ]] ||
    { echo "RELEASE REFUSED: Developer ID Application signing chain not found." >&2; exit 1; }
  xcrun stapler validate -v "$DMG"
  spctl --assess --verbose=4 --type execute "$APP"
  echo "Gatekeeper, Developer ID signature and attached notarization ticket verified."
fi
echo "Source executable architecture: $ARCHES"
echo "Application version: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")"
echo "SHA-256 for original DMG:"
shasum -a 256 "$DMG"
echo "DMG verification PASSED ($MODE, $TARGET). Native UI/Office/LAN QA is separate."
