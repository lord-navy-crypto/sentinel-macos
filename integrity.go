// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const integrityHashLimit uint64 = 256 * 1024 * 1024

type IntegrityInspection struct {
	Path             string               `json:"path"`
	Exists           bool                 `json:"exists"`
	IsDirectory      bool                 `json:"is_directory"`
	Size             uint64               `json:"size"`
	ModifiedAt       string               `json:"modified_at,omitempty"`
	Mode             string               `json:"mode,omitempty"`
	FileType         string               `json:"file_type,omitempty"`
	Architectures    []string             `json:"architectures,omitempty"`
	SHA256           string               `json:"sha256,omitempty"`
	HashStatus       string               `json:"hash_status"`
	Quarantine       string               `json:"quarantine,omitempty"`
	WhereFrom        []string             `json:"where_from,omitempty"`
	Identity         CodeIdentity         `json:"identity"`
	NativeValidation NativeCodeValidation `json:"native_validation"`
	Sources          []string             `json:"sources"`
	Notes            []string             `json:"notes"`
}

func inspectIntegrity(path string) IntegrityInspection {
	path = normalizeEvidencePath(path)
	out := IntegrityInspection{Path: path, HashStatus: "not attempted", Sources: []string{"os.Stat", "SHA-256", "codesign", "spctl"}}
	if path == "" {
		out.Notes = append(out.Notes, "Choose an absolute path or a ~/ path to inspect.")
		return out
	}
	st, err := os.Stat(path)
	if err != nil {
		out.Notes = append(out.Notes, "Path could not be read: "+err.Error())
		out.Identity = inspectCodeIdentity(path)
		return out
	}
	out.Exists = true
	out.IsDirectory = st.IsDir()
	if st.Size() > 0 {
		out.Size = uint64(st.Size())
	}
	out.ModifiedAt = st.ModTime().UTC().Format(time.RFC3339)
	out.Mode = st.Mode().String()

	if commandExists("file") {
		if raw, err := commandOutput(2*time.Second, "file", "-b", path); err == nil {
			out.FileType = raw
			out.Sources = append(out.Sources, "file")
		}
	}
	if runtime.GOOS == "darwin" && commandExists("lipo") && !st.IsDir() {
		if raw, err := commandOutput(2*time.Second, "lipo", "-archs", path); err == nil && strings.TrimSpace(raw) != "" {
			out.Architectures = strings.Fields(raw)
			out.Sources = append(out.Sources, "lipo")
		}
	}
	if !st.IsDir() {
		if out.Size <= integrityHashLimit {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			hash, err := sha256File(ctx, path)
			cancel()
			if err == nil {
				out.SHA256 = hash
				out.HashStatus = "complete"
			} else {
				out.HashStatus = "unavailable: " + err.Error()
			}
		} else {
			out.HashStatus = fmt.Sprintf("skipped: file exceeds %d MiB inspection limit", integrityHashLimit/(1024*1024))
		}
	} else {
		out.HashStatus = "not applicable to directories"
	}
	out.Identity = inspectCodeIdentity(path)
	out.NativeValidation = nativeStaticCodeValidate(path)
	if out.NativeValidation.Available {
		out.Sources = append(out.Sources, out.NativeValidation.Source)
		if out.NativeValidation.Valid {
			out.Notes = append(out.Notes, "Native Security.framework static-code validation succeeded with all-architecture checking requested for universal code.")
		} else if out.NativeValidation.Error != "" {
			out.Notes = append(out.Notes, "Native static-code validation reported: "+out.NativeValidation.Error)
		}
	}

	if runtime.GOOS == "darwin" && commandExists("xattr") {
		if raw, err := commandOutput(1500*time.Millisecond, "xattr", "-p", "com.apple.quarantine", path); err == nil && raw != "" {
			out.Quarantine = raw
			out.Sources = append(out.Sources, "xattr com.apple.quarantine")
		}
	}
	if runtime.GOOS == "darwin" && commandExists("mdls") {
		if raw, err := commandOutput(2*time.Second, "mdls", "-raw", "-name", "kMDItemWhereFroms", path); err == nil {
			out.WhereFrom = parseWhereFrom(raw)
			if len(out.WhereFrom) > 0 {
				out.Sources = append(out.Sources, "mdls kMDItemWhereFroms")
			}
		}
	}
	if out.Identity.Verification == "Verified" {
		out.Notes = append(out.Notes, "A valid signature shows that signed code has not been altered since signing; it does not by itself prove the software is trustworthy.")
	}
	if out.Identity.Gatekeeper == "Accepted" {
		out.Notes = append(out.Notes, "Gatekeeper acceptance is useful trust context, not a malware verdict.")
	}
	if out.Quarantine != "" {
		out.Notes = append(out.Notes, "The quarantine attribute indicates macOS recorded download/transfer provenance for this item.")
	}
	out.Sources = uniqueStrings(out.Sources)
	return out
}

func parseWhereFrom(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "(null)" {
		return nil
	}
	// mdls prints a property-list-like array. Extract quoted values without depending on its exact spacing.
	var out []string
	inQuote := false
	escaped := false
	var b strings.Builder
	for _, r := range raw {
		if escaped {
			b.WriteRune(r)
			escaped = false
			continue
		}
		if r == '\\' && inQuote {
			escaped = true
			continue
		}
		if r == '"' {
			if inQuote {
				if s := strings.TrimSpace(b.String()); s != "" {
					out = append(out, s)
				}
				b.Reset()
			}
			inQuote = !inQuote
			continue
		}
		if inQuote {
			b.WriteRune(r)
		}
	}
	if len(out) > 8 {
		out = out[:8]
	}
	return uniqueStrings(out)
}

func (a *app) handleIntegrityInspect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return
	}
	var req struct {
		Path string `json:"path"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON"})
		return
	}
	if len(req.Path) > 4096 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "path too long"})
		return
	}
	writeJSON(w, http.StatusOK, inspectIntegrity(req.Path))
}

func selfIntegrity() IntegrityInspection {
	exe, err := os.Executable()
	if err != nil {
		return IntegrityInspection{HashStatus: "unavailable", Notes: []string{err.Error()}}
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	out := inspectIntegrity(exe)
	out.Notes = append(out.Notes, "This card describes the currently running Sentinel executable. Development builds may be unsigned until Developer ID signing/notarization is configured.")
	return out
}

func (a *app) handleSelfIntegrity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, selfIntegrity())
}

// Kept here so future exports can embed a stable, low-complexity schema test.
var _ = json.Valid
