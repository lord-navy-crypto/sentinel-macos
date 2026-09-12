// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return fn(r) }

func jsonHTTPResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestOpenPenguinStatusUsesFixedLoopbackAndRequiresSentinelContextCapability(t *testing.T) {
	old := openPenguinHTTPClient
	defer func() { openPenguinHTTPClient = old }()
	openPenguinHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Scheme != "http" || r.URL.Host != "127.0.0.1:11436" || r.URL.Path != "/v1/capabilities" {
			t.Fatalf("unexpected OpenPenguin target: %s", r.URL.String())
		}
		return jsonHTTPResponse(200, `{"api_version":"openguin-local-api/v1","models":["fixture"],"capabilities":["read-only-advisory"],"accepted_context_schemas":["sentinel.system-evidence-context/v1"],"advisory_only":true}`), nil
	})}

	a := &app{}
	req := httptest.NewRequest(http.MethodGet, "/api/ai/openguin/status", nil)
	rec := httptest.NewRecorder()
	a.handleOpenPenguinStatus(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status code = %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"available":true`) || !strings.Contains(body, `"advisory_only":true`) {
		t.Fatalf("unexpected status body: %s", body)
	}
}

func TestOpenPenguinAdvisoryForcesAdvisoryBoundary(t *testing.T) {
	old := openPenguinHTTPClient
	defer func() { openPenguinHTTPClient = old }()
	openPenguinHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "127.0.0.1:11436" || r.URL.Path != "/v1/advisory" || r.Method != http.MethodPost {
			t.Fatalf("unexpected OpenPenguin advisory target: %s %s", r.Method, r.URL.String())
		}
		raw, _ := io.ReadAll(r.Body)
		if !bytes.Contains(raw, []byte(`"api_version":"openguin-local-api/v1"`)) || !bytes.Contains(raw, []byte(`"schema":"sentinel.system-evidence-context/v1"`)) {
			t.Fatalf("missing version/context contract: %s", raw)
		}
		// Even a buggy upstream claiming execution must be normalized to false by Sentinel.
		return jsonHTTPResponse(200, `{"schema":"openguin.local-advisory-response/v1","request_id":"fixture","answer":"Observed facts remain separate from interpretation.","executed":true}`), nil
	})}

	payload := `{"context":{"schema":"sentinel.system-evidence-context/v1","evidence_packet":{"kind":"fixture"}},"question":"What changed?","model":"fixture","temperature":0.18}`
	req := httptest.NewRequest(http.MethodPost, "/api/ai/openguin/advisory", strings.NewReader(payload))
	rec := httptest.NewRecorder()
	(&app{}).handleOpenPenguinAdvisory(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status code = %d body=%s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"executed":false`) {
		t.Fatalf("Sentinel did not enforce advisory-only response: %s", body)
	}
	if !strings.Contains(body, "Sentinel observed evidence remains authoritative") {
		t.Fatalf("Sentinel authority marker missing: %s", body)
	}
}

func TestOpenPenguinAdvisoryRejectsWrongContextBeforeProxy(t *testing.T) {
	old := openPenguinHTTPClient
	defer func() { openPenguinHTTPClient = old }()
	called := false
	openPenguinHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		called = true
		return jsonHTTPResponse(500, `{}`), nil
	})}
	payload := `{"context":{"schema":"labbridge.ai-context/v1"},"question":"x","model":"fixture","temperature":0.1}`
	req := httptest.NewRequest(http.MethodPost, "/api/ai/openguin/advisory", strings.NewReader(payload))
	rec := httptest.NewRecorder()
	(&app{}).handleOpenPenguinAdvisory(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	if called {
		t.Fatal("wrong-schema request reached OpenPenguin")
	}
}

func TestOpenPenguinProxyRejectsWrongMethods(t *testing.T) {
	a := &app{}
	statusReq := httptest.NewRequest(http.MethodPost, "/api/ai/openguin/status", nil)
	statusRec := httptest.NewRecorder()
	a.handleOpenPenguinStatus(statusRec, statusReq)
	if statusRec.Code != http.StatusMethodNotAllowed { t.Fatalf("status POST = %d", statusRec.Code) }

	advReq := httptest.NewRequest(http.MethodGet, "/api/ai/openguin/advisory", nil)
	advRec := httptest.NewRecorder()
	a.handleOpenPenguinAdvisory(advRec, advReq)
	if advRec.Code != http.StatusMethodNotAllowed { t.Fatalf("advisory GET = %d", advRec.Code) }
}
