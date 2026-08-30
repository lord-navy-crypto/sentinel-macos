// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"sort"
	"strings"
)

type SafeActionDependencySummaryV23 struct {
	Kind     string `json:"kind"`
	Severity string `json:"severity"`
	Count    int    `json:"count"`
}

type SafeActionImpactV23 struct {
	Category string `json:"category"`
	Level    string `json:"level"`
	Detail   string `json:"detail"`
}

type SafeActionPreviewAnalysisV23 struct {
	Readiness                 string                           `json:"readiness"`
	DependencyCount           int                              `json:"dependency_count"`
	HighestDependencySeverity string                           `json:"highest_dependency_severity"`
	DependencySummary         []SafeActionDependencySummaryV23 `json:"dependency_summary,omitempty"`
	Impacts                   []SafeActionImpactV23            `json:"impacts"`
	Preconditions             []string                         `json:"preconditions"`
	PostValidation            []string                         `json:"post_validation"`
	RecoveryPath              []string                         `json:"recovery_path"`
	Limitations               []string                         `json:"limitations"`
}

func safeActionSeverityRankV23(value string) int {
	switch strings.ToLower(strings.TrimSpace(value)){case"high":return 0;case"review":return 1;case"info":return 2;default:return 3}
}

func BuildSafeActionPreviewAnalysisV23(in ActionPreview) SafeActionPreviewAnalysisV23 {
	out:=SafeActionPreviewAnalysisV23{Readiness:"ready",DependencyCount:len(in.Dependencies),HighestDependencySeverity:"none",Preconditions:[]string{"Preview must still be unexpired when execution begins.","The source object must pass the existing path/symlink/scope guard again immediately before mutation.","The destination must still satisfy the existing no-overwrite and scope rules at execution time."},Limitations:[]string{"Impact analysis is based on currently observable dependencies and can miss relationships outside Sentinel visibility.","A successful preview is not a malware verdict and does not mean the action is operationally harmless."}}
	byKind:=map[string]*SafeActionDependencySummaryV23{}
	for _,dep:=range in.Dependencies{row:=byKind[dep.Kind];if row==nil{row=&SafeActionDependencySummaryV23{Kind:dep.Kind,Severity:dep.Severity};byKind[dep.Kind]=row};row.Count++;if safeActionSeverityRankV23(dep.Severity)<safeActionSeverityRankV23(row.Severity){row.Severity=dep.Severity};if out.HighestDependencySeverity=="none"||safeActionSeverityRankV23(dep.Severity)<safeActionSeverityRankV23(out.HighestDependencySeverity){out.HighestDependencySeverity=dep.Severity}
		switch dep.Kind{case"startup_reference":out.Impacts=append(out.Impacts,SafeActionImpactV23{Category:"persistence",Level:dep.Severity,Detail:"Observed startup configuration references this object; path changes can break or alter startup behavior."});case"running_process":out.Impacts=append(out.Impacts,SafeActionImpactV23{Category:"runtime",Level:dep.Severity,Detail:"A currently running process is associated with the object; moving/renaming the file does not terminate that process."});case"trusted_profile":out.Impacts=append(out.Impacts,SafeActionImpactV23{Category:"trust",Level:dep.Severity,Detail:"The object exists in a user-approved Trusted Profile; changing it can create future trust-drift evidence."})}
	}
	keys:=make([]string,0,len(byKind));for k:=range byKind{keys=append(keys,k)};sort.Strings(keys);for _,k:=range keys{out.DependencySummary=append(out.DependencySummary,*byKind[k])}
	if out.HighestDependencySeverity=="high"{out.Readiness="review_dependencies"}else if out.HighestDependencySeverity=="review"{out.Readiness="review_context"}
	if in.HashStatus=="verified"{out.Preconditions=append(out.Preconditions,"The bounded SHA-256 object guard must still match at execution time.")}else{out.Preconditions=append(out.Preconditions,"No complete bounded SHA-256 guard is available; execution relies on the existing metadata guard and scope checks.")}
	switch in.Action{case"rename":out.PostValidation=[]string{"Confirm the original path is absent and the destination path exists.","Re-check running-process/startup references if operational behavior matters.","Record the observation in the Safe Action journal."};out.RecoveryPath=[]string{"Use the generated reversible journal entry to request a fresh undo preview.","Undo must revalidate destination state and refuse overwrite."};case"vault":out.PostValidation=[]string{"Confirm the original path is absent and the managed Vault object exists.","Verify isolation metadata/permissions using the explicit Vault Isolation workflow when needed.","Record Vault ID, fingerprint/guard context, and post-action observation."};out.RecoveryPath=[]string{"Use the Vault manifest and reversible journal entry to request a restore preview.","Restore must refuse overwrite and revalidate the original destination scope."};case"restore":out.PostValidation=[]string{"Confirm the Vault source is absent and the original destination exists.","Re-check restored permissions and current startup/runtime context.","Record restore observation and manifest state."};out.RecoveryPath=[]string{"A restore can itself be evaluated through the existing reversible journal/undo workflow when eligible.","No permanent-delete path is introduced."};default:out.PostValidation=[]string{"Revalidate the post-action source/destination state through the existing typed Safe Action observation path."};out.RecoveryPath=[]string{"Use only the existing journal-backed reversible workflow if this action is marked reversible."}}
	if !in.Reversible||in.Permanent{out.Readiness="blocked_by_contract";out.RecoveryPath=append(out.RecoveryPath,"This preview does not satisfy Sentinel's reversible/non-permanent Alpha control contract.")}
	return out
}

func (in ActionPreview) MarshalJSON()([]byte,error){type alias ActionPreview;return json.Marshal(struct{alias;Analysis SafeActionPreviewAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildSafeActionPreviewAnalysisV23(in)})}
