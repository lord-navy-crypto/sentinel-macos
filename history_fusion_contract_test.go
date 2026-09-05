// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
	"time"
)

func readHistoryFusionContractFile(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestHistoryFusionRouteAndStorageBridgeAreIntegrated(t *testing.T) {
	mainSource := readHistoryFusionContractFile(t, "main.go")
	for _, want := range []string{
		`storageHistory *storageHistoryManager`,
		`storageHistory := newStorageHistoryManager(*ephemeral)`,
		`storageHistory: storageHistory`,
		`a.startStorageHistoryBridge()`,
		`mux.HandleFunc("/api/history/what-changed", a.auth(a.handleWhatChanged))`,
	} {
		if !strings.Contains(mainSource, want) {
			t.Fatalf("History Fusion integration missing %q", want)
		}
	}
}

func TestHistoryFusionIsAggregationNotSecondCollectionPipeline(t *testing.T) {
	source := readHistoryFusionContractFile(t, "history_fusion.go")
	for _, want := range []string{
		historyFusionMarker,
		`resourceHistory.since`,
		`loadPersistentFusionResourceSamples`,
		`CompareStorageSnapshots`,
		`diffNetworkHistory`,
		`historySnapshot(behaviorHistoryLimit`,
		`historySnapshot(trustHistoryLimit`,
		`a.changes.historySnapshot`,
		`a.globalTimeline(r)`,
		`Temporal proximity is correlation context only`,
		`does not trigger a storage scan`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("History Fusion source missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`scanStorageAdvanced(`,
		`collectNetwork(`,
		`captureResourceSample(`,
		`handleTrustCompare(`,
		`handleBehavior(`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("History Fusion must not create an independent collection pipeline: %q", forbidden)
		}
	}
}

func TestHistoryFusionCompareUIPreservesEvidenceBoundariesAndWorkbench(t *testing.T) {
	source := readHistoryFusionContractFile(t, "web/app/lenses/compare.js")
	for _, want := range []string{
		`/api/history/what-changed?hours=`,
		`What changed?`,
		`Source coverage`,
		`Observed`,
		`Correlated in time`,
		`NOT ESTABLISHED`,
		`Open Workbench`,
		`S.Workbench.setSelection`,
		`Change Monitor`,
		`Start watch`,
		`Reinspect`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("Compare / What Changed UI missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`/api/storage/scan`,
		`/api/network/history?capture`,
		`/api/trust/compare`,
		`/api/behavior?capture`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("What Changed UI must not silently collect new evidence: %q", forbidden)
		}
	}
}

func TestHistoryFusionCorrelatesOnlyMultipleSourcesInBoundedWindow(t *testing.T) {
	base := time.Unix(2_000_000_000, 0)
	rows := []HistoryFusionObservation{
		{ID: "a", At: base.Unix(), Source: "resource", Kind: "sample"},
		{ID: "b", At: base.Add(2 * time.Minute).Unix(), Source: "storage", Kind: "delta"},
		{ID: "c", At: base.Add(20 * time.Minute).Unix(), Source: "storage", Kind: "delta"},
	}
	groups := correlateHistoryObservations(rows, 5*time.Minute)
	if len(groups) != 1 {
		t.Fatalf("expected one bounded multi-source group, got %+v", groups)
	}
	if groups[0].FirstAt != rows[0].At || groups[0].LastAt != rows[1].At {
		t.Fatalf("unexpected correlation window: %+v", groups[0])
	}
	if len(groups[0].Sources) != 2 {
		t.Fatalf("expected two distinct sources, got %+v", groups[0].Sources)
	}
	if !strings.Contains(groups[0].Boundary, "not established") {
		t.Fatalf("correlation boundary missing: %+v", groups[0])
	}
}

func TestHistoryFusionDoesNotCorrelateSameSourceNoise(t *testing.T) {
	base := time.Unix(2_000_000_000, 0)
	rows := []HistoryFusionObservation{
		{ID: "a", At: base.Unix(), Source: "filesystem", Kind: "write"},
		{ID: "b", At: base.Add(time.Minute).Unix(), Source: "filesystem", Kind: "write"},
	}
	if groups := correlateHistoryObservations(rows, 5*time.Minute); len(groups) != 0 {
		t.Fatalf("same-source observations must not be presented as cross-source correlation: %+v", groups)
	}
}

func TestStorageHistoryBridgeReadsOnlyCompletedJobs(t *testing.T) {
	m := newScanManager()
	m.jobs["running"] = &ScanJob{ID: "running", Status: "running", Result: &AdvancedStorageResult{Root: "/tmp"}}
	m.jobs["failed"] = &ScanJob{ID: "failed", Status: "failed", FinishedAt: 2, Result: &AdvancedStorageResult{Root: "/tmp"}}
	m.jobs["complete"] = &ScanJob{ID: "complete", Status: "complete", FinishedAt: 3, Result: &AdvancedStorageResult{Root: "/tmp", VisibleBytes: 42}}
	jobs := m.completedStorageHistoryJobs()
	if len(jobs) != 1 || jobs[0].ID != "complete" {
		t.Fatalf("storage history bridge selected unexpected jobs: %+v", jobs)
	}
}
