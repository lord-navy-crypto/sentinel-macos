// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRuntimeLockRejectsSymlinkTarget(t *testing.T) {
	t.Setenv("TMPDIR", t.TempDir())
	target := filepath.Join(t.TempDir(), "do-not-touch.txt")
	if err := os.WriteFile(target, []byte("preserve-me"), 0600); err != nil {
		t.Fatal(err)
	}
	lockPath := runtimeLockPath()
	if err := os.Symlink(target, lockPath); err != nil {
		t.Fatal(err)
	}
	if l, err := acquireRuntimeLock(true); err == nil {
		if l != nil {
			l.release()
		}
		t.Fatal("runtime lock must reject a symlink at the predictable temp path")
	}
	raw, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "preserve-me" {
		t.Fatalf("symlink target was modified: %q", raw)
	}
}

func TestRuntimeLockUsesKernelAdvisoryLockWithoutUnlink(t *testing.T) {
	raw, err := os.ReadFile("runtime_guard.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, want := range []string{"syscall.Flock", "syscall.LOCK_EX|syscall.LOCK_NB", "syscall.O_NOFOLLOW"} {
		if !strings.Contains(s, want) {
			t.Fatalf("runtime lock hardening missing %q", want)
		}
	}
	if strings.Contains(s, "os.Remove(l.path)") {
		t.Fatal("runtime lock must not unlink a path that a new owner may already have opened")
	}
}
