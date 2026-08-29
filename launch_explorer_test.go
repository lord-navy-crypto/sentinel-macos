// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLaunchServiceFromPersistenceCorrelatesExactProcess(t *testing.T) {
	root := t.TempDir()
	executable := filepath.Join(root, "Example")
	if err := os.WriteFile(executable, []byte("#!/bin/sh\n"), 0700); err != nil {
		t.Fatal(err)
	}
	file := PersistenceFile{
		Path: filepath.Join(root, "com.example.agent.plist"),
		Scope: "User LaunchAgent", Label: "com.example.agent",
		Executable: executable, RunAtLoad: true, KeepAlive: "true",
		Modified: 123, HashStatus: "complete", SHA256: "abc",
	}
	item := launchServiceFromPersistence(file, map[string][]int{executable: {42, 77}})
	if !item.TargetExists || !item.Running || len(item.RunningPIDs) != 2 {
		t.Fatalf("item=%+v", item)
	}
	if item.Label != "com.example.agent" || item.Scope != "User LaunchAgent" || !item.RunAtLoad {
		t.Fatalf("metadata=%+v", item)
	}
	joined := strings.Join(item.Explanation, " ")
	if !strings.Contains(joined, "RunAtLoad") || !strings.Contains(joined, "2 running process") {
		t.Fatalf("explanation=%q", joined)
	}
}

func TestLaunchServiceFromPersistenceSurfacesMissingTarget(t *testing.T) {
	file := PersistenceFile{
		Path: "/Library/LaunchDaemons/com.example.missing.plist",
		Scope: "System LaunchDaemon", Label: "com.example.missing",
		Executable: "/definitely/not/present/sentinel-test",
	}
	item := launchServiceFromPersistence(file, nil)
	if item.TargetExists || item.Running {
		t.Fatalf("missing target reported present: %+v", item)
	}
	if len(item.Limitations) == 0 {
		t.Fatal("missing target limitation not surfaced")
	}
}

func TestLaunchServiceFromPersistenceDoesNotGuessRelativeExecutable(t *testing.T) {
	file := PersistenceFile{
		Path: "/Library/LaunchAgents/com.example.relative.plist",
		Scope: "System LaunchAgent", Label: "com.example.relative",
		Executable: "bin/helper",
	}
	item := launchServiceFromPersistence(file, map[string][]int{"bin/helper": {9}})
	if item.Executable != "" || item.Running {
		t.Fatalf("relative executable should remain unresolved: %+v", item)
	}
	if len(item.Limitations) == 0 {
		t.Fatal("relative executable limitation missing")
	}
}

func TestProcessPIDsByExecutableIsDeterministic(t *testing.T) {
	rows := []ProcessEvidenceRow{
		{PID: 9, Command: "/Applications/A.app/Contents/MacOS/A"},
		{PID: 3, Command: "/Applications/A.app/Contents/MacOS/A"},
		{PID: 4, Command: "/usr/bin/helper"},
	}
	got := processPIDsByExecutable(rows)
	pids := got["/Applications/A.app/Contents/MacOS/A"]
	if len(pids) != 2 || pids[0] != 3 || pids[1] != 9 {
		t.Fatalf("pids=%v", pids)
	}
}
