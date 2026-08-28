// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

type CodeIdentity struct {
	Path             string   `json:"path"`
	InspectPath      string   `json:"inspect_path"`
	BundlePath       string   `json:"bundle_path,omitempty"`
	Identifier       string   `json:"identifier,omitempty"`
	TeamID           string   `json:"team_id,omitempty"`
	Authorities      []string `json:"authorities,omitempty"`
	Verification     string   `json:"verification"`
	Gatekeeper       string   `json:"gatekeeper"`
	GatekeeperSource string   `json:"gatekeeper_source,omitempty"`
	GatekeeperOrigin string   `json:"gatekeeper_origin,omitempty"`
	Signed           bool     `json:"signed"`
	Source           string   `json:"source"`
}

type ProcessAncestor struct {
	PID     int    `json:"pid"`
	PPID    int    `json:"ppid"`
	User    string `json:"user"`
	Command string `json:"command"`
	Target  string `json:"target"`
}

type BackgroundItem struct {
	Name        string `json:"name,omitempty"`
	Identifier  string `json:"identifier,omitempty"`
	URL         string `json:"url,omitempty"`
	Executable  string `json:"executable,omitempty"`
	Disposition string `json:"disposition,omitempty"`
}

type BackgroundSnapshot struct {
	Available bool             `json:"available"`
	Items     []BackgroundItem `json:"items"`
	Note      string           `json:"note"`
}

func commandOutput(timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return strings.TrimSpace(string(out)), fmt.Errorf("%s timed out", name)
	}
	return strings.TrimSpace(string(out)), err
}

func enclosingAppBundle(path string) string {
	p := filepath.Clean(path)
	for {
		if strings.HasSuffix(strings.ToLower(p), ".app") {
			return p
		}
		parent := filepath.Dir(p)
		if parent == p || parent == "." || parent == "/" {
			return ""
		}
		p = parent
	}
}

func inspectCodeIdentity(path string) CodeIdentity {
	path = normalizeEvidencePath(path)
	id := CodeIdentity{Path: path, InspectPath: path, Verification: "Unknown", Gatekeeper: "Not assessed", Source: "macOS codesign + spctl"}
	if path == "" {
		return id
	}
	if bundle := enclosingAppBundle(path); bundle != "" {
		id.BundlePath = bundle
		id.InspectPath = bundle
	}
	if runtime.GOOS != "darwin" {
		id.Verification = "Unavailable on development host"
		id.Gatekeeper = "Unavailable on development host"
		return id
	}
	if commandExists("codesign") {
		raw, err := commandOutput(2500*time.Millisecond, "codesign", "-dv", "--verbose=4", id.InspectPath)
		for _, line := range strings.Split(raw, "\n") {
			line = strings.TrimSpace(line)
			switch {
			case strings.HasPrefix(line, "Identifier="):
				id.Identifier = strings.TrimSpace(strings.TrimPrefix(line, "Identifier="))
			case strings.HasPrefix(line, "TeamIdentifier="):
				v := strings.TrimSpace(strings.TrimPrefix(line, "TeamIdentifier="))
				if v != "not set" {
					id.TeamID = v
				}
			case strings.HasPrefix(line, "Authority="):
				v := strings.TrimSpace(strings.TrimPrefix(line, "Authority="))
				if v != "" {
					id.Authorities = append(id.Authorities, v)
				}
			}
		}
		verifyErr := commandRunTimeout(3500*time.Millisecond, "codesign", "--verify", "--strict", id.InspectPath)
		if verifyErr == nil {
			id.Verification = "Verified"
			id.Signed = true
		} else if err != nil {
			id.Verification = "Unsigned / unverifiable"
		} else {
			id.Verification = "Signature present but verification failed"
		}
	} else {
		id.Verification = "codesign unavailable"
	}
	if commandExists("spctl") {
		raw, err := commandOutput(2500*time.Millisecond, "spctl", "--assess", "--type", "execute", "-vv", id.InspectPath)
		low := strings.ToLower(raw)
		for _, line := range strings.Split(raw, "\n") {
			t := strings.TrimSpace(line)
			if strings.HasPrefix(strings.ToLower(t), "source=") {
				id.GatekeeperSource = strings.TrimSpace(strings.TrimPrefix(t, "source="))
			}
			if strings.HasPrefix(strings.ToLower(t), "origin=") {
				id.GatekeeperOrigin = strings.TrimSpace(strings.TrimPrefix(t, "origin="))
			}
		}
		if err == nil || strings.Contains(low, "accepted") {
			id.Gatekeeper = "Accepted"
		} else if strings.Contains(low, "rejected") {
			id.Gatekeeper = "Rejected / not accepted"
		} else if raw != "" {
			id.Gatekeeper = firstNonEmptyLine(raw)
		} else {
			id.Gatekeeper = "Assessment unavailable"
		}
	}
	id.Authorities = uniqueStrings(id.Authorities)
	return id
}

