// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// SystemSnapshotChangeObjectV23 turns raw added/removed strings into typed
// review objects. This remains a read-only interpretation of two explicit
// snapshots; it does not claim exact event time or causation.
type SystemSnapshotChangeObjectV23 struct {
	ID         string `json:"id"`
	Category   string `json:"category"`
	Direction  string `json:"direction"`
	Value      string `json:"value"`
	ObjectType string `json:"object_type"`
	Ref        string `json:"ref,omitempty"`
	Severity   string `json:"severity"`
	Why        string `json:"why"`
}

type SystemSnapshotCorrelationV23 struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	LeftID     string `json:"left_id"`
	RightID    string `json:"right_id"`
	Confidence string `json:"confidence"`
	Detail     string `json:"detail"`
}

type SystemSnapshotInvestigationTargetV23 struct {
	Kind      string `json:"kind"`
	Label     string `json:"label"`
	Ref       string `json:"ref"`
	Category  string `json:"category"`
	Direction string `json:"direction"`
}

type SystemSnapshotDiffAnalysisV23 struct {
	Objects      []SystemSnapshotChangeObjectV23        `json:"objects"`
	Correlations []SystemSnapshotCorrelationV23         `json:"correlations,omitempty"`
	Targets      []SystemSnapshotInvestigationTargetV23 `json:"investigation_targets,omitempty"`
	Summary      []string                               `json:"summary"`
	Limitations  []string                               `json:"limitations"`
}

func snapshotCategoryMeta(category, value string) (objectType, ref, severity, why, targetKind string) {
	value = strings.TrimSpace(value)
	switch category {
	case "processes":
		ref = value
		if i := strings.Index(value, " · "); i >= 0 && i+3 < len(value) { ref = strings.TrimSpace(value[i+3:]) }
		return "process_observation", ref, "info", "Process presence changed between the two retained snapshots.", "process_command"
	case "startup":
		return "startup_service", value, "review", "A launch-service label appeared or disappeared between retained snapshots and deserves configuration review.", "startup_label"
	case "network":
		return "network_relation", value, "info", "A visible TCP relationship appeared or disappeared between the two retained snapshots.", "network_relation"
	case "mounts":
		ref = snapshotArrowTarget(value)
		return "mount", ref, "info", "A mounted-volume observation changed between retained snapshots.", "path"
	case "filesystems":
		ref = snapshotArrowTarget(value)
		return "filesystem", ref, "info", "A filesystem observation changed between retained snapshots.", "path"
	case "security":
		return "security_posture", value, "review", "A retained security-posture value changed and should be interpreted in its macOS context.", "security_posture"
	default:
		return "system_observation", value, "info", "A bounded system observation changed between retained snapshots.", "observation"
	}
}

func snapshotArrowTarget(value string) string {
	parts := strings.SplitN(value, "→", 2)
	if len(parts) != 2 { return strings.TrimSpace(value) }
	right := strings.TrimSpace(parts[1])
	if i := strings.Index(right, " · "); i >= 0 { right = strings.TrimSpace(right[:i]) }
	return right
}

func appendSnapshotDiffObject(out *SystemSnapshotDiffAnalysisV23, category, direction, value string) {
	objectType, ref, severity, why, targetKind := snapshotCategoryMeta(category, value)
	id := entityID("system-snapshot-change-v23", strings.Join([]string{category,direction,value}, "\x00"))
	obj := SystemSnapshotChangeObjectV23{ID:id,Category:category,Direction:direction,Value:value,ObjectType:objectType,Ref:ref,Severity:severity,Why:why}
	out.Objects = append(out.Objects,obj)
	if strings.TrimSpace(ref) != "" {
		out.Targets = append(out.Targets,SystemSnapshotInvestigationTargetV23{Kind:targetKind,Label:value,Ref:ref,Category:category,Direction:direction})
	}
}

