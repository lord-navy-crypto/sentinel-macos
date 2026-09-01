#!/usr/bin/env python3
from pathlib import Path


def replace_exact(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} exact match(es), found {actual}")
    p.write_text(text.replace(old, new, count))

# 1) Storage active scan concurrency gate.
replace_exact("advanced.go", '''type scanManager struct {
\tmu       sync.RWMutex
\tjobs     map[string]*ScanJob
\tlatestID string
}

func newScanManager() *scanManager { return &scanManager{jobs: make(map[string]*ScanJob)} }
''', '''type scanManager struct {
\tmu       sync.RWMutex
\tjobs     map[string]*ScanJob
\tlatestID string
}

const storageMaxActiveJobs = 2

var errStorageScanCapacity = errors.New("storage scan capacity reached")

func newScanManager() *scanManager { return &scanManager{jobs: make(map[string]*ScanJob)} }

func (m *scanManager) activeJobsLocked() int {
\tactive := 0
\tfor _, job := range m.jobs {
\t\tif job != nil && job.Status == "running" {
\t\t\tactive++
\t\t}
\t}
\treturn active
}
''')
replace_exact("advanced.go", '''\tm.mu.Lock()
\tm.jobs[id] = job
\tm.latestID = id
\t// Bound in-memory job history.
''', '''\tm.mu.Lock()
\tif m.activeJobsLocked() >= storageMaxActiveJobs {
\t\tm.mu.Unlock()
\t\tcancel()
\t\treturn nil, errStorageScanCapacity
\t}
\tm.jobs[id] = job
\tm.latestID = id
\t// Bound completed in-memory job history separately from the active-work gate.
''')
replace_exact("advanced.go", '''\t\tj, err := a.jobs.create(req)
\t\tif err != nil {
\t\t\twriteJSON(w, 400, map[string]any{"error": err.Error()})
\t\t\treturn
\t\t}
''', '''\t\tj, err := a.jobs.create(req)
\t\tif err != nil {
\t\t\tif errors.Is(err, errStorageScanCapacity) {
\t\t\t\twriteJSON(w, http.StatusTooManyRequests, map[string]any{"error": err.Error(), "retryable": true, "active_limit": storageMaxActiveJobs})
\t\t\t\treturn
\t\t\t}
\t\t\twriteJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
\t\t\treturn
\t\t}
''')

