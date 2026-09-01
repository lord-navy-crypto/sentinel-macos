#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "reinstall-macos.sh must run on macOS." >&2
  exit 2
fi

VERSION="$(tr -d '[:space:]' < VERSION)"
BUNDLE_ID="io.github.lord-navy-crypto.sentinel"
BUILT_APP="$HERE/dist/Sentinel.app"
TARGET_APP="${SENTINEL_INSTALL_APP:-/Applications/Sentinel.app}"
EXPECTED_UI="2.7 Native Frontend"
EXPECTED_WORKBENCH="30-function Investigation Workbench"
EXPECTED_SCAN_CENTER="Easy Scan + Full Scan + Capability Atlas"
EXPECTED_ACTION_DOCK="Contextual Quick Actions"
REQUIRED_EMBEDDED_MARKERS=(
  "Sentinel 2.7 Native Frontend"
  "Sentinel 2.6 Investigation Workbench"
  "Sentinel 2.6 Full Scan Center"
  "Sentinel 2.6 Contextual Action Dock"
  "Sentinel 2.7 WebLLM Local AI"
  "Sentinel 2.6 Integrated Local AI"
  "Sentinel 2.6 Local AI Reliability"
  "Sentinel 2.6 Comprehensive User Manual"
  "Local AI initialization stalled"
)

verify_embedded_product() {
  local app="$1" label="$2"
  local engine marker
  for engine in "$app/Contents/Resources/bin/sentinel-macos-arm64" "$app/Contents/Resources/bin/sentinel-macos-x86_64"; do
    if [[ ! -x "$engine" ]]; then
      echo "$label is missing an executable engine: $engine" >&2
      return 2
    fi
    for marker in "${REQUIRED_EMBEDDED_MARKERS[@]}"; do
      if ! LC_ALL=C grep -aFq "$marker" "$engine"; then
        echo "$label engine is missing current product marker: $marker" >&2
        return 2
      fi
    done
  done
}

printf '%s\n' \
  "===== SENTINEL CLEAN REINSTALL =====" \
  "Target version: $VERSION" \
  "Target UI: $EXPECTED_UI" \
  "Target Workbench: $EXPECTED_WORKBENCH" \
  "Target Scan Center: $EXPECTED_SCAN_CENTER" \
  "Target Action Dock: $EXPECTED_ACTION_DOCK" \
  "Local AI: WebLLM + CSP-safe reliability + evidence fallback required" \
  "Manual: Sentinel 2.6 comprehensive guide required" \
  "Source: $HERE" \
  "Install target: $TARGET_APP" \
  "User history/baselines/recovery data: preserved"

echo
echo "Stopping all existing Sentinel processes..."
osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
sleep 1
pkill -x Sentinel >/dev/null 2>&1 || true
pkill -x sentinel-macos-arm64 >/dev/null 2>&1 || true
pkill -x sentinel-macos-x86_64 >/dev/null 2>&1 || true
sleep 1

echo
echo "Building a fresh universal app from this source tree..."
chmod +x "$HERE/build-desktop-macos.sh"
"$HERE/build-desktop-macos.sh"

if [[ ! -d "$BUILT_APP" ]]; then
  echo "Fresh build did not produce $BUILT_APP" >&2
  exit 2
fi

PACKAGED_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$BUILT_APP/Contents/Info.plist")"
PACKAGED_UI="$(/usr/libexec/PlistBuddy -c 'Print :SentinelDesktopUI' "$BUILT_APP/Contents/Info.plist")"
PACKAGED_WORKBENCH="$(/usr/libexec/PlistBuddy -c 'Print :SentinelWorkbench' "$BUILT_APP/Contents/Info.plist")"
PACKAGED_SCAN_CENTER="$(/usr/libexec/PlistBuddy -c 'Print :SentinelScanCenter' "$BUILT_APP/Contents/Info.plist")"
PACKAGED_ACTION_DOCK="$(/usr/libexec/PlistBuddy -c 'Print :SentinelActionDock' "$BUILT_APP/Contents/Info.plist")"
PACKAGED_SHA="$(/usr/libexec/PlistBuddy -c 'Print :SentinelSourceCommit' "$BUILT_APP/Contents/Info.plist")"

if [[ "$PACKAGED_VERSION" != "$VERSION" ]]; then
  echo "Version mismatch: VERSION=$VERSION but package=$PACKAGED_VERSION" >&2
  exit 2
