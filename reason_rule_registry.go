// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"sort"
	"strings"
)

const (
	ReasonCodeRegistryVersion = 1
	IncidentRuleRegistryVersion = 1
)

type ReasonCodeDefinition struct {
	Code string `json:"code"`
	Category string `json:"category"`
	Direction string `json:"direction"`
	DefaultWeight int `json:"default_weight"`
	Summary string `json:"summary"`
}

type ReasonCodeRegistryV23 struct {
	Version int `json:"version"`
	Definitions []ReasonCodeDefinition `json:"definitions"`
}

type IncidentRuleRegistryV23 struct {
	Version int `json:"version"`
	Rules []IncidentRule `json:"rules"`
	Note string `json:"note"`
}

func ReasonCodeRegistry() ReasonCodeRegistryV23 {
	rows:=[]ReasonCodeDefinition{
		{Code:"behavior_change",Category:"behavior",Direction:"increase",DefaultWeight:15,Summary:"A related behavior baseline changed."},
		{Code:"code_signing_unverified",Category:"integrity",Direction:"increase",DefaultWeight:20,Summary:"Code-signing inspection returned a reviewable result."},
		{Code:"filesystem_activity",Category:"filesystem",Direction:"increase",DefaultWeight:5,Summary:"Related filesystem activity was observed."},
		{Code:"gatekeeper_rejected",Category:"integrity",Direction:"increase",DefaultWeight:25,Summary:"Gatekeeper returned rejected/reviewable evidence."},
		{Code:"high_severity_evidence",Category:"evidence",Direction:"increase",DefaultWeight:20,Summary:"One or more contributing observations were high attention."},
		{Code:"multi_source_correlation",Category:"correlation",Direction:"increase",DefaultWeight:20,Summary:"Multiple evidence sources correlate to one story."},
		{Code:"persistence_observed",Category:"persistence",Direction:"increase",DefaultWeight:25,Summary:"A persistence-related change was observed."},
		{Code:"review_severity_evidence",Category:"evidence",Direction:"increase",DefaultWeight:10,Summary:"One or more contributing observations were marked for review."},
		{Code:"single_source_context",Category:"correlation",Direction:"decrease",DefaultWeight:-10,Summary:"Only one evidence source currently contributes context."},
		{Code:"system_console_evidence",Category:"system",Direction:"increase",DefaultWeight:8,Summary:"A bounded typed macOS evidence query contributed review context."},
		{Code:"trust_drift",Category:"trust",Direction:"increase",DefaultWeight:15,Summary:"A related Trusted Profile changed."},
	}
	sort.Slice(rows,func(i,j int)bool{return rows[i].Code<rows[j].Code})
	return ReasonCodeRegistryV23{Version:ReasonCodeRegistryVersion,Definitions:rows}
}

func ValidateReasonCodeRegistry(reg ReasonCodeRegistryV23) error {
	if reg.Version<=0{return fmt.Errorf("reason-code registry version is required")}
	seen:=map[string]bool{}
	for _,d:=range reg.Definitions{
		code:=strings.TrimSpace(d.Code);if code==""{return fmt.Errorf("reason-code definition has empty code")};if seen[code]{return fmt.Errorf("duplicate reason code %q",code)};seen[code]=true
		if d.Category==""||d.Direction==""||d.Summary==""{return fmt.Errorf("reason code %q is incomplete",code)}
		if d.Direction!="increase"&&d.Direction!="decrease"&&d.Direction!="neutral"{return fmt.Errorf("reason code %q has invalid direction",code)}
	}
	return nil
}

func ReasonCodeDefined(code string) bool { code=strings.TrimSpace(code);for _,d:=range ReasonCodeRegistry().Definitions{if d.Code==code{return true}};return false }

func DefaultIncidentRuleRegistry() IncidentRuleRegistryV23 {
	return IncidentRuleRegistryV23{Version:IncidentRuleRegistryVersion,Rules:[]IncidentRule{
		{ID:"rule.persistence-cross-source-review.v1",Title:"Persistence plus independent evidence",Enabled:true,RequireSources:[]string{"persistence"},RequireReasons:[]string{"multi_source_correlation"},MinSeverity:"review",Guidance:"Review the launch configuration and target executable together before taking any Safe Action."},
		{ID:"rule.gatekeeper-object-review.v1",Title:"Gatekeeper object review",Enabled:true,RequireReasons:[]string{"gatekeeper_rejected"},MinSeverity:"review",Guidance:"Inspect signing, quarantine provenance, and Object Story before deciding whether the object requires action."},
		{ID:"rule.signing-object-review.v1",Title:"Code-signing object review",Enabled:true,RequireReasons:[]string{"code_signing_unverified"},MinSeverity:"review",Guidance:"Reinspect code identity and corroborate with independent evidence; an unverifiable signature alone is not a malware verdict."},
		{ID:"rule.trust-behavior-correlation.v1",Title:"Trusted Profile and behavior both changed",Enabled:true,RequireReasons:[]string{"trust_drift","behavior_change"},MinConfidence:50,Guidance:"Compare the object timeline and current identity against the user-approved Trusted Profile."},
	},Note:"Versioned rules are deterministic review guidance only. Rules reference registered reason codes/evidence and cannot execute Safe Actions."}
}

func ValidateIncidentRuleRegistry(reg IncidentRuleRegistryV23) error {
	if reg.Version<=0{return fmt.Errorf("rule registry version is required")}
	seen:=map[string]bool{}
	for _,r:=range reg.Rules{
		id:=strings.TrimSpace(r.ID);if id==""{return fmt.Errorf("rule has empty ID")};if seen[id]{return fmt.Errorf("duplicate rule ID %q",id)};seen[id]=true
		for _,reason:=range r.RequireReasons{if !ReasonCodeDefined(reason){return fmt.Errorf("rule %q references unknown reason code %q",id,reason)}}
	}
	return nil
}
