# Sentinel macOS V2.1 — Final Validation

## Release scope

V2.1 is the final-hardening release built on V2.0 Incident Intelligence. This validation covers the new runtime/state hardening, Incident lifecycle changes, Final Readiness, report schema updates, Vault advisory behavior, release packaging, and all previously retained Sentinel subsystems.

## Source-level checks

- `go test ./...` — PASS
- `go test -race ./...` — PASS
- `go vet ./...` — PASS
- `node --check web/app.js` — PASS
- `bash -n build-macos.sh build-app-macos.sh RUN_SENTINEL.command endpointsecurity/build-es-sensor-macos.sh` — PASS
- static UI ID audit — no unexpected missing static elements; four Object Story/Search action IDs are intentionally created dynamically at render time.

## V2.1 hardening coverage

Automated coverage includes:

- atomic private JSON writes in the same directory;
- `0600` state-file permissions and `0700` application-state directory policy;
- parent-directory sync after atomic replacement;
- one last-known-good `.bak` recovery path;
- gzip state backup/recovery;
- state-recovery visibility rather than silent green status;
- single persistent-writer runtime lock;
- stale lock recovery and reacquisition after clean shutdown;
- `--ephemeral` exclusion from the persistent-writer lock;
- graceful SIGINT/SIGTERM shutdown;
- active Storage-job cancellation during shutdown;
- Change Monitor stop/checkpoint persistence during shutdown;
- strict bounded JSON request decoding, unknown-field rejection, and trailing-JSON rejection;
- bounded expensive-work concurrency gate;
- Final Readiness scoring semantics;
- Incident 15-minute evidence-window clustering;
- Incident lifecycle (`active` / `historical`) and occurrence merging;
- Incident Deep Review;
- Vault capacity advisory without automatic deletion;
- full-report and low-sensitivity-diagnostics schema versioning.

All pre-existing Behavior, Trust, Storage, Search, Weakness Audit, localhost hardening, Persistence Integrity, Change Intelligence, Safe Actions, and V2.0 Incident tests remain passing.

## Localhost end-to-end validation on this development host

A compiled Linux development binary was run with an isolated temporary HOME. The following sequence passed:

1. start one persistent V2.1 Sentinel instance on `127.0.0.1`;
2. query Final Readiness (`version=2.1`, runtime lock reported held);
3. create a test LaunchAgent and establish a Persistence baseline;
4. start Change Monitor;
5. modify the LaunchAgent target;
6. capture Persistence change and run Targeted Review;
7. rebuild Incident Intelligence and retrieve the Incident;
8. run Incident Deep Review;
9. export the full V2.1 report;
10. attempt a second persistent Sentinel instance with the same HOME — correctly rejected;
11. start an `--ephemeral` Sentinel concurrently — correctly allowed;
12. deliver SIGTERM to the persistent instance — graceful shutdown completed;
13. restart a persistent Sentinel with the same HOME — succeeded, demonstrating runtime-lock release.

The end-to-end script completed with `V2.1_E2E_PASS`.

On this non-macOS host, some evidence sources are necessarily unavailable, so Incident severity/confidence can differ from a real Mac. The test Incident remained correlated and Deep Review remained functional; no Linux result is presented as proof of macOS-native behavior.

## Runtime/readiness observations

The isolated-host Readiness result was `79 / good-with-limits`, reflecting missing macOS-native evidence sources rather than a product failure. Final Readiness is a Sentinel-operability/visibility measure, not malware probability and not a claim that the Mac is safe.

The runtime check exposed:

- persistent instance lock held;
- ephemeral mode status;
- bounded work-gate state;
- state-health and recovery checks;
- Change continuity/rescan state;
- self-integrity status;
- visibility limitations.

## Persistent-state durability

V2.1 app-owned state writes use same-directory atomic replacement and private permissions. When a valid previous primary exists, one last-known-good `.bak` may be retained for recovery. Backup use is surfaced through State Recovery / Final Readiness instead of being silently hidden.

State recovery is intentionally limited to Sentinel-owned metadata. It is not a general backup system for user files.

## Report schema

Full local report:

- `version = 2.1`
- `schema_version = 2`
- `report_kind = sentinel-full-local-report`
- includes Final Readiness, State Recovery, Incident current/history, Change current/history, Behavior, Trust, Persistence, Safe Actions/Vault, and other local evidence.

Low-sensitivity diagnostics:

- `schema_version = 2`
- `report_kind = sentinel-low-sensitivity-diagnostics`
- contains bounded status/count/readiness information;
- intentionally omits local paths, process lists, network endpoints, file fingerprints, Vault object details, and Incident object paths.

## macOS release binaries

This execution environment is Linux, therefore the generated macOS binaries are explicit portable fallback builds. `dist/BUILD_FEATURES.txt` and `dist/CHANGE_MONITOR_MODE.txt` record this honestly.

- `dist/sentinel-macos-arm64`
  - format: Mach-O 64-bit arm64
  - SHA-256: `7c364cd26632b34618a66030d9de16b364a691fdebec0534f2cb565b6242e14f`
- `dist/sentinel-macos-x86_64`
  - format: Mach-O 64-bit x86_64
  - SHA-256: `ccd13aec6d1915b013a7138ee00e3ab0c3e233ff3f829d08fc9ca0e831413f13`

A real-Mac `build-macos.sh` attempts native CGO separately per architecture and only marks an architecture native if CoreServices/Security.framework linking succeeds.

## Sentinel.app

`build-app-macos.sh` produced `dist/Sentinel.app` with:

- `CFBundleIdentifier = local.sentinel.macos`
- `CFBundleShortVersionString = 2.1`
- `CFBundleVersion = 2.1`
- `CFBundleExecutable = SentinelLauncher`
- architecture-selecting launcher;
- both macOS engine binaries under `Contents/Resources/bin/`.

The app version is read from the project `VERSION` file during packaging rather than being hard-coded.

The development app produced here is unsigned and unnotarized.

## Endpoint Security boundary

The source tree retains the notification-only Endpoint Security/System Extension scaffold, status reporting, example entitlements, and protected build path. It was **not** entitled, compiled as an active sensor, signed, installed, or activated in this environment.

Apple Endpoint Security entitlement approval, System Extension packaging, user approval, and relevant privacy authorization remain external real-Mac requirements.

## Real-Mac validation still required

The following are deliberately **not** claimed as tested here:

- native CoreServices FSEvents callbacks, event-ID resume, dropped/root-changed flags, sleep/wake and mount/rename cases;
- Security.framework static code validation on signed, unsigned, ad-hoc, Universal Binary, and app-bundle cases;
- `codesign`, `spctl`, `sfltool`, macOS `lsof`, Finder Reveal, and Full Disk Access behavior;
- `Sentinel.app` Finder launch behavior;
- Developer ID signing, notarization, stapling, and Gatekeeper distribution behavior;
- Endpoint Security System Extension behavior after Apple entitlement approval;
- Apple Silicon and Intel physical-hardware runtime behavior.

## Release conclusion

Within the capabilities of this development host, V2.1 passes source, race, static, localhost end-to-end, cross-architecture file-format, state-hardening, and packaging validation. The remaining work is real-macOS native-framework/distribution validation rather than another large application-feature phase.
