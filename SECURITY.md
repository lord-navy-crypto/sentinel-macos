# Security model — Sentinel macOS V2.1

## Core principles

1. Bind the web server only to `127.0.0.1`.
2. Require a random per-session API token.
3. Reject unexpected Host headers and cross-origin / cross-site API requests.
4. Keep CSP strict and local-resource-only.
5. Treat missing evidence as reduced visibility, never invented safety.
6. Keep user-file actions reversible; no permanent-delete endpoint exists.
7. Never claim entitlement-gated Apple telemetry unless actually installed, approved, and active.

## Incident data

Incident History is compact metadata and may include local paths and evidence summaries. It is sensitive diagnostic information. The store is bounded to 120 incidents and compressed locally. `--ephemeral` keeps it in memory only.

## Change data

Change History is bounded to 500 events and stores paths/metadata, not file contents. Native checkpoints store watched roots and the last event ID. Dropped/root-changed flags preserve a rescan-required state until a bounded hierarchy reconciliation succeeds.

## Native static-code validation

Real-macOS CGO builds can call Security.framework static-code validation and request all-architecture validation for universal code. The outcome is evidence about signature/sealed-code validity at the time of validation, not a statement about benign intent.

## Endpoint Security

The normal V2.1 release does not install an Endpoint Security System Extension. `endpointsecurity/` is an inactive notification-only scaffold. Apple entitlement approval, System Extension packaging, Full Disk Access/user approval, signing, update/deactivation lifecycle, and real-Mac review are mandatory before production enablement.

## Safe Actions

Reveal / Rename / Vault / Restore remain the only supported actions. The normal action pipeline uses preview expiry, dependency context, typed confirmation, one-time code, TOCTOU revalidation, no-overwrite movement, Vault manifests, and a local journal. Vaulting a file does not terminate a running process.

## V2.1 runtime/state hardening

- Persistent state is guarded against concurrent Sentinel writers.
- Sentinel-owned JSON/gzip writes use same-directory atomic replacement, sync, `0600` files, and `0700` directories.
- A single last-known-good `.bak` copy may be used for read recovery; Readiness reports when this occurs.
- Expensive API operations share a bounded work gate rather than allowing unlimited concurrent local analysis.
- JSON request bodies are size-bounded, reject unknown fields, and reject trailing/multiple JSON values.
- Graceful shutdown stops Change Monitor and cancels active Storage scans before process exit.
