// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestTaskCenterReliabilityCoreContract(t *testing.T) {
	raw, err := os.ReadFile("web/app/task-center.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`Sentinel 3.4 Task Center Reliability`,
		`const MAX_VISIBLE = 8;`,
		`const MAX_RETAINED = 40;`,
		`const STALL_MS = 45000;`,
		`const DEDUPE_WINDOW_MS = 1200;`,
		`function pruneHistory()`,
		`.filter(task => task.status !== 'running')`,
		`if (tasks.size <= MAX_RETAINED) break;`,
		`const dedupeKey = options.coalesce === false ? '' : normalizeKey(options.dedupeKey || '');`,
		`function findRecentSignal(dedupeKey)`,
		`task.signalCount > 1`,
		`task signals grouped`,
		`source: options.source || ''`,
		`function setResult(id, label, action)`,
		`function setRetry(id, label, action)`,
		`resultAction: typeof options.resultAction === 'function' ? options.resultAction : null`,
		`retryAction: typeof options.retryAction === 'function' ? options.retryAction : null`,
		`data-task-result`,
		`data-task-retry`,
		`task.status === 'running' && task.indeterminate ? '…'`,
		`if (task.status === 'running' && t - task.lastChangeAt >= STALL_MS) task.stalled = true;`,
		`limits:{visible:MAX_VISIBLE,retained:MAX_RETAINED,dedupeWindowMs:DEDUPE_WINDOW_MS}`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Task Center reliability marker %q", want)
		}
	}
}

func TestTaskCenterCoalescingIsOptIn(t *testing.T) {
	raw, err := os.ReadFile("web/app/task-center.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	if strings.Contains(source, "options.dedupeKey || `${") {
		t.Fatal("Task Center must not synthesize a default dedupe key from label/kind; coalescing must remain caller-controlled")
	}
	if !strings.Contains(source, `normalizeKey(options.dedupeKey || '')`) {
		t.Fatal("Task Center must require an explicit dedupeKey for signal coalescing")
	}
}

func TestTaskCenterHistoryRemainsEphemeral(t *testing.T) {
	raw, err := os.ReadFile("web/app/task-center.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, forbidden := range []string{
		`localStorage`,
		`sessionStorage`,
		`indexedDB`,
		`/api/task-center/`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("Task Center runtime history must remain in-memory; found %q", forbidden)
		}
	}
}

func TestTaskCenterReliabilityStylesContract(t *testing.T) {
	raw, err := os.ReadFile("web/app/task-center.css")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`Sentinel 3.4 Task Center Reliability`,
		`.sentinel-task-source`,
		`.sentinel-task-actions`,
		`.sentinel-task-result`,
		`.sentinel-task-retry`,
		`.sentinel-task.indeterminate`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Task Center reliability style %q", want)
		}
	}
}

func TestTaskCenterJavaScriptSyntax(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil { return }
	cmd := exec.Command(node, "--check", "web/app/task-center.js")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("task-center.js syntax check failed: %v\n%s", err, out)
	}
}
