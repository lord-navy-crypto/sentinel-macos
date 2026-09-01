// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func requireInvestigationSourceContains(t *testing.T, path string, needles ...string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	source := string(raw)
	for _, needle := range needles {
		if !strings.Contains(source, needle) {
			t.Fatalf("%s missing %q", path, needle)
		}
	}
	return source
}
func TestContinueInvestigationRoutesAndProductEntryAreWired(t *testing.T) {
	mainSource := requireInvestigationSourceContains(t, "main.go", `/api/security/investigate`, `continue-investigation`, `/api/security/context`, `investigation-runtime-context`, `/api/launch-services`, `/api/launch-services/detail`)
	if strings.Contains(mainSource, `/investigation-bridge.js`) {
		t.Fatal("server injects retired bridge")
	}
	requireInvestigationSourceContains(t, "web/app/core.js", `Which observations belong together?`, `How are the objects connected?`)
	requireInvestigationSourceContains(t, "web/app/lenses/orient-investigate.js", `/api/incidents`, `/api/intelligence/graph`, `/api/intelligence/timeline`, `/api/object/story`)
	requireInvestigationSourceContains(t, "deep_investigation.go", `mode`, `sessions`, `handleInvestigationSessions`)
}
func TestHistoricalContinueInvestigationWorkspaceSupportsBranchingAndCorrelation(t *testing.T) {
	requireInvestigationSourceContains(t, "web/investigation.html", `Continue Investigation`, `A report is a node, not the end.`, `Previous branch`, `Object Story`, `Runtime & Persistence Context`, `Review candidates`, `Continue from related objects`, `Investigation Sessions`, `Save Session`, `Bookmark Current Branch`)
	source := requireInvestigationSourceContains(t, "web/investigation.js", `X-Sentinel-Token`, `/api/security/investigate`, `mode=sessions`, `parent_id`, `/api/object/story?path=`, `/api/security/context?path=`, `renderRuntimeContext`, `branchHistory.splice`, `window.history.replaceState`, `saveCurrentBranch`, `Resume Session`)
	if strings.Contains(source, `const history = []`) {
		t.Fatal("workspace shadows window.history")
	}
}
func TestContinueInvestigationWebSurfaceAvoidsDynamicCodeExecution(t *testing.T) {
	paths := append([]string{}, canonicalProductScripts...)
	paths = append(paths, "web/investigation.js")
	for _, path := range paths {
		source := requireInvestigationSourceContains(t, path)
		for _, forbidden := range []string{"eval(", "new Function(", "document.write("} {
			if strings.Contains(source, forbidden) {
				t.Fatalf("%s contains %q", path, forbidden)
			}
		}
	}
}
func TestDeepInvestigationRemainsReadOnlyAndBounded(t *testing.T) {
	source := requireInvestigationSourceContains(t, "deep_investigation.go", `deepInvestigationWalkLimit`, `deepInvestigationCandidateMax`, `deepInvestigationInspectMax`, `deepInvestigationDepthMax`, `Continue Investigation is read-only and bounded`)
	for _, forbidden := range []string{"os.Remove(", "os.RemoveAll(", "os.Rename(", "exec.Command("} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("deep investigation contains mutation %q", forbidden)
		}
	}
}
func TestInvestigationRuntimeContextRemainsCorrelationOnly(t *testing.T) {
	source := requireInvestigationSourceContains(t, "investigation_context.go", `collectNetwork()`, `parsePS(100000)`, `collectStartupItems()`, `processParentChain`, `process-open-files`, `RunStructuredSystemConsoleQuery`, `investigationOpenFileProcessQueryLimit`, `not proof of malicious intent`)
	for _, forbidden := range []string{"os.Remove(", "os.RemoveAll(", "os.Rename("} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("context contains mutation %q", forbidden)
		}
	}
}
func TestInvestigationSessionsRemainBoundedAndMetadataOnly(t *testing.T) {
	source := requireInvestigationSourceContains(t, "investigation_sessions.go", `investigationSessionLimit`, `investigationSessionBranchLimit`, `--ephemeral`, `paths, branch metadata, bookmarks, and user notes only`)
	for _, forbidden := range []string{"os.ReadFile(", "os.WriteFile(", "exec.Command(", "os.Remove("} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("session metadata contains %q", forbidden)
		}
	}
}
func TestSystemConsoleRendersStructuredOpenFileEvidence(t *testing.T) {
	requireInvestigationSourceContains(t, "web/system-console.js", `structured.open_files`, `Process open files & objects`, `Name / path`)
}
