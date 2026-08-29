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
	for _, want := range []string{"sentinel.locale", "zh-CN", "English", "中文", "sentinel:localechange", "supportedLocales", "data-i18n", "localStorage"} {
		if !strings.Contains(s, want) { t.Fatalf("i18n foundation missing %q", want) }
	}
	for _, bad := range []string{"innerHTML", "eval(", "new Function", "document.write"} {
		if strings.Contains(s, bad) { t.Fatalf("unsafe i18n pattern %q", bad) }
	}
}

func TestNormalizedNavigationExposesLanguageAndAlpha(t *testing.T) {
	s := readAlphaContractFile(t, "web/v23-navigation.js")
	for _, want := range []string{"/i18n.js", "/alpha-center.html", "sentinel-language-switcher", "zh-CN", "Alpha", "nav.alpha"} {
		if !strings.Contains(s, want) { t.Fatalf("navigation Alpha/i18n integration missing %q", want) }
	}
	html := readAlphaContractFile(t, "web/alpha-center.html")
	if !strings.Contains(html, "/v23-navigation.css") || !strings.Contains(html, "/v23-navigation.js") {
		t.Fatal("Alpha Center must use normalized v2.3 navigation")
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

func TestEasyDeepensOneClickWithoutMutation(t *testing.T) {
	all := readAlphaContractFile(t, "web/easy.html") + "\n" + readAlphaContractFile(t, "web/easy.js")
	for _, want := range []string{"oneClickRecommendations", "Why this result", "Continue", "/alpha-center.html", "/i18n.js", "easy.recommendations"} {
		if !strings.Contains(all, want) { t.Fatalf("Easy Alpha expansion missing %q", want) }
	}
	for _, bad := range []string{"innerHTML", "eval(", "new Function", "document.write", "/api/actions/execute", "/api/trust/capture", "/api/changes/start", "sudo "} {
		if strings.Contains(all, bad) { t.Fatalf("Easy Alpha expansion contains unsafe pattern %q", bad) }
	}
}
