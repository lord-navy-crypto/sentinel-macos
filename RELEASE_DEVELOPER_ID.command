#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
[[ "$(uname -s)" == "Darwin" ]] || { echo "This release helper must run on macOS."; read -r -p "Press Return…" _; exit 2; }
echo "Available Developer ID Application identities:"
security find-identity -v -p codesigning | grep 'Developer ID Application:' || true
echo
read -r -p "Paste the exact Developer ID Application identity: " identity
read -r -p "Notary Keychain profile [SentinelNotary]: " profile
profile="${profile:-SentinelNotary}"
export DEVELOPER_ID_APP="$identity"
export NOTARY_PROFILE="$profile"
./release-direct-macos.sh
open "$HERE/dist"
echo
read -r -p "Release completed. Press Return to close…" _
