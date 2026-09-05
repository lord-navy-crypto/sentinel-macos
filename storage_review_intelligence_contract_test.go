// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestStorageReviewProductionRoutesUseWorkGate(t *testing.T) {
	raw, err := os.ReadFile("main.go")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`mux.HandleFunc("/api/maintenance/old-files", a.auth(a.work.wrap("old-file-explorer", a.handleOldFileExplorer)))`,
		`mux.HandleFunc("/api/maintenance/downloads", a.auth(a.work.wrap("downloads-intelligence", a.handleDownloadsIntelligence)))`,
		`mux.HandleFunc("/api/storage/aging", a.auth(a.handleStorageAging))`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing storage review route contract %q", want)
		}
	}
}

func TestStorageReviewBackendIsReadOnlyAndBounded(t *testing.T) {
	raw, err := os.ReadFile("storage_review_intelligence.go")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`Sentinel 3.2 Storage Review Intelligence`,
		`boundedWalk(root, deadline, maxEntries`,
		`root := filepath.Join(home, "Downloads")`,
		`It does not mean unused.`,
		`does not infer last-opened time`,
		`does not hash files for duplicates in this view`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing storage review evidence boundary %q", want)
		}
	}
	for _, forbidden := range []string{
		`os.Remove(`,
		`os.RemoveAll(`,
		`os.WriteFile(`,
		`os.OpenFile(`,
		`exec.Command(`,
		`http.MethodPost`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("storage review backend must remain read-only; found %q", forbidden)
		}
	}
}

func TestStorageReviewMaintenanceUIContracts(t *testing.T) {
	raw, err := os.ReadFile("web/app/maintenance-ultra.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`Sentinel 3.2 Storage Review Intelligence`,
		`Existing Scan Aging`,
		`Old File Explorer`,
		`Downloads Intelligence`,
		`/api/storage/aging`,
		`/api/maintenance/old-files`,
		`/api/maintenance/downloads`,
		`modification age is not last-used time`,
		`no cleanup or duplicate hashing`,
		`No automatic cleanup.`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing storage review UI contract %q", want)
		}
	}
	for _, forbidden := range []string{
		`/api/cleanup/`,
		`method:'POST'`,
		`method:"POST"`,
	} {
		// The maintenance module legitimately POSTs persistent-history settings
		// and samples. Restrict the mutation check to the new storage-review
		// functions below rather than rejecting the existing recorder globally.
		_ = forbidden
	}
	oldStart := strings.Index(source, "async function runOld")
	dupStart := strings.Index(source, "async function runDuplicates")
	if oldStart < 0 || dupStart <= oldStart { t.Fatal("storage review function range unavailable") }
	reviewSection := source[oldStart:dupStart]
	for _, forbidden := range []string{`method:'POST'`, `method:"POST"`, `/api/cleanup/`, `data-do=`} {
		if strings.Contains(reviewSection, forbidden) {
			t.Fatalf("storage review UI must remain read-only; found %q", forbidden)
		}
	}
}
