#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"; mkdir -p dist
HOST_OS="$(uname -s 2>/dev/null || true)"
FEATURES="$HERE/dist/BUILD_FEATURES.txt"
: > "$FEATURES"

build_one(){
  local arch="$1" out="$2" mode="fallback"
  if [[ "$HOST_OS" == "Darwin" ]] && command -v clang >/dev/null 2>&1; then
    echo "Attempting native macOS CGO build for $arch (FSEvents + Security.framework)."
    if CGO_ENABLED=1 GOOS=darwin GOARCH="$arch" go build -trimpath -ldflags="-s -w" -o "$out" .; then
      mode="native-fsevents+security-framework"
    else
      echo "Native CGO build for $arch failed; producing an explicitly labeled portable fallback binary." >&2
      CGO_ENABLED=0 GOOS=darwin GOARCH="$arch" go build -trimpath -ldflags="-s -w" -o "$out" .
    fi
  else
    echo "Cross-building portable macOS $arch binary (polling + CLI integrity fallback)."
    CGO_ENABLED=0 GOOS=darwin GOARCH="$arch" go build -trimpath -ldflags="-s -w" -o "$out" .
  fi
  printf '%s: %s\n' "$arch" "$mode" >> "$FEATURES"
}

build_one arm64 dist/sentinel-macos-arm64
build_one amd64 dist/sentinel-macos-x86_64
chmod +x dist/sentinel-macos-arm64 dist/sentinel-macos-x86_64
cp "$FEATURES" dist/CHANGE_MONITOR_MODE.txt
if command -v shasum >/dev/null 2>&1; then (cd dist && shasum -a 256 sentinel-macos-arm64 sentinel-macos-x86_64 > SHA256SUMS.txt); else (cd dist && sha256sum sentinel-macos-arm64 sentinel-macos-x86_64 > SHA256SUMS.txt); fi
cat "$FEATURES"
cat dist/SHA256SUMS.txt
