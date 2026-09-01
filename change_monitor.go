// SPDX-License-Identifier: MPL-2.0
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type ChangeEvent struct {
	ID          string   `json:"id"`
	At          int64    `json:"at"`
	Path        string   `json:"path"`
	Root        string   `json:"root"`
	Kind        string   `json:"kind"`
	Source      string   `json:"source"`
	Flags       []string `json:"flags,omitempty"`
	NeedsRescan bool     `json:"needs_rescan"`
	Severity    string   `json:"severity"`
	Why         string   `json:"why"`
}
type ChangeStatus struct {
	Running            bool     `json:"running"`
	Mode               string   `json:"mode"`
	NativeAvailable    bool     `json:"native_available"`
	StartedAt          string   `json:"started_at,omitempty"`
	Roots              []string `json:"roots"`
	EventCount         int      `json:"event_count"`
	HistoryEntries     int      `json:"history_entries"`
	PersistentHistory  bool     `json:"persistent_history"`
	PersistenceHealthy bool     `json:"persistence_healthy"`
	LastPersistError   string   `json:"last_persist_error,omitempty"`
	LastPersistOKAt    string   `json:"last_persist_ok_at,omitempty"`
	HistoryPath        string   `json:"history_path,omitempty"`
	CheckpointPath     string   `json:"checkpoint_path,omitempty"`
	LastNativeEventID  uint64   `json:"last_native_event_id,omitempty"`
	ResumeCheckpoint   bool     `json:"resume_checkpoint"`
	NeedsRescan        bool     `json:"needs_rescan"`
	LastEventAt        int64    `json:"last_event_at,omitempty"`
	DroppedSignals     int      `json:"dropped_signals"`
	PollIntervalMS     int      `json:"poll_interval_ms,omitempty"`
	Note               string   `json:"note"`
}
type changeStartRequest struct {
	Preset     string   `json:"preset"`
	Roots      []string `json:"roots,omitempty"`
	IntervalMS int      `json:"interval_ms,omitempty"`
}
type changeSnapshotEntry struct {
	Size    int64
	ModUnix int64
	Mode    fs.FileMode
	IsDir   bool
}
type changeManager struct {
	mu               sync.RWMutex
	running          bool
	mode             string
	startedAt        time.Time
	roots            []string
	events           []ChangeEvent
	history          []ChangeEvent
	persistent       bool
	historyPath      string
	checkpointPath   string
	lastNativeID     uint64
	checkpointRoots  []string
	checkpointRescan bool
	resumeCheckpoint bool
	needsRescan      bool
	dropped          int
	interval         time.Duration
	cancel           chan struct{}
	done             chan struct{}
	snapshots        map[string]map[string]changeSnapshotEntry
	intel            *intelligenceManager
	lastPersistError string
	lastPersistOKAt  time.Time
}

type changeCheckpoint struct {
	Version           int      `json:"version"`
	UpdatedAt         string   `json:"updated_at"`
	Roots             []string `json:"roots"`
	LastNativeEventID uint64   `json:"last_native_event_id"`
	NeedsRescan       bool     `json:"needs_rescan"`
}

