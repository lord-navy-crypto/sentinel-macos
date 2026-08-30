// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"strings"
)

// handleIntegrityInspectAPI preserves the established POST contract while also
// exposing a read-only GET form for the current Sentinel evidence frontend.
// Both forms are protected by the same localhost/session-token middleware.
func (a *app) handleIntegrityInspectAPI(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		path := strings.TrimSpace(r.URL.Query().Get("path"))
		if path == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "path required"})
			return
		}
		writeJSON(w, http.StatusOK, inspectIntegrity(path))
	case http.MethodPost:
		a.handleIntegrityInspect(w, r)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET or POST required"})
	}
}
