// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type LaunchManifest struct {
	Label             string `json:"label,omitempty"`
	Program           string `json:"program,omitempty"`
	ArgumentCount     int    `json:"argument_count"`
	RunAtLoad         bool   `json:"run_at_load"`
	KeepAlive         string `json:"keep_alive,omitempty"`
	WorkingDirectory  string `json:"working_directory,omitempty"`
	ProcessType       string `json:"process_type,omitempty"`
	ThrottleInterval  int    `json:"throttle_interval,omitempty"`
	MachServicesCount int    `json:"mach_services_count"`
	StandardOutPath   string `json:"standard_out_path,omitempty"`
	StandardErrorPath string `json:"standard_error_path,omitempty"`
	Parsed            bool   `json:"parsed"`
	Source            string `json:"source"`
}

func parseLaunchManifest(path string) LaunchManifest {
	m := LaunchManifest{Source: "limited XML fallback"}
	if runtime.GOOS == "darwin" && commandExists("plutil") {
		out, err := commandOutputTimeout(2500*time.Millisecond, "plutil", "-convert", "json", "-o", "-", path)
		if err == nil {
			var v map[string]any
			if json.Unmarshal(out, &v) == nil {
				m.Parsed = true
				m.Source = "plutil JSON"
				m.Label = asString(v["Label"])
				m.Program = asString(v["Program"])
				if args, ok := v["ProgramArguments"].([]any); ok {
					m.ArgumentCount = len(args)
					if m.Program == "" && len(args) > 0 {
						m.Program = asString(args[0])
					}
				}
				m.RunAtLoad = asBool(v["RunAtLoad"])
				if ka, ok := v["KeepAlive"]; ok {
					m.KeepAlive = summarizeKeepAlive(ka)
				}
				m.WorkingDirectory = asString(v["WorkingDirectory"])
				m.ProcessType = asString(v["ProcessType"])
				m.ThrottleInterval = asInt(v["ThrottleInterval"])
				if ms, ok := v["MachServices"].(map[string]any); ok {
					m.MachServicesCount = len(ms)
				}
				m.StandardOutPath = asString(v["StandardOutPath"])
				m.StandardErrorPath = asString(v["StandardErrorPath"])
				return m
			}
		}
	}
	b, err := os.ReadFile(path)
	if err != nil || len(b) > 1024*1024 {
		return m
	}
	s := string(b)
	xmlString := func(key string) string {
		re := regexp.MustCompile(`(?s)<key>` + regexp.QuoteMeta(key) + `</key>\s*<string>([^<]+)</string>`)
		x := re.FindStringSubmatch(s)
		if len(x) == 2 {
			return strings.TrimSpace(x[1])
		}
		return ""
	}
	m.Label = xmlString("Label")
	m.Program = xmlString("Program")
	m.WorkingDirectory = xmlString("WorkingDirectory")
	m.ProcessType = xmlString("ProcessType")
	if regexp.MustCompile(`(?s)<key>RunAtLoad</key>\s*<true\s*/>`).MatchString(s) {
		m.RunAtLoad = true
	}
	if regexp.MustCompile(`(?s)<key>KeepAlive</key>\s*<true\s*/>`).MatchString(s) {
		m.KeepAlive = "true"
	}
	if m.Program != "" || m.Label != "" {
		m.Parsed = true
	}
	return m
}

func asString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
func asBool(v any) bool { b, _ := v.(bool); return b }
func asInt(v any) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	case string:
		i, _ := strconv.Atoi(x)
		return i
	}
	return 0
}
func summarizeKeepAlive(v any) string {
	switch x := v.(type) {
	case bool:
		return strconv.FormatBool(x)
	case map[string]any:
		return fmt.Sprintf("conditional (%d rules)", len(x))
	default:
		return "configured"
	}
}
