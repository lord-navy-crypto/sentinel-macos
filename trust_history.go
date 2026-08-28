// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const trustHistoryLimit = 20

type TrustHistoryEntry struct {
	ID              string        `json:"id"`
	ComparedAt      string        `json:"compared_at"`
	ProfileAt       string        `json:"profile_at"`
	DriftIndex      int           `json:"drift_index"`
	DriftBand       string        `json:"drift_band"`
	ProfileCoverage int           `json:"profile_coverage"`
	Summary         TrustSummary  `json:"summary"`
	Changes         []TrustChange `json:"changes,omitempty"`
}

type TrustHistoryResponse struct {
	Entries     []TrustHistoryEntry `json:"entries"`
	Count       int                 `json:"count"`
	Persistent  bool                `json:"persistent"`
	HistoryPath string              `json:"history_path,omitempty"`
	Note        string              `json:"note"`
}

func trustHistoryPath() string {
	p := trustProfilePath()
	if p == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(p), "trust-drift-history.json")
}

func (m *trustManager) loadHistory() {
	if m.historyPath == "" {
		return
	}
	var entries []TrustHistoryEntry
	if readPrivateJSON(m.historyPath, &entries) != nil {
		return
	}
	if len(entries) > trustHistoryLimit {
		entries = entries[len(entries)-trustHistoryLimit:]
	}
	m.history = entries
	if len(entries) > 0 {
		e := entries[len(entries)-1]
		m.lastDrift = TrustDrift{ComparedAt: e.ComparedAt, ProfileAt: e.ProfileAt, DriftIndex: e.DriftIndex, DriftBand: e.DriftBand, ProfileCoverage: e.ProfileCoverage, Summary: e.Summary, Changes: append([]TrustChange(nil), e.Changes...), Note: "Loaded from bounded local Trust Drift history."}
	}
}

func (m *trustManager) persistHistoryLocked() error {
	if !m.persistent || m.historyPath == "" {
		return nil
	}
	return writePrivateJSON(m.historyPath, m.history)
}

func (m *trustManager) recordHistoryLocked(d TrustDrift) {
	if d.ProfileAt == "" {
		return
	}
	entry := TrustHistoryEntry{ID: entityID("trust-history", d.ComparedAt+"\x00"+fmt.Sprint(d.DriftIndex)+"\x00"+fmt.Sprint(len(m.history))), ComparedAt: d.ComparedAt, ProfileAt: d.ProfileAt, DriftIndex: d.DriftIndex, DriftBand: d.DriftBand, ProfileCoverage: d.ProfileCoverage, Summary: d.Summary, Changes: append([]TrustChange(nil), d.Changes...)}
	m.history = append(m.history, entry)
	if len(m.history) > trustHistoryLimit {
		m.history = append([]TrustHistoryEntry(nil), m.history[len(m.history)-trustHistoryLimit:]...)
	}
}

func (m *trustManager) historySnapshot(limit int) TrustHistoryResponse {
	m.mu.Lock()
	defer m.mu.Unlock()
	if limit <= 0 || limit > trustHistoryLimit {
		limit = trustHistoryLimit
	}
	entries := append([]TrustHistoryEntry(nil), m.history...)
	if len(entries) > limit {
		entries = entries[len(entries)-limit:]
	}
	return TrustHistoryResponse{Entries: entries, Count: len(entries), Persistent: m.persistent, HistoryPath: m.historyPath, Note: "Bounded Trust Drift comparison history. Each entry records drift evidence against the profile active at that comparison time."}
}

func validateTrustHistory(path string) (exists, valid bool, mode string, count int) {
	info, err := os.Stat(path)
	if err != nil {
		return false, false, "", 0
	}
	exists = true
	mode = fileModeString(info)
	raw, err := os.ReadFile(path)
	if err != nil {
		return exists, false, mode, 0
	}
	var entries []TrustHistoryEntry
	if json.Unmarshal(raw, &entries) == nil && len(entries) <= trustHistoryLimit {
		valid = true
		count = len(entries)
	}
	return
}

func (a *app) handleTrustHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	limit := trustHistoryLimit
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}
	writeJSON(w, 200, a.trust.historySnapshot(limit))
}
