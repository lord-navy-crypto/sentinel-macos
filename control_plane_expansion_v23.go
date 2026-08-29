// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	systemEvidenceHistoryLimit = 120
	systemSnapshotLimit        = 16
	systemSnapshotLineLimit    = 180
)

type SystemEvidenceSignal struct {
	Code             string `json:"code"`
	Category         string `json:"category"`
	Severity         string `json:"severity"`
	Summary          string `json:"summary"`
	Detail           string `json:"detail,omitempty"`
	IncidentEligible bool   `json:"incident_eligible"`
}

type SystemEvidenceObservation struct {
	ID       string                 `json:"id"`
	At       int64                  `json:"at"`
	ToolID   string                 `json:"tool_id"`
	ToolName string                 `json:"tool_name"`
	Target   string                 `json:"target,omitempty"`
	Status   string                 `json:"status"`
	Signals  []SystemEvidenceSignal `json:"signals,omitempty"`
	Summary  string                 `json:"summary"`
}

type systemEvidenceEnvelope struct {
	Version int                         `json:"version"`
	Rows    []SystemEvidenceObservation `json:"rows"`
}

type systemEvidenceManager struct {
	mu         sync.RWMutex
	persistent bool
	path       string
	rows       []SystemEvidenceObservation
}

func newSystemEvidenceManager(ephemeral bool) *systemEvidenceManager {
	m := &systemEvidenceManager{persistent: !ephemeral}
	if d := sentinelStateDir(); d != "" { m.path = d + "/system-evidence-v23.json.gz" }
	if !m.persistent || m.path == "" { return m }
	var env systemEvidenceEnvelope
	if readGzipJSON(m.path, &env) == nil && env.Version == SentinelSchemaV23 {
		if len(env.Rows) > systemEvidenceHistoryLimit { env.Rows = env.Rows[len(env.Rows)-systemEvidenceHistoryLimit:] }
		m.rows = append([]SystemEvidenceObservation(nil), env.Rows...)
	}
	return m
}

func (m *systemEvidenceManager) add(row SystemEvidenceObservation) {
	if m == nil || row.ToolID == "" { return }
	m.mu.Lock(); defer m.mu.Unlock()
	m.rows = append(m.rows, row)
	if len(m.rows) > systemEvidenceHistoryLimit { m.rows = append([]SystemEvidenceObservation(nil), m.rows[len(m.rows)-systemEvidenceHistoryLimit:]...) }
	if m.persistent && m.path != "" { _ = writePrivateGzipJSON(m.path, systemEvidenceEnvelope{Version: SentinelSchemaV23, Rows: m.rows}) }
}

func (m *systemEvidenceManager) list(limit int) []SystemEvidenceObservation {
	if m == nil { return nil }
	m.mu.RLock(); defer m.mu.RUnlock()
	if limit <= 0 || limit > systemEvidenceHistoryLimit { limit = 80 }
	start := len(m.rows)-limit; if start < 0 { start=0 }
	out := append([]SystemEvidenceObservation(nil), m.rows[start:]...)
	for i,j:=0,len(out)-1;i<j;i,j=i+1,j-1 { out[i],out[j]=out[j],out[i] }
	return out
}

func firstMeaningfulLine(raw string) string {
	for _, line := range strings.Split(raw,"\n") {
		line = strings.TrimSpace(line); if line=="" { continue }
		if len(line)>240 { return line[:240] }
		return line
	}
	return ""
}

func countUsefulLines(raw string) int { n:=0; for _,line:=range strings.Split(raw,"\n") { if strings.TrimSpace(line)!="" { n++ } }; return n }

