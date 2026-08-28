#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) BIN="$HERE/dist/sentinel-macos-arm64" ;;
  x86_64) BIN="$HERE/dist/sentinel-macos-x86_64" ;;
  *)
    echo "Unsupported Mac architecture: $ARCH"
    read -r -p "Press Enter to close..."
    exit 1
    ;;
esac
if [ ! -x "$BIN" ]; then
  echo "Sentinel binary not found or not executable: $BIN"
  echo "Use a release package or run ./build-macos.sh from a developer checkout."
  read -r -p "Press Enter to close..."
  exit 1
fi
exec "$BIN" "$@"
