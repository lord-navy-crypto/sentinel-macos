// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestApplicationRuntimeIsSelfContained(t *testing.T) {
	htmlBytes, err := os.ReadFile("web/index.html"); if err != nil { t.Fatal(err) }
	jsBytes, err := os.ReadFile("web/app/controller.js"); if err != nil { t.Fatal(err) }
	html := string(htmlBytes); js := string(jsBytes)
	for _, required := range []string{`src="/app/controller.js"`,`href="/app/shell.css"`,`document.addEventListener('click'`,`document.addEventListener('submit'`,`X-Sentinel-Token`,`const RENDERERS`,`window.__SENTINEL_24__`} { if !strings.Contains(html+"\n"+js, required) { t.Fatalf("application runtime missing %q", required) } }
}

func TestServerServesApplicationWithoutLegacyScriptInjection(t *testing.T) {
	mainBytes, err := os.ReadFile("main.go"); if err != nil { t.Fatal(err) }; mainSource := string(mainBytes)
	for _, required := range []string{`fs.ReadFile(staticFS, "index.html")`,`X-Sentinel-UI", "2.4-native`,`_, _ = w.Write(page)`} { if !strings.Contains(mainSource, required) { t.Fatalf("root serving contract missing %q", required) } }
	for _, retired := range []string{`core-compat.js`,`<script src=\"/app.js\"></script>`,`desktop-ui.js`,`legacy-diagnostic`,`v5-evidence-notebook`} { if strings.Contains(mainSource, retired) { t.Fatalf("server still injects retired frontend runtime %q", retired) } }
}

func TestApplicationRuntimeKeepsErrorsVisibleInsteadOfInventingEvidence(t *testing.T) {
	jsBytes, err := os.ReadFile("web/app/controller.js"); if err != nil { t.Fatal(err) }; js := string(jsBytes)
	for _, required := range []string{"throw new Error","notice(e.message)","activity('Error'","The interface did not invent replacement evidence."} { if !strings.Contains(js, required) { t.Fatalf("explicit failure semantics missing %q", required) } }
}
