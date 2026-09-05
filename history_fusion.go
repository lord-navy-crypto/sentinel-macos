// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

const (
	historyFusionMarker            = "Sentinel 2.8 History Fusion / What Changed"
	historyFusionObservationLimit  = 240
	historyFusionCorrelationLimit  = 40
	historyFusionCorrelationWindow = 5 * time.Minute
)

type HistoryFusionSourceStatus struct {
	Source     string `json:"source"`
	Available  bool   `json:"available"`
	Count      int    `json:"count"`
	Persistent bool   `json:"persistent"`
	Partial    bool   `json:"partial,omitempty"`
	LatestAt   string `json:"latest_at,omitempty"`
	Note       string `json:"note,omitempty"`
}

type HistoryFusionObservation struct {
	ID       string `json:"id"`
	At       int64  `json:"at"`
	Source   string `json:"source"`
	Kind     string `json:"kind"`
	Label    string `json:"label"`
	Detail   string `json:"detail,omitempty"`
	Path     string `json:"path,omitempty"`
	Severity string `json:"severity,omitempty"`
	Partial  bool   `json:"partial,omitempty"`
}

type HistoryFusionCorrelation struct {
	ID       string   `json:"id"`
	FirstAt  int64    `json:"first_at"`
	LastAt   int64    `json:"last_at"`
	Sources  []string `json:"sources"`
	EventIDs []string `json:"event_ids"`
	Summary  string   `json:"summary"`
	Boundary string   `json:"boundary"`
}

type WhatChangedResponse struct {
	Marker         string                     `json:"marker"`
	GeneratedAt    string                     `json:"generated_at"`
	Hours          int                        `json:"hours"`
	WindowStart    string                     `json:"window_start"`
	Sources        []HistoryFusionSourceStatus `json:"sources"`
	Observed       []HistoryFusionObservation `json:"observed"`
	Correlated     []HistoryFusionCorrelation `json:"correlated"`
	Interpretation []string                   `json:"interpretation"`
	NotEstablished []string                   `json:"not_established"`
	Limitations    []string                   `json:"limitations,omitempty"`
	Note           string                     `json:"note"`
}

func parseHistoryTime(raw string) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(raw))
	if err != nil {
		t, err = time.Parse(time.RFC3339, strings.TrimSpace(raw))
	}
	return t, err == nil
}

func historyAbs64(v int64) uint64 {
	if v >= 0 {
		return uint64(v)
	}
	return uint64(-(v + 1)) + 1
}

func historyObservationID(source, kind string, at int64, path, detail string) string {
	return entityID("history-fusion", fmt.Sprintf("%s|%s|%d|%s|%s", source, kind, at, path, detail))
}

func appendHistoryObservation(dst *[]HistoryFusionObservation, row HistoryFusionObservation) {
	if row.At <= 0 || strings.TrimSpace(row.Source) == "" {
		return
	}
	if row.ID == "" {
		row.ID = historyObservationID(row.Source, row.Kind, row.At, row.Path, row.Detail)
	}
	*dst = append(*dst, row)
}

func loadPersistentFusionResourceSamples(cutoff time.Time) ([]resourceSample, bool, error) {
	_, historyPath, err := maintenanceHistoryPaths()
	if err != nil {
		return nil, false, err
	}
	f, err := os.Open(historyPath)
	if os.IsNotExist(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, true, err
	}
	defer f.Close()

	rows := make([]resourceSample, 0, 512)
	scanner := bufio.NewScanner(io.LimitReader(f, 16*1024*1024))
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		var sample resourceSample
		if json.Unmarshal(scanner.Bytes(), &sample) == nil && !sample.CapturedAt.Before(cutoff) {
			rows = append(rows, sample)
			if len(rows) >= 5000 {
				break
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return rows, true, err
	}
	return rows, true, nil
}

func mergeFusionResourceSamples(memory, disk []resourceSample) []resourceSample {
	byTime := map[string]resourceSample{}
	for _, sample := range append(append([]resourceSample(nil), disk...), memory...) {
		if sample.CapturedAt.IsZero() {
			continue
		}
		byTime[sample.CapturedAt.UTC().Format(time.RFC3339Nano)] = sample
	}
	out := make([]resourceSample, 0, len(byTime))
	for _, sample := range byTime {
		out = append(out, sample)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CapturedAt.Before(out[j].CapturedAt) })
	return out
}

