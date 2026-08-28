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

func acquireRuntimeLock(enabled bool) (*runtimeLock, error) {
	l := &runtimeLock{}
	if !enabled {
		return l, nil
	}
	l.path = runtimeLockPath()
	for attempt := 0; attempt < 2; attempt++ {
		f, err := os.OpenFile(l.path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err == nil {
			info := runtimeLockInfo{PID: os.Getpid(), StartedAt: time.Now().UTC().Format(time.RFC3339), Version: sentinelVersion}
			encErr := json.NewEncoder(f).Encode(info)
			if syncErr := f.Sync(); encErr == nil {
				encErr = syncErr
			}
			closeErr := f.Close()
			if encErr != nil {
				_ = os.Remove(l.path)
				return nil, encErr
			}
			if closeErr != nil {
				_ = os.Remove(l.path)
				return nil, closeErr
			}
			_ = os.Chmod(l.path, 0600)
			l.held = true
			return l, nil
		}
		if !os.IsExist(err) {
			return nil, err
		}
		raw, readErr := os.ReadFile(l.path)
		var old runtimeLockInfo
		if readErr == nil && json.Unmarshal(raw, &old) == nil && processAlive(old.PID) {
			return nil, fmt.Errorf("another persistent Sentinel instance is already running (pid %d); use the existing instance or --ephemeral for an isolated read-only session", old.PID)
		}
		// Stale or unreadable lock. Removing it is safe because O_EXCL is used
		// on the next acquisition attempt, so two contenders still cannot both win.
		_ = os.Remove(l.path)
	}
	return nil, fmt.Errorf("could not acquire Sentinel single-instance lock")
}

func (l *runtimeLock) release() {
	if l == nil || !l.held || l.path == "" {
		return
	}
	raw, err := os.ReadFile(l.path)
	var current runtimeLockInfo
	if err == nil && json.Unmarshal(raw, &current) == nil && current.PID != os.Getpid() {
		return
	}
	_ = os.Remove(l.path)
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
