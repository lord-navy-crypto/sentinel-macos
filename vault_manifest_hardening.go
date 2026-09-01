// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// UnmarshalJSON makes Vault recovery metadata self-validating at every read
// boundary. This is deliberately structural/path validation only; the action
// manager still applies HOME/Vault scope, object identity, hash, and no-overwrite
// checks immediately before mutation.
func (v *VaultManifest) UnmarshalJSON(data []byte) error {
	type rawVaultManifest VaultManifest
	var raw rawVaultManifest
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	candidate := VaultManifest(raw)
	if candidate.ID == "" || candidate.ID == "." || candidate.ID == ".." || strings.ContainsAny(candidate.ID, "/\\") {
		return fmt.Errorf("invalid Vault manifest id")
	}
	if candidate.OriginalPath == "" || !filepath.IsAbs(candidate.OriginalPath) {
		return fmt.Errorf("invalid Vault manifest original path")
	}
	original := filepath.Clean(candidate.OriginalPath)
	if candidate.OriginalName == "" || filepath.Base(original) != candidate.OriginalName || filepath.Base(candidate.OriginalName) != candidate.OriginalName {
		return fmt.Errorf("Vault manifest original name does not match its recorded path")
	}

	// If the recorded parent currently exists, require the full ancestor chain to
	// resolve to the exact same path. This catches a parent or higher ancestor
	// swapped to a symlink between preview and restore execution.
	parent := filepath.Dir(original)
	if st, err := os.Lstat(parent); err == nil {
		if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("Vault manifest original parent is not a real directory")
		}
		resolvedParent, err := filepath.EvalSymlinks(parent)
		if err != nil {
			return fmt.Errorf("resolve Vault manifest original parent: %w", err)
		}
		if !samePath(parent, resolvedParent) {
			return fmt.Errorf("Vault manifest original path traverses a symbolic-link ancestor")
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("inspect Vault manifest original parent: %w", err)
	}

	if candidate.VaultPath != "" {
		if !filepath.IsAbs(candidate.VaultPath) {
			return fmt.Errorf("invalid active Vault object path")
		}
		vaultPath := filepath.Clean(candidate.VaultPath)
		if filepath.Base(vaultPath) != "object" || filepath.Base(filepath.Dir(vaultPath)) != candidate.ID {
			return fmt.Errorf("active Vault object path is not bound to the manifest id")
		}
		// If the object exists, reject any symlink traversal before a caller can use
		// the manifest for isolation evidence or a recovery preview.
		if _, err := os.Lstat(vaultPath); err == nil {
			resolvedVault, err := filepath.EvalSymlinks(vaultPath)
			if err != nil {
				return fmt.Errorf("resolve active Vault object: %w", err)
			}
			if !samePath(vaultPath, resolvedVault) {
				return fmt.Errorf("active Vault object path traverses a symbolic link")
			}
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("inspect active Vault object: %w", err)
		}
	}

	*v = candidate
	return nil
}
