// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"net/http"
	"runtime"
	"sort"
	"strings"
	"time"
)

// QuickCheck is deliberately read-only. It summarizes existing local evidence
// without creating or updating Behavior, Trust, Persistence, or Safe Action state.
type QuickRecommendation struct {
	Severity string `json:"severity"`
	Title    string `json:"title"`
	Reason   string `json:"reason"`
	View     string `json:"view"`
	CTA      string `json:"cta"`
}

type QuickCheckResult struct {
	GeneratedAt      string                `json:"generated_at"`
	AttentionIndex   int                   `json:"attention_index"`
	Band             string                `json:"band"`
	Security         SecurityReport        `json:"security"`
	DiskPercent      int                   `json:"disk_percent"`
	BehaviorIndex    int                   `json:"behavior_index"`
	BehaviorBand     string                `json:"behavior_band"`
	BehaviorBaseline bool                  `json:"behavior_baseline"`
	TrustIndex       int                   `json:"trust_index"`
	TrustBand        string                `json:"trust_band"`
	TrustProfile     bool                  `json:"trust_profile"`
	PersistenceReady bool                  `json:"persistence_baseline"`
	PersistenceHigh  int                   `json:"persistence_high"`
	ActionHealth     ActionHealth          `json:"action_health"`
	ChangeMonitor    ChangeStatus          `json:"change_monitor"`
	IncidentCount    int                   `json:"incident_count"`
	IncidentHigh     int                   `json:"incident_high"`
	MissingEvidence  []string              `json:"missing_evidence,omitempty"`
	Recommendations  []QuickRecommendation `json:"recommendations"`
	Meaning          string                `json:"meaning"`
}

func attentionBand(v int) string {
	switch {
	case v >= 75:
		return "Elevated"
	case v >= 45:
		return "Review"
	case v >= 20:
		return "Observe"
	default:
		return "Quiet"
	}
}

