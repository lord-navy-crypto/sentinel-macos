// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"container/heap"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

func commandOutputTimeout(d time.Duration, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).Output()
}

func commandRunTimeout(d time.Duration, name string, args ...string) error {
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).Run()
}

type Overview struct {
	Hostname      string  `json:"hostname"`
	OS            string  `json:"os"`
	Arch          string  `json:"arch"`
	CPUCount      int     `json:"cpu_count"`
	Load1         float64 `json:"load_1"`
	MemoryTotal   uint64  `json:"memory_total"`
	MemoryUsed    uint64  `json:"memory_used"`
	DiskTotal     uint64  `json:"disk_total"`
	DiskUsed      uint64  `json:"disk_used"`
	DiskAvailable uint64  `json:"disk_available"`
	ProcessCount  int     `json:"process_count"`
	Uptime        string  `json:"uptime"`
	ReadOnlyMode  bool    `json:"read_only_mode"`
	LocalOnly     bool    `json:"local_only"`
}

type ProcessInfo struct {
	PID     int     `json:"pid"`
	PPID    int     `json:"ppid"`
	CPU     float64 `json:"cpu"`
	Memory  float64 `json:"memory"`
	User    string  `json:"user"`
	Command string  `json:"command"`
}

type StartupItem struct {
	Path       string         `json:"path"`
	Name       string         `json:"name"`
	Executable string         `json:"executable"`
	Scope      string         `json:"scope"`
	Risk       int            `json:"risk"`
	Signals    []string       `json:"signals"`
	Manifest   LaunchManifest `json:"manifest"`
}

type NetworkItem struct {
	Command       string `json:"command"`
	PID           int    `json:"pid"`
	User          string `json:"user"`
	State         string `json:"state"`
	Address       string `json:"address"`
	Local         string `json:"local,omitempty"`
	Remote        string `json:"remote,omitempty"`
	EndpointClass string `json:"endpoint_class,omitempty"`
}

type LargeFile struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	Size    uint64 `json:"size"`
	ModUnix int64  `json:"modified_unix"`
}

type FileFamily struct {
	Key       string      `json:"key"`
	TotalSize uint64      `json:"total_size"`
	Files     []LargeFile `json:"files"`
}

type StorageScanRequest struct {
	Scope string `json:"scope"`
	MinMB int64  `json:"min_mb"`
	Limit int    `json:"limit"`
}

type StorageScanResponse struct {
	Root          string       `json:"root"`
	FilesVisited  int          `json:"files_visited"`
	DirsVisited   int          `json:"dirs_visited"`
	PermissionErr int          `json:"permission_errors"`
	Truncated     bool         `json:"truncated"`
	LargeFiles    []LargeFile  `json:"large_files"`
	Families      []FileFamily `json:"families"`
	DurationMS    int64        `json:"duration_ms"`
	Note          string       `json:"note"`
}

type SecurityFinding struct {
	Kind      string   `json:"kind"`
	Name      string   `json:"name"`
	Detail    string   `json:"detail"`
	Risk      int      `json:"risk"`
	Signals   []string `json:"signals"`
	Evidence  []string `json:"evidence,omitempty"`
	Reference string   `json:"trust_reference,omitempty"`
}

type SecurityReport struct {
	Score      int               `json:"score"`
	Level      string            `json:"level"`
	Findings   []SecurityFinding `json:"findings"`
	Disclaimer string            `json:"disclaimer"`
}

type CleanupCandidate struct {
	Path       string `json:"path"`
	Label      string `json:"label"`
	Size       uint64 `json:"size"`
	Confidence string `json:"confidence"`
	Reason     string `json:"reason"`
}

func (a *app) handleOverview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	ov := collectOverview()
	writeJSON(w, 200, ov)
}

