#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
./build-desktop-macos.sh
open "$HERE/dist/Sentinel.app"
echo
echo "Sentinel.app was built and opened."
echo "For public distribution, use DIRECT_DISTRIBUTION_GUIDE.md and release-direct-macos.sh."
read -r -p "Press Return to close…" _
