// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"strconv"
	"strings"
)

type SystemEvidenceFact struct {
	Label string `json:"label"`
	Value string `json:"value"`
	State string `json:"state,omitempty"`
}

type SystemEvidenceRecord struct {
	Kind   string `json:"kind"`
	Group  string `json:"group,omitempty"`
	Label  string `json:"label"`
	Detail string `json:"detail,omitempty"`
	Path   string `json:"path,omitempty"`
	PID    int    `json:"pid,omitempty"`
}

type SystemConsoleContinuationTarget struct {
	Kind  string `json:"kind"`
	Label string `json:"label"`
	Path  string `json:"path,omitempty"`
	PID   int    `json:"pid,omitempty"`
}

func appendFact(out *ParsedSystemEvidence, label, value, state string) {
	label, value = strings.TrimSpace(label), strings.TrimSpace(value)
	if label == "" || value == "" { return }
	out.Facts = append(out.Facts, SystemEvidenceFact{Label: label, Value: value, State: state})
}

func parseColonFacts(kind, raw string, limit int) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: kind}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" { continue }
		if i := strings.Index(line, ":"); i > 0 && i < len(line)-1 {
			label := strings.TrimSpace(line[:i]); value := strings.TrimSpace(line[i+1:])
			if label != "" && value != "" { appendFact(&out, label, value, "") }
		}
		if len(out.Facts) >= limit { out.Limitations = append(out.Limitations, "structured facts reached the bounded parser limit"); break }
	}
	out.ParsedRows = len(out.Facts); return out
}

func parseStatusFact(kind, label, raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: kind}; value := firstMeaningfulLine(raw); state := "unknown"; lower := strings.ToLower(value)
	switch {
	case strings.Contains(lower, "enabled") || strings.Contains(lower, " is on") || strings.Contains(lower, "active"): state = "ok"
	case strings.Contains(lower, "disabled") || strings.Contains(lower, " is off") || strings.Contains(lower, "inactive"): state = "review"
	}
	appendFact(&out, label, value, state); out.ParsedRows = len(out.Facts); return out
}

func parseLaunchctlEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "launch_services"}; scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text()); if line == "" { continue }
		fields := strings.Fields(line); if len(fields) < 3 || strings.EqualFold(fields[0], "PID") { continue }
		pid, _ := strconv.Atoi(fields[0]); label := strings.Join(fields[2:], " ")
		out.Records = append(out.Records, SystemEvidenceRecord{Kind: "launch_service", Group: "launchd", Label: label, Detail: "launchctl visible service", PID: pid})
		if len(out.Records) >= 160 { out.Limitations = append(out.Limitations, "launch-service rows bounded to 160"); break }
	}
	out.ParsedRows = len(out.Records); return out
}

func parseSystemExtensionsEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "system_extensions"}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line); if line == "" || strings.HasPrefix(line, "---") || strings.Contains(line, "extension(s)") { continue }
		fields := strings.Fields(line); if len(fields) < 2 { continue }
		out.Records = append(out.Records, SystemEvidenceRecord{Kind: "system_extension", Group: "system_extension", Label: line, Detail: "Observed from systemextensionsctl list"})
		if len(out.Records) >= 100 { out.Limitations = append(out.Limitations, "system-extension rows bounded to 100"); break }
	}
	out.ParsedRows = len(out.Records); return out
}

func parseAPFSEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "apfs_layout"}; group := "APFS"
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(strings.TrimLeft(line, "+|- ")); if line == "" { continue }
		lower := strings.ToLower(line)
		if strings.Contains(lower, "apfs container") { group = line; out.Records = append(out.Records, SystemEvidenceRecord{Kind: "apfs_container", Group: group, Label: line}); continue }
		if strings.Contains(lower, "apfs volume") || strings.HasPrefix(lower, "name:") || strings.HasPrefix(lower, "mount point:") || strings.HasPrefix(lower, "capacity consumed:") || strings.HasPrefix(lower, "filevault:") {
			rec := SystemEvidenceRecord{Kind: "apfs_volume_fact", Group: group, Label: line}
			if strings.HasPrefix(lower, "mount point:") { p := strings.TrimSpace(strings.TrimPrefix(line, "Mount Point:")); if strings.HasPrefix(p, "/") { rec.Path = p } }
			out.Records = append(out.Records, rec)
		}
		if len(out.Records) >= 180 { out.Limitations = append(out.Limitations, "APFS structured rows bounded to 180"); break }
	}
	out.ParsedRows = len(out.Records); return out
}

func parsePowerAssertionsEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "power_assertions"}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line); if line == "" { continue }; lower := strings.ToLower(line)
		if strings.Contains(lower, "pid ") || strings.Contains(lower, "preventusersystemsleep") || strings.Contains(lower, "preventuseridlesystemsleep") || strings.Contains(lower, "preventdisplaysleep") {
			pid := 0; fields := strings.Fields(line)
			for i, f := range fields { if strings.EqualFold(f, "pid") && i+1 < len(fields) { pid, _ = strconv.Atoi(strings.Trim(fields[i+1], "():")); break } }
			out.Records = append(out.Records, SystemEvidenceRecord{Kind: "power_assertion", Group: "sleep", Label: line, PID: pid})
		}
		if len(out.Records) >= 120 { out.Limitations = append(out.Limitations, "power assertion rows bounded to 120"); break }
	}
	out.ParsedRows = len(out.Records); return out
}

