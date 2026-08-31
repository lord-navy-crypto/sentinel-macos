// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestWorkGateDoesNotStartCancelledQueuedRequest(t *testing.T) {
	gate := newWorkGate(1)
	gate.sem <- struct{}{} // occupy the only slot without invoking a handler
	var called atomic.Bool
	h := gate.wrap("test", func(http.ResponseWriter, *http.Request) { called.Store(true) })

	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil).WithContext(ctx)
	cancel()
	w := httptest.NewRecorder()
	start := time.Now()
	h(w, req)
	if called.Load() {
		t.Fatal("cancelled queued request must not start expensive work")
	}
	if time.Since(start) >= 100*time.Millisecond {
		t.Fatal("cancelled request waited for the work-gate timeout instead of exiting promptly")
	}
	<-gate.sem
}

func TestWorkGateRejectsOversizedSystemConsoleRequestBeforeHandler(t *testing.T) {
	gate := newWorkGate(1)
	var called atomic.Bool
	h := gate.wrap("system-query", func(http.ResponseWriter, *http.Request) { called.Store(true) })
	body := bytes.Repeat([]byte("x"), systemConsoleRequestLimit+1)
	req := httptest.NewRequest(http.MethodPost, "/api/system/query", bytes.NewReader(body))
	w := httptest.NewRecorder()
	h(w, req)
	if called.Load() {
		t.Fatal("oversized System Console request must be rejected before the handler")
	}
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestWorkGatePreservesCompleteBoundedSystemConsoleBody(t *testing.T) {
	gate := newWorkGate(1)
	payload := []byte(`{"tool_id":"process-table"}`)
	var got []byte
	h := gate.wrap("system-query", func(_ http.ResponseWriter, r *http.Request) {
		got = make([]byte, r.ContentLength)
		_, _ = r.Body.Read(got)
	})
	req := httptest.NewRequest(http.MethodPost, "/api/system/query", bytes.NewReader(payload))
	w := httptest.NewRecorder()
	h(w, req)
	if !bytes.Equal(got, payload) {
		t.Fatalf("downstream body = %q, want %q", got, payload)
	}
}
