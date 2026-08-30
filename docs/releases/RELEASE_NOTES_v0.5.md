# Sentinel macOS v0.5 — Behavior Diff

v0.5 adds snapshot-to-snapshot and cross-session behavior comparison without installing a background daemon.

## Highlights

- compact persistent local behavior baseline
- code Identifier / Team ID change detection
- executable size/modification change detection
- startup and Background Item change detection
- new public endpoint detection
- parent launch-context change detection
- High / Review / Info change triage in the localhost UI
- Behavior Diff events can feed the existing Activity Timeline
- `--ephemeral` mode for memory-only comparison, plus `--no-browser`, `--port`, and `--version` CLI options

## Privacy boundary

The baseline is app-owned metadata only and is stored with user-only permissions. File contents and complete process command lines are not persisted.

## Still conservative

v0.5 remains non-destructive: no file deletion, process killing, startup disabling, quarantine, or background daemon.
