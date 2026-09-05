// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestWhatChangedWireIncludesPersistentHistoryV2(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	raw, err := json.Marshal(WhatChangedResponse{Hours: 24, Sources: []HistoryFusionSourceStatus{{Source: "storage", Persistent: false}}})
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	for _, want := range []string{`"persistent_history"`, `"storage_change_over_time"`, persistentHistoryV2Marker} {
		if !strings.Contains(text, want) {
			t.Fatalf("What Changed JSON missing %q: %s", want, text)
		}
	}
}

func TestPersistentHistoryV2SourceLocksEvidenceBoundaries(t *testing.T) {
	raw, err := os.ReadFile("persistent_history_v2.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	for _, want := range []string{
		"Sentinel 2.9 Persistent History Ultra",
		"readPersistentHistoryTail",
		"persistentHistoryGaps",
		"CompareStorageSnapshots",
		"Missing windows mean Sentinel has no retained sample",
		"not a cause claim",
		"not a deletion recommendation",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("Persistent History 2.0 source missing contract marker %q", want)
		}
	}
}

func TestChangesLensShowsHistoryWithoutStartingCollection(t *testing.T) {
	raw, err := os.ReadFile("web/app/lenses/compare.js")
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	for _, want := range []string{
		"Persistent resource history",
		"Storage change over time",
		"30d",
		"MISSING EVIDENCE",
		"Observed changes · current watch",
		"/api/history/what-changed",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("Changes lens missing %q", want)
		}
	}
	for _, forbidden := range []string{
		"/api/maintenance/history/sample",
		"/api/storage/scan",
		"/api/storage/jobs",
		"captureResourceSample(",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("read-only Changes lens unexpectedly contains collection trigger %q", forbidden)
		}
	}
}

func TestHistoryPrecisionBoundaryStillRecomputesDirectCorrelations(t *testing.T) {
	raw, err := os.ReadFile("history_fusion_precision.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	for _, want := range []string{
		"directHistoryCorrelationRows",
		"correlateHistoryObservations",
		"buildPersistentHistoryV2Summary",
		"buildStorageChangeOverTimeV2",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("History Fusion JSON boundary missing %q", want)
		}
	}
}
