// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestDesktopBootstrapIsBoundToBundleAndLoopback(t *testing.T) {
	raw, err := os.ReadFile("desktop/SentinelDesktop.swift")
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, want := range []string{
		"payload.version == bundleVersion()",
		"token.count == 48",
		`components.scheme == "http"`,
		`components.host == "127.0.0.1"`,
		"let port = components.port",
		"components.user == nil",
		"components.password == nil",
		"components.query == nil",
		"components.fragment == nil",
		"validatedBootstrapURL(payload)",
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("desktop bootstrap hardening missing %q", want)
		}
	}
}

func TestDesktopNavigationRejectsUnsafeExternalSchemes(t *testing.T) {
	raw, err := os.ReadFile("desktop/SentinelDesktop.swift")
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, want := range []string{
		`url.absoluteString == "about:blank"`,
		`url.absoluteString.hasPrefix("blob:\(origin)/")`,
		`url.scheme?.lowercased() == "https"`,
		"navigationAction.navigationType == .linkActivated",
		"openExternalIfUserActivated",
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("desktop navigation hardening missing %q", want)
		}
	}
	for _, forbidden := range []string{
		`if url.scheme == "about" || url.scheme == "blob" { return true }`,
		`else {\n            NSWorkspace.shared.open(url)`,
	} {
		if strings.Contains(s, forbidden) {
			t.Fatalf("desktop launcher returned to unsafe navigation pattern %q", forbidden)
		}
	}
}
