# Sentinel macOS v0.7 — Trusted Profile & Drift

v0.7 adds an explicit, user-approved reference layer on top of Behavior History.

## New
- Trusted Profile page and API.
- Bounded local SHA-256 fingerprints for priority executable/script targets.
- Trust Drift Index and Profile Coverage.
- Bounded Trust Drift History (20 comparisons) with profile timestamp per entry.
- Novel-object, fingerprint, Team ID, Identifier, persistence, startup-target, and parent-context drift evidence.
- Trusted Profile context inside Object Story.
- Trust reference labels inside Security Audit without automatic risk reduction.
- One-step previous-profile backup and explicit restore.
- Trust Profile permission/integrity health checks.
- `--doctor` CLI self-check.
- Low-sensitivity diagnostics export.
- Trust Drift events integrated into the current-session timeline.
- Build script now produces binary SHA-256 checksums.
- Runner now rejects unknown architectures and forwards CLI arguments.

## Security / privacy hardening
- Behavior, History, and Trust state writes re-apply `0700` on Sentinel's state directory.
- State JSON remains `0600`.
- Trusted Profile persists fingerprints and bounded metadata, never file contents.
- `--ephemeral` keeps Trust state in memory only.
- Profile membership is explicitly not treated as proof of safety.

## Still intentionally absent
- delete-file endpoints
- process killing
- disabling startup/background items
- quarantine
- packet capture
- cloud reputation lookup
- background daemon / Endpoint Security monitoring
