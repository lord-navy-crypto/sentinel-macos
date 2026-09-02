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
	"time"
)

const macHealthStorageMarker = "Sentinel 2.8 Mac Health + Lazy Storage Graph"

func commandText(ctx context.Context, name string, args ...string) (string, string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	return string(out), stderr.String(), err
}

func parseVMStat(raw string) map[string]uint64 {
	result := map[string]uint64{}
	pageSize := uint64(4096)
	if i := strings.Index(raw, "page size of "); i >= 0 {
		rest := raw[i+len("page size of "):]
		fields := strings.Fields(rest)
		if len(fields) > 0 {
			if n, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
				pageSize = n
			}
		}
	}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(strings.TrimSuffix(parts[1], "."))
		if n, err := strconv.ParseUint(value, 10, 64); err == nil {
			result[key] = n * pageSize
		}
	}
	result["page_size"] = pageSize
	return result
}

func parseBattery(raw string) map[string]any {
	out := map[string]any{"available": false}
	re := regexp.MustCompile(`([0-9]{1,3})%`)
	if m := re.FindStringSubmatch(raw); len(m) == 2 {
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

func (a *app) handleMacHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	result := map[string]any{"marker": macHealthStorageMarker, "captured_at": time.Now().UTC().Format(time.RFC3339), "logical_cpus": runtime.NumCPU()}

	if raw, _, err := commandText(ctx, "/bin/ps", "-A", "-o", "%cpu="); err == nil {
		total := 0.0
		for _, line := range strings.Fields(raw) {
			if v, err := strconv.ParseFloat(line, 64); err == nil {
				total += v
			}
		}
		normalized := total / float64(max(1, runtime.NumCPU()))
		if normalized > 100 {
			normalized = 100
		}
		result["cpu"] = map[string]any{"process_cpu_sum_percent": total, "normalized_percent": normalized}
	}
	if raw, _, err := commandText(ctx, "/usr/bin/vm_stat"); err == nil {
		vm := parseVMStat(raw)
		free := vm["Pages free"] + vm["Pages speculative"]
		active := vm["Pages active"]
		wired := vm["Pages wired down"]
		compressed := vm["Pages occupied by compressor"]
		result["memory"] = map[string]any{"free_bytes": free, "active_bytes": active, "wired_bytes": wired, "compressed_bytes": compressed, "swap_note": "Use compressed + swap together when diagnosing sustained memory pressure."}
	}
	if raw, _, err := commandText(ctx, "/usr/bin/memory_pressure", "-Q"); err == nil {
		re := regexp.MustCompile(`System-wide memory free percentage:\s*([0-9]+)%`)
		if m := re.FindStringSubmatch(raw); len(m) == 2 {
			if n, err := strconv.Atoi(m[1]); err == nil {
				result["memory_free_percent"] = n
			}
		}
	}
	if raw, _, err := commandText(ctx, "/usr/bin/pmset", "-g", "batt"); err == nil {
		result["battery"] = parseBattery(raw)
	}
	if raw, _, err := commandText(ctx, "/usr/bin/uptime"); err == nil {
		result["uptime"] = strings.TrimSpace(raw)
	}
	writeJSON(w, http.StatusOK, result)
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
	raw, stderr, runErr := commandText(ctx, "/usr/bin/du", "-sk", "-d", "1", clean)
	if ctx.Err() != nil {
		writeJSON(w, http.StatusRequestTimeout, map[string]any{"error": "Storage Graph directory measurement exceeded the 18-second bound", "path": clean})
		return
	}
	nodes := []storageGraphNode{}
	parentBytes := int64(0)
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.SplitN(line, "\t", 2)
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
	writeJSON(w, http.StatusOK, map[string]any{"marker": macHealthStorageMarker, "path": clean, "name": filepath.Base(clean), "bytes": parentBytes, "children": nodes, "hidden_children": hidden, "limited": limited, "detail": func() string {
		if limited {
			return "Some entries could not be measured because of permissions or filesystem boundaries."
		}
		return "Measured with a bounded, read-only macOS directory-size query."
	}()})
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
