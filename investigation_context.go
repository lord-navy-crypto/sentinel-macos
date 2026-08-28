// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	investigationRuntimeProcessLimit = 32
	investigationRuntimeNetworkLimit = 80
	investigationRuntimeRefLimit     = 80
)

type InvestigationRuntimeProcess struct {
	PID       int               `json:"pid"`
	PPID      int               `json:"ppid"`
	User      string            `json:"user"`
	Command   string            `json:"command"`
	Target    string            `json:"target"`
	Match     string            `json:"match"`
	CPU       float64           `json:"cpu"`
	Memory    float64           `json:"memory"`
	Ancestors []ProcessAncestor `json:"ancestors,omitempty"`
	Network   []NetworkItem     `json:"network,omitempty"`
}

type InvestigationPersistenceRef struct {
	Name       string `json:"name"`
	Scope      string `json:"scope"`
	PlistPath  string `json:"plist_path"`
	Executable string `json:"executable,omitempty"`
	Match      string `json:"match"`
}

type InvestigationBackgroundRef struct {
	Name       string `json:"name,omitempty"`
	Identifier string `json:"identifier,omitempty"`
	Executable string `json:"executable,omitempty"`
	URL        string `json:"url,omitempty"`
	Match      string `json:"match"`
}

type InvestigationRuntimeContext struct {
	GeneratedAt string                         `json:"generated_at"`
	Path        string                         `json:"path"`
	BundlePath  string                         `json:"bundle_path,omitempty"`
	Processes   []InvestigationRuntimeProcess  `json:"processes,omitempty"`
	Persistence []InvestigationPersistenceRef  `json:"persistence,omitempty"`
	Background  []InvestigationBackgroundRef   `json:"background,omitempty"`
	NextTargets []InvestigationNextTarget      `json:"next_targets,omitempty"`
	Limitations []string                       `json:"limitations,omitempty"`
	Meaning     string                         `json:"meaning"`
}

func investigationPathMatch(root, candidate string) (bool, string) {
	root = normalizeEvidencePath(root)
	candidate = normalizeEvidencePath(candidate)
	if root == "" || candidate == "" {
		return false, ""
	}
	if root == candidate {
		return true, "exact_path"
	}
	rootBundle := root
	if !strings.EqualFold(filepath.Ext(rootBundle), ".app") {
		rootBundle = enclosingAppBundle(root)
	}
	candidateBundle := enclosingAppBundle(candidate)
	if rootBundle != "" && candidateBundle == rootBundle {
		return true, "same_app_bundle"
	}
	return false, ""
}

func appendInvestigationNextTarget(targets []InvestigationNextTarget, path, kind, why string) []InvestigationNextTarget {
	path = normalizeEvidencePath(path)
	if path == "" || !filepath.IsAbs(path) {
		return targets
	}
	for _, existing := range targets {
		if existing.Path == path && existing.Kind == kind {
			return targets
		}
	}
	return append(targets, InvestigationNextTarget{Path: path, Kind: kind, Why: why})
}

