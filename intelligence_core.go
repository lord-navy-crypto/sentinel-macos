// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	evidenceGraphV2NodeBudget = 320
	evidenceGraphV2EdgeBudget = 640
	globalTimelineLimit       = 500
	objectStoryV2TimelineLimit = 160
)

// Evidence Graph 2.0 is an additive view over Sentinel's existing evidence.
// The legacy graph remains available so v2.2 clients keep their contract.
type EvidenceGraphV2Node struct {
	ID             string            `json:"id"`
	Type           string            `json:"type"`
	Ref            string            `json:"ref,omitempty"`
	Label          string            `json:"label"`
	Detail         string            `json:"detail,omitempty"`
	Severity       string            `json:"severity,omitempty"`
	ReviewPriority int               `json:"review_priority,omitempty"`
	FirstSeen      int64             `json:"first_seen,omitempty"`
	LastSeen       int64             `json:"last_seen,omitempty"`
	Sources        []string          `json:"sources,omitempty"`
	Attributes     map[string]string `json:"attributes,omitempty"`
}

type EvidenceGraphV2Edge struct {
	ID        string   `json:"id"`
	From      string   `json:"from"`
	To        string   `json:"to"`
	Type      string   `json:"type"`
	Detail    string   `json:"detail,omitempty"`
	FirstSeen int64    `json:"first_seen,omitempty"`
	LastSeen  int64    `json:"last_seen,omitempty"`
	Sources   []string `json:"sources,omitempty"`
}

type EvidenceGraphV2 struct {
	GeneratedAt string                `json:"generated_at"`
	Nodes       []EvidenceGraphV2Node `json:"nodes"`
	Edges       []EvidenceGraphV2Edge `json:"edges"`
	NodeBudget  int                   `json:"node_budget"`
	EdgeBudget  int                   `json:"edge_budget"`
	Truncated   bool                  `json:"truncated"`
	Limitations []string              `json:"limitations,omitempty"`
	Note        string                `json:"note"`
}

func graphV2SeverityFromRisk(risk int) string {
	switch {
	case risk >= 70:
		return "high"
	case risk >= 40:
		return "review"
	default:
		return "info"
	}
}

func graphV2NodeFromLegacy(n EvidenceNode) EvidenceGraphV2Node {
	return EvidenceGraphV2Node{
		ID: n.ID, Type: n.Type, Ref: n.Ref, Label: n.Label, Detail: n.Detail,
		Severity: graphV2SeverityFromRisk(n.Risk), ReviewPriority: n.Risk,
		Sources: []string{"current_evidence"},
	}
}

func graphV2EdgeFromLegacy(e EvidenceEdge) EvidenceGraphV2Edge {
	id := entityID("graph-v2-edge", strings.Join([]string{e.From, e.Relation, e.To, e.Detail}, "\x00"))
	return EvidenceGraphV2Edge{ID: id, From: e.From, To: e.To, Type: e.Relation, Detail: e.Detail, Sources: []string{"current_evidence"}}
}

func appendGraphV2Node(dst map[string]EvidenceGraphV2Node, n EvidenceGraphV2Node) {
	if n.ID == "" {
		return
	}
	if old, ok := dst[n.ID]; ok {
		old.Sources = uniqueStrings(append(old.Sources, n.Sources...))
		if old.FirstSeen == 0 || (n.FirstSeen > 0 && n.FirstSeen < old.FirstSeen) { old.FirstSeen = n.FirstSeen }
		if n.LastSeen > old.LastSeen { old.LastSeen = n.LastSeen }
		if n.ReviewPriority > old.ReviewPriority { old.ReviewPriority = n.ReviewPriority; old.Severity = n.Severity }
		if old.Detail == "" { old.Detail = n.Detail }
		dst[n.ID] = old
		return
	}
	dst[n.ID] = n
}

func appendGraphV2Edge(dst map[string]EvidenceGraphV2Edge, e EvidenceGraphV2Edge) {
	if e.ID == "" || e.From == "" || e.To == "" { return }
	if old, ok := dst[e.ID]; ok {
		old.Sources = uniqueStrings(append(old.Sources, e.Sources...))
		if old.FirstSeen == 0 || (e.FirstSeen > 0 && e.FirstSeen < old.FirstSeen) { old.FirstSeen = e.FirstSeen }
		if e.LastSeen > old.LastSeen { old.LastSeen = e.LastSeen }
		dst[e.ID] = old
		return
	}
	dst[e.ID] = e
}

