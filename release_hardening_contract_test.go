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

func TestProductionReleaseVerificationFailsClosed(t *testing.T) {
	release := readReleaseContractFile(t, "release-direct-macos.sh")
	verify := readReleaseContractFile(t, "verify-release-macos.sh")

	if strings.Contains(release, "spctl --assess") && strings.Contains(release, "|| true") {
		t.Fatal("production release must not ignore Gatekeeper assessment failures")
	}
	if strings.Contains(verify, "spctl --assess") && strings.Contains(verify, "|| true") {
		t.Fatal("release verifier must not ignore Gatekeeper assessment failures")
	}
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
