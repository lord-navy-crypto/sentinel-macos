// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"context"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const macObservatoryMarker = "Sentinel 2.8 Everyday Mac Observatory"
const observatoryHistoryLimit = 120

type resourceProcess struct {
	PID     int     `json:"pid"`
	CPU     float64 `json:"cpu_percent"`
	Memory  float64 `json:"memory_percent"`
	Command string  `json:"command"`
}

type resourceSample struct {
	CapturedAt        string            `json:"captured_at"`
	CPUPercent        float64           `json:"cpu_percent"`
	MemoryFreePercent int               `json:"memory_free_percent,omitempty"`
	MemoryFreeBytes   uint64            `json:"memory_free_bytes,omitempty"`
	MemoryActiveBytes uint64            `json:"memory_active_bytes,omitempty"`
	MemoryWiredBytes  uint64            `json:"memory_wired_bytes,omitempty"`
	MemoryCompressed  uint64            `json:"memory_compressed_bytes,omitempty"`
	Battery           map[string]any    `json:"battery,omitempty"`
	Uptime            string            `json:"uptime,omitempty"`
	PowerAssertions   []string          `json:"power_assertions,omitempty"`
	NetworkInBytes    uint64            `json:"network_in_bytes,omitempty"`
	NetworkOutBytes   uint64            `json:"network_out_bytes,omitempty"`
	NetworkInBPS      float64           `json:"network_in_bytes_per_second,omitempty"`
	NetworkOutBPS     float64           `json:"network_out_bytes_per_second,omitempty"`
	TopProcesses      []resourceProcess `json:"top_processes,omitempty"`
	Limitations       []string          `json:"limitations,omitempty"`
}

type resourceObservatory struct {
	mu      sync.Mutex
	history []resourceSample
}

func newResourceObservatory() *resourceObservatory { return &resourceObservatory{} }

func observatoryCommand(ctx context.Context, name string, args ...string) (string, string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	return string(out), stderr.String(), err
}

func parseVMStatObservatory(raw string) map[string]uint64 {
	result := map[string]uint64{}
	pageSize := uint64(4096)
	if i := strings.Index(raw, "page size of "); i >= 0 {
		fields := strings.Fields(raw[i+len("page size of "):])
		if len(fields) > 0 {
			if n, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
				pageSize = n
			}
		}
	}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		parts := strings.SplitN(scanner.Text(), ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(strings.TrimSuffix(parts[1], "."))
		if n, err := strconv.ParseUint(value, 10, 64); err == nil {
			result[key] = n * pageSize
		}
	}
	return result
}

func parseBatteryObservatory(raw string) map[string]any {
	out := map[string]any{"available": false}
	if m := regexp.MustCompile(`([0-9]{1,3})%`).FindStringSubmatch(raw); len(m) == 2 {
		pct, _ := strconv.Atoi(m[1])
		out["available"] = true
		out["charge_percent"] = pct
	}
	lower := strings.ToLower(raw)
	out["charging"] = strings.Contains(lower, "charging") && !strings.Contains(lower, "not charging")
	out["charged"] = strings.Contains(lower, "charged")
	out["ac_power"] = strings.Contains(lower, "ac power")
	out["raw_state"] = strings.TrimSpace(raw)
	return out
}

func parseProcessSample(raw string) (float64, []resourceProcess) {
	rows := []resourceProcess{}
	total := 0.0
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 4 {
			continue
		}
		pid, err1 := strconv.Atoi(fields[0])
		cpu, err2 := strconv.ParseFloat(fields[1], 64)
		mem, err3 := strconv.ParseFloat(fields[2], 64)
		if err1 != nil || err2 != nil || err3 != nil {
			continue
		}
		command := strings.Join(fields[3:], " ")
		total += cpu
		rows = append(rows, resourceProcess{PID: pid, CPU: cpu, Memory: mem, Command: command})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].CPU == rows[j].CPU {
			return rows[i].Memory > rows[j].Memory
		}
		return rows[i].CPU > rows[j].CPU
	})
	if len(rows) > 8 {
		rows = rows[:8]
	}
	return total, rows
}

