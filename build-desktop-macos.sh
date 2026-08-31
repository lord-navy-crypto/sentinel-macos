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
UI_INDEX="$HERE/web/index.html"
UI_CORE="$HERE/web/app/core.js"
UI_STYLE="$HERE/web/app/shell.css"
UI_WORKBENCH="$HERE/web/app/workbench.js"
UI_SCAN_CENTER="$HERE/web/app/full-scan.js"
UI_ACTION_DOCK="$HERE/web/app/action-dock.js"
UI_MARKER="Sentinel 2.6 Native Frontend"
WORKBENCH_MARKER="Sentinel 2.6 Investigation Workbench"
SCAN_CENTER_MARKER="Sentinel 2.6 Full Scan Center"
ACTION_DOCK_MARKER="Sentinel 2.6 Contextual Action Dock"
BUILD_SHA="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"

# The canonical Sentinel 2.6 application is modular. These are product modules,
# not optional legacy workspaces. A clean build must refuse an incomplete source
# tree rather than silently packaging a stale or partially migrated UI.
REQUIRED_UI_FILES=(
  "web/app/core.js"
  "web/app/lenses/orient-investigate.js"
  "web/app/lenses/compare.js"
  "web/app/lenses/system.js"
  "web/app/lenses/act-limits.js"
  "web/app/advanced.js"
  "web/app/case-stories.js"
  "web/app/system-evidence.js"
  "web/app/workbench.js"
  "web/app/full-scan.js"
  "web/app/action-dock.js"
  "web/app/runtime.js"
  "web/app/shell.css"
  "web/app/advanced.css"
  "web/app/workbench.css"
  "web/app/full-scan.css"
  "web/app/action-dock.css"
)
REQUIRED_UI_SCRIPTS=(
  "/app/core.js"
  "/app/lenses/orient-investigate.js"
  "/app/lenses/compare.js"
  "/app/lenses/system.js"
  "/app/lenses/act-limits.js"
  "/app/advanced.js"
  "/app/case-stories.js"
  "/app/system-evidence.js"
  "/app/workbench.js"
  "/app/full-scan.js"
  "/app/action-dock.js"
  "/app/runtime.js"
)
REQUIRED_UI_STYLES=(
  "/app/shell.css"
  "/app/advanced.css"
  "/app/workbench.css"
  "/app/full-scan.css"
  "/app/action-dock.css"
)

for rel in "${REQUIRED_UI_FILES[@]}"; do
  if [[ ! -f "$HERE/$rel" ]]; then
    echo "Required Sentinel 2.6 product module is missing: $rel" >&2
    echo "Refusing to package an incomplete product source tree." >&2
    exit 2
  fi
done

if [[ -e "$HERE/web/app/scan-center.js" || -e "$HERE/web/app/scan-center.css" ]]; then
  echo "Retired Scan Center asset name returned under web/app; use full-scan.js/css for the current product." >&2
  exit 2
fi
if ! grep -Fq "$UI_MARKER" "$UI_CORE"; then
  echo "Sentinel 2.6 product marker missing from $UI_CORE: $UI_MARKER" >&2
  echo "Refusing to build an ambiguous or stale product source tree." >&2
  exit 2
fi
if ! grep -Fq "$WORKBENCH_MARKER" "$UI_WORKBENCH"; then
  echo "Sentinel 2.6 Investigation Workbench marker missing from $UI_WORKBENCH" >&2
  exit 2
fi
if ! grep -Fq "$SCAN_CENTER_MARKER" "$UI_SCAN_CENTER"; then
  echo "Sentinel 2.6 Full Scan Center marker missing from $UI_SCAN_CENTER" >&2
  exit 2
fi
if ! grep -Fq "$ACTION_DOCK_MARKER" "$UI_ACTION_DOCK"; then
  echo "Sentinel 2.6 Action Dock marker missing from $UI_ACTION_DOCK" >&2
  exit 2
fi
if ! grep -Fq ".s24-shell" "$UI_STYLE"; then
  echo "Sentinel 2.6 visual-system marker missing from $UI_STYLE" >&2
  exit 2
