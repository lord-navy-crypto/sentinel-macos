// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestDesktopDistributionAssets(t *testing.T) {
	checks := map[string][]string{
		"desktop/SentinelDesktop.swift":        {"NSWorkspace.shared.open", "WKWebView", "Open in Browser", "Open App View", "Quit Sentinel", "Process()", "--desktop", "SENTINEL_DESKTOP_BOOTSTRAP", "2.7 Native Frontend", "config.websiteDataStore = .default()"},
		"build-desktop-macos.sh":               {"swiftc", "lipo -create", "-framework WebKit", "NSAllowsLocalNetworking", "Sentinel.app", "SentinelSourceCommit", "SentinelDesktopUI", "2.7 Native Frontend"},
		"run-fresh-desktop.sh":                 {"pkill -x Sentinel", "open -n", "SentinelSourceCommit", "SentinelDesktopUI"},
		"reinstall-macos.sh":                   {"/Applications/Sentinel.app", "SentinelSourceCommit", "SentinelDesktopUI", "2.7 Native Frontend"},
		"release-direct-macos.sh":              {"Developer ID", "--options runtime", "notarytool submit", "stapler staple", "hdiutil create"},
		"DIRECT_DISTRIBUTION_GUIDE.md":         {"Developer ID", "notarytool"},
		"web/index.html":                       {"2.7-native", "/app/shell.css", "/app/core.js", "/app/ai.js", "/app/runtime.js", "missionRibbon", "evidenceStage", "contextTray"},
		"web/app/core.js":                      {"Sentinel 2.7 Native Frontend", "X-Sentinel-Token", "window.SentinelApp"},
		"web/app/ai.js":                        {"Sentinel 2.7 WebLLM Local AI", "CreateWebWorkerMLCEngine", "useIndexedDBCache:true", "Model Library", "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "Load / Download selected"},
		"web/app/lenses/orient-investigate.js": {"/api/quick-check"},
		"web/app/lenses/act-limits.js":         {"/api/actions/preview"},
		"web/app/shell.css":                    {".s24-shell", ".s24-missions", ".s24-stage", ".s24-context", ".s24-activity"},
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
	guideBytes, err := os.ReadFile("DIRECT_DISTRIBUTION_GUIDE.md")
	if err != nil {
		t.Fatal(err)
	}
	expected := "Sentinel-" + strings.TrimSpace(string(versionBytes)) + "-beta.dmg"
	if !strings.Contains(string(guideBytes), expected) {
		t.Fatalf("distribution guide missing %q", expected)
	}
}

func TestBrowserAndNativeAppViewUseSameProduct(t *testing.T) {
	swiftBytes, err := os.ReadFile("desktop/SentinelDesktop.swift")
	if err != nil {
		t.Fatal(err)
	}
	swift := string(swiftBytes)
	for _, needle := range []string{"NSWorkspace.shared.open(productURL)", "WKWebViewConfiguration()", "websiteDataStore = .default()", "runJavaScriptConfirmPanelWithMessage", "url.host == \"127.0.0.1\"", "components.path = \"/\"", "same Sentinel 2.7 Native Frontend"} {
		if !strings.Contains(swift, needle) {
			t.Fatalf("dual-view launcher missing %q", needle)
		}
	}
	if strings.Contains(swift, "websiteDataStore = .nonPersistent()") {
		t.Fatal("native App View must retain the explicitly downloaded WebLLM IndexedDB model cache")
	}
	mainBytes, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	mainSource := string(mainBytes)
	for _, needle := range []string{`X-Sentinel-UI", "2.7-native`, `fs.ReadFile(staticFS, "index.html")`, `_, _ = w.Write(page)`, `worker-src 'self' blob:`, `https://huggingface.co`} {
		if !strings.Contains(mainSource, needle) {
			t.Fatalf("server missing %q", needle)
		}
	}
	for _, retired := range []string{"desktop-ui.js", "v5-evidence-notebook", "legacy-diagnostic", "core-compat.js"} {
		if strings.Contains(mainSource, retired) {
			t.Fatalf("server contains retired runtime %q", retired)
		}
	}
}

func TestApplicationUsesOneViewportWithProgressiveContext(t *testing.T) {
	cssBytes, err := os.ReadFile("web/app/shell.css")
	if err != nil {
		t.Fatal(err)
	}
	css := string(cssBytes)
	for _, needle := range []string{".s24-shell{position:fixed", "grid-template-rows:58px 54px 40px minmax(0,1fr) 32px", ".s24-stage{", "overflow-y:auto", ".s24-context{position:fixed", ".s24-activity{"} {
		if !strings.Contains(css, needle) {
			t.Fatalf("viewport contract missing %q", needle)
		}
	}
	if strings.Contains(css, "grid-template-columns:244px minmax(0,1fr)") {
		t.Fatal("must not return to retired sidebar")
	}
}

func TestLegacyAppBuilderRoutesToNativeDesktopBuilder(t *testing.T) {
	b, err := os.ReadFile("build-app-macos.sh")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, "build-desktop-macos.sh") {
		t.Fatal("legacy builder does not route to native builder")
	}
	if strings.Contains(s, "SentinelLauncher") {
		t.Fatal("legacy shell launcher should not be generated")
	}
}
