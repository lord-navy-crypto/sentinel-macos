// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"time"
)

const (
	vaultIsolationFully   = "fully_contained"
	vaultIsolationPartial = "partially_contained"
	vaultIsolationFailed  = "isolation_failed"
)

type VaultIsolationCheck struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
}

type VaultIsolationStatus struct {
	VaultID        string                `json:"vault_id"`
	ObjectName     string                `json:"object_name"`
	OriginalPath   string                `json:"original_path"`
	VaultPath      string                `json:"vault_path"`
	State          string                `json:"state"`
	LinkCount      uint64                `json:"link_count,omitempty"`
	LinkCountKnown bool                  `json:"link_count_known"`
	RunningPIDs    []int                 `json:"running_pids,omitempty"`
	StartupRefs    []string              `json:"startup_refs,omitempty"`
	OriginalExists bool                  `json:"original_exists"`
	ObjectMode     string                `json:"object_mode,omitempty"`
	DirectoryMode  string                `json:"directory_mode,omitempty"`
	HashMatch      string                `json:"hash_match"`
	Checks         []VaultIsolationCheck `json:"checks"`
}

type VaultIsolationResponse struct {
	GeneratedAt string                 `json:"generated_at"`
	Fully       int                    `json:"fully_contained"`
	Partial     int                    `json:"partially_contained"`
	Failed      int                    `json:"isolation_failed"`
	Items       []VaultIsolationStatus `json:"items"`
	Note        string                 `json:"note"`
}

func vaultIsolationState(checks []VaultIsolationCheck) string {
	state := vaultIsolationFully
	for _, check := range checks {
		switch check.Status {
		case "fail":
			return vaultIsolationFailed
		case "review", "unknown":
			state = vaultIsolationPartial
		}
	}
	return state
}

func statLinkCount(info os.FileInfo) (uint64, bool) {
	if info == nil || info.Sys() == nil {
		return 0, false
	}
	v := reflect.ValueOf(info.Sys())
	if v.Kind() == reflect.Ptr {
		if v.IsNil() {
			return 0, false
		}
		v = v.Elem()
	}
	if !v.IsValid() || v.Kind() != reflect.Struct {
		return 0, false
	}
	f := v.FieldByName("Nlink")
	if !f.IsValid() {
		return 0, false
	}
	switch f.Kind() {
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return f.Uint(), true
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		if f.Int() < 0 {
			return 0, false
		}
		return uint64(f.Int()), true
	default:
		return 0, false
	}
}

