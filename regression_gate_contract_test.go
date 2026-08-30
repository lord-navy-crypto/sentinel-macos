// SPDX-License-Identifier: MPL-2.0
package main

import(
 "os"
 "strings"
 "testing"
)
func TestMigrationRunsBeforeStateManagersAndPrepRoutesAreRegistered(t *testing.T){
 raw,err:=os.ReadFile("main.go");if err!=nil{t.Fatal(err)};s:=string(raw)
 mig:=strings.Index(s,"runV23StateMigrations(*ephemeral)");mgr:=strings.Index(s,"newBehaviorManager(*ephemeral)");if mig<0||mgr<0||mig>mgr{t.Fatalf("migration must run before legacy state managers: migration=%d manager=%d",mig,mgr)}
 for _,route:=range []string{"/api/storage/aging","/api/security/investigation/export","/api/intelligence/timeline/grouped","/api/incidents/export","/api/pre-regression"}{if !strings.Contains(s,route){t.Fatalf("main missing regression-prep route %q",route)}}
}
func TestRegressionPageIsReadOnlyGate(t *testing.T){
 html,err:=os.ReadFile("web/pre-regression.html");if err!=nil{t.Fatal(err)};js,err:=os.ReadFile("web/pre-regression.js");if err!=nil{t.Fatal(err)};s:=string(html)+string(js)
 for _,want:=range []string{"Regression Gate","Sentinel 2.4 · AUX Engineering","/api/pre-regression","Real macOS regression"}{if !strings.Contains(s,want){t.Fatalf("regression UI missing %q",want)}}
 for _,bad:=range []string{"innerHTML","eval(","new Function","document.write","/api/actions/execute","sudo "}{if strings.Contains(s,bad){t.Fatalf("regression UI contains unsafe pattern %q",bad)}}
}
