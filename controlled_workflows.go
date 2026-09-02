// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const controlledDownloadMaxBytes int64 = 512 << 20 // 512 MiB hard ceiling.

type controlledGitRequest struct {
	Repository string `json:"repository"`
	Confirm    string `json:"confirm,omitempty"`
}

type controlledGitPreview struct {
	Repository        string `json:"repository"`
	TopLevel          string `json:"top_level"`
	Branch            string `json:"branch"`
	Upstream          string `json:"upstream"`
	Clean             bool   `json:"clean"`
	Ready             bool   `json:"ready"`
	EquivalentCommand string `json:"equivalent_command"`
	Limitation        string `json:"limitation"`
}

type controlledDownloadRequest struct {
	URL         string `json:"url"`
	Destination string `json:"destination"`
	Confirm     string `json:"confirm,omitempty"`
}

type controlledDownloadPreview struct {
	URL                string `json:"url"`
	Destination        string `json:"destination"`
	Ready              bool   `json:"ready"`
	MaxBytes           int64  `json:"max_bytes"`
	NoOverwrite        bool   `json:"no_overwrite"`
	EquivalentOperation string `json:"equivalent_operation"`
	Limitation         string `json:"limitation"`
}

func decodeControlledJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return false
	}
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 64<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request body"})
		return false
	}
	return true
}

func controlledGitPath(raw string) (string, error) {
	path := strings.TrimSpace(raw)
	if path == "" || !filepath.IsAbs(path) {
		return "", errors.New("repository must be an absolute path")
	}
	clean := filepath.Clean(path)
	info, err := os.Stat(clean)
	if err != nil {
		return "", fmt.Errorf("repository path unavailable: %w", err)
	}
	if !info.IsDir() {
		return "", errors.New("repository path is not a directory")
	}
	resolved, err := filepath.EvalSymlinks(clean)
	if err != nil {
		return "", fmt.Errorf("repository path could not be resolved: %w", err)
	}
	return resolved, nil
}

func gitOutput(ctx context.Context, repo string, args ...string) (string, error) {
	git := "/usr/bin/git"
	if _, err := os.Stat(git); err != nil {
		found, lookErr := exec.LookPath("git")
		if lookErr != nil {
			return "", errors.New("git is not available")
		}
		git = found
	}
	cmdArgs := append([]string{"-C", repo}, args...)
	cmd := exec.CommandContext(ctx, git, cmdArgs...)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if len(out) > 256<<10 {
		out = out[:256<<10]
	}
	text := strings.TrimSpace(string(out))
	if err != nil {
		if text == "" {
			text = err.Error()
		}
		return text, fmt.Errorf("git command failed: %s", text)
	}
	return text, nil
}

func buildControlledGitPreview(repo string) (controlledGitPreview, error) {
	resolved, err := controlledGitPath(repo)
	if err != nil {
		return controlledGitPreview{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()

	top, err := gitOutput(ctx, resolved, "rev-parse", "--show-toplevel")
	if err != nil {
		return controlledGitPreview{}, errors.New("the selected directory is not a readable Git working tree")
	}
	top, err = filepath.EvalSymlinks(strings.TrimSpace(top))
	if err != nil {
		return controlledGitPreview{}, errors.New("Git top-level path could not be resolved")
	}
	branch, err := gitOutput(ctx, top, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil || branch == "HEAD" {
		return controlledGitPreview{}, errors.New("detached HEAD is not eligible for controlled pull")
	}
	upstream, upstreamErr := gitOutput(ctx, top, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
	status, statusErr := gitOutput(ctx, top, "status", "--porcelain")
	clean := statusErr == nil && strings.TrimSpace(status) == ""
	ready := upstreamErr == nil && strings.TrimSpace(upstream) != "" && clean
	limitation := "Sentinel does not reset, stash, merge conflicts, change branches, or prompt for Git credentials."
	if !clean {
		limitation = "Working tree has local changes. Review them before pulling; Sentinel will not stash or reset them."
	} else if upstreamErr != nil || strings.TrimSpace(upstream) == "" {
		limitation = "Current branch has no readable upstream. Configure/review upstream outside this workflow first."
	}
	return controlledGitPreview{
		Repository:        resolved,
		TopLevel:          top,
		Branch:            strings.TrimSpace(branch),
		Upstream:          strings.TrimSpace(upstream),
		Clean:             clean,
		Ready:             ready,
		EquivalentCommand: fmt.Sprintf("/usr/bin/git -C %q pull --ff-only", top),
		Limitation:        limitation,
	}, nil
}

func (a *app) handleControlledGitPreview(w http.ResponseWriter, r *http.Request) {
	var req controlledGitRequest
	if !decodeControlledJSON(w, r, &req) {
		return
	}
	preview, err := buildControlledGitPreview(req.Repository)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, preview)
}

func (a *app) handleControlledGitPull(w http.ResponseWriter, r *http.Request) {
	var req controlledGitRequest
	if !decodeControlledJSON(w, r, &req) {
		return
	}
	if req.Confirm != "PULL --FF-ONLY" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "explicit PULL --FF-ONLY confirmation required"})
		return
	}
	preview, err := buildControlledGitPreview(req.Repository)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	if !preview.Ready {
		writeJSON(w, http.StatusConflict, map[string]any{"error": preview.Limitation, "preview": preview})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	output, err := gitOutput(ctx, preview.TopLevel, "pull", "--ff-only")
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]any{"error": err.Error(), "output": output, "preview": preview})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "completed", "repository": preview.TopLevel, "branch": preview.Branch,
		"upstream": preview.Upstream, "operation": "pull --ff-only", "output": output,
		"note": "Sentinel did not reset, stash, switch branches, or resolve conflicts.",
	})
}

