// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

type CoverageItem struct {
	Area       string `json:"area"`
	Status     string `json:"status"`
	Confidence string `json:"confidence"`
	Detail     string `json:"detail"`
	Requires   string `json:"requires,omitempty"`
}

type CoverageMap struct {
	GeneratedAt string         `json:"generated_at"`
	Items       []CoverageItem `json:"items"`
	Available   int            `json:"available"`
	Limited     int            `json:"limited"`
	Unavailable int            `json:"unavailable"`
	Note        string         `json:"note"`
}

func protectedVisibilityHeuristic() (string, string) {
	if runtime.GOOS != "darwin" {
		return "unavailable", "Protected-data visibility can only be meaningfully assessed on macOS."
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return "limited", "User Home could not be resolved."
	}
	candidates := []string{
		filepath.Join(home, "Library", "Mail"),
		filepath.Join(home, "Library", "Messages"),
		filepath.Join(home, "Library", "Safari"),
	}
	seen, readable := 0, 0
	for _, p := range candidates {
		st, err := os.Stat(p)
		if err != nil || !st.IsDir() {
			continue
		}
		seen++
		f, err := os.Open(p)
		if err == nil {
			_, readErr := f.Readdirnames(1)
			_ = f.Close()
			if readErr == nil || !os.IsPermission(readErr) {
				readable++
			}
		}
	}
	if seen == 0 {
		return "limited", "No standard protected-data probe directories were present; Full Disk Access visibility remains unknown."
	}
	if readable == seen {
		return "available", "Protected-data visibility probe succeeded for the standard directories that exist. This is only a heuristic and is not proof that every protected location is readable."
	}
	if readable == 0 {
		return "limited", "Standard protected-data probes were not readable. Full Disk Access may be absent or macOS privacy controls may limit visibility."
	}
	return "limited", "Protected-data visibility is partial. Some standard probes were readable and some were not."
}

func collectCoverageMap() CoverageMap {
	items := []CoverageItem{}
	addCmd := func(area, cmd, detail string) {
		status := "available"
		confidence := "direct"
		requires := ""
		if !commandExists(cmd) {
			status, confidence = "unavailable", "direct"
			requires = cmd + " on the local Mac"
		}
		items = append(items, CoverageItem{Area: area, Status: status, Confidence: confidence, Detail: detail, Requires: requires})
	}
	addCmd("Processes & parent lineage", "ps", "Bounded process inventory and parent PID context.")
	addCmd("Network sockets", "lsof", "TCP listeners/connections and process association.")
	addCmd("LaunchAgents / LaunchDaemons", "plutil", "Startup plist parsing and configuration fingerprinting.")
	addCmd("Modern Login & Background Items", "sfltool", "Best-effort snapshot of modern background registrations.")
	addCmd("Code identity", "codesign", "Identifier, Team ID, authority chain, and CLI signature verification.")
	addCmd("Gatekeeper context", "spctl", "Gatekeeper assessment context for explicitly inspected executables.")
	pStatus, pDetail := protectedVisibilityHeuristic()
	items = append(items, CoverageItem{Area: "Protected user data", Status: pStatus, Confidence: "heuristic", Detail: pDetail, Requires: "User-controlled Full Disk Access when broader visibility is needed"})
	changeStatus := "limited"
	changeConfidence := "architectural"
	changeDetail := "V2.2 provides bounded change monitoring with local compressed history/checkpoint support; this binary uses polling fallback unless the native CoreServices FSEvents bridge is compiled in."
	changeRequires := "Build on macOS with CGO enabled for native CoreServices FSEvents; polling fallback remains available."
	if nativeFSEventsAvailable() {
		changeStatus, changeConfidence = "available", "direct"
		changeDetail = "Native CoreServices FSEvents bridge is compiled into this build; explicit watch sessions can receive item-level directory hierarchy events."
		changeRequires = ""
	}
	items = append(items,
		CoverageItem{Area: "Directory change stream", Status: changeStatus, Confidence: changeConfidence, Detail: changeDetail, Requires: changeRequires},
		CoverageItem{Area: "Real-time endpoint telemetry", Status: "advanced-required", Confidence: "architectural", Detail: "No Endpoint Security System Extension is installed. Sentinel cannot claim complete real-time exec/fork/file authorization telemetry.", Requires: "Apple Endpoint Security entitlement + System Extension + user approval"},
	)
	out := CoverageMap{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Items: items, Note: "Coverage describes visibility, not safety. Missing evidence should reduce confidence rather than generate invented findings."}
	for _, i := range items {
		switch i.Status {
		case "available":
			out.Available++
		case "unavailable":
			out.Unavailable++
		default:
			out.Limited++
		}
	}
	return out
}

func (a *app) handleCoverageMap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, collectCoverageMap())
}

type WeaknessFinding struct {
	Severity string `json:"severity"`
	Area     string `json:"area"`
	Title    string `json:"title"`
	Evidence string `json:"evidence"`
	Improve  string `json:"improve"`
}

type WeaknessAudit struct {
	GeneratedAt string            `json:"generated_at"`
	Score       int               `json:"score"`
	Band        string            `json:"band"`
	Findings    []WeaknessFinding `json:"findings"`
	Coverage    CoverageMap       `json:"coverage"`
	Note        string            `json:"note"`
}

