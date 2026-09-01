// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	incidentHistoryLimit   = 120
	incidentEvidenceLimit  = 40
	incidentWindowSeconds  = int64(15 * 60)
	incidentHistoryVersion = 3
)

type IncidentEvidence struct {
	At       int64  `json:"at"`
	Source   string `json:"source"`
	Kind     string `json:"kind"`
	Severity string `json:"severity"`
	Path     string `json:"path,omitempty"`
	Detail   string `json:"detail"`
}

type Incident struct {
	ID              string             `json:"id"`
	StoryKey        string             `json:"story_key,omitempty"`
	State           string             `json:"state,omitempty"`
	CreatedAt       int64              `json:"created_at"`
	UpdatedAt       int64              `json:"updated_at"`
	OccurrenceCount int                `json:"occurrence_count,omitempty"`
	Severity        string             `json:"severity"`
	Confidence      int                `json:"confidence"`
	ConfidenceBand  string             `json:"confidence_band"`
	Title           string             `json:"title"`
	PrimaryPath     string             `json:"primary_path,omitempty"`
	Sources         []string           `json:"sources"`
	RelatedPaths    []string           `json:"related_paths,omitempty"`
	Evidence        []IncidentEvidence `json:"evidence"`
	Recommended     []string           `json:"recommended"`
	Note            string             `json:"note"`
}

type IncidentStatus struct {
	GeneratedAt        string     `json:"generated_at"`
	Count              int        `json:"count"`
	High               int        `json:"high"`
	Review             int        `json:"review"`
	Info               int        `json:"info"`
	Persistent         bool       `json:"persistent"`
	PersistenceHealthy bool       `json:"persistence_healthy"`
	LastPersistError   string     `json:"last_persist_error,omitempty"`
	LastPersistOKAt    string     `json:"last_persist_ok_at,omitempty"`
	HistoryPath        string     `json:"history_path,omitempty"`
	Incidents          []Incident `json:"incidents"`
	Note               string     `json:"note"`
}

type IncidentDeepReview struct {
	GeneratedAt string               `json:"generated_at"`
	Incident    Incident             `json:"incident"`
	Integrity   *IntegrityInspection `json:"integrity,omitempty"`
	ObjectStory *ObjectStory         `json:"object_story,omitempty"`
	Note        string               `json:"note"`
}

type incidentManager struct {
	mu               sync.RWMutex
	persistent       bool
	path             string
	current          []Incident
	history          []Incident
	lastPersistError string
	lastPersistOKAt  time.Time
}

func incidentHistoryPath() string {
	base := sentinelStateDir()
	if base == "" {
		return ""
	}
	return filepath.Join(base, "incident-history.json.gz")
}

func stableIncidentStoryKey(x Incident) string {
	anchor := canonicalIncidentPath(x.PrimaryPath)
	if anchor == "" {
		for _, p := range x.RelatedPaths {
			if anchor = canonicalIncidentPath(p); anchor != "" {
				break
			}
		}
	}
	if anchor == "" {
		for _, e := range x.Evidence {
			if anchor = canonicalIncidentPath(e.Path); anchor != "" {
				break
			}
		}
	}
	if anchor != "" {
		return entityID("incident-story", anchor)
	}
	return firstNonEmpty(x.StoryKey, x.ID)
}

func normalizeLoadedIncident(x Incident) Incident {
	// v2.3 stories are object-centered and stable across bounded correlation
	// episodes. Older v1/v2 histories encoded the 15-minute window in StoryKey;
	// normalize them in memory so the next safe state write migrates them.
	x.StoryKey = stableIncidentStoryKey(x)
	if x.OccurrenceCount <= 0 {
		x.OccurrenceCount = len(x.Evidence)
		if x.OccurrenceCount == 0 {
			x.OccurrenceCount = 1
		}
	}
	if x.State == "" {
		x.State = "historical"
	}
	return x
}

