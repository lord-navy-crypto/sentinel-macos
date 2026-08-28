// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTrustHistoryBoundedPersistence(t *testing.T) {
	d := t.TempDir()
	m := &trustManager{persistent: true, historyPath: filepath.Join(d, "trust-drift-history.json")}
	for i := 0; i < trustHistoryLimit+7; i++ {
		drift := TrustDrift{ComparedAt: "2026-01-01T00:00:00Z", ProfileAt: "2025-12-31T00:00:00Z", DriftIndex: i, DriftBand: trustDriftBand(i), ProfileCoverage: 90, Changes: []TrustChange{{Kind: "novel_object", Severity: "info", Title: "x"}}}
		m.recordHistoryLocked(drift)
	}
	if len(m.history) != trustHistoryLimit {
		t.Fatalf("history=%d", len(m.history))
	}
	if err := m.persistHistoryLocked(); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(m.historyPath)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("mode=%o", info.Mode().Perm())
	}
	m2 := &trustManager{persistent: true, historyPath: m.historyPath}
	m2.loadHistory()
	if len(m2.history) != trustHistoryLimit {
		t.Fatalf("loaded=%d", len(m2.history))
	}
}

func TestTrustHistoryEphemeralDoesNotWrite(t *testing.T) {
	p := filepath.Join(t.TempDir(), "history.json")
	m := &trustManager{persistent: false, historyPath: p}
	m.recordHistoryLocked(TrustDrift{ComparedAt: "x", ProfileAt: "p", DriftIndex: 3})
	if err := m.persistHistoryLocked(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatalf("ephemeral history exists: %v", err)
	}
}

func TestTrustHealthIncludesHistory(t *testing.T) {
	d := t.TempDir()
	m := &trustManager{persistent: true, path: filepath.Join(d, "trust-profile.json"), backupPath: filepath.Join(d, "trust-profile.prev.json"), historyPath: filepath.Join(d, "trust-drift-history.json")}
	m.recordHistoryLocked(TrustDrift{ComparedAt: "2026-01-01T00:00:00Z", ProfileAt: "2025-12-31T00:00:00Z", DriftIndex: 10, DriftBand: "observe"})
	if err := m.persistHistoryLocked(); err != nil {
		t.Fatal(err)
	}
	h := m.health()
	if !h.Healthy || !h.HistoryExists || !h.HistoryValid || h.HistoryMode != "0600" || h.HistoryEntries != 1 {
		t.Fatalf("health=%+v", h)
	}
}

func TestTrustHistoryLoadsLastDriftAndStatusCount(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "history.json")
	m := &trustManager{persistent: true, historyPath: p}
	m.recordHistoryLocked(TrustDrift{ComparedAt: "2026-01-02T00:00:00Z", ProfileAt: "2026-01-01T00:00:00Z", DriftIndex: 22, DriftBand: "review", ProfileCoverage: 75})
	if err := m.persistHistoryLocked(); err != nil {
		t.Fatal(err)
	}
	m2 := &trustManager{persistent: true, historyPath: p}
	m2.loadHistory()
	if m2.lastDrift.DriftIndex != 22 || m2.lastDrift.DriftBand != "review" {
		t.Fatalf("last=%+v", m2.lastDrift)
	}
	st := m2.status()
	if st["history_entries"].(int) != 1 {
		t.Fatalf("status=%v", st)
	}
}