func resourceFusionObservation(samples []resourceSample) (HistoryFusionObservation, bool) {
	if len(samples) < 2 {
		return HistoryFusionObservation{}, false
	}
	first, last := samples[0], samples[len(samples)-1]
	detail := fmt.Sprintf("CPU %.1f%% → %.1f%% · memory free %d%% → %d%% · swap %d → %d bytes across %d retained samples.", first.CPUPercent, last.CPUPercent, first.MemoryFreePct, last.MemoryFreePct, first.SwapUsedBytes, last.SwapUsedBytes, len(samples))
	return HistoryFusionObservation{
		At: last.CapturedAt.Unix(), Source: "resource", Kind: "resource_window_delta", Label: "Resource state changed across retained samples", Detail: detail,
	}, true
}

func storageFusionObservations(history *storageHistoryManager, cutoff time.Time) ([]HistoryFusionObservation, HistoryFusionSourceStatus, []string) {
	status := HistoryFusionSourceStatus{Source: "storage", Persistent: history != nil && history.persistent, Note: "Explicit completed storage scans only; no scan is started by What Changed."}
	if history == nil {
		return nil, status, nil
	}
	snapshots := history.list()
	for _, snapshot := range snapshots {
		if time.Unix(snapshot.CreatedAt, 0).Before(cutoff) {
			continue
		}
		status.Count++
		status.LatestAt = time.Unix(snapshot.CreatedAt, 0).UTC().Format(time.RFC3339)
	}
	status.Available = len(snapshots) > 0
	if len(snapshots) < 2 {
		return nil, status, nil
	}
	before, after := snapshots[len(snapshots)-2], snapshots[len(snapshots)-1]
	if time.Unix(after.CreatedAt, 0).Before(cutoff) {
		return nil, status, nil
	}
	cmp := CompareStorageSnapshots(before, after)
	rows := []HistoryFusionObservation{{
		At: after.CreatedAt, Source: "storage", Kind: "storage_snapshot_delta", Label: "Visible storage changed between explicit scans",
		Detail: fmt.Sprintf("Visible bytes %d → %d (delta %+d).", cmp.BeforeBytes, cmp.AfterBytes, cmp.DeltaBytes), Partial: cmp.Partial,
	}}
	for i, delta := range cmp.DirectoryChanges {
		if i >= 8 {
			break
		}
		rows = append(rows, HistoryFusionObservation{
			At: after.CreatedAt, Source: "storage", Kind: "storage_directory_delta", Label: delta.Name,
			Detail: fmt.Sprintf("%d → %d bytes (delta %+d); files %d → %d.", delta.BeforeBytes, delta.AfterBytes, delta.DeltaBytes, delta.BeforeFiles, delta.AfterFiles), Partial: cmp.Partial,
		})
	}
	status.Partial = cmp.Partial
	return rows, status, append([]string(nil), cmp.Limitations...)
}

