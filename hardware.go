// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"net/http"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// HardwareProfile is deliberately limited to non-unique device characteristics.
// Sentinel does not collect or expose the Mac serial number or Hardware UUID here.
type HardwareProfile struct {
	GeneratedAt        string `json:"generated_at"`
	PlatformFamily     string `json:"platform_family"`
	ModelName          string `json:"model_name"`
	ModelIdentifier    string `json:"model_identifier"`
	Chip               string `json:"chip"`
	Processor          string `json:"processor"`
	Architecture       string `json:"architecture"`
	PhysicalCores      int    `json:"physical_cores"`
	LogicalCores       int    `json:"logical_cores"`
	PerformanceCores   int    `json:"performance_cores"`
	EfficiencyCores    int    `json:"efficiency_cores"`
	MemoryBytes        uint64 `json:"memory_bytes"`
	OSName             string `json:"os_name"`
	OSVersion          string `json:"os_version"`
	OSBuild            string `json:"os_build"`
	KernelVersion      string `json:"kernel_version"`
	RosettaTranslated  bool   `json:"rosetta_translated"`
	EngineArchitecture string `json:"engine_architecture"`
	EngineExplanation  string `json:"engine_explanation"`
	DiskTotal          uint64 `json:"disk_total"`
	DiskAvailable      uint64 `json:"disk_available"`
	Privacy            string `json:"privacy"`
}

func (a *app) handleSystemProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, collectHardwareProfile())
}

func collectHardwareProfile() HardwareProfile {
	p := HardwareProfile{
		GeneratedAt:        time.Now().UTC().Format(time.RFC3339),
		Architecture:       runtime.GOARCH,
		EngineArchitecture: runtime.GOARCH,
		PhysicalCores:      runtime.NumCPU(),
		LogicalCores:       runtime.NumCPU(),
		OSName:             runtime.GOOS,
		Privacy:            "System Profile intentionally omits the device serial number and Hardware UUID. Low-sensitivity diagnostics must not add them.",
	}

	total, _, avail := genericDisk()
	p.DiskTotal, p.DiskAvailable = total, avail

	if runtime.GOOS != "darwin" {
		p.PlatformFamily = "Development host"
		p.ModelName = "Non-macOS development host"
		p.ModelIdentifier = runtime.GOOS + "/" + runtime.GOARCH
		p.Processor = runtime.GOARCH
		p.Chip = runtime.GOARCH
		p.EngineExplanation = "This is a development-host fallback. On macOS Sentinel reports Apple Silicon or Intel hardware using bounded local system tools."
		return p
	}

	p.MemoryBytes, _ = macMemory()
	p.DiskTotal, _, p.DiskAvailable = macDisk()

	fields := collectSystemProfilerFields()
	p.ModelName = firstNonEmpty(fields["Model Name"], sysctlString("hw.model"), "Mac")
	p.ModelIdentifier = firstNonEmpty(fields["Model Identifier"], sysctlString("hw.model"), "Unknown")
	p.Chip = firstNonEmpty(fields["Chip"], fields["Processor Name"], sysctlString("machdep.cpu.brand_string"), "Unknown")
	p.Processor = firstNonEmpty(fields["Processor Name"], fields["Chip"], sysctlString("machdep.cpu.brand_string"), p.Chip)

	if v := sysctlInt("hw.physicalcpu"); v > 0 {
		p.PhysicalCores = v
	}
	if v := sysctlInt("hw.logicalcpu"); v > 0 {
		p.LogicalCores = v
	}
	p.PerformanceCores, p.EfficiencyCores = parseCoreBreakdown(fields["Total Number of Cores"])

	p.OSName = firstNonEmpty(swVers("-productName"), "macOS")
	p.OSVersion = swVers("-productVersion")
	p.OSBuild = swVers("-buildVersion")
	if out, err := commandOutputTimeout(2*time.Second, "uname", "-r"); err == nil {
		p.KernelVersion = strings.TrimSpace(string(out))
	}
	p.RosettaTranslated = sysctlInt("sysctl.proc_translated") == 1

	appleSilicon := sysctlInt("hw.optional.arm64") == 1 || runtime.GOARCH == "arm64" || strings.HasPrefix(strings.ToLower(p.Chip), "apple ")
	if appleSilicon {
		p.PlatformFamily = "Apple Silicon"
		p.EngineExplanation = "Apple Silicon Mac. Sentinel should use its arm64 engine; a Universal desktop shell chooses the matching engine automatically."
	} else {
		p.PlatformFamily = "Intel Mac"
		p.EngineExplanation = "Intel Mac. Sentinel should use its x86_64 engine; a Universal desktop shell chooses the matching engine automatically."
	}
	if p.RosettaTranslated {
		p.EngineExplanation += " The current process appears to be translated by Rosetta 2, so native arm64 execution is preferable when available."
	}
	return p
}

func collectSystemProfilerFields() map[string]string {
	result := map[string]string{}
	if !commandExists("system_profiler") {
		return result
	}
	out, err := commandOutputTimeout(5*time.Second, "system_profiler", "SPHardwareDataType")
	if err != nil {
		return result
	}
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.Contains(line, ":") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		key, value := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
		switch key {
		case "Model Name", "Model Identifier", "Chip", "Processor Name", "Total Number of Cores":
			if value != "" {
				result[key] = value
			}
			// Serial Number and Hardware UUID are intentionally ignored.
		}
	}
	return result
}

func parseCoreBreakdown(v string) (performance, efficiency int) {
	lower := strings.ToLower(v)
	if start := strings.Index(lower, "("); start >= 0 {
		lower = lower[start+1:]
	}
	fields := strings.FieldsFunc(lower, func(r rune) bool {
		return r == ' ' || r == ',' || r == ')' || r == '(' || r == '\t'
	})
	for i, token := range fields {
		if i+1 >= len(fields) {
			continue
		}
		n, err := strconv.Atoi(token)
		if err != nil {
			continue
		}
		next := fields[i+1]
		if strings.HasPrefix(next, "performance") {
			performance = n
		}
		if strings.HasPrefix(next, "efficiency") {
			efficiency = n
		}
	}
	return
}

func sysctlString(key string) string {
	if _, err := exec.LookPath("sysctl"); err != nil {
		return ""
	}
	out, err := commandOutputTimeout(2*time.Second, "sysctl", "-n", key)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func sysctlInt(key string) int {
	v := sysctlString(key)
	n, _ := strconv.Atoi(v)
	return n
}

func swVers(flag string) string {
	if _, err := exec.LookPath("sw_vers"); err != nil {
		return ""
	}
	out, err := commandOutputTimeout(2*time.Second, "sw_vers", flag)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
