#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
fail=0
ok(){ printf '✓ %s\n' "$1"; }
warn(){ printf '⚠ %s\n' "$1"; }

if [[ "$(uname -s)" == "Darwin" ]]; then ok "Running on macOS"; else warn "Not running on macOS"; fail=1; fi
if xcode-select -p >/dev/null 2>&1; then ok "Xcode command-line tools available: $(xcode-select -p)"; else warn "Xcode command-line tools are missing"; fail=1; fi

for tool in git go clang xcrun swiftc lipo ditto sips iconutil hdiutil codesign security plutil spctl shasum; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool available"; else warn "$tool missing"; fail=1; fi
done

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  sha="$(git rev-parse --verify HEAD 2>/dev/null || true)"
  if [[ -n "$sha" ]]; then ok "Release source commit: $sha"; else warn "Unable to resolve git HEAD"; fail=1; fi
  if [[ -z "$(git status --porcelain --untracked-files=normal 2>/dev/null)" ]]; then
    ok "Git working tree is clean"
  else
    warn "Git working tree is dirty; production release will refuse to run"
    git status --short 2>/dev/null | sed 's/^/  /'
    fail=1
  fi
else
  warn "This directory is not a readable Git working tree"
  fail=1
fi

identities="$(security find-identity -v -p codesigning 2>/dev/null || true)"
if printf '%s' "$identities" | grep -q 'Developer ID Application:'; then
  ok "Developer ID Application identity found"
  printf '%s\n' "$identities" | grep 'Developer ID Application:' | sed 's/^/  /'
else
  warn "No Developer ID Application identity found in this Keychain"
  fail=1
fi

if [[ -n "${DEVELOPER_ID_APP:-}" ]]; then
  if printf '%s' "$identities" | grep -Fq "$DEVELOPER_ID_APP"; then
    ok "DEVELOPER_ID_APP matches an available identity"
  else
    warn "DEVELOPER_ID_APP is set but does not match an available signing identity"
    fail=1
  fi
else
  warn "DEVELOPER_ID_APP is not set; release-direct-macos.sh requires it"
  fail=1
fi

PROFILE="${NOTARY_PROFILE:-SentinelNotary}"
if xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1; then
  ok "Notary profile '$PROFILE' works"
else
  warn "Notary profile '$PROFILE' failed verification. Create/fix it with xcrun notarytool store-credentials."
  fail=1
fi

if xcrun --find stapler >/dev/null 2>&1; then ok "Apple stapler tool available"; else warn "Apple stapler tool missing"; fail=1; fi

printf '\n'
if [[ "$fail" -eq 0 ]]; then
  echo "Production Mac release prerequisites are ready."
  echo "The release pipeline will still require both arm64 and x86_64 engines to build with native FSEvents + Security.framework."
else
  echo "Production release preflight FAILED. Fix the items above before signing/notarizing a DMG."
fi
read -r -p "Press Return to close…" _
exit "$fail"