func newIncidentManager(ephemeral bool) *incidentManager {
	m := &incidentManager{persistent: !ephemeral, path: incidentHistoryPath()}
	if m.persistent && m.path != "" {
		var w struct {
			Version   int        `json:"version"`
			Incidents []Incident `json:"incidents"`
		}
		if readGzipJSON(m.path, &w) == nil && (w.Version == 1 || w.Version == 2 || w.Version == incidentHistoryVersion) {
			if len(w.Incidents) > incidentHistoryLimit {
				w.Incidents = w.Incidents[len(w.Incidents)-incidentHistoryLimit:]
			}
			byStory := map[string]int{}
			for _, raw := range w.Incidents {
				x := normalizeLoadedIncident(raw)
				if i, ok := byStory[x.StoryKey]; ok {
					merged := mergeIncident(m.history[i], x)
					merged.State = "historical"
					m.history[i] = merged
					continue
				}
				byStory[x.StoryKey] = len(m.history)
				m.history = append(m.history, x)
			}
		}
	}
	return m
}

func incidentRank(s string) int {
	switch strings.ToLower(s) {
	case "high":
		return 0
	case "review":
		return 1
	default:
		return 2
	}
}
func incidentBand(n int) string {
	switch {
	case n >= 85:
		return "very strong"
	case n >= 70:
		return "strong"
	case n >= 50:
		return "moderate"
	default:
		return "limited"
	}
}
func canonicalIncidentPath(p string) string {
	p = normalizeEvidencePath(p)
	if p == "" {
		return ""
	}
	return filepath.Clean(p)
}

func incidentEvidenceKey(e IncidentEvidence) string {
	return fmt.Sprintf("%d|%s|%s|%s|%s|%s", e.At, e.Source, e.Kind, e.Severity, e.Path, e.Detail)
}

func mergeIncidentEvidence(a, b []IncidentEvidence) []IncidentEvidence {
	seen := map[string]bool{}
	out := make([]IncidentEvidence, 0, len(a)+len(b))
	for _, rows := range [][]IncidentEvidence{a, b} {
		for _, e := range rows {
			k := incidentEvidenceKey(e)
			if seen[k] {
				continue
			}
			seen[k] = true
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At < out[j].At })
	if len(out) > incidentEvidenceLimit {
		out = append([]IncidentEvidence(nil), out[len(out)-incidentEvidenceLimit:]...)
	}
	return out
}

func incidentClusters(rows []IncidentEvidence) [][]IncidentEvidence {
	if len(rows) == 0 {
		return nil
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].At < rows[j].At })
	out := [][]IncidentEvidence{}
	start := 0
	for i := 1; i < len(rows); i++ {
		if rows[i].At-rows[i-1].At > incidentWindowSeconds {
			out = append(out, append([]IncidentEvidence(nil), rows[start:i]...))
			start = i
		}
	}
	out = append(out, append([]IncidentEvidence(nil), rows[start:]...))
	return out
}