# 2) Safe Action journal transaction / rollback.
replace_exact("actions.go", '''func (a *app) recordAction(e *ActionJournalEntry) {
\tif a.actions != nil {
\t\t_ = a.actions.appendJournal(*e)
\t}
\tif a.intel != nil {
\t\tsev := "info"
\t\tif e.Status != "success" {
\t\t\tsev = "review"
\t\t}
\t\ta.intel.appendExternalEvent(TimelineEvent{ID: entityID("event", e.ID), At: time.Now().Unix(), Kind: "safe_action", Severity: sev, Title: actionDisplayName(e.Action) + " · " + e.Status, Detail: e.Message, ObjectID: entityID("file", normalizeEvidencePath(func() string {
\t\t\tif e.To != "" {
\t\t\t\treturn e.To
\t\t\t}
\t\t\treturn e.From
\t\t}()))})
\t}
}
''', '''func (a *app) recordAction(e *ActionJournalEntry) error {
\tif a.actions == nil {
\t\treturn fmt.Errorf("Safe Action recovery journal is unavailable")
\t}
\tif err := a.actions.appendJournal(*e); err != nil {
\t\treturn fmt.Errorf("could not durably record recovery journal: %w", err)
\t}
\tif a.intel != nil {
\t\tsev := "info"
\t\tif e.Status != "success" {
\t\t\tsev = "review"
\t\t}
\t\ta.intel.appendExternalEvent(TimelineEvent{ID: entityID("event", e.ID), At: time.Now().Unix(), Kind: "safe_action", Severity: sev, Title: actionDisplayName(e.Action) + " · " + e.Status, Detail: e.Message, ObjectID: entityID("file", normalizeEvidencePath(func() string {
\t\t\tif e.To != "" {
\t\t\t\treturn e.To
\t\t\t}
\t\t\treturn e.From
\t\t}()))})
\t}
\treturn nil
}

func (a *app) commitAction(e *ActionJournalEntry, rollback func() error) error {
\tif err := a.recordAction(e); err != nil {
\t\tif rollback == nil {
\t\t\treturn err
\t\t}
\t\tif rollbackErr := rollback(); rollbackErr != nil {
\t\t\treturn fmt.Errorf("%v; automatic rollback also failed: %w", err, rollbackErr)
\t\t}
\t\treturn fmt.Errorf("%w; filesystem mutation was rolled back", err)
\t}
\treturn nil
}
''')
replace_exact("actions.go", '''\te.Observation = a.postActionObservation(p.Source, p.Destination)
\ta.recordAction(&e)
\treturn e, nil
}

// executeVault''', '''\te.Observation = a.postActionObservation(p.Source, p.Destination)
\tif err := a.commitAction(&e, func() error {
\t\treturn moveRegularNoReplace(p.Destination, p.Source)
\t}); err != nil {
\t\treturn ActionJournalEntry{}, err
\t}
\treturn e, nil
}

// executeVault''')
replace_exact("actions.go", '''\te.Observation = a.postActionObservation(p.Source, p.Destination)
\ta.recordAction(&e)
\treturn e, nil
}

func (a *app) executeRestore''', '''\te.Observation = a.postActionObservation(p.Source, p.Destination)
\tif err := a.commitAction(&e, func() error {
\t\tif err := os.Chmod(p.Destination, os.FileMode(originalMode).Perm()); err != nil {
\t\t\treturn err
\t\t}
\t\tif err := moveRegularNoReplace(p.Destination, p.Source); err != nil {
\t\t\treturn err
\t\t}
\t\treturn os.RemoveAll(dir)
\t}); err != nil {
\t\treturn ActionJournalEntry{}, err
\t}
\treturn e, nil
}

func (a *app) executeRestore''')
replace_exact("actions.go", '''\tmanifest, err := a.actions.loadVaultManifest(p.VaultID)
\tif err != nil {
\t\treturn ActionJournalEntry{}, err
\t}
\tif manifest.VaultPath == "" {
''', '''\tmanifest, err := a.actions.loadVaultManifest(p.VaultID)
\tif err != nil {
\t\treturn ActionJournalEntry{}, err
\t}
\tactiveManifest := manifest
\tif manifest.VaultPath == "" {
''')
replace_exact("actions.go", '''\te.Observation = a.postActionObservation(p.Source, p.Destination)
\ta.recordAction(&e)
\treturn e, nil
}

func (a *app) postActionObservation''', '''\te.Observation = a.postActionObservation(p.Source, p.Destination)
\tif err := a.commitAction(&e, func() error {
\t\tif err := os.Chmod(p.Destination, 0600); err != nil {
\t\t\treturn err
\t\t}
\t\tif err := moveRegularNoReplace(p.Destination, p.Source); err != nil {
\t\t\treturn err
\t\t}
\t\treturn a.actions.writeManifest(activeManifest)
\t}); err != nil {
\t\treturn ActionJournalEntry{}, err
\t}
\treturn e, nil
}

func (a *app) postActionObservation''')

