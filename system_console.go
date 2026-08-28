// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	systemConsoleDefaultTimeout = 6 * time.Second
	systemConsoleMaxTimeout     = 15 * time.Second
	systemConsoleOutputLimit    = 256 << 10
	systemConsoleRequestLimit   = 8 << 10
)

type SystemConsoleTool struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Intent         string   `json:"intent"`
	Domain         string   `json:"domain"`
	Mode           string   `json:"mode"`
	Summary        string   `json:"summary"`
	TargetKind     string   `json:"target_kind,omitempty"`
	Command        string   `json:"command,omitempty"`
	BaseArgs       []string `json:"base_args,omitempty"`
	Route          string   `json:"route,omitempty"`
	Available      bool     `json:"available"`
	TimeoutSeconds int      `json:"timeout_seconds,omitempty"`
	Safety         string   `json:"safety"`
}

type SystemConsoleCatalog struct {
	GeneratedAt string              `json:"generated_at"`
	Platform    string              `json:"platform"`
	Tools       []SystemConsoleTool `json:"tools"`
	Principles  []string            `json:"principles"`
	Note        string              `json:"note"`
}

type SystemConsoleQueryRequest struct {
	ToolID string `json:"tool_id"`
	Target string `json:"target,omitempty"`
}

type SystemConsoleResult struct {
	GeneratedAt    string   `json:"generated_at"`
	ToolID         string   `json:"tool_id"`
	ToolName       string   `json:"tool_name"`
	Intent         string   `json:"intent"`
	Domain         string   `json:"domain"`
	Target         string   `json:"target,omitempty"`
	DisplayCommand string   `json:"display_command"`
	Output         string   `json:"output"`
	ExitCode       int      `json:"exit_code"`
	DurationMS     int64    `json:"duration_ms"`
	Truncated      bool     `json:"truncated"`
	TimedOut       bool     `json:"timed_out"`
	Status         string   `json:"status"`
	Limitations    []string `json:"limitations,omitempty"`
	Note           string   `json:"note"`
}

type SystemObjectInspectRequest struct {
	Path string `json:"path"`
}

type SystemObjectInspection struct {
	GeneratedAt string                `json:"generated_at"`
	Path        string                `json:"path"`
	Exists      bool                  `json:"exists"`
	Kind        string                `json:"kind,omitempty"`
	Size        int64                 `json:"size,omitempty"`
	Mode        string                `json:"mode,omitempty"`
	ModifiedAt  string                `json:"modified_at,omitempty"`
	Queries     []SystemConsoleResult `json:"queries"`
	Summary     []string              `json:"summary"`
	Limitations []string              `json:"limitations,omitempty"`
	Note        string                `json:"note"`
}

type boundedCapture struct {
	buf       []byte
	limit     int
	truncated bool
}

func (b *boundedCapture) Write(p []byte) (int, error) {
	if b.limit <= 0 {
		b.limit = systemConsoleOutputLimit
	}
	remaining := b.limit - len(b.buf)
	if remaining > 0 {
		if remaining > len(p) {
			remaining = len(p)
		}
		b.buf = append(b.buf, p[:remaining]...)
	}
	if remaining < len(p) {
		b.truncated = true
	}
	return len(p), nil
}

func (b *boundedCapture) String() string {
	return strings.TrimSpace(string(b.buf))
}

