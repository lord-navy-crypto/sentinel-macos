// SPDX-License-Identifier: MPL-2.0
package main

import (
	_ "embed"
	"strings"
)

// VERSION is the single source of truth for the product version used by both
// the Go engine and the macOS app bundle packaging scripts.
//
//go:embed VERSION
var embeddedVersion string

var sentinelVersion = strings.TrimSpace(embeddedVersion)
