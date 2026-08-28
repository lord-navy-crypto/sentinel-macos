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
	r, err := scanStorageAdvanced(context.Background(), root, 1, 20, func(int, int, int, string) {})
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
}

func TestAdvancedStorageCancellation(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "x.bin"), make([]byte, 1024), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r, err := scanStorageAdvanced(ctx, root, 1, 20, func(int, int, int, string) {})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err=%v", err)
	}
	if r == nil || !r.Cancelled {
		t.Fatal("expected cancelled result")
	}
}
