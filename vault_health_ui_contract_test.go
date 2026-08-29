// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestVaultHealthUIUsesRecoveryReadAPIsOnly(t *testing.T){
	html,err:=os.ReadFile("web/vault-health.html");if err!=nil{t.Fatal(err)}
	js,err:=os.ReadFile("web/vault-health.js");if err!=nil{t.Fatal(err)}
	all:=string(html)+"\n"+string(js)
	for _,want:=range []string{"/api/actions/health","/api/actions/vault","/api/actions/vault/isolation","/api/actions/journal","Post-action observation","Live isolation verification","Fully Contained","Partially Contained","Isolation Failed","Investigate source","Investigate destination"}{if !strings.Contains(all,want){t.Fatalf("Vault Health missing %q",want)}}
	for _,forbidden:=range []string{"innerHTML","eval(","new Function","document.write","/api/actions/execute","permanent delete","rm -","sudo "}{if strings.Contains(all,forbidden){t.Fatalf("unsafe Vault Health pattern %q",forbidden)}}
}
