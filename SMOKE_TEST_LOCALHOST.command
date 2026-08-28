#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

if ! command -v go >/dev/null 2>&1; then
  echo "FAIL: Go is required for this source-tree smoke test."
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "FAIL: curl is required."
  exit 1
fi

TMPDIR_SENTINEL="$(mktemp -d "${TMPDIR:-/tmp}/sentinel-smoke.XXXXXX")"
LOG="$TMPDIR_SENTINEL/engine.log"
FAILS=0
PASSES=0
ENGINE_PID=""

cleanup() {
  if [ -n "$ENGINE_PID" ] && kill -0 "$ENGINE_PID" 2>/dev/null; then
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$ENGINE_PID" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL "$ENGINE_PID" 2>/dev/null || true
  fi
  rm -rf "$TMPDIR_SENTINEL"
}
trap cleanup EXIT INT TERM

echo "Sentinel localhost functional smoke test"
echo "Mode: ephemeral / read-only user-file behavior"
echo "This temporary instance does not persist Behavior/Trust history and does not execute Safe Actions."
echo

go run . --ephemeral --no-browser --port 0 >"$LOG" 2>&1 &
ENGINE_PID=$!

OPEN_URL=""
for _ in $(seq 1 80); do
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
    echo "FAIL: temporary Sentinel engine exited before becoming ready."
    cat "$LOG"
    exit 1
  fi
  OPEN_URL="$(awk '/^Open: http:\/\/127\.0\.0\.1:/{print $2; exit}' "$LOG")"
  [ -n "$OPEN_URL" ] && break
  sleep 0.15
done

if [ -z "$OPEN_URL" ]; then
  echo "FAIL: temporary Sentinel engine did not publish a localhost URL."
  cat "$LOG"
  exit 1
fi

ORIGIN="${OPEN_URL%%/#token=*}"
TOKEN="${OPEN_URL##*#token=}"
if [ -z "$ORIGIN" ] || [ -z "$TOKEN" ] || [ "$TOKEN" = "$OPEN_URL" ]; then
  echo "FAIL: could not parse localhost bootstrap URL."
  cat "$LOG"
  exit 1
fi

echo "Temporary engine: $ORIGIN"
echo

request() {
  label="$1"
  method="$2"
  path="$3"
  data="${4-}"
  outfile="$TMPDIR_SENTINEL/response.json"
  rm -f "$outfile"

  if [ "$method" = "POST" ]; then
    if [ -n "$data" ]; then
      if curl -fsS --max-time 30 -X POST \
        -H "X-Sentinel-Token: $TOKEN" \
        -H "Content-Type: application/json" \
        --data "$data" "$ORIGIN$path" >"$outfile"; then
        printf "PASS  %-30s %s %s\n" "$label" "$method" "$path"
        PASSES=$((PASSES + 1))
        return 0
      fi
    else
      if curl -fsS --max-time 30 -X POST \
        -H "X-Sentinel-Token: $TOKEN" \
        "$ORIGIN$path" >"$outfile"; then
        printf "PASS  %-30s %s %s\n" "$label" "$method" "$path"
        PASSES=$((PASSES + 1))
        return 0
      fi
    fi
  else
    if curl -fsS --max-time 30 \
      -H "X-Sentinel-Token: $TOKEN" \
      "$ORIGIN$path" >"$outfile"; then
      printf "PASS  %-30s %s %s\n" "$label" "$method" "$path"
      PASSES=$((PASSES + 1))
      return 0
    fi
  fi

  printf "FAIL  %-30s %s %s\n" "$label" "$method" "$path"
  if [ -s "$outfile" ]; then
    head -c 500 "$outfile"; echo
  fi
  FAILS=$((FAILS + 1))
  return 1
}

# Baseline read-only API coverage.
request "Overview" GET "/api/overview" || true
request "System Profile" GET "/api/system-profile" || true
request "Capabilities" GET "/api/capabilities" || true
request "Quick Check" GET "/api/quick-check" || true
request "Security Audit" GET "/api/security/audit" || true
request "Visibility Coverage" GET "/api/coverage" || true
request "Weakness Audit" GET "/api/weakness-audit" || true
request "Processes" GET "/api/processes" || true
request "Startup Items" GET "/api/startup" || true
request "Network" GET "/api/network" || true
request "Background Items" GET "/api/background" || true
request "Safe Actions Status" GET "/api/actions/status" || true
request "Safe Actions Health" GET "/api/actions/health" || true
request "Final Readiness" GET "/api/readiness" || true

# Session/baseline flows. The engine is ephemeral, so these state changes exist
# only inside this temporary smoke-test process and disappear at exit.
request "Persistence baseline" POST "/api/persistence" || true
request "Persistence status" GET "/api/persistence" || true
request "Intelligence snapshot" POST "/api/intelligence/graph" || true
request "Session timeline" GET "/api/intelligence/timeline?limit=20" || true
request "Behavior baseline" POST "/api/behavior" || true
request "Behavior status" GET "/api/behavior" || true
request "Behavior health" GET "/api/behavior/health" || true
request "Trust profile (ephemeral)" POST "/api/trust/capture" || true
request "Trust compare" POST "/api/trust/compare" || true
request "Trust status" GET "/api/trust/status" || true
request "Monitoring Snapshot" POST "/api/guided-snapshot" || true
request "Review Queue" GET "/api/review-queue" || true
request "Incidents" POST "/api/incidents" || true

# Change Monitor lifecycle: start a bounded Downloads watch, read status, stop.
if request "Change Monitor start" POST "/api/changes/start" '{"preset":"downloads","roots":[],"interval_ms":1500}'; then
  request "Change Monitor status" GET "/api/changes/status" || true
  request "Change Monitor events" GET "/api/changes/events" || true
  request "Change Monitor stop" POST "/api/changes/stop" || true
fi

# Storage job lifecycle: start a bounded scan, observe at least one job response,
# then cancel if it is still running. A huge minimum file size avoids duplicate
# hashing work; the test is about job wiring/lifecycle, not finding files.
if request "Storage job start" POST "/api/storage/jobs" '{"scope":"downloads","min_mb":1048576,"limit":10}'; then
  STORAGE_ID="$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$TMPDIR_SENTINEL/response.json" | head -1)"
  if [ -n "$STORAGE_ID" ]; then
    sleep 0.35
    if request "Storage job poll" GET "/api/storage/jobs?id=$STORAGE_ID"; then
      if grep -q '"status":"running"' "$TMPDIR_SENTINEL/response.json"; then
        request "Storage job cancel" POST "/api/storage/cancel?id=$STORAGE_ID" || true
      fi
    fi
  else
    echo "FAIL  Storage job id                response did not contain a job id"
    FAILS=$((FAILS + 1))
  fi
fi

echo
echo "========================================"
echo "Sentinel localhost smoke-test summary"
echo "PASS: $PASSES"
echo "FAIL: $FAILS"
echo "========================================"

if [ "$FAILS" -ne 0 ]; then
  echo "One or more localhost functions failed. Use the FAIL line(s) above for targeted repair."
  exit 1
fi

echo "All tested localhost function contracts responded successfully."
exit 0
