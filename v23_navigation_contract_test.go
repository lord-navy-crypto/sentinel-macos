// SPDX-License-Identifier: MPL-2.0
package main

import(
 "os"
 "strings"
 "testing"
)

func TestV23NavigationLoadedAcrossCoreWorkspaces(t *testing.T){
 pages:=[]string{"web/intelligence-center.html","web/investigation.html","web/control-plane.html","web/system-console.html","web/process-relations.html","web/network-relations.html","web/launch-services.html","web/vault-health.html"}
 for _,p:=range pages{raw,err:=os.ReadFile(p);if err!=nil{t.Fatal(err)};s:=string(raw);if !strings.Contains(s,"/v23-navigation.css")||!strings.Contains(s,"/v23-navigation.js"){t.Fatalf("%s missing normalized navigation assets",p)}}
}
func TestV23NavigationPreservesTokenAndModes(t *testing.T){
 raw,err:=os.ReadFile("web/v23-navigation.js");if err!=nil{t.Fatal(err)};s:=string(raw)
 for _,want:=range []string{"Easy","Investigate","Advanced","Recover","token","control-plane.html","intelligence-center.html","vault-health.html"}{if !strings.Contains(s,want){t.Fatalf("navigation missing %q",want)}}
 for _,bad:=range []string{"innerHTML","eval(","new Function","document.write"}{if strings.Contains(s,bad){t.Fatalf("unsafe navigation pattern %q",bad)}}
}