func changeHistoryPath() string {
	if d := sentinelStateDir(); d != "" {
		return filepath.Join(d, "change-history.json.gz")
	}
	return ""
}
func changeCheckpointPath() string {
	if d := sentinelStateDir(); d != "" {
		return filepath.Join(d, "change-checkpoint.json.gz")
	}
	return ""
}
func newChangeManager(intel *intelligenceManager, ephemeralOpt ...bool) *changeManager {
	ephemeral := false
	if len(ephemeralOpt) > 0 {
		ephemeral = ephemeralOpt[0]
	}
	m := &changeManager{mode: "stopped", interval: 2500 * time.Millisecond, snapshots: map[string]map[string]changeSnapshotEntry{}, intel: intel, persistent: !ephemeral}
	if m.persistent {
		m.historyPath = changeHistoryPath()
		m.checkpointPath = changeCheckpointPath()
		m.loadPersistentState()
	}
	return m
}
func (m *changeManager) loadPersistentState() {
	if m.historyPath != "" {
		var w struct {
			Version int           `json:"version"`
			Events  []ChangeEvent `json:"events"`
		}
		if readGzipJSON(m.historyPath, &w) == nil && w.Version == 1 {
			if len(w.Events) > 500 {
				w.Events = w.Events[len(w.Events)-500:]
			}
			m.history = w.Events
		}
	}
	if m.checkpointPath != "" {
		var c changeCheckpoint
		if readGzipJSON(m.checkpointPath, &c) == nil && c.Version == 1 {
			m.lastNativeID = c.LastNativeEventID
			m.checkpointRoots = append([]string(nil), c.Roots...)
			m.checkpointRescan = c.NeedsRescan
			m.needsRescan = c.NeedsRescan
		}
	}
}
func (m *changeManager) persistStateLocked() {
	if !m.persistent {
		return
	}
	errorsSeen := []string{}
	if m.historyPath != "" {
		if err := writePrivateGzipJSON(m.historyPath, struct {
			Version int           `json:"version"`
			Events  []ChangeEvent `json:"events"`
		}{1, m.history}); err != nil {
			errorsSeen = append(errorsSeen, "history: "+err.Error())
		}
	}
	if m.checkpointPath != "" {
		if err := writePrivateGzipJSON(m.checkpointPath, changeCheckpoint{Version: 1, UpdatedAt: time.Now().UTC().Format(time.RFC3339), Roots: append([]string(nil), m.roots...), LastNativeEventID: m.lastNativeID, NeedsRescan: m.needsRescan}); err != nil {
			errorsSeen = append(errorsSeen, "checkpoint: "+err.Error())
		}
	}
	if len(errorsSeen) > 0 {
		m.lastPersistError = strings.Join(errorsSeen, "; ")
		return
	}
	m.lastPersistError = ""
	m.lastPersistOKAt = time.Now()
}
func equalStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	aa := append([]string(nil), a...)
	bb := append([]string(nil), b...)
	sort.Strings(aa)
	sort.Strings(bb)
	for i := range aa {
		if aa[i] != bb[i] {
			return false
		}
	}
	return true
}

func optTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}
func (m *changeManager) status() ChangeStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	last := int64(0)
	if len(m.events) > 0 {
		last = m.events[len(m.events)-1].At
	}
	note := "Session-only change intelligence. Monitoring stops when Sentinel exits."
	if m.running && m.mode == "native-fsevents" {
		note = "Native macOS CoreServices FSEvents stream. Dropped/root-changed signals force rescan-required state."
	}
	if m.running && m.mode == "polling-fallback" {
		note = "Bounded metadata polling fallback. No symlink following or file-content indexing."
	}
	return ChangeStatus{Running: m.running, Mode: m.mode, NativeAvailable: nativeFSEventsAvailable(), StartedAt: optTime(m.startedAt), Roots: append([]string(nil), m.roots...), EventCount: len(m.events), HistoryEntries: len(m.history), PersistentHistory: m.persistent, PersistenceHealthy: !m.persistent || m.lastPersistError == "", LastPersistError: m.lastPersistError, LastPersistOKAt: optTime(m.lastPersistOKAt), HistoryPath: m.historyPath, CheckpointPath: m.checkpointPath, LastNativeEventID: m.lastNativeID, ResumeCheckpoint: m.resumeCheckpoint, NeedsRescan: m.needsRescan, LastEventAt: last, DroppedSignals: m.dropped, PollIntervalMS: int(m.interval / time.Millisecond), Note: note}
}
func (m *changeManager) eventsSnapshot(limit int) []ChangeEvent {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	start := len(m.events) - limit
	if start < 0 {
		start = 0
	}
	out := append([]ChangeEvent(nil), m.events[start:]...)
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}
func (m *changeManager) historySnapshot(limit int) []ChangeEvent {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if limit <= 0 || limit > 500 {
		limit = 250
	}
	start := len(m.history) - limit
	if start < 0 {
		start = 0
	}
	out := append([]ChangeEvent(nil), m.history[start:]...)
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

func humanChangeTitle(e ChangeEvent) string {
	switch e.Kind {
	case "created":
		return "File created"
	case "removed":
		return "File removed"
	case "renamed":
		return "File renamed"
	case "modified":
		return "File modified"
	case "root_changed":
		return "Watched root changed"
	case "rescan_required":
		return "Filesystem stream requires rescan"
	case "reconciled":
		return "Filesystem hierarchy reconciled"
	}
	return "Filesystem change observed"
}
func changeSeverity(path, kind string) (string, string) {
	l := strings.ToLower(path)
	pers := strings.Contains(l, "/library/launchagents/") || strings.Contains(l, "/library/launchdaemons/")
	if kind == "root_changed" || kind == "rescan_required" {
		return "review", "Incremental change evidence may be incomplete; re-inspect the affected hierarchy."
	}
	if pers {
		if kind == "created" || kind == "removed" || kind == "renamed" {
			return "high", "A startup/persistence configuration path changed."
		}
		return "review", "A startup/persistence configuration path was modified."
	}
	if strings.Contains(l, "/downloads/") && (kind == "created" || kind == "renamed") {
		return "info", "A new or renamed object appeared in Downloads. Review only if unexpected."
	}
	return "info", "Filesystem metadata changed inside an explicitly watched root."
}
func (m *changeManager) appendEvent(e ChangeEvent) {
	m.mu.Lock()
	if n := len(m.events); n > 0 {
		last := m.events[n-1]
		if last.Path == e.Path && last.Kind == e.Kind && e.At-last.At <= 1 {
			m.events[n-1].Flags = uniqueStrings(append(m.events[n-1].Flags, e.Flags...))
			m.events[n-1].NeedsRescan = m.events[n-1].NeedsRescan || e.NeedsRescan
			if e.NeedsRescan {
				m.needsRescan = true
			}
			m.mu.Unlock()
			return
		}
	}
	if e.ID == "" {
		h := sha256.Sum256([]byte(fmt.Sprintf("%d\x00%s\x00%s", e.At, e.Kind, e.Path)))
		e.ID = "chg-" + hex.EncodeToString(h[:6])
	}
	m.events = append(m.events, e)
	if len(m.events) > 1000 {
		m.events = append([]ChangeEvent(nil), m.events[len(m.events)-1000:]...)
	}
	if e.NeedsRescan {
		m.needsRescan = true
	}
	m.history = append(m.history, e)
	if len(m.history) > 500 {
		m.history = append([]ChangeEvent(nil), m.history[len(m.history)-500:]...)
	}
	m.persistStateLocked()
	m.mu.Unlock()
	if m.intel != nil {
		m.intel.appendExternalEvent(TimelineEvent{ID: e.ID, At: e.At, Kind: "filesystem_change", Severity: e.Severity, Title: humanChangeTitle(e), Detail: e.Why + " · " + e.Path, ObjectID: entityID("file", e.Path)})
	}
}

func resolveChangeRoots(preset string, custom []string) ([]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	var roots []string
	switch strings.ToLower(strings.TrimSpace(preset)) {
	case "", "persistence":
		roots = []string{filepath.Join(home, "Library", "LaunchAgents"), "/Library/LaunchAgents", "/Library/LaunchDaemons"}
	case "downloads":
		roots = []string{filepath.Join(home, "Downloads")}
	case "workspace":
		roots = []string{filepath.Join(home, "Downloads"), filepath.Join(home, "Desktop"), filepath.Join(home, "Documents")}
	case "custom":
		if len(custom) == 0 {
			return nil, errors.New("custom preset requires at least one root")
		}
		if len(custom) > 5 {
			return nil, errors.New("at most 5 custom roots may be watched")
		}
		for _, p := range custom {
			rp, e := safeHomeWatchRoot(home, p)
			if e != nil {
				return nil, e
			}
			roots = append(roots, rp)
		}
	default:
		return nil, errors.New("unknown watch preset")
	}
	seen := map[string]bool{}
	out := []string{}
	for _, p := range roots {
		p = filepath.Clean(p)
		if seen[p] {
			continue
		}
		seen[p] = true
		if st, e := os.Stat(p); e == nil && st.IsDir() {
			out = append(out, p)
		}
	}
	return out, nil
}
func safeHomeWatchRoot(home, p string) (string, error) {
	p = strings.TrimSpace(p)
	if strings.HasPrefix(p, "~/") {
		p = filepath.Join(home, strings.TrimPrefix(p, "~/"))
	}
	if !filepath.IsAbs(p) {
		return "", errors.New("watch root must be absolute or start with ~/")
	}
	realHome, err := filepath.EvalSymlinks(home)
	if err != nil {
		realHome = filepath.Clean(home)
	}
	real, err := filepath.EvalSymlinks(filepath.Clean(p))
	if err != nil {
		return "", fmt.Errorf("watch root unavailable: %w", err)
	}
	rel, err := filepath.Rel(realHome, real)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", errors.New("custom watch roots must resolve inside the current user's home directory")
	}
	st, err := os.Stat(real)
	if err != nil || !st.IsDir() {
		return "", errors.New("watch root must be an existing directory")
	}
	return real, nil
}
func snapshotChangeRoot(root string, maxEntries int, budget time.Duration) (map[string]changeSnapshotEntry, bool) {
	out := map[string]changeSnapshotEntry{}
	deadline := time.Now().Add(budget)
	count := 0
	trunc := false
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if time.Now().After(deadline) || count >= maxEntries {
			trunc = true
			return fs.SkipAll
		}
		if path != root && d.Type()&os.ModeSymlink != 0 {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		info, e := d.Info()
		if e != nil {
			return nil
		}
		out[path] = changeSnapshotEntry{info.Size(), info.ModTime().UnixNano(), info.Mode(), info.IsDir()}
		count++
		return nil
	})
	return out, trunc
}
func emitSnapshotDiff(m *changeManager, root string, old, next map[string]changeSnapshotEntry) {
	now := time.Now().Unix()
	paths := []string{}
	for p := range next {
		paths = append(paths, p)
	}
	for p := range old {
		if _, ok := next[p]; !ok {
			paths = append(paths, p)
		}
	}
	sort.Strings(paths)
	seen := map[string]bool{}
	for _, p := range paths {
		if seen[p] {
			continue
		}
		seen[p] = true
		o, ook := old[p]
		n, nok := next[p]
		kind := ""
		switch {
		case !ook && nok:
			kind = "created"
		case ook && !nok:
			kind = "removed"
		case ook && nok && (o.Size != n.Size || o.ModUnix != n.ModUnix || o.Mode != n.Mode):
			if o.IsDir && n.IsDir {
				continue
			}
			kind = "modified"
		}
		if kind != "" {
			sev, why := changeSeverity(p, kind)
			m.appendEvent(ChangeEvent{At: now, Path: p, Root: root, Kind: kind, Source: "polling-fallback", Severity: sev, Why: why})
		}
	}
}
func (m *changeManager) pollLoop(cancel <-chan struct{}, done chan<- struct{}) {
	defer close(done)
	t := time.NewTicker(m.interval)
	defer t.Stop()
	for {
		select {
		case <-cancel:
			return
		case <-t.C:
			m.pollOnce()
		}
	}
}
func (m *changeManager) pollOnce() {
	m.mu.RLock()
	roots := append([]string(nil), m.roots...)
	oldAll := m.snapshots
	m.mu.RUnlock()
	for _, root := range roots {
		next, trunc := snapshotChangeRoot(root, 20000, 1400*time.Millisecond)
		old := oldAll[root]
		if old == nil {
			old = map[string]changeSnapshotEntry{}
		}
		if trunc {
			sev, why := changeSeverity(root, "rescan_required")
			m.appendEvent(ChangeEvent{At: time.Now().Unix(), Path: root, Root: root, Kind: "rescan_required", Source: "polling-fallback", NeedsRescan: true, Severity: sev, Why: why})
		}
		emitSnapshotDiff(m, root, old, next)
		m.mu.Lock()
		m.snapshots[root] = next
		m.mu.Unlock()
	}
}
func (m *changeManager) start(preset string, custom []string, intervalMS int) error {
	roots, err := resolveChangeRoots(preset, custom)
	if err != nil {
		return err
	}
	if len(roots) == 0 {
		return errors.New("no watch roots are available")
	}
	iv := 2500 * time.Millisecond
	if intervalMS > 0 {
		if intervalMS < 1000 {
			intervalMS = 1000
		}
		if intervalMS > 10000 {
			intervalMS = 10000
		}
		iv = time.Duration(intervalMS) * time.Millisecond
	}
	m.stop()
	m.mu.Lock()
	m.running = true
	m.mode = "polling-fallback"
	m.startedAt = time.Now()
	m.roots = roots
	m.interval = iv
	m.cancel = make(chan struct{})
	m.done = make(chan struct{})
	m.needsRescan = m.checkpointRescan
	m.dropped = 0
	m.resumeCheckpoint = false
	m.snapshots = map[string]map[string]changeSnapshotEntry{}
	cancel, done := m.cancel, m.done
	since := uint64(0)
	if nativeFSEventsAvailable() && !m.checkpointRescan && equalStringSet(m.checkpointRoots, roots) && m.lastNativeID > 0 {
		since = m.lastNativeID
		m.resumeCheckpoint = true
	}
	m.mu.Unlock()
	if nativeFSEventsAvailable() {
		if err := startNativeFSEvents(roots, since, func(p string, f uint32, id uint64) { m.handleNative(p, f, id) }); err == nil {
			m.mu.Lock()
			m.mode = "native-fsevents"
			m.mu.Unlock()
			go func() { <-cancel; stopNativeFSEvents(); close(done) }()
			return nil
		}
	}
	for _, r := range roots {
		snap, _ := snapshotChangeRoot(r, 20000, 1400*time.Millisecond)
		m.snapshots[r] = snap
	}
	go m.pollLoop(cancel, done)
	return nil
}
func (m *changeManager) stop() {
	m.mu.Lock()
	if !m.running {
		m.mu.Unlock()
		return
	}
	c, d := m.cancel, m.done
	m.running = false
	m.mode = "stopped"
	m.cancel = nil
	m.done = nil
	m.persistStateLocked()
	m.mu.Unlock()
	if c != nil {
		close(c)
	}
	if d != nil {
		select {
		case <-d:
		case <-time.After(2 * time.Second):
		}
	}
}
func (m *changeManager) clear() {
	m.mu.Lock()
	m.events = nil
	m.needsRescan = false
	m.checkpointRescan = false
	m.dropped = 0
	m.persistStateLocked()
	m.mu.Unlock()
}
func normalizeNativeFSEventFlags(flags uint32) ([]string, string, bool, bool) {
	const (
		must     = 0x1
		user     = 0x2
		kernel   = 0x4
		root     = 0x20
		created  = 0x100
		removed  = 0x200
		inode    = 0x400
		renamed  = 0x800
		modified = 0x1000
		finder   = 0x2000
		owner    = 0x4000
		xattr    = 0x8000
	)
	names := []string{}
	add := func(bit uint32, n string) {
		if flags&bit != 0 {
			names = append(names, n)
		}
	}
	add(must, "must_scan_subdirs")
	add(user, "user_dropped")
	add(kernel, "kernel_dropped")
	add(root, "root_changed")
	add(created, "item_created")
	add(removed, "item_removed")
	add(renamed, "item_renamed")
	add(modified, "item_modified")
	add(inode, "inode_meta_modified")
	add(finder, "finder_info_modified")
	add(owner, "owner_changed")
	add(xattr, "xattr_modified")
	kind := "changed"
	rescan, dropped := false, false
	if flags&(must|user|kernel) != 0 {
		kind = "rescan_required"
		rescan = true
		dropped = flags&(user|kernel) != 0
	} else if flags&root != 0 {
		kind = "root_changed"
		rescan = true
	} else if flags&created != 0 {
		kind = "created"
	} else if flags&removed != 0 {
		kind = "removed"
	} else if flags&renamed != 0 {
		kind = "renamed"
	} else if flags&(modified|inode|finder|owner|xattr) != 0 {
		kind = "modified"
	}
	if len(names) == 0 {
		names = []string{"none"}
	}
	return names, kind, rescan, dropped
}
func (m *changeManager) handleNative(path string, flags uint32, eventID uint64) {
	names, kind, rescan, dropped := normalizeNativeFSEventFlags(flags)
	root := path
	m.mu.RLock()
	for _, r := range m.roots {
		if path == r || strings.HasPrefix(path, r+string(os.PathSeparator)) {
			root = r
			break
		}
	}
	m.mu.RUnlock()
	m.mu.Lock()
	if eventID > m.lastNativeID {
		m.lastNativeID = eventID
	}
	if dropped {
		m.dropped++
	}
	if rescan {
		m.checkpointRescan = true
	}
	m.mu.Unlock()
	sev, why := changeSeverity(path, kind)
	m.appendEvent(ChangeEvent{ID: fmt.Sprintf("fse-%d", eventID), At: time.Now().Unix(), Path: path, Root: root, Kind: kind, Source: "native-fsevents", Flags: names, NeedsRescan: rescan, Severity: sev, Why: why})
}