func parseBoundedLines(kind, group, raw string, limit int) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: kind}
	for _, line := range boundedUniqueLines(raw, limit) { out.Records = append(out.Records, SystemEvidenceRecord{Kind: kind + "_row", Group: group, Label: line}) }
	out.ParsedRows = len(out.Records); return out
}

func ParseExpandedSystemConsoleEvidence(toolID, raw string) (ParsedSystemEvidence, bool) {
	switch toolID {
	case "gatekeeper-status": return parseStatusFact("gatekeeper_status", "Gatekeeper", raw), true
	case "filevault-status": return parseStatusFact("filevault_status", "FileVault", raw), true
	case "sip-status": return parseStatusFact("sip_status", "System Integrity Protection", raw), true
	case "hardware-profile": return parseColonFacts("hardware_profile", raw, 80), true
	case "software-profile": return parseColonFacts("software_profile", raw, 80), true
	case "storage-profile": return parseColonFacts("storage_profile", raw, 100), true
	case "power-profile": return parseColonFacts("power_profile", raw, 100), true
	case "battery-status": return parseStatusFact("battery_status", "Battery / power source", raw), true
	case "time-machine-status": return parseColonFacts("time_machine_status", raw, 60), true
	case "time-machine-destinations": return parseColonFacts("time_machine_destinations", raw, 100), true
	case "dns-configuration": return parseColonFacts("dns_configuration", raw, 140), true
	case "proxy-configuration": return parseColonFacts("proxy_configuration", raw, 100), true
	case "network-quality": return parseColonFacts("network_quality", raw, 80), true
	case "launchctl-list": return parseLaunchctlEvidence(raw), true
	case "system-extensions": return parseSystemExtensionsEvidence(raw), true
	case "apfs-layout": return parseAPFSEvidence(raw), true
	case "power-assertions": return parsePowerAssertionsEvidence(raw), true
	case "disk-layout": return parseBoundedLines("disk_layout", "diskutil", raw, 160), true
	case "network-interfaces": return parseBoundedLines("network_interfaces", "interface", raw, 160), true
	case "arp-neighbors": return parseBoundedLines("arp_neighbors", "neighbor", raw, 120), true
	case "tcp-socket-table": return parseBoundedLines("tcp_socket_table", "tcp", raw, 180), true
	case "listening-processes": p := ParseOpenFileEvidence(raw); p.Kind = "listening_processes"; return p, true
	case "power-settings", "power-custom": return parseBoundedLines("power_policy", "power", raw, 100), true
	case "spotlight-status": return parseBoundedLines("spotlight_status", "spotlight", raw, 30), true
	case "configuration-profiles": return parseBoundedLines("enrollment_status", "profiles", raw, 40), true
	case "gatekeeper-log", "power-log", "crash-log", "launch-failure-log", "mount-log", "network-config-log", "system-extension-log": return parseBoundedLines("bounded_log", "log", raw, 120), true
	case "uptime", "boot-time", "software-update-history": return parseBoundedLines(toolID, "system", raw, 100), true
	default: return ParsedSystemEvidence{}, false
	}
}

func SystemConsoleContinuationTargets(result SystemConsoleResult, parsed ParsedSystemEvidence) []SystemConsoleContinuationTarget {
	out := []SystemConsoleContinuationTarget{}; seen := map[string]bool{}
	addPath := func(path, label string) { path = strings.TrimSpace(path); if !strings.HasPrefix(path, "/") { return }; key := "path|" + path; if seen[key] || len(out) >= 24 { return }; seen[key] = true; out = append(out, SystemConsoleContinuationTarget{Kind: "path", Label: label, Path: path}) }
	addPID := func(pid int, label string) { if pid <= 0 { return }; key := "pid|" + strconv.Itoa(pid); if seen[key] || len(out) >= 24 { return }; seen[key] = true; out = append(out, SystemConsoleContinuationTarget{Kind: "pid", Label: label, PID: pid}) }
	if result.Target != "" { if strings.HasPrefix(result.Target, "/") { addPath(result.Target, "Investigate selected object") } else if pid, err := strconv.Atoi(result.Target); err == nil { addPID(pid, "Open selected process") } }
	for _, p := range parsed.Processes { addPID(p.PID, "Open process · " + p.Command) }
	for _, f := range parsed.OpenFiles { if strings.HasPrefix(f.Name, "/") { addPath(f.Name, "Investigate open object") } }
	for _, r := range parsed.Records { if r.Path != "" { addPath(r.Path, "Investigate " + r.Label) }; if r.PID > 0 { addPID(r.PID, "Open process · " + r.Label) } }
	return out
}
