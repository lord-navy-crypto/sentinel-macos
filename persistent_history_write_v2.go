// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	persistentHistoryWriteMarker     = "Sentinel 2.9 Resource History Write Cap"
	persistentHistoryWriteLimitBytes = int64(12 * 1024 * 1024)
	persistentHistoryCompactToBytes  = int64(8 * 1024 * 1024)
	persistentHistoryMaxSampleBytes  = 256 * 1024
	persistentHistoryScannerMaxBytes = 1024 * 1024
)

var persistentHistoryWriteMu sync.Mutex

type PersistentHistoryWriteStatus struct {
	Marker      string `json:"marker"`
	Compacted   bool   `json:"compacted"`
	BeforeBytes int64  `json:"before_bytes"`
	AfterBytes  int64  `json:"after_bytes"`
	LimitBytes  int64  `json:"limit_bytes"`
	TargetBytes int64  `json:"target_bytes"`
	Path        string `json:"path,omitempty"`
	Boundary    string `json:"boundary"`
}

func persistentHistoryRegularFile(path string) (os.FileInfo, error) {
	st, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if st.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("resource history path must not be a symlink")
	}
	if !st.Mode().IsRegular() {
		return nil, errors.New("resource history path must be a regular file")
	}
	return st, nil
}

func compactPersistentHistoryJSONL(path string, targetBytes int64) (PersistentHistoryWriteStatus, error) {
	status := PersistentHistoryWriteStatus{
		Marker: persistentHistoryWriteMarker, LimitBytes: persistentHistoryWriteLimitBytes,
		TargetBytes: targetBytes, Path: path,
		Boundary: "Compaction keeps the newest complete valid resource-sample JSONL rows. It does not synthesize or interpolate missing history.",
	}
	if targetBytes < 1024 {
		return status, errors.New("resource history compaction target is too small")
	}
	st, err := persistentHistoryRegularFile(path)
	if err != nil {
		return status, err
	}
	status.BeforeBytes = st.Size()
	if st.Size() <= targetBytes {
		status.AfterBytes = st.Size()
		return status, nil
	}

	f, err := os.Open(path)
	if err != nil {
		return status, err
	}
	defer f.Close()
	start := st.Size() - targetBytes
	if start < 0 {
		start = 0
	}
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		return status, err
	}

	scanner := bufio.NewScanner(io.LimitReader(f, targetBytes))
	scanner.Buffer(make([]byte, 64*1024), persistentHistoryScannerMaxBytes)
	if start > 0 {
		// The tail seek can land inside one JSON row. Drop that fragment so the
		// compacted file starts at a complete JSONL record boundary.
		_ = scanner.Scan()
	}
	rows := make([][]byte, 0, 4096)
	var retainedBytes int64
	for scanner.Scan() {
		line := append([]byte(nil), scanner.Bytes()...)
		var sample resourceSample
		if len(line) == 0 || json.Unmarshal(line, &sample) != nil || sample.CapturedAt.IsZero() {
			continue
		}
		lineBytes := int64(len(line) + 1)
		if lineBytes > targetBytes {
			continue
		}
		rows = append(rows, line)
		retainedBytes += lineBytes
	}
	if err := scanner.Err(); err != nil {
		return status, err
	}

	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".resource-history-compact-*.tmp")
	if err != nil {
		return status, err
	}
	tmpPath := tmp.Name()
	keepTemp := true
	defer func() {
		_ = tmp.Close()
		if keepTemp {
			_ = os.Remove(tmpPath)
		}
	}()
	if err := tmp.Chmod(0600); err != nil {
		return status, err
	}
	writer := bufio.NewWriterSize(tmp, 128*1024)
	for _, row := range rows {
		if _, err := writer.Write(row); err != nil {
			return status, err
		}
		if err := writer.WriteByte('\n'); err != nil {
			return status, err
		}
	}
	if err := writer.Flush(); err != nil {
		return status, err
	}
	if err := tmp.Sync(); err != nil {
		return status, err
	}
	if err := tmp.Close(); err != nil {
		return status, err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return status, err
	}
	keepTemp = false
	if err := os.Chmod(path, 0600); err != nil {
		return status, err
	}
	status.Compacted = true
	status.AfterBytes = retainedBytes
	return status, nil
}

func appendPersistentSampleBounded(sample resourceSample, limitBytes, targetBytes int64) (PersistentHistoryWriteStatus, error) {
	status := PersistentHistoryWriteStatus{
		Marker: persistentHistoryWriteMarker, LimitBytes: limitBytes, TargetBytes: targetBytes,
		Boundary: "The canonical resource-history JSONL is size-bounded. Compaction keeps newest complete valid rows and never fabricates missing samples.",
	}
	if limitBytes <= targetBytes || targetBytes < 1024 {
		return status, errors.New("invalid resource history write bounds")
	}
	_, historyPath, err := maintenanceHistoryPaths()
	if err != nil {
		return status, err
	}
	status.Path = historyPath
	stateDir := filepath.Dir(historyPath)
	if err := os.MkdirAll(stateDir, 0700); err != nil {
		return status, err
	}
	if err := os.Chmod(stateDir, 0700); err != nil {
		return status, err
	}

	raw, err := json.Marshal(sample)
	if err != nil {
		return status, err
	}
	raw = append(raw, '\n')
	if len(raw) > persistentHistoryMaxSampleBytes {
		return status, fmt.Errorf("resource history sample exceeds %d byte bound", persistentHistoryMaxSampleBytes)
	}

	before := int64(0)
	if _, statErr := os.Lstat(historyPath); statErr == nil {
		regular, regularErr := persistentHistoryRegularFile(historyPath)
		if regularErr != nil {
			return status, regularErr
		}
		before = regular.Size()
	} else if !os.IsNotExist(statErr) {
		return status, statErr
	}
	status.BeforeBytes = before
	if before+int64(len(raw)) > limitBytes && before > 0 {
		compacted, compactErr := compactPersistentHistoryJSONL(historyPath, targetBytes)
		if compactErr != nil {
			return status, compactErr
		}
		status.Compacted = compacted.Compacted
		before = compacted.AfterBytes
	}
	if before+int64(len(raw)) > limitBytes {
		return status, errors.New("resource history sample cannot fit inside configured file bound")
	}

	flags := os.O_CREATE | os.O_WRONLY | os.O_APPEND
	f, err := os.OpenFile(historyPath, flags, 0600)
	if err != nil {
		return status, err
	}
	if err := f.Chmod(0600); err != nil {
		_ = f.Close()
		return status, err
	}
	if _, err := f.Write(raw); err != nil {
		_ = f.Close()
		return status, err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return status, err
	}
	if err := f.Close(); err != nil {
		return status, err
	}
	status.AfterBytes = before + int64(len(raw))
	return status, nil
}

func appendPersistentSampleV2(sample resourceSample) (PersistentHistoryWriteStatus, error) {
	persistentHistoryWriteMu.Lock()
	defer persistentHistoryWriteMu.Unlock()
	return appendPersistentSampleBounded(sample, persistentHistoryWriteLimitBytes, persistentHistoryCompactToBytes)
}

func (a *app) handlePersistentHistorySampleV2(w http.ResponseWriter, r *http.Request) {
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
	storage, err := appendPersistentSampleV2(sample)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error(), "stored": false, "storage": storage})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"marker": maintenanceUltraMarker, "sample": sample, "stored": true, "storage": storage,
	})
}
