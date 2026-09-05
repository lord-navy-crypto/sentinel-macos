// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBoundedPersistentWriterCompactsAndKeepsNewestSample(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	limit := int64(4096)
	target := int64(2048)
	var last resourceSample
	compactions := 0
	for i := 0; i < 40; i++ {
		last = historyTestSample(time.Date(2026, 9, 5, 12, 0, i, 0, time.UTC), float64(i), 70-i%10, uint64(i*100))
		last.TopCPU = []resourceProcess{{PID: 100 + i, CPU: float64(i), Command: strings.Repeat("x", 180)}}
		status, err := appendPersistentSampleBounded(last, limit, target)
		if err != nil {
			t.Fatalf("append %d: %v", i, err)
		}
		if status.Compacted {
			compactions++
		}
		if status.AfterBytes > limit {
			t.Fatalf("append %d exceeded bound: %+v", i, status)
		}
	}
	if compactions == 0 {
		t.Fatal("expected at least one bounded compaction")
	}
	_, historyPath, err := maintenanceHistoryPaths()
	if err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(historyPath)
	if err != nil {
		t.Fatal(err)
	}
	if st.Size() > limit {
		t.Fatalf("history size=%d exceeds limit=%d", st.Size(), limit)
	}
	if st.Mode().Perm() != 0600 {
		t.Fatalf("history permissions=%#o want 0600", st.Mode().Perm())
	}
	dirInfo, err := os.Stat(filepath.Dir(historyPath))
	if err != nil {
		t.Fatal(err)
	}
	if dirInfo.Mode().Perm() != 0700 {
		t.Fatalf("history directory permissions=%#o want 0700", dirInfo.Mode().Perm())
	}
	f, err := os.Open(historyPath)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	var got resourceSample
	for scanner.Scan() {
		var row resourceSample
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			t.Fatalf("compacted row is not valid JSON: %v", err)
		}
		got = row
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if !got.CapturedAt.Equal(last.CapturedAt) {
		t.Fatalf("newest sample lost: got=%s want=%s", got.CapturedAt, last.CapturedAt)
	}
}

func TestBoundedPersistentWriterRejectsSymlinkHistoryPath(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	_, historyPath, err := maintenanceHistoryPaths()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(historyPath), 0700); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside.jsonl")
	if err := os.WriteFile(outside, []byte("sentinel\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, historyPath); err != nil {
		t.Fatal(err)
	}
	sample := historyTestSample(time.Now(), 1, 50, 0)
	if _, err := appendPersistentSampleBounded(sample, 4096, 2048); err == nil {
		t.Fatal("symlink resource-history path was accepted")
	}
	raw, err := os.ReadFile(outside)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "sentinel\n" {
		t.Fatalf("outside symlink target was modified: %q", string(raw))
	}
}

func TestBoundedPersistentWriterRejectsInvalidBounds(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	sample := historyTestSample(time.Now(), 1, 50, 0)
	if _, err := appendPersistentSampleBounded(sample, 1024, 1024); err == nil {
		t.Fatal("equal limit/target should be rejected")
	}
}
