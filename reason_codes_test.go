// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestBuildIncidentExplanationSeparatesEvidenceAndUnknowns(t *testing.T) {
	in := Incident{Evidence: []IncidentEvidence{
		{At: 1, Source: "filesystem", Kind: "modified", Severity: "review", Path: "/tmp/x", Detail: "changed"},
		{At: 2, Source: "persistence", Kind: "target_changed", Severity: "high", Path: "/tmp/x", Detail: "LaunchAgent target changed"},
	}}
	ex := BuildIncidentExplanation(in)
	if len(ex.ObservedFacts) != 2 {
		t.Fatalf("observed facts=%v", ex.ObservedFacts)
	}
	if len(ex.DerivedRelationships) == 0 || len(ex.Interpretation) == 0 || len(ex.Unknowns) == 0 {
		t.Fatalf("incomplete explanation=%+v", ex)
	}
	seen := map[string]bool{}
	for _, r := range ex.ReasonCodes {
		seen[r.Code] = true
	}
	for _, want := range []string{"multi_source_correlation", "persistence_observed", "filesystem_activity", "high_severity_evidence", "review_severity_evidence"} {
		if !seen[want] {
			t.Fatalf("missing reason %q in %+v", want, ex.ReasonCodes)
		}
	}
}

func TestBuildIncidentExplanationSingleSourceIsExplicitlyLimited(t *testing.T) {
	ex := BuildIncidentExplanation(Incident{Evidence: []IncidentEvidence{{At: 1, Source: "filesystem", Kind: "modified", Severity: "info"}}})
	found := false
	for _, r := range ex.ReasonCodes {
		if r.Code == "single_source_context" && r.Direction == "decrease" && r.Weight < 0 {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing limited-context reason: %+v", ex.ReasonCodes)
	}
}
