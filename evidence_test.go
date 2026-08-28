// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestEvidenceGraphCorrelatesStartupProcessAndNetwork(t *testing.T) {
	startups := []StartupItem{{Path: "/Library/LaunchAgents/com.test.helper.plist", Name: "com.test.helper.plist", Executable: "/tmp/helper", Scope: "System LaunchAgent", Risk: 55, Signals: []string{"test persistence"}}}
	procs := []ProcessInfo{{PID: 4242, PPID: 1, CPU: 3.5, Memory: 0.2, User: "tester", Command: "/tmp/helper --serve"}}
	nets := []NetworkItem{{Command: "helper", PID: 4242, User: "tester", State: "ESTABLISHED", Address: "127.0.0.1:5000->203.0.113.7:443"}}

	g := buildEvidenceGraph(startups, procs, nets)
	if g.Summary.Startup != 1 || g.Summary.Processes != 1 || g.Summary.Network != 1 {
		t.Fatalf("unexpected summary: %+v", g.Summary)
	}
	if g.Summary.Files != 1 {
		t.Fatalf("expected the shared executable to collapse to one file node, got %d", g.Summary.Files)
	}
	relations := map[string]bool{}
	for _, e := range g.Edges {
		relations[e.Relation] = true
	}
	for _, want := range []string{"launches", "executes_as", "connects_to"} {
		if !relations[want] {
			t.Fatalf("missing relation %q in %+v", want, g.Edges)
		}
	}
}

func TestIntelligenceTimelineRecordsSessionDiffs(t *testing.T) {
	m := newIntelligenceManager()
	base := EvidenceGraph{Nodes: []EvidenceNode{{ID: "process-a", Type: "process", Label: "A", Detail: "PID 1"}}}
	m.observe(base, true)
	changed := EvidenceGraph{Nodes: []EvidenceNode{{ID: "process-a", Type: "process", Label: "A", Detail: "PID 1"}, {ID: "network-b", Type: "network", Label: "ESTABLISHED", Detail: "example:443", Risk: 45}}}
	m.observe(changed, true)

	events := m.timeline(20)
	foundBaseline := false
	foundNew := false
	for _, e := range events {
		if e.Kind == "snapshot" {
			foundBaseline = true
		}
		if e.ObjectID == "network-b" && e.Kind == "observed" {
			foundNew = true
		}
	}
	if !foundBaseline || !foundNew {
		t.Fatalf("expected baseline and new-object events, got %+v", events)
	}
}
