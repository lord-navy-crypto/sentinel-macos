// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func readContractAsset(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil { t.Fatal(err) }
	return string(b)
}

func TestContinueInvestigationHasOverlapGuard(t *testing.T) {
	html := readContractAsset(t, "web/investigation.html")
	js := readContractAsset(t, "web/investigation-stability.js")
	css := readContractAsset(t, "web/investigation-stability.css")
	for _, want := range []string{"/investigation-stability.css", "/investigation-stability.js"} {
		if !strings.Contains(html, want) { t.Fatalf("investigation page missing %q", want) }
	}
	for _, want := range []string{"An investigation is already running", "#candidateList button", "#nextTargetList button", "#runtimeContextBody button", "form.addEventListener('submit'", "stopImmediatePropagation", "MutationObserver"} {
		if !strings.Contains(js, want) { t.Fatalf("investigation overlap guard missing %q", want) }
	}
	for _, bad := range []string{"innerHTML", "eval(", "new Function", "document.write"} {
		if strings.Contains(js, bad) { t.Fatalf("investigation stability script contains unsafe pattern %q", bad) }
	}
	if !strings.Contains(css, ".investigation-is-busy") || !strings.Contains(css, "prefers-reduced-motion") { t.Fatal("investigation busy state must be visible and reduced-motion aware") }
}

func TestTerminalGuideIsBilingualAndSessionAware(t *testing.T) {
	console := readContractAsset(t, "web/system-console.html")
	links := readContractAsset(t, "web/system-console-links.js")
	guide := readContractAsset(t, "web/terminal-guide.html")
	guideJS := readContractAsset(t, "web/terminal-guide.js")
	guideCSS := readContractAsset(t, "web/terminal-guide.css")

	if !strings.Contains(console, `id="terminalGuideLink"`) || !strings.Contains(console, "Guide / 使用指南") { t.Fatal("System Console must expose the bilingual guide") }
	for _, want := range []string{"terminalGuideLink", "/terminal-guide.html#token=", "encodeURIComponent(token)"} {
		if !strings.Contains(links, want) { t.Fatalf("Terminal guide link must preserve the session token: missing %q", want) }
	}
	for _, want := range []string{"English", "中文", "Continue Investigation", "PID", "Raw Evidence", "Security Posture / 安全状态", "Processes & Resources / 进程与资源", "If a tool looks stuck or empty / 如果工具卡住或没有结果", "Sentinel 2.4 · AUX Terminal Guide"} {
		if !strings.Contains(guide, want) { t.Fatalf("bilingual Terminal guide missing %q", want) }
	}
	for _, want := range []string{"backToTerminal", "footerBackToTerminal", "#token=", "encodeURIComponent(token)"} {
		if !strings.Contains(guideJS, want) { t.Fatalf("Terminal guide return path missing %q", want) }
	}
	if !strings.Contains(guideCSS, ".bi-grid") || !strings.Contains(guideCSS, "@media(max-width:620px)") { t.Fatal("Terminal guide must keep bilingual content readable on desktop and mobile") }
	for _, path := range []string{"web/terminal-guide.js", "web/investigation-stability.js"} {
		src := readContractAsset(t, path)
		for _, bad := range []string{"innerHTML", "eval(", "new Function", "document.write"} {
			if strings.Contains(src, bad) { t.Fatalf("%s contains unsafe pattern %q", path, bad) }
		}
	}
}