func systemConsoleToolDefinitions() []SystemConsoleTool {
	readonly := "Read-only inspection. Sentinel uses an allowlisted executable and explicit arguments; no shell is invoked."
	managed := "Mutation is not executed by the System Console query runner. Use Sentinel's existing preview/confirmation/recovery workflow."
	return []SystemConsoleTool{
		{ID: "process-table", Name: "Process table", Intent: "understand", Domain: "processes", Mode: "read_only", Summary: "Show running processes with parent PID, user, CPU, memory, elapsed time, and command.", Command: "/bin/ps", BaseArgs: []string{"-axo", "pid,ppid,user,%cpu,%mem,etime,comm"}, TimeoutSeconds: 5, Safety: readonly},
		{ID: "disk-filesystems", Name: "Mounted filesystem usage", Intent: "understand", Domain: "storage", Mode: "read_only", Summary: "Show mounted filesystems and their visible capacity/usage.", Command: "/bin/df", BaseArgs: []string{"-h"}, TimeoutSeconds: 5, Safety: readonly},
		{ID: "mount-table", Name: "Mount table", Intent: "understand", Domain: "storage", Mode: "read_only", Summary: "Show currently mounted volumes and mount options.", Command: "/sbin/mount", TimeoutSeconds: 5, Safety: readonly},
		{ID: "power-settings", Name: "Power settings", Intent: "understand", Domain: "power", Mode: "read_only", Summary: "Show the active macOS power-management configuration.", Command: "/usr/bin/pmset", BaseArgs: []string{"-g"}, TimeoutSeconds: 5, Safety: readonly},
		{ID: "software-profile", Name: "Software profile", Intent: "understand", Domain: "system", Mode: "read_only", Summary: "Show macOS software/system version information from system_profiler.", Command: "/usr/sbin/system_profiler", BaseArgs: []string{"SPSoftwareDataType"}, TimeoutSeconds: 12, Safety: readonly},
		{ID: "route-table", Name: "Network route table", Intent: "investigate", Domain: "network", Mode: "read_only", Summary: "Show the current routing table without changing network configuration.", Command: "/usr/sbin/netstat", BaseArgs: []string{"-rn"}, TimeoutSeconds: 6, Safety: readonly},
		{ID: "file-metadata", Name: "File metadata", Intent: "investigate", Domain: "filesystem", Mode: "read_only", Summary: "Inspect Spotlight metadata for one absolute path.", TargetKind: "path", Command: "/usr/bin/mdls", TimeoutSeconds: 6, Safety: readonly},
		{ID: "extended-attributes", Name: "Extended attributes", Intent: "investigate", Domain: "filesystem", Mode: "read_only", Summary: "Inspect extended attributes such as quarantine metadata for one absolute path.", TargetKind: "path", Command: "/usr/bin/xattr", BaseArgs: []string{"-l"}, TimeoutSeconds: 6, Safety: readonly},
		{ID: "code-signing", Name: "Code-signing identity", Intent: "investigate", Domain: "integrity", Mode: "read_only", Summary: "Ask codesign for signature identity/details for one absolute path.", TargetKind: "path", Command: "/usr/bin/codesign", BaseArgs: []string{"-dv", "--verbose=4"}, TimeoutSeconds: 8, Safety: readonly},
		{ID: "gatekeeper-assessment", Name: "Gatekeeper assessment", Intent: "investigate", Domain: "integrity", Mode: "read_only", Summary: "Ask spctl how Gatekeeper assesses an executable/app path. A rejection is evidence, not a malware verdict.", TargetKind: "path", Command: "/usr/sbin/spctl", BaseArgs: []string{"--assess", "--type", "execute", "--verbose=4"}, TimeoutSeconds: 8, Safety: readonly},
		{ID: "plist-inspect", Name: "Property-list view", Intent: "investigate", Domain: "persistence", Mode: "read_only", Summary: "Render a plist as structured text without modifying the file.", TargetKind: "path", Command: "/usr/bin/plutil", BaseArgs: []string{"-p"}, TimeoutSeconds: 6, Safety: readonly},
		{ID: "path-size", Name: "Path size", Intent: "investigate", Domain: "storage", Mode: "read_only", Summary: "Measure the visible size of one path using a bounded-time du query.", TargetKind: "path", Command: "/usr/bin/du", BaseArgs: []string{"-sh"}, TimeoutSeconds: 12, Safety: readonly},
		{ID: "process-open-files", Name: "Process open files", Intent: "investigate", Domain: "processes", Mode: "read_only", Summary: "Show files and sockets currently opened by one PID.", TargetKind: "pid", Command: "/usr/sbin/lsof", BaseArgs: []string{"-p"}, TimeoutSeconds: 8, Safety: readonly},

		{ID: "safe-action-preview", Name: "Safe Action preview", Intent: "control", Domain: "filesystem", Mode: "sentinel_action", Summary: "Preview a reversible Sentinel action before any mutation.", Route: "/api/actions/preview", Safety: managed},
		{ID: "safe-action-execute", Name: "Confirmed Safe Action", Intent: "control", Domain: "filesystem", Mode: "sentinel_action", Summary: "Execute only an already-previewed action through typed confirmation, one-time code, and revalidation.", Route: "/api/actions/execute", Safety: managed},
		{ID: "vault", Name: "Vault", Intent: "recover", Domain: "filesystem", Mode: "sentinel_action", Summary: "Inspect or restore Sentinel Vault items through the existing reversible workflow.", Route: "/api/actions/vault", Safety: managed},
		{ID: "action-journal", Name: "Action journal", Intent: "recover", Domain: "filesystem", Mode: "sentinel_action", Summary: "Review the local journal of reversible actions and recovery metadata.", Route: "/api/actions/journal", Safety: managed},
		{ID: "change-reconcile", Name: "Change reconciliation", Intent: "recover", Domain: "changes", Mode: "sentinel_action", Summary: "Reconcile monitoring gaps/dropped events through Sentinel's bounded change workflow.", Route: "/api/changes/reconcile", Safety: managed},
		{ID: "trust-restore", Name: "Trusted Profile restore", Intent: "recover", Domain: "trust", Mode: "sentinel_action", Summary: "Restore the previous Trusted Profile through Sentinel's explicit restore route.", Route: "/api/trust/restore", Safety: managed},
	}
}

