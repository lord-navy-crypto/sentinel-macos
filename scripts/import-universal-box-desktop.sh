#!/usr/bin/env bash
# One-time, non-destructive import of the standalone desktop app from Knowledge-Explorer.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_REPO="https://github.com/lord-navy-crypto/Knowledge-Explorer.git"
SOURCE_REF="${UNIVERSAL_BOX_SOURCE_REF:-main}"
DEST="$ROOT/apps/universal-box"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ -e "$DEST" ]]; then
  echo "Refusing to overwrite existing $DEST" >&2
  exit 1
fi
if [[ "$SOURCE_REF" != "main" ]]; then
  echo "This migration is pinned to the reviewed source branch: main" >&2
  exit 1
fi
git clone --quiet --depth 1 --branch "$SOURCE_REF" "$SOURCE_REPO" "$TMP/source"
SRC="$TMP/source/apps/daily-desk"
test -f "$SRC/package.json"
test -f "$SRC/src/App.tsx"
test -f "$SRC/src-tauri/tauri.conf.json"
mkdir -p "$ROOT/apps"
cp -R "$SRC" "$DEST"
# Build artifacts, dependency caches and local machine state are never imported.
find "$DEST" -type d \( -name node_modules -o -name target -o -name dist -o -name .git \) -prune -exec rm -rf {} +
find "$DEST" -type f \( -name '*.dmg' -o -name '*.app' -o -name '.env.local' \) -delete
SOURCE_SHA="$(git -C "$TMP/source" rev-parse HEAD)"
printf '%s\n' "$SOURCE_SHA" > "$DEST/IMPORT_SOURCE_COMMIT"
printf 'Imported Universal Box desktop at %s from %s commit %s\n' "$DEST" "$SOURCE_REPO" "$SOURCE_SHA"
echo "Sentinel macOS source files were left untouched."
