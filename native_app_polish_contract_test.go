// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func polishRead(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestTaskCenterLivesAtBottomRight(t *testing.T) {
	css := polishRead(t, "web/app/task-center.css")
	for _, want := range []string{"right:18px;left:auto;bottom:12px", "right:10px;left:auto;bottom:10px"} {
		if !strings.Contains(css, want) {
			t.Fatalf("Task Center bottom-right placement missing %q", want)
		}
	}
	placement := polishRead(t, "web/app/task-center-placement.js")
	for _, want := range []string{"Sentinel 3.4 Task Center Bottom Right", "右下角 Task Center", "左下角 Task Center"} {
		if !strings.Contains(placement, want) {
			t.Fatalf("Task Center guidance migration missing %q", want)
		}
	}
}

func TestWorkbenchUsesLayoutDockInsteadOfFloatingContext(t *testing.T) {
	css := polishRead(t, "web/app/workbench-dock.css")
	js := polishRead(t, "web/app/workbench-dock.js")
	html := polishRead(t, "web/index.html")
	runtime := polishRead(t, "web/app/runtime.js")
	for _, want := range []string{".s24-shell.wb-dock-open", "grid-template-columns:218px 370px minmax(0,1fr)", ".s24-context.wb-docked", "position:relative!important", "grid-column:2!important", "grid-column:3!important", "wb-dock-wide"} {
		if !strings.Contains(css, want) {
			t.Fatalf("Workbench dock CSS missing %q", want)
		}
	}
	for _, want := range []string{"Sentinel 3.4 Workbench Dock", "Investigation Workbench", "wb-dock-open", "wb-docked", "dataset.workbenchDockExpand", "MutationObserver"} {
		if !strings.Contains(js, want) {
			t.Fatalf("Workbench dock behavior missing %q", want)
		}
	}
	if !strings.Contains(html, "/app/workbench-dock.css") {
		t.Fatal("canonical app must load Workbench dock layout CSS")
	}
	for _, want := range []string{"loadNativePolish", "/app/workbench-dock.js", "/app/task-center-placement.js"} {
		if !strings.Contains(runtime, want) {
			t.Fatalf("canonical runtime missing dynamic polish module %q", want)
		}
	}
	for _, bad := range []string{"<script src=\"/app/workbench-dock.js\"", "<script src=\"/app/task-center-placement.js\""} {
		if strings.Contains(html, bad) {
			t.Fatalf("polish module must not break canonical static script-count contract: %q", bad)
		}
	}
}

func TestDesktopHasNoUserFacingLocalBrowserMode(t *testing.T) {
	swift := polishRead(t, "desktop/SentinelDesktop.swift")
	for _, want := range []string{"Native App", "showProduct", "window.contentView = view", "--no-browser", "SENTINEL_NO_BROWSER", "127.0.0.1", "token.count == 48"} {
		if !strings.Contains(swift, want) {
			t.Fatalf("native-only desktop contract missing %q", want)
		}
	}
	for _, bad := range []string{"Open in Browser", "Open App View", "openBrowserProduct", "appViewButton", "browserButton", "appViewWindow", "NSWorkspace.shared.open(productURL)"} {
		if strings.Contains(swift, bad) {
			t.Fatalf("user-facing local browser mode returned: %q", bad)
		}
	}
}

func TestNativePolishJavaScriptSyntaxWhenNodeAvailable(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not available")
	}
	for _, path := range []string{"web/app/workbench-dock.js", "web/app/task-center-placement.js", "web/app/runtime.js"} {
		cmd := exec.Command(node, "--check", path)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%s syntax failed: %v\n%s", path, err, out)
		}
	}
}
