// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bytes"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAtomicPrivateJSONRecoversPreviousBackup(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "state.json")
	if err := writePrivateJSON(p, map[string]int{"value": 1}); err != nil {
		t.Fatal(err)
	}
	if err := writePrivateJSON(p, map[string]int{"value": 2}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte("corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	var got map[string]int
	if err := readPrivateJSON(p, &got); err != nil {
		t.Fatalf("backup recovery failed: %v", err)
	}
	if got["value"] != 1 {
		t.Fatalf("backup=%v want previous state", got)
	}
	if st, err := os.Stat(p + ".bak"); err != nil || st.Mode().Perm() != 0600 {
		t.Fatalf("backup mode: st=%v err=%v", st, err)
	}
}

func TestAtomicPrivateGzipRecoversPreviousBackup(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "history.json.gz")
	if err := writePrivateGzipJSON(p, map[string]int{"value": 7}); err != nil {
		t.Fatal(err)
	}
	if err := writePrivateGzipJSON(p, map[string]int{"value": 8}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte("broken gzip"), 0600); err != nil {
		t.Fatal(err)
	}
	var got map[string]int
	if err := readGzipJSON(p, &got); err != nil {
		t.Fatalf("gzip backup recovery failed: %v", err)
	}
	if got["value"] != 7 {
		t.Fatalf("got=%v", got)
	}
}

func TestRuntimeLockRejectsSecondPersistentWriter(t *testing.T) {
	t.Setenv("TMPDIR", t.TempDir())
	l1, err := acquireRuntimeLock(true)
	if err != nil {
		t.Fatal(err)
	}
	defer l1.release()
	if _, err := acquireRuntimeLock(true); err == nil {
		t.Fatal("expected second persistent lock to fail")
	}
	l1.release()
	l2, err := acquireRuntimeLock(true)
	if err != nil {
		t.Fatalf("reacquire after release: %v", err)
	}
	l2.release()
}

func TestDecodeJSONStrictAndBounded(t *testing.T) {
	var dst struct {
		Name string `json:"name"`
	}
	r := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"ok"}`))
	if err := decodeJSON(r, &dst); err != nil || dst.Name != "ok" {
		t.Fatalf("valid decode: dst=%+v err=%v", dst, err)
	}
	r = httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"ok","extra":1}`))
	if err := decodeJSON(r, &dst); err == nil {
		t.Fatal("unknown field should fail")
	}
	r = httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"ok"} {"name":"two"}`))
	if err := decodeJSON(r, &dst); err == nil {
		t.Fatal("trailing JSON should fail")
	}
	big := bytes.Repeat([]byte("x"), maxAPIJSONBytes+2)
	r = httptest.NewRequest("POST", "/", bytes.NewReader(big))
	if err := decodeJSON(r, &dst); err == nil {
		t.Fatal("oversized body should fail")
	}
}

func TestIncidentTimeWindowSeparatesDistantStories(t *testing.T) {
	rows := []IncidentEvidence{
		{At: 100, Source: "filesystem", Kind: "modified", Severity: "review", Path: "/tmp/a", Detail: "startup/persistence changed"},
		{At: 120, Source: "behavior", Kind: "executable_changed", Severity: "review", Path: "/tmp/a", Detail: "changed"},
		{At: 5000, Source: "filesystem", Kind: "modified", Severity: "review", Path: "/tmp/a", Detail: "startup/persistence changed again"},
	}
	clusters := incidentClusters(rows)
	if len(clusters) != 2 {
		t.Fatalf("clusters=%d", len(clusters))
	}
}