func collectOverview() Overview {
	host, _ := os.Hostname()
	ov := Overview{
		Hostname:     host,
		OS:           runtime.GOOS,
		Arch:         runtime.GOARCH,
		CPUCount:     runtime.NumCPU(),
		ReadOnlyMode: true,
		LocalOnly:    true,
	}

	if runtime.GOOS == "darwin" {
		ov.Load1 = macLoad1()
		ov.MemoryTotal, ov.MemoryUsed = macMemory()
		ov.DiskTotal, ov.DiskUsed, ov.DiskAvailable = macDisk()
		ov.ProcessCount = len(macProcesses(100000))
		ov.Uptime = macUptime()
	} else {
		// Development fallback so the localhost UI can be smoke-tested off macOS.
		ov.ProcessCount = len(genericProcesses(100000))
		ov.DiskTotal, ov.DiskUsed, ov.DiskAvailable = genericDisk()
		ov.Uptime = "development host"
	}
	return ov
}

func macLoad1() float64 {
	out, err := commandOutputTimeout(2*time.Second, "sysctl", "-n", "vm.loadavg")
	if err != nil {
		return 0
	}
	s := strings.TrimSpace(string(out))
	s = strings.Trim(s, "{}")
	f := strings.Fields(s)
	if len(f) > 0 {
		v, _ := strconv.ParseFloat(f[0], 64)
		return v
	}
	return 0
}

func macMemory() (uint64, uint64) {
	out, err := commandOutputTimeout(2*time.Second, "sysctl", "-n", "hw.memsize")
	if err != nil {
		return 0, 0
	}
	total, _ := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64)

	vm, err := commandOutputTimeout(2*time.Second, "vm_stat")
	if err != nil {
		return total, 0
	}
	pageSize := uint64(4096)
	freePages := uint64(0)
	speculative := uint64(0)
	reNum := regexp.MustCompile(`([0-9]+)`)
	scanner := bufio.NewScanner(strings.NewReader(string(vm)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "page size of") {
			nums := reNum.FindAllString(line, -1)
			if len(nums) > 0 {
				pageSize, _ = strconv.ParseUint(nums[len(nums)-1], 10, 64)
			}
		}
		if strings.HasPrefix(line, "Pages free:") {
			n := reNum.FindString(line)
			freePages, _ = strconv.ParseUint(n, 10, 64)
		}
		if strings.HasPrefix(line, "Pages speculative:") {
			n := reNum.FindString(line)
			speculative, _ = strconv.ParseUint(n, 10, 64)
		}
	}
	available := (freePages + speculative) * pageSize
	if available > total {
		available = total
	}
	return total, total - available
}

func macDisk() (uint64, uint64, uint64) {
	out, err := commandOutputTimeout(2*time.Second, "df", "-k", "/")
	if err != nil {
		return 0, 0, 0
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) < 2 {
		return 0, 0, 0
	}
	f := strings.Fields(lines[len(lines)-1])
	if len(f) < 4 {
		return 0, 0, 0
	}
	total, _ := strconv.ParseUint(f[1], 10, 64)
	used, _ := strconv.ParseUint(f[2], 10, 64)
	avail, _ := strconv.ParseUint(f[3], 10, 64)
	return total * 1024, used * 1024, avail * 1024
}

func genericDisk() (uint64, uint64, uint64) {
	out, err := commandOutputTimeout(2*time.Second, "df", "-k", "/")
	if err != nil {
		return 0, 0, 0
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) < 2 {
		return 0, 0, 0
	}
	f := strings.Fields(lines[len(lines)-1])
	if len(f) < 4 {
		return 0, 0, 0
	}
	total, _ := strconv.ParseUint(f[1], 10, 64)
	used, _ := strconv.ParseUint(f[2], 10, 64)
	avail, _ := strconv.ParseUint(f[3], 10, 64)
	return total * 1024, used * 1024, avail * 1024
}

func macUptime() string {
	out, err := commandOutputTimeout(2*time.Second, "uptime")
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(out))
}

func (a *app) handleProcesses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	var p []ProcessInfo
	if runtime.GOOS == "darwin" {
		p = macProcesses(120)
	} else {
		p = genericProcesses(120)
	}
	writeJSON(w, 200, map[string]any{"processes": p})
}

func macProcesses(limit int) []ProcessInfo     { return parsePS(limit) }
func genericProcesses(limit int) []ProcessInfo { return parsePS(limit) }

