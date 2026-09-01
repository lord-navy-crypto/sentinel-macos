// SPDX-License-Identifier: MPL-2.0
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	trustProfileVersion    = 1
	trustFingerprintBudget = 32
	trustMaxFingerprint    = int64(256 << 20) // 256 MiB per object
	trustFingerprintTotal  = int64(1 << 30)   // 1 GiB total per profile/compare operation
)

type TrustObject struct {
	Key               string   `json:"key"`
	Target            string   `json:"target"`
	Identifier        string   `json:"identifier,omitempty"`
	TeamID            string   `json:"team_id,omitempty"`
	BundlePath        string   `json:"bundle_path,omitempty"`
	SHA256            string   `json:"sha256,omitempty"`
	FingerprintStatus string   `json:"fingerprint_status"`
	FileSize          int64    `json:"file_size,omitempty"`
	ModifiedUnix      int64    `json:"modified_unix,omitempty"`
	StartupRefs       []string `json:"startup_refs,omitempty"`
	ParentTargets     []string `json:"parent_targets,omitempty"`
	EndpointClasses   []string `json:"endpoint_classes,omitempty"`
	PathRisk          int      `json:"path_risk,omitempty"`
}

type TrustProfile struct {
	Version          int                  `json:"version"`
	CreatedAt        string               `json:"created_at"`
	UpdatedAt        string               `json:"updated_at"`
	SourceCapturedAt string               `json:"source_captured_at"`
	Objects          []TrustObject        `json:"objects"`
	Startup          []BehaviorStartup    `json:"startup"`
	Background       []BehaviorBackground `json:"background"`
	PrivacyNote      string               `json:"privacy_note"`
	Meaning          string               `json:"meaning"`
}

type TrustChange struct {
	ID        string   `json:"id"`
	Kind      string   `json:"kind"`
	Severity  string   `json:"severity"`
	ObjectKey string   `json:"object_key,omitempty"`
	Title     string   `json:"title"`
	Before    string   `json:"before,omitempty"`
	After     string   `json:"after,omitempty"`
	Evidence  []string `json:"evidence,omitempty"`
}

type TrustSummary struct {
	Total              int `json:"total"`
	High               int `json:"high"`
	Review             int `json:"review"`
	Info               int `json:"info"`
	ProfileObjects     int `json:"profile_objects"`
	CurrentObjects     int `json:"current_objects"`
	MatchedObjects     int `json:"matched_objects"`
	NovelObjects       int `json:"novel_objects"`
	FingerprintChanges int `json:"fingerprint_changes"`
	IdentityChanges    int `json:"identity_changes"`
	PersistenceChanges int `json:"persistence_changes"`
}

type TrustDrift struct {
	ComparedAt      string        `json:"compared_at"`
	ProfileAt       string        `json:"profile_at,omitempty"`
	DriftIndex      int           `json:"drift_index"`
	DriftBand       string        `json:"drift_band"`
	ProfileCoverage int           `json:"profile_coverage"`
	Changes         []TrustChange `json:"changes"`
	Summary         TrustSummary  `json:"summary"`
	Note            string        `json:"note"`
}

type TrustHealth struct {
	Mode           string   `json:"mode"`
	Healthy        bool     `json:"healthy"`
	Issues         []string `json:"issues"`
	ProfilePath    string   `json:"profile_path,omitempty"`
	BackupPath     string   `json:"backup_path,omitempty"`
	ProfileExists  bool     `json:"profile_exists"`
	ProfileValid   bool     `json:"profile_valid"`
	ProfileMode    string   `json:"profile_mode,omitempty"`
	BackupExists   bool     `json:"backup_exists"`
	BackupValid    bool     `json:"backup_valid"`
	BackupMode     string   `json:"backup_mode,omitempty"`
	HistoryPath    string   `json:"history_path,omitempty"`
	HistoryExists  bool     `json:"history_exists"`
	HistoryValid   bool     `json:"history_valid"`
	HistoryMode    string   `json:"history_mode,omitempty"`
	HistoryEntries int      `json:"history_entries"`
	Objects        int      `json:"objects"`
	Privacy        string   `json:"privacy"`
}

