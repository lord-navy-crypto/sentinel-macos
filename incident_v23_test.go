// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestEnrichIncidentV23AddsTimelineAndExplanation(t *testing.T) {
	in := Incident{ID: "i", Evidence: []IncidentEvidence{
		{At: 2, Source: "persistence", Kind: "changed", Severity: "review", Path: "/x"},
		{At: 1, Source: "filesystem", Kind: "created", Severity: "info", Path: "/x"},
	}}
	view := EnrichIncidentV23(in)
	if view.Incident.ID != "i" || len(view.Timeline) != 2 || len(view.Explanation.ReasonCodes) == 0 {
		t.Fatalf("view=%+v", view)
	}
	if view.Timeline[0].At != 1 {
		t.Fatalf("timeline not normalized: %+v", view.Timeline)
	}
}
