// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseWhereFrom(t *testing.T) {
	got := parseWhereFrom(`(\n    "https://example.test/file.zip",\n    "https://example.test/"\n)`)
	if len(got) != 2 || got[0] != "https://example.test/file.zip" {
		t.Fatalf("unexpected: %#v", got)
	}
}

func TestIntegrityHash(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "sample.bin")
	if err := os.WriteFile(p, []byte("sentinel-integrity"), 0600); err != nil {
		t.Fatal(err)
	}
	got := inspectIntegrity(p)
	if !got.Exists || got.SHA256 == "" || got.HashStatus != "complete" {
		t.Fatalf("unexpected inspection: %#v", got)
	}
}

func TestNativeValidationHasExplicitAvailability(t *testing.T) {
	got := nativeStaticCodeValidate("/tmp/nonexistent")
	if got.Source == "" || got.Status == "" {
		t.Fatalf("missing native validation semantics: %#v", got)
	}
}