func weaknessBand(score int) string {
	switch {
	case score >= 80:
		return "Strong with known limits"
	case score >= 60:
		return "Good but review blind spots"
	case score >= 40:
		return "Limited visibility"
	default:
		return "Development / weak visibility"
	}
}

func (a *app) weaknessAudit() WeaknessAudit {
	coverage := collectCoverageMap()
	findings := []WeaknessFinding{}
	add := func(sev, area, title, evidence, improve string) {
		findings = append(findings, WeaknessFinding{Severity: sev, Area: area, Title: title, Evidence: evidence, Improve: improve})
	}

	if runtime.GOOS != "darwin" {
		add("review", "Platform", "Not running on macOS", "This host is "+runtime.GOOS+"/"+runtime.GOARCH+"; macOS-only evidence cannot be validated here.", "Run the release on a real Mac before treating macOS-specific evidence as verified.")
	}
	if coverage.Unavailable > 0 {
		add("review", "Evidence", "Some local evidence sources are unavailable", "Coverage map reports unavailable command-backed sources.", "Install/use the normal macOS environment where those Apple/system utilities are present; never substitute invented results.")
	}
	for _, c := range coverage.Items {
		if c.Area == "Protected user data" && c.Status != "available" {
			add("info", "Permissions", "Protected-data visibility is incomplete or unknown", c.Detail, "If broader inspection is desired, grant Full Disk Access manually in System Settings. Sentinel must not bypass TCC.")
		}
	}
	cs := ChangeStatus{NativeAvailable: nativeFSEventsAvailable()}
	if a.changes != nil {
		cs = a.changes.status()
	}
	if cs.NativeAvailable {
		add("good", "Filesystem monitoring", "Native FSEvents bridge available", "This build can subscribe to CoreServices FSEvents for explicit watch sessions.", "Keep dropped/root-changed handling conservative: rescan rather than trusting incomplete deltas.")
	} else {
		add("info", "Filesystem monitoring", "Bounded polling fallback in this build", "V2.2 Change Monitor is available, but the native CoreServices FSEvents bridge is not compiled into this binary.", "Rebuild on a real Mac with CGO enabled to embed the native FSEvents bridge; the fallback remains useful and explicitly labeled.")
	}
	add("info", "Endpoint telemetry", "No Endpoint Security System Extension", "Sentinel cannot observe every process/file authorization event in real time.", "Treat Endpoint Security as an optional advanced edition requiring Apple entitlement, code signing, System Extension packaging, and user approval.")
	add("info", "Code validation", "CLI identity checks are not the strongest possible static-code validator", "V2.2 keeps codesign/spctl context and also includes a Security.framework SecStaticCodeCheckValidityWithErrors bridge in real-macOS CGO builds.", "On native builds, prefer the Security.framework result and keep CLI evidence as complementary context. Universal-code validation requests all-architecture checking.")

	if a.allowedHost == "" || a.serverOrigin == "" {
		add("high", "Local server", "Server origin guard is not initialized", "Expected loopback Host/Origin state is missing.", "Do not expose API routes until the listener address has initialized the request guard.")
	} else {
		add("good", "Local server", "Loopback + Host/Origin request guard enabled", "The API is token-authenticated and rejects unexpected Host, Origin, and cross-site browser requests.", "Keep the service bound to 127.0.0.1 and never add a 0.0.0.0 fallback.")
	}

	if a.actions != nil {
		ah := a.actions.health()
		if !ah.Healthy {
			add("review", "Recovery", "Safe Actions state needs review", strings.Join(ah.Issues, "; "), "Resolve Vault/journal integrity issues before performing reversible actions.")
		}
	}
	if a.behavior != nil {
		bh := a.behavior.health()
		if !bh.Healthy {
			add("review", "Behavior history", "Behavior state needs review", strings.Join(bh.Issues, "; "), "Repair or recreate the local baseline/history before relying on cross-session comparison.")
		}
	}
	if a.trust != nil {
		th := a.trust.health()
		if !th.Healthy {
			add("review", "Trusted Profile", "Trust state needs review", strings.Join(th.Issues, "; "), "Review profile/history integrity; refresh only after confirming the Mac is in the intended reference state.")
		}
	}

	weights := map[string]int{"high": 20, "review": 10, "info": 3}
	penalty := 0
	for _, f := range findings {
		penalty += weights[strings.ToLower(f.Severity)]
	}
	score := 100 - penalty
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	sort.SliceStable(findings, func(i, j int) bool {
		rank := func(s string) int {
			switch strings.ToLower(s) {
			case "high":
				return 0
			case "review":
				return 1
			case "info":
				return 2
			default:
				return 3
			}
		}
		return rank(findings[i].Severity) < rank(findings[j].Severity)
	})
	return WeaknessAudit{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Score: score, Band: weaknessBand(score), Findings: findings, Coverage: coverage, Note: "Weakness Audit scores Sentinel's current visibility and defensive posture, not the Mac's malware status. A lower score means more blind spots or degraded evidence, not proof of compromise."}
}

func (a *app) handleWeaknessAudit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, a.weaknessAudit())
}