func incidentEntityStableID(in Incident) string {
	anchor := normalizeEvidencePath(firstNonEmpty(in.PrimaryPath, firstString(in.RelatedPaths)))
	if anchor == "" { anchor = firstNonEmpty(in.StoryKey, in.ID) }
	return entityID("incident-entity-v2", anchor)
}

func firstString(v []string) string {
	if len(v) == 0 { return "" }
	return v[0]
}

func (a *app) buildEvidenceGraphV2() EvidenceGraphV2 {
	out := EvidenceGraphV2{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339), NodeBudget: evidenceGraphV2NodeBudget, EdgeBudget: evidenceGraphV2EdgeBudget,
		Note: "Evidence Graph 2.0 correlates bounded local observations. Edges are evidence relationships, not proof of malicious intent or causation.",
	}
	legacy := buildEvidenceGraph(collectStartupItems(), parsePS(180), func() []NetworkItem { n, _ := collectNetwork(); return n }())
	nodes := map[string]EvidenceGraphV2Node{}
	edges := map[string]EvidenceGraphV2Edge{}
	for _, n := range legacy.Nodes { appendGraphV2Node(nodes, graphV2NodeFromLegacy(n)) }
	for _, e := range legacy.Edges { appendGraphV2Edge(edges, graphV2EdgeFromLegacy(e)) }

	if a != nil && a.incidents != nil {
		for _, in := range a.incidents.snapshot(true).Incidents {
			incNodeID := incidentEntityStableID(in)
			appendGraphV2Node(nodes, EvidenceGraphV2Node{
				ID: incNodeID, Type: "incident", Ref: in.ID, Label: in.Title, Detail: in.PrimaryPath,
				Severity: in.Severity, ReviewPriority: in.Confidence, FirstSeen: in.CreatedAt, LastSeen: in.UpdatedAt,
				Sources: append([]string{"incident"}, in.Sources...), Attributes: map[string]string{"episode_id": in.ID, "state": in.State, "confidence_band": in.ConfidenceBand},
			})
			paths := append([]string{in.PrimaryPath}, in.RelatedPaths...)
			for _, p := range uniqueStrings(paths) {
				p = normalizeEvidencePath(p); if p == "" { continue }
				fileID := entityID("file", p)
				appendGraphV2Node(nodes, EvidenceGraphV2Node{ID:fileID, Type:"file", Ref:p, Label:filepath.Base(p), Detail:p, Sources:[]string{"incident"}})
				e := EvidenceGraphV2Edge{From:fileID, To:incNodeID, Type:"member_of_incident", Detail:"Object path appears in correlated incident evidence.", FirstSeen:in.CreatedAt, LastSeen:in.UpdatedAt, Sources:[]string{"incident"}}
				e.ID = entityID("graph-v2-edge", e.From+"\x00"+e.Type+"\x00"+e.To)
				appendGraphV2Edge(edges, e)
			}
		}
	}

	if a != nil && a.networkHistory != nil {
		snapshots := a.networkHistory.list()
		if len(snapshots) > 0 {
			latest := snapshots[0]
			snapID := entityID("network-snapshot-node", latest.ID)
			at, _ := time.Parse(time.RFC3339, latest.CapturedAt)
			appendGraphV2Node(nodes, EvidenceGraphV2Node{ID:snapID, Type:"network_snapshot", Ref:latest.ID, Label:"Network snapshot", Detail:latest.CapturedAt, FirstSeen:at.Unix(), LastSeen:at.Unix(), Sources:[]string{"network_history"}})
			for _, rel := range latest.Relations {
				endpointID := entityID("network-endpoint-v2", strings.ToLower(rel.EndpointClass+"\x00"+rel.Endpoint))
				appendGraphV2Node(nodes, EvidenceGraphV2Node{ID:endpointID, Type:"endpoint", Ref:rel.Endpoint, Label:rel.Endpoint, Detail:rel.EndpointClass+" · "+rel.State, Sources:[]string{"network_history"}})
				e := EvidenceGraphV2Edge{From:endpointID, To:snapID, Type:"observed_in_snapshot", Detail:rel.Process, FirstSeen:at.Unix(), LastSeen:at.Unix(), Sources:[]string{"network_history"}}
				e.ID = entityID("graph-v2-edge", e.From+"\x00"+e.Type+"\x00"+e.To+"\x00"+rel.Process)
				appendGraphV2Edge(edges, e)
			}
		}
	}

	for _, n := range nodes { out.Nodes = append(out.Nodes, n) }
	for _, e := range edges { out.Edges = append(out.Edges, e) }
	sort.SliceStable(out.Nodes, func(i,j int) bool { if out.Nodes[i].Type != out.Nodes[j].Type { return out.Nodes[i].Type < out.Nodes[j].Type }; return out.Nodes[i].ID < out.Nodes[j].ID })
	sort.SliceStable(out.Edges, func(i,j int) bool { if out.Edges[i].Type != out.Edges[j].Type { return out.Edges[i].Type < out.Edges[j].Type }; return out.Edges[i].ID < out.Edges[j].ID })
	if len(out.Nodes) > evidenceGraphV2NodeBudget { out.Nodes = out.Nodes[:evidenceGraphV2NodeBudget]; out.Truncated = true; out.Limitations = append(out.Limitations, fmt.Sprintf("nodes bounded to %d", evidenceGraphV2NodeBudget)) }
	allowed := map[string]bool{}; for _, n := range out.Nodes { allowed[n.ID] = true }
	filtered := out.Edges[:0]; for _, e := range out.Edges { if allowed[e.From] && allowed[e.To] { filtered = append(filtered, e) } }; out.Edges = filtered
	if len(out.Edges) > evidenceGraphV2EdgeBudget { out.Edges = out.Edges[:evidenceGraphV2EdgeBudget]; out.Truncated = true; out.Limitations = append(out.Limitations, fmt.Sprintf("edges bounded to %d", evidenceGraphV2EdgeBudget)) }
	return out
}

