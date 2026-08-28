// SPDX-License-Identifier: MPL-2.0
package main

import "net/http"

type Capability struct {
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Purpose   string `json:"purpose"`
	Example   string `json:"example"`
}

func collectCapabilities() []Capability {
	specs := []struct{ name, purpose, example string }{
		{"ps", "Process inventory and parent PID evidence", "ps -axo pid=,ppid=,%cpu=,%mem=,user=,command="},
		{"lsof", "Executable-path and TCP socket evidence", "lsof -nP -iTCP"},
		{"codesign", "Code signature, Identifier, Team ID, and authority evidence", "codesign -dv --verbose=4 <path>"},
		{"spctl", "Gatekeeper assessment context", "spctl --assess --type execute -vv <path>"},
		{"plutil", "LaunchAgent and LaunchDaemon plist inspection", "plutil -p <plist>"},
		{"sfltool", "Modern Login & Background Items snapshot", "sfltool dumpbtm"},
		{"xattr", "Quarantine/provenance attribute inspection for an explicitly selected path", "xattr -p com.apple.quarantine <path>"},
		{"mdls", "Spotlight provenance metadata for an explicitly selected path", "mdls -raw -name kMDItemWhereFroms <path>"},
		{"lipo", "Mach-O architecture inspection", "lipo -archs <path>"},
		{"file", "Local file-type description", "file -b <path>"},
		{"df", "Filesystem capacity snapshot", "df -k /"},
		{"vm_stat", "macOS virtual-memory snapshot", "vm_stat"},
		{"sysctl", "Load average and hardware-memory metadata", "sysctl -n vm.loadavg"},
	}
	out := make([]Capability, 0, len(specs))
	for _, s := range specs {
		out = append(out, Capability{Name: s.name, Available: commandExists(s.name), Purpose: s.purpose, Example: s.example})
	}
	return out
}

func (a *app) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, map[string]any{
		"items": collectCapabilities(),
		"note":  "Sentinel exposes its local evidence sources instead of hiding system inspection behind an opaque score.",
	})
}
