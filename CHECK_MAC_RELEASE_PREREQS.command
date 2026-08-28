#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
fail=0
ok(){ printf '✓ %s\n' "$1"; }
warn(){ printf '⚠ %s\n' "$1"; }
if [[ "$(uname -s)" == "Darwin" ]]; then ok "Running on macOS"; else warn "Not running on macOS"; fail=1; fi
if xcode-select -p >/dev/null 2>&1; then ok "Xcode command-line tools available: $(xcode-select -p)"; else warn "Xcode command-line tools are missing"; fail=1; fi
for tool in xcrun swiftc lipo hdiutil codesign security plutil; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool available"; else warn "$tool missing"; fail=1; fi
done
identities="$(security find-identity -v -p codesigning 2>/dev/null || true)"
if printf '%s' "$identities" | grep -q 'Developer ID Application:'; then
  ok "Developer ID Application identity found"
  printf '%s\n' "$identities" | grep 'Developer ID Application:' | sed 's/^/  /'
else
  warn "No Developer ID Application identity found in this Keychain"
fi
if xcrun notarytool history --keychain-profile "${NOTARY_PROFILE:-SentinelNotary}" >/dev/null 2>&1; then
  ok "Notary profile '${NOTARY_PROFILE:-SentinelNotary}' works"
else
  warn "Notary profile '${NOTARY_PROFILE:-SentinelNotary}' not verified. Create one with: xcrun notarytool store-credentials SentinelNotary"
fi
printf '\n'
if [[ "$fail" -eq 0 ]]; then
  echo "Core Mac build prerequisites are present."
else
  echo "Fix the warnings above before building the production DMG."
fi
read -r -p "Press Return to close…" _
exit "$fail"
