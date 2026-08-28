// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestInvestigationPathMatchExactAndBundle(t *testing.T) {
	if ok, kind := investigationPathMatch("/Applications/Example.app", "/Applications/Example.app"); !ok || kind != "exact_path" {
		t.Fatalf("exact match=%v kind=%q", ok, kind)
	}
	if ok, kind := investigationPathMatch("/Applications/Example.app", "/Applications/Example.app/Contents/MacOS/Example"); !ok || kind != "same_app_bundle" {
		t.Fatalf("bundle match=%v kind=%q", ok, kind)
	}
	if ok, _ := investigationPathMatch("/Applications/Example.app", "/Applications/Other.app/Contents/MacOS/Other"); ok {
		t.Fatal("unrelated app unexpectedly matched")
	}
}

func TestInvestigationPathMatchFileInsideSameBundle(t *testing.T) {
	root := "/Applications/Example.app/Contents/Frameworks/A.framework/Versions/A/A"
	candidate := "/Applications/Example.app/Contents/MacOS/Example"
	if ok, kind := investigationPathMatch(root, candidate); !ok || kind != "same_app_bundle" {
		t.Fatalf("same bundle correlation=%v kind=%q", ok, kind)
	}
}

func TestAppendInvestigationNextTargetDeduplicates(t *testing.T) {
	var targets []InvestigationNextTarget
	targets = appendInvestigationNextTarget(targets, "/tmp/example", "file", "first")
	targets = appendInvestigationNextTarget(targets, "/tmp/example", "file", "second")
	if len(targets) != 1 {
		t.Fatalf("targets=%+v", targets)
	}
	if targets[0].Why != "first" {
		t.Fatalf("first provenance should remain stable: %+v", targets[0])
	}
}

func TestAppendInvestigationNextTargetRejectsRelativePath(t *testing.T) {
	targets := appendInvestigationNextTarget(nil, "relative/path", "file", "invalid")
	if len(targets) != 0 {
		t.Fatalf("relative target accepted: %+v", targets)
	}
}
