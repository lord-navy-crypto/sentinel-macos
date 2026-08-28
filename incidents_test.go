// SPDX-License-Identifier: MPL-2.0
package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestIncidentCorrelationAcrossSources(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	helper := filepath.Join(h, "helper")
	a := &app{intel: newIntelligenceManager(), behavior: newBehaviorManager(true), trust: newTrustManager(true), persistence: newPersistenceManager(), changes: newChangeManager(nil, true), incidents: newIncidentManager(true)}
	a.changes.appendEvent(ChangeEvent{At: time.Now().Unix(), Path: helper, Kind: "modified", Source: "polling-fallback", Severity: "review", Why: "changed"})
	a.behavior.mu.Lock()
	a.behavior.lastDiff = BehaviorDiff{CurrentAt: time.Now().UTC().Format(time.RFC3339), Changes: []BehaviorChange{{Kind: "executable_changed", Severity: "high", ObjectKey: helper, Title: "Executable changed", After: "new metadata"}}}
	a.behavior.mu.Unlock()
	st := a.rebuildIncidents()
	if st.Count < 1 {
		t.Fatalf("no incidents: %+v", st)
	}
	in := st.Incidents[0]
	if in.Confidence < 60 || len(in.Sources) < 2 {
		t.Fatalf("weak correlation: %+v", in)
	}
	if in.Note == "" {
		t.Fatal("missing confidence semantics")
	}
}

func TestIncidentHistoryPersistsCompressed(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	m := newIncidentManager(false)
	in := Incident{ID: "i1", UpdatedAt: 1, CreatedAt: 1, Severity: "review", Confidence: 70, Title: "x"}
	m.store([]Incident{in})
	m2 := newIncidentManager(false)
	if got := m2.snapshot(true); got.Count != 1 {
		t.Fatalf("history=%+v", got)
	}
}
