// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestEngineeringOperationsBaselineExtensionContract(t *testing.T) {
	raw, err := os.ReadFile("web/app/engineering-operations.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`let lastRenderSignature=''`,
		`function renderSignature()`,
		`if(signature===lastRenderSignature)return;`,
		`function loadBaselineExtension()`,
		`script.src='/app/engineering-operations-baseline.js'`,
		`script.dataset.sentinelEngineeringOperationsBaseline='1'`,
		`loadBaselineExtension();`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Engineering Operations extension marker %q", want)
		}
	}
}

func TestEngineeringOperationsBaselineEvidenceContract(t *testing.T) {
	raw, err := os.ReadFile("web/app/engineering-operations-baseline.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`Sentinel 3.7 Engineering Operations Baseline`,
		`const MIN_RATE_WINDOW_MS=60000;`,
		`baseline={capturedAt:Date.now(),reference:summarize(retained),retainedTaskIds:new Set(retained.map(t=>t.id))}`,
		`Number(task.startedAt)>=baseline.capturedAt&&!baseline.retainedTaskIds.has(task.id)`,
		`done.length/(span/60000)`,
		`const cycleDelta=reference.medianCycle!=null&&after.medianCycle!=null?after.medianCycle-reference.medianCycle:null;`,
		`signedDuration(cycleDelta)`,
		`Directional before/after evidence is available, but no statistical significance or causal effect is claimed.`,
		`SPC readiness is not established automatically.`,
		`common/special cause`,
		`process capability`,
		`queueing steady state`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Engineering Operations baseline marker %q", want)
		}
	}
}

func TestEngineeringOperationsBaselineRemainsInMemoryAndReadOnly(t *testing.T) {
	raw, err := os.ReadFile("web/app/engineering-operations-baseline.js")
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
		`controlLimit`,
		`processCapability`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("Engineering Operations baseline must remain a bounded in-memory comparison layer; found %q", forbidden)
		}
	}
}

func TestEngineeringOperationsBaselineModelContract(t *testing.T) {
	raw, err := os.ReadFile("docs/ENGINEERING_OPERATIONS_BASELINE.md")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`phase boundary`,
		`retention-window drift`,
		`median terminal cycle time`,
		`stable or statistically controlled reference process`,
		`rational subgrouping`,
		`common-cause versus special-cause variation`,
		`Shewhart, CUSUM, EWMA`,
		`Industrial & Operations Engineering`,
		`Quality Engineering`,
		`Systems Engineering`,
		`establish statistical/model readiness`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Engineering Operations baseline model boundary %q", want)
		}
	}
}

func TestEngineeringOperationsBaselineJavaScriptSyntax(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil { return }
	for _, path := range []string{"web/app/engineering-operations.js", "web/app/engineering-operations-baseline.js"} {
		cmd := exec.Command(node, "--check", path)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%s syntax check failed: %v\n%s", path, err, out)
		}
	}
}
