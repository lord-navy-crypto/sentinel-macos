// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const maintenanceUltraMarker = "Sentinel 3.1 Maintenance Intelligence Ultra"

var errMaintenanceBound = errors.New("maintenance scan bound reached")

type maintenanceFile struct {
	Path    string    `json:"path"`
	Name    string    `json:"name"`
	Bytes   int64     `json:"bytes"`
	ModTime time.Time `json:"modified_at"`
}

type duplicateGroup struct {
	SHA256                string   `json:"sha256"`
	BytesPerFile          int64    `json:"bytes_per_file"`
	Paths                 []string `json:"paths"`
	ReclaimableIfReviewed int64    `json:"reclaimable_if_reviewed_bytes"`
}

type appFootprintItem struct {
	Path       string `json:"path"`
	Bytes      int64  `json:"bytes"`
	Evidence   string `json:"evidence"`
	Confidence string `json:"confidence"`
}

type persistentHistorySettings struct {
	Enabled             bool `json:"enabled"`
	AutoIntervalSeconds int  `json:"auto_interval_seconds"`
}

func maintenanceAbsDir(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		raw, _ = os.UserHomeDir()
	}
	p, err := filepath.Abs(filepath.Clean(raw))
	if err != nil {
		return "", err
	}
	st, err := os.Stat(p)
	if err != nil {
		return "", err
	}
	if !st.IsDir() {
		return "", errors.New("directory required")
	}
	return p, nil
}

func boundedWalk(root string, deadline time.Time, maxEntries int, visit func(string, os.DirEntry, os.FileInfo) error) (int, bool, error) {
	visited := 0
	limited := false
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if time.Now().After(deadline) || visited >= maxEntries {
			limited = true
			return errMaintenanceBound
		}
		if walkErr != nil {
			limited = true
			if d != nil && d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		visited++
		if path == root {
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		info, err := d.Info()
		if err != nil {
			limited = true
			return nil
		}
		return visit(path, d, info)
	})
	if errors.Is(err, errMaintenanceBound) {
		return visited, true, nil
	}
	return visited, limited, err
}

func queryInt(r *http.Request, name string, def, min, max int) int {
	n, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get(name)))
	if err != nil || n < min || n > max {
		return def
	}
	return n
}

func (a *app) handleLargeFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	root, err := maintenanceAbsDir(r.URL.Query().Get("path"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	minMB := queryInt(r, "min_mb", 500, 1, 102400)
	limit := queryInt(r, "limit", 100, 10, 500)
	maxEntries := queryInt(r, "max_entries", 50000, 1000, 200000)
	deadline := time.Now().Add(15 * time.Second)
	rows := []maintenanceFile{}
	visited, limited, walkErr := boundedWalk(root, deadline, maxEntries, func(path string, d os.DirEntry, info os.FileInfo) error {
		if !d.IsDir() && info.Mode().IsRegular() && info.Size() >= int64(minMB)*1024*1024 {
			rows = append(rows, maintenanceFile{Path: path, Name: d.Name(), Bytes: info.Size(), ModTime: info.ModTime()})
		}
		return nil
	})
	if walkErr != nil {
		writeJSON(w, 500, map[string]any{"error": walkErr.Error()})
		return
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Bytes > rows[j].Bytes })
	if len(rows) > limit {
		rows = rows[:limit]
		limited = true
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"marker": maintenanceUltraMarker, "path": root, "minimum_bytes": int64(minMB) * 1024 * 1024,
		"files": rows, "visited_entries": visited, "limited": limited,
		"detail": "Read-only bounded walk. Results are large-file candidates, not deletion recommendations.",
	})
}