func executableAvailable(path string) bool {
	if runtime.GOOS != "darwin" || strings.TrimSpace(path) == "" {
		return false
	}
	st, err := os.Stat(path)
	return err == nil && !st.IsDir() && st.Mode()&0111 != 0
}

func SystemConsoleCatalogSnapshot() SystemConsoleCatalog {
	tools := systemConsoleToolDefinitions()
	for i := range tools {
		if tools[i].Mode == "sentinel_action" {
			tools[i].Available = true
		} else {
			tools[i].Available = executableAvailable(tools[i].Command)
		}
	}
	sort.SliceStable(tools, func(i, j int) bool {
		if tools[i].Intent != tools[j].Intent {
			return tools[i].Intent < tools[j].Intent
		}
		if tools[i].Domain != tools[j].Domain {
			return tools[i].Domain < tools[j].Domain
		}
		return tools[i].Name < tools[j].Name
	})
	return SystemConsoleCatalog{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Platform:    runtime.GOOS + "/" + runtime.GOARCH,
		Tools:       tools,
		Principles: []string{
			"Understand before changing.",
			"Read-only system queries use a fixed allowlist and never invoke a shell.",
			"Evidence and interpretation remain separate.",
			"Mutating operations stay inside Sentinel preview, confirmation, journaling, and recovery boundaries.",
			"Unavailable evidence is shown as unavailable instead of being treated as safe.",
		},
		Note: "System Console is Sentinel's visual macOS control-plane foundation. It exposes bounded system evidence, not an arbitrary terminal.",
	}
}

func findSystemConsoleTool(id string) (SystemConsoleTool, bool) {
	id = strings.TrimSpace(id)
	for _, tool := range systemConsoleToolDefinitions() {
		if tool.ID == id {
			tool.Available = tool.Mode == "sentinel_action" || executableAvailable(tool.Command)
			return tool, true
		}
	}
	return SystemConsoleTool{}, false
}