func pathExistsForIsolation(path string) (bool, error) {
	if path == "" {
		return false, nil
	}
	_, err := os.Lstat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

// verifiedVaultIsolationObject binds a manifest to the exact managed object
// belonging to the same Vault ID. A locally corrupted/tampered manifest must
// never make the isolation report inspect or hash an arbitrary path.
func verifiedVaultIsolationObject(m *actionManager, v VaultManifest) (string, os.FileInfo, error) {
	if m == nil || m.vaultDir == "" || v.ID == "" || v.VaultPath == "" {
		return "", nil, fmt.Errorf("Vault manifest does not identify an active managed object")
	}
	expected := filepath.Join(m.vaultDir, v.ID, "object")
	if !samePath(v.VaultPath, expected) {
		return "", nil, fmt.Errorf("Vault manifest path does not match its Vault ID")
	}
	managed, info, err := vaultMutablePath(m, v.VaultPath)
	if err != nil {
		return "", nil, err
	}
	resolved, err := filepath.EvalSymlinks(managed)
	if err != nil {
		return "", nil, err
	}
	if !samePath(managed, resolved) {
		return "", nil, fmt.Errorf("Vault object path traverses a symbolic link")
	}
	return managed, info, nil
}

func (m *actionManager) vaultIsolationForManifest(v VaultManifest) VaultIsolationStatus {
	out := VaultIsolationStatus{
		VaultID: v.ID, ObjectName: v.OriginalName, OriginalPath: v.OriginalPath,
		VaultPath: v.VaultPath, HashMatch: "not_checked", Checks: []VaultIsolationCheck{},
	}
	add := func(id, status, title, detail string) {
		out.Checks = append(out.Checks, VaultIsolationCheck{ID: id, Status: status, Title: title, Detail: detail})
	}

	managedVaultPath, objectInfo, objectErr := verifiedVaultIsolationObject(m, v)
	if objectErr != nil {
		add("manifest-binding", "fail", "Vault manifest binding", fmt.Sprintf("Manifest does not resolve to its exact managed Vault object: %v", objectErr))
		add("vault-object", "fail", "Vault object", "Stored object cannot be trusted as the managed object named by this manifest.")
	} else {
		add("manifest-binding", "pass", "Vault manifest binding", "Manifest path matches the exact managed object for this Vault ID and does not traverse a symbolic link.")
		out.VaultPath = managedVaultPath
		out.ObjectMode = objectInfo.Mode().Perm().String()
		add("vault-object", "pass", "Vault object", "Stored object exists as a regular non-symlink file.")
		if objectInfo.Mode().Perm() == 0o600 {
			add("object-permissions", "pass", "Execution isolation", "Vault object mode is 0600; executable permission bits are removed.")
		} else if objectInfo.Mode().Perm()&0o111 != 0 {
			add("object-permissions", "fail", "Execution isolation", fmt.Sprintf("Vault object mode is %04o and still has executable permission bits.", objectInfo.Mode().Perm()))
		} else {
			add("object-permissions", "review", "Execution isolation", fmt.Sprintf("Vault object mode is %04o instead of the expected 0600.", objectInfo.Mode().Perm()))
		}
		if links, ok := statLinkCount(objectInfo); ok {
			out.LinkCount, out.LinkCountKnown = links, true
			if links == 1 {
				add("hard-links", "pass", "Filesystem references", "The Vault object has one observed hard-link reference.")
			} else if links > 1 {
				add("hard-links", "review", "Filesystem references", fmt.Sprintf("The Vault object has %d hard-link references; another path may still name the same inode.", links))
			} else {
				add("hard-links", "unknown", "Filesystem references", "Hard-link count was reported as zero and cannot be treated as verified isolation.")
			}
		} else {
			add("hard-links", "unknown", "Filesystem references", "Hard-link count is unavailable on this runtime.")
		}
	}

	vaultDirForCheck := filepath.Dir(v.VaultPath)
	if managedVaultPath != "" {
		vaultDirForCheck = filepath.Dir(managedVaultPath)
	}
	if dirInfo, err := os.Lstat(vaultDirForCheck); err != nil {
		add("vault-directory", "fail", "Vault directory", fmt.Sprintf("Per-object Vault directory is unavailable: %v", err))
	} else {
		out.DirectoryMode = dirInfo.Mode().Perm().String()
		if dirInfo.IsDir() && dirInfo.Mode()&os.ModeSymlink == 0 && dirInfo.Mode().Perm() == 0o700 {
			add("vault-directory", "pass", "Vault directory", "Per-object Vault directory mode is 0700.")
		} else {
			add("vault-directory", "fail", "Vault directory", fmt.Sprintf("Per-object Vault directory is not a real 0700 directory; observed mode %04o.", dirInfo.Mode().Perm()))
		}
	}

	if exists, err := pathExistsForIsolation(v.OriginalPath); err != nil {
		add("original-path", "unknown", "Original path", fmt.Sprintf("Could not verify whether the original path is absent: %v", err))
	} else {
		out.OriginalExists = exists
		if exists {
			add("original-path", "review", "Original path", "A filesystem object currently exists at the recorded original path. It may be a different object and should be reviewed.")
		} else {
			add("original-path", "pass", "Original path", "No filesystem object is currently observed at the recorded original path.")
		}
	}

	pathsForRuntime := []string{v.OriginalPath}
	if managedVaultPath != "" {
		pathsForRuntime = append(pathsForRuntime, managedVaultPath)
	}
	out.RunningPIDs = runningPIDsForPaths(pathsForRuntime...)
	sort.Ints(out.RunningPIDs)
	if len(out.RunningPIDs) > 0 {
		add("running-processes", "review", "Runtime containment", fmt.Sprintf("Related running PID(s) remain observable: %v. Vaulting does not terminate an already-running process.", out.RunningPIDs))
	} else {
		add("running-processes", "pass", "Runtime containment", "No related running PID is currently observed for the original or verified Vault path.")
	}

	startupPaths := []string{v.OriginalPath}
	if managedVaultPath != "" {
		startupPaths = append(startupPaths, managedVaultPath)
	}
	refs := []string{}
	for _, p := range startupPaths {
		refs = append(refs, startupRefsForPath(p)...)
	}
	out.StartupRefs = uniqueStrings(refs)
	sort.Strings(out.StartupRefs)
	if len(out.StartupRefs) > 0 {
		add("startup-chain", "review", "Startup-chain isolation", fmt.Sprintf("%d startup reference(s) still point at the recorded object path. The file move can break execution without removing the configuration.", len(out.StartupRefs)))
	} else {
		add("startup-chain", "pass", "Startup-chain isolation", "No matching LaunchAgent/LaunchDaemon startup reference is currently observed.")
	}

	if objectErr == nil && managedVaultPath != "" && v.SHA256 != "" {
		if objectInfo != nil && objectInfo.Size() <= actionGuardHashLimit {
			if hash, err := sha256File(context.Background(), managedVaultPath); err != nil {
				out.HashMatch = "unavailable"
				add("content-integrity", "unknown", "Content integrity", fmt.Sprintf("Recorded SHA-256 exists but live verification failed: %v", err))
			} else if hash == v.SHA256 {
				out.HashMatch = "verified"
				add("content-integrity", "pass", "Content integrity", "Stored object matches the recorded SHA-256 fingerprint.")
			} else {
				out.HashMatch = "mismatch"
				add("content-integrity", "fail", "Content integrity", "Stored object no longer matches the recorded SHA-256 fingerprint.")
			}
		} else {
			out.HashMatch = "not_checked"
			add("content-integrity", "unknown", "Content integrity", "A recorded fingerprint exists, but live hashing is outside the bounded verification limit.")
		}
	} else if v.SHA256 == "" {
		out.HashMatch = "not_recorded"
		add("content-integrity", "unknown", "Content integrity", "No SHA-256 fingerprint was recorded for this object, so content identity cannot be reverified.")
	} else if objectErr != nil {
		out.HashMatch = "not_checked"
		add("content-integrity", "unknown", "Content integrity", "Content hashing was skipped because the manifest was not bound to a verified managed Vault object.")
	}

	out.State = vaultIsolationState(out.Checks)
	return out
}

func (m *actionManager) vaultIsolationSnapshot() VaultIsolationResponse {
	response := VaultIsolationResponse{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Items:       []VaultIsolationStatus{},
		Note:        "Containment state is based on bounded local observations. Fully Contained is not a malware verdict or a guarantee that no unobserved copy exists.",
	}
	if m == nil || !m.persistent {
		return response
	}
	for _, manifest := range m.vaultSnapshot() {
		status := m.vaultIsolationForManifest(manifest)
		response.Items = append(response.Items, status)
		switch status.State {
		case vaultIsolationFully:
			response.Fully++
		case vaultIsolationFailed:
			response.Failed++
		default:
			response.Partial++
		}
	}
	return response
}

func (a *app) handleVaultIsolation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, a.actions.vaultIsolationSnapshot())
}
