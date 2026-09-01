// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestLocalAIGenerationStallHasForcedSecondStageRecovery(t *testing.T) {
	b, err := os.ReadFile("web/app/ai-reliability.js")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	for _, marker := range []string{
		"GENERATION_RESET_GRACE_MS=5000",
		"function requestGenerationRecovery",
		"interruptGenerate",
		"function forceResetStalledGeneration",
		"ai.engine=null;ai.worker=null;ai.loadedModel=null;ai.generating=false",
		"oldWorker?.terminate()",
		"Local AI generation did not stop after interrupt",
		"AI.forceResetStalledGeneration=forceResetStalledGeneration",
	} {
		if !strings.Contains(s, marker) {
			t.Fatalf("Local AI forced generation recovery contract missing %q", marker)
		}
	}
}

func TestLocalAIGenerationRecoveryDoesNotImmediatelyKillHealthyStreaming(t *testing.T) {
	b, err := os.ReadFile("web/app/ai-reliability.js")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	for _, marker := range []string{
		"if(text!==generationText)",
		"reliability.lastTokenAt=now",
		"if(!ai.generating){generationResetPending=false;return;}",
		"setTimeout(()=>",
	} {
		if !strings.Contains(s, marker) {
			t.Fatalf("Local AI streaming/grace contract missing %q", marker)
		}
	}
}
