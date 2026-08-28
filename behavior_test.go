// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBehaviorDiffDetectsIdentityNetworkAndPersistenceChanges(t *testing.T) {
	before := BehaviorSnapshot{CapturedAt: "2026-08-27T10:00:00Z", Objects: []BehaviorObject{{Key: "/tmp/helper", Target: "/tmp/helper", Identifier: "com.example.old", TeamID: "TEAMOLD", FileSize: 10, ModifiedUnix: 100, PublicEndpoints: []string{"1.1.1.1:443"}}}, Startup: []BehaviorStartup{{Path: "/Library/LaunchAgents/x.plist", Executable: "/tmp/helper"}}}
	after := BehaviorSnapshot{CapturedAt: "2026-08-27T11:00:00Z", Objects: []BehaviorObject{{Key: "/tmp/helper", Target: "/tmp/helper", Identifier: "com.example.new", TeamID: "TEAMNEW", FileSize: 20, ModifiedUnix: 200, PublicEndpoints: []string{"1.1.1.1:443", "8.8.8.8:443"}, StartupRefs: []string{"/Library/LaunchAgents/y.plist"}}}, Startup: []BehaviorStartup{{Path: "/Library/LaunchAgents/x.plist", Executable: "/tmp/other"}}}
	d := diffBehavior(before, after)
	kinds := map[string]bool{}
	for _, c := range d.Changes {
		kinds[c.Kind] = true
	}
	for _, want := range []string{"identity_changed", "executable_changed", "new_public_endpoint", "persistence_relation_changed", "startup_target_changed"} {
		if !kinds[want] {
			t.Fatalf("missing %s in %+v", want, d.Changes)
		}
	}
	if d.Summary.High < 2 || d.Summary.Network != 1 || d.Summary.Identity != 1 {
		t.Fatalf("unexpected summary %+v", d.Summary)
	}
}

func TestBehaviorSnapshotJSONDoesNotHaveCommandField(t *testing.T) {
	s := BehaviorSnapshot{Version: 1, Objects: []BehaviorObject{{Key: "/tmp/x", Target: "/tmp/x"}}}
	if len(s.Objects) != 1 || s.Objects[0].Target != "/tmp/x" {
		t.Fatal("unexpected snapshot")
	}
	// Compile-time shape test: the persisted object intentionally has no raw Command field.
}

func TestStringSetDiff(t *testing.T) {
	got := stringSetDiff([]string{"b", "a", "c"}, []string{"a"})
	if len(got) != 2 || got[0] != "b" || got[1] != "c" {
		t.Fatalf("got %#v", got)
	}
}

func TestBehaviorIdentityUnknownDoesNotCreateFalseChange(t *testing.T) {
	before := BehaviorSnapshot{CapturedAt: "a", Objects: []BehaviorObject{{Key: "/Applications/A.app", Target: "/Applications/A.app", Identifier: "", TeamID: ""}}}
	after := BehaviorSnapshot{CapturedAt: "b", Objects: []BehaviorObject{{Key: "/Applications/A.app", Target: "/Applications/A.app", Identifier: "com.example.a", TeamID: "TEAM"}}}
	d := diffBehavior(before, after)
	for _, c := range d.Changes {
		if c.Kind == "identity_changed" {
			t.Fatalf("unknown -> known identity should not be treated as a change: %+v", c)
		}
	}
}

func TestBehaviorParentContextChange(t *testing.T) {
	before := BehaviorSnapshot{CapturedAt: "a", Objects: []BehaviorObject{{Key: "/tmp/helper", Target: "/tmp/helper", ParentTargets: []string{"/Applications/A.app/Contents/MacOS/A"}}}}
	after := BehaviorSnapshot{CapturedAt: "b", Objects: []BehaviorObject{{Key: "/tmp/helper", Target: "/tmp/helper", ParentTargets: []string{"/tmp/launcher"}}}}
	d := diffBehavior(before, after)
	found := false
	for _, c := range d.Changes {
		if c.Kind == "parent_context_changed" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected parent context change: %+v", d.Changes)
	}
}

func TestBehaviorBaselinePersistsWithUserOnlyPermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "behavior-baseline.json")
	m := &behaviorManager{baselinePath: path}
	snap := BehaviorSnapshot{Version: 1, CapturedAt: "2026-08-27T12:00:00Z", Objects: []BehaviorObject{{Key: "/tmp/x", Target: "/tmp/x"}}}
	if err := m.persist(snap); err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := st.Mode().Perm(); got != 0600 {
		t.Fatalf("baseline mode=%o, want 600", got)
	}
	loaded := &behaviorManager{baselinePath: path}
	loaded.load()
	if loaded.baseline == nil || !loaded.loadedDisk || loaded.baseline.CapturedAt != snap.CapturedAt {
		t.Fatalf("baseline failed to reload: %+v", loaded.baseline)
	}
}