func normalizeSystemConsoleTarget(kind, target string) (string, error) {
	target = strings.TrimSpace(target)
	switch kind {
	case "":
		if target != "" {
			return "", fmt.Errorf("tool does not accept a target")
		}
		return "", nil
	case "path":
		if target == "" {
			return "", fmt.Errorf("absolute path required")
		}
		if strings.ContainsRune(target, '\x00') || !filepath.IsAbs(target) {
			return "", fmt.Errorf("target must be an absolute path")
		}
		return filepath.Clean(target), nil
	case "pid":
		pid, err := strconv.Atoi(target)
		if err != nil || pid <= 0 {
			return "", fmt.Errorf("positive PID required")
		}
		return strconv.Itoa(pid), nil
	default:
		return "", fmt.Errorf("unsupported target kind")
	}
}

func shellQuoteDisplay(s string) string {
	if s == "" {
		return "''"
	}
	if !strings.ContainsAny(s, " \t\n\"'\\$`!&|;()<>*?[]{}") {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

func systemConsoleDisplayCommand(tool SystemConsoleTool, args []string) string {
	parts := []string{shellQuoteDisplay(tool.Command)}
	for _, arg := range args {
		parts = append(parts, shellQuoteDisplay(arg))
	}
	return strings.Join(parts, " ")
}

func systemConsoleCommandArgs(tool SystemConsoleTool, target string) ([]string, error) {
	target, err := normalizeSystemConsoleTarget(tool.TargetKind, target)
	if err != nil {
		return nil, err
	}
	args := append([]string(nil), tool.BaseArgs...)
	if tool.TargetKind != "" {
		args = append(args, target)
	}
	return args, nil
}

func RunSystemConsoleQuery(parent context.Context, req SystemConsoleQueryRequest) (SystemConsoleResult, error) {
	tool, ok := findSystemConsoleTool(req.ToolID)
	if !ok {
		return SystemConsoleResult{}, fmt.Errorf("unknown system console tool")
	}
	if tool.Mode != "read_only" {
		return SystemConsoleResult{}, fmt.Errorf("tool is managed by Sentinel's existing safe-action/recovery workflow")
	}
	args, err := systemConsoleCommandArgs(tool, req.Target)
	if err != nil {
		return SystemConsoleResult{}, err
	}
	result := SystemConsoleResult{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		ToolID:      tool.ID,
		ToolName:    tool.Name,
		Intent:      tool.Intent,
		Domain:      tool.Domain,
		Target:      strings.TrimSpace(req.Target),
		ExitCode:    -1,
		Status:      "unavailable",
		Note:        "Output is bounded local evidence from an allowlisted macOS command. A command result is not by itself a security verdict.",
	}
	result.DisplayCommand = systemConsoleDisplayCommand(tool, args)
	if !tool.Available {
		result.Limitations = append(result.Limitations, "required macOS executable is unavailable")
		return result, nil
	}

	timeout := systemConsoleDefaultTimeout
	if tool.TimeoutSeconds > 0 {
		timeout = time.Duration(tool.TimeoutSeconds) * time.Second
	}
	if timeout > systemConsoleMaxTimeout {
		timeout = systemConsoleMaxTimeout
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	capture := &boundedCapture{limit: systemConsoleOutputLimit}
	cmd := exec.CommandContext(ctx, tool.Command, args...)
	cmd.Stdout = capture
	cmd.Stderr = capture
	cmd.Env = []string{
		"PATH=/usr/bin:/bin:/usr/sbin:/sbin",
		"LANG=C",
		"LC_ALL=C",
		"HOME=" + os.Getenv("HOME"),
	}
	started := time.Now()
	err = cmd.Run()
	result.DurationMS = time.Since(started).Milliseconds()
	result.Output = capture.String()
	result.Truncated = capture.truncated
	if result.Truncated {
		result.Limitations = append(result.Limitations, fmt.Sprintf("output was truncated at %d bytes", systemConsoleOutputLimit))
	}

	if ctx.Err() == context.DeadlineExceeded {
		result.TimedOut = true
		result.Status = "timeout"
		result.Limitations = append(result.Limitations, fmt.Sprintf("query exceeded %s", timeout))
		return result, nil
	}
	if err == nil {
		result.ExitCode = 0
		result.Status = "ok"
		return result, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		result.ExitCode = exitErr.ExitCode()
		result.Status = "reported"
		result.Limitations = append(result.Limitations, "command returned a non-zero status; inspect output as evidence")
		return result, nil
	}
	return SystemConsoleResult{}, fmt.Errorf("run system query: %w", err)
}

func InspectSystemObject(ctx context.Context, rawPath string) (SystemObjectInspection, error) {
	path, err := normalizeSystemConsoleTarget("path", rawPath)
	if err != nil {
		return SystemObjectInspection{}, err
	}
	out := SystemObjectInspection{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Path:        path,
		Queries:     []SystemConsoleResult{},
		Note:        "Object inspection combines bounded read-only macOS evidence. Missing or rejected evidence remains visible and is not treated as proof of safety.",
	}
	st, statErr := os.Lstat(path)
	if statErr != nil {
		if os.IsNotExist(statErr) {
			out.Limitations = append(out.Limitations, "path does not exist")
			return out, nil
		}
		out.Limitations = append(out.Limitations, "path metadata unavailable: "+statErr.Error())
		return out, nil
	}
	out.Exists = true
	out.Size = st.Size()
	out.Mode = st.Mode().String()
	out.ModifiedAt = st.ModTime().UTC().Format(time.RFC3339)
	switch {
	case st.Mode()&os.ModeSymlink != 0:
		out.Kind = "symlink"
	case st.IsDir():
		if strings.EqualFold(filepath.Ext(path), ".app") {
			out.Kind = "application_bundle"
		} else {
			out.Kind = "directory"
		}
	case st.Mode().IsRegular():
		out.Kind = "file"
	default:
		out.Kind = "special"
	}
	out.Summary = append(out.Summary, fmt.Sprintf("Observed %s at %s.", out.Kind, path))

	toolIDs := []string{"file-metadata", "extended-attributes"}
	if out.Kind == "application_bundle" || out.Kind == "file" {
		toolIDs = append(toolIDs, "code-signing", "gatekeeper-assessment")
	}
	if strings.EqualFold(filepath.Ext(path), ".plist") {
		toolIDs = append(toolIDs, "plist-inspect")
	}
	for _, id := range toolIDs {
		result, queryErr := RunSystemConsoleQuery(ctx, SystemConsoleQueryRequest{ToolID: id, Target: path})
		if queryErr != nil {
			out.Limitations = append(out.Limitations, id+": "+queryErr.Error())
			continue
		}
		out.Queries = append(out.Queries, result)
		if result.Status == "ok" {
			out.Summary = append(out.Summary, result.ToolName+" evidence available.")
		} else if result.Status == "reported" {
			out.Summary = append(out.Summary, result.ToolName+" returned reviewable evidence.")
		}
		for _, limitation := range result.Limitations {
			out.Limitations = appendUniqueString(out.Limitations, result.ToolName+": "+limitation)
		}
	}
	return out, nil
}

func decodeSystemConsoleJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, systemConsoleRequestLimit))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("request must contain one JSON value")
		}
		return err
	}
	return nil
}

func (a *app) handleSystemConsole(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, SystemConsoleCatalogSnapshot())
}

func (a *app) handleSystemConsoleQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return
	}
	var req SystemConsoleQueryRequest
	if err := decodeSystemConsoleJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request: " + err.Error()})
		return
	}
	out, err := RunSystemConsoleQuery(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *app) handleSystemObjectInspect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return
	}
	var req SystemObjectInspectRequest
	if err := decodeSystemConsoleJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request: " + err.Error()})
		return
	}
	out, err := InspectSystemObject(r.Context(), req.Path)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}
