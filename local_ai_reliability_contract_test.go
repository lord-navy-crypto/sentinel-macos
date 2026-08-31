// SPDX-License-Identifier: MPL-2.0
package main

import (
	"strings"
	"testing"
)

func TestLocalAIReliabilityLayerFailsVisible(t *testing.T) {
	html := readLocalAIContractFile(t, "web/index.html")
	worker := readLocalAIContractFile(t, "web/app/ai-worker.js")

	for _, want := range []string{
		"Sentinel 2.6 Local AI Reliability",
		"STALL_MS=90000",
		"ABSOLUTE_MS=600000",
		"reliableLoad",
		"Local AI initialization stalled",
		"Local AI initialization exceeded the 10-minute safety limit",
		"workerSeen.addEventListener('error'",
		"resetFailedLoad",
		"ai.worker?.terminate()",
		"ai.engine?.unload?.()",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("Local AI reliability layer missing %q", want)
		}
	}

	for _, want := range []string{
		"throw bootstrapError",
		"setTimeout(() => { throw bootstrapError; }, 0)",
		"failed to load WebLLM",
	} {
		if !strings.Contains(worker, want) {
			t.Fatalf("Local AI worker fail-visible contract missing %q", want)
		}
	}

	if strings.Contains(worker, "worker alive long enough for the UI to report") {
		t.Fatal("Local AI worker returned to the old silent bootstrap-failure behavior")
	}
}

func TestLocalAIHasSingleAssistantWithEvidenceFallback(t *testing.T) {
	html := readLocalAIContractFile(t, "web/index.html")
	workbench := readLocalAIContractFile(t, "web/app/workbench.js")

	for _, want := range []string{
		"Evidence-only fallback",
		"Analyze without model",
		"aiEvidenceFallbackForm",
		"S.Workbench?.assistantAnswer",
		"Evidence fallback",
		"data-wb-tab=\"assistant\"",
		"AI.evidenceFallback=fallback",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("unified Assistant fallback missing %q", want)
		}
	}

	if !strings.Contains(workbench, "assistantAnswer") || !strings.Contains(workbench, "deterministic-local-evidence") {
		t.Fatal("bounded deterministic evidence fallback must remain available behind the unified Assistant")
	}
}

func TestLocalAIDiagnosticsExposePrerequisitesAndStages(t *testing.T) {
	html := readLocalAIContractFile(t, "web/index.html")
	for _, want := range []string{
		"Local AI diagnostics",
		"WebGPU",
		"Worker state",
		"IndexedDB",
		"Selected model",
		"Loaded model",
		"Load phase",
		"Progress",
		"Last error",
		"Use Qwen 0.5B",
		"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("Local AI diagnostics missing %q", want)
		}
	}
}