# 3) Trust profile / previous-profile restore through hardened state I/O.
replace_exact("trust.go", '''func (m *trustManager) load() {
\tif m.path == "" {
\t\treturn
\t}
\traw, err := os.ReadFile(m.path)
\tif err != nil {
\t\treturn
\t}
\tvar p TrustProfile
\tif json.Unmarshal(raw, &p) == nil && p.Version == trustProfileVersion && p.CreatedAt != "" {
\t\tm.profile = &p
\t\tm.loadedDisk = true
\t}
}
''', '''func (m *trustManager) load() {
\tif m.path == "" {
\t\treturn
\t}
\tvar p TrustProfile
\tif err := readPrivateJSON(m.path, &p); err == nil && p.Version == trustProfileVersion && p.CreatedAt != "" {
\t\tm.profile = &p
\t\tm.loadedDisk = true
\t}
}
''')
replace_exact("trust.go", '''func (m *trustManager) persistLocked(p TrustProfile) error {
\tif !m.persistent || m.path == "" {
\t\treturn nil
\t}
\tif old, err := os.ReadFile(m.path); err == nil && len(old) > 0 {
\t\t// The .prev profile is an intentional user-facing rollback point, separate
\t\t// from the automatic .bak crash-recovery copy maintained by stateio.
\t\t_ = atomicPrivateWrite(m.backupPath, old)
\t}
\treturn writePrivateJSON(m.path, p)
}
''', '''func (m *trustManager) persistLocked(p TrustProfile) error {
\tif !m.persistent || m.path == "" {
\t\treturn nil
\t}
\tif old, err := readBoundedPrivateFile(m.path, maxPrivateJSONBytes); err == nil && len(old) > 0 {
\t\t// The .prev profile is an intentional user-facing rollback point, separate
\t\t// from the automatic .bak crash-recovery copy maintained by stateio.
\t\tif err := atomicPrivateWrite(m.backupPath, old); err != nil {
\t\t\treturn fmt.Errorf("could not preserve previous Trust Profile rollback point: %w", err)
\t\t}
\t} else if err != nil && !os.IsNotExist(err) {
\t\treturn fmt.Errorf("could not safely read current Trust Profile before replacement: %w", err)
\t}
\treturn writePrivateJSON(m.path, p)
}
''')
replace_exact("trust.go", '''func validateTrustFile(path string) (exists, valid bool, mode string) {
\tinfo, err := os.Stat(path)
\tif err != nil {
\t\treturn false, false, ""
\t}
\texists = true
\tmode = fileModeString(info)
\traw, err := os.ReadFile(path)
\tif err != nil {
\t\treturn exists, false, mode
\t}
\tvar p TrustProfile
\tvalid = json.Unmarshal(raw, &p) == nil && p.Version == trustProfileVersion && p.CreatedAt != "" && len(p.Objects) <= 120
\treturn
}
''', '''func validateTrustFile(path string) (exists, valid bool, mode string) {
\tinfo, err := os.Lstat(path)
\tif err != nil {
\t\treturn false, false, ""
\t}
\texists = true
\tmode = fileModeString(info)
\tif info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
\t\treturn exists, false, mode
\t}
\tvar p TrustProfile
\tvalid = readPrivateJSON(path, &p) == nil && p.Version == trustProfileVersion && p.CreatedAt != "" && len(p.Objects) <= 120
\treturn
}
''')
replace_exact("trust.go", '''func (m *trustManager) restorePrevious() (TrustProfile, error) {
\tm.mu.Lock()
\tdefer m.mu.Unlock()
\tif !m.persistent || m.backupPath == "" || m.path == "" {
\t\treturn TrustProfile{}, fmt.Errorf("previous-profile restore is unavailable in ephemeral mode")
\t}
\tbackupRaw, err := os.ReadFile(m.backupPath)
\tif err != nil {
\t\treturn TrustProfile{}, fmt.Errorf("previous profile unavailable: %w", err)
\t}
\tvar previous TrustProfile
\tif json.Unmarshal(backupRaw, &previous) != nil || previous.Version != trustProfileVersion || previous.CreatedAt == "" {
\t\treturn TrustProfile{}, fmt.Errorf("previous profile is invalid")
\t}
\tcurrentRaw, _ := os.ReadFile(m.path)
\ttmp := m.path + ".restore.tmp"
\tif err := os.WriteFile(tmp, backupRaw, 0600); err != nil {
\t\treturn TrustProfile{}, err
\t}
\tif err := os.Rename(tmp, m.path); err != nil {
\t\t_ = os.Remove(tmp)
\t\treturn TrustProfile{}, err
\t}
\t_ = os.Chmod(m.path, 0600)
\tif len(currentRaw) > 0 {
\t\tif err := os.WriteFile(m.backupPath, currentRaw, 0600); err == nil {
\t\t\t_ = os.Chmod(m.backupPath, 0600)
\t\t}
\t}
\tm.profile = &previous
\tm.loadedDisk = false
\tm.lastDrift = TrustDrift{}
\treturn previous, nil
}
''', '''func (m *trustManager) restorePrevious() (TrustProfile, error) {
\tm.mu.Lock()
\tdefer m.mu.Unlock()
\tif !m.persistent || m.backupPath == "" || m.path == "" {
\t\treturn TrustProfile{}, fmt.Errorf("previous-profile restore is unavailable in ephemeral mode")
\t}
\tvar previous TrustProfile
\tif err := readPrivateJSON(m.backupPath, &previous); err != nil || previous.Version != trustProfileVersion || previous.CreatedAt == "" {
\t\treturn TrustProfile{}, fmt.Errorf("previous profile is invalid or unavailable")
\t}
\tbackupRaw, err := readBoundedPrivateFile(m.backupPath, maxPrivateJSONBytes)
\tif err != nil {
\t\treturn TrustProfile{}, fmt.Errorf("previous profile unavailable: %w", err)
\t}
\tcurrentRaw, currentErr := readBoundedPrivateFile(m.path, maxPrivateJSONBytes)
\tif currentErr != nil && !os.IsNotExist(currentErr) {
\t\treturn TrustProfile{}, fmt.Errorf("current profile could not be safely preserved before restore: %w", currentErr)
\t}
\tif err := atomicPrivateWrite(m.path, backupRaw); err != nil {
\t\treturn TrustProfile{}, fmt.Errorf("could not atomically restore previous profile: %w", err)
\t}
\tif currentErr == nil && len(currentRaw) > 0 {
\t\tif err := atomicPrivateWrite(m.backupPath, currentRaw); err != nil {
\t\t\tif rollbackErr := atomicPrivateWrite(m.path, currentRaw); rollbackErr != nil {
\t\t\t\treturn TrustProfile{}, fmt.Errorf("could not rotate Trust Profile rollback point: %v; rollback also failed: %w", err, rollbackErr)
\t\t\t}
\t\t\treturn TrustProfile{}, fmt.Errorf("could not rotate Trust Profile rollback point; restore was rolled back: %w", err)
\t\t}
\t}
\tm.profile = &previous
\tm.loadedDisk = false
\tm.lastDrift = TrustDrift{}
\treturn previous, nil
}
''')

