// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type ProcessEvidenceRow struct {
	PID        int     `json:"pid"`
	PPID       int     `json:"ppid"`
	User       string  `json:"user"`
	CPUPercent float64 `json:"cpu_percent"`
	MemoryPct  float64 `json:"memory_percent"`
	Elapsed    string  `json:"elapsed"`
	Command    string  `json:"command"`
}

type OpenFileEvidenceRow struct {
	Command    string `json:"command"`
	PID        int    `json:"pid"`
	User       string `json:"user"`
	FD         string `json:"fd"`
	Type       string `json:"type"`
	Device     string `json:"device,omitempty"`
	SizeOffset string `json:"size_offset,omitempty"`
	Node       string `json:"node,omitempty"`
	Name       string `json:"name"`
}

type FilesystemEvidenceRow struct {
	Filesystem string `json:"filesystem"`
	Size       string `json:"size"`
	Used       string `json:"used"`
	Available  string `json:"available"`
	Capacity   string `json:"capacity"`
	MountedOn  string `json:"mounted_on"`
}

type MountEvidenceRow struct {
	Device    string   `json:"device"`
	MountedOn string   `json:"mounted_on"`
	Options   []string `json:"options,omitempty"`
}

type SigningEvidence struct {
	Identifier     string   `json:"identifier,omitempty"`
	TeamIdentifier string   `json:"team_identifier,omitempty"`
	Authorities    []string `json:"authorities,omitempty"`
	Signature      string   `json:"signature,omitempty"`
	RuntimeVersion string   `json:"runtime_version,omitempty"`
	Executable     string   `json:"executable,omitempty"`
}

type GatekeeperEvidence struct {
	Assessment string `json:"assessment"`
	Source     string `json:"source,omitempty"`
	Origin     string `json:"origin,omitempty"`
}

type ParsedSystemEvidence struct {
	Kind        string                  `json:"kind"`
	Processes   []ProcessEvidenceRow    `json:"processes,omitempty"`
	OpenFiles   []OpenFileEvidenceRow   `json:"open_files,omitempty"`
	Filesystems []FilesystemEvidenceRow `json:"filesystems,omitempty"`
	Mounts      []MountEvidenceRow      `json:"mounts,omitempty"`
	Signing     *SigningEvidence        `json:"signing,omitempty"`
	Gatekeeper  *GatekeeperEvidence     `json:"gatekeeper,omitempty"`
	Facts       []SystemEvidenceFact    `json:"facts,omitempty"`
	Records     []SystemEvidenceRecord  `json:"records,omitempty"`
	ParsedRows  int                     `json:"parsed_rows"`
	Limitations []string                `json:"limitations,omitempty"`
}

func parseFloatEvidence(s string) float64 {
	v, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return v
}

func ParseProcessTableEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "process_table"}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	lineNo := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" { continue }
		lineNo++
		if lineNo == 1 && strings.Contains(strings.ToUpper(line), "PID") { continue }
		fields := strings.Fields(line)
		if len(fields) < 7 {
			out.Limitations = appendUniqueString(out.Limitations, "one or more process rows could not be parsed")
			continue
		}
		pid, err1 := strconv.Atoi(fields[0])
		ppid, err2 := strconv.Atoi(fields[1])
		if err1 != nil || err2 != nil {
			out.Limitations = appendUniqueString(out.Limitations, "one or more process rows had an invalid PID/PPID")
			continue
		}
		out.Processes = append(out.Processes, ProcessEvidenceRow{PID: pid, PPID: ppid, User: fields[2], CPUPercent: parseFloatEvidence(fields[3]), MemoryPct: parseFloatEvidence(fields[4]), Elapsed: fields[5], Command: strings.Join(fields[6:], " ")})
	}
	out.ParsedRows = len(out.Processes)
	if scanner.Err() != nil { out.Limitations = appendUniqueString(out.Limitations, "process output scan was incomplete") }
	return out
}

func ParseOpenFileEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "process_open_files"}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	lineNo := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" { continue }
		lineNo++
		upper := strings.ToUpper(line)
		if lineNo == 1 && strings.Contains(upper, "COMMAND") && strings.Contains(upper, "PID") && strings.Contains(upper, "NAME") { continue }
		fields := strings.Fields(line)
		if len(fields) < 9 {
			out.Limitations = appendUniqueString(out.Limitations, "one or more lsof rows could not be parsed")
			continue
		}
		pid, err := strconv.Atoi(fields[1])
		if err != nil || pid <= 0 {
			out.Limitations = appendUniqueString(out.Limitations, "one or more lsof rows had an invalid PID")
			continue
		}
		out.OpenFiles = append(out.OpenFiles, OpenFileEvidenceRow{Command: fields[0], PID: pid, User: fields[2], FD: fields[3], Type: fields[4], Device: fields[5], SizeOffset: fields[6], Node: fields[7], Name: strings.Join(fields[8:], " ")})
		if len(out.OpenFiles) >= 240 {
			out.Limitations = appendUniqueString(out.Limitations, "structured open-file rows are bounded to 240")
			break
		}
	}
	out.ParsedRows = len(out.OpenFiles)
	if scanner.Err() != nil { out.Limitations = appendUniqueString(out.Limitations, "open-file output scan was incomplete") }
	return out
}

func ParseFilesystemEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "filesystem_usage"}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(strings.ToLower(line), "filesystem") { continue }
		fields := strings.Fields(line)
		if len(fields) < 6 {
			out.Limitations = appendUniqueString(out.Limitations, "one or more filesystem rows could not be parsed")
			continue
		}
		mountIndex := 5
		if len(fields) >= 9 { mountIndex = len(fields) - 1 }
		out.Filesystems = append(out.Filesystems, FilesystemEvidenceRow{Filesystem: fields[0], Size: fields[1], Used: fields[2], Available: fields[3], Capacity: fields[4], MountedOn: strings.Join(fields[mountIndex:], " ")})
	}
	out.ParsedRows = len(out.Filesystems)
	if scanner.Err() != nil { out.Limitations = appendUniqueString(out.Limitations, "filesystem output scan was incomplete") }
	return out
}

func ParseMountEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "mount_table"}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" { continue }
		parts := strings.SplitN(line, " on ", 2)
		if len(parts) != 2 {
			out.Limitations = appendUniqueString(out.Limitations, "one or more mount rows could not be parsed")
			continue
		}
		device := strings.TrimSpace(parts[0])
		rest := strings.TrimSpace(parts[1])
		mountedOn := rest
		var options []string
		if i := strings.LastIndex(rest, " ("); i >= 0 && strings.HasSuffix(rest, ")") {
			mountedOn = strings.TrimSpace(rest[:i])
			optionText := strings.TrimSuffix(strings.TrimPrefix(rest[i+1:], "("), ")")
			for _, item := range strings.Split(optionText, ",") {
				if item = strings.TrimSpace(item); item != "" { options = append(options, item) }
			}
		}
		out.Mounts = append(out.Mounts, MountEvidenceRow{Device: device, MountedOn: mountedOn, Options: options})
	}
	out.ParsedRows = len(out.Mounts)
	if scanner.Err() != nil { out.Limitations = appendUniqueString(out.Limitations, "mount output scan was incomplete") }
	return out
}

func ParseSigningEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "code_signing", Signing: &SigningEvidence{}}
	for _, rawLine := range strings.Split(raw, "\n") {
		line := strings.TrimSpace(rawLine)
		switch {
		case strings.HasPrefix(line, "Identifier="):
			out.Signing.Identifier = strings.TrimSpace(strings.TrimPrefix(line, "Identifier="))
		case strings.HasPrefix(line, "TeamIdentifier="):
			out.Signing.TeamIdentifier = strings.TrimSpace(strings.TrimPrefix(line, "TeamIdentifier="))
		case strings.HasPrefix(line, "Authority="):
			out.Signing.Authorities = append(out.Signing.Authorities, strings.TrimSpace(strings.TrimPrefix(line, "Authority=")))
		case strings.HasPrefix(line, "Signature="):
			out.Signing.Signature = strings.TrimSpace(strings.TrimPrefix(line, "Signature="))
		case strings.HasPrefix(line, "Runtime Version="):
			out.Signing.RuntimeVersion = strings.TrimSpace(strings.TrimPrefix(line, "Runtime Version="))
		case strings.HasPrefix(line, "Executable="):
			out.Signing.Executable = strings.TrimSpace(strings.TrimPrefix(line, "Executable="))
		}
	}
	if out.Signing.Identifier != "" || out.Signing.TeamIdentifier != "" || out.Signing.Signature != "" || len(out.Signing.Authorities) > 0 { out.ParsedRows = 1 } else { out.Limitations = append(out.Limitations, "no recognized code-signing fields were present") }
	return out
}

func ParseGatekeeperEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "gatekeeper", Gatekeeper: &GatekeeperEvidence{Assessment: "unknown"}}
	lower := strings.ToLower(raw)
	switch {
	case strings.Contains(lower, ": accepted") || strings.Contains(lower, "accepted"):
		out.Gatekeeper.Assessment = "accepted"
	case strings.Contains(lower, ": rejected") || strings.Contains(lower, "rejected"):
		out.Gatekeeper.Assessment = "rejected"
	}
	for _, rawLine := range strings.Split(raw, "\n") {
		line := strings.TrimSpace(rawLine)
		if strings.HasPrefix(line, "source=") { out.Gatekeeper.Source = strings.TrimSpace(strings.TrimPrefix(line, "source=")) }
		if strings.HasPrefix(line, "origin=") { out.Gatekeeper.Origin = strings.TrimSpace(strings.TrimPrefix(line, "origin=")) }
	}
	if out.Gatekeeper.Assessment != "unknown" || out.Gatekeeper.Source != "" || out.Gatekeeper.Origin != "" { out.ParsedRows = 1 } else { out.Limitations = append(out.Limitations, "no recognized Gatekeeper assessment fields were present") }
	return out
}

func ParseSystemConsoleEvidence(toolID, raw string) ParsedSystemEvidence {
	switch toolID {
	case "process-table":
		return ParseProcessTableEvidence(raw)
	case "process-open-files":
		return ParseOpenFileEvidence(raw)
	case "disk-filesystems":
		return ParseFilesystemEvidence(raw)
	case "mount-table":
		return ParseMountEvidence(raw)
	case "code-signing":
		return ParseSigningEvidence(raw)
	case "gatekeeper-assessment":
		return ParseGatekeeperEvidence(raw)
	default:
		if out, ok := ParseExpandedSystemConsoleEvidence(toolID, raw); ok { return out }
		return ParsedSystemEvidence{Kind: "raw", Limitations: []string{"structured parser is not yet available for this evidence source"}}
	}
}

type StructuredSystemConsoleResult struct {
	Result              SystemConsoleResult               `json:"result"`
	Structured          ParsedSystemEvidence              `json:"structured"`
	Signals             []SystemEvidenceSignal            `json:"signals,omitempty"`
	ContinuationTargets []SystemConsoleContinuationTarget `json:"continuation_targets,omitempty"`
}

func RunStructuredSystemConsoleQuery(ctx context.Context, req SystemConsoleQueryRequest) (StructuredSystemConsoleResult, error) {
	result, err := RunSystemConsoleQuery(ctx, req)
	if err != nil { return StructuredSystemConsoleResult{}, err }
	parsed := ParseSystemConsoleEvidence(result.ToolID, result.Output)
	return StructuredSystemConsoleResult{Result: result, Structured: parsed, Signals: EvaluateSystemConsoleEvidence(result), ContinuationTargets: SystemConsoleContinuationTargets(result, parsed)}, nil
}

func (a *app) handleSystemConsoleStructuredQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return
	}
	mode := strings.TrimSpace(r.URL.Query().Get("mode"))
	cp := controlPlaneFor(a.ephemeral)
	switch mode {
	case "security-posture":
		writeJSON(w, http.StatusOK, a.securityPostureV23()); return
	case "system-evidence":
		writeJSON(w, http.StatusOK, map[string]any{"rows": cp.systemEvidence.list(100), "persistent": !a.ephemeral, "retention": systemEvidenceHistoryLimit, "note": "Only typed evidence summaries/signals are retained; raw Terminal output is not persisted in this journal."}); return
	case "system-snapshot-capture":
		s := captureSystemSnapshotV23(r.Context()); cp.systemSnapshots.add(s); writeJSON(w, http.StatusOK, s); return
	case "system-snapshots":
		writeJSON(w, http.StatusOK, map[string]any{"snapshots": cp.systemSnapshots.list(), "persistent": !a.ephemeral, "retention": systemSnapshotLimit}); return
	case "system-snapshot-diff":
		from, ok1 := cp.systemSnapshots.find(strings.TrimSpace(r.URL.Query().Get("from")))
		to, ok2 := cp.systemSnapshots.find(strings.TrimSpace(r.URL.Query().Get("to")))
		if !ok1 || !ok2 { writeJSON(w, http.StatusNotFound, map[string]any{"error": "both retained snapshot IDs are required"}); return }
		writeJSON(w, http.StatusOK, CompareSystemSnapshotsV23(from, to)); return
	case "storage-snapshot-capture":
		result := a.jobs.latestResult()
		if result == nil { writeJSON(w, http.StatusConflict, map[string]any{"error": "no completed storage scan result is available to capture"}); return }
		snapshot, err := cp.storageHistory.add(result, time.Now().Unix())
		if err != nil { writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()}); return }
		writeJSON(w, http.StatusOK, snapshot); return
	case "storage-history":
		comparison, ok := cp.storageHistory.latestComparison()
		writeJSON(w, http.StatusOK, map[string]any{"snapshots": cp.storageHistory.list(), "latest_comparison": comparison, "has_comparison": ok, "persistent": !a.ephemeral, "retention": storageSnapshotHistoryLimit}); return
	case "recovery":
		writeJSON(w, http.StatusOK, a.recoveryCenterV23()); return
	}

	var req SystemConsoleQueryRequest
	if err := decodeSystemConsoleJSON(r, &req); err != nil { writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request: " + err.Error()}); return }
	out, err := RunStructuredSystemConsoleQuery(r.Context(), req)
	if err != nil { writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()}); return }
	obs := systemEvidenceObservation(out.Result)
	cp.systemEvidence.add(obs)
	eligibleIncident := false
	if a.intel != nil {
		for _, sig := range obs.Signals {
			if sig.IncidentEligible && (sig.Severity == "review" || sig.Severity == "high") { eligibleIncident = true }
			if sig.Severity != "review" && sig.Severity != "high" { continue }
			a.intel.appendExternalEvent(TimelineEvent{ID: entityID("event", obs.ID+"|"+sig.Code), At: obs.At, Kind: "system_evidence", Severity: sig.Severity, Title: sig.Summary, Detail: sig.Detail, ObjectID: entityID("system-evidence", firstNonEmpty(obs.Target, obs.ToolID))})
		}
	} else {
		for _, sig := range obs.Signals {
			if sig.IncidentEligible && (sig.Severity == "review" || sig.Severity == "high") { eligibleIncident = true; break }
		}
	}
	if eligibleIncident && a.incidents != nil { a.refreshIncidentsWithSystemEvidence() }
	writeJSON(w, http.StatusOK, out)
}
