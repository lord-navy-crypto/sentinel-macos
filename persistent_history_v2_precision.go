// SPDX-License-Identifier: MPL-2.0
package main

import "time"

// buildPersistentHistoryV2SummaryAccurate keeps selected-window coverage and
// gap reporting scoped to the user's requested window while allowing bounded
// before/after comparisons to read the immediately preceding retained support
// period they actually need. This avoids comparing a full current period with
// a truncated earlier period simply because the selected display window was
// shorter than the comparison baseline.
func buildPersistentHistoryV2SummaryAccurate(hours int, now time.Time) PersistentHistoryV2Summary {
	if hours < 1 {
		hours = 24
	}
	if hours > 24*30 {
		hours = 24 * 30
	}
	settings := loadPersistentHistorySettings()
	requestedCutoff := now.Add(-time.Duration(hours) * time.Hour)

	loc := now.Location()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	yesterdayStart := todayStart.AddDate(0, 0, -1)
	comparisonCutoff := requestedCutoff
	if twoHoursAgo := now.Add(-2 * time.Hour); twoHoursAgo.Before(comparisonCutoff) {
		comparisonCutoff = twoHoursAgo
	}
	if yesterdayStart.Before(comparisonCutoff) {
		comparisonCutoff = yesterdayStart
	}

	rows, limited, err := readPersistentHistoryTail(comparisonCutoff)
	selectedRows := samplesBetween(rows, requestedCutoff, now.Add(time.Nanosecond))
	out := PersistentHistoryV2Summary{
		Marker: persistentHistoryV2Marker, Enabled: settings.Enabled, RequestedHours: hours,
		SampleCount: len(selectedRows), ExpectedIntervalSeconds: settings.AutoIntervalSeconds, ReadLimited: limited,
		Boundary: "Selected-window coverage and missing windows use only the requested interval. Before/after comparisons may read earlier retained support samples needed for matched periods. Missing samples are never interpolated and do not establish that the Mac was idle, unchanged, healthy, or unhealthy.",
	}
	if out.ExpectedIntervalSeconds < 30 || out.ExpectedIntervalSeconds > 3600 {
		out.ExpectedIntervalSeconds = 60
	}
	if err != nil {
		out.ReadLimited = true
		out.Boundary += " Read limitation: " + err.Error()
	}
	if len(selectedRows) > 0 {
		out.FirstAt = selectedRows[0].CapturedAt.UTC().Format(time.RFC3339)
		out.LastAt = selectedRows[len(selectedRows)-1].CapturedAt.UTC().Format(time.RFC3339)
	}
	out.MissingWindows, out.GapThresholdSeconds = persistentHistoryGaps(selectedRows, out.ExpectedIntervalSeconds)

	currentHourStart := now.Add(-time.Hour)
	previousHourStart := now.Add(-2 * time.Hour)
	beforeHour := summarizeResourcePeriod("previous hour", samplesBetween(rows, previousHourStart, currentHourStart), previousHourStart, currentHourStart)
	afterHour := summarizeResourcePeriod("latest hour", samplesBetween(rows, currentHourStart, now.Add(time.Nanosecond)), currentHourStart, now)
	out.NowVsPreviousHour = compareResourcePeriods("latest hour vs previous hour", beforeHour, afterHour)

	elapsedToday := now.Sub(todayStart)
	yesterdayMatchedEnd := yesterdayStart.Add(elapsedToday)
	yesterday := summarizeResourcePeriod("yesterday same hours", samplesBetween(rows, yesterdayStart, yesterdayMatchedEnd), yesterdayStart, yesterdayMatchedEnd)
	today := summarizeResourcePeriod("today so far", samplesBetween(rows, todayStart, now.Add(time.Nanosecond)), todayStart, now)
	out.TodayVsYesterday = compareResourcePeriods("today so far vs same hours yesterday", yesterday, today)

	mid := requestedCutoff.Add(now.Sub(requestedCutoff) / 2)
	beforeWindow := summarizeResourcePeriod("earlier half", samplesBetween(selectedRows, requestedCutoff, mid), requestedCutoff, mid)
	afterWindow := summarizeResourcePeriod("later half", samplesBetween(selectedRows, mid, now.Add(time.Nanosecond)), mid, now)
	out.WindowBeforeAfter = compareResourcePeriods("later half vs earlier half", beforeWindow, afterWindow)
	return out
}
