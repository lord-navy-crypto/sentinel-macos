// SPDX-License-Identifier: MPL-2.0
package main

import (
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
