// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestParseSearchQueryFiltersAndQuotes(t *testing.T) {
	q := parseSearchQuery(`kind:process severity:review "Google Chrome" helper`)
	if q.Filters["kind"] != "process" || q.Filters["severity"] != "review" {
		t.Fatalf("filters: %#v", q.Filters)
	}
	if len(q.Terms) != 2 || q.Terms[0] != "google chrome" || q.Terms[1] != "helper" {
		t.Fatalf("terms: %#v", q.Terms)
	}
}

func TestFuzzyFieldScoreTypo(t *testing.T) {
	if got := fuzzyFieldScore("Google Chrome", "chorme"); got <= 0 {
		t.Fatalf("expected typo match, got %d", got)
	}
	if got := fuzzyFieldScore("Safari", "zzzzzz"); got != 0 {
		t.Fatalf("unexpected unrelated match %d", got)
	}
}

func TestSearchResultFilters(t *testing.T) {
	r := UniversalSearchResult{Kind: "startup", Severity: "review", Path: "/Users/test/Library/helper", Subtitle: "user · public"}
	if !resultMatchesFilters(r, map[string]string{"kind": "startup", "severity": "review", "path": "library"}) {
		t.Fatal("expected filters to match")
	}
	if resultMatchesFilters(r, map[string]string{"kind": "process"}) {
		t.Fatal("unexpected kind match")
	}
}

func TestDeepFileNameSearchBounded(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(home, "Downloads", "Project"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "Downloads", "Project", "radiation_final.zip"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	d := deepFileNameSearch("radiaton", "downloads", 20)
	if len(d.Results) == 0 {
		t.Fatalf("expected fuzzy filename result: %#v", d)
	}
	if d.Results[0].Name != "radiation_final.zip" {
		t.Fatalf("unexpected result %#v", d.Results[0])
	}
}

func TestDeepScopeRejectsSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink semantics")
	}
	home := t.TempDir()
	outside := t.TempDir()
	t.Setenv("HOME", home)
	link := filepath.Join(home, "escape")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if _, err := deepScopeRoot(link); err == nil {
		t.Fatal("expected symlink escape rejection")
	}
}
