// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestIncidentStoryStableAcrossEpisodeWindows(t *testing.T) {
	anchor := "/Applications/Example.app/Contents/MacOS/Example"
	first := []IncidentEvidence{{At: 100, Source: "trust", Kind: "identity_changed", Severity: "review", Path: anchor, Detail: "first"}}
	second := []IncidentEvidence{{At: 100 + incidentWindowSeconds + 10, Source: "trust", Kind: "identity_changed", Severity: "review", Path: anchor, Detail: "second"}}
	a, ok := incidentFromCluster(anchor, first)
	if !ok { t.Fatal("first episode should produce an incident") }
	b, ok := incidentFromCluster(anchor, second)
	if !ok { t.Fatal("second episode should produce an incident") }
	if a.StoryKey != b.StoryKey { t.Fatalf("same object must keep stable story key: %q != %q", a.StoryKey, b.StoryKey) }
	if a.ID == b.ID { t.Fatalf("bounded episodes must retain distinct episode IDs") }
}

func TestIncidentStoriesSplitByCanonicalAnchor(t *testing.T) {
	a, ok := incidentFromCluster("/tmp/A", []IncidentEvidence{{At: 10, Source: "behavior", Kind: "changed", Severity: "review", Path: "/tmp/A", Detail: "a"}})
	if !ok { t.Fatal("A should produce incident") }
	b, ok := incidentFromCluster("/tmp/B", []IncidentEvidence{{At: 10, Source: "behavior", Kind: "changed", Severity: "review", Path: "/tmp/B", Detail: "b"}})
	if !ok { t.Fatal("B should produce incident") }
	if a.StoryKey == b.StoryKey { t.Fatalf("different canonical objects must not merge into one story") }
}

func TestNormalizeLoadedIncidentMigratesWindowedStoryKey(t *testing.T) {
	path := "/Applications/Legacy.app/Contents/MacOS/Legacy"
	legacy := Incident{ID: "legacy-episode", StoryKey: "legacy-window-key", PrimaryPath: path, CreatedAt: 1, UpdatedAt: 2, Evidence: []IncidentEvidence{{At: 1, Path: path}}}
	got := normalizeLoadedIncident(legacy)
	want := entityID("incident-story", path)
	if got.StoryKey != want { t.Fatalf("story migration=%q want=%q", got.StoryKey, want) }
}

func TestIncidentManagerMergesHistoryByStableStory(t *testing.T) {
	path := "/Applications/Example.app/Contents/MacOS/Example"
	old := Incident{ID:"old", StoryKey:"legacy-window", PrimaryPath:path, CreatedAt:10, UpdatedAt:10, Severity:"review", Confidence:60, Evidence:[]IncidentEvidence{{At:10,Source:"trust",Kind:"identity_changed",Severity:"review",Path:path,Detail:"old"}}}
	cur := Incident{ID:"new", StoryKey:entityID("incident-story",path), PrimaryPath:path, CreatedAt:10+incidentWindowSeconds+1, UpdatedAt:10+incidentWindowSeconds+1, Severity:"review", Confidence:65, Evidence:[]IncidentEvidence{{At:10+incidentWindowSeconds+1,Source:"behavior",Kind:"executable_changed",Severity:"review",Path:path,Detail:"new"}}}
	m := &incidentManager{history:[]Incident{old}}
	m.store([]Incident{cur})
	if len(m.history) != 1 { t.Fatalf("history stories=%d want=1", len(m.history)) }
	if m.history[0].CreatedAt != 10 || m.history[0].UpdatedAt != cur.UpdatedAt { t.Fatalf("merged bounds=%+v", m.history[0]) }
	if len(m.history[0].Evidence) != 2 { t.Fatalf("merged evidence=%d want=2", len(m.history[0].Evidence)) }
	if m.history[0].ID != "new" { t.Fatalf("latest episode ID should be retained, got %q", m.history[0].ID) }
}
