# Sentinel macOS V2.1 — Testing

## Automated release checks

```bash
go test ./...
go test -race ./...
go vet ./...
node --check web/app.js
```

## V2.1-specific automated coverage

- Incident correlation across multiple evidence sources.
- Incident compressed-history persistence.
- Change compressed-history + checkpoint reload and `0600` modes.
- `--ephemeral` Change History no-disk behavior.
- Reconcile hierarchy clears rescan state only after a complete bounded walk.
- Native validation schema always reports explicit availability.
- Advanced Sensor status never claims enabled by default.
- Existing Safe Actions, search, localhost-hardening, Behavior, Trust, persistence, and storage tests.

## Required real-Mac validation

The current execution host is not macOS. Before calling native features production-validated, test on real Apple Silicon and Intel Macs:

- native CoreServices FSEvents start/stop, checkpoint resume, event-ID continuity, dropped flags, root moved, sleep/wake;
- Security.framework static validation on valid, invalid, ad-hoc, unsigned, app-bundle, and universal code;
- `codesign`, `spctl`, `sfltool`, `lsof`, Finder Reveal, Full Disk Access behavior;
- `Sentinel.app` launch, Developer ID signing, notarization, stapling, Gatekeeper;
- optional Endpoint Security System Extension only after Apple entitlement approval.

## V2.1 final-hardening coverage

Automated tests cover:

- atomic JSON/gzip state replacement and `.bak` recovery;
- `0600` backup permissions;
- single persistent-instance rejection and lock reacquisition;
- strict JSON decoding (unknown fields, multiple values, oversized body);
- Incident time-window separation;
- existing Safe Actions no-overwrite / symlink / recovery guards.

Release validation additionally exercises localhost Readiness, Change/Persistence/Incident flow, Incident Deep Review, report schema v2, second-instance rejection, ephemeral parallel launch, graceful SIGTERM, and post-shutdown lock release.
