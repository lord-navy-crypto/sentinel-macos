# Sentinel macOS v1.2 — Change Intelligence

V1.2 adds session-only directory change intelligence while preserving v1.1 Power Search/Weakness Audit, v1.0 Easy Mode, and v0.9 reversible Safe Actions.

## Added
- Easy Mode **Change Monitor**.
- Native macOS CoreServices FSEvents source bridge (`darwin && cgo`).
- Explicit bounded polling fallback for cross-built binaries.
- Persistence / Downloads / Workspace / Custom Home watch presets.
- Item-level normalized change categories.
- Conservative dropped/root-change → rescan-required semantics.
- Bounded Change Inbox (1,000 in-memory events).
- Duplicate event coalescing and fallback parent-directory noise suppression.
- Targeted reinspection of changed persistence configuration and a bounded set of changed regular files.
- Change event integration with Power Search, Review Queue, Timeline, Quick Check, Visibility Coverage, Weakness Audit, full reports, and diagnostics.
- `CHANGE_MONITOR_GUIDE.md`.

## Build behavior
`build-macos.sh` enables CGO/native CoreServices FSEvents when it is executed on a real Mac with clang. In non-macOS build environments it produces functional polling-fallback Mac binaries and writes `dist/CHANGE_MONITOR_MODE.txt`.

## Not claimed
V1.2 is still not an Endpoint Security client or complete EDR. Endpoint Security remains a separate entitlement/System Extension layer.
