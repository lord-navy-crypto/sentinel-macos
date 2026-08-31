// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestPrivateStateRejectsSymlinkReadAndWrite(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target.json")
	if err := os.WriteFile(target, []byte(`{"value":7}`), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "state.json")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}

	var got map[string]int
	if err := readPrivateJSON(link, &got); err == nil {
		t.Fatal("private state reader must reject symlink state")
	}
	if err := writePrivateJSON(link, map[string]int{"value": 8}); err == nil {
		t.Fatal("private state writer must reject symlink state")
	}
	raw, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `{"value":7}` {
		t.Fatalf("symlink target changed: %q", raw)
	}
}

func TestPrivateStateRejectsSymlinkDirectory(t *testing.T) {
	root := t.TempDir()
	realDir := filepath.Join(root, "real")
	if err := os.Mkdir(realDir, 0700); err != nil {
		t.Fatal(err)
	}
	linkDir := filepath.Join(root, "state-dir")
	if err := os.Symlink(realDir, linkDir); err != nil {
		t.Fatal(err)
	}
	if err := writePrivateJSON(filepath.Join(linkDir, "state.json"), map[string]int{"value": 1}); err == nil {
		t.Fatal("private state writer must reject a symlink final directory")
	}
}

func TestPrivateJSONReadIsBounded(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "oversized.json")
	payload := bytes.Repeat([]byte("x"), int(maxPrivateJSONBytes)+1)
	if err := os.WriteFile(p, payload, 0600); err != nil {
		t.Fatal(err)
	}
	var got any
	if err := readPrivateJSON(p, &got); err == nil {
		t.Fatal("oversized private JSON state must be rejected")
	}
}
