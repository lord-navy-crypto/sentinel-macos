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
		"cacheBackend:'indexeddb'",
		"collectEvidencePacket",
		"Evidence explanation only · no shell execution",
		"Model loading is explicit",
		"Qwen3-0.6B-q4f16_1-MLC",
	} {
		if !strings.Contains(ai, want) { t.Fatalf("Local AI integration missing %q", want) }
	}
	if strings.Contains(ai, "installHeaderButton();\n  loadAI()") || strings.Contains(ai, "renderAI();\n  loadAI()") {
		t.Fatal("Local AI must never load a model automatically during application startup")
	}
	for _, want := range []string{"WebWorkerMLCEngineHandler", "https://esm.run/@mlc-ai/web-llm@0.2.82"} {
		if !strings.Contains(worker, want) { t.Fatalf("Local AI worker missing %q", want) }
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
