// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "strings"
    "testing"
)

func requireInvestigationDepthMarker(t *testing.T, path string, markers ...string) {
    t.Helper()
    raw, err := os.ReadFile(path)
    if err != nil { t.Fatalf("read %s: %v", path, err) }
    text := string(raw)
    for _, marker := range markers {
        if !strings.Contains(text, marker) { t.Fatalf("%s missing investigation-depth marker %q", path, marker) }
    }
}

func TestFullScanWorkbenchInvestigationDepthContract(t *testing.T) {
    requireInvestigationDepthMarker(t, "web/app/full-scan.js",
        "sentinel.fullScan.lastRun.v1",
        "full-scan-stage-start",
        "full-scan-stage-finished",
        "persistFullScanSummary",
        "durationMs",
        "S.Workbench.recordEvent",
    )
    requireInvestigationDepthMarker(t, "web/app/workbench.js",
        "Sentinel 2.7 Investigation Continuity",
        "workflow completeness",
        "recordEvent('selection'",
        "attach-last-full-scan",
        "scanSnapshots",
        "Investigation continuity & activity",
    )
    requireInvestigationDepthMarker(t, "web/app/runtime-logs.js", "<option value=\"workbench\">workbench</option>")
}
