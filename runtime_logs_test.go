// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRuntimeLogBufferRetainsNewestEntries(t *testing.T) {
	buffer := newRuntimeLogBuffer()
	for i := 0; i < runtimeLogCapacity+25; i++ {
		buffer.append("info", "test", "entry", fmt.Sprintf("message-%d", i), nil)
	}
	entries := buffer.snapshot(0, runtimeLogCapacity, "", "")
	if len(entries) != runtimeLogCapacity {
		t.Fatalf("expected %d retained runtime entries, got %d", runtimeLogCapacity, len(entries))
	}
	if entries[0].Sequence != 26 {
		t.Fatalf("expected oldest retained sequence 26, got %d", entries[0].Sequence)
	}
	if entries[len(entries)-1].Sequence != runtimeLogCapacity+25 {
		t.Fatalf("unexpected newest retained sequence: %d", entries[len(entries)-1].Sequence)
	}
}

func TestRuntimeLogRedactsSensitiveFieldsAndMessageToken(t *testing.T) {
	buffer := newRuntimeLogBuffer()
	entry := buffer.append("warn", "local-ai", "redaction", "request #token=0123456789abcdef&next=1", map[string]any{
		"session_token": "top-secret",
		"authorization": "Bearer secret",
		"model":         "Qwen",
	})
	if strings.Contains(entry.Message, "0123456789abcdef") {
		t.Fatalf("runtime log message retained session token: %q", entry.Message)
	}
	if got := entry.Fields["session_token"]; got != "[REDACTED]" {
		t.Fatalf("session token field not redacted: %#v", got)
	}
	if got := entry.Fields["authorization"]; got != "[REDACTED]" {
		t.Fatalf("authorization field not redacted: %#v", got)
	}
	if got := entry.Fields["model"]; got != "Qwen" {
		t.Fatalf("non-sensitive field changed unexpectedly: %#v", got)
	}
}

func TestRuntimeLogsHandlerPostReadAndClear(t *testing.T) {
	a := &app{logs: newRuntimeLogBuffer()}

	postBody := `{"level":"info","source":"local-ai","event":"init-progress","message":"loading shard","fields":{"progress":0.25}}`
	postReq := httptest.NewRequest(http.MethodPost, "/api/runtime/logs", strings.NewReader(postBody))
	postRec := httptest.NewRecorder()
	a.handleRuntimeLogs(postRec, postReq)
	if postRec.Code != http.StatusCreated {
		t.Fatalf("POST runtime log status = %d, want %d: %s", postRec.Code, http.StatusCreated, postRec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/runtime/logs?limit=20", nil)
	getRec := httptest.NewRecorder()
	a.handleRuntimeLogs(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET runtime log status = %d, want %d", getRec.Code, http.StatusOK)
	}
	var payload struct {
		Entries []runtimeLogEntry `json:"entries"`
	}
	if err := json.Unmarshal(getRec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode runtime logs GET: %v", err)
	}
	if len(payload.Entries) != 1 || payload.Entries[0].Event != "init-progress" {
		t.Fatalf("unexpected runtime log GET payload: %#v", payload.Entries)
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/runtime/logs", nil)
	deleteRec := httptest.NewRecorder()
	a.handleRuntimeLogs(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusOK {
		t.Fatalf("DELETE runtime log status = %d, want %d", deleteRec.Code, http.StatusOK)
	}
	entries := a.logs.snapshot(0, 20, "", "")
	if len(entries) != 1 || entries[0].Event != "log-clear" {
		t.Fatalf("clear should retain only the audit marker, got %#v", entries)
	}
}

func TestRuntimeLogHTTPDoesNotRecordQueryString(t *testing.T) {
	a := &app{logs: newRuntimeLogBuffer()}
	h := a.runtimeLogHTTP(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/example?token=secret&query=sensitive", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	entries := a.logs.snapshot(0, 20, "http", "")
	if len(entries) != 1 {
		t.Fatalf("expected one HTTP runtime log entry, got %d", len(entries))
	}
	if strings.Contains(entries[0].Message, "secret") || strings.Contains(entries[0].Message, "sensitive") || strings.Contains(entries[0].Message, "?") {
		t.Fatalf("HTTP runtime log leaked query data: %q", entries[0].Message)
	}
	if entries[0].Message != "GET /api/example" {
		t.Fatalf("unexpected HTTP runtime log message: %q", entries[0].Message)
	}
}
