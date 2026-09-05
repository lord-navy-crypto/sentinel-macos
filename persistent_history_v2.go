// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"time"
)

const (
	persistentHistoryV2Marker       = "Sentinel 2.9 Persistent History Ultra"
	persistentHistoryV2ReadBytes    = int64(24 * 1024 * 1024)
	persistentHistoryV2MaxRows      = 20000
	persistentHistoryV2MaxStorage   = 12
)

type PersistentHistoryGap struct {
	From    string `json:"from"`
	To      string `json:"to"`
	Seconds int64  `json:"seconds"`
}

type ResourceHistoryPeriod struct {
	Label                       string  `json:"label"`
	Start                       string  `json:"start"`
	End                         string  `json:"end"`
	SampleCount                 int     `json:"sample_count"`
	FirstAt                     string  `json:"first_at,omitempty"`
	LastAt                      string  `json:"last_at,omitempty"`
	AverageCPUPercent           float64 `json:"average_cpu_percent"`
	AverageMemoryFreePercent    float64 `json:"average_memory_free_percent"`
	MaxSwapUsedBytes            uint64  `json:"max_swap_used_bytes"`
	BatteryAvailable            bool    `json:"battery_available"`
	BatteryStartPercent         int     `json:"battery_start_percent,omitempty"`
	BatteryEndPercent           int     `json:"battery_end_percent,omitempty"`
	DiskReadRateAvailable       bool    `json:"disk_read_rate_available"`
	DiskReadBytesPerSecond      float64 `json:"disk_read_bytes_per_second,omitempty"`
	DiskWriteRateAvailable      bool    `json:"disk_write_rate_available"`
	DiskWriteBytesPerSecond     float64 `json:"disk_write_bytes_per_second,omitempty"`
	NetworkRXRateAvailable      bool    `json:"network_rx_rate_available"`
	NetworkRXBytesPerSecond     float64 `json:"network_rx_bytes_per_second,omitempty"`
	NetworkTXRateAvailable      bool    `json:"network_tx_rate_available"`
	NetworkTXBytesPerSecond     float64 `json:"network_tx_bytes_per_second,omitempty"`
}

type ResourceHistoryComparison struct {
	Label                         string                `json:"label"`
	Available                     bool                  `json:"available"`
	Reason                        string                `json:"reason,omitempty"`
	Before                        ResourceHistoryPeriod `json:"before"`
	After                         ResourceHistoryPeriod `json:"after"`
	AverageCPUPercentDelta        float64               `json:"average_cpu_percent_delta"`
	AverageMemoryFreePercentDelta float64               `json:"average_memory_free_percent_delta"`
	MaxSwapUsedBytesDelta         int64                 `json:"max_swap_used_bytes_delta"`
	BatteryPercentDelta           int                   `json:"battery_percent_delta,omitempty"`
	BatteryDeltaAvailable         bool                  `json:"battery_delta_available"`
}

type PersistentHistoryV2Summary struct {
	Marker                  string                    `json:"marker"`
	Enabled                 bool                      `json:"enabled"`
	RequestedHours          int                       `json:"requested_hours"`
	SampleCount             int                       `json:"sample_count"`
	FirstAt                 string                    `json:"first_at,omitempty"`
	LastAt                  string                    `json:"last_at,omitempty"`
	ExpectedIntervalSeconds int                       `json:"expected_interval_seconds"`
	GapThresholdSeconds     int64                     `json:"gap_threshold_seconds"`
	MissingWindows          []PersistentHistoryGap    `json:"missing_windows"`
	ReadLimited             bool                      `json:"read_limited"`
	NowVsPreviousHour       ResourceHistoryComparison `json:"now_vs_previous_hour"`
	TodayVsYesterday        ResourceHistoryComparison `json:"today_vs_yesterday"`
	WindowBeforeAfter       ResourceHistoryComparison `json:"window_before_after"`
	Boundary                string                    `json:"boundary"`
}

type StorageChangeOverTimeV2 struct {
	Marker              string              `json:"marker"`
	Persistent          bool                `json:"persistent"`
	SnapshotCount       int                 `json:"snapshot_count"`
	WindowSnapshotCount int                 `json:"window_snapshot_count"`
	Comparisons         []StorageComparison `json:"comparisons"`
	Available           bool                `json:"available"`
	Partial             bool                `json:"partial"`
	Boundary            string              `json:"boundary"`
	Limitations         []string            `json:"limitations,omitempty"`
}

