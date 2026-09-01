// SPDX-License-Identifier: MPL-2.0
package main

import (
	"strings"
	"testing"
)

func TestStorageProgressUsesBackendPhases(t *testing.T) {
	s := requireProductScript(t, "web/app/lenses/system.js")
	for _, needle := range []string{"/api/storage/jobs", "phase_percent", "current_hash_path", "hash_files_done", "hash_files_total", "hash_bytes_done", "hash_bytes_total", "slow_paths_skipped", "Hash candidates", "Report", "setTimeout(pollStorage,500)"} {
		if !strings.Contains(s, needle) {
			t.Fatalf("storage progress missing %q", needle)
		}
	}
	for _, retired := range []string{"storagePhaseProgress", "requestAnimationFrame"} {
		if strings.Contains(s, retired) {
			t.Fatalf("storage progress depends on retired mechanism %q", retired)
		}
	}
}
