// SPDX-License-Identifier: MPL-2.0
package main

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const v23MigrationMarkerVersion = 1

type V23MigrationStore struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Format   string `json:"format"`
	From     string `json:"from"`
	To       string `json:"to"`
}

type V23MigrationResult struct {
	ID      string `json:"id"`
	Path    string `json:"path,omitempty"`
	Status  string `json:"status"`
	Changed bool   `json:"changed"`
	Detail  string `json:"detail"`
}

type V23MigrationReport struct {
	GeneratedAt string               `json:"generated_at"`
	Schema      int                  `json:"schema"`
	Applied     bool                 `json:"applied"`
	Healthy     bool                 `json:"healthy"`
	Results     []V23MigrationResult `json:"results"`
	Note        string               `json:"note"`
}

var v23MigrationState = struct {
	sync.RWMutex
	report V23MigrationReport
}{}

func V23MigrationRegistry() []V23MigrationStore {
	return []V23MigrationStore{
		{ID:"behavior-baseline", Filename:"behavior-baseline.json", Format:"json", From:"v2.2 behavior snapshot fields", To:"v2.3-compatible normalized behavior snapshot"},
		{ID:"behavior-history", Filename:"behavior-history.json", Format:"json", From:"v2.2 behavior history entries", To:"stable IDs and normalized risk bands"},
		{ID:"trust-profile", Filename:"trust-profile.json", Format:"json", From:"v2.2 trusted profile fields", To:"v2.3-compatible profile metadata"},
		{ID:"trust-history", Filename:"trust-drift-history.json", Format:"json", From:"v2.2 trust drift entries", To:"stable IDs and normalized drift bands"},
		{ID:"change-history", Filename:"change-history.json.gz", Format:"gzip-json", From:"v2.2 change event envelope", To:"normalized bounded change events"},
		{ID:"change-checkpoint", Filename:"change-checkpoint.json.gz", Format:"gzip-json", From:"v2.2 checkpoint envelope", To:"normalized checkpoint fields"},
		{ID:"incident-history", Filename:"incident-history.json.gz", Format:"gzip-json", From:"incident history v1/v2", To:"incident history v3 stable object-centered StoryKey"},
	}
}

func strictReadJSON(path string, dst any) error {
	raw, err := os.ReadFile(path)
	if err != nil { return err }
	return json.Unmarshal(raw, dst)
}

func strictReadGzipJSON(path string, dst any) error {
	f, err := os.Open(path)
	if err != nil { return err }
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil { return err }
	defer gz.Close()
	return json.NewDecoder(io.LimitReader(gz, 16<<20)).Decode(dst)
}

func migrationResult(id, path, status string, changed bool, detail string) V23MigrationResult {
	return V23MigrationResult{ID:id, Path:path, Status:status, Changed:changed, Detail:detail}
}

func migrateBehaviorBaselineV23(path string) V23MigrationResult {
	var s BehaviorSnapshot
	if err := strictReadJSON(path,&s); err != nil { return migrationResult("behavior-baseline",path,"error",false,err.Error()) }
	if s.CapturedAt == "" { return migrationResult("behavior-baseline",path,"error",false,"captured_at missing; refusing to rewrite") }
	changed:=false
	if s.Version==0 { s.Version=1; changed=true }
	if s.Version!=1 { return migrationResult("behavior-baseline",path,"error",false,fmt.Sprintf("unsupported behavior snapshot version %d",s.Version)) }
	if s.PrivacyNote=="" { s.PrivacyNote="Compact local metadata only. Migrated without copying file contents or complete process command lines."; changed=true }
	if changed { if err:=writePrivateJSON(path,s);err!=nil{return migrationResult("behavior-baseline",path,"error",false,err.Error())} }
	return migrationResult("behavior-baseline",path,"ok",changed,"compatible behavior baseline")
}

func migrateBehaviorHistoryV23(path string) V23MigrationResult {
	var rows []BehaviorHistoryEntry
	if err:=strictReadJSON(path,&rows);err!=nil{return migrationResult("behavior-history",path,"error",false,err.Error())}
	if len(rows)>behaviorHistoryLimit { rows=rows[len(rows)-behaviorHistoryLimit:] }
	changed:=false
	for i:=range rows {
		if rows[i].ID=="" { rows[i].ID=entityID("history",fmt.Sprintf("%s|%d|%d",rows[i].CapturedAt,rows[i].RiskIndex,i)); changed=true }
		if rows[i].RiskBand=="" { rows[i].RiskBand=behaviorRiskBand(rows[i].RiskIndex); changed=true }
	}
	if changed { if err:=writePrivateJSON(path,rows);err!=nil{return migrationResult("behavior-history",path,"error",false,err.Error())} }
	return migrationResult("behavior-history",path,"ok",changed,fmt.Sprintf("%d bounded behavior history entries",len(rows)))
}