type ChangeReconcileResult struct {
	GeneratedAt    string   `json:"generated_at"`
	Roots          int      `json:"roots"`
	Complete       bool     `json:"complete"`
	TruncatedRoots []string `json:"truncated_roots,omitempty"`
	Note           string   `json:"note"`
}

func (m *changeManager) reconcile() ChangeReconcileResult {
	m.mu.RLock()
	roots := append([]string(nil), m.roots...)
	m.mu.RUnlock()
	out := ChangeReconcileResult{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Roots: len(roots), Complete: true, Note: "Bounded hierarchy reconciliation establishes a fresh current-state view after an event-gap warning. It cannot reconstruct every missed historical event."}
	if len(roots) == 0 {
		out.Complete = false
		out.Note = "No active watch roots are available to reconcile."
		return out
	}
	for _, root := range roots {
		snap, trunc := snapshotChangeRoot(root, 50000, 3*time.Second)
		if trunc {
			out.Complete = false
			out.TruncatedRoots = append(out.TruncatedRoots, root)
		}
		m.mu.Lock()
		m.snapshots[root] = snap
		m.mu.Unlock()
	}
	m.mu.Lock()
	if out.Complete {
		m.needsRescan = false
		m.checkpointRescan = false
	}
	m.persistStateLocked()
	m.mu.Unlock()
	if out.Complete {
		m.appendEvent(ChangeEvent{At: time.Now().Unix(), Path: roots[0], Root: roots[0], Kind: "reconciled", Source: "sentinel-reconcile", Severity: "info", Why: "A bounded full hierarchy reconciliation completed after a rescan-required condition."})
	}
	return out
}

