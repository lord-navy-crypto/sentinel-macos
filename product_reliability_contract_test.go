// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func reliabilityRead(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestProductReliabilityRoutesAreAuthenticated(t *testing.T) {
	mainSource := reliabilityRead(t, "main.go")
	for _, want := range []string{
		`mux.HandleFunc("/api/self/health", a.auth(a.handleSelfHealth))`,
		`mux.HandleFunc("/api/update/status", a.auth(a.handleUpdateStatus))`,
	} {
		want = strings.ReplaceAll(want, `\"`, `"`)
		if !strings.Contains(mainSource, want) {
			t.Fatalf("Product Reliability route missing or not authenticated: %s", want)
		}
	}
}

func TestUpdateIntelligenceRemainsDiscoveryOnly(t *testing.T) {
	backend := reliabilityRead(t, "product_reliability.go")
	frontend := reliabilityRead(t, "web/app/product-reliability.js")
	for _, want := range []string{
		"Read-only release discovery",
		"InstallSupported: false",
		"AutomaticDownload: false",
		"channel must be stable or beta",
		"releaseLooksPrerelease",
		"io.LimitReader(resp.Body, 2<<20)",
	} {
		if !strings.Contains(backend, want) {
			t.Fatalf("update discovery boundary missing %q", want)
		}
	}
	for _, want := range []string{
		"No network request has been made",
		"does not download, replace, execute, or install",
		"indeterminate: true",
		"data-pr-update",
	} {
		if !strings.Contains(frontend, want) {
			t.Fatalf("frontend update boundary missing %q", want)
		}
	}
	for _, bad := range []string{
		"os.WriteFile(",
		"exec.Command(\"/usr/bin/open\"",
		"exec.Command(\"/usr/bin/curl\"",
		"exec.Command(\"curl\"",
		"exec.Command(\"installer\"",
		"exec.Command(\"ditto\"",
	} {
		if strings.Contains(backend, bad) {
			t.Fatalf("update backend contains prohibited installation/mutation pattern %q", bad)
		}
	}
}

func TestProductReliabilityLoadsAfterVisualNative(t *testing.T) {
	runtimeSource := reliabilityRead(t, "web/app/runtime.js")
	for _, want := range []string{
		"function loadProductReliability()",
		"if(!S.VisualNative)return",
		"/app/product-reliability.js",
		"script.addEventListener('load',loadProductReliability",
	} {
		if !strings.Contains(runtimeSource, want) {
			t.Fatalf("runtime Product Reliability ordering contract missing %q", want)
		}
	}
}

func TestMachineIntegratesSelfHealthAndManualUpdateCheck(t *testing.T) {
	frontend := reliabilityRead(t, "web/app/product-reliability.js")
	for _, want := range []string{
		"const baseMachine = S.renderers?.machine",
		"await baseMachine()",
		"Sentinel reliability / Sentinel 自身可靠性",
		"/api/self/health",
		"/api/update/status?channel=",
		"S.registerLens('machine', renderMachineReliability)",
	} {
		if !strings.Contains(frontend, want) {
			t.Fatalf("Machine reliability integration missing %q", want)
		}
	}
	if strings.Contains(frontend, "setInterval(checkUpdates") || strings.Contains(frontend, "setTimeout(checkUpdates") {
		t.Fatal("update discovery must remain manual rather than background polling")
	}
}

func TestProductionTrustManifestIsGeneratedAfterFailClosedVerification(t *testing.T) {
	script := reliabilityRead(t, "release-direct-macos.sh")
	verifyCommand := `SENTINEL_EXPECTED_SOURCE_SHA="$SOURCE_SHA" ./verify-release-macos.sh "$DMG"`
	verifyCommand = strings.ReplaceAll(verifyCommand, `\"`, `"`)
	manifestCommand := `cat > "$TRUST"`
	manifestCommand = strings.ReplaceAll(manifestCommand, `\"`, `"`)
	for _, want := range []string{
		"release-trust.json",
		`"developer_id_signed": true`,
		`"hardened_runtime": true`,
		`"notarized": true`,
		`"stapled": true`,
		`"gatekeeper_verified": true`,
		verifyCommand,
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("production release trust contract missing %q", want)
		}
	}
	verifyAt := strings.Index(script, verifyCommand)
	manifestAt := strings.Index(script, manifestCommand)
	if verifyAt < 0 || manifestAt < 0 || manifestAt <= verifyAt {
		t.Fatal("production trust manifest must be emitted only after exact-artifact verification")
	}
}

func TestBetaTrustManifestNeverClaimsProductionTrust(t *testing.T) {
	script := reliabilityRead(t, "package-dev-dmg-macos.sh")
	for _, want := range []string{
		"release-trust.json",
		`"developer_id_signed": false`,
		`"hardened_runtime": false`,
		`"notarized": false`,
		`"stapled": false`,
		`"gatekeeper_verified": false`,
		"does not upgrade its distribution trust",
	} {
		if !strings.Contains(script, want) {
			t.Fatalf("beta trust boundary missing %q", want)
		}
	}
}

func TestProductReliabilityDocumentationKeepsHistoryAsFusionNotDuplication(t *testing.T) {
	doc := reliabilityRead(t, "docs/PRODUCT_RELIABILITY.md")
	for _, want := range []string{
		"Evidence History / What Changed?",
		"resource history",
		"storage history",
		"network history",
		"FSEvents",
		"global/grouped timelines",
		"bounded, local, inspectable, and removable",
	} {
		if !strings.Contains(doc, want) {
			t.Fatalf("Product Reliability history-fusion rule missing %q", want)
		}
	}
}

func TestProductReliabilityJavaScriptSyntaxWhenNodeAvailable(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not available")
	}
	for _, path := range []string{"web/app/product-reliability.js", "web/app/runtime.js"} {
		cmd := exec.Command(node, "--check", path)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%s syntax failed: %v\n%s", path, err, out)
		}
	}
}
