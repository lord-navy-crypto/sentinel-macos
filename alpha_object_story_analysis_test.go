// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestObjectStoryAnalysisSummarizesEvidenceAndUnknowns(t *testing.T) {
	in := ObjectStoryV2{Path: "/tmp/A", Incidents: []ObjectStoryV2IncidentRef{{StableID: "s1", EpisodeID: "e1", Severity: "review"}}, Timeline: []InvestigationTimelineEvent{{At: 100, Source: "filesystem_change", Kind: "modified", Severity: "info", Path: "/tmp/A"}, {At: 120, Source: "incident", Kind: "evidence", Severity: "review", Path: "/tmp/A", IncidentID: "e1"}, {At: 130, Source: "intelligence", Kind: "system_evidence", Severity: "high", Path: "/tmp/A"}}, Unknowns: []string{"network history unavailable", "network history unavailable"}}
	analysis := BuildObjectStoryAnalysisV23(in)
	if analysis.TimelineEvents != 3 || analysis.ReviewEvents != 2 || analysis.HighEvents != 1 || analysis.IncidentCount != 1 {
		t.Fatalf("unexpected object story summary: %+v", analysis)
	}
	if analysis.State != "high_review_activity" {
		t.Fatalf("expected high review activity state: %+v", analysis)
	}
	if len(analysis.Unknowns) != 1 {
		t.Fatalf("unknowns should be deduplicated: %+v", analysis.Unknowns)
	}
	if len(analysis.TimelineAnalysis.Windows) != 1 || !analysis.TimelineAnalysis.Windows[0].CrossSource {
		t.Fatalf("expected embedded timeline activity analysis: %+v", analysis.TimelineAnalysis)
	}
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "timeline_analysis") || !strings.Contains(string(raw), "review_events") {
		t.Fatalf("object story JSON missing analysis: %s", raw)
	}
}

func TestIncidentDeepReviewAddsEvolutionWithoutChangingBaseFields(t *testing.T) {
	in := IncidentDeepReview{Incident: Incident{PrimaryPath: "/tmp/A", Evidence: []IncidentEvidence{{At: 10, Source: "persistence", Kind: "launch_changed", Severity: "review", Path: "/tmp/A"}, {At: 20, Source: "filesystem", Kind: "modified", Severity: "review", Path: "/tmp/A"}, {At: 2000, Source: "persistence", Kind: "launch_changed", Severity: "high", Path: "/tmp/A"}, {At: 2010, Source: "trust", Kind: "identity_drift", Severity: "high", Path: "/tmp/A"}}}}
	analysis := BuildIncidentDeepReviewAnalysisV23(in)
	if analysis.HasIntegrity || analysis.HasObjectStory {
		t.Fatalf("nil optional deep-review sections should remain explicit: %+v", analysis)
	}
	if analysis.Intelligence.Evolution.EpisodeCount != 2 {
		t.Fatalf("deep review should expose episode evolution: %+v", analysis.Intelligence.Evolution)
	}
	if !containsString(analysis.ReviewScope, "incident_evolution") {
		t.Fatalf("deep review scope missing evolution: %+v", analysis.ReviewScope)
	}
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "\"incident\"") || !strings.Contains(string(raw), "\"analysis\"") || !strings.Contains(string(raw), "incident_evolution") {
		t.Fatalf("deep review JSON missing additive analysis/base fields: %s", raw)
	}
}
