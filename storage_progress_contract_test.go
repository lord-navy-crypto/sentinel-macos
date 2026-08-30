// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"strings"
	"testing"
)

func TestStorageProgressContract(t *testing.T) {
	goBytes, err := os.ReadFile("advanced.go"); if err != nil { t.Fatal(err) }
	jsBytes, err := os.ReadFile("web/app/controller.js"); if err != nil { t.Fatal(err) }
	goSource := string(goBytes); js := string(jsBytes)
	for _, field := range []string{`json:"phase"`,`json:"phase_percent"`,`json:"slow_paths_skipped"`,`json:"current_dir,omitempty"`,`json:"hash_files_done"`,`json:"hash_files_total"`,`json:"hash_bytes_done"`,`json:"hash_bytes_total"`,`json:"current_hash_path,omitempty"`} { if !strings.Contains(goSource, field) { t.Fatalf("advanced.go missing storage progress field %q", field) } }
	for _, field := range []string{"j.phase","j.phase_percent","j.hash_files_done","j.hash_files_total","j.hash_bytes_done","j.hash_bytes_total","j.current_hash_path","Hash candidates","Building storage report"} { if !strings.Contains(js, field) { t.Fatalf("storage progress UI missing %q", field) } }
}

func TestStorageWalkerHasSlowPathGuards(t *testing.T) {
	b, err := os.ReadFile("advanced.go"); if err != nil { t.Fatal(err) }; source := string(b)
	for _, required := range []string{"readStorageDirBatches","storageDirBatchSize","storageDirIdleTimeout","storageMaxSlowPaths","errStorageSlowDirectory","Readdir(storageDirBatchSize)","SlowPathsSkipped"} { if !strings.Contains(source, required) { t.Fatalf("resilient storage walker missing %q", required) } }
	if strings.Contains(source, "filepath.WalkDir(root") { t.Fatal("advanced storage scan must not use the old monolithic filepath.WalkDir path") }
}

func TestDuplicateHashPlannerRequiresComparablePairs(t *testing.T) {
	goBytes, err := os.ReadFile("advanced.go"); if err != nil { t.Fatal(err) }; source := string(goBytes)
	for _, required := range []string{"buildDuplicateHashPlan","grp.size > remaining/2","maxFiles < 2","duplicateHashBudget"} { if !strings.Contains(source, required) { t.Fatalf("duplicate hash planner missing guard %q", required) } }
}
