# Optional Endpoint Security Sensor — Advanced Track

Sentinel V2.1 includes an **inactive scaffold**, not an enabled Endpoint Security product.

## Why it is separate

Apple requires `com.apple.developer.endpoint-security.client`. Without that entitlement, `es_new_client` fails. Endpoint Security clients also require user privacy approval / Full Disk Access, and production deployment belongs in a System Extension packaged in a signed host app.

## Included scaffold

`endpointsecurity/` contains:

- `SentinelESSensor.c` — notification-only example for exec/fork/exit/mount events;
- `SystemExtensionController.swift` — explicit activation/deactivation request scaffold;
- example host and sensor entitlement plists;
- a build guard that refuses to imply the entitlement exists unless an explicit environment acknowledgement is set.

The scaffold does not block or authorize events. It is not started by the normal Sentinel engine.

## Before any production use

1. request and receive Apple Endpoint Security entitlement approval;
2. create a real System Extension target in Xcode;
3. package it under the host app's `Contents/Library/SystemExtensions` directory;
4. sign host and extension with the correct provisioning/entitlements;
5. submit an activation request and handle user approval/restart states;
6. grant required privacy access;
7. test event volume, backpressure, sleep/wake, upgrade/deactivation, and failure states on real Macs;
8. add an explicit user-facing on/off control and local data-retention policy.

Until all of that is done, Sentinel reports this layer as **scaffold-not-enabled**.
