// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"context"
	"net/http"
	"strconv"
	"strings"
)

type ProcessEvidenceRow struct {
	PID         int     `json:"pid"`
	PPID        int     `json:"ppid"`
	User        string  `json:"user"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryPct   float64 `json:"memory_percent"`
	Elapsed     string  `json:"elapsed"`
	Command     string  `json:"command"`
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
	Filesystems []FilesystemEvidenceRow `json:"filesystems,omitempty"`
	Mounts      []MountEvidenceRow      `json:"mounts,omitempty"`
	Signing     *SigningEvidence        `json:"signing,omitempty"`
	Gatekeeper  *GatekeeperEvidence     `json:"gatekeeper,omitempty"`
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
		if line == "" {
			continue
		}
		lineNo++
		if lineNo == 1 && strings.Contains(strings.ToUpper(line), "PID") {
			continue
		}
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
		out.Processes = append(out.Processes, ProcessEvidenceRow{
			PID: pid, PPID: ppid, User: fields[2],
			CPUPercent: parseFloatEvidence(fields[3]),
			MemoryPct:  parseFloatEvidence(fields[4]),
			Elapsed:    fields[5],
			Command:    strings.Join(fields[6:], " "),
		})
	}
	out.ParsedRows = len(out.Processes)
	if scanner.Err() != nil {
		out.Limitations = appendUniqueString(out.Limitations, "process output scan was incomplete")
	}
	return out
}

func ParseFilesystemEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "filesystem_usage"}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(strings.ToLower(line), "filesystem") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 6 {
			out.Limitations = appendUniqueString(out.Limitations, "one or more filesystem rows could not be parsed")
			continue
		}
		mountIndex := 5
		// macOS df commonly includes inode columns before "Mounted on". The
		// mount point is therefore the final visible field for ordinary paths.
		if len(fields) >= 9 {
			mountIndex = len(fields) - 1
		}
		out.Filesystems = append(out.Filesystems, FilesystemEvidenceRow{
			Filesystem: fields[0], Size: fields[1], Used: fields[2],
			Available: fields[3], Capacity: fields[4],
			MountedOn: strings.Join(fields[mountIndex:], " "),
		})
	}
	out.ParsedRows = len(out.Filesystems)
	if scanner.Err() != nil {
		out.Limitations = appendUniqueString(out.Limitations, "filesystem output scan was incomplete")
	}
	return out
}

func ParseMountEvidence(raw string) ParsedSystemEvidence {
	out := ParsedSystemEvidence{Kind: "mount_table"}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
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
				if item = strings.TrimSpace(item); item != "" {
					options = append(options, item)
				}
			}
		}
		out.Mounts = append(out.Mounts, MountEvidenceRow{Device: device, MountedOn: mountedOn, Options: options})
	}
	out.ParsedRows = len(out.Mounts)
	if scanner.Err() != nil {
		out.Limitations = appendUniqueString(out.Limitations, "mount output scan was incomplete")
	}
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
	if out.Signing.Identifier != "" || out.Signing.TeamIdentifier != "" || out.Signing.Signature != "" || len(out.Signing.Authorities) > 0 {
		out.ParsedRows = 1
	} else {
		out.Limitations = append(out.Limitations, "no recognized code-signing fields were present")
	}
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
		if strings.HasPrefix(line, "source=") {
			out.Gatekeeper.Source = strings.TrimSpace(strings.TrimPrefix(line, "source="))
		}
		if strings.HasPrefix(line, "origin=") {
			out.Gatekeeper.Origin = strings.TrimSpace(strings.TrimPrefix(line, "origin="))
		}
	}
	if out.Gatekeeper.Assessment != "unknown" || out.Gatekeeper.Source != "" || out.Gatekeeper.Origin != "" {
		out.ParsedRows = 1
	} else {
		out.Limitations = append(out.Limitations, "no recognized Gatekeeper assessment fields were present")
	}
	return out
}

func ParseSystemConsoleEvidence(toolID, raw string) ParsedSystemEvidence {
	switch toolID {
	case "process-table":
		return ParseProcessTableEvidence(raw)
	case "disk-filesystems":
		return ParseFilesystemEvidence(raw)
	case "mount-table":
		return ParseMountEvidence(raw)
	case "code-signing":
		return ParseSigningEvidence(raw)
	case "gatekeeper-assessment":
		return ParseGatekeeperEvidence(raw)
	default:
		return ParsedSystemEvidence{Kind: "raw", Limitations: []string{"structured parser is not yet available for this evidence source"}}
	}
}

type StructuredSystemConsoleResult struct {
	Result     SystemConsoleResult  `json:"result"`
	Structured ParsedSystemEvidence `json:"structured"`
}

func RunStructuredSystemConsoleQuery(ctx context.Context, req SystemConsoleQueryRequest) (StructuredSystemConsoleResult, error) {
	result, err := RunSystemConsoleQuery(ctx, req)
	if err != nil {
		return StructuredSystemConsoleResult{}, err
	}
	return StructuredSystemConsoleResult{
		Result:     result,
		Structured: ParseSystemConsoleEvidence(result.ToolID, result.Output),
	}, nil
}

func (a *app) handleSystemConsoleStructuredQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required"})
		return
	}
	var req SystemConsoleQueryRequest
	if err := decodeSystemConsoleJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid request: " + err.Error()})
		return
	}
	out, err := RunStructuredSystemConsoleQuery(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}
