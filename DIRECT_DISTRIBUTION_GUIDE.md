# Sentinel 2.5 — macOS Distribution Plan

## Current priority: public Beta first

Sentinel is still in active testing. The current release order is:

1. **Local functional testing** on real Macs.
2. **GitHub Release Beta** for testers.
3. **Sentinel website download** pointing to the same Beta artifact/checksum.
4. **Apple Developer Program + Developer ID + notarization** after the product is stable enough for broader distribution.
5. **Mac App Store** only if/when it becomes useful for the product.

The Mac App Store is not required for the current Beta phase.

## One product frontend, two containers

Normal users/testers download one DMG and drag `Sentinel.app` to `Applications`.

When Sentinel starts, it launches one architecture-matched, loopback-only Go engine and exposes the same product in two containers:

- **Open in Browser** — opens the canonical Sentinel application in the default browser.
- **Open App View** — opens the same application inside native AppKit/WKWebView.
- **Quit Sentinel** — stops the owned local engine and exits.

Both containers use the same `127.0.0.1` engine, random port, in-memory session token, API surface, evidence, and safety boundaries. App View is not a second backend and Browser is not a compatibility mode.

Current canonical product source:

```text
web/index.html
web/app/core.js
web/app/lenses/*
web/app/advanced.js
web/app/case-stories.js
web/app/system-evidence.js
web/app/workbench.js
web/app/full-scan.js
web/app/action-dock.js
web/app/runtime.js
web/app/*.css
```

The visible product version is read from `VERSION`; the current value is **2.5.0**. Some internal frontend-generation names and `s24-*` CSS namespaces remain compatibility identifiers and are not the user-facing release number.

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

Repository CI additionally validates product contracts, Darwin arm64/x86_64 builds, real `Sentinel.app` packaging, Go race tests, `go vet`, canonical product JavaScript syntax, auxiliary JavaScript, and shell syntax.

## Current Beta artifact

For an unsigned/unnotarized local development DMG:

```bash
./package-dev-dmg-macos.sh
```

For the current public-testing Beta DMG:

```bash
SENTINEL_RELEASE_CHANNEL=beta ./package-dev-dmg-macos.sh
```

With `VERSION=2.5.0`, the expected Beta artifacts are:

```text
dist/Sentinel-2.5.0-beta.dmg
dist/Sentinel-2.5.0-beta.dmg.sha256
```

Artifact filenames are derived from `VERSION`. If the version changes, use the filename printed by the packaging script rather than hard-coding an older version string.

Recommended GitHub Release assets:

```text
Sentinel-2.5.0-beta.dmg
Sentinel-2.5.0-beta.dmg.sha256
```

Recommended release title:

```text
Sentinel 2.5 Beta
```

The release notes should state whether the Beta is Developer ID signed/notarized. Do not present an unsigned/unnotarized Beta as a production notarized release.

## GitHub Release first

For the current testing phase, GitHub Releases is the canonical binary distribution point.

Recommended flow:

1. Full CI passes on the exact release commit.
2. Build `Sentinel.app` on macOS.
3. Launch both Browser and App View and confirm both show the same Sentinel 2.5 product/version.
4. Confirm the launcher and embedded engines report Apple Silicon + Intel support as expected.
5. Build the Beta DMG with `SENTINEL_RELEASE_CHANNEL=beta`.
6. Mount the DMG and launch the copied app.
7. Verify the generated SHA-256.
8. Publish the DMG and checksum on a GitHub Beta/pre-release.
9. Keep release notes tied to the exact source commit used for the DMG.

## Website distribution second

During Beta, the website download button should preferably point to the GitHub Release asset rather than maintaining an unrelated binary. Display at least:

- version and Beta label;
- supported macOS version;
- Universal / Apple Silicon + Intel status;
- SHA-256 checksum;
- release-notes/source link;
- current signing/notarization status.

## Developer ID phase — later

A polished release outside the Mac App Store will require:

- Apple Developer Program membership;
- a `Developer ID Application` certificate in Keychain;
- Xcode / command-line tools;
- a Notary Service credential profile stored in Keychain.

List signing identities:

```bash
security find-identity -v -p codesigning
```

Store notarization credentials once, for example:

```bash
xcrun notarytool store-credentials "SentinelNotary"
```

Never put Apple credentials, private keys, or certificate passwords in this repository.

## Signed/notarized production release — later

```bash
export DEVELOPER_ID_APP='Developer ID Application: YOUR NAME (TEAMID)'
export NOTARY_PROFILE='SentinelNotary'
export SENTINEL_BUNDLE_ID='io.github.lord-navy-crypto.sentinel'
./release-direct-macos.sh
```

With `VERSION=2.5.0`, the production artifact is:

```text
dist/Sentinel-2.5.0.dmg
```

The production pipeline builds the Universal launcher, embeds architecture-matched Go engines, validates the canonical product, signs nested executables and the outer app with Developer ID + Hardened Runtime, creates/signs the DMG, submits with `notarytool`, staples the result, and emits SHA-256.

## Mac App Store — optional later stage

The Mac App Store is not a prerequisite for GitHub/website distribution. Evaluate it later after Sentinel's permissions, sandboxing expectations, update strategy, native features, and user experience are stable.

## What still requires a real Mac

Final release validation needs real macOS behavior: AppKit/WebKit, `hdiutil`, FSEvents/Security.framework behavior, signing identities, Developer ID private keys, and notarization. CI can validate a large part of the pipeline, but release signing/notarization still depends on real Apple credentials and services.

## Double-click developer helpers

- `BUILD_DESKTOP_APP.command` builds and opens the local desktop app.
- `BUILD_DEV_DMG.command` builds the unsigned/unnotarized development DMG.
- `CHECK_MAC_RELEASE_PREREQS.command` checks the later Developer ID phase.
- `RELEASE_DEVELOPER_ID.command` runs the later signed/notarized release flow.

These `.command` files are developer conveniences. Testers should receive the DMG, not the build scripts.