# 4) Preserve HTTP status on frontend errors and distinguish scan outcomes.
replace_exact("web/app/core.js", '''    if(!response.ok)throw new Error(data?.error||`HTTP ${response.status}`);
    return data;
''', '''    if(!response.ok){
      const error=new Error(data?.error||`HTTP ${response.status}`);
      error.status=response.status;error.payload=data;error.url=url;
      throw error;
    }
    return data;
''')
replace_exact("web/app/full-scan.js", '''    completedAt: 0,
  };
''', '''    completedAt: 0,
    outcome: 'IDLE',
  };
''')
replace_exact("web/app/full-scan.js", '''  function renderFullScanProgress() {
    if (!fullScan.stages.length) return '';
    const done = fullScan.stages.filter(s => ['done', 'limited'].includes(s.status)).length;
    return `<div class="full-scan-progress"><div class="full-scan-summary"><div><span>FULL SCAN</span><b>${fullScan.running ? 'Building retained evidence baseline' : 'Scan finished'}</b><small>${done}/${fullScan.stages.length} stage(s) completed or bounded-limited</small></div><progress max="${fullScan.stages.length}" value="${done}"></progress></div><div class="full-scan-stages">${fullScan.stages.map((s, i) => `<div class="full-scan-stage ${esc(s.status)}"><span>${String(i + 1).padStart(2, '0')}</span><div><b>${esc(s.label)}</b><small>${esc(s.detail || stageStatusText(s.status))}</small></div>${badge(s.status.toUpperCase(), s.status === 'done' ? 'good' : s.status === 'limited' ? 'warn' : s.status === 'running' ? 'focus' : '')}</div>`).join('')}</div></div>`;
  }

  function stageStatusText(status) {
    return ({pending: 'Waiting', running: 'Collecting local evidence…', done: 'Captured', limited: 'Completed with an unavailable / bounded source', cancelled: 'Cancelled'})[status] || status;
  }

  function refreshProgress() {
    const node = $('#fullScanProgress');
    if (node) node.innerHTML = renderFullScanProgress();
    const done = fullScan.stages.filter(s => ['done', 'limited'].includes(s.status)).length;
    const pct = Math.round(done / Math.max(1, fullScan.stages.length) * 100);
    const active = fullScan.stages.find(s => s.status === 'running');
    activity(fullScan.running ? 'Full Scan' : 'Ready', pct, active ? active.label : `${done}/${fullScan.stages.length} Full Scan stages`);
  }
''', '''  function renderFullScanProgress() {
    if (!fullScan.stages.length) return '';
    const terminal = fullScan.stages.filter(s => ['done', 'limited', 'failed', 'cancelled'].includes(s.status)).length;
    return `<div class="full-scan-progress"><div class="full-scan-summary"><div><span>FULL SCAN · ${esc(fullScan.outcome)}</span><b>${fullScan.running ? 'Building retained evidence baseline' : 'Scan finished'}</b><small>${terminal}/${fullScan.stages.length} stage(s) reached a terminal state</small></div><progress max="${fullScan.stages.length}" value="${terminal}"></progress></div><div class="full-scan-stages">${fullScan.stages.map((s, i) => `<div class="full-scan-stage ${esc(s.status)}"><span>${String(i + 1).padStart(2, '0')}</span><div><b>${esc(s.label)}</b><small>${esc(s.detail || stageStatusText(s.status))}</small></div>${badge(s.status.toUpperCase(), s.status === 'done' ? 'good' : s.status === 'limited' ? 'warn' : s.status === 'failed' ? 'bad' : s.status === 'running' ? 'focus' : '')}</div>`).join('')}</div></div>`;
  }

  function stageStatusText(status) {
    return ({pending: 'Waiting', running: 'Collecting local evidence…', done: 'Captured', limited: 'Completed with an unavailable / bounded source', failed: 'Sentinel could not complete this stage', cancelled: 'Cancelled'})[status] || status;
  }

  function classifyStageError(error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || '');
    if ([403, 408, 429, 501, 503].includes(status)) return 'limited';
    if (/permission|unavailable|unsupported|not available|timed out|bounded|visibility/i.test(message)) return 'limited';
    return 'failed';
  }

  function refreshProgress() {
    const node = $('#fullScanProgress');
    if (node) node.innerHTML = renderFullScanProgress();
    const terminal = fullScan.stages.filter(s => ['done', 'limited', 'failed', 'cancelled'].includes(s.status)).length;
    const pct = Math.round(terminal / Math.max(1, fullScan.stages.length) * 100);
    const active = fullScan.stages.find(s => s.status === 'running');
    activity(fullScan.running ? 'Full Scan' : fullScan.outcome === 'FAILED' ? 'Error' : 'Ready', pct, active ? active.label : `${terminal}/${fullScan.stages.length} Full Scan stages`);
  }
''')
replace_exact("web/app/full-scan.js", '''    fullScan.completedAt = 0;
    fullScan.stages = scanStages().map(stage => ({...stage, status: 'pending', detail: ''}));
''', '''    fullScan.completedAt = 0;
    fullScan.outcome = 'RUNNING';
    fullScan.stages = scanStages().map(stage => ({...stage, status: 'pending', detail: ''}));
''')
replace_exact("web/app/full-scan.js", '''        stage.status = 'limited';
        stage.detail = error?.message || 'Source unavailable or bounded';
''', '''        stage.status = classifyStageError(error);
        stage.detail = error?.message || (stage.status === 'limited' ? 'Source unavailable or bounded' : 'Stage failed');
''')
replace_exact("web/app/full-scan.js", '''    if (fullScan.cancelRequested) {
      notice('Full Scan cancelled. Evidence already captured by completed stages remains retained; no fabricated completion state was created.');
      return;
    }
    const limited = fullScan.stages.filter(stage => stage.status === 'limited').length;
    notice(limited ? `Full Scan complete with ${limited} bounded/unavailable stage(s). Retained evidence is ready for analysis.` : 'Full Scan complete. Retained evidence baseline is ready for analysis.');
    setTimeout(() => S.navigate('status', {push: false}), 250);
''', '''    if (fullScan.cancelRequested) {
      for (const stage of fullScan.stages) if (stage.status === 'pending') stage.status = 'cancelled';
      fullScan.outcome = 'CANCELLED';
      refreshProgress();
      notice('Full Scan cancelled. Evidence already captured by completed stages remains retained; no fabricated completion state was created.');
      return;
    }
    const failed = fullScan.stages.filter(stage => stage.status === 'failed').length;
    const limited = fullScan.stages.filter(stage => stage.status === 'limited').length;
    if (failed > 0) {
      fullScan.outcome = 'FAILED';
      refreshProgress();
      notice(`Full Scan incomplete: ${failed} stage(s) failed. Completed evidence remains available, but Sentinel will not label this run a complete retained baseline.`);
      return;
    }
    fullScan.outcome = limited > 0 ? 'LIMITED' : 'DONE';
    refreshProgress();
    notice(limited ? `Full Scan completed in LIMITED state with ${limited} bounded/unavailable stage(s). Retained evidence is usable with those limitations.` : 'Full Scan DONE. Retained evidence baseline is ready for analysis.');
    setTimeout(() => S.navigate('status', {push: false}), 250);
''')
replace_exact("web/app/full-scan.js", '''    capabilityGroups: CAPABILITY_GROUPS,
  };
''', '''    capabilityGroups: CAPABILITY_GROUPS,
    state: fullScan,
  };
''')

