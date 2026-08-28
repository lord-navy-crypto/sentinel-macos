// SPDX-License-Identifier: MPL-2.0
package main

import (
	"runtime"
	"strings"
	"testing"
)

func TestParseCoreBreakdown(t *testing.T) {
	perf, eff := parseCoreBreakdown("8 (4 performance and 4 efficiency)")
	if perf != 4 || eff != 4 {
		t.Fatalf("unexpected core split: performance=%d efficiency=%d", perf, eff)
	}
}

func TestHardwareProfilePrivacy(t *testing.T) {
	p := collectHardwareProfile()
	if p.Architecture == "" || p.EngineArchitecture == "" {
		t.Fatalf("missing architecture: %+v", p)
	}
	if !strings.Contains(strings.ToLower(p.Privacy), "serial") || !strings.Contains(strings.ToLower(p.Privacy), "uuid") {
		t.Fatalf("privacy note should document omitted identifiers: %q", p.Privacy)
	}
	if runtime.GOOS != "darwin" && p.PlatformFamily != "Development host" {
		t.Fatalf("expected development fallback off macOS, got %q", p.PlatformFamily)
	}
}