func BuildSystemSnapshotDiffAnalysisV23(in SystemSnapshotDiffV23) SystemSnapshotDiffAnalysisV23 {
	out := SystemSnapshotDiffAnalysisV23{Limitations:[]string{
		"Analysis is derived only from the two retained bounded snapshots.",
		"A relationship means shared observed identity/context; it does not establish causation or malicious intent.",
	}}
	for _, cat := range in.Categories {
		for _, value := range cat.Added { appendSnapshotDiffObject(&out,cat.Category,"added",value) }
		for _, value := range cat.Removed { appendSnapshotDiffObject(&out,cat.Category,"removed",value) }
		out.Summary = append(out.Summary,fmt.Sprintf("%s: +%d / -%d",cat.Category,len(cat.Added),len(cat.Removed)))
	}
	securityKeys:=make([]string,0,len(in.SecurityChanged))
	for key:=range in.SecurityChanged{securityKeys=append(securityKeys,key)}
	sort.Strings(securityKeys)
	for _, key:=range securityKeys {
		pair:=in.SecurityChanged[key]
		value:=fmt.Sprintf("%s: %s → %s",key,pair[0],pair[1])
		appendSnapshotDiffObject(&out,"security","changed",value)
	}
	if len(securityKeys)>0 { out.Summary=append(out.Summary,fmt.Sprintf("security posture: %d changed value(s)",len(securityKeys))) }
	byRef:=map[string][]SystemSnapshotChangeObjectV23{}
	for _, obj:=range out.Objects { ref:=strings.TrimSpace(obj.Ref);if ref!=""{byRef[ref]=append(byRef[ref],obj)} }
	refs:=make([]string,0,len(byRef));for ref:=range byRef{refs=append(refs,ref)};sort.Strings(refs)
	for _,ref:=range refs{
		rows:=byRef[ref]
		for i:=0;i<len(rows);i++{for j:=i+1;j<len(rows);j++{
			if rows[i].Category==rows[j].Category{continue}
			c:=SystemSnapshotCorrelationV23{Type:"shared_ref",LeftID:rows[i].ID,RightID:rows[j].ID,Confidence:"explicit",Detail:"Both changed observations resolve to the same retained reference: "+ref}
			c.ID=entityID("system-snapshot-correlation-v23",c.LeftID+"\x00"+c.RightID+"\x00"+ref)
			out.Correlations=append(out.Correlations,c)
		}}
	}
	return out
}

func (in SystemSnapshotDiffV23) MarshalJSON() ([]byte,error) {
	type alias SystemSnapshotDiffV23
	return json.Marshal(struct{alias;Analysis SystemSnapshotDiffAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildSystemSnapshotDiffAnalysisV23(in)})
}

type RecoveryCandidateV23 struct {
	JournalID string `json:"journal_id"`;At string `json:"at"`;Action string `json:"action"`;ObjectName string `json:"object_name"`;From string `json:"from,omitempty"`;To string `json:"to,omitempty"`;VaultID string `json:"vault_id,omitempty"`;State string `json:"state"`;Why string `json:"why"`
}
type RecoveryPlanStepV23 struct {ID string `json:"id"`;Priority string `json:"priority"`;Category string `json:"category"`;Title string `json:"title"`;Detail string `json:"detail"`;SuggestedView string `json:"suggested_view,omitempty"`;Blocking bool `json:"blocking"`}
type RecoveryCheckpointAvailabilityV23 struct {Kind string `json:"kind"`;Count int `json:"count"`;Available bool `json:"available"`;Detail string `json:"detail"`}
type RecoveryMigrationSummaryV23 struct {GeneratedAt string `json:"generated_at,omitempty"`;Applied bool `json:"applied"`;Healthy bool `json:"healthy"`;Changed int `json:"changed"`;Errors int `json:"errors"`;Stores int `json:"stores"`}
type RecoveryAnalysisV23 struct {Readiness string `json:"readiness"`;Candidates []RecoveryCandidateV23 `json:"candidates,omitempty"`;Plan []RecoveryPlanStepV23 `json:"plan"`;Checkpoints []RecoveryCheckpointAvailabilityV23 `json:"checkpoints"`;StateRecovery StateRecoveryStatus `json:"state_recovery"`;Migration RecoveryMigrationSummaryV23 `json:"migration"`;Note string `json:"note"`}

