// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const storageReviewIntelligenceMarker = "Sentinel 3.2 Storage Review Intelligence"

type oldFileCandidate struct {
	Path       string    `json:"path"`
	Name       string    `json:"name"`
	Bytes      int64     `json:"bytes"`
	ModifiedAt time.Time `json:"modified_at"`
	AgeDays    int       `json:"age_days"`
}

type downloadReviewItem struct {
	Path       string    `json:"path"`
	Name       string    `json:"name"`
	Bytes      int64     `json:"bytes"`
	ModifiedAt time.Time `json:"modified_at"`
	AgeDays    int       `json:"age_days"`
	Category   string    `json:"category"`
	Extension  string    `json:"extension,omitempty"`
}

type storageReviewAggregate struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	Bytes int64  `json:"bytes"`
}

func storageReviewAgeDays(now, modified time.Time) int {
	if modified.IsZero() || modified.After(now) {
		return 0
	}
	return int(now.Sub(modified) / (24 * time.Hour))
}

func downloadCategory(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".dmg", ".iso", ".img":
		return "Disk images"
	case ".pkg", ".mpkg":
		return "Installers"
	case ".zip", ".tar", ".tgz", ".gz", ".bz2", ".xz", ".7z", ".rar":
		return "Archives"
	case ".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".pages", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".key", ".numbers":
		return "Documents"
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".tif", ".tiff", ".svg":
		return "Images"
	case ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v":
		return "Video"
	case ".mp3", ".m4a", ".wav", ".flac", ".aac", ".ogg":
		return "Audio"
	case ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".java", ".c", ".cc", ".cpp", ".h", ".hpp", ".rs", ".swift", ".ipynb", ".sh", ".zsh":
		return "Code"
	case ".json", ".xml", ".yaml", ".yml", ".sql", ".db", ".sqlite", ".parquet":
		return "Data"
	default:
		return "Other"
	}
}

func downloadAgeBucket(days int) string {
	switch {
	case days <= 7:
		return "0–7 days"
	case days <= 30:
		return "8–30 days"
	case days <= 90:
		return "31–90 days"
	case days <= 180:
		return "91–180 days"
	default:
		return "181+ days"
	}
}

func downloadSizeBucket(bytes int64) string {
	const mb = int64(1024 * 1024)
	const gb = int64(1024 * mb)
	switch {
	case bytes < 10*mb:
		return "Under 10 MB"
	case bytes < 100*mb:
		return "10–99 MB"
	case bytes < gb:
		return "100 MB–1 GB"
	default:
		return "1 GB+"
	}
}

