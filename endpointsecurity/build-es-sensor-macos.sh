#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
[[ "$(uname -s)" == "Darwin" ]] || { echo "Endpoint Security sensor can only be built on macOS." >&2; exit 2; }
[[ "${SENTINEL_BUILD_ES:-}" == "I_HAVE_APPLE_ES_ENTITLEMENT" ]] || {
  echo "Refusing to imply Endpoint Security is enabled." >&2
  echo "Request the Apple entitlement first, then set SENTINEL_BUILD_ES=I_HAVE_APPLE_ES_ENTITLEMENT." >&2
  exit 3
}
mkdir -p ../dist
clang -O2 -fblocks SentinelESSensor.c -framework EndpointSecurity -framework Foundation -o ../dist/sentinel-es-sensor
chmod 755 ../dist/sentinel-es-sensor
echo "Built notification-only sensor. It still must be correctly signed/packaged as a System Extension with Apple-approved entitlements."