func recoveryMigrationSummaryV23(in V23MigrationReport) RecoveryMigrationSummaryV23 {out:=RecoveryMigrationSummaryV23{GeneratedAt:in.GeneratedAt,Applied:in.Applied,Healthy:in.Healthy,Stores:len(in.Results)};for _,r:=range in.Results{if r.Changed{out.Changed++};if r.Status=="error"{out.Errors++}};return out}
func recoveryCandidatesV23(in RecoveryCenterV23) []RecoveryCandidateV23 {out:=[]RecoveryCandidateV23{};for _,e:=range in.Journal{if e.Status!="success"||!e.Reversible{continue};state:="preview_required";why:="This successful journal entry is marked reversible. Reversal still requires a fresh Safe Action preview and object-state validation.";if strings.Contains(strings.ToLower(e.Action),"vault")&&strings.TrimSpace(e.VaultID)==""{state="review";why="The journal entry is reversible but has no Vault ID; review recovery metadata before attempting reversal."};out=append(out,RecoveryCandidateV23{JournalID:e.ID,At:e.At,Action:e.Action,ObjectName:e.ObjectName,From:e.From,To:e.To,VaultID:e.VaultID,State:state,Why:why});if len(out)>=16{break}};return out}
func addRecoveryPlanStepV23(out *[]RecoveryPlanStepV23,priority,category,title,detail,view string,blocking bool){id:=entityID("recovery-plan-v23",strings.Join([]string{priority,category,title,detail},"\x00"));*out=append(*out,RecoveryPlanStepV23{ID:id,Priority:priority,Category:category,Title:title,Detail:detail,SuggestedView:view,Blocking:blocking})}
func BuildRecoveryAnalysisV23(in RecoveryCenterV23) RecoveryAnalysisV23 {
	stateRecovery:=stateRecoveryStatus();migration:=recoveryMigrationSummaryV23(currentV23MigrationReport())
	out:=RecoveryAnalysisV23{Readiness:"ready",Candidates:recoveryCandidatesV23(in),StateRecovery:stateRecovery,Migration:migration,Checkpoints:[]RecoveryCheckpointAvailabilityV23{{Kind:"system_snapshot",Count:in.SystemSnapshots,Available:in.SystemSnapshots>0,Detail:"Retained explicit system snapshots can anchor before/after review."},{Kind:"storage_snapshot",Count:in.StorageSnapshots,Available:in.StorageSnapshots>0,Detail:"Retained storage history can anchor bounded growth review."},{Kind:"network_snapshot",Count:in.NetworkSnapshots,Available:in.NetworkSnapshots>0,Detail:"Retained explicit network snapshots can anchor relationship comparison."}},Note:"Recovery analysis is read-only planning. It never executes restore/undo automatically and does not add a permanent-delete path."}
	if strings.Contains(in.Mode,"ephemeral"){out.Readiness="ephemeral";addRecoveryPlanStepV23(&out.Plan,"P0","mode","Persistent recovery is disabled in this session","Ephemeral mode intentionally keeps recovery/history state in memory and disables mutating Safe Actions.","recovery",true)}
	if !in.SafeActions.Healthy{addRecoveryPlanStepV23(&out.Plan,"P0","safe_actions","Repair Safe Action / Vault health before relying on rollback",strings.Join(in.SafeActions.Issues,"; "),"recovery",true)}
	if in.SafeActions.ManifestIssues>0{addRecoveryPlanStepV23(&out.Plan,"P0","vault","Review Vault manifest integrity",fmt.Sprintf("%d Vault manifest issue(s) are reported by Safe Action health.",in.SafeActions.ManifestIssues),"recovery",true)}
	if stateRecovery.RecoveredReads>0{addRecoveryPlanStepV23(&out.Plan,"P1","state_backup","Reconcile state restored from last-known-good backup",fmt.Sprintf("%d Sentinel state file(s) were read from .bak after the primary could not be decoded: %s",stateRecovery.RecoveredReads,strings.Join(stateRecovery.Files,", ")),"recovery",false)}
	if migration.GeneratedAt!=""&&!migration.Healthy{addRecoveryPlanStepV23(&out.Plan,"P0","migration","Resolve unhealthy v2.3 state migration",fmt.Sprintf("Migration reports %d error(s) across %d registered store(s).",migration.Errors,migration.Stores),"advanced",true)}
	if in.ChangeMonitor.NeedsRescan{addRecoveryPlanStepV23(&out.Plan,"P1","change_monitor","Reconcile Change Monitor continuity","Incremental evidence is marked incomplete; run the existing bounded reconciliation/rescan workflow before trusting continuity.","system",false)}
	if in.ChangeMonitor.ResumeCheckpoint{addRecoveryPlanStepV23(&out.Plan,"P1","change_monitor","Review resumable Change Monitor checkpoint","A retained checkpoint exists after an interrupted/stopped monitoring session.","system",false)}
	failed,cancelled,running:=0,0,0;for _,j:=range in.InterruptedJobs{switch j.Status{case"failed":failed++;case"cancelled":cancelled++;case"running":running++}}
	if failed>0||cancelled>0{addRecoveryPlanStepV23(&out.Plan,"P2","storage_jobs","Review incomplete storage work",fmt.Sprintf("%d failed and %d cancelled storage scan job(s) remain visible for recovery review.",failed,cancelled),"storage",false)}
	if running>0{addRecoveryPlanStepV23(&out.Plan,"P3","storage_jobs","Storage work is still active",fmt.Sprintf("%d bounded storage scan job(s) are currently running.",running),"storage",false)}
	if in.InterruptedOrPartial{addRecoveryPlanStepV23(&out.Plan,"P2","evidence_continuity","Review partial/interrupted retained evidence","At least one integrated source reports partial, interrupted, or rescan-required state.","system",false)}
	if len(out.Candidates)>0{addRecoveryPlanStepV23(&out.Plan,"P3","reversible_actions","Reversible journal entries are available",fmt.Sprintf("%d recent reversible action candidate(s) can be re-evaluated through Safe Action preview/validation.",len(out.Candidates)),"recovery",false)}
	if in.SystemSnapshots==0{addRecoveryPlanStepV23(&out.Plan,"P3","checkpoint","Capture an explicit system checkpoint before risky maintenance","No retained System Snapshot is currently available for before/after comparison.","system",false)}
	blocking:=false;needsReview:=false;for _,s:=range out.Plan{if s.Blocking{blocking=true};if s.Priority=="P1"||s.Priority=="P2"{needsReview=true}};if out.Readiness!="ephemeral"{if blocking{out.Readiness="blocked"}else if needsReview{out.Readiness="review"}else{out.Readiness="ready"}};return out
}
func (in RecoveryCenterV23) MarshalJSON() ([]byte,error){type alias RecoveryCenterV23;return json.Marshal(struct{alias;Analysis RecoveryAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildRecoveryAnalysisV23(in)})}

