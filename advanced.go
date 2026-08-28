// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type StorageCategory struct {
	Name  string `json:"name"`
	Size  uint64 `json:"size"`
	Files int    `json:"files"`
}

type DuplicateGroup struct {
	SHA256 string      `json:"sha256"`
	Size   uint64      `json:"size"`
	Waste  uint64      `json:"waste"`
	Files  []LargeFile `json:"files"`
}

type AdvancedStorageResult struct {
	Root               string            `json:"root"`
	FilesVisited       int               `json:"files_visited"`
	DirsVisited        int               `json:"dirs_visited"`
	PermissionErr      int               `json:"permission_errors"`
	VisibleBytes       uint64            `json:"visible_bytes"`
	Truncated          bool              `json:"truncated"`
	Cancelled          bool              `json:"cancelled"`
	LargeFiles         []LargeFile       `json:"large_files"`
	Families           []FileFamily      `json:"families"`
	Categories         []StorageCategory `json:"categories"`
	FileTypes          []StorageCategory `json:"file_types"`
	Duplicates         []DuplicateGroup  `json:"duplicates"`
	DuplicateHashBytes uint64            `json:"duplicate_hash_bytes"`
	DurationMS         int64             `json:"duration_ms"`
	Note               string            `json:"note"`
}

type ScanJob struct {
	ID            string                 `json:"id"`
	Status        string                 `json:"status"`
	Root          string                 `json:"root"`
	FilesVisited  int                    `json:"files_visited"`
	DirsVisited   int                    `json:"dirs_visited"`
	PermissionErr int                    `json:"permission_errors"`
	CurrentPath   string                 `json:"current_path"`
	StartedAt     int64                  `json:"started_at"`
	FinishedAt    int64                  `json:"finished_at,omitempty"`
	Error         string                 `json:"error,omitempty"`
	Result        *AdvancedStorageResult `json:"result,omitempty"`
	cancel        context.CancelFunc     `json:"-"`
}

type scanManager struct {
	mu       sync.RWMutex
	jobs     map[string]*ScanJob
	latestID string
}

func newScanManager() *scanManager { return &scanManager{jobs: make(map[string]*ScanJob)} }

func (m *scanManager) create(req StorageScanRequest) (*ScanJob, error) {
	root, err := resolveScope(req.Scope)
	if err != nil {
		return nil, err
	}
	if req.MinMB < 1 {
		req.MinMB = 100
	}
	if req.MinMB > 1024*1024 {
		req.MinMB = 1024 * 1024
	}
	if req.Limit < 10 {
		req.Limit = 80
	}
	if req.Limit > 250 {
		req.Limit = 250
	}

	ctx, cancel := context.WithCancel(context.Background())
	id := randomToken(8)
	job := &ScanJob{ID: id, Status: "running", Root: root, StartedAt: time.Now().Unix(), cancel: cancel}
	m.mu.Lock()
	m.jobs[id] = job
	m.latestID = id
	// Bound in-memory job history.
	if len(m.jobs) > 16 {
		type pair struct {
			id string
			t  int64
		}
		var all []pair
		for k, v := range m.jobs {
			all = append(all, pair{k, v.StartedAt})
		}
		sort.Slice(all, func(i, j int) bool { return all[i].t < all[j].t })
		for _, p := range all[:len(all)-16] {
			if m.jobs[p.id].Status != "running" {
				delete(m.jobs, p.id)
			}
		}
	}
	m.mu.Unlock()

	go func() {
		result, scanErr := scanStorageAdvanced(ctx, root, uint64(req.MinMB)*1024*1024, req.Limit, func(f, d, p int, path string) {
			m.mu.Lock()
			if j := m.jobs[id]; j != nil {
				j.FilesVisited = f
				j.DirsVisited = d
				j.PermissionErr = p
				j.CurrentPath = path
			}
			m.mu.Unlock()
		})
		m.mu.Lock()
		defer m.mu.Unlock()
		j := m.jobs[id]
		if j == nil {
			return
		}
		j.FinishedAt = time.Now().Unix()
		j.CurrentPath = ""
		if scanErr != nil && !errors.Is(scanErr, context.Canceled) {
			j.Status = "failed"
			j.Error = scanErr.Error()
			return
		}
		if result != nil {
			j.FilesVisited = result.FilesVisited
			j.DirsVisited = result.DirsVisited
			j.PermissionErr = result.PermissionErr
			j.Result = result
		}
		if errors.Is(scanErr, context.Canceled) || (result != nil && result.Cancelled) {
			j.Status = "cancelled"
		} else {
			j.Status = "complete"
		}
	}()
	return snapshotJob(job), nil
}