# 5) Persistence error visibility: Change Monitor.
replace_exact("change_monitor.go", '''\tPersistentHistory bool     `json:"persistent_history"`
\tHistoryPath       string   `json:"history_path,omitempty"`
''', '''\tPersistentHistory bool     `json:"persistent_history"`
\tPersistenceHealthy bool    `json:"persistence_healthy"`
\tLastPersistError  string   `json:"last_persist_error,omitempty"`
\tLastPersistOKAt   string   `json:"last_persist_ok_at,omitempty"`
\tHistoryPath       string   `json:"history_path,omitempty"`
''')
replace_exact("change_monitor.go", '''\tintel            *intelligenceManager
}
''', '''\tintel            *intelligenceManager
\tlastPersistError string
\tlastPersistOKAt  time.Time
}
''')
replace_exact("change_monitor.go", '''func (m *changeManager) persistStateLocked() {
\tif !m.persistent {
\t\treturn
\t}
\tif m.historyPath != "" {
\t\t_ = writePrivateGzipJSON(m.historyPath, struct {
\t\t\tVersion int           `json:"version"`
\t\t\tEvents  []ChangeEvent `json:"events"`
\t\t}{1, m.history})
\t}
\tif m.checkpointPath != "" {
\t\t_ = writePrivateGzipJSON(m.checkpointPath, changeCheckpoint{Version: 1, UpdatedAt: time.Now().UTC().Format(time.RFC3339), Roots: append([]string(nil), m.roots...), LastNativeEventID: m.lastNativeID, NeedsRescan: m.needsRescan})
\t}
}
''', '''func (m *changeManager) persistStateLocked() {
\tif !m.persistent {
\t\treturn
\t}
\terrorsSeen := []string{}
\tif m.historyPath != "" {
\t\tif err := writePrivateGzipJSON(m.historyPath, struct {
\t\t\tVersion int           `json:"version"`
\t\t\tEvents  []ChangeEvent `json:"events"`
\t\t}{1, m.history}); err != nil {
\t\t\terrorsSeen = append(errorsSeen, "history: "+err.Error())
\t\t}
\t}
\tif m.checkpointPath != "" {
\t\tif err := writePrivateGzipJSON(m.checkpointPath, changeCheckpoint{Version: 1, UpdatedAt: time.Now().UTC().Format(time.RFC3339), Roots: append([]string(nil), m.roots...), LastNativeEventID: m.lastNativeID, NeedsRescan: m.needsRescan}); err != nil {
\t\t\terrorsSeen = append(errorsSeen, "checkpoint: "+err.Error())
\t\t}
\t}
\tif len(errorsSeen) > 0 {
\t\tm.lastPersistError = strings.Join(errorsSeen, "; ")
\t\treturn
\t}
\tm.lastPersistError = ""
\tm.lastPersistOKAt = time.Now()
}
''')
replace_exact("change_monitor.go", '''\treturn ChangeStatus{Running: m.running, Mode: m.mode, NativeAvailable: nativeFSEventsAvailable(), StartedAt: optTime(m.startedAt), Roots: append([]string(nil), m.roots...), EventCount: len(m.events), HistoryEntries: len(m.history), PersistentHistory: m.persistent, HistoryPath: m.historyPath, CheckpointPath: m.checkpointPath, LastNativeEventID: m.lastNativeID, ResumeCheckpoint: m.resumeCheckpoint, NeedsRescan: m.needsRescan, LastEventAt: last, DroppedSignals: m.dropped, PollIntervalMS: int(m.interval / time.Millisecond), Note: note}
''', '''\treturn ChangeStatus{Running: m.running, Mode: m.mode, NativeAvailable: nativeFSEventsAvailable(), StartedAt: optTime(m.startedAt), Roots: append([]string(nil), m.roots...), EventCount: len(m.events), HistoryEntries: len(m.history), PersistentHistory: m.persistent, PersistenceHealthy: !m.persistent || m.lastPersistError == "", LastPersistError: m.lastPersistError, LastPersistOKAt: optTime(m.lastPersistOKAt), HistoryPath: m.historyPath, CheckpointPath: m.checkpointPath, LastNativeEventID: m.lastNativeID, ResumeCheckpoint: m.resumeCheckpoint, NeedsRescan: m.needsRescan, LastEventAt: last, DroppedSignals: m.dropped, PollIntervalMS: int(m.interval / time.Millisecond), Note: note}
''')

