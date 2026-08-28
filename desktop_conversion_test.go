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
		"build-desktop-macos.sh":        {"swiftc", "lipo -create", "NSAllowsLocalNetworking", "Sentinel.app"},
		"release-direct-macos.sh":       {"Developer ID", "--options runtime", "notarytool submit", "stapler staple", "hdiutil create"},
		"DIRECT_DISTRIBUTION_GUIDE.md":  {"Sentinel-2.2.dmg", "Developer ID", "notarytool"},
		"web/desktop-ui.js":             {"desktop-ui.css", "More tools", "Sentinel is working", "window.fetch = async"},
		"web/desktop-ui.css":            {".mode-switch{display:none!important}", "overflow-y:auto", "sentinelGlobalActivity"},
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
	if !strings.Contains(mainSource, `r.URL.Query().Get("desktop") == "1"`) || !strings.Contains(mainSource, `/desktop-ui.js`) {
		t.Fatalf("server must inject the desktop enhancement script only for desktop=1")
	}
	if !strings.Contains(mainSource, `X-Frame-Options", "DENY`) || !strings.Contains(mainSource, `frame-ancestors 'none'`) {
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
