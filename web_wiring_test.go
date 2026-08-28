// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestWebUIEventTargetsExist(t *testing.T) {
	htmlBytes, err := os.ReadFile("web/index.html")
	if err != nil {
		t.Fatal(err)
	}
	jsBytes, err := os.ReadFile("web/app.js")
	if err != nil {
		t.Fatal(err)
	}
	html := string(htmlBytes)
	js := string(jsBytes)

	// Every direct $('#id').addEventListener(...) binding must point at a real
	// element. This catches the common failure mode where a button remains in JS
	// after its markup was renamed or removed.
	re := regexp.MustCompile(`\$\('#([A-Za-z0-9_-]+)'\)\.addEventListener`)
	for _, match := range re.FindAllStringSubmatch(js, -1) {
		id := match[1]
		if !strings.Contains(html, `id="`+id+`"`) {
			t.Errorf("app.js binds #%s but web/index.html has no such id", id)
		}
	}
}

func TestWebUICoreControlsRemainWired(t *testing.T) {
	htmlBytes, err := os.ReadFile("web/index.html")
	if err != nil {
		t.Fatal(err)
	}
	jsBytes, err := os.ReadFile("web/app.js")
	if err != nil {
		t.Fatal(err)
	}
	html := string(htmlBytes)
	js := string(jsBytes)

	controls := []string{
		"runQuickCheck", "loadSystemProfile", "runWeaknessAudit",
		"startChanges", "stopChanges", "reviewChanges", "rebuildIncidents",
		"startScan", "cancelScan", "runAudit", "inspectIntegrity",
		"loadProcesses", "loadStartup", "loadNetwork", "previewCleanup",
		"captureEvidence", "captureBehavior", "compareTrust", "captureTrust",
		"previewAction", "executeAction", "exportReport", "exportDiagnostics",
	}
	for _, id := range controls {
		if !strings.Contains(html, `id="`+id+`"`) {
			t.Errorf("core control #%s is missing from web/index.html", id)
		}
		if !strings.Contains(js, `#`+id) {
			t.Errorf("core control #%s is not referenced by web/app.js", id)
		}
	}
}

func TestWebUINavigationTargetsExist(t *testing.T) {
	htmlBytes, err := os.ReadFile("web/index.html")
	if err != nil {
		t.Fatal(err)
	}
	html := string(htmlBytes)

	views := []string{
		"overview", "quickcheck", "hardware", "weakness", "changes",
		"incidents", "storage", "security", "actions", "guide",
		"integrity", "intelligence", "behavior", "trust", "processes",
		"startup", "persistence", "background", "network", "cleanup",
	}
	for _, view := range views {
		if !strings.Contains(html, `data-view="`+view+`"`) {
			t.Errorf("navigation button for %s is missing", view)
		}
		if !strings.Contains(html, `id="`+view+`"`) {
			t.Errorf("view section #%s is missing", view)
		}
	}
}