func EvaluateSystemConsoleEvidence(result SystemConsoleResult) []SystemEvidenceSignal {
	lower:=strings.ToLower(result.Output); out:=[]SystemEvidenceSignal{}
	add:=func(code,category,severity,summary,detail string,incident bool){ out=append(out,SystemEvidenceSignal{Code:code,Category:category,Severity:severity,Summary:summary,Detail:detail,IncidentEligible:incident}) }
	switch result.ToolID {
	case "gatekeeper-status":
		if strings.Contains(lower,"disabled") { add("gatekeeper_disabled","security_posture","review","Gatekeeper global assessment is disabled.",firstMeaningfulLine(result.Output),false) } else if strings.Contains(lower,"enabled") { add("gatekeeper_enabled","security_posture","info","Gatekeeper global assessment is enabled.",firstMeaningfulLine(result.Output),false) }
	case "filevault-status":
		if strings.Contains(lower,"filevault is off") { add("filevault_disabled","security_posture","review","FileVault is reported off.",firstMeaningfulLine(result.Output),false) } else if strings.Contains(lower,"filevault is on") { add("filevault_enabled","security_posture","info","FileVault is reported on.",firstMeaningfulLine(result.Output),false) }
	case "sip-status":
		if strings.Contains(lower,"disabled") { add("sip_disabled","security_posture","review","System Integrity Protection is reported disabled.",firstMeaningfulLine(result.Output),false) } else if strings.Contains(lower,"enabled") { add("sip_enabled","security_posture","info","System Integrity Protection is reported enabled.",firstMeaningfulLine(result.Output),false) }
	case "gatekeeper-assessment":
		if strings.Contains(lower,"rejected") || result.Status=="reported" { add("gatekeeper_rejected","app_integrity","review","Gatekeeper returned reviewable/rejected evidence for this object.",firstMeaningfulLine(result.Output),result.Target!="") } else if strings.Contains(lower,"accepted") { add("gatekeeper_accepted","app_integrity","info","Gatekeeper accepted this object in the current assessment.",firstMeaningfulLine(result.Output),false) }
	case "code-signing":
		if result.Status=="reported" { add("code_signing_unverified","app_integrity","review","Code-signing inspection returned a non-zero reviewable result.",firstMeaningfulLine(result.Output),result.Target!="") }
	case "crash-log":
		if countUsefulLines(result.Output)>2 { add("recent_crash_evidence","system_log","review","Recent crash-related log evidence is present.","Bounded predefined log recipe returned rows.",false) }
	case "launch-failure-log":
		if countUsefulLines(result.Output)>2 { add("recent_launch_failure","system_log","review","Recent launch/service log evidence is present.","Bounded predefined log recipe returned rows.",false) }
	}
	return out
}

func systemEvidenceObservation(result SystemConsoleResult) SystemEvidenceObservation {
	signals:=EvaluateSystemConsoleEvidence(result); summary:=result.ToolName+" · "+result.Status
	if len(signals)>0 { summary += fmt.Sprintf(" · %d typed signal(s)",len(signals)) }
	at:=time.Now().Unix()
	return SystemEvidenceObservation{ID:entityID("system-evidence",fmt.Sprintf("%d|%s|%s|%s",at,result.ToolID,result.Target,summary)),At:at,ToolID:result.ToolID,ToolName:result.ToolName,Target:result.Target,Status:result.Status,Signals:signals,Summary:summary}
}

func (m *systemEvidenceManager) incidentEvidence() []IncidentEvidence {
	rows:=m.list(systemEvidenceHistoryLimit); out:=[]IncidentEvidence{}; seen:=map[string]bool{}
	for _,row:=range rows {
		if row.Target=="" || !strings.HasPrefix(row.Target,"/") { continue }
		for _,sig:=range row.Signals {
			if !sig.IncidentEligible || (sig.Severity!="review" && sig.Severity!="high") { continue }
			key:=sig.Code+"|"+row.Target; if seen[key] { continue }; seen[key]=true
			out=append(out,IncidentEvidence{At:row.At,Source:"system_console",Kind:sig.Code,Severity:sig.Severity,Path:row.Target,Detail:strings.TrimSpace(sig.Summary+" "+sig.Detail)})
		}
	}
	return out
}

