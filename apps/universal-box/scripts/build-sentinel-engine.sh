#!/usr/bin/env bash
# Bundle the unmodified original Sentinel Go service for the current macOS architecture.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT="$ROOT/apps/universal-box/src-tauri/resources/sentinel/sentinel-engine"
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Sentinel native engine bundling requires macOS" >&2
  exit 2
fi
case "${SENTINEL_TARGET_ARCH:-$(uname -m)}" in
  arm64|aarch64|aarch64-apple-darwin) ARCH=arm64 ;;
  x86_64|amd64|x86_64-apple-darwin) ARCH=amd64 ;;
  *) echo "Unsupported Sentinel macOS architecture" >&2; exit 2 ;;
esac
mkdir -p "$(dirname "$OUT")"
echo "Bundling original Sentinel Go engine for darwin/$ARCH"
(cd "$ROOT" && GOOS=darwin GOARCH="$ARCH" CGO_ENABLED=0 go build -trimpath -o "$OUT" .)
chmod 755 "$OUT"
"$OUT" --version
