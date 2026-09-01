// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestCanonicalSystemPromotesVisualTerminalTools(t *testing.T) {
	core := readUIFile(t, "web/app/core.js")
	system := readUIFile(t, "web/app/lenses/system.js")
	for _, want := range []string{"'machine','health','tools','processes'", "Everyday Mac / 日常 Mac", "Terminal Tools / 终端工具", "No arbitrary shell / 仅开放白名单"} {
		if !strings.Contains(core, want) {
			t.Fatalf("canonical navigation missing %q", want)
		}
	}
	for _, want := range []string{"renderTools", "/api/system/console", "/api/system/query/structured", "Equivalent command / 等价命令", "READ ONLY / 只读", "MANAGED / 受控", "Raw evidence / 原始证据"} {
		if !strings.Contains(system, want) {
			t.Fatalf("canonical Terminal Tools missing %q", want)
		}
	}
	if strings.Contains(system, "exec(") || strings.Contains(system, "shell:true") {
		t.Fatal("canonical Terminal Tools must not introduce browser-side arbitrary shell execution")
	}
}

func TestPrimaryUsageDocsAreBilingual(t *testing.T) {
	for _, path := range []string{"QUICK_START.md", "GUIDE.md", "docs/PRODUCT_BALANCE_AUDIT.md", "web/terminal-guide.html", "web/system-console.html"} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		s := string(raw)
		hasChinese := false
		for _, r := range s {
			if r >= '\u4e00' && r <= '\u9fff' {
				hasChinese = true
				break
			}
		}
		if !hasChinese {
			t.Fatalf("%s has no Chinese user guidance", path)
		}
		for _, want := range []string{"English", "中文"} {
			if !strings.Contains(s, want) && path != "web/system-console.html" {
				t.Fatalf("%s missing bilingual marker %q", path, want)
			}
		}
	}
}

func TestTerminalBackendRemainsTypedBoundedAndNoShell(t *testing.T) {
	backend := readUIFile(t, "system_console.go")
	for _, want := range []string{"systemConsoleMaxTimeout", "systemConsoleOutputLimit", "normalizeSystemConsoleTarget", "exec.CommandContext", "tool.Mode != \"read_only\""} {
		if !strings.Contains(backend, want) {
			t.Fatalf("Terminal backend safety contract missing %q", want)
		}
	}
	for _, forbidden := range []string{"/bin/sh", "/bin/zsh", "sh -c", "zsh -c"} {
		if strings.Contains(backend, forbidden) {
			t.Fatalf("Terminal backend unexpectedly exposes shell marker %q", forbidden)
		}
	}
}
