// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestEnclosingAppBundle(t *testing.T) {
	got := enclosingAppBundle("/Applications/Example.app/Contents/MacOS/Example")
	if got != "/Applications/Example.app" {
		t.Fatalf("got %q", got)
	}
	if got := enclosingAppBundle("/usr/bin/ssh"); got != "" {
		t.Fatalf("unexpected bundle %q", got)
	}
}

func TestClassifyEndpoint(t *testing.T) {
	tests := []struct{ addr, state, want string }{
		{"127.0.0.1:5000->127.0.0.1:6000", "ESTABLISHED", "loopback"},
		{"192.168.1.4:5000->10.0.0.2:443", "ESTABLISHED", "private"},
		{"192.168.1.4:5000->8.8.8.8:443", "ESTABLISHED", "public"},
		{"*:8080", "LISTEN", "listener"},
	}
	for _, tt := range tests {
		_, _, got := classifyEndpoint(tt.addr, tt.state)
		if got != tt.want {
			t.Fatalf("%s => %s, want %s", tt.addr, got, tt.want)
		}
	}
}

func TestParseBackgroundItems(t *testing.T) {
	raw := `Name: Example Helper
Identifier: com.example.helper
URL: file:///Applications/Example.app/
Executable Path: /Applications/Example.app/Contents/MacOS/Example
Disposition: [enabled, allowed]

Name: Second
Identifier: com.example.second
`
	got := parseBackgroundItems(raw)
	if len(got) != 2 {
		t.Fatalf("got %d items", len(got))
	}
	if got[0].Identifier != "com.example.helper" {
		t.Fatalf("unexpected first item: %+v", got[0])
	}
}
