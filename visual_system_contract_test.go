// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func visualSource(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil { t.Fatal(err) }
	return string(raw)
}

func visualStylePaths() []string {
	return []string{
		"web/sentinel-24.css",
		"web/process-relations.css",
		"web/network-relations.css",
		"web/launch-services.css",
		"web/vault-health.css",
		"web/system-console.css",
		"web/system-console-domains.css",
		"web/investigation.css",
	}
}

func TestFirstPrinciplesVisualSystemIsSentinel24ProductOwned(t *testing.T) {
	html := visualSource(t, "web/index.html")
	visual := visualSource(t, "web/sentinel-24.css")
	if !strings.Contains(html, `/sentinel-24.css`) || strings.Contains(html, `/v23-visual-system.css`) {
		t.Fatal("default product must load only the Sentinel 2.4 visual system")
	}
	for _, want := range []string{
		"--line-soft", "--focus-soft", ".s24-shell", ".s24-command", ".s24-missions", ".s24-lenses",
		".s24-stage", ".s24-question", ".s24-band", ".s24-context", ".s24-activity", "prefers-reduced-motion",
	} {
		if !strings.Contains(visual, want) { t.Fatalf("Sentinel 2.4 visual system missing %q", want) }
	}
}

func TestVisualRedesignUsesDifferentEncodingsForDifferentEvidence(t *testing.T) {
	visual := visualSource(t, "web/sentinel-24.css")
	for _, want := range []string{
		".s24-instruments", ".s24-ledger", ".s24-table", ".s24-feed", ".s24-graph", ".s24-bars",
		".s24-pipeline", ".s24-form", ".s24-context-section", ".s24-note.warn", ".s24-note.good",
	} {
		if !strings.Contains(visual, want) { t.Fatalf("Sentinel 2.4 evidence encoding missing %q", want) }
	}
	js := visualSource(t, "web/sentinel-24.js")
	for _, want := range []string{
		"Current instruments", "Review queue", "Relationship canvas", "Change stream", "Measured footprint",
		"Safety gate", "Coverage", "Investigation model",
	} {
		if !strings.Contains(js, want) { t.Fatalf("Sentinel 2.4 controller missing evidence surface %q", want) }
	}
}

func TestTerminalDomainCardsDoNotReenterThreeColumnCompression(t *testing.T) {
	domain := visualSource(t, "web/system-console-domains.css")
	compact := strings.ReplaceAll(strings.ReplaceAll(domain, "\n", ""), "\t", "")
	if strings.Contains(compact, ".domain-tool-grid{display:grid;grid-template-columns:repeat(3") {
		t.Fatal("retained Terminal workspace must not return to three cramped outer columns")
	}
	if !strings.Contains(domain, ".domain-box .tool-card{") || !strings.Contains(domain, "flex-direction:column") {
		t.Fatal("retained Terminal domain cards must remain readable evidence units")
	}
}

func TestVisualStylesHaveBalancedBraces(t *testing.T) {
	for _, path := range visualStylePaths() {
		source := visualSource(t, path)
		open := strings.Count(source, "{")
		close := strings.Count(source, "}")
		if open == 0 || open != close { t.Fatalf("%s has unbalanced CSS braces: open=%d close=%d", path, open, close) }
	}
}

func TestSentinel24VisualSystemDoesNotInjectProductCopyOrRemoteBehavior(t *testing.T) {
	visual := visualSource(t, "web/sentinel-24.css")
	withoutComments := regexp.MustCompile(`(?s)/\*.*?\*/`).ReplaceAllString(visual, "")
	lower := strings.ToLower(withoutComments)
	for _, bad := range []*regexp.Regexp{
		regexp.MustCompile(`(?i)javascript\s*:`),
		regexp.MustCompile(`(?i)expression\s*\(`),
		regexp.MustCompile(`(?im)^\s*behavior\s*:`),
		regexp.MustCompile(`(?i)url\s*\(\s*["']?https?://`),
	} {
		if bad.MatchString(lower) { t.Fatalf("Sentinel 2.4 visual system must remain presentation-only; matched %q", bad.String()) }
	}
	nonEmptyContent := regexp.MustCompile(`content\s*:\s*["'][^"']+["']`)
	if nonEmptyContent.MatchString(withoutComments) {
		t.Fatal("Sentinel 2.4 visual system must not inject explanatory copy through CSS content")
	}
}