func readPersistentHistoryTail(cutoff time.Time) ([]resourceSample, bool, error) {
	_, historyPath, err := maintenanceHistoryPaths()
	if err != nil {
		return nil, false, err
	}
	f, err := os.Open(historyPath)
	if os.IsNotExist(err) {
		return []resourceSample{}, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		return nil, false, err
	}
	limited := st.Size() > persistentHistoryV2ReadBytes
	if limited {
		if _, err := f.Seek(st.Size()-persistentHistoryV2ReadBytes, io.SeekStart); err != nil {
			return nil, true, err
		}
	}

	scanner := bufio.NewScanner(io.LimitReader(f, persistentHistoryV2ReadBytes))
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	if limited {
		// The seek can land inside one JSONL row. Discard exactly that first
		// fragment; every retained row after it still has a complete newline.
		_ = scanner.Scan()
	}
	rows := make([]resourceSample, 0, 2048)
	for scanner.Scan() {
		var sample resourceSample
		if json.Unmarshal(scanner.Bytes(), &sample) != nil || sample.CapturedAt.IsZero() || sample.CapturedAt.Before(cutoff) {
			continue
		}
		rows = append(rows, sample)
	}
	if err := scanner.Err(); err != nil {
		return rows, limited, err
	}
	if len(rows) > persistentHistoryV2MaxRows {
		rows = append([]resourceSample(nil), rows[len(rows)-persistentHistoryV2MaxRows:]...)
		limited = true
	}

	byTime := make(map[string]resourceSample, len(rows))
	for _, row := range rows {
		byTime[row.CapturedAt.UTC().Format(time.RFC3339Nano)] = row
	}
	rows = rows[:0]
	for _, row := range byTime {
		rows = append(rows, row)
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].CapturedAt.Before(rows[j].CapturedAt) })
	return rows, limited, nil
}

func samplesBetween(rows []resourceSample, start, end time.Time) []resourceSample {
	out := make([]resourceSample, 0, len(rows))
	for _, row := range rows {
		if row.CapturedAt.Before(start) || !row.CapturedAt.Before(end) {
			continue
		}
		out = append(out, row)
	}
	return out
}

func summarizeResourcePeriod(label string, rows []resourceSample, start, end time.Time) ResourceHistoryPeriod {
	out := ResourceHistoryPeriod{Label: label, Start: start.UTC().Format(time.RFC3339), End: end.UTC().Format(time.RFC3339), SampleCount: len(rows)}
	if len(rows) == 0 {
		return out
	}
	var cpu, mem float64
	var batteryRows []resourceSample
	for _, row := range rows {
		cpu += row.CPUPercent
		mem += float64(row.MemoryFreePct)
		if row.SwapUsedBytes > out.MaxSwapUsedBytes {
			out.MaxSwapUsedBytes = row.SwapUsedBytes
		}
		if row.BatteryAvailable {
			batteryRows = append(batteryRows, row)
		}
	}
	out.AverageCPUPercent = cpu / float64(len(rows))
	out.AverageMemoryFreePercent = mem / float64(len(rows))
	out.FirstAt = rows[0].CapturedAt.UTC().Format(time.RFC3339)
	out.LastAt = rows[len(rows)-1].CapturedAt.UTC().Format(time.RFC3339)
	if len(batteryRows) > 0 {
		out.BatteryAvailable = true
		out.BatteryStartPercent = batteryRows[0].BatteryPercent
		out.BatteryEndPercent = batteryRows[len(batteryRows)-1].BatteryPercent
	}
	if len(rows) >= 2 {
		first, last := rows[0], rows[len(rows)-1]
		seconds := last.CapturedAt.Sub(first.CapturedAt).Seconds()
		out.DiskReadBytesPerSecond, out.DiskReadRateAvailable = counterRate(first.DiskReadBytes, last.DiskReadBytes, seconds)
		out.DiskWriteBytesPerSecond, out.DiskWriteRateAvailable = counterRate(first.DiskWriteBytes, last.DiskWriteBytes, seconds)
		out.NetworkRXBytesPerSecond, out.NetworkRXRateAvailable = counterRate(first.NetworkRxBytes, last.NetworkRxBytes, seconds)
		out.NetworkTXBytesPerSecond, out.NetworkTXRateAvailable = counterRate(first.NetworkTxBytes, last.NetworkTxBytes, seconds)
	}
	return out
}

