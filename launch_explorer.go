// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const launchExplorerItemLimit = 300

type LaunchServiceItem struct {
	ID             string   `json:"id"`
	Label          string   `json:"label,omitempty"`
	Scope          string   `json:"scope"`
	PlistPath      string   `json:"plist_path"`
	Executable     string   `json:"executable,omitempty"`
	RunAtLoad      bool     `json:"run_at_load"`
	KeepAlive      string   `json:"keep_alive,omitempty"`
	ModifiedAt     int64    `json:"modified_at"`
	HashStatus     string   `json:"hash_status"`
	SHA256         string   `json:"sha256,omitempty"`
	TargetExists   bool     `json:"target_exists"`
	Running        bool     `json:"running"`
	RunningPIDs    []int    `json:"running_pids,omitempty"`
	Explanation    []string `json:"explanation"`
	Limitations    []string `json:"limitations,omitempty"`
}

type LaunchServiceExplorer struct {
	GeneratedAt   string              `json:"generated_at"`
	CapturedAt    string              `json:"captured_at"`
	Total         int                 `json:"total"`
	UserAgents    int                 `json:"user_agents"`
	SystemAgents  int                 `json:"system_agents"`
	SystemDaemons int                 `json:"system_daemons"`
	Running       int                 `json:"running"`
	MissingTarget int                 `json:"missing_target"`
	Items         []LaunchServiceItem `json:"items"`
	Limitations   []string            `json:"limitations,omitempty"`
	Note          string              `json:"note"`
}

type LaunchServiceDetailRequest struct {
	PlistPath string `json:"plist_path"`
}

type LaunchServiceDetail struct {
	GeneratedAt string                  `json:"generated_at"`
	Item        LaunchServiceItem       `json:"item"`
	Target      *SystemObjectInspection `json:"target,omitempty"`
	Plist       *SystemObjectInspection `json:"plist,omitempty"`
	Note        string                  `json:"note"`
}

func normalizedExecutablePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" || !filepath.IsAbs(path) {
		return ""
	}
	return filepath.Clean(path)
}

func processPIDsByExecutable(processes []ProcessEvidenceRow) map[string][]int {
	out := map[string][]int{}
	for _, process := range processes {
		command := strings.TrimSpace(process.Command)
		if command == "" {
			continue
		}
		if filepath.IsAbs(command) {
			command = filepath.Clean(command)
		}
		out[command] = append(out[command], process.PID)
	}
	for key := range out {
		sort.Ints(out[key])
	}
	return out
}

func launchServiceFromPersistence(file PersistenceFile, processes map[string][]int) LaunchServiceItem {
	executable := normalizedExecutablePath(file.Executable)
	item := LaunchServiceItem{
		ID:         entityID("launch-service", file.Path),
		Label:      file.Label,
		Scope:      file.Scope,
		PlistPath:  file.Path,
		Executable: executable,
		RunAtLoad:  file.RunAtLoad,
		KeepAlive:  file.KeepAlive,
		ModifiedAt: file.Modified,
		HashStatus: file.HashStatus,
		SHA256:     file.SHA256,
	}
	item.Explanation = append(item.Explanation, fmt.Sprintf("Observed persistence configuration in %s.", file.Scope))
	if item.Label != "" {
		item.Explanation = append(item.Explanation, "Launch label: "+item.Label)
	}
	if file.RunAtLoad {
		item.Explanation = append(item.Explanation, "RunAtLoad requests launch when the job is loaded.")
	}
	if strings.TrimSpace(file.KeepAlive) != "" {
		item.Explanation = append(item.Explanation, "KeepAlive configuration may request the job to remain or become active under matching conditions.")
	}
	if executable == "" {
		item.Limitations = append(item.Limitations, "no absolute executable target could be resolved from the plist")
		return item
	}
	if st, err := os.Stat(executable); err == nil && !st.IsDir() {
		item.TargetExists = true
	} else if err == nil && st.IsDir() {
		item.TargetExists = true
		item.Limitations = append(item.Limitations, "resolved target is a directory; executable identity requires deeper inspection")
	} else if os.IsNotExist(err) {
		item.Limitations = append(item.Limitations, "resolved executable target is not currently present")
	} else if err != nil {
		item.Limitations = append(item.Limitations, "target visibility is limited: "+err.Error())
	}
	if pids := processes[executable]; len(pids) > 0 {
		item.Running = true
		item.RunningPIDs = append([]int(nil), pids...)
		item.Explanation = append(item.Explanation, fmt.Sprintf("The exact executable path is currently observed in %d running process(es).", len(pids)))
	} else {
		item.Explanation = append(item.Explanation, "No current process row exactly matches the resolved executable path.")
		item.Limitations = append(item.Limitations, "process matching uses the exact executable path reported by the bounded process-table evidence")
	}
	return item
}

