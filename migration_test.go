// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestV23MigrationRegistryCoversLegacyStores(t *testing.T) {
	want:=map[string]bool{"behavior-baseline":true,"behavior-history":true,"trust-profile":true,"trust-history":true,"change-history":true,"change-checkpoint":true,"incident-history":true}
	for _,id:=range migrationRegistryIDs(){delete(want,id)}
	if len(want)!=0{t.Fatalf("missing migration registry stores: %#v",want)}
}

func TestMigrateBehaviorBaselineCreatesRollbackCopy(t *testing.T) {
	dir:=t.TempDir();path:=filepath.Join(dir,"behavior-baseline.json")
	legacy:=BehaviorSnapshot{Version:0,CapturedAt:"2026-01-01T00:00:00Z"}
	if err:=writePrivateJSON(path,legacy);err!=nil{t.Fatal(err)}
	r:=migrateBehaviorBaselineV23(path)
	if r.Status!="ok"||!r.Changed{t.Fatalf("migration=%+v",r)}
	if _,err:=os.Stat(path+".bak");err!=nil{t.Fatalf("expected rollback .bak: %v",err)}
	var got BehaviorSnapshot
	if err:=strictReadJSON(path,&got);err!=nil{t.Fatal(err)}
	if got.Version!=1||got.PrivacyNote==""{t.Fatalf("normalized=%+v",got)}
}

func TestMigrationRefusesCorruptPrimaryWithoutOverwrite(t *testing.T) {
	dir:=t.TempDir();path:=filepath.Join(dir,"trust-profile.json")
	before:=[]byte("{broken")
	if err:=os.WriteFile(path,before,0600);err!=nil{t.Fatal(err)}
	r:=migrateTrustProfileV23(path)
	if r.Status!="error"||r.Changed{t.Fatalf("corrupt migration=%+v",r)}
	after,err:=os.ReadFile(path);if err!=nil{t.Fatal(err)}
	if string(after)!=string(before){t.Fatalf("corrupt primary was rewritten")}
}

func TestMigrateIncidentHistoryV2ToV3StableStory(t *testing.T) {
	dir:=t.TempDir();path:=filepath.Join(dir,"incident-history.json.gz")
	p:="/Applications/Example.app/Contents/MacOS/Example"
	legacy:=struct{Version int `json:"version"`;Incidents []Incident `json:"incidents"`}{2,[]Incident{
		{ID:"a",StoryKey:"window-a",PrimaryPath:p,CreatedAt:10,UpdatedAt:10,Severity:"review",Evidence:[]IncidentEvidence{{At:10,Source:"trust",Kind:"changed",Severity:"review",Path:p,Detail:"a"}}},
		{ID:"b",StoryKey:"window-b",PrimaryPath:p,CreatedAt:2000,UpdatedAt:2000,Severity:"review",Evidence:[]IncidentEvidence{{At:2000,Source:"behavior",Kind:"changed",Severity:"review",Path:p,Detail:"b"}}},
	}}
	if err:=writePrivateGzipJSON(path,legacy);err!=nil{t.Fatal(err)}
	r:=migrateIncidentHistoryV23(path);if r.Status!="ok"||!r.Changed{t.Fatalf("migration=%+v",r)}
	var got struct{Version int `json:"version"`;Incidents []Incident `json:"incidents"`}
	if err:=strictReadGzipJSON(path,&got);err!=nil{t.Fatal(err)}
	if got.Version!=incidentHistoryVersion||len(got.Incidents)!=1{t.Fatalf("migrated=%+v",got)}
	if got.Incidents[0].StoryKey!=entityID("incident-story",p){t.Fatalf("story=%q",got.Incidents[0].StoryKey)}
	if len(got.Incidents[0].Evidence)!=2{t.Fatalf("evidence=%d",len(got.Incidents[0].Evidence))}
}

func TestEphemeralMigrationDoesNotApplyPersistentWrites(t *testing.T) {
	r:=runV23StateMigrations(true)
	if r.Applied||!r.Healthy||len(r.Results)!=1||r.Results[0].Status!="skipped"{t.Fatalf("ephemeral report=%+v",r)}
}