func hashFileBounded(path string, deadline time.Time) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	buf := make([]byte, 1024*1024)
	for {
		if time.Now().After(deadline) {
			return "", errMaintenanceBound
		}
		n, readErr := f.Read(buf)
		if n > 0 {
			if _, err := h.Write(buf[:n]); err != nil {
				return "", err
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return "", readErr
		}
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (a *app) handleDuplicateExplorer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	root, err := maintenanceAbsDir(r.URL.Query().Get("path"))
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	minMB := queryInt(r, "min_mb", 10, 1, 102400)
	maxEntries := queryInt(r, "max_entries", 40000, 1000, 150000)
	maxHashFiles := queryInt(r, "max_hash_files", 400, 20, 1500)
	deadline := time.Now().Add(22 * time.Second)
	bySize := map[int64][]string{}
	visited, limited, walkErr := boundedWalk(root, deadline, maxEntries, func(path string, d os.DirEntry, info os.FileInfo) error {
		if !d.IsDir() && info.Mode().IsRegular() && info.Size() >= int64(minMB)*1024*1024 {
			bySize[info.Size()] = append(bySize[info.Size()], path)
		}
		return nil
	})
	if walkErr != nil {
		writeJSON(w, 500, map[string]any{"error": walkErr.Error()})
		return
	}
	type candidate struct {
		size int64
		path string
	}
	candidates := []candidate{}
	for size, paths := range bySize {
		if len(paths) < 2 {
			continue
		}
		for _, p := range paths {
			candidates = append(candidates, candidate{size: size, path: p})
		}
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].size > candidates[j].size })
	if len(candidates) > maxHashFiles {
		candidates = candidates[:maxHashFiles]
		limited = true
	}
	type hashKey struct {
		size int64
		hash string
	}
	byHash := map[hashKey][]string{}
	hashed := 0
	for _, c := range candidates {
		hash, err := hashFileBounded(c.path, deadline)
		if errors.Is(err, errMaintenanceBound) {
			limited = true
			break
		}
		if err != nil {
			limited = true
			continue
		}
		hashed++
		key := hashKey{size: c.size, hash: hash}
		byHash[key] = append(byHash[key], c.path)
	}
	groups := []duplicateGroup{}
	for key, paths := range byHash {
		if len(paths) < 2 {
			continue
		}
		groups = append(groups, duplicateGroup{SHA256: key.hash, BytesPerFile: key.size, Paths: paths, ReclaimableIfReviewed: int64(len(paths)-1) * key.size})
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].ReclaimableIfReviewed > groups[j].ReclaimableIfReviewed })
	writeJSON(w, http.StatusOK, map[string]any{
		"marker": maintenanceUltraMarker, "path": root, "groups": groups, "visited_entries": visited,
		"hashed_files": hashed, "limited": limited,
		"definition": "Duplicate means full-file SHA-256 equality among the files that completed hashing. Same name or same size alone is never labeled duplicate.",
	})
}

func directoryBytes(ctx context.Context, path string) int64 {
	st, err := os.Stat(path)
	if err != nil {
		return 0
	}
	if !st.IsDir() {
		return st.Size()
	}
	raw, _, err := commandText(ctx, "/usr/bin/du", "-sk", path)
	if err != nil {
		return 0
	}
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return 0
	}
	kb, _ := strconv.ParseInt(fields[0], 10, 64)
	return kb * 1024
}

func appBundleID(ctx context.Context, appPath string) string {
	info := filepath.Join(appPath, "Contents", "Info.plist")
	raw, _, err := commandText(ctx, "/usr/libexec/PlistBuddy", "-c", "Print :CFBundleIdentifier", info)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(raw)
}

func appendFootprintCandidate(items *[]appFootprintItem, seen map[string]bool, ctx context.Context, path, evidence, confidence string) {
	if strings.TrimSpace(path) == "" || seen[path] {
		return
	}
	if _, err := os.Stat(path); err != nil {
		return
	}
	seen[path] = true
	*items = append(*items, appFootprintItem{Path: path, Bytes: directoryBytes(ctx, path), Evidence: evidence, Confidence: confidence})
}

