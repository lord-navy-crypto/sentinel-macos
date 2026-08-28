#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-desktop-macos.sh must run on macOS because it compiles AppKit/WebKit code." >&2
  exit 2
fi
for tool in xcrun lipo ditto; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 2; }
done

VERSION="$(tr -d '[:space:]' < VERSION)"
BUNDLE_ID="${SENTINEL_BUNDLE_ID:-io.github.lord-navy-crypto.sentinel}"
APP="$HERE/dist/Sentinel.app"
SWIFT_SRC="$HERE/desktop/SentinelDesktop.swift"

./build-macos.sh
rm -rf "$APP" "$HERE/dist/desktop-build"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/bin" "$HERE/dist/desktop-build"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
compile_shell(){
  local arch="$1" target="$2" out="$3"
  echo "Building native Sentinel desktop shell for ${arch}..."
  xcrun --sdk macosx swiftc -O -whole-module-optimization \
    -sdk "$SDK_PATH" -target "${target}-apple-macos13.0" \
    "$SWIFT_SRC" -framework AppKit -framework WebKit -o "$out"
}
compile_shell arm64 arm64 "$HERE/dist/desktop-build/SentinelDesktop-arm64"
compile_shell x86_64 x86_64 "$HERE/dist/desktop-build/SentinelDesktop-x86_64"
lipo -create \
  "$HERE/dist/desktop-build/SentinelDesktop-arm64" \
  "$HERE/dist/desktop-build/SentinelDesktop-x86_64" \
  -output "$APP/Contents/MacOS/Sentinel"
chmod 755 "$APP/Contents/MacOS/Sentinel"

# Keep the Go engines architecture-specific. The universal native shell chooses the
# matching engine at runtime, which avoids hiding native/fallback differences.
ditto "$HERE/dist/sentinel-macos-arm64" "$APP/Contents/Resources/bin/sentinel-macos-arm64"
ditto "$HERE/dist/sentinel-macos-x86_64" "$APP/Contents/Resources/bin/sentinel-macos-x86_64"
chmod 755 "$APP/Contents/Resources/bin/"sentinel-macos-*

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Sentinel</string>
  <key>CFBundleDisplayName</key><string>Sentinel</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>Sentinel</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict>
    <key>NSAllowsLocalNetworking</key><true/>
  </dict>
</dict></plist>
PLIST

plutil -lint "$APP/Contents/Info.plist"
printf '%s\n' \
  "Native desktop app created: $APP" \
  "Bundle ID: $BUNDLE_ID" \
  "Version: $VERSION" \
  "This build is not signed/notarized unless you run release-direct-macos.sh."
