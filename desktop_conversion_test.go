// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestDesktopDistributionAssets(t *testing.T) {
	checks := map[string][]string{
		"desktop/SentinelDesktop.swift": {"WKWebView", "Process()", "--desktop", "SENTINEL_DESKTOP_BOOTSTRAP"},
		"build-desktop-macos.sh":        {"swiftc", "lipo -create", "NSAllowsLocalNetworking", "Sentinel.app"},
		"release-direct-macos.sh":       {"Developer ID", "--options runtime", "notarytool submit", "stapler staple", "hdiutil create"},
		"DIRECT_DISTRIBUTION_GUIDE.md":  {"Sentinel-2.2.dmg", "Developer ID", "notarytool"},
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
