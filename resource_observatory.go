// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const resourceObservatoryMarker = "Sentinel 3.0 Resource Observatory Ultra"

type resourceProcess struct {
	PID     int     `json:"pid"`
	CPU     float64 `json:"cpu_percent"`
	RSS     uint64  `json:"rss_bytes"`
	Command string  `json:"command"`
}

type resourceSample struct {
	CapturedAt       time.Time         `json:"captured_at"`
	CPUPercent       float64           `json:"cpu_percent"`
	MemoryFreePct    int               `json:"memory_free_percent"`
	CompressedBytes  uint64            `json:"compressed_bytes"`
	WiredBytes       uint64            `json:"wired_bytes"`
	SwapUsedBytes    uint64            `json:"swap_used_bytes"`
	DiskReadBytes    uint64            `json:"disk_read_bytes"`
	DiskWriteBytes   uint64            `json:"disk_write_bytes"`
	NetworkRxBytes   uint64            `json:"network_rx_bytes"`
	NetworkTxBytes   uint64            `json:"network_tx_bytes"`
	BatteryPercent   int               `json:"battery_percent"`
	BatteryAvailable bool              `json:"battery_available"`
	BatteryCharging  bool              `json:"battery_charging"`
	BatteryAC        bool              `json:"battery_ac"`
	BatteryCycle     int               `json:"battery_cycle_count,omitempty"`
	BatteryCondition string            `json:"battery_condition,omitempty"`
	TopCPU           []resourceProcess `json:"top_cpu"`
	TopMemory        []resourceProcess `json:"top_memory"`
	PreventingSleep  []string          `json:"preventing_sleep,omitempty"`
	Limited          []string          `json:"limited,omitempty"`
}

type resourceHistoryStore struct {
	mu      sync.Mutex
	samples []resourceSample
}

var resourceHistory = &resourceHistoryStore{samples: make([]resourceSample, 0, 720)}

func (s *resourceHistoryStore) add(sample resourceSample) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.samples = append(s.samples, sample)
	cutoff := time.Now().Add(-6 * time.Hour)
	first := 0
	for first < len(s.samples) && s.samples[first].CapturedAt.Before(cutoff) {
		first++
	}
	if first > 0 {
		s.samples = append([]resourceSample(nil), s.samples[first:]...)
	}
	if len(s.samples) > 1440 {
		s.samples = append([]resourceSample(nil), s.samples[len(s.samples)-1440:]...)
	}
}

func (s *resourceHistoryStore) since(window time.Duration) []resourceSample {
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := time.Now().Add(-window)
	out := make([]resourceSample, 0, len(s.samples))
	for _, sample := range s.samples {
		if !sample.CapturedAt.Before(cutoff) {
			out = append(out, sample)
		}
	}
	return out
}

func parsePSRows(raw string) []resourceProcess {
	rows := make([]resourceProcess, 0, 64)
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		pid, err1 := strconv.Atoi(fields[0])
		cpu, err2 := strconv.ParseFloat(fields[1], 64)
		rssKB, err3 := strconv.ParseUint(fields[2], 10, 64)
		if err1 != nil || err2 != nil || err3 != nil {
			continue
		}
		rows = append(rows, resourceProcess{PID: pid, CPU: cpu, RSS: rssKB * 1024, Command: strings.Join(fields[3:], " ")})
	}
	return rows
}

func topProcesses(rows []resourceProcess, byMemory bool, limit int) []resourceProcess {
	copyRows := append([]resourceProcess(nil), rows...)
	sort.Slice(copyRows, func(i, j int) bool {
		if byMemory {
			return copyRows[i].RSS > copyRows[j].RSS
		}
		return copyRows[i].CPU > copyRows[j].CPU
	})
	if len(copyRows) > limit {
		copyRows = copyRows[:limit]
	}
	return copyRows
}

func parseSwapUsage(raw string) uint64 {
	lower := strings.ToLower(raw)
	i := strings.Index(lower, "used =")
	if i < 0 {
		return 0
	}
	fields := strings.Fields(raw[i+len("used ="):])
	if len(fields) == 0 {
		return 0
	}
	v := strings.TrimRight(fields[0], "MGTB")
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0
	}
	unit := strings.TrimPrefix(fields[0], v)
	mult := float64(1)
	switch unit {
	case "M":
		mult = 1024 * 1024
	case "G":
		mult = 1024 * 1024 * 1024
	case "T":
		mult = 1024 * 1024 * 1024 * 1024
	}
	return uint64(n * mult)
}

