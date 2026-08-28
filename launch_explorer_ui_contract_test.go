// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func launchExplorerSource(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(raw)
}

func requireLaunchExplorerStrings(t *testing.T, path string, needles ...string) string {
	t.Helper()
	source := launchExplorerSource(t, path)
	for _, needle := range needles {
		if !strings.Contains(source, needle) {
			t.Fatalf("%s missing %q", path, needle)
		}
	}
	return source
}

func TestLaunchExplorerWorkspaceIsWired(t *testing.T) {
	requireLaunchExplorerStrings(t, "main.go",
		`/api/launch-services`,
		`/api/launch-services/detail`,
	)
	requireLaunchExplorerStrings(t, "web/launch-services.html",
		`Launch & Service Explorer`,
		`Why does this start automatically?`,
		`Visible services`,
		`serviceSearch`,
		`runtimeFilter`,
		`/launch-services.js`,
	)
	requireLaunchExplorerStrings(t, "web/launch-services.js",
		`X-Sentinel-Token`,
		`/api/launch-services`,
		`/api/launch-services/detail`,
		`Explain launch`,
		`Investigate plist`,
		`Investigate executable`,
		`Continue from plist`,
		`Continue from executable`,
		`/investigation.html#`,
	)
}

func TestSystemConsoleLinksToLaunchExplorerWithSessionToken(t *testing.T) {
	requireLaunchExplorerStrings(t, "web/system-console.html",
		`launchServicesRecipe`,
		`Why does this start automatically?`,
		`/system-console-links.js`,
	)
	requireLaunchExplorerStrings(t, "web/system-console-links.js",
		`launchServicesRecipe`,
		`/launch-services.html#token=`,
	)
}

func TestLaunchExplorerUIAvoidsDynamicCodeExecution(t *testing.T) {
	for _, path := range []string{"web/launch-services.js", "web/system-console-links.js"} {
		source := launchExplorerSource(t, path)
		for _, forbidden := range []string{"eval(", "new Function(", "document.write(", ".innerHTML"} {
			if strings.Contains(source, forbidden) {
				t.Fatalf("%s contains forbidden dynamic-code/HTML pattern %q", path, forbidden)
			}
		}
	}
}

func TestLaunchExplorerBackendRemainsReadOnly(t *testing.T) {
	source := requireLaunchExplorerStrings(t, "launch_explorer.go",
		`capturePersistenceSnapshot()`,
		`RunStructuredSystemConsoleQuery`,
		`process-table`,
		`InspectSystemObject`,
		`Presence or absence is evidence, not a malware verdict.`,
	)
	for _, forbidden := range []string{"os.Remove(", "os.RemoveAll(", "os.Rename(", "exec.Command("} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("Launch Explorer unexpectedly contains mutation/command pattern %q", forbidden)
		}
	}
}
