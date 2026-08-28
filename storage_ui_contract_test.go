// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestCoreLocalhostStorageProgressUsesBackendPhases(t *testing.T) {
	b, err := os.ReadFile("web/core-compat.js")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	for _, needle := range []string{
		"/api/storage/jobs",
		"phase_percent",
		"current_hash_path",
		"hash_bytes_done",
		"hash_bytes_total",
		"Hashing duplicate candidates",
		"Building storage report",
		"storagePhaseProgress",
		"requestAnimationFrame",
	} {
		if !strings.Contains(s, needle) {
			t.Fatalf("core localhost storage progress missing %q", needle)
		}
	}
}