// StorageGrowthDriverV23 is a deterministic attribution record built from the
// already-bounded directory-category/file-type comparison. It does not scan
// any additional user files and does not infer why growth occurred.
type StorageGrowthDriverV23 struct {
	Domain       string `json:"domain"`
	Name         string `json:"name"`
	Direction    string `json:"direction"`
	DeltaBytes   int64  `json:"delta_bytes"`
	DeltaFiles   int    `json:"delta_files"`
	Magnitude    uint64 `json:"magnitude_bytes"`
	SharePercent float64 `json:"share_percent"`
}

type StorageGrowthAnalysisV23 struct {
	NetDeltaBytes       int64                    `json:"net_delta_bytes"`
	GrossChangedBytes   uint64                   `json:"gross_changed_bytes"`
	GrowthBytes         uint64                   `json:"growth_bytes"`
	ReductionBytes      uint64                   `json:"reduction_bytes"`
	DirectoryDrivers    []StorageGrowthDriverV23 `json:"directory_drivers,omitempty"`
	FileTypeDrivers     []StorageGrowthDriverV23 `json:"file_type_drivers,omitempty"`
	DominantDriver      *StorageGrowthDriverV23  `json:"dominant_driver,omitempty"`
	ChurnRatio          float64                  `json:"churn_ratio"`
	Interpretation      string                   `json:"interpretation"`
	Limitations         []string                 `json:"limitations"`
}

