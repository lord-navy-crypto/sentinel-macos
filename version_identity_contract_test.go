// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func versionIdentityRead(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestVersionIdentityUsesSingleProductVersion(t *testing.T) {
	version := strings.TrimSpace(versionIdentityRead(t, "VERSION"))
	if version == "" {
		t.Fatal("VERSION must not be empty")
	}
	index := versionIdentityRead(t, "web/index.html")
	for _, want := range []string{
		"<title>Sentinel " + version + " · Local Evidence</title>",
		`aria-label="Sentinel ` + version + `"`,
		`id="productVersion">` + version + `</small>`,
	} {
		if !strings.Contains(index, want) {
			t.Fatalf("visible product identity is not synchronized with VERSION %q: missing %q", version, want)
		}
	}
	versionGo := versionIdentityRead(t, "version.go")
	for _, want := range []string{"//go:embed VERSION", "strings.TrimSpace(embeddedVersion)"} {
		if !strings.Contains(versionGo, want) {
			t.Fatalf("Go engine no longer derives product version from VERSION: missing %q", want)
		}
	}
	build := versionIdentityRead(t, "build-desktop-macos.sh")
	for _, want := range []string{
		`VERSION="$(tr -d '[:space:]' < VERSION)"`,
		`<key>CFBundleVersion</key><string>${VERSION}</string>`,
		`<key>CFBundleShortVersionString</key><string>${VERSION}</string>`,
	} {
		if !strings.Contains(build, want) {
			t.Fatalf("macOS package version no longer derives from VERSION: missing %q", want)
		}
	}
}
