# Sentinel 2.7 — Resilient Local Intelligence

Sentinel 2.7 promotes the hardening work completed in the 2.6 stabilization cycle into a new release line focused on resilience, recoverability, bounded resource use, and evidence integrity.

## Highlights

- Storage analysis now has an explicit active-job concurrency gate so repeated deep scans cannot create unbounded simultaneous filesystem work.
- Safe Actions treat recovery-journal persistence as part of the mutation transaction. Journal failures no longer silently report success, and rollback paths are explicit.
- Trust Profile load, validation, rollback-point creation, and Restore Previous use hardened private-state I/O with bounded reads, symlink protection, atomic replacement, user-only permissions, and backup recovery.
- Full Scan distinguishes DONE, LIMITED, FAILED, and CANCELLED instead of collapsing backend failures into limited evidence.
- Change Monitor and Incident history expose persistence health instead of silently hiding failed state writes.
- Local AI reliability includes model-load watchdogs, generation-stall detection, bounded interruption, forced worker/engine reset, diagnostics, and deterministic evidence fallback.
- Localhost request protection, runtime locking, Vault path isolation, desktop bootstrap validation, packaging contracts, reinstall verification, and production release provenance were strengthened.
- Production releases reject dirty source trees and portable fallback engines and verify exact source commit provenance in the packaged app.

## Version name

**Sentinel 2.7 — Resilient Local Intelligence**

The name reflects the release emphasis: Sentinel should remain understandable and recoverable when evidence sources are limited, state writes fail, scans are cancelled, Local AI stalls, or macOS capabilities differ between systems.

## Validation status

The preceding hardening candidate passed the full Sentinel validation pipeline on macOS, including Go tests, product contracts, localhost functional smoke, Darwin arm64/x86_64 builds, Sentinel.app packaging, race tests, go vet, JavaScript syntax, auxiliary JavaScript syntax, and shell syntax.

The 2.7 version bump itself must pass the same CI before it should be merged to main or treated as a release candidate. Real-Mac validation remains required for WebGPU/WebLLM downloads and IndexedDB reuse, FSEvents and sleep/wake behavior, Full Disk Access boundaries, real Safe Action/Vault recovery, Finder integration, and Developer ID signing/notarization.
