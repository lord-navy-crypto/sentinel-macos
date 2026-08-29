// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"testing"
)

func TestInvestigationSessionRejectsRelativePaths(t *testing.T) {
	m := newInvestigationSessionManager(true)
	if _, err := m.save(InvestigationSessionSaveRequest{Path: "relative/path"}); err == nil {
		t.Fatal("relative investigation session path was accepted")
	}
}

func TestInvestigationSessionCreatesBranchesAndPreservesBookmark(t *testing.T) {
	m := newInvestigationSessionManager(true)
	root, err := m.save(InvestigationSessionSaveRequest{
		Title: "Example investigation",
		Path: "/Applications/Example.app",
		Kind: "application_bundle",
	})
	if err != nil {
		t.Fatal(err)
	}
	if root.ID == "" || root.RootPath != "/Applications/Example.app" || len(root.Branches) != 1 {
		t.Fatalf("unexpected root session: %+v", root)
	}

	branch, err := m.save(InvestigationSessionSaveRequest{
		SessionID: root.ID,
		Path: "/Applications/Example.app/Contents/MacOS/Example",
		ParentPath: "/Applications/Example.app",
		Kind: "executable",
		Note: "main executable",
		Bookmarked: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(branch.Branches) != 2 {
		t.Fatalf("expected two branches: %+v", branch)
	}

	branch, err = m.save(InvestigationSessionSaveRequest{
		SessionID: root.ID,
		Path: "/Applications/Example.app/Contents/MacOS/Example",
		Kind: "executable",
	})
	if err != nil {
		t.Fatal(err)
	}
	var found *InvestigationSessionBranch
	for i := range branch.Branches {
		if branch.Branches[i].Path == "/Applications/Example.app/Contents/MacOS/Example" {
			found = &branch.Branches[i]
			break
		}
	}
	if found == nil || !found.Bookmarked || found.VisitCount != 2 || found.Note != "main executable" {
		t.Fatalf("bookmark/note/revisit semantics changed: %+v", found)
	}
}

func TestInvestigationSessionBranchRetentionIsBounded(t *testing.T) {
	m := newInvestigationSessionManager(true)
	first, err := m.save(InvestigationSessionSaveRequest{Path: "/tmp/sentinel-session-root"})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < investigationSessionBranchLimit+12; i++ {
		_, err := m.save(InvestigationSessionSaveRequest{
			SessionID: first.ID,
			Path: fmt.Sprintf("/tmp/sentinel-session-branch-%03d", i),
			Kind: "file",
			Bookmarked: i == 0,
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	list := m.list()
	if len(list) != 1 {
		t.Fatalf("sessions=%d want 1", len(list))
	}
	if got := len(list[0].Branches); got > investigationSessionBranchLimit {
		t.Fatalf("branches=%d exceeds limit %d", got, investigationSessionBranchLimit)
	}
	bookmarked := false
	for _, branch := range list[0].Branches {
		if branch.Path == "/tmp/sentinel-session-branch-000" && branch.Bookmarked {
			bookmarked = true
		}
	}
	if !bookmarked {
		t.Fatal("retention dropped an older bookmarked branch while ordinary branches were available")
	}
}

func TestInvestigationSessionListReturnsDetachedBranchSlices(t *testing.T) {
	m := newInvestigationSessionManager(true)
	if _, err := m.save(InvestigationSessionSaveRequest{Path: "/tmp/sentinel-detached"}); err != nil {
		t.Fatal(err)
	}
	first := m.list()
	first[0].Branches[0].Note = "mutated copy"
	second := m.list()
	if second[0].Branches[0].Note == "mutated copy" {
		t.Fatal("list leaked mutable branch backing storage")
	}
}
