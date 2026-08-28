// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	investigationSessionLimit       = 24
	investigationSessionBranchLimit = 80
	investigationSessionTitleLimit  = 96
	investigationSessionNoteLimit   = 1200
)

type InvestigationSessionBranch struct {
	Path          string `json:"path"`
	ParentPath    string `json:"parent_path,omitempty"`
	Kind          string `json:"kind,omitempty"`
	Note          string `json:"note,omitempty"`
	Bookmarked    bool   `json:"bookmarked"`
	FirstVisited  string `json:"first_visited"`
	LastVisited   string `json:"last_visited"`
	VisitCount    int    `json:"visit_count"`
}

type InvestigationSession struct {
	ID        string                       `json:"id"`
	Title     string                       `json:"title"`
	RootPath  string                       `json:"root_path"`
	CreatedAt string                       `json:"created_at"`
	UpdatedAt string                       `json:"updated_at"`
	Branches  []InvestigationSessionBranch `json:"branches"`
}

type investigationSessionEnvelope struct {
	Version  int                    `json:"version"`
	Sessions []InvestigationSession `json:"sessions"`
}

type investigationSessionManager struct {
	mu         sync.RWMutex
	persistent bool
	path       string
	sessions   []InvestigationSession
}

type InvestigationSessionSaveRequest struct {
	SessionID  string `json:"session_id,omitempty"`
	Title      string `json:"title,omitempty"`
	Path       string `json:"path"`
	ParentPath string `json:"parent_path,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Note       string `json:"note,omitempty"`
	Bookmarked bool   `json:"bookmarked"`
}

func investigationSessionsPath() string {
	base := sentinelStateDir()
	if base == "" {
		return ""
	}
	return filepath.Join(base, "investigation-sessions.json.gz")
}

func sanitizeInvestigationSessionText(value string, max int) string {
	value = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(value, "\x00", ""), "\r\n", "\n"))
	if max > 0 && len(value) > max {
		value = value[:max]
	}
	return value
}

func normalizeInvestigationSessionPath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || !filepath.IsAbs(raw) {
		return "", fmt.Errorf("absolute path required")
	}
	if strings.ContainsRune(raw, '\x00') {
		return "", fmt.Errorf("path contains invalid null byte")
	}
	return filepath.Clean(raw), nil
}

func newInvestigationSessionManager(ephemeral bool) *investigationSessionManager {
	m := &investigationSessionManager{persistent: !ephemeral, path: investigationSessionsPath()}
	if !m.persistent || m.path == "" {
		return m
	}
	var env investigationSessionEnvelope
	if readGzipJSON(m.path, &env) == nil && env.Version == SentinelSchemaV23 {
		if len(env.Sessions) > investigationSessionLimit {
			env.Sessions = env.Sessions[len(env.Sessions)-investigationSessionLimit:]
		}
		for i := range env.Sessions {
			if len(env.Sessions[i].Branches) > investigationSessionBranchLimit {
				env.Sessions[i].Branches = env.Sessions[i].Branches[len(env.Sessions[i].Branches)-investigationSessionBranchLimit:]
			}
		}
		m.sessions = append([]InvestigationSession(nil), env.Sessions...)
	}
	return m
}

func (m *investigationSessionManager) persistLocked() error {
	if m == nil || !m.persistent || m.path == "" {
		return nil
	}
	return writePrivateGzipJSON(m.path, investigationSessionEnvelope{Version: SentinelSchemaV23, Sessions: m.sessions})
}

func (m *investigationSessionManager) save(req InvestigationSessionSaveRequest) (InvestigationSession, error) {
	if m == nil {
		return InvestigationSession{}, fmt.Errorf("investigation sessions unavailable")
	}
	path, err := normalizeInvestigationSessionPath(req.Path)
	if err != nil {
		return InvestigationSession{}, err
	}
	parent := ""
	if strings.TrimSpace(req.ParentPath) != "" {
		parent, err = normalizeInvestigationSessionPath(req.ParentPath)
		if err != nil {
			return InvestigationSession{}, fmt.Errorf("parent path: %w", err)
		}
	}
	title := sanitizeInvestigationSessionText(req.Title, investigationSessionTitleLimit)
	note := sanitizeInvestigationSessionText(req.Note, investigationSessionNoteLimit)
	kind := sanitizeInvestigationSessionText(req.Kind, 64)
	now := time.Now().UTC().Format(time.RFC3339)

	m.mu.Lock()
	defer m.mu.Unlock()

	index := -1
	if id := strings.TrimSpace(req.SessionID); id != "" {
		for i := range m.sessions {
			if m.sessions[i].ID == id {
				index = i
				break
			}
		}
		if index < 0 {
			return InvestigationSession{}, fmt.Errorf("investigation session not found")
		}
	}
	if index < 0 {
		if title == "" {
			title = "Investigation · " + filepath.Base(path)
		}
		session := InvestigationSession{
			ID: randomToken(8), Title: title, RootPath: path,
			CreatedAt: now, UpdatedAt: now, Branches: []InvestigationSessionBranch{},
		}
		m.sessions = append(m.sessions, session)
		index = len(m.sessions) - 1
	}

	session := &m.sessions[index]
	if title != "" {
		session.Title = title
	}
	if session.RootPath == "" {
		session.RootPath = path
	}
	branchIndex := -1
	for i := range session.Branches {
		if session.Branches[i].Path == path {
			branchIndex = i
			break
		}
	}
	if branchIndex < 0 {
		session.Branches = append(session.Branches, InvestigationSessionBranch{
			Path: path, ParentPath: parent, Kind: kind, Note: note, Bookmarked: req.Bookmarked,
			FirstVisited: now, LastVisited: now, VisitCount: 1,
		})
	} else {
		branch := &session.Branches[branchIndex]
		if parent != "" {
			branch.ParentPath = parent
		}
		if kind != "" {
			branch.Kind = kind
		}
		if note != "" || req.Note != "" {
			branch.Note = note
		}
		branch.Bookmarked = req.Bookmarked || branch.Bookmarked
		branch.LastVisited = now
		branch.VisitCount++
	}
	if len(session.Branches) > investigationSessionBranchLimit {
		// Preserve bookmarks first, then retain the newest ordinary branches.
		bookmarked := make([]InvestigationSessionBranch, 0)
		ordinary := make([]InvestigationSessionBranch, 0)
		for _, branch := range session.Branches {
			if branch.Bookmarked {
				bookmarked = append(bookmarked, branch)
			} else {
				ordinary = append(ordinary, branch)
			}
		}
		keepOrdinary := investigationSessionBranchLimit - len(bookmarked)
		if keepOrdinary < 0 {
			bookmarked = bookmarked[len(bookmarked)-investigationSessionBranchLimit:]
			ordinary = nil
		} else if len(ordinary) > keepOrdinary {
			ordinary = ordinary[len(ordinary)-keepOrdinary:]
		}
		session.Branches = append(bookmarked, ordinary...)
	}
	session.UpdatedAt = now

	sort.SliceStable(m.sessions, func(i, j int) bool { return m.sessions[i].UpdatedAt < m.sessions[j].UpdatedAt })
	if len(m.sessions) > investigationSessionLimit {
		m.sessions = append([]InvestigationSession(nil), m.sessions[len(m.sessions)-investigationSessionLimit:]...)
	}
	if err := m.persistLocked(); err != nil {
		return *session, err
	}
	for _, saved := range m.sessions {
		if saved.ID == session.ID {
			return saved, nil
		}
	}
	return *session, nil
}

func (m *investigationSessionManager) list() []InvestigationSession {
	if m == nil {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := append([]InvestigationSession(nil), m.sessions...)
	for i := range out {
		out[i].Branches = append([]InvestigationSessionBranch(nil), out[i].Branches...)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out
}

func (a *app) handleInvestigationSessions(w http.ResponseWriter, r *http.Request) {
	if a == nil || a.sessions == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "investigation sessions unavailable"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{
			"sessions": a.sessions.list(),
			"persistent": a.sessions.persistent,
			"note": "Investigation Sessions store paths, branch metadata, bookmarks, and user notes only. They do not copy investigated file contents.",
		})
	case http.MethodPost:
		var req InvestigationSessionSaveRequest
		if err := decodeSystemConsoleJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request: " + err.Error()})
			return
		}
		session, err := a.sessions.save(req)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, session)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET or POST required"})
	}
}
