// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestControlPlaneUIContract(t *testing.T) {
	checks := map[string][]string{
		"web/control-plane.html": {"Security Posture","System Snapshot & Diff","Storage History","Recovery Center 2.0","Typed System Evidence","control-plane.js","control-plane-aging.js","aux-navigation.js"},
		"web/control-plane.js": {"security-posture","system-snapshot-capture","system-snapshot-diff","storage-snapshot-capture","storage-history","recovery","Continue Investigation","investigation.html","intelligence-center.html"},
		"web/system-console-investigation.js": {"continuation_targets","Continue Investigation","process-relations.html","investigation.html","Control Plane Center"},
		"web/system-console.html": {"system-console-investigation.js","controlPlaneRecipe","Start with a question, not a command","Raw evidence","aux-navigation.js"},
	}
	for path, required := range checks {
		b, err := os.ReadFile(path); if err != nil { t.Fatal(err) }
		s := string(b)
		for _, token := range required { if !strings.Contains(s, token) { t.Fatalf("%s missing %q",path,token) } }
		lower := strings.ToLower(s)
		for _, forbidden := range []string{"eval(","new function(","document.write(","innerhtml", "sudo "} {
			if strings.Contains(lower, forbidden) { t.Fatalf("%s contains forbidden UI pattern %q",path,forbidden) }
		}
	}
}

func TestExpandedLogRecipesRemainFixedAndBounded(t *testing.T) {
	want := map[string]bool{"gatekeeper-log":false,"power-log":false,"crash-log":false,"launch-failure-log":false,"mount-log":false,"network-config-log":false,"system-extension-log":false}
	for _, tool := range systemConsoleToolDefinitions() {
		if _, ok := want[tool.ID]; !ok { continue }
		want[tool.ID]=true
		if tool.Mode!="read_only" || tool.Command!="/usr/bin/log" { t.Fatalf("log recipe %s not fixed read-only /usr/bin/log: %#v",tool.ID,tool) }
		if tool.TimeoutSeconds<=0 || tool.TimeoutSeconds>15 { t.Fatalf("log recipe %s has invalid timeout",tool.ID) }
		joined:=strings.Join(tool.BaseArgs," ")
		if !strings.Contains(joined,"--last 10m") || !strings.Contains(joined,"--predicate") { t.Fatalf("log recipe %s is not bounded/fixed: %q",tool.ID,joined) }
	}
	for id, ok := range want { if !ok { t.Fatalf("missing bounded log recipe %s",id) } }
}
