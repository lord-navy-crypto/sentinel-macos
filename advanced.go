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
	SlowPathsSkipped   int               `json:"slow_paths_skipped"`
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
	ID               string                 `json:"id"`
	Status           string                 `json:"status"`
	Root             string                 `json:"root"`
	Phase            string                 `json:"phase"`
	PhasePercent     int                    `json:"phase_percent"`
	FilesVisited     int                    `json:"files_visited"`
	DirsVisited      int                    `json:"dirs_visited"`
	PermissionErr    int                    `json:"permission_errors"`
	SlowPathsSkipped int                    `json:"slow_paths_skipped"`
	CurrentPath      string                 `json:"current_path"`
	CurrentDir       string                 `json:"current_dir,omitempty"`
	HashFilesDone    int                    `json:"hash_files_done"`
	HashFilesTotal   int                    `json:"hash_files_total"`
	HashBytesDone    uint64                 `json:"hash_bytes_done"`
	HashBytesTotal   uint64                 `json:"hash_bytes_total"`
	CurrentHashPath  string                 `json:"current_hash_path,omitempty"`
	StartedAt        int64                  `json:"started_at"`
	FinishedAt       int64                  `json:"finished_at,omitempty"`
	Error            string                 `json:"error,omitempty"`
	Result           *AdvancedStorageResult `json:"result,omitempty"`
	cancel           context.CancelFunc     `json:"-"`
}

type storageProgress struct {
	Phase            string
	PhasePercent     int
	FilesVisited     int
	DirsVisited      int
	PermissionErr    int
	SlowPathsSkipped int
	CurrentPath      string
	CurrentDir       string
	HashFilesDone    int
	HashFilesTotal   int
	HashBytesDone    uint64
	HashBytesTotal   uint64
	CurrentHashPath  string
}

type scanManager struct {
	mu       sync.RWMutex
	jobs     map[string]*ScanJob
	latestID string
}

func newScanManager() *scanManager { return &scanManager{jobs: make(map[string]*ScanJob)} }

