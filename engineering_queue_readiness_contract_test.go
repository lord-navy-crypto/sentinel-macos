// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "os/exec"
    "strings"
    "testing"
)

func TestEngineeringQueueReadinessEvidenceContract(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-queue-readiness.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `Sentinel 3.9 Queue & Capacity Model Readiness`,
        `QUEUEING EVIDENCE`,
        `LITTLE’S LAW READINESS`,
        `ASSUMPTION LEDGER`,
        `M/M/1 STATUS: DISABLED`,
        `Observed overlap, not a server-count measurement`,
        `Poisson arrivals are not inferred`,
        `exponential service is not inferred`,
        `STABILITY STILL NOT ESTABLISHED`,
        `No service capacity, utilization optimum, safe concurrency limit, waiting-time prediction, queue stability, or optimization recommendation`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing queue/capacity readiness marker %q", want)
        }
    }
}

func TestEngineeringQueueReadinessUsesExistingTaskEvidence(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-queue-readiness.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `S.TaskCenter?.tasks`,
        `Number(task?.startedAt)>0`,
        `Number(task?.completedAt)>0`,
        `Number(task.completedAt)-Number(task.startedAt)`,
        `interarrival.push(starts[i]-starts[i-1])`,
        `timeAverage:span>0?area/span:null`,
        `max=Math.max(max,current)`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing retained task evidence marker %q", want)
        }
    }
}

func TestEngineeringQueueReadinessDoesNotEnableQueueModel(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-queue-readiness.js")
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
        `/api/queue`,
        `/api/capacity`,
        `utilization =`,
        `rho =`,
        `1/(mu-lambda)`,
    } {
        if strings.Contains(source, forbidden) {
            t.Fatalf("queue readiness must remain a read-only model gate; found %q", forbidden)
        }
    }
}

func TestEngineeringQueueReadinessFiniteAccountingBoundary(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-queue-readiness.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `const finiteAccounting=!conc.censored&&arrivals>0&&arrivals===completions&&conc.span>0&&meanCycle!=null;`,
        `const lambdaPerMs=finiteAccounting?arrivals/conc.span:null;`,
        `const littleProduct=finiteAccounting?lambdaPerMs*meanCycle:null;`,
        `Finite-window accounting consistency`,
        `not a proof of steady state`,
        `Expected near zero for this closed finite retained window by construction`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing finite-accounting boundary %q", want)
        }
    }
}

func TestEngineeringQueueReadinessDocumentation(t *testing.T) {
    raw, err := os.ReadFile("docs/ENGINEERING_QUEUE_CAPACITY_READINESS.md")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `stable queueing system`,
        `single-server structure`,
        `Poisson arrivals`,
        `exponential service times`,
        `accounting diagnostic`,
        `Assumption ledger`,
        `M/M/1 is disabled by default`,
        `University of Michigan IOE`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing queue/capacity documentation marker %q", want)
        }
    }
}

func TestEngineeringQueueReadinessJavaScriptSyntax(t *testing.T) {
    node, err := exec.LookPath("node")
    if err != nil { return }
    cmd := exec.Command(node, "--check", "web/app/engineering-queue-readiness.js")
    if out, err := cmd.CombinedOutput(); err != nil {
        t.Fatalf("engineering-queue-readiness.js syntax check failed: %v\n%s", err, out)
    }
}