func expandDownloadDestination(raw string) (string, string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", errors.New("home directory unavailable")
	}
	downloads := filepath.Join(home, "Downloads")
	value := strings.TrimSpace(raw)
	if strings.HasPrefix(value, "~/") {
		value = filepath.Join(home, strings.TrimPrefix(value, "~/"))
	}
	if value == "" || !filepath.IsAbs(value) {
		return "", "", errors.New("destination must be an absolute path or ~/Downloads path")
	}
	clean := filepath.Clean(value)
	rel, err := filepath.Rel(downloads, clean)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", "", errors.New("downloads are restricted to the user's Downloads folder")
	}
	if info, err := os.Lstat(clean); err == nil && info != nil {
		return "", "", errors.New("destination already exists; overwrite is not allowed")
	} else if err != nil && !os.IsNotExist(err) {
		return "", "", fmt.Errorf("destination could not be checked: %w", err)
	}
	return clean, downloads, nil
}

func validateHTTPSPublicURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return nil, errors.New("a credential-free HTTPS URL is required")
	}
	if err := ensurePublicHostname(u.Hostname()); err != nil {
		return nil, err
	}
	return u, nil
}

func ensurePublicHostname(host string) error {
	lower := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(host), "."))
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") {
		return errors.New("local hostnames are not allowed for controlled download")
	}
	ips, err := net.DefaultResolver.LookupIP(context.Background(), "ip", host)
	if err != nil || len(ips) == 0 {
		return errors.New("download hostname could not be resolved")
	}
	for _, ip := range ips {
		if !isPublicDownloadIP(ip) {
			return errors.New("download target resolves to a local/private network address")
		}
	}
	return nil
}

func isPublicDownloadIP(ip net.IP) bool {
	return ip != nil && !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast() && !ip.IsUnspecified() && !ip.IsMulticast()
}

func buildControlledDownloadPreview(rawURL, rawDestination string) (controlledDownloadPreview, error) {
	u, err := validateHTTPSPublicURL(rawURL)
	if err != nil {
		return controlledDownloadPreview{}, err
	}
	destination, _, err := expandDownloadDestination(rawDestination)
	if err != nil {
		return controlledDownloadPreview{}, err
	}
	return controlledDownloadPreview{
		URL: u.String(), Destination: destination, Ready: true, MaxBytes: controlledDownloadMaxBytes,
		NoOverwrite: true,
		EquivalentOperation: "HTTPS GET → exclusive file create inside ~/Downloads (no shell)",
		Limitation: "Maximum transfer is 512 MiB; redirects must remain HTTPS and resolve only to public addresses; existing files are never overwritten.",
	}, nil
}

func (a *app) handleControlledDownloadPreview(w http.ResponseWriter, r *http.Request) {
	var req controlledDownloadRequest
	if !decodeControlledJSON(w, r, &req) {
		return
	}
	preview, err := buildControlledDownloadPreview(req.URL, req.Destination)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, preview)
}

func controlledDownloadClient() *http.Client {
	dialer := &net.Dialer{Timeout: 8 * time.Second, KeepAlive: 15 * time.Second}
	transport := &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
			if err != nil || len(ips) == 0 {
				return nil, errors.New("download hostname could not be resolved")
			}
			for _, ip := range ips {
				if !isPublicDownloadIP(ip) {
					return nil, errors.New("download target resolves to a local/private network address")
				}
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
		},
		TLSHandshakeTimeout: 8 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
	}
	client := &http.Client{Transport: transport, Timeout: 25 * time.Second}
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		if req.URL.Scheme != "https" {
			return errors.New("redirect left HTTPS")
		}
		return ensurePublicHostname(req.URL.Hostname())
	}
	return client
}

func (a *app) handleControlledDownloadExecute(w http.ResponseWriter, r *http.Request) {
	var req controlledDownloadRequest
	if !decodeControlledJSON(w, r, &req) {
		return
	}
	if req.Confirm != "DOWNLOAD" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "explicit DOWNLOAD confirmation required"})
		return
	}
	preview, err := buildControlledDownloadPreview(req.URL, req.Destination)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	if err := os.MkdirAll(filepath.Dir(preview.Destination), 0o755); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "destination directory could not be prepared"})
		return
	}
	out, err := os.OpenFile(preview.Destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]any{"error": "destination already exists or cannot be created"})
		return
	}
	completed := false
	defer func() {
		_ = out.Close()
		if !completed {
			_ = os.Remove(preview.Destination)
		}
	}()

	reqHTTP, err := http.NewRequestWithContext(r.Context(), http.MethodGet, preview.URL, nil)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "download request could not be created"})
		return
	}
	reqHTTP.Header.Set("User-Agent", "Sentinel-controlled-download/1")
	resp, err := controlledDownloadClient().Do(reqHTTP)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": fmt.Sprintf("remote server returned HTTP %d", resp.StatusCode)})
		return
	}
	if resp.ContentLength > controlledDownloadMaxBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"error": "download exceeds 512 MiB limit"})
		return
	}

	hash := sha256.New()
	limited := io.LimitReader(resp.Body, controlledDownloadMaxBytes+1)
	written, err := io.Copy(io.MultiWriter(out, hash), limited)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "download transfer failed"})
		return
	}
	if written > controlledDownloadMaxBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"error": "download exceeded 512 MiB limit"})
		return
	}
	if err := out.Sync(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "downloaded file could not be synchronized"})
		return
	}
	if err := out.Close(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "downloaded file could not be closed"})
		return
	}
	completed = true
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "completed", "url": preview.URL, "destination": preview.Destination,
		"bytes": written, "sha256": hex.EncodeToString(hash.Sum(nil)), "overwrote_existing": false,
	})
}
