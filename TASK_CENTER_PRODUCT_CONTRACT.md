# Task Center Product Contract

The Floating Task Center must preserve these product guarantees:

1. It is a visibility layer over explicit user operations; it does not silently start scans or mutations.
2. A task entry appears when an operation is explicitly triggered and remains visible after completion until cleared.
3. Running tasks expose a progress percentage when Sentinel has measurable progress and otherwise retain the latest observable percentage/detail.
4. Full Scan reuses its native stage progress instead of inventing synthetic completion percentages.
5. A green progress bar is the normal running/completed visual; failed or stalled states use their semantic status styles.
6. A task may be labelled `Possibly stalled` after 45 seconds without observable progress. This is not treated as proof that the operation failed.
7. When four or more tasks are active, the panel warns about workload pressure rather than silently accepting an apparently frozen UI.
8. Cancellation is exposed only for operations that already have a defined Sentinel cancellation path.
9. The panel is collapsible and non-modal; it must not block the primary evidence workspace.
10. The feature must preserve the canonical static `web/index.html` module order and existing product script-count contracts.

Runtime marker: `Sentinel 2.9 Floating Task Center`.
