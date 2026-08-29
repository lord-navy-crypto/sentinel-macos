// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestIncidentEvolutionReconstructsSeparatedEpisodes(t *testing.T){
	in:=Incident{StoryKey:"story-test",PrimaryPath:"/Applications/Test.app",Evidence:[]IncidentEvidence{
		{At:100,Source:"system_console",Kind:"gatekeeper_rejected",Severity:"review",Path:"/Applications/Test.app",Detail:"review"},
		{At:110,Source:"persistence",Kind:"launch_changed",Severity:"review",Path:"/Applications/Test.app",Detail:"startup"},
		{At:2000,Source:"system_console",Kind:"gatekeeper_rejected",Severity:"review",Path:"/Applications/Test.app",Detail:"review again"},
		{At:2010,Source:"persistence",Kind:"launch_changed",Severity:"high",Path:"/Applications/Test.app",Detail:"startup again"},
		{At:2020,Source:"trust",Kind:"identity_drift",Severity:"high",Path:"/Applications/Test.app",Detail:"new source"},
	}}
	episodes,evolution:=BuildIncidentEvolutionV23(in)
	if len(episodes)!=2{t.Fatalf("expected 2 reconstructed episodes, got %d",len(episodes))}
	if evolution.EpisodeCount!=2||evolution.LatestDirection!="escalated"{t.Fatalf("unexpected evolution: %+v",evolution)}
	if !containsString(evolution.AddedSources,"trust"){t.Fatalf("expected trust as newly observed source: %+v",evolution.AddedSources)}
	if evolution.GapSeconds<=incidentWindowSeconds{t.Fatalf("expected retained episode gap beyond correlation window, got %d",evolution.GapSeconds)}
	if episodes[0].EpisodeID==episodes[1].EpisodeID{t.Fatal("separated episodes must retain distinct analytical episode IDs")}
}

func TestIncidentEvolutionSingleEpisodeIsExplicit(t *testing.T){
	in:=Incident{PrimaryPath:"/tmp/object",Evidence:[]IncidentEvidence{{At:10,Source:"persistence",Kind:"change",Severity:"review",Path:"/tmp/object"},{At:20,Source:"filesystem",Kind:"modified",Severity:"review",Path:"/tmp/object"}}}
	episodes,evolution:=BuildIncidentEvolutionV23(in)
	if len(episodes)!=1||evolution.LatestDirection!="single-episode"{t.Fatalf("unexpected single-episode analysis: %+v %+v",episodes,evolution)}
	if !strings.Contains(strings.ToLower(evolution.Limitations[1]),"not malware") {t.Fatalf("evolution limitation must reject malware-probability interpretation: %+v",evolution.Limitations)}
}

func TestSystemSnapshotDiffBuildsTypedTargetsAndStrictCorrelation(t *testing.T){
	in:=SystemSnapshotDiffV23{FromID:"a",ToID:"b",Categories:[]SystemSnapshotCategoryDiff{
		{Category:"mounts",Added:[]string{"/dev/disk3 → /Volumes/Test · rw"}},
		{Category:"filesystems",Added:[]string{"/dev/disk3 → /Volumes/Test"}},
		{Category:"startup",Added:[]string{"com.example.agent"}},
	}}
	analysis:=BuildSystemSnapshotDiffAnalysisV23(in)
	if len(analysis.Objects)!=3{t.Fatalf("expected 3 typed objects, got %d",len(analysis.Objects))}
	if len(analysis.Correlations)!=1||analysis.Correlations[0].Type!="shared_ref"||analysis.Correlations[0].Confidence!="explicit"{t.Fatalf("expected one strict shared-ref correlation: %+v",analysis.Correlations)}
	foundPath:=false;foundStartupReview:=false
	for _,target:=range analysis.Targets{if target.Kind=="path"&&target.Ref=="/Volumes/Test"{foundPath=true}}
	for _,obj:=range analysis.Objects{if obj.Category=="startup"&&obj.Severity=="review"{foundStartupReview=true}}
	if !foundPath||!foundStartupReview{t.Fatalf("missing path/startup semantics: targets=%+v objects=%+v",analysis.Targets,analysis.Objects)}
	raw,err:=json.Marshal(in);if err!=nil{t.Fatal(err)}
	if !strings.Contains(string(raw),"\"analysis\"")||!strings.Contains(string(raw),"investigation_targets"){t.Fatalf("additive diff analysis missing from JSON: %s",raw)}
}

func TestRecoveryAnalysisBuildsCandidatesAndPriorityPlan(t *testing.T){
	in:=RecoveryCenterV23{
		Mode:"persistent-local",
		SafeActions:ActionHealth{Healthy:false,ManifestIssues:1,Issues:[]string{"manifest mismatch"}},
		Journal:[]ActionJournalEntry{{ID:"j1",At:"2026-08-29T00:00:00Z",Action:"vault",Status:"success",ObjectName:"Test",From:"/tmp/Test",To:"/vault/Test",VaultID:"v1",Reversible:true}},
		ChangeMonitor:ChangeStatus{NeedsRescan:true,ResumeCheckpoint:true},
		SystemSnapshots:0,StorageSnapshots:2,NetworkSnapshots:1,
		InterruptedJobs:[]RecoveryJobV23{{ID:"job1",Status:"failed",Root:"/tmp"}},InterruptedOrPartial:true,
	}
	analysis:=BuildRecoveryAnalysisV23(in)
	if analysis.Readiness!="blocked"{t.Fatalf("unhealthy Safe Actions should block recovery readiness: %+v",analysis)}
	if len(analysis.Candidates)!=1||analysis.Candidates[0].State!="preview_required"{t.Fatalf("expected reversible preview candidate: %+v",analysis.Candidates)}
	hasP0,hasRescan,hasCheckpoint:=false,false,false
	for _,step:=range analysis.Plan{if step.Priority=="P0"&&step.Blocking{hasP0=true};if step.Category=="change_monitor"&&strings.Contains(step.Title,"continuity"){hasRescan=true};if step.Category=="checkpoint"{hasCheckpoint=true}}
	if !hasP0||!hasRescan||!hasCheckpoint{t.Fatalf("recovery plan missing required priorities: %+v",analysis.Plan)}
	raw,err:=json.Marshal(in);if err!=nil{t.Fatal(err)}
	if !strings.Contains(string(raw),"\"analysis\"")||!strings.Contains(string(raw),"\"candidates\"")||!strings.Contains(string(raw),"\"plan\""){t.Fatalf("additive recovery analysis missing from JSON: %s",raw)}
}

func containsString(rows []string,want string)bool{for _,x:=range rows{if x==want{return true}};return false}
