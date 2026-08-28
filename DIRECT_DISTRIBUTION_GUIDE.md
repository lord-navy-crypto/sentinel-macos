# Sentinel 2.2 — Developer ID Direct Distribution

## The final user experience

Normal users should download **one file only**: `Sentinel-2.2.dmg`.

1. Open the DMG.
2. Drag `Sentinel.app` to `Applications`.
3. Eject the DMG.
4. Open Sentinel from Applications.

Sentinel then opens its own native AppKit window. The existing local web dashboard is rendered inside `WKWebView`; the Go engine remains loopback-only and is started/stopped by the app automatically. Normal users do not run `.command` files, select CPU architecture, or open a localhost URL themselves.

## Why DMG instead of PKG

For the current product, Sentinel is a normal app bundle with embedded engines. A DMG is enough and keeps installation understandable and reversible. A `.pkg` becomes useful only if a future product genuinely needs installer-level actions that cannot live in the app bundle. Apple also supports shipping System Extensions inside the app bundle itself, so a System Extension does not automatically require a PKG.

## First local desktop build

On a real Mac with current Xcode command-line tools:

```bash
./build-desktop-macos.sh
open dist/Sentinel.app
```

For an unsigned local-test DMG:

```bash
./package-dev-dmg-macos.sh
```

## Developer ID prerequisites

You need:

- Apple Developer Program membership.
- A `Developer ID Application` certificate installed in Keychain.
- Xcode / command-line tools.
- A Notary Service credential profile stored in Keychain.

List available signing identities:

```bash
security find-identity -v -p codesigning
```

Store notarization credentials once (example profile name):

```bash
xcrun notarytool store-credentials "SentinelNotary"
```

Follow the prompts. Do not put Apple credentials or private keys in this repository.

## One-command signed/notarized release

```bash
export DEVELOPER_ID_APP='Developer ID Application: YOUR NAME (TEAMID)'
export NOTARY_PROFILE='SentinelNotary'
export SENTINEL_BUNDLE_ID='io.github.lord-navy-crypto.sentinel'
./release-direct-macos.sh
```

The final artifact is:

```text
dist/Sentinel-2.2.dmg
```

The script:

1. Builds native AppKit/WKWebView desktop shells for arm64 and x86_64.
2. Combines the desktop shell into a Universal 2 executable.
3. Embeds the matching Go engines.
4. Signs nested executables with Developer ID + Hardened Runtime.
5. Signs the outer app.
6. Creates a read-only compressed DMG with an Applications shortcut.
7. Signs the DMG.
8. Submits the DMG with `notarytool`.
9. Staples the ticket.
10. Produces SHA-256.

## Public distribution

Upload only the final notarized DMG as the primary user download. GitHub can still contain source code, documentation, checksums, and optional developer artifacts.

Recommended GitHub Release asset:

```text
Sentinel-2.2.dmg
Sentinel-2.2.dmg.sha256
```

The download website can link directly to the GitHub Release asset.

## What this repository cannot do automatically here

A non-macOS build environment cannot compile AppKit/WebKit against the macOS SDK, run `hdiutil`, access your Developer ID private key, or submit using your Apple account. Those are intentionally final-machine release steps.

## Double-click helpers

If you prefer not to type release commands:

- `CHECK_MAC_RELEASE_PREREQS.command` checks the macOS SDK/tools, Developer ID identity, and Notary profile.
- `BUILD_DESKTOP_APP.command` builds and opens the unsigned local desktop app.
- `BUILD_DEV_DMG.command` builds an unsigned local-test DMG.
- `RELEASE_DEVELOPER_ID.command` prompts for the signing identity/profile and runs the signed/notarized release pipeline.

These `.command` files are **developer conveniences only**. End users receive only the final notarized `Sentinel-2.2.dmg`.
