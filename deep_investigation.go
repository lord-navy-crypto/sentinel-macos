// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	deepInvestigationWalkLimit    = 3000
	deepInvestigationCandidateMax = 120
	deepInvestigationInspectMax   = 4
	deepInvestigationDepthMax     = 8
)

type ContinueInvestigationRequest struct {
	Path     string `json:"path"`
	ParentID string `json:"parent_id,omitempty"`
}

type InvestigationCandidate struct {
	ID             string               `json:"id"`
	Path           string               `json:"path"`
	Kind           string               `json:"kind"`
	Size           int64                `json:"size,omitempty"`
	ModifiedAt     string               `json:"modified_at,omitempty"`
	ReviewPriority int                  `json:"review_priority"`
	Signals        []string             `json:"signals,omitempty"`
	Inspection     *IntegrityInspection `json:"inspection,omitempty"`
	CanContinue    bool                 `json:"can_continue"`
}

type InvestigationNextTarget struct {
	Path string `json:"path"`
	Kind string `json:"kind"`
	Why  string `json:"why"`
}

type ContinueInvestigationReport struct {
	ID             string                    `json:"id"`
	ParentID       string                    `json:"parent_id,omitempty"`
	GeneratedAt    string                    `json:"generated_at"`
	Path           string                    `json:"path"`
	Kind           string                    `json:"kind"`
	FilesVisited   int                       `json:"files_visited"`
	DirsVisited    int                       `json:"dirs_visited"`
	CandidatesSeen int                       `json:"candidates_seen"`
	Truncated      bool                      `json:"truncated"`
	RootInspection IntegrityInspection       `json:"root_inspection"`
	Candidates     []InvestigationCandidate  `json:"candidates"`
	NextTargets    []InvestigationNextTarget `json:"next_targets,omitempty"`
	Limitations    []string                  `json:"limitations,omitempty"`
	Meaning        string                    `json:"meaning"`
}

func investigationBundleKind(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".app":
		return "application_bundle"
	case ".xpc":
		return "xpc_bundle"
	case ".appex":
		return "app_extension"
	case ".framework":
		return "framework"
	case ".plugin":
		return "plugin_bundle"
	default:
		return "directory"
	}
}

func investigationFileKind(path string, mode fs.FileMode) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".plist":
		return "property_list"
	case ".dylib", ".so":
		return "dynamic_library"
	case ".pkg", ".dmg":
		return "installer_or_image"
	case ".command", ".sh", ".zsh", ".bash", ".py", ".js", ".scpt":
		return "script"
	}
	if mode&0111 != 0 {
		return "executable"
	}
	return "file"
}

func investigationCandidateHint(path string, d fs.DirEntry) (InvestigationCandidate, bool) {
	info, err := d.Info()
	if err != nil {
		return InvestigationCandidate{}, false
	}
	candidate := InvestigationCandidate{
		ID:          entityID("investigation-candidate", path),
		Path:        path,
		Size:        info.Size(),
		ModifiedAt:  info.ModTime().UTC().Format(time.RFC3339),
		CanContinue: true,
	}
	if d.IsDir() {
		candidate.Kind = investigationBundleKind(path)
		if candidate.Kind == "directory" {
			return InvestigationCandidate{}, false
		}
		candidate.ReviewPriority = 20
		candidate.Signals = append(candidate.Signals, "Code-bearing bundle can be inspected as its own investigation branch")
		return candidate, true
	}
	if !info.Mode().IsRegular() {
		return InvestigationCandidate{}, false
	}
	candidate.Kind = investigationFileKind(path, info.Mode())
	if candidate.Kind == "file" {
		return InvestigationCandidate{}, false
	}
	priority, signals := scorePath(path)
	candidate.ReviewPriority = priority
	candidate.Signals = append(candidate.Signals, signals...)
	if info.Mode()&0111 != 0 && candidate.ReviewPriority < 20 {
		candidate.ReviewPriority = 20
		candidate.Signals = append(candidate.Signals, "Executable permission is set")
	}
	switch candidate.Kind {
	case "dynamic_library":
		candidate.ReviewPriority += 10
		candidate.Signals = append(candidate.Signals, "Dynamic library participates in executable code loading")
	case "property_list":
		candidate.ReviewPriority += 5
		candidate.Signals = append(candidate.Signals, "Property list may describe launch or application configuration")
	case "script":
		candidate.ReviewPriority += 5
		candidate.Signals = append(candidate.Signals, "Script is executable or interpreted code")
	}
	if candidate.ReviewPriority > 100 {
		candidate.ReviewPriority = 100
	}
	candidate.Signals = uniqueStrings(candidate.Signals)
	return candidate, true
}

