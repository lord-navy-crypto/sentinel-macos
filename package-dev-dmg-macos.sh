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
SOURCE_SHA="$(git rev-parse --verify HEAD 2>/dev/null || true)"
[[ -n "$SOURCE_SHA" ]] || SOURCE_SHA="unknown"

./build-desktop-macos.sh
ROOT="$HERE/dist/dmg-root"
DMG="$HERE/dist/Sentinel-${VERSION}-${CHANNEL}.dmg"
TRUST="$HERE/dist/Sentinel-${VERSION}-${CHANNEL}.release-trust.json"
FEATURES="$HERE/dist/BUILD_FEATURES.txt"
rm -rf "$ROOT" "$DMG" "$DMG.sha256" "$TRUST"
mkdir -p "$ROOT"
ditto "$HERE/dist/Sentinel.app" "$ROOT/Sentinel.app"
ln -s /Applications "$ROOT/Applications"

VOLNAME="Sentinel ${VERSION}"
[[ "$CHANNEL" == "beta" ]] && VOLNAME="Sentinel ${VERSION} Beta"
hdiutil create -volname "$VOLNAME" -srcfolder "$ROOT" -ov -format UDZO "$DMG"
shasum -a 256 "$DMG" > "$DMG.sha256"
ARTIFACT_SHA="$(awk '{print $1}' "$DMG.sha256")"
GENERATED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
NATIVE_FSEVENTS=false
SECURITY_FRAMEWORK=false
if [[ -f "$FEATURES" ]] && \
   grep -Fxq 'arm64: native-fsevents+security-framework' "$FEATURES" && \
   grep -Fxq 'amd64: native-fsevents+security-framework' "$FEATURES"; then
  NATIVE_FSEVENTS=true
  SECURITY_FRAMEWORK=true
fi

cat > "$TRUST" <<EOF
{
  "schema": 1,
  "product": "Sentinel",
  "version": "$VERSION",
  "channel": "$CHANNEL",
  "source_commit": "$SOURCE_SHA",
  "artifact": "$(basename "$DMG")",
  "artifact_sha256": "$ARTIFACT_SHA",
  "universal_app": true,
  "native_fsevents": $NATIVE_FSEVENTS,
  "security_framework": $SECURITY_FRAMEWORK,
  "developer_id_signed": false,
  "hardened_runtime": false,
  "notarized": false,
  "stapled": false,
  "gatekeeper_verified": false,
  "generated_at": "$GENERATED_AT",
  "note": "Development/Beta evidence only. This artifact is unsigned and unnotarized; the trust manifest does not upgrade its distribution trust."
}
EOF
chmod 600 "$TRUST"

if [[ "$CHANNEL" == "beta" ]]; then
  printf '%s\n' \
    "Beta DMG created: $DMG" \
    "Checksum: $DMG.sha256" \
    "Trust manifest: $TRUST" \
    "UNSIGNED / UNNOTARIZED BETA — suitable for controlled GitHub/website testing, not a production notarized release."
else
  printf '%s\n' \
    "Development DMG created: $DMG" \
    "Trust manifest: $TRUST" \
    "UNSIGNED / UNNOTARIZED — for local development/testing only."
fi
