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

type BehaviorObject struct {
	Key             string   `json:"key"`
	Target          string   `json:"target"`
	Identifier      string   `json:"identifier,omitempty"`
	TeamID          string   `json:"team_id,omitempty"`
	BundlePath      string   `json:"bundle_path,omitempty"`
	FileSize        int64    `json:"file_size,omitempty"`
	ModifiedUnix    int64    `json:"modified_unix,omitempty"`
	PIDs            []int    `json:"pids,omitempty"`
	StartupRefs     []string `json:"startup_refs,omitempty"`
	PublicEndpoints []string `json:"public_endpoints,omitempty"`
	EndpointClasses []string `json:"endpoint_classes,omitempty"`
	ParentTargets   []string `json:"parent_targets,omitempty"`
	PathRisk        int      `json:"path_risk,omitempty"`
}

type BehaviorStartup struct {
	Path       string `json:"path"`
	Executable string `json:"executable"`
	Scope      string `json:"scope"`
	Risk       int    `json:"risk"`
}

type BehaviorBackground struct {
	Key         string `json:"key"`
	Identifier  string `json:"identifier,omitempty"`
	Executable  string `json:"executable,omitempty"`
	Disposition string `json:"disposition,omitempty"`
}

type BehaviorSnapshot struct {
	Version     int                  `json:"version"`
	CapturedAt  string               `json:"captured_at"`
	Objects     []BehaviorObject     `json:"objects"`
	Startup     []BehaviorStartup    `json:"startup"`
	Background  []BehaviorBackground `json:"background"`
	PrivacyNote string               `json:"privacy_note"`
}

type BehaviorChange struct {
	ID        string   `json:"id"`
	Kind      string   `json:"kind"`
	Severity  string   `json:"severity"`
	ObjectKey string   `json:"object_key,omitempty"`
	Title     string   `json:"title"`
	Before    string   `json:"before,omitempty"`
	After     string   `json:"after,omitempty"`
	Evidence  []string `json:"evidence,omitempty"`
}

type BehaviorSummary struct {
	Total       int `json:"total"`
	High        int `json:"high"`
	Review      int `json:"review"`
	Info        int `json:"info"`
	Identity    int `json:"identity_changes"`
	Persistence int `json:"persistence_changes"`
	Network     int `json:"network_changes"`
	Executable  int `json:"executable_changes"`
}

type BehaviorDiff struct {
	RiskIndex      int              `json:"risk_index"`
	RiskBand       string           `json:"risk_band"`
	RiskDelta      int              `json:"risk_delta"`
	HistoryDepth   int              `json:"history_depth"`
	BaselineAt     string           `json:"baseline_at,omitempty"`
	CurrentAt      string           `json:"current_at"`
	BaselineSource string           `json:"baseline_source"`
	BaselinePath   string           `json:"baseline_path,omitempty"`
	FirstBaseline  bool             `json:"first_baseline"`
	Changes        []BehaviorChange `json:"changes"`
	Summary        BehaviorSummary  `json:"summary"`
	Note           string           `json:"note"`
}

type behaviorManager struct {
	mu           sync.Mutex
	baseline     *BehaviorSnapshot
	baselinePath string
	historyPath  string
	history      []BehaviorHistoryEntry
	loadedDisk   bool
	persistent   bool
	lastDiff     BehaviorDiff
}

func behaviorBaselinePath() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	return filepath.Join(home, "Library", "Application Support", "Sentinel", "behavior-baseline.json")
}

func newBehaviorManager(ephemeral bool) *behaviorManager {
	m := &behaviorManager{persistent: !ephemeral}
	if m.persistent {
		m.baselinePath = behaviorBaselinePath()
		m.historyPath = behaviorHistoryPath()
		m.load()
		m.loadHistory()
	}
	return m
}

func (m *behaviorManager) load() {
	if m.baselinePath == "" {
		return
	}
	var snap BehaviorSnapshot
	if readPrivateJSON(m.baselinePath, &snap) == nil && snap.Version == 1 && snap.CapturedAt != "" {
		m.baseline = &snap
		m.loadedDisk = true
	}
}

func (m *behaviorManager) persist(s BehaviorSnapshot) error {
	if m.baselinePath == "" {
		return fmt.Errorf("user home directory unavailable")
	}
	return writePrivateJSON(m.baselinePath, s)
}

