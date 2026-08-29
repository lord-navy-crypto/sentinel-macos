// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func scanContractSource(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil { t.Fatal(err) }
	return string(raw)
}

func TestScanCenterRestoresCoreScanningSurfaces(t *testing.T) {
	html := scanContractSource(t, "web/scan-center.html")
	js := scanContractSource(t, "web/scan-center.js")
	for _, want := range []string{"Scan Center", "Quick Scan", "Security Audit", "Deep Object Scan", "Full Storage Scan", "/scan-center.js", "/v23-navigation.js"} {
		if !strings.Contains(html, want) { t.Fatalf("Scan Center HTML missing %q", want) }
	}
	for _, want := range []string{"/api/quick-check", "/api/security/audit", "/api/storage/jobs", "/api/storage/cancel", "/investigation.html#", "phase_percent", "permission_errors", "slow_paths_skipped"} {
		if !strings.Contains(js, want) { t.Fatalf("Scan Center JS missing %q", want) }
	}
}

func TestScanCenterKeepsStorageScanBoundedAndCancellable(t *testing.T) {
	html := scanContractSource(t, "web/scan-center.html")
	for _, scope := range []string{`value="home"`, `value="downloads"`, `value="desktop"`, `value="documents"`, `value="library"`} {
		if !strings.Contains(html, scope) { t.Fatalf("Scan Center missing storage scope %q", scope) }
	}
	for _, want := range []string{`id="storageMinMB"`, `max="1048576"`, `id="storageLimit"`, `max="250"`, `id="cancelStorageScan"`} {
		if !strings.Contains(html, want) { t.Fatalf("Scan Center missing bounded control %q", want) }
	}
}

func TestScanCenterIsReadOnlyExceptScanCancellation(t *testing.T) {
	all := scanContractSource(t, "web/scan-center.html") + "\n" + scanContractSource(t, "web/scan-center.js")
	for _, bad := range []string{"innerHTML", "eval(", "new Function", "document.write", "/api/actions/execute", "/api/trust/capture", "/api/changes/start", "sudo ", "rm -"} {
		if strings.Contains(all, bad) { t.Fatalf("Scan Center contains unsafe or mutating pattern %q", bad) }
	}
}

func TestScanWorkspaceCannotDisappearFromNormalizedNavigation(t *testing.T) {
	nav := scanContractSource(t, "web/v23-navigation.js")
	easy := scanContractSource(t, "web/easy.html")
	i18n := scanContractSource(t, "web/i18n.js")
	for _, source := range []struct{name, body string}{{"navigation",nav},{"Easy",easy}} {
		if !strings.Contains(source.body, "/scan-center.html") { t.Fatalf("%s must expose Scan Center", source.name) }
	}
	if !strings.Contains(nav, "nav.scan") || !strings.Contains(i18n, "'nav.scan':'Scan'") || !strings.Contains(i18n, "'nav.scan':'扫描'") {
		t.Fatal("Scan workspace label must exist in normalized navigation dictionaries")
	}
}

func TestScanCenterJavaScriptIsInCI(t *testing.T) {
	ci := scanContractSource(t, ".github/workflows/v23-ci.yml")
	if !strings.Contains(ci, "node --check web/scan-center.js") {
		t.Fatal("Scan Center JavaScript must be syntax-checked in CI")
	}
}
