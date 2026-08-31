// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestFullScanCenterIsCanonicalProductModule(t *testing.T) {
	html, err := os.ReadFile("web/index.html")
	if err != nil { t.Fatal(err) }
	s := string(html)
	for _, want := range []string{"/app/full-scan.css", "/app/full-scan.js", "/app/runtime.js"} {
		if !strings.Contains(s, want) { t.Fatalf("canonical product missing %q", want) }
	}
	if strings.Index(s, "/app/full-scan.js") > strings.Index(s, "/app/runtime.js") {
		t.Fatal("Full Scan Center must register/enhance Status before runtime bootstrap")
	}
	for _, retired := range []string{"/app/scan-center.css", "/app/scan-center.js"} {
		if strings.Contains(s, retired) { t.Fatalf("canonical product revived retired Scan Center asset %q", retired) }
	}
}

func TestFullScanCenterUsesRealRetainedEvidenceChain(t *testing.T) {
	raw, err := os.ReadFile("web/app/full-scan.js")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, want := range []string{
		"Sentinel 2.6 Full Scan Center", "Easy Scan", "Full Scan", "Complete Capability Atlas",
		"/api/visibility", "/api/coverage", "/api/capabilities", "/api/overview", "/api/system-profile",
		"/api/processes", "/api/startup", "/api/background", "/api/network", "/api/launch-services",
		"/api/security/audit", "/api/quick-check", "/api/guided-snapshot", "/api/intelligence/graph",
		"/api/intelligence/graph/v2", "/api/intelligence/timeline/grouped", "/api/incidents", "/api/incidents/v2",
		"system-snapshot-capture", "/api/network/history", "/api/storage/jobs", "/api/storage/cancel",
		"storage-snapshot-capture", "/api/readiness", "/api/actions/health", "recovery", "/api/review-queue",
		"/api/behavior/history", "/api/trust/status", "/api/persistence",
	} {
		if !strings.Contains(s, want) { t.Fatalf("Full Scan Center missing real evidence contract %q", want) }
	}
}

func TestFullScanCenterPreservesSafetyAndFreshnessBoundaries(t *testing.T) {
	raw, err := os.ReadFile("web/app/full-scan.js")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, want := range []string{
		"does not modify user files", "Full Scan never starts automatically", "explicit user action",
		"Re-run only when you want newer evidence", "slow path(s) skipped", "Full Scan cancelled",
	} {
		if !strings.Contains(s, want) { t.Fatalf("Full Scan safety/freshness boundary missing %q", want) }
	}
	for _, forbidden := range []string{"/api/actions/execute", "/api/actions/delete", "permanent delete", "malware-free guarantee"} {
		if strings.Contains(strings.ToLower(s), strings.ToLower(forbidden)) {
			t.Fatalf("Full Scan must not contain unsafe mutation/verdict contract %q", forbidden)
		}
	}
}

func TestFullScanStartupIsLightweightAndNonBlocking(t *testing.T) {
	raw, err := os.ReadFile("web/app/full-scan.js")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, want := range []string{
		"readBaselineState(includeAnalysis = true)", "readBaselineState(false)",
		"if (includeAnalysis)", "setTimeout(() => { injectScanCenter().catch(() => {}); }, 0)",
		"Never block first paint", "never start Full Scan here", "await new Promise(resolve => setTimeout(resolve, 0))",
	} {
		if !strings.Contains(s, want) { t.Fatalf("lightweight Full Scan startup guard missing %q", want) }
	}
}

func TestCapabilityAtlasCoversAllPrimaryLenses(t *testing.T) {
	raw, err := os.ReadFile("web/app/full-scan.js")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, lens := range []string{
		"status", "snapshot", "cases", "search", "relations", "audit", "object",
		"changes", "behavior", "reference", "machine", "processes", "startup", "persistence",
		"background", "network", "storage", "reclaim", "change", "visibility", "guide",
	} {
		if !strings.Contains(s, "'"+lens+"'") { t.Fatalf("capability atlas missing lens %q", lens) }
	}
}

func TestScanCenterVisualSystemIsResponsiveAndWide(t *testing.T) {
	raw, err := os.ReadFile("web/app/full-scan.css")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, want := range []string{
		".scan-center-grid", ".scan-card", ".full-scan-progress", ".full-scan-stage",
		".capability-atlas", ".capability-group", ".capability-tile", "margin-left:-18px", "@media (max-width:820px)",
	} {
		if !strings.Contains(s, want) { t.Fatalf("Scan Center visual system missing %q", want) }
	}
}