func migrationTrustBand(score int) string {
	switch { case score>=80:return "high"; case score>=55:return "elevated"; case score>=25:return "review"; case score>0:return "observe"; default:return "quiet" }
}

func migrateTrustProfileV23(path string) V23MigrationResult {
	var p TrustProfile
	if err:=strictReadJSON(path,&p);err!=nil{return migrationResult("trust-profile",path,"error",false,err.Error())}
	if p.CreatedAt=="" { return migrationResult("trust-profile",path,"error",false,"created_at missing; refusing to rewrite") }
	changed:=false
	if p.Version==0 { p.Version=trustProfileVersion; changed=true }
	if p.Version!=trustProfileVersion { return migrationResult("trust-profile",path,"error",false,fmt.Sprintf("unsupported trust profile version %d",p.Version)) }
	if p.UpdatedAt=="" { p.UpdatedAt=p.CreatedAt; changed=true }
	if p.Meaning=="" { p.Meaning="A Trusted Profile is a user-approved reference state. It is not a guarantee that every profiled object is safe."; changed=true }
	if p.PrivacyNote=="" { p.PrivacyNote="User-approved bounded reference metadata only; no file contents are added by migration."; changed=true }
	if changed { if err:=writePrivateJSON(path,p);err!=nil{return migrationResult("trust-profile",path,"error",false,err.Error())} }
	return migrationResult("trust-profile",path,"ok",changed,"compatible Trusted Profile")
}

func migrateTrustHistoryV23(path string) V23MigrationResult {
	var rows []TrustHistoryEntry
	if err:=strictReadJSON(path,&rows);err!=nil{return migrationResult("trust-history",path,"error",false,err.Error())}
	if len(rows)>trustHistoryLimit { rows=rows[len(rows)-trustHistoryLimit:] }
	changed:=false
	for i:=range rows {
		if rows[i].ID=="" { rows[i].ID=entityID("trust-history",fmt.Sprintf("%s|%d|%d",rows[i].ComparedAt,rows[i].DriftIndex,i));changed=true }
		if rows[i].DriftBand=="" { rows[i].DriftBand=migrationTrustBand(rows[i].DriftIndex);changed=true }
	}
	if changed { if err:=writePrivateJSON(path,rows);err!=nil{return migrationResult("trust-history",path,"error",false,err.Error())} }
	return migrationResult("trust-history",path,"ok",changed,fmt.Sprintf("%d bounded trust history entries",len(rows)))
}

func migrateChangeHistoryV23(path string) V23MigrationResult {
	var env struct{ Version int `json:"version"`; Events []ChangeEvent `json:"events"` }
	if err:=strictReadGzipJSON(path,&env);err!=nil{return migrationResult("change-history",path,"error",false,err.Error())}
	if env.Version==0 { env.Version=1 }
	if env.Version!=1{return migrationResult("change-history",path,"error",false,fmt.Sprintf("unsupported change history version %d",env.Version))}
	if len(env.Events)>500 { env.Events=env.Events[len(env.Events)-500:] }
	changed:=false
	for i:=range env.Events {
		e:=&env.Events[i]
		if e.ID=="" { e.ID=entityID("change-event",fmt.Sprintf("%d|%s|%s|%d",e.At,e.Path,e.Kind,i));changed=true }
		if e.Source=="" { e.Source="legacy";changed=true }
		if e.Severity=="" { e.Severity="info";changed=true }
	}
	if changed { if err:=writePrivateGzipJSON(path,env);err!=nil{return migrationResult("change-history",path,"error",false,err.Error())} }
	return migrationResult("change-history",path,"ok",changed,fmt.Sprintf("%d bounded change events",len(env.Events)))
}

func migrateChangeCheckpointV23(path string) V23MigrationResult {
	var c changeCheckpoint
	if err:=strictReadGzipJSON(path,&c);err!=nil{return migrationResult("change-checkpoint",path,"error",false,err.Error())}
	changed:=false
	if c.Version==0 { c.Version=1;changed=true }
	if c.Version!=1{return migrationResult("change-checkpoint",path,"error",false,fmt.Sprintf("unsupported checkpoint version %d",c.Version))}
	if c.UpdatedAt=="" { c.UpdatedAt=time.Now().UTC().Format(time.RFC3339);changed=true }
	c.Roots=uniqueStrings(c.Roots);sort.Strings(c.Roots)
	if changed { if err:=writePrivateGzipJSON(path,c);err!=nil{return migrationResult("change-checkpoint",path,"error",false,err.Error())} }
	return migrationResult("change-checkpoint",path,"ok",changed,"compatible change checkpoint")
}