fi
if [[ "$PACKAGED_UI" != "$EXPECTED_UI" ]]; then
  echo "Unexpected packaged UI: $PACKAGED_UI (expected $EXPECTED_UI)" >&2
  exit 2
fi
if [[ "$PACKAGED_WORKBENCH" != "$EXPECTED_WORKBENCH" ]]; then
  echo "Unexpected packaged Workbench: $PACKAGED_WORKBENCH (expected $EXPECTED_WORKBENCH)" >&2
  exit 2
fi
if [[ "$PACKAGED_SCAN_CENTER" != "$EXPECTED_SCAN_CENTER" ]]; then
  echo "Unexpected packaged Scan Center: $PACKAGED_SCAN_CENTER (expected $EXPECTED_SCAN_CENTER)" >&2
  exit 2
fi
if [[ "$PACKAGED_ACTION_DOCK" != "$EXPECTED_ACTION_DOCK" ]]; then
  echo "Unexpected packaged Action Dock: $PACKAGED_ACTION_DOCK (expected $EXPECTED_ACTION_DOCK)" >&2
  exit 2
fi
verify_embedded_product "$BUILT_APP" "Freshly built Sentinel.app"

install_app() {
  local source="$1" target="$2"
  if [[ -e "$target" ]]; then
    rm -rf "$target"
  fi
  ditto "$source" "$target"
}

echo
echo "Replacing installed application bundle..."
TARGET_PARENT="$(dirname "$TARGET_APP")"
if [[ -w "$TARGET_PARENT" ]]; then
  install_app "$BUILT_APP" "$TARGET_APP"
else
  echo "Administrator permission is required to replace $TARGET_APP"
  sudo rm -rf "$TARGET_APP"
  sudo ditto "$BUILT_APP" "$TARGET_APP"
fi

INSTALLED_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$TARGET_APP/Contents/Info.plist")"
INSTALLED_UI="$(/usr/libexec/PlistBuddy -c 'Print :SentinelDesktopUI' "$TARGET_APP/Contents/Info.plist")"
INSTALLED_WORKBENCH="$(/usr/libexec/PlistBuddy -c 'Print :SentinelWorkbench' "$TARGET_APP/Contents/Info.plist")"
INSTALLED_SCAN_CENTER="$(/usr/libexec/PlistBuddy -c 'Print :SentinelScanCenter' "$TARGET_APP/Contents/Info.plist")"
INSTALLED_ACTION_DOCK="$(/usr/libexec/PlistBuddy -c 'Print :SentinelActionDock' "$TARGET_APP/Contents/Info.plist")"
INSTALLED_SHA="$(/usr/libexec/PlistBuddy -c 'Print :SentinelSourceCommit' "$TARGET_APP/Contents/Info.plist")"

if [[ "$INSTALLED_VERSION" != "$VERSION" || "$INSTALLED_UI" != "$EXPECTED_UI" || "$INSTALLED_WORKBENCH" != "$EXPECTED_WORKBENCH" || "$INSTALLED_SCAN_CENTER" != "$EXPECTED_SCAN_CENTER" || "$INSTALLED_ACTION_DOCK" != "$EXPECTED_ACTION_DOCK" ]]; then
  echo "Installed application identity verification failed." >&2
  echo "Version: $INSTALLED_VERSION (expected $VERSION)" >&2
  echo "UI: $INSTALLED_UI (expected $EXPECTED_UI)" >&2
  echo "Workbench: $INSTALLED_WORKBENCH (expected $EXPECTED_WORKBENCH)" >&2
  echo "Scan Center: $INSTALLED_SCAN_CENTER (expected $EXPECTED_SCAN_CENTER)" >&2
  echo "Action Dock: $INSTALLED_ACTION_DOCK (expected $EXPECTED_ACTION_DOCK)" >&2
  exit 2
fi
verify_embedded_product "$TARGET_APP" "Installed Sentinel.app"

cat <<EOF

===== INSTALLED SENTINEL =====
Version: $INSTALLED_VERSION
Desktop UI: $INSTALLED_UI
Investigation Workbench: $INSTALLED_WORKBENCH
Scan Center: $INSTALLED_SCAN_CENTER
Action Dock: $INSTALLED_ACTION_DOCK
Local AI: embedded runtime + reliability markers verified in arm64/x86_64 engines
Manual: embedded current guide verified
Source commit: $INSTALLED_SHA
Path: $TARGET_APP

The application bundle was fully replaced. Sentinel user history, baselines,
and recovery metadata were intentionally left untouched.
EOF

echo "Launching the newly installed copy as a fresh process..."
open -n "$TARGET_APP"
