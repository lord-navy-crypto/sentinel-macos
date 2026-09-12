// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	openPenguinBase           = "http://127.0.0.1:11436"
	openPenguinAPIVersion     = "openguin-local-api/v1"
	sentinelEvidenceSchema    = "sentinel.system-evidence-context/v1"
	maxOpenPenguinRequestBody = 384 * 1024
	maxOpenPenguinResponse    = 2 * 1024 * 1024
)

var openPenguinHTTPClient = &http.Client{Timeout: 10 * time.Minute}

type sentinelOpenPenguinRequest struct {
	Context     map[string]any `json:"context"`
	Question    string         `json:"question"`
	Model       string         `json:"model"`
	Temperature float64        `json:"temperature,omitempty"`
}

func writeBridgeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func readBoundedJSON(r *http.Request, dst any, limit int64) error {
	reader := io.LimitReader(r.Body, limit+1)
	data, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	if int64(len(data)) > limit {
		return fmt.Errorf("request exceeds %d-byte limit", limit)
	}
	if len(data) == 0 {
		return fmt.Errorf("request body is required")
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	if err := dec.Decode(dst); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	return nil
}

func openPenguinGet(path string, timeout time.Duration) (int, []byte, error) {
	client := *openPenguinHTTPClient
	client.Timeout = timeout
	req, err := http.NewRequest(http.MethodGet, openPenguinBase+path, nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxOpenPenguinResponse+1))
	if err != nil {
		return resp.StatusCode, nil, err
	}
	if len(data) > maxOpenPenguinResponse {
		return resp.StatusCode, nil, fmt.Errorf("OpenPenguin response exceeded local safety limit")
	}
	return resp.StatusCode, data, nil
}

func openPenguinPost(path string, payload any) (int, []byte, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return 0, nil, err
	}
	if len(data) > maxOpenPenguinRequestBody {
		return 0, nil, fmt.Errorf("OpenPenguin request exceeded local safety limit")
	}
	req, err := http.NewRequest(http.MethodPost, openPenguinBase+path, bytes.NewReader(data))
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	resp, err := openPenguinHTTPClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxOpenPenguinResponse+1))
	if err != nil {
		return resp.StatusCode, nil, err
	}
	if len(body) > maxOpenPenguinResponse {
		return resp.StatusCode, nil, fmt.Errorf("OpenPenguin response exceeded local safety limit")
	}
	return resp.StatusCode, body, nil
}

func (a *app) handleOpenPenguinStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeBridgeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "GET required", "available": false})
		return
	}
	status, body, err := openPenguinGet("/v1/capabilities", 1500*time.Millisecond)
	if err != nil {
		writeBridgeJSON(w, http.StatusOK, map[string]any{
			"available": false,
			"mode":      "sentinel-webllm-fallback",
			"error":     err.Error(),
			"base":      openPenguinBase,
		})
		return
	}
	var upstream map[string]any
	if err := json.Unmarshal(body, &upstream); err != nil || status < 200 || status >= 300 {
		writeBridgeJSON(w, http.StatusOK, map[string]any{
			"available": false,
			"mode":      "sentinel-webllm-fallback",
			"error":     "OpenPenguin capability response unavailable or invalid",
			"base":      openPenguinBase,
		})
		return
	}
	accepted := false
	if schemas, ok := upstream["accepted_context_schemas"].([]any); ok {
		for _, item := range schemas {
			if item == sentinelEvidenceSchema {
				accepted = true
				break
			}
		}
	}
	writeBridgeJSON(w, http.StatusOK, map[string]any{
		"available":              accepted,
		"mode":                   "openguin-local-infrastructure",
		"base":                   openPenguinBase,
		"api_version":            upstream["api_version"],
		"models":                 upstream["models"],
		"capabilities":           upstream["capabilities"],
		"accepted_context_schema": accepted,
		"advisory_only":          true,
	})
}

func (a *app) handleOpenPenguinAdvisory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeBridgeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "POST required", "executed": false})
		return
	}
	var in sentinelOpenPenguinRequest
	if err := readBoundedJSON(r, &in, maxOpenPenguinRequestBody); err != nil {
		writeBridgeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error(), "executed": false})
		return
	}
	if in.Context == nil || in.Context["schema"] != sentinelEvidenceSchema {
		writeBridgeJSON(w, http.StatusBadRequest, map[string]any{"error": "context.schema must be sentinel.system-evidence-context/v1", "executed": false})
		return
	}
	if len(in.Question) == 0 || len(in.Question) > 20000 {
		writeBridgeJSON(w, http.StatusBadRequest, map[string]any{"error": "question must be 1..20000 characters", "executed": false})
		return
	}
	if len(in.Model) == 0 || len(in.Model) > 180 {
		writeBridgeJSON(w, http.StatusBadRequest, map[string]any{"error": "model is required", "executed": false})
		return
	}
	if in.Temperature < 0 || in.Temperature > 2 {
		writeBridgeJSON(w, http.StatusBadRequest, map[string]any{"error": "temperature must be within 0..2", "executed": false})
		return
	}
	payload := map[string]any{
		"api_version": openPenguinAPIVersion,
		"context":     in.Context,
		"question":    in.Question,
		"model":       in.Model,
		"temperature": in.Temperature,
	}
	status, body, err := openPenguinPost("/v1/advisory", payload)
	if err != nil {
		writeBridgeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error":     err.Error(),
			"available": false,
			"fallback":  "sentinel-webllm",
			"executed":  false,
		})
		return
	}
	if status < 200 || status >= 300 {
		var upstream any
		_ = json.Unmarshal(body, &upstream)
		writeBridgeJSON(w, http.StatusBadGateway, map[string]any{
			"error":     "OpenPenguin advisory request failed",
			"upstream":  upstream,
			"fallback":  "sentinel-webllm",
			"executed":  false,
		})
		return
	}
	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		writeBridgeJSON(w, http.StatusBadGateway, map[string]any{"error": "OpenPenguin returned invalid JSON", "fallback": "sentinel-webllm", "executed": false})
		return
	}
	out["executed"] = false
	out["sentinel_authority"] = "Sentinel observed evidence remains authoritative; this response is interpretation only."
	writeBridgeJSON(w, http.StatusOK, out)
}
