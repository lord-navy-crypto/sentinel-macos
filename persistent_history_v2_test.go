// SPDX-License-Identifier: MPL-2.0
package main

import (
	"testing"
	"time"
)

func historyTestSample(at time.Time, cpu float64, free int, swap uint64) resourceSample {
	return resourceSample{
		CapturedAt: at, CPUPercent: cpu, MemoryFreePct: free, SwapUsedBytes: swap,
		DiskReadBytes: uint64(at.Unix()) * 100, DiskWriteBytes: uint64(at.Unix()) * 50,
		NetworkRxBytes: uint64(at.Unix()) * 80, NetworkTxBytes: uint64(at.Unix()) * 40,
		BatteryAvailable: true, BatteryPercent: 80,
	}
}

func TestPersistentHistoryGapsReportMissingEvidence(t *testing.T) {
	base := time.Date(2026, 9, 5, 12, 0, 0, 0, time.UTC)
	rows := []resourceSample{
		historyTestSample(base, 10, 70, 0),
		historyTestSample(base.Add(time.Minute), 11, 69, 0),
		historyTestSample(base.Add(10*time.Minute), 12, 68, 0),
	}
	gaps, threshold := persistentHistoryGaps(rows, 60)
	if threshold != 180 {
		t.Fatalf("threshold=%d want 180", threshold)
	}
	if len(gaps) != 1 {
		t.Fatalf("gaps=%+v want one missing window", gaps)
	}
	if gaps[0].Seconds != 9*60 {
		t.Fatalf("gap seconds=%d", gaps[0].Seconds)
	}
}

func TestResourceComparisonDoesNotInterpolateMissingPeriod(t *testing.T) {
	now := time.Date(2026, 9, 5, 12, 0, 0, 0, time.UTC)
	emptyPeriod := summarizeResourcePeriod("before", nil, now.Add(-2*time.Hour), now.Add(-time.Hour))
	afterRows := []resourceSample{historyTestSample(now.Add(-30*time.Minute), 30, 50, 1024)}
	afterPeriod := summarizeResourcePeriod("after", afterRows, now.Add(-time.Hour), now)
	cmp := compareResourcePeriods("after vs before", emptyPeriod, afterPeriod)
	if cmp.Available {
		t.Fatalf("comparison became available without both periods: %+v", cmp)
	}
	if cmp.Reason == "" {
		t.Fatal("missing-period comparison must explain why it is unavailable")
	}
}

func TestResourcePeriodUsesRetainedSamplesOnly(t *testing.T) {
	start := time.Date(2026, 9, 5, 10, 0, 0, 0, time.UTC)
	rows := []resourceSample{
		historyTestSample(start.Add(10*time.Minute), 20, 60, 100),
		historyTestSample(start.Add(20*time.Minute), 40, 40, 300),
	}
	rows[0].BatteryPercent = 82
	rows[1].BatteryPercent = 78
	period := summarizeResourcePeriod("test", rows, start, start.Add(time.Hour))
	if period.SampleCount != 2 || period.AverageCPUPercent != 30 || period.AverageMemoryFreePercent != 50 {
		t.Fatalf("unexpected period summary: %+v", period)
	}
	if period.MaxSwapUsedBytes != 300 {
		t.Fatalf("max swap=%d", period.MaxSwapUsedBytes)
	}
	if !period.BatteryAvailable || period.BatteryStartPercent != 82 || period.BatteryEndPercent != 78 {
		t.Fatalf("battery summary=%+v", period)
	}
}

func TestStorageChangeOverTimeUsesExistingSnapshotsOnly(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	m := newStorageHistoryManager(false)
	base := time.Now().Add(-3 * time.Hour).Unix()
	results := []*AdvancedStorageResult{
		{Root: home, VisibleBytes: 100, Categories: []StorageCategory{{Name: "Downloads", Size: 20, Files: 1}}},
		{Root: home, VisibleBytes: 160, Categories: []StorageCategory{{Name: "Downloads", Size: 80, Files: 2}}},
		{Root: home, VisibleBytes: 150, Categories: []StorageCategory{{Name: "Downloads", Size: 70, Files: 2}}},
	}
	for i, result := range results {
		if _, err := m.add(result, base+int64(i+1)*3600); err != nil {
			t.Fatal(err)
		}
	}
	out := buildStorageChangeOverTimeV2(24, time.Now(), true)
	if !out.Available || out.SnapshotCount != 3 || len(out.Comparisons) != 2 {
		t.Fatalf("storage timeline=%+v", out)
	}
	if out.Comparisons[0].DeltaBytes != 60 || out.Comparisons[1].DeltaBytes != -10 {
		t.Fatalf("storage deltas=%+v", out.Comparisons)
	}
}

func TestStorageChangeOverTimeEphemeralDoesNotReadPersistentFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	m := newStorageHistoryManager(false)
	base := time.Now().Add(-2 * time.Hour).Unix()
	if _, err := m.add(&AdvancedStorageResult{Root: home, VisibleBytes: 100}, base); err != nil {
		t.Fatal(err)
	}
	if _, err := m.add(&AdvancedStorageResult{Root: home, VisibleBytes: 200}, base+3600); err != nil {
		t.Fatal(err)
	}
	out := buildStorageChangeOverTimeV2(24, time.Now(), false)
	if out.Available || out.SnapshotCount != 0 || len(out.Comparisons) != 0 {
		t.Fatalf("ephemeral view leaked persistent history: %+v", out)
	}
}
