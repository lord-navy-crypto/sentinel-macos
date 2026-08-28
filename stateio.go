// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type StateRecoveryStatus struct {
	GeneratedAt    string   `json:"generated_at"`
	RecoveredReads int      `json:"recovered_reads"`
	Files          []string `json:"files,omitempty"`
	Note           string   `json:"note"`
}

var stateRecoveryRegistry = struct {
	sync.Mutex
	files map[string]bool
}{files: map[string]bool{}}

func recordStateRecovery(path string) {
	stateRecoveryRegistry.Lock()
	stateRecoveryRegistry.files[filepath.Base(path)] = true
	stateRecoveryRegistry.Unlock()
}

func stateRecoveryStatus() StateRecoveryStatus {
	stateRecoveryRegistry.Lock()
	files := make([]string, 0, len(stateRecoveryRegistry.files))
	for f := range stateRecoveryRegistry.files {
		files = append(files, f)
	}
	stateRecoveryRegistry.Unlock()
	sort.Strings(files)
	return StateRecoveryStatus{GeneratedAt: time.Now().UTC().Format(time.RFC3339), RecoveredReads: len(files), Files: files, Note: "A recovered read means the primary Sentinel-owned state file could not be decoded and a last-known-good .bak copy was used in memory. Review/recreate that state before relying on long-term comparisons."}
}

// syncDirectory asks the filesystem to durably record a rename where the
// platform supports directory fsync. Failure is intentionally returned so
// callers never advertise a durable write that was only partially committed.
func syncDirectory(dir string) error {
	f, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}

// atomicPrivateWrite performs a user-only, same-directory atomic replacement.
// Before replacement it keeps one hard-linked last-known-good .bak copy when
// possible. Sentinel state is metadata only; this is recovery hardening, not a
// substitute for user backups.
func atomicPrivateWrite(path string, data []byte) error {
	if path == "" {
		return fmt.Errorf("state path unavailable")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	if err := os.Chmod(dir, 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".sentinel-state-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpName) }
	defer cleanup()
	if err := tmp.Chmod(0600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	// Keep one previous inode as a backup without creating a window where the
	// primary path is missing. Hard-link creation is same-volume and fails safe.
	if st, err := os.Stat(path); err == nil && st.Mode().IsRegular() {
		bakTmp := path + ".bak.new"
		_ = os.Remove(bakTmp)
		if err := os.Link(path, bakTmp); err == nil {
			_ = os.Chmod(bakTmp, 0600)
			_ = os.Rename(bakTmp, path+".bak")
		}
	}
	if err := os.Rename(tmpName, path); err != nil {
		return err
	}
	if err := os.Chmod(path, 0600); err != nil {
		return err
	}
	return syncDirectory(dir)
}

func writePrivateJSON(path string, v any) error {
	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	return atomicPrivateWrite(path, raw)
}

func readPrivateJSON(path string, dst any) error {
	try := func(p string) error {
		raw, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return json.Unmarshal(raw, dst)
	}
	if err := try(path); err == nil {
		return nil
	} else if bakErr := try(path + ".bak"); bakErr == nil {
		recordStateRecovery(path)
		return nil
	} else {
		return err
	}
}

// writePrivateGzipJSON stores bounded Sentinel-owned history using user-only
// permissions. It never writes user file contents; callers define compact
// metadata schemas and retention limits.
func writePrivateGzipJSON(path string, v any) error {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if err := json.NewEncoder(gz).Encode(v); err != nil {
		_ = gz.Close()
		return err
	}
	if err := gz.Close(); err != nil {
		return err
	}
	return atomicPrivateWrite(path, buf.Bytes())
}

func readGzipJSON(path string, dst any) error {
	try := func(p string) error {
		f, err := os.Open(p)
		if err != nil {
			return err
		}
		defer f.Close()
		gz, err := gzip.NewReader(f)
		if err != nil {
			return err
		}
		defer gz.Close()
		dec := json.NewDecoder(io.LimitReader(gz, 16<<20))
		return dec.Decode(dst)
	}
	if err := try(path); err == nil {
		return nil
	} else if bakErr := try(path + ".bak"); bakErr == nil {
		recordStateRecovery(path)
		return nil
	} else {
		return err
	}
}
