// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func scanContractSource(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil { t.Fatal(err) }
	return string(raw)
}

func TestScanCenterCapabilitiesAreNativeSentinel24Lenses(t *testing.T) {
	html := scanContractSource(t, "web/index.html")
	js := scanContractSource(t, "web/sentinel-24.js")
	for _, want := range []string{"missionRibbon", "lensRail", "evidenceStage", "/sentinel-24.js"} {
		if !strings.Contains(html, want) { t.Fatalf("Sentinel 2.4 HTML missing %q", want) }
	}
	for _, want := range []string{
		"/api/quick-check", "/api/security/audit", "/api/storage/jobs", "/api/storage/cancel",
		"renderStorage", "renderAudit", "runDeepSearch", "phase_percent", "permission_errors",
		"slow_paths_skipped", "hash_files_done", "hash_files_total", "hash_bytes_done", "hash_bytes_total",
	} {
		if !strings.Contains(js, want) { t.Fatalf("Sentinel 2.4 scan capability missing %q", want) }
	}
}

func TestScanCenterStorageReplacementStaysBoundedAndCancellable(t *testing.T) {
	js := scanContractSource(t, "web/sentinel-24.js")
	for _, want := range []string{
		`<option value="home">Home</option>`, `<option value="downloads">Downloads</option>`,
		`type="number" min="1" max="10240" value="100"`,
		`type="number" min="10" max="2000" value="200"`,
		`data-do="cancel-storage"`, "Bounded localhost request",
	} {
		if !strings.Contains(js, want) { t.Fatalf("Sentinel 2.4 storage acquisition missing bounded control %q", want) }
	}
	advanced := scanContractSource(t, "advanced.go")
	for _, want := range []string{"if req.MinMB < 1", "if req.MinMB > 1024*1024", "if req.Limit > 250", "context.WithCancel"} {
		if !strings.Contains(advanced, want) { t.Fatalf("storage backend bound missing %q", want) }
	}
}

func TestScanCenterReplacementSeparatesReadOnlyObservationFromMutation(t *testing.T) {
	js := scanContractSource(t, "web/sentinel-24.js")
	for _, fn := range []struct{start,end string}{
		{"async function renderSnapshot", "async function renderCases"},
		{"async function renderAudit", "async function renderObject"},
	} {
		start := strings.Index(js, fn.start)
		end := strings.Index(js, fn.end)
		if start < 0 || end <= start { t.Fatalf("could not isolate %q", fn.start) }
		segment := js[start:end]
		for _, bad := range []string{"/api/actions/execute", "/api/trust/capture", "sudo ", "rm -"} {
			if strings.Contains(segment, bad) { t.Fatalf("%s contains unsafe mutation pattern %q", fn.start, bad) }
		}
	}
}

func TestScanCenterJavaScriptIsReplacedBySentinel24InCI(t *testing.T) {
	ci := scanContractSource(t, ".github/workflows/v23-ci.yml")
	if !strings.Contains(ci, "node --check web/sentinel-24.js") {
		t.Fatal("Sentinel 2.4 JavaScript must be syntax-checked in CI")
	}
}
