// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"sort"
)

const timelineEventLimit = 500

type TimelineEvent struct {
	ID         string `json:"id"`
	At         int64  `json:"at"`
	Source     string `json:"source"`
	Kind       string `json:"kind"`
	Severity   string `json:"severity"`
	Path       string `json:"path,omitempty"`
	Detail     string `json:"detail,omitempty"`
	IncidentID string `json:"incident_id,omitempty"`
}

func timelineEventKey(e TimelineEvent) string {
	return fmt.Sprintf("%d|%s|%s|%s|%s|%s|%s", e.At, e.Source, e.Kind, e.Severity, e.Path, e.Detail, e.IncidentID)
}

func IncidentTimeline(in Incident) []TimelineEvent {
	out := make([]TimelineEvent, 0, len(in.Evidence))
	for _, ev := range in.Evidence {
		row := TimelineEvent{
			At: ev.At, Source: ev.Source, Kind: ev.Kind, Severity: ev.Severity,
			Path: ev.Path, Detail: ev.Detail, IncidentID: in.ID,
		}
		row.ID = entityID("timeline-event", timelineEventKey(row))
		out = append(out, row)
	}
	return NormalizeTimeline(out, timelineEventLimit)
}

func NormalizeTimeline(rows []TimelineEvent, limit int) []TimelineEvent {
	if limit <= 0 {
		limit = timelineEventLimit
	}
	seen := map[string]bool{}
	out := make([]TimelineEvent, 0, len(rows))
	for _, row := range rows {
		key := timelineEventKey(row)
		if seen[key] {
			continue
		}
		seen[key] = true
		if row.ID == "" {
			row.ID = entityID("timeline-event", key)
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
		out = append([]TimelineEvent(nil), out[len(out)-limit:]...)
	}
	return out
}

func MergeTimelines(groups ...[]TimelineEvent) []TimelineEvent {
	var all []TimelineEvent
	for _, group := range groups {
		all = append(all, group...)
	}
	return NormalizeTimeline(all, timelineEventLimit)
}