func collectBehaviorSnapshot() BehaviorSnapshot {
	startups := collectStartupItems()
	procs := parsePS(100000)
	nets, _ := collectNetwork()
	background := collectBackgroundItems()

	startupByTarget := map[string][]string{}
	startupRows := make([]BehaviorStartup, 0, len(startups))
	priority := map[string]int{}
	bumpPriority := func(target string, value int) {
		if target != "" && value > priority[target] {
			priority[target] = value
		}
	}
	for _, s := range startups {
		target := normalizeEvidencePath(s.Executable)
		startupRows = append(startupRows, BehaviorStartup{Path: s.Path, Executable: target, Scope: s.Scope, Risk: s.Risk})
		if target != "" {
			startupByTarget[target] = append(startupByTarget[target], s.Path)
			bumpPriority(target, 100+s.Risk)
		}
	}

	type procAgg struct {
		pids    []int
		classes []string
		public  []string
	}
	procByTarget := map[string]*procAgg{}
	pidTarget := map[int]string{}
	for _, p := range procs {
		target, script := processAuditPath(p)
		if !script && (target == "" || !filepath.IsAbs(target)) {
			if resolved := normalizeEvidencePath(executablePathForPID(p.PID, p.Command)); resolved != "" {
				target = resolved
			}
		}
		if target == "" {
			continue
		}
		pidTarget[p.PID] = target
		agg := procByTarget[target]
		if agg == nil {
			agg = &procAgg{}
			procByTarget[target] = agg
		}
		agg.pids = append(agg.pids, p.PID)
		low := strings.ToLower(target)
		if strings.HasPrefix(target, "/Users/") || strings.HasPrefix(target, "/tmp/") || strings.HasPrefix(target, "/private/tmp/") || strings.Contains(low, "/applications/") {
			risk, _ := scorePath(target)
			bumpPriority(target, 25+risk)
		}
	}
	parentTargets := map[string][]string{}
	for _, p := range procs {
		target := pidTarget[p.PID]
		parentTarget := pidTarget[p.PPID]
		if target != "" && parentTarget != "" && target != parentTarget {
			parentTargets[target] = append(parentTargets[target], parentTarget)
		}
	}
	for _, n := range nets {
		target := pidTarget[n.PID]
		if target == "" {
			continue
		}
		agg := procByTarget[target]
		agg.classes = append(agg.classes, n.EndpointClass)
		if n.EndpointClass == "public" {
			remote := n.Remote
			if remote == "" {
				_, remote, _ = classifyEndpoint(n.Address, n.State)
			}
			if remote != "" {
				agg.public = append(agg.public, remote)
			}
			bumpPriority(target, 85)
		}
	}

	// Keep the persistent baseline compact. System binaries with no persistence,
	// public network activity, or user/application location are intentionally omitted.
	keys := make([]string, 0, len(priority))
	for k := range priority {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if priority[keys[i]] != priority[keys[j]] {
			return priority[keys[i]] > priority[keys[j]]
		}
		return keys[i] < keys[j]
	})
	if len(keys) > 120 {
		keys = keys[:120]
	}
	objects := make([]BehaviorObject, 0, len(keys))
	identityBudget := 32
	for _, target := range keys {
		risk, _ := scorePath(target)
		obj := BehaviorObject{Key: target, Target: target, PathRisk: risk, StartupRefs: sortedUnique(startupByTarget[target])}
		if agg := procByTarget[target]; agg != nil {
			sort.Ints(agg.pids)
			obj.PIDs = append([]int(nil), agg.pids...)
			obj.PublicEndpoints = takeStrings(sortedUnique(agg.public), 24)
			obj.EndpointClasses = sortedUnique(agg.classes)
		}
		obj.ParentTargets = takeStrings(sortedUnique(parentTargets[target]), 12)
		if st, err := os.Stat(target); err == nil && !st.IsDir() {
			obj.FileSize = st.Size()
			obj.ModifiedUnix = st.ModTime().Unix()
		}
		if identityBudget > 0 {
			id := inspectCodeIdentityFast(target)
			obj.Identifier = id.Identifier
			obj.TeamID = id.TeamID
			obj.BundlePath = id.BundlePath
			identityBudget--
		}
		objects = append(objects, obj)
	}

	bg := make([]BehaviorBackground, 0, len(background.Items))
	for _, b := range background.Items {
		key := strings.TrimSpace(b.Identifier)
		if key == "" {
			key = normalizeEvidencePath(b.Executable)
		}
		if key == "" {
			key = strings.TrimSpace(b.Name + "|" + b.URL)
		}
		if key == "" {
			continue
		}
		bg = append(bg, BehaviorBackground{Key: key, Identifier: b.Identifier, Executable: normalizeEvidencePath(b.Executable), Disposition: b.Disposition})
	}
	sort.Slice(startupRows, func(i, j int) bool { return startupRows[i].Path < startupRows[j].Path })
	sort.Slice(bg, func(i, j int) bool { return bg[i].Key < bg[j].Key })

	return BehaviorSnapshot{
		Version:     1,
		CapturedAt:  time.Now().UTC().Format(time.RFC3339),
		Objects:     objects,
		Startup:     startupRows,
		Background:  bg,
		PrivacyNote: "Compact local metadata only. Sentinel does not persist file contents or complete process command lines in the behavior baseline.",
	}
}

