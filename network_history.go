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
	networkHistorySnapshotLimit = 32
	networkHistoryRelationLimit = 400
)

type NetworkHistoryRelation struct {
	Process       string `json:"process"`
	User          string `json:"user,omitempty"`
	PID           int    `json:"pid,omitempty"`
	State         string `json:"state"`
	EndpointClass string `json:"endpoint_class,omitempty"`
	Endpoint      string `json:"endpoint"`
	SampleLocal   string `json:"sample_local,omitempty"`
	SampleRemote  string `json:"sample_remote,omitempty"`
	Rows          int    `json:"rows"`
}

type NetworkHistorySnapshot struct {
	ID         string                   `json:"id"`
	CapturedAt string                   `json:"captured_at"`
	RowsSeen   int                      `json:"rows_seen"`
	RowsStored int                      `json:"rows_stored"`
	Truncated  bool                     `json:"truncated"`
	Relations  []NetworkHistoryRelation `json:"relations"`
}

type NetworkHistoryDiff struct {
	FromID string                   `json:"from_id,omitempty"`
	ToID   string                   `json:"to_id,omitempty"`
	Added  []NetworkHistoryRelation `json:"added"`
	Ended  []NetworkHistoryRelation `json:"ended"`
	Note   string                   `json:"note"`
}

type networkHistoryEnvelope struct {
	Version   int                      `json:"version"`
	Snapshots []NetworkHistorySnapshot `json:"snapshots"`
}

type networkHistoryManager struct {
	mu         sync.RWMutex
	persistent bool
	path       string
	snapshots  []NetworkHistorySnapshot
}

func networkHistoryPath() string {
	base := sentinelStateDir()
	if base == "" {
		return ""
	}
	return filepath.Join(base, "network-history.json.gz")
}

func newNetworkHistoryManager(ephemeral bool) *networkHistoryManager {
	return newNetworkHistoryManagerWithPath(ephemeral, networkHistoryPath())
}

func newNetworkHistoryManagerWithPath(ephemeral bool, path string) *networkHistoryManager {
	m := &networkHistoryManager{persistent: !ephemeral, path: path}
	if !m.persistent || m.path == "" {
		return m
	}
	var env networkHistoryEnvelope
	if readGzipJSON(m.path, &env) == nil && env.Version == SentinelSchemaV23 {
		if len(env.Snapshots) > networkHistorySnapshotLimit {
			env.Snapshots = env.Snapshots[len(env.Snapshots)-networkHistorySnapshotLimit:]
		}
		for i := range env.Snapshots {
			if len(env.Snapshots[i].Relations) > networkHistoryRelationLimit {
				env.Snapshots[i].Relations = env.Snapshots[i].Relations[:networkHistoryRelationLimit]
				env.Snapshots[i].RowsStored = len(env.Snapshots[i].Relations)
				env.Snapshots[i].Truncated = true
			}
		}
		m.snapshots = append([]NetworkHistorySnapshot(nil), env.Snapshots...)
	}
	return m
}

func normalizeNetworkHistoryText(value string, max int) string {
	value = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(value, "\x00", ""), "\r\n", "\n"))
	if max > 0 && len(value) > max {
		value = value[:max]
	}
	return value
}

func normalizedNetworkHistoryRelation(item NetworkItem) (NetworkHistoryRelation, bool) {
	state := strings.ToUpper(normalizeNetworkHistoryText(item.State, 32))
	if state == "" {
		state = "OTHER"
	}
	process := normalizeNetworkHistoryText(item.Command, 128)
	if process == "" {
		process = "unknown process"
	}
	class := normalizeNetworkHistoryText(item.EndpointClass, 64)
	if class == "" {
		class = "unclassified"
	}
	local := normalizeNetworkHistoryText(item.Local, 256)
	remote := normalizeNetworkHistoryText(item.Remote, 256)
	address := normalizeNetworkHistoryText(item.Address, 256)
	endpoint := ""
	switch state {
	case "LISTEN":
		endpoint = local
		if endpoint == "" {
			endpoint = address
		}
	default:
		endpoint = remote
		if endpoint == "" {
			endpoint = address
		}
		if endpoint == "" {
			endpoint = local
		}
	}
	if endpoint == "" {
		return NetworkHistoryRelation{}, false
	}
	return NetworkHistoryRelation{
		Process: process, User: normalizeNetworkHistoryText(item.User, 96), PID: item.PID,
		State: state, EndpointClass: class, Endpoint: endpoint,
		SampleLocal: local, SampleRemote: remote, Rows: 1,
	}, true
}

func networkHistoryRelationKey(r NetworkHistoryRelation) string {
	// PID and local ephemeral ports are deliberately excluded from the stable
	// relationship identity. The historical question is whether the same visible
	// process identity was observed in the same state with the same normalized
	// endpoint, not whether a transient PID/ephemeral port happened to match.
	return strings.ToLower(strings.Join([]string{r.Process, r.User, r.State, r.EndpointClass, r.Endpoint}, "\x00"))
}

