// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestContinueInvestigationDescendsIntoSelectedBundle(t *testing.T) {
	root := filepath.Join(t.TempDir(), "Example.app")
	macOSDir := filepath.Join(root, "Contents", "MacOS")
	frameworkDir := filepath.Join(root, "Contents", "Frameworks")
	if err := os.MkdirAll(macOSDir, 0755); err != nil { t.Fatal(err) }
	if err := os.MkdirAll(frameworkDir, 0755); err != nil { t.Fatal(err) }
	exe := filepath.Join(macOSDir, "Example")
	dylib := filepath.Join(frameworkDir, "libExample.dylib")
	if err := os.WriteFile(exe, []byte("test"), 0755); err != nil { t.Fatal(err) }
	if err := os.WriteFile(dylib, []byte("test"), 0644); err != nil { t.Fatal(err) }

	report := continueInvestigation(context.Background(), root, "")
	if report.Kind != "application_bundle" {
		t.Fatalf("kind=%q", report.Kind)
	}
	seenExe, seenDylib := false, false
	for _, candidate := range report.Candidates {
		if candidate.Path == exe { seenExe = true }
		if candidate.Path == dylib { seenDylib = true }
	}
	if !seenExe || !seenDylib {
		t.Fatalf("bundle internals not exposed: exe=%v dylib=%v candidates=%+v", seenExe, seenDylib, report.Candidates)
	}
}

func TestContinueInvestigationBroadFolderStopsAtNestedAppBoundary(t *testing.T) {
	root := t.TempDir()
	app := filepath.Join(root, "Nested.app")
	inner := filepath.Join(app, "Contents", "MacOS", "Nested")
	if err := os.MkdirAll(filepath.Dir(inner), 0755); err != nil { t.Fatal(err) }
	if err := os.WriteFile(inner, []byte("test"), 0755); err != nil { t.Fatal(err) }

	report := continueInvestigation(context.Background(), root, "")
	seenApp, seenInner := false, false
	for _, candidate := range report.Candidates {
		if candidate.Path == app { seenApp = true }
		if candidate.Path == inner { seenInner = true }
	}
	if !seenApp || seenInner {
		t.Fatalf("broad folder should expose nested app as continuation target without exploding bundle: app=%v inner=%v", seenApp, seenInner)
	}
}

func TestContinueInvestigationPlistOffersExecutableContinuation(t *testing.T) {
	root := t.TempDir()
	exe := filepath.Join(root, "helper")
	if err := os.WriteFile(exe, []byte("#!/bin/sh\n"), 0755); err != nil { t.Fatal(err) }
	plist := filepath.Join(root, "com.example.helper.plist")
	content := `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>com.example.helper</string><key>Program</key><string>` + exe + `</string></dict></plist>`
	if err := os.WriteFile(plist, []byte(content), 0644); err != nil { t.Fatal(err) }

	report := continueInvestigation(context.Background(), plist, "parent")
	found := false
	for _, target := range report.NextTargets {
		if target.Path == exe && target.Kind == "configured_executable" { found = true }
	}
	if !found {
		t.Fatalf("plist executable continuation missing: %+v", report.NextTargets)
	}
	if report.ParentID != "parent" {
		t.Fatalf("parent id lost: %q", report.ParentID)
	}
}

func TestInvestigationCandidateIgnoresOrdinaryNonExecutableFile(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "notes.txt")
	if err := os.WriteFile(path, []byte("hello"), 0644); err != nil { t.Fatal(err) }
	entry, err := os.ReadDir(root)
	if err != nil { t.Fatal(err) }
	if _, ok := investigationCandidateHint(path, entry[0]); ok {
		t.Fatal("ordinary non-executable text file should not be auto-prioritized as a code candidate")
	}
}
