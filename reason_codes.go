// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"sort"
	"strings"
)

// ReasonCode is a deterministic explanation unit. A reason code explains why
// Sentinel asks the user to review an observation; it is not a malware verdict.
type ReasonCode struct {
	Code          string `json:"code"`
	Category      string `json:"category"`
	Direction     string `json:"direction"`
	Weight        int    `json:"weight"`
	Summary       string `json:"summary"`
	EvidenceCount int    `json:"evidence_count,omitempty"`
}

// IncidentExplanation separates direct observations from deterministic
// relationships, interpretation, and unknowns. This keeps evidence and
// conclusions visibly distinct in the API and future UI.
type IncidentExplanation struct {
	ObservedFacts        []string     `json:"observed_facts"`
	DerivedRelationships []string     `json:"derived_relationships"`
	Interpretation       []string     `json:"interpretation"`
	Unknowns             []string     `json:"unknowns"`
	ReasonCodes          []ReasonCode `json:"reason_codes"`
}

func appendUniqueString(dst []string, value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return dst
	}
	for _, existing := range dst {
		if existing == value {
			return dst
		}
	}
	return append(dst, value)
}

func BuildIncidentExplanation(in Incident) IncidentExplanation {
	out := IncidentExplanation{}
	sources := map[string]int{}
	high, review := 0, 0

	for _, e := range in.Evidence {
		source := strings.ToLower(strings.TrimSpace(e.Source))
		if source == "" {
			source = "unknown"
		}
		sources[source]++

		fact := fmt.Sprintf("%s:%s", source, firstNonEmpty(strings.TrimSpace(e.Kind), "observation"))
		if e.Path != "" {
			fact += " · " + e.Path
		}
		if e.Detail != "" {
			fact += " · " + e.Detail
		}
		out.ObservedFacts = appendUniqueString(out.ObservedFacts, fact)

		switch strings.ToLower(e.Severity) {
		case "high":
			high++
		case "review":
			review++
		}
	}

	addReason := func(code, category, direction string, weight, count int, summary string) {
		if count <= 0 {
			return
		}
		out.ReasonCodes = append(out.ReasonCodes, ReasonCode{
			Code: code, Category: category, Direction: direction,
			Weight: weight, Summary: summary, EvidenceCount: count,
		})
	}

	if len(sources) >= 2 {
		out.DerivedRelationships = append(out.DerivedRelationships,
			fmt.Sprintf("%d independent Sentinel evidence sources refer to the same incident story.", len(sources)))
		addReason("multi_source_correlation", "correlation", "increase", 20, len(sources), "Multiple evidence sources correlate to one story.")
	} else if len(sources) == 1 {
		addReason("single_source_context", "correlation", "decrease", -10, 1, "Only one evidence source currently contributes context.")
	}

	if n := sources["persistence"]; n > 0 {
		out.DerivedRelationships = append(out.DerivedRelationships, "Persistence evidence is part of the correlated story.")
		addReason("persistence_observed", "persistence", "increase", 25, n, "A persistence-related change was observed.")
	}
	if n := sources["behavior"]; n > 0 {
		out.DerivedRelationships = append(out.DerivedRelationships, "Behavior history changed for a related object.")
		addReason("behavior_change", "behavior", "increase", 15, n, "A related behavior baseline changed.")
	}
	if n := sources["trust"]; n > 0 {
		out.DerivedRelationships = append(out.DerivedRelationships, "Trusted Profile evidence changed for a related object.")
		addReason("trust_drift", "trust", "increase", 15, n, "A related Trusted Profile changed.")
	}
	if n := sources["filesystem"]; n > 0 {
		addReason("filesystem_activity", "filesystem", "increase", 5, n, "Related filesystem activity was observed.")
	}
	addReason("high_severity_evidence", "evidence", "increase", 20, high, "One or more contributing observations were marked high attention.")
	addReason("review_severity_evidence", "evidence", "increase", 10, review, "One or more contributing observations were marked for review.")

	if len(out.ReasonCodes) > 0 {
		out.Interpretation = append(out.Interpretation,
			"The combined evidence is worth reviewing because the reason codes above are present.")
	} else {
		out.Interpretation = append(out.Interpretation,
			"Sentinel has limited evidence for this story and should not infer intent from absence of signals.")
	}
	if len(sources) >= 2 {
		out.Interpretation = append(out.Interpretation,
			"Cross-source agreement increases relationship confidence, but does not establish malicious intent.")
	}

	out.Unknowns = []string{
		"Malware identity is not established by correlation alone.",
		"Malicious intent is not established by correlation alone.",
		"Evidence unavailable because of permissions or source limitations may reduce visibility.",
	}

	sort.Slice(out.ReasonCodes, func(i, j int) bool {
		if out.ReasonCodes[i].Code != out.ReasonCodes[j].Code {
			return out.ReasonCodes[i].Code < out.ReasonCodes[j].Code
		}
		return out.ReasonCodes[i].Summary < out.ReasonCodes[j].Summary
	})
	return out
}