func buildNetworkHistorySnapshot(items []NetworkItem, at time.Time) NetworkHistorySnapshot {
	merged := map[string]NetworkHistoryRelation{}
	for _, item := range items {
		relation, ok := normalizedNetworkHistoryRelation(item)
		if !ok {
			continue
		}
		key := networkHistoryRelationKey(relation)
		if old, exists := merged[key]; exists {
			old.Rows++
			if old.PID == 0 && relation.PID > 0 {
				old.PID = relation.PID
			}
			merged[key] = old
		} else {
			merged[key] = relation
		}
	}
	relations := make([]NetworkHistoryRelation, 0, len(merged))
	for _, relation := range merged {
		relations = append(relations, relation)
	}
	sort.Slice(relations, func(i, j int) bool {
		if relations[i].Process != relations[j].Process {
			return relations[i].Process < relations[j].Process
		}
		if relations[i].State != relations[j].State {
			return relations[i].State < relations[j].State
		}
		return relations[i].Endpoint < relations[j].Endpoint
	})
	truncated := len(relations) > networkHistoryRelationLimit
	if truncated {
		relations = relations[:networkHistoryRelationLimit]
	}
	stamp := at.UTC()
	return NetworkHistorySnapshot{
		ID: entityID("network-snapshot", stamp.Format(time.RFC3339Nano)), CapturedAt: stamp.Format(time.RFC3339),
		RowsSeen: len(items), RowsStored: len(relations), Truncated: truncated, Relations: relations,
	}
}

func diffNetworkHistory(from, to NetworkHistorySnapshot) NetworkHistoryDiff {
	old := map[string]NetworkHistoryRelation{}
	for _, relation := range from.Relations {
		old[networkHistoryRelationKey(relation)] = relation
	}
	current := map[string]NetworkHistoryRelation{}
	for _, relation := range to.Relations {
		current[networkHistoryRelationKey(relation)] = relation
	}
	diff := NetworkHistoryDiff{FromID: from.ID, ToID: to.ID, Note: "Added/ended means the normalized relationship was present in one explicit Sentinel snapshot and absent in the other. It is not proof that a connection began or ended at the snapshot timestamp."}
	for key, relation := range current {
		if _, ok := old[key]; !ok {
			diff.Added = append(diff.Added, relation)
		}
	}
	for key, relation := range old {
		if _, ok := current[key]; !ok {
			diff.Ended = append(diff.Ended, relation)
		}
	}
	sort.Slice(diff.Added, func(i, j int) bool { return networkHistoryRelationKey(diff.Added[i]) < networkHistoryRelationKey(diff.Added[j]) })
	sort.Slice(diff.Ended, func(i, j int) bool { return networkHistoryRelationKey(diff.Ended[i]) < networkHistoryRelationKey(diff.Ended[j]) })
	return diff
}

func (m *networkHistoryManager) persistLocked() error {
	if m == nil || !m.persistent || m.path == "" {
		return nil
	}
	return writePrivateGzipJSON(m.path, networkHistoryEnvelope{Version: SentinelSchemaV23, Snapshots: m.snapshots})
}

func (m *networkHistoryManager) capture(items []NetworkItem, at time.Time) (NetworkHistorySnapshot, *NetworkHistoryDiff, error) {
	if m == nil {
		return NetworkHistorySnapshot{}, nil, fmt.Errorf("network history unavailable")
	}
	snapshot := buildNetworkHistorySnapshot(items, at)
	m.mu.Lock()
	defer m.mu.Unlock()
	var previous *NetworkHistorySnapshot
	if len(m.snapshots) > 0 {
		copy := m.snapshots[len(m.snapshots)-1]
		previous = &copy
	}
	m.snapshots = append(m.snapshots, snapshot)
	if len(m.snapshots) > networkHistorySnapshotLimit {
		m.snapshots = append([]NetworkHistorySnapshot(nil), m.snapshots[len(m.snapshots)-networkHistorySnapshotLimit:]...)
	}
	if err := m.persistLocked(); err != nil {
		return snapshot, nil, err
	}
	if previous == nil {
		return snapshot, nil, nil
	}
	diff := diffNetworkHistory(*previous, snapshot)
	return snapshot, &diff, nil
}

func (m *networkHistoryManager) list() []NetworkHistorySnapshot {
	if m == nil {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := append([]NetworkHistorySnapshot(nil), m.snapshots...)
	for i := range out {
		out[i].Relations = append([]NetworkHistoryRelation(nil), out[i].Relations...)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CapturedAt > out[j].CapturedAt })
	return out
}

func (a *app) handleNetworkHistory(w http.ResponseWriter, r *http.Request) {
	if a == nil || a.networkHistory == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "network history unavailable"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		snapshots := a.networkHistory.list()
		var latestDiff *NetworkHistoryDiff
		if len(snapshots) >= 2 {
			diff := diffNetworkHistory(snapshots[1], snapshots[0])
			latestDiff = &diff
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"snapshots": snapshots, "latest_diff": latestDiff, "persistent": a.networkHistory.persistent,
			"retention": networkHistorySnapshotLimit,
			"note": "Network Evidence history is created only by explicit Sentinel snapshots. It stores bounded normalized relationship metadata, never packet contents, decrypted traffic, or a continuous background capture.",
		})
	case http.MethodPost:
		items, collectErr := collectNetwork()
		if collectErr != nil {
			// A collection error is missing evidence, not evidence of zero
			// relationships. Never persist it as an empty snapshot because doing so
			// would manufacture a false "everything ended" historical diff.
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "network snapshot unavailable: " + collectErr.Error()})
			return
		}
		snapshot, diff, err := a.networkHistory.capture(items, time.Now())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"snapshot": snapshot, "diff": diff, "persistent": a.networkHistory.persistent,
			"note": "Snapshot captured from currently visible bounded TCP evidence. Absence from a later snapshot does not establish the exact time a connection ended.",
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET or POST required"})
	}
}