type TrustObjectContext struct {
	Profiled          bool     `json:"profiled"`
	ProfileAt         string   `json:"profile_at,omitempty"`
	ProfileSHA256     string   `json:"profile_sha256,omitempty"`
	CurrentSHA256     string   `json:"current_sha256,omitempty"`
	FingerprintStatus string   `json:"fingerprint_status,omitempty"`
	Match             string   `json:"match"`
	Signals           []string `json:"signals,omitempty"`
	Note              string   `json:"note"`
}

type trustManager struct {
	mu          sync.Mutex
	persistent  bool
	path        string
	backupPath  string
	profile     *TrustProfile
	loadedDisk  bool
	lastDrift   TrustDrift
	historyPath string
	history     []TrustHistoryEntry
}

func trustProfilePath() string {
	base := behaviorBaselinePath()
	if base == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(base), "trust-profile.json")
}

func newTrustManager(ephemeral bool) *trustManager {
	m := &trustManager{persistent: !ephemeral}
	if m.persistent {
		m.path = trustProfilePath()
		if m.path != "" {
			m.backupPath = strings.TrimSuffix(m.path, ".json") + ".prev.json"
			m.historyPath = trustHistoryPath()
		}
		m.load()
		m.loadHistory()
	}
	return m
}

func (m *trustManager) load() {
	if m.path == "" {
		return
	}
	var p TrustProfile
	if err := readPrivateJSON(m.path, &p); err == nil && p.Version == trustProfileVersion && p.CreatedAt != "" {
		m.profile = &p
		m.loadedDisk = true
	}
}

func fingerprintFile(path string) (string, string) {
	path = normalizeEvidencePath(path)
	if path == "" {
		return "", "not_applicable"
	}
	st, err := os.Stat(path)
	if err != nil {
		return "", "unreadable"
	}
	if !st.Mode().IsRegular() {
		return "", "not_regular"
	}
	if st.Size() > trustMaxFingerprint {
		return "", "too_large"
	}
	f, err := os.Open(path)
	if err != nil {
		return "", "unreadable"
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, io.LimitReader(f, trustMaxFingerprint+1)); err != nil {
		return "", "read_error"
	}
	return hex.EncodeToString(h.Sum(nil)), "verified"
}

func fingerprintFileBudgeted(path string, remaining *int64) (string, string) {
	path = normalizeEvidencePath(path)
	if path == "" {
		return "", "not_applicable"
	}
	st, err := os.Stat(path)
	if err != nil {
		return "", "unreadable"
	}
	if !st.Mode().IsRegular() {
		return "", "not_regular"
	}
	if st.Size() > trustMaxFingerprint {
		return "", "too_large"
	}
	if remaining != nil && st.Size() > *remaining {
		return "", "total_budget_exceeded"
	}
	h, status := fingerprintFile(path)
	if remaining != nil && status == "verified" {
		*remaining -= st.Size()
		if *remaining < 0 {
			*remaining = 0
		}
	}
	return h, status
}

func trustObjectFromBehaviorBudgeted(o BehaviorObject, fingerprint bool, remaining *int64) TrustObject {
	t := trustObjectFromBehavior(o, false)
	if fingerprint {
		t.SHA256, t.FingerprintStatus = fingerprintFileBudgeted(o.Target, remaining)
	}
	return t
}

func trustObjectFromBehavior(o BehaviorObject, fingerprint bool) TrustObject {
	t := TrustObject{
		Key: o.Key, Target: o.Target, Identifier: o.Identifier, TeamID: o.TeamID,
		BundlePath: o.BundlePath, FileSize: o.FileSize, ModifiedUnix: o.ModifiedUnix,
		StartupRefs: append([]string(nil), o.StartupRefs...), ParentTargets: append([]string(nil), o.ParentTargets...),
		EndpointClasses: append([]string(nil), o.EndpointClasses...), PathRisk: o.PathRisk,
		FingerprintStatus: "not_checked",
	}
	if fingerprint {
		t.SHA256, t.FingerprintStatus = fingerprintFile(o.Target)
	}
	return t
}

