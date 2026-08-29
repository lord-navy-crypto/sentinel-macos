// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

const alphaTimelineWindowGapSeconds int64 = 120

type TimelineActivityWindowV23 struct {
	ID          string   `json:"id"`
	StartedAt   int64    `json:"started_at"`
	EndedAt     int64    `json:"ended_at"`
	DurationSec int64    `json:"duration_seconds"`
	EventCount  int      `json:"event_count"`
	ReviewCount int      `json:"review_count"`
	HighCount   int      `json:"high_count"`
	Sources     []string `json:"sources"`
	Kinds       []string `json:"kinds"`
	Paths       []string `json:"paths,omitempty"`
	IncidentIDs []string `json:"incident_ids,omitempty"`
	CrossSource bool     `json:"cross_source"`
	Summary     string   `json:"summary"`
}

type TimelineSourceCoObservationV23 struct {
	SourceA string `json:"source_a"`
	SourceB string `json:"source_b"`
	Windows int    `json:"windows"`
	Detail  string `json:"detail"`
}

type GlobalTimelineAnalysisV23 struct {
	WindowGapSeconds int                              `json:"window_gap_seconds"`
	Windows          []TimelineActivityWindowV23      `json:"windows"`
	ReviewWindows    []TimelineActivityWindowV23      `json:"review_windows,omitempty"`
	SourceCounts     map[string]int                   `json:"source_counts"`
	CoObservations   []TimelineSourceCoObservationV23 `json:"source_co_observations,omitempty"`
	Limitations      []string                         `json:"limitations"`
	Note             string                           `json:"note"`
}

func timelineUniqueSorted(set map[string]bool, limit int) []string {
	out:=make([]string,0,len(set));for x:=range set{if strings.TrimSpace(x)!=""{out=append(out,x)}};sort.Strings(out);if limit>0&&len(out)>limit{out=out[:limit]};return out
}

func buildTimelineActivityWindowV23(rows []InvestigationTimelineEvent) TimelineActivityWindowV23 {
	if len(rows)==0{return TimelineActivityWindowV23{}}
	sorted:=append([]InvestigationTimelineEvent(nil),rows...);sort.SliceStable(sorted,func(i,j int)bool{return sorted[i].At<sorted[j].At})
	sources,kinds,paths,incidents:=map[string]bool{},map[string]bool{},map[string]bool{},map[string]bool{}
	out:=TimelineActivityWindowV23{StartedAt:sorted[0].At,EndedAt:sorted[len(sorted)-1].At,EventCount:len(sorted)}
	for _,e:=range sorted{
		sources[e.Source]=true;kinds[e.Kind]=true;if p:=normalizeEvidencePath(e.Path);p!=""{paths[p]=true};if e.IncidentID!=""{incidents[e.IncidentID]=true}
		switch strings.ToLower(e.Severity){case"high":out.HighCount++;out.ReviewCount++;case"review":out.ReviewCount++}
	}
	if out.EndedAt>out.StartedAt{out.DurationSec=out.EndedAt-out.StartedAt}
	out.Sources=timelineUniqueSorted(sources,16);out.Kinds=timelineUniqueSorted(kinds,20);out.Paths=timelineUniqueSorted(paths,12);out.IncidentIDs=timelineUniqueSorted(incidents,12);out.CrossSource=len(out.Sources)>1
	out.ID=entityID("timeline-window-v23",fmt.Sprintf("%d|%d|%s",out.StartedAt,out.EndedAt,strings.Join(out.Sources,",")))
	out.Summary=fmt.Sprintf("%d retained event(s) across %d source(s); %d review/high event(s).",out.EventCount,len(out.Sources),out.ReviewCount)
	return out
}

func BuildGlobalTimelineAnalysisV23(in GlobalTimelineResponse) GlobalTimelineAnalysisV23 {
	out:=GlobalTimelineAnalysisV23{WindowGapSeconds:int(alphaTimelineWindowGapSeconds),SourceCounts:map[string]int{},Limitations:[]string{"Activity windows group events only by retained timestamp proximity (gap ≤ 120 seconds).","Cross-source co-observation means sources appeared in the same activity window; it does not establish causation, common origin, or malicious intent."},Note:"Timeline analysis is read-only and derives structure from the already-bounded Global Timeline response."}
	rows:=append([]InvestigationTimelineEvent(nil),in.Events...);sort.SliceStable(rows,func(i,j int)bool{return rows[i].At<rows[j].At})
	for _,e:=range rows{out.SourceCounts[e.Source]++}
	if len(rows)==0{return out}
	start:=0
	for i:=1;i<len(rows);i++{if rows[i].At-rows[i-1].At>alphaTimelineWindowGapSeconds{out.Windows=append(out.Windows,buildTimelineActivityWindowV23(rows[start:i]));start=i}}
	out.Windows=append(out.Windows,buildTimelineActivityWindowV23(rows[start:]))
	for _,w:=range out.Windows{if w.ReviewCount>0{out.ReviewWindows=append(out.ReviewWindows,w)}}
	sort.SliceStable(out.ReviewWindows,func(i,j int)bool{if out.ReviewWindows[i].HighCount!=out.ReviewWindows[j].HighCount{return out.ReviewWindows[i].HighCount>out.ReviewWindows[j].HighCount};if out.ReviewWindows[i].ReviewCount!=out.ReviewWindows[j].ReviewCount{return out.ReviewWindows[i].ReviewCount>out.ReviewWindows[j].ReviewCount};if out.ReviewWindows[i].EventCount!=out.ReviewWindows[j].EventCount{return out.ReviewWindows[i].EventCount>out.ReviewWindows[j].EventCount};return out.ReviewWindows[i].StartedAt>out.ReviewWindows[j].StartedAt});if len(out.ReviewWindows)>12{out.ReviewWindows=out.ReviewWindows[:12]}
	pairs:=map[string]int{}
	for _,w:=range out.Windows{for i:=0;i<len(w.Sources);i++{for j:=i+1;j<len(w.Sources);j++{a,b:=w.Sources[i],w.Sources[j];if a>b{a,b=b,a};pairs[a+"\x00"+b]++}}}
	keys:=make([]string,0,len(pairs));for k:=range pairs{keys=append(keys,k)};sort.Strings(keys)
	for _,k:=range keys{parts:=strings.SplitN(k,"\x00",2);if len(parts)!=2{continue};out.CoObservations=append(out.CoObservations,TimelineSourceCoObservationV23{SourceA:parts[0],SourceB:parts[1],Windows:pairs[k],Detail:fmt.Sprintf("Sources were co-observed in %d retained 120-second activity window(s); this is temporal co-observation only.",pairs[k])})}
	sort.SliceStable(out.CoObservations,func(i,j int)bool{if out.CoObservations[i].Windows!=out.CoObservations[j].Windows{return out.CoObservations[i].Windows>out.CoObservations[j].Windows};if out.CoObservations[i].SourceA!=out.CoObservations[j].SourceA{return out.CoObservations[i].SourceA<out.CoObservations[j].SourceA};return out.CoObservations[i].SourceB<out.CoObservations[j].SourceB});if len(out.CoObservations)>24{out.CoObservations=out.CoObservations[:24]}
	return out
}

func (in GlobalTimelineResponse) MarshalJSON()([]byte,error){type alias GlobalTimelineResponse;return json.Marshal(struct{alias;Analysis GlobalTimelineAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildGlobalTimelineAnalysisV23(in)})}