func parsePS(limit int) []ProcessInfo {
	out, err := commandOutputTimeout(3*time.Second, "ps", "-axo", "pid=,ppid=,%cpu=,%mem=,user=,command=")
	if err != nil {
		return nil
	}
	rows := make([]ProcessInfo, 0)
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		f := strings.Fields(scanner.Text())
		if len(f) < 6 {
			continue
		}
		pid, e1 := strconv.Atoi(f[0])
		ppid, e2 := strconv.Atoi(f[1])
		cpu, e3 := strconv.ParseFloat(strings.ReplaceAll(f[2], ",", "."), 64)
		mem, e4 := strconv.ParseFloat(strings.ReplaceAll(f[3], ",", "."), 64)
		if e1 != nil || e2 != nil || e3 != nil || e4 != nil {
			continue
		}
		rows = append(rows, ProcessInfo{PID: pid, PPID: ppid, CPU: cpu, Memory: mem, User: f[4], Command: strings.Join(f[5:], " ")})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].CPU > rows[j].CPU })
	if len(rows) > limit {
		rows = rows[:limit]
	}
	return rows
}

func (a *app) handleStartup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	items := collectStartupItems()
	writeJSON(w, 200, map[string]any{"items": items, "note": "Risk is heuristic; a flagged startup item is not proof of malware."})
}

func collectStartupItems() []StartupItem {
	home, _ := os.UserHomeDir()
	dirs := []struct{ path, scope string }{
		{filepath.Join(home, "Library", "LaunchAgents"), "User LaunchAgent"},
		{"/Library/LaunchAgents", "System LaunchAgent"},
		{"/Library/LaunchDaemons", "System LaunchDaemon"},
	}
	items := make([]StartupItem, 0)
	for _, d := range dirs {
		entries, err := os.ReadDir(d.path)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".plist") {
				continue
			}
			path := filepath.Join(d.path, e.Name())
			exe := extractPlistExecutable(path)
			risk, signals := scorePath(exe)
			if exe != "" && runtime.GOOS == "darwin" {
				if st, err := os.Stat(exe); err == nil && !st.IsDir() && !isCodeSigned(exe) {
					risk += 15
					signals = append(signals, "Executable is not code-signed (may still be legitimate, especially scripts)")
				}
			}
			if risk > 100 {
				risk = 100
			}
			items = append(items, StartupItem{Path: path, Name: e.Name(), Executable: exe, Scope: d.scope, Risk: risk, Signals: signals, Manifest: parseLaunchManifest(path)})
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Risk > items[j].Risk })
	return items
}