func BuildInvestigationRuntimeContext(rawPath string) InvestigationRuntimeContext {
	path := normalizeEvidencePath(rawPath)
	out := InvestigationRuntimeContext{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Path:        path,
		Meaning:     "Runtime context correlates current local observations with the selected object. A process, connection, startup reference, or background registration is context for investigation, not proof of malicious intent.",
	}
	if path == "" || !filepath.IsAbs(path) {
		out.Limitations = append(out.Limitations, "an absolute path is required")
		return out
	}
	if strings.EqualFold(filepath.Ext(path), ".app") {
		out.BundlePath = path
	} else {
		out.BundlePath = enclosingAppBundle(path)
	}

	networkByPID := map[int][]NetworkItem{}
	if network, err := collectNetwork(); err == nil {
		for _, item := range network {
			if len(networkByPID[item.PID]) >= investigationRuntimeNetworkLimit {
				continue
			}
			networkByPID[item.PID] = append(networkByPID[item.PID], item)
		}
	} else {
		out.Limitations = append(out.Limitations, "network correlation unavailable: "+err.Error())
	}

	for _, process := range parsePS(100000) {
		target, _ := processAuditPath(process)
		matched, matchKind := investigationPathMatch(path, target)
		if !matched {
			continue
		}
		if len(out.Processes) >= investigationRuntimeProcessLimit {
			out.Limitations = appendUniqueString(out.Limitations, fmt.Sprintf("running-process correlation is bounded to %d matches", investigationRuntimeProcessLimit))
			break
		}
		item := InvestigationRuntimeProcess{
			PID: process.PID, PPID: process.PPID, User: process.User, Command: process.Command,
			Target: target, Match: matchKind, CPU: process.CPU, Memory: process.Memory,
			Ancestors: processParentChain(process.PID, 8),
			Network:   append([]NetworkItem(nil), networkByPID[process.PID]...),
		}
		out.Processes = append(out.Processes, item)
		if target != path {
			out.NextTargets = appendInvestigationNextTarget(out.NextTargets, target, "running_executable", fmt.Sprintf("PID %d is currently running this executable inside the selected object.", process.PID))
		}
		for _, ancestor := range item.Ancestors {
			if ancestor.Target != "" && ancestor.Target != path && ancestor.Target != target {
				out.NextTargets = appendInvestigationNextTarget(out.NextTargets, ancestor.Target, "parent_process_executable", fmt.Sprintf("PID %d is in the parent chain of PID %d.", ancestor.PID, process.PID))
			}
		}
	}
	sort.SliceStable(out.Processes, func(i, j int) bool { return out.Processes[i].PID < out.Processes[j].PID })

	for _, startup := range collectStartupItems() {
		matched, matchKind := investigationPathMatch(path, startup.Executable)
		if !matched {
			continue
		}
		if len(out.Persistence) >= investigationRuntimeRefLimit {
			out.Limitations = appendUniqueString(out.Limitations, fmt.Sprintf("persistence correlation is bounded to %d references", investigationRuntimeRefLimit))
			break
		}
		out.Persistence = append(out.Persistence, InvestigationPersistenceRef{
			Name: startup.Name, Scope: startup.Scope, PlistPath: startup.Path,
			Executable: normalizeEvidencePath(startup.Executable), Match: matchKind,
		})
		out.NextTargets = appendInvestigationNextTarget(out.NextTargets, startup.Path, "persistence_configuration", "This LaunchAgent/LaunchDaemon references the selected object or an executable inside its app bundle.")
		if executable := normalizeEvidencePath(startup.Executable); executable != "" && executable != path {
			out.NextTargets = appendInvestigationNextTarget(out.NextTargets, executable, "persistence_executable", "This executable is referenced by visible startup configuration.")
		}
	}

	background := collectBackgroundItems()
	if !background.Available {
		out.Limitations = appendUniqueString(out.Limitations, background.Note)
	} else {
		for _, item := range background.Items {
			matched, matchKind := investigationPathMatch(path, item.Executable)
			if !matched {
				continue
			}
			if len(out.Background) >= investigationRuntimeRefLimit {
				out.Limitations = appendUniqueString(out.Limitations, fmt.Sprintf("background-item correlation is bounded to %d references", investigationRuntimeRefLimit))
				break
			}
			out.Background = append(out.Background, InvestigationBackgroundRef{
				Name: item.Name, Identifier: item.Identifier, Executable: normalizeEvidencePath(item.Executable), URL: item.URL, Match: matchKind,
			})
			if executable := normalizeEvidencePath(item.Executable); executable != "" && executable != path {
				out.NextTargets = appendInvestigationNextTarget(out.NextTargets, executable, "background_executable", "A visible macOS Background Task Management item references this executable.")
			}
		}
	}
	if len(out.NextTargets) > investigationRuntimeRefLimit {
		out.NextTargets = append([]InvestigationNextTarget(nil), out.NextTargets[:investigationRuntimeRefLimit]...)
		out.Limitations = appendUniqueString(out.Limitations, fmt.Sprintf("runtime continuation targets are bounded to %d", investigationRuntimeRefLimit))
	}
	return out
}

func (a *app) handleInvestigationRuntimeContext(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, BuildInvestigationRuntimeContext(r.URL.Query().Get("path")))
}