func storageReviewAggregates(rows map[string]storageReviewAggregate) []storageReviewAggregate {
	out := make([]storageReviewAggregate, 0, len(rows))
	for _, row := range rows {
		out = append(out, row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Bytes != out[j].Bytes {
			return out[i].Bytes > out[j].Bytes
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func addStorageReviewAggregate(rows map[string]storageReviewAggregate, name string, bytes int64) {
	row := rows[name]
	row.Name = name
	row.Count++
	row.Bytes += bytes
	rows[name] = row
}

func (a *app) handleOldFileExplorer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	root, err := maintenanceAbsDir(r.URL.Query().Get("path"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	days := queryInt(r, "days", 180, 30, 3650)
	minMB := queryInt(r, "min_mb", 10, 0, 102400)
	limit := queryInt(r, "limit", 100, 10, 500)
	maxEntries := queryInt(r, "max_entries", 50000, 1000, 200000)
	now := time.Now()
	cutoff := now.Add(-time.Duration(days) * 24 * time.Hour)
	deadline := now.Add(15 * time.Second)
	rows := []oldFileCandidate{}
	visited, limited, walkErr := boundedWalk(root, deadline, maxEntries, func(path string, d os.DirEntry, info os.FileInfo) error {
		if d.IsDir() || !info.Mode().IsRegular() || info.ModTime().After(cutoff) || info.Size() < int64(minMB)*1024*1024 {
			return nil
		}
		rows = append(rows, oldFileCandidate{
			Path: path, Name: d.Name(), Bytes: info.Size(), ModifiedAt: info.ModTime(),
			AgeDays: storageReviewAgeDays(now, info.ModTime()),
		})
		return nil
	})
	if walkErr != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": walkErr.Error()})
		return
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Bytes != rows[j].Bytes {
			return rows[i].Bytes > rows[j].Bytes
		}
		return rows[i].ModifiedAt.Before(rows[j].ModifiedAt)
	})
	matched := len(rows)
	if len(rows) > limit {
		rows = rows[:limit]
		limited = true
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"marker": storageReviewIntelligenceMarker,
		"path": root,
		"days": days,
		"cutoff": cutoff,
		"minimum_bytes": int64(minMB) * 1024 * 1024,
		"files": rows,
		"matched_files": matched,
		"visited_entries": visited,
		"limited": limited,
		"definition": "Old-file candidate means a regular file whose modification time is at least the selected number of days ago. It does not mean unused.",
		"not_established": "Sentinel has not established last-opened time, user intent, replaceability, or whether any candidate is safe to delete.",
	})
}

func (a *app) handleDownloadsIntelligence(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	home, err := os.UserHomeDir()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	root := filepath.Join(home, "Downloads")
	st, err := os.Stat(root)
	if err != nil || !st.IsDir() {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "Downloads directory not found"})
		return
	}
	limit := queryInt(r, "limit", 50, 10, 200)
	maxEntries := queryInt(r, "max_entries", 50000, 1000, 200000)
	now := time.Now()
	deadline := now.Add(12 * time.Second)
	categoryAgg := map[string]storageReviewAggregate{}
	ageAgg := map[string]storageReviewAggregate{}
	sizeAgg := map[string]storageReviewAggregate{}
	items := []downloadReviewItem{}
	var visibleFileBytes int64
	regularFiles := 0
	visited, limited, walkErr := boundedWalk(root, deadline, maxEntries, func(path string, d os.DirEntry, info os.FileInfo) error {
		if d.IsDir() || !info.Mode().IsRegular() {
			return nil
		}
		ageDays := storageReviewAgeDays(now, info.ModTime())
		category := downloadCategory(d.Name())
		ext := strings.ToLower(filepath.Ext(d.Name()))
		item := downloadReviewItem{
			Path: path, Name: d.Name(), Bytes: info.Size(), ModifiedAt: info.ModTime(), AgeDays: ageDays,
			Category: category, Extension: ext,
		}
		items = append(items, item)
		visibleFileBytes += info.Size()
		regularFiles++
		addStorageReviewAggregate(categoryAgg, category, info.Size())
		addStorageReviewAggregate(ageAgg, downloadAgeBucket(ageDays), info.Size())
		addStorageReviewAggregate(sizeAgg, downloadSizeBucket(info.Size()), info.Size())
		return nil
	})
	if walkErr != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": walkErr.Error()})
		return
	}
	largest := append([]downloadReviewItem(nil), items...)
	sort.SliceStable(largest, func(i, j int) bool {
		if largest[i].Bytes != largest[j].Bytes {
			return largest[i].Bytes > largest[j].Bytes
		}
		return largest[i].ModifiedAt.Before(largest[j].ModifiedAt)
	})
	if len(largest) > limit {
		largest = largest[:limit]
	}
	oldest := append([]downloadReviewItem(nil), items...)
	sort.SliceStable(oldest, func(i, j int) bool {
		if !oldest[i].ModifiedAt.Equal(oldest[j].ModifiedAt) {
			return oldest[i].ModifiedAt.Before(oldest[j].ModifiedAt)
		}
		return oldest[i].Bytes > oldest[j].Bytes
	})
	oldestLimit := limit
	if oldestLimit > 25 {
		oldestLimit = 25
	}
	if len(oldest) > oldestLimit {
		oldest = oldest[:oldestLimit]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"marker": storageReviewIntelligenceMarker,
		"path": root,
		"regular_files": regularFiles,
		"visible_file_bytes": visibleFileBytes,
		"visited_entries": visited,
		"limited": limited,
		"by_category": storageReviewAggregates(categoryAgg),
		"by_age": storageReviewAggregates(ageAgg),
		"by_size": storageReviewAggregates(sizeAgg),
		"largest_files": largest,
		"oldest_files": oldest,
		"definition": "Downloads Intelligence groups regular files that completed this bounded read by modification age, file size, and extension-derived type.",
		"not_established": "A category, age, or large size is not a deletion recommendation. Sentinel does not infer last-opened time and does not hash files for duplicates in this view.",
	})
}
