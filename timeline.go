// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"sort"
)

const investigationTimelineEventLimit = 500

// InvestigationTimelineEvent is the v2.3 cross-source timeline record. It is
// intentionally distinct from the legacy TimelineEvent used by Evidence Graph
// and Object Story so the v2.2 API remains source-compatible.
type InvestigationTimelineEvent struct {
	ID         string `json:"id"`
	At         int64  `json:"at"`
	Source     string `json:"source"`
	Kind       string `json:"kind"`
	Severity   string `json:"severity"`
	Path       string `json:"path,omitempty"`
	Detail     string `json:"detail,omitempty"`
	IncidentID string `json:"incident_id,omitempty"`
}

func investigationTimelineEventKey(e InvestigationTimelineEvent) string {
	return fmt.Sprintf("%d|%s|%s|%s|%s|%s|%s", e.At, e.Source, e.Kind, e.Severity, e.Path, e.Detail, e.IncidentID)
}

func IncidentInvestigationTimeline(in Incident) []InvestigationTimelineEvent {
	out := make([]InvestigationTimelineEvent, 0, len(in.Evidence))
	for _, ev := range in.Evidence {
		row := InvestigationTimelineEvent{
			At: ev.At, Source: ev.Source, Kind: ev.Kind, Severity: ev.Severity,
			Path: ev.Path, Detail: ev.Detail, IncidentID: in.ID,
		}
		row.ID = entityID("investigation-timeline-event", investigationTimelineEventKey(row))
		out = append(out, row)
	}
	return NormalizeInvestigationTimeline(out, investigationTimelineEventLimit)
}

func NormalizeInvestigationTimeline(rows []InvestigationTimelineEvent, limit int) []InvestigationTimelineEvent {
	if limit <= 0 {
		limit = investigationTimelineEventLimit
	}
	seen := map[string]bool{}
	out := make([]InvestigationTimelineEvent, 0, len(rows))
	for _, row := range rows {
		key := investigationTimelineEventKey(row)
		if seen[key] {
			continue
		}
		seen[key] = true
		if row.ID == "" {
			row.ID = entityID("investigation-timeline-event", key)
		}
		out = append(out, row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].At != out[j].At {
			return out[i].At < out[j].At
		}
		if out[i].Source != out[j].Source {
			return out[i].Source < out[j].Source
		}
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind
		}
		if out[i].Path != out[j].Path {
			return out[i].Path < out[j].Path
		}
		return out[i].ID < out[j].ID
	})
	if len(out) > limit {
		out = append([]InvestigationTimelineEvent(nil), out[len(out)-limit:]...)
	}
	return out
}

func MergeInvestigationTimelines(groups ...[]InvestigationTimelineEvent) []InvestigationTimelineEvent {
	var all []InvestigationTimelineEvent
	for _, group := range groups {
		all = append(all, group...)
	}
	return NormalizeInvestigationTimeline(all, investigationTimelineEventLimit)
}