func networkFusionObservations(history *networkHistoryManager, cutoff time.Time) ([]HistoryFusionObservation, HistoryFusionSourceStatus) {
	status := HistoryFusionSourceStatus{Source: "network", Persistent: history != nil && history.persistent, Note: "Snapshot differences describe presence/absence between explicit observations, not exact connection start/end time."}
	if history == nil {
		return nil, status
	}
	snapshots := history.list()
	status.Available = len(snapshots) > 0
	for _, snapshot := range snapshots {
		if at, ok := parseHistoryTime(snapshot.CapturedAt); ok && !at.Before(cutoff) {
			status.Count++
			if status.LatestAt == "" {
				status.LatestAt = at.UTC().Format(time.RFC3339)
			}
		}
	}
	if len(snapshots) < 2 {
		return nil, status
	}
	latest, previous := snapshots[0], snapshots[1]
	at, ok := parseHistoryTime(latest.CapturedAt)
	if !ok || at.Before(cutoff) {
		return nil, status
	}
	diff := diffNetworkHistory(previous, latest)
	rows := []HistoryFusionObservation{{
		At: at.Unix(), Source: "network", Kind: "network_snapshot_delta", Label: "Network relationships differed between snapshots",
		Detail: fmt.Sprintf("%d newly present · %d absent in latest explicit snapshot. Exact start/end times are not established.", len(diff.Added), len(diff.Ended)),
	}}
	for i, relation := range diff.Added {
		if i >= 5 {
			break
		}
		rows = append(rows, HistoryFusionObservation{At: at.Unix(), Source: "network", Kind: "network_relation_present", Label: relation.Process, Detail: relation.State + " · " + relation.EndpointClass + " · " + relation.Endpoint})
	}
	return rows, status
}

func behaviorFusionObservations(a *app, cutoff time.Time) ([]HistoryFusionObservation, HistoryFusionSourceStatus) {
	status := HistoryFusionSourceStatus{Source: "behavior", Note: "Behavior evidence index is a bounded review-priority signal, not malware probability."}
	if a == nil || a.behavior == nil {
		return nil, status
	}
	history := a.behavior.historySnapshot(behaviorHistoryLimit, "")
	status.Persistent = history.Persistent
	status.Available = history.Count > 0
	rows := []HistoryFusionObservation{}
	for _, entry := range history.Entries {
		at, ok := parseHistoryTime(entry.CapturedAt)
		if !ok || at.Before(cutoff) {
			continue
		}
		status.Count++
		status.LatestAt = at.UTC().Format(time.RFC3339)
		appendHistoryObservation(&rows, HistoryFusionObservation{
			ID: entry.ID, At: at.Unix(), Source: "behavior", Kind: "behavior_diff", Label: "Behavior comparison · " + entry.RiskBand,
			Detail: fmt.Sprintf("Evidence index %d (%+d from previous retained comparison) · %d recorded change(s).", entry.RiskIndex, entry.RiskDelta, len(entry.Changes)), Severity: entry.RiskBand,
		})
	}
	return rows, status
}

func trustFusionObservations(a *app, cutoff time.Time) ([]HistoryFusionObservation, HistoryFusionSourceStatus) {
	status := HistoryFusionSourceStatus{Source: "trust", Note: "Trust drift is comparison evidence against the profile active at that time, not a safety verdict."}
	if a == nil || a.trust == nil {
		return nil, status
	}
	history := a.trust.historySnapshot(trustHistoryLimit)
	status.Persistent = history.Persistent
	status.Available = history.Count > 0
	rows := []HistoryFusionObservation{}
	for _, entry := range history.Entries {
		at, ok := parseHistoryTime(entry.ComparedAt)
		if !ok || at.Before(cutoff) {
			continue
		}
		status.Count++
		status.LatestAt = at.UTC().Format(time.RFC3339)
		appendHistoryObservation(&rows, HistoryFusionObservation{
			ID: entry.ID, At: at.Unix(), Source: "trust", Kind: "trust_drift", Label: "Reference comparison · " + entry.DriftBand,
			Detail: fmt.Sprintf("Drift index %d · profile coverage %d%% · %d recorded change(s).", entry.DriftIndex, entry.ProfileCoverage, len(entry.Changes)), Severity: entry.DriftBand,
		})
	}
	return rows, status
}

