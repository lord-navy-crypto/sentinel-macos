// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

type NetworkHistoryProcessChangeV23 struct {
	Process    string `json:"process"`
	User       string `json:"user,omitempty"`
	Added      int    `json:"added"`
	Ended      int    `json:"ended"`
	Net        int    `json:"net"`
	Endpoints  int    `json:"endpoint_count"`
	States     []string `json:"states,omitempty"`
}

type NetworkHistoryEndpointChangeV23 struct {
	Endpoint      string `json:"endpoint"`
	EndpointClass string `json:"endpoint_class,omitempty"`
	Added         int    `json:"added"`
	Ended         int    `json:"ended"`
	Processes     []string `json:"processes,omitempty"`
}

type NetworkHistoryStateTransitionV23 struct {
	ID            string `json:"id"`
	Process       string `json:"process"`
	User          string `json:"user,omitempty"`
	Endpoint      string `json:"endpoint"`
	EndpointClass string `json:"endpoint_class,omitempty"`
	FromState     string `json:"from_state"`
	ToState       string `json:"to_state"`
	Detail        string `json:"detail"`
}

type NetworkHistoryInvestigationTargetV23 struct {
	Kind          string `json:"kind"`
	Value         string `json:"value"`
	Process       string `json:"process,omitempty"`
	EndpointClass string `json:"endpoint_class,omitempty"`
	Direction     string `json:"direction"`
	Why           string `json:"why"`
}

type NetworkHistoryDiffAnalysisV23 struct {
	AddedCount        int                                  `json:"added_count"`
	EndedCount        int                                  `json:"ended_count"`
	ProcessChanges    []NetworkHistoryProcessChangeV23     `json:"process_changes,omitempty"`
	EndpointChanges   []NetworkHistoryEndpointChangeV23    `json:"endpoint_changes,omitempty"`
	StateTransitions  []NetworkHistoryStateTransitionV23   `json:"state_transition_candidates,omitempty"`
	Targets           []NetworkHistoryInvestigationTargetV23 `json:"investigation_targets,omitempty"`
	Limitations       []string                             `json:"limitations"`
	Note              string                               `json:"note"`
}

func networkDiffProcessKey(r NetworkHistoryRelation) string {
	return strings.ToLower(strings.TrimSpace(r.Process)+"\x00"+strings.TrimSpace(r.User))
}

func networkDiffContextKey(r NetworkHistoryRelation) string {
	return strings.ToLower(strings.Join([]string{strings.TrimSpace(r.Process),strings.TrimSpace(r.User),strings.TrimSpace(r.EndpointClass),strings.TrimSpace(r.Endpoint)},"\x00"))
}

func appendUniqueNetworkValue(values []string, value string) []string {
	value=strings.TrimSpace(value);if value==""{return values};for _,x:=range values{if x==value{return values}};return append(values,value)
}

func buildNetworkProcessChangesV23(in NetworkHistoryDiff) []NetworkHistoryProcessChangeV23 {
	type acc struct{ row NetworkHistoryProcessChangeV23; endpoints map[string]bool }
	m:=map[string]*acc{}
	consume:=func(r NetworkHistoryRelation,added bool){key:=networkDiffProcessKey(r);a:=m[key];if a==nil{a=&acc{row:NetworkHistoryProcessChangeV23{Process:r.Process,User:r.User},endpoints:map[string]bool{}};m[key]=a};if added{a.row.Added++}else{a.row.Ended++};a.endpoints[r.Endpoint]=true;a.row.States=appendUniqueNetworkValue(a.row.States,r.State)}
	for _,r:=range in.Added{consume(r,true)};for _,r:=range in.Ended{consume(r,false)}
	out:=make([]NetworkHistoryProcessChangeV23,0,len(m));for _,a:=range m{a.row.Net=a.row.Added-a.row.Ended;a.row.Endpoints=len(a.endpoints);sort.Strings(a.row.States);out=append(out,a.row)}
	sort.SliceStable(out,func(i,j int)bool{mi:=out[i].Added+out[i].Ended;mj:=out[j].Added+out[j].Ended;if mi!=mj{return mi>mj};if out[i].Process!=out[j].Process{return out[i].Process<out[j].Process};return out[i].User<out[j].User});if len(out)>24{out=out[:24]};return out
}

func buildNetworkEndpointChangesV23(in NetworkHistoryDiff) []NetworkHistoryEndpointChangeV23 {
	type acc struct{ row NetworkHistoryEndpointChangeV23 }
	m:=map[string]*acc{}
	consume:=func(r NetworkHistoryRelation,added bool){key:=strings.ToLower(strings.TrimSpace(r.EndpointClass)+"\x00"+strings.TrimSpace(r.Endpoint));a:=m[key];if a==nil{a=&acc{row:NetworkHistoryEndpointChangeV23{Endpoint:r.Endpoint,EndpointClass:r.EndpointClass}};m[key]=a};if added{a.row.Added++}else{a.row.Ended++};a.row.Processes=appendUniqueNetworkValue(a.row.Processes,r.Process)}
	for _,r:=range in.Added{consume(r,true)};for _,r:=range in.Ended{consume(r,false)}
	out:=make([]NetworkHistoryEndpointChangeV23,0,len(m));for _,a:=range m{sort.Strings(a.row.Processes);out=append(out,a.row)}
	sort.SliceStable(out,func(i,j int)bool{mi:=out[i].Added+out[i].Ended;mj:=out[j].Added+out[j].Ended;if mi!=mj{return mi>mj};if out[i].EndpointClass!=out[j].EndpointClass{return out[i].EndpointClass<out[j].EndpointClass};return out[i].Endpoint<out[j].Endpoint});if len(out)>32{out=out[:32]};return out
}

