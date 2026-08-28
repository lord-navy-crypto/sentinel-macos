// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"runtime"
	"strings"
	"time"
)

type ReadinessCheck struct {
	Area   string `json:"area"`
	Status string `json:"status"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
	View   string `json:"view,omitempty"`
}

type ReadinessReport struct {
	GeneratedAt string           `json:"generated_at"`
	Version     string           `json:"version"`
	Score       int              `json:"score"`
	Band        string           `json:"band"`
	Checks      []ReadinessCheck `json:"checks"`
	Runtime     map[string]any   `json:"runtime"`
	Note        string           `json:"note"`
}

func readinessBand(score int) string {
	switch {
	case score >= 90:
		return "ready"
	case score >= 75:
		return "good-with-limits"
	case score >= 55:
		return "review"
	default:
		return "degraded"
	}
}

func (a *app) readiness() ReadinessReport {
	checks := []ReadinessCheck{}
	add := func(area, status, title, detail, view string) {
		checks = append(checks, ReadinessCheck{Area: area, Status: status, Title: title, Detail: detail, View: view})
	}
	if a.instanceLock != nil && a.instanceLock.held {
		add("runtime", "pass", "Single-instance state protection active", "Persistent Sentinel state has one active writer. Use --ephemeral for an isolated second read-only session.", "")
	} else if a.ephemeral {
		add("runtime", "pass", "Ephemeral isolated session", "No persistent state writer is needed because this session keeps monitoring history in memory and disables mutating Safe Actions.", "")
	} else {
		add("runtime", "review", "Single-instance lock unavailable", "Persistent state should have exactly one active Sentinel writer.", "weakness")
	}

	bh := a.behavior.health()
	if bh.Healthy {
		add("state", "pass", "Behavior state healthy", "Behavior baseline/history permissions and parseability are consistent with the current mode.", "behavior")
	} else {
		add("state", "review", "Behavior state needs attention", strings.Join(bh.Issues, "; "), "behavior")
	}
	th := a.trust.health()
	if th.Healthy {
		add("state", "pass", "Trusted Profile state healthy", "Trusted Profile, rollback copy, and history are internally consistent for the current mode.", "trust")
	} else {
		add("state", "review", "Trusted Profile state needs attention", strings.Join(th.Issues, "; "), "trust")
	}
	recovery := stateRecoveryStatus()
	if recovery.RecoveredReads > 0 {
		add("state", "review", "Last-known-good state backup was used", "At least one Sentinel-owned state file could not be decoded and a .bak copy was used in memory. Recreate or repair the affected local state before treating long-term comparisons as fully healthy.", "weakness")
	}
	ah := a.actions.health()
	if ah.Healthy {
		add("recovery", "pass", "Safe Actions recovery state healthy", "Vault manifests and the reversible-action journal passed local self-health checks.", "actions")
	} else {
		add("recovery", "high", "Safe Actions recovery state needs attention", strings.Join(ah.Issues, "; "), "actions")
	}
	cs := a.changes.status()
	if cs.NeedsRescan {
		add("monitoring", "review", "Change continuity requires reconciliation", "The change stream has a condition where incremental evidence should not be treated as complete.", "changes")
	} else if cs.Running {
		add("monitoring", "pass", "Change Monitor running", "Current mode: "+cs.Mode+".", "changes")
	} else {
		add("monitoring", "info", "Change Monitor is optional and stopped", "Start a focused watch only when you want session change intelligence.", "changes")
	}
	self := selfIntegrity()
	if self.HashStatus == "complete" {
		add("integrity", "pass", "Running Sentinel binary fingerprinted", "The current executable received a complete local SHA-256 fingerprint.", "integrity")
	} else {
		add("integrity", "review", "Running Sentinel fingerprint incomplete", self.HashStatus, "integrity")
	}
	if runtime.GOOS == "darwin" && self.NativeValidation.Available {
		if self.NativeValidation.Valid {
			add("integrity", "pass", "Native static-code validation passed", "Security.framework validation is available in this native build.", "integrity")
		} else {
			add("integrity", "review", "Native static-code validation did not pass", self.NativeValidation.Error, "integrity")
		}
	} else {
		add("integrity", "info", "Native static-code validation not available in this build", "This is expected for cross-built fallback binaries; validate on a real Mac native build before production distribution.", "integrity")
	}
	coverage := collectCoverageMap()
	if coverage.Unavailable > 0 {
		add("visibility", "review", "Some evidence sources are unavailable", "Visibility map reports unavailable sources; Sentinel should reduce confidence rather than invent evidence.", "weakness")
	} else if coverage.Limited > 0 {
		add("visibility", "info", "Visibility has known limits", "Some layers are intentionally limited or require Apple/user-controlled permissions.", "weakness")
	} else {
		add("visibility", "pass", "Configured evidence sources available", "No command-backed coverage item is currently marked unavailable.", "weakness")
	}

	penalty := 0
	for _, c := range checks {
		switch c.Status {
		case "high":
			penalty += 30
		case "review":
			penalty += 15
		case "info":
			penalty += 3
		}
	}
	score := 100 - penalty
	if score < 0 {
		score = 0
	}
	return ReadinessReport{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Version: sentinelVersion, Score: score, Band: readinessBand(score), Checks: checks, Runtime: map[string]any{"uptime_seconds": int64(time.Since(a.startedAt).Seconds()), "work_gate": a.work.status(), "instance_lock": a.instanceLock.status(), "ephemeral": a.ephemeral}, Note: "Readiness measures Sentinel's own runtime, recovery, state, and evidence availability. It is not a malware score or a claim that the Mac is safe."}
}

func (a *app) handleReadiness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, a.readiness())
}
