// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func navContractRead(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}
func TestNavigationUsesIntentAndLensModel(t *testing.T) {
	html := navContractRead(t, "web/index.html")
	core := navContractRead(t, "web/app/core.js")
	for _, want := range []string{"missionRibbon", "lensRail", `aria-label="Investigation intent"`, `aria-label="Evidence lens"`} {
		if !strings.Contains(html, want) {
			t.Fatalf("navigation HTML missing %q", want)
		}
	}
	for _, want := range []string{"const MISSIONS", "Orient", "Investigate", "Compare", "System", "Act", "Limits", "status", "snapshot", "cases", "search", "relations", "audit", "object", "changes", "behavior", "reference", "machine", "processes", "startup", "persistence", "background", "network", "storage", "reclaim", "change", "visibility", "guide"} {
		if !strings.Contains(core, want) {
			t.Fatalf("intent/lens model missing %q", want)
		}
	}
}
func TestNavigationPreservesSessionTokenWithoutLegacyDesktopMode(t *testing.T) {
	core := navContractRead(t, "web/app/core.js")
	runtime := navContractRead(t, "web/app/runtime.js")
	for _, want := range []string{"new URLSearchParams(location.hash.slice(1))", "get('token')", "X-Sentinel-Token"} {
		if !strings.Contains(core, want) {
			t.Fatalf("session handling missing %q", want)
		}
	}
	if !strings.Contains(runtime, "history.replaceState") {
		t.Fatal("runtime must preserve lens/session routing")
	}
	for _, bad := range []string{"/easy.html", "/scan-center.html", "legacy=1", "desktop=1"} {
		if strings.Contains(navContractRead(t, "web/index.html"), bad) {
			t.Fatalf("default HTML uses retired path %q", bad)
		}
	}
}
func TestNavigationIsProductOwnedNotCSSInjected(t *testing.T) {
	core := navContractRead(t, "web/app/core.js")
	css := navContractRead(t, "web/app/shell.css")
	if !strings.Contains(core, "renderNavigation") || !strings.Contains(core, "data-mission") || !strings.Contains(core, "data-lens") {
		t.Fatal("navigation must be product-owned")
	}
	for _, bad := range []string{"javascript:", "expression("} {
		if strings.Contains(strings.ToLower(css), bad) {
			t.Fatalf("unsafe CSS behavior %q", bad)
		}
	}
}
func TestNavigationDoesNotRecreateRetiredSidebarDashboard(t *testing.T) {
	html := navContractRead(t, "web/index.html")
	css := navContractRead(t, "web/app/shell.css")
	for _, bad := range []string{`<aside class="sidebar"`, `Sentinel 2.2 · Desktop Conversion`, `mode-switch`, `grid-template-columns:244px minmax(0,1fr)`} {
		if strings.Contains(html, bad) || strings.Contains(css, bad) {
			t.Fatalf("returned to retired dashboard %q", bad)
		}
	}
}
