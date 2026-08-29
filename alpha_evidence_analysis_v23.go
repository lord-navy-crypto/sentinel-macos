// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

type EvidenceGraphConnectedNodeV23 struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Label     string `json:"label"`
	Degree    int    `json:"degree"`
	InDegree  int    `json:"in_degree"`
	OutDegree int    `json:"out_degree"`
	Severity  string `json:"severity,omitempty"`
}

type EvidenceGraphComponentV23 struct {
	ID               string   `json:"id"`
	NodeCount        int      `json:"node_count"`
	EdgeCount        int      `json:"edge_count"`
	Types            []string `json:"types"`
	ContainsIncident bool     `json:"contains_incident"`
	HighestSeverity  string   `json:"highest_severity"`
	SampleNodeIDs    []string `json:"sample_node_ids"`
}

type EvidenceGraphAnalysisV23 struct {
	TypeCounts       map[string]int                  `json:"type_counts"`
	RelationCounts   map[string]int                  `json:"relation_counts"`
	Components       []EvidenceGraphComponentV23     `json:"components"`
	TopConnected     []EvidenceGraphConnectedNodeV23 `json:"top_connected"`
	IsolatedNodeIDs  []string                       `json:"isolated_node_ids,omitempty"`
	ConnectedNodes   int                            `json:"connected_nodes"`
	IsolatedNodes    int                            `json:"isolated_nodes"`
	Limitations      []string                       `json:"limitations"`
	Note             string                         `json:"note"`
}

func graphAnalysisSeverityRank(s string) int {
	switch strings.ToLower(strings.TrimSpace(s)) {case "high": return 0;case "review": return 1;case "info": return 2;default:return 3}
}

func BuildEvidenceGraphAnalysisV23(in EvidenceGraphV2) EvidenceGraphAnalysisV23 {
	out:=EvidenceGraphAnalysisV23{TypeCounts:map[string]int{},RelationCounts:map[string]int{},Limitations:[]string{"Topology is computed only over the bounded Evidence Graph response; truncated nodes/edges can split apparent components.","High connectivity means many retained relationships, not higher malware probability, intent, or causation."},Note:"Graph analysis identifies retained structural relationships so investigation can prioritize connected evidence without inventing conclusions."}
	nodes:=map[string]EvidenceGraphV2Node{};adj:=map[string]map[string]bool{};inDegree,outDegree:=map[string]int{},map[string]int{}
	for _,n:=range in.Nodes{nodes[n.ID]=n;out.TypeCounts[n.Type]++;if adj[n.ID]==nil{adj[n.ID]=map[string]bool{}}}
	for _,e:=range in.Edges{if _,ok:=nodes[e.From];!ok{continue};if _,ok:=nodes[e.To];!ok{continue};out.RelationCounts[e.Type]++;outDegree[e.From]++;inDegree[e.To]++;adj[e.From][e.To]=true;adj[e.To][e.From]=true}
	connected:=[]EvidenceGraphConnectedNodeV23{}
	for _,n:=range in.Nodes{degree:=len(adj[n.ID]);if degree==0{out.IsolatedNodeIDs=append(out.IsolatedNodeIDs,n.ID);continue};out.ConnectedNodes++;connected=append(connected,EvidenceGraphConnectedNodeV23{ID:n.ID,Type:n.Type,Label:n.Label,Degree:degree,InDegree:inDegree[n.ID],OutDegree:outDegree[n.ID],Severity:n.Severity})}
	out.IsolatedNodes=len(out.IsolatedNodeIDs);sort.Strings(out.IsolatedNodeIDs);if len(out.IsolatedNodeIDs)>40{out.IsolatedNodeIDs=out.IsolatedNodeIDs[:40]}
	sort.SliceStable(connected,func(i,j int)bool{if connected[i].Degree!=connected[j].Degree{return connected[i].Degree>connected[j].Degree};if graphAnalysisSeverityRank(connected[i].Severity)!=graphAnalysisSeverityRank(connected[j].Severity){return graphAnalysisSeverityRank(connected[i].Severity)<graphAnalysisSeverityRank(connected[j].Severity)};return connected[i].ID<connected[j].ID});if len(connected)>24{connected=connected[:24]};out.TopConnected=connected
	visited:=map[string]bool{}
	for _,startNode:=range in.Nodes{if visited[startNode.ID]{continue};queue:=[]string{startNode.ID};visited[startNode.ID]=true;componentNodes:=[]string{};types:=map[string]bool{};containsIncident:=false;highest:="";edgeSeen:=map[string]bool{}
		for len(queue)>0{id:=queue[0];queue=queue[1:];componentNodes=append(componentNodes,id);n:=nodes[id];types[n.Type]=true;if n.Type=="incident"{containsIncident=true};if highest==""||graphAnalysisSeverityRank(n.Severity)<graphAnalysisSeverityRank(highest){highest=n.Severity};for next:=range adj[id]{pair:=id+"\x00"+next;if id>next{pair=next+"\x00"+id};edgeSeen[pair]=true;if !visited[next]{visited[next]=true;queue=append(queue,next)}}}
		sort.Strings(componentNodes);typeList:=make([]string,0,len(types));for x:=range types{typeList=append(typeList,x)};sort.Strings(typeList);sample:=append([]string(nil),componentNodes...);if len(sample)>12{sample=sample[:12]};c:=EvidenceGraphComponentV23{NodeCount:len(componentNodes),EdgeCount:len(edgeSeen),Types:typeList,ContainsIncident:containsIncident,HighestSeverity:highest,SampleNodeIDs:sample};c.ID=entityID("graph-component-v23",strings.Join(componentNodes,"\x00"));out.Components=append(out.Components,c)}
	sort.SliceStable(out.Components,func(i,j int)bool{if out.Components[i].NodeCount!=out.Components[j].NodeCount{return out.Components[i].NodeCount>out.Components[j].NodeCount};if out.Components[i].ContainsIncident!=out.Components[j].ContainsIncident{return out.Components[i].ContainsIncident};return out.Components[i].ID<out.Components[j].ID});if len(out.Components)>32{out.Components=out.Components[:32]}
	return out
}