type SystemSnapshotV23 struct {
	ID          string            `json:"id"`
	CapturedAt  string            `json:"captured_at"`
	Processes   []string          `json:"processes"`
	Startup     []string          `json:"startup"`
	Network     []string          `json:"network"`
	Mounts      []string          `json:"mounts"`
	Filesystems []string          `json:"filesystems"`
	Security    map[string]string `json:"security"`
	Partial     bool              `json:"partial"`
	Limitations []string          `json:"limitations,omitempty"`
	Note        string            `json:"note"`
}

type SystemSnapshotCategoryDiff struct { Category string `json:"category"`; Added []string `json:"added,omitempty"`; Removed []string `json:"removed,omitempty"` }
type SystemSnapshotDiffV23 struct {
	FromID string `json:"from_id"`; ToID string `json:"to_id"`; FromAt string `json:"from_at"`; ToAt string `json:"to_at"`
	Categories []SystemSnapshotCategoryDiff `json:"categories"`; SecurityChanged map[string][2]string `json:"security_changed,omitempty"`; ChangeCount int `json:"change_count"`; Note string `json:"note"`
}
type systemSnapshotEnvelope struct { Version int `json:"version"`; Snapshots []SystemSnapshotV23 `json:"snapshots"` }
type systemSnapshotManager struct { mu sync.RWMutex; persistent bool; path string; snapshots []SystemSnapshotV23 }

func newSystemSnapshotManager(ephemeral bool) *systemSnapshotManager {
	m:=&systemSnapshotManager{persistent:!ephemeral}; if d:=sentinelStateDir();d!=""{m.path=d+"/system-snapshots-v23.json.gz"}
	if !m.persistent || m.path=="" { return m }
	var env systemSnapshotEnvelope
	if readGzipJSON(m.path,&env)==nil && env.Version==SentinelSchemaV23 { if len(env.Snapshots)>systemSnapshotLimit { env.Snapshots=env.Snapshots[len(env.Snapshots)-systemSnapshotLimit:] }; m.snapshots=append([]SystemSnapshotV23(nil),env.Snapshots...) }
	return m
}
func (m *systemSnapshotManager) add(s SystemSnapshotV23){m.mu.Lock();defer m.mu.Unlock();m.snapshots=append(m.snapshots,s);if len(m.snapshots)>systemSnapshotLimit{m.snapshots=append([]SystemSnapshotV23(nil),m.snapshots[len(m.snapshots)-systemSnapshotLimit:]...)};if m.persistent&&m.path!=""{_ = writePrivateGzipJSON(m.path,systemSnapshotEnvelope{Version:SentinelSchemaV23,Snapshots:m.snapshots})}}
func (m *systemSnapshotManager) list() []SystemSnapshotV23 {m.mu.RLock();defer m.mu.RUnlock();out:=append([]SystemSnapshotV23(nil),m.snapshots...);for i,j:=0,len(out)-1;i<j;i,j=i+1,j-1{out[i],out[j]=out[j],out[i]};return out}
func (m *systemSnapshotManager) find(id string)(SystemSnapshotV23,bool){m.mu.RLock();defer m.mu.RUnlock();for _,s:=range m.snapshots{if s.ID==id{return s,true}};return SystemSnapshotV23{},false}