func applyIntegrityPriority(candidate *InvestigationCandidate) {
	if candidate == nil || candidate.Inspection == nil {
		return
	}
	inspection := candidate.Inspection
	verification := strings.ToLower(inspection.Identity.Verification)
	gatekeeper := strings.ToLower(inspection.Identity.Gatekeeper)
	if strings.Contains(verification, "failed") {
		candidate.ReviewPriority += 20
		candidate.Signals = append(candidate.Signals, "Code signature is present but verification failed")
	} else if strings.Contains(verification, "unsigned") || strings.Contains(verification, "unverifiable") {
		candidate.ReviewPriority += 10
		candidate.Signals = append(candidate.Signals, "Code identity is unsigned or unverifiable")
	}
	if strings.Contains(gatekeeper, "rejected") || strings.Contains(gatekeeper, "not accepted") {
		candidate.ReviewPriority += 15
		candidate.Signals = append(candidate.Signals, "Gatekeeper did not accept the inspected code")
	}
	if inspection.Quarantine != "" {
		candidate.Signals = append(candidate.Signals, "macOS quarantine provenance is present")
	}
	if candidate.ReviewPriority > 100 {
		candidate.ReviewPriority = 100
	}
	candidate.Signals = uniqueStrings(candidate.Signals)
}

func deepInvestigationWalk(ctx context.Context, root string, rootIsBundle bool) (candidates []InvestigationCandidate, files, dirs int, truncated bool, limitations []string) {
	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if ctx.Err() != nil {
			truncated = true
			return fs.SkipAll
		}
		if err != nil {
			limitations = appendUniqueString(limitations, "some paths could not be read during bounded traversal")
			return nil
		}
		if path == root {
			if d.IsDir() {
				dirs++
			}
			return nil
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr == nil && len(strings.Split(rel, string(filepath.Separator))) > deepInvestigationDepthMax {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			dirs++
		} else {
			files++
		}
		if files+dirs >= deepInvestigationWalkLimit {
			truncated = true
			return fs.SkipAll
		}
		candidate, ok := investigationCandidateHint(path, d)
		if ok && len(candidates) < deepInvestigationCandidateMax {
			candidates = append(candidates, candidate)
		} else if ok {
			truncated = true
		}
		// When scanning a broad parent directory, treat nested bundles as
		// continuation targets instead of exploding every app bundle immediately.
		// When the selected root itself is a bundle, descend so Sentinel can expose
		// the actual internal executables/libraries the user asked to investigate.
		if d.IsDir() && path != root && investigationBundleKind(path) != "directory" && !rootIsBundle {
			return fs.SkipDir
		}
		return nil
	})
	if walkErr != nil && ctx.Err() == nil {
		limitations = appendUniqueString(limitations, "bounded traversal ended early: "+walkErr.Error())
	}
	return candidates, files, dirs, truncated, limitations
}

