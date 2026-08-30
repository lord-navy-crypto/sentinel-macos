// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func readVisualGrammarAsset(t *testing.T, path string) string { t.Helper(); b, err := os.ReadFile(path); if err != nil { t.Fatal(err) }; return string(b) }

func TestSharedVisualGrammarBelongsToCanonicalApp(t *testing.T) {
	html := readVisualGrammarAsset(t, "web/index.html"); grammar := readVisualGrammarAsset(t, "web/app/shell.css")
	if !strings.Contains(html, `/app/shell.css`) || !strings.Contains(html, `/app/controller.js`) { t.Fatal("canonical product assets are not wired into the default document") }
	for _, want := range []string{".s24-instruments", ".s24-ledger", ".s24-feed", ".s24-table", ".s24-graph", ".s24-bars", ".s24-pipeline", ".s24-context", ".s24-activity", "prefers-reduced-motion:reduce"} { if !strings.Contains(grammar, want) { t.Fatalf("visual grammar missing %q", want) } }
	for _, bad := range []string{"javascript:", "expression("} { if strings.Contains(strings.ToLower(grammar), bad) { t.Fatalf("visual grammar contains unsafe behavior %q", bad) } }
	nonEmptyContent := regexp.MustCompile(`content\s*:\s*["'][^"']+`); if nonEmptyContent.MatchString(grammar) { t.Fatal("product CSS must not inject explanatory copy") }
}

func TestEvidenceMappingsLiveInCanonicalController(t *testing.T) {
	js := readVisualGrammarAsset(t, "web/app/controller.js")
	checks := []string{"renderStatus","renderSnapshot","renderCases","renderSearch","renderRelations","renderAudit","renderObject","renderChanges","renderBehavior","renderReference","renderMachine","renderProcesses","renderStartup","renderStorage","renderReclaim","renderSafeChange","renderVisibility","renderGuide","Relationship field","Observed evidence relationships","Observed changes","Measured footprint","Safety gate","Investigation model"}
	for _, want := range checks { if !strings.Contains(js, want) { t.Fatalf("product controller missing visual/evidence mapping %q", want) } }
}

func TestStorageVisualizationUsesObservedNumbers(t *testing.T) {
	js := readVisualGrammarAsset(t, "web/app/controller.js")
	for _, want := range []string{"files_visited","dirs_visited","visible_bytes","permission_errors","duplicate_hash_bytes","large_files","duplicates","families","hash_bytes_done","hash_bytes_total","phase_percent"} { if !strings.Contains(js, want) { t.Fatalf("storage visualization missing observed field %q", want) } }
	for _, want := range []string{"exact duplicate group(s) use hash agreement", "possible version family/families are naming heuristics only"} { if !strings.Contains(js, want) { t.Fatalf("storage semantics missing %q", want) } }
}

func TestDefaultProductDoesNotLoadRetiredGrammar(t *testing.T) {
	html := readVisualGrammarAsset(t, "web/index.html")
	for _, retired := range []string{"v23-navigation", "v23-visual-system", "v23-quantitative-viz", "easy.css", "scan-center.css", "style.css", "desktop-ui.css"} { if strings.Contains(html, retired) { t.Fatalf("default product still loads retired grammar %q", retired) } }
}