func filterGraphV2(in EvidenceGraphV2, r *http.Request) EvidenceGraphV2 {
	typeFilter := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("type")))
	sourceFilter := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("source")))
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	if typeFilter == "" && sourceFilter == "" && q == "" { return in }
	keep := map[string]bool{}; var nodes []EvidenceGraphV2Node
	for _, n := range in.Nodes {
		if typeFilter != "" && strings.ToLower(n.Type) != typeFilter { continue }
		if sourceFilter != "" { found:=false; for _, s := range n.Sources { if strings.Contains(strings.ToLower(s), sourceFilter) { found=true; break } }; if !found { continue } }
		if q != "" && !strings.Contains(strings.ToLower(n.Label+" "+n.Detail+" "+n.Ref), q) { continue }
		nodes = append(nodes,n); keep[n.ID]=true
	}
	var edges []EvidenceGraphV2Edge
	for _, e := range in.Edges { if keep[e.From] || keep[e.To] { edges=append(edges,e) } }
	in.Nodes=nodes; in.Edges=edges
	return in
}

// Incident Intelligence 2.0 keeps legacy episode IDs while adding a stable,
// object-centered entity ID plus Explain Why and ordered evidence timeline.
type IncidentIntelligenceV2 struct {
	StableID string `json:"stable_id"`
	EpisodeID string `json:"episode_id"`
	State string `json:"state"`
	FirstSeen int64 `json:"first_seen"`
	LastSeen int64 `json:"last_seen"`
	OccurrenceCount int `json:"occurrence_count"`
	View IncidentV23View `json:"view"`
}

type IncidentIntelligenceV2Response struct {
	GeneratedAt string `json:"generated_at"`
	Count int `json:"count"`
	Incidents []IncidentIntelligenceV2 `json:"incidents"`
	Note string `json:"note"`
}

func incidentV2Record(in Incident) IncidentIntelligenceV2 {
	return IncidentIntelligenceV2{StableID:incidentEntityStableID(in), EpisodeID:in.ID, State:in.State, FirstSeen:in.CreatedAt, LastSeen:in.UpdatedAt, OccurrenceCount:in.OccurrenceCount, View:EnrichIncidentV23(in)}
}

