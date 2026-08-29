// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"sort"
	"strings"
)

// IncidentRule is intentionally deterministic and read-only. Rules may ask for
// review or add context, but they do not declare malware and cannot execute an
// action.
type IncidentRule struct {
	ID             string   `json:"id"`
	Title          string   `json:"title"`
	Enabled        bool     `json:"enabled"`
	RequireSources []string `json:"require_sources,omitempty"`
	RequireReasons []string `json:"require_reasons,omitempty"`
	MinConfidence  int      `json:"min_confidence,omitempty"`
	MinSeverity    string   `json:"min_severity,omitempty"`
	Guidance       string   `json:"guidance"`
}

type IncidentRuleMatch struct {
	RuleID        string   `json:"rule_id"`
	Title         string   `json:"title"`
	Matched       bool     `json:"matched"`
	MatchedInputs []string `json:"matched_inputs,omitempty"`
	MissingInputs []string `json:"missing_inputs,omitempty"`
	Guidance      string   `json:"guidance,omitempty"`
	Note          string   `json:"note"`
}

func incidentSeverityLevel(s string) int {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "high":
		return 3
	case "review":
		return 2
	case "info":
		return 1
	default:
		return 0
	}
}

func EvaluateIncidentRule(rule IncidentRule, view IncidentV23View) IncidentRuleMatch {
	out := IncidentRuleMatch{
		RuleID: rule.ID,
		Title: rule.Title,
		Guidance: rule.Guidance,
		Note: "Rule matches are deterministic review guidance. A match is not a malware verdict and cannot execute Safe Actions.",
	}
	if !rule.Enabled {
		out.MissingInputs = []string{"rule_disabled"}
		return out
	}

	sources := map[string]bool{}
	for _, source := range view.Incident.Sources {
		sources[strings.ToLower(strings.TrimSpace(source))] = true
	}
	for _, ev := range view.Incident.Evidence {
		sources[strings.ToLower(strings.TrimSpace(ev.Source))] = true
	}
	reasons := map[string]bool{}
	for _, reason := range view.Explanation.ReasonCodes {
		reasons[strings.ToLower(strings.TrimSpace(reason.Code))] = true
	}

	for _, source := range rule.RequireSources {
		key := strings.ToLower(strings.TrimSpace(source))
		if key == "" {
			continue
		}
		if sources[key] {
			out.MatchedInputs = append(out.MatchedInputs, "source:"+key)
		} else {
			out.MissingInputs = append(out.MissingInputs, "source:"+key)
		}
	}
	for _, reason := range rule.RequireReasons {
		key := strings.ToLower(strings.TrimSpace(reason))
		if key == "" {
			continue
		}
		if reasons[key] {
			out.MatchedInputs = append(out.MatchedInputs, "reason:"+key)
		} else {
			out.MissingInputs = append(out.MissingInputs, "reason:"+key)
		}
	}
	if rule.MinConfidence > 0 {
		if view.Incident.Confidence >= rule.MinConfidence {
			out.MatchedInputs = append(out.MatchedInputs, fmt.Sprintf("confidence>=%d", rule.MinConfidence))
		} else {
			out.MissingInputs = append(out.MissingInputs, fmt.Sprintf("confidence>=%d", rule.MinConfidence))
		}
	}
	if strings.TrimSpace(rule.MinSeverity) != "" {
		need := incidentSeverityLevel(rule.MinSeverity)
		if incidentSeverityLevel(view.Incident.Severity) >= need {
			out.MatchedInputs = append(out.MatchedInputs, "severity>="+strings.ToLower(rule.MinSeverity))
		} else {
			out.MissingInputs = append(out.MissingInputs, "severity>="+strings.ToLower(rule.MinSeverity))
		}
	}

	sort.Strings(out.MatchedInputs)
	sort.Strings(out.MissingInputs)
	out.Matched = len(out.MissingInputs) == 0
	return out
}

func EvaluateIncidentRules(rules []IncidentRule, in Incident) []IncidentRuleMatch {
	view := EnrichIncidentV23(in)
	out := make([]IncidentRuleMatch, 0, len(rules))
	for _, rule := range rules {
		match := EvaluateIncidentRule(rule, view)
		if match.Matched {
			out = append(out, match)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].RuleID != out[j].RuleID {
			return out[i].RuleID < out[j].RuleID
		}
		return out[i].Title < out[j].Title
	})
	return out
}
