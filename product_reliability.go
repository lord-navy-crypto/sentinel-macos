// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	productReliabilityMarker = "Sentinel 2.8 Product Reliability"
	githubReleasesAPI        = "https://api.github.com/repos/lord-navy-crypto/sentinel-macos/releases?per_page=30"
)

var sentinelVersionPattern = regexp.MustCompile(`(?i)^v?(\d+)\.(\d+)\.(\d+)(?:[-+](.*))?$`)

type semanticVersion struct {
	Major      int
	Minor      int
	Patch      int
	Prerelease string
	Raw        string
}

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

type githubRelease struct {
	TagName     string               `json:"tag_name"`
	Name        string               `json:"name"`
	HTMLURL     string               `json:"html_url"`
	Draft       bool                 `json:"draft"`
	Prerelease  bool                 `json:"prerelease"`
	PublishedAt string               `json:"published_at"`
	Assets      []githubReleaseAsset `json:"assets"`
}

type updateStatusResponse struct {
	Marker             string `json:"marker"`
	CheckedAt          string `json:"checked_at"`
	Channel            string `json:"channel"`
	CurrentVersion     string `json:"current_version"`
	LatestVersion      string `json:"latest_version,omitempty"`
	UpdateAvailable    bool   `json:"update_available"`
	ReleaseName        string `json:"release_name,omitempty"`
	TagName            string `json:"tag_name,omitempty"`
	PublishedAt        string `json:"published_at,omitempty"`
	ReleaseURL         string `json:"release_url,omitempty"`
	DMGURL             string `json:"dmg_url,omitempty"`
	DMGName            string `json:"dmg_name,omitempty"`
	ChecksumURL        string `json:"checksum_url,omitempty"`
	TrustBoundary      string `json:"trust_boundary"`
	InstallSupported   bool   `json:"install_supported"`
	AutomaticDownload bool   `json:"automatic_download"`
}

type selfHealthResponse struct {
	Marker                    string   `json:"marker"`
	CapturedAt                string   `json:"captured_at"`
	Version                   string   `json:"version"`
	PID                       int      `json:"pid"`
	UptimeSeconds             float64  `json:"uptime_seconds"`
	ProcessCPUPercent         float64  `json:"process_cpu_percent,omitempty"`
	ProcessRSSBytes           int64    `json:"process_rss_bytes,omitempty"`
	GoHeapAllocBytes          uint64   `json:"go_heap_alloc_bytes"`
	GoHeapSysBytes            uint64   `json:"go_heap_sys_bytes"`
	GoSysBytes                uint64   `json:"go_sys_bytes"`
	GoRoutines                int      `json:"goroutines"`
	CompletedGC               uint32   `json:"completed_gc"`
	SampleDurationMS          float64  `json:"sample_duration_ms"`
	IdleCPUTargetPercent      float64  `json:"idle_cpu_target_percent"`
	MonitoringCPUTargetPercent float64 `json:"monitoring_cpu_target_percent"`
	AboveIdleTarget           bool     `json:"above_idle_target"`
	AboveMonitoringTarget     bool     `json:"above_monitoring_target"`
	Limited                   []string `json:"limited,omitempty"`
	Note                      string   `json:"note"`
}

func parseSentinelVersion(raw string) (semanticVersion, bool) {
	raw = strings.TrimSpace(raw)
	m := sentinelVersionPattern.FindStringSubmatch(raw)
	if len(m) != 5 {
		return semanticVersion{}, false
	}
	major, err1 := strconv.Atoi(m[1])
	minor, err2 := strconv.Atoi(m[2])
	patch, err3 := strconv.Atoi(m[3])
	if err1 != nil || err2 != nil || err3 != nil {
		return semanticVersion{}, false
	}
	return semanticVersion{Major: major, Minor: minor, Patch: patch, Prerelease: strings.TrimSpace(m[4]), Raw: raw}, true
}

func compareSemanticVersion(a, b semanticVersion) int {
	for _, pair := range [][2]int{{a.Major, b.Major}, {a.Minor, b.Minor}, {a.Patch, b.Patch}} {
		if pair[0] < pair[1] {
			return -1
		}
		if pair[0] > pair[1] {
			return 1
		}
	}
	// For the same numeric version, the stable build outranks a prerelease.
	if a.Prerelease == "" && b.Prerelease != "" {
		return 1
	}
	if a.Prerelease != "" && b.Prerelease == "" {
		return -1
	}
	if a.Prerelease < b.Prerelease {
		return -1
	}
	if a.Prerelease > b.Prerelease {
		return 1
	}
	return 0
}

func releaseLooksPrerelease(r githubRelease) bool {
	if r.Prerelease {
		return true
	}
	joined := strings.ToLower(r.TagName + " " + r.Name)
	for _, marker := range []string{"beta", "bets", "alpha", "preview", "prerelease", "-rc", " rc"} {
		if strings.Contains(joined, marker) {
			return true
		}
	}
	return false
}

func releaseVersion(r githubRelease) (semanticVersion, bool) {
	if v, ok := parseSentinelVersion(r.TagName); ok {
		return v, true
	}
	fields := strings.Fields(r.Name)
	for _, field := range fields {
		field = strings.Trim(field, "[](){}:,;")
		if v, ok := parseSentinelVersion(field); ok {
			return v, true
		}
	}
	return semanticVersion{}, false
}

