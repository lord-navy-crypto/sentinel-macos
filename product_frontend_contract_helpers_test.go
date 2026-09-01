// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

var canonicalProductScripts = []string{
	"web/app/core.js",
	"web/app/task-center.js",
	"web/app/lenses/orient-investigate.js",
	"web/app/lenses/compare.js",
	"web/app/lenses/system.js",
	"web/app/lenses/act-limits.js",
	"web/app/advanced.js",
	"web/app/case-stories.js",
	"web/app/system-evidence.js",
	"web/app/workbench.js",
	"web/app/full-scan.js",
	"web/app/action-dock.js",
	"web/app/runtime-logs.js",
	"web/app/ai.js",
	"web/app/ai-reliability.js",
	"web/app/manual.js",
	"web/app/manual-entry.js",
	"web/app/runtime.js",
}

func readProductScripts(t *testing.T) string {
	t.Helper()
	var out strings.Builder
	for _, path := range canonicalProductScripts {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read canonical product script %s: %v", path, err)
		}
		out.Write(raw)
		out.WriteByte('\n')
	}
	return out.String()
}

func requireProductScript(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read canonical product script %s: %v", path, err)
	}
	return string(raw)
}

func TestApplicationRegistersEveryDeclaredLens(t *testing.T) {
	all := readProductScripts(t)
	declared := []string{
		"status", "snapshot", "cases", "search", "relations", "audit", "object",
		"changes", "behavior", "reference",
		"machine", "processes", "startup", "persistence", "background", "network", "storage",
		"reclaim", "change", "visibility", "guide", "assistant", "manual", "runtime-logs",
	}
	for _, lens := range declared {
		needle := "registerLens('" + lens + "'"
		if !strings.Contains(all, needle) {
			t.Fatalf("canonical modular application does not register lens %q", lens)
		}
	}

	// Advanced product modules, the Investigation Workbench, Full Scan, Action
	// Dock, Floating Task Center, Local AI, Local AI reliability, and Manual
	// navigation may enhance existing lenses without replacing the canonical lens
	// registry model.
	re := regexp.MustCompile(`registerLens\('([^']+)'`)
	unique := map[string]bool{}
	for _, match := range re.FindAllStringSubmatch(all, -1) {
		if len(match) == 2 {
			unique[match[1]] = true
		}
	}
	if len(unique) != len(declared) {
		t.Fatalf("expected %d distinct canonical lenses, got %d: %#v", len(declared), len(unique), unique)
	}
	for _, lens := range declared {
		if !unique[lens] {
			t.Fatalf("declared lens %q is not registered", lens)
		}
	}
	if _, err := os.Stat("web/app/controller.js"); !os.IsNotExist(err) {
		t.Fatal("retired monolithic controller returned")
	}
}
