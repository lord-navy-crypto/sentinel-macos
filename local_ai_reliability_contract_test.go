// SPDX-License-Identifier: MPL-2.0
package main

import (
	"strings"
	"testing"
)

func TestLocalAIReliabilityLayerFailsVisible(t *testing.T) {
	reliability := readLocalAIContractFile(t, "web/app/ai-reliability.js")
	worker := readLocalAIContractFile(t, "web/app/ai-worker.js")

	for _, want := range []string{
		"Sentinel 2.6 Local AI Reliability",
		"STALL_MS=90000",
		"ABSOLUTE_MS=600000",
		"UNLOAD_MS=1500",
		"GENERATION_STALL_MS=90000",
		"reliableLoad",
		"boundedUnload",
		"Local AI initialization stalled",
		"Local AI initialization exceeded the 10-minute safety limit",
		"Local AI generation stalled for 90 seconds without a new token.",
		"workerSeen.addEventListener('error'",
		"resetFailedLoad",
		"oldWorker?.terminate()",
		"Promise.race([engine.unload(),delay(UNLOAD_MS)])",
		"interruptGenerate",
	} {
		if !strings.Contains(reliability, want) {
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

func TestLocalAIReliabilityIsExternalAndCSPCompatible(t *testing.T) {
	html := readLocalAIContractFile(t, "web/index.html")
	server := readLocalAIContractFile(t, "main.go")
	if !strings.Contains(html, `<script src="/app/ai-reliability.js"></script>`) {
		t.Fatal("canonical product must load Local AI reliability as a same-origin external script")
	}
	aiPos := strings.Index(html, `<script src="/app/ai.js"></script>`)
	reliabilityPos := strings.Index(html, `<script src="/app/ai-reliability.js"></script>`)
	manualPos := strings.Index(html, `<script src="/app/manual.js"></script>`)
	if aiPos < 0 || reliabilityPos <= aiPos || manualPos <= reliabilityPos {
		t.Fatal("Local AI reliability must load after ai.js and before manual.js")
	}
	if strings.Contains(server, "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'") {
		t.Fatal("Sentinel must not weaken CSP to execute Local AI reliability")
	}
}

func TestLocalAIHasSingleAssistantWithEvidenceFallback(t *testing.T) {
	reliability := readLocalAIContractFile(t, "web/app/ai-reliability.js")
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
		if !strings.Contains(reliability, want) {
			t.Fatalf("unified Assistant fallback missing %q", want)
		}
	}

	if !strings.Contains(workbench, "assistantAnswer") || !strings.Contains(workbench, "deterministic-local-evidence") {
		t.Fatal("bounded deterministic evidence fallback must remain available behind the unified Assistant")
	}
}

func TestLocalAIDiagnosticsExposePrerequisitesAndStages(t *testing.T) {
	reliability := readLocalAIContractFile(t, "web/app/ai-reliability.js")
	for _, want := range []string{
		"Local AI diagnostics",
		"WebGPU",
		"Worker state",
		"IndexedDB",
		"Selected model",
		"Loaded model",
		"Load / generation phase",
		"Progress",
		"Last error",
		"Use Qwen 0.5B",
		"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
		"diagnosticSignature",
		"data-ai-reliability-signature",
		"panel.dataset.aiReliabilitySignature===signature",
	} {
		if !strings.Contains(reliability, want) {
			t.Fatalf("Local AI diagnostics missing %q", want)
		}
	}
}
