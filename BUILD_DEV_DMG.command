#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
./package-dev-dmg-macos.sh
open "$HERE/dist"
echo
echo "Unsigned development DMG created in dist/."
echo "Do not publish the dev DMG as a production release."
read -r -p "Press Return to close…" _
