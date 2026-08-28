// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestPersistenceDiff(t *testing.T) {
	b := PersistenceSnapshot{Files: []PersistenceFile{{Path: "/Library/LaunchAgents/x.plist", Executable: "/Applications/A", SHA256: fingerprintText("a")}}}
	a := PersistenceSnapshot{Files: []PersistenceFile{{Path: "/Library/LaunchAgents/x.plist", Executable: "/tmp/B", SHA256: fingerprintText("b")}, {Path: "/Library/LaunchDaemons/y.plist", Executable: "/tmp/y", SHA256: fingerprintText("y")}}}
	d := persistenceDiff(b, a)
	if len(d) != 2 {
		t.Fatalf("unexpected %#v", d)
	}
	if d[0].Kind != "content_changed" || d[0].Severity != "high" {
		t.Fatalf("unexpected first %#v", d[0])
	}
}
