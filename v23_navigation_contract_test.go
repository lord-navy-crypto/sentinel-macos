// SPDX-License-Identifier: MPL-2.0
package main

import(
 "os"
 "strings"
 "testing"
)

func TestV23NavigationLoadedAcrossCoreWorkspaces(t *testing.T){
 pages:=[]string{
  "web/easy.html","web/security-center.html","web/system-center.html","web/storage-center.html",
  "web/intelligence-center.html","web/investigation.html","web/control-plane.html","web/system-console.html",
  "web/process-relations.html","web/network-relations.html","web/launch-services.html","web/vault-health.html",
 }
 for _,p:=range pages{raw,err:=os.ReadFile(p);if err!=nil{t.Fatal(err)};s:=string(raw);if !strings.Contains(s,"/v23-navigation.css")||!strings.Contains(s,"/v23-navigation.js"){t.Fatalf("%s missing normalized navigation assets",p)}}
}
func TestV23NavigationPreservesTokenAndFocusedWorkspaces(t *testing.T){
 raw,err:=os.ReadFile("web/v23-navigation.js");if err!=nil{t.Fatal(err)};s:=string(raw)
 for _,want:=range []string{"Easy","Security","Investigate","System","Processes","Network","Startup","Storage","Advanced","Recover","Terminal","token","easy.html","security-center.html","system-center.html","storage-center.html","intelligence-center.html","vault-health.html"}{if !strings.Contains(s,want){t.Fatalf("navigation missing %q",want)}}
 if strings.Contains(s,"['Easy', `/${hash}")||strings.Contains(s,"['Easy', `/`"){t.Fatalf("Easy must not route back to the legacy root dashboard")}
 for _,bad:=range []string{"innerHTML","eval(","new Function","document.write"}{if strings.Contains(s,bad){t.Fatalf("unsafe navigation pattern %q",bad)}}
}
func TestFocusedWorkspacePagesStaySmallAndSafe(t *testing.T){
 pages:=[]string{"web/easy.html","web/security-center.html","web/system-center.html","web/storage-center.html"}
 for _,p:=range pages{raw,err:=os.ReadFile(p);if err!=nil{t.Fatal(err)};s:=string(raw);for _,bad:=range []string{"<aside class=\"sidebar\"","Sentinel 2.2 · Desktop Conversion","innerHTML","eval(","new Function","document.write"}{if strings.Contains(s,bad){t.Fatalf("%s contains legacy/unsafe pattern %q",p,bad)}}}
 scripts:=[]string{"web/easy.js","web/workspace-centers.js"}
 for _,p:=range scripts{raw,err:=os.ReadFile(p);if err!=nil{t.Fatal(err)};s:=string(raw);for _,bad:=range []string{"innerHTML","eval(","new Function","document.write"}{if strings.Contains(s,bad){t.Fatalf("%s contains unsafe pattern %q",p,bad)}}}
}
