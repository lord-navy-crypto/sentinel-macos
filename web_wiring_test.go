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

func TestSentinel24IsTheDefaultProductSource(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	for _, want := range []string{
		`data-sentinel-generation="2.4-native"`,
		`href="/sentinel-24.css"`,
		`src="/sentinel-24.js"`,
		`id="missionRibbon"`,
		`id="lensRail"`,
		`id="evidenceStage"`,
		`id="contextTray"`,
		`id="activityBar"`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("Sentinel 2.4 product shell missing %q", want)
		}
	}
	for _, retired := range []string{
		`src="/app.js"`, `href="/style.css"`, `src="/desktop-ui.js"`,
		`class="app"`, `class="sidebar"`, `id="easyMode"`, `id="advancedMode"`,
		`Sentinel 2.2`, `Desktop Conversion`,
	} {
		if strings.Contains(html, retired) {
			t.Fatalf("default product source still depends on retired dashboard marker %q", retired)
		}
	}
}

func TestSentinel24OwnsNavigationAndState(t *testing.T) {
	js := readUIFile(t, "web/sentinel-24.js")
	for _, want := range []string{
		"Sentinel 2.4 Native Frontend",
		"const MISSIONS",
		"const LENSES",
		"missionRibbon",
		"lensRail",
		"evidenceStage",
		"contextTray",
		"window.__SENTINEL_24__",
		"ORIENT", "CORRELATE", "CONNECT", "COMPARE", "RESOLVE", "BOUND",
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("Sentinel 2.4 controller missing %q", want)
		}
	}
	for _, legacy := range []string{"easyMode", "advancedMode", "desktop-compat-layer", "window.__sentinelDesktopV5"} {
		if strings.Contains(js, legacy) {
			t.Fatalf("Sentinel 2.4 controller reintroduced legacy runtime dependency %q", legacy)
		}
	}
}

func TestSentinel24APIReferencesHaveRegisteredRoutes(t *testing.T) {
	js := readUIFile(t, "web/sentinel-24.js")
	server := readUIFile(t, "main.go")
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
		t.Fatalf("Sentinel 2.4 direct frontend references only %d API routes; expected broad product coverage", len(paths))
	}
	for _, path := range paths {
		if !strings.Contains(server, `mux.HandleFunc("`+path+`"`) && !strings.Contains(server, `mux.Handle("`+path+`"`) {
			t.Errorf("Sentinel 2.4 frontend references %s but main.go does not register it", path)
		}
	}
}

func TestSentinel24PreservesEvidenceAndSafetyWorkflows(t *testing.T) {
	js := readUIFile(t, "web/sentinel-24.js")
	for _, want := range []string{
		"/api/quick-check", "/api/review-queue", "/api/incidents",
		"/api/search", "/api/search/deep", "/api/intelligence/graph", "/api/intelligence/timeline",
		"/api/security/audit", "/api/integrity/inspect", "/api/processes", "/api/process/detail",
		"/api/startup", "/api/persistence", "/api/background", "/api/network",
		"/api/changes/start", "/api/changes/review", "/api/behavior", "/api/trust/capture", "/api/trust/compare",
		"/api/storage/jobs", "/api/storage/cancel", "/api/cleanup/preview",
		"/api/actions/preview", "/api/actions/execute", "/api/actions/status", "/api/actions/reveal",
		"confirm_phrase", "confirm_code", "acknowledge:true", "state.actionPreview",
		"reversible", "Nothing is deleted automatically",
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("Sentinel 2.4 workflow contract missing %q", want)
		}
	}
}

func TestSentinel24UsesTokenAuthenticatedLocalRequests(t *testing.T) {
	js := readUIFile(t, "web/sentinel-24.js")
	server := readUIFile(t, "main.go")
	for _, want := range []string{"location.hash.slice(1)", "X-Sentinel-Token", "127.0.0.1"} {
		combined := js + "\n" + server
		if !strings.Contains(combined, want) {
			t.Fatalf("local authenticated UI contract missing %q", want)
		}
	}
	for _, want := range []string{"X-Frame-Options", "frame-ancestors 'none'", "connect-src 'self'"} {
		if !strings.Contains(server, want) {
			t.Fatalf("server security header contract missing %q", want)
		}
	}
}

func TestSentinel24NoInlineScriptOrExternalFrontendDependency(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	css := readUIFile(t, "web/sentinel-24.css")
	if regexp.MustCompile(`(?s)<script(?![^>]*\bsrc=)[^>]*>`).MatchString(html) {
		t.Fatal("default Sentinel 2.4 HTML must not contain inline scripts")
	}
	for _, bad := range []string{"https://", "http://", "@import url(\"http", "javascript:"} {
		if strings.Contains(html, bad) || strings.Contains(css, bad) {
			t.Fatalf("default Sentinel 2.4 frontend must remain self-contained; found %q", bad)
		}
	}
}
