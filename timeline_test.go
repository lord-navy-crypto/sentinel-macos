// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestIncidentInvestigationTimelineIsOrderedAndDeterministic(t *testing.T) {
	in := Incident{ID: "incident-1", Evidence: []IncidentEvidence{
		{At: 30, Source: "trust", Kind: "drift", Severity: "review", Path: "/b", Detail: "later"},
		{At: 10, Source: "filesystem", Kind: "created", Severity: "info", Path: "/a", Detail: "first"},
		{At: 20, Source: "persistence", Kind: "added", Severity: "review", Path: "/a", Detail: "middle"},
	}}
	got := IncidentInvestigationTimeline(in)
	if len(got) != 3 {
		t.Fatalf("timeline=%+v", got)
	}
	if got[0].At != 10 || got[1].At != 20 || got[2].At != 30 {
		t.Fatalf("not ordered: %+v", got)
	}
	for _, row := range got {
		if row.ID == "" || row.IncidentID != "incident-1" {
			t.Fatalf("missing stable identity: %+v", row)
		}
	}
}

func TestNormalizeInvestigationTimelineDeduplicatesAndBounds(t *testing.T) {
	row := InvestigationTimelineEvent{At: 1, Source: "filesystem", Kind: "changed", Path: "/x"}
	got := NormalizeInvestigationTimeline([]InvestigationTimelineEvent{row, row}, 10)
	if len(got) != 1 {
		t.Fatalf("dedupe failed: %+v", got)
	}
	many := []InvestigationTimelineEvent{
		{At: 1, Source: "a", Kind: "1"},
		{At: 2, Source: "a", Kind: "2"},
		{At: 3, Source: "a", Kind: "3"},
	}
	got = NormalizeInvestigationTimeline(many, 2)
	if len(got) != 2 || got[0].At != 2 || got[1].At != 3 {
		t.Fatalf("bound failed: %+v", got)
	}
}
