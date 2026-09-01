// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func readLocalAIContractFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(b)
}

func TestLocalAIIsCanonicalAndExplicitlyOptIn(t *testing.T) {
	html := readLocalAIContractFile(t, "web/index.html")
	ai := readLocalAIContractFile(t, "web/app/ai.js")
	worker := readLocalAIContractFile(t, "web/app/ai-worker.js")
	for _, want := range []string{`href="/app/ai.css"`, `src="/app/ai.js"`} {
		if !strings.Contains(html, want) {
			t.Fatalf("canonical UI missing Local AI asset %q", want)
		}
	}
	for _, want := range []string{
		"Sentinel 2.7 WebLLM Local AI",
		"Sentinel 2.7 Integrated Local AI",
		"registerLens('assistant'",
		"navigator.gpu",
		"CreateWebWorkerMLCEngine",
		"cacheBackend:'cache'",
		"collectEvidencePacket",
		"Evidence explanation only · no shell execution",
		"Model loading is explicit",
		"Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
		"Llama-3.2-3B-Instruct-q4f16_1-MLC",
		"Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC",
		"Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
		"Qwen2.5-7B-Instruct-q4f16_1-MLC",
		"Llama-3.1-8B-Instruct-q4f16_1-MLC",
		"gemma-2-9b-it-q4f16_1-MLC",
		"Model Library",
		"SMALL",
		"MEDIUM",
		"SPECIALIST",
		"LARGE",
		"data-ai-model",
		"Load / Download selected",
		"Selected model is not present in WebLLM 0.2.82 prebuiltAppConfig.",
		"/vendor/webllm-0.2.82.mjs",
	} {
		if !strings.Contains(ai, want) {
			t.Fatalf("Local AI integration missing %q", want)
		}
	}
	if strings.Contains(ai, "Qwen3-0.6B-q4f16_1-MLC") {
		t.Fatal("WebLLM 0.2.82 Local AI must not default to an unsupported Qwen3 prebuilt model")
	}
	if strings.Contains(ai, "useIndexedDBCache:true") {
		t.Fatal("Local AI must use the explicit Cache API backend instead of the retired IndexedDB flag")
	}
	if strings.Contains(ai, "installHeaderButton();\n  loadAI()") || strings.Contains(ai, "renderAI();\n  loadAI()") {
		t.Fatal("Local AI must never load a model automatically during application startup")
	}
	for _, want := range []string{"WebWorkerMLCEngineHandler", "import('/vendor/webllm-0.2.82.mjs')"} {
		if !strings.Contains(worker, want) {
			t.Fatalf("Local AI worker missing %q", want)
		}
	}
	vendorInfo, err := os.Stat("web/vendor/webllm-0.2.82.mjs")
	if err != nil {
		t.Fatalf("vendored WebLLM runtime missing: %v", err)
	}
	if vendorInfo.Size() <= 100000 {
		t.Fatalf("vendored WebLLM runtime unexpectedly small: %d bytes", vendorInfo.Size())
	}
	vendorReadme := readLocalAIContractFile(t, "web/vendor/README.md")
	vendorLicense := readLocalAIContractFile(t, "web/vendor/WEBLLM-LICENSE.txt")
	for _, want := range []string{"@mlc-ai/web-llm", "0.2.82", "loopback origin", "Model weights are not bundled"} {
		if !strings.Contains(vendorReadme, want) {
			t.Fatalf("vendored WebLLM provenance missing %q", want)
		}
	}
	if !strings.Contains(vendorLicense, "Apache License") {
		t.Fatal("vendored WebLLM Apache-2.0 license text is missing")
	}
	if strings.Contains(ai, "https://esm.run") || strings.Contains(worker, "https://esm.run") || strings.Contains(ai, "https://cdn.jsdelivr.net") || strings.Contains(worker, "https://cdn.jsdelivr.net") {
		t.Fatal("browser-side Local AI runtime must not import WebLLM from a cross-origin CDN")
	}
}

func TestLocalAIHasCuratedTieredModelLibrary(t *testing.T) {
	ai := readLocalAIContractFile(t, "web/app/ai.js")
	css := readLocalAIContractFile(t, "web/app/ai.css")
	for _, model := range []string{
		"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
		"Llama-3.2-1B-Instruct-q4f16_1-MLC",
		"Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
		"Llama-3.2-3B-Instruct-q4f16_1-MLC",
		"Qwen2.5-3B-Instruct-q4f16_1-MLC",
		"Phi-3.5-mini-instruct-q4f16_1-MLC-1k",
		"Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
		"Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC",
		"Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
		"Qwen2.5-7B-Instruct-q4f16_1-MLC",
		"Llama-3.1-8B-Instruct-q4f16_1-MLC",
		"gemma-2-9b-it-q4f16_1-MLC",
	} {
		if !strings.Contains(ai, model) {
			t.Fatalf("curated model library missing %q", model)
		}
	}
	for _, want := range []string{"vramMB:", "memory:", "focus:", "recommended:true", "official WebLLM runtime estimate", "one into GPU memory at a time"} {
		if !strings.Contains(ai, want) {
			t.Fatalf("model library metadata missing %q", want)
		}
	}
	for _, want := range []string{".ai-model-library", ".ai-model-grid", ".ai-model-card", ".ai-model-card.selected", ".ai-model-card.loaded"} {
		if !strings.Contains(css, want) {
			t.Fatalf("model library visual layer missing %q", want)
		}
	}
}

