// SPDX-License-Identifier: MPL-2.0
package main

import (
	"sort"
	"strings"
)

type RuntimeJobSummaryV23 struct {
	Total     int `json:"total"`
	Running   int `json:"running"`
	Complete  int `json:"complete"`
	Failed    int `json:"failed"`
	Cancelled int `json:"cancelled"`
	Other     int `json:"other"`
}

type RuntimeReadinessSummaryV23 struct {
	Pass   int `json:"pass"`
	Info   int `json:"info"`
	Review int `json:"review"`
	High   int `json:"high"`
	Other  int `json:"other"`
}

type RuntimeDiagnosticsAnalysisV23 struct {
	WorkGateActive        int64                       `json:"work_gate_active"`
	WorkGateCapacity      int                         `json:"work_gate_capacity"`
	WorkGateSaturated     bool                        `json:"work_gate_saturated"`
	StorageJobs           RuntimeJobSummaryV23        `json:"storage_jobs"`
	ReadinessChecks       RuntimeReadinessSummaryV23  `json:"readiness_checks"`
	StateRecoveredReads   int                         `json:"state_recovered_reads"`
	MigrationHealthy      bool                        `json:"migration_healthy"`
	MigrationErrors       int                         `json:"migration_errors"`
	Pressure              string                      `json:"pressure"`
	Reasons               []string                    `json:"reasons,omitempty"`
	OperationalGuidance   []string                    `json:"operational_guidance"`
	Privacy               string                      `json:"privacy"`
}

func (m *scanManager) alphaJobSummaryV23() RuntimeJobSummaryV23 {
	if m == nil { return RuntimeJobSummaryV23{} }
	m.mu.RLock()
	defer m.mu.RUnlock()
	out:=RuntimeJobSummaryV23{Total:len(m.jobs)}
	for _,job:=range m.jobs {
		if job==nil { out.Other++;continue }
		switch strings.ToLower(job.Status){case"running":out.Running++;case"complete":out.Complete++;case"failed":out.Failed++;case"cancelled":out.Cancelled++;default:out.Other++}
	}
	return out
}

func runtimeReadinessSummaryV23(in ReadinessReport) RuntimeReadinessSummaryV23 {
	out:=RuntimeReadinessSummaryV23{}
	for _,check:=range in.Checks{switch strings.ToLower(check.Status){case"pass":out.Pass++;case"info":out.Info++;case"review":out.Review++;case"high":out.High++;default:out.Other++}}
	return out
}

func migrationErrorCountV23(in V23MigrationReport) int { n:=0;for _,r:=range in.Results{if r.Status=="error"{n++}};return n }

func (a *app) runtimeDiagnosticsAnalysisV23() RuntimeDiagnosticsAnalysisV23 {
	out:=RuntimeDiagnosticsAnalysisV23{Pressure:"normal",OperationalGuidance:[]string{"Expensive local analysis remains bounded by the work gate.","Failed/cancelled storage jobs remain visible as operational state rather than being silently discarded.","Diagnostics omit investigated paths, process lists, network endpoints, Vault object details, and fingerprints."},Privacy:"Operational counters only; no new user-object identifiers are collected for this analysis."}
	if a!=nil&&a.work!=nil{out.WorkGateActive=a.work.active.Load();out.WorkGateCapacity=cap(a.work.sem);out.WorkGateSaturated=out.WorkGateCapacity>0&&out.WorkGateActive>=int64(out.WorkGateCapacity)}
	if a!=nil&&a.jobs!=nil{out.StorageJobs=a.jobs.alphaJobSummaryV23()}
	if a!=nil{out.ReadinessChecks=runtimeReadinessSummaryV23(a.readiness())}
	recovery:=stateRecoveryStatus();out.StateRecoveredReads=recovery.RecoveredReads
	migration:=currentV23MigrationReport();out.MigrationHealthy=migration.Healthy;out.MigrationErrors=migrationErrorCountV23(migration)
	if out.WorkGateSaturated{out.Pressure="busy";out.Reasons=append(out.Reasons,"bounded work gate is at capacity")}
	if out.StorageJobs.Failed>0{out.Pressure="review";out.Reasons=append(out.Reasons,"one or more retained storage jobs failed")}
	if out.StateRecoveredReads>0{out.Pressure="review";out.Reasons=append(out.Reasons,"one or more Sentinel state reads used a last-known-good backup")}
	if migration.GeneratedAt!=""&&!migration.Healthy{out.Pressure="review";out.Reasons=append(out.Reasons,"v2.3 state migration reports an unhealthy result")}
	if out.ReadinessChecks.High>0{out.Pressure="review";out.Reasons=append(out.Reasons,"Sentinel readiness contains a high-priority self-health check")}
	if out.Pressure=="normal"&&out.ReadinessChecks.Review>0{out.Pressure="review";out.Reasons=append(out.Reasons,"Sentinel readiness contains review-level self-health checks")}
	out.Reasons=uniqueStrings(out.Reasons);sort.Strings(out.Reasons)
	return out
}
