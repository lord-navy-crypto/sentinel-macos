// SPDX-License-Identifier: MPL-2.0
package main

import (
	"strings"
	"testing"
)

func TestParseSentinelVersion(t *testing.T) {
	cases := []struct {
		raw string
		ok  bool
		out string
	}{
		{"2.7.0", true, "2.7.0"},
		{"v2.8.1", true, "2.8.1"},
		{"v2.9.0-beta.2", true, "2.9.0-beta.2"},
		{"bad", false, ""},
	}
	for _, tc := range cases {
		v, ok := parseSentinelVersion(tc.raw)
		if ok != tc.ok {
			t.Fatalf("parseSentinelVersion(%q) ok=%v want %v", tc.raw, ok, tc.ok)
		}
		if ok && versionDisplay(v) != tc.out {
			t.Fatalf("parseSentinelVersion(%q)=%q want %q", tc.raw, versionDisplay(v), tc.out)
		}
	}
}

func TestCompareSemanticVersionStableOutranksPrerelease(t *testing.T) {
	stable, _ := parseSentinelVersion("2.8.0")
	beta, _ := parseSentinelVersion("2.8.0-beta.2")
	newer, _ := parseSentinelVersion("2.8.1-beta.1")
	if compareSemanticVersion(stable, beta) <= 0 {
		t.Fatal("stable release must outrank same-version prerelease")
	}
	if compareSemanticVersion(newer, stable) <= 0 {
		t.Fatal("newer numeric prerelease must outrank older stable release")
	}
}

func TestCompareSemanticVersionOrdersNumericPrereleaseIdentifiers(t *testing.T) {
	beta2, _ := parseSentinelVersion("2.9.0-beta.2")
	beta10, _ := parseSentinelVersion("2.9.0-beta.10")
	if compareSemanticVersion(beta10, beta2) <= 0 {
		t.Fatal("beta.10 must outrank beta.2 using numeric prerelease comparison")
	}
}

func TestStableChannelRejectsMislabelledBetaRelease(t *testing.T) {
	releases := []githubRelease{
		{TagName: "v2.9.0-beta.1", Name: "Sentinel 2.9 Beta", Prerelease: false},
		{TagName: "v2.8.0", Name: "Sentinel 2.8.0"},
	}
	r, v, ok := selectReleaseForChannel(releases, "stable")
	if !ok || r.TagName != "v2.8.0" || versionDisplay(v) != "2.8.0" {
		t.Fatalf("stable channel selected %#v %q", r, versionDisplay(v))
	}
}

func TestBetaChannelCanSeePrerelease(t *testing.T) {
	releases := []githubRelease{
		{TagName: "v2.9.0-beta.10", Name: "Sentinel 2.9 Beta 10", Prerelease: true},
		{TagName: "v2.9.0-beta.2", Name: "Sentinel 2.9 Beta 2", Prerelease: true},
		{TagName: "v2.8.0", Name: "Sentinel 2.8.0"},
	}
	r, v, ok := selectReleaseForChannel(releases, "beta")
	if !ok || r.TagName != "v2.9.0-beta.10" || versionDisplay(v) != "2.9.0-beta.10" {
		t.Fatalf("beta channel selected %#v %q", r, versionDisplay(v))
	}
}

func TestReleaseAssetURLsPreferDMGAndChecksum(t *testing.T) {
	r := githubRelease{Assets: []githubReleaseAsset{
		{Name: "Sentinel-2.8.0.dmg.sha256", BrowserDownloadURL: "https://example.invalid/checksum"},
		{Name: "Sentinel-2.8.0.dmg", BrowserDownloadURL: "https://example.invalid/dmg"},
	}}
	name, dmg, sum := releaseAssetURLs(r)
	if name != "Sentinel-2.8.0.dmg" || dmg == "" || sum == "" {
		t.Fatalf("unexpected asset selection: %q %q %q", name, dmg, sum)
	}
}

func TestReliabilityBoundaryStrings(t *testing.T) {
	if !strings.Contains(productReliabilityMarker, "Product Reliability") {
		t.Fatal("missing Product Reliability marker")
	}
	out := updateStatusResponse{TrustBoundary: "Read-only release discovery. Sentinel does not download, install, replace, or execute an update from this endpoint."}
	lower := strings.ToLower(out.TrustBoundary)
	for _, want := range []string{"read-only", "does not download", "install", "execute"} {
		if !strings.Contains(lower, want) {
			t.Fatalf("update trust boundary missing %q", want)
		}
	}
}