fi
if ! grep -Fq ".wb-matrix" "$HERE/web/app/workbench.css"; then
  echo "Investigation Workbench visual-system marker missing from workbench.css" >&2
  exit 2
fi
if ! grep -Fq ".capability-atlas" "$HERE/web/app/full-scan.css"; then
  echo "Full Scan Center visual-system marker missing from full-scan.css" >&2
  exit 2
fi
if ! grep -Fq ".s24-action-dock" "$HERE/web/app/action-dock.css"; then
  echo "Action Dock visual-system marker missing from action-dock.css" >&2
  exit 2
fi

previous_line=0
for src in "${REQUIRED_UI_SCRIPTS[@]}"; do
  line="$(grep -nF "<script src=\"$src\"></script>" "$UI_INDEX" | head -n1 | cut -d: -f1 || true)"
  if [[ -z "$line" ]]; then
    echo "Canonical index.html does not load required Sentinel 2.6 module: $src" >&2
    exit 2
  fi
  if (( line <= previous_line )); then
    echo "Sentinel 2.6 module load order is invalid near: $src" >&2
    exit 2
  fi
  previous_line="$line"
done
for href in "${REQUIRED_UI_STYLES[@]}"; do
  if ! grep -Fq "<link rel=\"stylesheet\" href=\"$href\">" "$UI_INDEX"; then
    echo "Canonical index.html does not load required Sentinel 2.6 style: $href" >&2
    exit 2
  fi
done

for retired in '/sentinel-24.js' '/sentinel-24.css' '/app.js' '/style.css' '/desktop-ui.js' '/app/scan-center.js' '/app/scan-center.css'; do
  if grep -Fq "$retired" "$UI_INDEX"; then
    echo "Default index.html still references retired frontend asset: $retired" >&2
    exit 2
  fi
done

# Verify the newest integrated product capabilities before the Go embed step.
if ! grep -Fq '/api/intelligence/graph/v2' "$HERE/web/app/advanced.js"; then
  echo "Advanced Evidence / Graph 2.0 capability is missing from canonical frontend." >&2
  exit 2
fi
if ! grep -Fq '/api/incidents/v2' "$HERE/web/app/case-stories.js"; then
  echo "Case Stories 2.0 capability is missing from canonical frontend." >&2
  exit 2
fi
if ! grep -Fq '/api/network/history' "$HERE/web/app/system-evidence.js"; then
  echo "Network History capability is missing from canonical frontend." >&2
  exit 2
fi
for marker in 'Interactive Evidence Graph 3.0' 'Unified Investigation Workspace' 'Evidence Bundle' 'Local Evidence Assistant' 'Product Onboarding'; do
  if ! grep -Fq "$marker" "$UI_WORKBENCH"; then
    echo "Investigation Workbench capability marker missing: $marker" >&2
    exit 2
  fi
done
for marker in 'Easy Scan' 'Full Scan' 'Complete Capability Atlas' 'Deep home-storage traversal & hash analysis' 'System Checkpoint 2.0'; do
  if ! grep -Fq "$marker" "$UI_SCAN_CENTER"; then
    echo "Full Scan Center capability marker missing: $marker" >&2
    exit 2
  fi
done
for marker in 'Easy Scan' 'Full Scan' 'Capture Checkpoint' 'Capture History' 'Open Cases' 'Review Changes' 'Inspect Storage' 'Compare Reference'; do
  if ! grep -Fq "$marker" "$UI_ACTION_DOCK"; then
    echo "Action Dock capability marker missing: $marker" >&2
    exit 2
  fi
done

echo "===== SENTINEL SOURCE IDENTITY ====="
echo "Source commit: $BUILD_SHA"
echo "Product version: $VERSION"
echo "Desktop UI: 2.6 Native Frontend"
echo "Canonical modules: ${#REQUIRED_UI_SCRIPTS[@]} scripts + ${#REQUIRED_UI_STYLES[@]} styles"
echo "Core UI marker: verified"
echo "Advanced capabilities: verified"
echo "Investigation Workbench: 30-function evolution verified"
echo "Full Scan Center: Easy Scan + comprehensive retained baseline + Capability Atlas verified"
echo "Contextual Action Dock: header scan controls + lens-specific quick actions + post-scan routing verified"
echo