func (a *app) incidentV2Snapshot(history bool) IncidentIntelligenceV2Response {
	out := IncidentIntelligenceV2Response{GeneratedAt:time.Now().UTC().Format(time.RFC3339), Note:"Stable ID identifies the object-centered incident entity; Episode ID preserves the existing bounded correlation episode. Confidence remains relationship confidence, not malware probability."}
	if a == nil || a.incidents == nil { return out }
	for _, in := range a.incidents.snapshot(history).Incidents { out.Incidents=append(out.Incidents,incidentV2Record(in)) }
	out.Count=len(out.Incidents); return out
}

// Global Timeline merges bounded session intelligence, filesystem-change and
// incident evidence into one filterable view. Missing sources remain explicit.
type GlobalTimelineResponse struct {
	GeneratedAt string `json:"generated_at"`
	Events []InvestigationTimelineEvent `json:"events"`
	Count int `json:"count"`
	Sources []string `json:"sources"`
	Limitations []string `json:"limitations,omitempty"`
	Note string `json:"note"`
}

func parseUnixFilter(raw string) int64 { v,_ := strconv.ParseInt(strings.TrimSpace(raw),10,64); return v }

func (a *app) globalTimeline(r *http.Request) GlobalTimelineResponse {
	rows := []InvestigationTimelineEvent{}
	sources := map[string]bool{}
	if a != nil && a.intel != nil {
		for _, e := range a.intel.timeline(220) { row:=InvestigationTimelineEvent{At:e.At,Source:"intelligence",Kind:e.Kind,Severity:e.Severity,Detail:firstNonEmpty(e.Title,e.Detail)}; row.ID=entityID("global-timeline", fmt.Sprintf("%d|%s|%s|%s",row.At,row.Source,row.Kind,row.Detail)); rows=append(rows,row); sources[row.Source]=true }
	}
	if a != nil && a.changes != nil {
		for _, e := range a.changes.eventsSnapshot(260) { row:=InvestigationTimelineEvent{ID:firstNonEmpty(e.ID,entityID("global-timeline",fmt.Sprintf("%d|change|%s",e.At,e.Path))),At:e.At,Source:"filesystem_change",Kind:e.Kind,Severity:e.Severity,Path:e.Path,Detail:e.Why}; rows=append(rows,row); sources[row.Source]=true }
	}
	if a != nil && a.incidents != nil {
		for _, in := range a.incidents.snapshot(true).Incidents { for _, e := range IncidentInvestigationTimeline(in) { rows=append(rows,e); sources[e.Source]=true } }
	}
	rows = NormalizeInvestigationTimeline(rows, globalTimelineLimit)
	sourceF:=strings.ToLower(strings.TrimSpace(r.URL.Query().Get("source"))); kindF:=strings.ToLower(strings.TrimSpace(r.URL.Query().Get("kind"))); severityF:=strings.ToLower(strings.TrimSpace(r.URL.Query().Get("severity"))); pathF:=normalizeEvidencePath(r.URL.Query().Get("path")); incidentF:=strings.TrimSpace(r.URL.Query().Get("incident")); since:=parseUnixFilter(r.URL.Query().Get("since")); until:=parseUnixFilter(r.URL.Query().Get("until"))
	filtered:=rows[:0]
	for _, e:=range rows { if sourceF!=""&&!strings.Contains(strings.ToLower(e.Source),sourceF){continue}; if kindF!=""&&!strings.Contains(strings.ToLower(e.Kind),kindF){continue}; if severityF!=""&&strings.ToLower(e.Severity)!=severityF{continue}; if pathF!=""&&normalizeEvidencePath(e.Path)!=pathF{continue}; if incidentF!=""&&e.IncidentID!=incidentF{continue}; if since>0&&e.At<since{continue}; if until>0&&e.At>until{continue}; filtered=append(filtered,e) }
	rows=filtered
	sourceList:=make([]string,0,len(sources)); for s:=range sources{sourceList=append(sourceList,s)}; sort.Strings(sourceList)
	return GlobalTimelineResponse{GeneratedAt:time.Now().UTC().Format(time.RFC3339),Events:rows,Count:len(rows),Sources:sourceList,Limitations:[]string{"Timeline includes bounded sources currently integrated with Sentinel; it is not a complete macOS audit log."},Note:"Global Timeline preserves source and evidence context. Temporal proximity alone does not establish causation."}
}

