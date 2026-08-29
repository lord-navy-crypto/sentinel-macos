// SPDX-License-Identifier: MPL-2.0
package main

import "sort"

// systemEvidenceIncidentCandidates turns only path-bearing, explicitly
// review-worthy typed System Console signals into object-centered Incident
// candidates. Global posture such as SIP/FileVault stays in Security Posture
// because forcing a system-global setting onto a fake file path would be
// misleading.
func (a *app) systemEvidenceIncidentCandidates() []Incident {
	if a == nil {
		return nil
	}
	cp := controlPlaneFor(a.ephemeral)
	buckets := map[string][]IncidentEvidence{}
	for _, e := range cp.systemEvidence.incidentEvidence() {
		p := canonicalIncidentPath(e.Path)
		if p == "" {
			continue
		}
		e.Path = p
		buckets[p] = append(buckets[p], e)
	}
	out := []Incident{}
	for path, rows := range buckets {
		for _, cluster := range incidentClusters(rows) {
			if in, ok := incidentFromCluster(path, cluster); ok {
				in.Title = "System Console integrity evidence requires review"
				in.Recommended = uniqueStrings(append(in.Recommended,
					"Use Object Story / Continue Investigation to correlate signing, persistence, runtime, and network evidence before taking action.",
				))
				out = append(out, in)
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if incidentRank(out[i].Severity) != incidentRank(out[j].Severity) {
			return incidentRank(out[i].Severity) < incidentRank(out[j].Severity)
		}
		return out[i].UpdatedAt > out[j].UpdatedAt
	})
	return out
}

func (a *app) refreshIncidentsWithSystemEvidence() IncidentStatus {
	if a == nil || a.incidents == nil {
		return IncidentStatus{}
	}
	base := a.buildIncidentCandidates()
	base = append(base, a.systemEvidenceIncidentCandidates()...)
	a.incidents.store(base)
	return a.incidents.snapshot(false)
}