func (a *app) quickCheck() QuickCheckResult {
	ov := collectOverview()
	sec := buildSecurityReport()
	attachTrustReferences(&sec, a.trust)
	behaviorStatus := a.behavior.status()
	trustStatus := a.trust.status()
	persistence := a.persistence.status()
	actionHealth := a.actions.health()
	changeStatus := ChangeStatus{Mode: "stopped", NativeAvailable: nativeFSEventsAvailable()}
	if a.changes != nil {
		changeStatus = a.changes.status()
	}

	diskPct := 0
	if ov.DiskTotal > 0 {
		diskPct = int(float64(ov.DiskUsed) / float64(ov.DiskTotal) * 100)
	}
	bIndex, bBand, hasBehavior := 0, "Not captured", false
	if v, ok := behaviorStatus["has_baseline"].(bool); ok {
		hasBehavior = v
	}
	if d, ok := behaviorStatus["last_diff"].(BehaviorDiff); ok && d.CurrentAt != "" {
		bIndex, bBand = d.RiskIndex, d.RiskBand
	}
	tIndex, tBand, hasTrust := 0, "Not compared", false
	if v, ok := trustStatus["has_profile"].(bool); ok {
		hasTrust = v
	}
	if d, ok := trustStatus["last_drift"].(TrustDrift); ok && d.ComparedAt != "" {
		tIndex, tBand = d.DriftIndex, d.DriftBand
	}
	highPersistence := 0
	for _, c := range persistence.Changes {
		if strings.EqualFold(c.Severity, "high") {
			highPersistence++
		}
	}

	missing := []string{}
	for _, c := range collectCapabilities() {
		if !c.Available {
			missing = append(missing, c.Name)
		}
	}

	// This is an attention index, not a malware probability. Current security
	// findings dominate; previously captured behavioral/trust drift and
	// persistence changes can raise the review priority but never certify safety.
	idx := sec.Score
	if bIndex > idx {
		idx = bIndex
	}
	if tIndex > idx {
		idx = tIndex
	}
	if highPersistence > 0 && idx < 70 {
		idx = 70
	}
	if !actionHealth.Healthy && idx < 35 {
		idx = 35
	}
	incidentStatus := IncidentStatus{}
	if a.incidents != nil {
		incidentStatus = a.incidents.snapshot(false)
		if incidentStatus.High > 0 && idx < 75 {
			idx = 75
		}
		if incidentStatus.Review > 0 && idx < 45 {
			idx = 45
		}
	}
	if idx > 100 {
		idx = 100
	}

	recs := []QuickRecommendation{}
	if incidentStatus.High > 0 || incidentStatus.Review > 0 {
		recs = append(recs, QuickRecommendation{"review", "Review correlated incidents", fmt.Sprintf("%d high and %d review incident stories combine related evidence into fewer investigations.", incidentStatus.High, incidentStatus.Review), "incidents", "Open incidents"})
	}
	if sec.Score >= 40 {
		recs = append(recs, QuickRecommendation{"review", "Review security findings", fmt.Sprintf("Highest current explainable-risk score is %d.", sec.Score), "security", "Review findings"})
	}
	if diskPct >= 85 {
		recs = append(recs, QuickRecommendation{"review", "Storage is getting full", fmt.Sprintf("Disk usage is about %d%%. Run a bounded storage scan before removing anything.", diskPct), "storage", "Analyze storage"})
	}
	if !hasBehavior {
		recs = append(recs, QuickRecommendation{"info", "Create a behavior baseline when ready", "Behavior Diff cannot compare future changes until you explicitly capture a baseline.", "behavior", "Open Behavior Diff"})
	} else if bIndex >= 30 {
		recs = append(recs, QuickRecommendation{"review", "Behavior changed since the previous baseline", fmt.Sprintf("Latest Evidence Pressure Index is %d (%s).", bIndex, bBand), "behavior", "Review behavior"})
	}
	if !hasTrust {
		recs = append(recs, QuickRecommendation{"info", "Optional: establish a Trusted Profile", "A user-approved reference makes later identity/fingerprint drift easier to interpret. Sentinel will never create this automatically.", "trust", "Open Trust & Drift"})
	} else if tIndex >= 30 {
		recs = append(recs, QuickRecommendation{"review", "Trusted Profile drift deserves review", fmt.Sprintf("Latest Trust Drift Index is %d (%s).", tIndex, tBand), "trust", "Review drift"})
	}
	if !persistence.Initialized {
		recs = append(recs, QuickRecommendation{"info", "Optional: capture persistence configuration", "A session baseline can reveal later LaunchAgent/LaunchDaemon configuration changes.", "persistence", "Open Persistence"})
	} else if len(persistence.Changes) > 0 {
		sev := "review"
		if highPersistence > 0 {
			sev = "high"
		}
		recs = append(recs, QuickRecommendation{sev, "Persistence configuration changed", fmt.Sprintf("%d visible persistence configuration change(s) are present in this session.", len(persistence.Changes)), "persistence", "Review persistence"})
	}
	if !actionHealth.Healthy {
		recs = append(recs, QuickRecommendation{"review", "Safe Actions recovery state needs attention", "Vault/journal self-health found an issue. Review this before performing a reversible file action.", "actions", "Check Safe Actions"})
	}
	if !changeStatus.Running {
		recs = append(recs, QuickRecommendation{"info", "Optional: start a focused change watch", "V2.2 can watch persistence or selected user folders, retain bounded local change history/checkpoints in normal mode, and target reinspection only where changes occurred.", "changes", "Open Change Monitor"})
	} else if changeStatus.NeedsRescan {
		recs = append(recs, QuickRecommendation{"review", "Change stream requires a rescan", "The change monitor observed a dropped/root-changed or budget condition where incremental events should not be treated as complete.", "changes", "Review filesystem changes"})
	}
	if runtime.GOOS == "darwin" && len(missing) > 0 {
		recs = append(recs, QuickRecommendation{"info", "Some evidence sources are unavailable", fmt.Sprintf("%d local evidence source(s) are unavailable. Sentinel will reduce visibility rather than invent results.", len(missing)), "weakness", "Review visibility"})
	}
	if len(recs) == 0 {
		recs = append(recs, QuickRecommendation{"good", "No immediate review step from this snapshot", "No high-priority signal was produced by the bounded read-only quick check. This is not a guarantee that the Mac is malware-free.", "overview", "Return to overview"})
	}

	return QuickCheckResult{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339), AttentionIndex: idx, Band: attentionBand(idx), Security: sec,
		DiskPercent: diskPct, BehaviorIndex: bIndex, BehaviorBand: bBand, BehaviorBaseline: hasBehavior,
		TrustIndex: tIndex, TrustBand: tBand, TrustProfile: hasTrust, PersistenceReady: persistence.Initialized,
		PersistenceHigh: highPersistence, ActionHealth: actionHealth, ChangeMonitor: changeStatus, IncidentCount: incidentStatus.Count, IncidentHigh: incidentStatus.High, MissingEvidence: missing, Recommendations: recs,
		Meaning: "Attention Index is a prioritization aid built from local evidence. It is not a malware probability, safety certificate, or replacement for macOS security controls.",
	}
}

