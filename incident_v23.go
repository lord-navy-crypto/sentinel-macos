// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"sort"
	"strings"
)

// IncidentEpisodeSummaryV23 reconstructs bounded correlation episodes from the
// retained evidence already stored on an object-centered incident story. It is
// an analytical view only; the incident-history persistence format remains
// unchanged so v2.3 migration/rollback behavior is not widened by this layer.
type IncidentEpisodeSummaryV23 struct {
	EpisodeID       string   `json:"episode_id"`
	StartedAt       int64    `json:"started_at"`
	EndedAt         int64    `json:"ended_at"`
	DurationSeconds int64    `json:"duration_seconds"`
	Severity        string   `json:"severity"`
	Confidence      int      `json:"confidence"`
	ConfidenceBand  string   `json:"confidence_band"`
	Sources         []string `json:"sources"`
	EvidenceKinds   []string `json:"evidence_kinds"`
	Paths           []string `json:"paths,omitempty"`
	Occurrences     int      `json:"occurrences"`
}

// IncidentEvolutionV23 compares the two newest retained episodes of the same
// stable object-centered story. Direction describes review-intensity change,
// never maliciousness or intent.
type IncidentEvolutionV23 struct {
	EpisodeCount       int      `json:"episode_count"`
	FirstEpisodeAt     int64    `json:"first_episode_at,omitempty"`
	LastEpisodeAt      int64    `json:"last_episode_at,omitempty"`
	LatestDirection    string   `json:"latest_direction"`
	AddedSources       []string `json:"added_sources,omitempty"`
	RemovedSources     []string `json:"removed_sources,omitempty"`
	AddedEvidenceKinds []string `json:"added_evidence_kinds,omitempty"`
	RemovedEvidenceKinds []string `json:"removed_evidence_kinds,omitempty"`
	AddedPaths         []string `json:"added_paths,omitempty"`
	RemovedPaths       []string `json:"removed_paths,omitempty"`
	ConfidenceDelta    int      `json:"confidence_delta,omitempty"`
	GapSeconds         int64    `json:"gap_seconds,omitempty"`
	Summary            string   `json:"summary"`
	Limitations        []string `json:"limitations,omitempty"`
}

// IncidentV23View is the non-destructive v2.3 representation used while the
// branch evolves. It wraps the existing Incident contract instead of breaking
// v2.2 clients, and adds explainability, investigation-timeline, and evolution
// layers required by the deeper investigation UI/API.
type IncidentV23View struct {
	Incident    Incident                     `json:"incident"`
	Timeline    []InvestigationTimelineEvent `json:"timeline"`
	Explanation IncidentExplanation          `json:"explanation"`
	Episodes    []IncidentEpisodeSummaryV23  `json:"episodes,omitempty"`
	Evolution   IncidentEvolutionV23         `json:"evolution"`
}

func incidentEpisodeSets(rows []IncidentEvidence) (sources, kinds, paths []string, severity string) {
	sourceSet, kindSet, pathSet := map[string]bool{}, map[string]bool{}, map[string]bool{}
	severity = "info"
	for _, e := range rows {
		if s := strings.TrimSpace(e.Source); s != "" { sourceSet[s] = true }
		if k := strings.TrimSpace(e.Kind); k != "" { kindSet[k] = true }
		if p := canonicalIncidentPath(e.Path); p != "" { pathSet[p] = true }
		if incidentRank(e.Severity) < incidentRank(severity) { severity = e.Severity }
	}
	for s := range sourceSet { sources = append(sources, s) }
	for k := range kindSet { kinds = append(kinds, k) }
	for p := range pathSet { paths = append(paths, p) }
	sort.Strings(sources); sort.Strings(kinds); sort.Strings(paths)
	return
}

func incidentEpisodeSummaryV23(story Incident, rows []IncidentEvidence) IncidentEpisodeSummaryV23 {
	if len(rows) == 0 { return IncidentEpisodeSummaryV23{} }
	sorted := append([]IncidentEvidence(nil), rows...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].At < sorted[j].At })
	sources, kinds, paths, severity := incidentEpisodeSets(sorted)
	first, last := sorted[0].At, sorted[len(sorted)-1].At
	out := IncidentEpisodeSummaryV23{
		StartedAt:first, EndedAt:last, DurationSeconds:maxInt64(0,last-first), Severity:severity,
		Sources:sources, EvidenceKinds:kinds, Paths:paths, Occurrences:len(sorted), ConfidenceBand:"not_scored",
	}
	if reconstructed, ok := incidentFromCluster(story.PrimaryPath, sorted); ok {
		out.EpisodeID = reconstructed.ID
		out.Severity = reconstructed.Severity
		out.Confidence = reconstructed.Confidence
		out.ConfidenceBand = reconstructed.ConfidenceBand
	} else {
		out.EpisodeID = entityID("incident-episode-v23", fmt.Sprintf("%s|%d|%d|%s", stableIncidentStoryKey(story), first, last, strings.Join(sources, ",")))
	}
	return out
}

