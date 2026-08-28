// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLaunchManifestFallback(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "x.plist")
	data := `<?xml version="1.0"?><plist><dict><key>Label</key><string>com.example.helper</string><key>Program</key><string>/tmp/helper</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>`
	if err := os.WriteFile(p, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	got := parseLaunchManifest(p)
	if got.Label != "com.example.helper" || got.Program != "/tmp/helper" || !got.RunAtLoad || got.KeepAlive != "true" {
		t.Fatalf("unexpected %#v", got)
	}
}