func incidentFromCluster(anchor string, ev []IncidentEvidence) (Incident, bool) {
	if len(ev) == 0 {
		return Incident{}, false
	}
	sourcesSet := map[string]bool{}
	pathsSet := map[string]bool{}
	onlyInfo := true
	hasImportantKind := false
	sev := "info"
	for _, e := range ev {
		sourcesSet[e.Source] = true
		if p := canonicalIncidentPath(e.Path); p != "" {
			pathsSet[p] = true
		}
		if incidentRank(e.Severity) < 2 {
			onlyInfo = false
		}
		if e.Source != "filesystem" || strings.Contains(e.Detail, "startup/persistence") || e.Kind == "rescan_required" {
			hasImportantKind = true
		}
		if incidentRank(e.Severity) < incidentRank(sev) {
			sev = e.Severity
		}
	}
	anchor = canonicalIncidentPath(anchor)
	if anchor != "" {
		pathsSet[anchor] = true
	}
	if len(sourcesSet) == 1 && onlyInfo && !hasImportantKind {
		return Incident{}, false
	}
	sources := make([]string, 0, len(sourcesSet))
	for s := range sourcesSet {
		sources = append(sources, s)
	}
	sort.Strings(sources)
	paths := make([]string, 0, len(pathsSet))
	for p := range pathsSet {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	confidence := 35 + len(sources)*18 + minInt(len(ev), 5)*5
	if confidence > 97 {
		confidence = 97
	}
	have := func(src string) bool { return sourcesSet[src] }
	title := "Correlated system change"
	if have("persistence") && (have("behavior") || have("trust")) {
		title = "Persistence-related executable or identity changed"
	}
	if have("persistence") && have("filesystem") {
		title = "Persistence configuration and filesystem activity correlated"
	}
	if have("behavior") && have("trust") {
		title = "Behavior change diverged from Trusted Profile"
	}
	if sev == "high" && len(sources) >= 2 {
		sev = "high"
	} else if incidentRank(sev) < 2 || len(sources) >= 2 {
		sev = "review"
	} else {
		sev = "info"
	}
	rec := []string{"Use Deep Review to inspect Object Story and Integrity evidence before taking action."}
	if have("persistence") {
		rec = append(rec, "Review the related LaunchAgent/LaunchDaemon configuration and target executable.")
	}
	rec = append(rec, "If action is necessary, prefer Reveal/Rename/Vault; Sentinel provides no permanent deletion.")
	first, last := ev[0].At, ev[len(ev)-1].At
	storyKey := entityID("incident-story", anchor)
	id := entityID("incident", fmt.Sprintf("%s|%d|%d|%s", storyKey, first, last, strings.Join(sources, ",")))
	return Incident{ID: id, StoryKey: storyKey, State: "active", CreatedAt: first, UpdatedAt: last, OccurrenceCount: len(ev), Severity: sev, Confidence: confidence, ConfidenceBand: incidentBand(confidence), Title: title, PrimaryPath: anchor, Sources: sources, RelatedPaths: paths, Evidence: append([]IncidentEvidence(nil), ev...), Recommended: rec, Note: "Evidence confidence estimates how strongly observations form one story. It is not malware probability and does not determine intent."}, true
}

// buildIncidentCandidates correlates existing Sentinel evidence. Correlation is
// time-windowed so unrelated observations on the same path hours apart remain
// distinct episodes, while the stable StoryKey lets history represent the same
// object-centered story across episode boundaries.
func (a *app) buildIncidentCandidates() []Incident {
	buckets := map[string][]IncidentEvidence{}
	add := func(anchor, path string, e IncidentEvidence) {
		anchor = canonicalIncidentPath(anchor)
		path = canonicalIncidentPath(path)
		if anchor == "" {
			anchor = path
		}
		if anchor == "" {
			return
		}
		e.Path = path
		buckets[anchor] = append(buckets[anchor], e)
	}
	now := time.Now().Unix()
	if a.changes != nil {
		for _, c := range a.changes.eventsSnapshot(250) {
			anchor := c.Path
			lower := strings.ToLower(c.Path)
			if strings.HasSuffix(lower, ".plist") && (strings.Contains(lower, "/library/launchagents/") || strings.Contains(lower, "/library/launchdaemons/")) {
				if x := extractPlistExecutable(c.Path); filepath.IsAbs(x) {
					anchor = x
				}
			}
			add(anchor, c.Path, IncidentEvidence{At: c.At, Source: "filesystem", Kind: c.Kind, Severity: c.Severity, Detail: c.Why})
		}
	}
	if a.persistence != nil {
		ps := a.persistence.status()
		at := now
		if t, err := time.Parse(time.RFC3339, ps.CurrentAt); err == nil {
			at = t.Unix()
		}
		for _, c := range ps.Changes {
			anchor := firstNonEmpty(c.After, c.Before, c.Path)
			if !filepath.IsAbs(anchor) {
				anchor = c.Path
			}
			add(anchor, c.Path, IncidentEvidence{At: at, Source: "persistence", Kind: c.Kind, Severity: c.Severity, Detail: c.Title + " · " + c.Detail})
		}
	}
	if a.behavior != nil {
		a.behavior.mu.Lock()
		d := a.behavior.lastDiff
		a.behavior.mu.Unlock()
		at := now
		if t, err := time.Parse(time.RFC3339, d.CurrentAt); err == nil {
			at = t.Unix()
		}
		for _, c := range d.Changes {
			add(c.ObjectKey, c.ObjectKey, IncidentEvidence{At: at, Source: "behavior", Kind: c.Kind, Severity: c.Severity, Detail: c.Title + " · " + firstNonEmpty(c.After, c.Before)})
		}
	}
	if a.trust != nil {
		a.trust.mu.Lock()
		d := a.trust.lastDrift
		a.trust.mu.Unlock()
		at := now
		if t, err := time.Parse(time.RFC3339, d.ComparedAt); err == nil {
			at = t.Unix()
		}
		for _, c := range d.Changes {
			add(c.ObjectKey, c.ObjectKey, IncidentEvidence{At: at, Source: "trust", Kind: c.Kind, Severity: c.Severity, Detail: c.Title + " · " + firstNonEmpty(c.After, c.Before)})
		}
	}

	out := []Incident{}
	for anchor, rows := range buckets {
		for _, cluster := range incidentClusters(rows) {
			if in, ok := incidentFromCluster(anchor, cluster); ok {
				out = append(out, in)
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if incidentRank(out[i].Severity) != incidentRank(out[j].Severity) {
			return incidentRank(out[i].Severity) < incidentRank(out[j].Severity)
		}
		if out[i].Confidence != out[j].Confidence {
			return out[i].Confidence > out[j].Confidence
		}
		return out[i].UpdatedAt > out[j].UpdatedAt
	})
	if len(out) > 80 {
		out = out[:80]
	}
	return out
}

func mergeIncident(old, cur Incident) Incident {
	out := old
	out.State = "active"
	out.StoryKey = stableIncidentStoryKey(cur)
	if out.CreatedAt == 0 || (cur.CreatedAt > 0 && cur.CreatedAt < out.CreatedAt) {
		out.CreatedAt = cur.CreatedAt
	}
	if cur.UpdatedAt > out.UpdatedAt {
		out.UpdatedAt = cur.UpdatedAt
	}
	if incidentRank(cur.Severity) < incidentRank(out.Severity) {
		out.Severity = cur.Severity
	}
	if cur.Confidence > out.Confidence {
		out.Confidence = cur.Confidence
		out.ConfidenceBand = cur.ConfidenceBand
	}
	out.Title = cur.Title
	out.PrimaryPath = firstNonEmpty(cur.PrimaryPath, old.PrimaryPath)
	out.Sources = uniqueStrings(append(out.Sources, cur.Sources...))
	sort.Strings(out.Sources)
	out.RelatedPaths = uniqueStrings(append(out.RelatedPaths, cur.RelatedPaths...))
	sort.Strings(out.RelatedPaths)
	out.Evidence = mergeIncidentEvidence(out.Evidence, cur.Evidence)
	out.OccurrenceCount = len(out.Evidence)
	out.Recommended = uniqueStrings(append(out.Recommended, cur.Recommended...))
	out.Note = cur.Note
	// ID remains the latest bounded episode ID; StoryKey is the stable entity.
	out.ID = cur.ID
	return out
}

func (m *incidentManager) store(current []Incident) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.current = append([]Incident(nil), current...)
	index := map[string]int{}
	merged := append([]Incident(nil), m.history...)
	for i := range merged {
		merged[i] = normalizeLoadedIncident(merged[i])
		merged[i].State = "historical"
		if previous, ok := index[merged[i].StoryKey]; ok {
			merged[previous] = mergeIncident(merged[previous], merged[i])
			merged[previous].State = "historical"
			merged[i].StoryKey = ""
			continue
		}
		index[merged[i].StoryKey] = i
	}
	compacted := merged[:0]
	index = map[string]int{}
	for _, x := range merged {
		if x.StoryKey == "" {
			continue
		}
		index[x.StoryKey] = len(compacted)
		compacted = append(compacted, x)
	}
	merged = compacted
	for _, x := range current {
		x = normalizeLoadedIncident(x)
		x.State = "active"
		if i, ok := index[x.StoryKey]; ok {
			merged[i] = mergeIncident(merged[i], x)
		} else {
			index[x.StoryKey] = len(merged)
			merged = append(merged, x)
		}
	}
	sort.Slice(merged, func(i, j int) bool { return merged[i].UpdatedAt < merged[j].UpdatedAt })
	if len(merged) > incidentHistoryLimit {
		merged = append([]Incident(nil), merged[len(merged)-incidentHistoryLimit:]...)
	}
	m.history = merged
	if m.persistent && m.path != "" {
		if err := writePrivateGzipJSON(m.path, struct {
			Version   int        `json:"version"`
			Incidents []Incident `json:"incidents"`
		}{incidentHistoryVersion, m.history}); err != nil {
			m.lastPersistError = err.Error()
		} else {
			m.lastPersistError = ""
			m.lastPersistOKAt = time.Now()
		}
	}
}

func (m *incidentManager) snapshot(includeHistory bool) IncidentStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	rows := m.current
	if includeHistory {
		active := map[string]bool{}
		for _, x := range m.current {
			active[stableIncidentStoryKey(x)] = true
		}
		rows = append([]Incident(nil), m.history...)
		for i := range rows {
			rows[i] = normalizeLoadedIncident(rows[i])
			if active[rows[i].StoryKey] {
				rows[i].State = "active"
			} else {
				rows[i].State = "historical"
			}
		}
	} else {
		rows = append([]Incident(nil), rows...)
	}
	st := IncidentStatus{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Count: len(rows), Persistent: m.persistent, PersistenceHealthy: !m.persistent || m.lastPersistError == "", LastPersistError: m.lastPersistError, LastPersistOKAt: optTime(m.lastPersistOKAt), HistoryPath: m.path, Incidents: rows, Note: "Incidents correlate time-bounded local evidence into object-centered review stories. Confidence is relationship confidence, never malware probability."}
	for _, x := range rows {
		switch strings.ToLower(x.Severity) {
		case "high":
			st.High++
		case "review":
			st.Review++
		default:
			st.Info++
		}
	}
	return st
}

