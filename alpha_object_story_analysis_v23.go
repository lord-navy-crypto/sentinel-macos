// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"sort"
	"strings"
)

type ObjectStoryAnalysisV23 struct {
	TimelineEvents   int                       `json:"timeline_events"`
	ReviewEvents     int                       `json:"review_events"`
	HighEvents       int                       `json:"high_events"`
	IncidentCount    int                       `json:"incident_count"`
	NextTargetCount  int                       `json:"next_target_count"`
	SourceCounts     map[string]int            `json:"source_counts"`
	KindCounts       map[string]int            `json:"kind_counts"`
	Unknowns         []string                  `json:"unknowns,omitempty"`
	TimelineAnalysis GlobalTimelineAnalysisV23 `json:"timeline_analysis"`
	State            string                    `json:"state"`
	Note             string                    `json:"note"`
}

func BuildObjectStoryAnalysisV23(in ObjectStoryV2) ObjectStoryAnalysisV23 {
	out:=ObjectStoryAnalysisV23{TimelineEvents:len(in.Timeline),IncidentCount:len(in.Incidents),NextTargetCount:len(in.NextTargets),SourceCounts:map[string]int{},KindCounts:map[string]int{},Unknowns:append([]string(nil),in.Unknowns...),State:"observed",Note:"Object Story analysis summarizes retained evidence density and gaps. Event counts and Incident membership do not establish malicious intent."}
	for _,e:=range in.Timeline{out.SourceCounts[e.Source]++;out.KindCounts[e.Kind]++;switch strings.ToLower(e.Severity){case"high":out.HighEvents++;out.ReviewEvents++;case"review":out.ReviewEvents++}}
	out.TimelineAnalysis=BuildGlobalTimelineAnalysisV23(GlobalTimelineResponse{Events:append([]InvestigationTimelineEvent(nil),in.Timeline...)})
	if len(in.Timeline)==0&&len(in.Incidents)==0{out.State="limited_evidence"}else if out.HighEvents>0{out.State="high_review_activity"}else if out.ReviewEvents>0||len(in.Incidents)>0{out.State="review_activity"}
	out.Unknowns=uniqueStrings(out.Unknowns);sort.Strings(out.Unknowns)
	return out
}

func (in ObjectStoryV2) MarshalJSON()([]byte,error){type alias ObjectStoryV2;return json.Marshal(struct{alias;Analysis ObjectStoryAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildObjectStoryAnalysisV23(in)})}

type IncidentDeepReviewAnalysisV23 struct {
	Intelligence IncidentV23View `json:"intelligence"`
	HasIntegrity bool            `json:"has_integrity"`
	HasObjectStory bool          `json:"has_object_story"`
	ReviewScope []string         `json:"review_scope"`
	Limitations []string         `json:"limitations"`
}

func BuildIncidentDeepReviewAnalysisV23(in IncidentDeepReview) IncidentDeepReviewAnalysisV23 {
	out:=IncidentDeepReviewAnalysisV23{Intelligence:EnrichIncidentV23(in.Incident),HasIntegrity:in.Integrity!=nil,HasObjectStory:in.ObjectStory!=nil,Limitations:[]string{"Deep Review reinspects the currently addressable primary object. Historical evidence that aged out of retention cannot be reconstructed.","Integrity/signing results are evidence about object identity/trust context, not a malware verdict."}}
	out.ReviewScope=append(out.ReviewScope,"incident_evolution","incident_timeline","explain_why")
	if in.Integrity!=nil{out.ReviewScope=append(out.ReviewScope,"integrity")}
	if in.ObjectStory!=nil{out.ReviewScope=append(out.ReviewScope,"object_story")}
	return out
}

func (in IncidentDeepReview) MarshalJSON()([]byte,error){type alias IncidentDeepReview;return json.Marshal(struct{alias;Analysis IncidentDeepReviewAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildIncidentDeepReviewAnalysisV23(in)})}