func compareResourcePeriods(label string, before, after ResourceHistoryPeriod) ResourceHistoryComparison {
	out := ResourceHistoryComparison{Label: label, Before: before, After: after}
	if before.SampleCount == 0 || after.SampleCount == 0 {
		out.Reason = "Both periods need retained samples; missing evidence is reported rather than interpolated."
		return out
	}
	out.Available = true
	out.AverageCPUPercentDelta = after.AverageCPUPercent - before.AverageCPUPercent
	out.AverageMemoryFreePercentDelta = after.AverageMemoryFreePercent - before.AverageMemoryFreePercent
	out.MaxSwapUsedBytesDelta = storageSignedDelta(after.MaxSwapUsedBytes, before.MaxSwapUsedBytes)
	if before.BatteryAvailable && after.BatteryAvailable {
		out.BatteryDeltaAvailable = true
		out.BatteryPercentDelta = after.BatteryEndPercent - before.BatteryEndPercent
	}
	return out
}

func persistentHistoryGaps(rows []resourceSample, expectedInterval int) ([]PersistentHistoryGap, int64) {
	if expectedInterval < 30 || expectedInterval > 3600 {
		expectedInterval = 60
	}
	threshold := int64(expectedInterval * 3)
	if threshold < 120 {
		threshold = 120
	}
	gaps := []PersistentHistoryGap{}
	for i := 1; i < len(rows); i++ {
		seconds := int64(rows[i].CapturedAt.Sub(rows[i-1].CapturedAt).Seconds())
		if seconds <= threshold {
			continue
		}
		gaps = append(gaps, PersistentHistoryGap{From: rows[i-1].CapturedAt.UTC().Format(time.RFC3339), To: rows[i].CapturedAt.UTC().Format(time.RFC3339), Seconds: seconds})
		if len(gaps) >= 120 {
			break
		}
	}
	return gaps, threshold
}

func buildPersistentHistoryV2Summary(hours int, now time.Time) PersistentHistoryV2Summary {
	if hours < 1 {
		hours = 24
	}
	if hours > 24*30 {
		hours = 24 * 30
	}
	settings := loadPersistentHistorySettings()
	cutoff := now.Add(-time.Duration(hours) * time.Hour)
	rows, limited, err := readPersistentHistoryTail(cutoff)
	out := PersistentHistoryV2Summary{
		Marker: persistentHistoryV2Marker, Enabled: settings.Enabled, RequestedHours: hours,
		SampleCount: len(rows), ExpectedIntervalSeconds: settings.AutoIntervalSeconds, ReadLimited: limited,
		Boundary: "Missing windows mean Sentinel has no retained sample for that interval. They do not establish that the Mac was idle, unchanged, healthy, or unhealthy.",
	}
	if out.ExpectedIntervalSeconds < 30 || out.ExpectedIntervalSeconds > 3600 {
		out.ExpectedIntervalSeconds = 60
	}
	if err != nil {
		out.ReadLimited = true
		out.Boundary += " Read limitation: " + err.Error()
	}
	if len(rows) > 0 {
		out.FirstAt = rows[0].CapturedAt.UTC().Format(time.RFC3339)
		out.LastAt = rows[len(rows)-1].CapturedAt.UTC().Format(time.RFC3339)
	}
	out.MissingWindows, out.GapThresholdSeconds = persistentHistoryGaps(rows, out.ExpectedIntervalSeconds)

	currentHourStart := now.Add(-time.Hour)
	previousHourStart := now.Add(-2 * time.Hour)
	beforeHour := summarizeResourcePeriod("previous hour", samplesBetween(rows, previousHourStart, currentHourStart), previousHourStart, currentHourStart)
	afterHour := summarizeResourcePeriod("latest hour", samplesBetween(rows, currentHourStart, now.Add(time.Nanosecond)), currentHourStart, now)
	out.NowVsPreviousHour = compareResourcePeriods("latest hour vs previous hour", beforeHour, afterHour)

	loc := now.Location()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	yesterdayStart := todayStart.AddDate(0, 0, -1)
	yesterday := summarizeResourcePeriod("yesterday", samplesBetween(rows, yesterdayStart, todayStart), yesterdayStart, todayStart)
	today := summarizeResourcePeriod("today", samplesBetween(rows, todayStart, now.Add(time.Nanosecond)), todayStart, now)
	out.TodayVsYesterday = compareResourcePeriods("today vs yesterday", yesterday, today)

	mid := cutoff.Add(now.Sub(cutoff) / 2)
	beforeWindow := summarizeResourcePeriod("earlier half", samplesBetween(rows, cutoff, mid), cutoff, mid)
	afterWindow := summarizeResourcePeriod("later half", samplesBetween(rows, mid, now.Add(time.Nanosecond)), mid, now)
	out.WindowBeforeAfter = compareResourcePeriods("later half vs earlier half", beforeWindow, afterWindow)
	return out
}