func migrateIncidentHistoryV23(path string) V23MigrationResult {
	var env struct{ Version int `json:"version"`; Incidents []Incident `json:"incidents"` }
	if err:=strictReadGzipJSON(path,&env);err!=nil{return migrationResult("incident-history",path,"error",false,err.Error())}
	if env.Version!=1&&env.Version!=2&&env.Version!=incidentHistoryVersion{return migrationResult("incident-history",path,"error",false,fmt.Sprintf("unsupported incident history version %d",env.Version))}
	changed:=env.Version!=incidentHistoryVersion
	byStory:=map[string]int{};out:=make([]Incident,0,len(env.Incidents))
	for _,raw:=range env.Incidents {
		x:=normalizeLoadedIncident(raw)
		if x.StoryKey!=raw.StoryKey { changed=true }
		if i,ok:=byStory[x.StoryKey];ok { out[i]=mergeIncident(out[i],x);out[i].State="historical";changed=true } else { byStory[x.StoryKey]=len(out);out=append(out,x) }
	}
	if len(out)>incidentHistoryLimit { out=out[len(out)-incidentHistoryLimit:];changed=true }
	if changed { if err:=writePrivateGzipJSON(path,struct{Version int `json:"version"`;Incidents []Incident `json:"incidents"`}{incidentHistoryVersion,out});err!=nil{return migrationResult("incident-history",path,"error",false,err.Error())} }
	return migrationResult("incident-history",path,"ok",changed,fmt.Sprintf("%d object-centered incident stories",len(out)))
}

func runV23StateMigrations(ephemeral bool) V23MigrationReport {
	report:=V23MigrationReport{GeneratedAt:time.Now().UTC().Format(time.RFC3339),Schema:SentinelSchemaV23,Applied:!ephemeral,Healthy:true,Note:"Migration only rewrites Sentinel-owned metadata after strict primary-file decoding. Atomic writes keep a .bak rollback copy. Corrupt primary state is reported and never force-overwritten."}
	if ephemeral { report.Results=[]V23MigrationResult{{ID:"all",Status:"skipped",Detail:"--ephemeral disables persistent state migration"}}; v23MigrationState.Lock();v23MigrationState.report=report;v23MigrationState.Unlock();return report }
	base:=sentinelStateDir();if base==""{report.Healthy=false;report.Results=[]V23MigrationResult{{ID:"all",Status:"error",Detail:"Sentinel state directory unavailable"}};return report}
	for _,store:=range V23MigrationRegistry(){
		path:=filepath.Join(base,store.Filename)
		if _,err:=os.Stat(path);err!=nil { if os.IsNotExist(err){report.Results=append(report.Results,migrationResult(store.ID,path,"absent",false,"no legacy state present"));continue};report.Results=append(report.Results,migrationResult(store.ID,path,"error",false,err.Error()));report.Healthy=false;continue }
		var r V23MigrationResult
		switch store.ID { case "behavior-baseline":r=migrateBehaviorBaselineV23(path);case "behavior-history":r=migrateBehaviorHistoryV23(path);case "trust-profile":r=migrateTrustProfileV23(path);case "trust-history":r=migrateTrustHistoryV23(path);case "change-history":r=migrateChangeHistoryV23(path);case "change-checkpoint":r=migrateChangeCheckpointV23(path);case "incident-history":r=migrateIncidentHistoryV23(path);default:r=migrationResult(store.ID,path,"error",false,"migration function unavailable") }
		if r.Status=="error"{report.Healthy=false};report.Results=append(report.Results,r)
	}
	if report.Healthy { marker:=filepath.Join(base,"migration-v23.json"); _=writePrivateJSON(marker,map[string]any{"version":v23MigrationMarkerVersion,"schema":SentinelSchemaV23,"completed_at":report.GeneratedAt,"stores":len(report.Results)}) }
	v23MigrationState.Lock();v23MigrationState.report=report;v23MigrationState.Unlock();return report
}

func currentV23MigrationReport() V23MigrationReport { v23MigrationState.RLock();defer v23MigrationState.RUnlock();return v23MigrationState.report }

func migrationRegistryIDs() []string { rows:=V23MigrationRegistry();out:=make([]string,0,len(rows));for _,r:=range rows{out=append(out,r.ID)};sort.Strings(out);return out }

func migrationStoreByID(id string)(V23MigrationStore,bool){id=strings.TrimSpace(id);for _,s:=range V23MigrationRegistry(){if s.ID==id{return s,true}};return V23MigrationStore{},false}
