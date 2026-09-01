// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestGroupInvestigationTimelineCollapsesOnlyMatchingNearbyEvents(t *testing.T) {
	rows := []InvestigationTimelineEvent{
		{ID: "a", At: 100, Source: "filesystem", Kind: "write", Severity: "info", Path: "/tmp/A", Detail: "changed"},
		{ID: "b", At: 120, Source: "filesystem", Kind: "write", Severity: "info", Path: "/tmp/A", Detail: "changed"},
		{ID: "c", At: 500, Source: "filesystem", Kind: "write", Severity: "info", Path: "/tmp/A", Detail: "changed"},
		{ID: "d", At: 510, Source: "filesystem", Kind: "rename", Severity: "review", Path: "/tmp/A", Detail: "changed"},
	}
	groups := GroupInvestigationTimeline(rows, 60, 20)
	if len(groups) != 3 {
		t.Fatalf("groups=%d want=3: %#v", len(groups), groups)
	}
	if groups[0].Count != 2 || groups[0].FirstAt != 100 || groups[0].LastAt != 120 {
		t.Fatalf("first group=%+v", groups[0])
	}
	if len(groups[0].EventIDs) != 2 {
		t.Fatalf("event provenance=%v", groups[0].EventIDs)
	}
	if groups[1].Count != 1 || groups[2].Kind != "rename" {
		t.Fatalf("nonmatching evidence must stay separate: %#v", groups)
	}
}

func TestGroupInvestigationTimelinePreservesIncidentBoundary(t *testing.T) {
	rows := []InvestigationTimelineEvent{{ID: "a", At: 1, Source: "trust", Kind: "changed", Severity: "review", Path: "/A", Detail: "same", IncidentID: "one"}, {ID: "b", At: 2, Source: "trust", Kind: "changed", Severity: "review", Path: "/A", Detail: "same", IncidentID: "two"}}
	if got := len(GroupInvestigationTimeline(rows, 60, 20)); got != 2 {
		t.Fatalf("incident-specific events merged, groups=%d", got)
	}
}
