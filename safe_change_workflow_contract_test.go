// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "strings"
    "testing"
)

func TestSafeChangeWorkflowDepthContract(t *testing.T) {
    raw, err := os.ReadFile("web/app/lenses/act-limits.js")
    if err != nil { t.Fatal(err) }
    text := string(raw)
    markers := []string{
        "Sentinel 2.7 Safe Change Workflow",
        "previewFreshnessText",
        "actionPreviewFreshness",
        "safeActionExecuteButton",
        "This preview has expired. Create a fresh preview first.",
        "/api/actions/health",
        "/api/actions/journal",
        "/api/actions/vault",
        "Review in Safe Change",
        "data-safe-vault-restore",
        "previewActionRequest({action:'restore'",
        "execute-start",
        "execute-success",
        "Recovery journal refreshed",
        "not malware probability",
    }
    for _, marker := range markers {
        if !strings.Contains(text, marker) { t.Fatalf("Safe Change workflow missing %q", marker) }
    }
    logs, err := os.ReadFile("web/app/runtime-logs.js")
    if err != nil { t.Fatal(err) }
    if !strings.Contains(string(logs), `<option value="action">action</option>`) {
        t.Fatal("Runtime Logs missing action source filter")
    }
}
