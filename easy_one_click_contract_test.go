// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestEasyOneClickCheckIsReadOnlyAndVisible(t *testing.T) {
	html, err := os.ReadFile("web/easy.html")
	if err != nil { t.Fatal(err) }
	js, err := os.ReadFile("web/easy.js")
	if err != nil { t.Fatal(err) }
	all := string(html) + "\n" + string(js)
	for _, want := range []string{
		"One-click Check",
		"oneClickCheck",
		"oneClickResults",
		"/api/quick-check",
		"/api/actions/vault/isolation",
		"Security",
		"Incidents",
		"Disk pressure",
		"Recovery state",
		"Vault isolation",
		"Evidence visibility",
	} {
		if !strings.Contains(all, want) { t.Fatalf("Easy one-click check missing %q", want) }
	}
	for _, forbidden := range []string{
		"innerHTML", "eval(", "new Function", "document.write",
		"/api/actions/execute", "/api/changes/start", "/api/trust/capture", "sudo ",
	} {
		if strings.Contains(all, forbidden) { t.Fatalf("Easy one-click check contains mutating/unsafe pattern %q", forbidden) }
	}
}

func TestMainRegistersVaultIsolationReadEndpoint(t *testing.T) {
	mainFile, err := os.ReadFile("main.go")
	if err != nil { t.Fatal(err) }
	text := string(mainFile)
	if !strings.Contains(text, `mux.HandleFunc("/api/actions/vault/isolation"`) && !strings.Contains(text, `mux.HandleFunc("/api/actions/vault/isolation",`) {
		if !strings.Contains(text, "mux.HandleFunc(\"/api/actions/vault/isolation\"") {
			t.Fatal("Vault isolation route is not registered")
		}
	}
	if !strings.Contains(text, `a.handleVaultIsolation`) {
		t.Fatal("Vault isolation route does not use the typed handler")
	}
}