./build-macos.sh

# The Go executable embeds web/* at compile time. Verify the actual canonical
# product, Workbench, Scan Center, and Action Dock markers in both engines.
for engine in "$HERE/dist/sentinel-macos-arm64" "$HERE/dist/sentinel-macos-x86_64"; do
  for marker in "$UI_MARKER" "$WORKBENCH_MARKER" "$SCAN_CENTER_MARKER" "$ACTION_DOCK_MARKER" '/api/intelligence/graph/v2' '/api/incidents/v2' '/api/network/history' 'Evidence Bundle' 'Deep home-storage traversal & hash analysis'; do
    if ! LC_ALL=C grep -aFq "$marker" "$engine"; then
      echo "Embedded Sentinel 2.6 marker missing from $engine: $marker" >&2
      echo "The Go binary does not contain the current modular web/app product. Aborting." >&2
      exit 2
    fi
  done
done
echo "Embedded Sentinel 2.6 product + Workbench + Full Scan Center + Action Dock: verified in arm64 + x86_64 engines"

# Build the native launcher completely before replacing the app bundle. If Swift
# or lipo fails, no partial Sentinel.app is left behind.
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
compile_shell(){
  local arch="$1" target="$2" out="$3"
  echo "Building Sentinel dual-view launcher for ${arch}..."
  xcrun --sdk macosx swiftc -O -whole-module-optimization \
    -sdk "$SDK_PATH" -target "${target}-apple-macos13.0" \
    "$SWIFT_SRC" -framework AppKit -framework WebKit -o "$out"
}

compile_shell arm64 arm64 "$BUILD_DIR/SentinelDesktop-arm64"
compile_shell x86_64 x86_64 "$BUILD_DIR/SentinelDesktop-x86_64"
lipo -create \
  "$BUILD_DIR/SentinelDesktop-arm64" "$BUILD_DIR/SentinelDesktop-x86_64" \
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
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/bin"
ditto "$BUILD_DIR/Sentinel" "$APP/Contents/MacOS/Sentinel"
chmod 755 "$APP/Contents/MacOS/Sentinel"

# Keep the Go engines architecture-specific. The universal launcher chooses the
# matching engine at runtime. Browser and App View use the same 2.4 product URL.
ditto "$HERE/dist/sentinel-macos-arm64" "$APP/Contents/Resources/bin/sentinel-macos-arm64"
ditto "$HERE/dist/sentinel-macos-x86_64" "$APP/Contents/Resources/bin/sentinel-macos-x86_64"
chmod 755 "$APP/Contents/Resources/bin/"sentinel-macos-*
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
  <key>SentinelSourceCommit</key><string>${BUILD_SHA}</string>
  <key>SentinelDesktopUI</key><string>2.6 Native Frontend</string>
  <key>SentinelWorkbench</key><string>30-function Investigation Workbench</string>
  <key>SentinelScanCenter</key><string>Easy Scan + Full Scan + Capability Atlas</string>
  <key>SentinelActionDock</key><string>Contextual Quick Actions</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
  </dict>
</dict></plist>
PLIST

plutil -lint "$APP/Contents/Info.plist"
printf '%s\n' \
  "Sentinel dual-view launcher created: $APP" \
  "Display name: Sentinel Mac" \
  "Bundle ID: $BUNDLE_ID" \
  "Version: $VERSION" \
  "Source commit: $BUILD_SHA" \
  "Desktop UI: 2.6 Native Frontend" \
  "Investigation Workbench: 30 integrated improvements" \
  "Scan Center: Easy Scan + Full Scan + Capability Atlas" \
  "Action Dock: contextual quick actions" \
  "Embedded UI: canonical modular product verified in arm64 + x86_64" \
  "Universal launcher: $(lipo -archs "$APP/Contents/MacOS/Sentinel")" \
  "App icon: $APP/Contents/Resources/AppIcon.icns" \
  "UI modes: browser + native WebKit App View, same Sentinel 2.6 product source" \
  "ATS: local networking only; no arbitrary-load exception" \
  "This build is not signed/notarized unless you run release-direct-macos.sh."
