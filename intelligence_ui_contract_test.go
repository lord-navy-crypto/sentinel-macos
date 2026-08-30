// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestUnifiedIntelligenceUIContract(t *testing.T) {
	checks := map[string][]string{
		"web/intelligence-center.html": {
			"Evidence Graph 2.0",
			"Incident Intelligence 2.0",
			"Global Timeline",
			"Object Story 2.0",
			"Visibility & Permissions",
			"name=\"since\"",
			"name=\"until\"",
			"/intelligence-center.js",
			"/command-palette.js",
		},
		"web/intelligence-center.js": {
			"/api/intelligence/graph/v2",
			"/api/incidents/v2",
			"/api/intelligence/timeline/global",
			"/api/object/story/v2",
			"/api/visibility",
			"/api/actions/journal",
			"safe_action_journal",
			"unixFromLocal",
		},
		"web/command-palette.js": {
			"/api/search/command",
			"intelligenceCenterShortcut",
			"sentinel-open-command-palette",
			"Typed Sentinel navigation only",
		},
	}
	for path, needles := range checks {
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
	}
}

func TestUnifiedIntelligenceUINoDynamicCodeOrHTMLInjection(t *testing.T) {
	for _, path := range []string{"web/intelligence-center.js", "web/command-palette.js"} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		source := string(raw)
		for _, forbidden := range []string{"eval(", "new Function(", ".innerHTML", "document.write("} {
			if strings.Contains(source, forbidden) {
				t.Fatalf("%s contains forbidden dynamic-code/HTML pattern %q", path, forbidden)
			}
		}
	}
}
