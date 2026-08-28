// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

const maxAPIJSONBytes = 1 << 20

// decodeJSON is deliberately strict: requests are bounded, unknown fields are
// rejected, and trailing JSON values are not accepted. This keeps localhost
// mutation/control APIs predictable even when called by custom scripts.
func decodeJSON(r *http.Request, dst any) error {
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxAPIJSONBytes+1))
	if err != nil {
		return err
	}
	if len(raw) > maxAPIJSONBytes {
		return fmt.Errorf("request body exceeds %d bytes", maxAPIJSONBytes)
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values are not allowed")
		}
		return fmt.Errorf("trailing JSON data: %w", err)
	}
	return nil
}
