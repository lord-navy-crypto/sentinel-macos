// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestResourceObservatoryUltraContract(t *testing.T) {
	backendRaw, err := os.ReadFile("resource_observatory.go")
	if err != nil {
		t.Fatal(err)
	}
	backend := string(backendRaw)
	for _, want := range []string{
		"Sentinel 3.0 Resource Observatory Ultra",
		"handleResourceCurrent", "handleResourceHistory", "handleResourceExplain",
		"session-local, bounded to six hours", "TopCPU", "TopMemory",
		"pmset", "system_profiler", "memory_pressure", "vm.swapusage",
		"does not fabricate Apple's private Energy Impact metric",
	} {
		if !strings.Contains(backend, want) {
			t.Fatalf("Resource Observatory backend missing %q", want)
		}
	}

	mainRaw, _ := os.ReadFile("main.go")
	mainSrc := string(mainRaw)
	for _, want := range []string{"/api/resource/current", "/api/resource/history", "/api/resource/explain"} {
		if !strings.Contains(mainSrc, want) {
			t.Fatalf("Resource Observatory route missing %q", want)
		}
	}

	coreRaw, _ := os.ReadFile("web/app/core.js")
	core := string(coreRaw)
	if !strings.Contains(core, "'observatory'") || !strings.Contains(core, "Resource Observatory") {
		t.Fatal("System navigation must expose Resource Observatory")
	}

	runtimeRaw, _ := os.ReadFile("web/app/runtime.js")
	runtime := string(runtimeRaw)
	if !strings.Contains(runtime, "/app/resource-observatory.js") || !strings.Contains(runtime, "loadResourceObservatory") {
		t.Fatal("runtime must load Resource Observatory module")
	}

	uiRaw, _ := os.ReadFile("web/app/resource-observatory.js")
	ui := string(uiRaw)
	for _, want := range []string{
		"Sample 60s", "Why is my Mac slow?", "Why is my battery draining?",
		"Top CPU now", "Top memory now", "Resource History · 60s",
		"measured samples", "NOT ESTABLISHED", "registerLens('observatory'",
	} {
		if !strings.Contains(ui, want) {
			t.Fatalf("Resource Observatory UI missing %q", want)
		}
	}

	if _, err := os.Stat("web/app/resource-observatory.css"); err != nil {
		t.Fatal("Resource Observatory stylesheet missing")
	}
}
