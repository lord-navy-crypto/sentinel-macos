// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIncidentEntityStableIDSurvivesEpisodeChanges(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Example.app")
	a := Incident{ID: "episode-a", StoryKey: "story-a", PrimaryPath: path, Sources: []string{"filesystem"}}
	b := Incident{ID: "episode-b", StoryKey: "story-b", PrimaryPath: path, Sources: []string{"filesystem", "persistence"}}
	if incidentEntityStableID(a) != incidentEntityStableID(b) {
		t.Fatal("stable entity ID changed")
	}
}
func TestGraphV2FilterKeepsMatchingNodesAndConnectedEdges(t *testing.T) {
	graph := EvidenceGraphV2{Nodes: []EvidenceGraphV2Node{{ID: "file-1", Type: "file", Label: "Example", Ref: "/tmp/Example", Sources: []string{"incident"}}, {ID: "incident-1", Type: "incident", Label: "Review Example", Sources: []string{"incident"}}, {ID: "process-1", Type: "process", Label: "Other", Sources: []string{"current_evidence"}}}, Edges: []EvidenceGraphV2Edge{{ID: "e1", From: "file-1", To: "incident-1", Type: "member_of_incident"}}}
	r := httptest.NewRequest("GET", "/api/intelligence/graph/v2?type=incident", nil)
	got := filterGraphV2(graph, r)
	if len(got.Nodes) != 1 || got.Nodes[0].Type != "incident" {
		t.Fatalf("filtered nodes=%+v", got.Nodes)
	}
	if len(got.Edges) != 1 {
		t.Fatal("connected edge should remain")
	}
}
func TestVisibilityCenterDoesNotInferFullDiskAccess(t *testing.T) {
	got := (&app{}).visibilityCenterV2()
	found := false
	for _, source := range got.Sources {
		if source.ID == "full-disk-access" {
			found = true
			if source.Status != "user_controlled" || !source.UserControlled {
				t.Fatalf("FDA status=%+v", source)
			}
		}
	}
	if !found {
		t.Fatal("FDA visibility source missing")
	}
}
func TestAdvancedSensorAvailabilityRequiresEnabledSensor(t *testing.T) {
	status := advancedSensorStatus()
	if status.Available && !status.Enabled {
		t.Fatal("advanced sensor cannot be available unless enabled")
	}
}
func TestCommandPaletteRoutesTypedObjectsWithoutShell(t *testing.T) {
	if got := commandPaletteHref("process", "", 42, "processes"); got != "/process-relations.html?pid=42" {
		t.Fatalf("process href=%q", got)
	}
	if got := commandPaletteHref("startup", "/tmp/x", 0, "startup"); got != "/launch-services.html" {
		t.Fatalf("startup href=%q", got)
	}
}
func TestUnifiedIntelligenceRoutesAndProductEntryContract(t *testing.T) {
	checks := map[string][]string{"main.go": {"/api/intelligence/graph/v2", "/api/intelligence/timeline/global", "/api/incidents/v2", "/api/object/story/v2", "/api/visibility", "/api/search/command"}, "web/app/core.js": {"How are the objects connected?"}, "web/app/runtime.js": {"/api/search"}, "web/app/lenses/orient-investigate.js": {"/api/intelligence/graph", "/api/intelligence/timeline", "/api/incidents", "/api/object/story"}, "intelligence_core.go": {"Evidence Graph 2.0", "Incident Intelligence 2.0", "Global Timeline", "Object Story 2.0", "Full Disk Access", "never concatenates input into a shell command"}}
	for path, needles := range checks {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		for _, needle := range needles {
			if !strings.Contains(string(raw), needle) {
				t.Fatalf("%s missing %q", path, needle)
			}
		}
	}
}
