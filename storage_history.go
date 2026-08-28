// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"sort"
	"time"
)

type StorageSnapshot struct {
	ID               string            `json:"id"`
	CreatedAt        int64             `json:"created_at"`
	Root             string            `json:"root"`
	VisibleBytes     uint64            `json:"visible_bytes"`
	FilesVisited     int               `json:"files_visited"`
	DirsVisited      int               `json:"dirs_visited"`
	PermissionErrors int               `json:"permission_errors"`
	SlowPathsSkipped int               `json:"slow_paths_skipped"`
	Truncated        bool              `json:"truncated"`
	Cancelled        bool              `json:"cancelled"`
	Partial          bool              `json:"partial"`
	Categories       []StorageCategory `json:"categories"`
	FileTypes        []StorageCategory `json:"file_types"`
	Limitations      []string          `json:"limitations,omitempty"`
}

type StorageDelta struct {
	Name        string `json:"name"`
	BeforeBytes uint64 `json:"before_bytes"`
	AfterBytes  uint64 `json:"after_bytes"`
	DeltaBytes  int64  `json:"delta_bytes"`
	BeforeFiles int    `json:"before_files"`
	AfterFiles  int    `json:"after_files"`
	DeltaFiles  int    `json:"delta_files"`
}

type StorageComparison struct {
	BeforeID         string         `json:"before_id"`
	AfterID          string         `json:"after_id"`
	Root             string         `json:"root"`
	BeforeAt         int64          `json:"before_at"`
	AfterAt          int64          `json:"after_at"`
	BeforeBytes      uint64         `json:"before_bytes"`
	AfterBytes       uint64         `json:"after_bytes"`
	DeltaBytes       int64          `json:"delta_bytes"`
	DirectoryChanges []StorageDelta `json:"directory_changes"`
	FileTypeChanges  []StorageDelta `json:"file_type_changes"`
	Partial          bool           `json:"partial"`
	Limitations      []string       `json:"limitations,omitempty"`
}

func storageSignedDelta(after, before uint64) int64 {
	const max = uint64(^uint64(0) >> 1)
	if after >= before {
		d := after - before
		if d > max {
			return int64(max)
		}
		return int64(d)
	}
	d := before - after
	if d > max {
		return -int64(max)
	}
	return -int64(d)
}

func NewStorageSnapshot(result *AdvancedStorageResult, at int64) StorageSnapshot {
	if at <= 0 {
		at = time.Now().Unix()
	}
	if result == nil {
		return StorageSnapshot{CreatedAt: at, Partial: true, Limitations: []string{"storage result unavailable"}}
	}
	out := StorageSnapshot{
		CreatedAt: at,
		Root: result.Root,
		VisibleBytes: result.VisibleBytes,
		FilesVisited: result.FilesVisited,
		DirsVisited: result.DirsVisited,
		PermissionErrors: result.PermissionErr,
		SlowPathsSkipped: result.SlowPathsSkipped,
		Truncated: result.Truncated,
		Cancelled: result.Cancelled,
		Categories: append([]StorageCategory(nil), result.Categories...),
		FileTypes: append([]StorageCategory(nil), result.FileTypes...),
	}
	if result.PermissionErr > 0 {
		out.Limitations = append(out.Limitations, fmt.Sprintf("%d paths were not readable because of permissions", result.PermissionErr))
	}
	if result.SlowPathsSkipped > 0 {
		out.Limitations = append(out.Limitations, fmt.Sprintf("%d slow paths were skipped", result.SlowPathsSkipped))
	}
	if result.Truncated {
		out.Limitations = append(out.Limitations, "scan entry budget was reached")
	}
	if result.Cancelled {
		out.Limitations = append(out.Limitations, "scan was cancelled before completion")
	}
	out.Partial = len(out.Limitations) > 0
	out.ID = entityID("storage-snapshot", fmt.Sprintf("%s|%d|%d|%d", out.Root, out.CreatedAt, out.VisibleBytes, out.FilesVisited))
	return out
}

func storageCategoryMap(rows []StorageCategory) map[string]StorageCategory {
	out := make(map[string]StorageCategory, len(rows))
	for _, row := range rows {
		if row.Name == "" {
			continue
		}
		cur := out[row.Name]
		cur.Name = row.Name
		cur.Size += row.Size
		cur.Files += row.Files
		out[row.Name] = cur
	}
	return out
}

func storageDeltaMagnitude(n int64) uint64 {
	if n >= 0 {
		return uint64(n)
	}
	return uint64(-(n + 1)) + 1
}

func compareStorageCategories(before, after []StorageCategory) []StorageDelta {
	bm := storageCategoryMap(before)
	am := storageCategoryMap(after)
	names := map[string]bool{}
	for name := range bm {
		names[name] = true
	}
	for name := range am {
		names[name] = true
	}
	out := make([]StorageDelta, 0, len(names))
	for name := range names {
		b, a := bm[name], am[name]
		row := StorageDelta{
			Name: name,
			BeforeBytes: b.Size,
			AfterBytes: a.Size,
			DeltaBytes: storageSignedDelta(a.Size, b.Size),
			BeforeFiles: b.Files,
			AfterFiles: a.Files,
			DeltaFiles: a.Files - b.Files,
		}
		if row.DeltaBytes != 0 || row.DeltaFiles != 0 {
			out = append(out, row)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		mi, mj := storageDeltaMagnitude(out[i].DeltaBytes), storageDeltaMagnitude(out[j].DeltaBytes)
		if mi != mj {
			return mi > mj
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func CompareStorageSnapshots(before, after StorageSnapshot) StorageComparison {
	out := StorageComparison{
		BeforeID: before.ID,
		AfterID: after.ID,
		Root: firstNonEmpty(after.Root, before.Root),
		BeforeAt: before.CreatedAt,
		AfterAt: after.CreatedAt,
		BeforeBytes: before.VisibleBytes,
		AfterBytes: after.VisibleBytes,
		DeltaBytes: storageSignedDelta(after.VisibleBytes, before.VisibleBytes),
		DirectoryChanges: compareStorageCategories(before.Categories, after.Categories),
		FileTypeChanges: compareStorageCategories(before.FileTypes, after.FileTypes),
		Partial: before.Partial || after.Partial,
	}
	for _, limitation := range append(append([]string(nil), before.Limitations...), after.Limitations...) {
		out.Limitations = appendUniqueString(out.Limitations, limitation)
	}
	if before.Root != "" && after.Root != "" && before.Root != after.Root {
		out.Partial = true
		out.Limitations = appendUniqueString(out.Limitations, "snapshots were captured from different roots")
	}
	return out
}
