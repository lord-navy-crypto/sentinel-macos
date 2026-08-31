// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

type runtimeLockInfo struct {
	PID       int    `json:"pid"`
	StartedAt string `json:"started_at"`
	Version   string `json:"version"`
}

type runtimeLock struct {
	path string
	file *os.File
	held bool
}

func runtimeLockPath() string {
	// Use the per-user temporary directory so merely starting Sentinel does not
	// create persistent Application Support state. Persistent managers remain
	// responsible for creating state only when they actually need to write it.
	return filepath.Join(os.TempDir(), fmt.Sprintf("sentinel-macos-%d.lock", os.Getuid()))
}

func processAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = p.Signal(syscall.Signal(0))
	return err == nil || errors.Is(err, syscall.EPERM)
}

// acquireRuntimeLock uses a kernel advisory lock instead of a stale-file
// delete/recreate protocol. The old protocol had a TOCTOU window where two
// simultaneous launchers could both observe a stale file and one could delete
// the other's newly-created lock. flock is tied to the open file description,
// is released automatically if the process dies, and never requires deleting a
// competing process's path.
func acquireRuntimeLock(enabled bool) (*runtimeLock, error) {
	l := &runtimeLock{}
	if !enabled {
		return l, nil
	}
	l.path = runtimeLockPath()

	// O_NOFOLLOW prevents a same-user symlink planted at the predictable temp
	// path from redirecting Sentinel's lock metadata write. O_NONBLOCK prevents
	// a hostile/non-regular pre-created FIFO from stalling startup before we can
	// inspect its type. Regular files ignore O_NONBLOCK semantics.
	f, err := os.OpenFile(l.path, os.O_RDWR|os.O_CREATE|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0600)
	if err != nil {
		return nil, err
	}
	closeOnError := func() { _ = f.Close() }

	// The lock path lives in a shared temporary namespace. Never chmod, truncate,
	// lock, or write through an object that is not a regular file owned by this
	// user, even if another account intentionally made that object writable.
	fst, err := f.Stat()
	if err != nil {
		closeOnError()
		return nil, err
	}
	if !fst.Mode().IsRegular() {
		closeOnError()
		return nil, fmt.Errorf("Sentinel runtime lock is not a regular file: %s", filepath.Base(l.path))
	}
	if sys, ok := fst.Sys().(*syscall.Stat_t); !ok || int(sys.Uid) != os.Getuid() {
		closeOnError()
		return nil, fmt.Errorf("Sentinel runtime lock is not owned by the current user: %s", filepath.Base(l.path))
	}
	if err := f.Chmod(0600); err != nil {
		closeOnError()
		return nil, err
	}

	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		closeOnError()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			var old runtimeLockInfo
			if raw, readErr := os.ReadFile(l.path); readErr == nil && json.Unmarshal(raw, &old) == nil && old.PID > 0 {
				return nil, fmt.Errorf("another persistent Sentinel instance is already running (pid %d); use the existing instance or --ephemeral for an isolated read-only session", old.PID)
			}
			return nil, fmt.Errorf("another persistent Sentinel instance already holds the runtime lock; use the existing instance or --ephemeral for an isolated read-only session")
		}
		return nil, fmt.Errorf("acquire Sentinel runtime lock: %w", err)
	}

	unlockOnError := func() {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		_ = f.Close()
	}
	if err := f.Truncate(0); err != nil {
		unlockOnError()
		return nil, err
	}
	if _, err := f.Seek(0, 0); err != nil {
		unlockOnError()
		return nil, err
	}
	info := runtimeLockInfo{PID: os.Getpid(), StartedAt: time.Now().UTC().Format(time.RFC3339), Version: sentinelVersion}
	if err := json.NewEncoder(f).Encode(info); err != nil {
		unlockOnError()
		return nil, err
	}
	if err := f.Sync(); err != nil {
		unlockOnError()
		return nil, err
	}

	l.file = f
	l.held = true
	return l, nil
}

func (l *runtimeLock) release() {
	if l == nil || !l.held || l.file == nil {
		return
	}
	// Do not unlink the lock path. Unlinking after unlock can race with a new
	// process that has already opened and locked the same inode. Leaving the
	// user-private temp file in place is harmless; the next owner truncates and
	// rewrites its metadata only after acquiring the kernel lock.
	_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
	_ = l.file.Close()
	l.file = nil
	l.held = false
}

func (l *runtimeLock) status() map[string]any {
	if l == nil || !l.held {
		return map[string]any{"enabled": false, "held": false, "mode": "ephemeral-or-unlocked"}
	}
	return map[string]any{"enabled": true, "held": true, "pid": os.Getpid(), "mode": "single-persistent-instance", "lock_file": filepath.Base(l.path)}
}

func parsePID(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
