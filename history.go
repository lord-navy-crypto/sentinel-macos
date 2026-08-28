// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const behaviorHistoryLimit = 40

type BehaviorHistoryEntry struct {
	ID             string           `json:"id"`
	CapturedAt     string           `json:"captured_at"`
	BaselineAt     string           `json:"baseline_at,omitempty"`
	BaselineSource string           `json:"baseline_source,omitempty"`
	RiskIndex      int              `json:"risk_index"`
	RiskBand       string           `json:"risk_band"`
	RiskDelta      int              `json:"risk_delta"`
	Summary        BehaviorSummary  `json:"summary"`
	Changes        []BehaviorChange `json:"changes,omitempty"`
}

type BehaviorHistoryResponse struct {
	Entries     []BehaviorHistoryEntry `json:"entries"`
	Count       int                    `json:"count"`
	Object      string                 `json:"object,omitempty"`
	Persistent  bool                   `json:"persistent"`
	HistoryPath string                 `json:"history_path,omitempty"`
	Note        string                 `json:"note"`
}

type BehaviorHealth struct {
	Mode                string   `json:"mode"`
	Healthy             bool     `json:"healthy"`
	Issues              []string `json:"issues"`
	BaselinePath        string   `json:"baseline_path,omitempty"`
	BaselineExists      bool     `json:"baseline_exists"`
	BaselineValid       bool     `json:"baseline_valid"`
	BaselineMode        string   `json:"baseline_mode,omitempty"`
	BaselineDirMode     string   `json:"baseline_dir_mode,omitempty"`
	BaselineBytes       int64    `json:"baseline_bytes,omitempty"`
	BaselineModifiedAt  string   `json:"baseline_modified_at,omitempty"`
	HistoryPath         string   `json:"history_path,omitempty"`
	HistoryExists       bool     `json:"history_exists"`
	HistoryValid        bool     `json:"history_valid"`
	HistoryMode         string   `json:"history_mode,omitempty"`
	HistoryEntries      int      `json:"history_entries"`
	CurrentBaselineTime string   `json:"current_baseline_time,omitempty"`
	Privacy             string   `json:"privacy"`
}

func behaviorHistoryPath() string {
	base := behaviorBaselinePath()
	if base == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(base), "behavior-history.json")
}

func behaviorRiskIndex(changes []BehaviorChange) int {
	score := 0
	for _, c := range changes {
		switch c.Severity {
		case "high":
			score += 22
		case "review":
			score += 10
		default:
			score += 1
		}
		switch c.Kind {
		case "startup_target_changed":
			score += 12
		case "identity_changed":
			score += 8
		case "executable_changed":
			score += 5
		case "startup_added", "background_added":
			score += 4
		case "parent_context_changed":
			score += 3
		case "new_public_endpoint":
			score += 1
		}
		if score >= 100 {
			return 100
		}
	}
	return score
}

func behaviorRiskBand(score int) string {
	switch {
	case score >= 80:
		return "high"
	case score >= 60:
		return "elevated"
	case score >= 30:
		return "review"
	case score >= 10:
		return "observe"
	default:
		return "quiet"
	}
}

func (m *behaviorManager) loadHistory() {
	if m.historyPath == "" {
		return
	}
	var entries []BehaviorHistoryEntry
	if readPrivateJSON(m.historyPath, &entries) != nil {
		return
	}
	if len(entries) > behaviorHistoryLimit {
		entries = entries[len(entries)-behaviorHistoryLimit:]
	}
	m.history = entries
}

func (m *behaviorManager) persistHistoryLocked() error {
	if !m.persistent || m.historyPath == "" {
		return nil
	}
	return writePrivateJSON(m.historyPath, m.history)
}

func (m *behaviorManager) recordHistoryLocked(d *BehaviorDiff) {
	if d == nil {
		return
	}
	risk := behaviorRiskIndex(d.Changes)
	d.RiskIndex = risk
	d.RiskBand = behaviorRiskBand(risk)
	previous := 0
	if len(m.history) > 0 {
		previous = m.history[len(m.history)-1].RiskIndex
	}
	d.RiskDelta = risk - previous
	entry := BehaviorHistoryEntry{
		ID:             entityID("history", d.CurrentAt+"\x00"+fmt.Sprint(risk)+"\x00"+fmt.Sprint(len(m.history))),
		CapturedAt:     d.CurrentAt,
		BaselineAt:     d.BaselineAt,
		BaselineSource: d.BaselineSource,
		RiskIndex:      risk,
		RiskBand:       d.RiskBand,
		RiskDelta:      d.RiskDelta,
		Summary:        d.Summary,
		Changes:        append([]BehaviorChange(nil), d.Changes...),
	}
	m.history = append(m.history, entry)
	if len(m.history) > behaviorHistoryLimit {
		m.history = append([]BehaviorHistoryEntry(nil), m.history[len(m.history)-behaviorHistoryLimit:]...)
	}
	d.HistoryDepth = len(m.history)
}