func selectReleaseForChannel(releases []githubRelease, channel string) (githubRelease, semanticVersion, bool) {
	var best githubRelease
	var bestVersion semanticVersion
	found := false
	for _, r := range releases {
		if r.Draft {
			continue
		}
		if channel == "stable" && releaseLooksPrerelease(r) {
			continue
		}
		v, ok := releaseVersion(r)
		if !ok {
			continue
		}
		if !found || compareSemanticVersion(v, bestVersion) > 0 {
			best, bestVersion, found = r, v, true
		}
	}
	return best, bestVersion, found
}

func versionDisplay(v semanticVersion) string {
	base := fmt.Sprintf("%d.%d.%d", v.Major, v.Minor, v.Patch)
	if v.Prerelease != "" {
		return base + "-" + v.Prerelease
	}
	return base
}

func releaseAssetURLs(r githubRelease) (dmgName, dmgURL, checksumURL string) {
	for _, asset := range r.Assets {
		lower := strings.ToLower(asset.Name)
		switch {
		case strings.HasSuffix(lower, ".dmg") && dmgURL == "":
			dmgName, dmgURL = asset.Name, asset.BrowserDownloadURL
		case strings.HasSuffix(lower, ".dmg.sha256") && checksumURL == "":
			checksumURL = asset.BrowserDownloadURL
		}
	}
	return
}

func (a *app) handleUpdateStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	channel := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("channel")))
	if channel == "" {
		channel = "stable"
	}
	if channel != "stable" && channel != "beta" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "channel must be stable or beta"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubReleasesAPI, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "could not create update request"})
		return
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Sentinel-macOS/"+sentinelVersion)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "update source could not be reached", "detail": err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "update source returned an unexpected status", "status": resp.StatusCode})
		return
	}
	var releases []githubRelease
	dec := json.NewDecoder(http.MaxBytesReader(w, resp.Body, 2<<20))
	if err := dec.Decode(&releases); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "update source returned invalid release metadata"})
		return
	}

	current, currentOK := parseSentinelVersion(sentinelVersion)
	selected, latest, found := selectReleaseForChannel(releases, channel)
	out := updateStatusResponse{
		Marker: productReliabilityMarker, CheckedAt: time.Now().UTC().Format(time.RFC3339), Channel: channel,
		CurrentVersion: sentinelVersion, TrustBoundary: "Read-only release discovery. Sentinel does not download, install, replace, or execute an update from this endpoint.",
		InstallSupported: false, AutomaticDownload: false,
	}
	if found {
		out.LatestVersion = versionDisplay(latest)
		out.ReleaseName = selected.Name
		out.TagName = selected.TagName
		out.PublishedAt = selected.PublishedAt
		out.ReleaseURL = selected.HTMLURL
		out.DMGName, out.DMGURL, out.ChecksumURL = releaseAssetURLs(selected)
		out.UpdateAvailable = currentOK && compareSemanticVersion(latest, current) > 0
	}
	writeJSON(w, http.StatusOK, out)
}

func collectProcessSnapshot(ctx context.Context, pid int) (cpu float64, rssBytes int64, limited string) {
	cmd := exec.CommandContext(ctx, "/bin/ps", "-p", strconv.Itoa(pid), "-o", "%cpu=", "-o", "rss=")
	out, err := cmd.Output()
	if err != nil {
		return 0, 0, "Process CPU/RSS could not be sampled with /bin/ps."
	}
	fields := strings.Fields(string(out))
	if len(fields) < 2 {
		return 0, 0, "Process CPU/RSS sample was incomplete."
	}
	cpu, errCPU := strconv.ParseFloat(fields[0], 64)
	rssKB, errRSS := strconv.ParseInt(fields[1], 10, 64)
	if errCPU != nil || errRSS != nil {
		return 0, 0, "Process CPU/RSS sample could not be parsed."
	}
	return cpu, rssKB * 1024, ""
}

func (a *app) handleSelfHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	started := time.Now()
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	ctx, cancel := context.WithTimeout(r.Context(), 900*time.Millisecond)
	defer cancel()
	cpu, rss, limited := collectProcessSnapshot(ctx, os.Getpid())
	limits := []string{}
	if limited != "" {
		limits = append(limits, limited)
	}
	idleTarget := 1.0
	monitoringTarget := 3.0
	out := selfHealthResponse{
		Marker: productReliabilityMarker, CapturedAt: time.Now().UTC().Format(time.RFC3339), Version: sentinelVersion,
		PID: os.Getpid(), UptimeSeconds: time.Since(a.startedAt).Seconds(), ProcessCPUPercent: cpu, ProcessRSSBytes: rss,
		GoHeapAllocBytes: mem.HeapAlloc, GoHeapSysBytes: mem.HeapSys, GoSysBytes: mem.Sys,
		GoRoutines: runtime.NumGoroutine(), CompletedGC: mem.NumGC,
		IdleCPUTargetPercent: idleTarget, MonitoringCPUTargetPercent: monitoringTarget,
		AboveIdleTarget: cpu > idleTarget, AboveMonitoringTarget: cpu > monitoringTarget,
		Limited: limits,
		Note: "Self Health reports current Sentinel overhead evidence only. CPU targets are engineering budgets, not a hardware-health verdict, and a single sample does not establish a sustained regression.",
	}
	out.SampleDurationMS = float64(time.Since(started).Microseconds()) / 1000
	writeJSON(w, http.StatusOK, out)
}
