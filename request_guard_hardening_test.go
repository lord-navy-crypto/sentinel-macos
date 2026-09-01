// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testGuardApp() *app {
	return &app{
		token:        "test-token",
		allowedHost:  "127.0.0.1:43123",
		serverOrigin: "http://127.0.0.1:43123",
	}
}

func guardedProbe(a *app) http.Handler {
	return a.requestGuard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}))
}

func TestRequestGuardRejectsUnexpectedHost(t *testing.T) {
	a := testGuardApp()
	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43123/api/overview", nil)
	r.Host = "attacker.invalid"
	w := httptest.NewRecorder()
	guardedProbe(a).ServeHTTP(w, r)
	if w.Code != http.StatusMisdirectedRequest {
		t.Fatalf("expected 421 for unexpected Host, got %d", w.Code)
	}
}

func TestRequestGuardRejectsCrossOriginAPIRequest(t *testing.T) {
	a := testGuardApp()
	r := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:43123/api/actions/preview", strings.NewReader(`{"action":"rename"}`))
	r.Host = a.allowedHost
	r.Header.Set("Origin", "https://attacker.invalid")
	w := httptest.NewRecorder()
	guardedProbe(a).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for cross-origin API request, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "cross-origin API request rejected") {
		t.Fatalf("unexpected response: %s", w.Body.String())
	}
}

func TestRequestGuardRejectsCrossSiteFetchMetadata(t *testing.T) {
	a := testGuardApp()
	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43123/api/overview", nil)
	r.Host = a.allowedHost
	r.Header.Set("Sec-Fetch-Site", "cross-site")
	w := httptest.NewRecorder()
	guardedProbe(a).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for cross-site Fetch Metadata, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "cross-site API request rejected") {
		t.Fatalf("unexpected response: %s", w.Body.String())
	}
}

func TestRequestGuardAllowsSameOriginAndNonAPIStaticRequest(t *testing.T) {
	a := testGuardApp()
	cases := []struct {
		name   string
		path   string
		origin string
		site   string
	}{
		{name: "same-origin API", path: "/api/overview", origin: a.serverOrigin, site: "same-origin"},
		{name: "browser navigation without Origin", path: "/", origin: "", site: "none"},
		{name: "static module", path: "/app/core.js", origin: "", site: "same-origin"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43123"+tc.path, nil)
			r.Host = a.allowedHost
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			if tc.site != "" {
				r.Header.Set("Sec-Fetch-Site", tc.site)
			}
			w := httptest.NewRecorder()
			guardedProbe(a).ServeHTTP(w, r)
			if w.Code != http.StatusOK {
				t.Fatalf("expected request to pass, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}
