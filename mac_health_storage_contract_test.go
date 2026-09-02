// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestMacHealthAndStorageGraphContract(t *testing.T) {
	goSrc, err := os.ReadFile("mac_health_storage.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(goSrc)
	for _, want := range []string{"Sentinel 2.8 Mac Health + Lazy Storage Graph", "/usr/bin/vm_stat", "/usr/bin/memory_pressure", "/usr/bin/pmset", "/usr/bin/du", "18*time.Second", "hidden_children"} {
		if !strings.Contains(src, want) {
			t.Fatalf("Mac Health/Storage Graph backend missing %q", want)
		}
	}
	mainRaw, _ := os.ReadFile("main.go")
	mainSrc := string(mainRaw)
	for _, want := range []string{"/api/health/live", "/api/storage/graph"} {
		if !strings.Contains(mainSrc, want) {
			t.Fatalf("route missing %q", want)
		}
	}
	uiRaw, _ := os.ReadFile("web/app/lenses/system.js")
	ui := string(uiRaw)
	for _, want := range []string{"Mac Health", "Generate Storage Graph", "storageGraphRows", "loadStorageGraph", "Top children per level", "Lazy, bounded expansion"} {
		if !strings.Contains(ui, want) {
			t.Fatalf("UI missing %q", want)
		}
	}
}
