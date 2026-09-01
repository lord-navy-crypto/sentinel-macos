#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

for tool in go curl grep awk sed; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "FAIL: $tool is required for this source-tree smoke test."
    exit 1
  fi
done

TMPDIR_SENTINEL="$(mktemp -d "${TMPDIR:-/tmp}/sentinel-smoke.XXXXXX")"
LOG="$TMPDIR_SENTINEL/engine.log"
FAILS=0
PASSES=0
ENGINE_PID=""

cleanup() {
  if [ -n "$ENGINE_PID" ] && kill -0 "$ENGINE_PID" 2>/dev/null; then
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    n=0
    while [ "$n" -lt 20 ]; do
      kill -0 "$ENGINE_PID" 2>/dev/null || break
      sleep 0.1
      n=$((n + 1))
    done
    kill -KILL "$ENGINE_PID" 2>/dev/null || true
  fi
  rm -rf "$TMPDIR_SENTINEL"
}
trap cleanup EXIT INT TERM

pass() { printf "PASS  %-34s %s\n" "$1" "${2-}"; PASSES=$((PASSES + 1)); }
fail() { printf "FAIL  %-34s %s\n" "$1" "${2-}"; FAILS=$((FAILS + 1)); }

echo "Sentinel 2.7 localhost functional smoke test"
echo "Mode: ephemeral / no persistent Behavior-Trust state / no mutating Safe Actions"
echo

go run . --ephemeral --no-browser --port 0 >"$LOG" 2>&1 &
ENGINE_PID=$!

OPEN_URL=""
n=0
while [ "$n" -lt 100 ]; do
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
    echo "FAIL: temporary Sentinel engine exited before becoming ready."
    cat "$LOG"
    exit 1
  fi
  OPEN_URL="$(awk '/^Open: http:\/\/127\.0\.0\.1:/{print $2; exit}' "$LOG")"
  [ -n "$OPEN_URL" ] && break
  sleep 0.15
  n=$((n + 1))
done

if [ -z "$OPEN_URL" ]; then
  echo "FAIL: temporary Sentinel engine did not publish a localhost URL."
  cat "$LOG"
  exit 1
fi

ORIGIN="${OPEN_URL%%/#token=*}"
TOKEN="${OPEN_URL##*#token=}"
HOSTPORT="${ORIGIN#http://}"
if [ -z "$ORIGIN" ] || [ -z "$TOKEN" ] || [ "$TOKEN" = "$OPEN_URL" ]; then
  echo "FAIL: could not parse localhost bootstrap URL."
  cat "$LOG"
  exit 1
fi

READY=0
n=0
while [ "$n" -lt 60 ]; do
  if curl -fsS --max-time 2 -H "X-Sentinel-Token: $TOKEN" "$ORIGIN/api/overview" >/dev/null 2>&1; then
    READY=1
    break
  fi
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then break; fi
  sleep 0.1
  n=$((n + 1))
done
if [ "$READY" -ne 1 ]; then
  echo "FAIL: temporary Sentinel localhost server never became HTTP-ready."
  cat "$LOG"
  exit 1
fi

pass "Ephemeral engine ready" "$ORIGIN"

check_static() {
  label="$1"; path="$2"; needle="$3"; outfile="$TMPDIR_SENTINEL/static.txt"
  if curl -fsS --max-time 15 "$ORIGIN$path" >"$outfile" && grep -Fq "$needle" "$outfile"; then
    pass "$label" "$path"
  else
    fail "$label" "$path missing: $needle"
  fi
}

check_absent() {
  label="$1"; path="$2"; needle="$3"; outfile="$TMPDIR_SENTINEL/absent.txt"
  if curl -fsS --max-time 15 "$ORIGIN$path" >"$outfile" && ! grep -Fq "$needle" "$outfile"; then
    pass "$label" "$needle absent"
  else
    fail "$label" "unexpected marker: $needle"
  fi
}