func filesystemFusionObservations(a *app, cutoff time.Time) ([]HistoryFusionObservation, HistoryFusionSourceStatus, []string) {
	status := HistoryFusionSourceStatus{Source: "filesystem", Note: "Retained FSEvents/polling evidence is bounded to configured watch roots and continuity state."}
	if a == nil || a.changes == nil {
		return nil, status, nil
	}
	changeStatus := a.changes.status()
	status.Persistent = changeStatus.PersistentHistory
	status.Available = changeStatus.HistoryEntries > 0 || changeStatus.EventCount > 0
	status.Partial = changeStatus.NeedsRescan || changeStatus.DroppedSignals > 0 || !changeStatus.PersistenceHealthy
	limitations := []string{}
	if changeStatus.NeedsRescan {
		limitations = append(limitations, "Filesystem change continuity requires a rescan; retained events must not be interpreted as complete coverage.")
	}
	if changeStatus.DroppedSignals > 0 {
		limitations = append(limitations, fmt.Sprintf("Filesystem watcher reported %d dropped signal(s).", changeStatus.DroppedSignals))
	}
	if !changeStatus.PersistenceHealthy && changeStatus.LastPersistError != "" {
		limitations = append(limitations, "Filesystem history persistence reported an error: "+changeStatus.LastPersistError)
	}

	merged := map[string]ChangeEvent{}
	for _, event := range append(a.changes.historySnapshot(500), a.changes.eventsSnapshot(500)...) {
		key := firstNonEmpty(event.ID, fmt.Sprintf("%d|%s|%s", event.At, event.Kind, event.Path))
		merged[key] = event
	}
	rows := []HistoryFusionObservation{}
	for _, event := range merged {
		if event.At <= 0 || time.Unix(event.At, 0).Before(cutoff) {
			continue
		}
		status.Count++
		if status.LatestAt == "" || event.At > func() int64 { t, _ := parseHistoryTime(status.LatestAt); return t.Unix() }() {
			status.LatestAt = time.Unix(event.At, 0).UTC().Format(time.RFC3339)
		}
		appendHistoryObservation(&rows, HistoryFusionObservation{
			ID: event.ID, At: event.At, Source: "filesystem", Kind: event.Kind, Label: firstNonEmpty(event.Why, event.Kind), Detail: event.Why, Path: event.Path, Severity: event.Severity, Partial: event.NeedsRescan || status.Partial,
		})
	}
	return rows, status, limitations
}

func timelineFusionObservations(a *app, r *http.Request, cutoff time.Time) ([]HistoryFusionObservation, HistoryFusionSourceStatus) {
	status := HistoryFusionSourceStatus{Source: "timeline", Persistent: false, Note: "Session intelligence and incident evidence only; raw source evidence remains authoritative."}
	if a == nil {
		return nil, status
	}
	base := a.globalTimeline(r)
	rows := []HistoryFusionObservation{}
	for _, event := range base.Events {
		if event.Source == "filesystem_change" || event.At <= 0 || time.Unix(event.At, 0).Before(cutoff) {
			continue
		}
		status.Count++
		if status.LatestAt == "" || event.At > func() int64 { t, _ := parseHistoryTime(status.LatestAt); return t.Unix() }() {
			status.LatestAt = time.Unix(event.At, 0).UTC().Format(time.RFC3339)
		}
		appendHistoryObservation(&rows, HistoryFusionObservation{ID: event.ID, At: event.At, Source: firstNonEmpty(event.Source, "timeline"), Kind: event.Kind, Label: firstNonEmpty(event.Detail, event.Kind), Detail: event.Detail, Path: event.Path, Severity: event.Severity})
	}
	status.Available = status.Count > 0
	return rows, status
}

func dedupeHistoryObservations(rows []HistoryFusionObservation) []HistoryFusionObservation {
	byID := map[string]HistoryFusionObservation{}
	for _, row := range rows {
		if row.ID == "" {
			row.ID = historyObservationID(row.Source, row.Kind, row.At, row.Path, row.Detail)
		}
		byID[row.ID] = row
	}
	out := make([]HistoryFusionObservation, 0, len(byID))
	for _, row := range byID {
		out = append(out, row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].At != out[j].At {
			return out[i].At > out[j].At
		}
		if out[i].Source != out[j].Source {
			return out[i].Source < out[j].Source
		}
		return out[i].ID < out[j].ID
	})
	if len(out) > historyFusionObservationLimit {
		out = out[:historyFusionObservationLimit]
	}
	return out
}

