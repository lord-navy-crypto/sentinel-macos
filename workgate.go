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
		timer := time.NewTimer(150 * time.Millisecond)
		defer timer.Stop()
		select {
		case g.sem <- struct{}{}:
			g.active.Add(1)
			defer func() {
				g.active.Add(-1)
				<-g.sem
			}()
			// Re-check after acquiring the slot. If the client disappeared at the
			// same instant the slot opened, do not start an expensive local scan.
			select {
			case <-r.Context().Done():
				return
			default:
			}
			next(w, r)
		case <-r.Context().Done():
			// Navigation changes, closed tabs, and shutdown cancel queued work
			// rather than allowing a dead request to consume an analysis slot.
			return
		case <-timer.C:
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
