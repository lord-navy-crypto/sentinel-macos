// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
)

type ObjectRelationshipTargetV23 struct {
	Kind     string `json:"kind"`
	Value    string `json:"value"`
	Relation string `json:"relation"`
	Detail   string `json:"detail,omitempty"`
}

type ObjectRelationshipAnalysisV23 struct {
	FactCategoryCounts map[string]int                `json:"fact_category_counts"`
	RelationCounts     map[string]int                `json:"relation_counts"`
	ParentDepth        int                           `json:"parent_depth"`
	NetworkRelations   int                           `json:"network_relations"`
	PersistenceRelations int                         `json:"persistence_relations"`
	RuntimeRelations   int                           `json:"runtime_relations"`
	TimelineEvents     int                           `json:"timeline_events"`
	ReviewTimelineEvents int                         `json:"review_timeline_events"`
	Targets            []ObjectRelationshipTargetV23 `json:"investigation_targets,omitempty"`
	State              string                       `json:"state"`
	Limitations        []string                     `json:"limitations"`
}

func objectStoryRelationTargetV23(rel StoryRelation) (ObjectRelationshipTargetV23,bool) {
	target:=strings.TrimSpace(rel.Target);detail:=strings.TrimSpace(rel.Detail)
	switch rel.Kind {
	case "parent_process","running_as":
		raw:=strings.TrimSpace(strings.TrimPrefix(target,"PID "));if pid,err:=strconv.Atoi(raw);err==nil&&pid>0{return ObjectRelationshipTargetV23{Kind:"pid",Value:strconv.Itoa(pid),Relation:rel.Kind,Detail:detail},true}
	case "launched_by","referenced_by_startup":
		if strings.HasPrefix(detail,"/"){return ObjectRelationshipTargetV23{Kind:"path",Value:detail,Relation:rel.Kind,Detail:target},true}
	case "connects_to","network_via_process":
		if target!=""{return ObjectRelationshipTargetV23{Kind:"endpoint",Value:target,Relation:rel.Kind,Detail:detail},true}
	case "exact_duplicate":
		if detail!=""{return ObjectRelationshipTargetV23{Kind:"sha256",Value:detail,Relation:rel.Kind,Detail:target},true}
	}
	return ObjectRelationshipTargetV23{},false
}

func BuildObjectRelationshipAnalysisV23(in ObjectStory) ObjectRelationshipAnalysisV23 {
	out:=ObjectRelationshipAnalysisV23{FactCategoryCounts:map[string]int{},RelationCounts:map[string]int{},TimelineEvents:len(in.Timeline),State:"observed",Limitations:[]string{"Relationship counts summarize currently retained/local evidence and do not prove causation, persistence, or malicious intent.","PID targets are current-session navigation aids only; callers must revalidate that the PID still refers to the intended process."}}
	for _,f:=range in.Facts{out.FactCategoryCounts[f.Category]++}
	seen:=map[string]bool{}
	for _,rel:=range in.Relations{
		out.RelationCounts[rel.Kind]++
		switch rel.Kind{case"parent_process":out.ParentDepth++;out.RuntimeRelations++;case"running_as":out.RuntimeRelations++;case"connects_to","network_via_process":out.NetworkRelations++;case"launched_by","referenced_by_startup":out.PersistenceRelations++}
		if target,ok:=objectStoryRelationTargetV23(rel);ok{key:=target.Kind+"\x00"+target.Value+"\x00"+target.Relation;if !seen[key]{seen[key]=true;out.Targets=append(out.Targets,target)}}
	}
	for _,e:=range in.Timeline{if e.Severity=="review"||e.Severity=="high"{out.ReviewTimelineEvents++}}
	if len(in.Facts)==0&&len(in.Relations)==0&&len(in.Timeline)==0{out.State="limited_evidence"}else if out.PersistenceRelations>0&&out.NetworkRelations>0{out.State="persistence_and_network_context"}else if out.PersistenceRelations>0{out.State="persistence_context"}else if out.NetworkRelations>0{out.State="network_context"}
	sort.SliceStable(out.Targets,func(i,j int)bool{if out.Targets[i].Kind!=out.Targets[j].Kind{return out.Targets[i].Kind<out.Targets[j].Kind};if out.Targets[i].Value!=out.Targets[j].Value{return out.Targets[i].Value<out.Targets[j].Value};return out.Targets[i].Relation<out.Targets[j].Relation});if len(out.Targets)>40{out.Targets=out.Targets[:40]}
	return out
}

func (in ObjectStory) MarshalJSON()([]byte,error){type alias ObjectStory;return json.Marshal(struct{alias;Analysis ObjectRelationshipAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildObjectRelationshipAnalysisV23(in)})}
