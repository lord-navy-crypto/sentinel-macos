// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestCoverageAlwaysDeclaresAdvancedEndpointBoundary(t *testing.T) {
	c := collectCoverageMap()
	found := false
	for _, x := range c.Items {
		if x.Area == "Real-time endpoint telemetry" {
			found = true
			if x.Status != "advanced-required" {
				t.Fatalf("status=%s", x.Status)
			}
		}
	}
	if !found {
		t.Fatal("missing Endpoint Security coverage boundary")
	}
}

func TestWeaknessAuditDoesNotClaimMalwareStatus(t *testing.T) {
	a := &app{allowedHost: "127.0.0.1:1", serverOrigin: "http://127.0.0.1:1", behavior: newBehaviorManager(true), trust: newTrustManager(true), actions: newActionManager(true)}
	r := a.weaknessAudit()
	if r.Score < 0 || r.Score > 100 {
		t.Fatalf("score=%d", r.Score)
	}
	if r.Note == "" {
		t.Fatal("expected explanatory note")
	}
}
