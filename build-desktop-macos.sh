#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-desktop-macos.sh must run on macOS because it compiles AppKit/WebKit code." >&2
  exit 2
fi
for tool in xcrun lipo ditto sips iconutil plutil; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 2; }
done

VERSION="$(tr -d '[:space:]' < VERSION)"
BUNDLE_ID="${SENTINEL_BUNDLE_ID:-io.github.lord-navy-crypto.sentinel}"
APP="$HERE/dist/Sentinel.app"
BUILD_DIR="$HERE/dist/desktop-build"
SWIFT_SRC="$HERE/desktop/SentinelDesktop.swift"
ICON_SRC="$HERE/desktop/GenerateAppIcon.swift"
REFINEMENT_SRC="$HERE/desktop/DesktopRefinement.js"

./build-macos.sh

# Build the native shell completely before replacing the app bundle. If Swift or
# lipo fails, no partial Sentinel.app is left behind.
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
compile_shell(){
  local arch="$1" target="$2" out="$3"
  echo "Building native Sentinel desktop shell for ${arch}..."
  xcrun --sdk macosx swiftc -O -whole-module-optimization \
    -sdk "$SDK_PATH" -target "${target}-apple-macos13.0" \
    "$SWIFT_SRC" -framework AppKit -framework WebKit -o "$out"
}

compile_shell arm64 arm64 "$BUILD_DIR/SentinelDesktop-arm64"
compile_shell x86_64 x86_64 "$BUILD_DIR/SentinelDesktop-x86_64"
lipo -create \
  "$BUILD_DIR/SentinelDesktop-arm64" \
  "$BUILD_DIR/SentinelDesktop-x86_64" \
  -output "$BUILD_DIR/Sentinel"
chmod 755 "$BUILD_DIR/Sentinel"

echo "Generating monochrome Sentinel Mac app icon..."
xcrun --sdk macosx swiftc "$ICON_SRC" -framework AppKit -o "$BUILD_DIR/GenerateAppIcon"
"$BUILD_DIR/GenerateAppIcon" "$BUILD_DIR/AppIcon-1024.png"
ICONSET="$BUILD_DIR/AppIcon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
sips -z 16 16     "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32     "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32     "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64     "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128   "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256   "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512   "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$BUILD_DIR/AppIcon-1024.png" --out "$ICONSET/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET" -o "$BUILD_DIR/AppIcon.icns"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/bin" "$APP/Contents/Resources/ui"
ditto "$BUILD_DIR/Sentinel" "$APP/Contents/MacOS/Sentinel"
chmod 755 "$APP/Contents/MacOS/Sentinel"

# Keep the Go engines architecture-specific. The universal native shell chooses the
# matching engine at runtime, which avoids hiding native/fallback differences.
ditto "$HERE/dist/sentinel-macos-arm64" "$APP/Contents/Resources/bin/sentinel-macos-arm64"
ditto "$HERE/dist/sentinel-macos-x86_64" "$APP/Contents/Resources/bin/sentinel-macos-x86_64"
chmod 755 "$APP/Contents/Resources/bin/"sentinel-macos-*

# Desktop-only visual refinements intentionally sit outside the embedded web UI so
# the browser/debug interface and engine remain unchanged.
ditto "$REFINEMENT_SRC" "$APP/Contents/Resources/ui/DesktopRefinement.js"
ditto "$BUILD_DIR/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Sentinel Mac</string>
  <key>CFBundleDisplayName</key><string>Sentinel Mac</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>Sentinel</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
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
  "Display name: Sentinel Mac" \
  "Bundle ID: $BUNDLE_ID" \
  "Version: $VERSION" \
  "Universal shell: $(lipo -archs "$APP/Contents/MacOS/Sentinel")" \
  "App icon: $APP/Contents/Resources/AppIcon.icns" \
  "This build is not signed/notarized unless you run release-direct-macos.sh."
