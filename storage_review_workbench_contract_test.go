// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestStorageReviewWorkbenchRuntimeContract(t *testing.T) {
	raw, err := os.ReadFile("web/app/runtime.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`function loadStorageReviewWorkbench()`,
		`script.src='/app/storage-review-workbench.js'`,
		`script.dataset.sentinelStorageReviewWorkbench='1'`,
		`loadStorageReviewWorkbench();`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Storage Review Workbench runtime marker %q", want)
		}
	}
}

func TestStorageReviewWorkbenchEvidenceContract(t *testing.T) {
	raw, err := os.ReadFile("web/app/storage-review-workbench.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`Sentinel 3.3 Storage Review Workbench`,
		`OBSERVED`,
		`INTERPRETATION`,
		`REVIEW CANDIDATES`,
		`NOT ESTABLISHED`,
		`new Set(['old','downloads','duplicates','app'])`,
		`data-storage-review-inspect`,
		`S.Workbench.setSelection({type:'file'`,
		`S.Workbench.recordEvent?.('storage-review-selection'`,
		`S.Workbench.open('overview')`,
		`event.stopImmediatePropagation();`,
		`},true);`,
		`full-file SHA-256 equality`,
		`Association evidence is not ownership proof`,
		`Medium-confidence or Group Container paths may be shared`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Storage Review Workbench evidence marker %q", want)
		}
	}
}

func TestStorageReviewWorkbenchRemainsReadOnly(t *testing.T) {
	raw, err := os.ReadFile("web/app/storage-review-workbench.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, forbidden := range []string{
		`method:'POST'`,
		`method:"POST"`,
		`/api/cleanup/`,
		`/api/actions/execute`,
		`/api/actions/vault`,
		`os.Remove`,
		`Delete`,
		`Move to Trash`,
		`data-do="delete`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("Storage Review Workbench must remain read-only; found %q", forbidden)
		}
	}
}

func TestStorageReviewWorkbenchReusesExistingReadOnlyAPIs(t *testing.T) {
	raw, err := os.ReadFile("web/app/storage-review-workbench.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`/api/maintenance/old-files`,
		`/api/maintenance/downloads`,
		`/api/maintenance/duplicates`,
		`/api/maintenance/app-footprint`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing existing read-only review API %q", want)
		}
	}
	for _, forbidden := range []string{
		`/api/maintenance/review`,
		`/api/storage/review`,
		`/api/finder/`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("Storage Review Workbench must not invent a new backend route; found %q", forbidden)
		}
	}
}
