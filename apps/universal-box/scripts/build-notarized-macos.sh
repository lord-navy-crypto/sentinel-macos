#!/usr/bin/env bash
# Explicit opt-in production candidate builder. NEVER publishes GitHub Releases.
# Run only on a trusted Mac with Apple Developer ID and notary credentials.
# Usage: APPLE_SIGNING_IDENTITY='Developer ID Application: ...' \
#        APPLE_ID=... APPLE_PASSWORD=... APPLE_TEAM_ID=... \
#        bash scripts/build-notarized-macos.sh aarch64-apple-darwin
set -euo pipefail
set +x

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
REPO="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
if (( $# != 1 )); then
  echo "Usage: $0 aarch64-apple-darwin|x86_64-apple-darwin" >&2;exit 2
fi
TARGET="$1"
case "$TARGET" in aarch64-apple-darwin|x86_64-apple-darwin) ;; *)
  echo "Invalid macOS architecture target." >&2;exit 2;; esac
[[ "$(uname -s)" == "Darwin" ]] || { echo "Signing/notarization must run on an authorized real Mac." >&2;exit 1; }
for tool in git npm cargo security xcrun codesign spctl hdiutil shasum; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2;exit 1; }
done
if [[ -n "$(git -C "$REPO" status --porcelain)" ]]; then
  echo "Refusing to build a release with uncommitted source changes." >&2;exit 1
fi
[[ -s "$APP_DIR/src-tauri/tauri.conf.json" ]] ||
  { echo "Missing the Sentinel Box Tauri project." >&2;exit 1; }
IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
if [[ "$IDENTITY" != "Developer ID Application:"* ]]; then
  echo "Release requires APPLE_SIGNING_IDENTITY with a Developer ID Application certificate." >&2;exit 1
fi
if ! security find-identity -v -p codesigning | grep -F "$IDENTITY" >/dev/null; then
  echo "Requested Developer ID identity not installed in the macOS keychain." >&2;exit 1
fi
if [[ -n "${APPLE_API_KEY:-}" ]]; then
  if [[ -z "${APPLE_API_ISSUER:-}" || -z "${APPLE_API_KEY_PATH:-}" ||
        ! -s "$APPLE_API_KEY_PATH" ]]; then
    echo "App Store Connect API notarization needs issuer and readable .p8 key." >&2;exit 1
  fi
elif [[ -z "${APPLE_ID:-}" || -z "${APPLE_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "Provide App Store Connect API key OR Apple ID + app-specific password + Team ID." >&2
  exit 1
fi
xcrun --find notarytool >/dev/null
xcrun --find stapler >/dev/null

cd "$APP_DIR"
echo "Preparing signed candidate from committed source $(git -C "$REPO" rev-parse HEAD)"
echo "Target architecture: $TARGET. Signing secrets are not logged or committed."
npm ci
npm run typecheck
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npx tauri icon src-tauri/app-icon.svg
# Tauri v2 uses APPLE_SIGNING_IDENTITY to override signingIdentity:"-".
# Tauri v2 notarizes when complete Apple account or App Store Connect credentials exist.
npm run tauri:build -- --target "$TARGET"
DMG="$(find "src-tauri/target/$TARGET/release/bundle/dmg" -maxdepth 1 -name '*.dmg' -type f -print -quit)"
[[ -n "$DMG" && -s "$DMG" ]] || { echo "Signed DMG is missing." >&2;exit 1; }
bash scripts/verify-macos-dmg.sh release "$DMG" "$TARGET"
shasum -a 256 "$DMG" > "$DMG.sha256"
{
  printf 'Sentinel Box signed/notarized CANDIDATE; native QA and explicit publication still required.\n'
  printf 'source_commit=%s\n' "$(git -C "$REPO" rev-parse HEAD)"
  printf 'architecture=%s\n' "$TARGET"
  printf 'artifact=%s\n' "$(basename "$DMG")"
  printf 'sha256=%s\n' "$(shasum -a 256 "$DMG" | awk '{print $1}')"
} > "$DMG.build.txt"
echo "Notarization candidate verified. Complete native Office + LAN QA before publication."
echo "DMG: $DMG"
echo "Checksum: $DMG.sha256"
echo "Build provenance: $DMG.build.txt"
