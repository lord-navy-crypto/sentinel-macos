// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const runtimeLogCapacity = 2000

type runtimeLogEntry struct {
	Sequence uint64         `json:"sequence"`
	Time     time.Time      `json:"time"`
	Level    string         `json:"level"`
	Source   string         `json:"source"`
	Event    string         `json:"event,omitempty"`
	Message  string         `json:"message"`
	Fields   map[string]any `json:"fields,omitempty"`
}

type runtimeLogBuffer struct {
	mu      sync.RWMutex
	entries []runtimeLogEntry
	next    atomic.Uint64
}

func newRuntimeLogBuffer() *runtimeLogBuffer {
	return &runtimeLogBuffer{entries: make([]runtimeLogEntry, 0, runtimeLogCapacity)}
}

func (b *runtimeLogBuffer) append(level, source, event, message string, fields map[string]any) runtimeLogEntry {
	if b == nil {
		return runtimeLogEntry{}
	}
	entry := runtimeLogEntry{
		Sequence: b.next.Add(1),
		Time:     time.Now().UTC(),
		Level:    normalizeRuntimeLogLevel(level),
		Source:   boundRuntimeLogText(source, 48),
		Event:    boundRuntimeLogText(event, 80),
		Message:  boundRuntimeLogText(redactRuntimeSecrets(message), 6000),
		Fields:   sanitizeRuntimeLogFields(fields),
	}
	b.mu.Lock()
	if len(b.entries) >= runtimeLogCapacity {
		copy(b.entries, b.entries[len(b.entries)-runtimeLogCapacity+1:])
		b.entries = b.entries[:runtimeLogCapacity-1]
	}
	b.entries = append(b.entries, entry)
	b.mu.Unlock()
	return entry
}

func (b *runtimeLogBuffer) snapshot(after uint64, limit int, source, level string) []runtimeLogEntry {
	if b == nil {
		return nil
	}
	if limit <= 0 || limit > runtimeLogCapacity {
		limit = 500
	}
	source = strings.TrimSpace(strings.ToLower(source))
	level = strings.TrimSpace(strings.ToLower(level))
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]runtimeLogEntry, 0, min(limit, len(b.entries)))
	for _, entry := range b.entries {
		if entry.Sequence <= after {
			continue
		}
		if source != "" && source != "all" && strings.ToLower(entry.Source) != source {
			continue
		}
		if level != "" && level != "all" && strings.ToLower(entry.Level) != level {
			continue
		}
		out = append(out, entry)
		if len(out) > limit {
			out = out[len(out)-limit:]
		}
	}
	return out
}

func (b *runtimeLogBuffer) clear() {
	if b == nil {
		return
	}
	b.mu.Lock()
	b.entries = b.entries[:0]
	b.mu.Unlock()
}

type runtimeLogWriter struct {
	buffer *runtimeLogBuffer
	source string
}

func (w runtimeLogWriter) Write(p []byte) (int, error) {
	text := strings.TrimSpace(string(p))
	if text != "" && w.buffer != nil {
		w.buffer.append("info", w.source, "standard-log", text, nil)
	}
	return len(p), nil
}

func runtimeLogOutput(buffer *runtimeLogBuffer, fallback io.Writer) io.Writer {
	return io.MultiWriter(fallback, runtimeLogWriter{buffer: buffer, source: "backend"})
}

func normalizeRuntimeLogLevel(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug", "info", "warn", "error":
		return strings.ToLower(strings.TrimSpace(level))
	default:
		return "info"
	}
}

func boundRuntimeLogText(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) > limit {
		return value[:limit] + "…"
	}
	return value
}

func redactRuntimeSecrets(value string) string {
	for _, marker := range []string{"#token=", "X-Sentinel-Token", "sentinel_token"} {
		lowerMarker := strings.ToLower(marker)
		for cursor := 0; cursor < len(value); {
			rel := strings.Index(strings.ToLower(value[cursor:]), lowerMarker)
			if rel < 0 {
				break
			}
			i := cursor + rel
			start := i + len(marker)
			end := start
			for end < len(value) && !strings.ContainsRune(" \t\r\n&\"'", rune(value[end])) {
				end++
			}
			value = value[:start] + "[REDACTED]" + value[end:]
			cursor = start + len("[REDACTED]")
		}
	}
	return value
}

func sanitizeRuntimeLogFields(fields map[string]any) map[string]any {
	if len(fields) == 0 {
		return nil
	}
	out := make(map[string]any, len(fields))
	for key, value := range fields {
		lk := strings.ToLower(key)
		if strings.Contains(lk, "token") || strings.Contains(lk, "secret") || strings.Contains(lk, "authorization") {
			out[key] = "[REDACTED]"
			continue
		}
		switch v := value.(type) {
		case string:
			out[key] = boundRuntimeLogText(redactRuntimeSecrets(v), 1200)
		case bool, float64, float32, int, int64, int32, uint, uint64, uint32, nil:
			out[key] = v
		default:
			encoded, err := json.Marshal(v)
			if err != nil {
				out[key] = fmt.Sprint(v)
			} else {
				out[key] = boundRuntimeLogText(redactRuntimeSecrets(string(encoded)), 1200)
			}
		}
	}
	return out
}

type runtimeLogClientEvent struct {
	Level   string         `json:"level"`
	Source  string         `json:"source"`
	Event   string         `json:"event"`
	Message string         `json:"message"`
	Fields  map[string]any `json:"fields"`
}

func (a *app) handleRuntimeLogs(w http.ResponseWriter, r *http.Request) {
	if a.logs == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "runtime logging unavailable"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		after, _ := strconv.ParseUint(r.URL.Query().Get("after"), 10, 64)
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		entries := a.logs.snapshot(after, limit, r.URL.Query().Get("source"), r.URL.Query().Get("level"))
		var last uint64
		if len(entries) > 0 {
			last = entries[len(entries)-1].Sequence
		}
		writeJSON(w, http.StatusOK, map[string]any{"entries": entries, "last_sequence": last, "capacity": runtimeLogCapacity})
	case http.MethodPost:
		var event runtimeLogClientEvent
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
		if err := dec.Decode(&event); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid runtime log event"})
			return
		}
		source := strings.TrimSpace(event.Source)
		if source == "" {
			source = "client"
		}
		entry := a.logs.append(event.Level, source, event.Event, event.Message, event.Fields)
		writeJSON(w, http.StatusCreated, entry)
	case http.MethodDelete:
		a.logs.clear()
		a.logs.append("info", "backend", "log-clear", "Runtime log buffer cleared by the local Sentinel session.", nil)
		writeJSON(w, http.StatusOK, map[string]any{"cleared": true})
	default:
		w.Header().Set("Allow", "GET, POST, DELETE")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
	}
}

type runtimeLogResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *runtimeLogResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (a *app) runtimeLogHTTP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &runtimeLogResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		if a.logs == nil || r.URL.Path == "/api/runtime/logs" {
			return
		}
		level := "info"
		if rw.status >= 500 {
			level = "error"
		} else if rw.status >= 400 {
			level = "warn"
		}
		a.logs.append(level, "http", "request", r.Method+" "+r.URL.Path, map[string]any{
			"status":      rw.status,
			"duration_ms": time.Since(start).Milliseconds(),
		})
	})
}