# Persistence error visibility: Incidents.
replace_exact("incidents.go", '''\tPersistent  bool       `json:"persistent"`
\tHistoryPath string     `json:"history_path,omitempty"`
''', '''\tPersistent         bool       `json:"persistent"`
\tPersistenceHealthy bool       `json:"persistence_healthy"`
\tLastPersistError   string     `json:"last_persist_error,omitempty"`
\tLastPersistOKAt    string     `json:"last_persist_ok_at,omitempty"`
\tHistoryPath        string     `json:"history_path,omitempty"`
''')
replace_exact("incidents.go", '''\tcurrent    []Incident
\thistory    []Incident
}
''', '''\tcurrent          []Incident
\thistory          []Incident
\tlastPersistError string
\tlastPersistOKAt  time.Time
}
''')
replace_exact("incidents.go", '''\tif m.persistent && m.path != "" {
\t\t_ = writePrivateGzipJSON(m.path, struct {
\t\t\tVersion   int        `json:"version"`
\t\t\tIncidents []Incident `json:"incidents"`
\t\t}{incidentHistoryVersion, m.history})
\t}
''', '''\tif m.persistent && m.path != "" {
\t\tif err := writePrivateGzipJSON(m.path, struct {
\t\t\tVersion   int        `json:"version"`
\t\t\tIncidents []Incident `json:"incidents"`
\t\t}{incidentHistoryVersion, m.history}); err != nil {
\t\t\tm.lastPersistError = err.Error()
\t\t} else {
\t\t\tm.lastPersistError = ""
\t\t\tm.lastPersistOKAt = time.Now()
\t\t}
\t}
''')
replace_exact("incidents.go", '''\tst := IncidentStatus{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Count: len(rows), Persistent: m.persistent, HistoryPath: m.path, Incidents: rows, Note: "Incidents correlate time-bounded local evidence into object-centered review stories. Confidence is relationship confidence, never malware probability."}
''', '''\tst := IncidentStatus{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Count: len(rows), Persistent: m.persistent, PersistenceHealthy: !m.persistent || m.lastPersistError == "", LastPersistError: m.lastPersistError, LastPersistOKAt: optTime(m.lastPersistOKAt), HistoryPath: m.path, Incidents: rows, Note: "Incidents correlate time-bounded local evidence into object-centered review stories. Confidence is relationship confidence, never malware probability."}
''')

