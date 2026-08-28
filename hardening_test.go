// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestGuardRejectsUnexpectedHostAndCrossSite(t *testing.T) {
	a := &app{allowedHost: "127.0.0.1:43127", serverOrigin: "http://127.0.0.1:43127"}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	h := a.requestGuard(next)

	r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43127/api/overview", nil)
	r.Host = "evil.example"
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusMisdirectedRequest {
		t.Fatalf("host code=%d", w.Code)
	}

	r = httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43127/api/overview", nil)
	r.Host = a.allowedHost
	r.Header.Set("Origin", "https://evil.example")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("origin code=%d", w.Code)
	}

	r = httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43127/api/overview", nil)
	r.Host = a.allowedHost
	r.Header.Set("Sec-Fetch-Site", "cross-site")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("fetch-site code=%d", w.Code)
	}

	r = httptest.NewRequest(http.MethodGet, "http://127.0.0.1:43127/api/overview", nil)
	r.Host = a.allowedHost
	r.Header.Set("Origin", a.serverOrigin)
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusNoContent {
		t.Fatalf("same-origin code=%d", w.Code)
	}
}
