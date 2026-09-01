// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIncidentExportContainsReasonCodesAndNoFileContents(t *testing.T) {
	in := Incident{ID: "episode", PrimaryPath: "/tmp/Example", CreatedAt: 1, UpdatedAt: 2, Severity: "review", Evidence: []IncidentEvidence{{At: 1, Source: "system_console", Kind: "gatekeeper_rejected", Severity: "review", Path: "/tmp/Example", Detail: "rejected"}}}
	x := buildIncidentExport(in)
	if x.Schema != incidentExportSchema || x.StableID == "" || len(x.Explanation.ReasonCodes) == 0 || len(x.Timeline) != 1 {
		t.Fatalf("export=%+v", x)
	}
	if !strings.Contains(strings.ToLower(x.Privacy), "does not attach") {
		t.Fatalf("privacy contract missing: %q", x.Privacy)
	}
}

func TestInvestigationBundleBoundsBranchesAndDoesNotCopyContents(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "secret.txt")
	secret := "SENTINEL_TEST_SECRET_CONTENT_7c8f"
	if err := os.WriteFile(path, []byte(secret), 0600); err != nil {
		t.Fatal(err)
	}
	s := InvestigationSession{ID: "session", Title: "Test", RootPath: path}
	for i := 0; i < investigationBundleBranchLimit+5; i++ {
		p := path
		if i > 0 {
			p = filepath.Join(dir, "missing", string(rune('a'+i%20)))
		}
		s.Branches = append(s.Branches, InvestigationSessionBranch{Path: p, Bookmarked: i%2 == 0, VisitCount: 1})
	}
	x := buildInvestigationBundle(s)
	if len(x.Branches) != investigationBundleBranchLimit || !x.Truncated {
		t.Fatalf("bundle bounds=%d truncated=%v", len(x.Branches), x.Truncated)
	}
	for _, b := range x.Branches {
		if strings.Contains(b.Note, secret) || strings.Contains(b.Kind, secret) {
			t.Fatal("file content leaked into branch metadata")
		}
	}
	if !strings.Contains(strings.ToLower(x.Privacy), "never copied") {
		t.Fatalf("privacy=%q", x.Privacy)
	}
}

func TestInvestigationSessionFindReturnsDetachedCopy(t *testing.T) {
	m := &investigationSessionManager{sessions: []InvestigationSession{{ID: "x", Branches: []InvestigationSessionBranch{{Path: "/tmp/A"}}}}}
	s, ok := m.find("x")
	if !ok {
		t.Fatal("session not found")
	}
	s.Branches[0].Path = "/mutated"
	again, _ := m.find("x")
	if again.Branches[0].Path != "/tmp/A" {
		t.Fatal("find returned shared branch storage")
	}
}
