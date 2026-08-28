#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/build-desktop-macos.sh" "$@"
