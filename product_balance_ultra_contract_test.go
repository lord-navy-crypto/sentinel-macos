// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func balanceRead(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestNavigationProductBalanceUltra(t *testing.T) {
	js := balanceRead(t, "web/app/product-balance-ultra.js")
	runtime := balanceRead(t, "web/app/runtime.js")
	doc := balanceRead(t, "docs/PRODUCT_BALANCE_AUDIT.md")

	for _, want := range []string{
		"Sentinel 3.2 Product Balance Ultra",
		"label:'Observe'", "label:'Explore'", "label:'Tools'", "label:'Compare'", "label:'Act'", "label:'Investigate'", "label:'Learn'",
		"['network-quality','dns-configuration','proxy-configuration','route-table']",
		"Git Pull", "pull --ff-only", "Download", "https:",
		"Task Center", "Possibly stalled",
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("Product Balance Ultra missing %q", want)
		}
	}
	if !strings.Contains(runtime, "/app/product-balance-ultra.js") || !strings.Contains(runtime, "loadProductBalanceUltra") {
		t.Fatal("canonical runtime must dynamically load Product Balance Ultra")
	}
	for _, want := range []string{"Observe → Explore → Tools → Compare → Act → Investigate → Learn", "Managed Workflow", "Floating Task Center"} {
		if !strings.Contains(doc, want) {
			t.Fatalf("product balance audit missing %q", want)
		}
	}
}

func TestNavigationProductBalanceDoesNotExposeFreeFormCommandExecution(t *testing.T) {
	js := strings.ToLower(balanceRead(t, "web/app/product-balance-ultra.js"))
	doc := strings.ToLower(balanceRead(t, "docs/PRODUCT_BALANCE_AUDIT.md"))
	for _, bad := range []string{"zsh -c", "bash -c", "sh -c", "arbitrary shell textarea", "eval("} {
		if strings.Contains(js, bad) || strings.Contains(doc, bad) {
			t.Fatalf("product balance layer contains prohibited free-form execution pattern %q", bad)
		}
	}
}

func TestManualProductBalanceUsesTaskCenterAsVisibleProgressSurface(t *testing.T) {
	js := balanceRead(t, "web/app/product-balance-ultra.js")
	for _, want := range []string{
		"Task Center 与任务进度怎么读？",
		"真实百分比",
		"indeterminate",
		"旧的可见底部 Activity Bar",
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("Task Center manual migration missing %q", want)
		}
	}
}

func TestNavigationProductBalanceJavaScriptSyntaxWhenNodeAvailable(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not available")
	}
	cmd := exec.Command(node, "--check", "web/app/product-balance-ultra.js")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("product-balance-ultra.js syntax failed: %v\n%s", err, out)
	}
}