func newStorageProgress(phase string, percent, files, dirs, permissionErr int, path string) storageProgress {
	return storageProgress{Phase: phase, PhasePercent: percent, FilesVisited: files, DirsVisited: dirs, PermissionErr: permissionErr, CurrentPath: path}
}

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
	job := &ScanJob{ID: id, Status: "running", Root: root, Phase: "walking", PhasePercent: 2, StartedAt: time.Now().Unix(), cancel: cancel}
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
		result, scanErr := scanStorageAdvanced(ctx, root, uint64(req.MinMB)*1024*1024, req.Limit, func(p storageProgress) {
			m.mu.Lock()
			if j := m.jobs[id]; j != nil {
				j.Phase = p.Phase
				j.PhasePercent = p.PhasePercent
				j.FilesVisited = p.FilesVisited
				j.DirsVisited = p.DirsVisited
				j.PermissionErr = p.PermissionErr
				j.SlowPathsSkipped = p.SlowPathsSkipped
				j.CurrentPath = p.CurrentPath
				j.CurrentDir = p.CurrentDir
				j.HashFilesDone = p.HashFilesDone
				j.HashFilesTotal = p.HashFilesTotal
				j.HashBytesDone = p.HashBytesDone
				j.HashBytesTotal = p.HashBytesTotal
				j.CurrentHashPath = p.CurrentHashPath
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
		j.CurrentDir = ""
		j.CurrentHashPath = ""
		if scanErr != nil && !errors.Is(scanErr, context.Canceled) {
			j.Status = "failed"
			j.Phase = "failed"
			j.Error = scanErr.Error()
			return
		}
		if result != nil {
			j.FilesVisited = result.FilesVisited
			j.DirsVisited = result.DirsVisited
			j.PermissionErr = result.PermissionErr
			j.SlowPathsSkipped = result.SlowPathsSkipped
			j.Result = result
		}
		if errors.Is(scanErr, context.Canceled) || (result != nil && result.Cancelled) {
			j.Status = "cancelled"
			j.Phase = "cancelled"
		} else {
			j.Status = "complete"
			j.Phase = "complete"
			j.PhasePercent = 100
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

func walkStoragePercent(entries int) int {
	switch {
	case entries <= 0:
		return 2
	case entries < 1000:
		return 4 + entries*16/1000
	case entries < 10000:
		return 20 + (entries-1000)*20/9000
	case entries < 50000:
		return 40 + (entries-10000)*20/40000
	default:
		p := 60 + (entries-50000)/25000
		if p > 72 {
			p = 72
		}
		return p
	}
}

var (
	errStorageSlowDirectory = errors.New("storage directory read exceeded idle budget")
	errStorageEntryLimit    = errors.New("storage entry limit reached")
)

const (
	storageDirBatchSize   = 256
	storageDirIdleTimeout = 4 * time.Second
	storageMaxSlowPaths   = 12
)

type storageDirBatch struct {
	infos []fs.FileInfo
	err   error
	done  bool
}

// readStorageDirBatches streams directory metadata in bounded batches. The
// caller can cancel immediately even if a filesystem call is slow. A timed-out
// reader is detached and is prevented from blocking on result delivery when it
// eventually returns.
func readStorageDirBatches(ctx context.Context, dir string, onBatch func([]fs.FileInfo) error) error {
	batches := make(chan storageDirBatch, 1)
	stop := make(chan struct{})
	defer close(stop)

	go func() {
		f, err := os.Open(dir)
		if err != nil {
			select {
			case batches <- storageDirBatch{err: err}:
			case <-stop:
			}
			return
		}
		defer f.Close()

		for {
			infos, readErr := f.Readdir(storageDirBatchSize)
			if len(infos) > 0 {
				select {
				case batches <- storageDirBatch{infos: infos}:
				case <-stop:
					return
				}
			}
			if errors.Is(readErr, io.EOF) {
				select {
				case batches <- storageDirBatch{done: true}:
				case <-stop:
				}
				return
			}
			if readErr != nil {
				select {
				case batches <- storageDirBatch{err: readErr}:
				case <-stop:
				}
				return
			}
		}
	}()

	timer := time.NewTimer(storageDirIdleTimeout)
	defer timer.Stop()
	resetTimer := func() {
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer.Reset(storageDirIdleTimeout)
	}

	for {
		select {
		case <-ctx.Done():
			return context.Canceled
		case <-timer.C:
			return errStorageSlowDirectory
		case batch := <-batches:
			resetTimer()
			if batch.err != nil {
				return batch.err
			}
			if len(batch.infos) > 0 && onBatch != nil {
				if err := onBatch(batch.infos); err != nil {
					return err
				}
			}
			if batch.done {
				return nil
			}
		}
	}
}

func scanStorageAdvanced(ctx context.Context, root string, minSize uint64, limit int, progress func(storageProgress)) (*AdvancedStorageResult, error) {
	start := time.Now()
	h := &fileHeap{}
	heapInit(h)
	filesVisited, dirsVisited, permErr, slowPathsSkipped := 0, 0, 0, 0
	var visible uint64
	truncated := false
	const maxEntries = 500000
	dirMap := map[string]*StorageCategory{}
	typeMap := map[string]*StorageCategory{}
	dupCandidates := map[uint64][]LargeFile{}
	dupCandidateCount := 0
	const maxDupCandidates = 5000
	lastProgress := time.Now()

	emitWalk := func(path, currentDir string) {
		if progress == nil {
			return
		}
		p := newStorageProgress("walking", walkStoragePercent(filesVisited+dirsVisited), filesVisited, dirsVisited, permErr, path)
		p.SlowPathsSkipped = slowPathsSkipped
		p.CurrentDir = currentDir
		progress(p)
	}
	emitWalk(root, root)

	dirs := []string{root}
	walkErr := error(nil)
walkLoop:
	for len(dirs) > 0 {
		select {
		case <-ctx.Done():
			walkErr = context.Canceled
			break walkLoop
		default:
		}
		if filesVisited+dirsVisited >= maxEntries {
			truncated = true
			walkErr = errStorageEntryLimit
			break
		}

		dir := dirs[len(dirs)-1]
		dirs = dirs[:len(dirs)-1]
		dirsVisited++
		emitWalk(dir, dir)
		lastProgress = time.Now()

		err := readStorageDirBatches(ctx, dir, func(infos []fs.FileInfo) error {
			for _, info := range infos {
				select {
				case <-ctx.Done():
					return context.Canceled
				default:
				}
				if filesVisited+dirsVisited >= maxEntries {
					truncated = true
					return errStorageEntryLimit
				}

				path := filepath.Join(dir, info.Name())
				if info.Mode()&os.ModeSymlink != 0 {
					continue
				}
				if info.IsDir() {
					dirs = append(dirs, path)
					continue
				}
				if !info.Mode().IsRegular() || info.Size() < 0 {
					continue
				}

				filesVisited++
				size := uint64(info.Size())
				visible += size
				addCategory(dirMap, topCategory(root, path), size)
				addCategory(typeMap, fileTypeCategory(info.Name()), size)
				if size >= minSize {
					lf := LargeFile{Path: path, Name: info.Name(), Size: size, ModUnix: info.ModTime().Unix()}
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
					emitWalk(path, dir)
					lastProgress = time.Now()
				}
			}
			return nil
		})

		switch {
		case err == nil:
			continue
		case errors.Is(err, context.Canceled):
			walkErr = context.Canceled
			break walkLoop
		case errors.Is(err, errStorageEntryLimit):
			truncated = true
			walkErr = errStorageEntryLimit
			break walkLoop
		case errors.Is(err, errStorageSlowDirectory):
			slowPathsSkipped++
			truncated = true
			emitWalk(dir, dir)
			if slowPathsSkipped >= storageMaxSlowPaths {
				walkErr = errStorageSlowDirectory
				break walkLoop
			}
			continue
		default:
			permErr++
			emitWalk(dir, dir)
			continue
		}
	}

	cancelled := errors.Is(walkErr, context.Canceled)
	files := make([]LargeFile, h.Len())
	for i := len(files) - 1; i >= 0; i-- {
		files[i] = heapPop(h)
	}
	cats := categorySlice(dirMap, 12)
	types := categorySlice(typeMap, 10)

	if cancelled {
		result := &AdvancedStorageResult{Root: root, FilesVisited: filesVisited, DirsVisited: dirsVisited, PermissionErr: permErr, SlowPathsSkipped: slowPathsSkipped, VisibleBytes: visible, Truncated: truncated, Cancelled: true, LargeFiles: files, Families: groupFamilies(files), Categories: cats, FileTypes: types, DurationMS: time.Since(start).Milliseconds(), Note: "Storage traversal was cancelled locally. Partial read-only findings are retained; duplicate hashing did not continue after cancellation."}
		if progress != nil {
			p := newStorageProgress("cancelled", walkStoragePercent(filesVisited+dirsVisited), filesVisited, dirsVisited, permErr, "")
			p.SlowPathsSkipped = slowPathsSkipped
			progress(p)
		}
		return result, context.Canceled
	}

	if progress != nil {
		p := newStorageProgress("grouping", 75, filesVisited, dirsVisited, permErr, "")
		p.SlowPathsSkipped = slowPathsSkipped
		progress(p)
	}

	duplicates, hashedBytes, plannedHashBytes := hashDuplicateCandidates(ctx, dupCandidates, func(done, total int, hashed, planned uint64, path string) {
		if progress == nil {
			return
		}
		percent := 78
		if planned > 0 {
			percent += int((hashed * 18) / planned)
			if percent > 96 {
				percent = 96
			}
		} else {
			percent = 96
		}
		progress(storageProgress{Phase: "hashing", PhasePercent: percent, FilesVisited: filesVisited, DirsVisited: dirsVisited, PermissionErr: permErr, SlowPathsSkipped: slowPathsSkipped, HashFilesDone: done, HashFilesTotal: total, HashBytesDone: hashed, HashBytesTotal: planned, CurrentHashPath: path})
	})
	if errors.Is(ctx.Err(), context.Canceled) {
		cancelled = true
	}
	if progress != nil {
		progress(storageProgress{Phase: "finalizing", PhasePercent: 98, FilesVisited: filesVisited, DirsVisited: dirsVisited, PermissionErr: permErr, SlowPathsSkipped: slowPathsSkipped, HashFilesDone: 0, HashFilesTotal: 0, HashBytesDone: hashedBytes, HashBytesTotal: plannedHashBytes})
	}

	note := "All analysis and duplicate hashes were computed locally. Duplicate groups are exact SHA-256 matches among a bounded hash plan; groups that cannot fit at least two files inside the hash budget are skipped rather than performing a useless one-file hash."
	if slowPathsSkipped > 0 {
		note += fmt.Sprintf(" %d slow directory path(s) were skipped after a %s idle budget per directory batch so one unresponsive filesystem location could not stall the whole scan.", slowPathsSkipped, storageDirIdleTimeout)
	}
	if errors.Is(walkErr, errStorageEntryLimit) {
		note += " The bounded entry limit was reached, so results are partial."
	} else if errors.Is(walkErr, errStorageSlowDirectory) && slowPathsSkipped >= storageMaxSlowPaths {
		note += " The slow-path safety limit was reached, so traversal stopped early with partial results."
	}

	result := &AdvancedStorageResult{Root: root, FilesVisited: filesVisited, DirsVisited: dirsVisited, PermissionErr: permErr, SlowPathsSkipped: slowPathsSkipped, VisibleBytes: visible, Truncated: truncated, Cancelled: cancelled, LargeFiles: files, Families: groupFamilies(files), Categories: cats, FileTypes: types, Duplicates: duplicates, DuplicateHashBytes: hashedBytes, DurationMS: time.Since(start).Milliseconds(), Note: note}
	if progress != nil {
		phase := "complete"
		percent := 100
		if cancelled {
			phase = "cancelled"
			percent = 98
		}
		progress(storageProgress{Phase: phase, PhasePercent: percent, FilesVisited: filesVisited, DirsVisited: dirsVisited, PermissionErr: permErr, SlowPathsSkipped: slowPathsSkipped, HashBytesDone: hashedBytes, HashBytesTotal: plannedHashBytes})
	}
	if cancelled {
		return result, context.Canceled
	}
	return result, nil
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

type duplicateHashPlanItem struct {
	size uint64
	file LargeFile
}

func buildDuplicateHashPlan(candidates map[uint64][]LargeFile, budget uint64) ([]duplicateHashPlanItem, uint64) {
	type g struct {
		size      uint64
		files     []LargeFile
		potential uint64
	}
	var groups []g
	for size, files := range candidates {
		if size == 0 || len(files) < 2 {
			continue
		}
		potential := size * uint64(len(files)-1)
		groups = append(groups, g{size: size, files: append([]LargeFile(nil), files...), potential: potential})
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].potential > groups[j].potential })

	remaining := budget
	plan := make([]duplicateHashPlanItem, 0)
	var planned uint64
	for _, grp := range groups {
		// Exact duplicate confirmation requires at least two full files from a
		// same-size group. Never spend I/O on a lone file that cannot produce a
		// duplicate result within the remaining budget.
		if grp.size > remaining/2 {
			continue
		}
		maxFiles := int(remaining / grp.size)
		if maxFiles < 2 {
			continue
		}
		if maxFiles > len(grp.files) {
			maxFiles = len(grp.files)
		}
		for i := 0; i < maxFiles; i++ {
			plan = append(plan, duplicateHashPlanItem{size: grp.size, file: grp.files[i]})
		}
		used := grp.size * uint64(maxFiles)
		planned += used
		remaining -= used
	}
	return plan, planned
}

const duplicateHashBudget uint64 = 4 * 1024 * 1024 * 1024

func hashDuplicateCandidates(ctx context.Context, candidates map[uint64][]LargeFile, progress func(int, int, uint64, uint64, string)) ([]DuplicateGroup, uint64, uint64) {
	plan, planned := buildDuplicateHashPlan(candidates, duplicateHashBudget)
	if progress != nil {
		progress(0, len(plan), 0, planned, "")
	}
	var hashed uint64
	byHash := map[string][]LargeFile{}
	hashSizes := map[string]uint64{}
	for i, item := range plan {
		select {
		case <-ctx.Done():
			return duplicateGroupsFromMap(byHash, hashSizes), hashed, planned
		default:
		}
		info, err := os.Stat(item.file.Path)
		if err != nil || !info.Mode().IsRegular() || info.Size() < 0 || uint64(info.Size()) != item.size {
			if progress != nil {
				progress(i+1, len(plan), hashed, planned, item.file.Path)
			}
			continue
		}
		base := hashed
		h, readBytes, err := sha256FileProgress(ctx, item.file.Path, func(read uint64) {
			if progress == nil {
				return
			}
			current := base + read
			if current > planned {
				current = planned
			}
			progress(i, len(plan), current, planned, item.file.Path)
		})
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return duplicateGroupsFromMap(byHash, hashSizes), hashed, planned
			}
			if progress != nil {
				progress(i+1, len(plan), hashed, planned, item.file.Path)
			}
			continue
		}
		hashed += readBytes
		key := fmt.Sprintf("%d:%s", item.size, h)
		byHash[key] = append(byHash[key], item.file)
		hashSizes[key] = item.size
		if progress != nil {
			progress(i+1, len(plan), hashed, planned, item.file.Path)
		}
	}
	return duplicateGroupsFromMap(byHash, hashSizes), hashed, planned
}

func sha256FileProgress(ctx context.Context, path string, progress func(uint64)) (string, uint64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	buf := make([]byte, 1024*1024)
	var total uint64
	var lastReported uint64
	lastEmit := time.Now()
	for {
		select {
		case <-ctx.Done():
			return "", total, context.Canceled
		default:
		}
		n, e := f.Read(buf)
		if n > 0 {
			if _, werr := h.Write(buf[:n]); werr != nil {
				return "", total, werr
			}
			total += uint64(n)
			if progress != nil && (total-lastReported >= 16*1024*1024 || time.Since(lastEmit) >= 150*time.Millisecond) {
				progress(total)
				lastReported = total
				lastEmit = time.Now()
			}
		}
		if e == io.EOF {
			break
		}
		if e != nil {
			return "", total, e
		}
	}
	if progress != nil {
		progress(total)
	}
	return hex.EncodeToString(h.Sum(nil)), total, nil
}

func sha256File(ctx context.Context, path string) (string, error) {
	h, _, err := sha256FileProgress(ctx, path, nil)
	return h, err
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