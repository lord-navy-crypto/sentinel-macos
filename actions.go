// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	actionPreviewTTL     = 5 * time.Minute
	actionGuardHashLimit = int64(64 << 20) // 64 MiB
	actionJournalLimit   = 200
	actionJournalVersion = 1
	vaultManifestVersion = 1
)

type ActionPreviewRequest struct {
	Action    string `json:"action"`
	Path      string `json:"path,omitempty"`
	NewName   string `json:"new_name,omitempty"`
	VaultID   string `json:"vault_id,omitempty"`
	JournalID string `json:"journal_id,omitempty"`
}

type ActionExecuteRequest struct {
	ActionID    string `json:"action_id"`
	Phrase      string `json:"phrase"`
	Code        string `json:"code"`
	Acknowledge bool   `json:"acknowledge"`
}

type ActionDependency struct {
	Kind     string `json:"kind"`
	Severity string `json:"severity"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
}

type ActionObjectGuard struct {
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	ModifiedNS int64  `json:"modified_ns"`
	Mode       uint32 `json:"mode"`
	SHA256     string `json:"sha256,omitempty"`
	HashStatus string `json:"hash_status"`
}

type ActionPreview struct {
	ActionID      string             `json:"action_id"`
	Action        string             `json:"action"`
	DisplayAction string             `json:"display_action"`
	Source        string             `json:"source"`
	Destination   string             `json:"destination,omitempty"`
	ObjectName    string             `json:"object_name"`
	Size          int64              `json:"size"`
	SHA256        string             `json:"sha256,omitempty"`
	HashStatus    string             `json:"hash_status"`
	Risk          int                `json:"risk"`
	Signals       []string           `json:"signals,omitempty"`
	Dependencies  []ActionDependency `json:"dependencies,omitempty"`
	Trust         TrustObjectContext `json:"trust"`
	Consequences  []string           `json:"consequences"`
	ConfirmPhrase string             `json:"confirm_phrase"`
	ConfirmCode   string             `json:"confirm_code"`
	ExpiresAt     string             `json:"expires_at"`
	Reversible    bool               `json:"reversible"`
	Permanent     bool               `json:"permanent"`
	Disclaimer    string             `json:"disclaimer"`
	VaultID       string             `json:"vault_id,omitempty"`
	JournalID     string             `json:"journal_id,omitempty"`
	guard         ActionObjectGuard
}

type VaultManifest struct {
	Version      int      `json:"version"`
	ID           string   `json:"id"`
	OriginalPath string   `json:"original_path"`
	OriginalName string   `json:"original_name"`
	VaultPath    string   `json:"vault_path,omitempty"`
	MovedAt      string   `json:"moved_at"`
	RestoredAt   string   `json:"restored_at,omitempty"`
	Size         int64    `json:"size"`
	OriginalMode uint32   `json:"original_mode"`
	ModifiedNS   int64    `json:"modified_ns"`
	SHA256       string   `json:"sha256,omitempty"`
	HashStatus   string   `json:"hash_status"`
	Risk         int      `json:"risk"`
	Evidence     []string `json:"evidence,omitempty"`
	StartupRefs  []string `json:"startup_refs,omitempty"`
	RunningPIDs  []int    `json:"running_pids,omitempty"`
	TrustMatch   string   `json:"trust_match,omitempty"`
	Note         string   `json:"note"`
}

type ActionObservation struct {
	SourceExists      bool     `json:"source_exists"`
	DestinationExists bool     `json:"destination_exists"`
	RunningPIDs       []int    `json:"running_pids,omitempty"`
	StartupRefs       []string `json:"startup_refs,omitempty"`
	TrustMatch        string   `json:"trust_match,omitempty"`
	Note              string   `json:"note"`
}

type ActionJournalEntry struct {
	ID          string            `json:"id"`
	At          string            `json:"at"`
	Action      string            `json:"action"`
	Status      string            `json:"status"`
	ObjectName  string            `json:"object_name"`
	From        string            `json:"from,omitempty"`
	To          string            `json:"to,omitempty"`
	VaultID     string            `json:"vault_id,omitempty"`
	SHA256      string            `json:"sha256,omitempty"`
	Size        int64             `json:"size,omitempty"`
	Message     string            `json:"message"`
	Reversible  bool              `json:"reversible"`
	Observation ActionObservation `json:"observation"`
}

type ActionHealth struct {
	Enabled          bool     `json:"enabled"`
	Healthy          bool     `json:"healthy"`
	Mode             string   `json:"mode"`
	StateDirMode     string   `json:"state_dir_mode,omitempty"`
	VaultDirMode     string   `json:"vault_dir_mode,omitempty"`
	JournalExists    bool     `json:"journal_exists"`
	JournalMode      string   `json:"journal_mode,omitempty"`
	JournalValid     bool     `json:"journal_valid"`
	JournalEntries   int      `json:"journal_entries"`
	ActiveVaultItems int      `json:"active_vault_items"`
	VaultBytes       int64    `json:"vault_bytes"`
	ManifestIssues   int      `json:"manifest_issues"`
	Issues           []string `json:"issues,omitempty"`
	Advisories       []string `json:"advisories,omitempty"`
	Privacy          string   `json:"privacy"`
}

type pendingAction struct {
	Preview ActionPreview
	Request ActionPreviewRequest
	Created time.Time
}

type actionManager struct {
	mu          sync.Mutex
	journalMu   sync.Mutex
	persistent  bool
	stateDir    string
	vaultDir    string
	journalPath string
	pending     map[string]pendingAction
}

func sentinelStateDir() string {
	p := behaviorBaselinePath()
	if p == "" {
		return ""
	}
	return filepath.Dir(p)
}

func newActionManager(ephemeral bool) *actionManager {
	state := sentinelStateDir()
	m := &actionManager{persistent: !ephemeral, stateDir: state, pending: map[string]pendingAction{}}
	if state != "" {
		m.vaultDir = filepath.Join(state, "Vault")
		m.journalPath = filepath.Join(state, "action-journal.json")
	}
	return m
}

func (m *actionManager) status() map[string]any {
	mode := "persistent-local"
	if !m.persistent {
		mode = "ephemeral-read-only"
	}
	return map[string]any{
		"enabled":          m.persistent,
		"mode":             mode,
		"supported":        []string{"rename", "vault", "restore", "reveal-in-finder"},
		"permanent_delete": false,
		"scope":            "Regular, non-symlink files inside the current user's home directory. Sentinel state, credential stores, directories, app bundles, and the running Sentinel binary are excluded.",
		"principles":       []string{"No permanent deletion", "No overwrite", "Preview before mutation", "Typed confirmation + one-time code", "Revalidate object before execute", "Recovery metadata is local and user-only"},
	}
}

func randomActionCode() string {
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return strings.ToUpper(randomToken(3))
	}
	return strings.ToUpper(hex.EncodeToString(b))
}

func pathWithin(base, target string) bool {
	if base == "" || target == "" {
		return false
	}
	ba, err1 := filepath.Abs(filepath.Clean(base))
	ta, err2 := filepath.Abs(filepath.Clean(target))
	if err1 != nil || err2 != nil {
		return false
	}
	rel, err := filepath.Rel(ba, ta)
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator)))
}

func samePath(a, b string) bool {
	aa, e1 := filepath.Abs(filepath.Clean(a))
	bb, e2 := filepath.Abs(filepath.Clean(b))
	return e1 == nil && e2 == nil && aa == bb
}

// moveRegularNoReplace moves one regular-file name to another without ever
// replacing an existing destination. os.Link provides an atomic EEXIST guard;
// removing the old name happens only after the destination link exists. This
// intentionally fails across filesystems rather than falling back to copy+delete.
func moveRegularNoReplace(source, destination string) error {
	if err := os.Link(source, destination); err != nil {
		return err
	}
	if err := os.Remove(source); err != nil {
		_ = os.Remove(destination)
		return err
	}
	return nil
}

func protectedUserPath(home, p string) bool {
	protected := []string{
		filepath.Join(home, ".ssh"),
		filepath.Join(home, ".gnupg"),
		filepath.Join(home, "Library", "Keychains"),
	}
	for _, x := range protected {
		if pathWithin(x, p) {
			return true
		}
	}
	return false
}

// actionMutablePath is the central mutation boundary for ordinary user files.
// Safe Actions deliberately reject directories, symlinks (including symlinked
// parent traversal), credential stores, Sentinel state, and anything outside HOME.
func actionMutablePath(path string) (string, os.FileInfo, error) {
	path = normalizeEvidencePath(path)
	if path == "" || !filepath.IsAbs(path) {
		return "", nil, fmt.Errorf("an absolute file path is required")
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return "", nil, fmt.Errorf("user home directory is unavailable")
	}
	if !pathWithin(home, path) {
		return "", nil, fmt.Errorf("Safe Actions are limited to files inside the current user's home directory")
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", nil, err
	}
	if !samePath(path, resolved) {
		return "", nil, fmt.Errorf("paths that traverse symbolic links are excluded from Safe Actions")
	}
	if !pathWithin(home, resolved) {
		return "", nil, fmt.Errorf("resolved file path leaves the current user's home directory")
	}
	state := sentinelStateDir()
	if state != "" && pathWithin(state, path) {
		return "", nil, fmt.Errorf("Sentinel state and Vault files cannot be mutated through Safe Actions")
	}
	if protectedUserPath(home, path) {
		return "", nil, fmt.Errorf("credential/key storage paths are excluded from Safe Actions")
	}
	if exe, err := os.Executable(); err == nil && samePath(exe, path) {
		return "", nil, fmt.Errorf("Sentinel cannot mutate the executable currently serving this session")
	}
	st, err := os.Lstat(path)
	if err != nil {
		return "", nil, err
	}
	if st.Mode()&os.ModeSymlink != 0 {
		return "", nil, fmt.Errorf("symbolic links are not eligible for Safe Actions")
	}
	if !st.Mode().IsRegular() {
		return "", nil, fmt.Errorf("only regular files are eligible for Safe Actions")
	}
	return path, st, nil
}

func vaultMutablePath(m *actionManager, path string) (string, os.FileInfo, error) {
	if m == nil || m.vaultDir == "" {
		return "", nil, fmt.Errorf("Sentinel Vault is unavailable")
	}
	path = normalizeEvidencePath(path)
	if path == "" || !filepath.IsAbs(path) || !pathWithin(m.vaultDir, path) {
		return "", nil, fmt.Errorf("Vault object path is invalid")
	}
	if filepath.Base(path) != "object" {
		return "", nil, fmt.Errorf("Vault source is not a managed object")
	}
	st, err := os.Lstat(path)
	if err != nil {
		return "", nil, err
	}
	if st.Mode()&os.ModeSymlink != 0 || !st.Mode().IsRegular() {
		return "", nil, fmt.Errorf("Vault source is not a regular managed file")
	}
	return path, st, nil
}

// guardForPath captures a bounded time-of-check snapshot. Small files receive a
// SHA-256 guard; larger files use metadata so previews remain bounded. The guard
// is revalidated immediately before any mutation.
func guardForPath(path string, st os.FileInfo) ActionObjectGuard {
	g := ActionObjectGuard{Path: path, Size: st.Size(), ModifiedNS: st.ModTime().UnixNano(), Mode: uint32(st.Mode()), HashStatus: "not_checked"}
	if st.Size() <= actionGuardHashLimit {
		if h, err := sha256File(context.Background(), path); err == nil {
			g.SHA256 = h
			g.HashStatus = "verified"
		} else {
			g.HashStatus = "unreadable"
		}
	} else {
		g.HashStatus = "too_large_for_action_guard"
	}
	return g
}

func revalidateGuard(g ActionObjectGuard) error {
	path, st, err := actionMutablePath(g.Path)
	if err != nil {
		return fmt.Errorf("object changed or became unavailable: %w", err)
	}
	if !samePath(path, g.Path) || st.Size() != g.Size || st.ModTime().UnixNano() != g.ModifiedNS || uint32(st.Mode()) != g.Mode {
		return fmt.Errorf("object metadata changed after preview; create a new preview")
	}
	if g.SHA256 != "" {
		h, err := sha256File(context.Background(), path)
		if err != nil {
			return fmt.Errorf("could not revalidate object fingerprint")
		}
		if h != g.SHA256 {
			return fmt.Errorf("object content changed after preview; create a new preview")
		}
	}
	return nil
}

func revalidateVaultGuard(m *actionManager, g ActionObjectGuard) error {
	path, st, err := vaultMutablePath(m, g.Path)
	if err != nil {
		return fmt.Errorf("Vault object changed or became unavailable: %w", err)
	}
	if !samePath(path, g.Path) || st.Size() != g.Size || st.ModTime().UnixNano() != g.ModifiedNS || uint32(st.Mode()) != g.Mode {
		return fmt.Errorf("Vault object metadata changed after preview; create a new preview")
	}
	if g.SHA256 != "" {
		h, err := sha256File(context.Background(), path)
		if err != nil {
			return fmt.Errorf("could not revalidate Vault object fingerprint")
		}
		if h != g.SHA256 {
			return fmt.Errorf("Vault object content changed after preview; create a new preview")
		}
	}
	return nil
}

func startupRefsForPath(path string) []string {
	path = normalizeEvidencePath(path)
	var out []string
	for _, s := range collectStartupItems() {
		if samePath(normalizeEvidencePath(s.Executable), path) {
			out = append(out, s.Path)
		}
	}
	return uniqueStrings(out)
}

func runningPIDsForPaths(paths ...string) []int {
	wanted := map[string]bool{}
	for _, p := range paths {
		p = normalizeEvidencePath(p)
		if p != "" {
			wanted[p] = true
		}
	}
	var out []int
	for _, p := range parsePS(100000) {
		if target, _ := processAuditPath(p); wanted[normalizeEvidencePath(target)] {
			out = append(out, p.PID)
		}
	}
	sort.Ints(out)
	return out
}

func (a *app) actionDependencies(path string) ([]ActionDependency, int, []string, TrustObjectContext) {
	risk, signals := scorePath(path)
	var deps []ActionDependency
	refs := startupRefsForPath(path)
	if len(refs) > 0 {
		risk += 25
		deps = append(deps, ActionDependency{Kind: "startup_reference", Severity: "high", Title: "Startup configuration references this file", Detail: strings.Join(refs, " · ")})
	}
	pids := runningPIDsForPaths(path)
	if len(pids) > 0 {
		risk += 20
		nets, _ := collectNetwork()
		ncount := 0
		pidset := map[int]bool{}
		for _, p := range pids {
			pidset[p] = true
		}
		for _, n := range nets {
			if pidset[n.PID] {
				ncount++
			}
		}
		deps = append(deps, ActionDependency{Kind: "running_process", Severity: "high", Title: "This file is associated with a currently running process", Detail: fmt.Sprintf("PIDs %v · %d observed TCP entries. Renaming or moving the on-disk file does not terminate an already-running process.", pids, ncount)})
	}
	trust := TrustObjectContext{Match: "unprofiled"}
	if a.trust != nil {
		trust = a.trust.objectContext(path)
		if trust.Profiled {
			deps = append(deps, ActionDependency{Kind: "trusted_profile", Severity: "review", Title: "Object exists in the user-approved Trusted Profile", Detail: "A profile match is context, not proof of safety. Review why this object is being changed."})
		}
	}
	if risk > 100 {
		risk = 100
	}
	return deps, risk, signals, trust
}

func validateRenameName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." {
		return fmt.Errorf("enter a valid new filename")
	}
	if len(name) > 200 {
		return fmt.Errorf("new filename is too long")
	}
	if strings.ContainsAny(name, "/\\") {
		return fmt.Errorf("new name must be a base filename, not a path")
	}
	return nil
}

// buildActionPreview never mutates the target. It explains dependencies and
// consequences, then creates a short-lived server-side confirmation gate.
func (a *app) buildActionPreview(req ActionPreviewRequest) (ActionPreview, error) {
	if a.actions == nil || !a.actions.persistent {
		return ActionPreview{}, fmt.Errorf("Safe Actions are disabled in --ephemeral mode because recovery metadata must remain persistent")
	}
	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action == "undo" {
		return a.previewUndo(req.JournalID)
	}
	var path string
	var st os.FileInfo
	var err error
	var manifest VaultManifest
	if action == "restore" {
		manifest, err = a.actions.loadVaultManifest(req.VaultID)
		if err != nil {
			return ActionPreview{}, err
		}
		if manifest.VaultPath == "" {
			return ActionPreview{}, fmt.Errorf("Vault item is not active")
		}
		path, st, err = vaultMutablePath(a.actions, manifest.VaultPath)
	} else {
		path, st, err = actionMutablePath(req.Path)
	}
	if err != nil {
		return ActionPreview{}, err
	}
	dest := ""
	vaultID := req.VaultID
	switch action {
	case "rename":
		if err := validateRenameName(req.NewName); err != nil {
			return ActionPreview{}, err
		}
		dest = filepath.Join(filepath.Dir(path), strings.TrimSpace(req.NewName))
		if samePath(path, dest) {
			return ActionPreview{}, fmt.Errorf("new name is unchanged")
		}
		if _, err := os.Lstat(dest); !os.IsNotExist(err) {
			if err == nil {
				return ActionPreview{}, fmt.Errorf("destination already exists; Sentinel never overwrites")
			}
			return ActionPreview{}, err
		}
	case "vault":
		vaultID = "v-" + randomToken(6)
		dest = filepath.Join(a.actions.vaultDir, vaultID, "object")
	case "restore":
		dest = normalizeEvidencePath(manifest.OriginalPath)
		if dest == "" || !filepath.IsAbs(dest) {
			return ActionPreview{}, fmt.Errorf("Vault manifest original path is invalid")
		}
		home, _ := os.UserHomeDir()
		if !pathWithin(home, dest) || protectedUserPath(home, dest) {
			return ActionPreview{}, fmt.Errorf("original restore destination is outside the allowed Safe Actions scope")
		}
		parent := filepath.Dir(dest)
		parentInfo, parentErr := os.Lstat(parent)
		if parentErr != nil || !parentInfo.IsDir() || parentInfo.Mode()&os.ModeSymlink != 0 {
			return ActionPreview{}, fmt.Errorf("original parent directory is missing, not a directory, or is a symbolic link; Sentinel will not recreate it automatically")
		}
		if _, err := os.Lstat(dest); !os.IsNotExist(err) {
			if err == nil {
				return ActionPreview{}, fmt.Errorf("original destination already exists; Sentinel will not overwrite it")
			}
			return ActionPreview{}, err
		}
	default:
		return ActionPreview{}, fmt.Errorf("unsupported action")
	}
	deps, risk, signals, trust := a.actionDependencies(func() string {
		if action == "restore" {
			return dest
		}
		return path
	}())
	guard := guardForPath(path, st)
	phrase := ""
	consequences := []string{}
	switch action {
	case "rename":
		phrase = "RENAME " + filepath.Base(path)
		consequences = []string{"References that expect the old path may stop working.", "Renaming does not stop an already-running process.", "Changing a filename or extension is not a security boundary and does not prove malware is neutralized."}
	case "vault":
		phrase = "VAULT " + filepath.Base(path)
		consequences = []string{"The object will move to Sentinel Vault and its executable permission bits will be removed.", "Applications or startup items that expect the original path may stop working.", "An already-running process is not terminated by moving the on-disk file.", "Vaulting is reversible evidence handling, not proof the object was malicious or neutralized."}
	case "restore":
		phrase = "RESTORE " + manifest.OriginalName
		consequences = []string{"The Vault object will return to its recorded original path and recorded permission bits.", "Sentinel refuses to overwrite any object that now exists at the original destination.", "Restoring can re-enable path-based application or startup behavior."}
	}
	preview := ActionPreview{ActionID: randomToken(12), Action: action, DisplayAction: actionDisplayName(action), Source: path, Destination: dest, ObjectName: filepath.Base(path), Size: st.Size(), SHA256: guard.SHA256, HashStatus: guard.HashStatus, Risk: risk, Signals: signals, Dependencies: deps, Trust: trust, Consequences: consequences, ConfirmPhrase: phrase, ConfirmCode: randomActionCode(), ExpiresAt: time.Now().Add(actionPreviewTTL).UTC().Format(time.RFC3339), Reversible: true, Permanent: false, Disclaimer: "Sentinel has not proven this object is malware. Safe Actions may break software. Review the target, dependency evidence, and recovery path before continuing.", VaultID: vaultID, JournalID: req.JournalID, guard: guard}
	a.actions.storePending(preview, req)
	return preview, nil
}

func actionDisplayName(action string) string {
	switch action {
	case "rename":
		return "Rename"
	case "vault":
		return "Move to Sentinel Vault"
	case "restore":
		return "Restore from Vault"
	}
	return action
}

func (m *actionManager) storePending(p ActionPreview, req ActionPreviewRequest) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for k, v := range m.pending {
		if now.Sub(v.Created) > actionPreviewTTL {
			delete(m.pending, k)
		}
	}
	m.pending[p.ActionID] = pendingAction{Preview: p, Request: req, Created: now}
}
func (m *actionManager) peekPending(id string) (pendingAction, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.pending[id]
	if !ok {
		return pendingAction{}, fmt.Errorf("action preview expired or does not exist")
	}
	if time.Since(p.Created) > actionPreviewTTL {
		delete(m.pending, id)
		return pendingAction{}, fmt.Errorf("action preview expired")
	}
	return p, nil
}
func (m *actionManager) consumePending(id string) (pendingAction, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.pending[id]
	if !ok {
		return pendingAction{}, fmt.Errorf("action preview expired or does not exist")
	}
	if time.Since(p.Created) > actionPreviewTTL {
		delete(m.pending, id)
		return pendingAction{}, fmt.Errorf("action preview expired")
	}
	delete(m.pending, id)
	return p, nil
}

func (a *app) previewUndo(journalID string) (ActionPreview, error) {
	e, err := a.actions.journalEntry(journalID)
	if err != nil {
		return ActionPreview{}, err
	}
	if e.Status != "success" || !e.Reversible {
		return ActionPreview{}, fmt.Errorf("journal entry is not reversible")
	}
	if e.Action == "vault" && e.VaultID != "" {
		return a.buildActionPreview(ActionPreviewRequest{Action: "restore", VaultID: e.VaultID, JournalID: journalID})
	}
	if e.Action == "rename" {
		return a.buildActionPreview(ActionPreviewRequest{Action: "rename", Path: e.To, NewName: filepath.Base(e.From), JournalID: journalID})
	}
	return ActionPreview{}, fmt.Errorf("this journal action has no supported undo path")
}

func ensureActionState(m *actionManager) error {
	if !m.persistent {
		return fmt.Errorf("persistent action state is disabled")
	}
	if m.stateDir == "" {
		return fmt.Errorf("Sentinel state directory is unavailable")
	}
	if err := os.MkdirAll(m.stateDir, 0700); err != nil {
		return err
	}
	_ = os.Chmod(m.stateDir, 0700)
	if err := os.MkdirAll(m.vaultDir, 0700); err != nil {
		return err
	}
	_ = os.Chmod(m.vaultDir, 0700)
	return nil
}

func (a *app) executePending(p pendingAction) (ActionJournalEntry, error) {
	var err error
	if p.Preview.Action == "restore" {
		err = revalidateVaultGuard(a.actions, p.Preview.guard)
	} else {
		err = revalidateGuard(p.Preview.guard)
	}
	if err != nil {
		return ActionJournalEntry{}, err
	}
	switch p.Preview.Action {
	case "rename":
		return a.executeRename(p.Preview)
	case "vault":
		return a.executeVault(p.Preview)
	case "restore":
		return a.executeRestore(p.Preview)
	}
	return ActionJournalEntry{}, fmt.Errorf("unsupported action")
}

func (a *app) executeRename(p ActionPreview) (ActionJournalEntry, error) {
	if _, err := os.Lstat(p.Destination); !os.IsNotExist(err) {
		return ActionJournalEntry{}, fmt.Errorf("destination appeared after preview; Sentinel will not overwrite")
	}
	if err := moveRegularNoReplace(p.Source, p.Destination); err != nil {
		return ActionJournalEntry{}, fmt.Errorf("no-overwrite rename failed: %w", err)
	}
	e := ActionJournalEntry{ID: "a-" + randomToken(6), At: time.Now().UTC().Format(time.RFC3339), Action: "rename", Status: "success", ObjectName: p.ObjectName, From: p.Source, To: p.Destination, SHA256: p.SHA256, Size: p.Size, Message: "Renamed without overwriting an existing destination.", Reversible: true}
	e.Observation = a.postActionObservation(p.Source, p.Destination)
	if err := a.commitAction(&e, func() error {
		return moveRegularNoReplace(p.Destination, p.Source)
	}); err != nil {
		return ActionJournalEntry{}, err
	}
	return e, nil
}

// executeVault uses a no-clobber same-filesystem regular-file move rather than
// copy+delete. This keeps the response layer reversible and avoids silently
// emulating destructive deletion or overwriting an existing destination.
// The stored object loses executable permission bits, but running processes are
// not terminated and Vaulting is never treated as a malware verdict.
func (a *app) executeVault(p ActionPreview) (ActionJournalEntry, error) {
	if err := ensureActionState(a.actions); err != nil {
		return ActionJournalEntry{}, err
	}
	dir := filepath.Dir(p.Destination)
	if err := os.Mkdir(dir, 0700); err != nil {
		return ActionJournalEntry{}, err
	}
	_ = os.Chmod(dir, 0700)
	if _, err := os.Lstat(p.Destination); !os.IsNotExist(err) {
		_ = os.Remove(dir)
		return ActionJournalEntry{}, fmt.Errorf("Vault destination already exists")
	}
	originalMode := p.guard.Mode
	if err := moveRegularNoReplace(p.Source, p.Destination); err != nil {
		_ = os.Remove(dir)
		return ActionJournalEntry{}, fmt.Errorf("Vault move failed (cross-filesystem copy/delete is intentionally not emulated): %w", err)
	}
	if err := os.Chmod(p.Destination, 0600); err != nil {
		_ = moveRegularNoReplace(p.Destination, p.Source)
		_ = os.Remove(dir)
		return ActionJournalEntry{}, fmt.Errorf("could not remove executable permission; Vault move was rolled back: %w", err)
	}
	refs := startupRefsForPath(p.Source)
	pids := runningPIDsForPaths(p.Source, p.Destination)
	manifest := VaultManifest{Version: vaultManifestVersion, ID: p.VaultID, OriginalPath: p.Source, OriginalName: filepath.Base(p.Source), VaultPath: p.Destination, MovedAt: time.Now().UTC().Format(time.RFC3339), Size: p.Size, OriginalMode: originalMode, ModifiedNS: p.guard.ModifiedNS, SHA256: p.SHA256, HashStatus: p.HashStatus, Risk: p.Risk, Evidence: append([]string{}, p.Signals...), StartupRefs: refs, RunningPIDs: pids, TrustMatch: p.Trust.Match, Note: "Vaulting is reversible. Executable permission bits were removed from the stored file. Moving a file does not terminate an already-running process."}
	if err := a.actions.writeManifest(manifest); err != nil {
		_ = os.Chmod(p.Destination, os.FileMode(originalMode).Perm())
		_ = moveRegularNoReplace(p.Destination, p.Source)
		_ = os.RemoveAll(dir)
		return ActionJournalEntry{}, fmt.Errorf("could not save recovery manifest; Vault move was rolled back: %w", err)
	}
	e := ActionJournalEntry{ID: "a-" + randomToken(6), At: time.Now().UTC().Format(time.RFC3339), Action: "vault", Status: "success", ObjectName: p.ObjectName, From: p.Source, To: p.Destination, VaultID: p.VaultID, SHA256: p.SHA256, Size: p.Size, Message: "Moved to Sentinel Vault and stored recovery metadata; executable permission bits removed.", Reversible: true}
	e.Observation = a.postActionObservation(p.Source, p.Destination)
	if err := a.commitAction(&e, func() error {
		if err := os.Chmod(p.Destination, os.FileMode(originalMode).Perm()); err != nil {
			return err
		}
		if err := moveRegularNoReplace(p.Destination, p.Source); err != nil {
			return err
		}
		return os.RemoveAll(dir)
	}); err != nil {
		return ActionJournalEntry{}, err
	}
	return e, nil
}

func (a *app) executeRestore(p ActionPreview) (ActionJournalEntry, error) {
	manifest, err := a.actions.loadVaultManifest(p.VaultID)
	if err != nil {
		return ActionJournalEntry{}, err
	}
	activeManifest := manifest
	if manifest.VaultPath == "" {
		return ActionJournalEntry{}, fmt.Errorf("Vault item is not active")
	}
	if _, err := os.Lstat(p.Destination); !os.IsNotExist(err) {
		return ActionJournalEntry{}, fmt.Errorf("restore destination appeared after preview; Sentinel will not overwrite")
	}
	parentInfo, parentErr := os.Lstat(filepath.Dir(p.Destination))
	if parentErr != nil || !parentInfo.IsDir() || parentInfo.Mode()&os.ModeSymlink != 0 {
		return ActionJournalEntry{}, fmt.Errorf("restore parent changed after preview; Sentinel will not recreate it automatically")
	}
	if err := moveRegularNoReplace(p.Source, p.Destination); err != nil {
		return ActionJournalEntry{}, fmt.Errorf("no-overwrite restore move failed: %w", err)
	}
	desired := os.FileMode(manifest.OriginalMode).Perm()
	if err := os.Chmod(p.Destination, desired); err != nil {
		_ = moveRegularNoReplace(p.Destination, p.Source)
		_ = os.Chmod(p.Source, 0600)
		return ActionJournalEntry{}, fmt.Errorf("could not restore original permissions; file was rolled back to Vault: %w", err)
	}
	manifest.RestoredAt = time.Now().UTC().Format(time.RFC3339)
	manifest.VaultPath = ""
	manifest.Note = "Restored to the recorded original path. Manifest retained as an audit tombstone."
	if err := a.actions.writeManifest(manifest); err != nil {
		_ = os.Chmod(p.Destination, 0600)
		if rollbackErr := moveRegularNoReplace(p.Destination, p.Source); rollbackErr == nil {
			return ActionJournalEntry{}, fmt.Errorf("audit manifest update failed; restored file was rolled back to Vault: %w", err)
		}
		return ActionJournalEntry{}, fmt.Errorf("audit manifest update failed after restore and automatic rollback also failed; inspect both paths immediately: %w", err)
	}
	e := ActionJournalEntry{ID: "a-" + randomToken(6), At: time.Now().UTC().Format(time.RFC3339), Action: "restore", Status: "success", ObjectName: manifest.OriginalName, From: p.Source, To: p.Destination, VaultID: p.VaultID, SHA256: manifest.SHA256, Size: manifest.Size, Message: "Restored from Sentinel Vault without overwriting an existing destination.", Reversible: false}
	e.Observation = a.postActionObservation(p.Source, p.Destination)
	if err := a.commitAction(&e, func() error {
		if err := os.Chmod(p.Destination, 0600); err != nil {
			return err
		}
		if err := moveRegularNoReplace(p.Destination, p.Source); err != nil {
			return err
		}
		return a.actions.writeManifest(activeManifest)
	}); err != nil {
		return ActionJournalEntry{}, err
	}
	return e, nil
}

func (a *app) postActionObservation(source, destination string) ActionObservation {
	srcExists := false
	if _, err := os.Lstat(source); err == nil {
		srcExists = true
	}
	dstExists := false
	if _, err := os.Lstat(destination); err == nil {
		dstExists = true
	}
	refs := uniqueStrings(append(startupRefsForPath(source), startupRefsForPath(destination)...))
	pids := runningPIDsForPaths(source, destination)
	trustMatch := "unprofiled"
	if a.trust != nil {
		ctx := a.trust.objectContext(destination)
		if !ctx.Profiled {
			ctx = a.trust.objectContext(source)
		}
		trustMatch = ctx.Match
	}
	return ActionObservation{SourceExists: srcExists, DestinationExists: dstExists, RunningPIDs: pids, StartupRefs: refs, TrustMatch: trustMatch, Note: "Post-action observation is a local snapshot, not proof that software or malware was disabled. Existing processes may continue after an on-disk file is renamed or moved."}
}

func (a *app) recordAction(e *ActionJournalEntry) error {
	if a.actions == nil {
		return fmt.Errorf("Safe Action recovery journal is unavailable")
	}
	if err := a.actions.appendJournal(*e); err != nil {
		return fmt.Errorf("could not durably record recovery journal: %w", err)
	}
	if a.intel != nil {
		sev := "info"
		if e.Status != "success" {
			sev = "review"
		}
		a.intel.appendExternalEvent(TimelineEvent{ID: entityID("event", e.ID), At: time.Now().Unix(), Kind: "safe_action", Severity: sev, Title: actionDisplayName(e.Action) + " · " + e.Status, Detail: e.Message, ObjectID: entityID("file", normalizeEvidencePath(func() string {
			if e.To != "" {
				return e.To
			}
			return e.From
		}()))})
	}
	return nil
}

func (a *app) commitAction(e *ActionJournalEntry, rollback func() error) error {
	if err := a.recordAction(e); err != nil {
		if rollback == nil {
			return err
		}
		if rollbackErr := rollback(); rollbackErr != nil {
			return fmt.Errorf("%v; automatic rollback also failed: %w", err, rollbackErr)
		}
		return fmt.Errorf("%w; filesystem mutation was rolled back", err)
	}
	return nil
}

func (m *actionManager) manifestPath(id string) string {
	return filepath.Join(m.vaultDir, id, "manifest.json")
}
func (m *actionManager) writeManifest(v VaultManifest) error {
	if err := ensureActionState(m); err != nil {
		return err
	}
	if v.ID == "" || strings.ContainsAny(v.ID, "/\\") {
		return fmt.Errorf("invalid Vault id")
	}
	dir := filepath.Join(m.vaultDir, v.ID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	_ = os.Chmod(dir, 0700)
	return writePrivateJSON(filepath.Join(dir, "manifest.json"), v)
}
func (m *actionManager) loadVaultManifest(id string) (VaultManifest, error) {
	if id == "" || strings.ContainsAny(id, "/\\") {
		return VaultManifest{}, fmt.Errorf("invalid Vault id")
	}
	var v VaultManifest
	if err := readPrivateJSON(m.manifestPath(id), &v); err != nil || v.Version != vaultManifestVersion || v.ID != id {
		return VaultManifest{}, fmt.Errorf("Vault manifest is invalid")
	}
	return v, nil
}
func (m *actionManager) vaultSnapshot() []VaultManifest {
	if !m.persistent || m.vaultDir == "" {
		return []VaultManifest{}
	}
	entries, err := os.ReadDir(m.vaultDir)
	if err != nil {
		return []VaultManifest{}
	}
	out := []VaultManifest{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		v, err := m.loadVaultManifest(e.Name())
		if err == nil && v.VaultPath != "" {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MovedAt > out[j].MovedAt })
	return out
}

func (m *actionManager) readJournal() ([]ActionJournalEntry, error) {
	if m.journalPath == "" {
		return nil, nil
	}
	if _, err := os.Stat(m.journalPath); os.IsNotExist(err) {
		return []ActionJournalEntry{}, nil
	}
	var wrapper struct {
		Version int                  `json:"version"`
		Entries []ActionJournalEntry `json:"entries"`
	}
	if err := readPrivateJSON(m.journalPath, &wrapper); err != nil || wrapper.Version != actionJournalVersion {
		return nil, fmt.Errorf("action journal is invalid")
	}
	return wrapper.Entries, nil
}
func (m *actionManager) appendJournal(e ActionJournalEntry) error {
	m.journalMu.Lock()
	defer m.journalMu.Unlock()
	if err := ensureActionState(m); err != nil {
		return err
	}
	entries, err := m.readJournal()
	if err != nil {
		return err
	}
	entries = append(entries, e)
	if len(entries) > actionJournalLimit {
		entries = append([]ActionJournalEntry(nil), entries[len(entries)-actionJournalLimit:]...)
	}
	wrapper := struct {
		Version int                  `json:"version"`
		Entries []ActionJournalEntry `json:"entries"`
	}{actionJournalVersion, entries}
	return writePrivateJSON(m.journalPath, wrapper)
}
func (m *actionManager) journalSnapshot(limit int) []ActionJournalEntry {
	m.journalMu.Lock()
	defer m.journalMu.Unlock()
	entries, err := m.readJournal()
	if err != nil {
		return []ActionJournalEntry{}
	}
	if limit <= 0 || limit > actionJournalLimit {
		limit = 100
	}
	if len(entries) > limit {
		entries = entries[len(entries)-limit:]
	}
	out := append([]ActionJournalEntry(nil), entries...)
	sort.Slice(out, func(i, j int) bool { return out[i].At > out[j].At })
	return out
}
func (m *actionManager) journalEntry(id string) (ActionJournalEntry, error) {
	m.journalMu.Lock()
	defer m.journalMu.Unlock()
	entries, err := m.readJournal()
	if err != nil {
		return ActionJournalEntry{}, err
	}
	for i := len(entries) - 1; i >= 0; i-- {
		if entries[i].ID == id {
			return entries[i], nil
		}
	}
	return ActionJournalEntry{}, fmt.Errorf("journal entry not found")
}

func (m *actionManager) health() ActionHealth {
	h := ActionHealth{Enabled: m.persistent, Healthy: true, Mode: "persistent-local", Privacy: "Vault manifests and the action journal remain local under the current user's Sentinel Application Support directory. They include file paths and SHA-256 evidence needed for recovery."}
	if !m.persistent {
		h.Mode = "ephemeral-read-only"
		h.Privacy = "No action state is persisted in --ephemeral mode; mutating Safe Actions are disabled."
		return h
	}
	if m.stateDir == "" {
		h.Healthy = false
		h.Issues = append(h.Issues, "Sentinel state directory is unavailable")
		return h
	}
	if st, err := os.Stat(m.stateDir); err == nil {
		h.StateDirMode = fmt.Sprintf("%04o", st.Mode().Perm())
		if st.Mode().Perm() != 0700 {
			h.Healthy = false
			h.Issues = append(h.Issues, "Sentinel state directory should be 0700")
		}
	}
	if st, err := os.Stat(m.vaultDir); err == nil {
		h.VaultDirMode = fmt.Sprintf("%04o", st.Mode().Perm())
		if st.Mode().Perm() != 0700 {
			h.Healthy = false
			h.Issues = append(h.Issues, "Vault directory should be 0700")
		}
	}
	if st, err := os.Stat(m.journalPath); err == nil {
		h.JournalExists = true
		h.JournalMode = fmt.Sprintf("%04o", st.Mode().Perm())
		if st.Mode().Perm() != 0600 {
			h.Healthy = false
			h.Issues = append(h.Issues, "Action journal should be 0600")
		}
		entries, e := m.readJournal()
		if e == nil && len(entries) <= actionJournalLimit {
			h.JournalValid = true
			h.JournalEntries = len(entries)
		} else {
			h.Healthy = false
			h.Issues = append(h.Issues, "Action journal is invalid or exceeds retention")
		}
	}
	active := m.vaultSnapshot()
	h.ActiveVaultItems = len(active)
	for _, v := range active {
		if v.Size > 0 {
			h.VaultBytes += v.Size
		}
		dir := filepath.Dir(v.VaultPath)
		if st, err := os.Stat(dir); err != nil || st.Mode().Perm() != 0700 {
			h.ManifestIssues++
			h.Healthy = false
			h.Issues = append(h.Issues, "Vault object directory permission issue: "+v.ID)
		}
		if st, err := os.Stat(v.VaultPath); err != nil || st.Mode().Perm() != 0600 {
			h.ManifestIssues++
			h.Healthy = false
			h.Issues = append(h.Issues, "Vault object permission or availability issue: "+v.ID)
		}
		if _, err := m.loadVaultManifest(v.ID); err != nil {
			h.ManifestIssues++
			h.Healthy = false
			h.Issues = append(h.Issues, "Vault manifest parse issue: "+v.ID)
		}
	}
	if h.VaultBytes >= 10<<30 {
		h.Advisories = append(h.Advisories, "Sentinel Vault exceeds 10 GiB. Review stored items manually; Sentinel never auto-deletes Vault contents.")
	} else if h.ActiveVaultItems >= 50 {
		h.Advisories = append(h.Advisories, "Sentinel Vault contains 50 or more active items. Consider reviewing recovery items so the Vault remains understandable.")
	}
	return h
}

func (a *app) handleActionStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, a.actions.status())
}
func (a *app) handleActionHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, a.actions.health())
}
func (a *app) handleActionPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	var req ActionPreviewRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid request"})
		return
	}
	p, err := a.buildActionPreview(req)
	if err != nil {
		writeJSON(w, 400, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, 200, p)
}
func (a *app) handleActionExecute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	var req ActionExecuteRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid request"})
		return
	}
	pending, err := a.actions.peekPending(req.ActionID)
	if err != nil {
		writeJSON(w, 410, map[string]any{"error": err.Error()})
		return
	}
	if !req.Acknowledge || req.Phrase != pending.Preview.ConfirmPhrase || strings.ToUpper(strings.TrimSpace(req.Code)) != pending.Preview.ConfirmCode {
		writeJSON(w, 400, map[string]any{"error": "confirmation did not match; preview remains valid until it expires"})
		return
	}
	pending, err = a.actions.consumePending(req.ActionID)
	if err != nil {
		writeJSON(w, 410, map[string]any{"error": err.Error()})
		return
	}
	entry, err := a.executePending(pending)
	if err != nil {
		failed := ActionJournalEntry{ID: "a-" + randomToken(6), At: time.Now().UTC().Format(time.RFC3339), Action: pending.Preview.Action, Status: "failed", ObjectName: pending.Preview.ObjectName, From: pending.Preview.Source, To: pending.Preview.Destination, VaultID: pending.Preview.VaultID, SHA256: pending.Preview.SHA256, Size: pending.Preview.Size, Message: err.Error(), Reversible: false}
		a.recordAction(&failed)
		writeJSON(w, 409, map[string]any{"error": err.Error(), "journal": failed})
		return
	}
	writeJSON(w, 200, entry)
}
func (a *app) handleActionJournal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, map[string]any{"entries": a.actions.journalSnapshot(100), "limit": actionJournalLimit})
}
func (a *app) handleVault(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, map[string]any{"items": a.actions.vaultSnapshot(), "note": "Vault is reversible local evidence handling. It does not prove an object is malicious or neutralized."})
}
func (a *app) handleReveal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]any{"error": "POST required"})
		return
	}
	var req struct {
		Path    string `json:"path"`
		VaultID string `json:"vault_id"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, 400, map[string]any{"error": "invalid request"})
		return
	}
	path := normalizeEvidencePath(req.Path)
	if req.VaultID != "" {
		v, err := a.actions.loadVaultManifest(req.VaultID)
		if err != nil {
			writeJSON(w, 404, map[string]any{"error": err.Error()})
			return
		}
		if v.VaultPath != "" {
			path = v.VaultPath
		} else {
			path = v.OriginalPath
		}
	}
	if path == "" {
		writeJSON(w, 400, map[string]any{"error": "path required"})
		return
	}
	if runtime.GOOS != "darwin" {
		writeJSON(w, 501, map[string]any{"error": "Reveal in Finder requires macOS"})
		return
	}
	if _, err := os.Lstat(path); err != nil {
		writeJSON(w, 404, map[string]any{"error": "object not found"})
		return
	}
	if err := commandRunTimeout(3*time.Second, "open", "-R", path); err != nil {
		writeJSON(w, 500, map[string]any{"error": "Finder reveal failed"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

var _ = errors.New
