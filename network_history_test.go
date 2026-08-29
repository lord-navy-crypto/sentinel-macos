// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNetworkHistoryNormalizesPIDAndEphemeralLocalPortChurn(t *testing.T) {
	first := buildNetworkHistorySnapshot([]NetworkItem{{
		Command: "Example", User: "me", PID: 101, State: "ESTABLISHED",
		Local: "10.0.0.2:50001", Remote: "203.0.113.8:443", EndpointClass: "remote",
	}}, time.Unix(100, 0))
	second := buildNetworkHistorySnapshot([]NetworkItem{{
		Command: "Example", User: "me", PID: 202, State: "ESTABLISHED",
		Local: "10.0.0.2:60123", Remote: "203.0.113.8:443", EndpointClass: "remote",
	}}, time.Unix(200, 0))

	diff := diffNetworkHistory(first, second)
	if len(diff.Added) != 0 || len(diff.Ended) != 0 {
		t.Fatalf("PID/local ephemeral-port churn should not create historical relationship churn: %+v", diff)
	}
	if got := second.Relations[0].PID; got != 202 {
		t.Fatalf("snapshot should still preserve current PID context, got %d", got)
	}
}

func TestNetworkHistoryDetectsNormalizedEndpointChange(t *testing.T) {
	first := buildNetworkHistorySnapshot([]NetworkItem{{Command: "Example", State: "ESTABLISHED", Remote: "198.51.100.1:443", EndpointClass: "remote"}}, time.Unix(100, 0))
	second := buildNetworkHistorySnapshot([]NetworkItem{{Command: "Example", State: "ESTABLISHED", Remote: "198.51.100.2:443", EndpointClass: "remote"}}, time.Unix(200, 0))
	diff := diffNetworkHistory(first, second)
	if len(diff.Added) != 1 || len(diff.Ended) != 1 {
		t.Fatalf("expected one added and one ended normalized endpoint relation, got %+v", diff)
	}
}

func TestNetworkHistoryManagerPersistsBoundedSnapshots(t *testing.T) {
	path := filepath.Join(t.TempDir(), "network-history.json.gz")
	m := newNetworkHistoryManagerWithPath(false, path)
	for i := 0; i < networkHistorySnapshotLimit+5; i++ {
		items := []NetworkItem{{Command: "Example", PID: 10 + i, State: "ESTABLISHED", Remote: fmt.Sprintf("203.0.113.%d:443", i+1), EndpointClass: "remote"}}
		if _, _, err := m.capture(items, time.Unix(int64(100+i), 0)); err != nil {
			t.Fatalf("capture %d: %v", i, err)
		}
	}
	if got := len(m.list()); got != networkHistorySnapshotLimit {
		t.Fatalf("snapshot retention=%d, want %d", got, networkHistorySnapshotLimit)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("persistent history file missing: %v", err)
	}
	reloaded := newNetworkHistoryManagerWithPath(false, path)
	if got := len(reloaded.list()); got != networkHistorySnapshotLimit {
		t.Fatalf("reloaded snapshot retention=%d, want %d", got, networkHistorySnapshotLimit)
	}
}

func TestNetworkHistoryRelationRetentionIsBounded(t *testing.T) {
	items := make([]NetworkItem, 0, networkHistoryRelationLimit+25)
	for i := 0; i < networkHistoryRelationLimit+25; i++ {
		items = append(items, NetworkItem{Command: "Example", State: "ESTABLISHED", Remote: fmt.Sprintf("198.51.100.%d:%d", i%250+1, 10000+i), EndpointClass: "remote"})
	}
	snapshot := buildNetworkHistorySnapshot(items, time.Unix(100, 0))
	if !snapshot.Truncated {
		t.Fatal("expected relation truncation")
	}
	if got := len(snapshot.Relations); got != networkHistoryRelationLimit {
		t.Fatalf("relations=%d, want %d", got, networkHistoryRelationLimit)
	}
}

func TestNetworkHistoryEphemeralModeDoesNotWriteState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "network-history.json.gz")
	m := newNetworkHistoryManagerWithPath(true, path)
	if _, _, err := m.capture([]NetworkItem{{Command: "Example", State: "LISTEN", Local: "127.0.0.1:8080", EndpointClass: "loopback"}}, time.Unix(100, 0)); err != nil {
		t.Fatalf("ephemeral capture: %v", err)
	}
	if m.persistent {
		t.Fatal("ephemeral manager must be memory-only")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("ephemeral mode unexpectedly wrote state: %v", err)
	}
}
