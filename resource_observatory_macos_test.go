// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"runtime"
	"testing"
	"time"
)

func TestResourceObservatoryLiveMacSmoke(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("Resource Observatory live smoke is macOS-specific")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	sample := captureResourceSample(ctx)
	if sample.CapturedAt.IsZero() {
		t.Fatal("live Resource Observatory sample must include capture time")
	}
	if sample.CPUPercent < 0 || sample.CPUPercent > 100 {
		t.Fatalf("normalized CPU percent out of range: %v", sample.CPUPercent)
	}
	if len(sample.TopCPU) == 0 {
		t.Fatal("live Resource Observatory sample returned no process rows")
	}
	resourceHistory.add(sample)
	if got := resourceHistory.since(time.Minute); len(got) == 0 {
		t.Fatal("resource history did not retain live sample")
	}
}
