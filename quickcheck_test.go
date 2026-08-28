// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAttentionBand(t *testing.T) {
	cases := []struct {
		in   int
		want string
	}{{0, "Quiet"}, {19, "Quiet"}, {20, "Observe"}, {44, "Observe"}, {45, "Review"}, {74, "Review"}, {75, "Elevated"}}
	for _, c := range cases {
		if got := attentionBand(c.in); got != c.want {
			t.Fatalf("attentionBand(%d)=%q want %q", c.in, got, c.want)
		}
	}
}

func TestContainsFold(t *testing.T) {
	if !containsFold("/Applications/Safari.app", "sAfArI") {
		t.Fatal("case-insensitive search should match")
	}
	if containsFold("abc", "xyz") {
		t.Fatal("unexpected match")
	}
}

func TestQuickCheckDoesNotCreateBaselineState(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	a := &app{jobs: newScanManager(), intel: newIntelligenceManager(), behavior: newBehaviorManager(false), trust: newTrustManager(false), persistence: newPersistenceManager(), actions: newActionManager(false)}
	_ = a.quickCheck()
	if a.behavior.baseline != nil {
		t.Fatal("Quick Check must not create a Behavior baseline")
	}
	if a.trust.profile != nil {
		t.Fatal("Quick Check must not create a Trusted Profile")
	}
	if a.persistence.status().Initialized {
		t.Fatal("Quick Check must not create a Persistence baseline")
	}
	if _, err := os.Stat(filepath.Join(home, "Library", "Application Support", "Sentinel", "behavior-baseline.json")); err == nil {
		t.Fatal("Quick Check unexpectedly wrote behavior baseline")
	}
}
