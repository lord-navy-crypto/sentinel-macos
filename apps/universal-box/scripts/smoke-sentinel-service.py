#!/usr/bin/env python3
"""End-to-end contract for the original bundled Go service (CI only)."""
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

engine = Path(__file__).resolve().parents[1] / "src-tauri/resources/sentinel/sentinel-engine"
if not engine.is_file():
    raise SystemExit("Sentinel Go engine was not bundled")
proc = subprocess.Popen([str(engine), "--desktop", "--no-browser", "--ephemeral"],
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                        text=True, bufsize=1, env={**os.environ, "SENTINEL_NO_BROWSER": "1"})
try:
    deadline = time.monotonic() + 20
    payload = None
    assert proc.stdout is not None
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("Sentinel engine stopped before bootstrap")
        ready, _, _ = select.select([proc.stdout], [], [], 0.2)
        if not ready:
            continue
        line = proc.stdout.readline().strip()
        if line.startswith("SENTINEL_DESKTOP_BOOTSTRAP "):
            payload = json.loads(line.split(" ", 1)[1])
            break
    if payload is None:
        raise RuntimeError("No engine bootstrap received")
    assert payload["origin"].startswith("http://127.0.0.1:")
    assert len(payload["token"]) == 48
    endpoint = payload["origin"] + "/api/overview"
    # Authentication is mandatory even on loopback.
    try:
        urllib.request.urlopen(endpoint, timeout=5)
        raise AssertionError("Unauthenticated API unexpectedly succeeded")
    except urllib.error.HTTPError as exc:
        assert exc.code == 401, f"expected 401, got {exc.code}"
    request = urllib.request.Request(endpoint, headers={"X-Sentinel-Token": payload["token"]})
    with urllib.request.urlopen(request, timeout=10) as response:
        data = json.load(response)
    assert isinstance(data, dict), "Expected Sentinel's native JSON response"
    print("PASS: embedded Sentinel Go engine bootstraps, requires authentication, serves original API")
finally:
    if proc.poll() is None:
        proc.send_signal(signal.SIGTERM)
    try:
        proc.communicate(timeout=8)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate(timeout=5)
