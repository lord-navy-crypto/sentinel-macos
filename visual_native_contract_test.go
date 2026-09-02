// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"os/exec"
	"regexp"
	"strings"
	"testing"
)

func visualNativeRead(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestVisualNativeIsWiredIntoCanonicalProduct(t *testing.T) {
	html := visualNativeRead(t, "web/index.html")
	runtime := visualNativeRead(t, "web/app/runtime.js")
	for _, want := range []string{"/app/visual-native.css", "/app/visual-native-highfreq.css"} {
		if !strings.Contains(html, want) {
			t.Fatalf("canonical app missing Visual Native stylesheet %q", want)
		}
	}
	for _, want := range []string{"loadVisualNative", "/app/visual-native.js", "data-sentinel-visual-native"} {
		if !strings.Contains(runtime, want) {
			t.Fatalf("canonical runtime missing Visual Native loader %q", want)
		}
	}
}

func TestVisualNativeKeepsTrendFirstHighFrequencySurfaces(t *testing.T) {
	visual := visualNativeRead(t, "web/app/visual-native.js")
	observatory := visualNativeRead(t, "web/app/resource-observatory.js")
	for _, want := range []string{
		"Sentinel 3.3 Visual Native",
		"registerLens('machine',renderMachineVisual)",
		"registerLens('processes',renderProcessesVisual)",
		"registerLens('storage',renderStorageVisual)",
		"THIS MAC / 这台 Mac",
		"CPU VISUAL",
		"MEMORY VISUAL",
		"See space before reading file lists.",
	} {
		if !strings.Contains(visual, want) {
			t.Fatalf("Visual Native high-frequency layer missing %q", want)
		}
	}
	for _, want := range []string{
		"Sentinel 3.3 Resource Observatory Visual Native",
		"Your Mac, right now.",
		"TREND FIRST",
		"Resource trend",
		"CPU, memory free and battery percentage trend",
		"No trend line is drawn from a single point.",
	} {
		if !strings.Contains(observatory, want) {
			t.Fatalf("Resource Observatory trend-first layer missing %q", want)
		}
	}
}

func TestVisualNativeDoesNotInventResourceHealthScore(t *testing.T) {
	visual := strings.ToLower(visualNativeRead(t, "web/app/visual-native.js"))
	observatory := strings.ToLower(visualNativeRead(t, "web/app/resource-observatory.js"))
	for _, want := range []string{"hardware-health certificate", "does not fabricate apple energy impact"} {
		if !strings.Contains(visual+observatory, want) {
			t.Fatalf("Visual Native must preserve resource interpretation boundary %q", want)
		}
	}
	for _, bad := range []string{"synthetic_health_score", "fake_health_score", "malware_probability_from_cpu"} {
		if strings.Contains(visual, bad) || strings.Contains(observatory, bad) {
			t.Fatalf("Visual Native contains prohibited synthetic verdict marker %q", bad)
		}
	}
}

func TestVisualNativeCSSIsPassiveAndBalanced(t *testing.T) {
	for _, path := range []string{"web/app/visual-native.css", "web/app/visual-native-highfreq.css"} {
		source := visualNativeRead(t, path)
		if strings.Count(source, "{") == 0 || strings.Count(source, "{") != strings.Count(source, "}") {
			t.Fatalf("%s has unbalanced CSS braces", path)
		}
		withoutComments := regexp.MustCompile(`(?s)/\*.*?\*/`).ReplaceAllString(source, "")
		lower := strings.ToLower(withoutComments)
		for _, bad := range []string{"javascript:", "expression(", "url(http://", "url(https://"} {
			if strings.Contains(lower, bad) {
				t.Fatalf("%s contains active or remote CSS pattern %q", path, bad)
			}
		}
	}
}

func TestVisualNativeJavaScriptSyntaxWhenNodeAvailable(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not available")
	}
	for _, path := range []string{"web/app/visual-native.js", "web/app/resource-observatory.js", "web/app/runtime.js"} {
		cmd := exec.Command(node, "--check", path)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%s syntax failed: %v\n%s", path, err, out)
		}
	}
}
