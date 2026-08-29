// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestVaultIsolationState(t *testing.T) {
	pass := []VaultIsolationCheck{{Status: "pass"}, {Status: "pass"}}
	if got := vaultIsolationState(pass); got != vaultIsolationFully {
		t.Fatalf("all-pass isolation = %q, want %q", got, vaultIsolationFully)
	}
	partial := append(append([]VaultIsolationCheck{}, pass...), VaultIsolationCheck{Status: "review"})
	if got := vaultIsolationState(partial); got != vaultIsolationPartial {
		t.Fatalf("review isolation = %q, want %q", got, vaultIsolationPartial)
	}
	unknown := append(append([]VaultIsolationCheck{}, pass...), VaultIsolationCheck{Status: "unknown"})
	if got := vaultIsolationState(unknown); got != vaultIsolationPartial {
		t.Fatalf("unknown isolation = %q, want %q", got, vaultIsolationPartial)
	}
	failed := append(append([]VaultIsolationCheck{}, partial...), VaultIsolationCheck{Status: "fail"})
	if got := vaultIsolationState(failed); got != vaultIsolationFailed {
		t.Fatalf("failed isolation = %q, want %q", got, vaultIsolationFailed)
	}
}

func TestStatLinkCountDetectsAdditionalHardLink(t *testing.T) {
	dir := t.TempDir()
	first := filepath.Join(dir, "first")
	second := filepath.Join(dir, "second")
	if err := os.WriteFile(first, []byte("sentinel"), 0o600); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(first)
	if err != nil {
		t.Fatal(err)
	}
	if links, ok := statLinkCount(info); ok && links != 1 {
		t.Fatalf("initial hard-link count = %d, want 1", links)
	}
	if err := os.Link(first, second); err != nil {
		t.Skipf("hard links unavailable on this test filesystem: %v", err)
	}
	info, err = os.Lstat(first)
	if err != nil {
		t.Fatal(err)
	}
	links, ok := statLinkCount(info)
	if !ok {
		t.Skip("runtime does not expose link count")
	}
	if links < 2 {
		t.Fatalf("hard-link count = %d, want at least 2", links)
	}
}