func snapshotJob(j *ScanJob) *ScanJob {
	if j == nil {
		return nil
	}
	cp := *j
	cp.cancel = nil
	return &cp
}

func (m *scanManager) get(id string) *ScanJob {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return snapshotJob(m.jobs[id])
}
func (m *scanManager) cancelJob(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	j := m.jobs[id]
	if j == nil || j.Status != "running" {
		return false
	}
	j.cancel()
	return true
}
func (m *scanManager) cancelAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, j := range m.jobs {
		if j != nil && j.Status == "running" && j.cancel != nil {
			j.cancel()
		}
	}
}

func (m *scanManager) latestResult() *AdvancedStorageResult {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if j := m.jobs[m.latestID]; j != nil && j.Result != nil {
		cp := *j.Result
		return &cp
	}
	return nil
}

func (a *app) handleStorageJobs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		var req StorageScanRequest
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&req); err != nil {
			writeJSON(w, 400, map[string]any{"error": "invalid request"})
			return
		}
		j, err := a.jobs.create(req)
		if err != nil {
			writeJSON(w, 400, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, 202, j)
	case http.MethodGet:
		id := r.URL.Query().Get("id")
		if id == "" {
			writeJSON(w, 400, map[string]any{"error": "missing job id"})
			return
		}
		j := a.jobs.get(id)
		if j == nil {
			writeJSON(w, 404, map[string]any{"error": "scan job not found"})
			return
		}
		writeJSON(w, 200, j)
	default:
		writeJSON(w, 405, map[string]any{"error": "GET or POST required"})
	}
}
func (a *app) handleStorageCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	id := r.URL.Query().Get("id")
	if id == "" {
		writeJSON(w, 400, map[string]any{"error": "missing job id"})
		return
	}
	if !a.jobs.cancelJob(id) {
		writeJSON(w, 409, map[string]any{"error": "job is not running"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func scanStorageAdvanced(ctx context.Context, root string, minSize uint64, limit int, progress func(int, int, int, string)) (*AdvancedStorageResult, error) {
	start := time.Now()
	h := &fileHeap{}
	heapInit(h)
	filesVisited, dirsVisited, permErr := 0, 0, 0
	var visible uint64
	truncated := false
	const maxEntries = 500000
	dirMap := map[string]*StorageCategory{}
	typeMap := map[string]*StorageCategory{}
	dupCandidates := map[uint64][]LargeFile{}
	dupCandidateCount := 0
	const maxDupCandidates = 5000
	lastProgress := time.Now()

	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		select {
		case <-ctx.Done():
			return context.Canceled
		default:
		}
		if err != nil {
			permErr++
			return nil
		}
		if filesVisited+dirsVisited >= maxEntries {
			truncated = true
			return filepath.SkipAll
		}
		if d.IsDir() {
			dirsVisited++
			if time.Since(lastProgress) > 150*time.Millisecond {
				progress(filesVisited, dirsVisited, permErr, path)
				lastProgress = time.Now()
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		filesVisited++
		info, e := d.Info()
		if e != nil || info.Size() < 0 {
			return nil
		}
		size := uint64(info.Size())
		visible += size
		addCategory(dirMap, topCategory(root, path), size)
		addCategory(typeMap, fileTypeCategory(d.Name()), size)
		if size >= minSize {
			lf := LargeFile{Path: path, Name: d.Name(), Size: size, ModUnix: info.ModTime().Unix()}
			if h.Len() < limit {
				heapPush(h, lf)
			} else if (*h)[0].Size < lf.Size {
				heapPop(h)
				heapPush(h, lf)
			}
			if dupCandidateCount < maxDupCandidates {
				dupCandidates[size] = append(dupCandidates[size], lf)
				dupCandidateCount++
			}
		}
		if filesVisited%256 == 0 || time.Since(lastProgress) > 150*time.Millisecond {
			progress(filesVisited, dirsVisited, permErr, path)
			lastProgress = time.Now()
		}
		return nil
	})
	cancelled := errors.Is(walkErr, context.Canceled)

	files := make([]LargeFile, h.Len())
	for i := len(files) - 1; i >= 0; i-- {
		files[i] = heapPop(h)
	}
	cats := categorySlice(dirMap, 12)
	types := categorySlice(typeMap, 10)
	duplicates, hashedBytes := hashDuplicateCandidates(ctx, dupCandidates)
	if errors.Is(ctx.Err(), context.Canceled) {
		cancelled = true
	}
	result := &AdvancedStorageResult{Root: root, FilesVisited: filesVisited, DirsVisited: dirsVisited, PermissionErr: permErr, VisibleBytes: visible, Truncated: truncated, Cancelled: cancelled, LargeFiles: files, Families: groupFamilies(files), Categories: cats, FileTypes: types, Duplicates: duplicates, DuplicateHashBytes: hashedBytes, DurationMS: time.Since(start).Milliseconds(), Note: "All analysis and duplicate hashes were computed locally. Duplicate groups are exact SHA-256 matches among bounded large-file candidates; no files were modified."}
	progress(filesVisited, dirsVisited, permErr, "")
	if cancelled {
		return result, context.Canceled
	}
	return result, walkErr
}

// Small adapters keep the existing heap type private to audit.go while avoiding duplicate methods.
func heapInit(h *fileHeap) { sort.Sort(h) }
func heapPush(h *fileHeap, f LargeFile) {
	*h = append(*h, f)
	i := len(*h) - 1
	for i > 0 {
		p := (i - 1) / 2
		if !((*h)[i].Size < (*h)[p].Size) {
			break
		}
		(*h)[i], (*h)[p] = (*h)[p], (*h)[i]
		i = p
	}
}
func heapPop(h *fileHeap) LargeFile {
	n := len(*h)
	if n == 0 {
		return LargeFile{}
	}
	x := (*h)[0]
	last := (*h)[n-1]
	*h = (*h)[:n-1]
	if len(*h) > 0 {
		(*h)[0] = last
		i := 0
		for {
			l := 2*i + 1
			r := l + 1
			smallest := i
			if l < len(*h) && (*h)[l].Size < (*h)[smallest].Size {
				smallest = l
			}
			if r < len(*h) && (*h)[r].Size < (*h)[smallest].Size {
				smallest = r
			}
			if smallest == i {
				break
			}
			(*h)[i], (*h)[smallest] = (*h)[smallest], (*h)[i]
			i = smallest
		}
	}
	return x
}

func addCategory(m map[string]*StorageCategory, name string, size uint64) {
	if name == "" {
		name = "Other"
	}
	c := m[name]
	if c == nil {
		c = &StorageCategory{Name: name}
		m[name] = c
	}
	c.Size += size
	c.Files++
}
func topCategory(root, path string) string {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return "Other"
	}
	p := strings.Split(rel, string(os.PathSeparator))
	if len(p) <= 1 {
		return "Files at root"
	}
	if p[0] == "." || p[0] == "" {
		return "Files at root"
	}
	return p[0]
}
func fileTypeCategory(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".zip", ".7z", ".rar", ".tar", ".gz", ".bz2", ".xz", ".dmg", ".pkg", ".iso":
		return "Archives & installers"
	case ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v":
		return "Video"
	case ".jpg", ".jpeg", ".png", ".heic", ".gif", ".tiff", ".webp", ".raw":
		return "Images"
	case ".wav", ".mp3", ".aac", ".m4a", ".flac", ".aiff":
		return "Audio"
	case ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".pages", ".key", ".numbers", ".txt", ".md":
		return "Documents"
	case ".py", ".go", ".rs", ".c", ".cpp", ".h", ".hpp", ".java", ".js", ".ts", ".tsx", ".jsx", ".swift", ".ipynb":
		return "Source code"
	case "":
		return "No extension"
	default:
		return "Other"
	}
}
func categorySlice(m map[string]*StorageCategory, limit int) []StorageCategory {
	out := make([]StorageCategory, 0, len(m))
	for _, c := range m {
		out = append(out, *c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Size > out[j].Size })
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func hashDuplicateCandidates(ctx context.Context, candidates map[uint64][]LargeFile) ([]DuplicateGroup, uint64) {
	type g struct {
		size      uint64
		files     []LargeFile
		potential uint64
	}
	var groups []g
	for size, files := range candidates {
		if len(files) >= 2 {
			groups = append(groups, g{size, files, size * uint64(len(files)-1)})
		}
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].potential > groups[j].potential })
	const budget uint64 = 4 * 1024 * 1024 * 1024
	var hashed uint64
	byHash := map[string][]LargeFile{}
	hashSizes := map[string]uint64{}
	for _, grp := range groups {
		if hashed >= budget {
			break
		}
		for _, f := range grp.files {
			if hashed+f.Size > budget && hashed > 0 {
				break
			}
			select {
			case <-ctx.Done():
				return duplicateGroupsFromMap(byHash, hashSizes), hashed
			default:
			}
			h, err := sha256File(ctx, f.Path)
			if err != nil {
				continue
			}
			hashed += f.Size
			key := fmt.Sprintf("%d:%s", grp.size, h)
			byHash[key] = append(byHash[key], f)
			hashSizes[key] = grp.size
		}
	}
	return duplicateGroupsFromMap(byHash, hashSizes), hashed
}
func sha256File(ctx context.Context, path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	buf := make([]byte, 1024*1024)
	for {
		select {
		case <-ctx.Done():
			return "", context.Canceled
		default:
		}
		n, e := f.Read(buf)
		if n > 0 {
			if _, werr := h.Write(buf[:n]); werr != nil {
				return "", werr
			}
		}
		if e == io.EOF {
			break
		}
		if e != nil {
			return "", e
		}
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func duplicateGroupsFromMap(m map[string][]LargeFile, sizes map[string]uint64) []DuplicateGroup {
	var out []DuplicateGroup
	for key, files := range m {
		if len(files) < 2 {
			continue
		}
		size := sizes[key]
		hash := key[strings.Index(key, ":")+1:]
		out = append(out, DuplicateGroup{SHA256: hash, Size: size, Waste: size * uint64(len(files)-1), Files: files})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Waste > out[j].Waste })
	if len(out) > 12 {
		out = out[:12]
	}
	return out
}

type ProcessDetail struct {
	Process      ProcessInfo       `json:"process"`
	Executable   string            `json:"executable"`
	Signature    string            `json:"signature"`
	Identity     CodeIdentity      `json:"identity"`
	ParentChain  []ProcessAncestor `json:"parent_chain"`
	PathRisk     int               `json:"path_risk"`
	Signals      []string          `json:"signals"`
	TrustSignals []string          `json:"trust_signals,omitempty"`
	Network      []NetworkItem     `json:"network"`
}

func (a *app) handleProcessDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	pid, err := strconv.Atoi(r.URL.Query().Get("pid"))
	if err != nil || pid <= 0 {
		writeJSON(w, 400, map[string]any{"error": "invalid pid"})
		return
	}
	var found *ProcessInfo
	for _, p := range parsePS(100000) {
		if p.PID == pid {
			q := p
			found = &q
			break
		}
	}
	if found == nil {
		writeJSON(w, 404, map[string]any{"error": "process not found"})
		return
	}
	exe := executablePathForPID(pid, found.Command)
	risk, signals := scorePath(exe)
	identity := inspectCodeIdentity(exe)
	sig := identity.Verification
	trust := make([]string, 0)
	if sig == "Unsigned / unverifiable" || sig == "Signature present but verification failed" {
		risk += 15
		signals = append(signals, "Executable could not be cleanly verified by macOS code signing")
	}
	if identity.Signed && identity.TeamID != "" {
		trust = append(trust, "Verified macOS signature includes Team ID "+identity.TeamID)
	}
	if identity.Gatekeeper == "Accepted" {
		trust = append(trust, "Gatekeeper accepted this code at assessment time")
	}
	nets, _ := collectNetwork()
	mine := make([]NetworkItem, 0)
	for _, n := range nets {
		if n.PID == pid {
			mine = append(mine, n)
		}
	}
	if len(mine) > 0 && risk > 0 {
		risk += 10
		signals = append(signals, "Process has active TCP activity")
	}
	if risk > 100 {
		risk = 100
	}
	writeJSON(w, 200, ProcessDetail{Process: *found, Executable: exe, Signature: sig, Identity: identity, ParentChain: processParentChain(pid, 8), PathRisk: risk, Signals: uniqueStrings(signals), TrustSignals: uniqueStrings(trust), Network: mine})
}
func executablePathForPID(pid int, command string) string {
	if runtime.GOOS == "darwin" && commandExists("lsof") {
		out, err := commandOutputTimeout(4*time.Second, "lsof", "-a", "-p", strconv.Itoa(pid), "-d", "txt", "-Fn")
		if err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if strings.HasPrefix(line, "n/") {
					return strings.TrimPrefix(line, "n")
				}
			}
		}
	}
	return cleanCommandPath(command)
}
func signatureStatus(path string) string {
	if path == "" {
		return "Unknown"
	}
	if runtime.GOOS != "darwin" || !commandExists("codesign") {
		return "Unavailable on development host"
	}
	if commandRunTimeout(4*time.Second, "codesign", "--verify", "--deep", "--strict", path) == nil {
		return "Verified"
	}
	return "Unsigned / unverifiable"
}

