# Sentinel macOS V2.1 — Final Hardening

V2.1 is a stabilization and usability release built on the V2.0 Incident Intelligence architecture.

## Added

- Final Readiness self-check on Home.
- Single persistent-instance lock with stale-lock recovery.
- Graceful SIGINT/SIGTERM shutdown and active storage-job cancellation.
- Durable atomic Sentinel state writer with user-only permissions and last-known-good `.bak` recovery.
- State recovery visibility in Readiness and full reports.
- Strict bounded JSON request decoding.
- Heavy local-analysis concurrency gate with HTTP 429 backpressure.
- Time-windowed Incident correlation.
- Stable Incident story merging and active/historical lifecycle state.
- Incident Deep Review.
- Vault footprint/advisory fields.
- Versioned report/diagnostics schemas.
- Dynamic `Sentinel.app` version from `VERSION`.

## Still intentionally absent

- Permanent file deletion.
- Automatic malware verdicts.
- Silent Full Disk Access acquisition.
- Automatically enabled Endpoint Security System Extension.
- Claims that a fallback build has native FSEvents/Security.framework capability.

## Compatibility

V2.1 loads V2.0 Incident History schema and upgrades new writes to Incident History schema version 2.
