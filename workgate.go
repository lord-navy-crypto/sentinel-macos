// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bytes"
	"io"
	"net/http"
	"strings"
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

func boundSystemConsoleBody(name string, w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(name, "system-") || r.Body == nil {
		return true
	}
	defer r.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(r.Body, systemConsoleRequestLimit+1))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "could not read bounded System Console request"})
		return false
	}
	if int64(len(raw)) > int64(systemConsoleRequestLimit) {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"error": "System Console request exceeds the bounded request limit"})
		return false
	}
	// The downstream strict decoder receives the complete body, not a truncated
	// LimitReader view that could turn an oversized request into a false EOF.
	r.Body = io.NopCloser(bytes.NewReader(raw))
	r.ContentLength = int64(len(raw))
	return true
}

func (g *workGate) wrap(name string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !boundSystemConsoleBody(name, w, r) {
			return
		}
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
