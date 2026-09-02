// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestControlledWorkflowProductContract(t *testing.T) {
	backendRaw, err := os.ReadFile("controlled_workflows.go")
	if err != nil { t.Fatal(err) }
	backend := string(backendRaw)
	mainRaw, err := os.ReadFile("main.go")
	if err != nil { t.Fatal(err) }
	mainText := string(mainRaw)
	uiRaw, err := os.ReadFile("web/app/controlled-workflows-ultra.js")
	if err != nil { t.Fatal(err) }
	ui := string(uiRaw)
	runtimeRaw, err := os.ReadFile("web/app/runtime.js")
	if err != nil { t.Fatal(err) }
	runtime := string(runtimeRaw)

	for _, want := range []string{
		"pull\", \"--ff-only", "GIT_TERMINAL_PROMPT=0", "PULL --FF-ONLY", "before_head", "after_head",
		"controlledDownloadMaxBytes", "512 << 20", "O_EXCL", "IsPrivate", "IsLoopback", "~/Downloads", "DOWNLOAD",
		"controlled mutations are disabled in ephemeral mode",
	} {
		if !strings.Contains(backend, want) { t.Fatalf("controlled backend missing %q", want) }
	}
	for _, route := range []string{"/api/workflows/git/preview", "/api/workflows/git/pull", "/api/workflows/download/preview", "/api/workflows/download/execute"} {
		if !strings.Contains(mainText, route) { t.Fatalf("main route registration missing %q", route) }
	}
	for _, want := range []string{"Sentinel 3.3 Controlled Workflows Ultra", "/api/workflows/git/preview", "/api/workflows/git/pull", "/api/workflows/download/preview", "/api/workflows/download/execute", "TaskCenter"} {
		if !strings.Contains(ui, want) { t.Fatalf("controlled workflow UI missing %q", want) }
	}
	if !strings.Contains(runtime, "/app/controlled-workflows-ultra.js") || !strings.Contains(runtime, "loadControlledWorkflowsUltra") {
		t.Fatal("canonical runtime must load Controlled Workflows Ultra")
	}
	for _, bad := range []string{"zsh -c", "bash -c", "sh -c", "eval("} {
		if strings.Contains(strings.ToLower(backend), bad) || strings.Contains(strings.ToLower(ui), bad) {
			t.Fatalf("controlled workflow contains prohibited free-form execution pattern %q", bad)
		}
	}
}

func TestControlledDownloadRejectsNonPublicIPs(t *testing.T) {
	bad := []string{"127.0.0.1", "10.0.0.1", "192.168.1.5", "169.254.1.1", "::1", "fc00::1"}
	for _, raw := range bad {
		if isPublicDownloadIP(net.ParseIP(raw)) { t.Fatalf("private/local IP accepted: %s", raw) }
	}
	good := []string{"1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"}
	for _, raw := range good {
		if !isPublicDownloadIP(net.ParseIP(raw)) { t.Fatalf("public IP rejected: %s", raw) }
	}
}

func TestControlledDownloadRejectsLocalURLBeforeTransfer(t *testing.T) {
	for _, raw := range []string{"http://example.com/a", "https://localhost/a", "https://127.0.0.1/a", "file:///tmp/a"} {
		if _, err := validateHTTPSPublicURL(raw); err == nil { t.Fatalf("unsafe/non-HTTPS URL accepted: %s", raw) }
	}
}

func TestControlledGitPreviewRequiresCleanUpstream(t *testing.T) {
	git, err := exec.LookPath("git")
	if err != nil { t.Skip("git not available") }
	repo := t.TempDir()
	commands := [][]string{
		{"init", repo},
		{"-C", repo, "config", "user.name", "Sentinel Test"},
		{"-C", repo, "config", "user.email", "sentinel@example.invalid"},
	}
	for _, args := range commands {
		if out, err := exec.Command(git, args...).CombinedOutput(); err != nil { t.Fatalf("git %v: %v\n%s", args, err, out) }
	}
	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("test\n"), 0o644); err != nil { t.Fatal(err) }
	for _, args := range [][]string{{"-C", repo, "add", "README.md"}, {"-C", repo, "commit", "-m", "initial"}} {
		if out, err := exec.Command(git, args...).CombinedOutput(); err != nil { t.Fatalf("git %v: %v\n%s", args, err, out) }
	}
	preview, err := buildControlledGitPreview(repo)
	if err != nil { t.Fatal(err) }
	if !preview.Clean { t.Fatal("fresh committed repository should be clean") }
	if preview.Ready { t.Fatal("repository without upstream must not be pull-ready") }
	if preview.Upstream != "" { t.Fatalf("unexpected upstream %q", preview.Upstream) }
}

func TestControlledWorkflowJavaScriptSyntaxWhenNodeAvailable(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil { t.Skip("node not available") }
	cmd := exec.Command(node, "--check", "web/app/controlled-workflows-ultra.js")
	if out, err := cmd.CombinedOutput(); err != nil { t.Fatalf("controlled workflow JS syntax failed: %v\n%s", err, out) }
}
