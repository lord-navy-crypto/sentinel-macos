// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestFingerprintFile(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "helper")
	if err := os.WriteFile(p, []byte("sentinel-v07-trust"), 0600); err != nil {
		t.Fatal(err)
	}
	h, status := fingerprintFile(p)
	if status != "verified" {
		t.Fatalf("status=%q", status)
	}
	if len(h) != 64 {
		t.Fatalf("sha256 length=%d hash=%q", len(h), h)
	}
	h2, _ := fingerprintFile(p)
	if h != h2 {
		t.Fatalf("fingerprint not stable: %s != %s", h, h2)
	}
}

func TestTrustPersistBackupRestoreAndHealth(t *testing.T) {
	d := t.TempDir()
	m := &trustManager{persistent: true, path: filepath.Join(d, "trust-profile.json"), backupPath: filepath.Join(d, "trust-profile.prev.json")}
	p1 := TrustProfile{Version: trustProfileVersion, CreatedAt: "2026-01-01T00:00:00Z", UpdatedAt: "2026-01-01T00:00:00Z", Objects: []TrustObject{{Target: "/tmp/a", Key: "/tmp/a"}}}
	p2 := TrustProfile{Version: trustProfileVersion, CreatedAt: p1.CreatedAt, UpdatedAt: "2026-01-02T00:00:00Z", Objects: []TrustObject{{Target: "/tmp/b", Key: "/tmp/b"}}}
	if err := m.persistLocked(p1); err != nil {
		t.Fatal(err)
	}
	m.profile = &p1
	if err := m.persistLocked(p2); err != nil {
		t.Fatal(err)
	}
	m.profile = &p2
	info, err := os.Stat(m.path)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0600 {
		t.Fatalf("profile mode=%o", got)
	}
	binfo, err := os.Stat(m.backupPath)
	if err != nil {
		t.Fatal(err)
	}
	if got := binfo.Mode().Perm(); got != 0600 {
		t.Fatalf("backup mode=%o", got)
	}
	var backup TrustProfile
	raw, _ := os.ReadFile(m.backupPath)
	if err := json.Unmarshal(raw, &backup); err != nil {
		t.Fatal(err)
	}
	if backup.Objects[0].Target != "/tmp/a" {
		t.Fatalf("backup target=%q", backup.Objects[0].Target)
	}
	restored, err := m.restorePrevious()
	if err != nil {
		t.Fatal(err)
	}
	if restored.Objects[0].Target != "/tmp/a" {
		t.Fatalf("restored=%q", restored.Objects[0].Target)
	}
	var swapped TrustProfile
	raw, _ = os.ReadFile(m.backupPath)
	if err := json.Unmarshal(raw, &swapped); err != nil {
		t.Fatal(err)
	}
	if swapped.Objects[0].Target != "/tmp/b" {
		t.Fatalf("swapped backup=%q", swapped.Objects[0].Target)
	}
	h := m.health()
	if !h.Healthy || !h.ProfileValid || !h.BackupValid {
		t.Fatalf("health=%+v", h)
	}
}

func TestTrustObjectContextFingerprintMatch(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "tool")
	if err := os.WriteFile(p, []byte("stable"), 0600); err != nil {
		t.Fatal(err)
	}
	h, _ := fingerprintFile(p)
	m := &trustManager{profile: &TrustProfile{Version: trustProfileVersion, CreatedAt: "x", UpdatedAt: "2026-01-01T00:00:00Z", Objects: []TrustObject{{Target: p, Key: p, SHA256: h, FingerprintStatus: "verified"}}}}
	ctx := m.objectContext(p)
	if !ctx.Profiled || ctx.Match != "fingerprint_match" {
		t.Fatalf("ctx=%+v", ctx)
	}
	if err := os.WriteFile(p, []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	ctx = m.objectContext(p)
	if ctx.Match != "fingerprint_changed" {
		t.Fatalf("after change ctx=%+v", ctx)
	}
}

func TestFingerprintTotalBudget(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "budgeted")
	if err := os.WriteFile(p, []byte("1234567890"), 0600); err != nil {
		t.Fatal(err)
	}
	remaining := int64(4)
	h, status := fingerprintFileBudgeted(p, &remaining)
	if h != "" || status != "total_budget_exceeded" {
		t.Fatalf("hash=%q status=%q", h, status)
	}
	if remaining != 4 {
		t.Fatalf("remaining changed on skipped hash: %d", remaining)
	}
}

func TestTrustDriftIndexWeightsStrongEvidence(t *testing.T) {
	low := trustDriftIndex([]TrustChange{{Severity: "info", Kind: "novel_object"}})
	high := trustDriftIndex([]TrustChange{{Severity: "high", Kind: "fingerprint_changed"}})
	if high <= low {
		t.Fatalf("high=%d low=%d", high, low)
	}
	if trustDriftBand(0) != "stable" || trustDriftBand(75) != "high" {
		t.Fatal("unexpected drift bands")
	}
}

func TestEphemeralTrustHealthWritesNothing(t *testing.T) {
	m := &trustManager{persistent: false, path: filepath.Join(t.TempDir(), "should-not-exist.json")}
	h := m.health()
	if !h.Healthy || h.Mode != "ephemeral" {
		t.Fatalf("health=%+v", h)
	}
	if _, err := os.Stat(m.path); !os.IsNotExist(err) {
		t.Fatalf("ephemeral path unexpectedly exists: %v", err)
	}
}
