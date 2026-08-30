// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	incidentExportSchemaV23 = 1
	investigationBundleSchemaV23 = 1
	investigationBundleBranchLimit = 24
	investigationBundleInspectionLimit = 12
)

type IncidentExportV23 struct {
	Schema int `json:"schema"`
	ExportedAt string `json:"exported_at"`
	StableID string `json:"stable_id"`
	EpisodeID string `json:"episode_id"`
	Incident Incident `json:"incident"`
	Explanation IncidentExplanation `json:"explanation"`
	Timeline []InvestigationTimelineEvent `json:"timeline"`
	Privacy string `json:"privacy"`
	Limitations []string `json:"limitations,omitempty"`
}

type InvestigationBundleBranchV23 struct {
	Path string `json:"path"`
	ParentPath string `json:"parent_path,omitempty"`
	Kind string `json:"kind,omitempty"`
	Note string `json:"note,omitempty"`
	Bookmarked bool `json:"bookmarked"`
	FirstVisited string `json:"first_visited"`
	LastVisited string `json:"last_visited"`
	VisitCount int `json:"visit_count"`
	Integrity *IntegrityInspection `json:"integrity,omitempty"`
}

type InvestigationBundleV23 struct {
	Schema int `json:"schema"`
	ExportedAt string `json:"exported_at"`
	SessionID string `json:"session_id"`
	Title string `json:"title"`
	RootPath string `json:"root_path"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
	Branches []InvestigationBundleBranchV23 `json:"branches"`
	Truncated bool `json:"truncated"`
	Privacy string `json:"privacy"`
	Limitations []string `json:"limitations,omitempty"`
}

func (m *investigationSessionManager) find(id string)(InvestigationSession,bool){
	if m==nil{return InvestigationSession{},false};id=strings.TrimSpace(id);if id==""{return InvestigationSession{},false}
	m.mu.RLock();defer m.mu.RUnlock();for _,s:=range m.sessions{if s.ID==id{return cloneInvestigationSession(s),true}};return InvestigationSession{},false
}

func buildIncidentExportV23(in Incident) IncidentExportV23 {
	in=normalizeLoadedIncident(in)
	return IncidentExportV23{Schema:incidentExportSchemaV23,ExportedAt:time.Now().UTC().Format(time.RFC3339),StableID:incidentEntityStableID(in),EpisodeID:in.ID,Incident:in,Explanation:BuildIncidentExplanation(in),Timeline:IncidentInvestigationTimeline(in),Privacy:"Metadata/evidence export only. Sentinel does not attach or copy the investigated file, packet contents, credentials, browser data, or raw Terminal output.",Limitations:[]string{"Evidence reflects bounded Sentinel visibility and retained history; absence of evidence is not proof of safety."}}
}

func buildInvestigationBundleV23(session InvestigationSession) InvestigationBundleV23 {
	out:=InvestigationBundleV23{Schema:investigationBundleSchemaV23,ExportedAt:time.Now().UTC().Format(time.RFC3339),SessionID:session.ID,Title:session.Title,RootPath:session.RootPath,CreatedAt:session.CreatedAt,UpdatedAt:session.UpdatedAt,Privacy:"Bundle contains paths, branch metadata/notes/bookmarks and bounded integrity metadata only. Investigated file contents are never copied into the export.",Limitations:[]string{"Integrity reinspection is bounded and may be unavailable for objects that no longer exist or cannot be read."}}
	branches:=append([]InvestigationSessionBranch(nil),session.Branches...)
	sort.SliceStable(branches,func(i,j int)bool{if branches[i].Bookmarked!=branches[j].Bookmarked{return branches[i].Bookmarked};return branches[i].LastVisited>branches[j].LastVisited})
	if len(branches)>investigationBundleBranchLimit{branches=branches[:investigationBundleBranchLimit];out.Truncated=true;out.Limitations=append(out.Limitations,fmt.Sprintf("branches bounded to %d",investigationBundleBranchLimit))}
	inspectionBudget:=investigationBundleInspectionLimit
	for _,b:=range branches{
		row:=InvestigationBundleBranchV23{Path:b.Path,ParentPath:b.ParentPath,Kind:b.Kind,Note:b.Note,Bookmarked:b.Bookmarked,FirstVisited:b.FirstVisited,LastVisited:b.LastVisited,VisitCount:b.VisitCount}
		if inspectionBudget>0&&filepath.IsAbs(b.Path){inspection:=inspectIntegrity(b.Path);row.Integrity=&inspection;inspectionBudget--}
		out.Branches=append(out.Branches,row)
	}
	if len(branches)>inspectionBudget&&inspectionBudget==0{out.Limitations=append(out.Limitations,fmt.Sprintf("integrity reinspection bounded to %d branches",investigationBundleInspectionLimit))}
	return out
}

func exportFilename(prefix,id string)string{id=strings.TrimSpace(id);if len(id)>20{id=id[:20]};id=strings.Map(func(r rune)rune{if r>='a'&&r<='z'||r>='A'&&r<='Z'||r>='0'&&r<='9'||r=='-'||r=='_'{return r};return '-'},id);return prefix+"-"+id+".json"}

func (a *app) handleIncidentExportV23(w http.ResponseWriter,r *http.Request){
	if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return}
	if a==nil||a.incidents==nil{writeJSON(w,http.StatusServiceUnavailable,map[string]any{"error":"incident manager unavailable"});return}
	in,ok:=a.incidents.find(strings.TrimSpace(r.URL.Query().Get("id")));if !ok{writeJSON(w,http.StatusNotFound,map[string]any{"error":"incident not found"});return}
	w.Header().Set("Content-Disposition",fmt.Sprintf("attachment; filename=%q",exportFilename("sentinel-incident",in.ID)))
	writeJSON(w,http.StatusOK,buildIncidentExportV23(in))
}

func (a *app) handleInvestigationBundleExportV23(w http.ResponseWriter,r *http.Request){
	if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return}
	m:=investigationSessionsFor(a!=nil&&a.ephemeral);session,ok:=m.find(r.URL.Query().Get("session"));if !ok{writeJSON(w,http.StatusNotFound,map[string]any{"error":"investigation session not found"});return}
	w.Header().Set("Content-Disposition",fmt.Sprintf("attachment; filename=%q",exportFilename("sentinel-investigation",session.ID)))
	writeJSON(w,http.StatusOK,buildInvestigationBundleV23(session))
}
