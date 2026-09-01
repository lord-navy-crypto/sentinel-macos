// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestLegacyObjectStoryRelationshipAnalysis(t *testing.T) {
	in := ObjectStory{
		ObjectType: "process", ObjectID: "p1", Title: "demo", Risk: 40,
		Facts: []StoryFact{{Category: "process", Label: "PID", Value: "123", Source: "ps"}, {Category: "security", Label: "Code signature", Value: "valid", Source: "codesign"}},
		Relations: []StoryRelation{
			{Kind: "parent_process", Target: "PID 1", Detail: "launchd"},
			{Kind: "launched_by", Target: "com.example.demo", Detail: "/Library/LaunchAgents/com.example.demo.plist"},
			{Kind: "connects_to", Target: "203.0.113.5:443", Detail: "ESTABLISHED · public"},
		},
		Timeline: []TimelineEvent{{At: 100, Kind: "observed", Severity: "info"}, {At: 110, Kind: "changed", Severity: "review"}},
	}
	analysis := BuildObjectRelationshipAnalysisV23(in)
	if analysis.ParentDepth != 1 || analysis.PersistenceRelations != 1 || analysis.NetworkRelations != 1 || analysis.RuntimeRelations != 1 {
		t.Fatalf("unexpected relation analysis: %+v", analysis)
	}
	if analysis.State != "persistence_and_network_context" {
		t.Fatalf("unexpected story state: %+v", analysis)
	}
	if analysis.ReviewTimelineEvents != 1 {
		t.Fatalf("unexpected review timeline count: %+v", analysis)
	}
	foundPID, foundPlist, foundEndpoint := false, false, false
	for _, target := range analysis.Targets {
		switch {
		case target.Kind == "pid" && target.Value == "1":
			foundPID = true
		case target.Kind == "path" && strings.HasSuffix(target.Value, "com.example.demo.plist"):
			foundPlist = true
		case target.Kind == "endpoint" && target.Value == "203.0.113.5:443":
			foundEndpoint = true
		}
	}
	if !foundPID || !foundPlist || !foundEndpoint {
		t.Fatalf("missing continuation targets: %+v", analysis.Targets)
	}
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if !strings.Contains(text, "investigation_targets") || !strings.Contains(text, "persistence_relations") {
		t.Fatalf("legacy Object Story JSON missing Alpha analysis: %s", raw)
	}
}

func TestLegacyObjectStoryPIDTargetRequiresPositiveNumericPID(t *testing.T) {
	in := ObjectStory{Relations: []StoryRelation{{Kind: "parent_process", Target: "PID not-a-number", Detail: "unknown"}}}
	analysis := BuildObjectRelationshipAnalysisV23(in)
	if len(analysis.Targets) != 0 {
		t.Fatalf("invalid historical/current PID text must not become navigation target: %+v", analysis.Targets)
	}
}
