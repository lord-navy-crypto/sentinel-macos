// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestStorageHistoryPersistsAndCompares(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	m := newStorageHistoryManager(false)
	_, err := m.add(&AdvancedStorageResult{Root: h, VisibleBytes: 100, Categories: []StorageCategory{{Name: "Downloads", Size: 20, Files: 1}}}, 1)
	if err != nil {
		t.Fatal(err)
	}
	_, err = m.add(&AdvancedStorageResult{Root: h, VisibleBytes: 160, Categories: []StorageCategory{{Name: "Downloads", Size: 80, Files: 2}}}, 2)
	if err != nil {
		t.Fatal(err)
	}
	cmp, ok := m.latestComparison()
	if !ok || cmp.DeltaBytes != 60 {
		t.Fatalf("comparison=%+v ok=%v", cmp, ok)
	}
	m2 := newStorageHistoryManager(false)
	if got := m2.list(); len(got) != 2 {
		t.Fatalf("persisted snapshots=%+v", got)
	}
}

func TestStorageHistoryEphemeralDoesNotPersist(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	m := newStorageHistoryManager(true)
	if _, err := m.add(&AdvancedStorageResult{Root: h, VisibleBytes: 1}, 1); err != nil {
		t.Fatal(err)
	}
	m2 := newStorageHistoryManager(true)
	if got := m2.list(); len(got) != 0 {
		t.Fatalf("ephemeral history leaked: %+v", got)
	}
}
