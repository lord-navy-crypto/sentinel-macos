// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type PersistenceFile struct {
	Path       string `json:"path"`
	Scope      string `json:"scope"`
	Size       int64  `json:"size"`
	Modified   int64  `json:"modified_unix"`
	SHA256     string `json:"sha256,omitempty"`
	HashStatus string `json:"hash_status"`
	Label      string `json:"label,omitempty"`
	Executable string `json:"executable,omitempty"`
	RunAtLoad  bool   `json:"run_at_load"`
	KeepAlive  string `json:"keep_alive,omitempty"`
}

type PersistenceChange struct {
	Kind     string `json:"kind"`
	Severity string `json:"severity"`
	Path     string `json:"path"`
	Title    string `json:"title"`
	Before   string `json:"before,omitempty"`
	After    string `json:"after,omitempty"`
	Detail   string `json:"detail"`
}

type PersistenceSnapshot struct {
	CapturedAt string            `json:"captured_at"`
	Files      []PersistenceFile `json:"files"`
}

type PersistenceStatus struct {
	Initialized bool                `json:"initialized"`
	BaselineAt  string              `json:"baseline_at,omitempty"`
	CurrentAt   string              `json:"current_at,omitempty"`
	Files       int                 `json:"files"`
	Changes     []PersistenceChange `json:"changes"`
	Note        string              `json:"note"`
}

type persistenceManager struct {
	mu       sync.RWMutex
	baseline *PersistenceSnapshot
	last     *PersistenceSnapshot
	changes  []PersistenceChange
}

func newPersistenceManager() *persistenceManager { return &persistenceManager{} }

func persistenceDirs() []struct{ Path, Scope string } {
	home, _ := os.UserHomeDir()
	return []struct{ Path, Scope string }{
		{filepath.Join(home, "Library", "LaunchAgents"), "User LaunchAgent"},
		{"/Library/LaunchAgents", "System LaunchAgent"},
		{"/Library/LaunchDaemons", "System LaunchDaemon"},
	}
}

func capturePersistenceSnapshot() PersistenceSnapshot {
	snap := PersistenceSnapshot{CapturedAt: time.Now().UTC().Format(time.RFC3339)}
	for _, d := range persistenceDirs() {
		entries, err := os.ReadDir(d.Path)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".plist") {
				continue
			}
			path := filepath.Join(d.Path, e.Name())
			st, err := os.Stat(path)
			if err != nil {
				continue
			}
			pf := PersistenceFile{Path: path, Scope: d.Scope, Size: st.Size(), Modified: st.ModTime().Unix(), HashStatus: "not hashed"}
			if st.Size() >= 0 && st.Size() <= 1024*1024 {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				h, err := sha256File(ctx, path)
				cancel()
				if err == nil {
					pf.SHA256 = h
					pf.HashStatus = "complete"
				} else {
					pf.HashStatus = "unavailable"
				}
			} else {
				pf.HashStatus = "skipped: plist exceeds 1 MiB limit"
			}
			m := parseLaunchManifest(path)
			pf.Label = m.Label
			pf.Executable = extractPlistExecutable(path)
			pf.RunAtLoad = m.RunAtLoad
			pf.KeepAlive = m.KeepAlive
			snap.Files = append(snap.Files, pf)
		}
	}
	sort.Slice(snap.Files, func(i, j int) bool { return snap.Files[i].Path < snap.Files[j].Path })
	return snap
}

func persistenceDiff(before, after PersistenceSnapshot) []PersistenceChange {
	b := map[string]PersistenceFile{}
	a := map[string]PersistenceFile{}
	for _, x := range before.Files {
		b[x.Path] = x
	}
	for _, x := range after.Files {
		a[x.Path] = x
	}
	var out []PersistenceChange
	for p, x := range a {
		old, ok := b[p]
		if !ok {
			out = append(out, PersistenceChange{Kind: "added", Severity: "review", Path: p, Title: "Persistence configuration added", After: x.Executable, Detail: "A LaunchAgent/LaunchDaemon plist appeared after the session baseline."})
			continue
		}
		if old.SHA256 != "" && x.SHA256 != "" && old.SHA256 != x.SHA256 {
			sev := "review"
			if old.Executable != x.Executable {
				sev = "high"
			}
			out = append(out, PersistenceChange{Kind: "content_changed", Severity: sev, Path: p, Title: "Persistence configuration changed", Before: old.Executable, After: x.Executable, Detail: "The plist SHA-256 changed; this detects changes even when the plist filename remains the same."})
		}
	}
	for p, x := range b {
		if _, ok := a[p]; !ok {
			out = append(out, PersistenceChange{Kind: "removed", Severity: "info", Path: p, Title: "Persistence configuration removed", Before: x.Executable, Detail: "A LaunchAgent/LaunchDaemon plist present at baseline is no longer visible."})
		}
	}
	rank := map[string]int{"high": 0, "review": 1, "info": 2}
	sort.Slice(out, func(i, j int) bool {
		if rank[out[i].Severity] != rank[out[j].Severity] {
			return rank[out[i].Severity] < rank[out[j].Severity]
		}
		return out[i].Path < out[j].Path
	})
	if len(out) > 100 {
		out = out[:100]
	}
	return out
}

func (m *persistenceManager) capture() PersistenceStatus {
	cur := capturePersistenceSnapshot()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.baseline == nil {
		m.baseline = &cur
		m.last = &cur
		m.changes = nil
		return PersistenceStatus{Initialized: true, BaselineAt: cur.CapturedAt, CurrentAt: cur.CapturedAt, Files: len(cur.Files), Changes: []PersistenceChange{}, Note: "Session baseline established. Capture again to detect plist additions, removals, and content changes."}
	}
	m.changes = persistenceDiff(*m.last, cur)
	m.last = &cur
	return PersistenceStatus{Initialized: true, BaselineAt: m.baseline.CapturedAt, CurrentAt: cur.CapturedAt, Files: len(cur.Files), Changes: append([]PersistenceChange(nil), m.changes...), Note: "Session-only persistence integrity monitor. It hashes visible LaunchAgent/LaunchDaemon plist files, not executables or user documents."}
}
func (m *persistenceManager) status() PersistenceStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.baseline == nil {
		return PersistenceStatus{Initialized: false, Changes: []PersistenceChange{}, Note: "No persistence-integrity baseline yet."}
	}
	curAt := ""
	files := 0
	if m.last != nil {
		curAt = m.last.CapturedAt
		files = len(m.last.Files)
	}
	return PersistenceStatus{Initialized: true, BaselineAt: m.baseline.CapturedAt, CurrentAt: curAt, Files: files, Changes: append([]PersistenceChange(nil), m.changes...), Note: "Session-only; no background daemon is installed."}
}

func (a *app) handlePersistence(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, a.persistence.status())
	case http.MethodPost:
		writeJSON(w, http.StatusOK, a.persistence.capture())
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET or POST required"})
	}
}

// Fingerprint helper used only by tests/documentation to show that configuration IDs are content-based.
func fingerprintText(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
