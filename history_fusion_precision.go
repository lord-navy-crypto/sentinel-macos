// SPDX-License-Identifier: MPL-2.0
package main

import "encoding/json"

// directHistoryCorrelationEvidence returns true only for observations emitted
// directly by History Fusion's retained-source adapters. Global Timeline and
// incident presentation rows remain visible in Observed, but they are not
// allowed to manufacture an additional independent source for correlation.
func directHistoryCorrelationEvidence(row HistoryFusionObservation) bool {
	switch row.Source {
	case "resource":
		return row.Kind == "resource_window_delta"
	case "storage":
		return row.Kind == "storage_snapshot_delta" || row.Kind == "storage_directory_delta"
	case "network":
		return row.Kind == "network_snapshot_delta" || row.Kind == "network_relation_present"
	case "behavior":
		return row.Kind == "behavior_diff"
	case "trust":
		return row.Kind == "trust_drift"
	case "filesystem":
		// filesystemFusionObservations assigns the canonical filesystem source.
		// timelineFusionObservations already excludes filesystem_change rows.
		return true
	default:
		return false
	}
}

func directHistoryCorrelationRows(rows []HistoryFusionObservation) []HistoryFusionObservation {
	out := make([]HistoryFusionObservation, 0, len(rows))
	for _, row := range rows {
		if directHistoryCorrelationEvidence(row) {
			out = append(out, row)
		}
	}
	return out
}

// MarshalJSON is the API boundary for WhatChangedResponse. Recompute
// correlations from direct retained-source observations immediately before
// serialization so a derived presentation row can never count as a second
// evidence source even if future Global Timeline coverage expands.
func (r WhatChangedResponse) MarshalJSON() ([]byte, error) {
	type wire WhatChangedResponse
	clean := r
	clean.Correlated = correlateHistoryObservations(directHistoryCorrelationRows(r.Observed), historyFusionCorrelationWindow)
	return json.Marshal(wire(clean))
}