func (a *app) handleQuickCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, a.quickCheck())
}

type UniversalSearchResult struct {
	Kind          string   `json:"kind"`
	Title         string   `json:"title"`
	Subtitle      string   `json:"subtitle"`
	Path          string   `json:"path,omitempty"`
	PID           int      `json:"pid,omitempty"`
	Severity      string   `json:"severity,omitempty"`
	View          string   `json:"view"`
	Score         int      `json:"score"`
	MatchedFields []string `json:"matched_fields,omitempty"`
	WhyMatched    string   `json:"why_matched,omitempty"`
}

type UniversalSearchResponse struct {
	Query       string                  `json:"query"`
	ParsedTerms []string                `json:"parsed_terms,omitempty"`
	Filters     map[string]string       `json:"filters,omitempty"`
	Results     []UniversalSearchResult `json:"results"`
	Note        string                  `json:"note"`
	Help        []string                `json:"help,omitempty"`
}

func containsFold(hay, needle string) bool {
	return strings.Contains(strings.ToLower(hay), strings.ToLower(needle))
}

func (a *app) universalSearch(q string) UniversalSearchResponse {
	return a.powerSearch(q)
}

func (a *app) handleUniversalSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, a.universalSearch(r.URL.Query().Get("q")))
}

type ReviewQueueItem struct {
	Source   string `json:"source"`
	Severity string `json:"severity"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	Path     string `json:"path,omitempty"`
	PID      int    `json:"pid,omitempty"`
	View     string `json:"view"`
}

type ReviewQueue struct {
	GeneratedAt string            `json:"generated_at"`
	Items       []ReviewQueueItem `json:"items"`
	Counts      map[string]int    `json:"counts"`
	Note        string            `json:"note"`
}

func reviewSeverityRank(v string) int {
	switch strings.ToLower(v) {
	case "high", "elevated", "bad":
		return 0
	case "review", "warn", "warning":
		return 1
	default:
		return 2
	}
}

func (a *app) reviewQueue() ReviewQueue {
	q := ReviewQueue{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Items: []ReviewQueueItem{}, Counts: map[string]int{"high": 0, "review": 0, "info": 0}, Note: "The queue merges current bounded evidence for prioritization. Items remain evidence, not malware verdicts."}
	add := func(x ReviewQueueItem) {
		if len(q.Items) >= 100 {
			return
		}
		sev := strings.ToLower(x.Severity)
		if sev == "elevated" || sev == "bad" {
			sev = "high"
		}
		if sev != "high" && sev != "review" {
			sev = "info"
		}
		x.Severity = sev
		q.Counts[sev]++
		q.Items = append(q.Items, x)
	}
	sec := buildSecurityReport()
	attachTrustReferences(&sec, a.trust)
	for _, f := range sec.Findings {
		sev := "review"
		if f.Risk >= 70 {
			sev = "high"
		}
		path := ""
		if len(f.Evidence) > 0 {
			path = f.Evidence[0]
		}
		add(ReviewQueueItem{Source: "security", Severity: sev, Title: f.Name, Detail: fmt.Sprintf("Risk %d · %s", f.Risk, strings.Join(f.Signals, " · ")), Path: path, View: "security"})
	}
	if s := a.behavior.status(); s != nil {
		if d, ok := s["last_diff"].(BehaviorDiff); ok {
			for _, c := range d.Changes {
				if strings.EqualFold(c.Severity, "high") || strings.EqualFold(c.Severity, "review") {
					add(ReviewQueueItem{Source: "behavior", Severity: c.Severity, Title: c.Title, Detail: firstNonEmpty(c.After, c.Before), Path: c.ObjectKey, View: "behavior"})
				}
			}
		}
	}
	if s := a.trust.status(); s != nil {
		if d, ok := s["last_drift"].(TrustDrift); ok {
			for _, c := range d.Changes {
				if strings.EqualFold(c.Severity, "high") || strings.EqualFold(c.Severity, "review") {
					add(ReviewQueueItem{Source: "trust", Severity: c.Severity, Title: c.Title, Detail: firstNonEmpty(c.After, c.Before), Path: c.ObjectKey, View: "trust"})
				}
			}
		}
	}
	for _, c := range a.persistence.status().Changes {
		add(ReviewQueueItem{Source: "persistence", Severity: c.Severity, Title: c.Title, Detail: c.Detail, Path: c.Path, View: "persistence"})
	}
	ah := a.actions.health()
	for _, issue := range ah.Issues {
		add(ReviewQueueItem{Source: "recovery", Severity: "review", Title: "Safe Actions self-health", Detail: issue, View: "actions"})
	}
	if a.changes != nil {
		for _, e := range a.changes.eventsSnapshot(60) {
			sev := strings.ToLower(e.Severity)
			if sev == "info" && !e.NeedsRescan {
				continue
			}
			add(ReviewQueueItem{Source: "changes", Severity: sev, Title: humanChangeTitle(e), Detail: e.Why, Path: e.Path, View: "changes"})
		}
	}
	if a.incidents != nil {
		for _, in := range a.incidents.snapshot(false).Incidents {
			if in.Severity == "high" || in.Severity == "review" {
				add(ReviewQueueItem{Source: "incident", Severity: in.Severity, Title: in.Title, Detail: fmt.Sprintf("Evidence confidence %d%% · %s", in.Confidence, strings.Join(in.Sources, " + ")), Path: in.PrimaryPath, View: "incidents"})
			}
		}
	}

	sort.SliceStable(q.Items, func(i, j int) bool {
		ri, rj := reviewSeverityRank(q.Items[i].Severity), reviewSeverityRank(q.Items[j].Severity)
		if ri != rj {
			return ri < rj
		}
		return q.Items[i].Source < q.Items[j].Source
	})
	return q
}

func (a *app) handleReviewQueue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, a.reviewQueue())
}

type GuidedSnapshotResult struct {
	CapturedAt  string            `json:"captured_at"`
	Behavior    BehaviorDiff      `json:"behavior"`
	Persistence PersistenceStatus `json:"persistence"`
	TrustRan    bool              `json:"trust_ran"`
	Trust       TrustDrift        `json:"trust"`
	GraphNodes  int               `json:"graph_nodes"`
	GraphEdges  int               `json:"graph_edges"`
	Note        string            `json:"note"`
}

func (a *app) guidedSnapshot() GuidedSnapshotResult {
	graph := collectEvidenceGraph()
	a.intel.observe(graph, true)
	b := a.behavior.capture(a.intel)
	p := a.persistence.capture()
	out := GuidedSnapshotResult{CapturedAt: time.Now().UTC().Format(time.RFC3339), Behavior: b, Persistence: p, GraphNodes: len(graph.Nodes), GraphEdges: len(graph.Edges), Note: "Monitoring Snapshot intentionally updates Behavior and Persistence state. Trust is compared only when a user-approved Trusted Profile already exists; Sentinel never creates one automatically."}
	if s := a.trust.status(); s != nil {
		if has, ok := s["has_profile"].(bool); ok && has {
			out.TrustRan = true
			out.Trust = a.trust.compare(a.intel)
		}
	}
	if a.incidents != nil {
		a.rebuildIncidents()
	}
	return out
}

func (a *app) handleGuidedSnapshot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return
	}
	writeJSON(w, http.StatusOK, a.guidedSnapshot())
}
