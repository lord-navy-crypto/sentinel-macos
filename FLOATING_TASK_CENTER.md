# Floating Task Center

Sentinel's Floating Task Center provides a persistent, non-blocking view of explicit operations started from the UI.

## Behavior

- Appears as a floating panel near the lower-right corner of the application.
- Tracks explicit scan, refresh, export, system, advanced, form, and action operations.
- Mirrors the existing activity bar for generic percentage and detail updates.
- Reads Full Scan's native stage progress for an exact stage-based percentage.
- Shows elapsed time for every tracked task.
- Marks a running task as **Possibly stalled** after 45 seconds without visible progress or detail changes; this is a visibility warning, not a claim that the underlying operation has failed.
- Shows a workload-pressure notice when four or more operations are active.
- Exposes cancellation only when Sentinel already has a defined cancellation route (currently Full Scan).
- Completed/failed/cancelled tasks remain visible until cleared, so users can see which commands actually ran.

## Architecture

`web/app/runtime.js` dynamically loads `web/app/task-center.js`. The Task Center then loads its own same-origin stylesheet, `web/app/task-center.css`.

This preserves the canonical static script order and script-count contracts in `web/index.html` while keeping the feature part of the embedded `web/*` application payload.

The public runtime API is available as `window.SentinelApp.TaskCenter` with `create`, `update`, `finish`, `fail`, and `cancel` helpers so additional Sentinel modules can publish richer task progress over time.
