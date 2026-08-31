// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestVaultManifestAcceptsConsistentPaths(t *testing.T) {
	root := t.TempDir()
	originalDir := filepath.Join(root, "original")
	if err := os.Mkdir(originalDir, 0o700); err != nil {
		t.Fatal(err)
	}
	id := "v-abc123"
	manifest := map[string]any{
		"version":       vaultManifestVersion,
		"id":            id,
		"original_path": filepath.Join(originalDir, "sample.bin"),
		"original_name": "sample.bin",
		"vault_path":    filepath.Join(root, "Vault", id, "object"),
		"moved_at":      "2026-08-31T00:00:00Z",
	}
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	var got VaultManifest
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("valid manifest rejected: %v", err)
	}
	if got.ID != id || got.OriginalName != "sample.bin" {
		t.Fatalf("unexpected decoded manifest: %#v", got)
	}
}

func TestVaultManifestRejectsCrossIDObjectPath(t *testing.T) {
	root := t.TempDir()
	originalDir := filepath.Join(root, "original")
	if err := os.Mkdir(originalDir, 0o700); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]any{
		"version":       vaultManifestVersion,
		"id":            "v-one",
		"original_path": filepath.Join(originalDir, "sample.bin"),
		"original_name": "sample.bin",
		"vault_path":    filepath.Join(root, "Vault", "v-two", "object"),
	})
	var got VaultManifest
	if err := json.Unmarshal(raw, &got); err == nil {
		t.Fatal("manifest pointing at another Vault ID must be rejected")
	}
}

func TestVaultManifestRejectsOriginalPathThroughSymlinkAncestor(t *testing.T) {
	root := t.TempDir()
	realRoot := filepath.Join(root, "real")
	realParent := filepath.Join(realRoot, "parent")
	if err := os.MkdirAll(realParent, 0o700); err != nil {
		t.Fatal(err)
	}
	linkRoot := filepath.Join(root, "linked")
	if err := os.Symlink(realRoot, linkRoot); err != nil {
		t.Fatal(err)
	}
	id := "v-link"
	raw, _ := json.Marshal(map[string]any{
		"version":       vaultManifestVersion,
		"id":            id,
		"original_path": filepath.Join(linkRoot, "parent", "sample.bin"),
		"original_name": "sample.bin",
		"vault_path":    filepath.Join(root, "Vault", id, "object"),
	})
	var got VaultManifest
	if err := json.Unmarshal(raw, &got); err == nil {
		t.Fatal("manifest whose original path traverses a symlink ancestor must be rejected")
	}
}

func TestVaultManifestRejectsSymlinkedActiveObject(t *testing.T) {
	root := t.TempDir()
	originalDir := filepath.Join(root, "original")
	if err := os.Mkdir(originalDir, 0o700); err != nil {
		t.Fatal(err)
	}
	id := "v-link-object"
	vaultDir := filepath.Join(root, "Vault", id)
	if err := os.MkdirAll(vaultDir, 0o700); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(root, "outside.bin")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	object := filepath.Join(vaultDir, "object")
	if err := os.Symlink(outside, object); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]any{
		"version":       vaultManifestVersion,
		"id":            id,
		"original_path": filepath.Join(originalDir, "sample.bin"),
		"original_name": "sample.bin",
		"vault_path":    object,
	})
	var got VaultManifest
	if err := json.Unmarshal(raw, &got); err == nil {
		t.Fatal("manifest pointing at a symlinked active Vault object must be rejected")
	}
}