check_static "Canonical product shell" "/" 'data-sentinel-generation="2.7-native"'
check_static "Core application module" "/app/core.js" "Sentinel 2.7 Native Frontend"
check_static "Investigation Workbench" "/app/workbench.js" "Sentinel 2.7 Investigation Workbench"
check_static "Full Scan Center" "/app/full-scan.js" "Sentinel 2.7 Full Scan Center"
check_static "Contextual Action Dock" "/app/action-dock.js" "Sentinel 2.7 Contextual Action Dock"
check_static "WebLLM Local AI" "/app/ai.js" "Sentinel 2.7 WebLLM Local AI"
check_static "Local AI reliability" "/app/ai-reliability.js" "Sentinel 2.7 Local AI Reliability"
check_static "Local AI worker" "/app/ai-worker.js" "WebWorkerMLCEngineHandler"
check_static "Comprehensive Manual" "/app/manual.js" "Sentinel 2.7 Comprehensive User Manual"
check_static "Runtime navigation" "/app/runtime.js" "window.__SENTINEL_27__"
check_absent "No retired app.js" "/" 'src="/app.js"'
check_absent "No retired desktop UI" "/" '/desktop-ui.js'
check_absent "No inline product script" "/" '<script>'

HEADERS="$TMPDIR_SENTINEL/headers.txt"
if curl -fsS -D "$HEADERS" -o /dev/null --max-time 10 "$ORIGIN/"; then
  if grep -Fiq 'X-Sentinel-UI: 2.7-native' "$HEADERS"; then pass "Product identity header" "X-Sentinel-UI"; else fail "Product identity header" "missing X-Sentinel-UI"; fi
  if grep -Fiq "script-src 'self' 'wasm-unsafe-eval'" "$HEADERS" && ! grep -Fiq "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'" "$HEADERS"; then
    pass "Strict script CSP" "same-origin external product scripts"
  else
    fail "Strict script CSP" "missing or weakened"
  fi
  if grep -Fiq "worker-src 'self' blob:" "$HEADERS"; then pass "Worker CSP" "worker-src present"; else fail "Worker CSP" "worker-src missing"; fi
  if grep -Fiq 'frame-ancestors' "$HEADERS"; then pass "Frame protection CSP" "frame-ancestors present"; else fail "Frame protection CSP" "missing"; fi
else
  fail "Product response headers" "curl failed"
fi

# The local API must not be readable without the in-memory token.
UNAUTH_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$ORIGIN/api/overview" || true)"
if [ "$UNAUTH_CODE" = "401" ]; then pass "API token rejection" "HTTP 401 without token"; else fail "API token rejection" "expected 401, got $UNAUTH_CODE"; fi

# Host-header guard should reject a forged authority before API handling.
BAD_HOST_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 -H 'Host: attacker.invalid' -H "X-Sentinel-Token: $TOKEN" "$ORIGIN/api/overview" || true)"
if [ "$BAD_HOST_CODE" = "421" ]; then pass "Host header guard" "HTTP 421"; else fail "Host header guard" "expected 421, got $BAD_HOST_CODE"; fi

request() {
  label="$1"; method="$2"; path="$3"; data="${4-}"; outfile="$TMPDIR_SENTINEL/response.json"
  rm -f "$outfile"
  if [ "$method" = "POST" ]; then
    if [ -n "$data" ]; then
      curl -fsS --max-time 60 -X POST -H "X-Sentinel-Token: $TOKEN" -H "Content-Type: application/json" --data "$data" "$ORIGIN$path" >"$outfile" 2>/dev/null
    else
      curl -fsS --max-time 60 -X POST -H "X-Sentinel-Token: $TOKEN" "$ORIGIN$path" >"$outfile" 2>/dev/null
    fi
  else
    curl -fsS --max-time 60 -H "X-Sentinel-Token: $TOKEN" "$ORIGIN$path" >"$outfile" 2>/dev/null
  fi
  rc=$?
  if [ "$rc" -eq 0 ]; then
    pass "$label" "$method $path"
    return 0
  fi
  fail "$label" "$method $path"
  if [ -s "$outfile" ]; then head -c 500 "$outfile"; echo; fi
  return 1
}

