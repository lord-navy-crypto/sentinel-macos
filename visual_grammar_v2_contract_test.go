// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func readVisualGrammarAsset(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestVisualGrammarV2SharedSystem(t *testing.T) {
	nav := readVisualGrammarAsset(t, "web/v23-navigation.css")
	grammar := readVisualGrammarAsset(t, "web/v23-visual-system.css")
	quant := readVisualGrammarAsset(t, "web/v23-quantitative-viz.css")

	for _, want := range []string{"/v23-visual-system.css", "/v23-quantitative-viz.css"} {
		if !strings.Contains(nav, want) {
			t.Fatalf("navigation must load shared visual grammar asset %q", want)
		}
	}
	for _, want := range []string{
		".situation-board", ".status-ledger", ".timeline", ".compare-axis",
		".relationship-lane", ".coverage-matrix", ".pipeline", ".scan-flow",
		"[data-viz=\"timeline\"]", "prefers-reduced-motion:reduce",
	} {
		if !strings.Contains(grammar, want) {
			t.Fatalf("Visual Grammar v2 missing %q", want)
		}
	}
	for _, want := range []string{".quant-bar", ".quant-bar-fill", ".growth", ".reduction", ".age"} {
		if !strings.Contains(quant, want) {
			t.Fatalf("quantitative visual grammar missing %q", want)
		}
	}

	// Shared presentation must not hide product functionality or block interaction.
	for _, bad := range []string{"display:none", "visibility:hidden", "pointer-events:none", "javascript:"} {
		if strings.Contains(strings.ToLower(grammar), bad) || strings.Contains(strings.ToLower(quant), bad) {
			t.Fatalf("visual grammar must not hide/disable functionality through %q", bad)
		}
	}
	// Pseudo-elements in the grammar may draw geometry, but must not inject explanatory copy.
	nonEmptyContent := regexp.MustCompile(`content\s*:\s*["'][^"']+`)
	if nonEmptyContent.MatchString(grammar) {
		t.Fatal("shared Visual Grammar v2 must not inject visible explanatory text from CSS")
	}
}

func TestVisualGrammarV2PageMappings(t *testing.T) {
	checks := map[string][]string{
		"web/easy.html": {
			`class="situation-board"`, `id="situationBoardTitle"`, `class="easy-group easy-index"`,
		},
		"web/compare-center.html": {
			`class="compare-workspace"`, `class="compare-axis"`, "Evidence A", "Typed change", "Evidence B",
		},
		"web/scan-center.html": {
			`class="scan-flow"`, "Acquire", "Inspect", "Correlate", "Continue", `data-viz="pipeline"`,
		},
		"web/intelligence-center.html": {
			`data-viz="relations"`, `data-viz="incidents"`, `data-viz="timeline"`, `data-viz="object"`, `data-viz="visibility"`,
		},
		"web/system-center.html": {
			`data-viz="diff"`, `data-viz="evidence"`,
		},
		"web/process-relations.html": {
			`data-viz="relations"`, `data-viz="object"`, `data-viz="visibility"`,
		},
		"web/network-relations.html": {
			`data-viz="relations"`, `data-viz="diff"`, `data-viz="visibility"`,
		},
		"web/launch-services.html": {
			`data-viz="relations"`, `data-viz="object"`, `data-viz="visibility"`,
		},
		"web/vault-health.html": {
			`class="scan-flow recovery-flow"`, "Action", "Vault / Journal", "Verify", "Restore",
		},
		"web/system-console.html": {
			`class="scan-flow terminal-evidence-flow"`, "Question", "Typed tool", "Evidence", "Continue",
		},
	}
	for path, wants := range checks {
		src := readVisualGrammarAsset(t, path)
		for _, want := range wants {
			if !strings.Contains(src, want) {
				t.Fatalf("%s missing Visual Grammar v2 marker %q", path, want)
			}
		}
	}
}

func TestVisualGrammarV2StorageUsesObservedNumbers(t *testing.T) {
	html := readVisualGrammarAsset(t, "web/storage-center.html")
	js := readVisualGrammarAsset(t, "web/storage-visualization-v23.js")
	if !strings.Contains(html, "/storage-visualization-v23.js") {
		t.Fatal("Storage Center must load its quantitative visualization")
	}
	for _, want := range []string{
		"parseBytes", "storageHistory", "storageAging", ".delta-positive, .delta-negative",
		"retained large file\\(s\\)", "Math.abs(value) / max * 100", "aria-label",
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("Storage quantitative visualization missing %q", want)
		}
	}
	for _, bad := range []string{"innerHTML", "eval(", "new Function", "document.write"} {
		if strings.Contains(js, bad) {
			t.Fatalf("Storage quantitative visualization contains unsafe pattern %q", bad)
		}
	}
}