func extractPlistExecutable(path string) string {
	if runtime.GOOS == "darwin" && commandExists("plutil") {
		out, err := commandOutputTimeout(2*time.Second, "plutil", "-p", path)
		if err == nil {
			lines := strings.Split(string(out), "\n")
			for i, line := range lines {
				if strings.Contains(line, `"Program" =>`) {
					if q := quotedTail(line); q != "" {
						return q
					}
				}
				if strings.Contains(line, `"ProgramArguments" =>`) {
					for j := i + 1; j < len(lines) && j < i+8; j++ {
						if q := quotedTail(lines[j]); q != "" {
							return q
						}
					}
				}
			}
		}
	}
	b, err := os.ReadFile(path)
	if err != nil || len(b) > 512*1024 {
		return ""
	}
	s := string(b)
	re := regexp.MustCompile(`(?s)<key>Program</key>\s*<string>([^<]+)</string>`)
	m := re.FindStringSubmatch(s)
	if len(m) == 2 {
		return strings.TrimSpace(m[1])
	}
	re2 := regexp.MustCompile(`(?s)<key>ProgramArguments</key>\s*<array>\s*<string>([^<]+)</string>`)
	m = re2.FindStringSubmatch(s)
	if len(m) == 2 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func quotedTail(s string) string {
	idx := strings.Index(s, "=>")
	if idx < 0 {
		return ""
	}
	t := strings.TrimSpace(s[idx+2:])
	t = strings.Trim(t, "\"")
	if strings.HasPrefix(t, "/") || strings.HasPrefix(t, "~") {
		return t
	}
	return ""
}

func scorePath(path string) (int, []string) {
	if path == "" {
		return 0, nil
	}
	p := strings.ToLower(path)
	risk := 0
	var signals []string
	if strings.Contains(p, "/private/tmp/") || strings.HasPrefix(p, "/tmp/") {
		risk += 40
		signals = append(signals, "Runs from a temporary directory")
	}
	if strings.Contains(p, "/downloads/") {
		risk += 25
		signals = append(signals, "Runs directly from Downloads")
	}
	home, _ := os.UserHomeDir()
	if home != "" && strings.HasPrefix(path, home) {
		rel, _ := filepath.Rel(home, path)
		for _, part := range strings.Split(rel, string(os.PathSeparator)) {
			if strings.HasPrefix(part, ".") && part != "." && part != ".." {
				risk += 20
				signals = append(signals, "Executable lives in a hidden home-directory path")
				break
			}
		}
	}
	if strings.Contains(p, "/library/caches/") {
		risk += 20
		signals = append(signals, "Executable runs from a cache directory")
	}
	return risk, signals
}

func isCodeSigned(path string) bool {
	if runtime.GOOS != "darwin" || !commandExists("codesign") {
		return true
	}
	return commandRunTimeout(3*time.Second, "codesign", "--verify", "--deep", "--strict", path) == nil
}

func (a *app) handleNetwork(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	items, err := collectNetwork()
	if err != nil {
		writeJSON(w, 200, map[string]any{"items": []NetworkItem{}, "warning": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func collectNetwork() ([]NetworkItem, error) {
	if !commandExists("lsof") {
		return nil, errors.New("lsof is unavailable; network inspection cannot run")
	}
	out, err := commandOutputTimeout(4*time.Second, "lsof", "-nP", "-iTCP")
	if err != nil {
		// lsof exits nonzero when no matches on some systems.
		if len(out) == 0 {
			return []NetworkItem{}, nil
		}
	}
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	first := true
	rows := make([]NetworkItem, 0)
	for scanner.Scan() {
		line := scanner.Text()
		if first {
			first = false
			continue
		}
		f := strings.Fields(line)
		if len(f) < 9 {
			continue
		}
		pid, _ := strconv.Atoi(f[1])
		tail := strings.Join(f[8:], " ")
		state := "OTHER"
		if strings.Contains(tail, "(LISTEN)") {
			state = "LISTEN"
		}
		if strings.Contains(tail, "(ESTABLISHED)") {
			state = "ESTABLISHED"
		}
		address := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(tail, "(LISTEN)", ""), "(ESTABLISHED)", ""))
		local, remote, class := classifyEndpoint(address, state)
		rows = append(rows, NetworkItem{Command: f[0], PID: pid, User: f[2], State: state, Address: address, Local: local, Remote: remote, EndpointClass: class})
		if len(rows) >= 250 {
			break
		}
	}
	return rows, nil
}

type fileHeap []LargeFile

func (h fileHeap) Len() int           { return len(h) }
func (h fileHeap) Less(i, j int) bool { return h[i].Size < h[j].Size }
func (h fileHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *fileHeap) Push(x any)        { *h = append(*h, x.(LargeFile)) }
func (h *fileHeap) Pop() any          { old := *h; n := len(old); x := old[n-1]; *h = old[:n-1]; return x }

func (a *app) handleStorageScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	var req StorageScanRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid request"})
		return
	}
	if req.MinMB < 1 {
		req.MinMB = 100
	}
	if req.MinMB > 1024*1024 {
		req.MinMB = 1024 * 1024
	}
	if req.Limit < 10 {
		req.Limit = 50
	}
	if req.Limit > 250 {
		req.Limit = 250
	}
	root, err := resolveScope(req.Scope)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	resp := scanLargeFiles(root, uint64(req.MinMB)*1024*1024, req.Limit)
	writeJSON(w, 200, resp)
}

func resolveScope(scope string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	allowed := map[string]string{
		"home":      home,
		"downloads": filepath.Join(home, "Downloads"),
		"desktop":   filepath.Join(home, "Desktop"),
		"documents": filepath.Join(home, "Documents"),
		"library":   filepath.Join(home, "Library"),
	}
	if p, ok := allowed[strings.ToLower(strings.TrimSpace(scope))]; ok {
		return p, nil
	}
	if strings.HasPrefix(scope, "~/") {
		scope = filepath.Join(home, strings.TrimPrefix(scope, "~/"))
	}
	if scope == "" {
		return home, nil
	}
	abs, err := filepath.Abs(scope)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", err
	}
	homeResolved, _ := filepath.EvalSymlinks(home)
	rel, err := filepath.Rel(homeResolved, resolved)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", errors.New("v0.2 intentionally restricts file scans to your home directory")
	}
	return resolved, nil
}