func parseNetstatBytes(raw string) (uint64, uint64) {
	var rx, tx uint64
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 10 || strings.HasPrefix(fields[0], "Name") || strings.HasPrefix(fields[0], "lo") {
			continue
		}
		// macOS netstat -ib commonly exposes Ibytes/OBytes near the end. Scan all
		// numeric fields and use the largest two cumulative counters conservatively.
		nums := make([]uint64, 0, 8)
		for _, f := range fields {
			if n, err := strconv.ParseUint(f, 10, 64); err == nil {
				nums = append(nums, n)
			}
		}
		if len(nums) >= 2 {
			rx += nums[len(nums)-2]
			tx += nums[len(nums)-1]
		}
	}
	return rx, tx
}

func parseIOStatBytes(raw string) (uint64, uint64) {
	// iostat output varies across macOS releases. Sum the first two numeric
	// counters from data rows as cumulative evidence; callers label this limited
	// when the expected rows are unavailable.
	var read, write uint64
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 || strings.Contains(scanner.Text(), "disk") || strings.Contains(scanner.Text(), "KB/t") {
			continue
		}
		nums := []float64{}
		for _, f := range fields {
			if n, err := strconv.ParseFloat(f, 64); err == nil {
				nums = append(nums, n)
			}
		}
		if len(nums) >= 2 {
			read += uint64(nums[0] * 1024)
			write += uint64(nums[1] * 1024)
		}
	}
	return read, write
}

func parsePowerData(raw string) (cycle int, condition string) {
	var root any
	if json.Unmarshal([]byte(raw), &root) != nil {
		return 0, ""
	}
	var walk func(any)
	walk = func(v any) {
		switch x := v.(type) {
		case map[string]any:
			for k, val := range x {
				lk := strings.ToLower(k)
				if cycle == 0 && strings.Contains(lk, "cycle") {
					switch n := val.(type) {
					case float64:
						cycle = int(n)
					case string:
						cycle, _ = strconv.Atoi(n)
					}
				}
				if condition == "" && strings.Contains(lk, "condition") {
					if s, ok := val.(string); ok {
						condition = s
					}
				}
				walk(val)
			}
		case []any:
			for _, item := range x {
				walk(item)
			}
		}
	}
	walk(root)
	return cycle, condition
}

func preventingSleepAssertions(raw string) []string {
	lines := []string{}
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if strings.Contains(lower, "preventusersystemsleep") || strings.Contains(lower, "preventsystemsleep") || strings.Contains(lower, "preventdisplay") {
			lines = append(lines, trimmed)
		}
	}
	if len(lines) > 12 {
		lines = lines[:12]
	}
	return lines
}

func captureResourceSample(ctx context.Context) resourceSample {
	sample := resourceSample{CapturedAt: time.Now().UTC(), MemoryFreePct: -1, BatteryPercent: -1}
	limited := []string{}

	if raw, _, err := commandText(ctx, "/bin/ps", "-A", "-o", "pid=,%cpu=,rss=,comm="); err == nil {
		rows := parsePSRows(raw)
		totalCPU := 0.0
		for _, row := range rows {
			totalCPU += row.CPU
		}
		sample.CPUPercent = totalCPU / float64(max(1, runtime.NumCPU()))
		if sample.CPUPercent > 100 {
			sample.CPUPercent = 100
		}
		sample.TopCPU = topProcesses(rows, false, 10)
		sample.TopMemory = topProcesses(rows, true, 10)
	} else {
		limited = append(limited, "process snapshot unavailable")
	}

	if raw, _, err := commandText(ctx, "/usr/bin/vm_stat"); err == nil {
		vm := parseVMStat(raw)
		sample.CompressedBytes = vm["Pages occupied by compressor"]
		sample.WiredBytes = vm["Pages wired down"]
	} else {
		limited = append(limited, "vm_stat unavailable")
	}
	if raw, _, err := commandText(ctx, "/usr/bin/memory_pressure", "-Q"); err == nil {
		re := regexpMemoryFree()
		if m := re.FindStringSubmatch(raw); len(m) == 2 {
			sample.MemoryFreePct, _ = strconv.Atoi(m[1])
		}
	} else {
		limited = append(limited, "memory pressure unavailable")
	}
	if raw, _, err := commandText(ctx, "/usr/sbin/sysctl", "vm.swapusage"); err == nil {
		sample.SwapUsedBytes = parseSwapUsage(raw)
	}
	if raw, _, err := commandText(ctx, "/usr/sbin/netstat", "-ib"); err == nil {
		sample.NetworkRxBytes, sample.NetworkTxBytes = parseNetstatBytes(raw)
	} else {
		limited = append(limited, "network counters unavailable")
	}
	if raw, _, err := commandText(ctx, "/usr/sbin/iostat", "-Id"); err == nil {
		sample.DiskReadBytes, sample.DiskWriteBytes = parseIOStatBytes(raw)
	} else {
		limited = append(limited, "disk counters unavailable")
	}
	if raw, _, err := commandText(ctx, "/usr/bin/pmset", "-g", "batt"); err == nil {
		b := parseBattery(raw)
		sample.BatteryAvailable, _ = b["available"].(bool)
		if n, ok := b["charge_percent"].(int); ok {
			sample.BatteryPercent = n
		}
		sample.BatteryCharging, _ = b["charging"].(bool)
		sample.BatteryAC, _ = b["ac_power"].(bool)
	}
	if raw, _, err := commandText(ctx, "/usr/sbin/system_profiler", "SPPowerDataType", "-json"); err == nil {
		sample.BatteryCycle, sample.BatteryCondition = parsePowerData(raw)
	} else if sample.BatteryAvailable {
		limited = append(limited, "battery cycle/condition unavailable")
	}
	if raw, _, err := commandText(ctx, "/usr/bin/pmset", "-g", "assertions"); err == nil {
		sample.PreventingSleep = preventingSleepAssertions(raw)
	}
	sample.Limited = limited
	return sample
}

