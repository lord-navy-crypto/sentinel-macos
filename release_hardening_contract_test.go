// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func readReleaseContractFile(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(raw)
}

func requireSpctlFailClosed(t *testing.T, path, script string) {
	t.Helper()
	found := false
	for _, line := range strings.Split(script, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "spctl --assess") {
			continue
		}
		found = true
		if strings.Contains(trimmed, "|| true") || strings.HasSuffix(trimmed, "|| :") {
			t.Fatalf("%s ignores Gatekeeper failure: %s", path, trimmed)
		}
	}
	if !found {
		t.Fatalf("%s does not perform a Gatekeeper assessment", path)
	}
}

func TestProductionReleaseVerificationFailsClosed(t *testing.T) {
	release := readReleaseContractFile(t, "release-direct-macos.sh")
	verify := readReleaseContractFile(t, "verify-release-macos.sh")

	// release-direct delegates the final Gatekeeper decision to the mounted-artifact
	// verifier. Any spctl command present in either script must itself be fail-closed.
	if strings.Contains(release, "spctl --assess") {
		requireSpctlFailClosed(t, "release-direct-macos.sh", release)
	}
	requireSpctlFailClosed(t, "verify-release-macos.sh", verify)

	for _, want := range []string{
		`./verify-release-macos.sh "$DMG"`,
		"xcrun notarytool submit",
		"xcrun stapler staple",
		"shasum -a 256",
	} {
		if !strings.Contains(release, want) {
			t.Fatalf("production release pipeline missing %q", want)
		}
	}
}

func TestReleaseVerifierInspectsMountedShippedApp(t *testing.T) {
	verify := readReleaseContractFile(t, "verify-release-macos.sh")
	for _, want := range []string{
		"hdiutil attach -readonly -nobrowse -mountpoint",
		`APP="$MOUNT_DIR/Sentinel.app"`,
		"codesign --verify --deep --strict",
		"spctl --assess --type execute",
		"CFBundleShortVersionString",
		"SentinelDesktopUI",
		"lipo -archs",
		"sentinel-macos-arm64",
		"sentinel-macos-x86_64",
		"Sentinel 2.6 Local AI Reliability",
	} {
		if !strings.Contains(verify, want) {
			t.Fatalf("mounted release verification missing %q", want)
		}
	}
}
