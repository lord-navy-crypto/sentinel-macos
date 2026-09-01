// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNetworkHistoryDiffAnalysisBuildsProcessEndpointAndStateViews(t *testing.T) {
	in := NetworkHistoryDiff{
		FromID: "n1", ToID: "n2",
		Ended: []NetworkHistoryRelation{
			{Process: "AppA", User: "u", PID: 111, State: "SYN_SENT", EndpointClass: "public", Endpoint: "203.0.113.10:443"},
			{Process: "AppB", User: "u", PID: 222, State: "ESTABLISHED", EndpointClass: "public", Endpoint: "198.51.100.20:443"},
		},
		Added: []NetworkHistoryRelation{
			{Process: "AppA", User: "u", PID: 999, State: "ESTABLISHED", EndpointClass: "public", Endpoint: "203.0.113.10:443"},
			{Process: "AppC", User: "u", PID: 333, State: "LISTEN", EndpointClass: "local", Endpoint: "127.0.0.1:8080"},
		},
	}
	analysis := BuildNetworkHistoryDiffAnalysisV23(in)
	if analysis.AddedCount != 2 || analysis.EndedCount != 2 {
		t.Fatalf("unexpected relation counts: %+v", analysis)
	}
	if len(analysis.StateTransitions) != 1 {
		t.Fatalf("expected one exact-context state transition candidate: %+v", analysis.StateTransitions)
	}
	tr := analysis.StateTransitions[0]
	if tr.Process != "AppA" || tr.FromState != "SYN_SENT" || tr.ToState != "ESTABLISHED" {
		t.Fatalf("unexpected transition: %+v", tr)
	}
	if len(analysis.ProcessChanges) != 3 {
		t.Fatalf("expected three affected process identities: %+v", analysis.ProcessChanges)
	}
	if len(analysis.EndpointChanges) != 3 {
		t.Fatalf("expected three affected endpoint identities: %+v", analysis.EndpointChanges)
	}
	for _, target := range analysis.Targets {
		if target.Kind == "process_name" && strings.Contains(target.Why, "Historical PID values") {
			goto pidGuard
		}
	}
	t.Fatal("historical PID reuse guard missing from process targets")
pidGuard:
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if !strings.Contains(text, "state_transition_candidates") || !strings.Contains(text, "investigation_targets") {
		t.Fatalf("network diff analysis missing from JSON: %s", raw)
	}
	if !strings.Contains(strings.ToLower(text), "does not establish exact connection start/end time") {
		t.Fatalf("network timing limitation missing: %s", raw)
	}
}

func TestNetworkStateTransitionRequiresExactContext(t *testing.T) {
	in := NetworkHistoryDiff{Ended: []NetworkHistoryRelation{{Process: "AppA", User: "u", State: "SYN_SENT", EndpointClass: "public", Endpoint: "203.0.113.10:443"}}, Added: []NetworkHistoryRelation{{Process: "AppA", User: "u", State: "ESTABLISHED", EndpointClass: "public", Endpoint: "203.0.113.11:443"}}}
	analysis := BuildNetworkHistoryDiffAnalysisV23(in)
	if len(analysis.StateTransitions) != 0 {
		t.Fatalf("different endpoint must not be invented as a state transition: %+v", analysis.StateTransitions)
	}
}
