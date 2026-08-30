// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestDesktopDistributionAssets(t *testing.T) {
	checks := map[string][]string{
		"desktop/SentinelDesktop.swift": {"NSWorkspace.shared.open", "WKWebView", "Open in Browser", "Open App View", "Quit Sentinel", "Process()", "--desktop", "SENTINEL_DESKTOP_BOOTSTRAP", "desktop", "value: \"1\""},
		"build-desktop-macos.sh":        {"swiftc", "lipo -create", "-framework WebKit", "NSAllowsLocalNetworking", "Sentinel.app", "native WebKit App View", "V5 Evidence Notebook", "Embedded V5 UI marker", "SentinelSourceCommit", "SentinelDesktopUI"},
		"run-fresh-desktop.sh":         {"pkill -x Sentinel", "open -n", "SentinelSourceCommit", "SentinelDesktopUI"},
		"release-direct-macos.sh":       {"Developer ID", "--options runtime", "notarytool submit", "stapler staple", "hdiutil create"},
		"DIRECT_DISTRIBUTION_GUIDE.md":  {"Developer ID", "notarytool"},
		"web/desktop-ui.js":             {"desktop-ui.css", "More tools", "window.fetch = async", "sentinel-task-progress", "job.phase_percent", "job.hash_bytes_done", "Hashing duplicate candidates", "Progress appears only after a real localhost request starts.", "Local request failed:", "Interface error:", "Sentinel Desktop App View V5"},
		"web/desktop-ui.css":            {".mode-switch{display:none!important}", "grid-template-columns:244px", "overflow-y:scroll!important", ".sentinel-task-progress", ".sentinel-percent-bar", ".v5-shell", ".v5-notebook", ".v5-drawer"},
	}
	for path, needles := range checks {
		b, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		s := string(b)
		for _, needle := range needles {
			if !strings.Contains(s, needle) {
				t.Fatalf("%s missing %q", path, needle)
			}
		}
	}

	versionBytes, err := os.ReadFile("VERSION")
	if err != nil {
		t.Fatal(err)
	}
	version := strings.TrimSpace(string(versionBytes))
	guideBytes, err := os.ReadFile("DIRECT_DISTRIBUTION_GUIDE.md")
	if err != nil {
		t.Fatal(err)
	}
	expectedBetaDMG := "Sentinel-" + version + "-beta.dmg"
	if !strings.Contains(string(guideBytes), expectedBetaDMG) {
		t.Fatalf("DIRECT_DISTRIBUTION_GUIDE.md missing current VERSION-derived artifact %q", expectedBetaDMG)
	}
}

func TestDesktopSupportsBrowserAndNativeAppView(t *testing.T) {
	swiftBytes, err := os.ReadFile("desktop/SentinelDesktop.swift")
	if err != nil {
		t.Fatal(err)
	}
	swift := string(swiftBytes)
	if strings.Contains(swift, "/desktop.html") {
		t.Fatalf("desktop launcher must not use the retired iframe wrapper")
	}
	for _, needle := range []string{
		"NSWorkspace.shared.open(dashboardURL)",
		"WKWebViewConfiguration()",
		"WKWebView(frame:",
		"websiteDataStore = .nonPersistent()",
		"runJavaScriptConfirmPanelWithMessage",
		"runJavaScriptAlertPanelWithMessage",
		"runJavaScriptTextInputPanelWithPrompt",
		"url.host == \"127.0.0.1\"",
		"components.path = \"/\"",
		"URLQueryItem(name: \"desktop\", value: \"1\")",
	} {
		if !strings.Contains(swift, needle) {
			t.Fatalf("dual-view launcher missing %q", needle)
		}
	}

	mainBytes, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	mainSource := string(mainBytes)
	for _, needle := range []string{
		"r.URL.Query().Get(\"legacy\") != \"1\"",
		"/desktop-ui.js",
		"X-Sentinel-UI",
		"v5-evidence-notebook",
		"legacy-diagnostic",
	} {
		if !strings.Contains(mainSource, needle) {
			t.Fatalf("server must make V5 the default UI; missing %q", needle)
		}
	}
	if strings.Contains(mainSource, "r.URL.Query().Get(\"desktop\") == \"1\"") {
		t.Fatalf("V5 must not depend on desktop=1; normal browser and App View should receive the same product UI")
	}
	if !strings.Contains(mainSource, "X-Frame-Options\", \"DENY") || !strings.Contains(mainSource, "frame-ancestors 'none'") {
		t.Fatalf("desktop mode must preserve anti-framing security headers")
	}

	uiJSBytes, err := os.ReadFile("web/desktop-ui.js")
	if err != nil {
		t.Fatal(err)
	}
	uiJS := string(uiJSBytes)
	if strings.Contains(uiJS, "createElement('style')") || strings.Contains(uiJS, "createElement(\"style\")") {
		t.Fatalf("desktop UI must not inject inline style because Sentinel CSP blocks it")
	}
	if strings.Contains(uiJS, ".mode-switch')?.remove") || strings.Contains(uiJS, ".mode-switch\")?.remove") {
		t.Fatalf("desktop UI must not delete compatibility nodes used by app.js")
	}
	if strings.Contains(uiJS, "preventDefault()") || strings.Contains(uiJS, "stopPropagation()") {
		t.Fatalf("desktop UI must not intercept core button events")
	}
	if strings.Contains(uiJS, "No local request started") {
		t.Fatalf("desktop UI must not mislabel validation/cancelled actions as a broken local request")
	}

	buildBytes, err := os.ReadFile("build-desktop-macos.sh")
	if err != nil {
		t.Fatal(err)
	}
	build := string(buildBytes)
	if !strings.Contains(build, "NSAllowsLocalNetworking") {
		t.Fatalf("native App View must declare its loopback/local-network intent")
	}
	if strings.Contains(build, "NSAllowsArbitraryLoads") || strings.Contains(build, "NSAllowsArbitraryLoadsInWebContent") {
		t.Fatalf("dual-view launcher must not add broad ATS exceptions")
	}
}

func TestDesktopTwoPaneScrollIsIndependent(t *testing.T) {
	b, err := os.ReadFile("web/desktop-ui.css")
	if err != nil {
		t.Fatal(err)
	}
	css := string(b)
	checks := []string{
		"html,body{",
		"overflow:hidden!important",
		"position:fixed!important",
		"display:grid!important",
		"grid-template-columns:244px minmax(0,1fr)!important",
		".sidebar{",
		"overflow-y:scroll!important",
		"main{",
		"overscroll-behavior-y:contain!important",
	}
	for _, needle := range checks {
		if !strings.Contains(css, needle) {
			t.Fatalf("desktop independent scrolling missing %q", needle)
		}
	}
}

func TestLegacyAppBuilderRoutesToNativeDesktopBuilder(t *testing.T) {
	b, err := os.ReadFile("build-app-macos.sh")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, "build-desktop-macos.sh") {
		t.Fatalf("legacy app builder does not route to native desktop builder")
	}
	if strings.Contains(s, "SentinelLauncher") {
		t.Fatalf("legacy shell launcher should no longer be generated")
	}
}