func (a *app) handleChangeStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, a.changes.status())
}
func (a *app) handleChangeEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, map[string]any{"status": a.changes.status(), "events": a.changes.eventsSnapshot(250)})
}
func (a *app) handleChangeStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	var q changeStartRequest
	if err := decodeJSON(r, &q); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	if err := a.changes.start(q.Preset, q.Roots, q.IntervalMS); err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, a.changes.status())
}
func (a *app) handleChangeStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	a.changes.stop()
	writeJSON(w, 200, a.changes.status())
}
func (a *app) handleChangeClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	a.changes.clear()
	writeJSON(w, 200, map[string]any{"ok": true, "status": a.changes.status()})
}
func (a *app) handleChangeReconcile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	writeJSON(w, 200, a.changes.reconcile())
}

func (a *app) handleChangeHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, map[string]any{"status": a.changes.status(), "events": a.changes.historySnapshot(500), "note": "Bounded local path metadata history; no file contents are stored. Ephemeral mode keeps this in memory only."})
}

func (a *app) handleChangeReview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	events := a.changes.eventsSnapshot(250)
	pers := false
	ins := []IntegrityInspection{}
	seen := map[string]bool{}
	for _, e := range events {
		l := strings.ToLower(e.Path)
		if strings.Contains(l, "/library/launchagents/") || strings.Contains(l, "/library/launchdaemons/") {
			pers = true
		}
		if (e.Kind == "created" || e.Kind == "modified" || e.Kind == "renamed") && !seen[e.Path] {
			if st, err := os.Stat(e.Path); err == nil && !st.IsDir() && st.Mode().IsRegular() && st.Size() <= 64<<20 {
				seen[e.Path] = true
				x := inspectIntegrity(e.Path)
				if x.Exists {
					ins = append(ins, x)
					if len(ins) >= 12 {
						break
					}
				}
			}
		}
	}
	var p any = map[string]any{"touched": false, "note": "No watched persistence path changed."}
	if pers {
		p = a.persistence.capture()
	}
	writeJSON(w, 200, map[string]any{"generated_at": time.Now().UTC().Format(time.RFC3339), "events_reviewed": len(events), "persistence": p, "integrity_inspections": ins, "note": "Targeted review only; changed files are evidence, not malware verdicts."})
}
