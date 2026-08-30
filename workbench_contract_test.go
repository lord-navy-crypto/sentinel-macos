// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestInvestigationWorkbenchLoadsBeforeRuntime(t *testing.T) {
	raw, err := os.ReadFile("web/index.html")
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, want := range []string{"/app/workbench.css", "/app/workbench.js", "/app/runtime.js"} {
		if !strings.Contains(s, want) {
			t.Fatalf("canonical product missing %q", want)
		}
	}
	if strings.Index(s, "/app/workbench.js") > strings.Index(s, "/app/runtime.js") {
		t.Fatal("workbench must enhance and register lenses before runtime bootstrap")
	}
}

func TestInvestigationWorkbenchProtectsThirtyImprovements(t *testing.T) {
	raw, err := os.ReadFile("web/app/workbench.js")
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	wants := []string{
		"Interactive Evidence Graph 3.0", "Process Story 2.0", "Unified Investigation Workspace", "Timeline 3.0",
		"Network Intelligence 2.0", "Launch & Persistence Drift", "System Checkpoint 2.0", "Storage Intelligence 2.0",
		"Case Stories 3.0", "Object Story 3.0", "Permission & Visibility Assistant", "Evidence Completeness Meter",
		"Explain This", "Smart Next Step", "Cross-Lens Selection", "Compare Any Two Objects", "Reference Profiles 2.0",
		"Safe Change Simulation", "Recovery Center 2.0", "Evidence Bundle", "Local Evidence Assistant",
		"Natural-language Command Bar", "Saved Queries", "Watch Rules", "Visual Relationship Matrix", "Change Evidence Flow",
		"Historical Heatmaps", "Workspace Persistence", "Keyboard Workflow", "Product Onboarding",
	}
	for _, want := range wants {
		if !strings.Contains(s, want) {
			t.Fatalf("workbench missing improvement %q", want)
		}
	}
}

func TestInvestigationWorkbenchUsesExistingEvidenceAndSafetyBoundaries(t *testing.T) {
	raw, err := os.ReadFile("web/app/workbench.js")
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, want := range []string{
		"/api/intelligence/graph/v2", "/api/intelligence/timeline/global", "/api/process/detail", "/api/network/history",
		"/api/launch-services", "system-snapshots", "storage-history", "/api/incidents/v2?history=1", "/api/object/story/v2",
		"/api/visibility", "/api/trust/history", "/api/trust/restore", "/api/actions/preview", "/api/actions/health",
		"Simulation stops at preview", "not a malware verdict", "does not infer intent", "No cloud model is used",
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("workbench missing evidence/safety contract %q", want)
		}
	}
	for _, forbidden := range []string{"/api/actions/delete", "permanent delete", "malware probability ="} {
		if strings.Contains(strings.ToLower(s), strings.ToLower(forbidden)) {
			t.Fatalf("workbench contains forbidden unsafe contract %q", forbidden)
		}
	}
}

func TestWorkbenchVisualLayerIncludesMatrixHeatmapAndFlow(t *testing.T) {
	raw, err := os.ReadFile("web/app/workbench.css")
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, want := range []string{".wb-matrix", ".wb-heatmap", ".wb-flow", ".wb-completeness", ".wb-onboarding", ".wb-related"} {
		if !strings.Contains(s, want) {
			t.Fatalf("workbench visual layer missing %q", want)
		}
	}
}