func continueInvestigation(ctx context.Context, rawPath, parentID string) ContinueInvestigationReport {
	path := normalizeEvidencePath(rawPath)
	report := ContinueInvestigationReport{
		ParentID:    strings.TrimSpace(parentID),
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Path:        path,
		Meaning:     "Review Priority ranks which local evidence deserves inspection first. It is not a malware probability or proof of malicious intent. Continue Investigation is read-only and bounded.",
	}
	report.ID = entityID("investigation-branch", report.ParentID+"|"+path+"|"+report.GeneratedAt)
	if path == "" || !filepath.IsAbs(path) {
		report.Limitations = append(report.Limitations, "choose an absolute path or a ~/ path to investigate")
		return report
	}
	st, err := os.Lstat(path)
	if err != nil {
		report.Limitations = append(report.Limitations, "path could not be read: "+err.Error())
		return report
	}
	report.RootInspection = inspectIntegrity(path)
	if st.IsDir() {
		report.Kind = investigationBundleKind(path)
		rootIsBundle := report.Kind != "directory"
		candidates, files, dirs, truncated, limitations := deepInvestigationWalk(ctx, path, rootIsBundle)
		report.FilesVisited, report.DirsVisited, report.Truncated = files, dirs, truncated
		report.Limitations = append(report.Limitations, limitations...)
		report.CandidatesSeen = len(candidates)
		sort.SliceStable(candidates, func(i, j int) bool {
			if candidates[i].ReviewPriority != candidates[j].ReviewPriority {
				return candidates[i].ReviewPriority > candidates[j].ReviewPriority
			}
			return candidates[i].Path < candidates[j].Path
		})
		inspectCount := 0
		for i := range candidates {
			if inspectCount < deepInvestigationInspectMax {
				// Auto-inspection is intentionally small; the rest remain explicit
				// continuation targets so one click cannot hash an entire disk tree.
				inspection := inspectIntegrity(candidates[i].Path)
				candidates[i].Inspection = &inspection
				applyIntegrityPriority(&candidates[i])
				inspectCount++
			}
			report.NextTargets = append(report.NextTargets, InvestigationNextTarget{
				Path: candidates[i].Path,
				Kind: candidates[i].Kind,
				Why:  "Continue from this code/configuration object for a focused integrity and relationship investigation.",
			})
		}
		sort.SliceStable(candidates, func(i, j int) bool {
			if candidates[i].ReviewPriority != candidates[j].ReviewPriority {
				return candidates[i].ReviewPriority > candidates[j].ReviewPriority
			}
			return candidates[i].Path < candidates[j].Path
		})
		if len(candidates) > 40 {
			report.Candidates = append([]InvestigationCandidate(nil), candidates[:40]...)
			report.Truncated = true
			report.Limitations = appendUniqueString(report.Limitations, "visible candidate list is bounded to the top 40 review targets")
		} else {
			report.Candidates = candidates
		}
		if len(report.NextTargets) > 60 {
			report.NextTargets = report.NextTargets[:60]
		}
		return report
	}

	report.Kind = investigationFileKind(path, st.Mode())
	report.FilesVisited = 1
	priority, signals := scorePath(path)
	candidate := InvestigationCandidate{
		ID:             entityID("investigation-candidate", path),
		Path:           path,
		Kind:           report.Kind,
		Size:           st.Size(),
		ModifiedAt:     st.ModTime().UTC().Format(time.RFC3339),
		ReviewPriority: priority,
		Signals:        append([]string(nil), signals...),
		Inspection:     &report.RootInspection,
		CanContinue:    true,
	}
	applyIntegrityPriority(&candidate)
	report.CandidatesSeen = 1
	report.Candidates = []InvestigationCandidate{candidate}

	if strings.EqualFold(filepath.Ext(path), ".plist") {
		if executable := normalizedExecutablePath(extractPlistExecutable(path)); executable != "" {
			report.NextTargets = append(report.NextTargets, InvestigationNextTarget{
				Path: executable,
				Kind: "configured_executable",
				Why:  "This plist resolves to an executable target; continue there to inspect the code object rather than stopping at configuration evidence.",
			})
		}
	}
	if bundle := report.RootInspection.Identity.BundlePath; bundle != "" && bundle != path {
		report.NextTargets = append(report.NextTargets, InvestigationNextTarget{
			Path: bundle,
			Kind: "application_bundle",
			Why:  "This file belongs to an application bundle; continue at the bundle to inspect related internal code objects.",
		})
	}
	return report
}

func (a *app) handleContinueInvestigation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return
	}
	var req ContinueInvestigationRequest
	if err := decodeSystemConsoleJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request: " + err.Error()})
		return
	}
	if len(req.Path) > 4096 || len(req.ParentID) > 256 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "request field too long"})
		return
	}
	out := continueInvestigation(r.Context(), req.Path, req.ParentID)
	if out.Path == "" || len(out.Limitations) > 0 && !out.RootInspection.Exists {
		writeJSON(w, http.StatusBadRequest, out)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

var _ = fmt.Sprintf
