// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func requireNetworkRelationSourceContains(t *testing.T, path string, needles ...string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	source := string(raw)
	for _, needle := range needles {
		if !strings.Contains(source, needle) {
			t.Fatalf("%s missing %q", path, needle)
		}
	}
	return source
}

func TestNetworkRelationshipExplorerSeparatesCurrentEvidenceFromExplicitHistory(t *testing.T) {
	requireNetworkRelationSourceContains(t, "web/network-relations.html", `Network Relationship Explorer`, `Current snapshot`, `Capture History Snapshot`, `only action on this page that adds a network-history record`, `does not append history`, `Explicit Snapshot History`, `historyFrom`, `historyTo`, `Compare Selected`, `not packet capture or continuous surveillance`, `Cross-snapshot identity ignores transient PID changes`, `/network-relations.js`)
}

func TestNetworkRelationshipExplorerUsesCurrentAndHistoryAPIs(t *testing.T) {
	source := requireNetworkRelationSourceContains(t, "web/network-relations.js", `/api/network`, `/api/network/history`, `method: 'POST'`, `groupByProcess`, `groupByEndpoint`, `LISTEN`, `ESTABLISHED`, `endpoint_class`, `Open Process Explorer`, `Latest snapshot difference`, `Selected snapshot difference`, `Historical PID is context only`, `Refresh Current`)
	if strings.Contains(source, `Open Sample PID`) {
		t.Fatal("historical PID must not be navigated as if it were still current")
	}
	requireNetworkRelationSourceContains(t, "main.go", `networkHistory *networkHistoryManager`, `newNetworkHistoryManager(*ephemeral)`, `/api/network/history`)
}

func TestNetworkRelationshipExplorerIsLinkedFromSystemConsole(t *testing.T) {
	requireNetworkRelationSourceContains(t, "web/system-console.html", `networkRelationsRecipe`, `Which processes are talking on the network?`, `/network-relations.html`)
	requireNetworkRelationSourceContains(t, "web/system-console-links.js", `networkRelationsRecipe`, `/network-relations.html#token=`)
}

func TestNetworkRelationshipExplorerAvoidsDynamicCodeAndActiveNetworkControl(t *testing.T) {
	source := requireNetworkRelationSourceContains(t, "web/network-relations.js", `X-Sentinel-Token`)
	for _, forbidden := range []string{"eval(", "new Function(", "document.write(", "innerHTML", "sudo", "WebSocket(", "RTCPeerConnection(", "XMLHttpRequest("} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("network relationship explorer contains forbidden pattern %q", forbidden)
		}
	}
}

func TestNetworkHistoryBackendIsBoundedMetadataOnly(t *testing.T) {
	source := requireNetworkRelationSourceContains(t, "network_history.go", `networkHistorySnapshotLimit = 32`, `networkHistoryRelationLimit = 400`, `PID and local ephemeral ports are deliberately excluded`, `explicit Sentinel snapshots`, `never packet contents`, `network snapshot unavailable`, `both from and to snapshot IDs are required for comparison`, `findNetworkHistorySnapshot`)
	for _, forbidden := range []string{"pcap", "tcpdump", "packet payload", "exec.Command(", "WebSocket("} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("network history unexpectedly contains active-capture/control pattern %q", forbidden)
		}
	}
}

func TestNetworkRelationshipExplorerJavaScriptIsInCI(t *testing.T) {
	requireNetworkRelationSourceContains(t, ".github/workflows/ci.yml", `node --check web/network-relations.js`)
}
