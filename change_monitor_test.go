// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNativeFlags(t *testing.T) {
	_, k, r, d := normalizeNativeFSEventFlags(0x1 | 0x4)
	if k != "rescan_required" || !r || !d {
		t.Fatal(k, r, d)
	}
	_, k, r, _ = normalizeNativeFSEventFlags(0x20)
	if k != "root_changed" || !r {
		t.Fatal(k, r)
	}
}
func TestPollingDiff(t *testing.T) {
	d := t.TempDir()
	m := newChangeManager(nil)
	a, _ := snapshotChangeRoot(d, 100, time.Second)
	p := filepath.Join(d, "x")
	os.WriteFile(p, []byte("x"), 0600)
	b, _ := snapshotChangeRoot(d, 100, time.Second)
	emitSnapshotDiff(m, d, a, b)
	ok := false
	for _, e := range m.eventsSnapshot(10) {
		if e.Path == p && e.Kind == "created" {
			ok = true
		}
	}
	if !ok {
		t.Fatal(m.eventsSnapshot(10))
	}
}
func TestWatchRootSymlinkEscape(t *testing.T) {
	h := t.TempDir()
	o := t.TempDir()
	l := filepath.Join(h, "x")
	os.Symlink(o, l)
	if _, e := safeHomeWatchRoot(h, l); e == nil {
		t.Fatal("escape accepted")
	}
}
func TestPollingLifecycle(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	d := filepath.Join(h, "Downloads")
	if err := os.MkdirAll(d, 0700); err != nil {
		t.Fatal(err)
	}

	// This test is intentionally about the polling fallback lifecycle. On a real
	// macOS native build, m.start() correctly prefers FSEvents, so constructing the
	// fallback loop explicitly keeps this test deterministic without weakening the
	// production preference for native FSEvents.
	m := newChangeManager(nil, true)
	initial, _ := snapshotChangeRoot(d, 100, time.Second)
	m.mu.Lock()
	m.running = true
	m.mode = "polling-fallback"
	m.startedAt = time.Now()
	m.roots = []string{d}
	m.interval = time.Second
	m.cancel = make(chan struct{})
	m.done = make(chan struct{})
	m.snapshots = map[string]map[string]changeSnapshotEntry{d: initial}
	cancel, done := m.cancel, m.done
	m.mu.Unlock()
	go m.pollLoop(cancel, done)
	defer m.stop()

	p := filepath.Join(d, "new.bin")
	if err := os.WriteFile(p, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3500 * time.Millisecond)
	for time.Now().Before(deadline) {
		for _, e := range m.eventsSnapshot(10) {
			if e.Path == p && e.Kind == "created" {
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("event not observed")
}

func TestChangeHistoryAndCheckpointPersist(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	d := filepath.Join(h, "Downloads")
	if err := os.MkdirAll(d, 0700); err != nil {
		t.Fatal(err)
	}
	m := newChangeManager(nil, false)
	m.mu.Lock()
	m.roots = []string{d}
	m.mu.Unlock()
	p := filepath.Join(d, "resume.bin")
	m.handleNative(p, 0x100, 4242)
	if st := m.status(); st.HistoryEntries != 1 || st.LastNativeEventID != 4242 {
		t.Fatalf("status=%+v", st)
	}
	m2 := newChangeManager(nil, false)
	if st := m2.status(); st.HistoryEntries != 1 || st.LastNativeEventID != 4242 {
		t.Fatalf("reloaded=%+v", st)
	}
	for _, path := range []string{changeHistoryPath(), changeCheckpointPath()} {
		st, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if st.Mode().Perm() != 0600 {
			t.Fatalf("%s mode=%o", path, st.Mode().Perm())
		}
	}
}

func TestChangeHistoryEphemeralNoDisk(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	m := newChangeManager(nil, true)
	m.appendEvent(ChangeEvent{At: time.Now().Unix(), Path: filepath.Join(h, "x"), Kind: "created", Source: "test", Severity: "info", Why: "test"})
	if m.status().HistoryEntries != 1 {
		t.Fatal("missing in-memory history")
	}
	if _, err := os.Stat(filepath.Join(h, "Library", "Application Support", "Sentinel")); !os.IsNotExist(err) {
		t.Fatalf("ephemeral state created: %v", err)
	}
}

func TestReconcileClearsRescanWhenComplete(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	d := filepath.Join(h, "Downloads")
	if err := os.MkdirAll(d, 0700); err != nil {
		t.Fatal(err)
	}
	m := newChangeManager(nil, true)
	m.mu.Lock()
	m.roots = []string{d}
	m.needsRescan = true
	m.checkpointRescan = true
	m.snapshots = map[string]map[string]changeSnapshotEntry{}
	m.mu.Unlock()
	r := m.reconcile()
	if !r.Complete {
		t.Fatalf("reconcile=%+v", r)
	}
	if m.status().NeedsRescan {
		t.Fatal("rescan flag not cleared")
	}
}
