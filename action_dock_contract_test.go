// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func actionDockRead(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil { t.Fatalf("read %s: %v", path, err) }
	return string(raw)
}

func TestActionDockIsCanonicalAndOrdered(t *testing.T) {
	html := actionDockRead(t, "web/index.html")
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
	s := actionDockRead(t, "web/app/action-dock.js")
	for _, lens := range []string{
		"status","snapshot","cases","search","relations","audit","object",
		"changes","behavior","reference","machine","processes","startup","persistence",
		"background","network","storage","reclaim","change","visibility","guide",
	} {
		if !strings.Contains(s, lens+": [") { t.Fatalf("Action Dock missing contextual mapping for %q", lens) }
	}
	for _, want := range []string{
		"Easy Scan", "Full Scan", "Monitoring Snapshot", "Rebuild Cases", "Capture Evidence",
		"Continue Investigation", "Capture Checkpoint", "Capture & Compare", "Compare Now", "Capture History",
		"Reclaim Review", "Visibility", "Workbench",
	} {
		if !strings.Contains(s, want) { t.Fatalf("Action Dock missing operation %q", want) }
	}
}

func TestActionDockReusesExistingSafeHandlers(t *testing.T) {
	s := actionDockRead(t, "web/app/action-dock.js")
	for _, want := range []string{"data-do", "data-scan-center", "data-system-action", "data-advanced", "data-workbench", "S.navigate"} {
		if !strings.Contains(s, want) { t.Fatalf("Action Dock does not reuse existing product handler %q", want) }
	}
	for _, forbidden := range []string{"/api/actions/execute", "/api/actions/delete", "permanent delete", "fetch('/api/"} {
		if strings.Contains(strings.ToLower(s), strings.ToLower(forbidden)) {
			t.Fatalf("Action Dock must remain an orchestration-only layer; found %q", forbidden)
		}
	}
}

func TestActionDockTargetsExistingHandlers(t *testing.T) {
	runtime := actionDockRead(t, "web/app/runtime.js")
	system := actionDockRead(t, "web/app/system-evidence.js")
	advanced := actionDockRead(t, "web/app/advanced.js")
	fullScan := actionDockRead(t, "web/app/full-scan.js")
	workbench := actionDockRead(t, "web/app/workbench.js")

	for _, id := range []string{"guided-snapshot", "rebuild-cases", "capture-relations", "rerun-audit", "capture-behavior", "compare-reference"} {
		if !strings.Contains(runtime, id) { t.Fatalf("Action Dock data-do target %q has no runtime handler", id) }
	}
	for _, id := range []string{"refresh-startup", "refresh-network", "capture-network"} {
		if !strings.Contains(system, id) { t.Fatalf("Action Dock system target %q has no system-evidence handler", id) }
	}
	if !strings.Contains(advanced, "capture-checkpoint") { t.Fatal("Action Dock checkpoint target has no advanced handler") }
	for _, want := range []string{"startFullScan", "cancelFullScan", "action === 'full'", "action === 'cancel'"} {
		if !strings.Contains(fullScan, want) { t.Fatalf("Action Dock Full Scan integration missing source target %q", want) }
	}
	for _, want := range []string{"openWorkbench", "dataset.workbench"} {
		if !strings.Contains(workbench, want) { t.Fatalf("Action Dock Workbench target missing %q", want) }
	}
}

func TestActionDockStabilizesStatusPlacementAfterAsyncScanCenter(t *testing.T) {
	s := actionDockRead(t, "web/app/action-dock.js")
	for _, want := range []string{"state.lens === 'status'", "#scanCenterBand", "previousElementSibling", "insertAdjacentElement('afterend', dock)"} {
		if !strings.Contains(s, want) { t.Fatalf("Action Dock async placement guard missing %q", want) }
	}
}

func TestActionDockDoesNotSelfTriggerMutationObserver(t *testing.T) {
	s := actionDockRead(t, "web/app/action-dock.js")
	for _, want := range []string{
		"let dockInstallQueued = false", "function queueDockInstall()", "new MutationObserver(queueDockInstall)",
		"observer.observe(stage, {childList:true})", "control.textContent !== nextLabel", "control.getAttribute('aria-busy') !== busyValue",
	} {
		if !strings.Contains(s, want) { t.Fatalf("Action Dock loop guard missing %q", want) }
	}
	if strings.Contains(s, "observer.observe(stage, {childList:true, subtree:true})") {
		t.Fatal("Action Dock must not observe its own button subtree; that can create a render feedback loop")
	}
}

func TestActionDockSynchronizesFullScanControls(t *testing.T) {
	s := actionDockRead(t, "web/app/action-dock.js")
	for _, want := range []string{
		"syncFullScanButtons", "[data-scan-center=\"full\"]", "aria-busy", "Scanning…",
		"S.scanCenter?.startFullScan", "S.scanCenter?.cancelFullScan", "event.stopImmediatePropagation()", "}, true);",
	} {
		if !strings.Contains(s, want) { t.Fatalf("Full Scan control synchronization missing %q", want) }
	}
}

func TestActionDockProvidesPostScanAnalysisActions(t *testing.T) {
	s := actionDockRead(t, "web/app/action-dock.js")
	for _, want := range []string{
		"FULL SCAN READY", "Continue with the retained evidence", "Choose the next analysis without repeating the scan",
		"Open Cases", "Review Changes", "Inspect Storage", "Compare Reference", "lens:'reference'", "Workbench", "scanCancelled",
	} {
		if !strings.Contains(s, want) { t.Fatalf("post-scan analysis experience missing %q", want) }
	}
}

func TestContinueInvestigationBridgeIsReachableFromCanonicalAudit(t *testing.T) {
	dock := actionDockRead(t, "web/app/action-dock.js")
	workspace := actionDockRead(t, "web/investigation.js")
	for _, want := range []string{"Continue Investigation", "data-continue-investigation", "/investigation.html#", "token:S.token"} {
		if !strings.Contains(dock, want) { t.Fatalf("canonical Continue Investigation bridge missing %q", want) }
	}
	for _, want := range []string{"/api/security/investigate", "branchTo(", "Continue from here", "Continue"} {
		if !strings.Contains(workspace, want) { t.Fatalf("Investigation workspace continuation missing %q", want) }
	}
}

func TestActionDockVisualLayerIsResponsive(t *testing.T) {
	s := actionDockRead(t, "web/app/action-dock.css")
	for _, want := range []string{".s24-action-dock", ".s24-header-scan", ".s24-scan-followup", "[data-scan-center=\"full\"][aria-busy=\"true\"]", "@media (max-width:980px)", "@media (max-width:620px)"} {
		if !strings.Contains(s, want) { t.Fatalf("Action Dock CSS missing %q", want) }
	}
}