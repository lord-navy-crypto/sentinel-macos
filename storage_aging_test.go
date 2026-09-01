// SPDX-License-Identifier: MPL-2.0
package main

import (
	"testing"
	"time"
)

func TestBuildStorageAgingReportBucketsAndTrend(t *testing.T) {
	now := time.Unix(2000*86400, 0)
	result := &AdvancedStorageResult{Root: "/Users/test", LargeFiles: []LargeFile{{Path: "/Users/test/a", Name: "a", Size: 10, ModUnix: now.Add(-10 * 24 * time.Hour).Unix()}, {Path: "/Users/test/b", Name: "b", Size: 20, ModUnix: now.Add(-60 * 24 * time.Hour).Unix()}, {Path: "/Users/test/c", Name: "c", Size: 30, ModUnix: now.Add(-400 * 24 * time.Hour).Unix()}, {Path: "/Users/test/d", Name: "d", Size: 40, ModUnix: now.Add(-900 * 24 * time.Hour).Unix()}}}
	snaps := []StorageSnapshot{{ID: "s1", Root: "/Users/test", CreatedAt: 1, VisibleBytes: 100}, {ID: "skip", Root: "/Other", CreatedAt: 2, VisibleBytes: 999}, {ID: "s2", Root: "/Users/test", CreatedAt: 3, VisibleBytes: 140, Partial: true}}
	got := BuildStorageAgingReport(result, snaps, now)
	if got.FilesConsidered != 4 || got.BytesConsidered != 100 {
		t.Fatalf("considered=%+v", got)
	}
	if got.Buckets[0].Files != 1 || got.Buckets[1].Files != 1 || got.Buckets[3].Files != 1 || got.Buckets[4].Files != 1 {
		t.Fatalf("buckets=%+v", got.Buckets)
	}
	if len(got.Trend) != 2 || got.Trend[1].SnapshotID != "s2" || !got.Trend[1].Partial {
		t.Fatalf("trend=%+v", got.Trend)
	}
	if got.OldestLargeFiles[0].Path != "/Users/test/d" {
		t.Fatalf("oldest=%+v", got.OldestLargeFiles)
	}
}

func TestBuildStorageAgingReportMissingDataIsExplicit(t *testing.T) {
	got := BuildStorageAgingReport(nil, nil, time.Unix(1, 0))
	if len(got.Limitations) == 0 || got.FilesConsidered != 0 {
		t.Fatalf("missing report=%+v", got)
	}
}
