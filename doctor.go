// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"time"
)

type DoctorCheck struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail"`
}

type DoctorReport struct {
	Version     string        `json:"version"`
	GeneratedAt string        `json:"generated_at"`
	OS          string        `json:"os"`
	Arch        string        `json:"arch"`
	Checks      []DoctorCheck `json:"checks"`
	Note        string        `json:"note"`
}

func collectDoctorReport() DoctorReport {
	checks := []DoctorCheck{
		{Name: "Loopback-only server", Status: "pass", Detail: "Sentinel binds HTTP only to 127.0.0.1."},
		{Name: "Cloud dependency", Status: "pass", Detail: "Core scanning, comparison, and report generation do not require a cloud service."},
		{Name: "Permanent deletion", Status: "pass", Detail: "V2.2 implements no permanent file deletion endpoint. Eligible user-home files can only be renamed or moved to a reversible Sentinel Vault after explicit confirmation."},
		{Name: "Safe Actions recovery", Status: "guarded", Detail: "Rename/Vault/Restore use no-overwrite rules, preview expiry, typed confirmation, one-time code, object revalidation, and a local operation journal."},
		{Name: "Full Disk Access", Status: "user-controlled", Detail: "macOS requires the user to grant Full Disk Access in System Settings; Sentinel does not attempt to bypass or silently acquire it."},
		{Name: "Endpoint Security", Status: "not-enabled", Detail: "True Endpoint Security event streaming requires Apple entitlement + System Extension. V2.2 includes a notification-only Endpoint Security sensor scaffold, but the normal release does not install or claim an entitled System Extension."},
		{Name: "Persistence integrity", Status: "session-only", Detail: "Visible LaunchAgent/LaunchDaemon plist configuration can be fingerprinted and compared without a background daemon."},
		{Name: "Filesystem change intelligence", Status: map[bool]string{true: "native-ready", false: "fallback-ready"}[nativeFSEventsAvailable()], Detail: map[bool]string{true: "Native CoreServices FSEvents bridge is compiled into this build.", false: "Bounded polling fallback is available; rebuild on macOS with CGO enabled for native CoreServices FSEvents."}[nativeFSEventsAvailable()]},
	}
	for _, c := range collectCapabilities() {
		status := "available"
		if !c.Available {
			status = "unavailable"
		}
		checks = append(checks, DoctorCheck{Name: c.Name, Status: status, Detail: c.Purpose})
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		checks = append(checks, DoctorCheck{Name: "Local state directory", Status: "available", Detail: behaviorBaselinePath()})
	} else {
		checks = append(checks, DoctorCheck{Name: "Local state directory", Status: "unavailable", Detail: "User home directory could not be resolved."})
	}
	return DoctorReport{Version: sentinelVersion, GeneratedAt: time.Now().UTC().Format(time.RFC3339), OS: runtime.GOOS, Arch: runtime.GOARCH, Checks: checks, Note: "Unavailable macOS-specific evidence should reduce visibility, not create invented findings."}
}

func runDoctor() {
	r := collectDoctorReport()
	fmt.Printf("Sentinel macOS v%s doctor\n", r.Version)
	fmt.Printf("Host: %s/%s\n\n", r.OS, r.Arch)
	for _, c := range r.Checks {
		fmt.Printf("%-24s %-12s %s\n", c.Name, c.Status, c.Detail)
	}
	fmt.Println("\n" + r.Note)
}

func (a *app) handleDoctor(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, http.StatusOK, collectDoctorReport())
}

