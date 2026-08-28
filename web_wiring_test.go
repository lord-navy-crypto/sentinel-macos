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
	// element. One missing node can stop the remainder of the initialization
	// statement and make many later buttons appear dead.
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
		"runQuickCheck", "guidedSnapshot", "loadReviewQueue", "loadSystemProfile", "runReadiness",
		"runWeaknessAudit", "loadCoverage", "loadAdvancedSensor", "deepSearchForm",
		"startChanges", "stopChanges", "refreshChanges", "reviewChanges", "reconcileChanges", "clearChanges", "loadChangeHistory",
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

func TestEveryStaticFormHasSubmitHandler(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	js := readUIFile(t, "web/app.js")
	re := regexp.MustCompile(`<form[^>]*id="([A-Za-z0-9_-]+)"[^>]*>`)
	forms := re.FindAllStringSubmatch(html, -1)
	if len(forms) < 4 {
		t.Fatalf("expected several action forms, found %d", len(forms))
	}
	for _, match := range forms {
		id := match[1]
		needle := `$('#` + id + `').addEventListener('submit'`
		if !strings.Contains(js, needle) {
			t.Errorf("form #%s has no submit handler in app.js", id)
		}
	}
}

func TestEveryStaticButtonHasActionPath(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	js := readUIFile(t, "web/app.js")
	buttonRE := regexp.MustCompile(`(?s)<button\b([^>]*)>.*?</button>`)
	idRE := regexp.MustCompile(`\bid="([A-Za-z0-9_-]+)"`)
	classRE := regexp.MustCompile(`\bclass="([^"]*)"`)
	formSubmitIDs := map[string]bool{
		"runDeepSearch": true,
		"startScan": true,
		"inspectIntegrity": true,
		"previewAction": true,
	}
	checked := 0
	for _, match := range buttonRE.FindAllStringSubmatch(html, -1) {
		attrs := match[1]
		if strings.Contains(attrs, "data-view=") || strings.Contains(attrs, "data-go=") {
			continue
		}
		if c := classRE.FindStringSubmatch(attrs); len(c) == 2 && strings.Contains(c[1], "preset-scan") {
			if !strings.Contains(js, "$$('.preset-scan').forEach") {
				t.Error("preset scan buttons exist but class handler is missing")
			}
			continue
		}
		m := idRE.FindStringSubmatch(attrs)
		if len(m) != 2 {
			continue
		}
		id := m[1]
		checked++
		if formSubmitIDs[id] {
			continue
		}
		if !strings.Contains(js, `#`+id) {
			t.Errorf("static button #%s has no app.js action reference", id)
		}
	}
	if checked < 35 {
		t.Fatalf("button wiring audit checked only %d id-based controls", checked)
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

func TestSessionAndBaselineControlsHaveBackendContracts(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	js := readUIFile(t, "web/app.js")
	server := readUIFile(t, "main.go")
	checks := []struct {
		control  string
		endpoint string
	}{
		{"guidedSnapshot", "/api/guided-snapshot"},
		{"captureEvidence", "/api/intelligence/graph"},
		{"loadTimeline", "/api/intelligence/timeline"},
		{"captureBehavior", "/api/behavior"},
		{"loadBehaviorHealth", "/api/behavior/health"},
		{"captureTrust", "/api/trust/capture"},
		{"compareTrust", "/api/trust/compare"},
		{"capturePersistence", "/api/persistence"},
		{"loadChangeHistory", "/api/changes/history"},
	}
	for _, c := range checks {
		if !strings.Contains(html, `id="`+c.control+`"`) {
			t.Errorf("session control #%s missing", c.control)
		}
		if !strings.Contains(js, c.endpoint) {
			t.Errorf("session control #%s has no frontend endpoint %s", c.control, c.endpoint)
		}
		if !strings.Contains(server, `mux.HandleFunc("`+c.endpoint+`"`) {
			t.Errorf("session endpoint %s is not registered", c.endpoint)
		}
	}
}

func TestDesktopEnhancementCannotBreakCoreUI(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	js := readUIFile(t, "web/desktop-ui.js")
	css := readUIFile(t, "web/desktop-ui.css")

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
	if strings.Contains(js, "preventDefault()") || strings.Contains(js, "stopPropagation()") {
		t.Fatal("desktop-ui.js must never intercept core click behavior")
	}
	if !strings.Contains(js, "desktop-ui.css") {
		t.Fatal("desktop-ui.js must load the CSP-safe external desktop-ui.css")
	}
	if !strings.Contains(css, ".mode-switch{display:none!important}") {
		t.Fatal("desktop-ui.css must hide Easy/Advanced without deleting compatibility nodes")
	}
	if !strings.Contains(css, "overflow-y:scroll!important") || !strings.Contains(css, "position:fixed!important") {
		t.Fatal("desktop-ui.css must provide two independent fixed viewport scroll panes")
	}
	if !strings.Contains(js, "window.fetch = async") || !strings.Contains(js, "sentinel-task-progress") || !strings.Contains(js, "sentinel-percent-bar") {
		t.Fatal("per-feature request progress feedback is not installed")
	}
	for _, required := range []string{
		"job.phase", "job.phase_percent", "job.files_visited", "job.dirs_visited",
		"job.hash_bytes_done", "job.hash_bytes_total", "job.current_hash_path",
		"Hashing duplicate candidates", "Building storage report",
	} {
		if !strings.Contains(js, required) {
			t.Fatalf("phase-aware storage progress is missing %q", required)
		}
	}
}