func maxInt64(a,b int64) int64 { if a>b{return a};return b }

func incidentStringSetDiff(before, after []string) (added, removed []string) {
	bm, am := map[string]bool{}, map[string]bool{}
	for _, x := range before { bm[x] = true }
	for _, x := range after { am[x] = true }
	for x := range am { if !bm[x] { added = append(added, x) } }
	for x := range bm { if !am[x] { removed = append(removed, x) } }
	sort.Strings(added); sort.Strings(removed)
	return
}

func BuildIncidentEvolutionV23(in Incident) ([]IncidentEpisodeSummaryV23, IncidentEvolutionV23) {
	rows := append([]IncidentEvidence(nil), in.Evidence...)
	clusters := incidentClusters(rows)
	episodes := make([]IncidentEpisodeSummaryV23,0,len(clusters))
	for _, cluster := range clusters {
		if ep := incidentEpisodeSummaryV23(in, cluster); ep.Occurrences > 0 { episodes = append(episodes, ep) }
	}
	out := IncidentEvolutionV23{
		EpisodeCount:len(episodes), LatestDirection:"single-episode",
		Summary:"Only one retained correlation episode is available for this story.",
		Limitations:[]string{"Episodes are reconstructed from bounded retained incident evidence. Older evidence outside retention cannot be recovered by this view.", "Direction means review-intensity change between retained episodes; it is not malware probability or intent."},
	}
	if len(episodes)==0 {
		out.LatestDirection="no-evidence"
		out.Summary="No retained evidence is available to reconstruct an episode."
		return episodes,out
	}
	out.FirstEpisodeAt=episodes[0].StartedAt; out.LastEpisodeAt=episodes[len(episodes)-1].EndedAt
	if len(episodes)==1 { return episodes,out }
	prev, cur := episodes[len(episodes)-2], episodes[len(episodes)-1]
	out.AddedSources,out.RemovedSources=incidentStringSetDiff(prev.Sources,cur.Sources)
	out.AddedEvidenceKinds,out.RemovedEvidenceKinds=incidentStringSetDiff(prev.EvidenceKinds,cur.EvidenceKinds)
	out.AddedPaths,out.RemovedPaths=incidentStringSetDiff(prev.Paths,cur.Paths)
	out.ConfidenceDelta=cur.Confidence-prev.Confidence
	if cur.StartedAt>prev.EndedAt { out.GapSeconds=cur.StartedAt-prev.EndedAt }
	prevRank,curRank:=incidentRank(prev.Severity),incidentRank(cur.Severity)
	switch {
	case curRank<prevRank:
		out.LatestDirection="escalated"
	case curRank>prevRank:
		out.LatestDirection="deescalated"
	case len(out.AddedSources)+len(out.RemovedSources)+len(out.AddedEvidenceKinds)+len(out.RemovedEvidenceKinds)+len(out.AddedPaths)+len(out.RemovedPaths)>0 || out.ConfidenceDelta!=0:
		out.LatestDirection="changed"
	default:
		out.LatestDirection="stable"
	}
	out.Summary=fmt.Sprintf("Latest retained episode is %s versus the previous episode: severity %s → %s, confidence delta %+d, source changes +%d/-%d, evidence-kind changes +%d/-%d.",out.LatestDirection,prev.Severity,cur.Severity,out.ConfidenceDelta,len(out.AddedSources),len(out.RemovedSources),len(out.AddedEvidenceKinds),len(out.RemovedEvidenceKinds))
	return episodes,out
}

func EnrichIncidentV23(in Incident) IncidentV23View {
	episodes,evolution:=BuildIncidentEvolutionV23(in)
	return IncidentV23View{
		Incident: in,
		Timeline: IncidentInvestigationTimeline(in),
		Explanation: BuildIncidentExplanation(in),
		Episodes: episodes,
		Evolution: evolution,
	}
}
