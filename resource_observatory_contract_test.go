// SPDX-License-Identifier: MPL-2.0
package main

import (
	"strings"
	"testing"
)

func TestResourceObservatoryParsersAndHistoryAreBounded(t *testing.T) {
	vm := parseVMStatObservatory("Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 10.\nPages active: 20.\nPages wired down: 5.\nPages occupied by compressor: 7.\n")
	if vm["Pages free"] != 10*16384 || vm["Pages occupied by compressor"] != 7*16384 {
		t.Fatalf("vm_stat parser mismatch: %#v", vm)
	}
	bat := parseBatteryObservatory("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1) 87%; charging; 0:20 remaining present: true")
	if bat["available"] != true || bat["charge_percent"] != 87 || bat["charging"] != true {
		t.Fatalf("battery parser mismatch: %#v", bat)
	}
	o := newResourceObservatory()
	for i := 0; i < observatoryHistoryLimit+20; i++ {
		o.append(resourceSample{CapturedAt: "2026-09-01T00:00:00Z"})
	}
	if got := len(o.snapshot()); got != observatoryHistoryLimit {
		t.Fatalf("expected bounded history %d, got %d", observatoryHistoryLimit, got)
	}
}

func TestEverydayMacObservatoryProductContract(t *testing.T) {
	core := readUIFile(t, "web/app/core.js")
	ui := readUIFile(t, "web/app/lenses/system.js")
	backend := readUIFile(t, "mac_observatory.go")
	for _, want := range []string{"Everyday Mac / 日常 Mac", "Resource & Energy / 资源与能耗"} {
		if !strings.Contains(core+ui, want) {
			t.Fatalf("observatory UI missing %q", want)
		}
	}
	for _, want := range []string{"/api/health/live", "/api/health/history", "/api/storage/graph", "observatoryHistoryLimit = 120", "hardware-health certificate"} {
		if !strings.Contains(core+ui+backend, want) {
			t.Fatalf("observatory contract missing %q", want)
		}
	}
	for _, want := range []string{"Memory pressure context / 内存压力上下文", "Preventing sleep / 阻止睡眠", "Top resource processes / 高资源进程", "Network trend / 网络趋势"} {
		if !strings.Contains(ui, want) {
			t.Fatalf("observatory explanation missing %q", want)
		}
	}
}
