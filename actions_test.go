// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func newActionTestApp(t *testing.T) (*app, string) {
	t.Helper()
	rawHome := t.TempDir()
	home, err := filepath.EvalSymlinks(rawHome)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	work := filepath.Join(home, "Downloads")
	if err := os.MkdirAll(work, 0700); err != nil {
		t.Fatal(err)
	}
	a := &app{actions: newActionManager(false)}
	return a, work
}

func writeActionTestFile(t *testing.T, path, content string, mode os.FileMode) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, mode); err != nil {
		t.Fatal(err)
	}
}

func TestSafeActionRenameAndUndo(t *testing.T) {
	a, work := newActionTestApp(t)
	src := filepath.Join(work, "old.bin")
	writeActionTestFile(t, src, "alpha", 0644)
	p, err := a.buildActionPreview(ActionPreviewRequest{Action: "rename", Path: src, NewName: "new.bin"})
	if err != nil {
		t.Fatal(err)
	}
	if p.Permanent || !p.Reversible || p.ConfirmPhrase != "RENAME old.bin" {
		t.Fatalf("unexpected preview: %+v", p)
	}
	e, err := a.executePending(pendingAction{Preview: p})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(work, "new.bin")); err != nil {
		t.Fatal(err)
	}
	undo, err := a.previewUndo(e.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.executePending(pendingAction{Preview: undo}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(src); err != nil {
		t.Fatalf("undo did not restore source: %v", err)
	}
}

func TestSafeActionVaultRestoreAndPermissions(t *testing.T) {
	a, work := newActionTestApp(t)
	src := filepath.Join(work, "helper")
	writeActionTestFile(t, src, "#!/bin/sh\necho test\n", 0755)
	p, err := a.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: src})
	if err != nil {
		t.Fatal(err)
	}
	e, err := a.executePending(pendingAction{Preview: p})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Fatalf("source still exists after Vault: %v", err)
	}
	m, err := a.actions.loadVaultManifest(e.VaultID)
	if err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(m.VaultPath)
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm() != 0600 {
		t.Fatalf("vault mode=%04o", st.Mode().Perm())
	}
	rp, err := a.buildActionPreview(ActionPreviewRequest{Action: "restore", VaultID: e.VaultID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.executePending(pendingAction{Preview: rp}); err != nil {
		t.Fatal(err)
	}
	st, err = os.Stat(src)
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm() != 0755 {
		t.Fatalf("restored mode=%04o", st.Mode().Perm())
	}
}

func TestSafeActionNeverOverwrites(t *testing.T) {
	a, work := newActionTestApp(t)
	src := filepath.Join(work, "a.bin")
	dst := filepath.Join(work, "b.bin")
	writeActionTestFile(t, src, "a", 0644)
	writeActionTestFile(t, dst, "b", 0644)
	if _, err := a.buildActionPreview(ActionPreviewRequest{Action: "rename", Path: src, NewName: "b.bin"}); err == nil {
		t.Fatal("expected overwrite guard")
	}

	v, err := a.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: src})
	if err != nil {
		t.Fatal(err)
	}
	e, err := a.executePending(pendingAction{Preview: v})
	if err != nil {
		t.Fatal(err)
	}
	writeActionTestFile(t, src, "replacement", 0644)
	if _, err := a.buildActionPreview(ActionPreviewRequest{Action: "restore", VaultID: e.VaultID}); err == nil {
		t.Fatal("expected restore conflict guard")
	}
}

func TestActionGuardRejectsChangedFile(t *testing.T) {
	a, work := newActionTestApp(t)
	src := filepath.Join(work, "change.bin")
	writeActionTestFile(t, src, "before", 0644)
	p, err := a.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: src})
	if err != nil {
		t.Fatal(err)
	}
	writeActionTestFile(t, src, "after", 0644)
	if _, err := a.executePending(pendingAction{Preview: p}); err == nil {
		t.Fatal("expected stale preview guard")
	}
}

func TestSafeActionScopeRejectsDirectorySymlinkAndEphemeral(t *testing.T) {
	a, work := newActionTestApp(t)
	if _, err := a.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: work}); err == nil {
		t.Fatal("directory should be rejected")
	}
	target := filepath.Join(work, "target")
	writeActionTestFile(t, target, "x", 0644)
	link := filepath.Join(work, "link")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	if _, err := a.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: link}); err == nil {
		t.Fatal("symlink should be rejected")
	}
	external := t.TempDir()
	writeActionTestFile(t, filepath.Join(external, "outside.bin"), "outside", 0644)
	bridge := filepath.Join(work, "bridge")
	if err := os.Symlink(external, bridge); err != nil {
		t.Fatal(err)
	}
	if _, err := a.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: filepath.Join(bridge, "outside.bin")}); err == nil {
		t.Fatal("symlinked parent traversal should be rejected")
	}
	b := &app{actions: newActionManager(true)}
	if _, err := b.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: target}); err == nil {
		t.Fatal("ephemeral mode should reject mutation")
	}
}

