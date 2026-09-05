// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestEngineeringOperationsRuntimeContract(t *testing.T) {
	raw, err := os.ReadFile("web/app/runtime.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`function loadEngineeringOperations()`,
		`script.src='/app/engineering-operations.js'`,
		`script.dataset.sentinelEngineeringOperations='1'`,
		`loadEngineeringOperations();`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Engineering Operations runtime marker %q", want)
		}
	}
}

func TestEngineeringOperationsEvidenceContract(t *testing.T) {
	raw, err := os.ReadFile("web/app/engineering-operations.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`Sentinel 3.6 Engineering Operations Intelligence`,
		`const MIN_RATE_WINDOW_MS=60000;`,
		`S.TaskCenter?.tasks`,
		`status==='running'`,
		`Number(t.completedAt)-Number(t.startedAt)`,
		`done.length/(observedSpan/60000)`,
		`task.source||task.kind||'Unspecified source'`,
		`cancellation is not treated as failure`,
		`Little’s Law or optimization claims are therefore not inferred`,
		`not a measured cognitive-workload score`,
		`not a reliability certificate`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Engineering Operations evidence marker %q", want)
		}
	}
}

func TestEngineeringOperationsDoesNotCreateSecondCollector(t *testing.T) {
	raw, err := os.ReadFile("web/app/engineering-operations.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, forbidden := range []string{
		`fetch(`,
		`api(`,
		`localStorage`,
		`sessionStorage`,
		`indexedDB`,
		`method:'POST'`,
		`method:\"POST\"`,
		`/api/engineering-operations`,
		`/api/task-center/`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("Engineering Operations must remain a bounded analysis layer over existing state; found %q", forbidden)
		}
	}
}

func TestEngineeringOperationsModelDocumentsBoundaries(t *testing.T) {
	raw, err := os.ReadFile("docs/ENGINEERING_OPERATIONS_MODEL.md")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`Industrial & Operations Engineering bridge`,
		`Systems engineering`,
		`Human factors`,
		`Quality and reliability engineering`,
		`Software and security engineering`,
		`stationary arrival process`,
		`queue discipline or queue stability`,
		`optimal concurrency level`,
		`Little's Law steady-state results`,
		`optimize only with an explicit objective and constraints`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Engineering Operations model boundary %q", want)
		}
	}
}

func TestEngineeringOperationsJavaScriptSyntax(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil { return }
	cmd := exec.Command(node, "--check", "web/app/engineering-operations.js")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("engineering-operations.js syntax check failed: %v\n%s", err, out)
	}
}