func buildNetworkStateTransitionsV23(in NetworkHistoryDiff) []NetworkHistoryStateTransitionV23 {
	ended:=map[string][]NetworkHistoryRelation{};added:=map[string][]NetworkHistoryRelation{}
	for _,r:=range in.Ended{ended[networkDiffContextKey(r)]=append(ended[networkDiffContextKey(r)],r)}
	for _,r:=range in.Added{added[networkDiffContextKey(r)]=append(added[networkDiffContextKey(r)],r)}
	keys:=make([]string,0,len(ended));for k:=range ended{if len(added[k])>0{keys=append(keys,k)}};sort.Strings(keys)
	out:=[]NetworkHistoryStateTransitionV23{}
	for _,k:=range keys{oldRows,newRows:=ended[k],added[k];sort.SliceStable(oldRows,func(i,j int)bool{return oldRows[i].State<oldRows[j].State});sort.SliceStable(newRows,func(i,j int)bool{return newRows[i].State<newRows[j].State});limit:=len(oldRows);if len(newRows)<limit{limit=len(newRows)};for i:=0;i<limit;i++{old,newR:=oldRows[i],newRows[i];if old.State==newR.State{continue};item:=NetworkHistoryStateTransitionV23{Process:newR.Process,User:newR.User,Endpoint:newR.Endpoint,EndpointClass:newR.EndpointClass,FromState:old.State,ToState:newR.State,Detail:"The same normalized process/user/endpoint context was absent in the old state and present in the new state across two explicit snapshots. Exact transition time and causation are unknown."};item.ID=entityID("network-state-transition-v23",strings.Join([]string{k,old.State,newR.State},"\x00"));out=append(out,item);if len(out)>=24{return out}}}
	return out
}

func buildNetworkInvestigationTargetsV23(in NetworkHistoryDiff) []NetworkHistoryInvestigationTargetV23 {
	seen:=map[string]bool{};out:=[]NetworkHistoryInvestigationTargetV23{}
	consume:=func(r NetworkHistoryRelation,direction string){process:=strings.TrimSpace(r.Process);if process!=""{key:="process\x00"+strings.ToLower(process);if !seen[key]{seen[key]=true;out=append(out,NetworkHistoryInvestigationTargetV23{Kind:"process_name",Value:process,Direction:direction,Why:"Search current process evidence by name. Historical PID values are intentionally not reopened because macOS can reuse PIDs."})}};endpoint:=strings.TrimSpace(r.Endpoint);if endpoint!=""{key:="endpoint\x00"+strings.ToLower(r.EndpointClass)+"\x00"+strings.ToLower(endpoint);if !seen[key]{seen[key]=true;out=append(out,NetworkHistoryInvestigationTargetV23{Kind:"endpoint",Value:endpoint,Process:process,EndpointClass:r.EndpointClass,Direction:direction,Why:"Continue into current/retained network evidence for this normalized endpoint when available."})}}}
	for _,r:=range in.Added{consume(r,"added")};for _,r:=range in.Ended{consume(r,"ended")};if len(out)>40{out=out[:40]};return out
}

func BuildNetworkHistoryDiffAnalysisV23(in NetworkHistoryDiff) NetworkHistoryDiffAnalysisV23 {
	return NetworkHistoryDiffAnalysisV23{AddedCount:len(in.Added),EndedCount:len(in.Ended),ProcessChanges:buildNetworkProcessChangesV23(in),EndpointChanges:buildNetworkEndpointChangesV23(in),StateTransitions:buildNetworkStateTransitionsV23(in),Targets:buildNetworkInvestigationTargetsV23(in),Limitations:[]string{"Added/ended means a normalized relationship was present in one explicit snapshot and absent in the other; it does not establish exact connection start/end time.","State-transition candidates require exact normalized process/user/endpoint context across snapshots but still do not prove an actual protocol state transition occurred between captures.","Historical PIDs are context only and are not direct investigation targets because macOS can reuse PID values."},Note:fmt.Sprintf("%d newly present and %d no-longer-present normalized network relationship(s) are analyzed without packet capture, payload inspection, DNS attribution, or decryption.",len(in.Added),len(in.Ended))}
}

func (in NetworkHistoryDiff) MarshalJSON()([]byte,error){type alias NetworkHistoryDiff;return json.Marshal(struct{alias;Analysis NetworkHistoryDiffAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildNetworkHistoryDiffAnalysisV23(in)})}
