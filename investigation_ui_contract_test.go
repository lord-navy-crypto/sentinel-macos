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

func TestContinueInvestigationRoutesAndBridgeAreWired(t *testing.T) {
	requireInvestigationSourceContains(t, "main.go",
		`/api/security/investigate`,
		`continue-investigation`,
		`/api/launch-services`,
		`/api/launch-services/detail`,
		`/investigation-bridge.js`,
	)
	requireInvestigationSourceContains(t, "web/investigation-bridge.js",
		`/api/security/audit`,
		`Continue Investigation`,
		`/investigation.html#`,
		`startingPath`,
	)
}

func TestContinueInvestigationWorkspaceSupportsBranchingAndCorrelation(t *testing.T) {
	requireInvestigationSourceContains(t, "web/investigation.html",
		`Continue Investigation`,
		`A report is a node, not the end.`,
		`Previous branch`,
		`Object Story`,
		`Review candidates`,
		`Continue from related objects`,
		`/investigation.js`,
	)
	requireInvestigationSourceContains(t, "web/investigation.js",
		`/api/security/investigate`,
		`parent_id`,
		`/api/object/story?path=`,
		`history.splice`,
		`Continue from here`,
		`Review Priority only orders local evidence`,
	)
}

func TestContinueInvestigationWebSurfaceAvoidsDynamicCodeExecution(t *testing.T) {
	for _, path := range []string{"web/investigation.js", "web/investigation-bridge.js"} {
		source := requireInvestigationSourceContains(t, path, `X-Sentinel-Token`)
		for _, forbidden := range []string{"eval(", "new Function(", "document.write("} {
			if strings.Contains(source, forbidden) {
				t.Fatalf("%s contains forbidden dynamic-code pattern %q", path, forbidden)
			}
		}
	}
}

func TestDeepInvestigationRemainsReadOnlyAndBounded(t *testing.T) {
	source := requireInvestigationSourceContains(t, "deep_investigation.go",
		`deepInvestigationWalkLimit`,
		`deepInvestigationCandidateMax`,
		`deepInvestigationInspectMax`,
		`deepInvestigationDepthMax`,
		`Continue Investigation is read-only and bounded`,
	)
	for _, forbidden := range []string{"os.Remove(", "os.RemoveAll(", "os.Rename(", "exec.Command("} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("deep investigation unexpectedly contains mutation/command pattern %q", forbidden)
		}
	}
}
