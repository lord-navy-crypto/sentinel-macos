// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestInvestigationSessionNoteGuardPreventsStaleAutosave(t *testing.T){
	html,err:=os.ReadFile("web/investigation.html");if err!=nil{t.Fatal(err)}
	js,err:=os.ReadFile("web/investigation-session-note-guard.js");if err!=nil{t.Fatal(err)}
	if !strings.Contains(string(html),"/investigation-session-note-guard.js"){t.Fatal("investigation page does not load note guard")}
	text:=string(js)
	for _,want:=range []string{"explicitNoteSave","body.note = ''","saveSession","bookmarkBranch","/api/security/investigate?mode=sessions"}{if !strings.Contains(text,want){t.Fatalf("note guard missing %q",want)}}
	for _,forbidden:=range []string{"innerHTML","eval(","new Function","document.write","sudo "}{if strings.Contains(text,forbidden){t.Fatalf("unsafe note guard pattern %q",forbidden)}}
}