type FullReport struct {
	SchemaVersion   int                     `json:"schema_version"`
	ReportKind      string                  `json:"report_kind"`
	GeneratedAt     string                  `json:"generated_at"`
	Version         string                  `json:"version"`
	Overview        Overview                `json:"overview"`
	SystemProfile   HardwareProfile         `json:"system_profile"`
	Security        SecurityReport          `json:"security"`
	Startup         []StartupItem           `json:"startup"`
	Network         []NetworkItem           `json:"network"`
	Processes       []ProcessInfo           `json:"processes"`
	LatestStorage   *AdvancedStorageResult  `json:"latest_storage,omitempty"`
	Intelligence    EvidenceGraph           `json:"intelligence"`
	Timeline        []TimelineEvent         `json:"timeline"`
	Background      BackgroundSnapshot      `json:"background"`
	Behavior        map[string]any          `json:"behavior"`
	BehaviorHistory BehaviorHistoryResponse `json:"behavior_history"`
	BehaviorHealth  BehaviorHealth          `json:"behavior_health"`
	Trust           map[string]any          `json:"trust"`
	TrustHealth     TrustHealth             `json:"trust_health"`
	TrustHistory    TrustHistoryResponse    `json:"trust_history"`
	Doctor          DoctorReport            `json:"doctor"`
	Persistence     PersistenceStatus       `json:"persistence_integrity"`
	SelfIntegrity   IntegrityInspection     `json:"sentinel_self_integrity"`
	ActionStatus    map[string]any          `json:"safe_actions"`
	ActionHealth    ActionHealth            `json:"safe_actions_health"`
	Vault           []VaultManifest         `json:"vault_items"`
	ActionJournal   []ActionJournalEntry    `json:"action_journal"`
	Coverage        CoverageMap             `json:"visibility_coverage"`
	Weakness        WeaknessAudit           `json:"sentinel_weakness_audit"`
	ChangeMonitor   ChangeStatus            `json:"change_monitor"`
	ChangeEvents    []ChangeEvent           `json:"change_events"`
	ChangeHistory   []ChangeEvent           `json:"change_history"`
	Incidents       IncidentStatus          `json:"incidents"`
	AdvancedSensor  AdvancedSensorStatus    `json:"advanced_sensor"`
	Readiness       ReadinessReport         `json:"sentinel_readiness"`
	StateRecovery   StateRecoveryStatus     `json:"state_recovery"`
	IncidentHistory IncidentStatus          `json:"incident_history"`
	Privacy         string                  `json:"privacy"`
}