func persistentStorageEnabledFromSources(sources []HistoryFusionSourceStatus) bool {
	for _, source := range sources {
		if source.Source == "storage" {
			return source.Persistent
		}
	}
	return false
}

func buildStorageChangeOverTimeV2(hours int, now time.Time, persistent bool) StorageChangeOverTimeV2 {
	out := StorageChangeOverTimeV2{
		Marker: persistentHistoryV2Marker, Persistent: persistent,
		Boundary: "Storage changes compare explicit completed scan snapshots. Growth or shrinkage is not a cause claim and is not a deletion recommendation.",
	}
	if !persistent {
		out.Limitations = []string{"ephemeral storage history is memory-only; this serialization layer does not read persistent storage state in ephemeral mode"}
		return out
	}
	path := storageHistoryPath()
	if path == "" {
		out.Limitations = []string{"storage history path unavailable"}
		return out
	}
	var env storageHistoryEnvelope
	if err := readGzipJSON(path, &env); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			out.Limitations = []string{fmt.Sprintf("storage history could not be read: %v", err)}
		}
		return out
	}
	if env.Version != SentinelSchemaV23 {
		out.Limitations = []string{"storage history schema was not recognized"}
		return out
	}
	if len(env.Snapshots) > storageSnapshotHistoryLimit {
		env.Snapshots = env.Snapshots[len(env.Snapshots)-storageSnapshotHistoryLimit:]
		out.Partial = true
		out.Limitations = append(out.Limitations, "storage snapshot history exceeded its configured retention bound")
	}
	sort.SliceStable(env.Snapshots, func(i, j int) bool { return env.Snapshots[i].CreatedAt < env.Snapshots[j].CreatedAt })
	out.SnapshotCount = len(env.Snapshots)
	cutoff := now.Add(-time.Duration(hours) * time.Hour)
	for _, snapshot := range env.Snapshots {
		if !time.Unix(snapshot.CreatedAt, 0).Before(cutoff) {
			out.WindowSnapshotCount++
		}
	}
	for i := 1; i < len(env.Snapshots); i++ {
		before, after := env.Snapshots[i-1], env.Snapshots[i]
		if time.Unix(after.CreatedAt, 0).Before(cutoff) {
			continue
		}
		cmp := CompareStorageSnapshots(before, after)
		out.Comparisons = append(out.Comparisons, cmp)
		out.Partial = out.Partial || cmp.Partial
		for _, limitation := range cmp.Limitations {
			out.Limitations = appendUniqueString(out.Limitations, limitation)
		}
	}
	if len(out.Comparisons) > persistentHistoryV2MaxStorage {
		out.Comparisons = append([]StorageComparison(nil), out.Comparisons[len(out.Comparisons)-persistentHistoryV2MaxStorage:]...)
		out.Partial = true
		out.Limitations = appendUniqueString(out.Limitations, fmt.Sprintf("comparison output bounded to the latest %d adjacent snapshot pairs", persistentHistoryV2MaxStorage))
	}
	out.Available = len(out.Comparisons) > 0
	return out
}
