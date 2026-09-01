// SPDX-License-Identifier: MPL-2.0
package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStorageActiveJobCapacity(t *testing.T) {
	m := newScanManager()
	m.jobs["one"] = &ScanJob{ID: "one", Status: "running"}
	m.jobs["two"] = &ScanJob{ID: "two", Status: "running"}
	before := len(m.jobs)
	job, err := m.create(StorageScanRequest{Scope: "home"})
	if job != nil || !errors.Is(err, errStorageScanCapacity) {
		t.Fatalf("expected capacity rejection, job=%v err=%v", job, err)
	}
	if len(m.jobs) != before {
		t.Fatalf("capacity rejection changed job map: before=%d after=%d", before, len(m.jobs))
	}
}

func TestSafeActionJournalFailureRunsRollback(t *testing.T) {
	root := t.TempDir()
	badJournal := filepath.Join(root, "journal-as-directory")
	if err := os.MkdirAll(badJournal, 0700); err != nil {
		t.Fatal(err)
	}
	m := &actionManager{persistent: true, stateDir: root, vaultDir: filepath.Join(root, "Vault"), journalPath: badJournal, pending: map[string]pendingAction{}}
	a := &app{actions: m}
	rolledBack := false
	err := a.commitAction(&ActionJournalEntry{ID: "test", Status: "success", Action: "rename"}, func() error { rolledBack = true; return nil })
	if err == nil || !rolledBack {
		t.Fatalf("journal failure must be visible and run rollback: err=%v rollback=%v", err, rolledBack)
	}
}

func TestP1HardeningSourceContracts(t *testing.T) {
	checks := map[string][]string{
		"trust.go":             {"readPrivateJSON(m.path, &p)", "readBoundedPrivateFile(m.backupPath, maxPrivateJSONBytes)", "atomicPrivateWrite(m.path, backupRaw)"},
		"web/app/core.js":      {"error.status=response.status", "error.payload=data"},
		"web/app/full-scan.js": {"classifyStageError", "outcome = 'FAILED'", "outcome = 'CANCELLED'", "'LIMITED' : 'DONE'"},
		"change_monitor.go":    {"persistence_healthy", "lastPersistError", "lastPersistOKAt"},
		"incidents.go":         {"persistence_healthy", "lastPersistError", "lastPersistOKAt"},
		"actions.go":           {"commitAction", "filesystem mutation was rolled back", "automatic rollback also failed"},
	}
	for path, needles := range checks {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		text := string(raw)
		for _, needle := range needles {
			if !strings.Contains(text, needle) {
				t.Fatalf("%s missing hardening contract %q", path, needle)
			}
		}
	}
}
