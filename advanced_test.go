// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestAuditTargetFromCommand(t *testing.T) {
	got, script := auditTargetFromCommand(`/usr/bin/python3 /tmp/demo.py --flag`)
	if got != "/tmp/demo.py" || !script {
		t.Fatalf("got %q script=%v", got, script)
	}
	got, script = auditTargetFromCommand(`/Applications/Test.app/Contents/MacOS/Test --flag`)
	if got != "/Applications/Test.app/Contents/MacOS/Test" || script {
		t.Fatalf("binary got %q script=%v", got, script)
	}
}

func TestAdvancedStorageFindsExactDuplicates(t *testing.T) {
	root := t.TempDir()
	a := []byte("same bytes for duplicate detection")
	if err := os.WriteFile(filepath.Join(root, "project_v1.zip"), a, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "project_v2.zip"), a, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "other.bin"), []byte("different"), 0600); err != nil {
		t.Fatal(err)
	}
	var phases []string
	r, err := scanStorageAdvanced(context.Background(), root, 1, 20, func(p storageProgress) {
		if len(phases) == 0 || phases[len(phases)-1] != p.Phase {
			phases = append(phases, p.Phase)
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Duplicates) != 1 {
		t.Fatalf("duplicates=%d", len(r.Duplicates))
	}
	if len(r.Duplicates[0].Files) != 2 {
		t.Fatalf("duplicate files=%d", len(r.Duplicates[0].Files))
	}
	if len(r.Families) != 1 {
		t.Fatalf("families=%d", len(r.Families))
	}
	if r.VisibleBytes == 0 || len(r.Categories) == 0 || len(r.FileTypes) == 0 {
		t.Fatal("expected storage insights")
	}
	for _, want := range []string{"walking", "grouping", "hashing", "finalizing", "complete"} {
		found := false
		for _, got := range phases {
			if got == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing storage phase %q in %v", want, phases)
		}
	}
}

func TestAdvancedStorageCancellation(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "x.bin"), make([]byte, 1024), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r, err := scanStorageAdvanced(ctx, root, 1, 20, func(storageProgress) {})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err=%v", err)
	}
	if r == nil || !r.Cancelled {
		t.Fatal("expected cancelled result")
	}
}

func TestDuplicateHashPlanRequiresTwoFilesWithinBudget(t *testing.T) {
	const gib = uint64(1024 * 1024 * 1024)
	candidates := map[uint64][]LargeFile{
		3 * gib: {
			{Path: "/tmp/a", Size: 3 * gib},
			{Path: "/tmp/b", Size: 3 * gib},
		},
	}
	plan, total := buildDuplicateHashPlan(candidates, 4*gib)
	if len(plan) != 0 || total != 0 {
		t.Fatalf("oversized pair must be skipped, got plan=%d total=%d", len(plan), total)
	}
}

func TestDuplicateHashPlanNeverExceedsBudget(t *testing.T) {
	const gib = uint64(1024 * 1024 * 1024)
	candidates := map[uint64][]LargeFile{
		1 * gib: {
			{Path: "/tmp/a", Size: 1 * gib},
			{Path: "/tmp/b", Size: 1 * gib},
			{Path: "/tmp/c", Size: 1 * gib},
		},
		2 * gib: {
			{Path: "/tmp/d", Size: 2 * gib},
			{Path: "/tmp/e", Size: 2 * gib},
		},
	}
	plan, total := buildDuplicateHashPlan(candidates, 4*gib)
	if total > 4*gib {
		t.Fatalf("planned bytes %d exceed budget", total)
	}
	if len(plan) < 2 {
		t.Fatalf("expected at least one comparable pair, got %d items", len(plan))
	}
	bySize := map[uint64]int{}
	for _, item := range plan {
		bySize[item.size]++
	}
	for size, count := range bySize {
		if count == 1 {
			t.Fatalf("planned a useless one-file hash group for size %d", size)
		}
	}
}
