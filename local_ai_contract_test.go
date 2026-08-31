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
	if err != nil { t.Fatalf("read %s: %v", path, err) }
	return string(b)
}

func TestLocalAIIsCanonicalAndExplicitlyOptIn(t *testing.T) {
	html := readLocalAIContractFile(t, "web/index.html")
	ai := readLocalAIContractFile(t, "web/app/ai.js")
	worker := readLocalAIContractFile(t, "web/app/ai-worker.js")
	for _, want := range []string{`href="/app/ai.css"`,`src="/app/ai.js"`} {
		if !strings.Contains(html, want) { t.Fatalf("canonical UI missing Local AI asset %q", want) }
	}
	for _, want := range []string{
		"Sentinel 2.5 WebLLM Local AI",
		"registerLens('assistant'",
		"navigator.gpu",
		"CreateWebWorkerMLCEngine",
		"useIndexedDBCache:true",
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
	} {
		if !strings.Contains(ai, want) { t.Fatalf("Local AI integration missing %q", want) }
	}
	if strings.Contains(ai, "Qwen3-0.6B-q4f16_1-MLC") {
		t.Fatal("WebLLM 0.2.82 Local AI must not default to an unsupported Qwen3 prebuilt model")
	}
	if strings.Contains(ai, "cacheBackend:'indexeddb'") {
		t.Fatal("WebLLM 0.2.82 must use useIndexedDBCache:true instead of the newer cacheBackend API")
	}
	if strings.Contains(ai, "installHeaderButton();\n  loadAI()") || strings.Contains(ai, "renderAI();\n  loadAI()") {
		t.Fatal("Local AI must never load a model automatically during application startup")
	}
	for _, want := range []string{"WebWorkerMLCEngineHandler", "https://esm.run/@mlc-ai/web-llm@0.2.82"} {
		if !strings.Contains(worker, want) { t.Fatalf("Local AI worker missing %q", want) }
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
		if !strings.Contains(ai, model) { t.Fatalf("curated model library missing %q", model) }
	}
	for _, want := range []string{"vramMB:","memory:","focus:","recommended:true","official WebLLM runtime estimate","one into GPU memory at a time"} {
		if !strings.Contains(ai, want) { t.Fatalf("model library metadata missing %q", want) }
	}
	for _, want := range []string{".ai-model-library",".ai-model-grid",".ai-model-card",".ai-model-card.selected",".ai-model-card.loaded"} {
		if !strings.Contains(css, want) { t.Fatalf("model library visual layer missing %q", want) }
	}
}

func TestLocalAIHasBoundedNetworkAndPersistentAppCache(t *testing.T) {
	server := readLocalAIContractFile(t, "main.go")
	desktop := readLocalAIContractFile(t, "desktop/SentinelDesktop.swift")
	for _, want := range []string{
		"'wasm-unsafe-eval'",
		"worker-src 'self' blob:",
		"https://esm.run",
		"https://huggingface.co",
		"https://*.hf.co",
		"https://*.xethub.hf.co",
		"https://raw.githubusercontent.com",
	} {
		if !strings.Contains(server, want) { t.Fatalf("Local AI CSP missing bounded source %q", want) }
	}
	if !strings.Contains(desktop, "config.websiteDataStore = .default()") {
		t.Fatal("Native App View must use persistent WebKit storage so the WebLLM IndexedDB model cache survives relaunch")
	}
	if strings.Contains(desktop, "config.websiteDataStore = .nonPersistent()") {
		t.Fatal("Native App View still uses non-persistent storage; WebLLM model cache would be discarded on relaunch")
	}
}