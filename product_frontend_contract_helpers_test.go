// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

var canonicalProductScripts = []string{
	"web/app/core.js",
	"web/app/lenses/orient-investigate.js",
	"web/app/lenses/compare.js",
	"web/app/lenses/system.js",
	"web/app/lenses/act-limits.js",
	"web/app/runtime.js",
}

func readProductScripts(t *testing.T) string {
	t.Helper()
	var out strings.Builder
	for _, path := range canonicalProductScripts {
		raw, err := os.ReadFile(path)
		if err != nil { t.Fatalf("read canonical product script %s: %v", path, err) }
		out.Write(raw)
		out.WriteByte('\n')
	}
	return out.String()
}

func requireProductScript(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil { t.Fatalf("read canonical product script %s: %v", path, err) }
	return string(raw)
}

func TestApplicationRegistersEveryDeclaredLens(t *testing.T) {
	all := readProductScripts(t)
	for _, lens := range []string{
		"status","snapshot","cases","search","relations","audit","object",
		"changes","behavior","reference",
		"machine","processes","startup","persistence","background","network","storage",
		"reclaim","change","visibility","guide",
	} {
		needle := "registerLens('" + lens + "'"
		if !strings.Contains(all, needle) { t.Fatalf("canonical modular application does not register lens %q", lens) }
	}
	if got := strings.Count(all, "registerLens('"); got != 21 { t.Fatalf("expected exactly 21 canonical lens registrations, got %d", got) }
	if _, err := os.Stat("web/app/controller.js"); !os.IsNotExist(err) { t.Fatal("retired monolithic controller returned") }
}
