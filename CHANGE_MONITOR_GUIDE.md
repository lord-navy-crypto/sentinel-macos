# Change Monitor Guide — Sentinel macOS V2.1

## Native stream vs portable fallback

A real-macOS CGO build can use CoreServices FSEvents with item-level events and WatchRoot. The portable cross-built release uses bounded metadata polling and labels itself as fallback.

## Persistent checkpoint and history

When persistent mode is active, Sentinel stores:

- `change-history.json.gz` — at most 500 compact Change Events;
- `change-checkpoint.json.gz` — watched roots, last native FSEvent ID, and whether the prior stream required reconciliation.

Both are Sentinel-owned local metadata with mode `0600`. File contents are not stored.

## Smart resume

If a previous native checkpoint is valid, its watched roots match the new session, and the previous stream did not require a rescan, Sentinel passes the saved event ID back to the native stream as the resume point.

If Apple signals `MustScanSubDirs`, `UserDropped`, `KernelDropped`, or a watched root change, Sentinel refuses to treat the stream as continuous.

## Reconcile hierarchy

`Reconcile hierarchy` performs a bounded current-state walk of the active roots. The rescan-required state is cleared only if every root completes within the reconciliation budget. This creates a fresh current-state view; it cannot reconstruct every historical event that may have been dropped.

## Targeted Review

Targeted Review rechecks changed persistence configuration and a bounded set of changed regular files instead of rescanning the whole Mac. It can feed Integrity Lab evidence and the Incident Engine.

## Privacy

Monitoring starts only after the user presses Start Watch. No background daemon is installed. Watching stops when Sentinel exits. In `--ephemeral` mode, Change History and checkpoints remain memory-only.
