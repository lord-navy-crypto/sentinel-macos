// SPDX-License-Identifier: MPL-2.0
package main

import(
 "os"
 "strings"
 "testing"
)
func TestReleasePrepUIBridgesExposeBoundedExportsAndGrouping(t *testing.T){
 checks:=map[string][]string{
  "web/intelligence-export.js":{"/api/intelligence/timeline/grouped","/api/incidents/export","Show Grouped Timeline","Export Incident JSON"},
  "web/investigation-export.js":{"/api/security/investigation/export","Export Investigation Bundle","X-Sentinel-Token"},
  "web/control-plane-aging.js":{"/api/storage/aging","oldest_large_files","Limitation:"},
 }
 for path,wants:=range checks{raw,err:=os.ReadFile(path);if err!=nil{t.Fatal(err)};s:=string(raw);for _,want:=range wants{if !strings.Contains(s,want){t.Fatalf("%s missing %q",path,want)}};for _,bad:=range []string{"innerHTML","eval(","new Function","document.write","sudo "}{if strings.Contains(s,bad){t.Fatalf("%s contains unsafe pattern %q",path,bad)}}}
}
func TestReleasePrepBridgesAreLoaded(t *testing.T){
 pairs:=map[string]string{"web/intelligence-center.html":"/intelligence-export.js","web/investigation.html":"/investigation-export.js","web/control-plane.html":"/control-plane-aging.js"}
 for p,want:=range pairs{raw,err:=os.ReadFile(p);if err!=nil{t.Fatal(err)};if !strings.Contains(string(raw),want){t.Fatalf("%s missing %s",p,want)}}
}