func parsePowerAssertions(raw string) []string {
	items := []string{}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		lower := strings.ToLower(line)
		if strings.Contains(lower, "preventusersystemsleep") || strings.Contains(lower, "preventuserdisplaysleep") || strings.Contains(lower, "preventsystemsleep") {
			items = append(items, line)
		}
	}
	if len(items) > 12 {
		items = items[:12]
	}
	return items
}

func parseNetworkCounters(raw string) (uint64, uint64) {
	var inTotal, outTotal uint64
	seen := map[string]bool{}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 10 || fields[0] == "Name" {
			continue
		}
		iface := fields[0]
		if iface == "lo0" || seen[iface] {
			continue
		}
		nums := []uint64{}
		for _, f := range fields[1:] {
			if n, err := strconv.ParseUint(f, 10, 64); err == nil {
				nums = append(nums, n)
			}
		}
		if len(nums) < 2 {
			continue
		}
		inTotal += nums[len(nums)-2]
		outTotal += nums[len(nums)-1]
		seen[iface] = true
	}
	return inTotal, outTotal
}

func (o *resourceObservatory) append(sample resourceSample) resourceSample {
	o.mu.Lock()
	defer o.mu.Unlock()
	if len(o.history) > 0 {
		prev := o.history[len(o.history)-1]
		pt, e1 := time.Parse(time.RFC3339Nano, prev.CapturedAt)
		ct, e2 := time.Parse(time.RFC3339Nano, sample.CapturedAt)
		if e1 == nil && e2 == nil {
			seconds := ct.Sub(pt).Seconds()
			if seconds > 0 {
				if sample.NetworkInBytes >= prev.NetworkInBytes {
					sample.NetworkInBPS = float64(sample.NetworkInBytes-prev.NetworkInBytes) / seconds
				}
				if sample.NetworkOutBytes >= prev.NetworkOutBytes {
					sample.NetworkOutBPS = float64(sample.NetworkOutBytes-prev.NetworkOutBytes) / seconds
				}
			}
		}
	}
	o.history = append(o.history, sample)
	if len(o.history) > observatoryHistoryLimit {
		o.history = append([]resourceSample(nil), o.history[len(o.history)-observatoryHistoryLimit:]...)
	}
	return sample
}

func (o *resourceObservatory) snapshot() []resourceSample {
	o.mu.Lock()
	defer o.mu.Unlock()
	return append([]resourceSample(nil), o.history...)
}

func (a *app) captureResourceSample(r *http.Request) resourceSample {
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()
	s := resourceSample{CapturedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	if raw, stderr, err := observatoryCommand(ctx, "/bin/ps", "-A", "-o", "pid=,%cpu=,%mem=,comm="); err == nil {
		total, top := parseProcessSample(raw)
		cpus := float64(runtime.NumCPU())
		if cpus < 1 {
			cpus = 1
		}
		s.CPUPercent = total / cpus
		if s.CPUPercent > 100 {
			s.CPUPercent = 100
		}
		s.TopProcesses = top
	} else {
		s.Limitations = append(s.Limitations, "Process CPU sample unavailable: "+strings.TrimSpace(stderr))
	}
	if raw, _, err := observatoryCommand(ctx, "/usr/bin/vm_stat"); err == nil {
		vm := parseVMStatObservatory(raw)
		s.MemoryFreeBytes = vm["Pages free"] + vm["Pages speculative"]
		s.MemoryActiveBytes = vm["Pages active"]
		s.MemoryWiredBytes = vm["Pages wired down"]
		s.MemoryCompressed = vm["Pages occupied by compressor"]
	}
	if raw, _, err := observatoryCommand(ctx, "/usr/bin/memory_pressure", "-Q"); err == nil {
		if m := regexp.MustCompile(`System-wide memory free percentage:\s*([0-9]+)%`).FindStringSubmatch(raw); len(m) == 2 {
			s.MemoryFreePercent, _ = strconv.Atoi(m[1])
		}
	}
	if raw, _, err := observatoryCommand(ctx, "/usr/bin/pmset", "-g", "batt"); err == nil {
		s.Battery = parseBatteryObservatory(raw)
	}
	if raw, _, err := observatoryCommand(ctx, "/usr/bin/pmset", "-g", "assertions"); err == nil {
		s.PowerAssertions = parsePowerAssertions(raw)
	}
	if raw, _, err := observatoryCommand(ctx, "/usr/bin/uptime"); err == nil {
		s.Uptime = strings.TrimSpace(raw)
	}
	if raw, _, err := observatoryCommand(ctx, "/usr/sbin/netstat", "-ibn"); err == nil {
		s.NetworkInBytes, s.NetworkOutBytes = parseNetworkCounters(raw)
	}
	return a.observatory.append(s)
}

func (a *app) handleMacObservatory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	s := a.captureResourceSample(r)
	writeJSON(w, http.StatusOK, map[string]any{"marker": macObservatoryMarker, "sample": s, "history_points": len(a.observatory.snapshot()), "history_limit": observatoryHistoryLimit, "note": "Read-only bounded resource evidence. Trends describe observed load and pressure; they are not a hardware-health certificate."})
}

