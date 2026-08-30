// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestCanonicalProductLoadsAdvancedEvidenceLayer(t *testing.T) {
	html, err := os.ReadFile("web/index.html")
	if err != nil { t.Fatal(err) }
	s := string(html)
	for _, want := range []string{"/app/advanced.css", "/app/advanced.js", "/app/runtime.js"} {
		if !strings.Contains(s, want) { t.Fatalf("canonical product missing %q", want) }
	}
	if strings.Index(s, "/app/advanced.js") > strings.Index(s, "/app/runtime.js") {
		t.Fatal("advanced evidence module must register upgraded lens renderers before runtime bootstrap")
	}
}

func TestAdvancedEvidenceLayerUsesRealLocalCapabilities(t *testing.T) {
	raw, err := os.ReadFile("web/app/advanced.js")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, want := range []string{
		"/api/intelligence/graph/v2",
		"/api/intelligence/timeline/grouped",
		"/api/object/story/v2",
		"system-snapshot-capture",
		"system-snapshot-diff",
		"storage-history",
		"storage-snapshot-capture",
		"/api/storage/aging",
		"security-posture",
		"system-evidence",
		"recovery",
		"Recovery readiness",
		"Graph 2.0",
	} {
		if !strings.Contains(s, want) { t.Fatalf("advanced product missing capability %q", want) }
	}
}

func TestAdvancedVisualLayerKeepsEvidenceSemanticsVisible(t *testing.T) {
	raw, err := os.ReadFile("web/app/advanced.css")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, want := range []string{".s24-map-canvas", ".s24-density", ".s24-checkpoints", ".s24-trend", ".s24-age-grid", ".s24-recovery-hero"} {
		if !strings.Contains(s, want) { t.Fatalf("advanced visualization missing %q", want) }
	}
}
