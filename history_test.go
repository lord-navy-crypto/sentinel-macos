// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBehaviorRiskIndexBandsAndWeights(t *testing.T) {
	quiet := behaviorRiskIndex(nil)
	if quiet != 0 || behaviorRiskBand(quiet) != "quiet" {
		t.Fatalf("quiet index mismatch: %d %s", quiet, behaviorRiskBand(quiet))
	}
	review := behaviorRiskIndex([]BehaviorChange{{Kind: "new_public_endpoint", Severity: "review"}})
	high := behaviorRiskIndex([]BehaviorChange{{Kind: "startup_target_changed", Severity: "high"}})
	if !(high > review && review > 0) {
		t.Fatalf("expected weighted high > review > 0, got high=%d review=%d", high, review)
	}
	if behaviorRiskIndex([]BehaviorChange{{Kind: "startup_target_changed", Severity: "high"}, {Kind: "identity_changed", Severity: "high"}, {Kind: "startup_target_changed", Severity: "high"}}) > 100 {
		t.Fatal("risk index must be capped at 100")
	}
}

func TestBehaviorHistoryBoundedAndObjectFiltered(t *testing.T) {
	m := &behaviorManager{persistent: false}
	for i := 0; i < behaviorHistoryLimit+7; i++ {
		d := BehaviorDiff{CurrentAt: time.Unix(int64(i+1), 0).UTC().Format(time.RFC3339), Changes: []BehaviorChange{{Kind: "object_observed", Severity: "info", ObjectKey: "/tmp/a", Title: "Observed"}}}
		m.recordHistoryLocked(&d)
	}
	if len(m.history) != behaviorHistoryLimit {
		t.Fatalf("history length=%d want=%d", len(m.history), behaviorHistoryLimit)
	}
	got := m.historySnapshot(5, "/tmp/a")
	if got.Count != 5 || len(got.Entries) != 5 {
		t.Fatalf("filtered count=%d entries=%d", got.Count, len(got.Entries))
	}
	for _, e := range got.Entries {
		if len(e.Changes) != 1 || e.Changes[0].ObjectKey != "/tmp/a" {
			t.Fatalf("unexpected filtered history: %#v", e.Changes)
		}
	}
}

func TestBehaviorPersistentFilesAndHealth(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	m := newBehaviorManager(false)
	snap := BehaviorSnapshot{Version: 1, CapturedAt: time.Now().UTC().Format(time.RFC3339), Objects: []BehaviorObject{}, Startup: []BehaviorStartup{}, Background: []BehaviorBackground{}}
	if err := m.persist(snap); err != nil {
		t.Fatal(err)
	}
	m.baseline = &snap
	d := BehaviorDiff{CurrentAt: time.Now().UTC().Format(time.RFC3339), Changes: []BehaviorChange{{Kind: "startup_added", Severity: "review", ObjectKey: "/tmp/helper", Title: "Startup added"}}}
	m.recordHistoryLocked(&d)
	if err := m.persistHistoryLocked(); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{m.baselinePath, m.historyPath} {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0600 {
			t.Fatalf("%s mode=%o want=600", filepath.Base(path), info.Mode().Perm())
		}
	}
	h := m.health()
	if !h.Healthy || !h.BaselineValid || !h.HistoryValid {
		t.Fatalf("unexpected unhealthy state: %#v", h)
	}

	m2 := newBehaviorManager(false)
	if len(m2.history) != 1 {
		t.Fatalf("cross-session history load=%d want=1", len(m2.history))
	}
}

func TestEphemeralHealthWritesNothing(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	m := newBehaviorManager(true)
	d := BehaviorDiff{CurrentAt: time.Now().UTC().Format(time.RFC3339)}
	m.recordHistoryLocked(&d)
	h := m.health()
	if h.Mode != "ephemeral" || !h.Healthy {
		t.Fatalf("unexpected ephemeral health: %#v", h)
	}
	if _, err := os.Stat(filepath.Join(home, "Library", "Application Support", "Sentinel")); !os.IsNotExist(err) {
		t.Fatalf("ephemeral mode unexpectedly wrote Sentinel directory: %v", err)
	}
}