func (a *app) handleMacObservatoryHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"marker": macObservatoryMarker, "samples": a.observatory.snapshot(), "history_limit": observatoryHistoryLimit})
}

type storageGraphNode struct {
	Name    string  `json:"name"`
	Path    string  `json:"path"`
	Bytes   int64   `json:"bytes"`
	IsDir   bool    `json:"is_dir"`
	Percent float64 `json:"percent"`
}

func (a *app) handleStorageGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	requested := strings.TrimSpace(r.URL.Query().Get("path"))
	if requested == "" {
		requested, _ = os.UserHomeDir()
	}
	clean, err := filepath.Abs(filepath.Clean(requested))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid path"})
		return
	}
	info, err := os.Stat(clean)
	if err != nil {
		writeJSON(w, 404, map[string]any{"error": err.Error()})
		return
	}
	if !info.IsDir() {
		writeJSON(w, 400, map[string]any{"error": "Storage Graph expands directories only"})
		return
	}
	limit := 24
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 6 && n <= 60 {
			limit = n
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 18*time.Second)
	defer cancel()
	raw, stderr, runErr := observatoryCommand(ctx, "/usr/bin/du", "-sk", "-d", "1", clean)
	if ctx.Err() != nil {
		writeJSON(w, http.StatusRequestTimeout, map[string]any{"error": "Storage Graph directory measurement exceeded the 18-second bound", "path": clean})
		return
	}
	nodes := []storageGraphNode{}
	parentBytes := int64(0)
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		fields := strings.SplitN(scanner.Text(), "\t", 2)
		if len(fields) != 2 {
			continue
		}
		kb, err := strconv.ParseInt(strings.TrimSpace(fields[0]), 10, 64)
		if err != nil {
			continue
		}
		p := strings.TrimSpace(fields[1])
		b := kb * 1024
		if filepath.Clean(p) == clean {
			parentBytes = b
			continue
		}
		st, statErr := os.Stat(p)
		nodes = append(nodes, storageGraphNode{Name: filepath.Base(p), Path: p, Bytes: b, IsDir: statErr == nil && st.IsDir()})
	}
	sort.Slice(nodes, func(i, j int) bool { return nodes[i].Bytes > nodes[j].Bytes })
	if parentBytes <= 0 {
		for _, n := range nodes {
			parentBytes += n.Bytes
		}
	}
	for i := range nodes {
		if parentBytes > 0 {
			nodes[i].Percent = float64(nodes[i].Bytes) * 100 / float64(parentBytes)
		}
	}
	hidden := 0
	if len(nodes) > limit {
		hidden = len(nodes) - limit
		nodes = nodes[:limit]
	}
	limited := strings.TrimSpace(stderr) != "" || runErr != nil
	writeJSON(w, http.StatusOK, map[string]any{"marker": macObservatoryMarker, "path": clean, "name": filepath.Base(clean), "bytes": parentBytes, "children": nodes, "hidden_children": hidden, "limited": limited, "detail": func() string {
		if limited {
			return "Some entries could not be measured because of permissions or filesystem boundaries."
		}
		return "Measured with a bounded, read-only directory-size query."
	}()})
}
