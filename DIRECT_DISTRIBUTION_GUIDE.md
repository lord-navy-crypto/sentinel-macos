# Sentinel 2.4 — macOS Distribution Plan

## Current priority: public Beta first

Sentinel is still in active testing. The current release order is intentionally:

1. **Local functional testing** on real Macs.
2. **GitHub Release Beta** for testers.
3. **Sentinel website download** pointing to the same Beta artifact/checksum.
4. **Apple Developer Program + Developer ID + notarization** after the product is stable enough for broader distribution.
5. **Mac App Store** only if/when it becomes useful for the product.

The Mac App Store is not required for the current Beta phase.

## Dual-interface Sentinel.app

Normal users/testers download one DMG and drag `Sentinel.app` to `Applications`.

When Sentinel starts, it launches one architecture-matched, loopback-only Go engine and shows a small native control window with three choices:

- **Open in Browser** — opens the V5 Evidence Notebook in the user's default browser.
- **Open App View** — opens the same V5 Evidence Notebook inside a native AppKit/WebKit window.
- **Quit Sentinel** — stops the local engine and exits.

Both UI modes share the same `127.0.0.1` engine, random port, session token, APIs, evidence, and safety boundaries. App View is not a second backend. The previous dashboard is retained only as the explicit `?legacy=1` diagnostic escape hatch.

## Why DMG instead of PKG

Sentinel is currently a normal app bundle with embedded architecture-specific engines. A DMG is enough and keeps installation understandable and reversible. A `.pkg` should only be introduced later if the product genuinely needs installer-level behavior that cannot live inside the app bundle.

## Build and test locally

On a real Mac with current Xcode command-line tools:

```bash
./build-desktop-macos.sh
open dist/Sentinel.app
```

For a full local reinstall into `/Applications` while preserving Sentinel user state:

```bash
./reinstall-macos.sh
```

Run the full automated suite before packaging:

```bash
go clean -testcache
go test ./...
bash SMOKE_TEST_LOCALHOST.command
```

For an unsigned/unnotarized local development DMG:

```bash
./package-dev-dmg-macos.sh
```

For the current public-testing Beta DMG:

```bash
SENTINEL_RELEASE_CHANNEL=beta ./package-dev-dmg-macos.sh
```

With the current `VERSION` value `2.4.0`, this produces:

```text
dist/Sentinel-2.4.0-beta.dmg
dist/Sentinel-2.4.0-beta.dmg.sha256
```

Artifact filenames are derived from the repository `VERSION` file. If `VERSION` changes, use the filename printed by the packaging script rather than hard-coding an older version string.

## Beta artifact naming

Until Developer ID/notarization is enabled, use explicit Beta naming so testers do not confuse the build with the future production-signed release.

Recommended Beta assets for version 2.4.0:

```text
Sentinel-2.4.0-beta.dmg
Sentinel-2.4.0-beta.dmg.sha256
```

The GitHub Release title should also make the status explicit, for example:

```text
Sentinel 2.4 Beta
```

The release notes should state that the Beta may not yet be Developer ID signed/notarized and therefore macOS Gatekeeper may treat it differently from a future production build.

## GitHub Release first

For the current testing phase, GitHub Releases is the canonical binary distribution point.

Recommended flow:

1. Full tests pass.
2. Build `Sentinel.app` on the real Mac.
3. Build the Beta DMG with `SENTINEL_RELEASE_CHANNEL=beta`.
4. Verify the DMG by mounting it and launching the copied app.
5. Verify the generated SHA-256.
6. Publish the DMG and checksum on a GitHub Beta/pre-release.
7. Keep the source repository and release notes tied to the exact commit used for the DMG.

Do not label an unsigned/unnotarized Beta artifact as a production notarized release.

## Website distribution second

The Sentinel website can present the Beta download after the GitHub Release exists.

During Beta, the safest simple model is for the website download button to point to the canonical GitHub Release asset rather than maintaining two unrelated binaries. This reduces the chance that the website and GitHub serve different builds.

Display at least:

- Version / Beta label.
- Supported macOS version.
- Universal 2 (Apple Silicon + Intel) status.
- SHA-256 checksum.
- Link to release notes/source.
- Clear note about current signing/notarization status.

## Developer ID phase — later

For a polished outside-the-Mac-App-Store release, the later production phase needs:

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

Follow the prompts. Never put Apple credentials, private keys, or certificate passwords in this repository.

## One-command signed/notarized production release — later

```bash
export DEVELOPER_ID_APP='Developer ID Application: YOUR NAME (TEAMID)'
export NOTARY_PROFILE='SentinelNotary'
export SENTINEL_BUNDLE_ID='io.github.lord-navy-crypto.sentinel'
./release-direct-macos.sh
```

With the current `VERSION` value `2.4.0`, the production artifact is:

```text
dist/Sentinel-2.4.0.dmg
```

The production pipeline:

1. Builds the native AppKit/WebKit launcher for arm64 and x86_64.
2. Combines it into a Universal 2 executable.
3. Embeds the matching Go engines.
4. Signs nested executables with Developer ID + Hardened Runtime.
5. Signs the outer app.
6. Creates a read-only compressed DMG with an Applications shortcut.
7. Signs the DMG.
8. Submits the DMG with `notarytool`.
9. Staples the ticket.
10. Produces SHA-256.

## Mac App Store — optional later stage

The Mac App Store is not a prerequisite for GitHub/website distribution. Evaluate it later after Sentinel's permissions, sandboxing expectations, update strategy, native features, and user experience are stable.

## What this repository cannot do automatically here

A non-macOS environment cannot compile AppKit/WebKit against the macOS SDK, run `hdiutil`, exercise macOS-specific FSEvents/Security.framework behavior, access a Developer ID private key, or submit with an Apple account. Final Mac binary validation therefore stays on a real Mac.

## Double-click developer helpers

- `BUILD_DESKTOP_APP.command` builds and opens the local desktop app.
- `BUILD_DEV_DMG.command` builds the unsigned/unnotarized development DMG.
- `CHECK_MAC_RELEASE_PREREQS.command` is for the later Developer ID phase.
- `RELEASE_DEVELOPER_ID.command` is for the later signed/notarized production phase.

These `.command` files are developer conveniences. Testers should receive the DMG, not the build scripts.
