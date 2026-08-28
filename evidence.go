// SPDX-License-Identifier: MPL-2.0
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type EvidenceNode struct {
	ID      string   `json:"id"`
	Ref     string   `json:"ref,omitempty"`
	Type    string   `json:"type"`
	Label   string   `json:"label"`
	Detail  string   `json:"detail"`
	Risk    int      `json:"risk"`
	Signals []string `json:"signals,omitempty"`
}

type EvidenceEdge struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Relation string `json:"relation"`
	Detail   string `json:"detail,omitempty"`
}

type EvidenceSummary struct {
	Processes int `json:"processes"`
	Files     int `json:"files"`
	Startup   int `json:"startup"`
	Network   int `json:"network"`
	Edges     int `json:"edges"`
	HighRisk  int `json:"high_risk"`
}

type EvidenceGraph struct {
	GeneratedAt string          `json:"generated_at"`
	Nodes       []EvidenceNode  `json:"nodes"`
	Edges       []EvidenceEdge  `json:"edges"`
	Summary     EvidenceSummary `json:"summary"`
	Note        string          `json:"note"`
}

type TimelineEvent struct {
	ID       string `json:"id"`
	At       int64  `json:"at"`
	Kind     string `json:"kind"`
	Severity string `json:"severity"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	ObjectID string `json:"object_id,omitempty"`
}

type StoryFact struct {
	Category string `json:"category"`
	Label    string `json:"label"`
	Value    string `json:"value"`
	Source   string `json:"source"`
	Weight   int    `json:"weight,omitempty"`
}

type StoryRelation struct {
	Kind   string `json:"kind"`
	Target string `json:"target"`
	Detail string `json:"detail"`
}

type ObjectStory struct {
	ObjectType      string                 `json:"object_type"`
	ObjectID        string                 `json:"object_id"`
	Title           string                 `json:"title"`
	Subtitle        string                 `json:"subtitle"`
	Risk            int                    `json:"risk"`
	Summary         string                 `json:"summary"`
	Facts           []StoryFact            `json:"facts"`
	Relations       []StoryRelation        `json:"relations"`
	Timeline        []TimelineEvent        `json:"timeline"`
	BehaviorHistory []BehaviorHistoryEntry `json:"behavior_history,omitempty"`
	TrustContext    TrustObjectContext     `json:"trust_context"`
	Disclaimer      string                 `json:"disclaimer"`
}

type intelligenceManager struct {
	mu          sync.RWMutex
	lastKeys    map[string]EvidenceNode
	events      []TimelineEvent
	initialized bool
}

func newIntelligenceManager() *intelligenceManager {
	now := time.Now().Unix()
	return &intelligenceManager{
		lastKeys: map[string]EvidenceNode{},
		events: []TimelineEvent{{
			ID: entityID("event", fmt.Sprintf("start-%d", now)), At: now, Kind: "session", Severity: "info",
			Title: "Sentinel session started", Detail: "Local observation history begins here. No background daemon is installed.",
		}},
	}
}

func entityID(kind, key string) string {
	s := sha256.Sum256([]byte(kind + "\x00" + key))
	return kind + "-" + hex.EncodeToString(s[:6])
}

func normalizeEvidencePath(p string) string {
	p = strings.TrimSpace(strings.Trim(p, "\"'"))
	if strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			p = filepath.Join(home, strings.TrimPrefix(p, "~/"))
		}
	}
	if p == "" {
		return ""
	}
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	// A bare command name (for example "bash") is not a path relative to Sentinel's
	// working directory. Preserve it rather than inventing a misleading absolute path.
	if !strings.ContainsRune(p, os.PathSeparator) {
		return p
	}
	if abs, err := filepath.Abs(p); err == nil {
		return filepath.Clean(abs)
	}
	return filepath.Clean(p)
}

func processAuditPath(p ProcessInfo) (string, bool) {
	target, script := auditTargetFromCommand(p.Command)
	return normalizeEvidencePath(target), script
}

func buildEvidenceGraph(startups []StartupItem, procs []ProcessInfo, nets []NetworkItem) EvidenceGraph {
	nodes := map[string]EvidenceNode{}
	var edges []EvidenceEdge
	netByPID := map[int][]NetworkItem{}
	for _, n := range nets {
		netByPID[n.PID] = append(netByPID[n.PID], n)
	}
	startupByExe := map[string][]StartupItem{}

	addNode := func(n EvidenceNode) {
		if old, ok := nodes[n.ID]; ok {
			if n.Risk > old.Risk {
				old.Risk = n.Risk
			}
			old.Signals = uniqueStrings(append(old.Signals, n.Signals...))
			if old.Detail == "" {
				old.Detail = n.Detail
			}
			nodes[n.ID] = old
			return
		}
		nodes[n.ID] = n
	}

	for _, s := range startups {
		sid := entityID("startup", s.Path)
		addNode(EvidenceNode{ID: sid, Ref: s.Path, Type: "startup", Label: s.Name, Detail: s.Scope, Risk: s.Risk, Signals: s.Signals})
		exe := normalizeEvidencePath(s.Executable)
		if exe != "" {
			startupByExe[exe] = append(startupByExe[exe], s)
			fr, fs := scorePath(exe)
			if s.Risk > fr {
				fr = s.Risk
			}
			fid := entityID("file", exe)
			addNode(EvidenceNode{ID: fid, Ref: exe, Type: "file", Label: filepath.Base(exe), Detail: exe, Risk: fr, Signals: fs})
			edges = append(edges, EvidenceEdge{From: sid, To: fid, Relation: "launches", Detail: "Startup configuration references this executable"})
		}
	}

	// Keep the graph readable: include processes that are connected, risky, persistent,
	// or among a small top-CPU set.
	for i, p := range procs {
		target, isScript := processAuditPath(p)
		pathRisk, signals := scorePath(target)
		if isScript && pathRisk > 0 {
			signals = append(signals, "Interpreter is executing a script from this location")
		}
		connected := len(netByPID[p.PID]) > 0
		persistent := len(startupByExe[target]) > 0
		if !(connected || persistent || pathRisk > 0 || i < 16) {
			continue
		}
		prisk := pathRisk
		if connected && pathRisk > 0 {
			prisk += 10
			signals = append(signals, "Process has active TCP activity")
		}
		if persistent {
			prisk += 15
			signals = append(signals, "Executable is referenced by a startup item")
		}
		if prisk > 100 {
			prisk = 100
		}
		pid := entityID("process", strconv.Itoa(p.PID))
		label := filepath.Base(target)
		if label == "." || label == "" {
			label = strings.Fields(p.Command)[0]
		}
		addNode(EvidenceNode{ID: pid, Ref: strconv.Itoa(p.PID), Type: "process", Label: label, Detail: fmt.Sprintf("PID %d · %.1f%% CPU", p.PID, p.CPU), Risk: prisk, Signals: signals})
		if target != "" {
			fid := entityID("file", target)
			addNode(EvidenceNode{ID: fid, Ref: target, Type: "file", Label: filepath.Base(target), Detail: target, Risk: pathRisk, Signals: signals})
			edges = append(edges, EvidenceEdge{From: fid, To: pid, Relation: "executes_as", Detail: fmt.Sprintf("PID %d", p.PID)})
		}
		for _, n := range netByPID[p.PID] {
			key := n.State + "|" + n.Address
			nid := entityID("network", key)
			addNode(EvidenceNode{ID: nid, Ref: n.Address, Type: "network", Label: n.State, Detail: n.Address, Risk: 0})
			edges = append(edges, EvidenceEdge{From: pid, To: nid, Relation: "connects_to", Detail: n.Address})
		}
	}

	out := make([]EvidenceNode, 0, len(nodes))
	summary := EvidenceSummary{Edges: len(edges)}
	for _, n := range nodes {
		out = append(out, n)
		switch n.Type {
		case "process":
			summary.Processes++
		case "file":
			summary.Files++
		case "startup":
			summary.Startup++
		case "network":
			summary.Network++
		}
		if n.Risk >= 70 {
			summary.HighRisk++
		}
	}
	typeOrder := map[string]int{"startup": 0, "file": 1, "process": 2, "network": 3}
	sort.Slice(out, func(i, j int) bool {
		if typeOrder[out[i].Type] != typeOrder[out[j].Type] {
			return typeOrder[out[i].Type] < typeOrder[out[j].Type]
		}
		if out[i].Risk != out[j].Risk {
			return out[i].Risk > out[j].Risk
		}
		return out[i].Label < out[j].Label
	})
	return EvidenceGraph{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Nodes: out, Edges: edges, Summary: summary, Note: "Evidence is correlated locally from startup configuration, process metadata, executable/script paths, and current TCP activity. Correlation is not proof of malware."}
}

func uniqueStrings(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

func (m *intelligenceManager) observe(graph EvidenceGraph, record bool) {
	if !record {
		return
	}
	now := time.Now().Unix()
	current := map[string]EvidenceNode{}
	for _, n := range graph.Nodes {
		current[n.ID] = n
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.initialized {
		m.initialized = true
		m.lastKeys = current
		m.appendEventLocked(TimelineEvent{ID: entityID("event", fmt.Sprintf("baseline-%d", now)), At: now, Kind: "snapshot", Severity: "info", Title: "Observation baseline captured", Detail: fmt.Sprintf("%d evidence objects are now being compared within this Sentinel session.", len(current))})
		return
	}
	for id, n := range current {
		if _, ok := m.lastKeys[id]; !ok {
			sev := "info"
			if n.Risk >= 70 {
				sev = "high"
			} else if n.Risk >= 35 {
				sev = "review"
			}
			m.appendEventLocked(TimelineEvent{ID: entityID("event", fmt.Sprintf("add-%s-%d", id, now)), At: now, Kind: "observed", Severity: sev, Title: "New object observed: " + n.Label, Detail: n.Type + " · " + n.Detail, ObjectID: id})
		}
	}
	for id, n := range m.lastKeys {
		if _, ok := current[id]; !ok {
			// Only process/network disappearance is meaningful in a short-lived observation session.
			if n.Type == "process" || n.Type == "network" {
				m.appendEventLocked(TimelineEvent{ID: entityID("event", fmt.Sprintf("gone-%s-%d", id, now)), At: now, Kind: "ended", Severity: "info", Title: "Object no longer observed: " + n.Label, Detail: n.Type + " · " + n.Detail, ObjectID: id})
			}
		}
	}
	m.lastKeys = current
}

func (m *intelligenceManager) appendExternalEvent(e TimelineEvent) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.appendEventLocked(e)
}

func (m *intelligenceManager) appendEventLocked(e TimelineEvent) {
	m.events = append(m.events, e)
	if len(m.events) > 160 {
		m.events = append([]TimelineEvent(nil), m.events[len(m.events)-160:]...)
	}
}

func (m *intelligenceManager) timeline(limit int) []TimelineEvent {
	if limit <= 0 || limit > 160 {
		limit = 80
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	start := len(m.events) - limit
	if start < 0 {
		start = 0
	}
	out := append([]TimelineEvent(nil), m.events[start:]...)
	sort.Slice(out, func(i, j int) bool { return out[i].At > out[j].At })
	return out
}

func (m *intelligenceManager) eventsForObject(id string) []TimelineEvent {
	all := m.timeline(160)
	out := make([]TimelineEvent, 0)
	for _, e := range all {
		if e.ObjectID == id {
			out = append(out, e)
		}
	}
	return out
}

func collectEvidenceGraph() EvidenceGraph {
	startups := collectStartupItems()
	procs := parsePS(120)
	nets, _ := collectNetwork()
	return buildEvidenceGraph(startups, procs, nets)
}

func (a *app) handleIntelligenceGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "GET or POST required"})
		return
	}
	graph := collectEvidenceGraph()
	a.intel.observe(graph, r.Method == http.MethodPost)
	writeJSON(w, 200, graph)
}

func (a *app) handleTimeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	writeJSON(w, 200, map[string]any{"events": a.intel.timeline(limit), "session_only": true, "note": "Timeline history exists only for the current Sentinel session. Sentinel v1.0 does not install a background daemon. Behavior Baseline persistence is compact app-owned metadata, not continuous monitoring."})
}

func (a *app) handleObjectStory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	if raw := r.URL.Query().Get("pid"); raw != "" {
		pid, err := strconv.Atoi(raw)
		if err != nil || pid <= 0 {
			writeJSON(w, 400, map[string]any{"error": "invalid pid"})
			return
		}
		story, err := a.processStory(pid)
		if err != nil {
			writeJSON(w, 404, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, 200, story)
		return
	}
	if p := r.URL.Query().Get("path"); p != "" {
		story, err := a.fileStory(p)
		if err != nil {
			writeJSON(w, 404, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, 200, story)
		return
	}
	writeJSON(w, 400, map[string]any{"error": "pid or path is required"})
}

func (a *app) processStory(pid int) (ObjectStory, error) {
	var p *ProcessInfo
	for _, x := range parsePS(100000) {
		if x.PID == pid {
			cp := x
			p = &cp
			break
		}
	}
	if p == nil {
		return ObjectStory{}, fmt.Errorf("process not found")
	}
	rawTarget, script := auditTargetFromCommand(p.Command)
	target := normalizeEvidencePath(rawTarget)
	if !script {
		target = normalizeEvidencePath(executablePathForPID(pid, p.Command))
	}
	risk, signals := scorePath(target)
	facts := []StoryFact{
		{Category: "process", Label: "PID", Value: strconv.Itoa(p.PID), Source: "ps"},
		{Category: "process", Label: "Parent PID", Value: strconv.Itoa(p.PPID), Source: "ps"},
		{Category: "process", Label: "CPU", Value: fmt.Sprintf("%.1f%%", p.CPU), Source: "ps"},
		{Category: "process", Label: "Memory", Value: fmt.Sprintf("%.1f%%", p.Memory), Source: "ps"},
		{Category: "identity", Label: "Audit target", Value: target, Source: "process command + interpreter resolution"},
	}
	if script {
		facts = append(facts, StoryFact{Category: "identity", Label: "Execution type", Value: "Interpreter script", Source: "command parsing"})
	}
	identity := inspectCodeIdentity(target)
	sig := identity.Verification
	facts = append(facts, StoryFact{Category: "security", Label: "Code signature", Value: sig, Source: "codesign"})
	if identity.Identifier != "" {
		facts = append(facts, StoryFact{Category: "identity", Label: "Code identifier", Value: identity.Identifier, Source: "codesign -dv"})
	}
	if identity.TeamID != "" {
		facts = append(facts, StoryFact{Category: "identity", Label: "Team ID", Value: identity.TeamID, Source: "codesign -dv"})
	}
	if len(identity.Authorities) > 0 {
		facts = append(facts, StoryFact{Category: "identity", Label: "Signing authority", Value: strings.Join(identity.Authorities, " → "), Source: "codesign -dv"})
	}
	if identity.Gatekeeper != "" {
		facts = append(facts, StoryFact{Category: "security", Label: "Gatekeeper", Value: identity.Gatekeeper, Source: "spctl --assess"})
	}
	if identity.BundlePath != "" {
		facts = append(facts, StoryFact{Category: "identity", Label: "App bundle", Value: identity.BundlePath, Source: "path resolution"})
	}
	if (sig == "Unsigned / unverifiable" || sig == "Signature present but verification failed") && !script {
		risk += 15
		signals = append(signals, "Executable could not be cleanly verified by macOS code signing")
		facts = append(facts, StoryFact{Category: "security", Label: "Unsigned evidence", Value: "Needs context; unsigned does not mean malware", Source: "codesign", Weight: 15})
	}
	var relations []StoryRelation
	for _, parent := range processParentChain(pid, 8) {
		relations = append(relations, StoryRelation{Kind: "parent_process", Target: fmt.Sprintf("PID %d", parent.PID), Detail: parent.Command})
	}
	startups := collectStartupItems()
	for _, s := range startups {
		if normalizeEvidencePath(s.Executable) == target && target != "" {
			risk += 15
			signals = append(signals, "Executable is referenced by a startup item")
			relations = append(relations, StoryRelation{Kind: "launched_by", Target: s.Name, Detail: s.Path})
		}
	}
	nets, _ := collectNetwork()
	for _, n := range nets {
		if n.PID == pid {
			detail := n.State
			if n.EndpointClass != "" {
				detail += " · " + n.EndpointClass
			}
			relations = append(relations, StoryRelation{Kind: "connects_to", Target: n.Address, Detail: detail})
		}
	}
	if len(relations) > 0 && risk > 0 {
		for _, rel := range relations {
			if rel.Kind == "connects_to" {
				risk += 10
				signals = append(signals, "Process has active TCP activity")
				break
			}
		}
	}
	if risk > 100 {
		risk = 100
	}
	id := entityID("process", strconv.Itoa(pid))
	summary := "No path-based review signals were produced."
	if len(signals) > 0 {
		summary = strings.Join(uniqueStrings(signals), " · ")
	}
	return ObjectStory{ObjectType: "process", ObjectID: id, Title: filepath.Base(target), Subtitle: fmt.Sprintf("PID %d · %s", pid, p.User), Risk: risk, Summary: summary, Facts: facts, Relations: relations, Timeline: a.intel.eventsForObject(id), BehaviorHistory: a.behavior.historyForObject(target, 12), TrustContext: a.trust.objectContext(target), Disclaimer: "Evidence is heuristic and local. A review signal is not a malware diagnosis."}, nil
}

func (a *app) fileStory(raw string) (ObjectStory, error) {
	path := normalizeEvidencePath(raw)
	if path == "" {
		return ObjectStory{}, fmt.Errorf("invalid path")
	}
	info, statErr := os.Stat(path)
	risk, signals := scorePath(path)
	facts := []StoryFact{{Category: "identity", Label: "Path", Value: path, Source: "requested object"}}
	if statErr == nil {
		facts = append(facts,
			StoryFact{Category: "file", Label: "Size", Value: fmt.Sprintf("%d bytes", info.Size()), Source: "os.Stat"},
			StoryFact{Category: "file", Label: "Modified", Value: info.ModTime().Format(time.RFC3339), Source: "os.Stat"},
		)
		if !info.IsDir() {
			identity := inspectCodeIdentity(path)
			sig := identity.Verification
			facts = append(facts, StoryFact{Category: "security", Label: "Code signature", Value: sig, Source: "codesign"})
			if identity.Identifier != "" {
				facts = append(facts, StoryFact{Category: "identity", Label: "Code identifier", Value: identity.Identifier, Source: "codesign -dv"})
			}
			if identity.TeamID != "" {
				facts = append(facts, StoryFact{Category: "identity", Label: "Team ID", Value: identity.TeamID, Source: "codesign -dv"})
			}
			if len(identity.Authorities) > 0 {
				facts = append(facts, StoryFact{Category: "identity", Label: "Signing authority", Value: strings.Join(identity.Authorities, " → "), Source: "codesign -dv"})
			}
			if identity.Gatekeeper != "" {
				facts = append(facts, StoryFact{Category: "security", Label: "Gatekeeper", Value: identity.Gatekeeper, Source: "spctl --assess"})
			}
			if identity.BundlePath != "" {
				facts = append(facts, StoryFact{Category: "identity", Label: "App bundle", Value: identity.BundlePath, Source: "path resolution"})
			}
			if (sig == "Unsigned / unverifiable" || sig == "Signature present but verification failed") && risk > 0 {
				risk += 15
				signals = append(signals, "File could not be cleanly verified by macOS code signing")
			}
		}
	} else {
		facts = append(facts, StoryFact{Category: "file", Label: "Current status", Value: "Not currently accessible", Source: "os.Stat"})
	}

	var relations []StoryRelation
	startup := collectStartupItems()
	for _, s := range startup {
		if normalizeEvidencePath(s.Executable) == path {
			relations = append(relations, StoryRelation{Kind: "referenced_by_startup", Target: s.Name, Detail: s.Path})
			risk += 15
			signals = append(signals, "File is referenced by a startup item")
		}
	}
	nets, _ := collectNetwork()
	netByPID := map[int][]NetworkItem{}
	for _, n := range nets {
		netByPID[n.PID] = append(netByPID[n.PID], n)
	}
	for _, p := range parsePS(100000) {
		target, _ := processAuditPath(p)
		if target != path {
			continue
		}
		relations = append(relations, StoryRelation{Kind: "running_as", Target: fmt.Sprintf("PID %d", p.PID), Detail: p.Command})
		for _, n := range netByPID[p.PID] {
			relations = append(relations, StoryRelation{Kind: "network_via_process", Target: n.Address, Detail: fmt.Sprintf("PID %d · %s", p.PID, n.State)})
		}
	}
	if storage := a.jobs.latestResult(); storage != nil {
		for _, g := range storage.Duplicates {
			found := false
			for _, f := range g.Files {
				if normalizeEvidencePath(f.Path) == path {
					found = true
					break
				}
			}
			if found {
				relations = append(relations, StoryRelation{Kind: "exact_duplicate", Target: fmt.Sprintf("%d-file SHA-256 group", len(g.Files)), Detail: g.SHA256})
				facts = append(facts, StoryFact{Category: "storage", Label: "Exact duplicate group", Value: fmt.Sprintf("%d copies · %d bytes potential duplicate footprint", len(g.Files), g.Waste), Source: "local SHA-256"})
			}
		}
		for _, fam := range storage.Families {
			for _, f := range fam.Files {
				if normalizeEvidencePath(f.Path) == path {
					relations = append(relations, StoryRelation{Kind: "version_family", Target: fam.Key, Detail: fmt.Sprintf("%d related filenames", len(fam.Files))})
					break
				}
			}
		}
	}
	if risk > 100 {
		risk = 100
	}
	id := entityID("file", path)
	summary := "No path-based review signals were produced."
	if len(signals) > 0 {
		summary = strings.Join(uniqueStrings(signals), " · ")
	}
	return ObjectStory{ObjectType: "file", ObjectID: id, Title: filepath.Base(path), Subtitle: path, Risk: risk, Summary: summary, Facts: facts, Relations: relations, Timeline: a.intel.eventsForObject(id), BehaviorHistory: a.behavior.historyForObject(path, 12), TrustContext: a.trust.objectContext(path), Disclaimer: "Relationships are evidence for review, not proof that the file is harmful or safe."}, nil
}
