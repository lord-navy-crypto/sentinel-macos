// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "os/exec"
    "strings"
    "testing"
)

func TestEngineeringQualityExperimentLoaderContract(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-operations.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `function loadQualityExperimentExtension()`,
        `script.src='/app/engineering-quality-experiment.js'`,
        `script.dataset.sentinelEngineeringQualityExperiment='1'`,
        `loadQualityExperimentExtension();`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing Engineering Quality/Experiment loader marker %q", want)
        }
    }
}

func TestEngineeringQualityExperimentEvidenceContract(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-quality-experiment.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `Sentinel 3.8 Engineering Quality & Experiment Readiness`,
        `SPC STRUCTURE CHECK`,
        `CONTROL CHART STATUS: DISABLED`,
        `No Shewhart, CUSUM, EWMA, UCL, LCL`,
        `Independence / single stable distribution`,
        `Single-factor comparative experiment plan`,
        `Replication helps expose repeat variability`,
        `Randomize run order`,
        `globalThis.crypto.getRandomValues`,
        `No control limits, process capability, statistical significance, causal effect, queueing steady state, or optimization recommendation`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing Engineering Quality/Experiment marker %q", want)
        }
    }
}

func TestEngineeringQualityExperimentIsPlanOnly(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-quality-experiment.js")
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
        `/api/engineering-quality`,
        `/api/experiment`,
        `child_process`,
        `exec(`,
    } {
        if strings.Contains(source, forbidden) {
            t.Fatalf("Engineering Quality/Experiment must remain local plan-only analysis; found %q", forbidden)
        }
    }
}

func TestEngineeringQualityExperimentBounds(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-quality-experiment.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `const MAX_LEVELS=8;`,
        `const MAX_REPLICATES=10;`,
        `if(levels.length<2)`,
        `if(levels.length>MAX_LEVELS)`,
        `if(Number(draft.replicates)<2||Number(draft.replicates)>MAX_REPLICATES)`,
        `objective:'Comparative'`,
        `experimentPlan={createdAt:Date.now()`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing bounded DOE planning marker %q", want)
        }
    }
}

func TestEngineeringQualityExperimentUsesExistingEvidence(t *testing.T) {
    raw, err := os.ReadFile("web/app/engineering-quality-experiment.js")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `S.TaskCenter?.tasks`,
        `S.EngineeringOperationsBaseline`,
        `base.retainedTaskIds?.has(task.id)`,
        `baselineApi()?.afterRows?.()`,
        `task?.status!=='running'`,
        `Number(task.completedAt)-Number(task.startedAt)`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing existing-evidence reuse marker %q", want)
        }
    }
}

func TestEngineeringQualityExperimentDocumentation(t *testing.T) {
    raw, err := os.ReadFile("docs/ENGINEERING_QUALITY_EXPERIMENT_READINESS.md")
    if err != nil { t.Fatal(err) }
    source := string(raw)
    for _, want := range []string{
        `Phase I`,
        `Phase II`,
        `single-factor comparative plan`,
        `randomization`,
        `Replication`,
        `NIST Engineering Statistics Handbook`,
        `does not establish`,
        `statistical significance`,
        `causality`,
    } {
        if !strings.Contains(source, want) {
            t.Fatalf("missing quality/experiment documentation boundary %q", want)
        }
    }
}

func TestEngineeringQualityExperimentJavaScriptSyntax(t *testing.T) {
    node, err := exec.LookPath("node")
    if err != nil { return }
    cmd := exec.Command(node, "--check", "web/app/engineering-quality-experiment.js")
    if out, err := cmd.CombinedOutput(); err != nil {
        t.Fatalf("engineering-quality-experiment.js syntax check failed: %v\n%s", err, out)
    }
}
