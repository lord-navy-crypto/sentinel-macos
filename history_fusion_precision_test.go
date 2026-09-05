// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"testing"
	"time"
)

func marshalWhatChangedForTest(t *testing.T, response WhatChangedResponse) WhatChangedResponse {
	t.Helper()
	raw, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	var decoded WhatChangedResponse
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

func TestDerivedTimelineCannotManufactureCorrelation(t *testing.T) {
	base := time.Unix(2_000_000_000, 0)
	response := WhatChangedResponse{Observed: []HistoryFusionObservation{
		{ID: "resource", At: base.Unix(), Source: "resource", Kind: "resource_window_delta"},
		{ID: "derived", At: base.Add(time.Minute).Unix(), Source: "intelligence", Kind: "network_snapshot"},
	}}
	decoded := marshalWhatChangedForTest(t, response)
	if len(decoded.Observed) != 2 {
		t.Fatalf("derived rows must remain visible in Observed: %+v", decoded.Observed)
	}
	if len(decoded.Correlated) != 0 {
		t.Fatalf("derived presentation evidence manufactured correlation: %+v", decoded.Correlated)
	}
}

func TestDerivedTimelineDoesNotInflateDirectCorrelation(t *testing.T) {
	base := time.Unix(2_000_000_000, 0)
	response := WhatChangedResponse{Observed: []HistoryFusionObservation{
		{ID: "resource", At: base.Unix(), Source: "resource", Kind: "resource_window_delta"},
		{ID: "derived", At: base.Add(time.Minute).Unix(), Source: "intelligence", Kind: "network_snapshot"},
		{ID: "storage", At: base.Add(2 * time.Minute).Unix(), Source: "storage", Kind: "storage_snapshot_delta"},
	}}
	decoded := marshalWhatChangedForTest(t, response)
	if len(decoded.Correlated) != 1 {
		t.Fatalf("expected one direct-source correlation: %+v", decoded.Correlated)
	}
	group := decoded.Correlated[0]
	if len(group.Sources) != 2 || group.Sources[0] != "resource" || group.Sources[1] != "storage" {
		t.Fatalf("derived source inflated correlation source count: %+v", group.Sources)
	}
	if len(group.EventIDs) != 2 {
		t.Fatalf("derived event leaked into direct correlation: %+v", group.EventIDs)
	}
}

func TestDirectCorrelationKindsAreExplicit(t *testing.T) {
	allowed := []HistoryFusionObservation{
		{Source: "resource", Kind: "resource_window_delta"},
		{Source: "storage", Kind: "storage_snapshot_delta"},
		{Source: "network", Kind: "network_snapshot_delta"},
		{Source: "behavior", Kind: "behavior_diff"},
		{Source: "trust", Kind: "trust_drift"},
		{Source: "filesystem", Kind: "modified"},
	}
	for _, row := range allowed {
		if !directHistoryCorrelationEvidence(row) {
			t.Fatalf("direct evidence rejected: %+v", row)
		}
	}
	for _, row := range []HistoryFusionObservation{
		{Source: "intelligence", Kind: "network_snapshot"},
		{Source: "incident", Kind: "relationship"},
		{Source: "network", Kind: "network_snapshot"},
		{Source: "storage", Kind: "timeline_storage"},
	} {
		if directHistoryCorrelationEvidence(row) {
			t.Fatalf("derived/unknown evidence admitted to correlation: %+v", row)
		}
	}
}
