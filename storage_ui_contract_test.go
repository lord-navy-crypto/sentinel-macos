// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestSentinel24StorageProgressUsesBackendPhases(t *testing.T) {
	b, err := os.ReadFile("web/sentinel-24.js")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	for _, needle := range []string{
		"/api/storage/jobs",
		"phase_percent",
		"current_hash_path",
		"hash_files_done",
		"hash_files_total",
		"hash_bytes_done",
		"hash_bytes_total",
		"slow_paths_skipped",
		"Hash candidates",
		"Report",
		"setTimeout(pollStorage,500)",
	} {
		if !strings.Contains(s, needle) {
			t.Fatalf("Sentinel 2.4 storage progress missing %q", needle)
		}
	}
	for _, retired := range []string{"storagePhaseProgress", "requestAnimationFrame"} {
		if strings.Contains(s, retired) {
			t.Fatalf("Sentinel 2.4 storage progress unexpectedly depends on retired compatibility mechanism %q", retired)
		}
	}
}