func BuildLaunchServiceExplorer(ctx context.Context) LaunchServiceExplorer {
	snapshot := capturePersistenceSnapshot()
	out := LaunchServiceExplorer{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		CapturedAt:  snapshot.CapturedAt,
		Note:        "Launch & Service Explorer explains visible LaunchAgent/LaunchDaemon configuration and correlates exact executable paths with the current process table. Presence or absence is evidence, not a malware verdict.",
	}

	processes := map[string][]int{}
	structured, err := RunStructuredSystemConsoleQuery(ctx, SystemConsoleQueryRequest{ToolID: "process-table"})
	if err != nil {
		out.Limitations = append(out.Limitations, "current process correlation unavailable: "+err.Error())
	} else if structured.Structured.Kind == "process_table" {
		processes = processPIDsByExecutable(structured.Structured.Processes)
		for _, limitation := range structured.Structured.Limitations {
			out.Limitations = appendUniqueString(out.Limitations, "process parser: "+limitation)
		}
	} else {
		out.Limitations = append(out.Limitations, "current process correlation did not produce structured process evidence")
	}

	for _, file := range snapshot.Files {
		item := launchServiceFromPersistence(file, processes)
		out.Items = append(out.Items, item)
		switch file.Scope {
		case "User LaunchAgent":
			out.UserAgents++
		case "System LaunchAgent":
			out.SystemAgents++
		case "System LaunchDaemon":
			out.SystemDaemons++
		}
		if item.Running {
			out.Running++
		}
		if item.Executable != "" && !item.TargetExists {
			out.MissingTarget++
		}
	}
	out.Total = len(out.Items)
	sort.SliceStable(out.Items, func(i, j int) bool {
		if out.Items[i].Running != out.Items[j].Running {
			return out.Items[i].Running
		}
		if out.Items[i].Scope != out.Items[j].Scope {
			return out.Items[i].Scope < out.Items[j].Scope
		}
		return firstNonEmpty(out.Items[i].Label, out.Items[i].PlistPath) < firstNonEmpty(out.Items[j].Label, out.Items[j].PlistPath)
	})
	if len(out.Items) > launchExplorerItemLimit {
		out.Items = append([]LaunchServiceItem(nil), out.Items[:launchExplorerItemLimit]...)
		out.Limitations = appendUniqueString(out.Limitations, fmt.Sprintf("display list is bounded to %d persistence items", launchExplorerItemLimit))
	}
	return out
}

func findLaunchServiceByPlist(ctx context.Context, rawPath string) (LaunchServiceItem, error) {
	path, err := normalizeSystemConsoleTarget("path", rawPath)
	if err != nil {
		return LaunchServiceItem{}, err
	}
	explorer := BuildLaunchServiceExplorer(ctx)
	for _, item := range explorer.Items {
		if item.PlistPath == path {
			return item, nil
		}
	}
	return LaunchServiceItem{}, fmt.Errorf("launch service not found in visible persistence locations")
}

func BuildLaunchServiceDetail(ctx context.Context, rawPath string) (LaunchServiceDetail, error) {
	item, err := findLaunchServiceByPlist(ctx, rawPath)
	if err != nil {
		return LaunchServiceDetail{}, err
	}
	out := LaunchServiceDetail{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Item:        item,
		Note:        "Detail inspection combines the persistence manifest with bounded object evidence. It does not change launch configuration.",
	}
	if plist, inspectErr := InspectSystemObject(ctx, item.PlistPath); inspectErr == nil {
		out.Plist = &plist
	}
	if item.Executable != "" {
		if target, inspectErr := InspectSystemObject(ctx, item.Executable); inspectErr == nil {
			out.Target = &target
		}
	}
	return out, nil
}

func (a *app) handleLaunchServices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, BuildLaunchServiceExplorer(r.Context()))
}

func (a *app) handleLaunchServiceDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return
	}
	var req LaunchServiceDetailRequest
	if err := decodeSystemConsoleJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request: " + err.Error()})
		return
	}
	out, err := BuildLaunchServiceDetail(r.Context(), req.PlistPath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}
