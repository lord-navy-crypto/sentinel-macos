// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSafeActionPreviewAnalysisSurfacesDependenciesAndRecovery(t *testing.T) {
	in := ActionPreview{ActionID: "a1", Action: "vault", Source: "/Users/test/demo", Destination: "/Users/test/Library/Application Support/Sentinel/Vault/v1/object", ObjectName: "demo", HashStatus: "verified", Reversible: true, Permanent: false, Dependencies: []ActionDependency{{Kind: "startup_reference", Severity: "high", Title: "startup", Detail: "plist"}, {Kind: "running_process", Severity: "high", Title: "running", Detail: "PID 123"}, {Kind: "trusted_profile", Severity: "review", Title: "trusted", Detail: "profile"}}}
	analysis := BuildSafeActionPreviewAnalysisV23(in)
	if analysis.Readiness != "review_dependencies" || analysis.HighestDependencySeverity != "high" {
		t.Fatalf("expected high dependency review: %+v", analysis)
	}
	if analysis.DependencyCount != 3 || len(analysis.DependencySummary) != 3 {
		t.Fatalf("unexpected dependency summary: %+v", analysis)
	}
	if len(analysis.Impacts) != 3 {
		t.Fatalf("expected persistence/runtime/trust impact rows: %+v", analysis.Impacts)
	}
	if len(analysis.PostValidation) < 3 || len(analysis.RecoveryPath) < 2 {
		t.Fatalf("vault preview must describe validation and recovery path: %+v", analysis)
	}
	if !strings.Contains(strings.ToLower(strings.Join(analysis.RecoveryPath, " ")), "restore preview") {
		t.Fatalf("vault recovery path missing restore preview: %+v", analysis.RecoveryPath)
	}
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if !strings.Contains(text, "post_validation") || !strings.Contains(text, "recovery_path") || !strings.Contains(text, "dependency_summary") {
		t.Fatalf("Safe Action preview JSON missing analysis: %s", raw)
	}
}

func TestSafeActionPreviewAnalysisRejectsNonReversibleContract(t *testing.T) {
	in := ActionPreview{Action: "rename", HashStatus: "not_checked", Reversible: false, Permanent: true}
	analysis := BuildSafeActionPreviewAnalysisV23(in)
	if analysis.Readiness != "blocked_by_contract" {
		t.Fatalf("Alpha control analysis must reject non-reversible/permanent preview contract: %+v", analysis)
	}
	if !strings.Contains(strings.ToLower(strings.Join(analysis.RecoveryPath, " ")), "does not satisfy") {
		t.Fatalf("missing contract explanation: %+v", analysis.RecoveryPath)
	}
}
