## V2.2 Desktop Conversion

The preferred direct-distribution path is now the native-window `Sentinel.app` built by `build-desktop-macos.sh` and distributed as one Developer ID signed/notarized DMG. See `DIRECT_DISTRIBUTION_GUIDE.md`.

# Distribution — Sentinel macOS V2.1

## Development package

`./build-app-macos.sh` creates `dist/Sentinel.app`, a thin Finder wrapper around the same localhost engine. In this environment it is unsigned.

## Production on a real Mac

1. Build with Xcode Command Line Tools so native FSEvents and Security.framework bridges can be included.
2. Inspect `dist/BUILD_FEATURES.txt` per architecture.
3. Package `Sentinel.app`.
4. Sign nested executables and the app with a Developer ID Application identity and a minimal reviewed entitlement set.
5. Verify code signatures and Gatekeeper assessment.
6. Submit to Apple's notary service and staple the successful ticket.
7. Re-run real-Mac functional tests after signing/notarization.

## Endpoint Security edition

Do not add the Endpoint Security or System Extension install entitlements to the normal build unless the Apple entitlement has been approved and the System Extension lifecycle has been implemented. The included source is scaffolding, not an enabled product feature.

## V2.1 app metadata

`build-app-macos.sh` reads the root `VERSION` file for `CFBundleVersion` and `CFBundleShortVersionString`; do not hardcode release numbers in `Info.plist` templates.
