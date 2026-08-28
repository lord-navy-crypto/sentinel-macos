// SPDX-License-Identifier: MPL-2.0
package main

import "testing"

func TestAdvancedSensorNeverClaimsEnabledByDefault(t *testing.T) {
	s := advancedSensorStatus()
	if s.Enabled {
		t.Fatal("sensor must not claim enabled without entitlement/install verification")
	}
	if !s.EntitlementNeeded {
		t.Fatal("entitlement boundary must be explicit")
	}
}
