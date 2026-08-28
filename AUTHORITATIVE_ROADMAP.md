# Authoritative macOS security roadmap — V2.1

Sentinel deliberately separates ordinary user-space evidence from entitlement-gated security telemetry.

## Current / native-ready layers

- CoreServices FSEvents for directory hierarchy changes, with portable polling fallback.
- Security.framework Code Signing Services for native static-code validity checking.
- `codesign` / `spctl` as complementary command-line evidence.
- ServiceManagement / modern Login & Background Item context where available.
- User-controlled Full Disk Access as a visibility boundary.

## V2.1 correlation layer

Incidents correlate Filesystem, Persistence, Behavior, and Trust evidence. This improves investigation efficiency without creating a false malware-probability model.

## Endpoint Security boundary

Apple Endpoint Security can deliver system events such as process execution and fork. It requires the Endpoint Security entitlement, user privacy approval, and production System Extension packaging. V2.1 includes only a disabled notification-sensor scaffold and host activation source; this is intentionally not treated as active telemetry.

## Future after real-Mac validation

- integrate an approved Endpoint Security System Extension with the localhost engine through an authenticated local IPC boundary;
- add explicit event-volume/backpressure controls;
- correlate ES notifications with Incident Intelligence;
- keep the advanced sensor optional so the ordinary local inspection product remains usable without special entitlement.
