# Sentinel macOS v0.6 — Behavior History & Evidence Pressure

v0.6 turns Behavior Diff from a one-comparison feature into a bounded historical intelligence layer without installing a daemon.

## Added

- bounded local Behavior Diff history (maximum 40 captures)
- Evidence Pressure Index (0–100) and risk band
- capture-to-capture risk delta
- trend visualization in localhost UI
- Object Story cross-session history
- `/api/behavior/history`
- `/api/behavior/health`
- baseline/history permission and parse-integrity checks
- Behavior History + Health included in exported local report
- persistent history file with `0600` permissions
- full in-memory equivalent under `--ephemeral`

## Privacy

The new history stores diff metadata, not full machine snapshots. It does not persist file contents, full process arguments, packets, browser history, or keystrokes.

## Safety

v0.6 remains read-only toward user/system content: no delete, kill, disable, quarantine, or background daemon.
