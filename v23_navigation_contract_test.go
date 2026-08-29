// SPDX-License-Identifier: MPL-2.0
package main

import(
 "os"
 "strings"
 "testing"
)

func TestV23NavigationLoadedAcrossCoreWorkspaces(t *testing.T){
 pages:=[]string{
  "web/easy.html","web/scan-center.html","web/compare-center.html","web/security-center.html","web/system-center.html","web/storage-center.html",
  "web/intelligence-center.html","web/investigation.html","web/control-plane.html","web/system-console.html",
  "web/process-relations.html","web/network-relations.html","web/launch-services.html","web/vault-health.html",
 }
 for _,p:=range pages{raw,err:=os.ReadFile(p);if err!=nil{t.Fatal(err)};s:=string(raw);if !strings.Contains(s,"/v23-navigation.css")||!strings.Contains(s,"/v23-navigation.js"){t.Fatalf("%s missing normalized navigation assets",p)}}
}
func TestV23NavigationPreservesTokenAndFocusedWorkspaces(t *testing.T){
 raw,err:=os.ReadFile("web/v23-navigation.js");if err!=nil{t.Fatal(err)};s:=string(raw)
 for _,want:=range []string{"Easy","Scan","Compare","Security","Investigate","System","Processes","Network","Startup","Storage","Advanced","Recover","Terminal","Alpha","token","easy.html","scan-center.html","compare-center.html","security-center.html","system-center.html","storage-center.html","intelligence-center.html","vault-health.html"}{if !strings.Contains(s,want){t.Fatalf("navigation missing %q",want)}}
 if strings.Contains(s,"['Easy', `/${hash}`"){t.Fatalf("Easy must not route back to the legacy root dashboard")}
 for _,bad:=range []string{"innerHTML","eval(","new Function","document.write"}{if strings.Contains(s,bad){t.Fatalf("unsafe navigation pattern %q",bad)}}
}
func TestNavigationSeparatesWorkspacesFromTools(t *testing.T){
 raw,err:=os.ReadFile("web/v23-navigation.js");if err!=nil{t.Fatal(err)};s:=string(raw)
 for _,want:=range []string{"const primaryItems", "const toolItems", "sentinel-v23-primary", "sentinel-tool-shelf", "Sentinel primary workspaces", "Sentinel tools"}{if !strings.Contains(s,want){t.Fatalf("two-level navigation missing %q",want)}}
 primaryStart:=strings.Index(s,"const primaryItems")
 toolStart:=strings.Index(s,"const toolItems")
 if primaryStart<0||toolStart<0||toolStart<=primaryStart{t.Fatal("primary/tool arrays must be explicit and ordered")}
 primary:=s[primaryStart:toolStart]
 tools:=s[toolStart:strings.Index(s,"function ensureI18n")]
 for _,want:=range []string{"Easy","Investigate","System","Advanced","Recover","Alpha"}{if !strings.Contains(primary,want){t.Fatalf("primary workspace missing %q",want)}}
 for _,bad:=range []string{"Scan","Compare","Security","Processes","Network","Startup","Storage","Terminal"}{if strings.Contains(primary,bad){t.Fatalf("tool %q must not be promoted into primary workspace row",bad)}}
 for _,want:=range []string{"Scan","Compare","Security","Processes","Network","Startup","Storage","Terminal"}{if !strings.Contains(tools,want){t.Fatalf("tool shelf missing %q",want)}}
}
func TestFocusedWorkspacePagesStaySmallAndSafe(t *testing.T){
 pages:=[]string{"web/easy.html","web/scan-center.html","web/compare-center.html","web/security-center.html","web/system-center.html","web/storage-center.html"}
 for _,p:=range pages{raw,err:=os.ReadFile(p);if err!=nil{t.Fatal(err)};s:=string(raw);for _,bad:=range []string{"<aside class=\"sidebar\"","Sentinel 2.2 · Desktop Conversion","innerHTML","eval(","new Function","document.write"}{if strings.Contains(s,bad){t.Fatalf("%s contains legacy/unsafe pattern %q",p,bad)}}}
 scripts:=[]string{"web/easy.js","web/scan-center.js","web/compare-center.js","web/workspace-centers.js"}
 for _,p:=range scripts{raw,err:=os.ReadFile(p);if err!=nil{t.Fatal(err)};s:=string(raw);for _,bad:=range []string{"innerHTML","eval(","new Function","document.write"}{if strings.Contains(s,bad){t.Fatalf("%s contains unsafe pattern %q",p,bad)}}}
}
func TestNormalRootExperienceRedirectsToNewEasy(t *testing.T){
 raw,err:=os.ReadFile("web/core-compat.js");if err!=nil{t.Fatal(err)};s:=string(raw)
 for _,want:=range []string{"location.pathname === '/'","/easy.html","legacy","location.replace"}{if !strings.Contains(s,want){t.Fatalf("root compatibility bridge missing %q",want)}}
 if !strings.Contains(s,"params.get('legacy') !== '1'"){t.Fatalf("legacy dashboard must require explicit legacy=1 opt-in")}
}
