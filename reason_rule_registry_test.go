// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestReasonCodeRegistryValidAndCoversGeneratedCodes(t *testing.T){
	reg:=ReasonCodeRegistry();if err:=ValidateReasonCodeRegistry(reg);err!=nil{t.Fatal(err)}
	in:=Incident{Evidence:[]IncidentEvidence{{Source:"persistence",Kind:"changed",Severity:"review",Path:"/tmp/A",Detail:"x"},{Source:"system_console",Kind:"gatekeeper_rejected",Severity:"review",Path:"/tmp/A",Detail:"y"},{Source:"trust",Kind:"changed",Severity:"high",Path:"/tmp/A",Detail:"z"}}}
	for _,r:=range BuildIncidentExplanation(in).ReasonCodes{if !ReasonCodeDefined(r.Code){t.Fatalf("generated reason code missing from registry: %q",r.Code)}}
}

func TestDefaultIncidentRuleRegistryReferencesRegisteredReasons(t *testing.T){
	reg:=DefaultIncidentRuleRegistry();if err:=ValidateIncidentRuleRegistry(reg);err!=nil{t.Fatal(err)}
	if reg.Version!=IncidentRuleRegistryVersion||len(reg.Rules)<3{t.Fatalf("registry=%+v",reg)}
}

func TestReasonRegistryRejectsDuplicateCode(t *testing.T){
	reg:=ReasonCodeRegistry();reg.Definitions=append(reg.Definitions,reg.Definitions[0]);if err:=ValidateReasonCodeRegistry(reg);err==nil{t.Fatal("duplicate reason code should fail")}
}
