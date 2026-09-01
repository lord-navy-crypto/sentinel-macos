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

func TestSentinelApplicationIsTheDefaultProductSource(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	for _, want := range []string{`data-sentinel-generation="2.7-native"`, `href="/app/shell.css"`, `href="/app/advanced.css"`, `href="/app/workbench.css"`, `src="/app/core.js"`, `src="/app/lenses/orient-investigate.js"`, `src="/app/lenses/compare.js"`, `src="/app/lenses/system.js"`, `src="/app/lenses/act-limits.js"`, `src="/app/advanced.js"`, `src="/app/case-stories.js"`, `src="/app/system-evidence.js"`, `src="/app/workbench.js"`, `src="/app/ai.js"`, `src="/app/ai-reliability.js"`, `src="/app/manual.js"`, `src="/app/manual-entry.js"`, `src="/app/runtime.js"`, `id="missionRibbon"`, `id="lensRail"`, `id="evidenceStage"`, `id="contextTray"`, `id="activityBar"`} {
		if !strings.Contains(html, want) {
			t.Fatalf("Sentinel application shell missing %q", want)
		}
	}
	for _, retired := range []string{`/app/controller.js`, `src="/app.js"`, `href="/style.css"`, `desktop-ui.js`, `class="sidebar"`, `id="easyMode"`, `Sentinel 2.2`, `Desktop Conversion`, `/sentinel-24.js`, `/sentinel-24.css`} {
		if strings.Contains(html, retired) {
			t.Fatalf("default product source still contains retired marker %q", retired)
		}
	}
	if _, err := os.Stat("web/app/controller.js"); !os.IsNotExist(err) {
		t.Fatal("retired monolithic controller must not exist")
	}
}

func TestSentinelApplicationOwnsNavigationAndState(t *testing.T) {
	core := requireProductScript(t, "web/app/core.js")
	runtime := requireProductScript(t, "web/app/runtime.js")
	workbench := requireProductScript(t, "web/app/workbench.js")
	for _, want := range []string{"Sentinel 2.7 Native Frontend", "const MISSIONS", "const LENSES", "missionRibbon", "lensRail", "window.SentinelApp", "ORIENT", "CORRELATE", "CONNECT", "COMPARE", "RESOLVE", "BOUND"} {
		if !strings.Contains(core, want) {
			t.Fatalf("application core missing %q", want)
		}
	}
	for _, want := range []string{"window.__SENTINEL_26__", "architecture:'modular-app'", "document.addEventListener('click'", "document.addEventListener('submit'"} {
		if !strings.Contains(runtime, want) {
			t.Fatalf("application runtime missing %q", want)
		}
	}
	for _, want := range []string{"Sentinel 2.6 Investigation Workbench", "Workspace Persistence", "Cross-Lens Selection", "Natural-language Command Bar"} {
		if !strings.Contains(workbench, want) {
			t.Fatalf("application workbench missing %q", want)
		}
	}
}

func TestSentinelApplicationAPIReferencesHaveRegisteredRoutes(t *testing.T) {
	js := readProductScripts(t)
	server := readUIFile(t, "main.go")
	re := regexp.MustCompile("[\"'`](/api/[A-Za-z0-9_./-]+)[^\"'`]*[\"'`]")
	seen := map[string]bool{}
	var paths []string
	for _, match := range re.FindAllStringSubmatch(js, -1) {
		path := match[1]
		if !seen[path] {
			seen[path] = true
			paths = append(paths, path)
		}
	}
	sort.Strings(paths)
	if len(paths) < 25 {
		t.Fatalf("direct frontend references only %d API routes", len(paths))
	}
	for _, path := range paths {
		if !strings.Contains(server, `mux.HandleFunc("`+path+`"`) && !strings.Contains(server, `mux.Handle("`+path+`"`) {
			t.Errorf("frontend route %s is not registered", path)
		}
	}
}

func TestSentinelApplicationPreservesEvidenceAndSafetyWorkflows(t *testing.T) {
	js := readProductScripts(t)
	for _, want := range []string{"/api/quick-check", "/api/review-queue", "/api/incidents", "/api/search/deep", "/api/intelligence/graph", "/api/intelligence/graph/v2", "/api/intelligence/timeline/grouped", "/api/object/story/v2", "/api/security/audit", "/api/integrity/inspect", "/api/processes", "/api/startup", "/api/persistence", "/api/background", "/api/network", "/api/network/history", "/api/changes/start", "/api/behavior", "/api/trust/capture", "/api/trust/history", "/api/storage/jobs", "/api/storage/cancel", "/api/storage/aging", "/api/cleanup/preview", "/api/actions/preview", "/api/actions/execute", "system-snapshot-capture", "system-snapshot-diff", "storage-history", "recovery", "confirm_phrase", "confirm_code", "acknowledge:true", "state.actionPreview", "Nothing is deleted automatically", "Simulation stops at preview", "Evidence Bundle"} {
		if !strings.Contains(js, want) {
			t.Fatalf("application workflow missing %q", want)
		}
	}
}

func TestSentinelApplicationUsesAuthenticatedLocalRequests(t *testing.T) {
	all := readProductScripts(t) + "\n" + readUIFile(t, "main.go")
	for _, want := range []string{"location.hash.slice(1)", "X-Sentinel-Token", "127.0.0.1", "X-Frame-Options", "frame-ancestors 'none'", "connect-src 'self'"} {
		if !strings.Contains(all, want) {
			t.Fatalf("local UI security contract missing %q", want)
		}
	}
}

func TestSentinelApplicationUsesOrderedExternalModules(t *testing.T) {
	html := readUIFile(t, "web/index.html")
	tags := regexp.MustCompile(`(?s)<script\b[^>]*>`).FindAllString(html, -1)
	for _, tag := range tags {
		if !strings.Contains(tag, `src="`) {
			t.Fatalf("strict CSP product shell must not contain inline executable script tags: %s", tag)
		}
	}
	if len(tags) != len(canonicalProductScripts) {
		t.Fatalf("expected %d external product scripts, found %d", len(canonicalProductScripts), len(tags))
	}
	for i, path := range canonicalProductScripts {
		want := `src="/` + strings.TrimPrefix(path, "web/") + `"`
		if !strings.Contains(tags[i], want) {
			t.Fatalf("script %d must be %s, got %s", i, want, tags[i])
		}
	}
}