type ObjectStoryV2IncidentRef struct { StableID string `json:"stable_id"`; EpisodeID string `json:"episode_id"`; Severity string `json:"severity"`; Confidence int `json:"confidence"`; Title string `json:"title"`; FirstSeen int64 `json:"first_seen"`; LastSeen int64 `json:"last_seen"` }

type ObjectStoryV2 struct {
	GeneratedAt string `json:"generated_at"`
	Path string `json:"path"`
	Base ObjectStory `json:"base"`
	System *SystemObjectInspection `json:"system,omitempty"`
	Runtime InvestigationRuntimeContext `json:"runtime"`
	Incidents []ObjectStoryV2IncidentRef `json:"incidents,omitempty"`
	Timeline []InvestigationTimelineEvent `json:"timeline,omitempty"`
	FirstSeen int64 `json:"first_seen,omitempty"`
	LastSeen int64 `json:"last_seen,omitempty"`
	Unknowns []string `json:"unknowns,omitempty"`
	NextTargets []InvestigationNextTarget `json:"next_targets,omitempty"`
	Note string `json:"note"`
}

func incidentMentionsPath(in Incident, path string) bool { if normalizeEvidencePath(in.PrimaryPath)==path{return true}; for _,p:=range in.RelatedPaths{if normalizeEvidencePath(p)==path{return true}}; for _,e:=range in.Evidence{if normalizeEvidencePath(e.Path)==path{return true}}; return false }

func (a *app) objectStoryV2(ctx context.Context, raw string) (ObjectStoryV2,error) {
	path:=normalizeEvidencePath(raw); if path==""||!filepath.IsAbs(path){return ObjectStoryV2{},fmt.Errorf("absolute path required")}
	base,err:=a.fileStory(path); if err!=nil{return ObjectStoryV2{},err}
	out:=ObjectStoryV2{GeneratedAt:time.Now().UTC().Format(time.RFC3339),Path:path,Base:base,Runtime:buildInvestigationRuntimeContext(ctx,path),Note:"Object Story 2.0 combines current identity/runtime relationships with bounded historical evidence. Missing visibility remains unknown rather than being interpreted as safe."}
	if sys,inspectErr:=InspectSystemObject(ctx,path); inspectErr==nil{out.System=&sys}else{out.Unknowns=append(out.Unknowns,"system object inspection unavailable: "+inspectErr.Error())}
	if a!=nil&&a.incidents!=nil{for _,in:=range a.incidents.snapshot(true).Incidents{if !incidentMentionsPath(in,path){continue}; out.Incidents=append(out.Incidents,ObjectStoryV2IncidentRef{StableID:incidentEntityStableID(in),EpisodeID:in.ID,Severity:in.Severity,Confidence:in.Confidence,Title:in.Title,FirstSeen:in.CreatedAt,LastSeen:in.UpdatedAt}); for _,e:=range IncidentInvestigationTimeline(in){out.Timeline=append(out.Timeline,e)}}}
	if a!=nil&&a.changes!=nil{for _,e:=range a.changes.eventsSnapshot(220){if normalizeEvidencePath(e.Path)!=path{continue}; out.Timeline=append(out.Timeline,InvestigationTimelineEvent{ID:firstNonEmpty(e.ID,entityID("object-v2-event",fmt.Sprintf("%d|%s",e.At,path))),At:e.At,Source:"filesystem_change",Kind:e.Kind,Severity:e.Severity,Path:path,Detail:e.Why})}}
	out.Timeline=NormalizeInvestigationTimeline(out.Timeline,objectStoryV2TimelineLimit); if len(out.Timeline)>0{out.FirstSeen=out.Timeline[0].At; out.LastSeen=out.Timeline[len(out.Timeline)-1].At}
	out.NextTargets=append([]InvestigationNextTarget(nil),out.Runtime.NextTargets...)
	if len(out.Incidents)==0{out.Unknowns=append(out.Unknowns,"no currently retained incident evidence references this exact path")}
	if len(out.Timeline)==0{out.Unknowns=append(out.Unknowns,"no integrated retained timeline events were found for this exact path")}
	return out,nil
}