func storageDriversV23(domain string, rows []StorageDelta, gross uint64) []StorageGrowthDriverV23 {
	out:=make([]StorageGrowthDriverV23,0,len(rows))
	for _,r:=range rows{
		dir:="growth";if r.DeltaBytes<0{dir="reduction"}else if r.DeltaBytes==0{dir="file_count_only"}
		mag:=storageDeltaMagnitude(r.DeltaBytes);share:=0.0;if gross>0{share=float64(mag)*100/float64(gross)}
		out=append(out,StorageGrowthDriverV23{Domain:domain,Name:r.Name,Direction:dir,DeltaBytes:r.DeltaBytes,DeltaFiles:r.DeltaFiles,Magnitude:mag,SharePercent:share})
	}
	sort.SliceStable(out,func(i,j int)bool{if out[i].Magnitude!=out[j].Magnitude{return out[i].Magnitude>out[j].Magnitude};return out[i].Name<out[j].Name})
	if len(out)>12{out=out[:12]};return out
}

func BuildStorageGrowthAnalysisV23(in StorageComparison) StorageGrowthAnalysisV23 {
	gross,growth,reduction:=uint64(0),uint64(0),uint64(0)
	for _,rows:=range [][]StorageDelta{in.DirectoryChanges,in.FileTypeChanges}{for _,r:=range rows{m:=storageDeltaMagnitude(r.DeltaBytes);gross+=m;if r.DeltaBytes>0{growth+=m}else if r.DeltaBytes<0{reduction+=m}}}
	out:=StorageGrowthAnalysisV23{NetDeltaBytes:in.DeltaBytes,GrossChangedBytes:gross,GrowthBytes:growth,ReductionBytes:reduction,Limitations:[]string{"Attribution uses retained bounded category/file-type aggregates, not a complete filesystem event log.","A dominant driver identifies the largest observed byte delta; it does not establish the cause of that change."}}
	out.DirectoryDrivers=storageDriversV23("directory_category",in.DirectoryChanges,gross);out.FileTypeDrivers=storageDriversV23("file_type",in.FileTypeChanges,gross)
	all:=append(append([]StorageGrowthDriverV23(nil),out.DirectoryDrivers...),out.FileTypeDrivers...);sort.SliceStable(all,func(i,j int)bool{if all[i].Magnitude!=all[j].Magnitude{return all[i].Magnitude>all[j].Magnitude};return all[i].Name<all[j].Name});if len(all)>0{x:=all[0];out.DominantDriver=&x}
	if growth>0{out.ChurnRatio=float64(reduction)/float64(growth)}else if reduction>0{out.ChurnRatio=1}
	switch{case in.Partial:out.Interpretation="Comparison is partial; growth attribution is directional only and should not be treated as a complete accounting.";case in.DeltaBytes>0&&reduction>0:out.Interpretation="Net storage grew while both growth and reduction were observed; inspect the dominant drivers instead of relying on the net number alone.";case in.DeltaBytes>0:out.Interpretation="Net visible storage grew across the retained snapshots.";case in.DeltaBytes<0:out.Interpretation="Net visible storage decreased across the retained snapshots.";default:out.Interpretation="Net visible bytes were stable, although category/file-type churn may still be present."}
	return out
}

func (in StorageComparison) MarshalJSON()([]byte,error){type alias StorageComparison;return json.Marshal(struct{alias;Analysis StorageGrowthAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildStorageGrowthAnalysisV23(in)})}
