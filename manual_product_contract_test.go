// SPDX-License-Identifier: MPL-2.0
package main

import (
	"strings"
	"testing"
)

func TestManualIsAFirstClassScrollableProductLens(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	manual := readUIFile(t, "web/app/manual.js")
	entry := readUIFile(t, "web/app/manual-entry.js")
	css := readUIFile(t, "web/app/manual.css")

	for _, want := range []string{
		`id="manualButton"`,
		`href="/app/manual.css"`,
		`src="/app/manual.js"`,
		`src="/app/manual-entry.js"`,
	} {
		if !strings.Contains(html, want) { t.Fatalf("manual shell wiring missing %q", want) }
	}

	for _, want := range []string{
		"Sentinel 2.5 Comprehensive User Manual",
		"registerLens('manual'",
		"data-manual-target",
		"data-manual-open-lens",
		"manualSearch",
		"scrollIntoView",
		"Easy Scan 和 Full Scan",
		"Continue Investigation",
		"Safe Change",
		"Visibility",
		"Attention / Risk / Confidence / Drift",
		"Full Scan 永远不应该因为",
	} {
		if !strings.Contains(manual, want) { t.Fatalf("comprehensive manual missing %q", want) }
	}
	if strings.Count(manual, "title:'") < 30 { t.Fatalf("manual is not sufficiently detailed; found fewer than 30 topic definitions") }

	for _, want := range []string{
		"limits.lenses.push('manual')",
		"S.LENSES.manual",
		"#manualButton",
		"S.navigate('manual')",
	} {
		if !strings.Contains(entry, want) { t.Fatalf("manual navigation missing %q", want) }
	}

	for _, want := range []string{
		".manual-layout",
		".manual-toc",
		"position:sticky",
		"overflow:auto",
		".manual-article",
		".manual-searchbar",
	} {
		if !strings.Contains(css, want) { t.Fatalf("manual visual contract missing %q", want) }
	}
}
