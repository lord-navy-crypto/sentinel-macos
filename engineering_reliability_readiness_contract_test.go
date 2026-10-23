// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "os/exec"
    "strings"
    "testing"
)

func TestEngineeringReliabilityReadinessLoaderContract(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-operations.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `function loadReliabilityReadinessExtension()`,
        `script.src='/app/engineering-reliability-readiness.js'`,
        `script.dataset.sentinelEngineeringReliabilityReadiness='1'`,
        `loadReliabilityReadinessExtension();`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing reliability readiness loader marker %q", want)
        }
    }
}

func TestEngineeringReliabilityReadinessEvidenceContract(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-reliability-readiness.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `Sentinel 4.0 Reliability Exposure & Failure-Family Readiness`,
        `OPERATIONAL RELIABILITY EVIDENCE`,
        `FAILURE-FAMILY REVIEW`,
        `MODEL READINESS`,
        `MTBF / HAZARD / ROCOF STATUS: DISABLED`,
        `Failed / (done + failed); cancellation excluded`,
        `not system uptime`,
        `not hazard or ROCOF`,
        `FAMILY ≠ ROOT CAUSE`,
        `No physical reliability, survival function, hazard rate, ROCOF, MTBF`,
        `No Weibull, exponential, lognormal, or other lifetime model is fitted automatically.`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing reliability-readiness evidence marker %q", want)
        }
    }
}

func TestEngineeringReliabilityReadinessExposureContract(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-reliability-readiness.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `const evaluable=[...done,...failed];`,
        `const evaluableExposureMs=sum(evaluableDurations);`,
        `const nonEvaluableExposureMs=sum(cancelledDurations)+sum(runningDurations);`,
        `const failureShare=pct(failed.length,evaluable.length);`,
        `const incidencePer100=failureShare==null?null:failureShare*100;`,
        `const incidencePerTaskHour=operationHours>0?failed.length/operationHours:null;`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing reliability exposure formula %q", want)
        }
    }
}

func TestEngineeringReliabilityReadinessFailureFamilyBoundary(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-reliability-readiness.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `function normalizeMessage(value)`,
        `text=text.replace(/\/[^\s]+/g,'<path>');`,
        `text=text.replace(/\b\d+(?:\.\d+)?\b/g,'#');`,
        `task.kind||'operation'`,
        `task.detail||'No failure detail recorded'`,
        `Message-derived family`,
        `Similar text may have different causes`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing message-family boundary %q", want)
        }
    }
}

func TestEngineeringReliabilityReadinessIsModelGated(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-reliability-readiness.js")
    if err != nil { t.Fatal(err) }
    source := strings.ToLower(string(raw))
    for _, forbidden := range []string{
        `fetch(`,
        `api(`,
        `localstorage`,
        `sessionstorage`,
        `indexeddb`,
        `method:'post'`,
        `method:\"post\"`,
        `/api/reliability`,
        `calculateweibull`,
        `fitweibull`,
        `calculatemtbf`,
        `estimatehazard`,
        `estimaterocof`,
        `mtbf = 1/`,
        `hazard = failures`,
        `rocof = failures`,
    } {
        if strings.Contains(source, forbidden) {
            t.Fatalf("reliability readiness must remain a read-only model gate; found %q", forbidden)
        }
    }
}

func TestEngineeringReliabilityReadinessDocumentation(t *testing.T) {
    raw, err := os.ReadFile("docs/ENGINEERING_RELIABILITY_EXPOSURE_READINESS.md")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `repairable systems`,
        `non-repairable`,
        `ROCOF`,
        `censoring`,
        `Lack of Failures`,
        `message-derived families`,
        `HPP/NHPP`,
        `University of Michigan IOE`,
        `does not establish physical reliability`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing reliability documentation marker %q", want)
        }
    }
}

func TestEngineeringReliabilityReadinessJavaScriptSyntax(t *testing.T) {
    node, err := exec.LookPath("node")
    if err != nil { return }
    cmd := exec.Command(node, "--check", "web/app/engineering-reliability-readiness.js")
    if out, err := cmd.CombinedOutput(); err != nil {
        t.Fatalf("engineering-reliability-readiness.js syntax check failed: %v\n%s", err, out)
    }
}
