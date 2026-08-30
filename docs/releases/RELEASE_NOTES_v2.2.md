# Sentinel macOS v2.2 — Desktop Conversion

Sentinel 2.2 converts the mature local engine into a real native-window macOS desktop application architecture for Developer ID direct distribution.

## What changed

- Added an AppKit + WKWebView desktop shell in `desktop/SentinelDesktop.swift`.
- Added engine `--desktop` bootstrap mode. It emits one machine-readable bootstrap line to the parent app and never opens an external browser.
- The native shell automatically starts the correct arm64/x86_64 Go engine, loads the loopback dashboard in WKWebView, and terminates the engine gracefully when the app closes.
- External web links are kept out of the dashboard and sent to the user's normal browser.
- Added a real Universal 2 native-shell build pipeline in `build-desktop-macos.sh`.
- Replaced the old shell-based `build-app-macos.sh`; it now routes to the native desktop builder.
- Added unsigned development DMG packaging for local testing.
- Added `release-direct-macos.sh` for Developer ID signing, Hardened Runtime, signed DMG creation, `notarytool`, stapling, and SHA-256 generation.
- Added `verify-release-macos.sh`.
- Added `DIRECT_DISTRIBUTION_GUIDE.md` and `DESKTOP_ARCHITECTURE.md`.
- Added double-click developer helpers `BUILD_DESKTOP_APP.command` and `BUILD_DEV_DMG.command`.

## Final user artifact

The intended normal-user download is exactly one file:

`Sentinel-2.2.dmg`

The DMG contains `Sentinel.app` and an Applications shortcut. Normal users no longer interact with Terminal, `.command` files, architecture-specific binaries, or localhost URLs.

## Current environment limitation

This repository can prepare and validate the conversion source on non-macOS hosts, but AppKit/WebKit compilation, DMG creation, Developer ID private-key signing, and notarization require a real Mac / macOS SDK and the developer's Apple credentials.

### System Profile

- Added an Easy Mode System Profile page.
- Reports model/model identifier, Apple Silicon vs Intel, chip/processor, runtime architecture, physical/logical CPU cores, performance/efficiency core split when macOS reports it, total memory, macOS version/build, Darwin kernel, root storage, Rosetta translation state, and Sentinel engine selection explanation.
- Uses bounded local macOS tools with development-host fallback behavior.
- Deliberately omits full serial number and Hardware UUID.
- Full local report now includes the privacy-filtered System Profile.
