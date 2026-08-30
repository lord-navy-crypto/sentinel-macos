// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"strconv"
	"strings"
)

type GroupedGlobalTimelineResponse struct {
	GeneratedAt string                       `json:"generated_at"`
	Groups      []InvestigationTimelineGroup `json:"groups"`
	GroupCount  int                          `json:"group_count"`
	EventCount  int                          `json:"event_count"`
	Sources     []string                     `json:"sources"`
	Limitations []string                     `json:"limitations,omitempty"`
	Note        string                       `json:"note"`
}

func (a *app) groupedGlobalTimeline(r *http.Request) GroupedGlobalTimelineResponse {
	base:=a.globalTimeline(r)
	window:=investigationTimelineGroupWindow
	if raw:=strings.TrimSpace(r.URL.Query().Get("window"));raw!=""{if n,err:=strconv.ParseInt(raw,10,64);err==nil&&n>=10&&n<=600{window=n}}
	groups:=GroupInvestigationTimeline(base.Events,window,investigationTimelineGroupLimit)
	return GroupedGlobalTimelineResponse{GeneratedAt:base.GeneratedAt,Groups:groups,GroupCount:len(groups),EventCount:len(base.Events),Sources:base.Sources,Limitations:append(base.Limitations,"Grouping only collapses identical evidence fingerprints inside the selected bounded time window; raw Global Timeline remains authoritative and expandable."),Note:"Grouped Timeline is a presentation layer over raw retained evidence. Count indicates repeated observations, not increased malware probability."}
}

func (a *app) handleGroupedGlobalTimeline(w http.ResponseWriter,r *http.Request){
	if r.Method!=http.MethodGet{writeJSON(w,http.StatusMethodNotAllowed,map[string]any{"error":"GET required"});return}
	writeJSON(w,http.StatusOK,a.groupedGlobalTimeline(r))
}
