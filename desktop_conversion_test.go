// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestDesktopDistributionAssets(t *testing.T) {
	checks := map[string][]string{
		"desktop/SentinelDesktop.swift": {"NSWorkspace.shared.open", "Process()", "--desktop", "SENTINEL_DESKTOP_BOOTSTRAP", "desktop", "value: \"1\""},
		"build-desktop-macos.sh":        {"swiftc", "lipo -create", "Sentinel.app", "default browser + loopback-only localhost dashboard"},
		"release-direct-macos.sh":       {"Developer ID", "--options runtime", "notarytool submit", "stapler staple", "hdiutil create"},
		"DIRECT_DISTRIBUTION_GUIDE.md":  {"Sentinel-2.2.dmg", "Developer ID", "notarytool"},
		"web/desktop-ui.js":             {"desktop-ui.css", "More tools", "window.fetch = async", "sentinel-task-progress", "job.phase_percent", "job.hash_bytes_done", "Hashing duplicate candidates", "No local request started"},
		"web/desktop-ui.css":            {".mode-switch{display:none!important}", "grid-template-columns:244px", "overflow-y:scroll!important", ".sentinel-task-progress", ".sentinel-percent-bar"},
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
}

func TestDesktopUsesDirectLocalhostInsteadOfEmbeddedFrame(t *testing.T) {
	swiftBytes, err := os.ReadFile("desktop/SentinelDesktop.swift")
	if err != nil {
		t.Fatal(err)
	}
	swift := string(swiftBytes)
	if strings.Contains(swift, "WKWebView") || strings.Contains(swift, "/desktop.html") {
		t.Fatalf("desktop launcher must not embed or iframe the dashboard")
	}
	if !strings.Contains(swift, "components.path = \"/\"") || !strings.Contains(swift, "URLQueryItem(name: \"desktop\", value: \"1\")") {
		t.Fatalf("desktop launcher must open the direct localhost desktop=1 route")
	}

	mainBytes, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	mainSource := string(mainBytes)
	if !strings.Contains(mainSource, "r.URL.Query().Get(\"desktop\") == \"1\"") || !strings.Contains(mainSource, "/desktop-ui.js") {
		t.Fatalf("server must inject the desktop enhancement script only for desktop=1")
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

	// The launcher hands the loopback URL to the user's default browser via
	// NSWorkspace. Sentinel.app itself does not load HTTP through URLSession or
	// WKWebView, so broad ATS exceptions should not be added to the bundle.
	buildBytes, err := os.ReadFile("build-desktop-macos.sh")
	if err != nil {
		t.Fatal(err)
	}
	build := string(buildBytes)
	if strings.Contains(build, "NSAllowsArbitraryLoads") || strings.Contains(build, "NSAllowsArbitraryLoadsInWebContent") {
		t.Fatalf("browser-based localhost launcher must not add broad ATS exceptions")
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