func (m *incidentManager) find(id string) (Incident, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, rows := range [][]Incident{m.current, m.history} {
		for _, x := range rows {
			x = normalizeLoadedIncident(x)
			if x.ID == id || x.StoryKey == id {
				return x, true
			}
		}
	}
	return Incident{}, false
}

func (a *app) rebuildIncidents() IncidentStatus {
	rows := a.buildIncidentCandidates()
	a.incidents.store(rows)
	return a.incidents.snapshot(false)
}

func (a *app) incidentDeepReview(id string) (IncidentDeepReview, error) {
	in, ok := a.incidents.find(strings.TrimSpace(id))
	if !ok {
		return IncidentDeepReview{}, fmt.Errorf("incident not found")
	}
	out := IncidentDeepReview{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Incident: in, Note: "Deep Review is an on-demand local reinspection of the incident's primary object. Results remain evidence, not a malware verdict."}
	if filepath.IsAbs(in.PrimaryPath) {
		integrity := inspectIntegrity(in.PrimaryPath)
		out.Integrity = &integrity
		if story, err := a.fileStory(in.PrimaryPath); err == nil {
			out.ObjectStory = &story
		}
	}
	return out, nil
}

func (a *app) handleIncidentDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	out, err := a.incidentDeepReview(r.URL.Query().Get("id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *app) handleIncidents(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, a.incidents.snapshot(r.URL.Query().Get("history") == "1"))
	case http.MethodPost:
		writeJSON(w, http.StatusOK, a.rebuildIncidents())
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET or POST required"})
	}
}

var _ = os.ErrNotExist
