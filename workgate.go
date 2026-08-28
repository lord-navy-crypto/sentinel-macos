// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"sync/atomic"
	"time"
)

type workGate struct {
	sem    chan struct{}
	active atomic.Int64
}

func newWorkGate(limit int) *workGate {
	if limit < 1 {
		limit = 1
	}
	return &workGate{sem: make(chan struct{}, limit)}
}

func (g *workGate) wrap(name string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		select {
		case g.sem <- struct{}{}:
			g.active.Add(1)
			defer func() {
				g.active.Add(-1)
				<-g.sem
			}()
			next(w, r)
		case <-time.After(150 * time.Millisecond):
			w.Header().Set("Retry-After", "1")
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Sentinel is already performing other expensive local analysis; retry in a moment", "operation": name})
		}
	}
}

func (g *workGate) status() map[string]any {
	if g == nil {
		return map[string]any{"active": 0, "capacity": 0}
	}
	return map[string]any{"active": g.active.Load(), "capacity": cap(g.sem)}
}