func (in EvidenceGraphV2) MarshalJSON()([]byte,error){type alias EvidenceGraphV2;return json.Marshal(struct{alias;Analysis EvidenceGraphAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:BuildEvidenceGraphAnalysisV23(in)})}

type VisibilityBlindSpotV23 struct {
	ID             string `json:"id"`
	Category       string `json:"category"`
	Name           string `json:"name"`
	Status         string `json:"status"`
	Impact         string `json:"impact"`
	Interpretation string `json:"interpretation"`
	UserControlled bool   `json:"user_controlled"`
}

type VisibilityCategoryV23 struct {
	Category       string `json:"category"`
	Available      int    `json:"available"`
	Limited        int    `json:"limited"`
	Unavailable    int    `json:"unavailable"`
	UserControlled int    `json:"user_controlled"`
	State          string `json:"state"`
}

type VisibilityContinuityAnalysisV23 struct {
	State              string                  `json:"state"`
	Categories         []VisibilityCategoryV23 `json:"categories"`
	BlindSpots         []VisibilityBlindSpotV23 `json:"blind_spots,omitempty"`
	InterpretationPolicy map[string]string     `json:"interpretation_policy"`
	ExpectedUnknowns   []string                `json:"expected_unknowns,omitempty"`
	Note               string                  `json:"note"`
}

func visibilityStateFromCounts(available,limited,unavailable,userControlled int) string {if unavailable>0{return "degraded"};if limited>0||userControlled>0{return "limited"};if available>0{return "available"};return "unknown"}

func BuildVisibilityContinuityAnalysisV23(in VisibilityCenterV2) VisibilityContinuityAnalysisV23 {
	out:=VisibilityContinuityAnalysisV23{State:visibilityStateFromCounts(in.Available,in.Limited,in.Unavailable,0),InterpretationPolicy:map[string]string{"available":"Evidence source is currently reported available; this does not prove absence of unobserved activity.","limited":"Evidence may be incomplete or lower fidelity. Missing observations must remain unknown.","unavailable":"Do not draw negative conclusions from this source because Sentinel cannot currently observe it.","user_controlled":"Permission state remains under macOS/user control; Sentinel must not infer access it cannot verify."},Note:"Visibility continuity converts source availability into explicit investigation limits. It is not a security score."}
	byCategory:=map[string]*VisibilityCategoryV23{}
	for _,s:=range in.Sources{cat:=strings.TrimSpace(s.Category);if cat==""{cat="other"};row:=byCategory[cat];if row==nil{row=&VisibilityCategoryV23{Category:cat};byCategory[cat]=row};switch s.Status{case"available":row.Available++;case"unavailable":row.Unavailable++;case"user_controlled":row.UserControlled++;default:row.Limited++}
		if s.Status!="available"{interpretation:=out.InterpretationPolicy[s.Status];if interpretation==""{interpretation=out.InterpretationPolicy["limited"]};impact:=strings.TrimSpace(s.Impact);if impact==""{impact="Related evidence may be missing or reduced."};out.BlindSpots=append(out.BlindSpots,VisibilityBlindSpotV23{ID:s.ID,Category:cat,Name:s.Name,Status:s.Status,Impact:impact,Interpretation:interpretation,UserControlled:s.UserControlled});out.ExpectedUnknowns=append(out.ExpectedUnknowns,s.Name+": "+impact)}}
	cats:=make([]string,0,len(byCategory));for cat:=range byCategory{cats=append(cats,cat)};sort.Strings(cats);for _,cat:=range cats{row:=*byCategory[cat];row.State=visibilityStateFromCounts(row.Available,row.Limited,row.Unavailable,row.UserControlled);out.Categories=append(out.Categories,row)}
	sort.SliceStable(out.BlindSpots,func(i,j int)bool{rank:=func(s string)int{switch s{case"unavailable":return 0;case"user_controlled":return 1;default:return 2}};ri,rj:=rank(out.BlindSpots[i].Status),rank(out.BlindSpots[j].Status);if ri!=rj{return ri<rj};if out.BlindSpots[i].Category!=out.BlindSpots[j].Category{return out.BlindSpots[i].Category<out.BlindSpots[j].Category};return out.BlindSpots[i].Name<out.BlindSpots[j].Name});if len(out.BlindSpots)>24{out.BlindSpots=out.BlindSpots[:24]};out.ExpectedUnknowns=uniqueStrings(out.ExpectedUnknowns);sort.Strings(out.ExpectedUnknowns);if len(out.ExpectedUnknowns)>24{out.ExpectedUnknowns=out.ExpectedUnknowns[:24]}
	if in.Unavailable>0{out.State="degraded"}else if in.Limited>0{out.State="limited"}
	return out
}

func (in VisibilityCenterV2) MarshalJSON()([]byte,error){type alias VisibilityCenterV2;analysis:=BuildVisibilityContinuityAnalysisV23(in);raw,err:=json.Marshal(struct{alias;Analysis VisibilityContinuityAnalysisV23 `json:"analysis"`}{alias:alias(in),Analysis:analysis});if err!=nil{return nil,fmt.Errorf("visibility analysis marshal: %w",err)};return raw,nil}
