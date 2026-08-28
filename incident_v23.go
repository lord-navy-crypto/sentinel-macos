// SPDX-License-Identifier: MPL-2.0
package main

// IncidentV23View is the non-destructive v2.3 representation used while the
// branch evolves. It wraps the existing Incident contract instead of breaking
// v2.2 clients, and adds the explainability and timeline layers required by the
// new investigation UI.
type IncidentV23View struct {
	Incident    Incident            `json:"incident"`
	Timeline    []TimelineEvent     `json:"timeline"`
	Explanation IncidentExplanation `json:"explanation"`
}

func EnrichIncidentV23(in Incident) IncidentV23View {
	return IncidentV23View{
		Incident: in,
		Timeline: IncidentTimeline(in),
		Explanation: BuildIncidentExplanation(in),
	}
}