type VisibilitySourceV2 struct { ID string `json:"id"`; Category string `json:"category"`; Name string `json:"name"`; Status string `json:"status"`; Detail string `json:"detail"`; Impact string `json:"impact,omitempty"`; UserControlled bool `json:"user_controlled,omitempty"` }
type VisibilityCenterV2 struct { GeneratedAt string `json:"generated_at"`; Available int `json:"available"`; Limited int `json:"limited"`; Unavailable int `json:"unavailable"`; Sources []VisibilitySourceV2 `json:"sources"`; Note string `json:"note"` }

func (a *app) visibilityCenterV2() VisibilityCenterV2 {
	out:=VisibilityCenterV2{GeneratedAt:time.Now().UTC().Format(time.RFC3339),Note:"Visibility status describes Sentinel's evidence access, not the safety of the Mac. Full Disk Access is user-controlled and is not inferred as granted merely because no permission error was observed."}
	for _,c:=range collectCapabilities(){status:="available"; if !c.Available{status="unavailable"}; out.Sources=append(out.Sources,VisibilitySourceV2{ID:"command-"+c.Name,Category:"local_tool",Name:c.Name,Status:status,Detail:c.Purpose,Impact:map[bool]string{true:"Evidence source available.",false:"Related evidence may be absent or reduced."}[c.Available]})}
	out.Sources=append(out.Sources,VisibilitySourceV2{ID:"full-disk-access",Category:"permission",Name:"Full Disk Access",Status:"user_controlled",Detail:"macOS controls this permission in System Settings. Sentinel does not bypass or silently acquire it.",Impact:"Protected locations may be unavailable; absence of evidence there must not be treated as safety.",UserControlled:true})
	fsStatus:="limited"; fsDetail:="Bounded polling fallback is available."; if nativeFSEventsAvailable(){fsStatus="available";fsDetail="Native CoreServices FSEvents bridge is available."}; out.Sources=append(out.Sources,VisibilitySourceV2{ID:"filesystem-events",Category:"sensor",Name:"Filesystem Change Intelligence",Status:fsStatus,Detail:fsDetail,Impact:"A fallback can reduce event fidelity or timeliness."})
	adv:=advancedSensorStatus(); advStatus:="unavailable"; if adv.Available{advStatus="available"}; out.Sources=append(out.Sources,VisibilitySourceV2{ID:"endpoint-security",Category:"sensor",Name:"Endpoint Security",Status:advStatus,Detail:adv.Note,Impact:"Without an entitled system extension Sentinel relies on bounded local evidence rather than claiming full event-stream visibility."})
	if a!=nil&&a.changes!=nil{st:=a.changes.status(); status:="limited";if st.Running{status="available"}; out.Sources=append(out.Sources,VisibilitySourceV2{ID:"change-monitor-runtime",Category:"runtime",Name:"Change Monitor",Status:status,Detail:st.Mode,Impact:map[bool]string{true:"Change evidence is being collected within configured roots.",false:"No active change-monitor session; retained history may still exist."}[st.Running]})}
	for _,s:=range out.Sources{switch s.Status{case "available":out.Available++;case "unavailable":out.Unavailable++;default:out.Limited++}}
	return out
}

type CommandPaletteAction struct { Kind string `json:"kind"`; Label string `json:"label"`; Detail string `json:"detail,omitempty"`; Href string `json:"href"`; Score int `json:"score"` }
type CommandPaletteResponse struct { Query string `json:"query"`; Actions []CommandPaletteAction `json:"actions"`; Note string `json:"note"` }

func commandPaletteHref(kind,path string,pid int,view string) string {
	switch { case pid>0 && (kind=="process"||view=="processes"): return "/process-relations.html?pid="+strconv.Itoa(pid)
	case kind=="incident"||view=="incidents": return "/intelligence-center.html#incidents"
	case kind=="network"||view=="network": return "/network-relations.html"
	case kind=="startup"||view=="startup": return "/launch-services.html"
	case path!="": return "/investigation.html?path="+path
	default:return "/intelligence-center.html" }
}