func scanLargeFiles(root string, minSize uint64, limit int) StorageScanResponse {
	start := time.Now()
	h := &fileHeap{}
	heap.Init(h)
	filesVisited, dirsVisited, permErr := 0, 0, 0
	truncated := false
	const maxEntries = 350000
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			permErr++
			if errors.Is(err, fs.ErrPermission) {
				return nil
			}
			return nil
		}
		if filesVisited+dirsVisited >= maxEntries {
			truncated = true
			return filepath.SkipAll
		}
		if d.IsDir() {
			dirsVisited++
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		filesVisited++
		info, err := d.Info()
		if err != nil {
			return nil
		}
		if info.Size() < 0 || uint64(info.Size()) < minSize {
			return nil
		}
		lf := LargeFile{Path: path, Name: d.Name(), Size: uint64(info.Size()), ModUnix: info.ModTime().Unix()}
		if h.Len() < limit {
			heap.Push(h, lf)
		} else if (*h)[0].Size < lf.Size {
			heap.Pop(h)
			heap.Push(h, lf)
		}
		return nil
	})
	files := make([]LargeFile, h.Len())
	for i := len(files) - 1; i >= 0; i-- {
		files[i] = heap.Pop(h).(LargeFile)
	}
	families := groupFamilies(files)
	return StorageScanResponse{Root: root, FilesVisited: filesVisited, DirsVisited: dirsVisited, PermissionErr: permErr, Truncated: truncated, LargeFiles: files, Families: families, DurationMS: time.Since(start).Milliseconds(), Note: "Large-file and version-family results are local heuristics. No files were modified."}
}

var versionToken = regexp.MustCompile(`(?i)(?:[._ -](?:v|ver|version)?\d+(?:\.\d+)*|[._ -](?:final|fixed|old|new|copy|backup|bak|rev\d*))+`)

func familyKey(name string) string {
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	k := versionToken.ReplaceAllString(stem, "")
	k = strings.Trim(strings.ToLower(k), " ._-()[]")
	if len(k) < 3 {
		return ""
	}
	return k + strings.ToLower(ext)
}
func groupFamilies(files []LargeFile) []FileFamily {
	m := map[string][]LargeFile{}
	for _, f := range files {
		k := familyKey(f.Name)
		if k != "" {
			m[k] = append(m[k], f)
		}
	}
	out := make([]FileFamily, 0)
	for k, fs := range m {
		if len(fs) < 2 {
			continue
		}
		var total uint64
		for _, f := range fs {
			total += f.Size
		}
		out = append(out, FileFamily{Key: k, TotalSize: total, Files: fs})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TotalSize > out[j].TotalSize })
	if len(out) > 12 {
		out = out[:12]
	}
	return out
}

func (a *app) handleSecurityAudit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	report := buildSecurityReport()
	attachTrustReferences(&report, a.trust)
	writeJSON(w, 200, report)
}

