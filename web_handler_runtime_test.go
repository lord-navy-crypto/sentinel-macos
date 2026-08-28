// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestNamedWebEventHandlersAreDefined(t *testing.T) {
	appBytes, err := os.ReadFile("web/app.js")
	if err != nil {
		t.Fatal(err)
	}
	compatBytes, err := os.ReadFile("web/core-compat.js")
	if err != nil {
		t.Fatal(err)
	}
	app := string(appBytes)
	defs := app + "\n" + string(compatBytes)

	// Only named handler references are checked here. Arrow callbacks are defined
	// inline and therefore cannot fail because a separate function name is absent.
	re := regexp.MustCompile(`addEventListener\(\s*['\"][^'\"]+['\"]\s*,\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)`)
	seen := map[string]bool{}
	for _, match := range re.FindAllStringSubmatch(app, -1) {
		name := match[1]
		if seen[name] {
			continue
		}
		seen[name] = true
		patterns := []string{
			"function " + name + "(",
			"async function " + name + "(",
			"const " + name + " =",
			"let " + name + " =",
			"var " + name + " =",
			"window." + name + " =",
		}
		defined := false
		for _, pattern := range patterns {
			if strings.Contains(defs, pattern) {
				defined = true
				break
			}
		}
		if !defined {
			t.Errorf("web/app.js binds named handler %q but neither app.js nor core-compat.js defines it", name)
		}
	}
	if len(seen) < 25 {
		t.Fatalf("named-handler audit saw only %d handlers; expected broad UI coverage", len(seen))
	}
}

func TestCoreCompatibilityLoadsBeforeAppJS(t *testing.T) {
	mainBytes, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	mainSource := string(mainBytes)
	needle := "<script src=\\\"/core-compat.js\\\"></script>\\n<script src=\\\"/app.js\\\"></script>"
	if !strings.Contains(mainSource, needle) {
		t.Fatal("root dashboard must load core-compat.js before app.js")
	}

	compatBytes, err := os.ReadFile("web/core-compat.js")
	if err != nil {
		t.Fatal(err)
	}
	compat := string(compatBytes)
	for _, required := range []string{"async function loadReadiness", "/api/readiness", "window.loadReadiness = loadReadiness"} {
		if !strings.Contains(compat, required) {
			t.Fatalf("web/core-compat.js missing %q", required)
		}
	}
}