type snapshotToolResult struct { id string; result SystemConsoleResult; err error }
func boundedUniqueLines(raw string,limit int)[]string{if limit<=0{limit=systemSnapshotLineLimit};seen:=map[string]bool{};out:=[]string{};for _,rawLine:=range strings.Split(raw,"\n"){line:=strings.Join(strings.Fields(rawLine)," ");if line==""||seen[line]{continue};seen[line]=true;out=append(out,line);if len(out)>=limit{break}};sort.Strings(out);return out}
func processSnapshotKeys(raw string)[]string{p:=ParseProcessTableEvidence(raw);seen:=map[string]bool{};out:=[]string{};for _,row:=range p.Processes{key:=strings.TrimSpace(row.User+" · "+row.Command);if key==""||seen[key]{continue};seen[key]=true;out=append(out,key);if len(out)>=systemSnapshotLineLimit{break}};sort.Strings(out);return out}
func launchSnapshotKeys(raw string)[]string{seen:=map[string]bool{};out:=[]string{};for _,line:=range strings.Split(raw,"\n"){fields:=strings.Fields(line);if len(fields)<3||strings.EqualFold(fields[0],"PID"){continue};label:=strings.Join(fields[2:]," ");if label==""||seen[label]{continue};seen[label]=true;out=append(out,label);if len(out)>=systemSnapshotLineLimit{break}};sort.Strings(out);return out}
func networkSnapshotKeys(raw string)[]string{seen:=map[string]bool{};out:=[]string{};for _,line:=range strings.Split(raw,"\n"){fields:=strings.Fields(line);if len(fields)<6||!strings.HasPrefix(strings.ToLower(fields[0]),"tcp"){continue};key:=fields[0]+" · "+fields[4]+" · "+fields[5];if seen[key]{continue};seen[key]=true;out=append(out,key);if len(out)>=systemSnapshotLineLimit{break}};sort.Strings(out);return out}

func captureSystemSnapshotV23(parent context.Context) SystemSnapshotV23 {
	ctx,cancel:=context.WithTimeout(parent,14*time.Second);defer cancel();ids:=[]string{"process-table","launchctl-list","tcp-socket-table","mount-table","disk-filesystems","gatekeeper-status","filevault-status","sip-status"};ch:=make(chan snapshotToolResult,len(ids));var wg sync.WaitGroup
	for _,id:=range ids{wg.Add(1);go func(toolID string){defer wg.Done();res,err:=RunSystemConsoleQuery(ctx,SystemConsoleQueryRequest{ToolID:toolID});ch<-snapshotToolResult{id:toolID,result:res,err:err}}(id)};wg.Wait();close(ch)
	at:=time.Now().UTC().Format(time.RFC3339);s:=SystemSnapshotV23{CapturedAt:at,Security:map[string]string{},Note:"Explicit bounded snapshot of selected macOS evidence. It is not a complete audit log and does not capture packet contents."}
	for item:=range ch{if item.err!=nil||item.result.Status=="unavailable"||item.result.TimedOut{s.Partial=true;s.Limitations=appendUniqueString(s.Limitations,item.id+" evidence unavailable or incomplete");continue};switch item.id{case"process-table":s.Processes=processSnapshotKeys(item.result.Output);case"launchctl-list":s.Startup=launchSnapshotKeys(item.result.Output);case"tcp-socket-table":s.Network=networkSnapshotKeys(item.result.Output);case"mount-table":for _,r:=range ParseMountEvidence(item.result.Output).Mounts{s.Mounts=append(s.Mounts,r.Device+" → "+r.MountedOn+" · "+strings.Join(r.Options,","))};case"disk-filesystems":for _,r:=range ParseFilesystemEvidence(item.result.Output).Filesystems{s.Filesystems=append(s.Filesystems,r.Filesystem+" → "+r.MountedOn)};default:s.Security[item.id]=firstMeaningfulLine(item.result.Output)}}
	sort.Strings(s.Mounts);sort.Strings(s.Filesystems);s.ID=entityID("system-snapshot-v23",s.CapturedAt+"|"+strings.Join(s.Processes,"\x00")+"|"+strings.Join(s.Startup,"\x00"));return s
}