func collectTrustProfile(existing *TrustProfile) TrustProfile {
	s := collectBehaviorSnapshot()
	now := time.Now().UTC().Format(time.RFC3339)
	created := now
	if existing != nil && existing.CreatedAt != "" {
		created = existing.CreatedAt
	}
	objects := make([]TrustObject, 0, len(s.Objects))
	remaining := trustFingerprintTotal
	for i, o := range s.Objects {
		objects = append(objects, trustObjectFromBehaviorBudgeted(o, i < trustFingerprintBudget && remaining > 0, &remaining))
	}
	return TrustProfile{
		Version: trustProfileVersion, CreatedAt: created, UpdatedAt: now, SourceCapturedAt: s.CapturedAt,
		Objects: objects, Startup: append([]BehaviorStartup{}, s.Startup...), Background: append([]BehaviorBackground{}, s.Background...),
		PrivacyNote: "User-approved reference metadata only. Sentinel stores bounded executable fingerprints and identity/persistence context, not file contents or complete command lines.",
		Meaning:     "A Trusted Profile is a user-approved reference state. It is not a guarantee that every profiled object is safe.",
	}
}

func (m *trustManager) persistLocked(p TrustProfile) error {
	if !m.persistent || m.path == "" {
		return nil
	}
	if old, err := readBoundedPrivateFile(m.path, maxPrivateJSONBytes); err == nil && len(old) > 0 {
		// The .prev profile is an intentional user-facing rollback point, separate
		// from the automatic .bak crash-recovery copy maintained by stateio.
		if err := atomicPrivateWrite(m.backupPath, old); err != nil {
			return fmt.Errorf("could not preserve previous Trust Profile rollback point: %w", err)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("could not safely read current Trust Profile before replacement: %w", err)
	}
	return writePrivateJSON(m.path, p)
}

func (m *trustManager) capture() TrustProfile {
	m.mu.Lock()
	var existing *TrustProfile
	if m.profile != nil {
		cp := *m.profile
		existing = &cp
	}
	m.mu.Unlock()
	p := collectTrustProfile(existing)
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.persistLocked(p); err != nil {
		p.PrivacyNote += " Persistence warning: " + err.Error()
	}
	m.profile = &p
	m.loadedDisk = false
	m.lastDrift = TrustDrift{}
	return p
}

func trustDriftIndex(changes []TrustChange) int {
	score := 0
	for _, c := range changes {
		switch c.Severity {
		case "high":
			score += 25
		case "review":
			score += 10
		default:
			score += 1
		}
		switch c.Kind {
		case "fingerprint_changed":
			score += 12
		case "team_id_changed":
			score += 10
		case "startup_target_changed":
			score += 10
		case "identity_changed":
			score += 6
		case "novel_object":
			score += 3
		case "persistence_changed":
			score += 4
		}
		if score >= 100 {
			return 100
		}
	}
	return score
}

func trustDriftBand(score int) string {
	switch {
	case score >= 70:
		return "high"
	case score >= 40:
		return "elevated"
	case score >= 15:
		return "review"
	case score > 0:
		return "observe"
	default:
		return "stable"
	}
}

func compareTrust(profile TrustProfile) TrustDrift {
	current := collectBehaviorSnapshot()
	currentObjects := make([]TrustObject, 0, len(current.Objects))
	for i, o := range current.Objects {
		currentObjects = append(currentObjects, trustObjectFromBehavior(o, i < trustFingerprintBudget))
	}
	pmap := map[string]TrustObject{}
	cmap := map[string]TrustObject{}
	for _, o := range profile.Objects {
		pmap[o.Target] = o
	}
	for _, o := range currentObjects {
		cmap[o.Target] = o
	}

	d := TrustDrift{ComparedAt: time.Now().UTC().Format(time.RFC3339), ProfileAt: profile.UpdatedAt, Changes: []TrustChange{}, Note: "Trust Drift compares the current Mac against a user-approved reference profile. Drift is not malware probability and profile membership is not proof of safety."}
	add := func(c TrustChange) {
		c.ID = entityID("trust-change", c.Kind+"\x00"+c.ObjectKey+"\x00"+c.Before+"\x00"+c.After+"\x00"+d.ComparedAt)
		d.Changes = append(d.Changes, c)
	}
	matched := 0
	for key, cur := range cmap {
		old, ok := pmap[key]
		if !ok {
			sev := "info"
			if cur.PathRisk >= 35 || len(cur.StartupRefs) > 0 {
				sev = "review"
			}
			add(TrustChange{Kind: "novel_object", Severity: sev, ObjectKey: key, Title: "Object is outside the trusted profile", After: key, Evidence: []string{"Current executable/script target was not present when the user approved the Trusted Profile"}})
			continue
		}
		matched++
		if old.SHA256 != "" && cur.SHA256 != "" && old.SHA256 != cur.SHA256 {
			sev := "review"
			if len(cur.StartupRefs) > 0 {
				sev = "high"
			}
			add(TrustChange{Kind: "fingerprint_changed", Severity: sev, ObjectKey: key, Title: "Executable fingerprint changed", Before: old.SHA256, After: cur.SHA256, Evidence: []string{"Bounded local SHA-256 fingerprint differs from the user-approved profile"}})
		} else if old.SHA256 == "" && cur.SHA256 == "" && old.FileSize != 0 && cur.FileSize != 0 && (old.FileSize != cur.FileSize || old.ModifiedUnix != cur.ModifiedUnix) {
			add(TrustChange{Kind: "metadata_changed", Severity: "review", ObjectKey: key, Title: "Executable metadata changed", Before: fmt.Sprintf("%d bytes · mtime %d", old.FileSize, old.ModifiedUnix), After: fmt.Sprintf("%d bytes · mtime %d", cur.FileSize, cur.ModifiedUnix), Evidence: []string{"A fingerprint was unavailable, so size/mtime drift is shown instead"}})
		}
		if old.TeamID != "" && cur.TeamID != "" && old.TeamID != cur.TeamID {
			add(TrustChange{Kind: "team_id_changed", Severity: "high", ObjectKey: key, Title: "Signing Team ID changed", Before: old.TeamID, After: cur.TeamID, Evidence: []string{"codesign TeamIdentifier differs from the user-approved profile"}})
		} else if old.Identifier != "" && cur.Identifier != "" && old.Identifier != cur.Identifier {
			add(TrustChange{Kind: "identity_changed", Severity: "review", ObjectKey: key, Title: "Code Identifier changed", Before: old.Identifier, After: cur.Identifier, Evidence: []string{"codesign Identifier differs from the user-approved profile"}})
		}
		if !sameStrings(old.StartupRefs, cur.StartupRefs) {
			add(TrustChange{Kind: "persistence_changed", Severity: "review", ObjectKey: key, Title: "Startup relationship drifted", Before: strings.Join(old.StartupRefs, ", "), After: strings.Join(cur.StartupRefs, ", "), Evidence: []string{"LaunchAgent/LaunchDaemon relationship differs from the approved profile"}})
		}
		if len(old.ParentTargets) > 0 && len(cur.ParentTargets) > 0 && !sameStrings(old.ParentTargets, cur.ParentTargets) {
			add(TrustChange{Kind: "parent_context_changed", Severity: "review", ObjectKey: key, Title: "Parent launch context drifted", Before: strings.Join(old.ParentTargets, ", "), After: strings.Join(cur.ParentTargets, ", "), Evidence: []string{"Observed parent executable set differs from the approved profile"}})
		}
	}
	for key := range pmap {
		if _, ok := cmap[key]; !ok {
			add(TrustChange{Kind: "profile_object_not_observed", Severity: "info", ObjectKey: key, Title: "Profiled object is not currently observed", Before: key, Evidence: []string{"Object remains in the Trusted Profile but is outside the current compact active/persistent snapshot"}})
		}
	}
	// Startup configurations are also compared by their plist path, even if target objects were omitted.
	ps, cs := map[string]BehaviorStartup{}, map[string]BehaviorStartup{}
	for _, x := range profile.Startup {
		ps[x.Path] = x
	}
	for _, x := range current.Startup {
		cs[x.Path] = x
	}
	for path, cur := range cs {
		if old, ok := ps[path]; ok && old.Executable != cur.Executable {
			add(TrustChange{Kind: "startup_target_changed", Severity: "high", ObjectKey: cur.Executable, Title: "Trusted startup target changed", Before: old.Executable, After: cur.Executable, Evidence: []string{"Existing startup plist path now resolves to a different executable than the user-approved profile"}})
		} else if !ok {
			add(TrustChange{Kind: "startup_added", Severity: "review", ObjectKey: cur.Executable, Title: "Startup item is outside the trusted profile", After: path + " → " + cur.Executable, Evidence: []string{"LaunchAgent/LaunchDaemon was not present in the approved profile"}})
		}
	}

	order := map[string]int{"high": 0, "review": 1, "info": 2}
	sort.SliceStable(d.Changes, func(i, j int) bool {
		if order[d.Changes[i].Severity] != order[d.Changes[j].Severity] {
			return order[d.Changes[i].Severity] < order[d.Changes[j].Severity]
		}
		return d.Changes[i].Title < d.Changes[j].Title
	})
	d.Summary.ProfileObjects = len(profile.Objects)
	d.Summary.CurrentObjects = len(currentObjects)
	d.Summary.MatchedObjects = matched
	for _, c := range d.Changes {
		d.Summary.Total++
		switch c.Severity {
		case "high":
			d.Summary.High++
		case "review":
			d.Summary.Review++
		default:
			d.Summary.Info++
		}
		switch c.Kind {
		case "novel_object":
			d.Summary.NovelObjects++
		case "fingerprint_changed":
			d.Summary.FingerprintChanges++
		case "team_id_changed", "identity_changed":
			d.Summary.IdentityChanges++
		case "persistence_changed", "startup_target_changed", "startup_added":
			d.Summary.PersistenceChanges++
		}
	}
	if len(currentObjects) > 0 {
		d.ProfileCoverage = matched * 100 / len(currentObjects)
	}
	d.DriftIndex = trustDriftIndex(d.Changes)
	d.DriftBand = trustDriftBand(d.DriftIndex)
	return d
}

func (m *trustManager) compare(intel *intelligenceManager) TrustDrift {
	m.mu.Lock()
	if m.profile == nil {
		m.mu.Unlock()
		return TrustDrift{ComparedAt: time.Now().UTC().Format(time.RFC3339), Changes: []TrustChange{}, Note: "No Trusted Profile exists yet. Review the current Mac and explicitly establish one before using Trust Drift."}
	}
	profile := *m.profile
	m.mu.Unlock()
	d := compareTrust(profile)
	m.mu.Lock()
	m.lastDrift = d
	m.recordHistoryLocked(d)
	if err := m.persistHistoryLocked(); err != nil {
		d.Note += " Trust history could not be persisted: " + err.Error()
	}
	m.mu.Unlock()
	if intel != nil {
		for _, c := range d.Changes {
			intel.appendExternalEvent(TimelineEvent{ID: entityID("event", "trust-"+c.ID), At: time.Now().Unix(), Kind: "trust_drift", Severity: c.Severity, Title: c.Title, Detail: firstNonEmpty(c.After, c.Before), ObjectID: behaviorObjectID(c.ObjectKey)})
		}
	}
	return d
}

func (m *trustManager) status() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	mode := "persistent-local"
	if !m.persistent {
		mode = "ephemeral"
	}
	out := map[string]any{
		"has_profile":                  m.profile != nil,
		"profile_path":                 m.path,
		"backup_path":                  m.backupPath,
		"history_path":                 m.historyPath,
		"history_entries":              len(m.history),
		"persistence_mode":             mode,
		"loaded_from_previous_session": m.loadedDisk,
		"last_drift":                   m.lastDrift,
		"meaning":                      "Trusted Profile means user-approved reference, not Sentinel-certified safe.",
	}
	if m.profile != nil {
		out["created_at"] = m.profile.CreatedAt
		out["updated_at"] = m.profile.UpdatedAt
		out["objects"] = len(m.profile.Objects)
		out["startup"] = len(m.profile.Startup)
		out["background"] = len(m.profile.Background)
	}
	return out
}

func validateTrustFile(path string) (exists, valid bool, mode string) {
	info, err := os.Lstat(path)
	if err != nil {
		return false, false, ""
	}
	exists = true
	mode = fileModeString(info)
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return exists, false, mode
	}
	var p TrustProfile
	valid = readPrivateJSON(path, &p) == nil && p.Version == trustProfileVersion && p.CreatedAt != "" && len(p.Objects) <= 120
	return
}

func (m *trustManager) health() TrustHealth {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.persistent {
		objects := 0
		if m.profile != nil {
			objects = len(m.profile.Objects)
		}
		return TrustHealth{Mode: "ephemeral", Healthy: true, HistoryEntries: len(m.history), Objects: objects, Privacy: "Ephemeral mode keeps Trusted Profile and Trust Drift history in memory only."}
	}
	h := TrustHealth{Mode: "persistent-local", Healthy: true, Issues: []string{}, ProfilePath: m.path, BackupPath: m.backupPath, HistoryPath: m.historyPath, HistoryEntries: len(m.history), Privacy: "Trusted Profile stores bounded metadata and SHA-256 fingerprints only; Trust Drift history stores bounded comparison evidence; no file contents are persisted."}
	if m.profile != nil {
		h.Objects = len(m.profile.Objects)
	}
	if m.path == "" {
		h.Healthy = false
		h.Issues = append(h.Issues, "User home directory is unavailable.")
		return h
	}
	h.ProfileExists, h.ProfileValid, h.ProfileMode = validateTrustFile(m.path)
	if h.ProfileExists && h.ProfileMode != "0600" {
		h.Healthy = false
		h.Issues = append(h.Issues, "Trust profile permissions are not 0600.")
	}
	if h.ProfileExists && !h.ProfileValid {
		h.Healthy = false
		h.Issues = append(h.Issues, "Trust profile JSON is invalid or unsupported.")
	}
	h.BackupExists, h.BackupValid, h.BackupMode = validateTrustFile(m.backupPath)
	if h.BackupExists && h.BackupMode != "0600" {
		h.Healthy = false
		h.Issues = append(h.Issues, "Trust profile backup permissions are not 0600.")
	}
	if h.BackupExists && !h.BackupValid {
		h.Healthy = false
		h.Issues = append(h.Issues, "Trust profile backup JSON is invalid.")
	}
	h.HistoryExists, h.HistoryValid, h.HistoryMode, h.HistoryEntries = validateTrustHistory(m.historyPath)
	if h.HistoryExists && h.HistoryMode != "0600" {
		h.Healthy = false
		h.Issues = append(h.Issues, "Trust drift history permissions are not 0600.")
	}
	if h.HistoryExists && !h.HistoryValid {
		h.Healthy = false
		h.Issues = append(h.Issues, "Trust drift history JSON is invalid or exceeds the retention limit.")
	}
	if !h.HistoryExists {
		h.HistoryValid = true
	}
	return h
}

func (m *trustManager) objectContext(path string) TrustObjectContext {
	path = normalizeEvidencePath(path)
	m.mu.Lock()
	defer m.mu.Unlock()
	ctx := TrustObjectContext{Match: "unprofiled", Note: "Trusted Profile membership is a user-approved reference signal, not proof of safety."}
	if m.profile == nil || path == "" {
		return ctx
	}
	ctx.ProfileAt = m.profile.UpdatedAt
	var old *TrustObject
	for i := range m.profile.Objects {
		if normalizeEvidencePath(m.profile.Objects[i].Target) == path {
			old = &m.profile.Objects[i]
			break
		}
	}
	if old == nil {
		return ctx
	}
	ctx.Profiled = true
	ctx.ProfileSHA256 = old.SHA256
	ctx.FingerprintStatus = old.FingerprintStatus
	ctx.Match = "profiled"
	curHash, status := fingerprintFile(path)
	ctx.CurrentSHA256 = curHash
	if status != "verified" {
		ctx.Signals = append(ctx.Signals, "Current SHA-256 could not be verified: "+status)
	}
	if old.SHA256 != "" && curHash != "" {
		if old.SHA256 == curHash {
			ctx.Match = "fingerprint_match"
			ctx.Signals = append(ctx.Signals, "Current SHA-256 matches the user-approved profile")
		} else {
			ctx.Match = "fingerprint_changed"
			ctx.Signals = append(ctx.Signals, "Current SHA-256 differs from the user-approved profile")
		}
	}
	return ctx
}

