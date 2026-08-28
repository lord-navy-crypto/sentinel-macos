// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestDoctorReport(t *testing.T) {
	r := collectDoctorReport()
	if r.Version != sentinelVersion {
		t.Fatalf("version=%q", r.Version)
	}
	if len(r.Checks) < 5 {
		t.Fatalf("checks=%d", len(r.Checks))
	}
	found := false
	for _, c := range r.Checks {
		if c.Name == "Loopback-only server" && c.Status == "pass" {
			found = true
		}
	}
	if !found {
		t.Fatal("loopback self-check missing")
	}
}
