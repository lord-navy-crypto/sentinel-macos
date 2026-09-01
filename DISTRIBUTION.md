# Distribution — Sentinel 2.7

Sentinel 2.7 — Resilient Local Intelligence uses the native-window `Sentinel.app` built by `build-desktop-macos.sh` and distributed as a Developer ID signed/notarized DMG for production. See `DIRECT_DISTRIBUTION_GUIDE.md` for the full release procedure.

## Development / beta package

Use the beta packaging path to build the current 2.7 app and DMG:

```bash
SENTINEL_RELEASE_CHANNEL=beta ./package-dev-dmg-macos.sh
```

The expected beta artifact name is:

`Sentinel-2.7.0-beta.dmg`

The root `VERSION` file is the source of truth for `CFBundleVersion`, `CFBundleShortVersionString`, and release artifact naming. Do not hardcode a different release number in Info.plist templates or packaging scripts.

## Production on a real Mac

1. Start from the exact clean Git commit intended for release.
2. Build with Xcode Command Line Tools so native FSEvents and Security.framework bridges can be included.
3. Inspect `dist/BUILD_FEATURES.txt` and require native capability for both arm64 and x86_64 engines.
4. Build and validate `dist/Sentinel.app`.
5. Sign nested executables and the app with the intended Developer ID Application identity and reviewed entitlements.
6. Verify code signatures and Gatekeeper assessment.
7. Submit the exact artifact to Apple's notary service and staple the successful ticket.
8. Verify the mounted DMG app, source-commit provenance, bundle version, architecture markers, signature, notarization, and Gatekeeper status.
9. Re-run the real-Mac acceptance matrix on the signed/notarized candidate.

Production release helpers fail closed on a dirty Git tree, source-commit mismatch, missing native engine capabilities, signing identity problems, invalid notary configuration, or failed mounted-DMG verification.

## Endpoint Security edition

Do not add Endpoint Security or System Extension install entitlements to the normal build unless the Apple entitlement has been approved and the System Extension lifecycle has been implemented. The included source remains scaffolding, not an enabled product feature.