func buildSecurityReport() SecurityReport {
	startups := collectStartupItems()
	procs := macProcesses(160)
	if runtime.GOOS != "darwin" {
		procs = genericProcesses(160)
	}
	netItems, _ := collectNetwork()
	netPIDs := map[int]bool{}
	for _, n := range netItems {
		netPIDs[n.PID] = true
	}
	findings := make([]SecurityFinding, 0)
	for _, s := range startups {
		if s.Risk >= 20 {
			findings = append(findings, SecurityFinding{Kind: "startup", Name: s.Name, Detail: s.Executable, Risk: s.Risk, Signals: s.Signals, Evidence: []string{s.Path}})
		}
	}
	for _, p := range procs {
		target, isScript := auditTargetFromCommand(p.Command)
		risk, signals := scorePath(target)
		if isScript && risk > 0 {
			signals = append(signals, "Process is executing a script from this location")
		}
		// Code-signing evidence is meaningful for executable binaries, but many legitimate scripts are unsigned.
		if risk > 0 && !isScript && runtime.GOOS == "darwin" && signatureStatus(target) == "Unsigned / unverifiable" {
			risk += 15
			signals = append(signals, "Executable could not be verified by macOS code signing")
		}
		if netPIDs[p.PID] && risk > 0 {
			risk += 10
			signals = append(signals, "Process also has an active TCP socket")
		}
		if risk >= 25 {
			if risk > 100 {
				risk = 100
			}
			name := filepath.Base(target)
			if name == "." || name == "" {
				name = "process"
			}
			findings = append(findings, SecurityFinding{Kind: "process", Name: name, Detail: fmt.Sprintf("PID %d — %s", p.PID, p.Command), Risk: risk, Signals: signals, Evidence: []string{target}})
		}
	}
	sort.Slice(findings, func(i, j int) bool { return findings[i].Risk > findings[j].Risk })
	if len(findings) > 30 {
		findings = findings[:30]
	}
	score := 0
	if len(findings) > 0 {
		score = findings[0].Risk
	}
	level := "Good"
	if score >= 70 {
		level = "Review recommended"
	} else if score >= 40 {
		level = "Some items need review"
	} else if score >= 20 {
		level = "Low-level anomalies"
	}
	return SecurityReport{Score: score, Level: level, Findings: findings, Disclaimer: "Sentinel v1.0 performs heuristic security auditing, not definitive malware diagnosis. Trusted Profile membership is reference context, not proof of safety."}
}

func attachTrustReferences(report *SecurityReport, trust *trustManager) {
	if report == nil || trust == nil {
		return
	}
	for i := range report.Findings {
		target := ""
		if len(report.Findings[i].Evidence) > 0 {
			target = report.Findings[i].Evidence[0]
		}
		if report.Findings[i].Kind == "startup" && report.Findings[i].Detail != "" {
			target = report.Findings[i].Detail
		}
		report.Findings[i].Reference = trust.referenceLabel(target)
	}
}

func (a *app) handleCleanupPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	home, _ := os.UserHomeDir()
	specs := []struct{ path, label, confidence, reason string }{
		{filepath.Join(home, ".Trash"), "Trash", "Review", "Items already moved to Trash may still consume disk space."},
		{filepath.Join(home, "Library", "Caches"), "Application caches", "Review", "Caches can often be rebuilt, but deleting them can sign you out or slow the next launch."},
		{filepath.Join(home, "Library", "Developer", "Xcode", "DerivedData"), "Xcode DerivedData", "Review", "Build products can be regenerated by Xcode."},
	}
	var wg sync.WaitGroup
	ch := make(chan CleanupCandidate, len(specs))
	for _, s := range specs {
		s := s
		wg.Add(1)
		go func() {
			defer wg.Done()
			size := boundedDirSize(s.path, 250000)
			if size > 0 {
				ch <- CleanupCandidate{Path: s.path, Label: s.label, Size: size, Confidence: s.confidence, Reason: s.reason}
			}
		}()
	}
	wg.Wait()
	close(ch)
	items := make([]CleanupCandidate, 0)
	for x := range ch {
		items = append(items, x)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Size > items[j].Size })
	writeJSON(w, 200, map[string]any{"items": items, "read_only": true, "note": "Preview only. Sentinel v1.0 never permanently deletes. Eligible regular files can be handed to the separate reversible Safe Actions workflow."})
}

func boundedDirSize(root string, maxEntries int) uint64 {
	if _, err := os.Stat(root); err != nil {
		return 0
	}
	var total uint64
	count := 0
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		count++
		if count > maxEntries {
			return filepath.SkipAll
		}
		if d.IsDir() || d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if info, e := d.Info(); e == nil && info.Size() > 0 {
			total += uint64(info.Size())
		}
		return nil
	})
	return total
}