# Core current-state surfaces.
request "Overview" GET "/api/overview" || true
request "System Profile" GET "/api/system-profile" || true
request "Capabilities" GET "/api/capabilities" || true
request "Visibility" GET "/api/visibility" || true
request "Coverage" GET "/api/coverage" || true
request "Quick Check" GET "/api/quick-check" || true
request "Review Queue" GET "/api/review-queue" || true
request "Security Audit" GET "/api/security/audit" || true
request "Weakness Audit" GET "/api/weakness-audit" || true
request "Processes" GET "/api/processes" || true
request "Startup Items" GET "/api/startup" || true
request "Network" GET "/api/network" || true
request "Network History" GET "/api/network/history" || true
request "Background Items" GET "/api/background" || true
request "Launch Services" GET "/api/launch-services" || true

# Bounded search and relationship surfaces.
request "Deep filename search" GET "/api/search/deep?q=sentinel_smoke_unlikely_93af&scope=downloads&limit=10" || true
request "Intelligence capture" POST "/api/intelligence/graph" || true
request "Evidence Graph v2" GET "/api/intelligence/graph/v2" || true
request "Grouped Timeline" GET "/api/intelligence/timeline/grouped" || true
request "Session Timeline" GET "/api/intelligence/timeline?limit=20" || true
request "Cases rebuild" POST "/api/incidents" || true
request "Case Stories v2" GET "/api/incidents/v2?history=1" || true

# Retained comparison surfaces are exercised in ephemeral memory only.
request "Persistence baseline" POST "/api/persistence" || true
request "Persistence status" GET "/api/persistence" || true
request "Behavior baseline" POST "/api/behavior" || true
request "Behavior status" GET "/api/behavior" || true
request "Behavior history" GET "/api/behavior/history" || true
request "Behavior health" GET "/api/behavior/health" || true
request "Trust profile ephemeral" POST "/api/trust/capture" || true
request "Trust compare" POST "/api/trust/compare" || true
request "Trust status" GET "/api/trust/status" || true
request "Trust history" GET "/api/trust/history" || true
request "Monitoring Snapshot" POST "/api/guided-snapshot" || true

# Read-only action/recovery health in ephemeral mode.
request "Safe Actions Status" GET "/api/actions/status" || true
request "Safe Actions Health" GET "/api/actions/health" || true
request "Vault Isolation" GET "/api/actions/vault/isolation" || true
request "Final Readiness" GET "/api/readiness" || true

# Change Monitor lifecycle.
if request "Change Monitor start" POST "/api/changes/start" '{"preset":"downloads","roots":[],"interval_ms":1500}'; then
  request "Change Monitor status" GET "/api/changes/status" || true
  request "Change Monitor events" GET "/api/changes/events" || true
  request "Change Monitor stop" POST "/api/changes/stop" || true
fi

# A deliberately enormous threshold keeps the smoke traversal small while still
# exercising real job creation, polling, and cancellation contracts.
if request "Storage job start" POST "/api/storage/jobs" '{"scope":"downloads","min_mb":1048576,"limit":10}'; then
  STORAGE_ID="$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$TMPDIR_SENTINEL/response.json" | head -1)"
  if [ -n "$STORAGE_ID" ]; then
    sleep 0.25
    if request "Storage job poll" GET "/api/storage/jobs?id=$STORAGE_ID"; then
      if grep -q '"status":"running"' "$TMPDIR_SENTINEL/response.json"; then
        request "Storage job cancel" POST "/api/storage/cancel?id=$STORAGE_ID" || true
      fi
    fi
  else
    fail "Storage job id" "response did not contain a job id"
  fi
fi

echo
echo "========================================"
echo "Sentinel 2.7 localhost smoke summary"
echo "PASS: $PASSES"
echo "FAIL: $FAILS"
echo "========================================"

if [ "$FAILS" -ne 0 ]; then
  echo "One or more current product/API contracts failed. Use the FAIL line(s) above for targeted repair."
  exit 1
fi

echo "All tested Sentinel 2.7 localhost assets, security boundaries, and function contracts responded successfully."
exit 0