func (a *app) handleReportExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	netItems, _ := collectNetwork()
	graph := collectEvidenceGraph()
	security := buildSecurityReport()
	attachTrustReferences(&security, a.trust)
	report := FullReport{SchemaVersion: 2, ReportKind: "sentinel-full-local-report", GeneratedAt: time.Now().UTC().Format(time.RFC3339), Version: sentinelVersion, Overview: collectOverview(), SystemProfile: collectHardwareProfile(), Security: security, Startup: collectStartupItems(), Network: netItems, Processes: parsePS(80), LatestStorage: a.jobs.latestResult(), Intelligence: graph, Timeline: a.intel.timeline(120), Background: collectBackgroundItems(), Behavior: a.behavior.status(), BehaviorHistory: a.behavior.historySnapshot(40, ""), BehaviorHealth: a.behavior.health(), Trust: a.trust.status(), TrustHealth: a.trust.health(), TrustHistory: a.trust.historySnapshot(20), Doctor: collectDoctorReport(), Persistence: a.persistence.status(), SelfIntegrity: selfIntegrity(), ActionStatus: a.actions.status(), ActionHealth: a.actions.health(), Vault: a.actions.vaultSnapshot(), ActionJournal: a.actions.journalSnapshot(100), Coverage: collectCoverageMap(), Weakness: a.weaknessAudit(), ChangeMonitor: a.changes.status(), ChangeEvents: a.changes.eventsSnapshot(250), ChangeHistory: a.changes.historySnapshot(500), Incidents: a.incidents.snapshot(false), AdvancedSensor: advancedSensorStatus(), Readiness: a.readiness(), StateRecovery: stateRecoveryStatus(), IncidentHistory: a.incidents.snapshot(true), Privacy: "Generated locally by Sentinel. No report data was sent to a cloud service by Sentinel. Full reports may contain sensitive local paths, process/network evidence, Vault metadata, action history, and incident history; review before sharing."}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=sentinel-report.json")
	_ = json.NewEncoder(w).Encode(report)
}

