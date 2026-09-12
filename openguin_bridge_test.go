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
	return &http.Response{StatusCode: status, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(body))}
}

func TestOpenPenguinStatusReadsCapabilitiesStatusAndPolicies(t *testing.T) {
	old := openPenguinHTTPClient
	defer func() { openPenguinHTTPClient = old }()
	seen := map[string]bool{}
	openPenguinHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Scheme != "http" || r.URL.Host != "127.0.0.1:11436" { t.Fatalf("unexpected target: %s", r.URL.String()) }
		seen[r.URL.Path] = true
		switch r.URL.Path {
		case "/v1/capabilities":
			return jsonHTTPResponse(200, `{"api_version":"openguin-local-api/v1","models":["fixture"],"loaded_models":[],"capabilities":["read-only-advisory"],"accepted_context_schemas":["sentinel.system-evidence-context/v1"],"advisory_only":true}`), nil
		case "/v1/status":
			return jsonHTTPResponse(200, `{"api_version":"openguin-local-api/v1","runtime":{"reachable":true},"infrastructure":{"requests_active":0}}`), nil
		case "/v1/policies":
			return jsonHTTPResponse(200, `{"policies":[{"id":"sentinel-system-evidence/v1","context_schema":"sentinel.system-evidence-context/v1"}]}`), nil
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
			return nil, nil
		}
	})}

	req := httptest.NewRequest(http.MethodGet, "/api/ai/openguin/status", nil)
	rec := httptest.NewRecorder()
	(&app{}).handleOpenPenguinStatus(rec, req)
	if rec.Code != http.StatusOK { t.Fatalf("status code = %d", rec.Code) }
	body := rec.Body.String()
	for _, path := range []string{"/v1/capabilities", "/v1/status", "/v1/policies"} { if !seen[path] { t.Fatalf("missing upstream call %s", path) } }
	if !strings.Contains(body, `"available":true`) || !strings.Contains(body, `"infrastructure_status"`) || !strings.Contains(body, `"policy_registry"`) { t.Fatalf("unexpected status body: %s", body) }
}

func TestOpenPenguinAdvisorySendsClientIdentityAndAllowsAutoModel(t *testing.T) {
	old := openPenguinHTTPClient
	defer func() { openPenguinHTTPClient = old }()
	openPenguinHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "127.0.0.1:11436" || r.URL.Path != "/v1/advisory" || r.Method != http.MethodPost { t.Fatalf("unexpected advisory target: %s %s", r.Method, r.URL.String()) }
		raw, _ := io.ReadAll(r.Body)
		for _, required := range [][]byte{[]byte(`"api_version":"openguin-local-api/v1"`), []byte(`"schema":"sentinel.system-evidence-context/v1"`), []byte(`"app_id":"sentinel-macos"`), []byte(`"model":"auto"`)} {
			if !bytes.Contains(raw, required) { t.Fatalf("missing contract fragment %s in %s", required, raw) }
		}
		return jsonHTTPResponse(200, `{"schema":"openguin.local-advisory-response/v1","request_id":"fixture","answer":"Observed facts remain separate from interpretation.","model":"fixture","model_route":"loaded-first","executed":true,"mutation_authority":true}`), nil
	})}

	payload := `{"context":{"schema":"sentinel.system-evidence-context/v1","evidence_packet":{"kind":"fixture"}},"question":"What changed?","temperature":0.18}`
	req := httptest.NewRequest(http.MethodPost, "/api/ai/openguin/advisory", strings.NewReader(payload))
	rec := httptest.NewRecorder()
	(&app{}).handleOpenPenguinAdvisory(rec, req)
	if rec.Code != http.StatusOK { t.Fatalf("status code = %d body=%s", rec.Code, rec.Body.String()) }
	body := rec.Body.String()
	if !strings.Contains(body, `"executed":false`) || !strings.Contains(body, `"mutation_authority":false`) { t.Fatalf("Sentinel did not enforce advisory-only response: %s", body) }
	if !strings.Contains(body, "Sentinel observed evidence remains authoritative") { t.Fatalf("Sentinel authority marker missing: %s", body) }
}

func TestOpenPenguinAdvisoryRejectsWrongContextBeforeProxy(t *testing.T) {
	old := openPenguinHTTPClient
	defer func() { openPenguinHTTPClient = old }()
	called := false
	openPenguinHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) { called = true; return jsonHTTPResponse(500, `{}`), nil })}
	payload := `{"context":{"schema":"labbridge.ai-context/v1"},"question":"x","model":"fixture","temperature":0.1}`
	req := httptest.NewRequest(http.MethodPost, "/api/ai/openguin/advisory", strings.NewReader(payload))
	rec := httptest.NewRecorder()
	(&app{}).handleOpenPenguinAdvisory(rec, req)
	if rec.Code != http.StatusBadRequest { t.Fatalf("expected 400, got %d", rec.Code) }
	if called { t.Fatal("wrong-schema request reached OpenPenguin") }
}

func TestOpenPenguinProxyRejectsWrongMethods(t *testing.T) {
	statusReq := httptest.NewRequest(http.MethodPost, "/api/ai/openguin/status", nil)
	statusRec := httptest.NewRecorder()
	(&app{}).handleOpenPenguinStatus(statusRec, statusReq)
	if statusRec.Code != http.StatusMethodNotAllowed { t.Fatalf("status POST = %d", statusRec.Code) }
	advReq := httptest.NewRequest(http.MethodGet, "/api/ai/openguin/advisory", nil)
	advRec := httptest.NewRecorder()
	(&app{}).handleOpenPenguinAdvisory(advRec, advReq)
	if advRec.Code != http.StatusMethodNotAllowed { t.Fatalf("advisory GET = %d", advRec.Code) }
}