func (m *trustManager) restorePrevious() (TrustProfile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.persistent || m.backupPath == "" || m.path == "" {
		return TrustProfile{}, fmt.Errorf("previous-profile restore is unavailable in ephemeral mode")
	}
	var previous TrustProfile
	if err := readPrivateJSON(m.backupPath, &previous); err != nil || previous.Version != trustProfileVersion || previous.CreatedAt == "" {
		return TrustProfile{}, fmt.Errorf("previous profile is invalid or unavailable")
	}
	backupRaw, err := readBoundedPrivateFile(m.backupPath, maxPrivateJSONBytes)
	if err != nil {
		return TrustProfile{}, fmt.Errorf("previous profile unavailable: %w", err)
	}
	currentRaw, currentErr := readBoundedPrivateFile(m.path, maxPrivateJSONBytes)
	if currentErr != nil && !os.IsNotExist(currentErr) {
		return TrustProfile{}, fmt.Errorf("current profile could not be safely preserved before restore: %w", currentErr)
	}
	if err := atomicPrivateWrite(m.path, backupRaw); err != nil {
		return TrustProfile{}, fmt.Errorf("could not atomically restore previous profile: %w", err)
	}
	if currentErr == nil && len(currentRaw) > 0 {
		if err := atomicPrivateWrite(m.backupPath, currentRaw); err != nil {
			if rollbackErr := atomicPrivateWrite(m.path, currentRaw); rollbackErr != nil {
				return TrustProfile{}, fmt.Errorf("could not rotate Trust Profile rollback point: %v; rollback also failed: %w", err, rollbackErr)
			}
			return TrustProfile{}, fmt.Errorf("could not rotate Trust Profile rollback point; restore was rolled back: %w", err)
		}
	}
	m.profile = &previous
	m.loadedDisk = false
	m.lastDrift = TrustDrift{}
	return previous, nil
}

func (a *app) handleTrustRestore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	p, err := a.trust.restorePrevious()
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, p)
}

func (a *app) handleTrustStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, a.trust.status())
}
func (a *app) handleTrustCapture(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	writeJSON(w, 200, a.trust.capture())
}
func (a *app) handleTrustCompare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	writeJSON(w, 200, a.trust.compare(a.intel))
}
func (a *app) handleTrustHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, a.trust.health())
}
func (a *app) handleTrustExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	a.trust.mu.Lock()
	defer a.trust.mu.Unlock()
	if a.trust.profile == nil {
		writeJSON(w, 404, map[string]any{"error": "no Trusted Profile exists"})
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=sentinel-trust-profile.json")
	_ = json.NewEncoder(w).Encode(a.trust.profile)
}

func (m *trustManager) referenceLabel(path string) string {
	path = normalizeEvidencePath(path)
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.profile == nil {
		return "no_profile"
	}
	for _, o := range m.profile.Objects {
		if normalizeEvidencePath(o.Target) == path {
			return "profiled"
		}
	}
	return "outside_profile"
}
