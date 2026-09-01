// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func requireProcessRelationSourceContains(t *testing.T, path string, needles ...string) string {
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

func TestProcessRelationshipExplorerCombinesExistingBoundedEvidence(t *testing.T) {
	requireProcessRelationSourceContains(t, "web/process-relations.html", `Process Relationship Explorer`, `Parent & Child Processes`, `Open Objects & TCP`, `Why can this executable start?`, `Object Story`, `/process-relations.js`)
	requireProcessRelationSourceContains(t, "web/process-relations.js", `/api/process/detail?pid=`, `/api/object/story?pid=`, `process-table`, `process-open-files`, `/api/security/context?path=`, `Continue Investigation on Executable`, `Inspect PID`, `Child-process correlation is a current bounded process-table snapshot`)
}

func TestProcessRelationshipExplorerIsLinkedFromSystemConsole(t *testing.T) {
	requireProcessRelationSourceContains(t, "web/system-console.html", `processRelationsRecipe`, `How is this process connected?`, `/process-relations.html`)
	requireProcessRelationSourceContains(t, "web/system-console-links.js", `processRelationsRecipe`, `/process-relations.html#token=`)
}

func TestInvestigationRuntimeLinksToProcessRelationshipExplorer(t *testing.T) {
	requireProcessRelationSourceContains(t, "web/investigation.html", `/process-relations-bridge.js`)
	requireProcessRelationSourceContains(t, "web/process-relations-bridge.js", `runtimeContextPanel`, `Open Process Explorer`, `/process-relations.html#`, `MutationObserver`)
}

func TestProcessRelationshipExplorerAvoidsDynamicCodeAndShellSurface(t *testing.T) {
	for _, path := range []string{"web/process-relations.js", "web/process-relations-bridge.js"} {
		source := requireProcessRelationSourceContains(t, path)
		for _, forbidden := range []string{"eval(", "new Function(", "document.write(", "innerHTML", "sudo", "exec("} {
			if strings.Contains(source, forbidden) {
				t.Fatalf("%s contains forbidden pattern %q", path, forbidden)
			}
		}
	}
}

func TestProcessRelationshipExplorerJavaScriptIsInCI(t *testing.T) {
	requireProcessRelationSourceContains(t, ".github/workflows/ci.yml", `node --check web/process-relations.js`, `node --check web/process-relations-bridge.js`)
}
