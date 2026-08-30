// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestOneClickCheckIsNativeProductSnapshot(t *testing.T) {
	html, err := os.ReadFile("web/index.html"); if err != nil { t.Fatal(err) }
	js, err := os.ReadFile("web/app/controller.js"); if err != nil { t.Fatal(err) }
	all := string(html) + "\n" + string(js)
	for _, want := range []string{"Sentinel 2.4","missionRibbon","evidenceStage","renderSnapshot","Run Snapshot","/api/quick-check","/api/review-queue","Attention index","Evidence boundary"} { if !strings.Contains(all, want) { t.Fatalf("snapshot missing %q", want) } }
	if strings.Contains(string(html), "/easy.html") { t.Fatal("default product must not route through the retired Easy portal") }
	start := strings.Index(string(js), "async function renderSnapshot"); end := strings.Index(string(js), "async function renderCases"); if start < 0 || end <= start { t.Fatal("could not isolate snapshot renderer") }
	snapshot := string(js)[start:end]
	for _, forbidden := range []string{"/api/actions/execute", "/api/changes/start", "/api/trust/capture", "sudo ", "rm -"} { if strings.Contains(snapshot, forbidden) { t.Fatalf("read-only snapshot renderer contains mutating/unsafe pattern %q", forbidden) } }
}

func TestMainRegistersVaultIsolationReadEndpoint(t *testing.T) {
	mainFile, err := os.ReadFile("main.go"); if err != nil { t.Fatal(err) }; text := string(mainFile)
	if !strings.Contains(text, "mux.HandleFunc(\"/api/actions/vault/isolation\"") { t.Fatal("Vault isolation route is not registered") }
	if !strings.Contains(text, "a.handleVaultIsolation") { t.Fatal("Vault isolation route does not use the typed handler") }
}
