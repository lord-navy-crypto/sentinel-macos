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
	if err != nil { t.Fatal(err) }
	return string(b)
}

func TestVisualGrammarV2SharedSystemIsNowSentinel24(t *testing.T) {
	html := readVisualGrammarAsset(t, "web/index.html")
	grammar := readVisualGrammarAsset(t, "web/sentinel-24.css")
	if !strings.Contains(html, `/sentinel-24.css`) || !strings.Contains(html, `/sentinel-24.js`) {
		t.Fatal("Sentinel 2.4 product assets are not wired into the default document")
	}
	for _, want := range []string{
		".s24-instruments", ".s24-ledger", ".s24-feed", ".s24-table", ".s24-graph",
		".s24-bars", ".s24-pipeline", ".s24-context", ".s24-activity", "prefers-reduced-motion:reduce",
	} {
		if !strings.Contains(grammar, want) { t.Fatalf("Sentinel 2.4 visual grammar missing %q", want) }
	}
	for _, bad := range []string{"javascript:", "expression("} {
		if strings.Contains(strings.ToLower(grammar), bad) { t.Fatalf("visual grammar contains unsafe behavior %q", bad) }
	}
	nonEmptyContent := regexp.MustCompile(`content\s*:\s*["'][^"']+`)
	if nonEmptyContent.MatchString(grammar) { t.Fatal("Sentinel 2.4 CSS must not inject explanatory copy") }
}

func TestVisualGrammarV2MappingsLiveInOneProductController(t *testing.T) {
	js := readVisualGrammarAsset(t, "web/sentinel-24.js")
	checks := []string{
		"renderStatus", "renderSnapshot", "renderCases", "renderSearch", "renderRelations", "renderAudit", "renderObject",
		"renderChanges", "renderBehavior", "renderReference", "renderMachine", "renderProcesses", "renderStartup",
		"renderStorage", "renderReclaim", "renderSafeChange", "renderVisibility", "renderGuide",
		"Relationship field", "Observed evidence relationships", "Observed changes", "Measured footprint", "Safety gate", "Investigation model",
	}
	for _, want := range checks {
		if !strings.Contains(js, want) { t.Fatalf("Sentinel 2.4 product controller missing visual/evidence mapping %q", want) }
	}
}

func TestVisualGrammarV2StorageUsesObservedNumbers(t *testing.T) {
	js := readVisualGrammarAsset(t, "web/sentinel-24.js")
	for _, want := range []string{
		"files_visited", "dirs_visited", "visible_bytes", "permission_errors", "duplicate_hash_bytes",
		"large_files", "duplicates", "families", "hash_bytes_done", "hash_bytes_total", "phase_percent",
	} {
		if !strings.Contains(js, want) { t.Fatalf("Sentinel 2.4 storage visualization missing observed field %q", want) }
	}
	for _, want := range []string{
		"exact duplicate group(s) use hash agreement", "possible version family/families are naming heuristics only",
	} {
		if !strings.Contains(js, want) { t.Fatalf("Sentinel 2.4 storage semantics missing %q", want) }
	}
}

func TestVisualGrammarV2DefaultProductDoesNotLoadRetiredGrammar(t *testing.T) {
	html := readVisualGrammarAsset(t, "web/index.html")
	for _, retired := range []string{"v23-navigation", "v23-visual-system", "v23-quantitative-viz", "easy.css", "scan-center.css", "style.css", "desktop-ui.css"} {
		if strings.Contains(html, retired) { t.Fatalf("default Sentinel 2.4 product still loads retired grammar %q", retired) }
	}
}