func sortedUnique(in []string) []string {
	out := uniqueStrings(in)
	sort.Strings(out)
	return out
}

func inspectCodeIdentityFast(path string) CodeIdentity {
	path = normalizeEvidencePath(path)
	id := CodeIdentity{Path: path, InspectPath: path, Source: "codesign identity metadata"}
	if path == "" {
		return id
	}
	if bundle := enclosingAppBundle(path); bundle != "" {
		id.BundlePath = bundle
		id.InspectPath = bundle
	}
	if !commandExists("codesign") {
		return id
	}
	raw, _ := commandOutput(900*time.Millisecond, "codesign", "-dv", "--verbose=4", id.InspectPath)
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "Identifier="):
			id.Identifier = strings.TrimSpace(strings.TrimPrefix(line, "Identifier="))
		case strings.HasPrefix(line, "TeamIdentifier="):
			v := strings.TrimSpace(strings.TrimPrefix(line, "TeamIdentifier="))
			if v != "not set" {
				id.TeamID = v
			}
		}
	}
	return id
}

func diffBehavior(before, after BehaviorSnapshot) BehaviorDiff {
	d := BehaviorDiff{BaselineAt: before.CapturedAt, CurrentAt: after.CapturedAt, Changes: []BehaviorChange{}, Note: "Behavior changes are locally observed metadata differences. A change is not proof of malicious behavior."}
	add := func(c BehaviorChange) {
		c.ID = entityID("change", c.Kind+"\x00"+c.ObjectKey+"\x00"+c.Before+"\x00"+c.After+"\x00"+after.CapturedAt)
		d.Changes = append(d.Changes, c)
	}

	bo, ao := map[string]BehaviorObject{}, map[string]BehaviorObject{}
	for _, x := range before.Objects {
		bo[x.Key] = x
	}
	for _, x := range after.Objects {
		ao[x.Key] = x
	}
	for key, a := range ao {
		b, ok := bo[key]
		if !ok {
			sev := "info"
			if a.PathRisk >= 35 || len(a.StartupRefs) > 0 {
				sev = "review"
			}
			add(BehaviorChange{Kind: "object_observed", Severity: sev, ObjectKey: key, Title: "New executable object observed", After: a.Target, Evidence: []string{"New target in compact behavior baseline"}})
			continue
		}
		identityChanged := (b.Identifier != "" && a.Identifier != "" && b.Identifier != a.Identifier) || (b.TeamID != "" && a.TeamID != "" && b.TeamID != a.TeamID)
		if identityChanged {
			sev := "review"
			if b.TeamID != "" && a.TeamID != "" && b.TeamID != a.TeamID {
				sev = "high"
			}
			add(BehaviorChange{Kind: "identity_changed", Severity: sev, ObjectKey: key, Title: "Code identity changed", Before: formatIdentity(b), After: formatIdentity(a), Evidence: []string{"codesign Identifier/TeamIdentifier metadata changed for the same target path"}})
		}
		if b.FileSize != 0 && a.FileSize != 0 && (b.FileSize != a.FileSize || b.ModifiedUnix != a.ModifiedUnix) {
			sev := "review"
			if len(a.StartupRefs) > 0 {
				sev = "high"
			}
			add(BehaviorChange{Kind: "executable_changed", Severity: sev, ObjectKey: key, Title: "Executable metadata changed", Before: fmt.Sprintf("%d bytes · mtime %d", b.FileSize, b.ModifiedUnix), After: fmt.Sprintf("%d bytes · mtime %d", a.FileSize, a.ModifiedUnix), Evidence: []string{"File size or modification time changed at the same executable/script path"}})
		}
		for _, ep := range takeStrings(stringSetDiff(a.PublicEndpoints, b.PublicEndpoints), 8) {
			sev := "info"
			if a.PathRisk >= 35 || len(a.StartupRefs) > 0 {
				sev = "review"
			}
			add(BehaviorChange{Kind: "new_public_endpoint", Severity: sev, ObjectKey: key, Title: "New public network endpoint", After: ep, Evidence: []string{"Public TCP endpoint was not present in the previous local baseline"}})
		}
		if !sameStrings(b.StartupRefs, a.StartupRefs) {
			add(BehaviorChange{Kind: "persistence_relation_changed", Severity: "review", ObjectKey: key, Title: "Startup relationship changed", Before: strings.Join(b.StartupRefs, ", "), After: strings.Join(a.StartupRefs, ", "), Evidence: []string{"LaunchAgent/LaunchDaemon references for this target changed"}})
		}
		if len(b.ParentTargets) > 0 && len(a.ParentTargets) > 0 && !sameStrings(b.ParentTargets, a.ParentTargets) {
			add(BehaviorChange{Kind: "parent_context_changed", Severity: "review", ObjectKey: key, Title: "Parent launch context changed", Before: strings.Join(b.ParentTargets, ", "), After: strings.Join(a.ParentTargets, ", "), Evidence: []string{"Observed parent executable set changed for the same target"}})
		}
	}
	for key, b := range bo {
		if _, ok := ao[key]; !ok {
			add(BehaviorChange{Kind: "object_not_observed", Severity: "info", ObjectKey: key, Title: "Executable object no longer observed", Before: b.Target, Evidence: []string{"Target fell out of the compact active/persistent behavior baseline"}})
		}
	}

	bs, as := map[string]BehaviorStartup{}, map[string]BehaviorStartup{}
	for _, x := range before.Startup {
		bs[x.Path] = x
	}
	for _, x := range after.Startup {
		as[x.Path] = x
	}
	for path, a := range as {
		b, ok := bs[path]
		if !ok {
			sev := "review"
			if a.Risk >= 70 {
				sev = "high"
			}
			add(BehaviorChange{Kind: "startup_added", Severity: sev, ObjectKey: a.Executable, Title: "Startup item added", After: path + " → " + a.Executable, Evidence: []string{"New LaunchAgent/LaunchDaemon path"}})
		} else if b.Executable != a.Executable {
			add(BehaviorChange{Kind: "startup_target_changed", Severity: "high", ObjectKey: a.Executable, Title: "Startup target changed", Before: b.Executable, After: a.Executable, Evidence: []string{"Existing startup configuration now references a different executable"}})
		}
	}
	for path, b := range bs {
		if _, ok := as[path]; !ok {
			add(BehaviorChange{Kind: "startup_removed", Severity: "info", ObjectKey: b.Executable, Title: "Startup item removed", Before: path + " → " + b.Executable})
		}
	}

	bb, ab := map[string]BehaviorBackground{}, map[string]BehaviorBackground{}
	for _, x := range before.Background {
		bb[x.Key] = x
	}
	for _, x := range after.Background {
		ab[x.Key] = x
	}
	for key, a := range ab {
		b, ok := bb[key]
		if !ok {
			add(BehaviorChange{Kind: "background_added", Severity: "review", ObjectKey: a.Executable, Title: "Background registration added", After: backgroundSummary(a), Evidence: []string{"New macOS Background Task Management registration"}})
			continue
		}
		if b.Executable != a.Executable || b.Disposition != a.Disposition {
			add(BehaviorChange{Kind: "background_changed", Severity: "review", ObjectKey: a.Executable, Title: "Background registration changed", Before: backgroundSummary(b), After: backgroundSummary(a), Evidence: []string{"Executable or disposition changed for the same background item"}})
		}
	}
	for key, b := range bb {
		if _, ok := ab[key]; !ok {
			add(BehaviorChange{Kind: "background_removed", Severity: "info", ObjectKey: b.Executable, Title: "Background registration removed", Before: backgroundSummary(b)})
		}
	}

	severityOrder := map[string]int{"high": 0, "review": 1, "info": 2}
	sort.SliceStable(d.Changes, func(i, j int) bool {
		if severityOrder[d.Changes[i].Severity] != severityOrder[d.Changes[j].Severity] {
			return severityOrder[d.Changes[i].Severity] < severityOrder[d.Changes[j].Severity]
		}
		return d.Changes[i].Title < d.Changes[j].Title
	})
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
		case "identity_changed":
			d.Summary.Identity++
		case "startup_added", "startup_removed", "startup_target_changed", "background_added", "background_changed", "background_removed", "persistence_relation_changed":
			d.Summary.Persistence++
		case "new_public_endpoint":
			d.Summary.Network++
		case "executable_changed":
			d.Summary.Executable++
		}
	}
	return d
}