func systemSnapshotSetDiff(a,b []string)(added,removed []string){am,bm:=map[string]bool{},map[string]bool{};for _,x:=range a{am[x]=true};for _,x:=range b{bm[x]=true};for x:=range bm{if !am[x]{added=append(added,x)}};for x:=range am{if !bm[x]{removed=append(removed,x)}};sort.Strings(added);sort.Strings(removed);return}
func CompareSystemSnapshotsV23(from,to SystemSnapshotV23)SystemSnapshotDiffV23{out:=SystemSnapshotDiffV23{FromID:from.ID,ToID:to.ID,FromAt:from.CapturedAt,ToAt:to.CapturedAt,SecurityChanged:map[string][2]string{},Note:"Added/removed means observed in one retained snapshot and not the other; it does not establish exact start/stop time or causation."};cats:=[]struct{name string;a,b []string}{{"processes",from.Processes,to.Processes},{"startup",from.Startup,to.Startup},{"network",from.Network,to.Network},{"mounts",from.Mounts,to.Mounts},{"filesystems",from.Filesystems,to.Filesystems}};for _,c:=range cats{add,rem:=systemSnapshotSetDiff(c.a,c.b);if len(add)+len(rem)>0{out.Categories=append(out.Categories,SystemSnapshotCategoryDiff{Category:c.name,Added:add,Removed:rem});out.ChangeCount+=len(add)+len(rem)}};keys:=map[string]bool{};for k:=range from.Security{keys[k]=true};for k:=range to.Security{keys[k]=true};for k:=range keys{if from.Security[k]!=to.Security[k]{out.SecurityChanged[k]=[2]string{from.Security[k],to.Security[k]};out.ChangeCount++}};return out}

type SecurityPostureV23 struct{GeneratedAt string `json:"generated_at"`;LatestEvidence []SystemEvidenceObservation `json:"latest_evidence"`;ReviewSignals []SystemEvidenceSignal `json:"review_signals"`;IncidentEligible int `json:"incident_eligible"`;ActiveIncidents int `json:"active_incidents"`;SafeActions ActionHealth `json:"safe_actions"`;ChangeMonitor ChangeStatus `json:"change_monitor"`;Note string `json:"note"`}
type RecoveryJobV23 struct{ID string `json:"id"`;Status string `json:"status"`;Root string `json:"root"`;StartedAt int64 `json:"started_at"`;FinishedAt int64 `json:"finished_at,omitempty"`;Error string `json:"error,omitempty"`}
type RecoveryCenterV23 struct{GeneratedAt string `json:"generated_at"`;Mode string `json:"mode"`;SafeActions ActionHealth `json:"safe_actions"`;Vault []VaultManifest `json:"vault"`;Journal []ActionJournalEntry `json:"journal"`;ChangeMonitor ChangeStatus `json:"change_monitor"`;StorageSnapshots int `json:"storage_snapshots"`;SystemSnapshots int `json:"system_snapshots"`;NetworkSnapshots int `json:"network_snapshots"`;RecoverableActions int `json:"recoverable_actions"`;InterruptedJobs []RecoveryJobV23 `json:"interrupted_jobs,omitempty"`;InterruptedOrPartial bool `json:"interrupted_or_partial"`;Advisories []string `json:"advisories,omitempty"`;Note string `json:"note"`}
type controlPlaneState struct{systemEvidence *systemEvidenceManager;systemSnapshots *systemSnapshotManager;storageHistory *storageHistoryManager}
var(controlPlaneMu sync.Mutex;controlPersistent *controlPlaneState;controlEphemeral *controlPlaneState)
func controlPlaneFor(ephemeral bool)*controlPlaneState{controlPlaneMu.Lock();defer controlPlaneMu.Unlock();if ephemeral{if controlEphemeral==nil{controlEphemeral=&controlPlaneState{systemEvidence:newSystemEvidenceManager(true),systemSnapshots:newSystemSnapshotManager(true),storageHistory:newStorageHistoryManager(true)}};return controlEphemeral};if controlPersistent==nil{controlPersistent=&controlPlaneState{systemEvidence:newSystemEvidenceManager(false),systemSnapshots:newSystemSnapshotManager(false),storageHistory:newStorageHistoryManager(false)}};return controlPersistent}