func firstNonEmptyLine(s string) string {
	for _, line := range strings.Split(s, "\n") {
		if v := strings.TrimSpace(line); v != "" {
			if len(v) > 180 {
				v = v[:180] + "…"
			}
			return v
		}
	}
	return ""
}

func processParentChain(pid int, maxDepth int) []ProcessAncestor {
	if maxDepth <= 0 || maxDepth > 16 {
		maxDepth = 8
	}
	rows := parsePS(100000)
	byPID := make(map[int]ProcessInfo, len(rows))
	for _, p := range rows {
		byPID[p.PID] = p
	}
	out := make([]ProcessAncestor, 0, maxDepth)
	seen := map[int]bool{}
	current := pid
	for depth := 0; depth < maxDepth; depth++ {
		p, ok := byPID[current]
		if !ok || p.PPID <= 0 || seen[p.PPID] {
			break
		}
		parent, ok := byPID[p.PPID]
		if !ok {
			break
		}
		seen[parent.PID] = true
		target, _ := processAuditPath(parent)
		out = append(out, ProcessAncestor{PID: parent.PID, PPID: parent.PPID, User: parent.User, Command: parent.Command, Target: target})
		current = parent.PID
		if parent.PID == 1 {
			break
		}
	}
	return out
}

func classifyEndpoint(address, state string) (local, remote, class string) {
	state = strings.ToUpper(strings.TrimSpace(state))
	addr := strings.TrimSpace(address)
	if parts := strings.SplitN(addr, "->", 2); len(parts) == 2 {
		local, remote = strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
	} else {
		local = addr
	}
	if state == "LISTEN" || remote == "" {
		return local, remote, "listener"
	}
	host := endpointHost(remote)
	ip := net.ParseIP(host)
	if ip == nil {
		return local, remote, "remote"
	}
	if ip.IsLoopback() {
		return local, remote, "loopback"
	}
	if ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return local, remote, "private"
	}
	return local, remote, "public"
}

func endpointHost(endpoint string) string {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return ""
	}
	if strings.HasPrefix(endpoint, "[") {
		if host, _, err := net.SplitHostPort(endpoint); err == nil {
			return strings.Trim(host, "[]")
		}
	}
	if host, _, err := net.SplitHostPort(endpoint); err == nil {
		return strings.Trim(host, "[]")
	}
	// lsof sometimes prints IPv6 without brackets. Strip only a final numeric port.
	if i := strings.LastIndex(endpoint, ":"); i > 0 {
		if _, err := strconv.Atoi(endpoint[i+1:]); err == nil {
			return strings.Trim(endpoint[:i], "[]")
		}
	}
	return strings.Trim(endpoint, "[]")
}

func parseBackgroundItems(raw string) []BackgroundItem {
	var out []BackgroundItem
	cur := BackgroundItem{}
	flush := func() {
		if cur.Name != "" || cur.Identifier != "" || cur.URL != "" || cur.Executable != "" {
			out = append(out, cur)
		}
		cur = BackgroundItem{}
	}
	for _, line := range strings.Split(raw, "\n") {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		low := strings.ToLower(t)
		value := func(prefix string) string {
			return strings.TrimSpace(strings.Trim(strings.TrimSpace(t[len(prefix):]), "\""))
		}
		switch {
		case strings.HasPrefix(low, "name:"):
			if cur.Name != "" || cur.Identifier != "" || cur.URL != "" || cur.Executable != "" {
				flush()
			}
			cur.Name = value(t[:strings.Index(t, ":")+1])
		case strings.HasPrefix(low, "identifier:"):
			cur.Identifier = value(t[:strings.Index(t, ":")+1])
		case strings.HasPrefix(low, "url:"):
			cur.URL = value(t[:strings.Index(t, ":")+1])
		case strings.HasPrefix(low, "executable path:"):
			cur.Executable = value(t[:strings.Index(t, ":")+1])
		case strings.HasPrefix(low, "disposition:"):
			cur.Disposition = value(t[:strings.Index(t, ":")+1])
		}
	}
	flush()
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i].Name+out[i].Identifier, out[j].Name+out[j].Identifier
		return strings.ToLower(a) < strings.ToLower(b)
	})
	if len(out) > 120 {
		out = out[:120]
	}
	return out
}

func collectBackgroundItems() BackgroundSnapshot {
	if runtime.GOOS != "darwin" || !commandExists("sfltool") {
		return BackgroundSnapshot{Available: false, Items: []BackgroundItem{}, Note: "Modern Background Items inspection requires macOS sfltool; unavailable on this host."}
	}
	raw, err := commandOutput(4*time.Second, "sfltool", "dumpbtm")
	if err != nil && strings.TrimSpace(raw) == "" {
		return BackgroundSnapshot{Available: false, Items: []BackgroundItem{}, Note: "sfltool could not produce a Background Task Management snapshot."}
	}
	items := parseBackgroundItems(raw)
	return BackgroundSnapshot{Available: true, Items: items, Note: "Read-only snapshot from macOS Background Task Management. Output format is Apple-controlled and may vary by macOS release."}
}

func (a *app) handleBackgroundItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, collectBackgroundItems())
}
