// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestStorageReviewTaskAdoptionContract(t *testing.T) {
	raw, err := os.ReadFile("web/app/storage-review-workbench.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`Sentinel 3.5 Storage Review Task Adoption`,
		`const TASK_SOURCE='Maintenance → Storage Review';`,
		`const activeReviews=new Map();`,
		`function reviewKey(type,...parts)`,
		`async function executeReview({key,label,detail},operation)`,
		`const existing=activeReviews.get(key);`,
		`if(existing){`,
		`Sentinel did not start a second scan.`,
		`const state={taskId:createTask(label,detail,key)};`,
		`activeReviews.set(key,state);`,
		`if(activeReviews.get(key)===state)activeReviews.delete(key);`,
		`kind:'storage-review',source:TASK_SOURCE,dedupeKey:key`,
		`S.TaskCenter?.setRetry?.(state.taskId,'Retry',retry);`,
		`S.TaskCenter?.setResult?.(state.taskId,'Review results'`,
		`const snapshot=result.html;`,
		`current.innerHTML=snapshot;`,
		`current.scrollIntoView({behavior:'smooth',block:'nearest'});`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("missing Storage Review task-adoption marker %q", want)
		}
	}
}

func TestStorageReviewSingleFlightKeysIncludeParameters(t *testing.T) {
	raw, err := os.ReadFile("web/app/storage-review-workbench.js")
	if err != nil { t.Fatal(err) }
	source := string(raw)
	for _, want := range []string{
		`reviewKey('old',path,days,min)`,
		`reviewKey('downloads','~/Downloads')`,
		`reviewKey('duplicates',path,min)`,
		`reviewKey('app',app)`,
	} {
		if !strings.Contains(source, want) {
			t.Fatalf("single-flight key must preserve operation parameters; missing %q", want)
		}
	}
}

func TestStorageReviewTaskAdoptionReusesReadOnlyAPIs(t *testing.T) {
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
			t.Fatalf("missing existing read-only Storage Review API %q", want)
		}
	}
	for _, forbidden := range []string{
		`method:'POST'`,
		`method:"POST"`,
		`/api/cleanup/`,
		`/api/actions/execute`,
		`Move to Trash`,
		`data-do="delete`,
		`/api/task-center/`,
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("Storage Review task adoption must remain read-only; found %q", forbidden)
		}
	}
}

func TestStorageReviewTaskAdoptionJavaScriptSyntax(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil { return }
	cmd := exec.Command(node, "--check", "web/app/storage-review-workbench.js")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("storage-review-workbench.js syntax check failed: %v\n%s", err, out)
	}
}
