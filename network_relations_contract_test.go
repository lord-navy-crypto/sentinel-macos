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

func TestNetworkRelationshipExplorerIsExplicitlyCurrentSnapshot(t *testing.T) {
	requireNetworkRelationSourceContains(t, "web/network-relations.html",
		`Network Relationship Explorer`,
		`bounded current snapshot`,
		`not packet capture or historical surveillance`,
		`Processes with TCP Evidence`,
		`Visible Remote / Listen Endpoints`,
		`Historical endpoint behavior is not yet represented here`,
		`/network-relations.js`,
	)
}

func TestNetworkRelationshipExplorerUsesExistingNetworkEvidence(t *testing.T) {
	requireNetworkRelationSourceContains(t, "web/network-relations.js",
		`/api/network`,
		`groupByProcess`,
		`groupByEndpoint`,
		`LISTEN`,
		`ESTABLISHED`,
		`endpoint_class`,
		`Open Process Explorer`,
		`/process-relations.html#`,
		`Counts describe the currently visible bounded TCP evidence only`,
	)
}

func TestNetworkRelationshipExplorerIsLinkedFromSystemConsole(t *testing.T) {
	requireNetworkRelationSourceContains(t, "web/system-console.html",
		`networkRelationsRecipe`,
		`Which processes are talking on the network?`,
		`/network-relations.html`,
	)
	requireNetworkRelationSourceContains(t, "web/system-console-links.js",
		`networkRelationsRecipe`,
		`/network-relations.html#token=`,
	)
}

func TestNetworkRelationshipExplorerAvoidsDynamicCodeAndActiveNetworkControl(t *testing.T) {
	source := requireNetworkRelationSourceContains(t, "web/network-relations.js", `X-Sentinel-Token`)
	for _, forbidden := range []string{"eval(", "new Function(", "document.write(", "innerHTML", "sudo", "WebSocket(", "RTCPeerConnection(", "XMLHttpRequest("} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("network relationship explorer contains forbidden pattern %q", forbidden)
		}
	}
}

func TestNetworkRelationshipExplorerJavaScriptIsInCI(t *testing.T) {
	requireNetworkRelationSourceContains(t, ".github/workflows/v23-ci.yml", `node --check web/network-relations.js`)
}
