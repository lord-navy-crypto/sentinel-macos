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
	"syscall"
	"time"
)

const (
	maxPrivateJSONBytes       = int64(16 << 20)
	maxPrivateCompressedBytes = int64(64 << 20)
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

func ensurePrivateDirectory(dir string) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	st, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	if st.Mode()&os.ModeSymlink != 0 || !st.IsDir() {
		return fmt.Errorf("Sentinel private state directory is not a real directory: %s", dir)
	}
	if err := os.Chmod(dir, 0700); err != nil {
		return err
	}
	return nil
}

func openPrivateRegular(path string, maxBytes int64) (*os.File, error) {
	if path == "" {
		return nil, fmt.Errorf("state path unavailable")
	}
	st, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if st.Mode()&os.ModeSymlink != 0 || !st.Mode().IsRegular() {
		return nil, fmt.Errorf("Sentinel state must be a regular non-symlink file: %s", filepath.Base(path))
	}
	if maxBytes > 0 && st.Size() > maxBytes {
		return nil, fmt.Errorf("Sentinel state exceeds the bounded read limit: %s", filepath.Base(path))
	}
	// Lstat alone has a check/open race. O_NOFOLLOW makes the open itself reject
	// a path swapped to a symbolic link between those operations.
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	fst, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	if !fst.Mode().IsRegular() || (maxBytes > 0 && fst.Size() > maxBytes) {
		_ = f.Close()
		return nil, fmt.Errorf("Sentinel state changed before bounded read: %s", filepath.Base(path))
	}
	return f, nil
}

func readBoundedPrivateFile(path string, maxBytes int64) ([]byte, error) {
	f, err := openPrivateRegular(path, maxBytes)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	limited := io.LimitReader(f, maxBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > maxBytes {
		return nil, fmt.Errorf("Sentinel state exceeded bounded read limit during read: %s", filepath.Base(path))
	}
	return raw, nil
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
	if err := ensurePrivateDirectory(dir); err != nil {
		return err
	}
	if st, err := os.Lstat(path); err == nil {
		if st.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("refusing to replace symlinked Sentinel state: %s", filepath.Base(path))
		}
		if !st.Mode().IsRegular() {
			return fmt.Errorf("Sentinel state target is not a regular file: %s", filepath.Base(path))
		}
	} else if !os.IsNotExist(err) {
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
	if st, err := os.Lstat(path); err == nil && st.Mode().IsRegular() && st.Mode()&os.ModeSymlink == 0 {
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
	if int64(len(raw)) > maxPrivateJSONBytes {
		return fmt.Errorf("Sentinel JSON state exceeds write limit")
	}
	return atomicPrivateWrite(path, raw)
}

func readPrivateJSON(path string, dst any) error {
	try := func(p string) error {
		raw, err := readBoundedPrivateFile(p, maxPrivateJSONBytes)
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
	if int64(buf.Len()) > maxPrivateCompressedBytes {
		return fmt.Errorf("Sentinel compressed history exceeds write limit")
	}
	return atomicPrivateWrite(path, buf.Bytes())
}

func readGzipJSON(path string, dst any) error {
	try := func(p string) error {
		f, err := openPrivateRegular(p, maxPrivateCompressedBytes)
		if err != nil {
			return err
		}
		defer f.Close()
		gz, err := gzip.NewReader(f)
		if err != nil {
			return err
		}
		decompressed, readErr := io.ReadAll(io.LimitReader(gz, maxPrivateJSONBytes+1))
		closeErr := gz.Close()
		if readErr != nil {
			return readErr
		}
		if closeErr != nil {
			return closeErr
		}
		if int64(len(decompressed)) > maxPrivateJSONBytes {
			return fmt.Errorf("Sentinel decompressed history exceeds bounded read limit: %s", filepath.Base(p))
		}
		return json.Unmarshal(decompressed, dst)
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
