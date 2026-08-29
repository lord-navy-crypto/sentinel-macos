// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestExpandedSystemConsoleCatalogIsBroadAndTyped(t *testing.T) {
	tools := systemConsoleToolDefinitions()
	if len(tools) < 40 {
		t.Fatalf("expected broad Terminal-backed catalog, got %d tools", len(tools))
	}
	want := []string{
		"hardware-profile", "disk-layout", "apfs-layout", "dns-configuration",
		"proxy-configuration", "network-quality", "battery-status", "power-assertions",
		"launchctl-list", "filevault-status", "sip-status", "gatekeeper-status",
		"system-extensions", "time-machine-status", "spotlight-status", "gatekeeper-log",
	}
	seen := map[string]SystemConsoleTool{}
	for _, tool := range tools {
		if _, exists := seen[tool.ID]; exists {
			t.Fatalf("duplicate tool id %q", tool.ID)
		}
		seen[tool.ID] = tool
	}
	for _, id := range want {
		if _, ok := seen[id]; !ok {
			t.Fatalf("expanded catalog missing %q", id)
		}
	}
}

func TestExpandedSystemConsoleReadOnlyToolsNeverExposeShellOrSudo(t *testing.T) {
	for _, tool := range systemConsoleToolDefinitions() {
		if tool.Mode != "read_only" {
			continue
		}
		base := strings.ToLower(tool.Command)
		if strings.HasSuffix(base, "/sh") || strings.HasSuffix(base, "/bash") || strings.HasSuffix(base, "/zsh") || strings.Contains(base, "sudo") {
			t.Fatalf("read-only tool %q exposes forbidden command %q", tool.ID, tool.Command)
		}
		if tool.TimeoutSeconds > int(systemConsoleMaxTimeout.Seconds()) {
			t.Fatalf("tool %q timeout %d exceeds max", tool.ID, tool.TimeoutSeconds)
		}
		for _, arg := range tool.BaseArgs {
			if strings.Contains(arg, ";") || strings.Contains(arg, "&&") || strings.Contains(arg, "||") {
				t.Fatalf("tool %q contains command-composition token in fixed arg %q", tool.ID, arg)
			}
		}
	}
}

func TestTerminalToolboxUIDomainContract(t *testing.T) {
	checks := map[string][]string{
		"web/system-console.html": {
			"Visual Terminal Toolbox",
			"macOS capabilities as big function groups",
			"system-console-domains.css",
			"system-console-domains.js",
		},
		"web/system-console-domains.js": {
			"System & Hardware",
			"Security Posture",
			"Processes & Resources",
			"Startup & Services",
			"Network",
			"Storage & Disks",
			"Power & Battery",
			"Bounded System Logs",
			"Terminal Toolbox",
		},
	}
	for path, needles := range checks {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		text := string(raw)
		for _, needle := range needles {
			if !strings.Contains(text, needle) {
				t.Fatalf("%s missing %q", path, needle)
			}
		}
		for _, forbidden := range []string{"eval(", "new Function(", ".innerHTML"} {
			if strings.Contains(text, forbidden) {
				t.Fatalf("%s contains forbidden dynamic-code/html pattern %q", path, forbidden)
			}
		}
	}
}
