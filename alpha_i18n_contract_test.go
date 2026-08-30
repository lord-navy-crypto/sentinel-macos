// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func readAlphaContractFile(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil { t.Fatal(err) }
	return string(raw)
}

func TestI18nFoundationSupportsEnglishAndChinese(t *testing.T) {
	s := readAlphaContractFile(t, "web/i18n.js")
	for _, want := range []string{"sentinel.locale", "zh-CN", "English", "中文", "sentinel:localechange", "supportedLocales", "data-i18n", "localStorage", "Why this result", "Continue →"} {
		if !strings.Contains(s, want) { t.Fatalf("i18n foundation missing %q", want) }
	}
	for _, bad := range []string{"innerHTML", "eval(", "new Function", "document.write"} {
		if strings.Contains(s, bad) { t.Fatalf("unsafe i18n pattern %q", bad) }
	}
}

func TestAuxiliaryNavigationExposesLanguageAndAlpha(t *testing.T) {
	s := readAlphaContractFile(t, "web/aux-navigation.js")
	for _, want := range []string{"/i18n.js", "/alpha-center.html", "sentinel-language-switcher", "zh-CN", "Alpha", "nav.alpha", "Sentinel 2.4 · AUX"} {
		if !strings.Contains(s, want) { t.Fatalf("auxiliary navigation Alpha/i18n integration missing %q", want) }
	}
	for _, retired := range []string{"/easy.html", "/scan-center.html", "/security-center.html"} {
		if strings.Contains(s, retired) { t.Fatalf("auxiliary navigation still links retired portal %q", retired) }
	}
	html := readAlphaContractFile(t, "web/alpha-center.html")
	if !strings.Contains(html, "/aux-navigation.css") || !strings.Contains(html, "/aux-navigation.js") {
		t.Fatal("retained Alpha workspace must use the Sentinel 2.4 auxiliary navigation")
	}
}

func TestAlphaCenterIsReadOnlyCapabilitySurface(t *testing.T) {
	all := readAlphaContractFile(t, "web/alpha-center.html") + "\n" + readAlphaContractFile(t, "web/alpha-center.js")
	for _, want := range []string{"/api/readiness", "/api/visibility", "/api/quick-check", "/api/actions/vault/isolation", "UNDERSTAND", "INVESTIGATE", "CONTROL", "RECOVER", "LOCALIZATION", "Alpha Capability Center"} {
		if !strings.Contains(all, want) { t.Fatalf("Alpha Center missing %q", want) }
	}
	for _, bad := range []string{"innerHTML", "eval(", "new Function", "document.write", "/api/actions/execute", "/api/trust/capture", "/api/changes/start", "sudo "} {
		if strings.Contains(all, bad) { t.Fatalf("Alpha Center contains mutating/unsafe pattern %q", bad) }
	}
}

func TestSentinel24ReplacesEasyPortalWithBoundedSnapshot(t *testing.T) {
	html := readAlphaContractFile(t, "web/index.html")
	js := readAlphaContractFile(t, "web/sentinel-24.js")
	for _, want := range []string{"Sentinel 2.4", "renderSnapshot", "/api/quick-check", "/api/review-queue", "Attention index", "Review queue"} {
		if !strings.Contains(html+js, want) { t.Fatalf("Sentinel 2.4 bounded snapshot missing %q", want) }
	}
	if strings.Contains(html, "/easy.html") { t.Fatal("default product must not route through retired Easy portal") }
	start := strings.Index(js, "async function renderSnapshot")
	end := strings.Index(js, "async function renderCases")
	if start < 0 || end <= start { t.Fatal("could not isolate snapshot renderer") }
	segment := js[start:end]
	for _, bad := range []string{"/api/actions/execute", "/api/trust/capture", "/api/changes/start", "sudo "} {
		if strings.Contains(segment, bad) { t.Fatalf("bounded Snapshot contains mutating/unsafe pattern %q", bad) }
	}
}
