// SPDX-License-Identifier: MPL-2.0
package main

import (
	"testing"
	"time"
)

func TestAccurateHistorySummarySeparatesSelectedWindowFromComparisonSupport(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	now := time.Date(2026, 9, 5, 12, 0, 0, 0, time.UTC)
	yesterday := time.Date(2026, 9, 4, 6, 0, 0, 0, time.UTC)
	todayMorning := time.Date(2026, 9, 5, 6, 0, 0, 0, time.UTC)
	selected := time.Date(2026, 9, 5, 11, 30, 0, 0, time.UTC)

	for _, sample := range []resourceSample{
		historyTestSample(yesterday, 10, 70, 100),
		historyTestSample(todayMorning, 20, 60, 200),
		historyTestSample(selected, 30, 50, 300),
	} {
		if err := appendPersistentSample(sample); err != nil {
			t.Fatal(err)
		}
	}

	out := buildPersistentHistoryV2SummaryAccurate(1, now)
	if out.SampleCount != 1 {
		t.Fatalf("selected-window sample count=%d want 1", out.SampleCount)
	}
	if !out.TodayVsYesterday.Available {
		t.Fatalf("matched-day comparison should use bounded support samples: %+v", out.TodayVsYesterday)
	}
	beforeStart, err := time.Parse(time.RFC3339, out.TodayVsYesterday.Before.Start)
	if err != nil {
		t.Fatal(err)
	}
	beforeEnd, err := time.Parse(time.RFC3339, out.TodayVsYesterday.Before.End)
	if err != nil {
		t.Fatal(err)
	}
	afterStart, err := time.Parse(time.RFC3339, out.TodayVsYesterday.After.Start)
	if err != nil {
		t.Fatal(err)
	}
	afterEnd, err := time.Parse(time.RFC3339, out.TodayVsYesterday.After.End)
	if err != nil {
		t.Fatal(err)
	}
	if beforeEnd.Sub(beforeStart) != afterEnd.Sub(afterStart) {
		t.Fatalf("comparison periods differ: before=%s after=%s", beforeEnd.Sub(beforeStart), afterEnd.Sub(afterStart))
	}
}