type SupportDiagnostics struct {
	SchemaVersion  int                  `json:"schema_version"`
	ReportKind     string               `json:"report_kind"`
	GeneratedAt    string               `json:"generated_at"`
	Version        string               `json:"version"`
	Doctor         DoctorReport         `json:"doctor"`
	Behavior       map[string]any       `json:"behavior_state"`
	Trust          map[string]any       `json:"trust_state"`
	Actions        map[string]any       `json:"safe_actions_state"`
	Coverage       map[string]int       `json:"visibility_coverage"`
	Posture        map[string]any       `json:"sentinel_posture"`
	Changes        map[string]any       `json:"change_monitor"`
	Incidents      map[string]any       `json:"incidents"`
	AdvancedSensor AdvancedSensorStatus `json:"advanced_sensor"`
	Readiness      map[string]any       `json:"sentinel_readiness"`
	StateRecovery  map[string]any       `json:"state_recovery"`
	Runtime        map[string]any       `json:"runtime"`
	Privacy        string               `json:"privacy"`
}

func (a *app) supportDiagnostics() SupportDiagnostics {
	bh := a.behavior.health()
	th := a.trust.health()
	ah := a.actions.health()
	coverage := collectCoverageMap()
	weakness := a.weaknessAudit()
	changes := a.changes.status()
	incidents := a.incidents.snapshot(false)
	readiness := a.readiness()
	recovery := stateRecoveryStatus()
	return SupportDiagnostics{
		SchemaVersion: 2, ReportKind: "sentinel-low-sensitivity-diagnostics", GeneratedAt: time.Now().UTC().Format(time.RFC3339), Version: sentinelVersion, Doctor: collectDoctorReport(),
		Behavior:       map[string]any{"mode": bh.Mode, "healthy": bh.Healthy, "issues": bh.Issues, "baseline_exists": bh.BaselineExists, "baseline_valid": bh.BaselineValid, "baseline_mode": bh.BaselineMode, "history_exists": bh.HistoryExists, "history_valid": bh.HistoryValid, "history_mode": bh.HistoryMode, "history_entries": bh.HistoryEntries},
		Trust:          map[string]any{"mode": th.Mode, "healthy": th.Healthy, "issues": th.Issues, "profile_exists": th.ProfileExists, "profile_valid": th.ProfileValid, "profile_mode": th.ProfileMode, "backup_exists": th.BackupExists, "backup_valid": th.BackupValid, "backup_mode": th.BackupMode, "history_exists": th.HistoryExists, "history_valid": th.HistoryValid, "history_mode": th.HistoryMode, "history_entries": th.HistoryEntries, "objects": th.Objects},
		Actions:        map[string]any{"mode": ah.Mode, "enabled": ah.Enabled, "healthy": ah.Healthy, "journal_exists": ah.JournalExists, "journal_valid": ah.JournalValid, "journal_entries": ah.JournalEntries, "active_vault_items": ah.ActiveVaultItems, "manifest_issues": ah.ManifestIssues},
		Coverage:       map[string]int{"available": coverage.Available, "limited": coverage.Limited, "unavailable": coverage.Unavailable},
		Posture:        map[string]any{"score": weakness.Score, "band": weakness.Band},
		Changes:        map[string]any{"running": changes.Running, "mode": changes.Mode, "native_available": changes.NativeAvailable, "event_count": changes.EventCount, "history_entries": changes.HistoryEntries, "needs_rescan": changes.NeedsRescan},
		Incidents:      map[string]any{"count": incidents.Count, "high": incidents.High, "review": incidents.Review},
		AdvancedSensor: advancedSensorStatus(),
		Readiness:      map[string]any{"score": readiness.Score, "band": readiness.Band, "checks": len(readiness.Checks)},
		StateRecovery:  map[string]any{"recovered_reads": recovery.RecoveredReads},
		Runtime:        map[string]any{"ephemeral": a.ephemeral, "work_gate": a.work.status(), "single_instance_guard": a.instanceLock != nil && a.instanceLock.held},
		Privacy:        "Low-sensitivity support diagnostics intentionally omit hostname, process lists, network endpoints, file paths, file fingerprints, Vault paths, Vault manifests, incident object paths, and action-journal object details.",
	}
}

func (a *app) handleDiagnosticsExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required"})
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=sentinel-diagnostics.json")
	_ = json.NewEncoder(w).Encode(a.supportDiagnostics())
}