func correlateHistoryObservations(input []HistoryFusionObservation, window time.Duration) []HistoryFusionCorrelation {
	if window <= 0 {
		window = historyFusionCorrelationWindow
	}
	rows := append([]HistoryFusionObservation(nil), input...)
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].At < rows[j].At })
	out := []HistoryFusionCorrelation{}
	for i := 0; i < len(rows) && len(out) < historyFusionCorrelationLimit; {
		anchor := rows[i].At
		j := i
		sourceSet := map[string]bool{}
		eventIDs := []string{}
		for j < len(rows) && time.Duration(rows[j].At-anchor)*time.Second <= window {
			sourceSet[rows[j].Source] = true
			if len(eventIDs) < 24 {
				eventIDs = append(eventIDs, rows[j].ID)
			}
			j++
		}
		if len(sourceSet) >= 2 {
			sources := make([]string, 0, len(sourceSet))
			for source := range sourceSet {
				sources = append(sources, source)
			}
			sort.Strings(sources)
			lastAt := rows[j-1].At
			out = append(out, HistoryFusionCorrelation{
				ID: entityID("history-correlation", fmt.Sprintf("%d|%d|%s", anchor, lastAt, strings.Join(sources, ","))),
				FirstAt: anchor, LastAt: lastAt, Sources: sources, EventIDs: eventIDs,
				Summary: fmt.Sprintf("%d retained observation(s) from %d source(s) occurred within %s.", j-i, len(sources), window.String()),
				Boundary: "Temporal proximity is correlation context only. Sentinel has not established that these observations share a cause.",
			})
			i = j
			continue
		}
		i++
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].LastAt > out[j].LastAt })
	return out
}

func latestSourceTime(statuses []HistoryFusionSourceStatus, source string) string {
	for _, status := range statuses {
		if status.Source == source {
			return status.LatestAt
		}
	}
	return ""
}

