// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestSystemConsoleCatalogSeparatesReadOnlyFromManagedActions(t *testing.T) {
	cat := SystemConsoleCatalogSnapshot()
	if len(cat.Tools) < 10 {
		t.Fatalf("catalog unexpectedly small: %d", len(cat.Tools))
	}
	seenReadOnly := false
	seenControl := false
	seenRecover := false
	for _, tool := range cat.Tools {
		if tool.ID == "process-table" && tool.Mode == "read_only" {
			seenReadOnly = true
		}
		if tool.ID == "safe-action-preview" && tool.Mode == "sentinel_action" && tool.Intent == "control" {
			seenControl = true
		}
		if tool.ID == "vault" && tool.Mode == "sentinel_action" && tool.Intent == "recover" {
			seenRecover = true
		}
		if tool.Mode == "read_only" && tool.Command == "" {
			t.Fatalf("read-only tool missing executable: %+v", tool)
		}
		if tool.Mode == "sentinel_action" && tool.Route == "" {
			t.Fatalf("managed action missing Sentinel route: %+v", tool)
		}
	}
	if !seenReadOnly || !seenControl || !seenRecover {
		t.Fatalf("missing system-console pillars: read=%v control=%v recover=%v", seenReadOnly, seenControl, seenRecover)
	}
}

func TestSystemConsoleTargetValidationRejectsArbitraryArguments(t *testing.T) {
	if _, err := normalizeSystemConsoleTarget("path", "relative/path"); err == nil {
		t.Fatal("relative path accepted")
	}
	if _, err := normalizeSystemConsoleTarget("pid", "1; rm -rf /"); err == nil {
		t.Fatal("shell-like PID accepted")
	}
	got, err := normalizeSystemConsoleTarget("path", "/tmp/../tmp/example")
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Clean("/tmp/../tmp/example") {
		t.Fatalf("path not normalized: %q", got)
	}
	if _, err := normalizeSystemConsoleTarget("", "unexpected"); err == nil {
		t.Fatal("target supplied to targetless tool")
	}
}

func TestManagedActionCannotRunThroughConsoleCommandRunner(t *testing.T) {
	_, err := RunSystemConsoleQuery(context.Background(), SystemConsoleQueryRequest{ToolID: "safe-action-execute"})
	if err == nil || !strings.Contains(err.Error(), "safe-action/recovery") {
		t.Fatalf("managed action was not blocked: %v", err)
	}
}

func TestBoundedCaptureStoresOnlyLimitButAcceptsWrites(t *testing.T) {
	b := &boundedCapture{limit: 4}
	n, err := b.Write([]byte("abcdefgh"))
	if err != nil || n != 8 {
		t.Fatalf("write=%d err=%v", n, err)
	}
	if b.String() != "abcd" || !b.truncated {
		t.Fatalf("capture=%q truncated=%v", b.String(), b.truncated)
	}
}

func TestSystemConsoleBuildsCommandWithoutShell(t *testing.T) {
	tool, ok := findSystemConsoleTool("file-metadata")
	if !ok {
		t.Fatal("file-metadata tool missing")
	}
	args, err := systemConsoleCommandArgs(tool, "/tmp/name with spaces")
	if err != nil {
		t.Fatal(err)
	}
	if len(args) != 1 || args[0] != "/tmp/name with spaces" {
		t.Fatalf("unexpected args: %#v", args)
	}
	display := systemConsoleDisplayCommand(tool, args)
	if !strings.Contains(display, "'/tmp/name with spaces'") {
		t.Fatalf("display command not safely represented: %q", display)
	}
}

func TestSystemConsoleCatalogHTTPMethodContract(t *testing.T) {
	a := &app{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/system/console", nil)
	a.handleSystemConsole(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "process-table") {
		t.Fatalf("GET status=%d body=%s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	r = httptest.NewRequest(http.MethodPost, "/api/system/console", nil)
	a.handleSystemConsole(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status=%d", w.Code)
	}
}

func TestInspectSystemObjectReturnsMetadataForExistingPath(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "sample.txt")
	if err := os.WriteFile(path, []byte("sentinel"), 0600); err != nil {
		t.Fatal(err)
	}
	out, err := InspectSystemObject(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	if !out.Exists || out.Kind != "file" || out.Path != path {
		t.Fatalf("inspection=%+v", out)
	}
	if len(out.Summary) == 0 {
		t.Fatal("inspection missing summary")
	}
	if runtime.GOOS == "darwin" && len(out.Queries) == 0 {
		t.Fatal("macOS inspection produced no query evidence")
	}
}
