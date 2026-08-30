// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestActionDockIsCanonicalAndOrdered(t *testing.T) {
	raw, err := os.ReadFile("web/index.html")
	if err != nil { t.Fatal(err) }
	html := string(raw)
	for _, want := range []string{"/app/action-dock.css", "/app/action-dock.js", "/app/full-scan.js", "/app/runtime.js"} {
		if !strings.Contains(html, want) { t.Fatalf("canonical product missing %q", want) }
	}
	if strings.Index(html, "/app/full-scan.js") > strings.Index(html, "/app/action-dock.js") {
		t.Fatal("Action Dock must load after Full Scan so its scan buttons reuse the canonical Full Scan handler")
	}
	if strings.Index(html, "/app/action-dock.js") > strings.Index(html, "/app/runtime.js") {
		t.Fatal("Action Dock must load before runtime bootstrap")
	}
}

func TestActionDockCoversEveryPrimaryLens(t *testing.T) {
	raw, err := os.ReadFile("web/app/action-dock.js")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, lens := range []string{
		"status","snapshot","cases","search","relations","audit","object",
		"changes","behavior","reference","machine","processes","startup","persistence",
		"background","network","storage","reclaim","change","visibility","guide",
	} {
		if !strings.Contains(s, lens+": [") { t.Fatalf("Action Dock missing contextual mapping for %q", lens) }
	}
	for _, want := range []string{
		"Easy Scan", "Full Scan", "Monitoring Snapshot", "Rebuild Cases", "Capture Evidence",
		"Capture Checkpoint", "Capture & Compare", "Compare Now", "Capture History",
		"Reclaim Review", "Recovery / Workbench", "Visibility", "Workbench",
	} {
		if !strings.Contains(s, want) { t.Fatalf("Action Dock missing operation %q", want) }
	}
}

func TestActionDockReusesExistingSafeHandlers(t *testing.T) {
	raw, err := os.ReadFile("web/app/action-dock.js")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, want := range []string{"data-do", "data-scan-center", "data-system-action", "data-advanced", "data-workbench", "S.navigate"} {
		if !strings.Contains(s, want) { t.Fatalf("Action Dock does not reuse existing product handler %q", want) }
	}
	for _, forbidden := range []string{"/api/actions/execute", "/api/actions/delete", "permanent delete", "fetch('/api/"} {
		if strings.Contains(strings.ToLower(s), strings.ToLower(forbidden)) {
			t.Fatalf("Action Dock must remain an orchestration-only layer; found %q", forbidden)
		}
	}
}

func TestActionDockVisualLayerIsResponsive(t *testing.T) {
	raw, err := os.ReadFile("web/app/action-dock.css")
	if err != nil { t.Fatal(err) }
	s := string(raw)
	for _, want := range []string{".s24-action-dock", ".s24-header-scan", "@media (max-width:980px)", "@media (max-width:620px)"} {
		if !strings.Contains(s, want) { t.Fatalf("Action Dock CSS missing %q", want) }
	}
}