func (a *app) whatChanged(r *http.Request) WhatChangedResponse {
	hours := queryInt(r, "hours", 24, 1, 24*30)
	now := time.Now().UTC()
	cutoff := now.Add(-time.Duration(hours) * time.Hour)
	out := WhatChangedResponse{
		Marker: historyFusionMarker, GeneratedAt: now.Format(time.RFC3339), Hours: hours, WindowStart: cutoff.Format(time.RFC3339),
		Note: "What Changed aggregates existing bounded Sentinel evidence. It does not trigger a storage scan, network capture, behavior comparison, trust comparison, or filesystem watch.",
		NotEstablished: []string{
			"Temporal proximity does not establish causation unless an independent evidence relationship supports it.",
			"Absence of retained evidence does not establish that no change occurred outside source scope or retention windows.",
			"Network snapshot differences do not establish exact connection start or end times.",
			"Storage growth does not establish why bytes appeared or whether any path is safe to delete.",
		},
	}

	memorySamples := resourceHistory.since(time.Duration(hours) * time.Hour)
	diskSamples, persistentFile, persistentErr := loadPersistentFusionResourceSamples(cutoff)
	resourceSamples := mergeFusionResourceSamples(memorySamples, diskSamples)
	resourceStatus := HistoryFusionSourceStatus{Source: "resource", Available: len(resourceSamples) > 0, Count: len(resourceSamples), Persistent: persistentFile, Note: "Merged from current bounded in-memory Resource Observatory samples and existing opt-in persistent resource samples; no new sample is taken."}
	if len(resourceSamples) > 0 {
		resourceStatus.LatestAt = resourceSamples[len(resourceSamples)-1].CapturedAt.UTC().Format(time.RFC3339)
	}
	if persistentErr != nil {
		resourceStatus.Partial = true
		out.Limitations = append(out.Limitations, "Persistent resource history could not be read completely: "+persistentErr.Error())
	}
	if hours > 6 && !persistentFile {
		resourceStatus.Partial = true
		out.Limitations = append(out.Limitations, "Resource Observatory in-memory retention is approximately six hours and no persistent resource-history file is available for the wider requested window.")
	}
	if row, ok := resourceFusionObservation(resourceSamples); ok {
		appendHistoryObservation(&out.Observed, row)
	}
	out.Sources = append(out.Sources, resourceStatus)

	storageRows, storageStatus, storageLimits := storageFusionObservations(a.storageHistory, cutoff)
	out.Observed = append(out.Observed, storageRows...)
	out.Sources = append(out.Sources, storageStatus)
	out.Limitations = append(out.Limitations, storageLimits...)

	networkRows, networkStatus := networkFusionObservations(a.networkHistory, cutoff)
	out.Observed = append(out.Observed, networkRows...)
	out.Sources = append(out.Sources, networkStatus)

	behaviorRows, behaviorStatus := behaviorFusionObservations(a, cutoff)
	out.Observed = append(out.Observed, behaviorRows...)
	out.Sources = append(out.Sources, behaviorStatus)

	trustRows, trustStatus := trustFusionObservations(a, cutoff)
	out.Observed = append(out.Observed, trustRows...)
	out.Sources = append(out.Sources, trustStatus)

	filesystemRows, filesystemStatus, filesystemLimits := filesystemFusionObservations(a, cutoff)
	out.Observed = append(out.Observed, filesystemRows...)
	out.Sources = append(out.Sources, filesystemStatus)
	out.Limitations = append(out.Limitations, filesystemLimits...)

	timelineRows, timelineStatus := timelineFusionObservations(a, r, cutoff)
	out.Observed = append(out.Observed, timelineRows...)
	out.Sources = append(out.Sources, timelineStatus)

	out.Observed = dedupeHistoryObservations(out.Observed)
	out.Correlated = correlateHistoryObservations(out.Observed, historyFusionCorrelationWindow)
	if len(out.Observed) == 0 {
		out.Interpretation = append(out.Interpretation, "No retained observation falls inside the requested window. Review source coverage before concluding that the Mac did not change.")
	} else {
		out.Interpretation = append(out.Interpretation, fmt.Sprintf("%d bounded observation(s) from retained sources fall inside the requested window.", len(out.Observed)))
	}
	if len(out.Correlated) > 0 {
		out.Interpretation = append(out.Interpretation, "Multiple evidence sources changed near each other in time. Review the joined timeline and exact object relationships before deciding whether they share a cause.")
	}
	if latestSourceTime(out.Sources, "storage") == "" {
		out.Interpretation = append(out.Interpretation, "No completed storage-history snapshot pair is available in this window; What Changed does not start a scan automatically.")
	}
	out.Limitations = uniqueStrings(out.Limitations)
	return out
}

func (a *app) handleWhatChanged(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, a.whatChanged(r))
}

// completedStorageHistoryJobs is intentionally defined outside advanced.go so
// History Fusion can wire the already-existing scan manager to the already-
// existing storageHistoryManager without introducing a second scan pipeline.
func (m *scanManager) completedStorageHistoryJobs() []*ScanJob {
	if m == nil {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []*ScanJob{}
	for _, job := range m.jobs {
		if job == nil || job.Status != "complete" || job.Result == nil || job.FinishedAt <= 0 {
			continue
		}
		out = append(out, snapshotJob(job))
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].FinishedAt != out[j].FinishedAt {
			return out[i].FinishedAt < out[j].FinishedAt
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// startStorageHistoryBridge records each completed in-memory storage job once
// into Sentinel's existing bounded/private storage-history manager. It never
// initiates a scan and never scans the filesystem itself.
func (a *app) startStorageHistoryBridge() {
	if a == nil || a.jobs == nil || a.storageHistory == nil {
		return
	}
	go func() {
		seen := map[string]bool{}
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			for _, job := range a.jobs.completedStorageHistoryJobs() {
				if seen[job.ID] {
					continue
				}
				seen[job.ID] = true
				if _, err := a.storageHistory.add(job.Result, job.FinishedAt); err != nil && a.logs != nil {
					a.logs.append("warn", "history-fusion", "storage-history-persist", "Completed storage scan could not be retained in bounded storage history.", map[string]any{"job_id": job.ID, "error": err.Error()})
				}
			}
		}
	}()
}
