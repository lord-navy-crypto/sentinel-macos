// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestDesktopDistributionAssets(t *testing.T) {
	checks := map[string][]string{
		"desktop/SentinelDesktop.swift": {"NSWorkspace.shared.open", "WKWebView", "Open in Browser", "Open App View", "Quit Sentinel", "Process()", "--desktop", "SENTINEL_DESKTOP_BOOTSTRAP"},
		"build-desktop-macos.sh":        {"swiftc", "lipo -create", "-framework WebKit", "NSAllowsLocalNetworking", "Sentinel.app", "SentinelSourceCommit", "SentinelDesktopUI"},
		"run-fresh-desktop.sh":         {"pkill -x Sentinel", "open -n", "SentinelSourceCommit", "SentinelDesktopUI"},
		"reinstall-macos.sh":           {"/Applications/Sentinel.app", "SentinelSourceCommit", "SentinelDesktopUI"},
		"release-direct-macos.sh":      {"Developer ID", "--options runtime", "notarytool submit", "stapler staple", "hdiutil create"},
		"DIRECT_DISTRIBUTION_GUIDE.md": {"Developer ID", "notarytool"},
		"web/index.html":               {"2.4-native", "/sentinel-24.css", "/sentinel-24.js", "missionRibbon", "evidenceStage", "contextTray"},
		"web/sentinel-24.js":           {"Sentinel 2.4 Native Frontend", "X-Sentinel-Token", "/api/quick-check", "/api/actions/preview"},
		"web/sentinel-24.css":          {".s24-shell", ".s24-missions", ".s24-stage", ".s24-context", ".s24-activity"},
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

func TestBrowserAndNativeAppViewUseSameSentinel24Product(t *testing.T) {
	swiftBytes, err := os.ReadFile("desktop/SentinelDesktop.swift")
	if err != nil {
		t.Fatal(err)
	}
	swift := string(swiftBytes)
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
		`X-Sentinel-UI", "2.4-native`,
		`fs.ReadFile(staticFS, "index.html")`,
		`_, _ = w.Write(page)`,
	} {
		if !strings.Contains(mainSource, needle) {
			t.Fatalf("server must serve the 2.4 product source directly; missing %q", needle)
		}
	}
	for _, retired := range []string{"desktop-ui.js", "v5-evidence-notebook", "legacy-diagnostic", "core-compat.js"} {
		if strings.Contains(mainSource, retired) {
			t.Fatalf("server still contains retired frontend injection path %q", retired)
		}
	}
	if !strings.Contains(mainSource, "X-Frame-Options\", \"DENY") || !strings.Contains(mainSource, "frame-ancestors 'none'") {
		t.Fatalf("native/browser product must preserve anti-framing security headers")
	}
}

func TestSentinel24UsesOneViewportWithProgressiveContext(t *testing.T) {
	cssBytes, err := os.ReadFile("web/sentinel-24.css")
	if err != nil {
		t.Fatal(err)
	}
	css := string(cssBytes)
	for _, needle := range []string{
		".s24-shell{position:fixed",
		"grid-template-rows:58px 54px 40px minmax(0,1fr) 32px",
		".s24-stage{",
		"overflow-y:auto",
		".s24-context{position:fixed",
		".s24-activity{",
	} {
		if !strings.Contains(css, needle) {
			t.Fatalf("Sentinel 2.4 viewport contract missing %q", needle)
		}
	}
	if strings.Contains(css, "grid-template-columns:244px minmax(0,1fr)") {
		t.Fatal("Sentinel 2.4 must not return to the retired 244px dashboard sidebar layout")
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
