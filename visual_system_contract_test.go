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
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func visualStylePaths() []string {
	return []string{
		"web/v23-visual-system.css",
		"web/v23-navigation.css",
		"web/easy.css",
		"web/scan-center.css",
		"web/compare-center.css",
		"web/control-plane.css",
		"web/intelligence-center.css",
		"web/process-relations.css",
		"web/network-relations.css",
		"web/launch-services.css",
		"web/vault-health.css",
		"web/system-console.css",
	}
}

func TestFirstPrinciplesVisualSystemIsGlobal(t *testing.T) {
	nav := visualSource(t, "web/v23-navigation.css")
	visual := visualSource(t, "web/v23-visual-system.css")
	for _, want := range []string{
		`@import url("/v23-visual-system.css")`,
		".sentinel-v23-primary",
		".sentinel-tool-shelf",
	} {
		if !strings.Contains(nav, want) {
			t.Fatalf("navigation visual layer missing %q", want)
		}
	}
	for _, want := range []string{
		"--line-soft",
		"--accent-soft",
		".timeline::before",
		".timeline-item::before",
		".diff-group",
		"progress::-webkit-progress-value",
		"prefers-reduced-motion",
	} {
		if !strings.Contains(visual, want) {
			t.Fatalf("shared visual system missing %q", want)
		}
	}
}

func TestVisualRedesignUsesDifferentEncodingsForDifferentEvidence(t *testing.T) {
	checks := map[string][]string{
		"web/easy.css": {
			"Status output is a ledger",
			"grid-template-areas:\"head value detail\"",
		},
		"web/scan-center.css": {
			"Scan modes read as one acquisition system",
			"Full storage traversal is presented as a console/pipeline",
		},
		"web/compare-center.css": {
			".compare-card::before",
			".compare-card::after",
		},
		"web/intelligence-center.css": {
			"#graph .cards",
			"#incidents .cards",
			"#timeline .timeline-item",
			"#visibility .cards",
		},
		"web/process-relations.css": {
			"relationship lanes",
			".relation-grid",
		},
		"web/network-relations.css": {
			"Live relationships",
			"History comparison",
		},
		"web/launch-services.css": {
			"Persistence entries are a causal list",
			".service-list",
		},
		"web/vault-health.css": {
			"Recovery history becomes a verification chain",
			".isolation-checks",
		},
		"web/system-console.css": {
			"Recipes are compact launch choices",
			".structured-output",
		},
		"web/control-plane.css": {
			"Shared summary language",
			"Snapshot comparison is visually before -> after",
		},
	}
	for path, wants := range checks {
		source := visualSource(t, path)
		for _, want := range wants {
			if !strings.Contains(source, want) {
				t.Fatalf("%s missing visual contract %q", path, want)
			}
		}
	}
}

func TestVisualStylesHaveBalancedBraces(t *testing.T) {
	for _, path := range visualStylePaths() {
		source := visualSource(t, path)
		open := strings.Count(source, "{")
		close := strings.Count(source, "}")
		if open == 0 || open != close {
			t.Fatalf("%s has unbalanced CSS braces: open=%d close=%d", path, open, close)
		}
	}
}

func TestSharedVisualSystemDoesNotInjectProductContentOrBehavior(t *testing.T) {
	visual := visualSource(t, "web/v23-visual-system.css")
	withoutComments := regexp.MustCompile(`(?s)/\*.*?\*/`).ReplaceAllString(visual, "")
	lower := strings.ToLower(withoutComments)
	for _, bad := range []*regexp.Regexp{
		regexp.MustCompile(`(?i)javascript\s*:`),
		regexp.MustCompile(`(?i)expression\s*\(`),
		regexp.MustCompile(`(?im)^\s*behavior\s*:`),
		regexp.MustCompile(`(?im)^\s*display\s*:\s*none\b`),
		regexp.MustCompile(`(?im)^\s*visibility\s*:\s*hidden\b`),
		regexp.MustCompile(`(?im)^\s*pointer-events\s*:\s*none\b`),
		regexp.MustCompile(`(?i)url\s*\(\s*["']?https?://`),
	} {
		if bad.MatchString(lower) {
			t.Fatalf("shared visual system must remain presentation-only; matched %q", bad.String())
		}
	}
	// Empty pseudo-elements are allowed for lines/dots. Text injection is not.
	nonEmptyContent := regexp.MustCompile(`content\s*:\s*["'][^"']+["']`)
	if nonEmptyContent.MatchString(withoutComments) {
		t.Fatal("shared visual system must not inject new visible text through CSS content")
	}
}
