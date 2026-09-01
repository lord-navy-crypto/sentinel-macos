// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEvaluateSystemConsoleEvidenceSeparatesGlobalAndObjectSignals(t *testing.T) {
	global := EvaluateSystemConsoleEvidence(SystemConsoleResult{ToolID: "sip-status", ToolName: "SIP", Status: "ok", Output: "System Integrity Protection status: disabled."})
	if len(global) != 1 || global[0].Code != "sip_disabled" || global[0].Severity != "review" {
		t.Fatalf("unexpected SIP signal: %#v", global)
	}
	if global[0].IncidentEligible {
		t.Fatalf("global SIP posture must not become a fake object incident")
	}
	object := EvaluateSystemConsoleEvidence(SystemConsoleResult{ToolID: "gatekeeper-assessment", ToolName: "Gatekeeper", Target: "/Applications/Example.app", Status: "reported", Output: "/Applications/Example.app: rejected\nsource=Unnotarized Developer ID"})
	if len(object) != 1 || object[0].Code != "gatekeeper_rejected" || !object[0].IncidentEligible {
		t.Fatalf("path-bearing Gatekeeper review must be incident eligible: %#v", object)
	}
}

func TestExpandedStructuredParsersAndContinuationTargets(t *testing.T) {
	apfs, ok := ParseExpandedSystemConsoleEvidence("apfs-layout", "+-- Container disk3\n    +-> Volume disk3s1\n        Mount Point: /System/Volumes/Data\n        FileVault: Yes")
	if !ok || apfs.Kind != "apfs_layout" || len(apfs.Records) == 0 {
		t.Fatalf("expected structured APFS records: %#v", apfs)
	}
	foundPath := false
	for _, r := range apfs.Records {
		if r.Path == "/System/Volumes/Data" {
			foundPath = true
		}
	}
	if !foundPath {
		t.Fatalf("expected APFS mount path continuation evidence")
	}
	parsed := ParsedSystemEvidence{Processes: []ProcessEvidenceRow{{PID: 321, Command: "Example"}}, Records: []SystemEvidenceRecord{{Kind: "mount", Label: "Data", Path: "/System/Volumes/Data"}}}
	if targets := SystemConsoleContinuationTargets(SystemConsoleResult{}, parsed); len(targets) < 2 {
		t.Fatalf("expected PID and path continuation targets: %#v", targets)
	}
}

func TestCompareSystemSnapshotsV23(t *testing.T) {
	from := SystemSnapshotV23{ID: "a", CapturedAt: "2026-08-29T00:00:00Z", Processes: []string{"user · A"}, Startup: []string{"one"}, Security: map[string]string{"sip-status": "enabled"}}
	to := SystemSnapshotV23{ID: "b", CapturedAt: "2026-08-29T01:00:00Z", Processes: []string{"user · A", "user · B"}, Startup: []string{"two"}, Security: map[string]string{"sip-status": "disabled"}}
	d := CompareSystemSnapshotsV23(from, to)
	if d.ChangeCount != 4 {
		t.Fatalf("expected 4 changes, got %d: %#v", d.ChangeCount, d)
	}
	if pair := d.SecurityChanged["sip-status"]; pair[0] != "enabled" || pair[1] != "disabled" {
		t.Fatalf("unexpected security diff: %#v", pair)
	}
}

func TestSystemEvidenceManagerBoundedAndNoRawOutputField(t *testing.T) {
	m := &systemEvidenceManager{persistent: false}
	for i := 0; i < systemEvidenceHistoryLimit+20; i++ {
		m.add(SystemEvidenceObservation{ID: entityID("obs", string(rune(i+1))), At: int64(i + 1), ToolID: "gatekeeper-status", Summary: "summary"})
	}
	rows := m.list(systemEvidenceHistoryLimit)
	if len(rows) != systemEvidenceHistoryLimit {
		t.Fatalf("retention=%d want=%d", len(rows), systemEvidenceHistoryLimit)
	}
	if strings.Contains(strings.ToLower(strings.Join([]string{rows[0].Summary, rows[0].ToolID}, " ")), "terminal raw output sentinel") {
		t.Fatal("unexpected raw output retention")
	}
}

func TestSystemSnapshotManagerRetention(t *testing.T) {
	m := &systemSnapshotManager{persistent: false}
	for i := 0; i < systemSnapshotLimit+4; i++ {
		m.add(SystemSnapshotV23{ID: entityID("snap", string(rune(i+1))), CapturedAt: "2026-08-29T00:00:00Z"})
	}
	if got := len(m.list()); got != systemSnapshotLimit {
		t.Fatalf("snapshot retention=%d want=%d", got, systemSnapshotLimit)
	}
}

func TestSystemEvidenceIncidentBridgeUsesRealAbsolutePathsOnly(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "Example")
	if err := os.WriteFile(path, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	old := controlEphemeral
	defer func() { controlEphemeral = old }()
	controlEphemeral = &controlPlaneState{systemEvidence: &systemEvidenceManager{}, systemSnapshots: &systemSnapshotManager{}, storageHistory: newStorageHistoryManager(true)}
	controlEphemeral.systemEvidence.add(SystemEvidenceObservation{ID: "global", At: 1, ToolID: "sip-status", Target: "", Signals: []SystemEvidenceSignal{{Code: "sip_disabled", Severity: "review", IncidentEligible: false, Summary: "global"}}})
	controlEphemeral.systemEvidence.add(SystemEvidenceObservation{ID: "x", At: 2, ToolID: "gatekeeper-assessment", Target: path, Signals: []SystemEvidenceSignal{{Code: "gatekeeper_rejected", Severity: "review", IncidentEligible: true, Summary: "review"}}})
	a := &app{ephemeral: true}
	rows := a.systemEvidenceIncidentCandidates()
	if len(rows) != 1 || rows[0].PrimaryPath != path {
		t.Fatalf("expected one path-centered incident candidate: %#v", rows)
	}
}

func TestScanRecoveryJobsKeepsFailedCancelledRunning(t *testing.T) {
	m := newScanManager()
	m.jobs["run"] = &ScanJob{ID: "run", Status: "running", Root: "/tmp", StartedAt: 3}
	m.jobs["done"] = &ScanJob{ID: "done", Status: "complete", Root: "/tmp", StartedAt: 2}
	m.jobs["fail"] = &ScanJob{ID: "fail", Status: "failed", Root: "/tmp", StartedAt: 1, Error: "x"}
	rows := m.recoveryJobs()
	if len(rows) != 2 || rows[0].ID != "run" {
		t.Fatalf("unexpected recovery jobs: %#v", rows)
	}
}
