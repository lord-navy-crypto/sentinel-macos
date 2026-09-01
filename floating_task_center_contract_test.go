// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "strings"
    "testing"
)

func TestFloatingTaskCenterContract(t *testing.T) {
    taskJS, err := os.ReadFile("web/app/task-center.js")
    if err != nil { t.Fatal(err) }
    taskCSS, err := os.ReadFile("web/app/task-center.css")
    if err != nil { t.Fatal(err) }
    index, err := os.ReadFile("web/index.html")
    if err != nil { t.Fatal(err) }
    system, err := os.ReadFile("web/app/lenses/system.js")
    if err != nil { t.Fatal(err) }
    scan, err := os.ReadFile("web/app/full-scan.js")
    if err != nil { t.Fatal(err) }
    js, css, page := string(taskJS), string(taskCSS), string(index)
    required := []string{"Sentinel 2.7 Floating Task Center", "Possibly stalled", "Progress cannot be measured", "task-start", "requestCancel", "showAfter:450"}
    for _, token := range required { if !strings.Contains(js, token) { t.Fatalf("Task Center missing %q", token) } }
    if !strings.Contains(css, "#22c55e") || !strings.Contains(css, "task-indeterminate") { t.Fatal("Task Center green measured/indeterminate progress styling missing") }
    if !strings.Contains(page, "/app/task-center.css") || !strings.Contains(page, "/app/task-center.js") { t.Fatal("Task Center assets are not wired into product index") }
    if strings.Index(page, "/app/task-center.js") > strings.Index(page, "/app/lenses/orient-investigate.js") { t.Fatal("Task Center must load before product modules so api/download wrappers are inherited") }
    if !strings.Contains(string(system), "Storage measurement") || !strings.Contains(string(system), "phasePct") || !strings.Contains(string(system), "S.TaskCenter.update") { t.Fatal("Storage measured progress is not connected to Task Center") }
    if !strings.Contains(string(scan), "label: 'Full Scan'") || !strings.Contains(string(scan), "S.TaskCenter.update(fullScan.taskID") { t.Fatal("Full Scan measured progress is not connected to Task Center") }
}
