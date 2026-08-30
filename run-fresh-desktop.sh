#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/dist/Sentinel.app"
BUNDLE_ID="io.github.lord-navy-crypto.sentinel"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "run-fresh-desktop.sh must run on macOS." >&2
  exit 2
fi
if [[ ! -d "$APP" ]]; then
  echo "Missing $APP" >&2
  echo "Build first with: ./build-desktop-macos.sh" >&2
  exit 2
fi

echo "Stopping any previously running Sentinel instance..."
osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
sleep 1
pkill -x Sentinel >/dev/null 2>&1 || true
pkill -x sentinel-macos-arm64 >/dev/null 2>&1 || true
pkill -x sentinel-macos-x86_64 >/dev/null 2>&1 || true
sleep 1

echo "===== PACKAGED SOURCE IDENTITY ====="
/usr/libexec/PlistBuddy -c 'Print :SentinelSourceCommit' "$APP/Contents/Info.plist" 2>/dev/null || echo "SentinelSourceCommit: missing"
/usr/libexec/PlistBuddy -c 'Print :SentinelDesktopUI' "$APP/Contents/Info.plist" 2>/dev/null || echo "SentinelDesktopUI: missing"
echo

echo "Launching a new instance from: $APP"
open -n "$APP"