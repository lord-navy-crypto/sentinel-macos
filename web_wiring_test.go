// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

func readUIFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestWebUIEventTargetsExist(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	js := readUIFile(t, "web/app.js")

	// Every direct $('#id').addEventListener(...) binding must point at a real
	// element. This catches a common whole-interface failure: initialization
	// throws once, then every later binding on that statement is skipped.
	re := regexp.MustCompile(`\$\('#([A-Za-z0-9_-]+)'\)\.addEventListener`)
	for _, match := range re.FindAllStringSubmatch(js, -1) {
		id := match[1]
		if !strings.Contains(html, `id="`+id+`"`) {
			t.Errorf("app.js binds #%s but web/index.html has no such id", id)
		}
	}
}

func TestWebUICoreControlsRemainWired(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	js := readUIFile(t, "web/app.js")

	controls := []string{
		"runQuickCheck", "guidedSnapshot", "loadReviewQueue", "loadSystemProfile",
		"runWeaknessAudit", "loadCoverage", "loadAdvancedSensor",
		"startChanges", "stopChanges", "refreshChanges", "reviewChanges", "reconcileChanges", "clearChanges",
		"rebuildIncidents", "loadIncidentHistory",
		"scanForm", "cancelScan", "runAudit", "integrityForm", "loadSelfIntegrity",
		"captureEvidence", "loadEvidence", "loadTimeline",
		"captureBehavior", "loadBehavior", "loadBehaviorHistory", "loadBehaviorHealth",
		"compareTrust", "captureTrust", "loadTrustHealth", "loadTrustHistory", "exportTrust", "restoreTrust",
		"loadProcesses", "loadStartup", "capturePersistence", "loadPersistence", "loadBackground", "loadNetwork",
		"previewCleanup", "actionForm", "executeAction", "loadActionHealth", "loadVault", "loadActionJournal",
		"exportReport", "exportDiagnostics", "loadCapabilities", "refresh",
	}
	for _, id := range controls {
		if !strings.Contains(html, `id="`+id+`"`) {
			t.Errorf("core control #%s is missing from web/index.html", id)
		}
		if !strings.Contains(js, `#`+id) {
			t.Errorf("core control #%s is not referenced by web/app.js", id)
		}
	}
}

func TestWebUINavigationTargetsExist(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	views := []string{
		"overview", "quickcheck", "hardware", "weakness", "changes",
		"incidents", "storage", "security", "actions", "guide",
		"integrity", "intelligence", "behavior", "trust", "processes",
		"startup", "persistence", "background", "network", "cleanup",
	}
	for _, view := range views {
		if !strings.Contains(html, `data-view="`+view+`"`) {
			t.Errorf("navigation button for %s is missing", view)
		}
		if !strings.Contains(html, `id="`+view+`"`) {
			t.Errorf("view section #%s is missing", view)
		}
	}
}

func TestWebAPIReferencesHaveRegisteredRoutes(t *testing.T) {
	js := readUIFile(t, "web/app.js")
	server := readUIFile(t, "main.go")

	// Capture literal endpoint prefixes before query strings. Every API endpoint
	// referenced by the browser must have an explicit server registration.
	re := regexp.MustCompile("[\"'`](/api/[A-Za-z0-9_./-]+)[^\"'`]*[\"'`]")
	matches := re.FindAllStringSubmatch(js, -1)
	seen := map[string]bool{}
	var paths []string
	for _, match := range matches {
		path := match[1]
		if seen[path] {
			continue
		}
		seen[path] = true
		paths = append(paths, path)
	}
	sort.Strings(paths)
	if len(paths) < 25 {
		t.Fatalf("API route audit found only %d literal paths; expected broad UI coverage", len(paths))
	}
	for _, path := range paths {
		needleFunc := `mux.HandleFunc("` + path + `"`
		needleHandler := `mux.Handle("` + path + `"`
		if !strings.Contains(server, needleFunc) && !strings.Contains(server, needleHandler) {
			t.Errorf("web/app.js references %s but main.go does not register it", path)
		}
	}
}

func TestDesktopEnhancementCannotBreakCoreUI(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	js := readUIFile(t, "web/desktop-ui.js")
	css := readUIFile(t, "web/desktop-ui.css")

	// Core app.js still owns these compatibility nodes. Hide them visually, but
	// do not remove them from the DOM after app.js has attached handlers.
	for _, id := range []string{"easyMode", "advancedMode"} {
		if !strings.Contains(html, `id="`+id+`"`) {
			t.Fatalf("compatibility node #%s is missing", id)
		}
	}
	if strings.Contains(js, ".mode-switch')?.remove") || strings.Contains(js, ".mode-switch\")?.remove") {
		t.Fatal("desktop-ui.js must not remove the mode switch DOM used by app.js")
	}
	if strings.Contains(js, "createElement('style')") || strings.Contains(js, "createElement(\"style\")") {
		t.Fatal("desktop-ui.js must not inject inline style; Sentinel CSP blocks it")
	}
	if !strings.Contains(js, "desktop-ui.css") {
		t.Fatal("desktop-ui.js must load the CSP-safe external desktop-ui.css")
	}
	if !strings.Contains(css, ".mode-switch{display:none!important}") {
		t.Fatal("desktop-ui.css must hide Easy/Advanced without deleting compatibility nodes")
	}
	if !strings.Contains(css, "overflow-y:auto") {
		t.Fatal("desktop-ui.css must provide independent vertical scrolling")
	}
	if !strings.Contains(js, "window.fetch = async") || !strings.Contains(js, "sentinelGlobalActivity") {
		t.Fatal("desktop progress/request feedback is not installed")
	}
}