func (a *app) handleAppFootprint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	appPath, err := filepath.Abs(filepath.Clean(strings.TrimSpace(r.URL.Query().Get("app"))))
	if err != nil || !strings.HasSuffix(strings.ToLower(appPath), ".app") {
		writeJSON(w, 400, map[string]any{"error": "an .app path is required"})
		return
	}
	st, err := os.Stat(appPath)
	if err != nil || !st.IsDir() {
		writeJSON(w, 404, map[string]any{"error": "app bundle not found"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	bundleID := appBundleID(ctx, appPath)
	home, _ := os.UserHomeDir()
	stem := strings.TrimSuffix(filepath.Base(appPath), filepath.Ext(appPath))
	items := []appFootprintItem{}
	seen := map[string]bool{}
	appendFootprintCandidate(&items, seen, ctx, appPath, "selected application bundle", "direct")
	if bundleID != "" {
		appendFootprintCandidate(&items, seen, ctx, filepath.Join(home, "Library", "Caches", bundleID), "exact bundle identifier", "high")
		appendFootprintCandidate(&items, seen, ctx, filepath.Join(home, "Library", "Containers", bundleID), "exact bundle identifier", "high")
		appendFootprintCandidate(&items, seen, ctx, filepath.Join(home, "Library", "Preferences", bundleID+".plist"), "exact bundle identifier", "high")
		appendFootprintCandidate(&items, seen, ctx, filepath.Join(home, "Library", "Application Support", bundleID), "exact bundle identifier", "high")
		groupRoot := filepath.Join(home, "Library", "Group Containers")
		if entries, err := os.ReadDir(groupRoot); err == nil {
			for _, e := range entries {
				if strings.Contains(strings.ToLower(e.Name()), strings.ToLower(bundleID)) {
					appendFootprintCandidate(&items, seen, ctx, filepath.Join(groupRoot, e.Name()), "bundle identifier contained in Group Containers entry", "medium")
				}
			}
		}
	}
	for _, parent := range []string{filepath.Join(home, "Library", "Application Support"), filepath.Join(home, "Library", "Caches")} {
		if entries, err := os.ReadDir(parent); err == nil {
			for _, e := range entries {
				if strings.EqualFold(e.Name(), stem) {
					appendFootprintCandidate(&items, seen, ctx, filepath.Join(parent, e.Name()), "exact application-name match", "medium")
				}
			}
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Bytes > items[j].Bytes })
	var total int64
	for _, item := range items {
		total += item.Bytes
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"marker": maintenanceUltraMarker, "app": appPath, "bundle_id": bundleID, "items": items, "total_bytes": total,
		"boundary": "Only the app bundle and user-Library paths with explicit bundle-ID or exact-name evidence are included. Sentinel does not claim this is every byte ever associated with the app.",
	})
}

func maintenanceHistoryPaths() (string, string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", err
	}
	dir := filepath.Join(home, "Library", "Application Support", "Sentinel")
	return filepath.Join(dir, "maintenance-history-settings.json"), filepath.Join(dir, "resource-history.jsonl"), nil
}

func loadPersistentHistorySettings() persistentHistorySettings {
	settingsPath, _, err := maintenanceHistoryPaths()
	if err != nil {
		return persistentHistorySettings{AutoIntervalSeconds: 60}
	}
	raw, err := os.ReadFile(settingsPath)
	if err != nil {
		return persistentHistorySettings{AutoIntervalSeconds: 60}
	}
	var out persistentHistorySettings
	if json.Unmarshal(raw, &out) != nil {
		return persistentHistorySettings{AutoIntervalSeconds: 60}
	}
	if out.AutoIntervalSeconds < 30 || out.AutoIntervalSeconds > 3600 {
		out.AutoIntervalSeconds = 60
	}
	return out
}

func savePersistentHistorySettings(settings persistentHistorySettings) error {
	settingsPath, _, err := maintenanceHistoryPaths()
	if err != nil {
		return err
	}
	if settings.AutoIntervalSeconds < 30 || settings.AutoIntervalSeconds > 3600 {
		settings.AutoIntervalSeconds = 60
	}
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0700); err != nil {
		return err
	}
	raw, _ := json.MarshalIndent(settings, "", "  ")
	return os.WriteFile(settingsPath, raw, 0600)
}