func TestLocalAIFusionTouchesCoreInvestigationWorkflows(t *testing.T) {
	ai := readLocalAIContractFile(t, "web/app/ai.js")
	css := readLocalAIContractFile(t, "web/app/ai.css")
	manualEntry := readLocalAIContractFile(t, "web/app/manual-entry.js")
	for _, want := range []string{
		"S.Workbench?.store?.selected",
		"Cross-Lens Selection",
		"selectedEvidence",
		"findManualTopics",
		"manual_context",
		"Sentinel User Manual",
		"buildFullScanPacket",
		"Full Scan AI Brief",
		"prepareFullScanBrief",
		"Guided Investigation",
		"Unknown network activity",
		"Strange startup item",
		"Investigate an application",
		"Storage suddenly increased",
		"Terminal Copilot",
		"Draft Investigation Notes",
		"Compare A / B with AI",
		"Beginner",
		"Technical",
		"Expert",
		"installContextBar",
		"installContextTrayBridge",
		"installSearchBridge",
		"data-ai-context",
		"ASK LOCAL AI",
		"AI Full Scan Brief",
		"You have no unrestricted shell authority.",
	} {
		if !strings.Contains(ai, want) {
			t.Fatalf("deep Local AI fusion missing %q", want)
		}
	}
	for _, want := range []string{
		".ai-context-bar",
		".ai-context-tray-bridge",
		".ai-workbench-bridge",
		".ai-search-bridge",
		".ai-tool-grid",
		".ai-guide-grid",
		".ai-terminal-form",
		".ai-pending",
	} {
		if !strings.Contains(css, want) {
			t.Fatalf("deep Local AI visual surface missing %q", want)
		}
	}
	for _, want := range []string{
		"本地 AI / LOCAL AI",
		"ai-overview",
		"ai-model-library",
		"ai-context",
		"ai-full-scan",
		"ai-guided",
		"ai-manual-rag",
		"ai-terminal",
		"ai-global-search",
		"ai-levels",
		"ai-boundaries",
	} {
		if !strings.Contains(manualEntry, want) {
			t.Fatalf("User Manual missing integrated AI topic %q", want)
		}
	}
	// AI may explain commands, draft text, and recommend navigation, but it must
	// not acquire the Safe Change execute API or direct shell/process execution.
	for _, forbidden := range []string{"/api/actions/execute", "exec.Command(", "child_process", "shell:true"} {
		if strings.Contains(ai, forbidden) {
			t.Fatalf("Local AI fusion gained forbidden execution path %q", forbidden)
		}
	}
}

func TestLocalAISurfaceInjectionIsIdempotent(t *testing.T) {
	ai := readLocalAIContractFile(t, "web/app/ai.js")
	for _, want := range []string{
		"contextBarSignature",
		"const signature=contextBarSignature()",
		"bar.dataset.aiSignature!==signature",
		"replacement.dataset.aiSignature=signature",
		"existing?.dataset.aiQuery===q",
		"wrap.dataset.aiQuery=q",
		"new MutationObserver(queueSurfaces).observe(stage,{childList:true})",
	} {
		if !strings.Contains(ai, want) {
			t.Fatalf("Local AI idempotency guard missing %q", want)
		}
	}
	if strings.Contains(ai, "new MutationObserver(queueSurfaces).observe(stage,{childList:true,subtree:true") {
		t.Fatal("Local AI must not observe the entire evidenceStage subtree; self-rendered controls could retrigger the observer loop")
	}
	if strings.Contains(ai, "const q=input.value.trim();panel.querySelector('.ai-search-bridge')?.remove()") {
		t.Fatal("Local AI search bridge must not unconditionally remove/recreate itself on every mutation")
	}
}

func TestLocalAIHasBoundedNetworkAndPersistentAppCache(t *testing.T) {
	server := readLocalAIContractFile(t, "main.go")
	desktop := readLocalAIContractFile(t, "desktop/SentinelDesktop.swift")
	for _, want := range []string{
		"'wasm-unsafe-eval'",
		"worker-src 'self' blob:",
		"https://huggingface.co",
		"https://*.hf.co",
		"https://*.xethub.hf.co",
		"https://raw.githubusercontent.com",
	} {
		if !strings.Contains(server, want) {
			t.Fatalf("Local AI CSP/runtime route missing bounded source %q", want)
		}
	}
	if strings.Contains(server, "script-src 'self' 'wasm-unsafe-eval' https://esm.run") || strings.Contains(server, "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net") {
		t.Fatal("browser CSP must keep Local AI scripts same-origin")
	}
	if strings.Contains(server, "webLLMRuntimeURL") || strings.Contains(server, "handleWebLLMRuntime") || strings.Contains(server, "cdn.jsdelivr.net/npm/@mlc-ai/web-llm") {
		t.Fatal("Sentinel must serve the packaged WebLLM runtime directly; runtime CDN proxy code returned")
	}
	vendorInfo, err := os.Stat("web/vendor/webllm-0.2.82.mjs")
	if err != nil || vendorInfo.Size() <= 100000 {
		t.Fatal("packaged WebLLM runtime is missing or invalid")
	}
	if !strings.Contains(desktop, "config.websiteDataStore = .default()") {
		t.Fatal("Native App View must use persistent WebKit storage so the WebLLM persistent model cache survives relaunch")
	}
	if strings.Contains(desktop, "config.websiteDataStore = .nonPersistent()") {
		t.Fatal("Native App View still uses non-persistent storage; WebLLM model cache would be discarded on relaunch")
	}
}
