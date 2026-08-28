// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"path/filepath"
	"sort"
	"sync"
)

const storageSnapshotHistoryLimit = 24

type storageHistoryEnvelope struct {
	Version   int               `json:"version"`
	Snapshots []StorageSnapshot `json:"snapshots"`
}

type storageHistoryManager struct {
	mu         sync.RWMutex
	persistent bool
	path       string
	snapshots  []StorageSnapshot
}

func storageHistoryPath() string {
	base := sentinelStateDir()
	if base == "" {
		return ""
	}
	return filepath.Join(base, "storage-history.json.gz")
}

func newStorageHistoryManager(ephemeral bool) *storageHistoryManager {
	m := &storageHistoryManager{persistent: !ephemeral, path: storageHistoryPath()}
	if !m.persistent || m.path == "" {
		return m
	}
	var env storageHistoryEnvelope
	if readGzipJSON(m.path, &env) == nil && env.Version == SentinelSchemaV23 {
		if len(env.Snapshots) > storageSnapshotHistoryLimit {
			env.Snapshots = env.Snapshots[len(env.Snapshots)-storageSnapshotHistoryLimit:]
		}
		m.snapshots = append([]StorageSnapshot(nil), env.Snapshots...)
	}
	return m
}

func (m *storageHistoryManager) add(result *AdvancedStorageResult, at int64) (StorageSnapshot, error) {
	if m == nil {
		return StorageSnapshot{}, fmt.Errorf("storage history unavailable")
	}
	snapshot := NewStorageSnapshot(result, at)
	if snapshot.ID == "" {
		return snapshot, fmt.Errorf("storage snapshot has no identity")
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, existing := range m.snapshots {
		if existing.ID == snapshot.ID {
			return existing, nil
		}
	}
	m.snapshots = append(m.snapshots, snapshot)
	sort.SliceStable(m.snapshots, func(i, j int) bool {
		if m.snapshots[i].CreatedAt != m.snapshots[j].CreatedAt {
			return m.snapshots[i].CreatedAt < m.snapshots[j].CreatedAt
		}
		return m.snapshots[i].ID < m.snapshots[j].ID
	})
	if len(m.snapshots) > storageSnapshotHistoryLimit {
		m.snapshots = append([]StorageSnapshot(nil), m.snapshots[len(m.snapshots)-storageSnapshotHistoryLimit:]...)
	}
	if m.persistent && m.path != "" {
		if err := writePrivateGzipJSON(m.path, storageHistoryEnvelope{Version: SentinelSchemaV23, Snapshots: m.snapshots}); err != nil {
			return snapshot, err
		}
	}
	return snapshot, nil
}

func (m *storageHistoryManager) list() []StorageSnapshot {
	if m == nil {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return append([]StorageSnapshot(nil), m.snapshots...)
}

func (m *storageHistoryManager) latestComparison() (StorageComparison, bool) {
	if m == nil {
		return StorageComparison{}, false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	if len(m.snapshots) < 2 {
		return StorageComparison{}, false
	}
	return CompareStorageSnapshots(m.snapshots[len(m.snapshots)-2], m.snapshots[len(m.snapshots)-1]), true
}
