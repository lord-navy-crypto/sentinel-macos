// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestIncidentRuleMatchesDeterministicEvidence(t *testing.T) {
	in := Incident{
		Severity: "review", Confidence: 80, Sources: []string{"filesystem", "persistence"},
		Evidence: []IncidentEvidence{
			{Source: "filesystem", Kind: "created", Severity: "review", Path: "/x"},
			{Source: "persistence", Kind: "added", Severity: "review", Path: "/x"},
		},
	}
	rule := IncidentRule{
		ID: "new-persistence-correlation", Title: "Persistence correlated with filesystem activity", Enabled: true,
		RequireSources: []string{"filesystem", "persistence"},
		RequireReasons: []string{"multi_source_correlation", "persistence_observed"},
		MinConfidence: 70, MinSeverity: "review", Guidance: "Review the related persistence target.",
	}
	got := EvaluateIncidentRule(rule, EnrichIncidentV23(in))
	if !got.Matched || len(got.MissingInputs) != 0 {
		t.Fatalf("match=%+v", got)
	}
	if got.Note == "" {
		t.Fatal("rule semantics must be explicit")
	}
}

func TestIncidentRuleDoesNotMatchMissingEvidence(t *testing.T) {
	in := Incident{Severity: "info", Confidence: 30, Sources: []string{"filesystem"}, Evidence: []IncidentEvidence{{Source: "filesystem", Kind: "modified", Severity: "info"}}}
	rule := IncidentRule{ID: "needs-persistence", Enabled: true, RequireSources: []string{"persistence"}, MinConfidence: 70}
	got := EvaluateIncidentRule(rule, EnrichIncidentV23(in))
	if got.Matched || len(got.MissingInputs) == 0 {
		t.Fatalf("unexpected match=%+v", got)
	}
}

func TestDisabledIncidentRuleNeverMatches(t *testing.T) {
	got := EvaluateIncidentRule(IncidentRule{ID: "off", Enabled: false}, EnrichIncidentV23(Incident{}))
	if got.Matched || len(got.MissingInputs) != 1 || got.MissingInputs[0] != "rule_disabled" {
		t.Fatalf("disabled rule=%+v", got)
	}
}