func regexpMemoryFree() *regexp.Regexp {
	return regexp.MustCompile(`System-wide memory free percentage:\s*([0-9]+)%`)
}

func resourceWindow(raw string) time.Duration {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "5m":
		return 5 * time.Minute
	case "30m":
		return 30 * time.Minute
	case "6h":
		return 6 * time.Hour
	default:
		return time.Hour
	}
}

func resourceExplanation(sample resourceSample, mode string) map[string]any {
	observed := []string{}
	contributors := []resourceProcess{}
	interpretation := "No single retained observation is sufficient to establish a performance problem."
	if sample.CPUPercent >= 80 {
		observed = append(observed, "CPU activity is currently high.")
		contributors = append(contributors, sample.TopCPU...)
	}
	if sample.MemoryFreePct >= 0 && sample.MemoryFreePct <= 15 {
		observed = append(observed, "System-reported free memory percentage is low; read this together with compression and swap.")
	}
	if sample.SwapUsedBytes >= 1<<30 {
		observed = append(observed, "Swap usage is substantial and may be relevant if it is also growing over time.")
	}
	if sample.CompressedBytes >= 2<<30 {
		observed = append(observed, "Compressed memory is substantial.")
	}
	if len(observed) >= 2 {
		interpretation = "The current evidence is consistent with combined resource pressure. Compare the history before attributing cause."
	} else if len(observed) == 1 {
		interpretation = "One current resource signal deserves attention, but it does not establish a root cause by itself."
	}
	if mode == "battery" {
		observed = []string{}
		contributors = sample.TopCPU
		if sample.BatteryAvailable {
			observed = append(observed, "Battery state is available for this Mac.")
		}
		if len(sample.PreventingSleep) > 0 {
			observed = append(observed, "One or more power assertions may be preventing normal sleep behavior.")
		}
		if sample.CPUPercent >= 60 {
			observed = append(observed, "CPU activity is elevated, which can contribute to energy use.")
		}
		interpretation = "These observations can explain contributors to energy use, but Sentinel does not fabricate Apple's private Energy Impact metric."
	}
	if len(contributors) > 6 {
		contributors = contributors[:6]
	}
	return map[string]any{
		"mode":            mode,
		"observed":        observed,
		"interpretation":  interpretation,
		"contributors":    contributors,
		"not_established": "These observations alone do not establish hardware failure, malware, or a definitive root cause.",
	}
}

func (a *app) handleResourceCurrent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 7*time.Second)
	defer cancel()
	sample := captureResourceSample(ctx)
	resourceHistory.add(sample)
	writeJSON(w, http.StatusOK, map[string]any{"marker": resourceObservatoryMarker, "sample": sample})
}

func (a *app) handleResourceHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	window := resourceWindow(r.URL.Query().Get("window"))
	rows := resourceHistory.since(window)
	writeJSON(w, http.StatusOK, map[string]any{"marker": resourceObservatoryMarker, "window_seconds": int(window.Seconds()), "samples": rows, "count": len(rows), "retention": "session-local, bounded to six hours"})
}

func (a *app) handleResourceExplain(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 7*time.Second)
	defer cancel()
	sample := captureResourceSample(ctx)
	resourceHistory.add(sample)
	mode := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("mode")))
	if mode != "battery" {
		mode = "slow"
	}
	writeJSON(w, http.StatusOK, map[string]any{"marker": resourceObservatoryMarker, "sample": sample, "explanation": resourceExplanation(sample, mode)})
}