func (a *app) commandPalette(raw string) CommandPaletteResponse {
	raw=strings.TrimSpace(raw); lower:=strings.ToLower(raw); out:=CommandPaletteResponse{Query:raw,Note:"Cmd+K resolves typed Sentinel navigation and bounded Power Search results; it never concatenates input into a shell command."}
	add:=func(x CommandPaletteAction){for _,old:=range out.Actions{if old.Href==x.Href&&old.Label==x.Label{return}};out.Actions=append(out.Actions,x)}
	if lower=="timeline"||strings.HasPrefix(lower,"timeline "){add(CommandPaletteAction{Kind:"navigation",Label:"Open Global Timeline",Detail:"Unified bounded evidence timeline",Href:"/intelligence-center.html#timeline",Score:1000})}
	if lower=="graph"||strings.HasPrefix(lower,"graph "){add(CommandPaletteAction{Kind:"navigation",Label:"Open Evidence Graph 2.0",Detail:"Typed nodes and relationships",Href:"/intelligence-center.html#graph",Score:1000})}
	if lower=="visibility"||strings.HasPrefix(lower,"permissions"){add(CommandPaletteAction{Kind:"navigation",Label:"Open Visibility & Permissions",Href:"/intelligence-center.html#visibility",Score:1000})}
	if lower=="incidents"||lower=="incident"{add(CommandPaletteAction{Kind:"navigation",Label:"Open Incident Intelligence 2.0",Href:"/intelligence-center.html#incidents",Score:1000})}
	if strings.HasPrefix(lower,"process "){if pid,err:=strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(lower,"process ")));err==nil&&pid>0{add(CommandPaletteAction{Kind:"process",Label:"Open PID "+strconv.Itoa(pid),Href:"/process-relations.html?pid="+strconv.Itoa(pid),Score:1100})}}
	if strings.HasPrefix(lower,"inspect "){p:=strings.TrimSpace(raw[len("inspect "):]);if filepath.IsAbs(p){add(CommandPaletteAction{Kind:"investigation",Label:"Investigate "+filepath.Base(p),Detail:p,Href:"/investigation.html?path="+p,Score:1100})}}
	if raw!=""{sr:=a.powerSearch(raw);for _,r:=range sr.Results{href:=commandPaletteHref(r.Kind,r.Path,r.PID,r.View);add(CommandPaletteAction{Kind:r.Kind,Label:r.Title,Detail:r.Subtitle,Href:href,Score:r.Score});if len(out.Actions)>=30{break}}}
	sort.SliceStable(out.Actions,func(i,j int)bool{if out.Actions[i].Score!=out.Actions[j].Score{return out.Actions[i].Score>out.Actions[j].Score};return out.Actions[i].Label<out.Actions[j].Label});if len(out.Actions)>30{out.Actions=out.Actions[:30]};return out
}

func (a *app) handleEvidenceGraphV2(w http.ResponseWriter,r *http.Request){if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return};writeJSON(w,http.StatusOK,filterGraphV2(a.buildEvidenceGraphV2(),r))}
func (a *app) handleIncidentIntelligenceV2(w http.ResponseWriter,r *http.Request){switch r.Method{case http.MethodGet:writeJSON(w,http.StatusOK,a.incidentV2Snapshot(r.URL.Query().Get("history")=="1"));case http.MethodPost:a.rebuildIncidents();writeJSON(w,http.StatusOK,a.incidentV2Snapshot(r.URL.Query().Get("history")=="1"));default:writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET or POST required"})}}
func (a *app) handleGlobalTimeline(w http.ResponseWriter,r *http.Request){if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return};writeJSON(w,http.StatusOK,a.globalTimeline(r))}
func (a *app) handleObjectStoryV2(w http.ResponseWriter,r *http.Request){if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return};out,err:=a.objectStoryV2(r.Context(),r.URL.Query().Get("path"));if err!=nil{writeJSON(w,http.StatusBadRequest,map[string]any{"error":err.Error()});return};writeJSON(w,http.StatusOK,out)}
func (a *app) handleVisibilityCenterV2(w http.ResponseWriter,r *http.Request){if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return};writeJSON(w,http.StatusOK,a.visibilityCenterV2())}
func (a *app) handleCommandPalette(w http.ResponseWriter,r *http.Request){if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return};writeJSON(w,http.StatusOK,a.commandPalette(r.URL.Query().Get("q")))}