func (a *app) handlePersistentHistorySettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"marker": maintenanceUltraMarker, "settings": loadPersistentHistorySettings(), "privacy": "Disabled by default. When enabled, Sentinel writes only its own resource samples to its Application Support directory."})
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET or POST required"})
		return
	}
	var settings persistentHistorySettings
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&settings); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid settings"})
		return
	}
	if err := savePersistentHistorySettings(settings); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"marker": maintenanceUltraMarker, "settings": loadPersistentHistorySettings()})
}

func appendPersistentSample(sample resourceSample) error {
	_, historyPath, err := maintenanceHistoryPaths()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(historyPath), 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(historyPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	return enc.Encode(sample)
}

func (a *app) handlePersistentHistorySample(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return
	}
	settings := loadPersistentHistorySettings()
	if !settings.Enabled {
		writeJSON(w, http.StatusConflict, map[string]any{"error": "persistent history is disabled"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	sample := captureResourceSample(ctx)
	resourceHistory.add(sample)
	if err := appendPersistentSample(sample); err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"marker": maintenanceUltraMarker, "sample": sample, "stored": true})
}

func (a *app) handlePersistentHistoryRead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	_, historyPath, err := maintenanceHistoryPaths()
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	hours := queryInt(r, "hours", 24, 1, 24*30)
	cutoff := time.Now().Add(-time.Duration(hours) * time.Hour)
	f, err := os.Open(historyPath)
	if os.IsNotExist(err) {
		writeJSON(w, http.StatusOK, map[string]any{"marker": maintenanceUltraMarker, "samples": []resourceSample{}, "count": 0})
		return
	}
	if err != nil {
		writeJSON(w, 500, map[string]any{"error": err.Error()})
		return
	}
	defer f.Close()
	rows := make([]resourceSample, 0, 512)
	scanner := bufio.NewScanner(io.LimitReader(f, 16*1024*1024))
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		var sample resourceSample
		if json.Unmarshal(scanner.Bytes(), &sample) == nil && !sample.CapturedAt.Before(cutoff) {
			rows = append(rows, sample)
			if len(rows) >= 5000 {
				break
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"marker": maintenanceUltraMarker, "samples": rows, "count": len(rows), "hours": hours, "storage": "Sentinel Application Support JSONL, opt-in"})
}

func counterRate(start, end uint64, seconds float64) (float64, bool) {
	if seconds <= 0 || end < start || (start == 0 && end == 0) {
		return 0, false
	}
	return float64(end-start) / seconds, true
}

func (a *app) handleResourceRates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	window := resourceWindow(r.URL.Query().Get("window"))
	rows := resourceHistory.since(window)
	if len(rows) < 2 {
		writeJSON(w, http.StatusOK, map[string]any{"marker": maintenanceUltraMarker, "available": false, "reason": "At least two retained samples are required; Sentinel will not fabricate throughput from one cumulative counter."})
		return
	}
	first, last := rows[0], rows[len(rows)-1]
	seconds := last.CapturedAt.Sub(first.CapturedAt).Seconds()
	diskRead, diskReadOK := counterRate(first.DiskReadBytes, last.DiskReadBytes, seconds)
	diskWrite, diskWriteOK := counterRate(first.DiskWriteBytes, last.DiskWriteBytes, seconds)
	netRx, netRxOK := counterRate(first.NetworkRxBytes, last.NetworkRxBytes, seconds)
	netTx, netTxOK := counterRate(first.NetworkTxBytes, last.NetworkTxBytes, seconds)
	writeJSON(w, http.StatusOK, map[string]any{
		"marker": maintenanceUltraMarker, "available": diskReadOK || diskWriteOK || netRxOK || netTxOK,
		"elapsed_seconds": seconds, "sample_count": len(rows),
		"disk_read_bytes_per_second": diskRead, "disk_read_available": diskReadOK,
		"disk_write_bytes_per_second": diskWrite, "disk_write_available": diskWriteOK,
		"network_rx_bytes_per_second": netRx, "network_rx_available": netRxOK,
		"network_tx_bytes_per_second": netTx, "network_tx_available": netTxOK,
		"method": "delta between retained cumulative counters over measured elapsed time; counter resets are reported unavailable",
	})
}
