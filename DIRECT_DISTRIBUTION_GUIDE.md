# Sentinel 2.8 — macOS Distribution Plan

## Current product model

Sentinel is distributed as one native macOS application. Normal users/testers download one DMG, drag `Sentinel.app` to `Applications`, and launch the app directly.

The user-facing Browser/App View choice is retired. Sentinel now uses:

```text
Sentinel.app
└── native AppKit / WKWebView product window
    └── loopback-only, token-authenticated Go evidence engine
```

The internal `127.0.0.1` engine remains an implementation detail for the evidence backend. It is not a separate browser product mode.

The current product version is read from `VERSION`; the current release line is **2.8.0**. Internal frontend-generation markers such as `2.7-native` and `s24-*` remain compatibility/regression identifiers and are not the user-facing release version.

## Recommended release order

1. Full repository CI on the exact source commit.
2. Local native-app functional test on a real Mac.
3. Controlled Beta DMG for testers.
4. Developer ID signed + notarized production DMG when ready for broader distribution.
5. Mac App Store only if it later becomes useful for the product.

A DMG remains appropriate because Sentinel is a normal app bundle with embedded architecture-specific engines. A `.pkg` should only be introduced if installer-level behavior becomes genuinely necessary.

## Build the native app locally

```bash
./build-desktop-macos.sh
open dist/Sentinel.app
```

For a full reinstall into `/Applications` while preserving Sentinel user state:

```bash
./reinstall-macos.sh
```

Run local tests before packaging:

```bash
go clean -testcache
go test ./...
bash SMOKE_TEST_LOCALHOST.command
```

Repository CI also validates product contracts, Darwin arm64/x86_64 builds, real `Sentinel.app` packaging, Go race tests, `go vet`, canonical JavaScript syntax, auxiliary JavaScript, and shell syntax.

## Beta DMG

For the current public-testing Beta:

```bash
SENTINEL_RELEASE_CHANNEL=beta ./package-dev-dmg-macos.sh
```

With `VERSION=2.8.0`, the expected Beta artifacts are:

```text
dist/Sentinel-2.8.0-beta.dmg
dist/Sentinel-2.8.0-beta.dmg.sha256
dist/Sentinel-2.8.0-beta.release-trust.json
```

The Beta trust manifest deliberately reports these production-trust fields as false:

- Developer ID signed;
- Hardened Runtime;
- notarized;
- stapled;
- Gatekeeper verified.

That manifest describes the artifact; it does not upgrade an unsigned/unnotarized Beta into a production-trusted release.

Recommended GitHub Beta/pre-release assets:

```text
Sentinel-2.8.0-beta.dmg
Sentinel-2.8.0-beta.dmg.sha256
Sentinel-2.8.0-beta.release-trust.json
```

Recommended release title:

```text
Sentinel 2.8 — Product Reliability Beta
```

## Beta verification flow

1. Confirm CI passed on the exact source commit.
2. Build the current native `Sentinel.app`.
3. Launch the app and verify the product reports version 2.8.0.
4. Confirm Apple Silicon + Intel build support as expected.
5. Build the Beta DMG.
6. Mount the DMG and launch the copied app.
7. Verify the generated SHA-256.
8. Inspect the Beta `release-trust.json` and confirm it does not claim production signing/notarization.
9. Publish the DMG, checksum, and trust manifest on the same GitHub Beta/pre-release.
10. Keep release notes tied to the exact source commit used for the DMG.

## Production Developer ID release

A polished direct-download release requires:

- Apple Developer Program membership;
- a `Developer ID Application` certificate in Keychain;
- current Xcode / command-line tools;
- a Notary Service credential profile stored in Keychain.

List available signing identities:

```bash
security find-identity -v -p codesigning
```

Store notarization credentials once, for example:

```bash
xcrun notarytool store-credentials "SentinelNotary"
```

Never commit Apple credentials, private keys, or certificate passwords to this repository.

Run the production release flow:

```bash
export DEVELOPER_ID_APP='Developer ID Application: YOUR NAME (TEAMID)'
export NOTARY_PROFILE='SentinelNotary'
export SENTINEL_BUNDLE_ID='io.github.lord-navy-crypto.sentinel'
./release-direct-macos.sh
```

With `VERSION=2.8.0`, the production artifacts are:

```text
dist/Sentinel-2.8.0.dmg
dist/Sentinel-2.8.0.dmg.sha256
dist/Sentinel-2.8.0.release-trust.json
```

The production pipeline is fail-closed. It performs:

```text
clean committed source
→ exact source SHA stamped into app
→ native arm64/x86_64 capability verification
→ Developer ID signing + Hardened Runtime
→ app signature verification
→ DMG creation + signing
→ Apple notarytool submission
→ stapler staple + validation
→ Gatekeeper / mounted-app / exact-artifact verification
→ SHA-256
→ production release-trust.json
```

The production trust manifest is generated only after that exact DMG passes the verifier. Upload the DMG, `.sha256`, and `release-trust.json` together.

## GitHub Release first

For direct distribution, GitHub Releases should remain the canonical binary source. A website download button should preferably point to the same release artifact rather than maintaining an unrelated copy.

Display at least:

- version and release channel;
- supported macOS version;
- Universal / Apple Silicon + Intel status;
- SHA-256;
- release notes/source commit;
- current signing/notarization state;
- release trust manifest.

## Update Intelligence versus automatic updating

Sentinel 2.8 can manually read public GitHub Release metadata from the Machine page. That feature is discovery-only: it does not download, execute, replace, or install application code.

A future automatic updater requires a separate security design covering authenticated update metadata, artifact signatures, downgrade/rollback policy, recovery, explicit release-channel changes, and fail-closed installation. Do not turn release discovery into silent installation without that review.

## What still requires a real Mac

Final production validation depends on real macOS behavior: AppKit/WebKit, `hdiutil`, FSEvents/Security.framework, signing identities, Developer ID private keys, Apple notarization services, stapling, and Gatekeeper assessment. CI can validate most of the pipeline, but production credentials remain external to the repository.

## Developer helpers

- `BUILD_DESKTOP_APP.command` — build/open the native app.
- `BUILD_DEV_DMG.command` — create an unsigned/unnotarized development DMG.
- `CHECK_MAC_RELEASE_PREREQS.command` — check Developer ID release prerequisites.
- `RELEASE_DEVELOPER_ID.command` — run the signed/notarized release flow.

These are developer conveniences. Testers should receive the DMG and its verification artifacts, not the build scripts.