func (m *behaviorManager) historySnapshot(limit int, object string) BehaviorHistoryResponse {
	m.mu.Lock()
	defer m.mu.Unlock()
	if limit <= 0 || limit > behaviorHistoryLimit {
		limit = behaviorHistoryLimit
	}
	object = normalizeEvidencePath(object)
	entries := make([]BehaviorHistoryEntry, 0, len(m.history))
	for _, e := range m.history {
		cp := e
		if object != "" {
			cp.Changes = nil
			for _, c := range e.Changes {
				if normalizeEvidencePath(c.ObjectKey) == object {
					cp.Changes = append(cp.Changes, c)
				}
			}
			if len(cp.Changes) == 0 {
				continue
			}
		}
		entries = append(entries, cp)
	}
	if len(entries) > limit {
		entries = entries[len(entries)-limit:]
	}
	return BehaviorHistoryResponse{
		Entries: entries, Count: len(entries), Object: object, Persistent: m.persistent,
		HistoryPath: m.historyPath,
		Note:        "Bounded local Behavior Diff history only. It stores change metadata, not file contents, packet contents, or complete process command lines.",
	}
}

func (m *behaviorManager) historyForObject(object string, limit int) []BehaviorHistoryEntry {
	return m.historySnapshot(limit, object).Entries
}

func fileModeString(info os.FileInfo) string {
	if info == nil {
		return ""
	}
	return fmt.Sprintf("%04o", info.Mode().Perm())
}

func (m *behaviorManager) health() BehaviorHealth {
	m.mu.Lock()
	defer m.mu.Unlock()
	mode := "persistent-local"
	privacy := "Compact baseline and bounded change history use user-only files; no file contents or complete command lines are persisted."
	if !m.persistent {
		return BehaviorHealth{Mode: "ephemeral", Healthy: true, HistoryEntries: len(m.history), CurrentBaselineTime: func() string {
			if m.baseline != nil {
				return m.baseline.CapturedAt
			}
			return ""
		}(), Privacy: "Ephemeral mode keeps behavior state in memory only and writes no baseline/history files."}
	}
	h := BehaviorHealth{Mode: mode, Healthy: true, Issues: []string{}, BaselinePath: m.baselinePath, HistoryPath: m.historyPath, HistoryEntries: len(m.history), Privacy: privacy}
	if m.baseline != nil {
		h.CurrentBaselineTime = m.baseline.CapturedAt
	}
	if m.baselinePath == "" {
		h.Healthy = false
		h.Issues = append(h.Issues, "User home directory is unavailable, so persistent baseline storage cannot be verified.")
		return h
	}
	dir := filepath.Dir(m.baselinePath)
	if info, err := os.Stat(dir); err == nil {
		h.BaselineDirMode = fileModeString(info)
		if info.Mode().Perm()&0077 != 0 {
			h.Healthy = false
			h.Issues = append(h.Issues, "Sentinel Application Support directory is accessible beyond the current user.")
		}
	}
	if info, err := os.Stat(m.baselinePath); err == nil {
		h.BaselineExists = true
		h.BaselineMode = fileModeString(info)
		h.BaselineBytes = info.Size()
		h.BaselineModifiedAt = info.ModTime().UTC().Format(time.RFC3339)
		if info.Mode().Perm() != 0600 {
			h.Healthy = false
			h.Issues = append(h.Issues, "Behavior baseline permissions are not 0600.")
		}
		raw, readErr := os.ReadFile(m.baselinePath)
		if readErr == nil {
			var s BehaviorSnapshot
			h.BaselineValid = json.Unmarshal(raw, &s) == nil && s.Version == 1 && strings.TrimSpace(s.CapturedAt) != ""
		}
		if !h.BaselineValid {
			h.Healthy = false
			h.Issues = append(h.Issues, "Behavior baseline file is not a valid Sentinel snapshot.")
		}
	} else if !os.IsNotExist(err) {
		h.Healthy = false
		h.Issues = append(h.Issues, "Behavior baseline metadata could not be inspected.")
	}
	if info, err := os.Stat(m.historyPath); err == nil {
		h.HistoryExists = true
		h.HistoryMode = fileModeString(info)
		if info.Mode().Perm() != 0600 {
			h.Healthy = false
			h.Issues = append(h.Issues, "Behavior history permissions are not 0600.")
		}
		raw, readErr := os.ReadFile(m.historyPath)
		if readErr == nil {
			var entries []BehaviorHistoryEntry
			h.HistoryValid = json.Unmarshal(raw, &entries) == nil && len(entries) <= behaviorHistoryLimit
		}
		if !h.HistoryValid {
			h.Healthy = false
			h.Issues = append(h.Issues, "Behavior history file is invalid or exceeds the bounded history limit.")
		}
	} else if os.IsNotExist(err) {
		h.HistoryValid = true
	} else {
		h.Healthy = false
		h.Issues = append(h.Issues, "Behavior history metadata could not be inspected.")
	}
	return h
}

func sortHistoryChronological(entries []BehaviorHistoryEntry) {
	sort.Slice(entries, func(i, j int) bool { return entries[i].CapturedAt < entries[j].CapturedAt })
}

func (a *app) handleBehaviorHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	limit := 40
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}
	writeJSON(w, 200, a.behavior.historySnapshot(limit, r.URL.Query().Get("object")))
}

func (a *app) handleBehaviorHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, a.behavior.health())
}