# Regression tests lock the five P1 contracts.
Path("p1_hardening_contract_test.go").write_text(r'''// SPDX-License-Identifier: MPL-2.0
package main

import (
    "errors"
    "os"
    "path/filepath"
    "strings"
    "testing"
)

func TestStorageActiveJobCapacity(t *testing.T) {
    m := newScanManager()
    m.jobs["one"] = &ScanJob{ID: "one", Status: "running"}
    m.jobs["two"] = &ScanJob{ID: "two", Status: "running"}
    before := len(m.jobs)
    job, err := m.create(StorageScanRequest{Scope: "home"})
    if job != nil || !errors.Is(err, errStorageScanCapacity) {
        t.Fatalf("expected capacity rejection, job=%v err=%v", job, err)
    }
    if len(m.jobs) != before {
        t.Fatalf("capacity rejection changed job map: before=%d after=%d", before, len(m.jobs))
    }
}

func TestSafeActionJournalFailureRunsRollback(t *testing.T) {
    root := t.TempDir()
    badJournal := filepath.Join(root, "journal-as-directory")
    if err := os.MkdirAll(badJournal, 0700); err != nil { t.Fatal(err) }
    m := &actionManager{persistent: true, stateDir: root, vaultDir: filepath.Join(root, "Vault"), journalPath: badJournal, pending: map[string]pendingAction{}}
    a := &app{actions: m}
    rolledBack := false
    err := a.commitAction(&ActionJournalEntry{ID: "test", Status: "success", Action: "rename"}, func() error { rolledBack = true; return nil })
    if err == nil || !rolledBack { t.Fatalf("journal failure must be visible and run rollback: err=%v rollback=%v", err, rolledBack) }
}

func TestP1HardeningSourceContracts(t *testing.T) {
    checks := map[string][]string{
        "trust.go": {"readPrivateJSON(m.path, &p)", "readBoundedPrivateFile(m.backupPath, maxPrivateJSONBytes)", "atomicPrivateWrite(m.path, backupRaw)"},
        "web/app/core.js": {"error.status=response.status", "error.payload=data"},
        "web/app/full-scan.js": {"classifyStageError", "outcome = 'FAILED'", "outcome = 'CANCELLED'", "'LIMITED' : 'DONE'"},
        "change_monitor.go": {"persistence_healthy", "lastPersistError", "lastPersistOKAt"},
        "incidents.go": {"persistence_healthy", "lastPersistError", "lastPersistOKAt"},
        "actions.go": {"commitAction", "filesystem mutation was rolled back", "automatic rollback also failed"},
    }
    for path, needles := range checks {
        raw, err := os.ReadFile(path); if err != nil { t.Fatal(err) }
        text := string(raw)
        for _, needle := range needles { if !strings.Contains(text, needle) { t.Fatalf("%s missing hardening contract %q", path, needle) } }
    }
}
''')

print("one-time P1 hardening patch applied successfully")
