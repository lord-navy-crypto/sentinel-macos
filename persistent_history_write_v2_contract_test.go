// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestPersistentHistoryV2ProductionRouteContract(t *testing.T) {
	raw, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(raw)
	want := `mux.HandleFunc("/api/maintenance/history/sample", a.auth(a.work.wrap("persistent-resource-sample", a.handlePersistentHistorySampleV2)))`
	if !strings.Contains(source, want) {
		t.Fatal("production persistent-history sample route is not wired to V2 bounded writer")
	}
}

func TestPersistentHistoryV2SourceContract(t *testing.T) {
	raw, err := os.ReadFile("persistent_history_write_v2.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(raw)
	for _, marker := range []string{
		`persistentHistoryWriteLimitBytes = int64(12 * 1024 * 1024)`,
		`persistentHistoryCompactToBytes  = int64(8 * 1024 * 1024)`,
		`persistentHistoryMaxSampleBytes  = 256 * 1024`,
		`persistentHistoryWriteMu sync.Mutex`,
		`os.Chmod(stateDir, 0700)`,
		`os.Rename(tmpPath, path)`,
		`os.Chmod(path, 0600)`,
		`resource history path must not be a symlink`,
	} {
		if !strings.Contains(source, marker) {
			t.Fatalf("missing V2 write-path contract marker %q", marker)
		}
	}
}
