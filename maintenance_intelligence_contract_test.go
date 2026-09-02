// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestMaintenanceUltraProductContract(t *testing.T) {
	backend, err := os.ReadFile("maintenance_intelligence.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(backend)
	for _, needle := range []string{
		"Sentinel 3.1 Maintenance Intelligence Ultra",
		"Duplicate means full-file SHA-256 equality",
		"persistent history is disabled",
		"At least two retained samples are required",
		"Only the app bundle and user-Library paths with explicit bundle-ID or exact-name evidence are included",
	} {
		if !strings.Contains(text, needle) {
			t.Fatalf("maintenance backend missing %q", needle)
		}
	}
	if strings.Contains(text, "os.Remove(") || strings.Contains(text, "RemoveAll(") {
		t.Fatal("Maintenance Intelligence must remain read-only toward user files")
	}
}

func TestMaintenanceHashRequiresFullFileEquality(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "a.bin")
	b := filepath.Join(dir, "b.bin")
	c := filepath.Join(dir, "c.bin")
	if err := os.WriteFile(a, []byte("same-content"), 0600); err != nil { t.Fatal(err) }
	if err := os.WriteFile(b, []byte("same-content"), 0600); err != nil { t.Fatal(err) }
	if err := os.WriteFile(c, []byte("different---"), 0600); err != nil { t.Fatal(err) }
	deadline := time.Now().Add(2 * time.Second)
	ha, err := hashFileBounded(a, deadline); if err != nil { t.Fatal(err) }
	hb, err := hashFileBounded(b, deadline); if err != nil { t.Fatal(err) }
	hc, err := hashFileBounded(c, deadline); if err != nil { t.Fatal(err) }
	if ha != hb { t.Fatal("equal files must have equal SHA-256") }
	if ha == hc { t.Fatal("different files must not be labeled duplicate") }
}

func TestCounterRateRejectsResetAndSingleCounterGuess(t *testing.T) {
	if _, ok := counterRate(100, 90, 5); ok {
		t.Fatal("counter reset must be unavailable")
	}
	if _, ok := counterRate(0, 0, 5); ok {
		t.Fatal("empty cumulative counter must be unavailable")
	}
	v, ok := counterRate(100, 600, 5)
	if !ok || v != 100 {
		t.Fatalf("expected measured delta rate 100, got %v ok=%v", v, ok)
	}
}