func auditTargetFromCommand(command string) (string, bool) {
	fields := strings.Fields(command)
	if len(fields) == 0 {
		return "", false
	}
	exe := strings.Trim(fields[0], "\"'")
	base := strings.ToLower(filepath.Base(exe))
	interpreters := map[string]bool{
		"python": true, "python3": true, "python2": true, "bash": true, "sh": true, "zsh": true,
		"node": true, "ruby": true, "perl": true, "osascript": true,
	}
	// Versioned interpreter names such as python3.13 should behave like python3.
	if strings.HasPrefix(base, "python3.") {
		interpreters[base] = true
	}
	if !interpreters[base] {
		return exe, false
	}
	for _, raw := range fields[1:] {
		f := strings.Trim(raw, "\"'")
		if f == "" || strings.HasPrefix(f, "-") {
			continue
		}
		lower := strings.ToLower(f)
		if strings.HasPrefix(f, "/") || strings.HasPrefix(f, "~/") || strings.HasSuffix(lower, ".py") || strings.HasSuffix(lower, ".sh") || strings.HasSuffix(lower, ".command") || strings.HasSuffix(lower, ".js") || strings.HasSuffix(lower, ".rb") || strings.HasSuffix(lower, ".pl") {
			if strings.HasPrefix(f, "~/") {
				if home, err := os.UserHomeDir(); err == nil {
					f = filepath.Join(home, strings.TrimPrefix(f, "~/"))
				}
			}
			return f, true
		}
		break
	}
	return exe, false
}