func (m *scanManager) recoveryJobs()[]RecoveryJobV23{if m==nil{return nil};m.mu.RLock();defer m.mu.RUnlock();out:=[]RecoveryJobV23{};for _,j:=range m.jobs{if j==nil{continue};if j.Status=="running"||j.Status=="failed"||j.Status=="cancelled"{out=append(out,RecoveryJobV23{ID:j.ID,Status:j.Status,Root:j.Root,StartedAt:j.StartedAt,FinishedAt:j.FinishedAt,Error:j.Error})}};sort.SliceStable(out,func(i,j int)bool{return out[i].StartedAt>out[j].StartedAt});if len(out)>16{out=out[:16]};return out}

func (a *app) securityPostureV23()SecurityPostureV23{cp:=controlPlaneFor(a.ephemeral);rows:=cp.systemEvidence.list(32);latestByTool:=map[string]SystemEvidenceObservation{};for _,row:=range rows{if _,ok:=latestByTool[row.ToolID];!ok{latestByTool[row.ToolID]=row}};latest:=[]SystemEvidenceObservation{};review:=[]SystemEvidenceSignal{};eligible:=0;for _,row:=range latestByTool{latest=append(latest,row);for _,sig:=range row.Signals{if sig.Severity=="review"||sig.Severity=="high"{review=append(review,sig)};if sig.IncidentEligible{eligible++}}};sort.Slice(latest,func(i,j int)bool{return latest[i].ToolID<latest[j].ToolID});out:=SecurityPostureV23{GeneratedAt:time.Now().UTC().Format(time.RFC3339),LatestEvidence:latest,ReviewSignals:review,IncidentEligible:eligible,Note:"Security Posture combines retained typed System Console signals with Sentinel-owned health/context. Review signals are not malware verdicts."};if a.actions!=nil{out.SafeActions=a.actions.health()};if a.changes!=nil{out.ChangeMonitor=a.changes.status()};if a.incidents!=nil{out.ActiveIncidents=a.incidents.snapshot(false).Count};return out}
func (a *app) recoveryCenterV23()RecoveryCenterV23{cp:=controlPlaneFor(a.ephemeral);mode:="persistent-local";if a.ephemeral{mode="ephemeral-memory-only"};out:=RecoveryCenterV23{GeneratedAt:time.Now().UTC().Format(time.RFC3339),Mode:mode,StorageSnapshots:len(cp.storageHistory.list()),SystemSnapshots:len(cp.systemSnapshots.list()),Note:"Recovery Center aggregates Sentinel-owned recovery state. It does not create a permanent-delete path."};if a.networkHistory!=nil{out.NetworkSnapshots=len(a.networkHistory.list())};if a.jobs!=nil{out.InterruptedJobs=a.jobs.recoveryJobs();if len(out.InterruptedJobs)>0{out.InterruptedOrPartial=true}};if a.actions!=nil{out.SafeActions=a.actions.health();out.Vault=a.actions.vaultSnapshot();out.Journal=a.actions.journalSnapshot(60);for _,e:=range out.Journal{if e.Status=="success"&&e.Reversible{out.RecoverableActions++}}};if a.changes!=nil{out.ChangeMonitor=a.changes.status();out.InterruptedOrPartial=out.InterruptedOrPartial||out.ChangeMonitor.NeedsRescan||out.ChangeMonitor.ResumeCheckpoint};for _,s:=range cp.systemSnapshots.list(){if s.Partial{out.InterruptedOrPartial=true;break}};if !out.SafeActions.Healthy{out.Advisories=append(out.Advisories,"Safe Action/Vault health reports an issue; review before relying on rollback.")};if len(out.InterruptedJobs)>0{out.Advisories=append(out.Advisories,fmt.Sprintf("%d storage scan job(s) are running, failed, or cancelled and remain visible for recovery review.",len(out.InterruptedJobs)))};if out.InterruptedOrPartial{out.Advisories=appendUniqueString(out.Advisories,"One or more retained sources report partial/interrupted state or a rescan requirement.")};return out}