func takeStrings(in []string, n int) []string {
	if n <= 0 || len(in) <= n {
		return in
	}
	return append([]string(nil), in[:n]...)
}

func sameStrings(a, b []string) bool {
	aa, bb := sortedUnique(a), sortedUnique(b)
	if len(aa) != len(bb) {
		return false
	}
	for i := range aa {
		if aa[i] != bb[i] {
			return false
		}
	}
	return true
}
func stringSetDiff(a, b []string) []string {
	seen := map[string]bool{}
	for _, x := range b {
		seen[x] = true
	}
	var out []string
	for _, x := range a {
		if !seen[x] {
			out = append(out, x)
		}
	}
	return sortedUnique(out)
}
func formatIdentity(x BehaviorObject) string {
	return fmt.Sprintf("Identifier=%s · TeamID=%s", emptyDash(x.Identifier), emptyDash(x.TeamID))
}
func backgroundSummary(x BehaviorBackground) string {
	return fmt.Sprintf("%s · %s · %s", emptyDash(x.Identifier), emptyDash(x.Executable), emptyDash(x.Disposition))
}
func emptyDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}

func (m *behaviorManager) capture(intel *intelligenceManager) BehaviorDiff {
	current := collectBehaviorSnapshot()
	m.mu.Lock()
	defer m.mu.Unlock()
	source := "none"
	var d BehaviorDiff
	if m.baseline == nil {
		d = BehaviorDiff{CurrentAt: current.CapturedAt, BaselineSource: "new", BaselinePath: m.baselinePath, FirstBaseline: true, Changes: []BehaviorChange{}, Note: "First behavior baseline captured. Future captures will report changes against the most recent local baseline."}
	} else {
		d = diffBehavior(*m.baseline, current)
		if m.loadedDisk {
			source = "previous Sentinel session"
		} else {
			source = "current Sentinel session"
		}
		d.BaselineSource = source
		d.BaselinePath = m.baselinePath
	}
	if !m.persistent {
		d.Note += " Ephemeral mode is active: this baseline remains only in memory for the current Sentinel session."
	} else if err := m.persist(current); err != nil {
		d.Note += " Baseline could not be persisted: " + err.Error()
	} else {
		d.Note += " The new compact baseline was saved locally with user-only file permissions."
	}
	m.recordHistoryLocked(&d)
	if m.persistent {
		if err := m.persistHistoryLocked(); err != nil {
			d.Note += " Behavior history could not be persisted: " + err.Error()
		}
	}
	m.baseline = &current
	m.loadedDisk = false
	m.lastDiff = d
	if intel != nil && !d.FirstBaseline {
		for _, c := range d.Changes {
			sev := c.Severity
			if sev == "review" {
				sev = "review"
			}
			intel.appendExternalEvent(TimelineEvent{ID: entityID("event", "behavior-"+c.ID), At: time.Now().Unix(), Kind: "behavior_diff", Severity: sev, Title: c.Title, Detail: firstNonEmpty(c.After, c.Before), ObjectID: behaviorObjectID(c.ObjectKey)})
		}
	}
	return d
}

func firstNonEmpty(v ...string) string {
	for _, x := range v {
		if strings.TrimSpace(x) != "" {
			return x
		}
	}
	return ""
}
func behaviorObjectID(key string) string {
	if key == "" {
		return ""
	}
	return entityID("file", normalizeEvidencePath(key))
}

func (m *behaviorManager) status() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	privacy := "Persistent behavior data is compact metadata only; no file contents or complete command lines are stored."
	mode := "persistent-local"
	if !m.persistent {
		mode = "ephemeral"
		privacy = "Ephemeral mode: Behavior Diff state remains in memory for this Sentinel session and is not written to disk."
	}
	out := map[string]any{"baseline_path": m.baselinePath, "history_path": m.historyPath, "history_entries": len(m.history), "has_baseline": m.baseline != nil, "loaded_from_previous_session": m.loadedDisk, "persistence_mode": mode, "last_diff": m.lastDiff, "privacy": privacy}
	if m.baseline != nil {
		out["baseline_at"] = m.baseline.CapturedAt
		out["objects"] = len(m.baseline.Objects)
		out["startup"] = len(m.baseline.Startup)
		out["background"] = len(m.baseline.Background)
	}
	return out
}

func (a *app) handleBehavior(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, 200, a.behavior.status())
	case http.MethodPost:
		writeJSON(w, 200, a.behavior.capture(a.intel))
	default:
		writeJSON(w, 405, map[string]any{"error": "GET or POST required"})
	}
}
