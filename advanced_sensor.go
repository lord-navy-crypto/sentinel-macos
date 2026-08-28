// SPDX-License-Identifier: MPL-2.0
package main

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
)

type AdvancedSensorStatus struct {
	Platform          string `json:"platform"`
	SupportedPlatform bool   `json:"supported_platform"`
	SensorPresent     bool   `json:"sensor_present"`
	Enabled           bool   `json:"enabled"`
	EntitlementNeeded bool   `json:"entitlement_needed"`
	FullDiskAccess    bool   `json:"full_disk_access_required"`
	Mode              string `json:"mode"`
	Note              string `json:"note"`
}

func advancedSensorStatus() AdvancedSensorStatus {
	present := false
	if exe, err := os.Executable(); err == nil {
		for _, p := range []string{filepath.Join(filepath.Dir(exe), "sentinel-es-sensor"), filepath.Join(filepath.Dir(exe), "..", "Resources", "sentinel-es-sensor")} {
			if st, e := os.Stat(p); e == nil && st.Mode().IsRegular() {
				present = true
				break
			}
		}
	}
	note := "Optional notification-only Endpoint Security sensor source is included for real-Mac entitlement builds. Sentinel V2.2 does not claim the sensor is active unless a separately entitled, user-approved System Extension is installed."
	return AdvancedSensorStatus{Platform: runtime.GOOS, SupportedPlatform: runtime.GOOS == "darwin", SensorPresent: present, Enabled: false, EntitlementNeeded: true, FullDiskAccess: true, Mode: "scaffold-not-enabled", Note: note}
}
func (a *app) handleAdvancedSensorStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, 405, map[string]any{"error": "GET required"})
		return
	}
	writeJSON(w, 200, advancedSensorStatus())
}
