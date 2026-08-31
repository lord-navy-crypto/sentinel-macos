// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

const (
	webLLMRuntimePath = "/vendor/webllm-0.2.82.mjs"
	webLLMRuntimeURL  = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.82/lib/index.js"
	webLLMRuntimeMax  = 24 << 20
)

var webLLMRuntimeCache struct {
	sync.Mutex
	data []byte
}

// handleWebLLMRuntime gives Browser and WKWebView the WebLLM JavaScript runtime
// from Sentinel's own loopback origin. The upstream URL is fixed and pinned to
// one package version; the browser never imports a cross-origin script.
func (a *app) handleWebLLMRuntime(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	webLLMRuntimeCache.Lock()
	defer webLLMRuntimeCache.Unlock()

	if len(webLLMRuntimeCache.data) == 0 {
		client := &http.Client{Timeout: 30 * time.Second}
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, webLLMRuntimeURL, nil)
		if err != nil {
			http.Error(w, "unable to prepare Local AI runtime request", http.StatusBadGateway)
			return
		}
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, "unable to download Local AI runtime", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			http.Error(w, fmt.Sprintf("Local AI runtime source returned HTTP %d", resp.StatusCode), http.StatusBadGateway)
			return
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, webLLMRuntimeMax+1))
		if err != nil {
			http.Error(w, "unable to read Local AI runtime", http.StatusBadGateway)
			return
		}
		if len(data) == 0 || len(data) > webLLMRuntimeMax {
			http.Error(w, "Local AI runtime response has an invalid size", http.StatusBadGateway)
			return
		}
		webLLMRuntimeCache.data = data
	}

	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Sentinel-Local-AI-Runtime", "WebLLM 0.2.82 same-origin bridge")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(webLLMRuntimeCache.data)))
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(webLLMRuntimeCache.data)
}