func TestWrongConfirmationDoesNotConsumePreview(t *testing.T) {
	a, work := newActionTestApp(t)
	src := filepath.Join(work, "confirm.bin")
	writeActionTestFile(t, src, "confirm", 0644)
	p, err := a.buildActionPreview(ActionPreviewRequest{Action: "rename", Path: src, NewName: "confirmed.bin"})
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(ActionExecuteRequest{ActionID: p.ActionID, Phrase: p.ConfirmPhrase, Code: "WRONG", Acknowledge: true})
	r := httptest.NewRequest(http.MethodPost, "/api/actions/execute", bytes.NewReader(body))
	w := httptest.NewRecorder()
	a.handleActionExecute(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("wrong confirmation status=%d", w.Code)
	}
	if _, err := a.actions.peekPending(p.ActionID); err != nil {
		t.Fatalf("preview was consumed by wrong code: %v", err)
	}
	body, _ = json.Marshal(ActionExecuteRequest{ActionID: p.ActionID, Phrase: p.ConfirmPhrase, Code: p.ConfirmCode, Acknowledge: true})
	r = httptest.NewRequest(http.MethodPost, "/api/actions/execute", bytes.NewReader(body))
	w = httptest.NewRecorder()
	a.handleActionExecute(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("correct confirmation status=%d body=%s", w.Code, w.Body.String())
	}
	if _, err := os.Stat(filepath.Join(work, "confirmed.bin")); err != nil {
		t.Fatal(err)
	}
}

func TestActionStatusHasNoPermanentDelete(t *testing.T) {
	a, _ := newActionTestApp(t)
	s := a.actions.status()
	if v, _ := s["permanent_delete"].(bool); v {
		t.Fatal("permanent delete must remain disabled")
	}
}

func TestMoveRegularNoReplaceNeverClobbers(t *testing.T) {
	d := t.TempDir()
	src := filepath.Join(d, "src")
	dst := filepath.Join(d, "dst")
	writeActionTestFile(t, src, "source-data", 0644)
	writeActionTestFile(t, dst, "destination-data", 0644)
	if err := moveRegularNoReplace(src, dst); err == nil {
		t.Fatal("expected existing destination to reject no-clobber move")
	}
	gotSrc, err := os.ReadFile(src)
	if err != nil || string(gotSrc) != "source-data" {
		t.Fatalf("source changed after rejected move: %q %v", gotSrc, err)
	}
	gotDst, err := os.ReadFile(dst)
	if err != nil || string(gotDst) != "destination-data" {
		t.Fatalf("destination was clobbered: %q %v", gotDst, err)
	}
}

func TestSafeActionRejectsCredentialStoreAndMissingRestoreParent(t *testing.T) {
	a, work := newActionTestApp(t)
	home, _ := os.UserHomeDir()
	sshDir := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(sshDir, 0700); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(sshDir, "id_test")
	writeActionTestFile(t, secret, "not-a-real-key", 0600)
	if _, err := a.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: secret}); err == nil {
		t.Fatal("credential store should be excluded")
	}

	src := filepath.Join(work, "restore-parent.bin")
	writeActionTestFile(t, src, "restore-parent", 0644)
	p, err := a.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: src})
	if err != nil {
		t.Fatal(err)
	}
	e, err := a.executePending(pendingAction{Preview: p})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(work); err != nil {
		t.Fatal(err)
	}
	if _, err := a.buildActionPreview(ActionPreviewRequest{Action: "restore", VaultID: e.VaultID}); err == nil {
		t.Fatal("restore should refuse to recreate missing original parent")
	}
}

func TestActionHealthAfterVault(t *testing.T) {
	a, work := newActionTestApp(t)
	src := filepath.Join(work, "health.bin")
	writeActionTestFile(t, src, "health", 0755)
	p, err := a.buildActionPreview(ActionPreviewRequest{Action: "vault", Path: src})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.executePending(pendingAction{Preview: p}); err != nil {
		t.Fatal(err)
	}
	h := a.actions.health()
	if !h.Healthy || h.ActiveVaultItems != 1 || h.ManifestIssues != 0 {
		t.Fatalf("unexpected health: %+v", h)
	}
}
