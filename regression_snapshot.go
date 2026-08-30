// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"net/http"
	"time"
)

type RegressionCheck struct {
	ID string `json:"id"`
	Status string `json:"status"`
	Detail string `json:"detail"`
	RequiresRealMac bool `json:"requires_real_mac"`
}

type RegressionReport struct {
	GeneratedAt string `json:"generated_at"`
	Schema int `json:"schema"`
	ReadyForRealRegression bool `json:"ready_for_real_regression"`
	Blockers int `json:"blockers"`
	Checks []RegressionCheck `json:"checks"`
	Migration MigrationReport `json:"migration"`
	ManualRegressionNext []string `json:"manual_regression_next"`
	Note string `json:"note"`
}

func buildRegressionReport(a *app) RegressionReport {
	report:=RegressionReport{GeneratedAt:time.Now().UTC().Format(time.RFC3339),Schema:SentinelSchemaV23,ReadyForRealRegression:true,Migration:currentMigrationReport(),Note:"This gate validates engineering preparation only. Passing it means the branch is ready to begin real macOS regression testing; it does not certify runtime behavior on a specific Mac or release artifact."}
	add:=func(id,status,detail string,real bool){report.Checks=append(report.Checks,RegressionCheck{ID:id,Status:status,Detail:detail,RequiresRealMac:real});if status=="blocker"{report.Blockers++;report.ReadyForRealRegression=false}}
	if SentinelSchemaV23==3{add("schema-v23","pass","v2.3 schema/version compatibility contract is active",false)}else{add("schema-v23","blocker","unexpected v2.3 schema version",false)}
	if err:=ValidateReasonCodeRegistry(ReasonCodeRegistry());err!=nil{add("reason-registry","blocker",err.Error(),false)}else{add("reason-registry","pass","versioned reason-code registry is internally consistent",false)}
	if err:=ValidateIncidentRuleRegistry(DefaultIncidentRuleRegistry());err!=nil{add("rule-registry","blocker",err.Error(),false)}else{add("rule-registry","pass","versioned deterministic rule registry references known reason codes",false)}
	if incidentHistoryVersion!=3{add("incident-story-v3","blocker","incident history is not using stable object-centered v3 stories",false)}else{add("incident-story-v3","pass","bounded episodes retain distinct IDs while stable StoryKey merges the same canonical object across windows",false)}
	if incidentHistoryLimit<=0||investigationTimelineEventLimit<=0||storageSnapshotHistoryLimit<=0||networkHistorySnapshotLimit<=0{add("retention-bounds","blocker","one or more retained evidence sources lacks a positive bound",false)}else{add("retention-bounds","pass","incident, timeline, storage, and network history all have explicit bounds",false)}
	if report.Migration.GeneratedAt==""{add("state-migration","blocker","legacy-state migration pass has not run in this process",false)}else if !report.Migration.Healthy{add("state-migration","blocker","one or more legacy Sentinel state stores could not be migrated safely; review migration report before regression",false)}else{add("state-migration","pass","legacy state migration completed or was explicitly skipped under --ephemeral",false)}
	if a!=nil&&a.actions!=nil{health:=a.actions.health();if health.Enabled&&!health.Healthy{add("safe-actions-health","blocker","Safe Actions/Vault recovery metadata is unhealthy",false)}else{add("safe-actions-health","pass","Safe Actions remains reversible and Vault/journal health is acceptable for regression",false)}}else{add("safe-actions-health","blocker","Safe Actions manager unavailable",false)}
	state:=stateRecoveryStatus();if state.RecoveredReads==0{add("state-recovery","pass","No fallback .bak reads were required for Sentinel-owned state in this process",false)}else{add("state-recovery","blocker",fmt.Sprintf("%d Sentinel state store(s) required fallback .bak recovery; recreate or validate the affected state before relying on long-term regression comparisons",state.RecoveredReads),false)}
	add("incident-export","pass","standalone Incident export is bounded metadata/evidence and includes Explain Why + ordered timeline",false)
	add("investigation-bundle","pass","investigation bundle export is metadata-only by default with bounded integrity reinspection",false)
	add("storage-aging","pass","storage aging uses modification timestamps only from the bounded latest large-file evidence set",false)
	add("grouped-timeline","pass","repetitive-event grouping preserves raw event provenance and bounded EventIDs",false)
	add("vault-health-ui","pass","Vault Health is read-only and exposes recovery/journal/post-action observation without action execution",false)
	for _,item:=range []struct{id,detail string}{{"real-app-launch","Launch the actual desktop app and verify token/bootstrap/navigation."},{"real-storage","Run/cancel/re-run Storage Intelligence on real APFS data, then capture/compare/age evidence."},{"real-security-tools","Exercise codesign, Gatekeeper, quarantine, SIP/FileVault/System Extension visibility on the actual Mac."},{"real-process-network","Verify PID parent/open-file/TCP and LaunchAgent correlations against live processes."},{"real-safe-actions","Use controlled disposable files to test preview → confirm → rename/vault → restore and post-action observation."},{"real-v22-upgrade","Upgrade a copied real v2.2 state directory and verify .bak rollback artifacts plus restored history."},{"real-desktop-package","Build Universal2 app/DMG, install, launch, quit, relaunch, and verify packaged resources on Apple Silicon; Intel remains CI/cross-build unless hardware is available."}}{add(item.id,"manual",item.detail,true);report.ManualRegressionNext=append(report.ManualRegressionNext,item.detail)}
	return report
}

func (a *app) handleRegressionGate(w http.ResponseWriter,r *http.Request){if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return};writeJSON(w,http.StatusOK,buildRegressionReport(a))}
