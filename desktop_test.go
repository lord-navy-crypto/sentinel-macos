// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDesktopBootstrapLine(t *testing.T) {
	line := desktopBootstrapLine("http://127.0.0.1:43127", "abc123")
	const prefix = "SENTINEL_DESKTOP_BOOTSTRAP "
	if !strings.HasPrefix(line, prefix) {
		t.Fatalf("missing bootstrap prefix: %q", line)
	}
	var got map[string]string
	if err := json.Unmarshal([]byte(strings.TrimPrefix(line, prefix)), &got); err != nil {
		t.Fatalf("invalid bootstrap JSON: %v", err)
	}
	if got["origin"] != "http://127.0.0.1:43127" || got["token"] != "abc123" || got["version"] != sentinelVersion {
		t.Fatalf("unexpected bootstrap payload: %#v", got)
	}
}
